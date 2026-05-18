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
#include <LittleFS.h>
#include <Preferences.h>
#include <TinyGPS++.h>
#include <ArduinoJson.h>
#include <time.h>
#include <base64.h>

#include <vector>

#include "index_html.h"
#include "walker_api.h"
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

struct Config {
  String ssid;
  String pass;
  String ntripHost = "caster.centipede.fr";
  uint16_t ntripPort = 2101;
  String ntripMount;          // mountpoint, e.g. "CT3F00FRA0"
  String ntripUser = "centipede";
  String ntripPass = "centipede";
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
struct LivePoint { float lat, lng; uint8_t fix; };
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
}

static void saveConfig() {
  prefs.putString("ssid", cfg.ssid);
  prefs.putString("pass", cfg.pass);
  prefs.putString("nhost", cfg.ntripHost);
  prefs.putUShort("nport", cfg.ntripPort);
  prefs.putString("nmount", cfg.ntripMount);
  prefs.putString("nuser", cfg.ntripUser);
  prefs.putString("npass", cfg.ntripPass);
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
  weblogf("[rec] started %s\n", currentTrackName.c_str());
}

static void stopRecording() {
  if (!st.recording) return;
  if (trackFile) {
    trackFile.flush();
    trackFile.close();
  }
  st.recording = false;
  weblogf("[rec] stopped (%u points)\n", st.recPoints);
}

static void appendPoint() {
  if (!st.recording || !trackFile) return;
  // Only record actual GPS solutions. fix=0 means we have no usable
  // position; logging that would pollute the trail with zeros.
  if (st.fix == 0 || st.lat == 0 || st.lng == 0) return;

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
  livePoints.push_back({ (float) st.lat, (float) st.lng, (uint8_t) st.fix });
  livePointsUnlock();

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

static uint32_t gnssDetectedAtMs = 0; // millis() when first byte arrived (used to delay the post-detect PAIR query)
static bool     pairQuerySent = false; // PAIR021 firmware-version query already sent for this detect cycle

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

  // First-byte handshake: half a second after detection (lets the
  // module finish its boot banner), ask for the firmware version. PAIR020
  // reply lands in the proprietary-line surfacer and shows up in the web
  // log — same diagnostic shape as a freshly-plugged hot-swap.
  if (!pairQuerySent && (millis() - gnssDetectedAtMs >= 500)) {
    sendGnssCommand("PAIR021");
    pairQuerySent = true;
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
    appendPoint();
  }
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
  String name = uri.substring(strlen("/track/"));

  const char* polygonSuffix = ".polygon";
  const size_t polygonSuffixLen = strlen(polygonSuffix);
  bool polygonMode = name.endsWith(polygonSuffix);
  if (polygonMode) name = name.substring(0, name.length() - polygonSuffixLen);

  String path = String("/tracks/") + name;
  if (!LittleFS.exists(path)) { server.send(404, "text/plain", "no such track"); return; }
  File f = LittleFS.open(path, FILE_READ);

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

// ── Setup ───────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(200);
  weblogf("[rtk-walker] boot\n");

  pinMode(BUTTON_PIN, INPUT_PULLUP);

  gnssSerial.begin(GNSS_BAUD, SERIAL_8N1, GNSS_RX_PIN, GNSS_TX_PIN);

  if (!LittleFS.begin(true)) {
    weblogf("[fs] mount failed\n");
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
  server.on("/api/config", HTTP_GET,  handleConfigGet);
  server.on("/api/config", HTTP_POST, handleConfigPost);
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
  server.handleClient();
  ntripPump();
  gnssPump();
  buttonPump();
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
  out.wifiConnectFailed = wifiConnectFailed;
  out.wifiFailReason    = wifiFailReason;
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
