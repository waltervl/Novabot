/*
 * RTK Walker — ESP32-S3-N16R8 + Quectel LC29HDA
 *
 * Pin map (UART1):
 *   GPIO17  → LC29HDA RX   (ESP32 TX, RTCM corrections downstream)
 *   GPIO18  ← LC29HDA TX   (ESP32 RX, NMEA stream upstream)
 *   3V3     → LC29HDA VCC  (LC29HDA is 3.3 V only — do NOT feed 5 V)
 *   GND     → LC29HDA GND
 *
 *   GPIO0   = BOOT button  (toggle recording, debounced)
 *
 * Behaviour:
 *   1. Boot. Load WiFi + NTRIP creds from NVS preferences.
 *   2. Connect to WiFi.  If no creds → fall back to a SoftAP at
 *      192.168.4.1 named "rtk-walker-setup" so the phone can still
 *      reach the config page.
 *   3. Dial the NTRIP caster (Centipede.fr by default), authenticate,
 *      pull the RTCM stream and shovel every byte into LC29HDA's RX.
 *   4. Read NMEA from LC29HDA, parse the latest GGA into lat/lng/fix
 *      quality/sat-count/HDOP/altitude.
 *   5. BOOT-button toggle (long-debounce) → open a new CSV under
 *      LittleFS:/tracks/track-<unix>.csv, append one line per fix
 *      until toggled off.
 *   6. Web UI on port 80 exposes live status + recording controls +
 *      track download. The HTML is embedded in index_html.h so the
 *      first flash does not require a separate `pio run -t uploadfs`.
 *
 * Output CSV format (one header line + N data rows):
 *   timestamp_unix,lat,lng,alt_m,fix,sats,hdop
 *
 * Lat/Lng in decimal degrees. The OpenNova admin polygon import
 * accepts this directly — drop the file into
 * `Maps → Import polygon CSV` once the walk is finished.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <TinyGPS++.h>
#include <ArduinoJson.h>
#include <time.h>
#include <base64.h>
#include <esp_heap_caps.h>

#include <vector>

#include "index_html.h"
#include "walker_api.h"
#include "walker_lora.h"
#include "walker_ota.h"
#include "gnss_upgrade.h"
#include "gnss_tx.h"
#include "rtcm_log.h"
#include "session.h"
#include "recording.h"
#include "bundle.h"
#include "tft/tft_ui.h"

// ── Pins / hardware ─────────────────────────────────────────────────
#define GNSS_RX_PIN   18   // LC29HDA TX → ESP32 RX (UART1)
#define GNSS_TX_PIN   17   // LC29HDA RX ← ESP32 TX (UART1)
#define GNSS_BAUD     115200
#define BUTTON_PIN    0    // BOOT
#define BUTTON_DEBOUNCE_MS 60
#define NTRIP_RECONNECT_MS 5000
#define NTRIP_TCP_CONNECT_TIMEOUT_MS 500
#define NTRIP_HANDSHAKE_TIMEOUT_MS 900
#define NTRIP_HEADER_MAX 4096
#define NTRIP_HEADER_BYTES_PER_PUMP 512
#define WIFI_RECONNECT_INTERVAL_MS 5000

// How often to push the latest GGA back to the NTRIP caster. VRS / NEAREST
// mountpoints (Centipede NLDB, RTK2go VRS, NetR9, etc.) need a periodic
// GGA from the rover so they can generate a virtual base or pick the
// closest physical station. RTCM3 spec recommends every 5–30 s; 10 s is
// a safe middle ground that keeps us responsive when walking but doesn't
// flood the caster.
#define NTRIP_GGA_INTERVAL_MS 10000

// When DEBUG_NMEA_ECHO is set, every byte coming back from the LC29HDA
// gets mirrored to the USB serial console. Handy once for verifying
// the wiring; after that it's noisy (~550 B/s at 1 Hz). The structured
// `[nmea] rx=... bytes / 2s, sats=N, fix=N` heartbeat is gated by
// NMEA_HEARTBEAT instead so we can keep that on while silencing the
// raw bytes.
#define DEBUG_NMEA_ECHO 0
#define NMEA_HEARTBEAT  1

// ── Globals ─────────────────────────────────────────────────────────
HardwareSerial gnssSerial(1);
#ifdef LORA_PRESENT
HardwareSerial loraSerial(2);
#endif
TinyGPSPlus    gps;
WebServer      server(80);
WiFiClient     ntrip;
Preferences    prefs;
SessionStore   sessionStore;
Recorder       recorder(sessionStore);

struct Config {
  String ssid;
  String pass;
  String ntripHost = "caster.centipede.fr";
  uint16_t ntripPort = 2101;
  String ntripMount;          // mountpoint, e.g. "CT3F00FRA0"
  String ntripUser = "centipede";
  String ntripPass = "centipede";

  // Server upload target — used by /api/upload, OTA manifest checks, and the
  // TFT "Upload to server" button. Empty until the user fills the new section
  // in /api/config/server.
  String serverUrl;           // e.g. "http://192.168.0.247:8080"
  // mowerSn + adminToken removed: walker is SN-agnostic for uploads and
  // OTA runs against a public LAN-only binary endpoint, so neither value
  // serves any purpose anymore. Keys are also dropped from NVS below.

  // LoRa RTK relay (Task 4). Defaults match the Novabot factory pair
  // so most users never need to configure: charger broadcasts on
  // addr=718 ch=17 hc=20 lc=14, walker listens on the same.
  uint16_t loraAddr    = 718;
  uint8_t  loraChannel = 17;
  uint8_t  loraHc      = 20;
  uint8_t  loraLc      = 14;
  // E22/E220 interop: mirror the stock charger E220 PHY profile
  // (REG0=e7, REG1=20, REG3=83): 115200 UART in transparent mode,
  // 240-byte RF packets and air-rate code 7.
  uint8_t  loraPacketLenCode = 0; // 0=240, 1=128, 2=64, 3=32 bytes
  uint8_t  loraAirRateCode   = 7; // EBYTE code 7 = 62.5 kbps on E22-900
  bool     loraRtcmOnlyFeed  = true;
  bool     loraDirectGnssWrite = false;
  // Correction-source selector. false = LoRa relay feeds the GNSS (default,
  // factory pair). true = NTRIP over WiFi feeds the GNSS; the LoRa relay
  // keeps parsing for diagnostics but stops feeding the module so the two
  // sources never fight on the UART. Lets the operator A/B low-latency
  // NTRIP against the ~2 s LoRa relay without a reflash. NVS key "corr_ntrip".
  bool     useNtripCorrections = false;
  // LC29HDA navigation/dynamics model (PAIR080). Default 1 = Fitness (the
  // walking model — holds RTK fix under handheld motion where the Normal=0
  // driving model drops it). Other valid values: 0 Normal, 4 Stationary,
  // 5 Drone, 7 Swimming, 9 Bike. Asserted once at boot; changing it resets
  // the GNSS solution so it re-acquires in the new model. NVS key "nav_mode".
  uint8_t  gnssNavMode = 1;

  // OTA auto-check on boot. Default true — walker pulls the manifest from
  // <serverUrl>/api/walker-firmware/latest right after WiFi associates and
  // applies + reboots if newer. Settable from the TFT Settings tab so a
  // bricked-firmware scenario can be recovered by toggling this off and
  // flashing manually over USB.
  bool   otaAutoCheck = true;
  // Local web/API guard for dangerous endpoints. NVS key is "auth" to stay
  // within the 15-char Preferences key budget.
  String authToken;
} cfg;

struct Status {
  double   lat = 0, lng = 0, alt = 0;
  int      fix = 0;            // 0=none, 1=GPS, 2=DGPS, 4=RTK FIX, 5=RTK FLOAT
  int      sats = 0;
  double   hdop = 0;
  double   dgpsAge = -1;
  int      dgpsStation = -1;
  bool     recording = false;
  uint32_t recPoints = 0;
  uint64_t ntripBytes = 0;
  uint32_t lastFixMs = 0;
} st;

static File          trackFile;
static String        currentTrackName;

// Snapshot of the most recently completed track. Captured at the end of
// stopRecording() so the TFT "Save as area" flow can find the CSV after
// the live state has cleared. Stays valid across screen refreshes until
// the next startRecording().
static String        lastTrackPath;
static uint32_t      lastTrackPoints = 0;

// Survey metrics - computed in appendPoint() and stopRecording() so
// they always reflect what's actually in the track buffer rather than
// being recomputed from scratch on each snapshot call.
static double        firstLat = 0, firstLng = 0;  // first point of current track
static double        prevLat  = 0, prevLng  = 0;  // last point appended (for incremental length)
static double        walkedM  = 0;                // running path length while recording
static double        lastAreaM2 = 0;              // Shoelace area, computed at stopRecording()
enum NtripState : uint8_t {
  NTRIP_IDLE,
  NTRIP_TCP_CONNECTING,
  NTRIP_SEND_REQUEST,
  NTRIP_WAIT_HEADER,
  NTRIP_STREAMING,
  NTRIP_BACKOFF
};
enum NtripHeaderResult : uint8_t {
  NTRIP_HEADER_STREAM,
  NTRIP_HEADER_SOURCETABLE,
  NTRIP_HEADER_REJECT
};
static uint32_t      ntripLastConnectAttemptMs = 0;
static uint32_t      ntripGgaLastSentMs        = 0;
static bool          ntripGgaUploadLogged      = false;
static bool          ntripSuppressedLogged     = false;
static NtripState    ntripState                = NTRIP_IDLE;
static uint32_t      ntripBackoffUntilMs       = 0;
static uint32_t      ntripHandshakeDeadlineMs  = 0;
static char          ntripHeader[NTRIP_HEADER_MAX + 1] = {0};
static size_t        ntripHeaderLen            = 0;
static String        ntripRequestHost;
static String        ntripRequestMount;
static String        ntripRequestUser;
static String        ntripRequestPass;
static uint16_t      ntripRequestPort          = 0;
static int           lastButtonRead = HIGH;
static unsigned long lastButtonChangeMs = 0;

// Live track points for the web-UI map. Kept in RAM so the browser can
// poll a small JSON array without re-parsing the CSV every tick. Capped
// at LIVE_POINTS_MAX so a long walk (1 Hz × hours) can't run the heap
// dry; the file on flash always has the full trace.
#define LIVE_POINTS_MAX 4000
// Lat/lng MUST be double here. Float has ~7 significant digits, which
// at latitude 52 leaves only ~42 cm of resolution per LSB - the
// resulting polygon is jittery and Shoelace area calc loses tens of
// m^2 on a typical garden. Double brings the per-point quantisation
// down to sub-mm. Costs ~16 KB extra RAM at the LIVE_POINTS_MAX cap,
// fine on the 320 KB SRAM target.
struct LivePoint { double lat, lng; uint8_t fix; };
static std::vector<LivePoint> livePoints;

// Deferred on-device view refresh. HTTP handlers that modify the
// session (obstacle delete, etc.) can't safely re-load the polygon /
// obstacles inline — those operations are 500+ ms of LittleFS work
// and should not happen while a HTTP response is open. Instead the
// handler sets this slot and the main loop picks it up afterwards.
// -1 = no refresh pending; 0..2 = refresh that slot's on-device view.
static int g_pendingViewRefreshSlot = -1;

// Guards every access to `livePoints` so the main task (push_back +
// erase) and the LVGL task on the other core (walkerCopyLivePoints +
// /api/track/current serialise) don't trample each other. Standard
// FreeRTOS recursive mutex — short critical sections, no risk of
// priority-inversion or long blocks.
static SemaphoreHandle_t livePointsMux = nullptr;
static void livePointsLock()   { if (livePointsMux) xSemaphoreTakeRecursive(livePointsMux, portMAX_DELAY); }
static void livePointsUnlock() { if (livePointsMux) xSemaphoreGiveRecursive(livePointsMux); }

// Guards legacy track globals, Status, WiFi-failure text and config snapshots.
static SemaphoreHandle_t coreMux = nullptr;
static void coreLock()   { if (coreMux) xSemaphoreTakeRecursive(coreMux, portMAX_DELAY); }
static void coreUnlock() { if (coreMux) xSemaphoreGiveRecursive(coreMux); }

// Web-log ring buffer. Anything sent through weblogf() lands here in
// addition to Serial, so the phone can tail it via /api/log after the
// USB-C cable is disconnected. Buffer is bounded at WEB_LOG_MAX bytes;
// once full we drop a quarter off the front. The monotonic seq counter
// lets the client poll for "what's new since I last asked".
#define WEB_LOG_MAX 2048
static String  webLogBuf;
static uint32_t webLogSeq = 0;
static SemaphoreHandle_t webLogMux = nullptr;
static void webLogLock()   { if (webLogMux) xSemaphoreTakeRecursive(webLogMux, portMAX_DELAY); }
static void webLogUnlock() { if (webLogMux) xSemaphoreGiveRecursive(webLogMux); }

static void weblogf(const char* fmt, ...) {
  char buf[256];
  va_list args;
  va_start(args, fmt);
  int n = vsnprintf(buf, sizeof(buf), fmt, args);
  va_end(args);
  if (n <= 0) return;
  Serial.print(buf);
  webLogLock();
  webLogBuf += buf;
  webLogSeq += (uint32_t) strlen(buf);
  while (webLogBuf.length() > WEB_LOG_MAX) {
    webLogBuf.remove(0, WEB_LOG_MAX / 4);
  }
  webLogUnlock();
}

// ── GNSS command + response watcher ─────────────────────────────────
// LC29HDA accepts proprietary NMEA-style commands like `$PAIR021*39`
// (PAIR021 = query firmware version, see Quectel LC29H protocol spec).
// `sendGnssCommand("PAIR021")` builds the `$`, XOR checksum, `*HH\r\n`
// and writes it to the LC29HDA RX line. Responses arrive in the same
// NMEA stream we already parse — a tiny line accumulator (gnssLineFeed)
// pushes any `$P...` line to the web log regardless of DEBUG_NMEA_ECHO,
// because proprietary replies are rare and high-signal (version
// strings, status, error codes).

static char nmeaLineBuf[180];
static size_t nmeaLineLen = 0;

// Last full $GxGGA sentence seen from the LC29HDA, including the leading
// `$` and trailing `*HH` checksum but NOT the CRLF. Updated in
// gnssLineFeed() every time a GGA line completes. ntripPump() reads it
// out and forwards it to the caster every NTRIP_GGA_INTERVAL_MS — VRS /
// NEAREST mountpoints (Centipede NLDB, etc.) require this to generate
// the virtual base for the rover's position. Without it the caster
// streams corrections from some fixed default location and the rover
// gets RTK FLOAT but never resolves to FIX.
static char     lastGgaLine[180] = {0};
static size_t   lastGgaLen      = 0;
static uint32_t lastGgaAtMs     = 0;
static uint32_t ggaSentenceCount = 0;
static uint32_t ggaFixTransitionCount = 0;
static uint32_t ggaLastStatusMs = 0;
static uint32_t ggaLastFixChangeMs = 0;
static int      ggaLastFix = -1;
static int      ggaPrevFix = -1;

// Measured GGA epoch rate (position fixes per second). Count completed
// GGA sentences, not TinyGPS location updates: TinyGPS can mark location
// updated more than once per epoch as it ingests related NMEA sentences,
// which made a true 1 Hz LC29HDA look like 3-4 Hz and triggered pointless
// PAIR050 reassert loops.
static uint32_t gnssRateWinStartMs = 0;
static uint16_t gnssRateWinCount   = 0;
static uint16_t gnssRateHz         = 0;
static int32_t  gnssRateLastGgaCentis = -1;

static int32_t parseGgaTimeCentis(const char* start, const char* end) {
  uint32_t whole = 0;
  bool sawDigit = false;
  while (start < end && *start >= '0' && *start <= '9') {
    sawDigit = true;
    whole = whole * 10 + (uint32_t)(*start - '0');
    start++;
  }
  if (!sawDigit) return -1;

  uint8_t centis = 0;
  if (start < end && *start == '.') {
    start++;
    if (start < end && *start >= '0' && *start <= '9') {
      centis = (uint8_t)((*start - '0') * 10);
      start++;
    }
    if (start < end && *start >= '0' && *start <= '9') {
      centis += (uint8_t)(*start - '0');
    }
  }
  return (int32_t)(whole * 100 + centis);
}

static void noteGgaRateEpoch(const char* line, size_t len) {
  // Field 1 is UTC time: $GxGGA,<time>,...  Use it to avoid double-counting
  // receivers that emit both GNGGA and GPGGA for the same epoch.
  if (len < 8) return;
  const char* start = strchr(line, ',');
  if (!start) return;
  start++;
  const char* end = strchr(start, ',');
  if (!end || end <= start) return;

  int32_t epoch = parseGgaTimeCentis(start, end);
  if (epoch < 0 || epoch == gnssRateLastGgaCentis) return;
  gnssRateLastGgaCentis = epoch;

  uint32_t now = millis();
  if (gnssRateWinStartMs == 0) {
    gnssRateWinStartMs = now;
    gnssRateWinCount = 1;
    return;
  }
  if (now - gnssRateWinStartMs >= 1000) {
    gnssRateHz = gnssRateWinCount;
    gnssRateWinCount = 1;
    gnssRateWinStartMs = now;
  } else {
    gnssRateWinCount++;
  }
}

static bool nmeaField(const char* line, size_t len, uint8_t wantedField,
                      const char** out, size_t* outLen) {
  if (!line || !out || !outLen) return false;
  const char* fieldStart = line;
  uint8_t field = 0;
  for (size_t i = 0; i <= len; i++) {
    char ch = (i < len) ? line[i] : '\0';
    if (ch != ',' && ch != '*' && i < len) continue;
    if (field == wantedField) {
      *out = fieldStart;
      *outLen = (size_t)(&line[i] - fieldStart);
      return true;
    }
    field++;
    fieldStart = &line[i + 1];
    if (ch == '*' || i == len) break;
  }
  return false;
}

static int parseNmeaIntField(const char* line, size_t len, uint8_t field,
                             int fallback) {
  const char* start = nullptr;
  size_t n = 0;
  if (!nmeaField(line, len, field, &start, &n) || n == 0 || n >= 16) return fallback;
  char tmp[16];
  memcpy(tmp, start, n);
  tmp[n] = '\0';
  return atoi(tmp);
}

static double parseNmeaDoubleField(const char* line, size_t len, uint8_t field,
                                   double fallback) {
  const char* start = nullptr;
  size_t n = 0;
  if (!nmeaField(line, len, field, &start, &n) || n == 0 || n >= 24) return fallback;
  char tmp[24];
  memcpy(tmp, start, n);
  tmp[n] = '\0';
  return atof(tmp);
}

static void updateGgaStatusFromLine(const char* line, size_t len) {
  int fix = parseNmeaIntField(line, len, 6, -1);
  int sats = parseNmeaIntField(line, len, 7, -1);
  double hdop = parseNmeaDoubleField(line, len, 8, -1);
  double diffAge = parseNmeaDoubleField(line, len, 13, -1);
  int station = parseNmeaIntField(line, len, 14, -1);
  uint32_t now = millis();

  coreLock();
  ggaSentenceCount++;
  ggaLastStatusMs = now;
  if (fix >= 0) {
    if (ggaLastFix >= 0 && fix != ggaLastFix) {
      ggaPrevFix = ggaLastFix;
      ggaFixTransitionCount++;
      ggaLastFixChangeMs = now;
    } else if (ggaLastFix < 0) {
      ggaLastFixChangeMs = now;
    }
    ggaLastFix = fix;
    st.fix = fix;
    if (fix > 0) st.lastFixMs = now;
  }
  if (sats >= 0) st.sats = sats;
  if (hdop >= 0) st.hdop = hdop;
  st.dgpsAge = diffAge;
  st.dgpsStation = station;
  coreUnlock();
}

// Tracks the most recent PAIR001 ACK so the post-detect command flow
// can verify that PAIR050 (rate config) was actually accepted. The LC29HDA
// silently drops PAIR commands if its parser is busy, so we have to
// look for `$PAIR001,050,0*XX` (cmd=050, result=0 → success).
static int      lastPair001Cmd = -1;
static int      lastPair001Result = -1;
static uint32_t lastPair001AtMs = 0;
static uint32_t pair050AckOkAtMs = 0;
static uint32_t pair080AckOkAtMs = 0;
static uint32_t pair511AckOkAtMs = 0;  // PAIR511 = save nav data to NVM (TTFF acceleration)

static void rememberPair001Ack(int cmd, int result, uint32_t atMs) {
  if (result != 0) return;
  if (cmd == 50) pair050AckOkAtMs = atMs;
  if (cmd == 80) pair080AckOkAtMs = atMs;  // PAIR080 nav-mode set ACK
  if (cmd == 511) pair511AckOkAtMs = atMs; // PAIR511 nav-data persist ACK
}

static bool pair050AckOkSince(uint32_t sinceMs) {
  return pair050AckOkAtMs != 0 && (int32_t)(pair050AckOkAtMs - sinceMs) >= 0;
}

static bool pair080AckOkSince(uint32_t sinceMs) {
  return pair080AckOkAtMs != 0 && (int32_t)(pair080AckOkAtMs - sinceMs) >= 0;
}

static bool pair511AckOkSince(uint32_t sinceMs) {
  return pair511AckOkAtMs != 0 && (int32_t)(pair511AckOkAtMs - sinceMs) >= 0;
}

enum GnssVariant : uint8_t {
  GNSS_VARIANT_UNKNOWN = 0,
  GNSS_VARIANT_HDA,
  GNSS_VARIANT_HEA,
  GNSS_VARIANT_OTHER,
};
static GnssVariant gnssVariant = GNSS_VARIANT_UNKNOWN;
static bool gnssVariantLogged = false;

static void setGnssVariant(GnssVariant variant) {
  if (variant == GNSS_VARIANT_UNKNOWN || gnssVariant != GNSS_VARIANT_UNKNOWN) return;
  gnssVariant = variant;
  if (!gnssVariantLogged) {
    const char* name =
      (gnssVariant == GNSS_VARIANT_HEA) ? "LC29HEA" :
      (gnssVariant == GNSS_VARIANT_HDA) ? "LC29HDA" : "other";
    weblogf("[gnss] detected %s firmware profile\n", name);
    gnssVariantLogged = true;
  }
}

static void sendGnssCommand(const String& payload) {
  uint8_t cs = 0;
  for (size_t i = 0; i < payload.length(); i++) cs ^= (uint8_t) payload[i];
  char out[200];
  snprintf(out, sizeof(out), "$%s*%02X\r\n", payload.c_str(), cs);
  bool queued = walkerGnssTxQueuePairPayload(payload);
  // Trim trailing \r\n for log readability.
  size_t n = strlen(out);
  while (n > 0 && (out[n-1] == '\n' || out[n-1] == '\r')) out[--n] = '\0';
  weblogf("[gnss-tx] %s%s\n", out, queued ? "" : " (queue full)");
}

static void gnssLineFeed(char c) {
  if (c == '\n' || c == '\r') {
    if (nmeaLineLen > 0) {
      nmeaLineBuf[nmeaLineLen] = '\0';
      // Surface any proprietary response (firmware version, ack, error)
      // so the diagnostic flow shows the module's reply alongside our
      // request in the same web console.
      // Snapshot the latest GGA line so ntripPump() can forward it back
      // to the caster. Accept both GNGGA (combined) and GPGGA (GPS-only)
      // talker IDs — Quectel emits GNGGA in multi-constellation mode but
      // older receivers fall back to GPGGA. Skip while no fix is parsed
      // (field 6 = '0') because casters reject zero-fix GGAs.
      if (nmeaLineLen >= 6 && nmeaLineBuf[0] == '$' &&
          (strncmp(nmeaLineBuf, "$GNGGA,", 7) == 0 ||
           strncmp(nmeaLineBuf, "$GPGGA,", 7) == 0)) {
        noteGgaRateEpoch(nmeaLineBuf, nmeaLineLen);
        updateGgaStatusFromLine(nmeaLineBuf, nmeaLineLen);
        int commaCount = 0;
        bool hasFix = false;
        for (size_t i = 0; i < nmeaLineLen; i++) {
          if (nmeaLineBuf[i] != ',') continue;
          commaCount++;
          if (commaCount == 6) {
            char q = (i + 1 < nmeaLineLen) ? nmeaLineBuf[i + 1] : '\0';
            hasFix = (q != '0' && q != ',' && q != '*' && q != '\0');
            break;
          }
        }
        if (!hasFix) {
          lastGgaLen = 0;
        } else if (nmeaLineLen < sizeof(lastGgaLine) - 1) {
          memcpy(lastGgaLine, nmeaLineBuf, nmeaLineLen);
          lastGgaLine[nmeaLineLen] = '\0';
          lastGgaLen = nmeaLineLen;
          lastGgaAtMs = millis();
        }
      }
      // Diagnostic: also log $GxGSV (satellite-in-view) lines so we can see
      // per-signal CN0 for L1 vs L5 — needed to verify band tracking quality
      // when debugging RTK Fixed acquisition issues. GSV is 1Hz so log volume
      // stays manageable; revert by disabling GSV output via $PAIR062,4,0.
      if (nmeaLineLen >= 6 && nmeaLineBuf[0] == '$' && nmeaLineBuf[1] == 'G' &&
          nmeaLineBuf[3] == 'G' && nmeaLineBuf[4] == 'S' && nmeaLineBuf[5] == 'V') {
        weblogf("[gnss-rx] %s\n", nmeaLineBuf);
      }
      if (nmeaLineLen >= 3 && nmeaLineBuf[0] == '$' && nmeaLineBuf[1] == 'P') {
        weblogf("[gnss-rx] %s\n", nmeaLineBuf);
        if (strstr(nmeaLineBuf, "LC29HEA")) setGnssVariant(GNSS_VARIANT_HEA);
        else if (strstr(nmeaLineBuf, "LC29HDA")) setGnssVariant(GNSS_VARIANT_HDA);
        // Either legacy ($PAIR020) or modern ($PQTMVERNO) version sentence
        // without a recognised module identifier maps to GNSS_VARIANT_OTHER.
        else if (strncmp(nmeaLineBuf, "$PAIR020,", 9) == 0 ||
                 strncmp(nmeaLineBuf, "$PQTMVERNO,", 11) == 0) {
          setGnssVariant(GNSS_VARIANT_OTHER);
        }
        // PAIR001 ACK: "$PAIR001,<cmd>,<result>*HH" — cmd matches the
        // PAIR<cmd> we sent (e.g. 050 for PAIR050), result=0 means OK.
        // Parse it here so the retry loop in gnssPump() can see whether
        // a config command actually landed.
        if (strncmp(nmeaLineBuf, "$PAIR001,", 9) == 0) {
          int cmd = -1, res = -1;
          if (sscanf(nmeaLineBuf + 9, "%d,%d", &cmd, &res) == 2) {
            lastPair001Cmd    = cmd;
            lastPair001Result = res;
            lastPair001AtMs   = millis();
            rememberPair001Ack(cmd, res, lastPair001AtMs);
          }
        }
      }
      nmeaLineLen = 0;
    }
  } else if (nmeaLineLen < sizeof(nmeaLineBuf) - 1) {
    nmeaLineBuf[nmeaLineLen++] = c;
  }
}

// Parsed GGA "fix quality" lives in field 6 (1-indexed: $GxGGA, time, lat,
// N/S, lng, E/W, *fixQual*, sats, HDOP, alt, M, ...). TinyGPSPlus doesn't
// expose it directly, so we register a custom field watcher.
TinyGPSCustom ggaFixQuality(gps, "GNGGA", 6);
TinyGPSCustom ggaFixQualityGP(gps, "GPGGA", 6);
TinyGPSCustom ggaDiffAge(gps, "GNGGA", 13);
TinyGPSCustom ggaDiffAgeGP(gps, "GPGGA", 13);
TinyGPSCustom ggaStationId(gps, "GNGGA", 14);
TinyGPSCustom ggaStationIdGP(gps, "GPGGA", 14);

// ── Helpers ─────────────────────────────────────────────────────────
static String isoTimestamp() {
  time_t now;
  time(&now);
  struct tm tm_buf;
  gmtime_r(&now, &tm_buf);
  char buf[24];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm_buf);
  return String(buf);
}

static void loadConfig() {
  prefs.begin("rtk-walker", false);
  cfg.ssid       = prefs.getString("ssid", "");
  cfg.pass       = prefs.getString("pass", "");
  cfg.ntripHost  = prefs.getString("nhost", "caster.centipede.fr");
  cfg.ntripPort  = prefs.getUShort("nport", 2101);
  cfg.ntripMount = prefs.getString("nmount", "");
  cfg.ntripUser  = prefs.getString("nuser", "centipede");
  cfg.ntripPass  = prefs.getString("npass", "centipede");
  // Server upload target (Task 10). NVS key budget: 15 chars, so we use
  // short keys ("surl", "msn", "atok").
  cfg.serverUrl   = prefs.getString("surl", "");
  // Legacy keys ("msn", "atok") are silently removed below if present.
  cfg.otaAutoCheck = prefs.getBool("otaauto", true);
  cfg.authToken = prefs.getString("auth", "");
  cfg.loraAddr    = prefs.getUShort("lora_addr", 718);
  cfg.loraChannel = prefs.getUChar("lora_ch", 17);
  cfg.loraHc      = prefs.getUChar("lora_hc", 20);
  cfg.loraLc      = prefs.getUChar("lora_lc", 14);
  cfg.loraPacketLenCode = prefs.getUChar("lora_pkt", 0);
  cfg.loraAirRateCode   = prefs.getUChar("lora_air", 7);
  cfg.loraRtcmOnlyFeed  = prefs.getBool("lora_rtcm", true);
  cfg.loraDirectGnssWrite = prefs.getBool("lora_dir", false);
  cfg.useNtripCorrections = prefs.getBool("corr_ntrip", false);
  cfg.gnssNavMode = prefs.getUChar("nav_mode", 1);  // 1 = Fitness (walking)
  // Only allow real (non-reserved) PAIR080 modes; fall back to Fitness.
  if (cfg.gnssNavMode != 0 && cfg.gnssNavMode != 1 && cfg.gnssNavMode != 4 &&
      cfg.gnssNavMode != 5 && cfg.gnssNavMode != 7 && cfg.gnssNavMode != 9) {
    cfg.gnssNavMode = 1;
  }
  if (cfg.loraPacketLenCode > 3) cfg.loraPacketLenCode = 0;
  if (cfg.loraAirRateCode > 7) cfg.loraAirRateCode = 7;
}

static void saveConfig() {
  prefs.putString("ssid", cfg.ssid);
  prefs.putString("pass", cfg.pass);
  prefs.putString("nhost", cfg.ntripHost);
  prefs.putUShort("nport", cfg.ntripPort);
  prefs.putString("nmount", cfg.ntripMount);
  prefs.putString("nuser", cfg.ntripUser);
  prefs.putString("npass", cfg.ntripPass);
  prefs.putString("surl", cfg.serverUrl);
  // Drop legacy keys that older firmware wrote.
  prefs.remove("msn");
  prefs.remove("atok");
  prefs.putBool("otaauto", cfg.otaAutoCheck);
  prefs.putString("auth", cfg.authToken);
  prefs.putUShort("lora_addr", cfg.loraAddr);
  prefs.putUChar("lora_ch",    cfg.loraChannel);
  prefs.putUChar("lora_hc",    cfg.loraHc);
  prefs.putUChar("lora_lc",    cfg.loraLc);
  prefs.putUChar("lora_pkt",   cfg.loraPacketLenCode);
  prefs.putUChar("lora_air",   cfg.loraAirRateCode);
  prefs.putBool("lora_rtcm",   cfg.loraRtcmOnlyFeed);
  prefs.putBool("lora_dir",    cfg.loraDirectGnssWrite);
  prefs.putBool("corr_ntrip",  cfg.useNtripCorrections);
  prefs.putUChar("nav_mode",   cfg.gnssNavMode);
}

static uint16_t loraPacketLenBytes(uint8_t code) {
  switch (code) {
    case 0: return 240;
    case 1: return 128;
    case 2: return 64;
    case 3: return 32;
    default: return 128;
  }
}

static bool loraPacketLenCodeFromBytes(int bytes, uint8_t& out) {
  switch (bytes) {
    case 240: out = 0; return true;
    case 128: out = 1; return true;
    case 64:  out = 2; return true;
    case 32:  out = 3; return true;
    default: return false;
  }
}

// Haversine distance between two lat/lng points in metres. Accurate to
// a few cm at our scales (boundary surveys typically <100 m across).
static double haversineM(double lat1, double lon1, double lat2, double lon2) {
  const double R = 6371000.0;
  double dLat = (lat2 - lat1) * (M_PI / 180.0);
  double dLon = (lon2 - lon1) * (M_PI / 180.0);
  double a = sin(dLat / 2) * sin(dLat / 2) +
             cos(lat1 * (M_PI / 180.0)) * cos(lat2 * (M_PI / 180.0)) *
             sin(dLon / 2) * sin(dLon / 2);
  return R * 2.0 * atan2(sqrt(a), sqrt(1.0 - a));
}

static bool isRtkUsableFix(int fix) {
  return fix == 4 || fix == 5;
}

static bool isSafeLeafName(const String& name) {
  if (name.length() == 0 || name.indexOf("..") >= 0) return false;
  for (size_t i = 0; i < name.length(); i++) {
    char c = name.charAt(i);
    bool ok = (c >= 'A' && c <= 'Z') ||
              (c >= 'a' && c <= 'z') ||
              (c >= '0' && c <= '9') ||
              c == '.' || c == '_' || c == '-';
    if (!ok) return false;
  }
  return true;
}

static String makeUniqueTrackPath() {
  time_t now;
  time(&now);
  uint32_t ms = millis();
  for (uint8_t i = 0; i < 100; i++) {
    char nameBuf[64];
    if (i == 0) {
      snprintf(nameBuf, sizeof(nameBuf), "/tracks/track-%lu-%08lx.csv",
               (unsigned long) now, (unsigned long) ms);
    } else {
      snprintf(nameBuf, sizeof(nameBuf), "/tracks/track-%lu-%08lx-%u.csv",
               (unsigned long) now, (unsigned long) ms, (unsigned) i);
    }
    if (!LittleFS.exists(nameBuf)) return String(nameBuf);
  }
  return String();
}

static String setupApSsid() {
  uint32_t suffix = (uint32_t) (ESP.getEfuseMac() & 0xFFFFFFFFu);
  char buf[32];
  snprintf(buf, sizeof(buf), "rtk-walker-%08lX", (unsigned long) suffix);
  return String(buf);
}

static String setupApPassword() {
  // Device-specific WPA2 password: "rtk" + the 8 hex chars in the setup SSID.
  // This avoids one global hardcoded password while keeping setup recoverable.
  uint32_t suffix = (uint32_t) (ESP.getEfuseMac() & 0xFFFFFFFFu);
  char buf[16];
  snprintf(buf, sizeof(buf), "rtk%08lX", (unsigned long) suffix);
  return String(buf);
}

static uint32_t wifiLastReconnectAttemptMs = 0;
static uint32_t wifiLastDiagMs = 0;

static void startSetupAp() {
  String ssid = setupApSsid();
  String pass = setupApPassword();
  WiFi.mode(cfg.ssid.length() > 0 ? WIFI_AP_STA : WIFI_AP);
  WiFi.softAP(ssid.c_str(), pass.c_str());
  weblogf("[wifi] setup AP ssid=%s (device-specific password)\n", ssid.c_str());
}

static void wifiPump() {
  if (cfg.ssid.length() == 0) return;
  wifi_mode_t mode = WiFi.getMode();
  if (mode != WIFI_STA && mode != WIFI_AP_STA) {
    WiFi.mode(WIFI_STA);
    mode = WIFI_STA;
  }
  if (WiFi.status() == WL_CONNECTED) return;

  uint32_t now = millis();
  if (wifiLastReconnectAttemptMs != 0 &&
      now - wifiLastReconnectAttemptMs < WIFI_RECONNECT_INTERVAL_MS) {
    return;
  }
  wifiLastReconnectAttemptMs = now;
  weblogf("[wifi] reconnecting to %s (status=%d)\n",
          cfg.ssid.c_str(), (int) WiFi.status());
  if (mode == WIFI_AP_STA) {
    WiFi.begin(cfg.ssid.c_str(), cfg.pass.c_str());
  } else {
    WiFi.disconnect(false, false);
    WiFi.begin(cfg.ssid.c_str(), cfg.pass.c_str());
  }
}

static void wifiDiagPump() {
  uint32_t now = millis();
  if (wifiLastDiagMs != 0 && now - wifiLastDiagMs < 10000) return;
  wifiLastDiagMs = now;
  Serial.printf("[wifi] diag mode=%d status=%d ip=%s rssi=%d heap=%lu minHeap=%lu\n",
                (int) WiFi.getMode(), (int) WiFi.status(),
                WiFi.localIP().toString().c_str(), WiFi.RSSI(),
                (unsigned long) ESP.getFreeHeap(),
                (unsigned long) ESP.getMinFreeHeap());
}

// Shoelace area on an equirectangular projection anchored at the first
// point of the track. Good to ~0.1 % at the lat/lon extents of a back
// garden. Returns m^2.
static double polygonAreaM2() {
  if (livePoints.size() < 3) return 0.0;
  double cosLat0 = cos(firstLat * (M_PI / 180.0));
  double sum = 0.0;
  const double kLatM = 111320.0;  // metres per degree of latitude
  for (size_t i = 0; i < livePoints.size(); i++) {
    size_t j = (i + 1) % livePoints.size();
    double x1 = (livePoints[i].lng - firstLng) * cosLat0 * kLatM;
    double y1 = (livePoints[i].lat - firstLat) * kLatM;
    double x2 = (livePoints[j].lng - firstLng) * cosLat0 * kLatM;
    double y2 = (livePoints[j].lat - firstLat) * kLatM;
    sum += (x1 * y2) - (x2 * y1);
  }
  return fabs(sum) / 2.0;
}

// ── Track recording ─────────────────────────────────────────────────
static void startRecording() {
  coreLock();
  if (st.recording) { coreUnlock(); return; }
  if (!LittleFS.exists("/tracks")) LittleFS.mkdir("/tracks");

  currentTrackName = makeUniqueTrackPath();
  if (currentTrackName.length() == 0) {
    weblogf("[rec] failed to allocate unique track name\n");
    coreUnlock();
    return;
  }

  trackFile = LittleFS.open(currentTrackName, FILE_WRITE);
  if (!trackFile) {
    weblogf("[rec] failed to open %s\n", currentTrackName.c_str());
    coreUnlock();
    return;
  }
  trackFile.println("timestamp_unix,lat,lng,alt_m,fix,sats,hdop");
  trackFile.flush();
  // A fresh recording invalidates the "last completed track" snapshot —
  // the TFT Save-as-area button must require a NEW stop before re-firing.
  lastTrackPath = "";
  lastTrackPoints = 0;
  st.recording = true;
  st.recPoints = 0;
  livePointsLock();
  livePoints.clear();
  livePoints.reserve(256);
  livePointsUnlock();
  // Reset survey metrics for the new track. firstLat/Lng get set when
  // appendPoint sees its first usable fix; until then closingM is 0
  // because we have nothing to close against yet.
  firstLat = firstLng = 0;
  prevLat  = prevLng  = 0;
  walkedM = 0;
  lastAreaM2 = 0;
  weblogf("[rec] started %s\n", currentTrackName.c_str());
  coreUnlock();
}

static void stopRecording() {
  coreLock();
  if (!st.recording) { coreUnlock(); return; }
  if (trackFile) {
    trackFile.flush();
    trackFile.close();
  }
  st.recording = false;
  // Compute the closing area on stop. Stays as the "last area" until a
  // new recording starts, so the UI can keep displaying the result.
  livePointsLock();
  lastAreaM2 = polygonAreaM2();
  livePointsUnlock();
  // Publish the just-closed track to the "last completed" snapshot so the
  // TFT Save-as-area flow can re-read its CSV without racing the live
  // recording state. Cleared on startRecording() above.
  lastTrackPath = currentTrackName;
  lastTrackPoints = st.recPoints;
  weblogf("[rec] stopped (%u points, %.1f m walked, area %.1f m2)\n",
          st.recPoints, walkedM, lastAreaM2);
  coreUnlock();
}

// Quality and motion filters that decide whether a fresh fix gets
// written to the track. Tunable from the top of the file.
//   RTK quality     - only GGA fix 4 (RTK fixed) and 5 (RTK float) are
//                     accepted. Estimated/manual/simulation fixes (6/7/8)
//                     are explicit non-RTK modes and must not be recorded.
//   MIN_DISPLACEMENT_M - skip fixes that haven't moved at least N cm
//                      from the previous accepted point. Cleans up
//                      standstill jitter, but set too high and slow
//                      walks lose samples - at 0.3 m/s x 200 ms = 6 cm
//                      so a 5 cm filter dropped ~half the points. 2 cm
//                      kept enough margin against RTK FIX cm-noise.
//                      Tightened to 1 cm because the DA chip is locked
//                      to 1 Hz RTK (Quectel hardware limit, see PAIR050
//                      comment near gnssPump). At 1 Hz we need every
//                      real-movement sample to keep polygon density
//                      reasonable. RTK FIX noise is ~1 cm too so this
//                      sits at the edge but standstill jitter still
//                      filters because cm-level noise stays in place.
#define MIN_DISPLACEMENT_M  0.01

static void appendPoint() {
  coreLock();
  // Accept points when EITHER the legacy track recorder is active OR the
  // new session recorder (obstacle/channel/work) is. Track-file write
  // below is still gated on the legacy state, but the live-points ring
  // and walked-metres counters update for both so the obstacle/channel
  // recording screen sees a real trail with running distance + closure.
  bool legacyActive  = st.recording && trackFile;
  bool sessionActive = recorder.isRecording();
  if (!legacyActive && !sessionActive) { coreUnlock(); return; }
  // Only record actual GPS solutions. fix=0 means we have no usable
  // position; logging that would pollute the trail with zeros.
  if (st.fix == 0 || st.lat == 0 || st.lng == 0) { coreUnlock(); return; }
  // Quality filter: only RTK fixed/float. Reject estimated/manual/simulated
  // GGA modes even though their numeric values are higher than 5.
  if (!isRtkUsableFix(st.fix)) { coreUnlock(); return; }
  // Motion filter: skip fixes within MIN_DISPLACEMENT_M of the last
  // accepted point (standstill RTK jitter looks like a zigzag without
  // this).
  if (firstLat != 0 || firstLng != 0) {
    double d = haversineM(prevLat, prevLng, st.lat, st.lng);
    if (d < MIN_DISPLACEMENT_M) { coreUnlock(); return; }
  }

  if (legacyActive) {
    time_t now;
    time(&now);
    char line[160];
    snprintf(line, sizeof(line), "%lu,%.8f,%.8f,%.2f,%d,%d,%.2f",
             (unsigned long) now, st.lat, st.lng, st.alt, st.fix, st.sats, st.hdop);
    trackFile.println(line);
    st.recPoints++;
  }

  // Mirror into the live-points ring so the UI polls a cheap JSON
  // instead of re-reading the CSV every frame. When we hit the cap,
  // drop the oldest point so the most recent N stay visible.
  livePointsLock();
  if (livePoints.size() >= LIVE_POINTS_MAX) {
    livePoints.erase(livePoints.begin());
  }
  livePoints.push_back({ st.lat, st.lng, (uint8_t) st.fix });
  livePointsUnlock();

  // Incremental path length: distance from the previous accepted point
  // to this one, summed over the whole walk. First point of the track
  // initialises the anchor so closingM can be computed.
  if (firstLat == 0 && firstLng == 0) {
    firstLat = st.lat;
    firstLng = st.lng;
    prevLat  = st.lat;
    prevLng  = st.lng;
  } else {
    walkedM += haversineM(prevLat, prevLng, st.lat, st.lng);
    prevLat = st.lat;
    prevLng = st.lng;
  }

  // Flush every 8 rows so an unexpected reset doesn't lose the entire
  // walk — but skip the flush most of the time to spare flash writes.
  if (legacyActive && (st.recPoints & 0x07) == 0) trackFile.flush();
  coreUnlock();
}

// ── NTRIP ───────────────────────────────────────────────────────────
// Forward decls: the real owner lives in the GNSS pump section below,
// but NTRIP gates correction streaming until the module is awake.
extern bool     gnssDetected;
static bool ntripTimeReached(uint32_t nowMs, uint32_t deadlineMs) {
  return (int32_t)(nowMs - deadlineMs) >= 0;
}

static void ntripClearHeader() {
  ntripHeaderLen = 0;
  ntripHeader[0] = '\0';
}

static void ntripClearRequestSnapshot() {
  ntripRequestHost = "";
  ntripRequestMount = "";
  ntripRequestUser = "";
  ntripRequestPass = "";
  ntripRequestPort = 0;
}

static bool ntripReadyToRun() {
  coreLock();
  bool haveHost = cfg.ntripHost.length() > 0;
  bool haveMount = cfg.ntripMount.length() > 0;
  bool havePort = cfg.ntripPort > 0;
  bool useNtrip = cfg.useNtripCorrections;
  coreUnlock();
  if (!haveHost || !haveMount || !havePort) return false;
  if (WiFi.status() != WL_CONNECTED) return false;
  // Explicit correction-source selector. NTRIP runs only when it is the
  // chosen source; when LoRa is selected we keep NTRIP fully idle (no
  // socket) so the two sources never feed the module in parallel and the
  // web server isn't starved draining a TCP stream we won't use. (The old
  // rule auto-suppressed NTRIP whenever the LoRa module was present — the
  // source switch now makes that choice explicit and overridable so the
  // operator can force NTRIP with the E22 still installed.)
  if (!useNtrip) return false;
  // No GNSS module: no point fetching RTCM corrections, there is
  // nothing on the other end of the UART to consume them. Skip until
  // the first NMEA byte proves the module is awake.
  if (!gnssDetected) return false;
  return true;
}

static void ntripEnterIdle(bool stopSocket) {
  if (stopSocket) ntrip.stop();
  ntripClearHeader();
  ntripClearRequestSnapshot();
  ntripState = NTRIP_IDLE;
}

static void ntripEnterBackoff(bool stopSocket) {
  if (stopSocket) ntrip.stop();
  ntripClearHeader();
  ntripClearRequestSnapshot();
  uint32_t nowMs = millis();
  uint32_t retryAtMs = ntripLastConnectAttemptMs + NTRIP_RECONNECT_MS;
  ntripBackoffUntilMs = ntripTimeReached(nowMs, retryAtMs) ? nowMs : retryAtMs;
  ntripState = NTRIP_BACKOFF;
}

static NtripHeaderResult ntripClassifyHeader(const char* header) {
  // Centipede returns "SOURCETABLE 200 OK" (a 200 status!) when the
  // mountpoint is unknown, followed by a 250 KB list of every base
  // station as the body. Detect SOURCETABLE explicitly and bail out
  // before any of the body can be forwarded as if it were RTCM.
  if (strstr(header, "SOURCETABLE")) return NTRIP_HEADER_SOURCETABLE;
  if (strstr(header, "ICY 200")
      || strstr(header, "HTTP/1.0 200")
      || strstr(header, "HTTP/1.1 200")) {
    return NTRIP_HEADER_STREAM;
  }
  return NTRIP_HEADER_REJECT;
}

static bool ntripHeaderComplete() {
  if (ntripHeaderLen >= 4
      && memcmp(ntripHeader + ntripHeaderLen - 4, "\r\n\r\n", 4) == 0) {
    return true;
  }
  if (ntripHeaderLen >= 2
      && memcmp(ntripHeader + ntripHeaderLen - 2, "\n\n", 2) == 0) {
    return true;
  }
  return false;
}

static void ntripStartTcpConnect() {
  coreLock();
  ntripRequestHost = cfg.ntripHost;
  ntripRequestPort = cfg.ntripPort;
  ntripRequestMount = cfg.ntripMount;
  ntripRequestUser = cfg.ntripUser;
  ntripRequestPass = cfg.ntripPass;
  coreUnlock();

  uint32_t nowMs = millis();
  ntripLastConnectAttemptMs = nowMs;
  ntripState = NTRIP_TCP_CONNECTING;

  weblogf("[ntrip] connecting %s:%u/%s\n",
          ntripRequestHost.c_str(), ntripRequestPort, ntripRequestMount.c_str());

  // Arduino ESP32 WiFiClient exposes only a synchronous TCP connect.
  // Keep this as the single bounded wait in the NTRIP path; header
  // waiting/parsing is handled incrementally by ntripPump().
  if (!ntrip.connect(ntripRequestHost.c_str(), ntripRequestPort, NTRIP_TCP_CONNECT_TIMEOUT_MS)) {
    weblogf("[ntrip] tcp connect failed\n");
    ntripEnterBackoff(false);
    return;
  }
  ntripState = NTRIP_SEND_REQUEST;
}

static void ntripSendRequest() {
  if (!ntrip.connected()) {
    weblogf("[ntrip] tcp disconnected before request\n");
    ntripEnterBackoff(false);
    return;
  }

  String credentials = ntripRequestUser + ":" + ntripRequestPass;
  String auth = base64::encode(credentials);
  ntrip.printf("GET /%s HTTP/1.0\r\n", ntripRequestMount.c_str());
  ntrip.printf("User-Agent: NTRIP rtk-walker/1.0\r\n");
  ntrip.printf("Authorization: Basic %s\r\n", auth.c_str());
  ntrip.printf("Accept: */*\r\n");
  ntrip.printf("Connection: close\r\n\r\n");
  ntripClearRequestSnapshot();
  ntripClearHeader();
  ntripHandshakeDeadlineMs = millis() + NTRIP_HANDSHAKE_TIMEOUT_MS;
  ntripState = NTRIP_WAIT_HEADER;
}

