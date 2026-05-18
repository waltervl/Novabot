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

#ifdef HAS_TFT_DISPLAY

void tftSetup();   // call once, AFTER LittleFS + Preferences are up
void tftTick();    // call from main loop — pumps animations + redraws
                   // when fresh state is available. Non-blocking.

#else

inline void tftSetup() {}
inline void tftTick() {}

#endif
