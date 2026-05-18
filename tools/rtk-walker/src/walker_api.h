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
  bool     wifiConnectFailed;  // true if a configured SSID was attempted at boot and timed out
  String   wifiFailReason;     // last STA-disconnect reason name (only meaningful when wifiConnectFailed)
  String   wifiIp;         // STA IP or AP IP, whichever applies
  String   wifiSsid;       // configured SSID (may be empty)
};

struct WalkerConfigView {
  String   wifiSsid;
  String   wifiPassMasked; // "********" if a password is stored, else ""
  String   ntripHost;
  uint16_t ntripPort;
  String   ntripMount;
  String   ntripUser;
  String   ntripPassMasked;
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
};

void walkerGetSnapshot(WalkerSnapshot& out);
void walkerGetConfig(WalkerConfigView& out);
void walkerApplyConfig(const WalkerConfigUpdate& upd);  // writes to NVS + reboots
bool walkerToggleRecording();                            // returns new state

// Number of live points kept in RAM, and a copy of them. The TFT map
// reads this each frame to redraw the polyline. Copy semantics keep
// the LVGL thread away from the std::vector backing store in main.cpp.
struct WalkerLivePoint { float lat; float lng; uint8_t fix; };

size_t walkerCopyLivePoints(WalkerLivePoint* dst, size_t maxCount);