static void ntripFinishHandshake() {
  switch (ntripClassifyHeader(ntripHeader)) {
    case NTRIP_HEADER_SOURCETABLE:
      weblogf("[ntrip] mountpoint unknown (SOURCETABLE response). Check the mountpoint config.\n");
      ntripEnterBackoff(true);
      return;
    case NTRIP_HEADER_REJECT:
      weblogf("[ntrip] handshake failed: %s", ntripHeader);
      ntripEnterBackoff(true);
      return;
    case NTRIP_HEADER_STREAM:
      weblogf("[ntrip] handshake OK\n");
      // Force the first GGA push to land immediately rather than
      // waiting a full NTRIP_GGA_INTERVAL_MS. VRS mountpoints stay
      // in "no virtual base" mode until they see at least one GGA.
      ntripGgaLastSentMs = millis() - NTRIP_GGA_INTERVAL_MS;
      ntripGgaUploadLogged = false;
      ntripClearHeader();
      ntripState = NTRIP_STREAMING;
      return;
  }
}

static void ntripPumpHandshake() {
  if (!ntrip.connected() && ntrip.available() <= 0) {
    weblogf("[ntrip] disconnected during handshake\n");
    ntripEnterBackoff(false);
    return;
  }

  uint32_t nowMs = millis();
  if (ntripTimeReached(nowMs, ntripHandshakeDeadlineMs)) {
    weblogf("[ntrip] handshake timeout\n");
    ntripEnterBackoff(true);
    return;
  }

  size_t budget = NTRIP_HEADER_BYTES_PER_PUMP;
  while (budget-- > 0 && ntrip.available()) {
    int b = ntrip.read();
    if (b < 0) break;
    if (ntripHeaderLen >= NTRIP_HEADER_MAX) {
      weblogf("[ntrip] handshake header too large; aborting\n");
      ntripEnterBackoff(true);
      return;
    }
    ntripHeader[ntripHeaderLen++] = (char) b;
    ntripHeader[ntripHeaderLen] = '\0';
    if (ntripHeaderComplete()) {
      ntripFinishHandshake();
      return;
    }
  }

  nowMs = millis();
  if (ntripTimeReached(nowMs, ntripHandshakeDeadlineMs)) {
    weblogf("[ntrip] handshake timeout\n");
    ntripEnterBackoff(true);
    return;
  }

  if (!ntrip.connected() && ntrip.available() <= 0) {
    weblogf("[ntrip] disconnected during handshake\n");
    ntripEnterBackoff(false);
  }
}

// Push the most recent GGA back up the NTRIP socket. Required by VRS and
// NEAREST mountpoints so the caster knows where the rover is. Skipped
// while we have no GGA yet (cold start) and rate-limited to one upload
// per NTRIP_GGA_INTERVAL_MS regardless of how fast the LC29HDA emits.
static void ntripPushGga() {
  if (!ntrip.connected()) return;
  if (lastGgaLen == 0) return;
  uint32_t now = millis();
  if (now - ntripGgaLastSentMs < NTRIP_GGA_INTERVAL_MS) return;
  // First upload after handshake gets a single log line so a stuck-FLOAT
  // user can confirm "yes, we are talking to the VRS". Subsequent pushes
  // are silent.
  if (!ntripGgaUploadLogged) {
    weblogf("[ntrip] uploading GGA → caster (VRS / NEAREST support)\n");
    ntripGgaUploadLogged = true;
  }
  ntripGgaLastSentMs = now;
  // The buffered line has no trailing CRLF — NTRIP rev2 spec wants one,
  // and most casters refuse the upload otherwise. Send as a single write
  // to keep TCP segmentation tidy.
  ntrip.write((const uint8_t*) lastGgaLine, lastGgaLen);
  ntrip.write((const uint8_t*) "\r\n", 2);
}

