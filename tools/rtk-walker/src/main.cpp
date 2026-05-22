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
#include "walker_ota.h"
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

  // Server upload target — used by /api/upload and the TFT "Upload to server"
  // button. Empty until the user fills the new section in /api/config/server.
  // The token is a JWT Bearer; the bundle endpoint requires admin auth.
  String serverUrl;           // e.g. "http://192.168.0.247:8080"
  String mowerSn;             // e.g. "LFIN2230700238"
  String adminToken;          // raw bearer, NEVER printed/logged

  // OTA auto-check on boot. Default true — walker pulls the manifest from
  // <serverUrl>/api/walker-firmware/latest right after WiFi associates and
  // applies + reboots if newer. Settable from the TFT Settings tab so a
  // bricked-firmware scenario can be recovered by toggling this off and
  // flashing manually over USB.
  bool   otaAutoCheck = true;
} cfg;

struct Status {
  double   lat = 0, lng = 0, alt = 0;
  int      fix = 0;            // 0=none, 1=GPS, 2=DGPS, 4=RTK FIX, 5=RTK FLOAT
  int      sats = 0;
  double   hdop = 0;
  bool     recording = false;
  uint32_t recPoints = 0;
  uint64_t ntripBytes = 0;
  uint32_t lastFixMs = 0;
} st;

static File          trackFile;
static String        currentTrackName;

// Survey metrics - computed in appendPoint() and stopRecording() so
// they always reflect what's actually in the track buffer rather than
// being recomputed from scratch on each snapshot call.
static double        firstLat = 0, firstLng = 0;  // first point of current track
static double        prevLat  = 0, prevLng  = 0;  // last point appended (for incremental length)
static double        walkedM  = 0;                // running path length while recording
static double        lastAreaM2 = 0;              // Shoelace area, computed at stopRecording()
static unsigned long ntripLastConnectAttemptMs = 0;
static bool          ntripConnecting = false;
static String        ntripRecvBuf;
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

// Guards every access to `livePoints` so the main task (push_back +
// erase) and the LVGL task on the other core (walkerCopyLivePoints +
// /api/track/current serialise) don't trample each other. Standard
// FreeRTOS recursive mutex — short critical sections, no risk of
// priority-inversion or long blocks.
static SemaphoreHandle_t livePointsMux = nullptr;
static void livePointsLock()   { if (livePointsMux) xSemaphoreTakeRecursive(livePointsMux, portMAX_DELAY); }
static void livePointsUnlock() { if (livePointsMux) xSemaphoreGiveRecursive(livePointsMux); }

// Web-log ring buffer. Anything sent through weblogf() lands here in
// addition to Serial, so the phone can tail it via /api/log after the
// USB-C cable is disconnected. Buffer is bounded at WEB_LOG_MAX bytes;
// once full we drop a quarter off the front. The monotonic seq counter
// lets the client poll for "what's new since I last asked".
#define WEB_LOG_MAX 8192
static String  webLogBuf;
static uint32_t webLogSeq = 0;

