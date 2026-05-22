/*
 * tft_ui.h — LVGL UI for the JC3248W535EN target.
 *
 * Three screens reachable from the bottom tab bar:
 *   1. Status + live map (default)
 *   2. Saved tracks (read-only list — download still happens via web)
 *   3. Settings (WiFi + NTRIP, soft-keyboard text entry)
 *
 * The C++ code in main.cpp only ever calls tftSetup() once and tftTick()
 * every loop iter — everything else is internal. The UI reads live state
 * via the walker_api.h hooks.
 */
#pragma once

#include <stdint.h>

// ── Multi-file map session screens (Tasks 3/4/5) ──────────────────────
// Defined outside the HAS_TFT_DISPLAY guard so the TFT and headless
// builds share a single canonical enum and can never drift.
// UI screen identities. Main = legacy live GPS screen (now also hosts the
// Maps list inside its bottom tab bar). Recording = the focused +Channel /
// +Obstacle capture screen. The previous MapDetail screen has been folded
// into the Main GPS tab so there's only one place that lists maps.
enum class UiScreen : uint8_t {
    Main = 0,
    Recording = 1,
};

#ifdef HAS_TFT_DISPLAY


void tftSetup();   // call once, AFTER LittleFS + Preferences are up
void tftTick();    // call from main loop — pumps animations + redraws
                   // when fresh state is available. Non-blocking.

void tft_ui_set_screen(UiScreen s, int detailSlot = -1);
UiScreen tft_ui_current_screen();
// Called when underlying session data changes (e.g. recorder finished
// a map) so the main/detail screens can refresh.
void tft_ui_refresh_current();

#else

inline void tftSetup() {}
inline void tftTick() {}

inline void tft_ui_set_screen(UiScreen, int = -1) {}
inline UiScreen tft_ui_current_screen() { return UiScreen::Main; }
inline void tft_ui_refresh_current() {}

#endif