static void ntripPump() {
  coreLock();
  bool useNtrip = cfg.useNtripCorrections;
  coreUnlock();
  if (!ntripReadyToRun()) {
    if (!useNtrip) {
      // LoRa is the selected correction source — NTRIP intentionally idle.
      if (!ntripSuppressedLogged) {
        weblogf("[ntrip] idle: LoRa is the selected correction source\n");
        ntripSuppressedLogged = true;
      }
    } else {
      ntripSuppressedLogged = false;
    }
    if (ntripState != NTRIP_IDLE || ntrip.connected()) {
      ntripEnterIdle(true);
    }
    return;
  }
  ntripSuppressedLogged = false;

  switch (ntripState) {
    case NTRIP_IDLE:
      if (!ntripTimeReached(millis(), ntripBackoffUntilMs)) {
        ntripState = NTRIP_BACKOFF;
        return;
      }
      ntripStartTcpConnect();
      return;

    case NTRIP_BACKOFF:
      if (!ntripTimeReached(millis(), ntripBackoffUntilMs)) return;
      ntripState = NTRIP_IDLE;
      ntripStartTcpConnect();
      return;

    case NTRIP_TCP_CONNECTING:
      // connect() is synchronous, so this state should only be visible
      // inside ntripStartTcpConnect(). Recover defensively if observed.
      if (ntrip.connected()) {
        ntripState = NTRIP_SEND_REQUEST;
      } else {
        ntripEnterBackoff(false);
      }
      return;

    case NTRIP_SEND_REQUEST:
      ntripSendRequest();
      return;

    case NTRIP_WAIT_HEADER:
      ntripPumpHandshake();
      return;

    case NTRIP_STREAMING:
      break;
  }

  if (!ntrip.connected()) {
    weblogf("[ntrip] stream disconnected\n");
    ntripEnterBackoff(false);
    return;
  }

  ntripPushGga();
  // Drain everything the TCP socket has pending each loop iter. The old
  // 1 KB-per-iter budget was added to defend against a 250 KB sourcetable
  // response flooding the UART, but that's now caught one layer up in
  // the handshake state (it aborts when it sees `SOURCETABLE`), so by
  // the time we're here we know it's RTCM. Throttling becomes harmful:
  // NL multi-constellation VRS streams (Centipede NLDB, MSM4/5 + 1019
  // + 1005/1006 + 1230) burst at 2-3 KB/s. With tftTick + LVGL pushing
  // each loop iter into the tens-of-ms range, 1 KB/iter falls behind and
  // RTCM accumulates in the TCP buffer — corrections then arrive at the
  // LC29HDA seconds late, which kills the carrier-phase ambiguity
  // resolution. Field-observed regression: RTK FLOAT never resolves to
  // FIX even with 30 sats / good HDOP, exactly the symptom the original
  // (un-budgeted) loop did not have.
  while (ntrip.available()) {
    // Backpressure: only read what the GNSS TX queue can absorb right now.
    // NTRIP arrives in bursts (NL VRS can dump several KB at once, especially
    // the post-connect backlog). Each queue item holds up to 256 B; reading
    // more than freeSlots*256 overflows the queue and drops RTCM mid-message,
    // which garbles the corrections — the LC29HDA then rejects them and never
    // resolves a fix (observed: dropped=21, sats→0). Leftover bytes stay
    // buffered in the TCP socket (TCP flow-controls the caster) and are read
    // next iteration once the realtime pump has drained the queue.
    size_t freeSlots = walkerGnssTxFreeSlots();
    if (freeSlots == 0) break;
    uint8_t chunk[512];
    size_t want = freeSlots * 256;
    if (want > sizeof(chunk)) want = sizeof(chunk);
    int n = ntrip.read(chunk, want);
    if (n <= 0) break;
    // NTRIP is the selected source here (ntripReadyToRun gated on it) and the
    // LoRa relay's GNSS feed is disabled while NTRIP is active, so forward
    // unconditionally — the two sources can't fight on the UART, and the read
    // above guarantees this enqueue fits without dropping.
    walkerGnssTxQueueRtcmFromNtrip(chunk, n);
    rtcmLogAppend(chunk, n, RTCM_SRC_NTRIP);
    coreLock();
    st.ntripBytes += n;
    coreUnlock();
  }
}

// ── GNSS pump ───────────────────────────────────────────────────────
static uint32_t lastNmeaStatsMs = 0;
static uint32_t nmeaBytesThisSec = 0;
// Definitions for the forward-declared gating flags up by the NTRIP pump.
uint32_t lastGnssByteMs = 0;   // ms of the most recent byte from the LC29HDA — drives the "no GNSS" overlay
bool     gnssDetected = false; // flips true on the first byte ever — gates PAIR command, heartbeat, NTRIP

// WiFi fail state — set by setup() when a configured SSID fails to
// associate within the 20 s deadline. Surfaced via walkerGetSnapshot
// so the TFT can show a dismissable amber banner instead of silently
// falling back to AP mode.
static bool   wifiConnectFailed = false;
static String wifiFailReason;

// Battery state — sampled by batteryPump() every BAT_SAMPLE_MS.
// `BAT_ADC` arrives from platformio.ini; only the TFT target has the
// JC3248W535 board with a divider on GPIO 5, so the sampling code is
// gated behind that macro. EMA-smoothing kills the noise floor that
// otherwise wobbles the percentage by ~2 % between samples.
#ifdef BAT_ADC
#define BAT_SAMPLE_MS  2000
// Empirically calibrated against a multimeter on the JC3248W535EN
// (USB unplugged, no charging current confusing the reading):
//   V_bat = 4.10 V, ADC = 2.333 V → multiplier = 1.76
// Plugging in USB raises the measured rail by ~120 mV, so the divider
// isn't quite on the cell directly but on a node that follows VOUT-BAT.
// Close enough for a % indicator. Re-calibrate this constant with a
// fresh multimeter reading if the board layout changes.
#define BAT_DIVIDER_MULT  1.76f
static bool     batteryReady = false;
static float    batteryVoltsEma = 0.0f;
static uint32_t batteryLastSampleMs = 0;
// Charging detection via a 30 s ring buffer + a hard 4.18 V threshold.
// IP5306 has no I2C status pin on this PCB, so we infer charging from
// the rail voltage: USB plugged in pushes the divider reading ~200 mV
// higher (above what a LiPo at rest ever reaches), and during CC-phase
// charging the cell trends upward by tens of mV per minute.
#define BAT_HIST_LEN     15           // 15 samples * 2s = 30 s window
#define BAT_CHARGE_TREND 0.030f       // rise of 30 mV over the window = charging
#define BAT_CHARGE_THRESH 4.18f       // absolute voltage above this can only mean USB power
static float    batteryHist[BAT_HIST_LEN] = {0};
static uint8_t  batteryHistIdx = 0;
static uint8_t  batteryHistFilled = 0;
static bool     batteryCharging = false;
#endif

static uint32_t gnssDetectedAtMs = 0; // millis() when first byte arrived (used to delay the post-detect PAIR queries)
static bool     pair021Sent = false; // firmware version query
static uint32_t pair021LastTxMs = 0;
static uint8_t  pair021TxCount = 0;
static bool     pair050_1HzSent = false; // true once at least one 1 Hz command was sent
// PAIR050 rate-config ACK state. The LC29HDA silently drops the cmd
// if its serial parser is busy, so keep retrying until PAIR001,050,0
// ACK is observed. Confirmation goes into gnss5HzAcked (legacy field
// name) so the UI can show whether the 1 Hz rate command really landed.
static uint32_t pair050LastTxMs = 0;
static uint8_t  pair050TxCount  = 0;
static bool     pair050Acked    = false;
static uint32_t pair050AckedAtMs = 0;
static bool     pair050RateReady = false;
// PAIR080,1 = Fitness/pedestrian nav mode. The walker is handheld at walking
// speed; the default Normal model (tuned for driving) drops RTK fix under
// handheld motion. Set once at boot, ACK-gated, never reasserted at runtime
// (changing nav mode resets the solution, so it must be set before/while the
// module acquires from a clean boot — not mid-run).
static uint32_t pair080LastTxMs = 0;
static uint8_t  pair080TxCount  = 0;
static bool     pair080Acked    = false;
static uint32_t lastRateReassertMs = 0;

// PAIR511 = save navigation data (ephemeris + last position + time + almanac)
// from RTC RAM to module NVM. Without this, every reboot is effectively cold
// start because the LC29HDA's RTC RAM loses its ephemeris when V_BCKP is cut.
// With periodic saves the module reads NVM on next boot and does a WARM start:
// TTFF drops from ~5-50 min (cold) to ~5-30 sec (warm). Trigger: after the
// module has held any valid fix (>=1) for 30 s, then every 5 min while fix
// remains. No retry: PAIR511 is best-effort and a missed save just means the
// next boot uses slightly older ephemeris.
static uint32_t pair511LastTxMs        = 0;
static uint32_t pair511FirstFixAtMs    = 0;
static uint32_t pair511SaveCount       = 0;
static const uint32_t PAIR511_INTERVAL_MS = 300000;  // 5 min between saves
static const uint32_t PAIR511_WARMUP_MS   = 30000;   // 30 s after first fix

static void gnssPump() {
  walkerGnssTxPump();

  while (gnssSerial.available()) {
    char c = gnssSerial.read();
    gps.encode(c);
    gnssLineFeed(c);
#if DEBUG_NMEA_ECHO
    Serial.write(c);
#endif
    nmeaBytesThisSec++;
    lastGnssByteMs = millis();
    if (!gnssDetected) {
      gnssDetected = true;
      gnssDetectedAtMs = lastGnssByteMs;
      weblogf("[gnss] module detected — first byte after %lu ms\n", (unsigned long) lastGnssByteMs);
    }
  }
  // No module → don't waste cycles or log noise. The TFT overlay covers
  // the user-facing "you forgot to plug it in" hint already, and the
  // moment a single byte arrives we drop back into normal flow.
  if (!gnssDetected) return;

  // Post-detect commands. PAIR021 (firmware-version query) for diagnostics,
  // plus PAIR050,1000 to force the LC29HDA back to 1 Hz fix rate every
  // boot. The module persists its last PAIR050 setting in NV memory, so
  // an older firmware that wrote 200 ms (5 Hz) keeps that rate across
  // power cycles even after we strip the 5 Hz command from this code.
  // PAIR050,200 (5 Hz) was tried but it choked the RTCM correction
  // pipeline: the module couldn't keep RTK FLOAT->FIX lock when its
  // position engine was running 5x faster, and the user lost RTK fix
  // entirely (31 sats, HDOP 0.49, no fix in 5 min). At 1 Hz the same
  // setup fixes inside a minute. So we stay at 1 Hz, and density comes
  // from the 2 cm displacement filter instead.
  uint32_t nowCfgMs = millis();
  uint32_t sinceDetect = nowCfgMs - gnssDetectedAtMs;
  if (sinceDetect >= 500 && gnssVariant == GNSS_VARIANT_UNKNOWN && pair021TxCount < 5) {
    uint32_t retryMs = (pair021TxCount < 5) ? 1000 : 10000;
    if (pair021TxCount == 0 || nowCfgMs - pair021LastTxMs >= retryMs) {
      // Legacy version query — older firmware (NR11A03S and earlier) replies
      // with a $PAIR020 line containing "LC29HxA" which triggers variant
      // detection. NR11A04S still ACKs PAIR021 but no longer auto-emits the
      // version sentence, so we ALSO send the new $PQTMVERNO query which
      // NR11A04S responds to with "$PQTMVERNO,LC29HDANR11A04S_RSA,...". The
      // variant matcher accepts either pattern. Sending both keeps backward
      // compatibility with older module firmware while unblocking the new one.
      sendGnssCommand("PAIR021");
      sendGnssCommand("PQTMVERNO");
      pair021Sent = true;
      pair021LastTxMs = nowCfgMs;
      if (pair021TxCount < UINT8_MAX) pair021TxCount++;
      weblogf("[gnss] version query attempt %u (PAIR021 + PQTMVERNO)\n",
              (unsigned) pair021TxCount);
    }
  }
  // 1000 ms = 1 Hz. The LC29HDA *-DA* variant is hardware-locked to 1 Hz
  // RTK regardless of what PAIR050 says (Quectel LC29H Hardware Design
  // datasheet + DR&RTK App Note v1.2.0: "LC29H (DA) only supports RTK
  // (Max update rate: 1 Hz)"). Sending a faster value makes the parser
  // ACK but the RTK engine still runs at 1 Hz and interpolates PVT
  // epochs between, which corrupts the FLOAT->FIX lock entirely. Our
  // 5 Hz / 2 Hz attempts both fell back to FLOAT-only with 28+ sats.
  // True 5 Hz RTK requires LC29HEA (different SKU, same footprint).
  // Density at 1 Hz is recovered server-side via polygon densification
  // + a tight displacement filter that keeps real-but-small movements.
  bool enforceDa1Hz = (gnssVariant != GNSS_VARIANT_HEA) &&
                      (gnssVariant != GNSS_VARIANT_UNKNOWN || sinceDetect >= 3000);
  if (sinceDetect >= 700 && enforceDa1Hz && !pair050Acked && pair050TxCount < 4) {
    uint32_t retryMs = (pair050TxCount < 4) ? 2000 : 15000;
    if (pair050TxCount == 0 || nowCfgMs - pair050LastTxMs >= retryMs) {
      sendGnssCommand("PAIR050,1000");
      pair050_1HzSent = true;
      pair050LastTxMs = nowCfgMs;
      if (pair050TxCount < UINT8_MAX) pair050TxCount++;
      weblogf("[gnss] PAIR050 1 Hz attempt %u\n", (unsigned) pair050TxCount);
    }
  }
  if (!pair050Acked && pair050TxCount > 0 && pair050AckOkSince(pair050LastTxMs)) {
    pair050Acked = true;
    pair050AckedAtMs = millis();
    pair050RateReady = true;
    weblogf("[gnss] PAIR050 ACKed after %u attempt(s)\n", (unsigned) pair050TxCount);
  }

  // Assert the configured nav mode (PAIR080,<gnssNavMode>; default 1=Fitness)
  // once at boot. The walker walks; the LC29HDA's default Normal model drops
  // RTK fix under handheld motion. Sent only at startup (variant known, module
  // still acquiring), so the nav-mode change can't reset an established
  // solution mid-run. ACK is $PAIR001,080,0. Never reasserted at runtime; a
  // config change resets pair080* (below) so this re-asserts the new mode.
  if (sinceDetect >= 800 && gnssVariant != GNSS_VARIANT_UNKNOWN &&
      !pair080Acked && pair080TxCount < 4) {
    uint32_t retryMs = (pair080TxCount < 4) ? 2000 : 15000;
    if (pair080TxCount == 0 || nowCfgMs - pair080LastTxMs >= retryMs) {
      char navCmd[16];
      snprintf(navCmd, sizeof(navCmd), "PAIR080,%u", (unsigned) cfg.gnssNavMode);
      sendGnssCommand(navCmd);
      pair080LastTxMs = nowCfgMs;
      if (pair080TxCount < UINT8_MAX) pair080TxCount++;
      weblogf("[gnss] PAIR080 nav-mode %u attempt %u\n",
              (unsigned) cfg.gnssNavMode, (unsigned) pair080TxCount);
    }
  }
  if (!pair080Acked && pair080TxCount > 0 && pair080AckOkSince(pair080LastTxMs)) {
    pair080Acked = true;
    weblogf("[gnss] PAIR080 nav-mode %u ACKed after %u attempt(s)\n",
            (unsigned) cfg.gnssNavMode, (unsigned) pair080TxCount);
  }

  // PAIR511 = persist current navigation data (ephemeris + last position +
  // time + almanac) to LC29HDA NVM so the next boot is a WARM start. See
  // pair511* state vars above for the timing/why. Snapshot fix quality under
  // coreLock — st.fix is touched from the parser side and isn't atomic.
  int currentFixForSave;
  { coreLock(); currentFixForSave = st.fix; coreUnlock(); }
  if (currentFixForSave >= 1) {
    if (pair511FirstFixAtMs == 0) pair511FirstFixAtMs = nowCfgMs;
    uint32_t sinceFirstFix = nowCfgMs - pair511FirstFixAtMs;
    if (sinceFirstFix >= PAIR511_WARMUP_MS) {
      bool dueForSave = (pair511LastTxMs == 0) ||
                        (nowCfgMs - pair511LastTxMs >= PAIR511_INTERVAL_MS);
      if (dueForSave) {
        sendGnssCommand("PAIR511");
        pair511LastTxMs = nowCfgMs;
        if (pair511SaveCount < UINT32_MAX) pair511SaveCount++;
        weblogf("[gnss] PAIR511 save nav-data to NVM (#%u, fix=%d)\n",
                (unsigned) pair511SaveCount, currentFixForSave);
      }
    }
  }

  if (enforceDa1Hz && gnssRateHz > 2 && sinceDetect >= 5000 &&
      (lastRateReassertMs == 0 || nowCfgMs - lastRateReassertMs >= 10000)) {
    weblogf("[gnss] measured %u Hz after 1 Hz request; reasserting PAIR050,1000\n",
            (unsigned) gnssRateHz);
    pair050Acked = false;
    pair050AckedAtMs = 0;
    pair050RateReady = false;
    pair050TxCount = 0;
    pair050LastTxMs = 0;
    lastRateReassertMs = nowCfgMs;
  }
#if NMEA_HEARTBEAT
  // Periodic heartbeat so you can tell "no bytes" apart from "bytes
  // flowing but no fix indoors". Every 2 s prints a one-liner with
  // bytes-since-last-tick + current sat count. Goes through weblogf()
  // so the phone keeps seeing it after USB is unplugged.
  uint32_t nowMs = millis();
  if (nowMs - lastNmeaStatsMs >= 2000) {
    coreLock();
    int satsLog = st.sats;
    int fixLog = st.fix;
    double hdopLog = st.hdop;
    double dgpsAgeLog = st.dgpsAge;
    int dgpsStationLog = st.dgpsStation;
    uint32_t lastFixLog = st.lastFixMs;
    coreUnlock();
    weblogf("[nmea] rx=%u bytes / 2s, sats=%d, fix=%d, hdop=%.1f, dgpsAge=%.1f, dgpsSt=%d, lastFixAgo=%ldms\n",
            nmeaBytesThisSec, satsLog, fixLog, hdopLog,
            dgpsAgeLog, dgpsStationLog,
            lastFixLog ? (long)(nowMs - lastFixLog) : -1L);
    nmeaBytesThisSec = 0;
    lastNmeaStatsMs = nowMs;
  }
#endif
#ifdef LORA_PRESENT
  // LoRa RTCM-relay heartbeat: every 2 s show whether we're hearing the
  // charger. During bench bring-up the walker's web UI / RTCM console may
  // sit on an isolated IoT VLAN, so the serial console is the only way to
  // confirm frame reception. Only prints once the module ACK'd at boot.
  static uint32_t lastLoraStatsMs = 0;
  uint32_t nowLora = millis();
  if (nowLora - lastLoraStatsMs >= 2000) {
    WalkerLoraStats ls;
    walkerLoraGetStats(ls);
    if (ls.moduleReady) {
      char rawHex[2 * 32 + 1];
      walkerLoraGetRawTailHex(rawHex, sizeof(rawHex));
      weblogf("[lora] raw=%lu frames=%lu rejected=%lu bytesFwd=%lu rtcm=%lu crcBad=%lu lastRtcmType=%u active=%d lastFrameAgo=%ldms lastRtcmAgo=%ldms tail=%s\n",
              (unsigned long) ls.rawBytesIn, (unsigned long) ls.framesReceived,
              (unsigned long) ls.framesRejected, (unsigned long) ls.bytesForwarded,
              (unsigned long) ls.rtcmMessages, (unsigned long) ls.rtcmCrcRejected,
              (unsigned) ls.lastRtcmType,
              (int) ls.active,
              ls.lastFrameMsAgo == UINT32_MAX ? -1L : (long) ls.lastFrameMsAgo,
              ls.lastRtcmMsAgo == UINT32_MAX ? -1L : (long) ls.lastRtcmMsAgo,
              rawHex);
    }
    lastLoraStatsMs = nowLora;
  }
#endif
  // GGA fix quality custom field updates whenever a new GGA sentence
  // is parsed. We mirror it into Status only when we have a full new
  // sentence, otherwise we'd race against half-parsed values.
  if (gps.location.isUpdated()) {
    int fixNow;
    int satsNow;
    double latNow;
    double lngNow;
    double altNow;
    double hdopNow;
    uint32_t lastFixNow;
    coreLock();
    st.lat  = gps.location.lat();
    st.lng  = gps.location.lng();
    st.alt  = gps.altitude.isValid() ? gps.altitude.meters() : st.alt;
    st.sats = gps.satellites.isValid() ? gps.satellites.value() : st.sats;
    st.hdop = gps.hdop.isValid() ? gps.hdop.hdop() : st.hdop;
    if (ggaFixQuality.isUpdated() && ggaFixQuality.value()[0]) {
      st.fix = atoi(ggaFixQuality.value());
    } else if (ggaFixQualityGP.isUpdated() && ggaFixQualityGP.value()[0]) {
      st.fix = atoi(ggaFixQualityGP.value());
    }
    if (ggaDiffAge.isUpdated()) {
      const char* v = ggaDiffAge.value();
      st.dgpsAge = (v && v[0]) ? atof(v) : -1;
    } else if (ggaDiffAgeGP.isUpdated()) {
      const char* v = ggaDiffAgeGP.value();
      st.dgpsAge = (v && v[0]) ? atof(v) : -1;
    }
    if (ggaStationId.isUpdated()) {
      const char* v = ggaStationId.value();
      st.dgpsStation = (v && v[0]) ? atoi(v) : -1;
    } else if (ggaStationIdGP.isUpdated()) {
      const char* v = ggaStationIdGP.value();
      st.dgpsStation = (v && v[0]) ? atoi(v) : -1;
    }
    st.lastFixMs = millis();
    latNow = st.lat;
    lngNow = st.lng;
    altNow = st.alt;
    fixNow = st.fix;
    satsNow = st.sats;
    hdopNow = st.hdop;
    lastFixNow = st.lastFixMs;
    appendPoint();
    coreUnlock();
    // Feed the new session recorder. No-op when recorder is idle, so
    // this costs essentially nothing when we're not actively capturing
    // a work/obstacle/channel session. Uses the same NMEA-decoded fix
    // quality the legacy track-* logger already filters on (st.fix
    // from $GxGGA field 6) so quality gating stays consistent across
    // the two pipelines until Task 11 retires the legacy logger.
    recorder.onFix(
        (unsigned long)(lastFixNow / 1000UL),
        latNow, lngNow, altNow,
        fixNow, satsNow, hdopNow
    );
  }
}

static TaskHandle_t realtimePumpTaskHandle = nullptr;
static TaskHandle_t webServerTaskHandle = nullptr;

static void realtimePumpTask(void*) {
  for (;;) {
    gnssPump();
    walkerLoraPump();
    // Keep UART service cadence independent from WebServer/LVGL work.
    vTaskDelay(pdMS_TO_TICKS(2));
  }
}

static void startRealtimePumpTask() {
  if (realtimePumpTaskHandle) return;
  BaseType_t ok = xTaskCreatePinnedToCore(
      realtimePumpTask,
      "GNSS LoRa",
      6 * 1024,
      NULL,
      1,
      &realtimePumpTaskHandle,
      1);
  if (ok == pdPASS) {
    weblogf("[rt] GNSS/LoRa pump task started\n");
  } else {
    weblogf("[rt] GNSS/LoRa pump task start failed\n");
  }
}

static void webServerTask(void*) {
  for (;;) {
    server.handleClient();
    vTaskDelay(pdMS_TO_TICKS(2));
  }
}

static void startWebServerTask() {
  if (webServerTaskHandle) return;
  BaseType_t ok = xTaskCreatePinnedToCore(
      webServerTask,
      "HTTP",
      10 * 1024,
      NULL,
      1,
      &webServerTaskHandle,
      0);
  if (ok == pdPASS) {
    weblogf("[http] server task started\n");
  } else {
    weblogf("[http] server task start failed\n");
  }
}

static void pumpRealtimeFallbackOnce() {
  if (realtimePumpTaskHandle) return;
  gnssPump();
  walkerLoraPump();
}

// ── Battery monitor ─────────────────────────────────────────────────
#ifdef BAT_ADC
// 3.7 V LiPo discharge curve - piecewise linear, accurate enough for
// a status pill. Voltages assume the cell is at rest (a few seconds
// idle, no big TX bursts). Heavy WiFi load drops the rail ~50 mV;
// the EMA smooths the spikes back out.
static int batteryPercentFromVolts(float v) {
  static const struct { float v; int pct; } curve[] = {
    {4.20f, 100}, {4.10f, 90}, {4.00f, 80}, {3.90f, 70}, {3.80f, 60},
    {3.70f, 50},  {3.60f, 35}, {3.50f, 20}, {3.40f, 10}, {3.30f, 5},
    {3.00f, 0},
  };
  if (v >= curve[0].v) return 100;
  for (size_t i = 0; i < sizeof(curve)/sizeof(curve[0]) - 1; i++) {
    float vh = curve[i].v, vl = curve[i+1].v;
    if (v >= vl) {
      float frac = (v - vl) / (vh - vl);
      int   ph = curve[i].pct, pl = curve[i+1].pct;
      return (int) (pl + frac * (ph - pl));
    }
  }
  return 0;
}

static void batteryPump() {
  uint32_t nowMs = millis();
  if (batteryReady && (nowMs - batteryLastSampleMs) < BAT_SAMPLE_MS) return;
  batteryLastSampleMs = nowMs;

  // analogReadMilliVolts uses the per-chip eFuse calibration so the
  // reading is in real millivolts at the ADC pin without us doing the
  // raw-to-volts maths.
  uint32_t mv = analogReadMilliVolts(BAT_ADC);
  float v = (mv / 1000.0f) * BAT_DIVIDER_MULT;
  if (!batteryReady) {
    batteryVoltsEma = v;
    batteryReady = true;
  } else {
    // Exponential moving average, alpha = 0.2. Two seconds of samples
    // converges in ~15 s, slow enough to ignore TX-burst spikes but
    // quick enough that a USB plug-in is visible on the pill in 3-5 s.
    batteryVoltsEma = batteryVoltsEma * 0.8f + v * 0.2f;
  }

  // Charging detection. Two parallel signals:
  //   1. Absolute threshold (4.18 V) - a LiPo at rest never exceeds
  //      4.20 V, so anything above 4.18 V must be USB-pumped current.
  //      Catches "just plugged in" within ~5 s.
  //   2. 30 s positive trend - oldest entry in the ring buffer vs the
  //      current EMA. Catches mid-CC-phase charging where the cell
  //      voltage rises tens of mV per minute without ever crossing
  //      the absolute threshold.
  // OR'd together: either condition is enough.
  batteryHist[batteryHistIdx] = batteryVoltsEma;
  batteryHistIdx = (batteryHistIdx + 1) % BAT_HIST_LEN;
  if (batteryHistFilled < BAT_HIST_LEN) batteryHistFilled++;

  bool aboveThreshold = batteryVoltsEma > BAT_CHARGE_THRESH;
  bool risingTrend = false;
  if (batteryHistFilled >= BAT_HIST_LEN) {
    // The slot we're about to overwrite next iteration is the oldest.
    float oldest = batteryHist[batteryHistIdx];
    risingTrend = (batteryVoltsEma - oldest) > BAT_CHARGE_TREND;
  }
  batteryCharging = aboveThreshold || risingTrend;
}
#else
static void batteryPump() {}
#endif