static void weblogf(const char* fmt, ...) {
  char buf[256];
  va_list args;
  va_start(args, fmt);
  int n = vsnprintf(buf, sizeof(buf), fmt, args);
  va_end(args);
  if (n <= 0) return;
  Serial.print(buf);
  webLogBuf += buf;
  webLogSeq += (uint32_t) strlen(buf);
  while (webLogBuf.length() > WEB_LOG_MAX) {
    webLogBuf.remove(0, WEB_LOG_MAX / 4);
  }
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

// Tracks the most recent PAIR001 ACK so the post-detect command flow
// can verify that PAIR050 (5 Hz) was actually accepted. The LC29HDA
// silently drops PAIR commands if its parser is busy, so we have to
// look for `$PAIR001,050,0*XX` (cmd=050, result=0 → success).
static int      lastPair001Cmd = -1;
static int      lastPair001Result = -1;
static uint32_t lastPair001AtMs = 0;

static void sendGnssCommand(const String& payload) {
  uint8_t cs = 0;
  for (size_t i = 0; i < payload.length(); i++) cs ^= (uint8_t) payload[i];
  char out[200];
  snprintf(out, sizeof(out), "$%s*%02X\r\n", payload.c_str(), cs);
  gnssSerial.print(out);
  // Trim trailing \r\n for log readability.
  size_t n = strlen(out);
  while (n > 0 && (out[n-1] == '\n' || out[n-1] == '\r')) out[--n] = '\0';
  weblogf("[gnss-tx] %s\n", out);
}

static void gnssLineFeed(char c) {
  if (c == '\n' || c == '\r') {
    if (nmeaLineLen > 0) {
      nmeaLineBuf[nmeaLineLen] = '\0';
      // Surface any proprietary response (firmware version, ack, error)
      // so the diagnostic flow shows the module's reply alongside our
      // request in the same web console.
      if (nmeaLineLen >= 3 && nmeaLineBuf[0] == '$' && nmeaLineBuf[1] == 'P') {
        weblogf("[gnss-rx] %s\n", nmeaLineBuf);
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
  cfg.mowerSn     = prefs.getString("msn", "");
  cfg.adminToken  = prefs.getString("atok", "");
  cfg.otaAutoCheck = prefs.getBool("otaauto", true);
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
  prefs.putString("msn", cfg.mowerSn);
  prefs.putString("atok", cfg.adminToken);
  prefs.putBool("otaauto", cfg.otaAutoCheck);
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
  if (st.recording) return;
  if (!LittleFS.exists("/tracks")) LittleFS.mkdir("/tracks");

  time_t now;
  time(&now);
  char nameBuf[48];
  snprintf(nameBuf, sizeof(nameBuf), "/tracks/track-%lu.csv", (unsigned long) now);
  currentTrackName = String(nameBuf);

  trackFile = LittleFS.open(currentTrackName, FILE_WRITE);
  if (!trackFile) {
    weblogf("[rec] failed to open %s\n", currentTrackName.c_str());
    return;
  }
  trackFile.println("timestamp_unix,lat,lng,alt_m,fix,sats,hdop");
  trackFile.flush();
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
}

static void stopRecording() {
  if (!st.recording) return;
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
  weblogf("[rec] stopped (%u points, %.1f m walked, area %.1f m2)\n",
          st.recPoints, walkedM, lastAreaM2);
}

// Quality and motion filters that decide whether a fresh fix gets
// written to the track. Tunable from the top of the file.
//   MIN_FIX_QUALITY  - drop anything worse than RTK FIX (4). Setting
//                      to 5 also accepts RTK FLOAT (decimeter-grade,
//                      good enough for a lawn boundary if RTK FIX
//                      momentarily drops). Lower values let in plain
//                      GPS / DGPS which adds metres of noise.
//   MIN_DISPLACEMENT_M - skip fixes that haven't moved at least N cm
//                      from the previous accepted point. Cleans up
//                      standstill jitter, but set too high and slow
//                      walks lose samples — at 0.3 m/s × 200 ms = 6 cm
//                      so a 5 cm filter dropped ~half the points. 2 cm
//                      keeps enough margin against RTK FIX cm-noise
//                      without starving the polygon on a slow lap.
#define MIN_FIX_QUALITY     4
#define MIN_DISPLACEMENT_M  0.02

static void appendPoint() {
  if (!st.recording || !trackFile) return;
  // Only record actual GPS solutions. fix=0 means we have no usable
  // position; logging that would pollute the trail with zeros.
  if (st.fix == 0 || st.lat == 0 || st.lng == 0) return;
  // Quality filter: drop everything below RTK FIX. Accepts FLOAT (5)
  // as well since FLOAT is decimeter-grade and still useful for a
  // lawn outline. Plain GPS or DGPS are way too noisy for cm work.
  if (st.fix < MIN_FIX_QUALITY) return;
  // Motion filter: skip fixes within 5 cm of the last accepted point
  // (standstill RTK jitter at 5 Hz looks like a zigzag without this).
  if (firstLat != 0 || firstLng != 0) {
    double d = haversineM(prevLat, prevLng, st.lat, st.lng);
    if (d < MIN_DISPLACEMENT_M) return;
  }

  time_t now;
  time(&now);

  char line[160];
  snprintf(line, sizeof(line), "%lu,%.8f,%.8f,%.2f,%d,%d,%.2f",
           (unsigned long) now, st.lat, st.lng, st.alt, st.fix, st.sats, st.hdop);
  trackFile.println(line);
  st.recPoints++;

  // Mirror into the live-points ring so the web UI's map polls a
  // cheap JSON instead of re-reading the CSV every second. When we
  // hit the cap, drop the oldest point so the most recent N stay
  // visible — full trace still on flash.
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
  if ((st.recPoints & 0x07) == 0) trackFile.flush();
}

// ── NTRIP ───────────────────────────────────────────────────────────
// Forward decls — the real owners live in the GNSS pump section below
// but ntripConnect needs to gate on them.
extern bool     gnssDetected;
extern uint32_t lastGnssByteMs;

static void ntripConnect() {
  if (cfg.ntripMount.length() == 0) return;
  if (WiFi.status() != WL_CONNECTED) return;
  // No GNSS module → no point fetching RTCM corrections, there's
  // nothing on the other end of the UART to consume them. Skip
  // until the first NMEA byte proves the module is awake.
  if (!gnssDetected) return;
  if (ntripConnecting) return;
  unsigned long nowMs = millis();
  if (nowMs - ntripLastConnectAttemptMs < NTRIP_RECONNECT_MS) return;
  ntripLastConnectAttemptMs = nowMs;

  ntripConnecting = true;
  weblogf("[ntrip] connecting %s:%u/%s\n",
          cfg.ntripHost.c_str(), cfg.ntripPort, cfg.ntripMount.c_str());

  if (!ntrip.connect(cfg.ntripHost.c_str(), cfg.ntripPort)) {
    weblogf("[ntrip] tcp connect failed\n");
    ntripConnecting = false;
    return;
  }
  String auth = base64::encode(cfg.ntripUser + ":" + cfg.ntripPass);
  ntrip.printf("GET /%s HTTP/1.0\r\n", cfg.ntripMount.c_str());
  ntrip.printf("User-Agent: NTRIP rtk-walker/1.0\r\n");
  ntrip.printf("Authorization: Basic %s\r\n", auth.c_str());
  ntrip.printf("Accept: */*\r\n");
  ntrip.printf("Connection: close\r\n\r\n");

  // Wait briefly for the 200 OK / ICY 200 OK line.
  unsigned long deadline = millis() + 3000;
  String header;
  while (millis() < deadline) {
    while (ntrip.available()) {
      char c = ntrip.read();
      header += c;
      if (header.endsWith("\r\n\r\n") || header.endsWith("\n\n")) {
        // Centipede returns "SOURCETABLE 200 OK" (a 200 status!) when the
        // mountpoint is unknown, followed by a 250 KB list of every base
        // station as the body. Our old check was just `indexOf("200")`,
        // which matched the SOURCETABLE line too, so we'd happily forward
        // the entire sourcetable as if it were RTCM — flooding the
        // LC29HDA UART and starving the WebServer for tens of seconds.
        // Detect SOURCETABLE explicitly and bail out before any of the
        // body shows up.
        bool isSourcetable = header.indexOf("SOURCETABLE") >= 0;
        bool isStream      = header.indexOf("ICY 200") >= 0
                          || header.indexOf("HTTP/1.0 200") >= 0
                          || header.indexOf("HTTP/1.1 200") >= 0;
        if (isSourcetable) {
          weblogf("[ntrip] mountpoint unknown (SOURCETABLE response). Check the mountpoint config.\n");
          ntrip.stop();
        } else if (!isStream) {
          weblogf("[ntrip] handshake failed: %s", header.c_str());
          ntrip.stop();
        } else {
          weblogf("[ntrip] handshake OK\n");
        }
        ntripConnecting = false;
        return;
      }
    }
    delay(10);
  }
  weblogf("[ntrip] handshake timeout\n");
  ntrip.stop();
  ntripConnecting = false;
}

static void ntripPump() {
  if (!ntrip.connected()) {
    if (cfg.ntripMount.length() > 0 && WiFi.status() == WL_CONNECTED) ntripConnect();
    return;
  }
  // Hard ceiling per loop iter: at most 1 KB of RTCM goes from TCP to
  // the LC29HDA UART before we yield back to the main loop. Real RTCM
  // streams are ~1-2 KB/s so this still keeps up, but it prevents any
  // single burst (e.g. a misrouted 250 KB sourcetable) from starving
  // the WebServer for tens of seconds — the symptom we saw with the
  // wrong mountpoint, where the UI took >60 s to respond.
  uint16_t budget = 1024;
  while (ntrip.available() && budget > 0) {
    uint8_t chunk[256];
    int want = budget < sizeof(chunk) ? budget : (int) sizeof(chunk);
    int n = ntrip.read(chunk, want);
    if (n <= 0) break;
    gnssSerial.write(chunk, n);
    st.ntripBytes += n;
    budget -= n;
  }
}

// ── GNSS pump ───────────────────────────────────────────────────────
static uint32_t lastNmeaStatsMs = 0;
static uint32_t nmeaBytesThisSec = 0;
// Definitions for the forward-declared gating flags up by ntripConnect().
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
static bool     pair050_1HzSent = false; // force 1 Hz fix rate (override NV)
// PAIR050,200 (5 Hz) retry state. The LC29HDA silently drops the cmd
// if its serial parser is busy, so resend up to 4 times spaced 2 s
// apart and stop once PAIR001,050,0 ACK is observed. Confirmation goes
// into gnssRateHz so the UI can show the real measured fix rate.
static uint32_t pair050LastTxMs = 0;
static uint8_t  pair050TxCount  = 0;
static bool     pair050Acked    = false;

// Measured GGA rate (location updates per second). Rolling counter
// reset every 1000 ms; gnssRateHz holds the most recently completed
// window's count so the UI sees a stable value rather than a partial
// tally mid-window.
static uint32_t gnssRateWinStartMs = 0;
static uint16_t gnssRateWinCount   = 0;
static uint16_t gnssRateHz         = 0;

static void gnssPump() {
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
  uint32_t sinceDetect = millis() - gnssDetectedAtMs;
  if (!pair021Sent && sinceDetect >= 500) {
    sendGnssCommand("PAIR021");
    pair021Sent = true;
  }
  if (!pair050_1HzSent && sinceDetect >= 700) {
    // 1000 ms = 1 Hz. Explicit re-assert each boot so the module doesn't
    // keep an older 200 ms (5 Hz) NV setting that ruins RTK FIX lock.
    sendGnssCommand("PAIR050,1000");
    pair050_1HzSent = true;
  }
#if NMEA_HEARTBEAT
  // Periodic heartbeat so you can tell "no bytes" apart from "bytes
  // flowing but no fix indoors". Every 2 s prints a one-liner with
  // bytes-since-last-tick + current sat count. Goes through weblogf()
  // so the phone keeps seeing it after USB is unplugged.
  uint32_t nowMs = millis();
  if (nowMs - lastNmeaStatsMs >= 2000) {
    weblogf("[nmea] rx=%u bytes / 2s, sats=%d, fix=%d, hdop=%.1f, lastFixAgo=%ldms\n",
            nmeaBytesThisSec, st.sats, st.fix, st.hdop,
            st.lastFixMs ? (long)(nowMs - st.lastFixMs) : -1L);
    nmeaBytesThisSec = 0;
    lastNmeaStatsMs = nowMs;
  }
#endif
  // GGA fix quality custom field updates whenever a new GGA sentence
  // is parsed. We mirror it into Status only when we have a full new
  // sentence, otherwise we'd race against half-parsed values.
  if (gps.location.isUpdated()) {
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
    st.lastFixMs = millis();
    // Rolling 1-second window counter so the UI can show the actual
    // fix rate. Window closes when 1000 ms elapses; final count gets
    // latched into gnssRateHz and the window restarts at the current
    // sample. Lets the field confirm "5 Hz confirmed" log without
    // needing serial access.
    uint32_t nowRate = st.lastFixMs;
    if (gnssRateWinStartMs == 0) gnssRateWinStartMs = nowRate;
    gnssRateWinCount++;
    if (nowRate - gnssRateWinStartMs >= 1000) {
      gnssRateHz         = gnssRateWinCount;
      gnssRateWinCount   = 0;
      gnssRateWinStartMs = nowRate;
    }
    appendPoint();
    // Feed the new session recorder. No-op when recorder is idle, so
    // this costs essentially nothing when we're not actively capturing
    // a work/obstacle/channel session. Uses the same NMEA-decoded fix
    // quality the legacy track-* logger already filters on (st.fix
    // from $GxGGA field 6) so quality gating stays consistent across
    // the two pipelines until Task 11 retires the legacy logger.
    recorder.onFix(
        (unsigned long)(st.lastFixMs / 1000UL),
        st.lat, st.lng, st.alt,
        st.fix, st.sats, st.hdop
    );
  }
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
  esp_err_t ret = i2c_master_cmd_begin(I2C_BUS_NUM, cmd, pdMS_TO_TICKS(50));
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
      if (st.recording) stopRecording(); else startRecording();
    }
  }
}

// ── Web handlers ────────────────────────────────────────────────────
static void sendJson(int code, const JsonDocument& doc) {
  String out;
  serializeJson(doc, out);
  server.send(code, "application/json", out);
}

static void handleRoot() {
  server.send_P(200, "text/html", INDEX_HTML);
}

static void handleStatus() {
  JsonDocument doc;
  doc["fix"]        = st.fix;
  doc["sats"]       = st.sats;
  doc["hdop"]       = st.hdop;
  doc["lat"]        = st.lat;
  doc["lng"]        = st.lng;
  doc["alt"]        = st.alt;
  doc["recording"]  = st.recording;
  doc["points"]     = st.recPoints;
  doc["ntripBytes"] = st.ntripBytes;
  doc["wifiSsid"]   = cfg.ssid;
  doc["ntripUp"]    = ntrip.connected();
  doc["walkedM"]    = walkedM;
  if (firstLat != 0 || firstLng != 0) {
    doc["closingM"] = haversineM(st.lat, st.lng, firstLat, firstLng);
  }
  doc["areaM2"]     = lastAreaM2;
  doc["gnssHz"]     = gnssRateHz;
  doc["gnss5HzAcked"] = pair050Acked && lastPair001Result == 0;
#ifdef BAT_ADC
  if (batteryReady) {
    doc["batteryVolts"]    = batteryVoltsEma;
    doc["batteryPercent"]  = batteryPercentFromVolts(batteryVoltsEma);
    doc["batteryCharging"] = batteryCharging;
  }
#endif
  sendJson(200, doc);
}

static void handleRecord() {
  if (!server.hasArg("plain")) { server.send(400, "text/plain", "no body"); return; }
  JsonDocument body;
  if (deserializeJson(body, server.arg("plain"))) {
    server.send(400, "text/plain", "bad json"); return;
  }
  bool want = body["recording"] | false;
  if (want) startRecording(); else stopRecording();
  JsonDocument out;
  out["recording"] = st.recording;
  out["track"]     = currentTrackName;
  sendJson(200, out);
}

static void handleGnssSend() {
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

static void handleLog() {
  // Polling-friendly snapshot: returns the current buffer text + the
  // monotonic byte offset of the newest byte. Client should remember
  // `seq` between polls and skip the first (seq - prevSeq) chars on
  // subsequent fetches if it wants to append rather than replace.
  uint32_t firstSeq = webLogSeq - (uint32_t) webLogBuf.length();
  String out;
  out.reserve(webLogBuf.length() + 64);
  out += "{\"seq\":";
  out += webLogSeq;
  out += ",\"firstSeq\":";
  out += firstSeq;
  out += ",\"buf\":";
  // JSON-escape the buffer content
  out += '\"';
  for (size_t i = 0; i < webLogBuf.length(); i++) {
    char c = webLogBuf[i];
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
  server.send(200, "application/json", out);
}

static void handleTrackCurrent() {
  // Emit JSON as a streaming string to keep peak heap low on long
  // walks. Format: { recording: bool, points: [[lat,lng,fix], ...] }.
  String out;
  livePointsLock();
  out.reserve(64 + livePoints.size() * 32);
  out += "{\"recording\":";
  out += (st.recording ? "true" : "false");
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
  server.send(200, "application/json", out);
}

static void handleTracks() {
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
  // 7-bit addresses 0x03..0x77 are the valid scan window; 0x00..0x02
  // and 0x78..0x7F are reserved.
  for (uint8_t a = 0x03; a <= 0x77; a++) {
    if (i2cProbe(a)) arr.add((unsigned) a);
  }
  doc["sda"] = TOUCH_SDA;
  doc["scl"] = TOUCH_SCL;
  doc["bus"] = "IDF I2C_NUM_0 (touch bus)";
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

static void handleConfigGet() {
  JsonDocument doc;
  doc["ssid"]  = cfg.ssid;
  doc["host"]  = cfg.ntripHost;
  doc["port"]  = cfg.ntripPort;
  doc["mount"] = cfg.ntripMount;
  doc["user"]  = cfg.ntripUser;
  sendJson(200, doc);
}

static void handleConfigPost() {
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
  if (body["ssid"].is<const char*>())  cfg.ssid       = String((const char*) body["ssid"]);
  maybeSetString("pass",  cfg.pass);
  if (body["host"].is<const char*>())  cfg.ntripHost  = String((const char*) body["host"]);
  if (body["port"].is<int>())          cfg.ntripPort  = (uint16_t) (int) body["port"];
  if (body["mount"].is<const char*>()) cfg.ntripMount = String((const char*) body["mount"]);
  if (body["user"].is<const char*>())  cfg.ntripUser  = String((const char*) body["user"]);
  maybeSetString("npass", cfg.ntripPass);
  saveConfig();
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
  doc["serverUrl"] = cfg.serverUrl;
  doc["mowerSn"]   = cfg.mowerSn;
  // The token is sensitive — only expose its tail so the UI can confirm
  // a value is stored without dumping the JWT into the DOM. An attacker
  // with read-access to the form would otherwise own the admin account.
  String t = cfg.adminToken;
  if (t.length() > 8) {
    doc["tokenPreview"] = String("...") + t.substring(t.length() - 8);
  } else if (t.length() > 0) {
    doc["tokenPreview"] = "set";
  } else {
    doc["tokenPreview"] = "";
  }
  sendJson(200, doc);
}

static void handleConfigServerPost() {
  if (!server.hasArg("plain")) { server.send(400, "text/plain", "no body"); return; }
  JsonDocument body;
  if (deserializeJson(body, server.arg("plain"))) {
    server.send(400, "text/plain", "bad json"); return;
  }
  // Treat empty incoming strings as "leave stored value alone" — same
  // semantics as the WiFi/NTRIP form. That lets the user update only
  // the mower SN without re-pasting the JWT every time.
  auto maybeSet = [&](const char* key, String& target) {
    if (!body[key].is<const char*>()) return;
    String v = String((const char*) body[key]);
    if (v.length() == 0) return;
    target = v;
  };
  maybeSet("serverUrl",  cfg.serverUrl);
  maybeSet("mowerSn",    cfg.mowerSn);
  maybeSet("adminToken", cfg.adminToken);
  saveConfig();
  // DELIBERATELY do not log token length here — even the length leaks
  // a tiny amount of info to anyone tailing weblog/Serial.
  server.send(200, "application/json", "{\"ok\":true}");
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
  if (cfg.serverUrl.isEmpty() || cfg.mowerSn.isEmpty() || cfg.adminToken.isEmpty()) {
    outMsg = "Server config missing";
    return false;
  }
  if (WiFi.status() != WL_CONNECTED) {
    outMsg = "WiFi not connected";
    return false;
  }

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

  uint8_t* fileBuf = allocBuf(fileSize);
  if (!fileBuf) {
    f.close();
    outMsg = "Bundle alloc failed (" + String((unsigned) fileSize) + " B)";
    return false;
  }
  size_t got = f.read(fileBuf, fileSize);
  f.close();
  if (got != fileSize) {
    free(fileBuf);
    outMsg = "Short read";
    return false;
  }

  String boundary = "----RtkWalkerBoundary7K9zQp";
  String head = "--" + boundary + "\r\n"
                "Content-Disposition: form-data; name=\"bundle\"; filename=\"walker.novabundle\"\r\n"
                "Content-Type: application/zip\r\n\r\n";
  String tail = "\r\n--" + boundary + "--\r\n";

  size_t totalLen = head.length() + fileSize + tail.length();
  uint8_t* body = allocBuf(totalLen);
  if (!body) {
    free(fileBuf);
    outMsg = "Body alloc failed (" + String((unsigned) totalLen) + " B)";
    return false;
  }
  memcpy(body, head.c_str(), head.length());
  memcpy(body + head.length(), fileBuf, fileSize);
  memcpy(body + head.length() + fileSize, tail.c_str(), tail.length());
  free(fileBuf);

  String url = cfg.serverUrl;
  // Allow user to enter the host with or without a trailing slash.
  if (url.endsWith("/")) url.remove(url.length() - 1);
  url += "/api/admin-status/maps/";
  url += cfg.mowerSn;
  url += "/import-walker-bundle";
  weblogf("[upload] POST %s (%u B)\n", url.c_str(), (unsigned) totalLen);

  HTTPClient http;
  if (!http.begin(url)) {
    free(body);
    outMsg = "HTTPClient begin failed";
    return false;
  }
  http.addHeader("Authorization", String("Bearer ") + cfg.adminToken);
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
  outMsg = "Upload OK (" + String((unsigned) fileSize) + " B): " + resp.substring(0, 80);
  return true;
}

// HTTP wrapper around uploadBundleToServer() for the web UI / curl tests.
static void handleUploadPost() {
  String msg;
  bool ok = uploadBundleToServer(msg);
  JsonDocument doc;
  doc["ok"] = ok;
  doc["msg"] = msg;
  sendJson(ok ? 200 : 500, doc);
}

// ── Setup ───────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(200);
  weblogf("[rtk-walker] boot\n");

  pinMode(BUTTON_PIN, INPUT_PULLUP);

  // Default 256 B RX buffer is kept — gnssPump() runs twice per loop()
  // iteration (start + after HTTP/NTRIP) and the main loop ticks every
  // few ms, so 22 ms-to-fill-at-115200-baud is plenty. Tried bumping to
  // 1 KB / 4 KB but that ate enough internal SRAM that LVGL's DMA-
  // capable buffer alloc (~30 KB contiguous) failed during tftSetup()
  // and crashed the board on boot. Leaving the buffer alone keeps the
  // memory map LVGL needs intact.
  gnssSerial.begin(GNSS_BAUD, SERIAL_8N1, GNSS_RX_PIN, GNSS_TX_PIN);

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

  livePointsMux = xSemaphoreCreateRecursiveMutex();

  loadConfig();

  if (cfg.ssid.length() > 0) {
    // TEMP debug: dump stored creds so we can verify the keyboard
    // didn't sneak hidden chars (tabs, CRs, smart quotes) into NVS.
    // Remove this block once the no-connect cause is identified.
    auto hexDump = [](const char* label, const String& s) {
      if (s.length() == 0) {
        weblogf("[wifi-dbg] %s hex= <EMPTY>\n", label);
        return;
      }
      String hex;
      hex.reserve(s.length() * 3 + 8);
      for (size_t i = 0; i < s.length(); i++) {
        char b[4];
        snprintf(b, sizeof(b), "%02x ", (unsigned) (uint8_t) s[i]);
        hex += b;
      }
      weblogf("[wifi-dbg] %s hex= %s\n", label, hex.c_str());
    };

    static int lastDisconnectReason = 0;
    WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
      lastDisconnectReason = info.wifi_sta_disconnected.reason;
      const char* name = WiFi.disconnectReasonName((wifi_err_reason_t) lastDisconnectReason);
      // Stash for the snapshot so the TFT banner has the human-readable
      // reason to show. Each new disconnect overwrites — the most recent
      // failure is what the user wants to see.
      wifiFailReason = name ? String(name) : String("");
      weblogf("[wifi-evt] STA disconnected - reason=%d (%s)\n",
              (int) lastDisconnectReason, name ? name : "?");
    }, ARDUINO_EVENT_WIFI_STA_DISCONNECTED);

    // Scan first — surfaces neighbouring APs and confirms the target
    // SSID is reachable on 2.4 GHz with non-Enterprise encryption.
    weblogf("[wifi-dbg] scanning...\n");
    int found = WiFi.scanNetworks(false, true, false, 200);
    for (int i = 0; i < found && i < 20; i++) {
      weblogf("[wifi-dbg]   %s  RSSI=%d  ch=%d  enc=%d\n",
              WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.channel(i),
              (int) WiFi.encryptionType(i));
    }
    WiFi.scanDelete();

    // Creds dump immediately before WiFi.begin so it sits at the bottom
    // of the terminal scrollback, impossible to lose. Build stamp pinpoints
    // which firmware revision is actually running on the device.
    weblogf("[creds] ##### build %s %s #####\n", __DATE__, __TIME__);
    weblogf("[creds] ssid=\"%s\" (%u chars)\n",
            cfg.ssid.c_str(), (unsigned) cfg.ssid.length());
    hexDump("ssid", cfg.ssid);
    if (cfg.pass.length() == 0) {
      weblogf("[creds] !!!!! PASSWORD IS EMPTY IN NVS !!!!!\n");
      weblogf("[creds] pass=\"\" (0 chars)\n");
    } else {
      weblogf("[creds] pass=\"%s\" (%u chars)\n",
              cfg.pass.c_str(), (unsigned) cfg.pass.length());
    }
    hexDump("pass", cfg.pass);
    weblogf("[creds] #################################\n");

    weblogf("[wifi] connecting to %s\n", cfg.ssid.c_str());
    WiFi.mode(WIFI_STA);
    WiFi.begin(cfg.ssid.c_str(), cfg.pass.c_str());
    unsigned long deadline = millis() + 20000;
    while (millis() < deadline && WiFi.status() != WL_CONNECTED) {
      delay(200);
    }
    if (WiFi.status() == WL_CONNECTED) {
      weblogf("[wifi] connected, ip=%s\n", WiFi.localIP().toString().c_str());
      // Sync time so CSV timestamps are real wall-clock seconds.
      configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
      // OTA auto-check (respects cfg.otaAutoCheck). Applies + reboots on
      // success, returns silently on no-update or any failure mode so the
      // boot flow continues into the normal app loop.
      walkerOtaAutoTick(false);
    } else {
      // status() : WL_NO_SSID_AVAIL (1) AP not seen, WL_CONNECT_FAILED (4)
      //            wrong password / auth reject, WL_DISCONNECTED (6) timeout.
      // Detailed reason already emitted via the wifi-evt log line above
      // (4_WAY_HANDSHAKE_TIMEOUT, AUTH_FAIL, NO_AP_FOUND, etc.).
      weblogf("[wifi] connect timeout — status=%d, falling back to AP\n",
              (int) WiFi.status());
      wifiConnectFailed = true;
      if (wifiFailReason.length() == 0) wifiFailReason = "TIMEOUT";
      WiFi.mode(WIFI_AP);
      WiFi.softAP("rtk-walker-setup", "rtkwalker");
    }
  } else {
    weblogf("[wifi] no SSID configured — running AP only\n");
    WiFi.mode(WIFI_AP);
    WiFi.softAP("rtk-walker-setup", "rtkwalker");
    weblogf("[wifi] AP ip=%s\n", WiFi.softAPIP().toString().c_str());
  }

  server.on("/",           HTTP_GET,  handleRoot);
  server.on("/api/status",        HTTP_GET,  handleStatus);
  server.on("/api/record",        HTTP_POST, handleRecord);
  server.on("/api/tracks",        HTTP_GET,  handleTracks);
  server.on("/api/track/current", HTTP_GET,  handleTrackCurrent);
  server.on("/api/log",           HTTP_GET,  handleLog);
  server.on("/api/gnss/send",     HTTP_POST, handleGnssSend);
  server.on("/api/i2c-scan",      HTTP_GET,  handleI2cScan);
  server.on("/api/ip5306",        HTTP_GET,  handleIp5306);
  server.on("/api/battery/raw",   HTTP_GET,  handleBatteryRaw);
  server.on("/api/config", HTTP_GET,  handleConfigGet);
  server.on("/api/config", HTTP_POST, handleConfigPost);
  // Server upload target (separate from WiFi/NTRIP — no reboot on save).
  server.on("/api/config/server", HTTP_GET,  handleConfigServerGet);
  server.on("/api/config/server", HTTP_POST, handleConfigServerPost);
  // Trigger an upload to the configured server. POSTs the freshly-built
  // .novabundle to /api/admin-status/maps/:sn/import-walker-bundle.
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
    doc["error"] = r.error;
    String out;
    serializeJson(doc, out);
    server.send(200, "application/json", out);
  });

  // OTA: trigger the actual update. Re-checks first so a stale browser tab
  // can't apply a payload that has since been superseded. walkerOtaApply
  // reboots on success and never returns; if we get here, it failed.
  server.on("/api/ota/apply", HTTP_POST, []() {
    OtaCheckResult r = walkerOtaCheck();
    if (!r.ok || !r.updateAvailable) {
      server.send(200, "application/json", "{\"ok\":false,\"error\":\"no update\"}");
      return;
    }
    String err;
    bool ok = walkerOtaApply(r.url, r.md5, nullptr, err);
    StaticJsonDocument<256> doc;
    doc["ok"] = ok;
    doc["error"] = err;
    String out;
    serializeJson(doc, out);
    server.send(ok ? 200 : 500, "application/json", out);
  });

  // Walker bundle export — produces a .novabundle zip and streams it back.
  // Server-side (Task 8) consumes the same file to materialise a portable
  // mower bundle. Always rebuilds on request so the latest /session/ state
  // is reflected; the build cost is ~hundreds of ms for typical sessions.
  server.on("/bundle.novabundle", HTTP_GET, []() {
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
    server.send(404, "text/plain", "not found");
  });
  server.begin();
  weblogf("[http] listening on :80\n");

  // TFT comes up only after WiFi + HTTP have settled. Doing it earlier
  // means the LVGL refresh timer fires (and reads WiFi state) while
  // the WiFi stack is still mid-init, which corrupts the IDLE0 stack.
  // Safe to call on the headless target — the header inlines a no-op.
  tftSetup();
  // PAIR021 firmware-version query is no longer fired blindly here —
  // gnssPump() schedules it half a second after the first byte arrives,
  // so plugging the module in later still gets a clean PAIR020 reply
  // without polluting the log when no module is attached.
}

