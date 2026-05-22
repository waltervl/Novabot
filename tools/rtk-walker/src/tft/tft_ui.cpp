/*
 * tft_ui.cpp — LVGL UI for the standalone walker target.
 *
 * Layout (480×320 landscape):
 *   ┌─ fix pill │ sats │ HDOP │ ntrip │ wifi/ip ─────────┐  top status bar
 *   │                                                   │
 *   │   live map polyline (auto-zoomed to walked area)  │  main canvas
 *   │   + Save-as-area / +Chan / +Obs floating buttons  │
 *   │                                                   │
 *   ├───────────────────────────────────────────────────┤
 *   │   [REC]              [Maps]          [Settings]   │  bottom tab bar
 *   └───────────────────────────────────────────────────┘
 *
 * The Maps tab opens a separate screen that lists every SessionStore
 * work map. Tapping a row loads the polygon onto the home screen for
 * viewing; tap-and-hold offers a delete confirm. The +Chan and +Obs
 * floating buttons on home only show while a map is loaded — they
 * push the user into the Recording screen targeting that parent map.
 *
 * Settings is a tabview with WiFi + NTRIP sub-tabs and a soft keyboard
 * that pops up when any text field is focused. Save & Reboot writes
 * touched fields to NVS via walker_api and ESP.restart()s.
 */

#ifdef HAS_TFT_DISPLAY

#include <Arduino.h>
#include <vector>

#include "lvgl.h"
#include "jc3248w535.h"
#include "../walker_api.h"
#include "../walker_ota.h"
#include "tft_ui.h"
#include "../session.h"
#include "../recording.h"

// Multi-file session globals — owned by main.cpp.
extern SessionStore sessionStore;
extern Recorder recorder;

// ── Theme ───────────────────────────────────────────────────────────────────
// Same palette as the web UI so the device feels like one product.
#define COL_BG          lv_color_hex(0x030712)
#define COL_CARD        lv_color_hex(0x16213e)
#define COL_CARD_DIM    lv_color_hex(0x0f172a)
#define COL_TEXT        lv_color_hex(0xe0e0e0)
#define COL_DIM         lv_color_hex(0x6b7280)
#define COL_EMERALD     lv_color_hex(0x00d4aa)
#define COL_RED         lv_color_hex(0xef4444)
#define COL_AMBER       lv_color_hex(0xf59e0b)
#define COL_BLUE        lv_color_hex(0x60a5fa)

// ── Geometry ───────────────────────────────────────────────────────────────
#define SCREEN_W        480
#define SCREEN_H        320
#define TOPBAR_H        46
#define BOTTOMBAR_H     54
#define MAP_PAD         8

// ── State ──────────────────────────────────────────────────────────────────
static lv_obj_t* scr_main = nullptr;
static lv_obj_t* scr_settings = nullptr;
static lv_obj_t* scr_maps = nullptr;

// Status bar widgets we mutate on every refresh.
static lv_obj_t* lbl_fix_pill = nullptr;
static lv_obj_t* lbl_sats = nullptr;
static lv_obj_t* lbl_hdop = nullptr;
static lv_obj_t* lbl_ntrip = nullptr;
static lv_obj_t* lbl_wifi = nullptr;
static lv_obj_t* lbl_battery = nullptr;
static lv_obj_t* lbl_lat = nullptr;
static lv_obj_t* lbl_lng = nullptr;
static lv_obj_t* lbl_pts = nullptr;

static lv_obj_t* btn_record = nullptr;
static lv_obj_t* lbl_record = nullptr;

static lv_obj_t* map_panel = nullptr;
static lv_obj_t* map_line = nullptr;
static lv_obj_t* map_cursor = nullptr;
static lv_obj_t* map_empty_label = nullptr;
static lv_obj_t* map_north_label = nullptr;
// Floating action: "Save as area" — overlays the map panel only when a
// just-stopped track has enough points to become a work map. Tap shows
// a confirm screen, then imports the CSV rows into the next free
// SessionStore work slot. Hidden during live recording, hidden when no
// track has been completed yet this boot.
static lv_obj_t* btn_save_area = nullptr;
static lv_obj_t* lbl_save_area = nullptr;

// +Channel / +Obstacle floating buttons — overlay the map panel only when
// the user has loaded a saved map (viewing_map_slot >= 0). Tap pushes the
// recorder into the matching mode + jumps to the Recording screen. Hidden
// during live recording so the user can't accidentally start a child
// recording mid-walk on the parent boundary.
static lv_obj_t* btn_add_channel = nullptr;
static lv_obj_t* lbl_add_channel = nullptr;
static lv_obj_t* btn_add_obstacle = nullptr;
static lv_obj_t* lbl_add_obstacle = nullptr;
// "No RTK FIX" warning banner — visible inside the map panel whenever
// the user could record but the fix is < 4. We deliberately do NOT
// disable the record button in that state (the user might be testing
// indoors and want to walk anyway); we just make the consequence
// visible so they aren't surprised when Save-as-area later silently
// drops every non-FIX row.
static lv_obj_t* rtk_warning_banner = nullptr;

// "RTK module not detected" overlay — shown when the LC29HDA hasn't
// emitted a single byte in the last few seconds. Lives on the main
// screen so the user gets a clear "you forgot to plug it in" hint
// instead of a permanently grey NO FIX pill. Dismissable with the ✕
// button — once dismissed it stays hidden as long as the module is
// missing, but auto-reappears the next time the state flips from
// detected → lost (so a hot-unplug surfaces a fresh warning).
static lv_obj_t* no_gnss_overlay = nullptr;
static bool      no_gnss_dismissed = false;
static bool      no_gnss_was_missing = false;

// WiFi-fail banner — dismissable. Pops up when STA boot-connect
// timed out (wrong password, wrong band, AP gone) so the user gets a
// clear visual instead of a quiet amber AP IP in the top bar.
static lv_obj_t* wifi_fail_overlay = nullptr;
static lv_obj_t* lbl_wifi_fail_body = nullptr;
static bool      wifi_fail_dismissed = false;
static bool      wifi_fail_was_failed = false;
// Record-button state machine. The button can be in one of four states;
// `current_record_state` lets us style only on transitions and lets the
// touch handler refuse presses unless the button is actually actionable.
enum RecordBtnState {
  RBS_START,          // ready and RTK FIX achieved — emerald, clickable
  RBS_STOP,           // recording in progress — red, clickable
  RBS_WAITING_GNSS,   // module not detected — gray, disabled
  RBS_WAITING_RTK,    // module alive but fix < 4 — gray, disabled
};
static RecordBtnState current_record_state = RBS_START;

// Settings widgets — populated from snapshot when the screen opens.
static lv_obj_t* settings_tabview = nullptr;
static lv_obj_t* ta_wifi_ssid = nullptr;
static lv_obj_t* ta_wifi_pass = nullptr;
static lv_obj_t* ta_ntrip_host = nullptr;
static lv_obj_t* ta_ntrip_port = nullptr;
static lv_obj_t* ta_ntrip_mount = nullptr;
static lv_obj_t* ta_ntrip_user = nullptr;
static lv_obj_t* ta_ntrip_pass = nullptr;
static lv_obj_t* keyboard = nullptr;
static lv_obj_t* lbl_save_status = nullptr;

// Firmware/OTA widgets — Settings → Firmware tab.
static lv_obj_t* s_otaVersionLabel = nullptr;
static lv_obj_t* s_otaStatusLabel = nullptr;
static lv_obj_t* s_otaCheckBtn = nullptr;

// Maps list widgets.
static lv_obj_t* maps_list = nullptr;
static lv_obj_t* maps_status = nullptr;

// Tabview shrinks when the soft keyboard slides up so the active field
// is never hidden behind it. These constants compute the two heights
// the tabview hops between (full vs. with-keyboard).
#define KEYBOARD_H            160
#define SETTINGS_TV_FULL_H    (SCREEN_H - TOPBAR_H)
#define SETTINGS_TV_OPEN_H    (SCREEN_H - TOPBAR_H - KEYBOARD_H)

// Polyline backing store — LVGL holds the pointer so the storage must
// outlive every redraw. Capped at MAP_POINT_MAX so we don't allocate
// gigabytes during a long walk.
#define MAP_POINT_MAX 1500
static lv_point_t map_pts[MAP_POINT_MAX];
static uint16_t   map_pts_used = 0;

// Original "untouched at boot" snapshot — used to decide which fields
// were edited (so we only push real changes through walkerApplyConfig).
static WalkerConfigView cfg_baseline;

// Forward declarations.
static void build_main_screen();
static void build_settings_screen();
static void build_maps_screen();
static void refresh_status_cb(lv_timer_t* t);
static void open_settings(lv_event_t* e);
static void open_maps_screen(lv_event_t* e);
static void back_to_main(lv_event_t* e);
static void toggle_recording(lv_event_t* e);
static void dismiss_no_gnss(lv_event_t* e);
static void dismiss_wifi_fail(lv_event_t* e);
static void wifi_fail_open_settings(lv_event_t* e);
static void on_textarea_focus(lv_event_t* e);
static void on_save_settings(lv_event_t* e);
static void redraw_map(const WalkerSnapshot& snap);
static void load_settings_values();
static void reload_maps_list();
static void apply_record_btn_state(RecordBtnState state);
static void on_keyboard_event(lv_event_t* e);
static void focus_textarea(lv_obj_t* ta);
static void buildRecordingScreen();
static void onOtaButtonClicked(lv_event_t* e);
static void on_save_as_area_clicked(lv_event_t* e);
static void onSaveResultDismissed(lv_event_t* e);
static void update_save_area_button(const WalkerSnapshot& snap);
static void update_map_action_buttons(const WalkerSnapshot& snap);
static void on_add_channel_clicked(lv_event_t* e);
static void on_add_obstacle_clicked(lv_event_t* e);
static bool load_saved_map_polygon(int slot);
static void exit_viewing_mode();

// ── Public entry points ────────────────────────────────────────────────────
void tftSetup() {
  jc3248w535_handles_t handles;
  // 90° rotation matches the esp32-tool — landscape orientation.
  //  - task_stack 24 KB — flex layouts + line redraws + tabview keyboard
  //    blow past the 4 KB default; saw the overflow on the first frame.
  //  - task_affinity 1 — same core as Arduino's loopTask. Core 0 is
  //    where the ESP-IDF parks WiFi (prio 23) and lwIP (prio 18), and
  //    those higher-priority workers starve our LVGL task whenever
  //    network traffic flares up (the deterministic ~30 s freeze).
  //  - task_priority 10 — well above Arduino loopTask's 1, so LVGL
  //    preempts the main loop instead of competing with it. delay(1)
  //    in loop() already yields, so the preemption is cheap.
  jc3248w535_config_t cfg = JC3248W535_DEFAULT_CONFIG(LV_DISP_ROT_90);
  cfg.lvgl.task_stack    = 24 * 1024;
  cfg.lvgl.task_affinity = 1;
  cfg.lvgl.task_priority = 10;
  jc3248w535_begin(&cfg, &handles);
  jc3248w535_backlight_set(100);

  if (!jc3248w535_lock(0)) return;

  // Make the underlying display background match our theme so any flash
  // before the first screen render isn't a bright color.
  lv_obj_set_style_bg_color(lv_layer_top(), COL_BG, 0);

  build_main_screen();
  build_settings_screen();
  build_maps_screen();
  buildRecordingScreen();

  lv_scr_load(scr_main);

  // 5 Hz refresh — the GNSS feeds at 1 Hz so this is plenty smooth.
  lv_timer_create(refresh_status_cb, 200, NULL);

  jc3248w535_unlock();
}

void tftTick() {
  // LVGL runs in its own FreeRTOS task (started by jc3248w535_begin_simple
  // → esp_lvgl_port). The loop() side has nothing periodic to do — every
  // widget update is driven by the LVGL timer above. This stub exists so
  // main.cpp can keep its symmetric setup/tick shape regardless of target.
}