// ── I2C scanner + IP5306 probe ──────────────────────────────────────
// The JC3248W535 BSP installs the touch panel's I2C controller via the
// ESP-IDF native `i2c_driver_install(I2C_NUM_0)` on GPIO 4 (SDA) +
// GPIO 8 (SCL). Arduino's Wire library can't take that bus over once
// the IDF driver owns it - our first scan attempt with Wire returned
// zero ACKs even though the touch chip is obviously alive. Switch the
// probes over to the same IDF API so we ride on the bus the BSP already
// brought up.

#ifdef HAS_TFT_DISPLAY
extern "C" {
#include "driver/i2c.h"
}
#define I2C_AVAILABLE 1
// Matches BSP_I2C_NUM in src/tft/drivers/jc_bsp.h.
#define I2C_BUS_NUM   I2C_NUM_0
#else
#define I2C_AVAILABLE 0
#endif

static bool i2cProbe(uint8_t addr) {
#if I2C_AVAILABLE
  i2c_cmd_handle_t cmd = i2c_cmd_link_create();
  i2c_master_start(cmd);
  i2c_master_write_byte(cmd, (addr << 1) | I2C_MASTER_WRITE, true);
  i2c_master_stop(cmd);
  esp_err_t ret = i2c_master_cmd_begin(I2C_BUS_NUM, cmd, pdMS_TO_TICKS(8));
  i2c_cmd_link_delete(cmd);
  return ret == ESP_OK;
#else
  return false;
#endif
}

static bool i2cReadReg(uint8_t addr, uint8_t reg, uint8_t* out) {
#if I2C_AVAILABLE
  i2c_cmd_handle_t cmd = i2c_cmd_link_create();
  i2c_master_start(cmd);
  i2c_master_write_byte(cmd, (addr << 1) | I2C_MASTER_WRITE, true);
  i2c_master_write_byte(cmd, reg, true);
  i2c_master_start(cmd);
  i2c_master_write_byte(cmd, (addr << 1) | I2C_MASTER_READ, true);
  i2c_master_read_byte(cmd, out, I2C_MASTER_NACK);
  i2c_master_stop(cmd);
  esp_err_t ret = i2c_master_cmd_begin(I2C_BUS_NUM, cmd, pdMS_TO_TICKS(100));
  i2c_cmd_link_delete(cmd);
  return ret == ESP_OK;
#else
  return false;
#endif
}

// ── Button ──────────────────────────────────────────────────────────
static void buttonPump() {
  int raw = digitalRead(BUTTON_PIN);
  if (raw != lastButtonRead) {
    lastButtonRead = raw;
    lastButtonChangeMs = millis();
    return;
  }
  static int stable = HIGH;
  if (millis() - lastButtonChangeMs >= BUTTON_DEBOUNCE_MS && stable != raw) {
    stable = raw;
    if (raw == LOW) {            // press edge
      coreLock();
      bool wasRecording = st.recording;
      coreUnlock();
      if (wasRecording) stopRecording(); else startRecording();
    }
  }
}

// ── Web handlers ────────────────────────────────────────────────────
static void serviceRealtimeDuringHttp() {
  // GNSS/LoRa have a dedicated realtimePumpTask once setup is complete.
  // Before that task starts, keep boot-time HTTP responses cooperative.
  pumpRealtimeFallbackOnce();
  delay(1);
}

static void sendStringCooperatively(int code, const char* contentType, const String& body) {
  constexpr size_t kHttpChunkBytes = 512;
  constexpr size_t kHttpSingleSendBytes = 8192;
  server.sendHeader("Connection", "close");
  if (body.length() <= kHttpSingleSendBytes) {
    server.send(code, contentType, body);
    return;
  }
  server.setContentLength(body.length());
  server.send(code, contentType, "");
  for (size_t off = 0; off < body.length(); off += kHttpChunkBytes) {
    size_t n = body.length() - off;
    if (n > kHttpChunkBytes) n = kHttpChunkBytes;
    server.sendContent(body.c_str() + off, n);
    serviceRealtimeDuringHttp();
  }
}

static void sendProgmemCooperatively(int code, const char* contentType, PGM_P body) {
  constexpr size_t kHttpChunkBytes = 512;
  constexpr size_t kHttpSingleSendBytes = 8192;
  size_t len = strlen_P(body);
  server.sendHeader("Connection", "close");
  if (len <= kHttpSingleSendBytes) {
    String out;
    if (out.reserve(len)) {
      char chunkBuf[kHttpChunkBytes + 1];
      for (size_t off = 0; off < len; off += kHttpChunkBytes) {
        size_t n = len - off;
        if (n > kHttpChunkBytes) n = kHttpChunkBytes;
        memcpy_P(chunkBuf, body + off, n);
        chunkBuf[n] = '\0';
        out += chunkBuf;
      }
      server.send(code, contentType, out);
      return;
    }
  }
  server.setContentLength(len);
  server.send(code, contentType, "");
  char chunkBuf[kHttpChunkBytes + 1];
  for (size_t off = 0; off < len; off += kHttpChunkBytes) {
    size_t n = len - off;
    if (n > kHttpChunkBytes) n = kHttpChunkBytes;
    memcpy_P(chunkBuf, body + off, n);
    chunkBuf[n] = '\0';
    server.sendContent(chunkBuf, n);
    serviceRealtimeDuringHttp();
  }
}

static void sendJson(int code, const JsonDocument& doc) {
  String out;
  serializeJson(doc, out);
  sendStringCooperatively(code, "application/json", out);
}

static String authTokenSnapshot() {
  coreLock();
  String token = cfg.authToken;
  coreUnlock();
  return token;
}

static bool secureEquals(const String& a, const String& b) {
  if (a.length() != b.length()) return false;
  uint8_t diff = 0;
  for (size_t i = 0; i < a.length(); i++) {
    diff |= (uint8_t) a[i] ^ (uint8_t) b[i];
  }
  return diff == 0;
}

static String requestAuthToken() {
  String token = server.header("X-Auth-Token");
  token.trim();
  if (token.length() > 0) return token;

  String auth = server.header("Authorization");
  auth.trim();
  const String bearerPrefix = "Bearer ";
  if (auth.startsWith(bearerPrefix)) {
    token = auth.substring(bearerPrefix.length());
    token.trim();
    return token;
  }
  return String();
}

static bool requireAuth() {
  String configured = authTokenSnapshot();
  if (configured.length() == 0) {
    // First-time recovery/setup must stay possible before a token exists.
    // Only allow unauthenticated protected endpoints while the device is in
    // its WPA2 setup AP. Once it joins the normal LAN, require the operator to
    // create a token through /api/auth before config/OTA/upload endpoints work.
    bool setupApMode = (WiFi.getMode() & WIFI_AP) != 0;
    if (setupApMode) {
      static uint32_t lastWarnMs = 0;
      uint32_t now = millis();
      if (lastWarnMs == 0 || now - lastWarnMs > 30000) {
        weblogf("[auth] WARNING: no API token configured; protected endpoints are open only on setup AP\n");
        lastWarnMs = now;
      }
      return true;
    }

    server.send(403, "application/json", "{\"ok\":false,\"error\":\"api token not configured; set one via /api/auth first\"}");
    return false;
  }

  if (secureEquals(requestAuthToken(), configured)) return true;

  server.sendHeader("WWW-Authenticate", "Bearer realm=\"rtk-walker\"");
  server.send(401, "application/json", "{\"ok\":false,\"error\":\"auth required\"}");
  return false;
}

static bool validNewAuthToken(const String& token) {
  if (token.length() < 8 || token.length() > 96) return false;
  for (size_t i = 0; i < token.length(); i++) {
    unsigned char c = (unsigned char) token[i];
    if (c < 0x21 || c > 0x7e) return false;
  }
  return true;
}

static void handleAuthGet() {
  JsonDocument doc;
  doc["configured"] = authTokenSnapshot().length() > 0;
  sendJson(200, doc);
}

static void handleAuthPost() {
  if (authTokenSnapshot().length() > 0 && !requireAuth()) return;
  if (!server.hasArg("plain")) { server.send(400, "text/plain", "no body"); return; }
  JsonDocument body;
  if (deserializeJson(body, server.arg("plain"))) {
    server.send(400, "text/plain", "bad json"); return;
  }
  String token = body["token"].as<String>();
  token.trim();
  if (!validNewAuthToken(token)) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"token must be 8-96 printable ASCII chars\"}");
    return;
  }
  coreLock();
  cfg.authToken = token;
  saveConfig();
  coreUnlock();
  weblogf("[auth] API token updated\n");
  server.send(200, "application/json", "{\"ok\":true}");
}