// ── Loop ────────────────────────────────────────────────────────────
static uint32_t mainTickCount = 0;
static uint32_t mainLastBeatMs = 0;

void loop() {
  // gnssPump() drains the UART RX buffer first — bytes flowing at
  // 3-4 KB/s at 5 Hz overflow the (now 4 KB) FIFO if HTTP or NTRIP
  // hogs a beat. Two drains per loop (start + after the slow ops)
  // keep latency well under one GGA cycle (200 ms at 5 Hz).
  gnssPump();
  server.handleClient();
  ntripPump();
  gnssPump();
  buttonPump();
  batteryPump();
  tftTick();

  // Diagnostic heartbeat — paired with the LVGL task heartbeat printed
  // every 5 s from refresh_status_cb. If one disappears we know exactly
  // which task is stuck.
  mainTickCount++;
  uint32_t nowMs = millis();
  if (nowMs - mainLastBeatMs >= 5000) {
#ifdef HAS_TFT_DISPLAY
    // Pull the LVGL task's latest checkpoint into this print so when
    // the [lvgl-tick] stream stops we still know where it died. The
    // age (ms since last LVGL refresh callback fired) confirms whether
    // it's truly stuck or just slow.
    extern volatile uint8_t  g_lvgl_checkpoint;
    extern volatile uint32_t g_lvgl_last_tick_ms;
    uint32_t lvglAgeMs = nowMs - g_lvgl_last_tick_ms;
    Serial.printf("[main-tick] count=%u heap=%u min=%u uptime=%lus core=%d lvgl_cp=%u lvgl_age=%ums\n",
                  (unsigned) mainTickCount,
                  (unsigned) ESP.getFreeHeap(),
                  (unsigned) ESP.getMinFreeHeap(),
                  (unsigned long) (nowMs / 1000),
                  xPortGetCoreID(),
                  (unsigned) g_lvgl_checkpoint,
                  (unsigned) lvglAgeMs);
#else
    Serial.printf("[main-tick] count=%u heap=%u min=%u uptime=%lus core=%d\n",
                  (unsigned) mainTickCount,
                  (unsigned) ESP.getFreeHeap(),
                  (unsigned) ESP.getMinFreeHeap(),
                  (unsigned long) (nowMs / 1000),
                  xPortGetCoreID());
#endif
    mainLastBeatMs = nowMs;
  }

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
  out.ntripUp    = ntrip.connected();
  out.gnssAlive  = (lastGnssByteMs != 0);
  out.msSinceGnssByte = lastGnssByteMs ? (millis() - lastGnssByteMs) : (uint32_t) 0xFFFFFFFF;
  out.gnssRateHz   = gnssRateHz;
  out.gnss5HzAcked = pair050Acked && lastPair001Result == 0;
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
  if (out.wifiUp)        out.wifiIp = WiFi.localIP().toString();
  else if (out.apMode)   out.wifiIp = WiFi.softAPIP().toString();
  else                   out.wifiIp = "";
}

