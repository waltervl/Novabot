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

// Polygon closure UX. "Near" gives the operator an early visual cue while
// walking; "closed" is tight enough to treat the ring as complete.
#define POLYGON_CLOSE_MIN_POINTS 8
#define POLYGON_NEAR_CLOSE_M     5.0f
#define POLYGON_CLOSED_M         1.5f

enum PolygonCloseState {
  PCS_OPEN = 0,
  PCS_NEAR,
  PCS_CLOSED,
};

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
// Floating action: "Discard" — sits beside Save-as-area after a stop
// so the operator can throw away a bad walk (lost RTK, wrong shape)
// without it cluttering the Maps tab. Same visibility rules as the
// save button.
static lv_obj_t* btn_discard_track = nullptr;
static lv_obj_t* lbl_discard_track = nullptr;
static void on_discard_track_clicked(lv_event_t* e);

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
  RBS_WAITING_RTK,    // module alive but not RTK fixed/float
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
static lv_obj_t* ta_lora_addr    = nullptr;
static lv_obj_t* ta_lora_channel = nullptr;
static lv_obj_t* ta_lora_hc      = nullptr;
static lv_obj_t* ta_lora_lc      = nullptr;
static lv_obj_t* ta_lora_packet  = nullptr;
static lv_obj_t* ta_lora_air     = nullptr;
static lv_obj_t* keyboard = nullptr;
static lv_obj_t* lbl_save_status = nullptr;

// Firmware/OTA widgets — Settings → Firmware tab.
static lv_obj_t* s_otaVersionLabel = nullptr;
static lv_obj_t* s_otaStatusLabel = nullptr;
static lv_obj_t* s_otaCheckBtn = nullptr;
static lv_obj_t* s_settingsIpLabel = nullptr;

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
#define MAP_POINT_MAX 1000
static lv_point_t map_pts[MAP_POINT_MAX];

// User-controlled zoom + pan for the home-screen map. zoom == 1.0 is
// auto-fit-to-bbox; pan is a pixel offset on top of the centred fit.
// Reset whenever the visible content changes (entering viewing mode,
// starting/stopping a recording) so the user never lands on an empty
// panel because they zoomed out of view of the new data.
static float    map_user_zoom = 1.0f;
static lv_coord_t map_pan_x   = 0;
static lv_coord_t map_pan_y   = 0;
// Drag tracking: previous touch coords during an in-progress pan, plus
// a flag so the press-handler can latch its starting position without
// re-reading transient LVGL pointer state mid-gesture.
static bool       map_drag_active = false;
static lv_coord_t map_drag_prev_x = 0;
static lv_coord_t map_drag_prev_y = 0;

// Obstacles overlaid on the home-screen map when viewing a saved work
// map. See the loader / renderer further down; the constants need to
// be visible to setup_main_screen() so the line widgets get created
// in the right pass.
#define MAX_VIEW_OBSTACLES    4
#define MAX_VIEW_OBSTACLE_PTS 64
static lv_obj_t*  map_obstacle_lines[MAX_VIEW_OBSTACLES] = {nullptr};
static lv_point_t map_obstacle_pts[MAX_VIEW_OBSTACLES][MAX_VIEW_OBSTACLE_PTS + 1];
static uint16_t   map_obstacle_pts_used[MAX_VIEW_OBSTACLES] = {0};
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
static void onAreaSavedStartChannel(lv_event_t* e);
static void update_save_area_button(const WalkerSnapshot& snap);
static void update_map_action_buttons(const WalkerSnapshot& snap);
static void on_add_channel_clicked(lv_event_t* e);
static void on_add_obstacle_clicked(lv_event_t* e);
static void arm_charge_channel_for_slot(int slot);

// Map zoom + pan controls. The +/- buttons live as widgets on the
// home-screen map_panel; drag handlers are attached to the same panel
// so the user can pan with one finger. reset_map_view restores the
// auto-fit state (zoom=1, no pan) and is called whenever the visible
// content changes (entering viewing mode, starting a recording).
static void on_zoom_in_clicked(lv_event_t* e);
static void on_zoom_out_clicked(lv_event_t* e);
static void on_map_panel_pressed(lv_event_t* e);
static void on_map_panel_pressing(lv_event_t* e);
static void on_map_panel_released(lv_event_t* e);
static void reset_map_view();
static bool load_saved_map_polygon(int slot);
static void exit_viewing_mode();

