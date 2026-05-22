/*
 * walker_api.h — the only surface the TFT UI uses to talk to the GNSS/
 * NTRIP/recording core in main.cpp. Keeps the two layers decoupled so
 * either can be edited in isolation. main.cpp implements these; the
 * LVGL screens call them from inside the lvgl_lock() critical section.
 */
#pragma once

#include <Arduino.h>

struct WalkerSnapshot {
  double   lat;
  double   lng;
  double   alt;
  int      fix;            // 0 none, 1 GPS, 2 DGPS, 4 RTK FIX, 5 RTK FLOAT
  int      sats;
  double   hdop;
  bool     recording;
  uint32_t recPoints;
  uint64_t ntripBytes;
  bool     wifiUp;
  bool     apMode;         // true when fallen back to SoftAP
  bool     ntripUp;
  bool     gnssAlive;      // true once at least one byte arrived from the LC29HDA
  uint32_t msSinceGnssByte; // ms since the most recent byte from the GNSS module
  uint16_t gnssRateHz;     // measured GGA updates per second (1 = default, 5 = PAIR050 confirmed)
  bool     gnss5HzAcked;   // true once PAIR001,050,0 ACK seen (5 Hz config accepted by module)
  bool     wifiConnectFailed;  // true if a configured SSID was attempted at boot and timed out
  String   wifiFailReason;     // last STA-disconnect reason name (only meaningful when wifiConnectFailed)
  String   wifiIp;         // STA IP or AP IP, whichever applies
  String   wifiSsid;       // configured SSID (may be empty)
  bool     batteryPresent;     // false until the first ADC sample lands (~1s after boot)
  float    batteryVolts;       // V at the battery terminals (post divider correction)
  int      batteryPercent;     // 0..100 estimate from a 3.0..4.2 V LiPo curve, clamped
  bool     batteryCharging;    // true when USB is plugged in (detected via threshold + positive trend)
  float    walkedM;            // running total path length while recording (Haversine sum)
  float    closingM;           // distance from current position to the first recorded point
  float    areaM2;             // Shoelace area of the closed polygon - only meaningful after stopRecording
};

struct WalkerConfigView {
  String   wifiSsid;
  String   wifiPassMasked; // "********" if a password is stored, else ""
  String   ntripHost;
  uint16_t ntripPort;
  String   ntripMount;
  String   ntripUser;
  String   ntripPassMasked;
  // Server URL drives both Upload to server and OTA. Both endpoints are
  // public on the LAN-only server now, so there is no token to store.
  String   serverUrl;
  bool     otaAutoCheck = true;
};

struct WalkerConfigUpdate {
  // Each `*Set` flag means "use the paired value". Unset fields stay as
  // they were in NVS. Lets the UI submit only what the user touched.
  bool wifiSsidSet = false; String wifiSsid;
  bool wifiPassSet = false; String wifiPass;
  bool ntripHostSet = false; String ntripHost;
  bool ntripPortSet = false; uint16_t ntripPort = 0;
  bool ntripMountSet = false; String ntripMount;
  bool ntripUserSet = false; String ntripUser;
  bool ntripPassSet = false; String ntripPass;
  bool otaAutoCheckSet = false; bool otaAutoCheck = true;
};

void walkerGetSnapshot(WalkerSnapshot& out);
void walkerGetConfig(WalkerConfigView& out);
void walkerApplyConfig(const WalkerConfigUpdate& upd);  // writes to NVS + reboots
bool walkerToggleRecording();                            // returns new state

// Path of the most recently completed (stopped) track CSV — used by the
// TFT UI's "Save as area" flow so it can re-read the CSV after the user
// stopped recording and convert each row into a SessionStore work map.
// Empty string until at least one recording has been stopped this boot.
String walkerLastTrackPath();
uint32_t walkerLastTrackPoints();

// Lets the TFT track-viewer adopt a previously-recorded track so the
// "Save as area" button on the legacy screen treats a loaded CSV the
// same as one we just stopped recording. Pass an empty path + 0 count
// to clear (e.g. when leaving viewing mode).
void walkerSetLastTrack(const String& path, uint32_t points);

// Number of live points kept in RAM, and a copy of them. The TFT map
// reads this each frame to redraw the polyline. Copy semantics keep
// the LVGL thread away from the std::vector backing store in main.cpp.
// double, not float - float at lat ~52 quantises to ~42 cm per LSB
// which is enough to make polygon area calculation lose tens of m^2.
struct WalkerLivePoint { double lat; double lng; uint8_t fix; };

size_t walkerCopyLivePoints(WalkerLivePoint* dst, size_t maxCount);

// Upload the current /session/ bundle to the configured Novabot server.
// Synchronous: blocks the calling task for the full POST (typically a
// few seconds over WiFi). `outMsg` receives a short user-facing status
// line — success or the first chunk of the server's error response.
bool uploadBundleToServer(String& outMsg);