static const char INDEX_LITE_HTML[] PROGMEM = R"LITE(
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RTK Walker</title>
<style>
  :root{color-scheme:dark;--bg:#070b12;--panel:#131b29;--line:#263244;--ok:#00d4aa;--warn:#f59e0b;--bad:#ef4444;--text:#f3f4f6;--dim:#9ca3af}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:14px;max-width:520px}
  h1{font-size:18px;margin:0 0 12px}.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px;margin-bottom:10px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.item{background:#0b111d;border:1px solid #1d2738;border-radius:6px;padding:10px}
  .label{color:var(--dim);font-size:12px}.value{font-size:18px;font-weight:700;margin-top:4px;font-variant-numeric:tabular-nums}
  .fix{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;font-weight:800}.dot{width:9px;height:9px;border-radius:50%;background:currentColor}
  .fix-4{color:var(--ok);background:rgba(0,212,170,.12)}.fix-5{color:var(--warn);background:rgba(245,158,11,.14)}.fix-1,.fix-2{color:var(--warn);background:rgba(245,158,11,.10)}.fix-0{color:var(--bad);background:rgba(239,68,68,.12)}
  .row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:14px}.row:last-child{border-bottom:0}
  a,button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:7px;padding:10px 12px;background:var(--ok);color:#02251e;font-weight:800;text-decoration:none}
  .muted{color:var(--dim);font-size:12px}.bar{height:7px;background:#111827;border-radius:999px;overflow:hidden;margin-top:8px}.bar span{display:block;height:100%;background:var(--ok);width:0}
</style>
</head>
<body>
<h1>RTK Walker</h1>
<div class="card">
  <div id="fix" class="fix fix-0"><span class="dot"></span><span id="fixText">NO FIX</span></div>
  <div class="bar"><span id="rtcmBar"></span></div>
  <div class="muted" id="stamp" style="margin-top:8px">connecting...</div>
</div>
<div class="grid">
  <div class="item"><div class="label">Satellites</div><div class="value" id="sats">-</div></div>
  <div class="item"><div class="label">HDOP</div><div class="value" id="hdop">-</div></div>
  <div class="item"><div class="label">LoRa RTCM age</div><div class="value" id="rtcm">-</div></div>
  <div class="item"><div class="label">Heap</div><div class="value" id="heap">-</div></div>
</div>
<div class="card">
  <div class="row"><span>IP</span><strong id="ip">-</strong></div>
  <div class="row"><span>WiFi RSSI</span><strong id="rssi">-</strong></div>
  <div class="row"><span>GNSS Hz</span><strong id="hz">-</strong></div>
  <div class="row"><span>LoRa frames</span><strong id="frames">-</strong></div>
  <div class="row"><span>Forwarded bytes</span><strong id="bytes">-</strong></div>
  <div class="row"><span>Lat/Lng</span><strong id="pos">-</strong></div>
</div>
<div class="card"><a href="/full">Open full UI</a></div>
<script>
const $=id=>document.getElementById(id);
function fixName(f){return f===4?'RTK FIX':f===5?'RTK FLOAT':f===2?'DGPS':f===1?'GPS':'NO FIX'}
function setFix(f){
  const el=$('fix'); el.className='fix fix-'+(f||0);
  $('fixText').textContent=fixName(f);
}
async function tick(){
  try{
    const r=await fetch('/api/status',{cache:'no-store'});
    const d=await r.json();
    setFix(d.fix);
    $('sats').textContent=d.sats??'-';
    $('hdop').textContent=d.hdop!=null?d.hdop.toFixed(2):'-';
    $('ip').textContent=d.wifiIp||'-';
    $('rssi').textContent=d.wifiRssi!=null?d.wifiRssi+' dBm':'-';
    $('hz').textContent=d.gnssHz??'-';
    $('heap').textContent=d.heapFree!=null?Math.round(d.heapFree/1024)+' KB':'-';
    $('pos').textContent=(d.lat&&d.lng)?d.lat.toFixed(7)+', '+d.lng.toFixed(7):'-';
    const l=d.lora||{};
    $('frames').textContent=l.frames??'-';
    $('bytes').textContent=l.bytes??'-';
    const age=l.lastRtcmMsAgo;
    $('rtcm').textContent=age!=null?Math.round(age/1000)+' s':'-';
    $('rtcmBar').style.width=age==null?'0%':Math.max(0,Math.min(100,100-(age/100)))+'%';
    $('stamp').textContent='updated '+new Date().toLocaleTimeString();
  }catch(e){$('stamp').textContent='offline / waiting for HTTP';}
}
setInterval(tick,1000); tick();
</script>
</body>
</html>
)LITE";

static void handleRoot() {
  sendProgmemCooperatively(200, "text/html", INDEX_LITE_HTML);
}

static void handleFullRoot() {
  sendProgmemCooperatively(200, "text/html", INDEX_HTML);
}

static void handleStatus() {
  JsonDocument doc;
  coreLock();
  doc["fix"]        = st.fix;
  doc["sats"]       = st.sats;
  doc["hdop"]       = st.hdop;
  doc["lat"]        = st.lat;
  doc["lng"]        = st.lng;
  doc["alt"]        = st.alt;
  if (st.dgpsAge >= 0) doc["dgpsAge"] = st.dgpsAge;
  else doc["dgpsAge"] = nullptr;
  if (st.dgpsStation >= 0) doc["dgpsStation"] = st.dgpsStation;
  else doc["dgpsStation"] = nullptr;
  doc["recording"]  = st.recording;
  doc["points"]     = st.recPoints;
  doc["ntripBytes"] = st.ntripBytes;
  doc["wifiSsid"]   = cfg.ssid;
  doc["ntripUp"]    = (ntripState == NTRIP_STREAMING);
  doc["walkedM"]    = walkedM;
  if (firstLat != 0 || firstLng != 0) {
    doc["closingM"] = haversineM(st.lat, st.lng, firstLat, firstLng);
  }
  doc["areaM2"]     = lastAreaM2;
  doc["gnssHz"]     = gnssRateHz;
  doc["gnss5HzAcked"] = pair050Acked;
  doc["gnss1HzAcked"] = pair050Acked;
  doc["gnss1HzReady"] = pair050RateReady;
  doc["gnss1HzSaveStage"] = 0;
  doc["gnss1HzAttempts"] = pair050TxCount;
  doc["gnssWalkModeAcked"] = pair080Acked;       // PAIR080 nav mode set at boot
  doc["gnssWalkModeAttempts"] = pair080TxCount;
  // PAIR511 nav-data persistence — for TTFF debugging. saveCount = total
  // times PAIR511 was sent this session. lastSaveAgoSec = seconds since the
  // most recent save (or -1 if never). The next reboot's TTFF should be a
  // warm start as long as a save happened recently.
  doc["gnssNvmSaveCount"]   = pair511SaveCount;
  doc["gnssNvmLastSaveAgoSec"] = pair511LastTxMs == 0
      ? -1
      : (int) ((millis() - pair511LastTxMs) / 1000);
  doc["gnssNvmLastSaveAckedAgoSec"] = pair511AckOkAtMs == 0
      ? -1
      : (int) ((millis() - pair511AckOkAtMs) / 1000);
  doc["gnssNavMode"] = cfg.gnssNavMode;          // active PAIR080 mode (1=Fitness default)
  doc["gnssVariant"] =
    (gnssVariant == GNSS_VARIANT_HEA) ? "LC29HEA" :
    (gnssVariant == GNSS_VARIANT_HDA) ? "LC29HDA" :
    (gnssVariant == GNSS_VARIANT_OTHER) ? "other" : "unknown";
  JsonObject gnss = doc["gnss"].to<JsonObject>();
  uint32_t statusNowMs = millis();
  gnss["ggaSentences"] = ggaSentenceCount;
  gnss["ggaFix"] = ggaLastFix;
  gnss["ggaPrevFix"] = ggaPrevFix;
  gnss["ggaFixTransitions"] = ggaFixTransitionCount;
  if (ggaLastStatusMs) gnss["lastGgaMsAgo"] = statusNowMs - ggaLastStatusMs;
  else gnss["lastGgaMsAgo"] = nullptr;
  if (ggaLastFixChangeMs) gnss["lastGgaFixChangeMsAgo"] = statusNowMs - ggaLastFixChangeMs;
  else gnss["lastGgaFixChangeMsAgo"] = nullptr;
  gnss["lastPair001Cmd"] = lastPair001Cmd;
  gnss["lastPair001Result"] = lastPair001Result;
  if (lastPair001AtMs) gnss["lastPair001MsAgo"] = statusNowMs - lastPair001AtMs;
  else gnss["lastPair001MsAgo"] = nullptr;
  doc["authConfigured"] = cfg.authToken.length() > 0;
  // viewingSlot mirrors the on-device "currently loaded saved map" state
  // so the web UI can highlight the active row in its Maps list without
  // a separate poll.
  doc["viewingSlot"] = tft_ui_current_view_slot();
  uint16_t statusLoraAddr = cfg.loraAddr;
  uint8_t statusLoraChannel = cfg.loraChannel;
  uint8_t statusLoraPacketLenCode = cfg.loraPacketLenCode;
  uint8_t statusLoraAirRateCode = cfg.loraAirRateCode;
  bool statusLoraRtcmOnlyFeed = cfg.loraRtcmOnlyFeed;
  bool statusLoraDirectGnssWrite = cfg.loraDirectGnssWrite;
  bool statusUseNtripCorrections = cfg.useNtripCorrections;
#ifdef BAT_ADC
  if (batteryReady) {
    doc["batteryVolts"]    = batteryVoltsEma;
    doc["batteryPercent"]  = batteryPercentFromVolts(batteryVoltsEma);
    doc["batteryCharging"] = batteryCharging;
  }
#endif
  coreUnlock();
  if (WiFi.status() == WL_CONNECTED) {
    doc["wifiIp"] = WiFi.localIP().toString();
    doc["wifiRssi"] = WiFi.RSSI();
  } else if (WiFi.getMode() == WIFI_AP) {
    doc["wifiIp"] = WiFi.softAPIP().toString();
    doc["wifiRssi"] = nullptr;
  } else {
    doc["wifiIp"] = "";
    doc["wifiRssi"] = nullptr;
  }
  doc["heapFree"] = ESP.getFreeHeap();
  doc["heapMin"] = ESP.getMinFreeHeap();
  WalkerLoraStats lstats;
  walkerLoraGetStats(lstats);
  JsonObject lora = doc["lora"].to<JsonObject>();
  lora["active"]      = lstats.active;
  lora["moduleReady"] = lstats.moduleReady;
  lora["bytes"]       = lstats.bytesForwarded;
  lora["frames"]      = lstats.framesReceived;
  lora["rejected"]    = lstats.framesRejected;
  lora["raw"]         = lstats.rawBytesIn;
  if (lstats.lastFrameMsAgo != UINT32_MAX) lora["lastFrameMsAgo"] = lstats.lastFrameMsAgo;
  else lora["lastFrameMsAgo"] = nullptr;
  lora["rtcmMessages"] = lstats.rtcmMessages;
  lora["rtcmForwardedMessages"] = lstats.rtcmForwardedMessages;
  lora["rtcmFilteredMessages"] = lstats.rtcmFilteredMessages;
  lora["rtcmCrcRejected"] = lstats.rtcmCrcRejected;
  lora["rtcmLastGapMs"] = lstats.rtcmLastGapMs;
  lora["rtcmMaxGapMs"] = lstats.rtcmMaxGapMs;
  if (lstats.lastRtcmMsAgo != UINT32_MAX) lora["lastRtcmMsAgo"] = lstats.lastRtcmMsAgo;
  else lora["lastRtcmMsAgo"] = nullptr;
  lora["lastRtcmType"] = lstats.lastRtcmType;
  JsonArray rtcmTypes = lora["rtcmTypes"].to<JsonArray>();
  for (uint8_t i = 0; i < WALKER_LORA_RTCM_TYPE_SLOTS; i++) {
    if (lstats.rtcmTypes[i].type == 0 || lstats.rtcmTypes[i].count == 0) continue;
    JsonObject t = rtcmTypes.add<JsonObject>();
    t["type"] = lstats.rtcmTypes[i].type;
    t["count"] = lstats.rtcmTypes[i].count;
    if (lstats.rtcmTypes[i].lastMsAgo != UINT32_MAX) t["lastMsAgo"] = lstats.rtcmTypes[i].lastMsAgo;
    else t["lastMsAgo"] = nullptr;
    t["lastGapMs"] = lstats.rtcmTypes[i].lastGapMs;
    t["maxGapMs"] = lstats.rtcmTypes[i].maxGapMs;
  }
  lora["addr"]        = statusLoraAddr;
  lora["channel"]     = statusLoraChannel;
  lora["packetLen"]   = loraPacketLenBytes(statusLoraPacketLenCode);
  lora["airRateCode"] = statusLoraAirRateCode;
  lora["rtcmOnlyFeed"] = lstats.rtcmOnlyFeed;
  lora["feedPolicy"] = lstats.rtcmOnlyFeed ? "rtcm_only" : "raw_0x31";
  lora["configuredRtcmOnlyFeed"] = statusLoraRtcmOnlyFeed;
  JsonArray rtcmDropTypes = lora["rtcmDropTypes"].to<JsonArray>();
  for (uint8_t i = 0; i < lstats.rtcmDropTypeCount; i++) {
    rtcmDropTypes.add(lstats.rtcmDropTypes[i]);
  }
  lora["directGnssWrite"] = lstats.directGnssWrite;
  lora["txMode"] = lstats.directGnssWrite ? "legacy_direct" : "queued";
  lora["configuredDirectGnssWrite"] = statusLoraDirectGnssWrite;
  lora["correctionSource"] = statusUseNtripCorrections ? "ntrip" : "lora";
  lora["feedingGnss"] = walkerLoraFeedToGnss();
  WalkerGnssTxStats txStats;
  walkerGnssTxGetStats(txStats);
  JsonObject gnssTx = doc["gnssTx"].to<JsonObject>();
  gnssTx["enqueued"] = txStats.enqueued;
  gnssTx["dropped"] = txStats.dropped;
  gnssTx["written"] = txStats.written;
  gnssTx["bytes"] = txStats.bytesWritten;
  gnssTx["queueDepth"] = txStats.queueDepth;
  gnssTx["queueHighWater"] = txStats.queueHighWater;
  sendJson(200, doc);
}

static void handleRecord() {
  if (!requireAuth()) return;
  if (!server.hasArg("plain")) { server.send(400, "text/plain", "no body"); return; }
  JsonDocument body;
  if (deserializeJson(body, server.arg("plain"))) {
    server.send(400, "text/plain", "bad json"); return;
  }
  bool want = body["recording"] | false;
  if (want) startRecording(); else stopRecording();
  JsonDocument out;
  coreLock();
  out["recording"] = st.recording;
  out["track"]     = currentTrackName;
  coreUnlock();
  sendJson(200, out);
}

static void handleGnssSend() {
  if (!requireAuth()) return;
  if (!server.hasArg("plain")) { server.send(400, "text/plain", "no body"); return; }
  JsonDocument body;
  if (deserializeJson(body, server.arg("plain"))) {
    server.send(400, "text/plain", "bad json"); return;
  }
  String cmd = body["cmd"].as<String>();
  cmd.trim();
  if (cmd.length() == 0) {
    server.send(400, "text/plain", "empty cmd");
    return;
  }
  // Accept "$PAIR021*39", "$PAIR021", or "PAIR021" — strip leading `$`
  // and any trailing `*HH` since we recompute the checksum ourselves.
  if (cmd[0] == '$') cmd.remove(0, 1);
  int star = cmd.indexOf('*');
  if (star >= 0) cmd.remove(star);
  sendGnssCommand(cmd);
  server.send(200, "application/json", "{\"ok\":true}");
}

// ── LC29HDA firmware-upgrade API ─────────────────────────────────────────
// Upload each of the 5 firmware blobs (DA + partition_table + bootloader +
// main + gnss_config) via multipart POST with name=<da|partition|bootloader|
// main|config>, then verify via GET /api/gnss/fw/status, then POST /api/gnss/
// upgrade/arm to set the NVS flag + reboot. The walker boots into upgrade
// mode (early-setup() entry) and runs runGnssUpgrade() on the GNSS UART.
static const char* fwPathForName(const String& name) {
  if (name == "da")         return "/fw_lc29h/da.bin";
  if (name == "partition")  return "/fw_lc29h/partition_table.bin";
  if (name == "bootloader") return "/fw_lc29h/bootloader.bin";
  if (name == "main")       return "/fw_lc29h/main.bin";
  if (name == "config")     return "/fw_lc29h/config.bin";
  return nullptr;
}

static File   g_fwUploadFile;
static String g_fwUploadName;
static size_t g_fwUploadBytes  = 0;        // bytes written in THIS request
static size_t g_fwUploadOffset = 0;        // start offset of this chunk in the file
static bool   g_fwUploadOk     = false;
static bool   g_fwUploadAuthed = false;    // gated at UPLOAD_FILE_START

// Non-responsive auth check for use inside the upload callback — must NOT
// call server.send() because the main handler still owns the response.
// Mirrors requireAuth()'s logic (token configured? request token matches?)
// without writing anything to the client.
static bool checkAuthNoResponse() {
  String configured = authTokenSnapshot();
  if (configured.length() == 0) {
    // First-boot recovery: on the setup AP only, treat as allowed (matches
    // requireAuth()'s setup-AP carve-out).
    return (WiFi.getMode() & WIFI_AP) != 0;
  }
  return secureEquals(requestAuthToken(), configured);
}

static void handleGnssFwUploadData() {
  HTTPUpload& upload = server.upload();
  if (upload.status == UPLOAD_FILE_START) {
    // CRITICAL: auth-check at FILE_START — by FILE_END the bytes would already
    // be persisted to LittleFS. If unauthed, don't open the file at all; the
    // WRITE callbacks below also bail out, so the existing firmware blob (if
    // any) is preserved untouched. The main handler responds 401 via
    // requireAuth() so the client gets a proper rejection.
    g_fwUploadName    = server.arg("name");
    g_fwUploadOffset  = (size_t) server.arg("offset").toInt();
    g_fwUploadBytes   = 0;
    g_fwUploadOk      = false;
    g_fwUploadAuthed  = checkAuthNoResponse();
    if (!g_fwUploadAuthed) {
      weblogf("[fw-upgrade] upload REJECTED (auth) name=%s offset=%u\n",
              g_fwUploadName.c_str(), (unsigned) g_fwUploadOffset);
      return;
    }
    const char* path = fwPathForName(g_fwUploadName);
    if (!path) {
      weblogf("[fw-upgrade] upload: unknown name '%s'\n", g_fwUploadName.c_str());
      return;
    }
    LittleFS.mkdir("/fw_lc29h");
    // offset == 0 → truncate + start fresh (mode "w").
    // offset  > 0 → open existing for read/write (mode "r+") and seek into
    //               the right slot so the browser can stream 2.4 MB in ~64 KB
    //               chunks without blowing the heap on a single multipart.
    if (g_fwUploadOffset == 0) {
      g_fwUploadFile = LittleFS.open(path, "w");
    } else {
      g_fwUploadFile = LittleFS.open(path, "r+");
      if (g_fwUploadFile) g_fwUploadFile.seek(g_fwUploadOffset);
    }
    if (!g_fwUploadFile) {
      weblogf("[fw-upgrade] upload: failed to open %s (offset=%u)\n",
              path, (unsigned) g_fwUploadOffset);
      return;
    }
    weblogf("[fw-upgrade] upload: %s -> %s @offset=%u\n",
            g_fwUploadName.c_str(), path, (unsigned) g_fwUploadOffset);
  } else if (upload.status == UPLOAD_FILE_WRITE) {
    if (!g_fwUploadAuthed) return;  // discard bytes from unauthenticated request
    if (g_fwUploadFile) {
      size_t w = g_fwUploadFile.write(upload.buf, upload.currentSize);
      g_fwUploadBytes += w;
    }
  } else if (upload.status == UPLOAD_FILE_END) {
    if (!g_fwUploadAuthed) return;
    if (g_fwUploadFile) {
      g_fwUploadFile.close();
      g_fwUploadOk = true;
      weblogf("[fw-upgrade] upload: %s complete (%u bytes)\n",
              g_fwUploadName.c_str(), (unsigned) g_fwUploadBytes);
    }
  } else if (upload.status == UPLOAD_FILE_ABORTED) {
    if (g_fwUploadFile) g_fwUploadFile.close();
    weblogf("[fw-upgrade] upload: %s ABORTED\n", g_fwUploadName.c_str());
  }
}

static void handleGnssFwUploadDone() {
  if (!requireAuth()) return;
  JsonDocument resp;
  const char* path = fwPathForName(g_fwUploadName);
  if (!path) {
    resp["ok"]    = false;
    resp["error"] = "name must be one of: da, partition, bootloader, main, config";
    sendJson(400, resp);
    return;
  }
  // Report the now-persisted file size so the client knows what offset to use
  // for the next chunk (sequential chunked uploads).
  uint32_t totalSize = 0;
  File f = LittleFS.open(path, "r");
  if (f) { totalSize = (uint32_t) f.size(); f.close(); }
  resp["ok"]     = g_fwUploadOk;
  resp["name"]   = g_fwUploadName;
  resp["path"]   = path;
  resp["offset"] = (uint32_t) g_fwUploadOffset;
  resp["bytes"]  = (uint32_t) g_fwUploadBytes;
  resp["size"]   = totalSize;
  sendJson(g_fwUploadOk ? 200 : 500, resp);
}

// Minimal embedded upload page served at /fw-upgrade — vanilla HTML+JS, no
// frameworks, no external resources. The browser chunks the 2.4 MB main blob
// into 64 KB pieces and POSTs each with name+offset+file, so a single huge
// multipart can't OOM the walker on weak WiFi. After all 5 files land, it
// POSTs /api/gnss/upgrade/arm to reboot the walker into Download Mode.
static const char FW_UPGRADE_PAGE[] PROGMEM = R"HTML(<!doctype html>
<html lang="nl"><head><meta charset="utf-8">
<title>LC29HDA Firmware Upgrade</title>
<style>
 body{font-family:-apple-system,sans-serif;max-width:680px;margin:1em auto;padding:0 1em;color:#222}
 h2{margin-bottom:.2em}.hint{color:#666;font-size:13px;margin:.2em 0 1em}
 .row{display:flex;align-items:center;margin:.5em 0;gap:.6em}
 .row label{flex:0 0 130px;font-family:monospace;font-size:13px}
 input[type=password]{flex:1;padding:.3em}
 button{padding:.6em 1.2em;font-size:14px;cursor:pointer}
 button:disabled{opacity:.5;cursor:not-allowed}
 progress{width:100%;height:14px;margin-top:.6em}
 .drop{border:2px dashed #aaa;padding:1.6em;text-align:center;margin:1em 0;
       border-radius:6px;cursor:pointer;color:#666;font-size:14px}
 .drop:hover,.drop.over{background:#eef;border-color:#5572d6;color:#333}
 .files{margin:.6em 0;font-family:monospace;font-size:13px;line-height:1.5}
 .files .ok{color:#0a8d3a}.files .miss{color:#b00}
 .log{font-family:monospace;font-size:12px;white-space:pre-wrap;background:#0e0e10;color:#9cdcfe;
      padding:.6em;margin-top:.8em;height:240px;overflow:auto;border-radius:4px}
 .log .ok{color:#5fe07a}.log .err{color:#ff7373}.log .dim{color:#888}
</style></head><body>
<h2>LC29HDA firmware upgrade</h2>
<div class="hint">Pak de Quectel <b>LC29HDANR11A04S_RSA.zip</b> uit en sleep alle 5 <b>.bin</b>-bestanden hieronder
in een keer naar de drop-zone (of klik om in Finder met Cmd-klik 5 te selecteren). De browser herkent ze op
naam. Daarna <b>Upload &amp; arm</b>. Na succes: <b>power-cycle de walker</b>.</div>
<div class="row"><label>Bearer token</label><input type="password" id="tok" placeholder="paste your /api/auth token" autocomplete="current-password"></div>
<div class="row"><button id="check" type="button">Check files op walker</button>
 <button id="armOnly" type="button" disabled>Skip upload &amp; direct armen</button>
 <button id="disarm" type="button" style="background:#fee;border:1px solid #b00;color:#900">Disarm (terug naar normale walker)</button></div>
<div class="files" id="onDevice"></div>
<div class="drop" id="drop">
 Of: sleep hier alle 5 <b>.bin</b>-bestanden voor een verse upload
 <input type="file" id="picker" multiple accept=".bin" style="display:none">
</div>
<div class="files" id="files"></div>
<button id="go" disabled>Upload &amp; arm</button>
<progress id="p" value="0" max="1"></progress>
<div class="log" id="log"></div>
<script>
const CHUNK=65536, NAMES=['da','partition','bootloader','main','config'];
// Map each blob slot to a filename pattern from the Quectel zip.
const MATCH={
 da:         /^da_uart_/i,
 partition:  /^partition_table\.bin$/i,
 bootloader: /^bootloader\.bin$/i,
 main:       /^LC29H.*\.bin$/i,         // LC29HDANR11A04S_RSA.bin (or any LC29H<X>NR... in newer drops)
 config:     /^gnss_config\.bin$/i
};
const $=id=>document.getElementById(id);
const log=(m,c)=>{const e=$('log');const s=document.createElement('span');
 if(c)s.className=c;s.textContent=m+"\n";e.appendChild(s);e.scrollTop=e.scrollHeight};
let picked={};  // name -> File
function classify(list){
 picked={};
 for(const f of list){
  for(const k of NAMES){ if(MATCH[k].test(f.name)){ picked[k]=f; break; } }
 }
 // Build rows via DOM nodes + textContent so a hostile filename can't inject
 // markup (e.g. '<img onerror=...>') into the page.
 const el=$('files'); el.replaceChildren();
 let allOk=true;
 for(const k of NAMES){
  const f=picked[k]; const row=document.createElement('div');
  const mark=document.createElement('span');
  mark.className=f?'ok':'miss';
  mark.textContent=f?'✓':'✗';
  row.appendChild(mark);
  const rest=document.createElement('span');
  rest.textContent=f
   ? (' '+k.padEnd(11)+' '+f.name+' ('+f.size+' bytes)')
   : (' '+k.padEnd(11)+' (ontbreekt)');
  row.appendChild(rest);
  if(!f) allOk=false;
  el.appendChild(row);
 }
 $('go').disabled=!allOk;
}
$('drop').addEventListener('click',()=>$('picker').click());
$('picker').addEventListener('change',e=>classify(e.target.files));
$('drop').addEventListener('dragover',e=>{e.preventDefault();$('drop').classList.add('over');});
$('drop').addEventListener('dragleave',()=>$('drop').classList.remove('over'));
$('drop').addEventListener('drop',e=>{e.preventDefault();$('drop').classList.remove('over');
 classify(e.dataTransfer.files);});
async function uploadFile(name,file,onPct){
 let off=0;
 while(off<file.size){
  const end=Math.min(off+CHUNK,file.size);
  const part=file.slice(off,end);
  const fd=new FormData();
  fd.append('name',name); fd.append('offset',String(off));
  fd.append('file',part,file.name);
  const r=await fetch('/api/gnss/fw/upload',{method:'POST',
   headers:{'Authorization':'Bearer '+$('tok').value},body:fd});
  if(!r.ok)throw new Error(name+' offset '+off+': HTTP '+r.status+' '+(await r.text()));
  const j=await r.json();
  if(!j.ok)throw new Error(name+' offset '+off+': '+(j.error||'upload failed'));
  off=end; onPct(off/file.size);
 }
}
async function run(){
 $('go').disabled=true;
 try{
  const total=NAMES.reduce((s,k)=>s+picked[k].size,0); let done=0;
  for(const k of NAMES){
   const f=picked[k];
   log('-- '+k+': '+f.name+' ('+f.size+' bytes)','dim');
   const base=done;
   await uploadFile(k,f,pct=>{$('p').value=(base+pct*f.size)/total});
   done+=f.size;
   log('   OK ('+f.size+' bytes)','ok');
  }
  log('-- arming upgrade --','dim');
  const r=await fetch('/api/gnss/upgrade/arm',{method:'POST',
   headers:{'Authorization':'Bearer '+$('tok').value}});
  log(await r.text(),r.ok?'ok':'err');
  log('','dim');
  log('======================================================','err');
  log('ACTIE NU: TREK DE USB-KABEL VAN DE WALKER ERUIT','err');
  log('  -> wacht 2 seconden','err');
  log('  -> sluit USB weer aan','err');
  log('======================================================','err');
  log('Waarom: de ESP32 heeft zichzelf gereboot maar dat reset','dim');
  log('de LC29HDA-module zelf NIET. De module moet binnen 150 ms','dim');
  log('na ZIJN OWN reset een 0xA0 zien — alleen een echte power-cycle','dim');
  log('(USB eruit + weer in) doet dat. USB-stekker eruit halen is veilig.','dim');
  log('','dim');
  log('Na opnieuw aansluiten boot de walker in ~1 s in upgrade-mode,','dim');
  log('doet de handshake, brengt WiFi terug op en deze pagina','dim');
  log('toont vanzelf live progress (~5-15 s na replug).','dim');
  log('','dim');
  log('-- pollen /api/gnss/upgrade/progress --','dim');
  // Poll the live-progress endpoint that gnss_upgrade.cpp brings up over WiFi
  // after the timing-critical handshake. While the walker is rebooting/in
  // early boot the fetch fails silently; we retry every 1.5 s.
  let lastKey='';
  while(true){
   try{
    const pr=await fetch('/api/gnss/upgrade/progress',{cache:'no-store'});
    if(pr.ok){
     const j=await pr.json();
     const key=j.step+'|'+j.percent+'|'+(j.lastMsg||'');
     if(key!==lastKey){
      log('['+j.step+' '+j.percent+'%] '+(j.lastMsg||''),
          j.finished?(j.success?'ok':'err'):'dim');
      $('p').value=j.percent/100;
      lastKey=key;
     }
     if(j.finished){
      log('-- upgrade '+(j.success?'SUCCESS':'FAILED')+' na '+(j.elapsedMs/1000).toFixed(1)+'s --',
          j.success?'ok':'err');
      if(j.success) log('Power-cycle de walker om de nieuwe LC29HDA-firmware op te starten.','ok');
      else          log('Power-cycle om te retryen (flag staat nog armed) of houd BOOT bij power-on om te ontsnappen.','err');
      break;
     }
    }
   }catch(e){ /* walker still rebooting or WiFi not back yet — keep trying */ }
   await new Promise(r=>setTimeout(r,1500));
  }
 }catch(e){log('FOUT: '+e.message,'err')}finally{$('go').disabled=Object.keys(picked).length!==NAMES.length}
}
$('go').addEventListener('click',run);
// Status-check: GET /api/gnss/fw/status returns per-blob sizes. If all 5 are
// non-zero on the walker, the operator can skip the re-upload (LittleFS is
// persistent across reboots — the only thing that needed to change after the
// failed handshake was the timing of the 0xA0 burst).
async function checkOnDevice(){
 const el=$('onDevice'); el.replaceChildren();
 const tok=$('tok').value;
 if(!tok){
  const row=document.createElement('div'); row.className='miss';
  row.textContent='Vul eerst je bearer token in.';
  el.appendChild(row); $('armOnly').disabled=true; return;
 }
 try{
  const r=await fetch('/api/gnss/fw/status',{headers:{'Authorization':'Bearer '+tok}});
  if(!r.ok){
   const row=document.createElement('div'); row.className='miss';
   row.textContent='HTTP '+r.status+' — token klopt niet of walker bezig?';
   el.appendChild(row); $('armOnly').disabled=true; return;
  }
  const j=await r.json();
  let allOk=true;
  for(const k of NAMES){
   const sz=(j.files && j.files[k])|0;
   const row=document.createElement('div');
   const mark=document.createElement('span');
   mark.className=sz>0?'ok':'miss';
   mark.textContent=sz>0?'✓':'✗';
   row.appendChild(mark);
   const rest=document.createElement('span');
   rest.textContent=' '+k.padEnd(11)+(sz>0?(' '+sz+' bytes op walker'):' (niet op walker)');
   row.appendChild(rest);
   if(sz===0) allOk=false;
   el.appendChild(row);
  }
  $('armOnly').disabled=!allOk;
  if(allOk){
   const ok=document.createElement('div'); ok.className='ok';
   ok.textContent='Alle 5 firmware-blobs staan klaar — je kunt direct armen.';
   el.appendChild(ok);
  }
 }catch(e){
  const row=document.createElement('div'); row.className='miss';
  row.textContent='FOUT: '+e.message; el.appendChild(row);
  $('armOnly').disabled=true;
 }
}
async function armAndPoll(){
 $('armOnly').disabled=true; $('go').disabled=true;
 try{
  log('-- arming upgrade (files already on device) --','dim');
  const r=await fetch('/api/gnss/upgrade/arm',{method:'POST',
   headers:{'Authorization':'Bearer '+$('tok').value}});
  log(await r.text(),r.ok?'ok':'err');
  if(!r.ok) return;
  log('','dim');
  log('======================================================','err');
  log('ACTIE NU: TREK DE USB-KABEL VAN DE WALKER ERUIT','err');
  log('  -> wacht 2 seconden','err');
  log('  -> sluit USB weer aan','err');
  log('======================================================','err');
  log('Waarom: de ESP32 heeft zichzelf gereboot maar dat reset','dim');
  log('de LC29HDA-module zelf NIET. Alleen een echte power-cycle','dim');
  log('(USB eruit + weer in) doet dat. USB-stekker eruit halen is veilig.','dim');
  log('','dim');
  log('-- pollen /api/gnss/upgrade/progress --','dim');
  let lastKey='';
  while(true){
   try{
    const pr=await fetch('/api/gnss/upgrade/progress',{cache:'no-store'});
    if(pr.ok){
     const j=await pr.json();
     const key=j.step+'|'+j.percent+'|'+(j.lastMsg||'');
     if(key!==lastKey){
      log('['+j.step+' '+j.percent+'%] '+(j.lastMsg||''),
          j.finished?(j.success?'ok':'err'):'dim');
      $('p').value=j.percent/100; lastKey=key;
     }
     if(j.finished){
      log('-- upgrade '+(j.success?'SUCCESS':'FAILED')+' na '+(j.elapsedMs/1000).toFixed(1)+'s --',
          j.success?'ok':'err');
      if(j.success) log('Power-cycle de walker om de nieuwe LC29HDA-firmware op te starten.','ok');
      else          log('Power-cycle om te retryen (flag staat nog armed) of houd BOOT bij power-on om te ontsnappen.','err');
      break;
     }
    }
   }catch(e){ /* walker rebooting — keep trying */ }
   await new Promise(r=>setTimeout(r,1500));
  }
 }catch(e){log('FOUT: '+e.message,'err')}
}
async function disarm(){
 if(!confirm('Disarm: walker reboot direct naar normale firmware. Doorgaan?')) return;
 try{
  // In upgrade-mode this endpoint is unauth (single-operator private device).
  // In normal-mode it requires bearer auth — include the token if filled in.
  const tok=$('tok').value;
  const r=await fetch('/api/gnss/upgrade/disarm',{method:'POST',
   headers: tok ? {'Authorization':'Bearer '+tok} : {}});
  log(await r.text(),r.ok?'ok':'err');
  if(r.ok) log('Walker boot nu naar normale firmware. Geen power-cycle nodig.','ok');
 }catch(e){log('FOUT: '+e.message,'err')}
}
$('check').addEventListener('click',checkOnDevice);
$('armOnly').addEventListener('click',armAndPoll);
$('disarm').addEventListener('click',disarm);
</script></body></html>)HTML";

static void handleGnssFwUpgradePage() {
  // The upload page itself does nothing destructive — it only hosts the
  // chunked uploader, and every destructive API it calls (/api/gnss/fw/upload,
  // /api/gnss/upgrade/arm) is still gated by requireAuth(). The token input
  // is intentionally blank (no hardcoded default in the served HTML — that
  // would leak the bearer to anyone reaching this URL); the operator pastes
  // their /api/auth token. We can therefore serve the page unauthenticated so
  // initial-setup recovery still works.
  server.sendHeader("Cache-Control", "no-store");
  server.send_P(200, "text/html; charset=utf-8", FW_UPGRADE_PAGE);
}

static void handleGnssFwStatus() {
  if (!requireAuth()) return;
  JsonDocument resp;
  prefs.begin("rtk-walker", false);
  resp["armed"] = prefs.getBool("gnss_up", false);
  // No prefs.end() — matches the existing single-namespace lifecycle.
  JsonObject files = resp["files"].to<JsonObject>();
  struct { const char* name; const char* path; } entries[] = {
    { "da",         "/fw_lc29h/da.bin" },
    { "partition",  "/fw_lc29h/partition_table.bin" },
    { "bootloader", "/fw_lc29h/bootloader.bin" },
    { "main",       "/fw_lc29h/main.bin" },
    { "config",     "/fw_lc29h/config.bin" },
  };
  for (auto& e : entries) {
    File f = LittleFS.open(e.path, "r");
    files[e.name] = f ? (uint32_t) f.size() : (uint32_t) 0;
    if (f) f.close();
  }
  sendJson(200, resp);
}

static void handleGnssUpgradeArm() {
  if (!requireAuth()) return;
  JsonDocument resp;
  struct { const char* name; const char* path; } need[] = {
    { "da",         "/fw_lc29h/da.bin" },
    { "partition",  "/fw_lc29h/partition_table.bin" },
    { "bootloader", "/fw_lc29h/bootloader.bin" },
    { "main",       "/fw_lc29h/main.bin" },
    { "config",     "/fw_lc29h/config.bin" },
  };
  for (auto& n : need) {
    File f = LittleFS.open(n.path, "r");
    if (!f || f.size() == 0) {
      resp["ok"]    = false;
      resp["error"] = String("missing or empty firmware file: ") + n.name + " (" + n.path + ")";
      if (f) f.close();
      sendJson(400, resp);
      return;
    }
    f.close();
  }
  prefs.begin("rtk-walker", false);
  prefs.putBool("gnss_up", true);
  weblogf("[fw-upgrade] armed via API. Walker will reboot. Power-cycle the walker after that to enter the LC29HDA Download-Mode handshake window. Watch progress on USB-CDC (115200).\n");
  resp["ok"]    = true;
  resp["armed"] = true;
  resp["next"]  = "Walker reboots now. POWER-CYCLE the walker after the reboot so the LC29HDA itself also resets into Download Mode. Then attach USB-CDC ('screen /dev/cu.usbmodemXXXX 115200') to watch progress. Hold BOOT during a later power-on to escape upgrade mode.";
  sendJson(200, resp);
  delay(500);
  ESP.restart();
}

// Disarm: clear the gnss_up NVS flag and reboot back into normal walker
// firmware. Useful when an upgrade-mode boot is stuck (handshake keeps
// failing, operator wants to give up) or when the operator wants to back
// out without holding the BOOT button during power-on. Available in both
// normal-mode and upgrade-mode HTTP servers (upgrade-mode registration is
// done in gnss_upgrade.cpp's progStartServerIfReady so a stuck walker can
// still be rescued from the browser).
static void handleGnssUpgradeDisarm() {
  if (!requireAuth()) return;
  JsonDocument resp;
  prefs.begin("rtk-walker", false);
  prefs.putBool("gnss_up", false);
  weblogf("[fw-upgrade] disarmed via API. Walker will reboot into normal walker firmware.\n");
  resp["ok"]       = true;
  resp["disarmed"] = true;
  resp["next"]     = "Walker reboots now into normal walker firmware. Power-cycle is NOT required.";
  sendJson(200, resp);
  delay(500);
  ESP.restart();
}

static void handleLog() {
  if (!requireAuth()) return;
  // Polling-friendly snapshot: returns the current buffer text + the
  // monotonic byte offset of the newest byte. Client should remember
  // `seq` between polls and skip the first (seq - prevSeq) chars on
  // subsequent fetches if it wants to append rather than replace.
  webLogLock();
  String logCopy = webLogBuf;
  uint32_t seqCopy = webLogSeq;
  webLogUnlock();
  uint32_t firstSeq = seqCopy - (uint32_t) logCopy.length();
  String out;
  out.reserve(logCopy.length() + 64);
  out += "{\"seq\":";
  out += seqCopy;
  out += ",\"firstSeq\":";
  out += firstSeq;
  out += ",\"buf\":";
  // JSON-escape the buffer content
  out += '\"';
  for (size_t i = 0; i < logCopy.length(); i++) {
    char c = logCopy[i];
    switch (c) {
      case '\"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if ((unsigned char) c < 0x20) {
          char esc[8];
          snprintf(esc, sizeof(esc), "\\u%04x", (unsigned char) c);
          out += esc;
        } else {
          out += c;
        }
    }
  }
  out += "\"}";
  sendStringCooperatively(200, "application/json", out);
}

static void handleTrackCurrent() {
  if (!requireAuth()) return;
  // Emit JSON as a streaming string to keep peak heap low on long
  // walks. Format: { recording: bool, points: [[lat,lng,fix], ...] }.
  String out;
  coreLock();
  bool recordingNow = st.recording;
  coreUnlock();
  livePointsLock();
  out.reserve(64 + livePoints.size() * 32);
  out += "{\"recording\":";
  out += (recordingNow ? "true" : "false");
  out += ",\"count\":";
  out += (uint32_t) livePoints.size();
  out += ",\"points\":[";
  for (size_t i = 0; i < livePoints.size(); i++) {
    if (i) out += ',';
    out += '[';
    out += String(livePoints[i].lat, 7);
    out += ',';
    out += String(livePoints[i].lng, 7);
    out += ',';
    out += (int) livePoints[i].fix;
    out += ']';
  }
  out += "]}";
  livePointsUnlock();
  sendStringCooperatively(200, "application/json", out);
}

static void handleTracks() {
  if (!requireAuth()) return;
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  if (LittleFS.exists("/tracks")) {
    File dir = LittleFS.open("/tracks");
    File f;
    while ((f = dir.openNextFile())) {
      JsonObject row = arr.add<JsonObject>();
      String fname = String(f.name());
      // openNextFile returns just the basename on LittleFS; normalise.
      int slash = fname.lastIndexOf('/');
      if (slash >= 0) fname = fname.substring(slash + 1);
      row["name"]   = fname;
      row["size"]   = (uint32_t) f.size();
      // Cheap point count: file size / typical-row-width is a fine
      // approximation; if you want exact, count newlines in the file.
      row["points"] = (uint32_t) (f.size() / 56);
      f.close();
    }
    dir.close();
  }
  sendJson(200, doc);
}

static void handleTrackDownload() {
  if (!requireAuth()) return;
  String uri = server.uri();
  // /track/<name>            → full raw CSV
  // /track/<name>.polygon    → reformatted to bare lat,lng pairs for
  //                            Novabot's polygon import (header stripped,
  //                            consecutive duplicate points collapsed).
  // /track/<name>.json       → JSON points array, same shape as
  //                            /api/track/current so the web UI can
  //                            render a saved track with the existing
  //                            Leaflet polyline code.
  String name = uri.substring(strlen("/track/"));

  const char* polygonSuffix = ".polygon";
  const size_t polygonSuffixLen = strlen(polygonSuffix);
  bool polygonMode = name.endsWith(polygonSuffix);
  if (polygonMode) name = name.substring(0, name.length() - polygonSuffixLen);

  const char* jsonSuffix = ".json";
  const size_t jsonSuffixLen = strlen(jsonSuffix);
  bool jsonMode = !polygonMode && name.endsWith(jsonSuffix);
  if (jsonMode) name = name.substring(0, name.length() - jsonSuffixLen);

  if (!isSafeLeafName(name)) {
    server.send(400, "text/plain", "bad track name");
    return;
  }

  String path = String("/tracks/") + name;
  if (!LittleFS.exists(path)) { server.send(404, "text/plain", "no such track"); return; }
  File f = LittleFS.open(path, FILE_READ);

  if (jsonMode) {
    // Stream JSON in chunked mode so we don't have to buffer the whole
    // track in RAM. Same field shape as /api/track/current.
    server.setContentLength(CONTENT_LENGTH_UNKNOWN);
    server.send(200, "application/json", "");
    server.sendContent("{\"recording\":false,\"name\":\"");
    server.sendContent(name);
    server.sendContent("\",\"points\":[");
    bool first = true;
    bool firstLine = true;
    while (f.available()) {
      String line = f.readStringUntil('\n');
      if (line.endsWith("\r")) line.remove(line.length() - 1);
      if (line.length() == 0) continue;
      if (firstLine) { firstLine = false; continue; }   // skip CSV header
      int c1 = line.indexOf(',');
      if (c1 < 0) continue;
      int c2 = line.indexOf(',', c1 + 1);
      if (c2 < 0) continue;
      int c3 = line.indexOf(',', c2 + 1);
      int c4 = (c3 > 0) ? line.indexOf(',', c3 + 1) : -1;
      int c5 = (c4 > 0) ? line.indexOf(',', c4 + 1) : -1;
      String lat = line.substring(c1 + 1, c2);
      String lng = (c3 > 0) ? line.substring(c2 + 1, c3) : line.substring(c2 + 1);
      String fix = (c4 > 0 && c5 > 0) ? line.substring(c4 + 1, c5) : String("0");
      if (!first) server.sendContent(",");
      server.sendContent("[");
      server.sendContent(lat);
      server.sendContent(",");
      server.sendContent(lng);
      server.sendContent(",");
      server.sendContent(fix);
      server.sendContent("]");
      first = false;
    }
    server.sendContent("]}");
    server.sendContent("");
    f.close();
    return;
  }

  if (!polygonMode) {
    server.sendHeader("Content-Disposition", String("attachment; filename=\"") + name + "\"");
    server.streamFile(f, "text/csv");
    f.close();
    return;
  }

  String outName = name;
  int dot = outName.lastIndexOf('.');
  if (dot >= 0) outName = outName.substring(0, dot);
  outName += "-polygon.csv";

  server.sendHeader("Content-Disposition", String("attachment; filename=\"") + outName + "\"");
  server.setContentLength(CONTENT_LENGTH_UNKNOWN);
  server.send(200, "text/csv", "");
  server.sendContent("lat,lng\n");

  String prevLat;
  String prevLng;
  bool firstLine = true;

  while (f.available()) {
    String line = f.readStringUntil('\n');
    if (line.endsWith("\r")) line.remove(line.length() - 1);
    if (line.length() == 0) continue;
    if (firstLine) { firstLine = false; continue; }

    int c1 = line.indexOf(',');
    if (c1 < 0) continue;
    int c2 = line.indexOf(',', c1 + 1);
    if (c2 < 0) continue;
    int c3 = line.indexOf(',', c2 + 1);
    String lat = line.substring(c1 + 1, c2);
    String lng = (c3 > 0) ? line.substring(c2 + 1, c3) : line.substring(c2 + 1);

    if (lat == prevLat && lng == prevLng) continue;
    prevLat = lat;
    prevLng = lng;

    server.sendContent(lat);
    server.sendContent(",");
    server.sendContent(lng);
    server.sendContent("\n");
  }
  server.sendContent("");
  f.close();
}

static void handleI2cScan() {
#if !I2C_AVAILABLE
  server.send(503, "application/json", "{\"ok\":false,\"error\":\"no I2C bus on this target\"}");
  return;
#else
  JsonDocument doc;
  JsonArray arr = doc["found"].to<JsonArray>();
  bool truncated = false;
  uint32_t deadline = millis() + 750;
  // 7-bit addresses 0x03..0x77 are the valid scan window; 0x00..0x02
  // and 0x78..0x7F are reserved.
  for (uint8_t a = 0x03; a <= 0x77; a++) {
    if (i2cProbe(a)) arr.add((unsigned) a);
    if ((a & 0x0F) == 0) serviceRealtimeDuringHttp();
    if ((int32_t)(millis() - deadline) >= 0) {
      truncated = true;
      break;
    }
  }
  doc["sda"] = TOUCH_SDA;
  doc["scl"] = TOUCH_SCL;
  doc["bus"] = "IDF I2C_NUM_0 (touch bus)";
  doc["truncated"] = truncated;
  sendJson(200, doc);
#endif
}

static void handleIp5306() {
#if !I2C_AVAILABLE
  server.send(503, "application/json", "{\"ok\":false,\"error\":\"no I2C bus on this target\"}");
  return;
#else
  JsonDocument doc;
  doc["present"] = i2cProbe(0x75);
  if (doc["present"].as<bool>()) {
    // Read the registers that the M5Stack / community drivers use to
    // pull battery + charging state from the I2C-capable variant.
    // Hex format helps when matching against the datasheet bits.
    auto pushReg = [&](const char* key, uint8_t reg) {
      uint8_t v = 0;
      if (i2cReadReg(0x75, reg, &v)) {
        char hex[6];
        snprintf(hex, sizeof(hex), "0x%02X", v);
        doc[key] = hex;
      } else {
        doc[key] = nullptr;
      }
    };
    pushReg("sys_ctl0_0x00", 0x00);  // boost enable
    pushReg("status_0x71",   0x71);  // charging finished flag
    pushReg("status_0x72",   0x72);  // USB plugged flag
    pushReg("led_0x21",      0x21);  // 4-LED battery level
    pushReg("soc_0xa2",      0xA2);  // exact %SoC (I2C variant only)
  }
  sendJson(200, doc);
#endif
}

// Diagnostic: dump raw ADC + mv + post-divider voltage so we can
// confirm or correct the divider multiplier. Hit this with a known
// battery voltage (multimeter on the cell) and the maths gives the
// real divider ratio - the multiplier in the firmware can then be
// matched to what's actually on the board.
static void handleBatteryRaw() {
#ifdef BAT_ADC
  // Force max attenuation so the ADC range covers the LiPo span.
  // 3.3 V max input becomes legible instead of clipping at 2.45 V.
  analogSetPinAttenuation(BAT_ADC, ADC_11db);
  int raw   = analogRead(BAT_ADC);
  int mv    = analogReadMilliVolts(BAT_ADC);
  float v   = (mv / 1000.0f) * BAT_DIVIDER_MULT;

  JsonDocument doc;
  doc["pin"]        = BAT_ADC;
  doc["raw"]        = raw;
  doc["mv"]         = mv;
  doc["multiplier"] = BAT_DIVIDER_MULT;
  doc["v_battery"]  = v;
  doc["note"]       = "compare with multimeter: v_battery should match cell voltage";
  sendJson(200, doc);
#else
  server.send(503, "application/json", "{\"ok\":false,\"error\":\"no BAT_ADC defined\"}");
#endif
}

// ── Saved-maps endpoints (web UI mirror of the TFT Maps tab) ──────────
//
// /api/maps         — list every saved map with metadata + which one (if
//                     any) is currently being viewed on the TFT.
// /api/maps/N       — full polygon + obstacle rings + channels for slot
//                     N, in lat/lng so the web UI can render them on the
//                     same canvas it uses for the live track.
// /api/maps/view    — POST {slot:N} to drive the TFT into viewing slot
//                     N; POST {slot:-1} to exit viewing mode. Mirrors a
//                     row tap on the device.
//
// All three are unauthenticated reads / authenticated writes per the
// pattern the rest of the API uses — listing maps is not sensitive,
// changing what the operator sees on the screen is.
static void handleMapsList() {
  JsonDocument doc;
  MapEntry entries[3];
  size_t count = 0;
  sessionStore.listMaps(entries, 3, count);
  JsonArray arr = doc["maps"].to<JsonArray>();
  for (size_t i = 0; i < count; i++) {
    JsonObject m = arr.add<JsonObject>();
    m["slot"]            = entries[i].slot;
    m["alias"]           = entries[i].alias;
    m["boundaryPoints"]  = entries[i].boundaryPoints;
    m["obstacleCount"]   = entries[i].obstacleCount;
    m["channelCount"]    = entries[i].channelCount;
    m["hasChargeChannel"] = sessionStore.hasChargeChannel(entries[i].slot);
  }
  doc["viewingSlot"] = tft_ui_current_view_slot();
  sendJson(200, doc);
}

// Append one polygon CSV (local meters x,y) to a destination String as
// JSON {"lat":..,"lng":..} objects. Caller passes the running String
// by reference and a "is this the first point in the array?" flag so
// commas land in the right places. Capped at maxPoints — a typical
// garden polygon needs <200; we keep it low so the whole response
// fits comfortably under a single server.send() call (no chunked
// transfer, no streaming).
//
// Why not chunked? An earlier version used
// server.setContentLength(CONTENT_LENGTH_UNKNOWN) + many
// server.sendContent() calls so the response could be megabytes if it
// wanted to. On this hardware the chunked path *also* broke inbound
// networking: while a chunked GET was in flight, the device stopped
// responding to ICMP and refused new TCP connections — likely an
// lwIP RX-queue / WebServer state interaction we can't fix from
// user space. A single big String + server.send() is slower per-byte
// but doesn't trigger that bug, so we eat the latency and stay
// reachable. Hard cap on points keeps the worst case bounded.
// Count newline-terminated rows in a LittleFS file. Used to compute
// an even decimation stride before emitting JSON — otherwise the
// "first N points" cap would visually truncate the polygon (e.g. a
// 364-point garden with a 200 cap would lose the last 45% of the
// shape entirely). Bulk read so this is cheap even on large files.
static int countCsvRows(const String& path) {
  if (!LittleFS.exists(path)) return 0;
  File f = LittleFS.open(path, FILE_READ);
  if (!f) return 0;
  uint8_t buf[256];
  int rows = 0;
  while (f.available()) {
    int n = f.read(buf, sizeof(buf));
    if (n <= 0) break;
    for (int i = 0; i < n; i++) {
      if (buf[i] == '\n') rows++;
    }
  }
  f.close();
  return rows;
}

static int polygonToJsonAppend(const String& path, size_t maxPoints,
                               String& out, bool& firstPoint) {
  if (!LittleFS.exists(path)) return -1;

  // Even decimation: if the file has more rows than maxPoints, sample
  // every Nth row so the resulting polygon preserves the overall
  // shape. Stride==1 means "keep every row" for files <= maxPoints.
  int totalRows = countCsvRows(path);
  if (totalRows <= 0) return 0;
  size_t stride = 1;
  if ((size_t) totalRows > maxPoints) {
    stride = (totalRows + maxPoints - 1) / maxPoints;
  }

  File f = LittleFS.open(path, FILE_READ);
  if (!f) return -1;
  size_t written = 0;
  size_t lineIdx = 0;
  char buf[80];
  while (f.available()) {
    String line = f.readStringUntil('\n');
    bool keep = ((lineIdx % stride) == 0);
    lineIdx++;
    if (!keep) continue;
    if (line.endsWith("\r")) line.remove(line.length() - 1);
    if (line.length() == 0) continue;
    int c1 = line.indexOf(',');
    if (c1 < 0) continue;
    double x = line.substring(0, c1).toDouble();
    double y = line.substring(c1 + 1).toDouble();
    double lat = 0, lng = 0;
    if (!sessionStore.localToGps(x, y, lat, lng)) continue;

    int n = snprintf(buf, sizeof(buf),
                     "%s{\"lat\":%.7f,\"lng\":%.7f}",
                     firstPoint ? "" : ",", lat, lng);
    if (n > 0 && n < (int) sizeof(buf)) out += buf;
    firstPoint = false;
    written++;

    // Yield to the realtime GNSS/LoRa task every 32 points while this
    // response is being built in memory.
    if ((written & 0x1F) == 0) {
      serviceRealtimeDuringHttp();
    }
  }
  f.close();
  return (int) written;
}

// JSON-escape a filesystem-derived string (alias, channel target, file
// name). Quotes, backslashes and control characters get escaped — the
// rest passes through. Defensive against names containing weird chars
// that would break the response otherwise.
static String jsonEscape(const String& s) {
  String out;
  out.reserve(s.length() + 8);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    switch (c) {
      case '"':  out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if ((uint8_t) c < 0x20) {
          char esc[8];
          snprintf(esc, sizeof(esc), "\\u%04x", (uint8_t) c);
          out += esc;
        } else {
          out += c;
        }
    }
  }
  return out;
}

static void handleMapDetail() {
  String uri = server.uri();
  String suffix = uri.substring(strlen("/api/maps/"));
  if (suffix.length() != 1 || suffix[0] < '0' || suffix[0] > '2') {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"invalid slot\"}");
    return;
  }
  int slot = suffix[0] - '0';

  String workPath = String("/session/map") + slot + "_work.csv";
  if (!LittleFS.exists(workPath)) {
    server.send(404, "application/json", "{\"ok\":false,\"error\":\"map not found\"}");
    return;
  }
  double oLat = 0, oLng = 0;
  if (!sessionStore.getOrigin(oLat, oLng)) {
    server.send(409, "application/json", "{\"ok\":false,\"error\":\"map has no origin\"}");
    return;
  }

  MapEntry entries[3];
  size_t cnt = 0;
  sessionStore.listMaps(entries, 3, cnt);
  String alias = String("map") + slot;
  int obstacleCount = 0, channelCount = 0, boundaryPoints = 0;
  for (size_t i = 0; i < cnt; i++) {
    if (entries[i].slot == slot) {
      alias          = entries[i].alias;
      obstacleCount  = entries[i].obstacleCount;
      channelCount   = entries[i].channelCount;
      boundaryPoints = entries[i].boundaryPoints;
      break;
    }
  }

  // Build the whole response into a single String, then send it in one
  // server.send() call. Hard caps everywhere — a polygon with thousands
  // of points isn't useful on a 480x320 panel or a small browser
  // anyway. Caps:
  //   boundary: 300 points  (typical garden walks land at 50-150)
  //   obstacle: 100 points  (rings are tiny by nature)
  //   channel : 300 points  (long routes)
  // Pre-reserve so the String doesn't constantly realloc.
  String body;
  body.reserve(12288);
  {
    char hdr[256];
    snprintf(hdr, sizeof(hdr),
             "{\"ok\":true,\"slot\":%d,\"alias\":\"%s\","
             "\"boundaryPoints\":%d,\"obstacleCount\":%d,\"channelCount\":%d,"
             "\"work\":[",
             slot, jsonEscape(alias).c_str(),
             boundaryPoints, obstacleCount, channelCount);
    body += hdr;
  }
  {
    bool first = true;
    polygonToJsonAppend(workPath, 200, body, first);
  }
  body += "],\"obstacles\":[";

  String prefix = String("map") + slot + "_";
  String chPrefix = String("map") + slot + "to";
  {
    bool firstObs = true;
    File dir = LittleFS.open("/session");
    if (dir && dir.isDirectory()) {
      File entry = dir.openNextFile();
      while (entry) {
        String name = entry.name();
        int sl = name.lastIndexOf('/');
        if (sl >= 0) name = name.substring(sl + 1);
        if (name.startsWith(prefix) && name.endsWith("_obstacle.csv")) {
          String full = String("/session/") + name;
          entry.close();
          if (!firstObs) body += ',';
          firstObs = false;
          body += "{\"name\":\"";
          body += jsonEscape(name);
          body += "\",\"points\":[";
          bool firstPt = true;
          polygonToJsonAppend(full, 60, body, firstPt);
          body += "]}";
        } else {
          entry.close();
        }
        entry = dir.openNextFile();
      }
      dir.close();
    }
  }
  body += "],\"channels\":[";
  {
    bool firstCh = true;
    File dir2 = LittleFS.open("/session");
    if (dir2 && dir2.isDirectory()) {
      File entry = dir2.openNextFile();
      while (entry) {
        String name = entry.name();
        int sl = name.lastIndexOf('/');
        if (sl >= 0) name = name.substring(sl + 1);
        if (name.startsWith(chPrefix) && name.endsWith("_unicom.csv")) {
          int afterTo = chPrefix.length();
          int beforeSuffix = name.length() - strlen("_unicom.csv");
          String target = (beforeSuffix > afterTo)
                            ? name.substring(afterTo, beforeSuffix) : String("?");
          String full = String("/session/") + name;
          entry.close();
          if (!firstCh) body += ',';
          firstCh = false;
          body += "{\"target\":\"";
          body += jsonEscape(target);
          body += "\",\"points\":[";
          bool firstPt = true;
          polygonToJsonAppend(full, 200, body, firstPt);
          body += "]}";
        } else {
          entry.close();
        }
        entry = dir2.openNextFile();
      }
      dir2.close();
    }
  }
  body += "]}";

  // One Content-Length response, no chunked transfer. ESP32 WebServer
  // emits proper headers + body and closes the socket cleanly. The
  // device stays pingable through this whole call (was the bug we hit
  // with the previous streaming code).
  sendStringCooperatively(200, "application/json", body);
}

// Delete one obstacle CSV by its filesystem name. Auth-required. The
// filename ships in as a query parameter (not the path) so we don't
// have to wrestle with WebServer's lack of path params; the body
// would also work but auth-headers + query is simpler client-side.
//
// Safety: name MUST match the expected `mapN_<i>_obstacle.csv` pattern
// AND live under /session/. Anything else (path traversal, deletion
// of work polygons or unrelated files) is rejected with 400.
static void handleObstacleDelete() {
  if (!requireAuth()) return;
  String name;
  if (server.hasArg("name")) name = server.arg("name");
  name.trim();

  // Length-bounded sanity check before we even hit the regex-ish test.
  if (name.length() < 18 || name.length() > 40) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"bad name length\"}");
    return;
  }
  // No path separators / parent dirs / hidden files.
  if (name.indexOf('/') >= 0 || name.indexOf('\\') >= 0 || name.startsWith(".")) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"path not allowed\"}");
    return;
  }
  // Must look like mapN_<i>_obstacle.csv (N: 0..2, i: 0..31). Cheap
  // hand-rolled match — sscanf is too lenient and accepts negatives.
  if (!name.startsWith("map") || !name.endsWith("_obstacle.csv")) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"not an obstacle file\"}");
    return;
  }
  if (name.length() < 5 || name[4] != '_') {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"bad map slot\"}");
    return;
  }
  char slotChar = name[3];
  if (slotChar < '0' || slotChar > '2') {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"bad map slot\"}");
    return;
  }

  String fullPath = String("/session/") + name;
  if (!LittleFS.exists(fullPath)) {
    server.send(404, "application/json", "{\"ok\":false,\"error\":\"not found\"}");
    return;
  }
  if (!LittleFS.remove(fullPath)) {
    server.send(500, "application/json", "{\"ok\":false,\"error\":\"remove failed\"}");
    return;
  }
  weblogf("[obstacle] deleted %s\n", name.c_str());

  // DON'T refresh the on-device view inline — tft_ui_view_map_slot
  // does multiple LittleFS reads + a per-point lat/lng conversion.
  // Defer the refresh to the main loop so the HTTP response can finish
  // quickly while the realtime GNSS/LoRa task keeps UART service alive.
  int viewing = tft_ui_current_view_slot();
  if (viewing >= 0 && (slotChar - '0') == viewing) {
    g_pendingViewRefreshSlot = viewing;
  }

  JsonDocument resp;
  resp["ok"] = true;
  resp["deleted"] = name;
  sendJson(200, resp);
}