// ── Helpers ────────────────────────────────────────────────────────────────
static lv_obj_t* make_card(lv_obj_t* parent, lv_coord_t w, lv_coord_t h) {
  lv_obj_t* c = lv_obj_create(parent);
  lv_obj_set_size(c, w, h);
  lv_obj_set_style_bg_color(c, COL_CARD, 0);
  lv_obj_set_style_bg_opa(c, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(c, 0, 0);
  lv_obj_set_style_radius(c, 8, 0);
  lv_obj_set_style_pad_all(c, 6, 0);
  lv_obj_clear_flag(c, LV_OBJ_FLAG_SCROLLABLE);
  return c;
}

static lv_obj_t* make_label(lv_obj_t* parent, const char* text,
                            const lv_font_t* font, lv_color_t col) {
  lv_obj_t* l = lv_label_create(parent);
  lv_label_set_text(l, text);
  lv_obj_set_style_text_color(l, col, 0);
  lv_obj_set_style_text_font(l, font, 0);
  return l;
}

static lv_obj_t* make_tab_btn(lv_obj_t* parent, const char* label,
                              lv_event_cb_t cb, lv_color_t bg) {
  lv_obj_t* b = lv_btn_create(parent);
  lv_obj_set_height(b, 38);
  lv_obj_set_style_bg_color(b, bg, 0);
  lv_obj_set_style_radius(b, 6, 0);
  lv_obj_set_style_border_width(b, 0, 0);
  lv_obj_set_style_shadow_width(b, 0, 0);
  lv_obj_add_event_cb(b, cb, LV_EVENT_CLICKED, NULL);
  lv_obj_t* l = lv_label_create(b);
  lv_label_set_text(l, label);
  lv_obj_set_style_text_color(l, lv_color_hex(0x00211a), 0);
  lv_obj_set_style_text_font(l, &lv_font_montserrat_14, 0);
  lv_obj_center(l);
  return b;
}

// ── Main screen ────────────────────────────────────────────────────────────
static void build_main_screen() {
  scr_main = lv_obj_create(NULL);
  lv_obj_set_style_bg_color(scr_main, COL_BG, 0);
  lv_obj_set_style_bg_opa(scr_main, LV_OPA_COVER, 0);
  lv_obj_clear_flag(scr_main, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_pad_all(scr_main, 0, 0);

  // ── Top status bar ─────────────────────────────────────────────────────
  lv_obj_t* top = lv_obj_create(scr_main);
  lv_obj_set_size(top, SCREEN_W, TOPBAR_H);
  lv_obj_align(top, LV_ALIGN_TOP_MID, 0, 0);
  lv_obj_set_style_bg_color(top, COL_CARD_DIM, 0);
  lv_obj_set_style_border_width(top, 0, 0);
  lv_obj_set_style_radius(top, 0, 0);
  lv_obj_set_style_pad_all(top, 6, 0);
  lv_obj_clear_flag(top, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_flex_flow(top, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(top, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_column(top, 10, 0);

  lbl_fix_pill = lv_label_create(top);
  lv_label_set_text(lbl_fix_pill, "NO FIX");
  lv_obj_set_style_text_color(lbl_fix_pill, lv_color_hex(0x00211a), 0);
  lv_obj_set_style_text_font(lbl_fix_pill, &lv_font_montserrat_14, 0);
  lv_obj_set_style_bg_color(lbl_fix_pill, COL_DIM, 0);
  lv_obj_set_style_bg_opa(lbl_fix_pill, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(lbl_fix_pill, 12, 0);
  lv_obj_set_style_pad_hor(lbl_fix_pill, 12, 0);
  lv_obj_set_style_pad_ver(lbl_fix_pill, 4, 0);

  // Sats/HDOP labels start hidden — they only get values once the GNSS
  // module actually delivers a fix. Showing "sats 0" / "HDOP -" out of
  // the gate looks like broken data; hiding them feels cleaner.
  lbl_sats  = make_label(top, "",                          &lv_font_montserrat_14, COL_TEXT);
  lbl_hdop  = make_label(top, "",                          &lv_font_montserrat_14, COL_TEXT);
  lv_obj_add_flag(lbl_sats, LV_OBJ_FLAG_HIDDEN);
  lv_obj_add_flag(lbl_hdop, LV_OBJ_FLAG_HIDDEN);
  lbl_ntrip   = make_label(top, LV_SYMBOL_UPLOAD       " NTRIP -", &lv_font_montserrat_14, COL_DIM);
  lbl_wifi    = make_label(top, LV_SYMBOL_WIFI         " -",       &lv_font_montserrat_14, COL_DIM);
  lbl_battery = make_label(top, LV_SYMBOL_BATTERY_FULL " -",       &lv_font_montserrat_14, COL_DIM);
  lv_obj_add_flag(lbl_battery, LV_OBJ_FLAG_HIDDEN);

  // ── Map panel ──────────────────────────────────────────────────────────
  map_panel = make_card(scr_main,
                        SCREEN_W - 2 * MAP_PAD,
                        SCREEN_H - TOPBAR_H - BOTTOMBAR_H - 2 * MAP_PAD);
  lv_obj_align(map_panel, LV_ALIGN_TOP_LEFT, MAP_PAD, TOPBAR_H + MAP_PAD);
  lv_obj_set_style_bg_color(map_panel, COL_CARD_DIM, 0);

  map_empty_label = lv_label_create(map_panel);
  lv_label_set_text(map_empty_label, LV_SYMBOL_PLAY "  Start recording to draw a track");
  lv_obj_set_style_text_color(map_empty_label, COL_DIM, 0);
  lv_obj_set_style_text_font(map_empty_label, &lv_font_montserrat_14, 0);
  lv_obj_center(map_empty_label);

  map_line = lv_line_create(map_panel);
  lv_obj_set_style_line_color(map_line, COL_EMERALD, 0);
  lv_obj_set_style_line_width(map_line, 3, 0);
  lv_obj_set_style_line_rounded(map_line, true, 0);

  map_cursor = lv_obj_create(map_panel);
  lv_obj_set_size(map_cursor, 12, 12);
  lv_obj_set_style_bg_color(map_cursor, COL_EMERALD, 0);
  lv_obj_set_style_border_color(map_cursor, lv_color_white(), 0);
  lv_obj_set_style_border_width(map_cursor, 2, 0);
  lv_obj_set_style_radius(map_cursor, 6, 0);
  lv_obj_set_style_pad_all(map_cursor, 0, 0);
  lv_obj_clear_flag(map_cursor, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_add_flag(map_cursor, LV_OBJ_FLAG_HIDDEN);

  map_north_label = lv_label_create(map_panel);
  lv_label_set_text(map_north_label, LV_SYMBOL_UP " N");
  lv_obj_set_style_text_color(map_north_label, COL_DIM, 0);
  lv_obj_set_style_text_font(map_north_label, &lv_font_montserrat_14, 0);
  lv_obj_align(map_north_label, LV_ALIGN_TOP_RIGHT, -4, 4);

  // Bottom-left corner: lat/lng + point count, so the user can read
  // exact coords without going to the web UI.
  lbl_lat = make_label(map_panel, "", &lv_font_montserrat_12, COL_DIM);
  lv_obj_align(lbl_lat, LV_ALIGN_BOTTOM_LEFT, 4, -22);
  lbl_lng = make_label(map_panel, "", &lv_font_montserrat_12, COL_DIM);
  lv_obj_align(lbl_lng, LV_ALIGN_BOTTOM_LEFT, 4, -6);
  lv_obj_add_flag(lbl_lat, LV_OBJ_FLAG_HIDDEN);
  lv_obj_add_flag(lbl_lng, LV_OBJ_FLAG_HIDDEN);
  lbl_pts = make_label(map_panel, LV_SYMBOL_DIRECTORY " 0 pts", &lv_font_montserrat_12, COL_EMERALD);
  lv_obj_align(lbl_pts, LV_ALIGN_BOTTOM_RIGHT, -4, -6);
  // Multi-line, right-aligned so "75 pts / 12.3 m / 5 m to close" stays
  // tight to the right edge instead of left-flushing each line.
  lv_obj_set_style_text_align(lbl_pts, LV_TEXT_ALIGN_RIGHT, 0);

  // RTK warning banner — small amber strip near the top of the map. The
  // refresh tick toggles its visibility based on snap.fix; once visible
  // it stays put across redraws (no fade) so the user can't miss it.
  rtk_warning_banner = lv_label_create(map_panel);
  lv_label_set_text(rtk_warning_banner,
                    LV_SYMBOL_WARNING "  No RTK FIX  -  track will not save as area");
  lv_obj_set_style_text_color(rtk_warning_banner, lv_color_hex(0x1f1300), 0);
  lv_obj_set_style_text_font(rtk_warning_banner, &lv_font_montserrat_12, 0);
  lv_obj_set_style_bg_color(rtk_warning_banner, COL_AMBER, 0);
  lv_obj_set_style_bg_opa(rtk_warning_banner, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(rtk_warning_banner, 6, 0);
  lv_obj_set_style_pad_hor(rtk_warning_banner, 8, 0);
  lv_obj_set_style_pad_ver(rtk_warning_banner, 3, 0);
  lv_obj_align(rtk_warning_banner, LV_ALIGN_TOP_MID, 0, 4);
  lv_obj_add_flag(rtk_warning_banner, LV_OBJ_FLAG_HIDDEN);

  // Save-as-area floating button — overlays the map panel between the
  // lat/lng labels (bottom-left) and the points/area label (bottom-right).
  // Centered horizontally so it's the obvious next step once the user
  // sees the closed polygon on screen.
  btn_save_area = lv_btn_create(map_panel);
  lv_obj_set_size(btn_save_area, 170, 36);
  lv_obj_align(btn_save_area, LV_ALIGN_BOTTOM_MID, 0, -4);
  lv_obj_set_style_bg_color(btn_save_area, COL_BLUE, 0);
  lv_obj_set_style_radius(btn_save_area, 8, 0);
  lv_obj_set_style_border_width(btn_save_area, 0, 0);
  lv_obj_set_style_shadow_width(btn_save_area, 0, 0);
  lv_obj_add_event_cb(btn_save_area, on_save_as_area_clicked, LV_EVENT_CLICKED, NULL);
  lbl_save_area = lv_label_create(btn_save_area);
  lv_label_set_text(lbl_save_area, LV_SYMBOL_SAVE "  Save as area");
  lv_obj_set_style_text_color(lbl_save_area, lv_color_white(), 0);
  lv_obj_set_style_text_font(lbl_save_area, &lv_font_montserrat_14, 0);
  lv_obj_center(lbl_save_area);
  // Hidden by default; refresh tick reveals it once the previous
  // recording completed and produced at least 5 captured points.
  lv_obj_add_flag(btn_save_area, LV_OBJ_FLAG_HIDDEN);

  // +Channel / +Obstacle floating buttons. Anchored above the save-as-area
  // button so the three never overlap when all are visible (which never
  // happens in practice — Save-as-area only appears right after a stop,
  // the others only appear when a saved map is currently being viewed).
  // Both are hidden until update_map_action_buttons() un-hides them.
  btn_add_channel = lv_btn_create(map_panel);
  lv_obj_set_size(btn_add_channel, 110, 36);
  lv_obj_align(btn_add_channel, LV_ALIGN_BOTTOM_MID, -60, -44);
  lv_obj_set_style_bg_color(btn_add_channel, lv_color_hex(0x6366f1), 0);
  lv_obj_set_style_radius(btn_add_channel, 8, 0);
  lv_obj_set_style_border_width(btn_add_channel, 0, 0);
  lv_obj_set_style_shadow_width(btn_add_channel, 0, 0);
  lv_obj_add_event_cb(btn_add_channel, on_add_channel_clicked, LV_EVENT_CLICKED, NULL);
  lbl_add_channel = lv_label_create(btn_add_channel);
  lv_label_set_text(lbl_add_channel, LV_SYMBOL_REFRESH "  +Chan");
  lv_obj_set_style_text_color(lbl_add_channel, lv_color_white(), 0);
  lv_obj_set_style_text_font(lbl_add_channel, &lv_font_montserrat_14, 0);
  lv_obj_center(lbl_add_channel);
  lv_obj_add_flag(btn_add_channel, LV_OBJ_FLAG_HIDDEN);

  btn_add_obstacle = lv_btn_create(map_panel);
  lv_obj_set_size(btn_add_obstacle, 110, 36);
  lv_obj_align(btn_add_obstacle, LV_ALIGN_BOTTOM_MID, 60, -44);
  lv_obj_set_style_bg_color(btn_add_obstacle, lv_color_hex(0xb91c1c), 0);
  lv_obj_set_style_radius(btn_add_obstacle, 8, 0);
  lv_obj_set_style_border_width(btn_add_obstacle, 0, 0);
  lv_obj_set_style_shadow_width(btn_add_obstacle, 0, 0);
  lv_obj_add_event_cb(btn_add_obstacle, on_add_obstacle_clicked, LV_EVENT_CLICKED, NULL);
  lbl_add_obstacle = lv_label_create(btn_add_obstacle);
  lv_label_set_text(lbl_add_obstacle, LV_SYMBOL_CLOSE "  +Obs");
  lv_obj_set_style_text_color(lbl_add_obstacle, lv_color_white(), 0);
  lv_obj_set_style_text_font(lbl_add_obstacle, &lv_font_montserrat_14, 0);
  lv_obj_center(lbl_add_obstacle);
  lv_obj_add_flag(btn_add_obstacle, LV_OBJ_FLAG_HIDDEN);

  // ── Bottom bar ─────────────────────────────────────────────────────────
  lv_obj_t* bot = lv_obj_create(scr_main);
  lv_obj_set_size(bot, SCREEN_W, BOTTOMBAR_H);
  lv_obj_align(bot, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_set_style_bg_color(bot, COL_CARD_DIM, 0);
  lv_obj_set_style_border_width(bot, 0, 0);
  lv_obj_set_style_radius(bot, 0, 0);
  lv_obj_set_style_pad_all(bot, 8, 0);
  lv_obj_clear_flag(bot, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_flex_flow(bot, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(bot, LV_FLEX_ALIGN_SPACE_EVENLY, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_column(bot, 8, 0);

  btn_record = lv_btn_create(bot);
  lv_obj_set_size(btn_record, 200, 38);
  lv_obj_set_style_bg_color(btn_record, COL_EMERALD, 0);
  lv_obj_set_style_radius(btn_record, 8, 0);
  lv_obj_set_style_border_width(btn_record, 0, 0);
  lv_obj_set_style_shadow_width(btn_record, 0, 0);
  lv_obj_add_event_cb(btn_record, toggle_recording, LV_EVENT_CLICKED, NULL);
  lbl_record = lv_label_create(btn_record);
  lv_label_set_text(lbl_record, LV_SYMBOL_PLAY "  Start recording");
  lv_obj_set_style_text_color(lbl_record, lv_color_hex(0x00211a), 0);
  lv_obj_set_style_text_font(lbl_record, &lv_font_montserrat_14, 0);
  lv_obj_center(lbl_record);

  // Single Maps button — replaces the old Tracks + duplicate Maps entries.
  // Opens the saved-maps list screen; tapping a row loads its polygon
  // back into the GPS tab for viewing and arms the +Chan / +Obs buttons.
  make_tab_btn(bot, LV_SYMBOL_DIRECTORY "  Maps",     open_maps_screen, lv_color_hex(0x374151))->user_data = NULL;
  make_tab_btn(bot, LV_SYMBOL_SETTINGS  "  Settings", open_settings,    lv_color_hex(0x374151))->user_data = NULL;

  // "No GNSS module" overlay (hidden by default — refresh_status_cb
  // un-hides when no NMEA bytes have been seen for >3 s after boot).
  // Sized to leave the bottom-bar tabs uncovered so the user can still
  // reach Tracks/Settings even while it's up.
  no_gnss_overlay = lv_obj_create(scr_main);
  lv_obj_set_size(no_gnss_overlay, 420, 180);
  lv_obj_align(no_gnss_overlay, LV_ALIGN_CENTER, 0, -16);
  lv_obj_set_style_bg_color(no_gnss_overlay, COL_RED, 0);
  lv_obj_set_style_bg_opa(no_gnss_overlay, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(no_gnss_overlay, 0, 0);
  lv_obj_set_style_radius(no_gnss_overlay, 12, 0);
  lv_obj_set_style_pad_all(no_gnss_overlay, 14, 0);
  lv_obj_set_style_shadow_color(no_gnss_overlay, lv_color_black(), 0);
  lv_obj_set_style_shadow_opa(no_gnss_overlay, LV_OPA_40, 0);
  lv_obj_set_style_shadow_width(no_gnss_overlay, 18, 0);
  lv_obj_clear_flag(no_gnss_overlay, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_add_flag(no_gnss_overlay, LV_OBJ_FLAG_HIDDEN);

  lv_obj_t* ot = lv_label_create(no_gnss_overlay);
  lv_label_set_text(ot, LV_SYMBOL_WARNING "  RTK module not detected");
  lv_obj_set_style_text_color(ot, lv_color_white(), 0);
  lv_obj_set_style_text_font(ot, &lv_font_montserrat_20, 0);
  lv_obj_align(ot, LV_ALIGN_TOP_LEFT, 0, 0);

  // Close (dismiss) button — top right, hides the overlay until the
  // module reappears and is lost again. Recording stays disabled even
  // after dismissal, so the user can't accidentally start without GPS.
  lv_obj_t* close = lv_btn_create(no_gnss_overlay);
  lv_obj_set_size(close, 38, 38);
  lv_obj_align(close, LV_ALIGN_TOP_RIGHT, 0, -4);
  lv_obj_set_style_bg_color(close, lv_color_hex(0xb91c1c), 0);  // darker red
  lv_obj_set_style_radius(close, 6, 0);
  lv_obj_set_style_border_width(close, 0, 0);
  lv_obj_set_style_shadow_width(close, 0, 0);
  lv_obj_set_style_pad_all(close, 0, 0);
  lv_obj_add_event_cb(close, dismiss_no_gnss, LV_EVENT_CLICKED, NULL);
  lv_obj_t* cl = lv_label_create(close);
  lv_label_set_text(cl, LV_SYMBOL_CLOSE);
  lv_obj_set_style_text_color(cl, lv_color_white(), 0);
  lv_obj_set_style_text_font(cl, &lv_font_montserrat_20, 0);
  lv_obj_center(cl);

  // Body — three rows: TX wiring, RX wiring, voltage warning.
  // Arrows are LVGL FontAwesome glyphs so they always render.
  lv_obj_t* body = lv_obj_create(no_gnss_overlay);
  lv_obj_set_width(body, lv_pct(100));
  lv_obj_set_height(body, LV_SIZE_CONTENT);
  lv_obj_align(body, LV_ALIGN_TOP_LEFT, 0, 40);
  lv_obj_set_style_bg_opa(body, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(body, 0, 0);
  lv_obj_set_style_pad_all(body, 0, 0);
  lv_obj_set_style_pad_row(body, 4, 0);
  lv_obj_set_flex_flow(body, LV_FLEX_FLOW_COLUMN);
  lv_obj_clear_flag(body, LV_OBJ_FLAG_SCROLLABLE);

  auto rowLabel = [&](const char* text, const lv_font_t* font) {
    lv_obj_t* l = lv_label_create(body);
    lv_label_set_text(l, text);
    lv_obj_set_style_text_color(l, lv_color_white(), 0);
    lv_obj_set_style_text_font(l, font, 0);
    return l;
  };
  rowLabel("Check the UART wiring:", &lv_font_montserrat_14);
  rowLabel("ESP GPIO 18    " LV_SYMBOL_LEFT "    LC29HDA TX", &lv_font_montserrat_14);
  rowLabel("ESP GPIO 17    " LV_SYMBOL_RIGHT "    LC29HDA RX", &lv_font_montserrat_14);
  rowLabel(LV_SYMBOL_WARNING "  3V3 only - never 5V", &lv_font_montserrat_14);

  // WiFi-fail banner (amber instead of red — the cause is config, not
  // hardware). Sits lower on the screen so it can co-exist with the
  // no-GNSS overlay above it without overlapping.
  wifi_fail_overlay = lv_obj_create(scr_main);
  lv_obj_set_size(wifi_fail_overlay, 420, 130);
  lv_obj_align(wifi_fail_overlay, LV_ALIGN_CENTER, 0, 60);
  lv_obj_set_style_bg_color(wifi_fail_overlay, COL_AMBER, 0);
  lv_obj_set_style_bg_opa(wifi_fail_overlay, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(wifi_fail_overlay, 0, 0);
  lv_obj_set_style_radius(wifi_fail_overlay, 12, 0);
  lv_obj_set_style_pad_all(wifi_fail_overlay, 14, 0);
  lv_obj_set_style_shadow_color(wifi_fail_overlay, lv_color_black(), 0);
  lv_obj_set_style_shadow_opa(wifi_fail_overlay, LV_OPA_40, 0);
  lv_obj_set_style_shadow_width(wifi_fail_overlay, 18, 0);
  lv_obj_clear_flag(wifi_fail_overlay, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_add_flag(wifi_fail_overlay, LV_OBJ_FLAG_HIDDEN);

  lv_obj_t* wt = lv_label_create(wifi_fail_overlay);
  lv_label_set_text(wt, LV_SYMBOL_WIFI "  WiFi connect failed");
  lv_obj_set_style_text_color(wt, lv_color_hex(0x1f1300), 0);  // near-black, readable on amber
  lv_obj_set_style_text_font(wt, &lv_font_montserrat_20, 0);
  lv_obj_align(wt, LV_ALIGN_TOP_LEFT, 0, 0);

  lv_obj_t* wclose = lv_btn_create(wifi_fail_overlay);
  lv_obj_set_size(wclose, 38, 38);
  lv_obj_align(wclose, LV_ALIGN_TOP_RIGHT, 0, -4);
  lv_obj_set_style_bg_color(wclose, lv_color_hex(0xb45309), 0);  // darker amber
  lv_obj_set_style_radius(wclose, 6, 0);
  lv_obj_set_style_border_width(wclose, 0, 0);
  lv_obj_set_style_shadow_width(wclose, 0, 0);
  lv_obj_set_style_pad_all(wclose, 0, 0);
  lv_obj_add_event_cb(wclose, dismiss_wifi_fail, LV_EVENT_CLICKED, NULL);
  lv_obj_t* wcl = lv_label_create(wclose);
  lv_label_set_text(wcl, LV_SYMBOL_CLOSE);
  lv_obj_set_style_text_color(wcl, lv_color_white(), 0);
  lv_obj_set_style_text_font(wcl, &lv_font_montserrat_20, 0);
  lv_obj_center(wcl);

  lbl_wifi_fail_body = lv_label_create(wifi_fail_overlay);
  lv_label_set_long_mode(lbl_wifi_fail_body, LV_LABEL_LONG_WRAP);
  lv_label_set_text(lbl_wifi_fail_body, "");
  lv_obj_set_width(lbl_wifi_fail_body, lv_pct(100));
  lv_obj_set_style_text_color(lbl_wifi_fail_body, lv_color_hex(0x1f1300), 0);
  lv_obj_set_style_text_font(lbl_wifi_fail_body, &lv_font_montserrat_14, 0);
  lv_obj_align(lbl_wifi_fail_body, LV_ALIGN_TOP_LEFT, 0, 40);

  // Tap-to-fix button at the bottom of the banner.
  lv_obj_t* wopen = lv_btn_create(wifi_fail_overlay);
  lv_obj_set_size(wopen, 180, 32);
  lv_obj_align(wopen, LV_ALIGN_BOTTOM_RIGHT, 0, 4);
  lv_obj_set_style_bg_color(wopen, lv_color_hex(0x1f1300), 0);
  lv_obj_set_style_radius(wopen, 6, 0);
  lv_obj_set_style_border_width(wopen, 0, 0);
  lv_obj_set_style_shadow_width(wopen, 0, 0);
  lv_obj_add_event_cb(wopen, wifi_fail_open_settings, LV_EVENT_CLICKED, NULL);
  lv_obj_t* wol = lv_label_create(wopen);
  lv_label_set_text(wol, LV_SYMBOL_SETTINGS "  Open settings");
  lv_obj_set_style_text_color(wol, lv_color_white(), 0);
  lv_obj_set_style_text_font(wol, &lv_font_montserrat_14, 0);
  lv_obj_center(wol);
}

// Apply / clear the record button's visual state. Called every refresh
// tick but bails out fast when nothing changed so we're not restyling on
// every redraw. Centralises the styling so the button can't end up in a
// half-state mismatched with the touch handler.
static void apply_record_btn_state(RecordBtnState state) {
  if (state == current_record_state) return;
  current_record_state = state;
  switch (state) {
    case RBS_START:
      lv_obj_clear_state(btn_record, LV_STATE_DISABLED);
      lv_obj_set_style_bg_color(btn_record, COL_EMERALD, 0);
      lv_obj_set_style_text_color(lbl_record, lv_color_hex(0x00211a), 0);
      lv_label_set_text(lbl_record, LV_SYMBOL_PLAY "  Start recording");
      break;
    case RBS_STOP:
      lv_obj_clear_state(btn_record, LV_STATE_DISABLED);
      lv_obj_set_style_bg_color(btn_record, COL_RED, 0);
      lv_obj_set_style_text_color(lbl_record, lv_color_white(), 0);
      lv_label_set_text(lbl_record, LV_SYMBOL_STOP "  Stop recording");
      break;
    case RBS_WAITING_GNSS:
      lv_obj_add_state(btn_record, LV_STATE_DISABLED);
      lv_obj_set_style_bg_color(btn_record, lv_color_hex(0x374151), 0);
      lv_obj_set_style_text_color(lbl_record, lv_color_hex(0x9ca3af), 0);
      lv_label_set_text(lbl_record, LV_SYMBOL_GPS "  Waiting for GNSS");
      break;
    case RBS_WAITING_RTK:
      // Button stays CLICKABLE here on purpose: indoor smoke-tests need to
      // be able to start a recording without a sky view. The amber colour
      // plus the rtk_warning_banner above the map make the "this won't
      // import as an area" consequence visible without blocking the user.
      lv_obj_clear_state(btn_record, LV_STATE_DISABLED);
      lv_obj_set_style_bg_color(btn_record, COL_AMBER, 0);
      lv_obj_set_style_text_color(lbl_record, lv_color_hex(0x1f1300), 0);
      lv_label_set_text(lbl_record, LV_SYMBOL_PLAY "  Start (no RTK)");
      break;
  }
}

static void dismiss_no_gnss(lv_event_t* e) {
  no_gnss_dismissed = true;
  lv_obj_add_flag(no_gnss_overlay, LV_OBJ_FLAG_HIDDEN);
}

static void dismiss_wifi_fail(lv_event_t* e) {
  wifi_fail_dismissed = true;
  lv_obj_add_flag(wifi_fail_overlay, LV_OBJ_FLAG_HIDDEN);
}

// Tap "Open settings" on the WiFi banner — also dismisses the banner so
// the user isn't fighting it off after they've gone to fix the SSID.
static void wifi_fail_open_settings(lv_event_t* e) {
  wifi_fail_dismissed = true;
  lv_obj_add_flag(wifi_fail_overlay, LV_OBJ_FLAG_HIDDEN);
  load_settings_values();
  lv_scr_load(scr_settings);
}

// ── Settings screen ───────────────────────────────────────────────────────
static lv_obj_t* make_field(lv_obj_t* parent, const char* label,
                            lv_obj_t** out_ta, bool isPassword,
                            const char* placeholder) {
  lv_obj_t* row = lv_obj_create(parent);
  lv_obj_set_width(row, lv_pct(100));
  lv_obj_set_height(row, LV_SIZE_CONTENT);
  lv_obj_set_style_bg_opa(row, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(row, 0, 0);
  lv_obj_set_style_pad_all(row, 4, 0);
  lv_obj_clear_flag(row, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t* lbl = lv_label_create(row);
  lv_label_set_text(lbl, label);
  lv_obj_set_style_text_color(lbl, COL_DIM, 0);
  lv_obj_set_style_text_font(lbl, &lv_font_montserrat_12, 0);
  lv_obj_align(lbl, LV_ALIGN_TOP_LEFT, 0, 0);

  lv_obj_t* ta = lv_textarea_create(row);
  lv_obj_set_width(ta, lv_pct(100));
  lv_obj_set_height(ta, 36);
  lv_obj_align(ta, LV_ALIGN_TOP_LEFT, 0, 18);
  lv_textarea_set_one_line(ta, true);
  lv_textarea_set_placeholder_text(ta, placeholder);
  if (isPassword) lv_textarea_set_password_mode(ta, true);
  lv_obj_set_style_bg_color(ta, COL_CARD_DIM, 0);
  lv_obj_set_style_text_color(ta, COL_TEXT, 0);
  lv_obj_set_style_text_font(ta, &lv_font_montserrat_14, 0);
  lv_obj_set_style_border_color(ta, lv_color_hex(0x374151), 0);
  lv_obj_set_style_border_width(ta, 1, 0);
  lv_obj_set_style_radius(ta, 6, 0);
  lv_obj_add_event_cb(ta, on_textarea_focus, LV_EVENT_FOCUSED, NULL);

  *out_ta = ta;
  return row;
}

static void build_settings_screen() {
  scr_settings = lv_obj_create(NULL);
  lv_obj_set_style_bg_color(scr_settings, COL_BG, 0);
  lv_obj_clear_flag(scr_settings, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_pad_all(scr_settings, 0, 0);

  // Top header.
  lv_obj_t* hdr = lv_obj_create(scr_settings);
  lv_obj_set_size(hdr, SCREEN_W, TOPBAR_H);
  lv_obj_align(hdr, LV_ALIGN_TOP_MID, 0, 0);
  lv_obj_set_style_bg_color(hdr, COL_CARD_DIM, 0);
  lv_obj_set_style_border_width(hdr, 0, 0);
  lv_obj_set_style_radius(hdr, 0, 0);
  lv_obj_set_style_pad_all(hdr, 6, 0);
  lv_obj_clear_flag(hdr, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t* back = lv_btn_create(hdr);
  lv_obj_set_size(back, 80, 32);
  lv_obj_align(back, LV_ALIGN_LEFT_MID, 0, 0);
  lv_obj_set_style_bg_color(back, lv_color_hex(0x374151), 0);
  lv_obj_set_style_radius(back, 6, 0);
  lv_obj_set_style_border_width(back, 0, 0);
  lv_obj_set_style_shadow_width(back, 0, 0);
  lv_obj_add_event_cb(back, back_to_main, LV_EVENT_CLICKED, NULL);
  lv_obj_t* bl = lv_label_create(back);
  lv_label_set_text(bl, LV_SYMBOL_LEFT "  Back");
  lv_obj_set_style_text_color(bl, COL_TEXT, 0);
  lv_obj_set_style_text_font(bl, &lv_font_montserrat_14, 0);
  lv_obj_center(bl);

  lv_obj_t* title = lv_label_create(hdr);
  lv_label_set_text(title, "Settings");
  lv_obj_set_style_text_color(title, COL_TEXT, 0);
  lv_obj_set_style_text_font(title, &lv_font_montserrat_20, 0);
  lv_obj_align(title, LV_ALIGN_CENTER, 0, 0);

  // Tabview with WiFi + NTRIP.
  lv_obj_t* tv = lv_tabview_create(scr_settings, LV_DIR_TOP, 36);
  settings_tabview = tv;
  lv_obj_set_size(tv, SCREEN_W, SETTINGS_TV_FULL_H);
  lv_obj_align(tv, LV_ALIGN_TOP_MID, 0, TOPBAR_H);
  lv_obj_set_style_bg_color(tv, COL_BG, 0);
  lv_obj_set_style_bg_color(lv_tabview_get_tab_btns(tv), COL_CARD_DIM, 0);
  lv_obj_set_style_text_color(lv_tabview_get_tab_btns(tv), COL_TEXT, 0);
  lv_obj_set_style_text_font(lv_tabview_get_tab_btns(tv), &lv_font_montserrat_14, 0);

  lv_obj_t* tab_wifi  = lv_tabview_add_tab(tv, LV_SYMBOL_WIFI     "  WiFi");
  lv_obj_t* tab_ntrip = lv_tabview_add_tab(tv, LV_SYMBOL_UPLOAD   "  NTRIP");
  lv_obj_t* tab_fw    = lv_tabview_add_tab(tv, LV_SYMBOL_DOWNLOAD "  Firmware");
  lv_obj_set_style_pad_all(tab_wifi, 12, 0);
  lv_obj_set_style_pad_all(tab_ntrip, 12, 0);
  lv_obj_set_style_pad_all(tab_fw, 12, 0);

  lv_obj_set_flex_flow(tab_wifi, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(tab_wifi, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
  make_field(tab_wifi, "SSID", &ta_wifi_ssid, false, "Home WiFi");
  make_field(tab_wifi, "Password", &ta_wifi_pass, true, "(blank = keep stored)");

  lv_obj_set_flex_flow(tab_ntrip, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(tab_ntrip, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
  make_field(tab_ntrip, "Host",       &ta_ntrip_host,  false, "caster.centipede.fr");
  make_field(tab_ntrip, "Port",       &ta_ntrip_port,  false, "2101");
  make_field(tab_ntrip, "Mountpoint", &ta_ntrip_mount, false, "NLDB / NLAMS00FRA0");
  make_field(tab_ntrip, "User",       &ta_ntrip_user,  false, "centipede");
  make_field(tab_ntrip, "Password",   &ta_ntrip_pass,  true,  "(blank = keep stored)");

  // ── Firmware tab ────────────────────────────────────────────────────
  // Flex column with: section header, current-version label, Check +
  // Update button, status label for results. Mirrors the spacing the
  // WiFi/NTRIP tabs get from the field rows so the layout reads as a
  // peer of those tabs instead of an awkward popup.
  lv_obj_set_flex_flow(tab_fw, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(tab_fw, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
  lv_obj_set_style_pad_row(tab_fw, 10, 0);

  lv_obj_t* fwHeader = lv_label_create(tab_fw);
  lv_label_set_text(fwHeader, "Firmware");
  lv_obj_set_style_text_color(fwHeader, COL_TEXT, 0);
  lv_obj_set_style_text_font(fwHeader, &lv_font_montserrat_14, 0);

  s_otaVersionLabel = lv_label_create(tab_fw);
  char verBuf[96];
  snprintf(verBuf, sizeof(verBuf), "Current: %s", walkerFirmwareVersion());
  lv_label_set_text(s_otaVersionLabel, verBuf);
  lv_obj_set_style_text_color(s_otaVersionLabel, COL_DIM, 0);
  lv_obj_set_style_text_font(s_otaVersionLabel, &lv_font_montserrat_14, 0);

  s_otaCheckBtn = lv_btn_create(tab_fw);
  lv_obj_set_size(s_otaCheckBtn, lv_pct(60), 40);
  lv_obj_set_style_bg_color(s_otaCheckBtn, COL_EMERALD, 0);
  lv_obj_set_style_radius(s_otaCheckBtn, 8, 0);
  lv_obj_set_style_border_width(s_otaCheckBtn, 0, 0);
  lv_obj_set_style_shadow_width(s_otaCheckBtn, 0, 0);
  lv_obj_add_event_cb(s_otaCheckBtn, onOtaButtonClicked, LV_EVENT_CLICKED, NULL);
  lv_obj_t* fwBtnLbl = lv_label_create(s_otaCheckBtn);
  lv_label_set_text(fwBtnLbl, LV_SYMBOL_DOWNLOAD "  Check + Update");
  lv_obj_set_style_text_color(fwBtnLbl, lv_color_hex(0x00211a), 0);
  lv_obj_set_style_text_font(fwBtnLbl, &lv_font_montserrat_14, 0);
  lv_obj_center(fwBtnLbl);

  s_otaStatusLabel = lv_label_create(tab_fw);
  lv_label_set_text(s_otaStatusLabel, "");
  lv_obj_set_style_text_color(s_otaStatusLabel, COL_TEXT, 0);
  lv_obj_set_style_text_font(s_otaStatusLabel, &lv_font_montserrat_12, 0);
  lv_label_set_long_mode(s_otaStatusLabel, LV_LABEL_LONG_WRAP);
  lv_obj_set_width(s_otaStatusLabel, lv_pct(100));

  // Save bar at the bottom of the tabview.
  lv_obj_t* save_bar = lv_obj_create(scr_settings);
  lv_obj_set_size(save_bar, SCREEN_W, BOTTOMBAR_H);
  lv_obj_align(save_bar, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_set_style_bg_color(save_bar, COL_CARD_DIM, 0);
  lv_obj_set_style_border_width(save_bar, 0, 0);
  lv_obj_set_style_radius(save_bar, 0, 0);
  lv_obj_set_style_pad_all(save_bar, 8, 0);
  lv_obj_clear_flag(save_bar, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t* save = lv_btn_create(save_bar);
  lv_obj_set_size(save, 200, 38);
  lv_obj_align(save, LV_ALIGN_RIGHT_MID, 0, 0);
  lv_obj_set_style_bg_color(save, COL_EMERALD, 0);
  lv_obj_set_style_radius(save, 8, 0);
  lv_obj_set_style_border_width(save, 0, 0);
  lv_obj_set_style_shadow_width(save, 0, 0);
  lv_obj_add_event_cb(save, on_save_settings, LV_EVENT_CLICKED, NULL);
  lv_obj_t* sl = lv_label_create(save);
  lv_label_set_text(sl, LV_SYMBOL_SAVE "  Save & reboot");
  lv_obj_set_style_text_color(sl, lv_color_hex(0x00211a), 0);
  lv_obj_set_style_text_font(sl, &lv_font_montserrat_14, 0);
  lv_obj_center(sl);

  lbl_save_status = lv_label_create(save_bar);
  lv_label_set_text(lbl_save_status, "");
  lv_obj_set_style_text_color(lbl_save_status, COL_DIM, 0);
  lv_obj_set_style_text_font(lbl_save_status, &lv_font_montserrat_12, 0);
  lv_obj_align(lbl_save_status, LV_ALIGN_LEFT_MID, 0, 0);

  // Soft keyboard — hidden until a textarea takes focus. READY (the
  // checkmark) advances to the next field in the active tab and only
  // closes the keyboard after the last one. CANCEL (the X) closes
  // straight away, no field jump.
  keyboard = lv_keyboard_create(scr_settings);
  lv_obj_set_size(keyboard, SCREEN_W, KEYBOARD_H);
  lv_obj_add_flag(keyboard, LV_OBJ_FLAG_HIDDEN);
  lv_obj_add_event_cb(keyboard, on_keyboard_event, LV_EVENT_READY,  NULL);
  lv_obj_add_event_cb(keyboard, on_keyboard_event, LV_EVENT_CANCEL, NULL);
}

// Hide/show the keyboard AND resize the tabview underneath so the
// active field stays visible. Keep these two changes in one place —
// they have to move together or the keyboard ends up covering the
// password field again.
static void set_keyboard_visible(bool visible) {
  if (visible) {
    if (settings_tabview) lv_obj_set_height(settings_tabview, SETTINGS_TV_OPEN_H);
    lv_obj_clear_flag(keyboard, LV_OBJ_FLAG_HIDDEN);
    lv_obj_align(keyboard, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_obj_move_foreground(keyboard);
  } else {
    lv_obj_add_flag(keyboard, LV_OBJ_FLAG_HIDDEN);
    if (settings_tabview) lv_obj_set_height(settings_tabview, SETTINGS_TV_FULL_H);
  }
}

// ── Maps screen ──────────────────────────────────────────────────────────
// Lists every SessionStore work map. Replaces both the old read-only
// Tracks list (/tracks/*.csv) and the separate Maps detail screen that
// used to live on s_screenMain. Tap a row to load its polygon onto the
// GPS tab; long-press to confirm-delete.
static void build_maps_screen() {
  scr_maps = lv_obj_create(NULL);
  lv_obj_set_style_bg_color(scr_maps, COL_BG, 0);
  lv_obj_clear_flag(scr_maps, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_pad_all(scr_maps, 0, 0);

  lv_obj_t* hdr = lv_obj_create(scr_maps);
  lv_obj_set_size(hdr, SCREEN_W, TOPBAR_H);
  lv_obj_align(hdr, LV_ALIGN_TOP_MID, 0, 0);
  lv_obj_set_style_bg_color(hdr, COL_CARD_DIM, 0);
  lv_obj_set_style_border_width(hdr, 0, 0);
  lv_obj_set_style_radius(hdr, 0, 0);
  lv_obj_set_style_pad_all(hdr, 6, 0);
  lv_obj_clear_flag(hdr, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t* back = lv_btn_create(hdr);
  lv_obj_set_size(back, 80, 32);
  lv_obj_align(back, LV_ALIGN_LEFT_MID, 0, 0);
  lv_obj_set_style_bg_color(back, lv_color_hex(0x374151), 0);
  lv_obj_set_style_radius(back, 6, 0);
  lv_obj_set_style_border_width(back, 0, 0);
  lv_obj_set_style_shadow_width(back, 0, 0);
  lv_obj_add_event_cb(back, back_to_main, LV_EVENT_CLICKED, NULL);
  lv_obj_t* bl = lv_label_create(back);
  lv_label_set_text(bl, LV_SYMBOL_LEFT "  Back");
  lv_obj_set_style_text_color(bl, COL_TEXT, 0);
  lv_obj_set_style_text_font(bl, &lv_font_montserrat_14, 0);
  lv_obj_center(bl);

  lv_obj_t* title = lv_label_create(hdr);
  lv_label_set_text(title, "Saved maps");
  lv_obj_set_style_text_color(title, COL_TEXT, 0);
  lv_obj_set_style_text_font(title, &lv_font_montserrat_20, 0);
  lv_obj_align(title, LV_ALIGN_CENTER, 0, 0);

  maps_list = lv_obj_create(scr_maps);
  lv_obj_set_size(maps_list, SCREEN_W, SCREEN_H - TOPBAR_H - 28);
  lv_obj_align(maps_list, LV_ALIGN_TOP_MID, 0, TOPBAR_H);
  lv_obj_set_style_bg_color(maps_list, COL_BG, 0);
  lv_obj_set_style_border_width(maps_list, 0, 0);
  lv_obj_set_style_radius(maps_list, 0, 0);
  lv_obj_set_style_pad_all(maps_list, 8, 0);
  lv_obj_set_flex_flow(maps_list, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(maps_list, 6, 0);

  maps_status = lv_label_create(scr_maps);
  lv_label_set_text(maps_status, "");
  lv_obj_set_style_text_color(maps_status, COL_DIM, 0);
  lv_obj_set_style_text_font(maps_status, &lv_font_montserrat_12, 0);
  lv_obj_align(maps_status, LV_ALIGN_BOTTOM_MID, 0, -6);
}

// ── Navigation callbacks ──────────────────────────────────────────────────
static void open_settings(lv_event_t* e) {
  load_settings_values();
  lv_scr_load(scr_settings);
}

static void open_maps_screen(lv_event_t* /*e*/) {
  reload_maps_list();
  lv_scr_load(scr_maps);
}

static void back_to_main(lv_event_t* e) {
  // If keyboard is up, drop it before switching screens — and restore
  // the tabview to its full height so the next visit doesn't open with
  // a shrunken layout.
  if (keyboard) set_keyboard_visible(false);
  lv_scr_load(scr_main);
}

// ── Settings: keyboard + save ─────────────────────────────────────────────
static void on_textarea_focus(lv_event_t* e) {
  lv_obj_t* ta = lv_event_get_target(e);
  focus_textarea(ta);
}

// Wire the keyboard to a textarea and bring it on-screen. Shared by the
// initial-focus path and by the "next field" jump on READY so they pick
// the same keyboard mode + animation behaviour.
static void focus_textarea(lv_obj_t* ta) {
  if (!ta) return;
  lv_keyboard_set_textarea(keyboard, ta);

  // Numeric mode for the port field, alpha otherwise.
  if (ta == ta_ntrip_port) {
    lv_keyboard_set_mode(keyboard, LV_KEYBOARD_MODE_NUMBER);
  } else {
    lv_keyboard_set_mode(keyboard, LV_KEYBOARD_MODE_TEXT_LOWER);
  }
  // Move the visible caret to the end of the field — without this the
  // jump from one field to the next leaves it parked at the start of
  // the (already-filled) text, which feels wrong when typing more.
  lv_textarea_set_cursor_pos(ta, LV_TEXTAREA_CURSOR_LAST);

  set_keyboard_visible(true);

  // Tell the textarea it's the focused one — its border styling picks
  // this up via LV_STATE_FOCUSED, so the active field reads as active.
  lv_obj_add_state(ta, LV_STATE_FOCUSED);
  lv_group_focus_obj(ta);

  // After the tabview shrinks, the focused field may now be outside
  // the visible area (NTRIP password sits near the bottom of a 5-row
  // form). Scroll its parent until the textarea is inside the new
  // smaller window — LV_ANIM_ON keeps the motion smooth.
  lv_obj_scroll_to_view(ta, LV_ANIM_ON);
}

static void on_keyboard_event(lv_event_t* e) {
  lv_event_code_t code = lv_event_get_code(e);
  if (code == LV_EVENT_CANCEL) {
    // X — close and bail. Field stays as-is, tabview grows back.
    set_keyboard_visible(false);
    return;
  }
  if (code != LV_EVENT_READY) return;

  // Checkmark — jump to the next field within the same tab. The two
  // ordered chains mirror the on-screen layout so the user can fill a
  // tab end-to-end without lifting their thumb off the checkmark.
  lv_obj_t* current = lv_keyboard_get_textarea(keyboard);
  lv_obj_t* wifiOrder[]  = { ta_wifi_ssid, ta_wifi_pass };
  lv_obj_t* ntripOrder[] = { ta_ntrip_host, ta_ntrip_port, ta_ntrip_mount,
                             ta_ntrip_user, ta_ntrip_pass };
  auto advance = [&](lv_obj_t** chain, size_t n) -> lv_obj_t* {
    for (size_t i = 0; i + 1 < n; i++) {
      if (chain[i] == current) return chain[i + 1];
    }
    return nullptr;  // already on last field
  };
  lv_obj_t* next = advance(wifiOrder, sizeof(wifiOrder) / sizeof(wifiOrder[0]));
  if (!next) {
    next = advance(ntripOrder, sizeof(ntripOrder) / sizeof(ntripOrder[0]));
  }
  if (next) {
    focus_textarea(next);
  } else {
    // Last field — hide the keyboard so Save is reachable without
    // another tap on the canvas. Tabview restores to full height.
    set_keyboard_visible(false);
  }
}

static String taText(lv_obj_t* ta) {
  const char* s = lv_textarea_get_text(ta);
  return String(s ? s : "");
}

static void load_settings_values() {
  walkerGetConfig(cfg_baseline);
  lv_textarea_set_text(ta_wifi_ssid,  cfg_baseline.wifiSsid.c_str());
  lv_textarea_set_text(ta_wifi_pass,  "");
  lv_textarea_set_text(ta_ntrip_host, cfg_baseline.ntripHost.c_str());
  char portBuf[8];
  snprintf(portBuf, sizeof(portBuf), "%u", (unsigned) cfg_baseline.ntripPort);
  lv_textarea_set_text(ta_ntrip_port, portBuf);
  lv_textarea_set_text(ta_ntrip_mount, cfg_baseline.ntripMount.c_str());
  lv_textarea_set_text(ta_ntrip_user,  cfg_baseline.ntripUser.c_str());
  lv_textarea_set_text(ta_ntrip_pass,  "");

  // Hint that a password is stored — empty placeholder otherwise.
  if (cfg_baseline.wifiPassMasked.length() > 0) {
    lv_textarea_set_placeholder_text(ta_wifi_pass, "(blank = unchanged)");
  }
  if (cfg_baseline.ntripPassMasked.length() > 0) {
    lv_textarea_set_placeholder_text(ta_ntrip_pass, "(blank = unchanged)");
  }
  if (lbl_save_status) lv_label_set_text(lbl_save_status, "");

  // Refresh the firmware version label on every Settings open — cheap
  // and keeps the label honest if the running build ever rolls forward
  // without rebuilding the UI (it doesn't today, but future-proofs).
  if (s_otaVersionLabel) {
    char verBuf[96];
    snprintf(verBuf, sizeof(verBuf), "Current: %s", walkerFirmwareVersion());
    lv_label_set_text(s_otaVersionLabel, verBuf);
  }
  if (s_otaStatusLabel) {
    lv_label_set_text(s_otaStatusLabel, "");
    lv_obj_set_style_text_color(s_otaStatusLabel, COL_TEXT, 0);
  }
}

static void on_save_settings(lv_event_t* e) {
  WalkerConfigUpdate upd;
  String s;

  s = taText(ta_wifi_ssid);
  if (s != cfg_baseline.wifiSsid) { upd.wifiSsidSet = true; upd.wifiSsid = s; }
  s = taText(ta_wifi_pass);
  if (s.length() > 0)             { upd.wifiPassSet = true; upd.wifiPass = s; }

  s = taText(ta_ntrip_host);
  if (s != cfg_baseline.ntripHost) { upd.ntripHostSet = true; upd.ntripHost = s; }
  s = taText(ta_ntrip_port);
  uint32_t portVal = s.toInt();
  if (portVal > 0 && portVal != cfg_baseline.ntripPort) {
    upd.ntripPortSet = true; upd.ntripPort = (uint16_t) portVal;
  }
  s = taText(ta_ntrip_mount);
  if (s != cfg_baseline.ntripMount) { upd.ntripMountSet = true; upd.ntripMount = s; }
  s = taText(ta_ntrip_user);
  if (s != cfg_baseline.ntripUser)  { upd.ntripUserSet = true; upd.ntripUser  = s; }
  s = taText(ta_ntrip_pass);
  if (s.length() > 0)               { upd.ntripPassSet = true; upd.ntripPass  = s; }

  if (lbl_save_status) {
    lv_label_set_text(lbl_save_status, LV_SYMBOL_REFRESH "  Saving and rebooting...");
    lv_obj_set_style_text_color(lbl_save_status, COL_EMERALD, 0);
  }

  // walkerApplyConfig reboots — so we hand off and stop the timer.
  walkerApplyConfig(upd);
}

// ── Settings: OTA check + update ─────────────────────────────────────────
// Synchronous handler: walkerOtaCheck() and walkerOtaApply() both block
// the LVGL task while running. That's acceptable here because the user
// expects "Checking..."/"Updating..." feedback and the device is otherwise
// idle on this screen. lv_refr_now() forces the status string to paint
// before we begin the blocking HTTP call so the user actually sees it.
static void onOtaButtonClicked(lv_event_t* /*e*/) {
  if (s_otaStatusLabel) {
    lv_label_set_text(s_otaStatusLabel, "Checking...");
    lv_obj_set_style_text_color(s_otaStatusLabel, COL_TEXT, 0);
  }
  lv_refr_now(nullptr);

  OtaCheckResult r = walkerOtaCheck();
  if (!r.ok) {
    char msg[160];
    snprintf(msg, sizeof(msg), "Error: %s", r.error.c_str());
    if (s_otaStatusLabel) {
      lv_label_set_text(s_otaStatusLabel, msg);
      lv_obj_set_style_text_color(s_otaStatusLabel, COL_RED, 0);
    }
    return;
  }
  if (!r.updateAvailable) {
    if (s_otaStatusLabel) {
      lv_label_set_text(s_otaStatusLabel, "Up to date");
      lv_obj_set_style_text_color(s_otaStatusLabel, COL_EMERALD, 0);
    }
    return;
  }

  char banner[160];
  snprintf(banner, sizeof(banner), "New: %s, updating...", r.latestVersion.c_str());
  if (s_otaStatusLabel) {
    lv_label_set_text(s_otaStatusLabel, banner);
    lv_obj_set_style_text_color(s_otaStatusLabel, COL_AMBER, 0);
  }
  lv_refr_now(nullptr);

  String err;
  if (!walkerOtaApply(r.url, r.md5, nullptr, err)) {
    snprintf(banner, sizeof(banner), "Failed: %s", err.c_str());
    if (s_otaStatusLabel) {
      lv_label_set_text(s_otaStatusLabel, banner);
      lv_obj_set_style_text_color(s_otaStatusLabel, COL_RED, 0);
    }
    return;
  }
  // walkerOtaApply reboots on success and never returns.
}

// ── Maps list ─────────────────────────────────────────────────────────────
#include <LittleFS.h>

// Saved-map viewing mode. When viewing_map_slot >= 0 the GPS tab renders
// `viewing_buffer` (the polygon points loaded from a /session/mapN_work.csv)
// instead of the live recording buffer. Cleared by Start Recording or the
// Cancel/back paths so the live polyline takes over again.
#define VIEWING_MAX MAP_POINT_MAX
static WalkerLivePoint viewing_buffer[VIEWING_MAX];
static size_t          viewing_count = 0;
static int             viewing_map_slot = -1;
static String          viewing_map_alias;

// Load /session/map<slot>_work.csv (x,y in local meters) into viewing_buffer
// converted back to lat/lng via the SessionStore origin. Returns false when
// the origin hasn't been set (cannot project) or the file is missing/empty.
// VIEWING_MAX is a hard cap — long walks above that cap just truncate the
// tail; the on-device map is too small to show that much detail anyway.
static bool load_saved_map_polygon(int slot) {
  if (slot < 0) return false;
  double oLat = 0, oLng = 0;
  if (!sessionStore.getOrigin(oLat, oLng)) {
    // No origin yet — the polygon CSV is in local meters, with no anchor
    // we can't render it on a lat/lng map. The caller surfaces this as a
    // status message.
    return false;
  }

  String path = String("/session/map") + slot + "_work.csv";
  if (!LittleFS.exists(path)) return false;
  File f = LittleFS.open(path, FILE_READ);
  if (!f) return false;

  viewing_count = 0;
  while (f.available() && viewing_count < VIEWING_MAX) {
    String line = f.readStringUntil('\n');
    if (line.endsWith("\r")) line.remove(line.length() - 1);
    if (line.length() == 0) continue;

    int c1 = line.indexOf(',');
    if (c1 < 0) continue;
    String xStr = line.substring(0, c1);
    String yStr = line.substring(c1 + 1);
    double x = xStr.toDouble();
    double y = yStr.toDouble();
    double lat = 0, lng = 0;
    if (!sessionStore.localToGps(x, y, lat, lng)) continue;

    viewing_buffer[viewing_count].lat = lat;
    viewing_buffer[viewing_count].lng = lng;
    // Polygon points captured via the recorder are FIX-quality by
    // construction (the recorder drops sub-fix samples). Marking them
    // as fix=4 keeps the render cursor green for the loaded view.
    viewing_buffer[viewing_count].fix = 4;
    viewing_count++;
  }
  f.close();
  return viewing_count > 0;
}

// Called by toggle_recording / on_add_*_clicked to drop out of viewing
// mode so the live polyline (or fresh sub-recording) doesn't draw on
// top of a stale polygon.
static void exit_viewing_mode() {
  viewing_map_slot = -1;
  viewing_map_alias = "";
  viewing_count = 0;
}

// LV_EVENT_DELETE fires when lv_obj_clean tears the maps list down.
// Frees the row's slot wrapper allocation so reopening Maps doesn't leak.
static void on_map_row_deleted(lv_event_t* e) {
  void* data = lv_event_get_user_data(e);
  if (data) free(data);
}

// Single tap on a map row — load the polygon, jump to home, switch
// the GPS tab into viewing mode for the chosen slot.
static void on_map_row_clicked(lv_event_t* e) {
  int* slotPtr = (int*) lv_event_get_user_data(e);
  if (!slotPtr) return;
  int slot = *slotPtr;
  if (!load_saved_map_polygon(slot)) {
    // Couldn't load — leave viewing mode off and tell the user. We
    // can't easily show a toast here so we re-use the status label.
    if (maps_status) {
      lv_label_set_text(maps_status,
                        LV_SYMBOL_WARNING "  Map has no origin yet - record on GPS tab first");
      lv_obj_set_style_text_color(maps_status, COL_AMBER, 0);
    }
    return;
  }
  viewing_map_slot = slot;
  // Pull the alias for the home-screen status text.
  MapEntry entries[3];
  size_t cnt = 0;
  sessionStore.listMaps(entries, 3, cnt);
  viewing_map_alias = String("map") + slot;
  for (size_t i = 0; i < cnt; i++) {
    if (entries[i].slot == slot) { viewing_map_alias = entries[i].alias; break; }
  }
  lv_scr_load(scr_main);
}

// Long-press confirm-delete msgbox. Stores the slot in the dialog's
// user data so the confirmation handler knows which map to wipe.
static void on_map_row_delete_confirmed(lv_event_t* e);
static void on_map_row_long_pressed(lv_event_t* e) {
  int* slotPtr = (int*) lv_event_get_user_data(e);
  if (!slotPtr) return;
  // Heap-allocate the slot for the msgbox so the row's user_data can
  // remain stable across rebuilds (the row may get deleted while the
  // confirm box is open).
  int* dlgSlot = (int*) malloc(sizeof(int));
  if (!dlgSlot) return;
  *dlgSlot = *slotPtr;

  static const char* btns[] = { "Cancel", "Delete", "" };
  char body[140];
  snprintf(body, sizeof(body),
           "Delete map%d and all of its obstacles + channels?\nThis cannot be undone.",
           *dlgSlot);
  lv_obj_t* mbox = lv_msgbox_create(NULL, "Confirm delete", body, btns, false);
  lv_obj_set_user_data(mbox, dlgSlot);
  lv_obj_add_event_cb(mbox, on_map_row_delete_confirmed, LV_EVENT_VALUE_CHANGED, dlgSlot);
  lv_obj_center(mbox);
}

static void on_map_row_delete_confirmed(lv_event_t* e) {
  lv_obj_t* mbox = lv_event_get_current_target(e);
  int* dlgSlot = (int*) lv_event_get_user_data(e);
  uint16_t idx = lv_msgbox_get_active_btn(mbox);
  lv_msgbox_close(mbox);
  if (idx != 1) {
    // Cancel — just free the heap copy and bail.
    if (dlgSlot) free(dlgSlot);
    return;
  }
  if (!dlgSlot) return;
  int slot = *dlgSlot;
  free(dlgSlot);
  if (slot < 0) return;
  sessionStore.deleteMap(slot);
  // If the user was viewing the just-deleted slot, drop them out so the
  // stale polygon doesn't keep rendering.
  if (viewing_map_slot == slot) exit_viewing_mode();
  reload_maps_list();
}

static void reload_maps_list() {
  if (!maps_list) return;
  // Wipe previous rows.
  lv_obj_clean(maps_list);

  MapEntry entries[3];
  size_t count = 0;
  sessionStore.listMaps(entries, 3, count);

  if (maps_status) {
    char buf[64];
    snprintf(buf, sizeof(buf), "%u saved maps  -  long press a row to delete",
             (unsigned) count);
    lv_label_set_text(maps_status, buf);
    lv_obj_set_style_text_color(maps_status, COL_DIM, 0);
  }

  if (count == 0) {
    lv_obj_t* row = lv_label_create(maps_list);
    lv_label_set_text(row,
        LV_SYMBOL_DIRECTORY "  No maps yet - record a track on GPS, then Save as area");
    lv_obj_set_style_text_color(row, COL_DIM, 0);
    lv_obj_set_style_text_font(row, &lv_font_montserrat_14, 0);
    return;
  }

  for (size_t i = 0; i < count; i++) {
    lv_obj_t* row = lv_obj_create(maps_list);
    lv_obj_set_size(row, lv_pct(100), 56);
    lv_obj_set_style_bg_color(row, COL_CARD, 0);
    lv_obj_set_style_border_width(row, 0, 0);
    lv_obj_set_style_radius(row, 8, 0);
    lv_obj_set_style_pad_all(row, 6, 0);
    lv_obj_clear_flag(row, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(row, LV_OBJ_FLAG_CLICKABLE);

    // Heap-allocate the slot so each row carries an independent stable
    // pointer through LVGL events — the entries[] vector dies after the
    // loop returns.
    int* slotPtr = (int*) malloc(sizeof(int));
    if (!slotPtr) continue;
    *slotPtr = entries[i].slot;
    lv_obj_add_event_cb(row, on_map_row_clicked,       LV_EVENT_CLICKED,      slotPtr);
    lv_obj_add_event_cb(row, on_map_row_long_pressed,  LV_EVENT_LONG_PRESSED, slotPtr);
    lv_obj_add_event_cb(row, on_map_row_deleted,       LV_EVENT_DELETE,       slotPtr);

    char title[64];
    snprintf(title, sizeof(title), "map%d  %s",
             entries[i].slot, entries[i].alias.c_str());
    lv_obj_t* ltitle = lv_label_create(row);
    lv_label_set_text(ltitle, title);
    lv_obj_set_style_text_color(ltitle, COL_TEXT, 0);
    lv_obj_set_style_text_font(ltitle, &lv_font_montserrat_14, 0);
    lv_obj_align(ltitle, LV_ALIGN_TOP_LEFT, 0, 0);

    char meta[96];
    snprintf(meta, sizeof(meta), "%d pts boundary  -  obs %d  -  ch %d",
             entries[i].boundaryPoints,
             entries[i].obstacleCount,
             entries[i].channelCount);
    lv_obj_t* lmeta = lv_label_create(row);
    lv_label_set_text(lmeta, meta);
    lv_obj_set_style_text_color(lmeta, COL_DIM, 0);
    lv_obj_set_style_text_font(lmeta, &lv_font_montserrat_12, 0);
    lv_obj_align(lmeta, LV_ALIGN_BOTTOM_LEFT, 0, 0);
  }
}

// ── Recording toggle ──────────────────────────────────────────────────────
static void toggle_recording(lv_event_t* e) {
  // RBS_WAITING_GNSS still bails — there is literally nothing to record
  // when the receiver hasn't emitted a single byte. RBS_WAITING_RTK is
  // accepted so indoor smoke-tests work; the user already sees the
  // amber banner explaining the consequence.
  if (current_record_state != RBS_START &&
      current_record_state != RBS_STOP  &&
      current_record_state != RBS_WAITING_RTK) {
    return;
  }
  // Starting a fresh recording always drops the user out of saved-
  // track viewing mode; otherwise the new live polyline would draw
  // underneath the saved one and confuse the eye.
  if (current_record_state == RBS_START || current_record_state == RBS_WAITING_RTK) {
    exit_viewing_mode();
  }
  // Visual flip is done by refresh_status_cb's next tick (it'll see the
  // new snap.recording and call apply_record_btn_state(RBS_STOP/START)
  // accordingly). Just kick the backend here.
  walkerToggleRecording();
}

// ── Save-as-area flow ─────────────────────────────────────────────────────
// Minimum boundary points before we'll let the user promote a stopped
// track into a SessionStore work map. Five is the smallest pentagon-like
// polygon shape; below that the area is meaningless.
#define SAVE_AREA_MIN_POINTS 5

// Reveal/hide the Save-as-area button. Called from refresh_status_cb so
// the visibility tracks live recording state and the most recent stop.
// Centralised so the toggle logic is in exactly one place.
static void update_save_area_button(const WalkerSnapshot& snap) {
  if (!btn_save_area) return;
  bool show = !snap.recording &&
              walkerLastTrackPath().length() > 0 &&
              walkerLastTrackPoints() >= SAVE_AREA_MIN_POINTS;
  if (show) lv_obj_clear_flag(btn_save_area, LV_OBJ_FLAG_HIDDEN);
  else      lv_obj_add_flag(btn_save_area, LV_OBJ_FLAG_HIDDEN);
}

// Reveal/hide the +Chan / +Obs floating buttons. Visible only when a saved
// map is being viewed AND no live recording is in flight — otherwise the
// buttons would either have nothing to attach a child to, or would compete
// with the live REC button for the user's attention.
static void update_map_action_buttons(const WalkerSnapshot& snap) {
  bool show = (viewing_map_slot >= 0) && !snap.recording;
  if (btn_add_channel) {
    if (show) lv_obj_clear_flag(btn_add_channel, LV_OBJ_FLAG_HIDDEN);
    else      lv_obj_add_flag(btn_add_channel, LV_OBJ_FLAG_HIDDEN);
  }
  if (btn_add_obstacle) {
    if (show) lv_obj_clear_flag(btn_add_obstacle, LV_OBJ_FLAG_HIDDEN);
    else      lv_obj_add_flag(btn_add_obstacle, LV_OBJ_FLAG_HIDDEN);
  }
}

// +Channel — push the recorder into Channel mode targeting the special
// "charge" pseudo-target (same shortcut the old MapDetail screen used).
// Channels FROM a map TO another map can be added later via the web UI
// if needed; for the MVP "to charger" covers the common case.
static void on_add_channel_clicked(lv_event_t* /*e*/) {
  if (viewing_map_slot < 0) return;
  if (!recorder.startChannel(viewing_map_slot, "charge")) return;
  // Stop the live recording polyline rendering: the user is now in a
  // dedicated sub-recording, the saved-polygon view stays in place
  // mentally but the Recording screen takes over the foreground.
  tft_ui_set_screen(UiScreen::Recording);
}

// +Obstacle — allocate the next free obstacle index for the current
// viewed map and start an Obstacle recording. Fails silently if all
// 32 obstacle slots are full (the user should delete some via the
// Maps list long-press).
static void on_add_obstacle_clicked(lv_event_t* /*e*/) {
  if (viewing_map_slot < 0) return;
  if (!recorder.startObstacle(viewing_map_slot)) return;
  tft_ui_set_screen(UiScreen::Recording);
}

// Read /tracks/<...>.csv row by row, convert each fix>=4 lat/lng into
// SessionStore local meters, and append to the freshly allocated slot.
// Returns the number of points written, or -1 on hard failure (file
// missing, slot allocation failed, no fixed rows). The first useable
// fix row also seeds SessionStore.setOrigin() so all subsequent
// conversions share the same anchor.
static int import_track_as_area(const String& trackPath, const String& alias) {
  int slot = sessionStore.allocWorkSlot();
  if (slot < 0) return -1;

  File f = LittleFS.open(trackPath, FILE_READ);
  if (!f) return -1;

  String line;
  bool headerSkipped = false;
  bool originSet = false;
  int written = 0;
  while (f.available()) {
    line = f.readStringUntil('\n');
    if (line.length() == 0) continue;
    // Skip the CSV header row written by startRecording().
    if (!headerSkipped) {
      headerSkipped = true;
      if (line.startsWith("timestamp_unix")) continue;
    }

    // Format: timestamp_unix,lat,lng,alt_m,fix,sats,hdop
    int c1 = line.indexOf(',');
    if (c1 < 0) continue;
    int c2 = line.indexOf(',', c1 + 1);
    if (c2 < 0) continue;
    int c3 = line.indexOf(',', c2 + 1);
    if (c3 < 0) continue;
    int c4 = line.indexOf(',', c3 + 1);
    if (c4 < 0) continue;
    int c5 = line.indexOf(',', c4 + 1);
    if (c5 < 0) continue;

    String latStr = line.substring(c1 + 1, c2);
    String lngStr = line.substring(c2 + 1, c3);
    String fixStr = line.substring(c4 + 1, c5);

    double lat = latStr.toDouble();
    double lng = lngStr.toDouble();
    int fix = fixStr.toInt();
    if (fix < 4) continue;   // only cm-grade rows make it into the polygon
    if (lat == 0 || lng == 0) continue;

    if (!originSet) {
      // First good row anchors the SessionStore coordinate system.
      sessionStore.setOrigin(lat, lng);
      originSet = true;
    }
    double x = 0, y = 0;
    if (!sessionStore.gpsToLocal(lat, lng, x, y)) continue;
    if (sessionStore.appendWorkPoint(slot, x, y)) written++;
  }
  f.close();

  if (written == 0) {
    // Roll back the empty slot so the alias slot stays free for retry.
    sessionStore.deleteMap(slot);
    return -1;
  }

  sessionStore.setAlias(slot, alias);
  return written;
}

static void on_save_as_area_clicked(lv_event_t* /*e*/) {
  String path = walkerLastTrackPath();
  uint32_t pts = walkerLastTrackPoints();
  if (path.length() == 0 || pts < SAVE_AREA_MIN_POINTS) return;

  // Auto-name: "Area N" where N is the next free work slot + 1. Avoids
  // dragging in the LVGL soft keyboard for the MVP; users can rename
  // through the Maps detail screen once that gains a rename flow.
  int previewSlot = sessionStore.allocWorkSlot();
  String alias = String("Area ") + (previewSlot >= 0 ? (previewSlot + 1) : 1);

  // Show a "Saving..." modal BEFORE the import starts. import_track_as_area
  // is synchronous and can take several seconds for a long track (each
  // appendWorkPoint open+writes+closes the CSV). Without an in-progress
  // banner the screen looks frozen until the final result modal appears.
  // No buttons so the user can't interact mid-import; we replace it with
  // the result modal after the work completes.
  static const char* no_buttons[] = { "" };
  char inprogress_body[120];
  snprintf(inprogress_body, sizeof(inprogress_body),
           "Importing %lu points as %s.\nThis may take a few seconds...",
           (unsigned long) pts, alias.c_str());
  lv_obj_t* progress = lv_msgbox_create(NULL, "Saving as area",
                                        inprogress_body, no_buttons, false);
  lv_obj_center(progress);
  // Force LVGL to flush so the user actually sees the box before we
  // lock the loop with file I/O.
  lv_refr_now(NULL);

  int written = import_track_as_area(path, alias);

  // Dismiss the in-progress modal before the result modal.
  if (progress) lv_msgbox_close(progress);

  // Clear walkerLastTrack so the "Save as area" button guard keeps it
  // hidden on the next refresh tick. Without this clearance the button
  // re-appears via update_save_area_button() and the user can re-import
  // the same track into a second slot by accident.
  walkerSetLastTrack(String(""), 0);
  if (btn_save_area) lv_obj_add_flag(btn_save_area, LV_OBJ_FLAG_HIDDEN);

  // Result modal with an OK button that actually dismisses itself.
  // The previous version had no event callback so the OK click did
  // nothing and the modal stayed up forever.
  static const char* msgbox_buttons[] = { "OK", "" };
  char title[64];
  char body[160];
  if (written > 0) {
    snprintf(title, sizeof(title), "Saved as %s", alias.c_str());
    snprintf(body, sizeof(body),
             "%d RTK FIX points imported.\nVisible on the Maps tab.",
             written);
  } else {
    snprintf(title, sizeof(title), "Save failed");
    snprintf(body, sizeof(body),
             "No RTK FIX rows in the track.\nWalk again with FIX active.");
  }
  lv_obj_t* mbox = lv_msgbox_create(NULL, title, body, msgbox_buttons, false);
  lv_obj_add_event_cb(mbox, onSaveResultDismissed, LV_EVENT_VALUE_CHANGED, nullptr);
  lv_obj_center(mbox);

  // Best-effort refresh of the Maps screen so the new entry is visible
  // when the user navigates over there.
  tft_ui_refresh_current();
}

static void onSaveResultDismissed(lv_event_t* e) {
  lv_obj_t* mbox = lv_event_get_current_target(e);
  if (mbox) lv_msgbox_close(mbox);
}

// ── Live map rendering ───────────────────────────────────────────────────
//
// Scratch buffer for the per-tick point copy. MAP_POINT_MAX × sizeof
// is ~13 KB, which on the LVGL task's 16 KB stack blows up the moment
// any rendering frame nests a few stack-heavy LVGL helpers — that's
// the original "stack overflow in task LVGL task" crash. Lives in
// .bss instead so the redraw is constant-stack.
static WalkerLivePoint redraw_scratch[MAP_POINT_MAX];

static void redraw_map(const WalkerSnapshot& snap) {
  size_t n;
  WalkerLivePoint* pts;
  if (viewing_map_slot >= 0) {
    // Viewing a previously-saved work map loaded from /session/. The
    // buffer is already populated by load_saved_map_polygon(); just
    // point the renderer at it.
    pts = viewing_buffer;
    n = viewing_count;
  } else {
    n = walkerCopyLivePoints(redraw_scratch, MAP_POINT_MAX);
    pts = redraw_scratch;
  }

  if (n == 0) {
    lv_obj_clear_flag(map_empty_label, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(map_cursor, LV_OBJ_FLAG_HIDDEN);
    // Hide the polyline rather than calling lv_line_set_points with 0 —
    // some LVGL builds dereference the point array unconditionally and
    // a count of 0 crashes the renderer on the next frame.
    lv_obj_add_flag(map_line, LV_OBJ_FLAG_HIDDEN);
    if (lbl_pts) {
      char buf[64];
      if (snap.areaM2 > 0) {
        snprintf(buf, sizeof(buf), LV_SYMBOL_DIRECTORY " 0 pts\nLast %.1f m2", snap.areaM2);
      } else {
        snprintf(buf, sizeof(buf), LV_SYMBOL_DIRECTORY " 0 pts");
      }
      lv_label_set_text(lbl_pts, buf);
    }
    if (lbl_lat) lv_obj_add_flag(lbl_lat, LV_OBJ_FLAG_HIDDEN);
    if (lbl_lng) lv_obj_add_flag(lbl_lng, LV_OBJ_FLAG_HIDDEN);
    map_pts_used = 0;
    return;
  }
  lv_obj_add_flag(map_empty_label, LV_OBJ_FLAG_HIDDEN);
  lv_obj_clear_flag(map_line, LV_OBJ_FLAG_HIDDEN);

  // BBox over the visible points. Lat/lng are doubles - float at lat
  // 52 loses ~42 cm per LSB which made the bbox wobble between ticks.
  double minLat = pts[0].lat, maxLat = pts[0].lat;
  double minLng = pts[0].lng, maxLng = pts[0].lng;
  for (size_t i = 1; i < n; i++) {
    if (pts[i].lat < minLat) minLat = pts[i].lat;
    if (pts[i].lat > maxLat) maxLat = pts[i].lat;
    if (pts[i].lng < minLng) minLng = pts[i].lng;
    if (pts[i].lng > maxLng) maxLng = pts[i].lng;
  }
  double latSpan = maxLat - minLat;
  double lngSpan = maxLng - minLng;
  // Tiny spans (single fix, or fixes all within a few cm) → pretend the
  // bbox is a 5m square so the cursor lands in the middle instead of at
  // the (0,0) corner.
  if (latSpan < 0.00005) { double c = (minLat + maxLat) / 2; minLat = c - 0.000025; maxLat = c + 0.000025; latSpan = maxLat - minLat; }
  if (lngSpan < 0.00005) { double c = (minLng + maxLng) / 2; minLng = c - 0.000025; maxLng = c + 0.000025; lngSpan = maxLng - minLng; }

  lv_coord_t w = lv_obj_get_width(map_panel);
  lv_coord_t h = lv_obj_get_height(map_panel);
  // Inner padding inside the map card — keeps the polyline off the
  // border + leaves room for the lat/lng labels at the bottom.
  const lv_coord_t pad = 14;
  const lv_coord_t topPad = 14;
  const lv_coord_t botPad = 32;
  lv_coord_t innerW = w - 2 * pad;
  lv_coord_t innerH = h - topPad - botPad;
  if (innerW < 20 || innerH < 20) return;

  // Equal-aspect scaling — without this a long-thin garden gets
  // grotesquely stretched along one axis. Use the smaller of the two
  // scales and centre what's left.
  float latM = (float) innerH / latSpan;
  float lngM = (float) innerW / lngSpan;
  float scale = (latM < lngM) ? latM : lngM;
  float drawW = lngSpan * scale;
  float drawH = latSpan * scale;
  float offX = pad + (innerW - drawW) / 2;
  float offY = topPad + (innerH - drawH) / 2;

  // Cap to MAP_POINT_MAX (storage size). If the live buffer is bigger
  // (e.g. 4000), decimate evenly so the polyline shape stays faithful.
  size_t outN = n;
  size_t step = 1;
  if (n > MAP_POINT_MAX) {
    step = (n + MAP_POINT_MAX - 1) / MAP_POINT_MAX;
    outN = (n + step - 1) / step;
    if (outN > MAP_POINT_MAX) outN = MAP_POINT_MAX;
  }
  uint16_t wi = 0;
  for (size_t i = 0; i < n && wi < outN && wi < MAP_POINT_MAX; i += step) {
    float fx = offX + (pts[i].lng - minLng) * scale;
    // Latitude → Y, inverted (north up).
    float fy = offY + (maxLat - pts[i].lat) * scale;
    map_pts[wi].x = (lv_coord_t) fx;
    map_pts[wi].y = (lv_coord_t) fy;
    wi++;
  }
  map_pts_used = wi;
  lv_line_set_points(map_line, map_pts, map_pts_used);

  if (map_pts_used > 0) {
    lv_coord_t cx = map_pts[map_pts_used - 1].x - 6;
    lv_coord_t cy = map_pts[map_pts_used - 1].y - 6;
    lv_obj_set_pos(map_cursor, cx, cy);
    lv_obj_clear_flag(map_cursor, LV_OBJ_FLAG_HIDDEN);

    // Colour cursor by latest fix quality.
    uint8_t lastFix = pts[n - 1].fix;
    lv_color_t col;
    if      (lastFix == 4) col = COL_EMERALD;
    else if (lastFix == 5) col = COL_AMBER;
    else                   col = COL_BLUE;
    lv_obj_set_style_bg_color(map_cursor, col, 0);
  }

  if (lbl_pts) {
    char buf[160];
    if (viewing_map_slot >= 0) {
      // Saved map on screen - identify it so the user knows what
      // they're looking at. Tap +Chan / +Obs to record children of
      // this map, or hit Start Recording to drop back to live.
      const char* alias = viewing_map_alias.length() ? viewing_map_alias.c_str() : "map";
      snprintf(buf, sizeof(buf),
               LV_SYMBOL_DIRECTORY " %u pts\nViewing:\n%s",
               (unsigned) n, alias);
    } else if (snap.recording) {
      // Live: how far have we walked, how much further to the start.
      snprintf(buf, sizeof(buf),
               LV_SYMBOL_DIRECTORY " %u pts\n%.1f m walked\n%.1f m to close",
               (unsigned) n, snap.walkedM, snap.closingM);
    } else if (snap.areaM2 > 0) {
      // Stopped: show the closed-polygon area + total path.
      snprintf(buf, sizeof(buf),
               LV_SYMBOL_DIRECTORY " %u pts\n%.1f m\nArea %.1f m2",
               (unsigned) n, snap.walkedM, snap.areaM2);
    } else {
      snprintf(buf, sizeof(buf), LV_SYMBOL_DIRECTORY " %u pts", (unsigned) n);
    }
    lv_label_set_text(lbl_pts, buf);
  }
  if (lbl_lat) {
    char buf[24];
    snprintf(buf, sizeof(buf), "lat %.7f", pts[n - 1].lat);
    lv_label_set_text(lbl_lat, buf);
    lv_obj_clear_flag(lbl_lat, LV_OBJ_FLAG_HIDDEN);
  }
  if (lbl_lng) {
    char buf[24];
    snprintf(buf, sizeof(buf), "lng %.7f", pts[n - 1].lng);
    lv_label_set_text(lbl_lng, buf);
    lv_obj_clear_flag(lbl_lng, LV_OBJ_FLAG_HIDDEN);
  }
}

// ── Periodic status refresh ──────────────────────────────────────────────
static const char* fixLabel(int fix) {
  switch (fix) {
    case 4: return "RTK FIX";
    case 5: return "RTK FLOAT";
    case 2: return "DGPS";
    case 1: return "GPS";
    default: return "NO FIX";
  }
}
static lv_color_t fixColor(int fix) {
  switch (fix) {
    case 4: return COL_EMERALD;
    case 5: return COL_AMBER;
    case 2: return COL_BLUE;
    case 1: return COL_BLUE;
    default: return COL_DIM;
  }
}

// Updated by refresh_status_cb on every checkpoint. The main loop reads
// this every 5 s — if the same checkpoint number stays stuck for two
// consecutive prints, that's exactly the line where the LVGL task wedged.
volatile uint8_t  g_lvgl_checkpoint = 0;
volatile uint32_t g_lvgl_last_tick_ms = 0;

static void refresh_status_cb(lv_timer_t* t) {
  g_lvgl_checkpoint = 1; g_lvgl_last_tick_ms = millis();

  // [lvgl-tick] heartbeat removed (console noise after the UI refactor).
  // g_lvgl_last_tick_ms above is still updated so a future heartbeat can
  // be reattached without touching the rest of the refresh path.

  g_lvgl_checkpoint = 2;
  WalkerSnapshot snap;
  walkerGetSnapshot(snap);
  g_lvgl_checkpoint = 3;

  g_lvgl_checkpoint = 4;
  // Top bar.
  lv_label_set_text(lbl_fix_pill, fixLabel(snap.fix));
  lv_obj_set_style_bg_color(lbl_fix_pill, fixColor(snap.fix), 0);

  char buf[64];
  if (snap.sats > 0) {
    snprintf(buf, sizeof(buf), LV_SYMBOL_GPS " %d", snap.sats);
    lv_label_set_text(lbl_sats, buf);
    lv_obj_clear_flag(lbl_sats, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_add_flag(lbl_sats, LV_OBJ_FLAG_HIDDEN);
  }
  if (snap.hdop > 0 && snap.hdop < 99) {
    // Append the measured GNSS rate so the field operator can confirm
    // PAIR050,200 actually took effect. "1Hz" while expecting 5 = retry
    // hasn't ACKed yet or the module refused. Once gnssRateHz settles
    // at 5 the firmware is sampling 5x per second.
    if (snap.gnssRateHz > 0) {
      snprintf(buf, sizeof(buf), "HDOP %.2f  %uHz", snap.hdop, (unsigned) snap.gnssRateHz);
    } else {
      snprintf(buf, sizeof(buf), "HDOP %.2f", snap.hdop);
    }
    lv_label_set_text(lbl_hdop, buf);
    lv_obj_clear_flag(lbl_hdop, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_add_flag(lbl_hdop, LV_OBJ_FLAG_HIDDEN);
  }

  if (snap.ntripUp) {
    lv_label_set_text(lbl_ntrip, LV_SYMBOL_UPLOAD " NTRIP " LV_SYMBOL_OK);
    lv_obj_set_style_text_color(lbl_ntrip, COL_EMERALD, 0);
  } else {
    lv_label_set_text(lbl_ntrip, LV_SYMBOL_UPLOAD " NTRIP off");
    lv_obj_set_style_text_color(lbl_ntrip, COL_DIM, 0);
  }

  if (snap.wifiUp) {
    snprintf(buf, sizeof(buf), LV_SYMBOL_WIFI " %s", snap.wifiIp.c_str());
    lv_obj_set_style_text_color(lbl_wifi, COL_EMERALD, 0);
  } else if (snap.apMode) {
    snprintf(buf, sizeof(buf), LV_SYMBOL_WIFI " AP %s", snap.wifiIp.c_str());
    lv_obj_set_style_text_color(lbl_wifi, COL_AMBER, 0);
  } else {
    snprintf(buf, sizeof(buf), LV_SYMBOL_WIFI " off");
    lv_obj_set_style_text_color(lbl_wifi, COL_DIM, 0);
  }
  lv_label_set_text(lbl_wifi, buf);

  // Battery pill - hide entirely on targets without a divider, otherwise
  // pick the matching LV_SYMBOL_BATTERY_* glyph and colour it by health.
  if (snap.batteryPresent) {
    const char* icon;
    lv_color_t col;
    int pct = snap.batteryPercent;
    if (snap.batteryCharging) {
      // Lightning bolt overrides the level glyph - instant "USB power
      // coming in" signal regardless of the cell's current state.
      icon = LV_SYMBOL_CHARGE;
      col  = COL_AMBER;
    } else if (pct >= 75) { icon = LV_SYMBOL_BATTERY_FULL;  col = COL_EMERALD; }
    else if  (pct >= 50)  { icon = LV_SYMBOL_BATTERY_3;     col = COL_EMERALD; }
    else if  (pct >= 25)  { icon = LV_SYMBOL_BATTERY_2;     col = COL_AMBER;   }
    else if  (pct >= 10)  { icon = LV_SYMBOL_BATTERY_1;     col = COL_AMBER;   }
    else                  { icon = LV_SYMBOL_BATTERY_EMPTY; col = COL_RED;     }
    snprintf(buf, sizeof(buf), "%s %d%%", icon, pct);
    lv_label_set_text(lbl_battery, buf);
    lv_obj_set_style_text_color(lbl_battery, col, 0);
    lv_obj_clear_flag(lbl_battery, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_add_flag(lbl_battery, LV_OBJ_FLAG_HIDDEN);
  }

  g_lvgl_checkpoint = 5;
  // RTK module presence — flag only after a sustained outage, not on
  // a single UART hiccup. Raw "no bytes for >5 s" is the trigger, but
  // we additionally require the gap to persist across two consecutive
  // status ticks (~2 s total) before showing the overlay, and require
  // a steady byte stream before clearing it. That kills the
  // "popup-every-4s" flicker pattern caused by short bursts of the
  // buffer being drained at exactly the wrong moment.
  static uint32_t missingSinceMs = 0;     // when the "no bytes" condition first turned true
  static uint32_t presentSinceMs = 0;     // when bytes flowed cleanly again
  static bool     overlayLatched = false; // sticky output of the debounce
  bool rawMissing = (!snap.gnssAlive && millis() > 3000) ||
                    (snap.gnssAlive && snap.msSinceGnssByte > 5000);
  uint32_t nowOverlayMs = millis();
  if (rawMissing) {
    if (missingSinceMs == 0) missingSinceMs = nowOverlayMs;
    presentSinceMs = 0;
    if (nowOverlayMs - missingSinceMs >= 2000) overlayLatched = true;
  } else {
    if (presentSinceMs == 0) presentSinceMs = nowOverlayMs;
    missingSinceMs = 0;
    if (nowOverlayMs - presentSinceMs >= 1500) overlayLatched = false;
  }
  bool missing = overlayLatched;
  // Re-arm the overlay when the module came back: a fresh disappearance
  // after a previously good detection should bring it up again, even
  // if the user dismissed an earlier one.
  if (no_gnss_was_missing && !missing) {
    no_gnss_dismissed = false;
  }
  no_gnss_was_missing = missing;

  if (no_gnss_overlay) {
    bool show = missing && !no_gnss_dismissed;
    if (show) lv_obj_clear_flag(no_gnss_overlay, LV_OBJ_FLAG_HIDDEN);
    else      lv_obj_add_flag(no_gnss_overlay,   LV_OBJ_FLAG_HIDDEN);
  }

  // Drive the record-button state machine. Recording always trumps
  // (stop button must work mid-walk even if RTK FIX drops). Otherwise:
  // no module → "Waiting for GNSS", module present but fix != 4 →
  // "Waiting for RTK fix", everything green → "Start recording".
  RecordBtnState wanted;
  if (snap.recording)         wanted = RBS_STOP;
  else if (missing)           wanted = RBS_WAITING_GNSS;
  else if (snap.fix != 4)     wanted = RBS_WAITING_RTK;
  else                        wanted = RBS_START;
  apply_record_btn_state(wanted);

  // RTK warning banner: visible whenever the live receiver isn't in
  // RTK FIX (and a recording is starting/active). Hidden once fix == 4
  // or while showing a saved track (no live capture happening). The
  // banner shares state with the amber "Start (no RTK)" button so the
  // user gets the same warning from two places.
  if (rtk_warning_banner) {
    bool wantBanner = (viewing_map_slot < 0) &&
                      snap.fix != 4 && !missing;
    if (wantBanner) lv_obj_clear_flag(rtk_warning_banner, LV_OBJ_FLAG_HIDDEN);
    else            lv_obj_add_flag(rtk_warning_banner, LV_OBJ_FLAG_HIDDEN);
  }

  // Save-as-area button: visible only after a stop produced enough
  // captured points. Hidden during recording and across viewing a saved
  // map (the saved-map list screen has its own delete flow).
  update_save_area_button(snap);
  update_map_action_buttons(snap);

  g_lvgl_checkpoint = 6;
  // WiFi-fail banner: same re-arm trick as the GNSS overlay — clear
  // the dismiss flag when the failure state goes away so the next time
  // a connect fails we draw attention to it again.
  if (wifi_fail_was_failed && !snap.wifiConnectFailed) {
    wifi_fail_dismissed = false;
  }
  wifi_fail_was_failed = snap.wifiConnectFailed;
  if (wifi_fail_overlay) {
    bool showFail = snap.wifiConnectFailed && !wifi_fail_dismissed;
    if (showFail) {
      char body[160];
      snprintf(body, sizeof(body),
               "Could not associate with \"%s\".\nReason: %s.\nFix the password in Settings.",
               snap.wifiSsid.c_str(),
               snap.wifiFailReason.length() ? snap.wifiFailReason.c_str() : "unknown");
      lv_label_set_text(lbl_wifi_fail_body, body);
      lv_obj_clear_flag(wifi_fail_overlay, LV_OBJ_FLAG_HIDDEN);
      lv_obj_move_foreground(wifi_fail_overlay);
    } else {
      lv_obj_add_flag(wifi_fail_overlay, LV_OBJ_FLAG_HIDDEN);
    }
  }

  // Record-button visuals were already applied by apply_record_btn_state
  // above; no per-tick duplication needed here.

  g_lvgl_checkpoint = 8;
  redraw_map(snap);
  g_lvgl_checkpoint = 9;
}

// ── Recording screen (focused +Chan / +Obs capture) ──────────────────────
//
// The home GPS tab (scr_main) handles all map listing and viewing now.
// This screen is dedicated to the focused capture flow that fires when
// the user hits +Chan or +Obs from a loaded map: big banner, point
// counters, RTK quality dot, Save + Cancel. The legacy MapDetail screen
// has been merged into the Maps list on scr_main.

static UiScreen s_currentScreen = UiScreen::Main;
static lv_obj_t* s_screenRecord = nullptr;

// Recording-screen widgets — mutated by refreshRecordingScreen() at 4 Hz
// via s_recTimer. All allocated once in buildRecordingScreen().
static lv_obj_t* s_recBanner     = nullptr;
static lv_obj_t* s_recPoints     = nullptr;
static lv_obj_t* s_recDropped    = nullptr;
static lv_obj_t* s_recRtkDot     = nullptr;
static lv_obj_t* s_recRtkLabel   = nullptr;
static lv_obj_t* s_recBadOverlay = nullptr;
static lv_timer_t* s_recTimer    = nullptr;

static void onSaveClicked(lv_event_t* e);
static void onCancelClicked(lv_event_t* e);
static void refreshRecordingScreen();

static void buildRecordingScreen() {
    s_screenRecord = lv_obj_create(nullptr);
    lv_obj_set_style_bg_color(s_screenRecord, lv_color_hex(0x111111), 0);
    lv_obj_clear_flag(s_screenRecord, LV_OBJ_FLAG_SCROLLABLE);

    // Banner — the big mode/parent label across the top. Text colour is
    // updated per-mode in refreshRecordingScreen(); the background stays
    // the dark screen colour so the text colour reads as the indicator.
    s_recBanner = lv_label_create(s_screenRecord);
    lv_label_set_text(s_recBanner, "(idle)");
    lv_obj_set_style_text_color(s_recBanner, lv_color_hex(0x86efac), 0);
    lv_obj_set_style_text_font(s_recBanner, &lv_font_montserrat_14, 0);
    lv_obj_align(s_recBanner, LV_ALIGN_TOP_MID, 0, 12);

    // Captured / dropped counters — left aligned, stacked.
    s_recPoints = lv_label_create(s_screenRecord);
    lv_label_set_text(s_recPoints, "Captured: 0 pts");
    lv_obj_set_style_text_color(s_recPoints, lv_color_hex(0xeeeeee), 0);
    lv_obj_set_style_text_font(s_recPoints, &lv_font_montserrat_14, 0);
    lv_obj_align(s_recPoints, LV_ALIGN_TOP_LEFT, 14, 60);

    s_recDropped = lv_label_create(s_screenRecord);
    lv_label_set_text(s_recDropped, "Dropped (low qual): 0");
    lv_obj_set_style_text_color(s_recDropped, lv_color_hex(0x9ca3af), 0);
    lv_obj_set_style_text_font(s_recDropped, &lv_font_montserrat_14, 0);
    lv_obj_align(s_recDropped, LV_ALIGN_TOP_LEFT, 14, 84);

    // RTK quality dot + label — right side. The dot is just a small
    // square-ish lv_obj with a high radius (visually a circle); colour is
    // swapped by refresh.
    s_recRtkDot = lv_obj_create(s_screenRecord);
    lv_obj_set_size(s_recRtkDot, 16, 16);
    lv_obj_set_style_radius(s_recRtkDot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(s_recRtkDot, lv_color_hex(0xdc2626), 0);
    lv_obj_set_style_border_width(s_recRtkDot, 0, 0);
    lv_obj_clear_flag(s_recRtkDot, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_align(s_recRtkDot, LV_ALIGN_TOP_RIGHT, -88, 62);

    s_recRtkLabel = lv_label_create(s_screenRecord);
    lv_label_set_text(s_recRtkLabel, "BAD");
    lv_obj_set_style_text_color(s_recRtkLabel, lv_color_hex(0xeeeeee), 0);
    lv_obj_set_style_text_font(s_recRtkLabel, &lv_font_montserrat_14, 0);
    lv_obj_align(s_recRtkLabel, LV_ALIGN_TOP_RIGHT, -14, 62);

    // Bad-signal overlay — visible only when the most recent fix was bad.
    s_recBadOverlay = lv_label_create(s_screenRecord);
    lv_label_set_text(s_recBadOverlay, "Bad RTK signal");
    lv_obj_set_style_text_color(s_recBadOverlay, lv_color_hex(0xdc2626), 0);
    lv_obj_set_style_text_font(s_recBadOverlay, &lv_font_montserrat_14, 0);
    lv_obj_align(s_recBadOverlay, LV_ALIGN_CENTER, 0, 0);
    lv_obj_add_flag(s_recBadOverlay, LV_OBJ_FLAG_HIDDEN);

    // Save / Cancel buttons across the bottom.
    lv_obj_t* btnSave = lv_btn_create(s_screenRecord);
    lv_obj_set_size(btnSave, LV_PCT(42), 50);
    lv_obj_align(btnSave, LV_ALIGN_BOTTOM_LEFT, 6, -10);
    lv_obj_set_style_bg_color(btnSave, lv_color_hex(0x16a34a), 0);
    lv_obj_set_style_radius(btnSave, 6, 0);
    lv_obj_set_style_border_width(btnSave, 0, 0);
    lv_obj_set_style_shadow_width(btnSave, 0, 0);
    lv_obj_add_event_cb(btnSave, onSaveClicked, LV_EVENT_CLICKED, nullptr);
    lv_obj_t* lblSave = lv_label_create(btnSave);
    lv_label_set_text(lblSave, "Save");
    lv_obj_set_style_text_color(lblSave, lv_color_hex(0xffffff), 0);
    lv_obj_center(lblSave);

    lv_obj_t* btnCancel = lv_btn_create(s_screenRecord);
    lv_obj_set_size(btnCancel, LV_PCT(42), 50);
    lv_obj_align(btnCancel, LV_ALIGN_BOTTOM_RIGHT, -6, -10);
    lv_obj_set_style_bg_color(btnCancel, lv_color_hex(0xdc2626), 0);
    lv_obj_set_style_radius(btnCancel, 6, 0);
    lv_obj_set_style_border_width(btnCancel, 0, 0);
    lv_obj_set_style_shadow_width(btnCancel, 0, 0);
    lv_obj_add_event_cb(btnCancel, onCancelClicked, LV_EVENT_CLICKED, nullptr);
    lv_obj_t* lblCancel = lv_label_create(btnCancel);
    lv_label_set_text(lblCancel, "Cancel");
    lv_obj_set_style_text_color(lblCancel, lv_color_hex(0xffffff), 0);
    lv_obj_center(lblCancel);

    // 250ms refresh timer — runs continuously but the callback short-
    // circuits when the recording screen isn't active. Only created once.
    if (!s_recTimer) {
        s_recTimer = lv_timer_create([](lv_timer_t*) {
            if (s_currentScreen == UiScreen::Recording) refreshRecordingScreen();
        }, 250, nullptr);
    }
}

static void refreshRecordingScreen() {
    if (!s_recBanner) return;
    const auto& st = recorder.state();
    const char* modeStr = "?";
    uint32_t color = 0x86efac;
    switch (st.mode) {
        case RecordingMode::Work:     modeStr = "BOUNDARY"; color = 0x86efac; break;
        case RecordingMode::Obstacle: modeStr = "OBSTACLE"; color = 0xfca5a5; break;
        case RecordingMode::Channel:  modeStr = "CHANNEL";  color = 0xa5b4fc; break;
        default: break;
    }
    char banner[64];
    if (st.mode == RecordingMode::Work) {
        snprintf(banner, sizeof(banner), "%s map%d", modeStr, st.parentSlot);
    } else if (st.mode == RecordingMode::Obstacle) {
        snprintf(banner, sizeof(banner), "%s in map%d", modeStr, st.parentSlot);
    } else if (st.mode == RecordingMode::Channel) {
        snprintf(banner, sizeof(banner), "%s map%d->%s",
                 modeStr, st.parentSlot, st.channelTarget.c_str());
    } else {
        snprintf(banner, sizeof(banner), "(idle)");
    }
    lv_label_set_text(s_recBanner, banner);
    lv_obj_set_style_text_color(s_recBanner, lv_color_hex(color), 0);

    char ptsTxt[64];
    snprintf(ptsTxt, sizeof(ptsTxt), "Captured: %lu pts", st.pointsCaptured);
    lv_label_set_text(s_recPoints, ptsTxt);

    char dropTxt[64];
    snprintf(dropTxt, sizeof(dropTxt), "Dropped (low qual): %lu", st.pointsDropped);
    lv_label_set_text(s_recDropped, dropTxt);

    uint32_t dotColor = 0xdc2626; const char* lbl = "BAD";
    if (st.lastFixQuality == FixQuality::Fix)   { dotColor = 0x16a34a; lbl = "FIX"; }
    if (st.lastFixQuality == FixQuality::Float) { dotColor = 0xeab308; lbl = "FLOAT"; }
    lv_obj_set_style_bg_color(s_recRtkDot, lv_color_hex(dotColor), 0);
    lv_label_set_text(s_recRtkLabel, lbl);

    if (st.lastFixQuality == FixQuality::Bad) {
        lv_obj_clear_flag(s_recBadOverlay, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(s_recBadOverlay, LV_OBJ_FLAG_HIDDEN);
    }
}

static void onSaveClicked(lv_event_t* /*e*/) {
    recorder.stop(false);  // discard=false -> keeps the file
    tft_ui_set_screen(UiScreen::Main);
    // Refresh the maps list so the new obstacle/channel count shows up
    // the next time the user opens the Maps tab. Done here rather than
    // on Maps-screen open so the count reflects the just-saved capture
    // even if the user navigates straight back to Maps via the bottom
    // bar (which calls open_maps_screen → reload_maps_list anyway, but
    // belt + suspenders is cheap).
    reload_maps_list();
}

static void onCancelClicked(lv_event_t* /*e*/) {
    recorder.stop(true);   // discard=true -> removes the file
    tft_ui_set_screen(UiScreen::Main);
    reload_maps_list();
}

void tft_ui_set_screen(UiScreen s, int /*detailSlot*/) {
    // The detailSlot parameter is a binary-compat leftover from the
    // old MapDetail screen; it's ignored now. Keeping the signature
    // means non-TFT callers in main.cpp don't have to change.
    s_currentScreen = s;
    switch (s) {
        case UiScreen::Main:
            // Main is the home GPS scr_main, not a separately-built
            // screen — load it directly and trust the periodic refresh
            // timer to keep its widgets current.
            if (scr_main) lv_scr_load(scr_main);
            break;
        case UiScreen::Recording:
            if (s_screenRecord) lv_scr_load(s_screenRecord);
            refreshRecordingScreen();
            break;
    }
}

UiScreen tft_ui_current_screen() { return s_currentScreen; }

void tft_ui_refresh_current() {
    // Main has its own 5 Hz refresh timer; only the Recording screen
    // needs an on-demand refresh hook.
    if (s_currentScreen == UiScreen::Recording) refreshRecordingScreen();
    else if (s_currentScreen == UiScreen::Main) {
        // If the maps list is built and we're back on Main, reload it
        // so any side-effects (e.g. on_save_as_area_clicked) surface.
        if (maps_list) reload_maps_list();
    }
}

#endif  // HAS_TFT_DISPLAY