// ── Public entry points ────────────────────────────────────────────────────
void tftSetup() {
  jc3248w535_handles_t handles = {};
  // 90° rotation matches the esp32-tool — landscape orientation.
  //  - task_stack 16 KB — enough for flex layouts + line redraws + tabview
  //    keyboard while leaving HTTP/WiFi heap headroom.
  //  - task_affinity 1 keeps LVGL beside Arduino's loopTask instead of
  //    competing with WiFi/lwIP on core 0.
  //  - task_priority 1 matches loopTask and the dedicated GNSS/LoRa task
  //    so UI, HTTP, and UART service share core 1 cooperatively.
  jc3248w535_config_t cfg = JC3248W535_DEFAULT_CONFIG(LV_DISP_ROT_90);
  cfg.lvgl.task_stack    = 16 * 1024;
  cfg.lvgl.task_affinity = 1;
  cfg.lvgl.task_priority = 1;
  cfg.lvgl.task_max_sleep_ms = 25;
  esp_err_t err = jc3248w535_begin(&cfg, &handles);
  if (err != ESP_OK || handles.disp == nullptr) {
    Serial.printf("[tft] init failed: %d\n", (int) err);
    return;
  }
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

  // Obstacle overlay lines — one widget per slot. Created hidden; populated
  // by redraw_map() when viewing a saved map with obstacles on disk.
  for (size_t i = 0; i < MAX_VIEW_OBSTACLES; i++) {
    map_obstacle_lines[i] = lv_line_create(map_panel);
    lv_obj_set_style_line_color(map_obstacle_lines[i], COL_RED, 0);
    lv_obj_set_style_line_width(map_obstacle_lines[i], 2, 0);
    lv_obj_set_style_line_rounded(map_obstacle_lines[i], true, 0);
    lv_obj_add_flag(map_obstacle_lines[i], LV_OBJ_FLAG_HIDDEN);
  }

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

  // Zoom controls — small +/- buttons stacked vertically along the right
  // edge of the map panel. Bottom-right corner is reserved for the pts
  // label so we stack from below the North label down a bit.
  lv_obj_t* btn_zoom_in = lv_btn_create(map_panel);
  lv_obj_set_size(btn_zoom_in, 32, 32);
  lv_obj_align(btn_zoom_in, LV_ALIGN_TOP_RIGHT, -4, 28);
  lv_obj_set_style_bg_color(btn_zoom_in, COL_CARD, 0);
  lv_obj_set_style_bg_opa(btn_zoom_in, LV_OPA_80, 0);
  lv_obj_set_style_radius(btn_zoom_in, 6, 0);
  lv_obj_set_style_border_width(btn_zoom_in, 0, 0);
  lv_obj_set_style_shadow_width(btn_zoom_in, 0, 0);
  lv_obj_add_event_cb(btn_zoom_in, on_zoom_in_clicked, LV_EVENT_CLICKED, NULL);
  lv_obj_t* lbl_zoom_in = lv_label_create(btn_zoom_in);
  lv_label_set_text(lbl_zoom_in, LV_SYMBOL_PLUS);
  lv_obj_set_style_text_color(lbl_zoom_in, COL_TEXT, 0);
  lv_obj_center(lbl_zoom_in);

  lv_obj_t* btn_zoom_out = lv_btn_create(map_panel);
  lv_obj_set_size(btn_zoom_out, 32, 32);
  lv_obj_align(btn_zoom_out, LV_ALIGN_TOP_RIGHT, -4, 64);
  lv_obj_set_style_bg_color(btn_zoom_out, COL_CARD, 0);
  lv_obj_set_style_bg_opa(btn_zoom_out, LV_OPA_80, 0);
  lv_obj_set_style_radius(btn_zoom_out, 6, 0);
  lv_obj_set_style_border_width(btn_zoom_out, 0, 0);
  lv_obj_set_style_shadow_width(btn_zoom_out, 0, 0);
  lv_obj_add_event_cb(btn_zoom_out, on_zoom_out_clicked, LV_EVENT_CLICKED, NULL);
  lv_obj_t* lbl_zoom_out = lv_label_create(btn_zoom_out);
  lv_label_set_text(lbl_zoom_out, LV_SYMBOL_MINUS);
  lv_obj_set_style_text_color(lbl_zoom_out, COL_TEXT, 0);
  lv_obj_center(lbl_zoom_out);

  // Pan handlers — attached to the map panel itself so the entire map
  // surface acts as a drag area. LVGL's PRESS / PRESSING / RELEASED
  // events give us per-frame deltas we accumulate into map_pan_x/y.
  lv_obj_add_flag(map_panel, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(map_panel, on_map_panel_pressed,  LV_EVENT_PRESSED,  NULL);
  lv_obj_add_event_cb(map_panel, on_map_panel_pressing, LV_EVENT_PRESSING, NULL);
  lv_obj_add_event_cb(map_panel, on_map_panel_released, LV_EVENT_RELEASED, NULL);
  lv_obj_add_event_cb(map_panel, on_map_panel_released, LV_EVENT_PRESS_LOST, NULL);

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
  lv_obj_set_size(btn_save_area, 150, 36);
  lv_obj_align(btn_save_area, LV_ALIGN_BOTTOM_MID, -82, -4);
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

  // Discard companion — right of Save, reuses the same visibility
  // rules (both shown only when there's a stopped track sitting in
  // the trail buffer). Red so the destructive action is obvious.
  btn_discard_track = lv_btn_create(map_panel);
  lv_obj_set_size(btn_discard_track, 140, 36);
  lv_obj_align(btn_discard_track, LV_ALIGN_BOTTOM_MID, 80, -4);
  lv_obj_set_style_bg_color(btn_discard_track, COL_RED, 0);
  lv_obj_set_style_radius(btn_discard_track, 8, 0);
  lv_obj_set_style_border_width(btn_discard_track, 0, 0);
  lv_obj_set_style_shadow_width(btn_discard_track, 0, 0);
  lv_obj_add_event_cb(btn_discard_track, on_discard_track_clicked, LV_EVENT_CLICKED, NULL);
  lbl_discard_track = lv_label_create(btn_discard_track);
  lv_label_set_text(lbl_discard_track, LV_SYMBOL_TRASH "  Discard");
  lv_obj_set_style_text_color(lbl_discard_track, lv_color_white(), 0);
  lv_obj_set_style_text_font(lbl_discard_track, &lv_font_montserrat_14, 0);
  lv_obj_center(lbl_discard_track);
  lv_obj_add_flag(btn_discard_track, LV_OBJ_FLAG_HIDDEN);

  // +Channel / +Obstacle floating buttons. Icon-only square tiles anchored
  // in the top-left corner of the map panel so they don't compete with the
  // bottom Save-as-area / Delete / Back buttons. LVGL's built-in symbol
  // set has no river or cone glyph — SHUFFLE (zigzag) is the closest match
  // for a meandering channel, WARNING (triangle with !) reads as a cone.
  // Both are hidden until update_map_action_buttons() un-hides them.
  btn_add_channel = lv_btn_create(map_panel);
  lv_obj_set_size(btn_add_channel, 44, 44);
  lv_obj_align(btn_add_channel, LV_ALIGN_TOP_LEFT, 8, 8);
  lv_obj_set_style_bg_color(btn_add_channel, lv_color_hex(0x6366f1), 0);
  lv_obj_set_style_radius(btn_add_channel, 8, 0);
  lv_obj_set_style_border_width(btn_add_channel, 0, 0);
  lv_obj_set_style_shadow_width(btn_add_channel, 0, 0);
  lv_obj_add_event_cb(btn_add_channel, on_add_channel_clicked, LV_EVENT_CLICKED, NULL);
  lbl_add_channel = lv_label_create(btn_add_channel);
  lv_label_set_text(lbl_add_channel, LV_SYMBOL_SHUFFLE);
  lv_obj_set_style_text_color(lbl_add_channel, lv_color_white(), 0);
  lv_obj_set_style_text_font(lbl_add_channel, &lv_font_montserrat_20, 0);
  lv_obj_center(lbl_add_channel);
  lv_obj_add_flag(btn_add_channel, LV_OBJ_FLAG_HIDDEN);

  btn_add_obstacle = lv_btn_create(map_panel);
  lv_obj_set_size(btn_add_obstacle, 44, 44);
  lv_obj_align(btn_add_obstacle, LV_ALIGN_TOP_LEFT, 60, 8);
  lv_obj_set_style_bg_color(btn_add_obstacle, lv_color_hex(0xb91c1c), 0);
  lv_obj_set_style_radius(btn_add_obstacle, 8, 0);
  lv_obj_set_style_border_width(btn_add_obstacle, 0, 0);
  lv_obj_set_style_shadow_width(btn_add_obstacle, 0, 0);
  lv_obj_add_event_cb(btn_add_obstacle, on_add_obstacle_clicked, LV_EVENT_CLICKED, NULL);
  lbl_add_obstacle = lv_label_create(btn_add_obstacle);
  lv_label_set_text(lbl_add_obstacle, LV_SYMBOL_WARNING);
  lv_obj_set_style_text_color(lbl_add_obstacle, lv_color_white(), 0);
  lv_obj_set_style_text_font(lbl_add_obstacle, &lv_font_montserrat_20, 0);
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
  lv_obj_t* tab_lora  = lv_tabview_add_tab(tv,                       "  LoRa");
  lv_obj_t* tab_fw    = lv_tabview_add_tab(tv, LV_SYMBOL_DOWNLOAD "  Firmware");
  lv_obj_set_style_pad_all(tab_wifi, 12, 0);
  lv_obj_set_style_pad_all(tab_ntrip, 12, 0);
  lv_obj_set_style_pad_all(tab_lora, 12, 0);
  lv_obj_set_style_pad_all(tab_fw, 12, 0);

  lv_obj_set_flex_flow(tab_wifi, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(tab_wifi, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
  make_field(tab_wifi, "SSID", &ta_wifi_ssid, false, "Home WiFi");
  make_field(tab_wifi, "Password", &ta_wifi_pass, true, "(blank = keep stored)");

  // Live IP label at the bottom of the WiFi tab. Topbar no longer
  // shows the address (just the WiFi icon coloured by link state),
  // so we surface the connection IP here for anyone who needs to
  // hit the walker's web UI from a host on the LAN.
  lv_obj_t* ipRow = lv_label_create(tab_wifi);
  lv_label_set_text(ipRow, "IP address");
  lv_obj_set_style_text_color(ipRow, COL_DIM, 0);
  lv_obj_set_style_text_font(ipRow, &lv_font_montserrat_14, 0);
  lv_obj_set_style_pad_top(ipRow, 12, 0);
  s_settingsIpLabel = lv_label_create(tab_wifi);
  lv_label_set_text(s_settingsIpLabel, "(not connected)");
  lv_obj_set_style_text_color(s_settingsIpLabel, COL_TEXT, 0);
  lv_obj_set_style_text_font(s_settingsIpLabel, &lv_font_montserrat_14, 0);

  lv_obj_set_flex_flow(tab_ntrip, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(tab_ntrip, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
  make_field(tab_ntrip, "Host",       &ta_ntrip_host,  false, "caster.centipede.fr");
  make_field(tab_ntrip, "Port",       &ta_ntrip_port,  false, "2101");
  make_field(tab_ntrip, "Mountpoint", &ta_ntrip_mount, false, "NLDB / NLAMS00FRA0");
  make_field(tab_ntrip, "User",       &ta_ntrip_user,  false, "centipede");
  make_field(tab_ntrip, "Password",   &ta_ntrip_pass,  true,  "(blank = keep stored)");

  // ── LoRa tab ────────────────────────────────────────────────────────
  lv_obj_set_flex_flow(tab_lora, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(tab_lora, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
  make_field(tab_lora, "Address (1-65535)", &ta_lora_addr,    false, "718");
  make_field(tab_lora, "Channel (0-83)",    &ta_lora_channel, false, "17");
  make_field(tab_lora, "HC (charger scan upper)", &ta_lora_hc,  false, "20");
  make_field(tab_lora, "LC (charger scan lower)", &ta_lora_lc,  false, "14");
  make_field(tab_lora, "Packet code (0=240 1=128)", &ta_lora_packet, false, "0");
  make_field(tab_lora, "Air rate code (7=62.5k)", &ta_lora_air, false, "7");

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

  // Numeric mode for the port and LoRa fields, alpha otherwise.
  if (ta == ta_ntrip_port ||
      ta == ta_lora_addr || ta == ta_lora_channel ||
      ta == ta_lora_hc   || ta == ta_lora_lc ||
      ta == ta_lora_packet || ta == ta_lora_air) {
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
  lv_obj_t* loraOrder[]  = { ta_lora_addr, ta_lora_channel, ta_lora_hc, ta_lora_lc,
                             ta_lora_packet, ta_lora_air };
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
  if (!next) {
    next = advance(loraOrder, sizeof(loraOrder) / sizeof(loraOrder[0]));
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

  char loraBuf[8];
  snprintf(loraBuf, sizeof(loraBuf), "%u", (unsigned) cfg_baseline.loraAddr);
  lv_textarea_set_text(ta_lora_addr, loraBuf);
  snprintf(loraBuf, sizeof(loraBuf), "%u", (unsigned) cfg_baseline.loraChannel);
  lv_textarea_set_text(ta_lora_channel, loraBuf);
  snprintf(loraBuf, sizeof(loraBuf), "%u", (unsigned) cfg_baseline.loraHc);
  lv_textarea_set_text(ta_lora_hc, loraBuf);
  snprintf(loraBuf, sizeof(loraBuf), "%u", (unsigned) cfg_baseline.loraLc);
  lv_textarea_set_text(ta_lora_lc, loraBuf);
  snprintf(loraBuf, sizeof(loraBuf), "%u", (unsigned) cfg_baseline.loraPacketLenCode);
  lv_textarea_set_text(ta_lora_packet, loraBuf);
  snprintf(loraBuf, sizeof(loraBuf), "%u", (unsigned) cfg_baseline.loraAirRateCode);
  lv_textarea_set_text(ta_lora_air, loraBuf);

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

  if (s_settingsIpLabel) {
    WalkerSnapshot snap;
    walkerGetSnapshot(snap);
    if (snap.wifiUp && snap.wifiIp.length() > 0) {
      lv_label_set_text(s_settingsIpLabel, snap.wifiIp.c_str());
      lv_obj_set_style_text_color(s_settingsIpLabel, COL_TEXT, 0);
    } else if (snap.apMode && snap.wifiIp.length() > 0) {
      String txt = String("AP ") + snap.wifiIp;
      lv_label_set_text(s_settingsIpLabel, txt.c_str());
      lv_obj_set_style_text_color(s_settingsIpLabel, COL_AMBER, 0);
    } else {
      lv_label_set_text(s_settingsIpLabel, "(not connected)");
      lv_obj_set_style_text_color(s_settingsIpLabel, COL_DIM, 0);
    }
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
  if (s.length() > 0 && (portVal < 1 || portVal > 65535)) {
    if (lbl_save_status) {
      lv_label_set_text(lbl_save_status, LV_SYMBOL_WARNING "  Port must be 1-65535");
      lv_obj_set_style_text_color(lbl_save_status, COL_RED, 0);
    }
    return;
  }
  if (portVal > 0 && portVal != cfg_baseline.ntripPort) {
    upd.ntripPortSet = true; upd.ntripPort = (uint16_t) portVal;
  }
  s = taText(ta_ntrip_mount);
  if (s != cfg_baseline.ntripMount) { upd.ntripMountSet = true; upd.ntripMount = s; }
  s = taText(ta_ntrip_user);
  if (s != cfg_baseline.ntripUser)  { upd.ntripUserSet = true; upd.ntripUser  = s; }
  s = taText(ta_ntrip_pass);
  if (s.length() > 0)               { upd.ntripPassSet = true; upd.ntripPass  = s; }

  s = taText(ta_lora_addr);
  uint32_t addrVal = s.toInt();
  if (addrVal > 0 && addrVal <= 65535 && (uint16_t) addrVal != cfg_baseline.loraAddr) {
    upd.loraAddrSet = true; upd.loraAddr = (uint16_t) addrVal;
  }
  s = taText(ta_lora_channel);
  int chVal = s.toInt();
  if (chVal >= 0 && chVal <= 83 && (uint8_t) chVal != cfg_baseline.loraChannel) {
    upd.loraChannelSet = true; upd.loraChannel = (uint8_t) chVal;
  }
  s = taText(ta_lora_hc);
  int hcVal = s.toInt();
  if (hcVal >= 0 && hcVal <= 83 && (uint8_t) hcVal != cfg_baseline.loraHc) {
    upd.loraHcSet = true; upd.loraHc = (uint8_t) hcVal;
  }
  s = taText(ta_lora_lc);
  int lcVal = s.toInt();
  if (lcVal >= 0 && lcVal <= 83 && (uint8_t) lcVal != cfg_baseline.loraLc) {
    upd.loraLcSet = true; upd.loraLc = (uint8_t) lcVal;
  }
  s = taText(ta_lora_packet);
  int packetVal = s.toInt();
  if (packetVal >= 0 && packetVal <= 3 && (uint8_t) packetVal != cfg_baseline.loraPacketLenCode) {
    upd.loraPacketLenCodeSet = true; upd.loraPacketLenCode = (uint8_t) packetVal;
  }
  s = taText(ta_lora_air);
  int airVal = s.toInt();
  if (airVal >= 0 && airVal <= 7 && (uint8_t) airVal != cfg_baseline.loraAirRateCode) {
    upd.loraAirRateCodeSet = true; upd.loraAirRateCode = (uint8_t) airVal;
  }

  bool willReboot = upd.wifiSsidSet || upd.wifiPassSet ||
                    upd.ntripHostSet || upd.ntripPortSet || upd.ntripMountSet ||
                    upd.ntripUserSet || upd.ntripPassSet;
  if (lbl_save_status) {
    lv_label_set_text(lbl_save_status,
      willReboot ? LV_SYMBOL_REFRESH "  Saving and rebooting..."
                 : LV_SYMBOL_OK "  Saving LoRa config...");
    lv_obj_set_style_text_color(lbl_save_status, COL_EMERALD, 0);
  }

  // walkerApplyConfig reboots on WiFi/NTRIP changes; LoRa-only saves
  // reconfigure the module in-place without rebooting.
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
  if (!walkerOtaApply(r.url, r.md5, r.sha256, r.size,
                      r.latestVersion, r.signature, r.keyId,
                      nullptr, err)) {
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

// Obstacles attached to the currently viewed map. The home-screen map
// renderer draws each loaded obstacle as a red ring on top of the work
// polygon so the operator gets immediate "yes my obstacle is saved"
// feedback without needing to open a detail screen. The lv_line widgets
// + pixel buffer live near the top of the file (so setup_main_screen()
// can create them); only the lat/lng source buffers stay here.
static WalkerLivePoint viewing_obstacle_buf[MAX_VIEW_OBSTACLES][MAX_VIEW_OBSTACLE_PTS];
static size_t          viewing_obstacle_count[MAX_VIEW_OBSTACLES] = {0};
static size_t          viewing_obstacles_loaded = 0;

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

    // Yield every 32 lines so the dedicated GNSS/LoRa task can preempt
    // long LittleFS map loads cleanly.
    if ((viewing_count & 0x1F) == 0) walkerPumpGnss();
  }
  f.close();
  return viewing_count > 0;
}

// Scan /session/ for obstacle files attached to <slot> and decode them
// into viewing_obstacle_buf. Indexed by discovery order, not by the
// original obstacleIdx in the filename — the home view only needs to
// show shapes, not preserve identity. Anything beyond MAX_VIEW_OBSTACLES
// is silently skipped (the data is intact on flash; a future detail
// screen can render the rest).
static void load_saved_map_obstacles(int slot) {
  viewing_obstacles_loaded = 0;
  for (size_t i = 0; i < MAX_VIEW_OBSTACLES; i++) viewing_obstacle_count[i] = 0;
  if (slot < 0) return;
  double oLat = 0, oLng = 0;
  if (!sessionStore.getOrigin(oLat, oLng)) return;

  String prefix = String("map") + slot + "_";
  File dir = LittleFS.open("/session");
  if (!dir || !dir.isDirectory()) {
    if (dir) dir.close();
    return;
  }
  File entry = dir.openNextFile();
  while (entry && viewing_obstacles_loaded < MAX_VIEW_OBSTACLES) {
    String name = entry.name();
    int slash = name.lastIndexOf('/');
    if (slash >= 0) name = name.substring(slash + 1);

    if (!name.startsWith(prefix) || !name.endsWith("_obstacle.csv")) {
      entry.close();
      entry = dir.openNextFile();
      continue;
    }

    String fullPath = String("/session/") + name;
    entry.close();
    File f = LittleFS.open(fullPath, FILE_READ);
    if (!f) {
      entry = dir.openNextFile();
      continue;
    }

    size_t slot_idx = viewing_obstacles_loaded;
    size_t& outCount = viewing_obstacle_count[slot_idx];
    outCount = 0;
    while (f.available() && outCount < MAX_VIEW_OBSTACLE_PTS) {
      String line = f.readStringUntil('\n');
      if (line.endsWith("\r")) line.remove(line.length() - 1);
      if (line.length() == 0) continue;
      int c1 = line.indexOf(',');
      if (c1 < 0) continue;
      double x = line.substring(0, c1).toDouble();
      double y = line.substring(c1 + 1).toDouble();
      double lat = 0, lng = 0;
      if (!sessionStore.localToGps(x, y, lat, lng)) continue;
      viewing_obstacle_buf[slot_idx][outCount].lat = lat;
      viewing_obstacle_buf[slot_idx][outCount].lng = lng;
      viewing_obstacle_buf[slot_idx][outCount].fix = 4;
      outCount++;
      if ((outCount & 0x1F) == 0) walkerPumpGnss();
    }
    f.close();
    if (outCount >= 2) viewing_obstacles_loaded++;
    entry = dir.openNextFile();
  }
  dir.close();
}

// Called by toggle_recording / on_add_*_clicked to drop out of viewing
// mode so the live polyline (or fresh sub-recording) doesn't draw on
// top of a stale polygon.
static void exit_viewing_mode() {
  viewing_map_slot = -1;
  viewing_map_alias = "";
  viewing_count = 0;
  viewing_obstacles_loaded = 0;
  for (size_t i = 0; i < MAX_VIEW_OBSTACLES; i++) {
    viewing_obstacle_count[i] = 0;
    map_obstacle_pts_used[i] = 0;
    if (map_obstacle_lines[i]) lv_obj_add_flag(map_obstacle_lines[i], LV_OBJ_FLAG_HIDDEN);
  }
  // New content on the map → drop any prior zoom/pan so the user lands
  // back at auto-fit. Otherwise switching from a zoomed-in obstacle view
  // to live-recording would leave the live trail off-screen.
  reset_map_view();
}

// LV_EVENT_DELETE fires when lv_obj_clean tears the maps list down.
// Frees the row's slot wrapper allocation so reopening Maps doesn't leak.
static void on_map_row_deleted(lv_event_t* e) {
  void* data = lv_event_get_user_data(e);
  if (data) free(data);
}

// Single tap on a map row — load the polygon, jump to home, switch
// the GPS tab into viewing mode for the chosen slot. The load itself
// is blocking (LittleFS directory scan + per-point lat/lng conversion
// of every obstacle ring) and takes long enough that the user wonders
// whether their tap landed. So we paint a Loading overlay first, force
// LVGL to flush, *then* start the work — pure UX, no async required.
static lv_obj_t* maps_loading_overlay = nullptr;
static lv_obj_t* maps_loading_label   = nullptr;

static void show_maps_loading(int slot, const String& alias) {
  if (!scr_maps) return;
  if (!maps_loading_overlay) {
    maps_loading_overlay = lv_obj_create(scr_maps);
    lv_obj_set_size(maps_loading_overlay, LV_PCT(80), 120);
    lv_obj_center(maps_loading_overlay);
    lv_obj_set_style_bg_color(maps_loading_overlay, COL_CARD, 0);
    lv_obj_set_style_bg_opa(maps_loading_overlay, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(maps_loading_overlay, COL_EMERALD, 0);
    lv_obj_set_style_border_width(maps_loading_overlay, 2, 0);
    lv_obj_set_style_radius(maps_loading_overlay, 10, 0);
    lv_obj_set_style_pad_all(maps_loading_overlay, 16, 0);
    lv_obj_clear_flag(maps_loading_overlay, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t* spinner = lv_spinner_create(maps_loading_overlay, 1000, 60);
    lv_obj_set_size(spinner, 50, 50);
    lv_obj_align(spinner, LV_ALIGN_LEFT_MID, 0, 0);
    lv_obj_set_style_arc_color(spinner, COL_DIM, LV_PART_MAIN);
    lv_obj_set_style_arc_color(spinner, COL_EMERALD, LV_PART_INDICATOR);

    maps_loading_label = lv_label_create(maps_loading_overlay);
    lv_obj_set_style_text_color(maps_loading_label, COL_TEXT, 0);
    lv_obj_set_style_text_font(maps_loading_label, &lv_font_montserrat_14, 0);
    lv_label_set_long_mode(maps_loading_label, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(maps_loading_label, LV_PCT(60));
    lv_obj_align(maps_loading_label, LV_ALIGN_RIGHT_MID, 0, 0);
  }
  if (maps_loading_label) {
    char buf[96];
    const char* aliasC = alias.length() ? alias.c_str() : "map";
    snprintf(buf, sizeof(buf), LV_SYMBOL_DIRECTORY "  Loading %s\n(slot %d)",
             aliasC, slot);
    lv_label_set_text(maps_loading_label, buf);
  }
  lv_obj_move_foreground(maps_loading_overlay);
  lv_obj_clear_flag(maps_loading_overlay, LV_OBJ_FLAG_HIDDEN);
}

static void hide_maps_loading() {
  if (maps_loading_overlay) lv_obj_add_flag(maps_loading_overlay, LV_OBJ_FLAG_HIDDEN);
}

static void on_map_row_clicked(lv_event_t* e) {
  int* slotPtr = (int*) lv_event_get_user_data(e);
  if (!slotPtr) return;
  int slot = *slotPtr;

  // Try to learn the alias before we do the heavy work so the overlay
  // text is meaningful. listMaps is cheap (single directory scan, no
  // per-point conversion) and we'd be doing it for the alias lookup
  // below anyway.
  MapEntry entries[3];
  size_t cnt = 0;
  sessionStore.listMaps(entries, 3, cnt);
  String alias = String("map") + slot;
  for (size_t i = 0; i < cnt; i++) {
    if (entries[i].slot == slot) { alias = entries[i].alias; break; }
  }

  // Paint the spinner overlay and force LVGL to flush its display
  // buffer before we begin the blocking load. Without lv_refr_now the
  // overlay would only appear after the load completes — defeating the
  // entire point.
  show_maps_loading(slot, alias);
  lv_refr_now(NULL);

  if (!load_saved_map_polygon(slot)) {
    hide_maps_loading();
    if (maps_status) {
      lv_label_set_text(maps_status,
                        LV_SYMBOL_WARNING "  Map has no origin yet - record on GPS tab first");
      lv_obj_set_style_text_color(maps_status, COL_AMBER, 0);
    }
    return;
  }
  load_saved_map_obstacles(slot);
  viewing_map_slot = slot;
  reset_map_view();
  viewing_map_alias = alias;
  hide_maps_loading();
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
    snprintf(meta, sizeof(meta), "%d pts boundary  -  obs %d  -  ch %d%s",
             entries[i].boundaryPoints,
             entries[i].obstacleCount,
             entries[i].channelCount,
             sessionStore.hasChargeChannel(entries[i].slot) ? "" : "  -  needs charger");
    lv_obj_t* lmeta = lv_label_create(row);
    lv_label_set_text(lmeta, meta);
    lv_obj_set_style_text_color(lmeta,
        sessionStore.hasChargeChannel(entries[i].slot) ? COL_DIM : COL_AMBER, 0);
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

static bool tftRtkUsable(int fix) {
  return fix == 4 || fix == 5;
}

// Reveal/hide the Save-as-area button. Called from refresh_status_cb so
// the visibility tracks live recording state and the most recent stop.
// Centralised so the toggle logic is in exactly one place.
static void update_save_area_button(const WalkerSnapshot& snap) {
  bool hasTrack = !snap.recording && walkerLastTrackPath().length() > 0;
  // Save is gated on >= MIN_POINTS so a one-tap walk doesn't end up
  // as a degenerate area. Discard is gated only on "track exists" so
  // a bad walk (no RTK FIX, wrong shape) can ALWAYS be thrown away.
  bool showSave    = hasTrack && walkerLastTrackPoints() >= SAVE_AREA_MIN_POINTS;
  bool showDiscard = hasTrack;
  if (btn_save_area) {
    if (showSave) lv_obj_clear_flag(btn_save_area, LV_OBJ_FLAG_HIDDEN);
    else          lv_obj_add_flag(btn_save_area, LV_OBJ_FLAG_HIDDEN);
  }
  if (btn_discard_track) {
    if (showDiscard) lv_obj_clear_flag(btn_discard_track, LV_OBJ_FLAG_HIDDEN);
    else             lv_obj_add_flag(btn_discard_track, LV_OBJ_FLAG_HIDDEN);
  }
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

// +Channel / +Obstacle don't start the recorder on the spot anymore. The
// old flow auto-started recording the moment the user tapped the icon,
// which meant they had to literally stand next to the start point with a
// hand on the screen — no time to walk to where they actually wanted to
// begin the capture. The new flow stashes the pending start in
// `s_pendingRec*` globals and hands off to the Recording screen in armed
// state. The user then presses "Start record" on that screen once they
// have walked to their start location, which fires the actual
// recorder.startObstacle / startChannel call.
static RecordingMode s_pendingRecMode      = RecordingMode::Idle;
static int           s_pendingRecParent    = -1;
static String        s_pendingRecChannelTo = "";

static void arm_charge_channel_for_slot(int slot) {
  s_pendingRecMode      = RecordingMode::Channel;
  s_pendingRecParent    = slot;
  s_pendingRecChannelTo = "charge";
}

static void on_add_channel_clicked(lv_event_t* /*e*/) {
  if (viewing_map_slot < 0) return;
  arm_charge_channel_for_slot(viewing_map_slot);
  tft_ui_set_screen(UiScreen::Recording);
}

static void on_add_obstacle_clicked(lv_event_t* /*e*/) {
  if (viewing_map_slot < 0) return;
  s_pendingRecMode      = RecordingMode::Obstacle;
  s_pendingRecParent    = viewing_map_slot;
  s_pendingRecChannelTo = "";
  tft_ui_set_screen(UiScreen::Recording);
}

// ── Map zoom + pan handlers ──────────────────────────────────────────────
// Min zoom < 1 so the user can pull back below auto-fit (useful when
// pan'd off-screen). Max zoom of 10x is plenty for cm-level inspection
// on a 480x320 panel — beyond that LVGL's lv_coord_t precision starts
// to bite.
#define MAP_ZOOM_MIN  0.3f
#define MAP_ZOOM_MAX  10.0f
#define MAP_ZOOM_STEP 1.5f

static void reset_map_view() {
  map_user_zoom = 1.0f;
  map_pan_x     = 0;
  map_pan_y     = 0;
  map_drag_active = false;
}

static void on_zoom_in_clicked(lv_event_t* /*e*/) {
  float z = map_user_zoom * MAP_ZOOM_STEP;
  if (z > MAP_ZOOM_MAX) z = MAP_ZOOM_MAX;
  map_user_zoom = z;
}

static void on_zoom_out_clicked(lv_event_t* /*e*/) {
  float z = map_user_zoom / MAP_ZOOM_STEP;
  if (z < MAP_ZOOM_MIN) z = MAP_ZOOM_MIN;
  map_user_zoom = z;
  // Zooming out toward fit naturally returns to centred; nudge any
  // accumulated pan back to zero once we're at or below 1x so the user
  // doesn't end up with content slid off the panel after a few taps.
  if (z <= 1.0f + 0.001f) {
    map_pan_x = 0;
    map_pan_y = 0;
  }
}

static void on_map_panel_pressed(lv_event_t* /*e*/) {
  lv_point_t p;
  lv_indev_t* indev = lv_indev_get_act();
  if (!indev) return;
  lv_indev_get_point(indev, &p);
  map_drag_prev_x = p.x;
  map_drag_prev_y = p.y;
  map_drag_active = true;
}

static void on_map_panel_pressing(lv_event_t* /*e*/) {
  if (!map_drag_active) return;
  lv_point_t p;
  lv_indev_t* indev = lv_indev_get_act();
  if (!indev) return;
  lv_indev_get_point(indev, &p);
  lv_coord_t dx = p.x - map_drag_prev_x;
  lv_coord_t dy = p.y - map_drag_prev_y;
  // Reject tiny shimmer (touch jitter) so a clean tap on zoom buttons
  // doesn't accidentally pan the map by a pixel or two.
  if (dx == 0 && dy == 0) return;
  map_pan_x += dx;
  map_pan_y += dy;
  map_drag_prev_x = p.x;
  map_drag_prev_y = p.y;
}

static void on_map_panel_released(lv_event_t* /*e*/) {
  map_drag_active = false;
}

// Read /tracks/<...>.csv row by row, convert each fix>=4 lat/lng into
// SessionStore local meters, and append to the freshly allocated slot.
// Returns the number of points written, or -1 on hard failure (file
// missing, slot allocation failed, no fixed rows). The first useable
// fix row also seeds SessionStore.setOrigin() so all subsequent
// conversions share the same anchor.
static int import_track_as_area(const String& trackPath, const String& alias, int* outSlot = nullptr) {
  int slot = sessionStore.allocWorkSlot();
  if (slot < 0) return -1;
  if (outSlot) *outSlot = slot;

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
    if (!tftRtkUsable(fix)) continue;   // only RTK fixed/float rows make it into the polygon
    if (lat == 0 || lng == 0) continue;

    if (!originSet) {
      // First good row anchors only an empty SessionStore. Existing maps
      // already share an origin and importing another area must not move it.
      double oLat = 0, oLng = 0;
      if (!sessionStore.getOrigin(oLat, oLng)) {
        sessionStore.setOrigin(lat, lng);
      }
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

  int savedSlot = -1;
  int written = import_track_as_area(path, alias, &savedSlot);

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
             "%d RTK points imported.\nNext: record charger channel.",
             written);
  } else {
    snprintf(title, sizeof(title), "Save failed");
    snprintf(body, sizeof(body),
             "No RTK FIX rows in the track.\nWalk again with FIX active.");
  }
  const char** buttons = msgbox_buttons;
  lv_event_cb_t cb = onSaveResultDismissed;
  static const char* channel_buttons[] = { "Record channel", "" };
  if (written > 0 && savedSlot >= 0) {
    buttons = channel_buttons;
    cb = onAreaSavedStartChannel;

    // Load the freshly-saved parent polygon now so the armed channel screen
    // shows the area outline while the operator walks to the charger.
    if (load_saved_map_polygon(savedSlot)) {
      load_saved_map_obstacles(savedSlot);
      viewing_map_slot = savedSlot;
      viewing_map_alias = alias;
      reset_map_view();
    }
    arm_charge_channel_for_slot(savedSlot);
  }
  lv_obj_t* mbox = lv_msgbox_create(NULL, title, body, buttons, false);
  lv_obj_add_event_cb(mbox, cb, LV_EVENT_VALUE_CHANGED, nullptr);
  lv_obj_center(mbox);

  // Best-effort refresh of the Maps screen so the new entry is visible
  // when the user navigates over there.
  tft_ui_refresh_current();
}

static void onSaveResultDismissed(lv_event_t* e) {
  lv_obj_t* mbox = lv_event_get_current_target(e);
  if (mbox) lv_msgbox_close(mbox);
}

static void onAreaSavedStartChannel(lv_event_t* e) {
  lv_obj_t* mbox = lv_event_get_current_target(e);
  if (mbox) lv_msgbox_close(mbox);
  tft_ui_set_screen(UiScreen::Recording);
}

// Discard the just-stopped track. Removes the file on flash (so it
// doesn't linger and show up in the legacy /tracks list) and clears
// the walkerLastTrack snapshot so both Save + Discard buttons
// disappear on the next refresh tick. No confirmation modal — the
// red button + Trash icon are explicit enough.
static void on_discard_track_clicked(lv_event_t* /*e*/) {
  String path = walkerLastTrackPath();
  if (path.length() > 0 && LittleFS.exists(path)) {
    LittleFS.remove(path);
  }
  walkerSetLastTrack(String(""), 0);
  // Clear the live polyline too so the trail disappears from the map
  // immediately — same effect as starting a fresh recording, just
  // without arming the recorder.
  walkerResetTrail();
  if (btn_save_area)     lv_obj_add_flag(btn_save_area, LV_OBJ_FLAG_HIDDEN);
  if (btn_discard_track) lv_obj_add_flag(btn_discard_track, LV_OBJ_FLAG_HIDDEN);
}

// ── Live map rendering ───────────────────────────────────────────────────
//
// Scratch buffer for the per-tick point copy. MAP_POINT_MAX × sizeof
// is ~13 KB, which on the LVGL task's 16 KB stack blows up the moment
// any rendering frame nests a few stack-heavy LVGL helpers — that's
// the original "stack overflow in task LVGL task" crash. Lives in
// .bss instead so the redraw is constant-stack.
static WalkerLivePoint redraw_scratch[MAP_POINT_MAX];

static double tft_haversineM(double lat1, double lng1, double lat2, double lng2) {
  const double R = 6371000.0;
  double dLat = (lat2 - lat1) * (M_PI / 180.0);
  double dLng = (lng2 - lng1) * (M_PI / 180.0);
  double a = sin(dLat / 2) * sin(dLat / 2)
           + cos(lat1 * M_PI / 180.0) * cos(lat2 * M_PI / 180.0)
           * sin(dLng / 2) * sin(dLng / 2);
  return 2 * R * asin(sqrt(a));
}

static PolygonCloseState polygon_close_state(size_t n, float closingM) {
  if (n < POLYGON_CLOSE_MIN_POINTS || closingM <= 0.0f) return PCS_OPEN;
  if (closingM <= POLYGON_CLOSED_M) return PCS_CLOSED;
  if (closingM <= POLYGON_NEAR_CLOSE_M) return PCS_NEAR;
  return PCS_OPEN;
}

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
    for (size_t i = 0; i < MAX_VIEW_OBSTACLES; i++) {
      if (map_obstacle_lines[i]) lv_obj_add_flag(map_obstacle_lines[i], LV_OBJ_FLAG_HIDDEN);
    }
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

  bool viewingSavedMap = (viewing_map_slot >= 0);
  float closingM = 0.0f;
  if (!viewingSavedMap && n >= 2) {
    closingM = (float) tft_haversineM(pts[0].lat, pts[0].lng,
                                      pts[n - 1].lat, pts[n - 1].lng);
  }
  PolygonCloseState closeState = polygon_close_state(n, closingM);
  bool visuallyClosed = viewingSavedMap ||
                        (!snap.recording && snap.areaM2 > 0.0f && n >= 3) ||
                        (snap.recording && closeState == PCS_CLOSED);

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

  // Equirectangular projection: convert lat/lng spans into METERS first
  // so X and Y share a single meters-per-pixel scale. Without the
  // cos(lat) correction on the longitude axis, polygons captured at NL
  // latitudes get squashed horizontally by ~38% (1° lng ≈ 61% of 1°
  // lat at lat 52°). Equator-only projection looks fine; anywhere
  // else the aspect ratio is wrong.
  const double LAT_M_PER_DEG = 111139.0;
  double centerLat = (minLat + maxLat) / 2;
  double centerLng = (minLng + maxLng) / 2;
  double cosLat    = cos(centerLat * M_PI / 180.0);
  double spanY_m   = latSpan * LAT_M_PER_DEG;
  double spanX_m   = lngSpan * LAT_M_PER_DEG * cosLat;
  if (spanY_m < 0.1) spanY_m = 0.1;
  if (spanX_m < 0.1) spanX_m = 0.1;

  // Auto-fit-to-bbox scale (pixels per meter), then apply the
  // user's zoom level on top. Both axes share the same scale so the
  // aspect ratio is preserved at every zoom.
  float fitYScale = (float) innerH / (float) spanY_m;
  float fitXScale = (float) innerW / (float) spanX_m;
  float fitScale  = (fitYScale < fitXScale) ? fitYScale : fitXScale;
  float scale     = fitScale * map_user_zoom;

  // Centre the auto-fit content inside the inner area, then add the
  // user's pan offset (panned coordinates persist across frames so the
  // map stays where the user dragged it to).
  float cx = pad + innerW * 0.5f + (float) map_pan_x;
  float cy = topPad + innerH * 0.5f + (float) map_pan_y;
  // Lambda capturing the projection so the parent polygon, obstacle
  // overlays and live-cursor all use the *exact* same mapping (any drift
  // between them would show as obstacles floating off the boundary).
  auto project = [&](double lat, double lng, float& outX, float& outY) {
    outX = cx + (float)((lng - centerLng) * LAT_M_PER_DEG * cosLat) * scale;
    outY = cy - (float)((lat - centerLat) * LAT_M_PER_DEG) * scale;
  };

  // Cap to MAP_POINT_MAX (storage size). If the live buffer is bigger
  // (e.g. 4000), decimate evenly so the polyline shape stays faithful.
  size_t renderCap = (visuallyClosed && MAP_POINT_MAX > 1) ? MAP_POINT_MAX - 1 : MAP_POINT_MAX;
  size_t outN = n;
  size_t step = 1;
  if (n > renderCap) {
    step = (n + renderCap - 1) / renderCap;
    outN = (n + step - 1) / step;
    if (outN > renderCap) outN = renderCap;
  }
  uint16_t wi = 0;
  for (size_t i = 0; i < n && wi < outN && wi < renderCap; i += step) {
    float fx, fy;
    project(pts[i].lat, pts[i].lng, fx, fy);
    map_pts[wi].x = (lv_coord_t) fx;
    map_pts[wi].y = (lv_coord_t) fy;
    wi++;
  }
  if (visuallyClosed && wi >= 3 && wi < MAP_POINT_MAX) {
    map_pts[wi] = map_pts[0];
    wi++;
  }
  map_pts_used = wi;
  lv_line_set_points(map_line, map_pts, map_pts_used);

  lv_color_t lineColor = COL_BLUE;
  lv_coord_t lineWidth = 3;
  if (viewingSavedMap || (!snap.recording && snap.areaM2 > 0.0f)) {
    lineColor = COL_EMERALD;
  } else if (snap.recording && closeState == PCS_CLOSED) {
    lineColor = COL_EMERALD;
    lineWidth = 4;
  } else if (snap.recording && closeState == PCS_NEAR) {
    lineColor = COL_AMBER;
    lineWidth = 4;
  }
  lv_obj_set_style_line_color(map_line, lineColor, 0);
  lv_obj_set_style_line_width(map_line, lineWidth, 0);

  // Obstacles overlay: only meaningful when we're viewing a saved map.
  // Project each loaded obstacle through the *same* lambda we used for
  // the parent polygon so the rings sit visually where they were walked.
  for (size_t obi = 0; obi < MAX_VIEW_OBSTACLES; obi++) {
    if (!map_obstacle_lines[obi]) continue;
    size_t obn = (viewing_map_slot >= 0 && obi < viewing_obstacles_loaded)
                   ? viewing_obstacle_count[obi]
                   : 0;
    if (obn < 2) {
      lv_obj_add_flag(map_obstacle_lines[obi], LV_OBJ_FLAG_HIDDEN);
      map_obstacle_pts_used[obi] = 0;
      continue;
    }
    uint16_t owi = 0;
    for (size_t i = 0; i < obn && owi < MAX_VIEW_OBSTACLE_PTS; i++) {
      float ofx, ofy;
      project(viewing_obstacle_buf[obi][i].lat,
              viewing_obstacle_buf[obi][i].lng, ofx, ofy);
      map_obstacle_pts[obi][owi].x = (lv_coord_t) ofx;
      map_obstacle_pts[obi][owi].y = (lv_coord_t) ofy;
      owi++;
    }
    // Close the ring so the renderer paints it as a polygon outline.
    if (owi >= 2 && owi <= MAX_VIEW_OBSTACLE_PTS) {
      map_obstacle_pts[obi][owi] = map_obstacle_pts[obi][0];
      owi++;
    }
    map_obstacle_pts_used[obi] = owi;
    lv_line_set_points(map_obstacle_lines[obi], map_obstacle_pts[obi], owi);
    lv_obj_clear_flag(map_obstacle_lines[obi], LV_OBJ_FLAG_HIDDEN);
  }

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
      if (closeState == PCS_CLOSED) {
        snprintf(buf, sizeof(buf),
                 LV_SYMBOL_OK " %u pts\nClosed\nTap Stop",
                 (unsigned) n);
      } else if (closeState == PCS_NEAR) {
        snprintf(buf, sizeof(buf),
                 LV_SYMBOL_WARNING " %u pts\nAlmost closed\n%.1f m to start",
                 (unsigned) n, closingM);
      } else {
        snprintf(buf, sizeof(buf),
                 LV_SYMBOL_DIRECTORY " %u pts\n%.1f m walked\n%.1f m to close",
                 (unsigned) n, snap.walkedM, closingM);
      }
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

// Sticky FIX display: real GGA streams flick FIX→FLOAT→FIX between epochs
// when corrections lag a few ms, especially right after the ambiguity
// resolves. Without hold-off the pill blinks amber every couple of
// seconds even though the RTK engine is solidly locked. Hold the FIX
// display value for FIX_HOLD_MS after the last 4-quality sample so a
// single 5-quality epoch doesn't visually demote the reading. FLOAT and
// lower are reported live (we never lie *upwards* — a real downgrade
// shows immediately once the hold window expires).
#define FIX_HOLD_MS 2000
static uint32_t s_lastFix4Ms = 0;
static int stickyFixForDisplay(int rawFix) {
  uint32_t now = lv_tick_get();
  if (rawFix == 4) {
    s_lastFix4Ms = now;
    return 4;
  }
  if (rawFix == 5 && s_lastFix4Ms != 0 && (now - s_lastFix4Ms) < FIX_HOLD_MS) {
    // Hold FIX through a transient FLOAT epoch.
    return 4;
  }
  return rawFix;
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
  int displayFix = stickyFixForDisplay(snap.fix);
  lv_label_set_text(lbl_fix_pill, fixLabel(displayFix));
  lv_obj_set_style_bg_color(lbl_fix_pill, fixColor(displayFix), 0);

  char buf[64];
  if (snap.sats > 0) {
    snprintf(buf, sizeof(buf), LV_SYMBOL_GPS " %d", snap.sats);
    lv_label_set_text(lbl_sats, buf);
    lv_obj_clear_flag(lbl_sats, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_add_flag(lbl_sats, LV_OBJ_FLAG_HIDDEN);
  }
  if (snap.hdop > 0 && snap.hdop < 99) {
    // Hz indicator dropped from the topbar — the operator can read the
    // measured rate from the GPS panel below if they need to confirm
    // PAIR050 took effect. The topbar gets the bare HDOP value only.
    snprintf(buf, sizeof(buf), "HDOP %.2f", snap.hdop);
    lv_label_set_text(lbl_hdop, buf);
    lv_obj_clear_flag(lbl_hdop, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_add_flag(lbl_hdop, LV_OBJ_FLAG_HIDDEN);
  }

  // RTK-source indicator: reflect the SELECTED correction source (the one
  // actually feeding the GNSS), not merely whichever modem is receiving.
  // Green = selected source is delivering; amber = selected but not (yet)
  // flowing; dim = off.
  if (snap.correctionUsesNtrip) {
    if (snap.ntripUp) {
      lv_label_set_text(lbl_ntrip, LV_SYMBOL_UPLOAD "  NTRIP " LV_SYMBOL_OK);
      lv_obj_set_style_text_color(lbl_ntrip, COL_EMERALD, 0);
    } else {
      lv_label_set_text(lbl_ntrip, LV_SYMBOL_UPLOAD "  NTRIP ...");
      lv_obj_set_style_text_color(lbl_ntrip, COL_AMBER, 0);
    }
  } else {
    if (snap.loraActive) {
      lv_label_set_text(lbl_ntrip, LV_SYMBOL_BARS "  LoRa " LV_SYMBOL_OK);
      lv_obj_set_style_text_color(lbl_ntrip, COL_EMERALD, 0);
    } else if (snap.loraModuleReady) {
      // LoRa selected + module up but no recent frames — amber, hint that
      // the charger may be off or out of range.
      lv_label_set_text(lbl_ntrip, LV_SYMBOL_BARS "  LoRa quiet");
      lv_obj_set_style_text_color(lbl_ntrip, COL_AMBER, 0);
    } else {
      lv_label_set_text(lbl_ntrip, LV_SYMBOL_BARS "  LoRa off");
      lv_obj_set_style_text_color(lbl_ntrip, COL_DIM, 0);
    }
  }

  // Topbar shows the WiFi icon only — colour communicates link state:
  // emerald = associated to an SSID, amber = falling back to AP mode,
  // dim = off / failed. The IP address moved to the Settings tab so
  // the topbar stays uncluttered.
  if (snap.wifiUp) {
    lv_obj_set_style_text_color(lbl_wifi, COL_EMERALD, 0);
  } else if (snap.apMode) {
    lv_obj_set_style_text_color(lbl_wifi, COL_AMBER, 0);
  } else {
    lv_obj_set_style_text_color(lbl_wifi, COL_DIM, 0);
  }
  lv_label_set_text(lbl_wifi, LV_SYMBOL_WIFI);

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
  // a single UART hiccup or a short WiFi burst. Raw "no bytes for >12 s"
  // is the trigger, and we additionally require the gap to persist before
  // showing the overlay.
  static uint32_t missingSinceMs = 0;     // when the "no bytes" condition first turned true
  static uint32_t presentSinceMs = 0;     // when bytes flowed cleanly again
  static bool     overlayLatched = false; // sticky output of the debounce
  bool rawMissing = (!snap.gnssAlive && millis() > 5000) ||
                    (snap.gnssAlive && snap.msSinceGnssByte > 12000);
  uint32_t nowOverlayMs = millis();
  if (rawMissing) {
    if (missingSinceMs == 0) missingSinceMs = nowOverlayMs;
    presentSinceMs = 0;
    if (nowOverlayMs - missingSinceMs >= 3000) overlayLatched = true;
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
  else if (!tftRtkUsable(snap.fix)) wanted = RBS_WAITING_RTK;
  else                        wanted = RBS_START;
  apply_record_btn_state(wanted);

  // RTK warning banner: visible whenever the live receiver isn't in
  // RTK FIX (and a recording is starting/active). Hidden once fix == 4
  // or while showing a saved track (no live capture happening). The
  // banner shares state with the amber "Start (no RTK)" button so the
  // user gets the same warning from two places.
  if (rtk_warning_banner) {
    bool wantBanner = (viewing_map_slot < 0) &&
                      !tftRtkUsable(snap.fix) && !missing;
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
static lv_obj_t* s_recBanner       = nullptr;
static lv_obj_t* s_recPoints       = nullptr;
static lv_obj_t* s_recClosure      = nullptr;  // distance-to-start hint while recording
static lv_obj_t* s_recRtkDot       = nullptr;
static lv_obj_t* s_recRtkLabel     = nullptr;
static lv_obj_t* s_recMapPanel     = nullptr;  // bordered card hosting the polylines + cursor
static lv_obj_t* s_recParentLine   = nullptr;  // parent map polygon (translucent backdrop)
static lv_obj_t* s_recLiveLine     = nullptr;  // obstacle/channel polyline being walked
static lv_obj_t* s_recStartDot     = nullptr;  // start vertex — turns green when closeable
static lv_obj_t* s_recCursor       = nullptr;  // current GPS position
static lv_obj_t* s_recBadOverlay   = nullptr;  // big red "Bad RTK signal" warning
static lv_obj_t* s_recBtnStart     = nullptr;  // armed-state full-width Start button
static lv_obj_t* s_recBtnSave      = nullptr;  // recording-state Save button (left)
static lv_obj_t* s_recBtnCancel    = nullptr;  // armed AND recording: Cancel/Back (right)
static lv_obj_t* s_recLblCancel    = nullptr;  // text gets toggled "Back" / "Cancel"
static lv_timer_t* s_recTimer      = nullptr;

// Armed = the screen is up but the recorder has NOT been started yet.
// Set when entering Recording from a +Chan/+Obs tap; cleared when the
// user presses Start. The whole point is letting the user walk to their
// chosen start location before any points get logged.
static bool s_recArmed = false;

// Persistent point buffers for the map renderer. lv_line keeps a pointer
// into these — they must outlive the line widget, hence file-static.
// Obstacles + channels are always small (a few dozen points; the spec
// caps live ring at ~256 in practice), so we don't need MAP_POINT_MAX
// here. 384 leaves margin for decimated parent polygons too without
// duplicating MAP_POINT_MAX's 6 KB.
#define REC_PTS_MAX 384
static lv_point_t s_recParentPts[REC_PTS_MAX];
static uint16_t   s_recParentPtsUsed = 0;
static lv_point_t s_recLivePts[REC_PTS_MAX];
static uint16_t   s_recLivePtsUsed = 0;

// Bounding-box origin captured on Start, used so the live polyline and
// the parent polygon share the same map projection. Without a fixed
// origin the auto-zoom would re-center each frame and the parent
// polygon would visually slide around as the live polyline grew.
static double s_recMinLat = 0, s_recMaxLat = 0, s_recMinLng = 0, s_recMaxLng = 0;
static bool   s_recBboxValid = false;

static void onStartRecordClicked(lv_event_t* e);
static void onSaveClicked(lv_event_t* e);
static void onCancelClicked(lv_event_t* e);
static void refreshRecordingScreen();
static void recArmUi();
static void recRecordingUi();
static void recComputeMapBbox();
static void recRebuildParentPts();
static void recRebuildLivePts(const WalkerSnapshot& snap);

static void buildRecordingScreen() {
    s_screenRecord = lv_obj_create(nullptr);
    lv_obj_set_style_bg_color(s_screenRecord, COL_BG, 0);
    lv_obj_set_style_bg_opa(s_screenRecord, LV_OPA_COVER, 0);
    lv_obj_clear_flag(s_screenRecord, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_pad_all(s_screenRecord, 0, 0);

    // ── Topbar ────────────────────────────────────────────────────────────
    // Same footprint as the home screen topbar so the map panel below gets
    // identical real estate. Banner sits left/center, pts counter + RTK pill
    // tucked into the right edge.
    lv_obj_t* top = lv_obj_create(s_screenRecord);
    lv_obj_set_size(top, SCREEN_W, TOPBAR_H);
    lv_obj_align(top, LV_ALIGN_TOP_MID, 0, 0);
    lv_obj_set_style_bg_color(top, COL_CARD_DIM, 0);
    lv_obj_set_style_bg_opa(top, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(top, 0, 0);
    lv_obj_set_style_radius(top, 0, 0);
    lv_obj_set_style_pad_all(top, 6, 0);
    lv_obj_clear_flag(top, LV_OBJ_FLAG_SCROLLABLE);

    s_recBanner = lv_label_create(top);
    lv_label_set_text(s_recBanner, "(idle)");
    lv_obj_set_style_text_color(s_recBanner, lv_color_hex(0x86efac), 0);
    lv_obj_set_style_text_font(s_recBanner, &lv_font_montserrat_20, 0);
    lv_obj_align(s_recBanner, LV_ALIGN_LEFT_MID, 8, 0);

    s_recPoints = lv_label_create(top);
    lv_label_set_text(s_recPoints, "0 pts");
    lv_obj_set_style_text_color(s_recPoints, COL_TEXT, 0);
    lv_obj_set_style_text_font(s_recPoints, &lv_font_montserrat_14, 0);
    // The fix pill takes ~95 px on the right edge ("RTK FLOAT" + 12+12
    // horizontal padding). Park the counter just to its left with 8 px
    // breathing room so the two never overlap.
    lv_obj_align(s_recPoints, LV_ALIGN_RIGHT_MID, -110, 0);

    // Same fix pill style as the home screen — colored badge with the
    // full "RTK FIX" / "RTK FLOAT" / etc. label so the two screens are
    // immediately recognisable as "this is the GPS status indicator".
    // The previous tiny dot + 14pt label was too easy to misread.
    s_recRtkLabel = lv_label_create(top);
    lv_label_set_text(s_recRtkLabel, "NO FIX");
    lv_obj_set_style_text_color(s_recRtkLabel, lv_color_hex(0x00211a), 0);
    lv_obj_set_style_text_font(s_recRtkLabel, &lv_font_montserrat_14, 0);
    lv_obj_set_style_bg_color(s_recRtkLabel, COL_DIM, 0);
    lv_obj_set_style_bg_opa(s_recRtkLabel, LV_OPA_COVER, 0);
    lv_obj_set_style_radius(s_recRtkLabel, 12, 0);
    lv_obj_set_style_pad_hor(s_recRtkLabel, 12, 0);
    lv_obj_set_style_pad_ver(s_recRtkLabel, 4, 0);
    lv_obj_align(s_recRtkLabel, LV_ALIGN_RIGHT_MID, -8, 0);
    // The old dot widget is gone; keep the variable nullptr so any
    // accidental refresh code that still references it is a no-op.
    s_recRtkDot = nullptr;

    // ── Map panel ─────────────────────────────────────────────────────────
    // EXACT same size and position as scr_main's map_panel — the user wants
    // the map to look identical to the home screen when a saved map is
    // loaded. Anything smaller is unreadable on a 480x320 display.
    s_recMapPanel = make_card(s_screenRecord,
                              SCREEN_W - 2 * MAP_PAD,
                              SCREEN_H - TOPBAR_H - BOTTOMBAR_H - 2 * MAP_PAD);
    lv_obj_align(s_recMapPanel, LV_ALIGN_TOP_LEFT, MAP_PAD, TOPBAR_H + MAP_PAD);
    lv_obj_set_style_bg_color(s_recMapPanel, COL_CARD_DIM, 0);
    lv_obj_set_style_pad_all(s_recMapPanel, 0, 0);

    // Parent map polygon — drawn first so it sits behind the live line.
    // Muted blue, thinner stroke; the user reads it as "the area I'm
    // working inside" without it competing visually with the obstacle
    // being drawn.
    s_recParentLine = lv_line_create(s_recMapPanel);
    lv_obj_set_style_line_color(s_recParentLine, lv_color_hex(0x60a5fa), 0);
    lv_obj_set_style_line_width(s_recParentLine, 2, 0);
    lv_obj_set_style_line_rounded(s_recParentLine, true, 0);
    lv_obj_set_style_line_opa(s_recParentLine, LV_OPA_50, 0);
    lv_obj_add_flag(s_recParentLine, LV_OBJ_FLAG_HIDDEN);

    // Live obstacle/channel polyline — vivid red, full opacity. Hidden
    // until the recorder has logged its first point.
    s_recLiveLine = lv_line_create(s_recMapPanel);
    lv_obj_set_style_line_color(s_recLiveLine, lv_color_hex(0xef4444), 0);
    lv_obj_set_style_line_width(s_recLiveLine, 3, 0);
    lv_obj_set_style_line_rounded(s_recLiveLine, true, 0);
    lv_obj_add_flag(s_recLiveLine, LV_OBJ_FLAG_HIDDEN);

    // Start vertex marker — appears at the first captured point. Red by
    // default; flips emerald once the cursor is within closure range.
    s_recStartDot = lv_obj_create(s_recMapPanel);
    lv_obj_set_size(s_recStartDot, 12, 12);
    lv_obj_set_style_radius(s_recStartDot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(s_recStartDot, lv_color_hex(0xef4444), 0);
    lv_obj_set_style_border_width(s_recStartDot, 2, 0);
    lv_obj_set_style_border_color(s_recStartDot, lv_color_hex(0xffffff), 0);
    lv_obj_clear_flag(s_recStartDot, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(s_recStartDot, LV_OBJ_FLAG_HIDDEN);

    // Current-position cursor — yellow/white halo, redrawn every frame.
    s_recCursor = lv_obj_create(s_recMapPanel);
    lv_obj_set_size(s_recCursor, 14, 14);
    lv_obj_set_style_radius(s_recCursor, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(s_recCursor, lv_color_hex(0xfde047), 0);
    lv_obj_set_style_border_width(s_recCursor, 2, 0);
    lv_obj_set_style_border_color(s_recCursor, lv_color_hex(0xffffff), 0);
    lv_obj_clear_flag(s_recCursor, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(s_recCursor, LV_OBJ_FLAG_HIDDEN);

    // Closure hint — overlay along the bottom edge of the map panel so it
    // sits over the map (saving vertical real estate) while still reading
    // as map-context. Background-tinted so it doesn't get lost on the
    // polylines underneath.
    s_recClosure = lv_label_create(s_recMapPanel);
    lv_label_set_text(s_recClosure, "");
    lv_obj_set_style_text_color(s_recClosure, lv_color_hex(0xcbd5f5), 0);
    lv_obj_set_style_text_font(s_recClosure, &lv_font_montserrat_14, 0);
    lv_obj_set_style_bg_color(s_recClosure, COL_BG, 0);
    lv_obj_set_style_bg_opa(s_recClosure, LV_OPA_70, 0);
    lv_obj_set_style_pad_hor(s_recClosure, 8, 0);
    lv_obj_set_style_pad_ver(s_recClosure, 3, 0);
    lv_obj_set_style_radius(s_recClosure, 4, 0);
    lv_obj_align(s_recClosure, LV_ALIGN_BOTTOM_MID, 0, -6);

    // Bad-signal overlay — sits over the map panel when the latest fix
    // is below RTK quality.
    s_recBadOverlay = lv_label_create(s_recMapPanel);
    lv_label_set_text(s_recBadOverlay, "Bad RTK signal");
    lv_obj_set_style_text_color(s_recBadOverlay, lv_color_hex(0xdc2626), 0);
    lv_obj_set_style_text_font(s_recBadOverlay, &lv_font_montserrat_20, 0);
    lv_obj_set_style_bg_color(s_recBadOverlay, COL_BG, 0);
    lv_obj_set_style_bg_opa(s_recBadOverlay, LV_OPA_70, 0);
    lv_obj_set_style_pad_all(s_recBadOverlay, 8, 0);
    lv_obj_set_style_radius(s_recBadOverlay, 6, 0);
    lv_obj_align(s_recBadOverlay, LV_ALIGN_CENTER, 0, 0);
    lv_obj_add_flag(s_recBadOverlay, LV_OBJ_FLAG_HIDDEN);

    // ── Bottom action bar ────────────────────────────────────────────────
    // Same height as the home screen bottom bar. Armed state shows the wide
    // red Start button on the left + Back on the right. Recording state
    // swaps Start for a Save button. Single bar, three widgets, visibility
    // toggled by recArmUi / recRecordingUi.
    lv_obj_t* bot = lv_obj_create(s_screenRecord);
    lv_obj_set_size(bot, SCREEN_W, BOTTOMBAR_H);
    lv_obj_align(bot, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_obj_set_style_bg_color(bot, COL_CARD_DIM, 0);
    lv_obj_set_style_bg_opa(bot, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(bot, 0, 0);
    lv_obj_set_style_radius(bot, 0, 0);
    lv_obj_set_style_pad_all(bot, 6, 0);
    lv_obj_clear_flag(bot, LV_OBJ_FLAG_SCROLLABLE);

    s_recBtnStart = lv_btn_create(bot);
    lv_obj_set_size(s_recBtnStart, LV_PCT(60), BOTTOMBAR_H - 12);
    lv_obj_align(s_recBtnStart, LV_ALIGN_LEFT_MID, 0, 0);
    lv_obj_set_style_bg_color(s_recBtnStart, lv_color_hex(0xef4444), 0);
    lv_obj_set_style_radius(s_recBtnStart, 6, 0);
    lv_obj_set_style_border_width(s_recBtnStart, 0, 0);
    lv_obj_set_style_shadow_width(s_recBtnStart, 0, 0);
    lv_obj_add_event_cb(s_recBtnStart, onStartRecordClicked, LV_EVENT_CLICKED, nullptr);
    lv_obj_t* lblStart = lv_label_create(s_recBtnStart);
    lv_label_set_text(lblStart, LV_SYMBOL_PLAY "  Start record");
    lv_obj_set_style_text_color(lblStart, lv_color_hex(0xffffff), 0);
    lv_obj_set_style_text_font(lblStart, &lv_font_montserrat_20, 0);
    lv_obj_center(lblStart);

    s_recBtnSave = lv_btn_create(bot);
    lv_obj_set_size(s_recBtnSave, LV_PCT(60), BOTTOMBAR_H - 12);
    lv_obj_align(s_recBtnSave, LV_ALIGN_LEFT_MID, 0, 0);
    lv_obj_set_style_bg_color(s_recBtnSave, lv_color_hex(0x16a34a), 0);
    lv_obj_set_style_radius(s_recBtnSave, 6, 0);
    lv_obj_set_style_border_width(s_recBtnSave, 0, 0);
    lv_obj_set_style_shadow_width(s_recBtnSave, 0, 0);
    lv_obj_add_event_cb(s_recBtnSave, onSaveClicked, LV_EVENT_CLICKED, nullptr);
    lv_obj_t* lblSave = lv_label_create(s_recBtnSave);
    lv_label_set_text(lblSave, LV_SYMBOL_SAVE "  Save");
    lv_obj_set_style_text_color(lblSave, lv_color_hex(0xffffff), 0);
    lv_obj_set_style_text_font(lblSave, &lv_font_montserrat_20, 0);
    lv_obj_center(lblSave);

    s_recBtnCancel = lv_btn_create(bot);
    lv_obj_set_size(s_recBtnCancel, LV_PCT(36), BOTTOMBAR_H - 12);
    lv_obj_align(s_recBtnCancel, LV_ALIGN_RIGHT_MID, 0, 0);
    lv_obj_set_style_bg_color(s_recBtnCancel, lv_color_hex(0x4b5563), 0);
    lv_obj_set_style_radius(s_recBtnCancel, 6, 0);
    lv_obj_set_style_border_width(s_recBtnCancel, 0, 0);
    lv_obj_set_style_shadow_width(s_recBtnCancel, 0, 0);
    lv_obj_add_event_cb(s_recBtnCancel, onCancelClicked, LV_EVENT_CLICKED, nullptr);
    s_recLblCancel = lv_label_create(s_recBtnCancel);
    lv_label_set_text(s_recLblCancel, "Back");
    lv_obj_set_style_text_color(s_recLblCancel, lv_color_hex(0xffffff), 0);
    lv_obj_set_style_text_font(s_recLblCancel, &lv_font_montserrat_20, 0);
    lv_obj_center(s_recLblCancel);

    // 250ms refresh timer — runs continuously but the callback short-
    // circuits when the recording screen isn't active. Only created once.
    if (!s_recTimer) {
        s_recTimer = lv_timer_create([](lv_timer_t*) {
            if (s_currentScreen == UiScreen::Recording) refreshRecordingScreen();
        }, 250, nullptr);
    }
}

// Armed → user has navigated to Recording but hasn't pressed Start. Big
// red Start button gets the spotlight. Cancel button becomes "Back" so
// the user knows tapping it just navigates home, no recording was
// pending to lose.
static void recArmUi() {
    if (s_recBtnStart) lv_obj_clear_flag(s_recBtnStart, LV_OBJ_FLAG_HIDDEN);
    if (s_recBtnSave)  lv_obj_add_flag(s_recBtnSave, LV_OBJ_FLAG_HIDDEN);
    if (s_recLblCancel) lv_label_set_text(s_recLblCancel, "Back");
    if (s_recPoints)   lv_label_set_text(s_recPoints, "Ready");
    if (s_recClosure) {
        if (s_pendingRecMode == RecordingMode::Channel && s_pendingRecChannelTo == "charge") {
            lv_label_set_text(s_recClosure, "Walk to the charger, tap Start, then walk into the map.");
        } else {
            lv_label_set_text(s_recClosure, "Walk to your start position, then tap Start.");
        }
    }
    if (s_recLiveLine) lv_obj_add_flag(s_recLiveLine, LV_OBJ_FLAG_HIDDEN);
    if (s_recStartDot) lv_obj_add_flag(s_recStartDot, LV_OBJ_FLAG_HIDDEN);
    s_recLivePtsUsed = 0;
}

// Recording → recorder is running, points are accumulating. Hide Start,
// show Save + Cancel.
static void recRecordingUi() {
    if (s_recBtnStart) lv_obj_add_flag(s_recBtnStart, LV_OBJ_FLAG_HIDDEN);
    if (s_recBtnSave)  lv_obj_clear_flag(s_recBtnSave, LV_OBJ_FLAG_HIDDEN);
    if (s_recLblCancel) lv_label_set_text(s_recLblCancel, "Cancel");
    if (s_recClosure)  lv_label_set_text(s_recClosure, "");
}

// Compute the bbox once on Start record. Uses the parent map polygon
// (loaded into viewing_buffer when the user opened the parent's detail)
// so the projection stays stable regardless of where the cursor wanders.
// If the parent has no polygon yet (e.g. armed inside an empty slot)
// we'll lazily expand the bbox in recRebuildLivePts from the live walk.
static void recComputeMapBbox() {
    s_recBboxValid = false;
    if (viewing_count > 0) {
        s_recMinLat = s_recMaxLat = viewing_buffer[0].lat;
        s_recMinLng = s_recMaxLng = viewing_buffer[0].lng;
        for (size_t i = 1; i < viewing_count; i++) {
            if (viewing_buffer[i].lat < s_recMinLat) s_recMinLat = viewing_buffer[i].lat;
            if (viewing_buffer[i].lat > s_recMaxLat) s_recMaxLat = viewing_buffer[i].lat;
            if (viewing_buffer[i].lng < s_recMinLng) s_recMinLng = viewing_buffer[i].lng;
            if (viewing_buffer[i].lng > s_recMaxLng) s_recMaxLng = viewing_buffer[i].lng;
        }
        s_recBboxValid = true;
    }
}

// Equal-aspect projector: lat/lng → pixel inside s_recMapPanel.
static void rec_project(double lat, double lng, float& outX, float& outY) {
    lv_coord_t w = lv_obj_get_width(s_recMapPanel);
    lv_coord_t h = lv_obj_get_height(s_recMapPanel);
    const lv_coord_t pad = 10;
    lv_coord_t innerW = w - 2 * pad;
    lv_coord_t innerH = h - 2 * pad;
    if (innerW < 20) innerW = 20;
    if (innerH < 20) innerH = 20;

    double latSpan = s_recMaxLat - s_recMinLat;
    double lngSpan = s_recMaxLng - s_recMinLng;
    if (latSpan < 0.00005) { double c = (s_recMinLat + s_recMaxLat) / 2; s_recMinLat = c - 0.000025; s_recMaxLat = c + 0.000025; latSpan = s_recMaxLat - s_recMinLat; }
    if (lngSpan < 0.00005) { double c = (s_recMinLng + s_recMaxLng) / 2; s_recMinLng = c - 0.000025; s_recMaxLng = c + 0.000025; lngSpan = s_recMaxLng - s_recMinLng; }

    // Equirectangular meters projection — same cos(lat) correction used
    // on the home screen so the two screens are bit-identical on aspect.
    const double LAT_M_PER_DEG = 111139.0;
    double centerLat = (s_recMinLat + s_recMaxLat) / 2;
    double centerLng = (s_recMinLng + s_recMaxLng) / 2;
    double cosLat    = cos(centerLat * M_PI / 180.0);
    double spanY_m   = latSpan * LAT_M_PER_DEG;
    double spanX_m   = lngSpan * LAT_M_PER_DEG * cosLat;
    if (spanY_m < 0.1) spanY_m = 0.1;
    if (spanX_m < 0.1) spanX_m = 0.1;

    float fitYScale = (float) innerH / (float) spanY_m;
    float fitXScale = (float) innerW / (float) spanX_m;
    float scale     = (fitYScale < fitXScale) ? fitYScale : fitXScale;
    float cx = pad + innerW * 0.5f;
    float cy = pad + innerH * 0.5f;

    outX = cx + (float)((lng - centerLng) * LAT_M_PER_DEG * cosLat) * scale;
    outY = cy - (float)((lat - centerLat) * LAT_M_PER_DEG)          * scale;
}

static void recRebuildParentPts() {
    if (!s_recBboxValid || viewing_count < 2) {
        if (s_recParentLine) lv_obj_add_flag(s_recParentLine, LV_OBJ_FLAG_HIDDEN);
        s_recParentPtsUsed = 0;
        return;
    }
    size_t step = 1;
    size_t outN = viewing_count;
    // Reserve one slot for the visual close-the-polygon repeat below.
    const size_t kCap = REC_PTS_MAX - 1;
    if (viewing_count > kCap) {
        step = (viewing_count + kCap - 1) / kCap;
        outN = (viewing_count + step - 1) / step;
        if (outN > kCap) outN = kCap;
    }
    uint16_t wi = 0;
    for (size_t i = 0; i < viewing_count && wi < outN && wi < kCap; i += step) {
        float fx, fy;
        rec_project(viewing_buffer[i].lat, viewing_buffer[i].lng, fx, fy);
        s_recParentPts[wi].x = (lv_coord_t) fx;
        s_recParentPts[wi].y = (lv_coord_t) fy;
        wi++;
    }
    // Close the polygon visually by repeating the first point at the end.
    if (wi > 0 && wi < REC_PTS_MAX) {
        s_recParentPts[wi] = s_recParentPts[0];
        wi++;
    }
    s_recParentPtsUsed = wi;
    lv_line_set_points(s_recParentLine, s_recParentPts, s_recParentPtsUsed);
    lv_obj_clear_flag(s_recParentLine, LV_OBJ_FLAG_HIDDEN);
}

static double rec_haversineM(double lat1, double lng1, double lat2, double lng2) {
    return tft_haversineM(lat1, lng1, lat2, lng2);
}

static void recRebuildLivePts(const WalkerSnapshot& snap) {
    // Share the main screen's redraw_scratch — the two screens are never
    // active at the same time, so they can both reuse the same 25 KB bss
    // buffer instead of duplicating it.
    size_t n = walkerCopyLivePoints(redraw_scratch, MAP_POINT_MAX);

    if (n == 0) {
        if (s_recLiveLine) lv_obj_add_flag(s_recLiveLine, LV_OBJ_FLAG_HIDDEN);
        if (s_recStartDot) lv_obj_add_flag(s_recStartDot, LV_OBJ_FLAG_HIDDEN);
        // While recording with no points yet but we DO have a current
        // fix, still place the cursor where the user is standing — gives
        // immediate "yes the GPS is alive" feedback.
        if (tftRtkUsable(snap.fix) && s_recBboxValid && s_recCursor) {
            float fx, fy;
            rec_project(snap.lat, snap.lng, fx, fy);
            lv_obj_set_pos(s_recCursor, (lv_coord_t)(fx - 7), (lv_coord_t)(fy - 7));
            lv_obj_clear_flag(s_recCursor, LV_OBJ_FLAG_HIDDEN);
        } else if (s_recCursor) {
            lv_obj_add_flag(s_recCursor, LV_OBJ_FLAG_HIDDEN);
        }
        s_recLivePtsUsed = 0;
        return;
    }

    // If the parent polygon never gave us a bbox (rare: recording into
    // a slot with no boundary yet), seed from the first live point so
    // the projection works on the first frame instead of blank.
    if (!s_recBboxValid) {
        s_recMinLat = s_recMaxLat = redraw_scratch[0].lat;
        s_recMinLng = s_recMaxLng = redraw_scratch[0].lng;
        s_recBboxValid = true;
    }

    // Expand bbox as the walk drifts past the parent extent. Without
    // this the cursor would slide off the panel edge if the obstacle
    // sits near a parent corner. Re-project parent line whenever the
    // bbox grows so the backdrop stays aligned.
    bool grew = false;
    for (size_t i = 0; i < n; i++) {
        if (redraw_scratch[i].lat < s_recMinLat) { s_recMinLat = redraw_scratch[i].lat; grew = true; }
        if (redraw_scratch[i].lat > s_recMaxLat) { s_recMaxLat = redraw_scratch[i].lat; grew = true; }
        if (redraw_scratch[i].lng < s_recMinLng) { s_recMinLng = redraw_scratch[i].lng; grew = true; }
        if (redraw_scratch[i].lng > s_recMaxLng) { s_recMaxLng = redraw_scratch[i].lng; grew = true; }
    }
    if (grew) recRebuildParentPts();

    RecordingState activeRecState = recorder.state();
    RecordingMode activeMode = s_recArmed ? s_pendingRecMode : activeRecState.mode;
    String activeChannelTarget = s_recArmed ? s_pendingRecChannelTo : activeRecState.channelTarget;
    bool polygonMode = (activeMode == RecordingMode::Work ||
                        activeMode == RecordingMode::Obstacle);
    float closingM = 0.0f;
    PolygonCloseState closeState = PCS_OPEN;
    if (polygonMode && n >= 2) {
        closingM = (float) rec_haversineM(
            redraw_scratch[0].lat, redraw_scratch[0].lng,
            redraw_scratch[n - 1].lat, redraw_scratch[n - 1].lng);
        closeState = polygon_close_state(n, closingM);
    }
    bool visuallyClosed = polygonMode && closeState == PCS_CLOSED;

    // Render the live polyline. Decimate to REC_PTS_MAX because the live
    // ring (walkerCopyLivePoints up to MAP_POINT_MAX) can be much wider
    // than what the small map line widget needs.
    size_t step = 1;
    size_t renderCap = (visuallyClosed && REC_PTS_MAX > 1) ? REC_PTS_MAX - 1 : REC_PTS_MAX;
    size_t outN = n;
    if (n > renderCap) {
        step = (n + renderCap - 1) / renderCap;
        outN = (n + step - 1) / step;
        if (outN > renderCap) outN = renderCap;
    }
    uint16_t wi = 0;
    for (size_t i = 0; i < n && wi < outN && wi < renderCap; i += step) {
        float fx, fy;
        rec_project(redraw_scratch[i].lat, redraw_scratch[i].lng, fx, fy);
        s_recLivePts[wi].x = (lv_coord_t) fx;
        s_recLivePts[wi].y = (lv_coord_t) fy;
        wi++;
    }
    if (visuallyClosed && wi >= 3 && wi < REC_PTS_MAX) {
        s_recLivePts[wi] = s_recLivePts[0];
        wi++;
    }
    s_recLivePtsUsed = wi;
    if (s_recLivePtsUsed >= 2) {
        lv_color_t lineColor = COL_BLUE;
        lv_coord_t lineWidth = 3;
        if (polygonMode) {
            if (closeState == PCS_CLOSED) {
                lineColor = COL_EMERALD;
                lineWidth = 4;
            } else if (closeState == PCS_NEAR) {
                lineColor = COL_AMBER;
                lineWidth = 4;
            } else {
                lineColor = COL_RED;
            }
        }
        lv_obj_set_style_line_color(s_recLiveLine, lineColor, 0);
        lv_obj_set_style_line_width(s_recLiveLine, lineWidth, 0);
        lv_line_set_points(s_recLiveLine, s_recLivePts, s_recLivePtsUsed);
        lv_obj_clear_flag(s_recLiveLine, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(s_recLiveLine, LV_OBJ_FLAG_HIDDEN);
    }

    // Start vertex.
    {
        float fx, fy;
        rec_project(redraw_scratch[0].lat, redraw_scratch[0].lng, fx, fy);
        lv_obj_set_pos(s_recStartDot, (lv_coord_t)(fx - 6), (lv_coord_t)(fy - 6));
        lv_obj_clear_flag(s_recStartDot, LV_OBJ_FLAG_HIDDEN);
    }

    // Cursor — last point.
    {
        float fx, fy;
        rec_project(redraw_scratch[n - 1].lat, redraw_scratch[n - 1].lng, fx, fy);
        lv_obj_set_pos(s_recCursor, (lv_coord_t)(fx - 7), (lv_coord_t)(fy - 7));
        lv_obj_clear_flag(s_recCursor, LV_OBJ_FLAG_HIDDEN);
    }

    // Closure detection is only meaningful for polygon recordings
    // (work/obstacle). Channel recordings are routes, not rings.
    if (!polygonMode) {
        lv_obj_set_style_bg_color(s_recStartDot, COL_BLUE, 0);
        if (activeMode == RecordingMode::Channel && activeChannelTarget == "charge") {
            lv_label_set_text(s_recClosure, "Walk from the charger into the map, then tap Save.");
        } else {
            lv_label_set_text(s_recClosure, "Walk the channel route, then tap Save.");
        }
        lv_obj_set_style_text_color(s_recClosure, lv_color_hex(0xcbd5f5), 0);
    } else if (n >= POLYGON_CLOSE_MIN_POINTS) {
        char buf[64];
        if (closeState == PCS_CLOSED) {
            lv_obj_set_style_bg_color(s_recStartDot, COL_EMERALD, 0);
            snprintf(buf, sizeof(buf),
                     LV_SYMBOL_OK "  Polygon closed (%.1f m). Tap Save.", closingM);
            lv_obj_set_style_text_color(s_recClosure, lv_color_hex(0x86efac), 0);
        } else if (closeState == PCS_NEAR) {
            lv_obj_set_style_bg_color(s_recStartDot, COL_AMBER, 0);
            snprintf(buf, sizeof(buf),
                     LV_SYMBOL_WARNING "  Almost closed: %.1f m to start.", closingM);
            lv_obj_set_style_text_color(s_recClosure, COL_AMBER, 0);
        } else {
            lv_obj_set_style_bg_color(s_recStartDot, COL_RED, 0);
            snprintf(buf, sizeof(buf), "Closure: %.1f m", closingM);
            lv_obj_set_style_text_color(s_recClosure, lv_color_hex(0xcbd5f5), 0);
        }
        lv_label_set_text(s_recClosure, buf);
    } else {
        lv_obj_set_style_bg_color(s_recStartDot, COL_RED, 0);
        lv_label_set_text(s_recClosure, "Walk the perimeter, return to start to close.");
        lv_obj_set_style_text_color(s_recClosure, lv_color_hex(0xcbd5f5), 0);
    }
}

static void refreshRecordingScreen() {
    if (!s_recBanner) return;
    WalkerSnapshot snap;
    walkerGetSnapshot(snap);

    // Banner: while armed we show the pending mode + parent. Once the
    // recorder is running we mirror the recorder's own state in case
    // the slot allocation tweaked anything (obstacle index, etc.).
    RecordingState recState = recorder.state();
    RecordingMode bannerMode = s_recArmed ? s_pendingRecMode : recState.mode;
    int parentSlot = s_recArmed ? s_pendingRecParent : recState.parentSlot;
    String chTarget = s_recArmed ? s_pendingRecChannelTo : recState.channelTarget;

    const char* modeStr = "?";
    uint32_t color = 0x86efac;
    switch (bannerMode) {
        case RecordingMode::Work:     modeStr = "BOUNDARY"; color = 0x86efac; break;
        case RecordingMode::Obstacle: modeStr = "OBSTACLE"; color = 0xfca5a5; break;
        case RecordingMode::Channel:  modeStr = "CHANNEL";  color = 0xa5b4fc; break;
        default: break;
    }
    char banner[80];
    if (bannerMode == RecordingMode::Work) {
        snprintf(banner, sizeof(banner), "%s map%d", modeStr, parentSlot);
    } else if (bannerMode == RecordingMode::Obstacle) {
        snprintf(banner, sizeof(banner), "%s in map%d", modeStr, parentSlot);
    } else if (bannerMode == RecordingMode::Channel) {
        snprintf(banner, sizeof(banner), "%s map%d -> %s",
                 modeStr, parentSlot, chTarget.c_str());
    } else {
        snprintf(banner, sizeof(banner), "(idle)");
    }
    lv_label_set_text(s_recBanner, banner);
    lv_obj_set_style_text_color(s_recBanner, lv_color_hex(color), 0);

    // RTK pill — same helpers as the home screen so the two displays are
    // bit-identical for any given fix value. stickyFixForDisplay holds
    // FIX across single-epoch FLOAT blips so the pill doesn't visually
    // demote when the RTK engine is still solidly locked.
    int displayFix = stickyFixForDisplay(snap.fix);
    if (s_recRtkLabel) {
        lv_label_set_text(s_recRtkLabel, fixLabel(displayFix));
        lv_obj_set_style_bg_color(s_recRtkLabel, fixColor(displayFix), 0);
    }

    // Bad-signal overlay only while recording — during armed state the
    // user is just walking to the start, no need to scream BAD at them.
    if (!s_recArmed && !tftRtkUsable(snap.fix)) {
        lv_obj_clear_flag(s_recBadOverlay, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(s_recBadOverlay, LV_OBJ_FLAG_HIDDEN);
    }

    // Live counters + map render are only meaningful when recording.
    if (s_recArmed) {
        // Keep cursor visible during arm so the user can see where they
        // are relative to the parent polygon as they walk to the start.
        recRebuildLivePts(snap);
        return;
    }
    RecordingState st = recorder.state();
    char ptsTxt[48];
    if (snap.walkedM > 0.1f) {
        snprintf(ptsTxt, sizeof(ptsTxt), "%lu pts  %.1f m",
                 st.pointsCaptured, snap.walkedM);
    } else {
        snprintf(ptsTxt, sizeof(ptsTxt), "%lu pts", st.pointsCaptured);
    }
    lv_label_set_text(s_recPoints, ptsTxt);

    recRebuildLivePts(snap);
}

static void onStartRecordClicked(lv_event_t* /*e*/) {
    if (!s_recArmed) return;
    if (s_pendingRecParent < 0) return;

    // Clear the live-points ring so the polyline starts at the user's
    // current position. Without this the buffer would still contain
    // wherever the home-screen walk last drifted.
    walkerResetTrail();
    s_recLivePtsUsed = 0;

    bool ok = false;
    switch (s_pendingRecMode) {
        case RecordingMode::Obstacle:
            ok = recorder.startObstacle(s_pendingRecParent);
            break;
        case RecordingMode::Channel:
            ok = recorder.startChannel(s_pendingRecParent, s_pendingRecChannelTo);
            break;
        default:
            ok = false; break;
    }
    if (!ok) {
        // Slot allocation or origin failure — leave the screen armed so
        // the user can hit Back. Closure label communicates the failure.
        if (s_recClosure) {
            lv_label_set_text(s_recClosure, "Could not start recording (slot full?).");
            lv_obj_set_style_text_color(s_recClosure, lv_color_hex(0xef4444), 0);
        }
        return;
    }
    s_recArmed = false;
    recRecordingUi();
}

static void onSaveClicked(lv_event_t* /*e*/) {
    recorder.stop(false);  // discard=false -> keeps the file
    s_recArmed = false;
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
    // In armed state Cancel is just "Back" — no recording to discard.
    if (!s_recArmed) {
        recorder.stop(true);   // discard=true -> removes the file
    }
    s_recArmed = false;
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
            // Each time we re-enter the screen, re-arm and re-project
            // the parent polygon. Recomputing the bbox here (rather than
            // on Start) means the user already sees the parent outline
            // + their current position while walking to the start
            // location — that's the whole point of the armed state.
            s_recArmed = (s_pendingRecMode != RecordingMode::Idle);
            recComputeMapBbox();
            recRebuildParentPts();
            if (s_recArmed) recArmUi();
            else            recRecordingUi();
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

// ── Web-UI driven viewing-mode hooks ────────────────────────────────────
// Mirror what on_map_row_clicked does but skip the LVGL bits the HTTP
// caller doesn't need (no spinner overlay, no screen navigation). The
// HTTP layer wants two things: "load this map into viewing_buffer so
// the next /api/maps poll reports the correct slot + I get the polygon
// data back" and "the next time the user looks at the device, the TFT
// is already on that map". Both are achieved by setting viewing_map_
// slot + the related buffers; the periodic refresh timer picks it up
// on the next 200 ms tick.
bool tft_ui_view_map_slot(int slot) {
    if (slot < 0) return false;
    if (!load_saved_map_polygon(slot)) return false;
    load_saved_map_obstacles(slot);
    viewing_map_slot = slot;
    reset_map_view();
    // Resolve the alias from the maps list so the home-screen pts label
    // shows "Viewing: Garden" rather than "map0".
    MapEntry entries[3];
    size_t cnt = 0;
    sessionStore.listMaps(entries, 3, cnt);
    viewing_map_alias = String("map") + slot;
    for (size_t i = 0; i < cnt; i++) {
        if (entries[i].slot == slot) { viewing_map_alias = entries[i].alias; break; }
    }
    // If the device is parked on the Recording screen the HTTP caller
    // probably still expects the home screen to come up — flip there
    // so the user sees the map immediately when they glance over.
    if (s_currentScreen != UiScreen::Main) tft_ui_set_screen(UiScreen::Main);
    return true;
}

void tft_ui_exit_view_map() {
    exit_viewing_mode();
}

int tft_ui_current_view_slot() {
    return viewing_map_slot;
}

#endif  // HAS_TFT_DISPLAY