static void handleMapView() {
  if (!requireAuth()) return;
  if (!server.hasArg("plain")) {
    server.send(400, "text/plain", "no body"); return;
  }
  JsonDocument body;
  if (deserializeJson(body, server.arg("plain"))) {
    server.send(400, "text/plain", "bad json"); return;
  }
  int slot = body["slot"] | -2;
  if (slot < -1 || slot >= 3) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"slot must be -1..2\"}");
    return;
  }
  if (slot < 0) {
    // Exit is cheap (just zeroes a few state vars) so we do it inline.
    tft_ui_exit_view_map();
    server.send(200, "application/json", "{\"ok\":true,\"viewingSlot\":-1}");
    return;
  }
  // Load is expensive — load_saved_map_polygon + load_saved_map_obstacles
  // do 500+ ms of LittleFS reads + per-point lat/lng conversion. Defer to
  // the main loop; the response goes out immediately and the realtime
  // GNSS/LoRa task keeps UART service alive while the TFT catches up.
  //
  // We can't pre-validate the slot here without doing the same expensive
  // work, so the response is optimistically 200 OK. If the slot is
  // missing-on-disk the on-device side just silently keeps its previous
  // viewing state — same outcome as a manual TFT tap on a missing row.
  g_pendingViewRefreshSlot = slot;
  JsonDocument resp;
  resp["ok"] = true;
  resp["viewingSlot"] = slot;
  sendJson(200, resp);
}

static void handleConfigLoraGet() {
  JsonDocument doc;
  coreLock();
  doc["addr"]    = cfg.loraAddr;
  doc["channel"] = cfg.loraChannel;
  doc["hc"]      = cfg.loraHc;
  doc["lc"]      = cfg.loraLc;
  doc["packetLenCode"] = cfg.loraPacketLenCode;
  doc["packetLen"]     = loraPacketLenBytes(cfg.loraPacketLenCode);
  doc["airRateCode"]   = cfg.loraAirRateCode;
  doc["rtcmOnlyFeed"] = cfg.loraRtcmOnlyFeed;
  doc["feedPolicy"]    = cfg.loraRtcmOnlyFeed ? "rtcm_only" : "raw_0x31";
  doc["directGnssWrite"] = cfg.loraDirectGnssWrite;
  doc["txMode"] = cfg.loraDirectGnssWrite ? "legacy_direct" : "queued";
  doc["correctionSource"] = cfg.useNtripCorrections ? "ntrip" : "lora";
  doc["navMode"] = cfg.gnssNavMode;  // PAIR080: 0 Normal,1 Fitness,4 Stationary,5 Drone,7 Swimming,9 Bike
  coreUnlock();
  uint16_t dropTypes[WALKER_LORA_RTCM_DROP_TYPE_SLOTS] = {0};
  size_t dropCount = walkerLoraGetRtcmDropTypes(dropTypes, WALKER_LORA_RTCM_DROP_TYPE_SLOTS);
  JsonArray rtcmDropTypes = doc["rtcmDropTypes"].to<JsonArray>();
  for (size_t i = 0; i < dropCount; i++) rtcmDropTypes.add(dropTypes[i]);
  sendJson(200, doc);
}

static void handleConfigLoraPost() {
  if (!requireAuth()) return;
  if (!server.hasArg("plain")) { server.send(400, "text/plain", "no body"); return; }
  JsonDocument body;
  if (deserializeJson(body, server.arg("plain"))) {
    server.send(400, "text/plain", "bad json"); return;
  }
  WalkerConfigUpdate upd;
  if (body["addr"].is<int>()) {
    int v = body["addr"];
    if (v < 1 || v > 65535) { server.send(400, "text/plain", "addr 1..65535"); return; }
    upd.loraAddrSet = true; upd.loraAddr = (uint16_t) v;
  }
  if (body["channel"].is<int>()) {
    int v = body["channel"];
    if (v < 0 || v > 83) { server.send(400, "text/plain", "channel 0..83"); return; }
    upd.loraChannelSet = true; upd.loraChannel = (uint8_t) v;
  }
  if (body["hc"].is<int>()) {
    int v = body["hc"];
    if (v < 0 || v > 83) { server.send(400, "text/plain", "hc 0..83"); return; }
    upd.loraHcSet = true; upd.loraHc = (uint8_t) v;
  }
  if (body["lc"].is<int>()) {
    int v = body["lc"];
    if (v < 0 || v > 83) { server.send(400, "text/plain", "lc 0..83"); return; }
    upd.loraLcSet = true; upd.loraLc = (uint8_t) v;
  }
  if (body["packetLenCode"].is<int>()) {
    int v = body["packetLenCode"];
    if (v < 0 || v > 3) { server.send(400, "text/plain", "packetLenCode 0..3"); return; }
    upd.loraPacketLenCodeSet = true; upd.loraPacketLenCode = (uint8_t) v;
  } else if (body["packetLen"].is<int>()) {
    uint8_t code = 0;
    int bytes = body["packetLen"];
    if (!loraPacketLenCodeFromBytes(bytes, code)) {
      server.send(400, "text/plain", "packetLen 240/128/64/32"); return;
    }
    upd.loraPacketLenCodeSet = true; upd.loraPacketLenCode = code;
  }
  if (body["airRateCode"].is<int>()) {
    int v = body["airRateCode"];
    if (v < 0 || v > 7) { server.send(400, "text/plain", "airRateCode 0..7"); return; }
    upd.loraAirRateCodeSet = true; upd.loraAirRateCode = (uint8_t) v;
  }
  if (body["rtcmOnlyFeed"].is<bool>()) {
    upd.loraRtcmOnlyFeedSet = true;
    upd.loraRtcmOnlyFeed = body["rtcmOnlyFeed"].as<bool>();
  }
  if (body["feedPolicy"].is<const char*>()) {
    String policy = body["feedPolicy"].as<String>();
    policy.trim();
    if (policy == "raw_0x31" || policy == "raw") {
      upd.loraRtcmOnlyFeedSet = true;
      upd.loraRtcmOnlyFeed = false;
    } else if (policy == "rtcm_only" || policy == "rtcm") {
      upd.loraRtcmOnlyFeedSet = true;
      upd.loraRtcmOnlyFeed = true;
    } else {
      server.send(400, "text/plain", "feedPolicy raw_0x31/rtcm_only"); return;
    }
  }
  if (body["directGnssWrite"].is<bool>()) {
    upd.loraDirectGnssWriteSet = true;
    upd.loraDirectGnssWrite = body["directGnssWrite"].as<bool>();
  }
  if (body["txMode"].is<const char*>()) {
    String txMode = body["txMode"].as<String>();
    txMode.trim();
    if (txMode == "queued" || txMode == "queue") {
      upd.loraDirectGnssWriteSet = true;
      upd.loraDirectGnssWrite = false;
    } else if (txMode == "legacy_direct" || txMode == "direct") {
      upd.loraDirectGnssWriteSet = true;
      upd.loraDirectGnssWrite = true;
    } else {
      server.send(400, "text/plain", "txMode queued/legacy_direct"); return;
    }
  }
  if (body["correctionSource"].is<const char*>()) {
    String src = body["correctionSource"].as<String>();
    src.trim();
    if (src == "lora") {
      upd.useNtripCorrectionsSet = true;
      upd.useNtripCorrections = false;
    } else if (src == "ntrip") {
      upd.useNtripCorrectionsSet = true;
      upd.useNtripCorrections = true;
    } else {
      server.send(400, "text/plain", "correctionSource lora/ntrip"); return;
    }
  }
  if (body["navMode"].is<int>()) {
    int v = body["navMode"];
    if (v != 0 && v != 1 && v != 4 && v != 5 && v != 7 && v != 9) {
      server.send(400, "text/plain", "navMode 0=Normal 1=Fitness 4=Stationary 5=Drone 7=Swimming 9=Bike");
      return;
    }
    upd.gnssNavModeSet = true; upd.gnssNavMode = (uint8_t) v;
  }
  bool rtcmDropTypesSet = false;
  uint16_t rtcmDropTypes[WALKER_LORA_RTCM_DROP_TYPE_SLOTS] = {0};
  size_t rtcmDropTypeCount = 0;
  if (!body["rtcmDropTypes"].isNull()) {
    if (!body["rtcmDropTypes"].is<JsonArray>()) {
      server.send(400, "text/plain", "rtcmDropTypes must be array"); return;
    }
    JsonArray arr = body["rtcmDropTypes"].as<JsonArray>();
    for (JsonVariant v : arr) {
      if (!v.is<int>()) {
        server.send(400, "text/plain", "rtcmDropTypes values must be int"); return;
      }
      int t = v.as<int>();
      if (t < 1 || t > 4095) {
        server.send(400, "text/plain", "rtcmDropTypes values 1..4095"); return;
      }
      if (rtcmDropTypeCount >= WALKER_LORA_RTCM_DROP_TYPE_SLOTS) {
        server.send(400, "text/plain", "too many rtcmDropTypes"); return;
      }
      rtcmDropTypes[rtcmDropTypeCount++] = (uint16_t)t;
    }
    rtcmDropTypesSet = true;
  }
  walkerApplyConfig(upd);
  if (rtcmDropTypesSet) {
    walkerLoraSetRtcmDropTypes(rtcmDropTypes, rtcmDropTypeCount);
  }
  JsonDocument resp;
  resp["ok"] = true;
  if (rtcmDropTypesSet) {
    JsonArray arr = resp["rtcmDropTypes"].to<JsonArray>();
    for (size_t i = 0; i < rtcmDropTypeCount; i++) arr.add(rtcmDropTypes[i]);
  }
  sendJson(200, resp);
}

