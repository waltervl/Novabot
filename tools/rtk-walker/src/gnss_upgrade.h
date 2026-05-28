// gnss_upgrade.h — one-shot Quectel LC29HDA firmware upgrade over UART.
//
// Implements the full Download-Mode protocol described in Quectel's
// "L89 R2.0 & LC29H & LC79H Series Firmware Upgrade Guide" V1.8 (chapter 2.2
// + section 3.1 example): handshake -> WDT off -> DA upload -> jump to DA ->
// sync -> format flash -> 4× FW upload. The host (this walker) drives the
// LC29HDA's GNSS UART at 115200 bps with no GPIO reset line — so the walker
// must be power-cycled into upgrade mode, and the 0xA0 handshake primer must
// fire within ~150 ms of LC29HDA boot. runGnssUpgrade() is therefore called
// VERY early in setup(), before any other init, so the prime catches the
// module's Download-Mode window.
//
// Firmware files must be uploaded to LittleFS at /fw_lc29h/{da,partition_table,
// bootloader,main,config}.bin BEFORE arming the upgrade (POST /api/gnss/fw/...).
// Returns true on success; on failure the walker stays in an idle loop so the
// operator can read the USB-CDC log and power-cycle to retry.
#pragma once

#include <Arduino.h>
#include <HardwareSerial.h>

// Two-phase API. The LC29HDA's Download-Mode boot window is only ~150 ms wide,
// so the caller MUST run runGnssUpgradeHandshake() BEFORE doing slow init
// (LittleFS.begin, prefs.getString, etc.), then run runGnssUpgradeBody() with
// the WiFi credentials once the slow stuff is set up. Returns the same true/
// false success status as the body function.
//
// Phase 1: fire 0xA0 burst immediately. Touches ONLY the GNSS UART.
bool runGnssUpgradeHandshake(HardwareSerial& gnss);
// Phase 2: bring WiFi up + verify files + run the rest of the upgrade.
// Skips straight to "handshake failed" reporting if phase 1 didn't see 0x5F.
// Empty ssid/pass disables the live HTTP endpoint (USB-CDC only).
bool runGnssUpgradeBody(const String& ssid, const String& pass);

// Convenience wrapper that does both phases back-to-back. Callers that have
// nothing to do between handshake and body can use this.
bool runGnssUpgrade(HardwareSerial& gnss, const String& ssid, const String& pass);

// Pump the live-progress HTTP server. main.cpp calls this in its idle loop
// after runGnssUpgrade returns so the operator can keep polling the final
// status from the browser before power-cycling.
void gnssUpgradeServeTick();