void walkerGetConfig(WalkerConfigView& out) {
  out.wifiSsid        = cfg.ssid;
  out.wifiPassMasked  = cfg.pass.length() ? "********" : "";
  out.ntripHost       = cfg.ntripHost;
  out.ntripPort       = cfg.ntripPort;
  out.ntripMount      = cfg.ntripMount;
  out.ntripUser       = cfg.ntripUser;
  out.ntripPassMasked = cfg.ntripPass.length() ? "********" : "";
  out.serverUrl       = cfg.serverUrl;
  out.mowerSn         = cfg.mowerSn;
  out.adminToken      = cfg.adminToken;
  out.otaAutoCheck    = cfg.otaAutoCheck;
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

  if (upd.wifiSsidSet)  { cfg.ssid       = upd.wifiSsid;  }
  if (upd.wifiPassSet)  { cfg.pass       = upd.wifiPass;  }
  if (upd.ntripHostSet) { cfg.ntripHost  = upd.ntripHost; }
  if (upd.ntripPortSet) { cfg.ntripPort  = upd.ntripPort; }
  if (upd.ntripMountSet){ cfg.ntripMount = upd.ntripMount;}
  if (upd.ntripUserSet) { cfg.ntripUser  = upd.ntripUser; }
  if (upd.ntripPassSet) { cfg.ntripPass  = upd.ntripPass; }
  if (upd.otaAutoCheckSet) { cfg.otaAutoCheck = upd.otaAutoCheck; }
  saveConfig();
  weblogf("[cfg] saved via TFT (effective pass length = %u); rebooting\n",
          (unsigned) cfg.pass.length());
  delay(500);
  ESP.restart();
}

bool walkerToggleRecording() {
  if (st.recording) stopRecording();
  else              startRecording();
  return st.recording;
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