static void handleRtcmLog() {
  // Default to a tiny tail for the Web UI. Allow explicit diagnostic
  // captures large enough to include the 10 s 1006/1033 reference burst.
  const size_t DEFAULT_WANT = 512;
  const size_t MAX_WANT = 4096;
  size_t want = DEFAULT_WANT;
  if (server.hasArg("bytes")) {
    int requested = server.arg("bytes").toInt();
    if (requested > 0) {
      want = (size_t) requested;
      if (want > MAX_WANT) want = MAX_WANT;
    }
  }
  static char hexbuf[2 * MAX_WANT + 1];
  uint32_t seq = 0;
  RtcmLogSource src = RTCM_SRC_NONE;
  size_t n = rtcmLogSnapshot(hexbuf, want, &seq, &src);

  const char* srcStr = "none";
  if (src == RTCM_SRC_LORA)  srcStr = "lora";
  if (src == RTCM_SRC_NTRIP) srcStr = "ntrip";

  char prefix[128];
  int prefixLen = snprintf(prefix, sizeof(prefix),
                           "{\"bytesAvailable\":%lu,\"bytesRequested\":%lu,\"seq\":%lu,\"source\":\"%s\",\"hex\":\"",
                           (unsigned long) n, (unsigned long) want,
                           (unsigned long) seq, srcStr);
  if (prefixLen < 0) {
    server.send(500, "text/plain", "format error");
    return;
  }
  if ((size_t) prefixLen >= sizeof(prefix)) prefixLen = sizeof(prefix) - 1;

  const char suffix[] = "\"}";
  const size_t hexLen = n * 2;
  server.setContentLength((size_t) prefixLen + hexLen + (sizeof(suffix) - 1));
  server.send(200, "application/json", "");
  server.sendContent(prefix, (size_t) prefixLen);
  constexpr size_t kHttpChunkBytes = 512;
  for (size_t off = 0; off < hexLen; off += kHttpChunkBytes) {
    size_t chunk = hexLen - off;
    if (chunk > kHttpChunkBytes) chunk = kHttpChunkBytes;
    server.sendContent(hexbuf + off, chunk);
    serviceRealtimeDuringHttp();
  }
  server.sendContent(suffix, sizeof(suffix) - 1);
}

static void handleConfigGet() {
  JsonDocument doc;
  coreLock();
  doc["ssid"]  = cfg.ssid;
  doc["host"]  = cfg.ntripHost;
  doc["port"]  = cfg.ntripPort;
  doc["mount"] = cfg.ntripMount;
  doc["user"]  = cfg.ntripUser;
  coreUnlock();
  sendJson(200, doc);
}

static void handleConfigPost() {
  if (!requireAuth()) return;
  if (!server.hasArg("plain")) { server.send(400, "text/plain", "no body"); return; }
  JsonDocument body;
  if (deserializeJson(body, server.arg("plain"))) {
    server.send(400, "text/plain", "bad json"); return;
  }
  // For security the GET /api/config doesn't leak the saved passwords
  // back to the form, so on re-submit those fields arrive empty unless
  // the user retypes them. Treat an empty incoming string as "leave the
  // stored value alone" so the user can update e.g. the mountpoint
  // without wiping the WiFi password.
  auto maybeSetString = [&](const char* key, String& target) {
    if (!body[key].is<const char*>()) return;
    String v = String((const char*) body[key]);
    if (v.length() == 0) return;
    target = v;
  };
  coreLock();
  if (body["ssid"].is<const char*>())  cfg.ssid       = String((const char*) body["ssid"]);
  maybeSetString("pass",  cfg.pass);
  if (body["host"].is<const char*>())  cfg.ntripHost  = String((const char*) body["host"]);
  if (body["port"].is<int>()) {
    int port = (int) body["port"];
    if (port < 1 || port > 65535) {
      coreUnlock();
      server.send(400, "application/json", "{\"ok\":false,\"error\":\"port out of range\"}");
      return;
    }
    cfg.ntripPort = (uint16_t) port;
  }
  if (body["mount"].is<const char*>()) cfg.ntripMount = String((const char*) body["mount"]);
  if (body["user"].is<const char*>())  cfg.ntripUser  = String((const char*) body["user"]);
  maybeSetString("npass", cfg.ntripPass);
  saveConfig();
  coreUnlock();
  server.send(200, "application/json", "{\"ok\":true}");
  delay(500);
  ESP.restart();
}

// ── Server upload target config (Task 10) ────────────────────────────
// Separate endpoint from /api/config so the WiFi/NTRIP form can be saved
// (with a reboot) independently from the upload target (no reboot needed
// — the values are read fresh on every upload).
static void handleConfigServerGet() {
  JsonDocument doc;
  coreLock();
  doc["serverUrl"] = cfg.serverUrl;
  coreUnlock();
  sendJson(200, doc);
}

static void handleConfigServerPost() {
  if (!requireAuth()) return;
  if (!server.hasArg("plain")) { server.send(400, "text/plain", "no body"); return; }
  JsonDocument body;
  if (deserializeJson(body, server.arg("plain"))) {
    server.send(400, "text/plain", "bad json"); return;
  }
  // Empty value means "leave existing alone". serverUrl is the only
  // field; mowerSn + adminToken were removed because the server-side
  // walker-bundles upload + walker-firmware binary download are both
  // public LAN-only endpoints now.
  coreLock();
  if (body["serverUrl"].is<const char*>()) {
    String v = String((const char*) body["serverUrl"]);
    if (v.length() > 0) cfg.serverUrl = v;
  }
  saveConfig();
  coreUnlock();
  server.send(200, "application/json", "{\"ok\":true}");
}

static bool validateMapsHaveChargeChannels(String& outMsg) {
  MapEntry maps[3];
  size_t mapCount = 0;
  sessionStore.listMaps(maps, 3, mapCount);
  for (size_t i = 0; i < mapCount; i++) {
    if (!sessionStore.hasChargeChannel(maps[i].slot)) {
      outMsg = "map" + String(maps[i].slot) + " needs charger channel";
      return false;
    }
  }
  return true;
}

// uploadBundleToServer — build a fresh .novabundle from the current
// /session/ state and POST it as multipart/form-data to the admin-import
// endpoint. Synchronous: caller (HTTP handler or LVGL button) blocks for
// the whole upload. ESP32-S3 N16R8 has 8 MB PSRAM; typical bundles are
// <1 MB so we load the whole thing into PSRAM and ship it in one write.
//
// On non-PSRAM builds we fall back to internal heap with a 256 KB cap —
// both walker targets currently have BOARD_HAS_PSRAM set so the fallback
// is just safety net.
bool uploadBundleToServer(String& outMsg) {
  // Walker is now SN-agnostic for uploads — the server stores the bundle in
  // a shared library and the operator assigns it to a specific mower later
  // via the admin UI. Upload is mounted publicly on the server (LAN-only
  // threat model), so the walker no longer needs any auth token at all.
  coreLock();
  String serverUrl = cfg.serverUrl;
  coreUnlock();

  if (serverUrl.isEmpty()) {
    outMsg = "Server URL not set";
    return false;
  }
  if (WiFi.status() != WL_CONNECTED) {
    outMsg = "WiFi not connected";
    return false;
  }

  if (!validateMapsHaveChargeChannels(outMsg)) return false;

  BundleBuilder bb(sessionStore);
  String path = bb.build();
  if (path.isEmpty()) { outMsg = "Bundle build failed"; return false; }

  File f = LittleFS.open(path, FILE_READ);
  if (!f) { outMsg = "Cannot open bundle"; return false; }
  size_t fileSize = f.size();
  if (fileSize == 0) { f.close(); outMsg = "Bundle is empty"; return false; }

  // Helper that prefers PSRAM but falls back to internal heap when no
  // SPIRAM is available. ps_malloc() returns NULL on non-PSRAM boards
  // since v2 of arduino-esp32, so explicit MALLOC_CAP_SPIRAM check.
  auto allocBuf = [](size_t n) -> uint8_t* {
    void* p = nullptr;
    if (psramFound()) {
      p = heap_caps_malloc(n, MALLOC_CAP_SPIRAM);
    }
    if (!p) {
      // Non-PSRAM fallback. Cap at 256 KB to avoid OOM on a 320 KB SRAM
      // device — anything beyond that should not exist as a single
      // upload anyway.
      if (n > 256 * 1024) return nullptr;
      p = malloc(n);
    }
    return (uint8_t*) p;
  };

  String boundary = "----RtkWalkerBoundary7K9zQp";
  String head = "--" + boundary + "\r\n"
                "Content-Disposition: form-data; name=\"bundle\"; filename=\"walker.novabundle\"\r\n"
                "Content-Type: application/zip\r\n\r\n";
  String tail = "\r\n--" + boundary + "--\r\n";

  size_t totalLen = head.length() + fileSize + tail.length();
  uint8_t* body = allocBuf(totalLen);
  if (!body) {
    f.close();
    outMsg = "Body alloc failed (" + String((unsigned) totalLen) + " B)";
    return false;
  }
  memcpy(body, head.c_str(), head.length());
  size_t got = f.read(body + head.length(), fileSize);
  f.close();
  if (got != fileSize) {
    free(body);
    outMsg = "Short read";
    return false;
  }
  memcpy(body + head.length() + fileSize, tail.c_str(), tail.length());

  String url = serverUrl;
  // Allow user to enter the host with or without a trailing slash.
  if (url.endsWith("/")) url.remove(url.length() - 1);
  // Public LAN-only upload endpoint — no Authorization header required.
  url += "/api/walker-bundles";
  weblogf("[upload] POST %s (%u B)\n", url.c_str(), (unsigned) totalLen);

  HTTPClient http;
  if (!http.begin(url)) {
    free(body);
    outMsg = "HTTPClient begin failed";
    return false;
  }
  http.addHeader("Content-Type", String("multipart/form-data; boundary=") + boundary);
  http.setTimeout(30000);

  int code = http.POST(body, totalLen);
  String resp = http.getString();
  http.end();
  free(body);

  // NOTE: we deliberately do not echo the request headers in the log —
  // that would print the Authorization header (full Bearer token) to
  // both Serial and the web log buffer. Keep the JWT off the wire log.
  weblogf("[upload] HTTP %d, %u B reply\n", code, (unsigned) resp.length());

  if (code < 200 || code >= 300) {
    outMsg = "HTTP " + String(code) + ": " + resp.substring(0, 100);
    return false;
  }
  outMsg = "Uploaded to library (" + String((unsigned) fileSize) + " B): " + resp.substring(0, 80);
  return true;
}

// HTTP wrapper around uploadBundleToServer() for the web UI / curl tests.
static void handleUploadPost() {
  if (!requireAuth()) return;
  String msg;
  bool ok = uploadBundleToServer(msg);
  JsonDocument doc;
  doc["ok"] = ok;
  doc["msg"] = msg;
  sendJson(ok ? 200 : 500, doc);
}

// ── Setup ───────────────────────────────────────────────────────────
void setup() {
  // ── LC29HDA firmware-upgrade entry — must run VERY EARLY ────────────────
  // The module's Download-Mode handshake window is only ~150 ms after its
  // boot ROM starts. When the operator power-cycles the walker into upgrade
  // mode (NVS flag "gnss_up"=true, set by /api/gnss/upgrade/arm) we skip the
  // entire normal init and immediately start priming 0xA0 on the GNSS UART.
  // Escape routes: POST /api/gnss/upgrade/disarm (preferred, no button), or
  // hold BOOT at USB plug-in to keep the ESP32 ROM bootloader in download
  // mode (then re-flash via esptool / pio run -t upload). No in-setup() BOOT
  // polling — earlier 3 s polling loop here murdered the LC29HDA download
  // window every time.
  {
    prefs.begin("rtk-walker", false);
    bool gnssUpgradeArmed = prefs.getBool("gnss_up", false);
    if (gnssUpgradeArmed) {
      // CRITICAL TIMING: the LC29HDA's Download-Mode boot window is only
      // ~150 ms wide. Anything we do before the first 0xA0 (Serial.begin,
      // LittleFS.begin, prefs.getString, ...) is ms we cannot afford to lose,
      // so we run the handshake IMMEDIATELY after gnssSerial.begin and defer
      // the slow init to after the timing-critical window has passed.
      gnssSerial.begin(GNSS_BAUD, SERIAL_8N1, GNSS_RX_PIN, GNSS_TX_PIN);
      (void)runGnssUpgradeHandshake(gnssSerial);
      // Now safe to do the slow stuff: the body function reads the handshake
      // outcome via a module-internal flag and short-circuits to the "failed"
      // status if it didn't succeed.
      Serial.begin(115200);
      LittleFS.begin(true);
      String upgSsid = prefs.getString("ssid", "");
      String upgPass = prefs.getString("pass", "");
      bool ok = runGnssUpgradeBody(upgSsid, upgPass);
      if (ok) {
        // Clear the flag so the next power-cycle boots normal walker firmware
        // (and the LC29HDA, now flashed with the new firmware, boots cleanly).
        prefs.putBool("gnss_up", false);
        Serial.println("[fw-upgrade] flag cleared. Power-cycle the walker to boot normal mode + new module firmware.");
      } else {
        Serial.println("[fw-upgrade] FAILED. Power-cycle to retry (flag still armed). Hold BOOT button during power-on to escape.");
      }
      // Idle forever; the operator power-cycles to retry or escape. Pump the
      // progress HTTP server so the browser can still read the final state.
      for (;;) {
        gnssUpgradeServeTick();
        delay(20);
      }
    }
  }

  Serial.begin(115200);
  delay(200);
  webLogMux = xSemaphoreCreateRecursiveMutex();
  coreMux = xSemaphoreCreateRecursiveMutex();
  livePointsMux = xSemaphoreCreateRecursiveMutex();
  weblogf("[rtk-walker] boot version=%s build=%s %s\n",
          walkerFirmwareVersion(), __DATE__, __TIME__);

  pinMode(BUTTON_PIN, INPUT_PULLUP);

  // Default 256 B RX buffer is kept. A dedicated realtime task drains the
  // UART every few ms; bumping this to 1 KB / 4 KB ate enough internal SRAM
  // that LVGL's DMA-capable buffer alloc (~30 KB contiguous) failed during
  // tftSetup() and crashed the board on boot.
  gnssSerial.begin(GNSS_BAUD, SERIAL_8N1, GNSS_RX_PIN, GNSS_TX_PIN);
  walkerGnssTxSetup(gnssSerial);

  // Load persisted config BEFORE touching LoRa. The previous order
  // always booted the receiver with the hardcoded defaults
  // (addr=718/ch=17), then only loaded the saved LoRa settings after
  // the fact. That made "LoRa config OK" misleading when the actual
  // charger pair on disk differed.
  loadConfig();
#ifdef LORA_PRESENT
  // EBYTE E22-900T22S default UART is 9600 8N1. Mode pins start in
  // config mode (1,1); walker_lora.cpp lowers M0+M1 to data mode
  // (0,0) after the module config command ACKs.
  pinMode(LORA_M0_PIN, OUTPUT);
  pinMode(LORA_M1_PIN, OUTPUT);
  digitalWrite(LORA_M0_PIN, HIGH);
  digitalWrite(LORA_M1_PIN, HIGH);
  loraSerial.begin(9600, SERIAL_8N1, LORA_RX_PIN, LORA_TX_PIN);
  weblogf("[lora] UART2 + pins initialised (RX=%d TX=%d M0=%d M1=%d)\n",
          LORA_RX_PIN, LORA_TX_PIN, LORA_M0_PIN, LORA_M1_PIN);
#endif
#ifdef LORA_PRESENT
  WalkerLoraConfig lcfg = {
    cfg.loraAddr,
    cfg.loraChannel,
    cfg.loraHc,
    cfg.loraLc,
    cfg.loraPacketLenCode,
    cfg.loraAirRateCode,
    cfg.loraRtcmOnlyFeed,
    cfg.loraDirectGnssWrite,
  };
  walkerLoraSetup(lcfg);
  // Apply the persisted correction-source choice: when NTRIP is selected the
  // LoRa relay must not feed the module (NTRIP owns the UART corrections).
  walkerLoraSetFeedToGnss(!cfg.useNtripCorrections);
#endif

  if (!LittleFS.begin(true)) {
    weblogf("[fs] mount failed\n");
  }

  // SessionStore mounts LittleFS too (idempotent — second begin() is a no-op
  // when already mounted) and ensures /session/ + metadata.json exist. We
  // leave the explicit LittleFS.begin() above untouched so any error logging
  // around the legacy /tracks flow continues to work.
  if (!sessionStore.begin()) {
    weblogf("[session] init failed\n");
  }
  if (cfg.authToken.length() == 0) {
    weblogf("[auth] WARNING: no API token configured; setup endpoints remain open until a token is set\n");
  }

  if (cfg.ssid.length() > 0) {
    static int lastDisconnectReason = 0;
    WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
      lastDisconnectReason = info.wifi_sta_disconnected.reason;
      const char* name = WiFi.disconnectReasonName((wifi_err_reason_t) lastDisconnectReason);
      // Stash for the snapshot so the TFT banner has the human-readable
      // reason to show. Each new disconnect overwrites — the most recent
      // failure is what the user wants to see.
      coreLock();
      wifiFailReason = name ? String(name) : String("");
      coreUnlock();
      weblogf("[wifi-evt] STA disconnected - reason=%d (%s)\n",
              (int) lastDisconnectReason, name ? name : "?");
    }, ARDUINO_EVENT_WIFI_STA_DISCONNECTED);

    weblogf("[creds] build %s %s, ssid=\"%s\" (%u chars), wifi pass length=%u\n",
            __DATE__, __TIME__,
            cfg.ssid.c_str(), (unsigned) cfg.ssid.length(),
            (unsigned) cfg.pass.length());

    weblogf("[wifi] connecting to %s\n", cfg.ssid.c_str());
    WiFi.mode(WIFI_STA);
    WiFi.persistent(false);
    WiFi.setAutoReconnect(true);
    WiFi.setSleep(false);
    String hostname = setupApSsid();
    hostname.toLowerCase();
    WiFi.setHostname(hostname.c_str());
    WiFi.begin(cfg.ssid.c_str(), cfg.pass.c_str());
    unsigned long deadline = millis() + 20000;
    while (millis() < deadline && WiFi.status() != WL_CONNECTED) {
      pumpRealtimeFallbackOnce();
      delay(200);
    }
    if (WiFi.status() == WL_CONNECTED) {
      coreLock();
      wifiConnectFailed = false;
      wifiFailReason = "";
      coreUnlock();
      weblogf("[wifi] connected, ip=%s\n", WiFi.localIP().toString().c_str());
      // Sync time so CSV timestamps are real wall-clock seconds.
      configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
      // OTA boot-check used to run here, but a 30 s HTTP timeout on an
      // unreachable server would block server.begin() and the user
      // couldn't reach the web UI until the timeout fired. Deferred to
      // the main loop now (see otaBootCheckDoneMs below) so the
      // WebServer is listening on :80 before any OTA network I/O.
    } else {
      // status() : WL_NO_SSID_AVAIL (1) AP not seen, WL_CONNECT_FAILED (4)
      //            wrong password / auth reject, WL_DISCONNECTED (6) timeout.
      // Detailed reason already emitted via the wifi-evt log line above
      // (4_WAY_HANDSHAKE_TIMEOUT, AUTH_FAIL, NO_AP_FOUND, etc.).
      weblogf("[wifi] connect timeout — status=%d, falling back to AP\n",
              (int) WiFi.status());
      coreLock();
      wifiConnectFailed = true;
      if (wifiFailReason.length() == 0) wifiFailReason = "TIMEOUT";
      coreUnlock();
      startSetupAp();
    }
  } else {
    weblogf("[wifi] no SSID configured — running AP only\n");
    startSetupAp();
    weblogf("[wifi] AP ip=%s\n", WiFi.softAPIP().toString().c_str());
  }

  static const char* authHeaderKeys[] = { "Authorization", "X-Auth-Token" };
  server.collectHeaders(authHeaderKeys, 2);

  server.on("/",           HTTP_GET,  handleRoot);
  server.on("/full",       HTTP_GET,  handleFullRoot);
  server.on("/api/status",        HTTP_GET,  handleStatus);
  server.on("/api/auth",          HTTP_GET,  handleAuthGet);
  server.on("/api/auth",          HTTP_POST, handleAuthPost);
  server.on("/api/record",        HTTP_POST, handleRecord);
  server.on("/api/tracks",        HTTP_GET,  handleTracks);
  server.on("/api/track/current", HTTP_GET,  handleTrackCurrent);
  // Session maps (Recording-screen output) exposed for the web UI so it
  // can mirror the Maps tab the operator sees on the device. List + per-
  // slot detail are GET; view-control is POST.
  server.on("/api/maps",          HTTP_GET,  handleMapsList);
  server.on("/api/maps/view",     HTTP_POST, handleMapView);
  // Per-obstacle delete. POST /api/maps/obstacles/delete?name=mapN_X_obstacle.csv
  // wipes a single ring from /session/.
  server.on("/api/maps/obstacles/delete", HTTP_POST, handleObstacleDelete);
  server.on("/api/log",           HTTP_GET,  handleLog);
  server.on("/api/gnss/send",     HTTP_POST, handleGnssSend);
  // LC29HDA firmware-upgrade endpoints. Upload each blob then arm + reboot.
  server.on("/api/gnss/fw/upload", HTTP_POST,
            handleGnssFwUploadDone, handleGnssFwUploadData);
  server.on("/api/gnss/fw/status", HTTP_GET,  handleGnssFwStatus);
  server.on("/api/gnss/upgrade/arm",    HTTP_POST, handleGnssUpgradeArm);
  server.on("/api/gnss/upgrade/disarm", HTTP_POST, handleGnssUpgradeDisarm);
  server.on("/fw-upgrade",          HTTP_GET,  handleGnssFwUpgradePage);
  server.on("/api/i2c-scan",      HTTP_GET,  handleI2cScan);
  server.on("/api/ip5306",        HTTP_GET,  handleIp5306);
  server.on("/api/battery/raw",   HTTP_GET,  handleBatteryRaw);
  server.on("/api/config", HTTP_GET,  handleConfigGet);
  server.on("/api/config", HTTP_POST, handleConfigPost);
  // Server upload target (separate from WiFi/NTRIP — no reboot on save).
  server.on("/api/config/server", HTTP_GET,  handleConfigServerGet);
  server.on("/api/config/server", HTTP_POST, handleConfigServerPost);
  server.on("/api/config/lora", HTTP_GET,  handleConfigLoraGet);
  server.on("/api/config/lora", HTTP_POST, handleConfigLoraPost);
  server.on("/api/rtcm/log",    HTTP_GET,  handleRtcmLog);
  // Trigger an upload to the configured server. POSTs the freshly-built
  // .novabundle to /api/admin-status/walker-bundles (SN-agnostic library).
  server.on("/api/upload", HTTP_POST, handleUploadPost);
  // OTA: ask the server whether a newer firmware is available, expose the
  // result as JSON so the web UI can show the current/latest versions and
  // an enable/disable state for the "Update now" button.
  server.on("/api/ota/check", HTTP_GET, []() {
    OtaCheckResult r = walkerOtaCheck();
    StaticJsonDocument<512> doc;
    doc["ok"] = r.ok;
    doc["updateAvailable"] = r.updateAvailable;
    doc["currentVersion"] = r.currentVersion;
    doc["latestVersion"] = r.latestVersion;
    doc["hasMd5"] = r.md5.length() == 32;
    doc["hasSha256"] = r.sha256.length() == 64;
    doc["hasSignature"] = r.signature.length() > 0;
    doc["size"] = r.size;
    doc["keyId"] = r.keyId;
    doc["error"] = r.error;
    String out;
    serializeJson(doc, out);
    sendStringCooperatively(200, "application/json", out);
  });

  // OTA: trigger the actual update. Re-checks first so a stale browser tab
  // can't apply a payload that has since been superseded. walkerOtaApply
  // reboots on success and never returns; if we get here, it failed.
  server.on("/api/ota/apply", HTTP_POST, []() {
    if (!requireAuth()) return;
    OtaCheckResult r = walkerOtaCheck();
    if (!r.ok || !r.updateAvailable) {
      server.send(200, "application/json", "{\"ok\":false,\"error\":\"no update\"}");
      return;
    }
    String err;
    bool ok = walkerOtaApply(r.url, r.md5, r.sha256, r.size,
                             r.latestVersion, r.signature, r.keyId,
                             nullptr, err);
    StaticJsonDocument<256> doc;
    doc["ok"] = ok;
    doc["error"] = err;
    String out;
    serializeJson(doc, out);
    sendStringCooperatively(ok ? 200 : 500, "application/json", out);
  });

  // Walker bundle export — produces a .novabundle zip and streams it back.
  // Server-side (Task 8) consumes the same file to materialise a portable
  // mower bundle. Always rebuilds on request so the latest /session/ state
  // is reflected; the build cost is ~hundreds of ms for typical sessions.
  server.on("/bundle.novabundle", HTTP_GET, []() {
    if (!requireAuth()) return;
    String readyMsg;
    if (!validateMapsHaveChargeChannels(readyMsg)) {
      server.send(409, "text/plain", readyMsg);
      return;
    }
    BundleBuilder bb(sessionStore);
    String path = bb.build();
    if (path.isEmpty()) {
      server.send(500, "text/plain", "bundle build failed");
      return;
    }
    File f = LittleFS.open(path, FILE_READ);
    if (!f) {
      server.send(500, "text/plain", "bundle open failed");
      return;
    }
    server.sendHeader("Content-Disposition",
                      "attachment; filename=\"walker.novabundle\"");
    server.streamFile(f, "application/zip");
    f.close();
  });
  server.onNotFound([]() {
    if (server.uri().startsWith("/track/")) {
      handleTrackDownload();
      return;
    }
    // /api/maps/<slot> is a dynamic path that ESP32 WebServer's static
    // `server.on(...)` can't match, so route it through here. The list
    // endpoint /api/maps is registered explicitly below and takes
    // precedence over this fallback.
    if (server.uri().startsWith("/api/maps/") && server.method() == HTTP_GET) {
      handleMapDetail();
      return;
    }
    server.send(404, "text/plain", "not found");
  });
  server.begin();
  weblogf("[http] listening on :80\n");
  startRealtimePumpTask();
  startWebServerTask();

  // Bring the TFT up after WiFi + HTTP are registered. Keep this in the
  // main boot flow so there is only one LVGL/display owner and failures
  // are visible in the serial log instead of hidden in a detached task.
  tftSetup();
  // PAIR021 firmware-version query is no longer fired blindly here —
  // gnssPump() schedules it half a second after the first byte arrives,
  // so plugging the module in later still gets a clean PAIR020 reply
  // without polluting the log when no module is attached.
}

