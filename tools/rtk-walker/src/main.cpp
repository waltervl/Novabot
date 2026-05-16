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

#include "index_html.h"

// ── Pins / hardware ─────────────────────────────────────────────────
#define GNSS_RX_PIN   18   // LC29HDA TX → ESP32 RX (UART1)
#define GNSS_TX_PIN   17   // LC29HDA RX ← ESP32 TX (UART1)
#define GNSS_BAUD     115200
#define BUTTON_PIN    0    // BOOT
#define BUTTON_DEBOUNCE_MS 60
#define NTRIP_RECONNECT_MS 5000

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
    Serial.printf("[rec] failed to open %s\n", currentTrackName.c_str());
    return;
  }
  trackFile.println("timestamp_unix,lat,lng,alt_m,fix,sats,hdop");
  trackFile.flush();
  st.recording = true;
  st.recPoints = 0;
  Serial.printf("[rec] started %s\n", currentTrackName.c_str());
}

static void stopRecording() {
  if (!st.recording) return;
  if (trackFile) {
    trackFile.flush();
    trackFile.close();
  }
  st.recording = false;
  Serial.printf("[rec] stopped (%u points)\n", st.recPoints);
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
  // Flush every 8 rows so an unexpected reset doesn't lose the entire
  // walk — but skip the flush most of the time to spare flash writes.
  if ((st.recPoints & 0x07) == 0) trackFile.flush();
}

// ── NTRIP ───────────────────────────────────────────────────────────
static void ntripConnect() {
  if (cfg.ntripMount.length() == 0) return;
  if (WiFi.status() != WL_CONNECTED) return;
  if (ntripConnecting) return;
  unsigned long nowMs = millis();
  if (nowMs - ntripLastConnectAttemptMs < NTRIP_RECONNECT_MS) return;
  ntripLastConnectAttemptMs = nowMs;

  ntripConnecting = true;
  Serial.printf("[ntrip] connecting %s:%u/%s\n",
                cfg.ntripHost.c_str(), cfg.ntripPort, cfg.ntripMount.c_str());

  if (!ntrip.connect(cfg.ntripHost.c_str(), cfg.ntripPort)) {
    Serial.println("[ntrip] tcp connect failed");
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
        Serial.print("[ntrip] handshake: ");
        Serial.println(header);
        if (header.indexOf("200") < 0) {
          ntrip.stop();
        }
        ntripConnecting = false;
        return;
      }
    }
    delay(10);
  }
  Serial.println("[ntrip] handshake timeout");
  ntrip.stop();
  ntripConnecting = false;
}

static void ntripPump() {
  if (!ntrip.connected()) {
    if (cfg.ntripMount.length() > 0 && WiFi.status() == WL_CONNECTED) ntripConnect();
    return;
  }
  while (ntrip.available()) {
    uint8_t chunk[256];
    int n = ntrip.read(chunk, sizeof(chunk));
    if (n <= 0) break;
    gnssSerial.write(chunk, n);
    st.ntripBytes += n;
  }
}

// ── GNSS pump ───────────────────────────────────────────────────────
static void gnssPump() {
  while (gnssSerial.available()) {
    char c = gnssSerial.read();
    gps.encode(c);
  }
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
  // /track/<name>
  String name = uri.substring(strlen("/track/"));
  String path = String("/tracks/") + name;
  if (!LittleFS.exists(path)) { server.send(404, "text/plain", "no such track"); return; }
  File f = LittleFS.open(path, FILE_READ);
  server.sendHeader("Content-Disposition", String("attachment; filename=\"") + name + "\"");
  server.streamFile(f, "text/csv");
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
  if (body["ssid"].is<const char*>())  cfg.ssid       = String((const char*) body["ssid"]);
  if (body["pass"].is<const char*>())  cfg.pass       = String((const char*) body["pass"]);
  if (body["host"].is<const char*>())  cfg.ntripHost  = String((const char*) body["host"]);
  if (body["port"].is<int>())          cfg.ntripPort  = (uint16_t) (int) body["port"];
  if (body["mount"].is<const char*>()) cfg.ntripMount = String((const char*) body["mount"]);
  if (body["user"].is<const char*>())  cfg.ntripUser  = String((const char*) body["user"]);
  if (body["npass"].is<const char*>()) cfg.ntripPass  = String((const char*) body["npass"]);
  saveConfig();
  server.send(200, "application/json", "{\"ok\":true}");
  delay(500);
  ESP.restart();
}

// ── Setup ───────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("[rtk-walker] boot");

  pinMode(BUTTON_PIN, INPUT_PULLUP);

  gnssSerial.begin(GNSS_BAUD, SERIAL_8N1, GNSS_RX_PIN, GNSS_TX_PIN);

  if (!LittleFS.begin(true)) {
    Serial.println("[fs] mount failed");
  }

  loadConfig();

  if (cfg.ssid.length() > 0) {
    Serial.printf("[wifi] connecting to %s\n", cfg.ssid.c_str());
    WiFi.mode(WIFI_STA);
    WiFi.begin(cfg.ssid.c_str(), cfg.pass.c_str());
    unsigned long deadline = millis() + 20000;
    while (millis() < deadline && WiFi.status() != WL_CONNECTED) {
      delay(200);
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("[wifi] connected, ip=%s\n", WiFi.localIP().toString().c_str());
      // Sync time so CSV timestamps are real wall-clock seconds.
      configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
    } else {
      Serial.println("[wifi] connect timeout — falling back to AP");
      WiFi.mode(WIFI_AP);
      WiFi.softAP("rtk-walker-setup", "rtkwalker");
    }
  } else {
    Serial.println("[wifi] no SSID configured — running AP only");
    WiFi.mode(WIFI_AP);
    WiFi.softAP("rtk-walker-setup", "rtkwalker");
    Serial.printf("[wifi] AP ip=%s\n", WiFi.softAPIP().toString().c_str());
  }

  server.on("/",           HTTP_GET,  handleRoot);
  server.on("/api/status", HTTP_GET,  handleStatus);
  server.on("/api/record", HTTP_POST, handleRecord);
  server.on("/api/tracks", HTTP_GET,  handleTracks);
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
  Serial.println("[http] listening on :80");
}

// ── Loop ────────────────────────────────────────────────────────────
void loop() {
  server.handleClient();
  ntripPump();
  gnssPump();
  buttonPump();
  delay(1);
}