// ── Loop ────────────────────────────────────────────────────────────
static uint32_t mainTickCount = 0;

// Deferred OTA boot-check: starts once after the WebServer is listening,
// then runs in its own low-priority task. Keeping HTTPClient out of
// loop() matters: a dead manifest endpoint used to pause GNSS UART
// pumping and server.handleClient() long enough to look like a full
// firmware hang.
static bool otaBootCheckStarted = false;

static void otaBootCheckTask(void*) {
  walkerOtaAutoTick(false);
  vTaskDelete(NULL);
}

static void serialLoraScan(uint8_t chStart, uint8_t chEnd,
                           uint16_t dwellMs, uint16_t addr,
                           bool scanAllPacketCodes) {
#ifndef LORA_PRESENT
  Serial.println("lora-scan: this build has no LoRa support");
#else
  if (chStart > chEnd) {
    uint8_t tmp = chStart;
    chStart = chEnd;
    chEnd = tmp;
  }
  if (chEnd > 83) chEnd = 83;
  if (dwellMs < 250) dwellMs = 250;
  if (dwellMs > 10000) dwellMs = 10000;

  coreLock();
  WalkerLoraConfig restoreCfg = {
    cfg.loraAddr,
    cfg.loraChannel,
    cfg.loraHc,
    cfg.loraLc,
    cfg.loraPacketLenCode,
    cfg.loraAirRateCode,
    cfg.loraRtcmOnlyFeed,
    cfg.loraDirectGnssWrite,
  };
  coreUnlock();

  uint8_t packetStart = scanAllPacketCodes ? 0 : restoreCfg.packetLenCode;
  uint8_t packetEnd   = scanAllPacketCodes ? 3 : restoreCfg.packetLenCode;
  uint32_t bestRaw = 0;
  uint32_t bestFrames = 0;
  uint8_t bestPacket = packetStart;
  uint8_t bestCh = chStart;
  uint8_t bestAir = 0;

  Serial.printf("[lora-scan] addr=%u ch=%u..%u dwell=%ums packet=%s air=0..7\n",
                (unsigned) addr, (unsigned) chStart, (unsigned) chEnd,
                (unsigned) dwellMs, scanAllPacketCodes ? "0..3" : "current");

  for (uint8_t packet = packetStart; packet <= packetEnd; packet++) {
    for (uint8_t ch = chStart; ch <= chEnd; ch++) {
      for (uint8_t air = 0; air <= 7; air++) {
        WalkerLoraConfig testCfg = restoreCfg;
        testCfg.addr = addr;
        testCfg.channel = ch;
        testCfg.packetLenCode = packet;
        testCfg.airRateCode = air;
        if (!walkerLoraReconfigure(testCfg)) {
          Serial.printf("[lora-scan] ch=%u packet=%u air=%u config failed\n",
                        (unsigned) ch, (unsigned) packet, (unsigned) air);
          continue;
        }

        WalkerLoraStats before;
        walkerLoraGetStats(before);
        uint32_t until = millis() + dwellMs;
        while ((int32_t)(millis() - until) < 0) {
          pumpRealtimeFallbackOnce();
          if (!webServerTaskHandle) server.handleClient();
          ntripPump();
          buttonPump();
          batteryPump();
          tftTick();
          delay(5);
        }

        WalkerLoraStats after;
        walkerLoraGetStats(after);
        uint32_t rawDelta = after.rawBytesIn - before.rawBytesIn;
        uint32_t frameDelta = after.framesReceived - before.framesReceived;
        uint32_t rejectDelta = after.framesRejected - before.framesRejected;
        Serial.printf("[lora-scan] ch=%u packet=%u air=%u raw+%lu frames+%lu rejected+%lu\n",
                      (unsigned) ch, (unsigned) packet, (unsigned) air,
                      (unsigned long) rawDelta, (unsigned long) frameDelta,
                      (unsigned long) rejectDelta);
        if (rawDelta > bestRaw || (rawDelta == bestRaw && frameDelta > bestFrames)) {
          bestRaw = rawDelta;
          bestFrames = frameDelta;
          bestPacket = packet;
          bestCh = ch;
          bestAir = air;
        }
      }
    }
  }

  walkerLoraReconfigure(restoreCfg);
  Serial.printf("[lora-scan] best ch=%u packet=%u air=%u raw+%lu frames+%lu; restored addr=%u ch=%u packet=%u air=%u\n",
                (unsigned) bestCh, (unsigned) bestPacket, (unsigned) bestAir,
                (unsigned long) bestRaw, (unsigned long) bestFrames,
                (unsigned) restoreCfg.addr, (unsigned) restoreCfg.channel,
                (unsigned) restoreCfg.packetLenCode, (unsigned) restoreCfg.airRateCode);
#endif
}

void loop() {
  pumpRealtimeFallbackOnce();
  wifiPump();
  wifiDiagPump();
  if (!webServerTaskHandle) server.handleClient();
  ntripPump();
  pumpRealtimeFallbackOnce();
  buttonPump();
  batteryPump();
  tftTick();

  // Deferred OTA boot-check. Wait 3 s after boot so WiFi + WebServer
  // are firmly up + the first user request (if any) lands fast. The
  // actual HTTP work runs outside loop() so UART/web service cadence is
  // preserved even when the server URL is slow or unreachable.
  if (!otaBootCheckStarted && millis() > 3000 && WiFi.status() == WL_CONNECTED) {
    otaBootCheckStarted = true;
    BaseType_t ok = xTaskCreatePinnedToCore(
        otaBootCheckTask, "OTA auto", 12 * 1024, NULL, 1, NULL, 0);
    if (ok != pdPASS) {
      weblogf("[ota] auto-check task start failed\n");
    }
  }

  // Drain a deferred on-device view refresh requested by an HTTP
  // handler (e.g. /api/maps/obstacles/delete). Runs outside the HTTP
  // critical section; GNSS/LoRa keep flowing on the realtime task while
  // this LittleFS work refreshes the on-device view.
  if (g_pendingViewRefreshSlot >= 0) {
    int slot = g_pendingViewRefreshSlot;
    g_pendingViewRefreshSlot = -1;
    tft_ui_view_map_slot(slot);
    serviceRealtimeDuringHttp();
  }

  // Diagnostic heartbeats were noisy on the serial console after the UI
  // refactor — both [main-tick] and [lvgl-tick] are removed. If a future
  // hang investigation needs them back, the previous block recorded a
  // per-task counter + heap + LVGL checkpoint every 5 s.
  mainTickCount++;

  // Temporary session debug shell — remove in Task 5 cleanup
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd == "session-list") {
      MapEntry entries[3];
      size_t count = 0;
      sessionStore.listMaps(entries, 3, count);
      Serial.printf("Maps: %d\n", count);
      for (size_t i = 0; i < count; i++) {
        Serial.printf("  slot=%d alias=%s pts=%d obs=%d ch=%d\n",
                      entries[i].slot, entries[i].alias.c_str(),
                      entries[i].boundaryPoints, entries[i].obstacleCount,
                      entries[i].channelCount);
      }
    } else if (cmd == "session-reset") {
      sessionStore.reset();
      Serial.println("session reset");
    }
    else if (cmd == "wifi-status") {
      Serial.printf("wifi mode=%d status=%d ssid=%s ip=%s rssi=%d fail=%d reason=%s\n",
                    (int) WiFi.getMode(), (int) WiFi.status(),
                    WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(),
                    WiFi.RSSI(), wifiConnectFailed ? 1 : 0,
                    wifiFailReason.c_str());
    }
    else if (cmd == "lora-status") {
      WalkerLoraStats ls;
      walkerLoraGetStats(ls);
      coreLock();
      uint16_t addr = cfg.loraAddr;
      uint8_t ch = cfg.loraChannel;
      uint8_t hc = cfg.loraHc;
      uint8_t lc = cfg.loraLc;
      uint8_t packet = cfg.loraPacketLenCode;
      uint8_t air = cfg.loraAirRateCode;
      coreUnlock();
      Serial.printf("lora cfg addr=%u ch=%u hc=%u lc=%u packetCode=%u packet=%uB airCode=%u\n",
                    (unsigned) addr, (unsigned) ch, (unsigned) hc, (unsigned) lc,
                    (unsigned) packet, (unsigned) loraPacketLenBytes(packet), (unsigned) air);
      Serial.printf("lora stats ready=%d active=%d raw=%lu frames=%lu rejected=%lu bytesFwd=%lu lastFrameAgo=%ld\n",
                    ls.moduleReady, ls.active, (unsigned long) ls.rawBytesIn,
                    (unsigned long) ls.framesReceived, (unsigned long) ls.framesRejected,
                    (unsigned long) ls.bytesForwarded,
                    ls.lastFrameMsAgo == UINT32_MAX ? -1L : (long) ls.lastFrameMsAgo);
    }
    else if (cmd == "lora-scan" || cmd.startsWith("lora-scan ") ||
             cmd == "lora-scan-deep" || cmd.startsWith("lora-scan-deep ")) {
      bool deep = cmd.startsWith("lora-scan-deep");
      String rest = cmd.substring(deep ? 14 : 9);
      rest.trim();
      coreLock();
      int chStart = cfg.loraLc;
      int chEnd = cfg.loraHc;
      coreUnlock();
      int dwell = 1200;
      int addr = 65535;
      int vals[4] = {chStart, chEnd, dwell, addr};
      int n = 0;
      while (rest.length() > 0 && n < 4) {
        int sp = rest.indexOf(' ');
        String tok = (sp >= 0) ? rest.substring(0, sp) : rest;
        tok.trim();
        if (tok.length() > 0) vals[n++] = tok.toInt();
        if (sp < 0) break;
        rest = rest.substring(sp + 1);
        rest.trim();
      }
      if (n >= 1) chStart = vals[0];
      if (n >= 2) chEnd = vals[1];
      if (n >= 3) dwell = vals[2];
      if (n >= 4) addr = vals[3];
      if (chStart < 0 || chStart > 83 || chEnd < 0 || chEnd > 83 ||
          dwell < 250 || dwell > 10000 || addr < 1 || addr > 65535) {
        Serial.println("usage: lora-scan [chStart chEnd dwellMs addr] or lora-scan-deep [chStart chEnd dwellMs addr]");
      } else {
        serialLoraScan((uint8_t) chStart, (uint8_t) chEnd,
                       (uint16_t) dwell, (uint16_t) addr, deep);
      }
    }
    else if (cmd.startsWith("lora-set ") || cmd.startsWith("lora-monitor ")) {
      bool monitor = cmd.startsWith("lora-monitor ");
      String rest = cmd.substring(monitor ? 13 : 9);
      rest.trim();
      coreLock();
      int defaultPacket = cfg.loraPacketLenCode;
      int defaultAir = cfg.loraAirRateCode;
      coreUnlock();
      int vals[4] = {0, 0, defaultPacket, defaultAir};
      int n = 0;
      while (rest.length() > 0 && n < 4) {
        int sp = rest.indexOf(' ');
        String tok = (sp >= 0) ? rest.substring(0, sp) : rest;
        tok.trim();
        if (tok.length() > 0) vals[n++] = tok.toInt();
        if (sp < 0) break;
        rest = rest.substring(sp + 1);
        rest.trim();
      }
      uint32_t addrVal = monitor ? 65535 : (uint32_t) vals[0];
      uint32_t chVal = monitor ? (uint32_t) vals[0] : (uint32_t) vals[1];
      uint32_t packetVal = monitor ? (uint32_t) (n >= 2 ? vals[1] : defaultPacket)
                                   : (uint32_t) (n >= 3 ? vals[2] : defaultPacket);
      uint32_t airVal = monitor ? (uint32_t) (n >= 3 ? vals[2] : defaultAir)
                                : (uint32_t) (n >= 4 ? vals[3] : defaultAir);
      if ((!monitor && n < 2) || (monitor && n < 1) ||
          addrVal < 1 || addrVal > 65535 || chVal > 83 ||
          packetVal > 3 || airVal > 7) {
        Serial.println("usage: lora-set <addr> <ch> [packetCode 0..3] [airCode 0..7] or lora-monitor <ch> [packetCode] [airCode]");
      } else {
        WalkerConfigUpdate upd;
        upd.loraAddrSet = true; upd.loraAddr = (uint16_t) addrVal;
        upd.loraChannelSet = true; upd.loraChannel = (uint8_t) chVal;
        upd.loraPacketLenCodeSet = true; upd.loraPacketLenCode = (uint8_t) packetVal;
        upd.loraAirRateCodeSet = true; upd.loraAirRateCode = (uint8_t) airVal;
        walkerApplyConfig(upd);
        Serial.printf("lora reconfigured addr=%u ch=%u packetCode=%u airCode=%u\n",
                      (unsigned) addrVal, (unsigned) chVal,
                      (unsigned) packetVal, (unsigned) airVal);
      }
    }
    else if (cmd == "rec-work") {
      int s = -1;
      if (recorder.startWork(s)) Serial.printf("started work slot=%d\n", s);
      else Serial.println("startWork failed (max slots reached?)");
    }
    else if (cmd.startsWith("rec-obs")) {
      String rest = cmd.substring(7); rest.trim();
      int slot = rest.toInt();
      if (recorder.startObstacle(slot)) Serial.printf("started obstacle for parent=%d\n", slot);
      else Serial.println("startObstacle failed");
    }
    else if (cmd.startsWith("rec-ch ")) {
      int sp = cmd.indexOf(' ', 7);
      int slot = cmd.substring(7, sp).toInt();
      String target = cmd.substring(sp + 1); target.trim();
      if (recorder.startChannel(slot, target)) Serial.printf("started channel %d->%s\n", slot, target.c_str());
      else Serial.println("startChannel failed");
    }
    else if (cmd == "rec-stop") {
      recorder.stop(false);
      Serial.println("stopped (saved)");
    }
    else if (cmd == "rec-cancel") {
      recorder.stop(true);
      Serial.println("stopped (discarded)");
    }
    else if (cmd == "rec-status") {
      const auto& s = recorder.state();
      Serial.printf("mode=%d parent=%d obsIdx=%d target=%s captured=%lu dropped=%lu fixQ=%d\n",
          (int)s.mode, s.parentSlot, s.obstacleIdx, s.channelTarget.c_str(),
          s.pointsCaptured, s.pointsDropped, (int)s.lastFixQuality);
    }
  }

  delay(1);
}

// ── walker_api implementation ───────────────────────────────────────
// Single concrete impl for both build targets — the TFT-only target
// uses these via tft_ui.cpp; the headless target compiles them too
// (they're cheap) but nothing calls them.
void walkerGetSnapshot(WalkerSnapshot& out) {
  coreLock();
  out.lat        = st.lat;
  out.lng        = st.lng;
  out.alt        = st.alt;
  out.fix        = st.fix;
  out.sats       = st.sats;
  out.hdop       = st.hdop;
  out.recording  = st.recording;
  out.recPoints  = st.recPoints;
  out.ntripBytes = st.ntripBytes;
  out.wifiUp     = (WiFi.status() == WL_CONNECTED);
  out.apMode     = !out.wifiUp && WiFi.getMode() == WIFI_AP;
  out.ntripUp    = (ntripState == NTRIP_STREAMING);
  out.gnssAlive  = (lastGnssByteMs != 0);
  out.msSinceGnssByte = lastGnssByteMs ? (millis() - lastGnssByteMs) : (uint32_t) 0xFFFFFFFF;
  out.gnssRateHz   = gnssRateHz;
  out.gnss5HzAcked = pair050Acked;
  out.wifiConnectFailed = wifiConnectFailed;
  out.wifiFailReason    = wifiFailReason;
#ifdef BAT_ADC
  out.batteryPresent  = batteryReady;
  out.batteryVolts    = batteryVoltsEma;
  out.batteryPercent  = batteryReady ? batteryPercentFromVolts(batteryVoltsEma) : 0;
  out.batteryCharging = batteryReady && batteryCharging;
#else
  out.batteryPresent  = false;
  out.batteryVolts    = 0.0f;
  out.batteryPercent  = 0;
  out.batteryCharging = false;
#endif
  out.walkedM  = (float) walkedM;
  // Only meaningful once the first point landed; before that, no anchor.
  if ((firstLat != 0 || firstLng != 0) && st.fix != 0) {
    out.closingM = (float) haversineM(st.lat, st.lng, firstLat, firstLng);
  } else {
    out.closingM = 0;
  }
  out.areaM2   = (float) lastAreaM2;
  out.wifiSsid   = cfg.ssid;
  out.authConfigured = cfg.authToken.length() > 0;
  WalkerLoraStats lstats;
  walkerLoraGetStats(lstats);
  out.loraActive          = lstats.active;
  out.loraModuleReady     = lstats.moduleReady;
  out.loraBytesForwarded  = lstats.bytesForwarded;
  out.loraFramesReceived  = lstats.framesReceived;
  out.correctionUsesNtrip = cfg.useNtripCorrections;
  coreUnlock();
  if (out.wifiUp)        out.wifiIp = WiFi.localIP().toString();
  else if (out.apMode)   out.wifiIp = WiFi.softAPIP().toString();
  else                   out.wifiIp = "";
}

void walkerGetConfig(WalkerConfigView& out) {
  coreLock();
  out.wifiSsid        = cfg.ssid;
  out.wifiPassMasked  = cfg.pass.length() ? "********" : "";
  out.ntripHost       = cfg.ntripHost;
  out.ntripPort       = cfg.ntripPort;
  out.ntripMount      = cfg.ntripMount;
  out.ntripUser       = cfg.ntripUser;
  out.ntripPassMasked = cfg.ntripPass.length() ? "********" : "";
  out.serverUrl       = cfg.serverUrl;
  out.otaAutoCheck    = cfg.otaAutoCheck;
  out.authConfigured  = cfg.authToken.length() > 0;
  out.loraAddr     = cfg.loraAddr;
  out.loraChannel  = cfg.loraChannel;
  out.loraHc       = cfg.loraHc;
  out.loraLc       = cfg.loraLc;
  out.loraPacketLenCode = cfg.loraPacketLenCode;
  out.loraAirRateCode   = cfg.loraAirRateCode;
  out.loraRtcmOnlyFeed  = cfg.loraRtcmOnlyFeed;
  out.loraDirectGnssWrite = cfg.loraDirectGnssWrite;
  coreUnlock();
}

void walkerApplyConfig(const WalkerConfigUpdate& upd) {
  prefs.begin("rtk-walker", false);
  // TEMP debug: log every field touched by the save AND whether the
  // field was deliberately omitted (so we can see whether the TFT save
  // path picked up the password the user typed). Pair this with the
  // boot-time wifi-dbg log so a missing password can be traced back
  // to either "blank field at save" or "NVS write failed".
  weblogf("[cfg-dbg] ssid %s\n", upd.wifiSsidSet
            ? (String("set to \"") + upd.wifiSsid + "\"").c_str()
            : "kept");
  weblogf("[cfg-dbg] pass %s\n", upd.wifiPassSet
            ? (String("set (") + upd.wifiPass.length() + " chars)").c_str()
            : "kept (left blank in form)");
  weblogf("[cfg-dbg] ntrip host %s, port %s, mount %s, user %s, pass %s\n",
          upd.ntripHostSet  ? "set" : "kept",
          upd.ntripPortSet  ? "set" : "kept",
          upd.ntripMountSet ? "set" : "kept",
          upd.ntripUserSet  ? "set" : "kept",
          upd.ntripPassSet  ? "set" : "kept (blank in form)");

  bool needsReboot = upd.wifiSsidSet || upd.wifiPassSet ||
                     upd.ntripHostSet || upd.ntripPortSet ||
                     upd.ntripMountSet || upd.ntripUserSet ||
                     upd.ntripPassSet;

  coreLock();
  if (upd.wifiSsidSet)  { cfg.ssid       = upd.wifiSsid;  }
  if (upd.wifiPassSet)  { cfg.pass       = upd.wifiPass;  }
  if (upd.ntripHostSet) { cfg.ntripHost  = upd.ntripHost; }
  if (upd.ntripPortSet) { cfg.ntripPort  = upd.ntripPort; }
  if (upd.ntripMountSet){ cfg.ntripMount = upd.ntripMount;}
  if (upd.ntripUserSet) { cfg.ntripUser  = upd.ntripUser; }
  if (upd.ntripPassSet) { cfg.ntripPass  = upd.ntripPass; }
  if (upd.otaAutoCheckSet) { cfg.otaAutoCheck = upd.otaAutoCheck; }
  bool loraChanged = false;
  if (upd.loraAddrSet)    { cfg.loraAddr    = upd.loraAddr;    loraChanged = true; }
  if (upd.loraChannelSet) { cfg.loraChannel = upd.loraChannel; loraChanged = true; }
  if (upd.loraHcSet)      { cfg.loraHc      = upd.loraHc;      loraChanged = true; }
  if (upd.loraLcSet)      { cfg.loraLc      = upd.loraLc;      loraChanged = true; }
  if (upd.loraPacketLenCodeSet) { cfg.loraPacketLenCode = upd.loraPacketLenCode; loraChanged = true; }
  if (upd.loraAirRateCodeSet)   { cfg.loraAirRateCode   = upd.loraAirRateCode;   loraChanged = true; }
  bool loraFeedPolicyChanged = false;
  if (upd.loraRtcmOnlyFeedSet) {
    cfg.loraRtcmOnlyFeed = upd.loraRtcmOnlyFeed;
    loraFeedPolicyChanged = true;
  }
  bool loraTxModeChanged = false;
  if (upd.loraDirectGnssWriteSet) {
    cfg.loraDirectGnssWrite = upd.loraDirectGnssWrite;
    loraTxModeChanged = true;
  }
  bool correctionSourceChanged = false;
  if (upd.useNtripCorrectionsSet) {
    cfg.useNtripCorrections = upd.useNtripCorrections;
    correctionSourceChanged = true;
  }
  bool navModeChanged = false;
  if (upd.gnssNavModeSet) {
    cfg.gnssNavMode = upd.gnssNavMode;
    navModeChanged = true;
  }
  saveConfig();
  if (needsReboot) {
    weblogf("[cfg] saved via TFT (effective pass length = %u); rebooting\n",
            (unsigned) cfg.pass.length());
  } else {
    weblogf("[cfg] saved via TFT (no WiFi/NTRIP changes; no reboot)\n");
  }
  // Snapshot LoRa config under the lock so walkerLoraReconfigure gets a
  // consistent copy even if another task writes cfg immediately after unlock.
  WalkerLoraConfig newLoraCfg = {
    cfg.loraAddr,
    cfg.loraChannel,
    cfg.loraHc,
    cfg.loraLc,
    cfg.loraPacketLenCode,
    cfg.loraAirRateCode,
    cfg.loraRtcmOnlyFeed,
    cfg.loraDirectGnssWrite,
  };
  bool newLoraRtcmOnlyFeed = cfg.loraRtcmOnlyFeed;
  bool newLoraDirectGnssWrite = cfg.loraDirectGnssWrite;
  bool newUseNtripCorrections = cfg.useNtripCorrections;
  uint8_t newGnssNavMode = cfg.gnssNavMode;
  coreUnlock();

  if (loraChanged) {
    walkerLoraReconfigure(newLoraCfg);
  } else {
    if (loraFeedPolicyChanged) {
      walkerLoraSetRtcmOnlyFeed(newLoraRtcmOnlyFeed);
      weblogf("[cfg] lora feed policy=%s\n",
              newLoraRtcmOnlyFeed ? "rtcm_only" : "raw_0x31");
    }
    if (loraTxModeChanged) {
      walkerLoraSetDirectGnssWrite(newLoraDirectGnssWrite);
      weblogf("[cfg] lora tx mode=%s\n",
              newLoraDirectGnssWrite ? "legacy_direct" : "queued");
    }
  }
  // Correction-source switch is independent of the LoRa-pair reconfigure
  // above: gate the LoRa relay's GNSS feed so it stops writing the module
  // when NTRIP is the active source (and resumes when LoRa is). The NTRIP
  // loop itself starts/stops via ntripReadyToRun() reading the same flag.
  if (correctionSourceChanged) {
    walkerLoraSetFeedToGnss(!newUseNtripCorrections);
    weblogf("[cfg] correction source=%s\n",
            newUseNtripCorrections ? "ntrip" : "lora");
  }
  if (navModeChanged) {
    // Clear the boot-set PAIR080 state so the realtime pump re-asserts the
    // new nav mode. Changing PAIR080 resets the GNSS solution, so it will
    // re-acquire in the new model — expect a brief sats=0 / re-converge.
    pair080Acked = false;
    pair080TxCount = 0;
    pair080LastTxMs = 0;
    weblogf("[cfg] gnss nav mode=%u (re-asserting; solution will re-acquire)\n",
            (unsigned) newGnssNavMode);
  }
  if (needsReboot) {
    delay(500);
    ESP.restart();
  }
}

bool walkerToggleRecording() {
  coreLock();
  bool wasRecording = st.recording;
  coreUnlock();
  if (wasRecording) stopRecording();
  else              startRecording();
  coreLock();
  bool nowRecording = st.recording;
  coreUnlock();
  return nowRecording;
}

String walkerLastTrackPath() {
  coreLock();
  String path = lastTrackPath;
  coreUnlock();
  return path;
}

uint32_t walkerLastTrackPoints() {
  coreLock();
  uint32_t points = lastTrackPoints;
  coreUnlock();
  return points;
}

void walkerSetLastTrack(const String& path, uint32_t points) {
  coreLock();
  lastTrackPath = path;
  lastTrackPoints = points;
  coreUnlock();
}

size_t walkerCopyLivePoints(WalkerLivePoint* dst, size_t maxCount) {
  livePointsLock();
  size_t n = livePoints.size();
  size_t result;
  if (n > maxCount) {
    // Decimate evenly so the polyline shape is preserved when the live
    // ring is bigger than what the TFT can hold (long walks).
    size_t step = (n + maxCount - 1) / maxCount;
    size_t wi = 0;
    for (size_t i = 0; i < n && wi < maxCount; i += step) {
      dst[wi].lat = livePoints[i].lat;
      dst[wi].lng = livePoints[i].lng;
      dst[wi].fix = livePoints[i].fix;
      wi++;
    }
    result = wi;
  } else {
    for (size_t i = 0; i < n; i++) {
      dst[i].lat = livePoints[i].lat;
      dst[i].lng = livePoints[i].lng;
      dst[i].fix = livePoints[i].fix;
    }
    result = n;
  }
  livePointsUnlock();
  return result;
}

void walkerPumpGnss() {
  // Wraps gnssPump() so external compilation units (the TFT loaders in
  // tft_ui.cpp) can drain the UART RX FIFO without sharing the .cpp's
  // static globals. Once the realtime task is running it owns UART parsing.
  if (!realtimePumpTaskHandle) gnssPump();
}

void walkerResetTrail() {
  livePointsLock();
  livePoints.clear();
  livePointsUnlock();
  coreLock();
  firstLat = 0;
  firstLng = 0;
  prevLat  = 0;
  prevLng  = 0;
  walkedM  = 0;
  coreUnlock();
}
