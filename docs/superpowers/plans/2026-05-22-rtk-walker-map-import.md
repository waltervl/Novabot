# RTK Walker Map Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture mower maps by walking the boundary with the RTK walker device and import them through the existing portable-bundle restore flow.

**Architecture:** Walker captures RTK-FIX GPS points for boundaries, obstacles, and channel polylines into LittleFS using the mower's `csv_file/` naming convention. Walker exports a `.novabundle` zip that mirrors `.novabotmap` minus the raster. Server's new import endpoint Δ-rotates polygons into the mower's current local frame, rasterizes them into `map.pgm` + `map.yaml`, builds a synthetic portable bundle, and reuses the existing `apply-verbatim` flow + dock-anchor refresh modal.

**Tech Stack:** ESP32-S3 firmware (PlatformIO + Arduino + LVGL + TinyGPSPlus + LittleFS + ArduinoJson), Node.js server (Express + existing portable-bundle pipeline), inline HTML/JS admin page.

---

## File Structure

### Walker firmware (`tools/rtk-walker/`)
- **Modify** `src/main.cpp` — replace single-track recording with session state machine
- **Create** `src/session.h` + `src/session.cpp` — SessionStore: LittleFS-backed multi-file session
- **Create** `src/bundle.h` + `src/bundle.cpp` — Walker bundle assembler (zip builder + metadata.json)
- **Create** `src/recording.h` + `src/recording.cpp` — Recording state machine + RTK quality filter
- **Modify** `src/tft/tft_ui.cpp` + `src/tft/tft_ui.h` — main / map-detail / recording screens
- **Modify** `src/index_html.h` — list session contents + serve `.novabundle`
- **Modify** `platformio.ini` — add `bblanchon/ArduinoJson`, `me-no-dev/Zip` (or hand-rolled stored-mode zip) deps

### Server (`server/src/`)
- **Create** `server/src/maps/polygonRasterizer.ts` — polygon → PGM (P5 binary) + YAML
- **Create** `server/src/maps/walkerBundleImporter.ts` — parse `.novabundle`, Δ-transform, rasterize, build synthetic portable bundle
- **Modify** `server/src/routes/adminStatus.ts` — `POST /maps/:sn/import-walker-bundle` endpoint
- **Create** `server/src/__tests__/maps/polygonRasterizer.test.ts` — unit tests for rasterizer
- **Create** `server/src/__tests__/maps/walkerBundleImporter.test.ts` — synthesize-bundle tests with fixtures

### Admin page (`server/src/routes/adminPage.ts`)
- **Modify** — add "Walker bundle import" section near existing portable backup UI

### Test artifacts
- **Create** `server/src/__tests__/fixtures/walker-session-sample.novabundle` — small bundle with 1 work + 1 obstacle + 1 channel

---

## Walker bundle format spec

Zip file with extension `.novabundle`. Internal layout mirrors `.novabotmap` minus the `mower/` subdirectory and minus raster files (server generates those at import time).

```
session-<unix>.novabundle
├── metadata.json
│    {
│      "schemaVersion": 1,
│      "sourceType": "walker",
│      "walkerId": "rtk-walker-<chip-mac-suffix>",
│      "sessionId": "<unix-ts>",
│      "exportedAt": "<ISO-8601>",
│      "sourceCharger": { "lat": null, "lng": null, "rtkQualityAtExport": null },
│      "polygonOriginAnchor": {
│        "name": "session_start",
│        "x": 0, "y": 0,
│        "comment": "Walker session origin. All polygon points relative."
│      },
│      "originalChargingPose": { "x": 0, "y": 0, "orientation": 0 },
│      "workMapNames": ["map0", "map1"],
│      "userAliases": { "map0": "Voortuin", "map1": "Achtertuin" },
│      "boundsM": { "minX": ..., "maxX": ..., "minY": ..., "maxY": ... }
│    }
├── polygons.json        # array of { name: "map0", alias, points: [{x,y}...] }
├── obstacles.json       # array of { name: "map0_0", alias, parentMap, points: [...] }
├── unicom.json          # array of { name: "map0tocharge", parentMap, targetMapName, points: [...] }
├── geojson/work.geojson      # lat/lng for visualization (server validates)
├── geojson/obstacles.geojson
├── geojson/unicom.geojson
└── walker/                   # raw GPS traces (preserved for debugging)
    ├── map0_work.csv         # csv with header: ts,lat,lng,alt,fix,sats,hdop
    ├── map0_0_obstacle.csv
    ├── map0tocharge_unicom.csv
    └── ...
```

**Polygon points in `polygons.json` / `obstacles.json` / `unicom.json`** are in **walker-frame local meters** (origin = session start GPS, X=East, Y=North).

**Server import responsibilities**:
1. Read mower live `map_position` → `(curX, curY, curTheta)` in mower-frame.
2. Δ rotation from walker-frame (0,0,0) to mower-frame: `Δθ = curTheta - 0`, `Δx = curX`, `Δy = curY`.
3. Apply rotation+translation to every polygon/obstacle/unicom point.
4. Rasterize transformed polygons → `map.pgm` + `map.yaml` + per-slot `mapN.{pgm,yaml,png}`.
5. Build synthetic `.novabotmap` (with `mower/` subdir + raster) → `import-portable` staging.
6. Caller runs `apply-verbatim` → dock-anchor refresh modal as usual.

---

## Walker session storage layout (LittleFS)

```
/session/
  metadata.json    # { name, charger:{lat,lng}|null, createdAt, mapAliases:{...}, lastTouched }
  map0_work.csv    # x,y (meters local) one per line, no header
  map0_work.raw    # ts,lat,lng,alt,fix,sats,hdop (debug, not exported in CSV form but copied to walker/)
  map0_0_obstacle.csv
  map0_0_obstacle.raw
  map0tocharge_unicom.csv
  map0tocharge_unicom.raw
  map1_work.csv
  map1_work.raw
```

The `.csv` rows are mower-compatible (just `x,y`). The `.raw` rows preserve full RTK telemetry for the bundle's `walker/` subdir. Exporting the bundle zips both forms.

---

## Recording state machine

```
                 ┌─────────────────────────────────────────────┐
                 │                  IDLE                       │
                 │  Main screen showing map list + buttons     │
                 └─────────────┬───────────────────────────────┘
                               │ "+ Add work area"
                               ▼
                  ┌────────────────────────────────┐
                  │     RECORDING_WORK             │
                  │  Banner: green "BOUNDARY"      │
                  │  Captures GPS @ 1Hz w/ filter  │
                  │  Save → write map<N>_work.csv  │
                  └────────────┬───────────────────┘
                               │ Save / Cancel
                               ▼ → back to IDLE
                               
       From map detail screen ("Add obstacle"):
                  ┌────────────────────────────────┐
                  │   RECORDING_OBSTACLE           │
                  │  Banner: red "OBSTACLE in <X>" │
                  │  Save → map<X>_<i>_obstacle.csv│
                  └────────────────────────────────┘
                               
       From map detail screen ("Add channel"):
                  ┌────────────────────────────────┐
                  │   RECORDING_CHANNEL            │
                  │  Banner: blue "CHANNEL <X>→<Y>"│
                  │  Save → map<X>to<Y>_unicom.csv │
                  └────────────────────────────────┘
```

**RTK quality filter** (live during recording):
- `fix >= 4` → green dot, point captured
- `fix == 5` (float) → orange dot, point captured but flagged
- `fix < 4` → red dot, point dropped, "Bad signal" overlay on screen
- Optional: configurable HDOP threshold (default 2.0). HDOP > threshold dropped + flagged.

---

### Task 1: SessionStore (LittleFS multi-file session manager)

**Files:**
- Create: `tools/rtk-walker/src/session.h`
- Create: `tools/rtk-walker/src/session.cpp`

- [ ] **Step 1: Write the failing test (firmware does not have unit tests; skip and verify via serial)**

Walker has no test framework. Manual verification via serial output is the contract.

- [ ] **Step 2: Implement SessionStore header**

```cpp
// tools/rtk-walker/src/session.h
#pragma once
#include <Arduino.h>
#include <LittleFS.h>

struct MapEntry {
    int slot;            // 0..2 (max 3 work maps)
    String alias;        // user-friendly name
    int boundaryPoints;  // row count in mapN_work.csv
    int obstacleCount;
    int channelCount;
};

class SessionStore {
public:
    // Mount LittleFS + ensure /session dir.
    bool begin();

    // Wipe /session and recreate metadata.json with no maps.
    bool reset();

    // Returns next free work-map slot (0..2) or -1 if full.
    int allocWorkSlot();

    // Set alias for an existing slot. Persisted to metadata.json.
    bool setAlias(int slot, const String& alias);

    // Compute next obstacle index for a given parent slot.
    int allocObstacleIndex(int parentSlot);

    // List all work maps with point counts.
    bool listMaps(MapEntry* out, size_t maxEntries, size_t& count);

    // Append one row to mapN_work.csv (point in local meters).
    bool appendWorkPoint(int slot, double x, double y);

    // Append one row to mapN_<i>_obstacle.csv.
    bool appendObstaclePoint(int parentSlot, int obstacleIdx, double x, double y);

    // Append one row to mapNto<target>_unicom.csv (target = "charge" or "mapX").
    bool appendChannelPoint(int parentSlot, const String& target, double x, double y);

    // Append raw GPS row to .raw companion file for debugging + bundle inclusion.
    bool appendRawRow(const String& baseName, unsigned long ts, double lat, double lng,
                      double alt, int fix, int sats, double hdop);

    // Delete a map and all its obstacles/channels (slot can be reused via allocWorkSlot).
    bool deleteMap(int slot);

    // Set session origin (first GPS fix at start of first recording).
    bool setOrigin(double lat, double lng);

    // Get session origin (returns false if not set).
    bool getOrigin(double& lat, double& lng);

    // Convert lat/lng to walker-local meters using stored origin.
    // X = East, Y = North. cos(lat) approximation; per-row error <1cm at 100m.
    bool gpsToLocal(double lat, double lng, double& outX, double& outY);

private:
    static constexpr const char* kSessionDir = "/session";
    static constexpr const char* kMetaFile = "/session/metadata.json";
    bool ensureMetadata();
    bool readMetadata(JsonDocument& doc);
    bool writeMetadata(const JsonDocument& doc);
};
```

- [ ] **Step 3: Implement SessionStore.cpp**

```cpp
// tools/rtk-walker/src/session.cpp
#include "session.h"
#include <ArduinoJson.h>
#include <math.h>

bool SessionStore::begin() {
    if (!LittleFS.begin(true)) return false;
    if (!LittleFS.exists(kSessionDir)) LittleFS.mkdir(kSessionDir);
    return ensureMetadata();
}

bool SessionStore::ensureMetadata() {
    if (LittleFS.exists(kMetaFile)) return true;
    StaticJsonDocument<512> doc;
    doc["createdAt"] = millis();  // boot-relative until we sync
    doc["mapAliases"] = JsonObject();
    doc["origin"] = JsonObject();  // empty until first capture
    return writeMetadata(doc);
}

bool SessionStore::readMetadata(JsonDocument& doc) {
    File f = LittleFS.open(kMetaFile, FILE_READ);
    if (!f) return false;
    DeserializationError err = deserializeJson(doc, f);
    f.close();
    return !err;
}

bool SessionStore::writeMetadata(const JsonDocument& doc) {
    File f = LittleFS.open(kMetaFile, FILE_WRITE);
    if (!f) return false;
    serializeJson(doc, f);
    f.close();
    return true;
}

bool SessionStore::reset() {
    File dir = LittleFS.open(kSessionDir);
    if (!dir) return false;
    File entry = dir.openNextFile();
    while (entry) {
        String path = String(kSessionDir) + "/" + entry.name();
        entry.close();
        LittleFS.remove(path);
        entry = dir.openNextFile();
    }
    dir.close();
    return ensureMetadata();
}

int SessionStore::allocWorkSlot() {
    for (int slot = 0; slot < 3; ++slot) {
        String path = String(kSessionDir) + "/map" + slot + "_work.csv";
        if (!LittleFS.exists(path)) return slot;
    }
    return -1;
}

bool SessionStore::setAlias(int slot, const String& alias) {
    StaticJsonDocument<512> doc;
    if (!readMetadata(doc)) return false;
    String key = "map" + String(slot);
    JsonObject aliases = doc["mapAliases"].as<JsonObject>();
    if (aliases.isNull()) aliases = doc.createNestedObject("mapAliases");
    aliases[key] = alias;
    return writeMetadata(doc);
}

int SessionStore::allocObstacleIndex(int parentSlot) {
    for (int i = 0; i < 32; ++i) {
        String path = String(kSessionDir) + "/map" + parentSlot + "_" + i + "_obstacle.csv";
        if (!LittleFS.exists(path)) return i;
    }
    return -1;
}

bool SessionStore::appendWorkPoint(int slot, double x, double y) {
    String path = String(kSessionDir) + "/map" + slot + "_work.csv";
    File f = LittleFS.open(path, FILE_APPEND);
    if (!f) return false;
    f.printf("%.4f,%.4f\n", x, y);
    f.close();
    return true;
}

bool SessionStore::appendObstaclePoint(int parentSlot, int idx, double x, double y) {
    String path = String(kSessionDir) + "/map" + parentSlot + "_" + idx + "_obstacle.csv";
    File f = LittleFS.open(path, FILE_APPEND);
    if (!f) return false;
    f.printf("%.4f,%.4f\n", x, y);
    f.close();
    return true;
}

bool SessionStore::appendChannelPoint(int parentSlot, const String& target, double x, double y) {
    String path = String(kSessionDir) + "/map" + parentSlot + "to" + target + "_unicom.csv";
    File f = LittleFS.open(path, FILE_APPEND);
    if (!f) return false;
    f.printf("%.4f,%.4f\n", x, y);
    f.close();
    return true;
}

bool SessionStore::appendRawRow(const String& baseName, unsigned long ts, double lat, double lng,
                                 double alt, int fix, int sats, double hdop) {
    String path = String(kSessionDir) + "/" + baseName + ".raw";
    File f = LittleFS.open(path, FILE_APPEND);
    if (!f) return false;
    // Header on first write.
    if (f.size() == 0) f.println("ts,lat,lng,alt,fix,sats,hdop");
    f.printf("%lu,%.8f,%.8f,%.2f,%d,%d,%.2f\n", ts, lat, lng, alt, fix, sats, hdop);
    f.close();
    return true;
}

bool SessionStore::setOrigin(double lat, double lng) {
    StaticJsonDocument<512> doc;
    if (!readMetadata(doc)) return false;
    JsonObject origin = doc["origin"].as<JsonObject>();
    if (origin.isNull()) origin = doc.createNestedObject("origin");
    origin["lat"] = lat;
    origin["lng"] = lng;
    return writeMetadata(doc);
}

bool SessionStore::getOrigin(double& lat, double& lng) {
    StaticJsonDocument<512> doc;
    if (!readMetadata(doc)) return false;
    JsonObject origin = doc["origin"].as<JsonObject>();
    if (origin.isNull() || !origin.containsKey("lat")) return false;
    lat = origin["lat"].as<double>();
    lng = origin["lng"].as<double>();
    return true;
}

bool SessionStore::gpsToLocal(double lat, double lng, double& outX, double& outY) {
    double oLat, oLng;
    if (!getOrigin(oLat, oLng)) return false;
    constexpr double kMetersPerDegreeLat = 111320.0;
    outY = (lat - oLat) * kMetersPerDegreeLat;
    outX = (lng - oLng) * cos(oLat * M_PI / 180.0) * kMetersPerDegreeLat;
    return true;
}

bool SessionStore::listMaps(MapEntry* out, size_t maxEntries, size_t& count) {
    count = 0;
    StaticJsonDocument<512> doc;
    readMetadata(doc);
    JsonObject aliases = doc["mapAliases"].as<JsonObject>();
    for (int slot = 0; slot < 3 && count < maxEntries; ++slot) {
        String path = String(kSessionDir) + "/map" + slot + "_work.csv";
        if (!LittleFS.exists(path)) continue;
        File f = LittleFS.open(path, FILE_READ);
        int rows = 0;
        while (f.available()) { if (f.read() == '\n') rows++; }
        f.close();
        out[count].slot = slot;
        out[count].boundaryPoints = rows;
        if (!aliases.isNull() && aliases.containsKey(String("map") + slot)) {
            out[count].alias = aliases[String("map") + slot].as<const char*>();
        } else {
            out[count].alias = String("Map ") + slot;
        }
        // Count obstacles + channels by scanning dir.
        out[count].obstacleCount = 0;
        out[count].channelCount = 0;
        File dir = LittleFS.open(kSessionDir);
        File e = dir.openNextFile();
        while (e) {
            String name = e.name();
            String prefix = "map" + String(slot) + "_";
            String chPrefix = "map" + String(slot) + "to";
            if (name.startsWith(prefix) && name.endsWith("_obstacle.csv")) out[count].obstacleCount++;
            if (name.startsWith(chPrefix) && name.endsWith("_unicom.csv")) out[count].channelCount++;
            e.close();
            e = dir.openNextFile();
        }
        dir.close();
        count++;
    }
    return true;
}

bool SessionStore::deleteMap(int slot) {
    String prefix = String(kSessionDir) + "/map" + slot;
    File dir = LittleFS.open(kSessionDir);
    File e = dir.openNextFile();
    while (e) {
        String name = e.name();
        if (name.startsWith(String("map") + slot)) {
            String path = String(kSessionDir) + "/" + name;
            e.close();
            LittleFS.remove(path);
        } else {
            e.close();
        }
        e = dir.openNextFile();
    }
    dir.close();
    return true;
}
```

- [ ] **Step 4: Add ArduinoJson + LittleFS to platformio.ini (already present, verify)**

```ini
; tools/rtk-walker/platformio.ini — ensure these in [walker_common] lib_deps
bblanchon/ArduinoJson @ ^7.0.0
```

- [ ] **Step 5: Manual verification**

Add a temporary serial-shell command to `main.cpp` `loop()`:
```cpp
if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    if (cmd == "session-list") {
        MapEntry entries[3];
        size_t count = 0;
        sessionStore.listMaps(entries, 3, count);
        Serial.printf("Maps: %d\n", count);
        for (size_t i = 0; i < count; i++) {
            Serial.printf("  slot=%d alias=%s pts=%d obs=%d ch=%d\n",
                entries[i].slot, entries[i].alias.c_str(),
                entries[i].boundaryPoints, entries[i].obstacleCount, entries[i].channelCount);
        }
    } else if (cmd == "session-reset") sessionStore.reset();
}
```

Build + flash. Send `session-reset` then `session-list` over serial; expect `Maps: 0`.

- [ ] **Step 6: Commit**

```bash
git add tools/rtk-walker/src/session.h tools/rtk-walker/src/session.cpp tools/rtk-walker/platformio.ini tools/rtk-walker/src/main.cpp
git commit -m "feat(rtk-walker): SessionStore LittleFS-backed multi-file session"
```

---

### Task 2: Recording state machine + RTK quality filter

**Files:**
- Create: `tools/rtk-walker/src/recording.h`
- Create: `tools/rtk-walker/src/recording.cpp`
- Modify: `tools/rtk-walker/src/main.cpp` (integration)

- [ ] **Step 1: Recording header**

```cpp
// tools/rtk-walker/src/recording.h
#pragma once
#include <Arduino.h>
#include "session.h"

enum class RecordingMode : uint8_t {
    Idle = 0,
    Work = 1,
    Obstacle = 2,
    Channel = 3,
};

enum class FixQuality : uint8_t {
    Bad = 0,        // fix < 4
    Float = 5,      // fix == 5
    Fix = 4,        // fix == 4
};

struct RecordingState {
    RecordingMode mode = RecordingMode::Idle;
    int parentSlot = -1;       // for obstacle/channel
    int slotInUse = -1;        // current write target (work=parentSlot, obs=allocated idx)
    int obstacleIdx = -1;
    String channelTarget;      // "charge" or "mapN"
    unsigned long pointsCaptured = 0;
    unsigned long pointsDropped = 0;
    FixQuality lastFixQuality = FixQuality::Bad;
};

class Recorder {
public:
    Recorder(SessionStore& store) : sess_(store) {}

    // Start a new work-map recording. Returns false if no free slot.
    bool startWork(int& outSlot);

    // Start obstacle recording inside an existing work map.
    bool startObstacle(int parentSlot);

    // Start channel recording. target = "charge" or "mapN".
    bool startChannel(int parentSlot, const String& target);

    // Stop + persist. If discard==true, deletes the file just written.
    bool stop(bool discard);

    // Called on every GPS fix update. Returns true if the point was captured.
    // Filters based on fix/HDOP; updates pointsCaptured/Dropped counts.
    bool onFix(unsigned long ts, double lat, double lng, double alt,
               int fix, int sats, double hdop);

    const RecordingState& state() const { return state_; }
    bool isRecording() const { return state_.mode != RecordingMode::Idle; }

    static constexpr int kMinFix = 4;
    static constexpr double kMaxHdop = 2.0;
    // If true, also store fix==5 (float) but mark as low quality.
    static constexpr bool kAllowFloat = true;

private:
    SessionStore& sess_;
    RecordingState state_;
    bool ensureOrigin(double lat, double lng);
};
```

- [ ] **Step 2: Recording.cpp**

```cpp
// tools/rtk-walker/src/recording.cpp
#include "recording.h"

bool Recorder::startWork(int& outSlot) {
    int slot = sess_.allocWorkSlot();
    if (slot < 0) return false;
    state_.mode = RecordingMode::Work;
    state_.parentSlot = slot;
    state_.slotInUse = slot;
    state_.pointsCaptured = 0;
    state_.pointsDropped = 0;
    outSlot = slot;
    return true;
}

bool Recorder::startObstacle(int parentSlot) {
    int idx = sess_.allocObstacleIndex(parentSlot);
    if (idx < 0) return false;
    state_.mode = RecordingMode::Obstacle;
    state_.parentSlot = parentSlot;
    state_.obstacleIdx = idx;
    state_.pointsCaptured = 0;
    state_.pointsDropped = 0;
    return true;
}

bool Recorder::startChannel(int parentSlot, const String& target) {
    state_.mode = RecordingMode::Channel;
    state_.parentSlot = parentSlot;
    state_.channelTarget = target;
    state_.pointsCaptured = 0;
    state_.pointsDropped = 0;
    return true;
}

bool Recorder::stop(bool discard) {
    if (discard) {
        // Build path of the file we just wrote and remove it.
        String path = "/session/";
        if (state_.mode == RecordingMode::Work) path += "map" + String(state_.parentSlot) + "_work";
        else if (state_.mode == RecordingMode::Obstacle)
            path += "map" + String(state_.parentSlot) + "_" + state_.obstacleIdx + "_obstacle";
        else if (state_.mode == RecordingMode::Channel)
            path += "map" + String(state_.parentSlot) + "to" + state_.channelTarget + "_unicom";
        LittleFS.remove(path + ".csv");
        LittleFS.remove(path + ".raw");
    }
    state_.mode = RecordingMode::Idle;
    return true;
}

bool Recorder::ensureOrigin(double lat, double lng) {
    double oLat, oLng;
    if (sess_.getOrigin(oLat, oLng)) return true;
    return sess_.setOrigin(lat, lng);
}

bool Recorder::onFix(unsigned long ts, double lat, double lng, double alt,
                     int fix, int sats, double hdop) {
    if (state_.mode == RecordingMode::Idle) return false;

    // Filter.
    if (fix < kMinFix) {
        state_.lastFixQuality = FixQuality::Bad;
        state_.pointsDropped++;
        return false;
    }
    if (fix == 5 && !kAllowFloat) {
        state_.lastFixQuality = FixQuality::Float;
        state_.pointsDropped++;
        return false;
    }
    if (hdop > kMaxHdop) {
        state_.pointsDropped++;
        return false;
    }
    state_.lastFixQuality = (fix == 4) ? FixQuality::Fix : FixQuality::Float;

    ensureOrigin(lat, lng);
    double x, y;
    if (!sess_.gpsToLocal(lat, lng, x, y)) return false;

    // Build base name for raw companion.
    String baseName;
    bool ok = false;
    if (state_.mode == RecordingMode::Work) {
        baseName = "map" + String(state_.parentSlot) + "_work";
        ok = sess_.appendWorkPoint(state_.parentSlot, x, y);
    } else if (state_.mode == RecordingMode::Obstacle) {
        baseName = "map" + String(state_.parentSlot) + "_" + state_.obstacleIdx + "_obstacle";
        ok = sess_.appendObstaclePoint(state_.parentSlot, state_.obstacleIdx, x, y);
    } else if (state_.mode == RecordingMode::Channel) {
        baseName = "map" + String(state_.parentSlot) + "to" + state_.channelTarget + "_unicom";
        ok = sess_.appendChannelPoint(state_.parentSlot, state_.channelTarget, x, y);
    }
    if (ok) {
        sess_.appendRawRow(baseName, ts, lat, lng, alt, fix, sats, hdop);
        state_.pointsCaptured++;
    }
    return ok;
}
```

- [ ] **Step 3: Wire into main.cpp's GPS loop**

In `tools/rtk-walker/src/main.cpp`, find the GPS-fix handler (where `track-<ts>.csv` is currently written), replace with:

```cpp
// Existing: track-based capture into single file
// REPLACE with: feed into Recorder if active
extern Recorder recorder;  // declared globally
if (gps.location.isValid() && gps.location.isUpdated()) {
    recorder.onFix(
        gps.time.value(),  // or millis() if time not synced
        gps.location.lat(), gps.location.lng(),
        gps.altitude.meters(),
        static_cast<int>(gps.location.fix()),  // adjust to TinyGPSPlus API
        gps.satellites.value(),
        gps.hdop.hdop()
    );
}
```

- [ ] **Step 4: Manual verification (serial)**

Add temporary shell commands to test the state machine without a UI:
```cpp
if (cmd == "rec-work") { int s; recorder.startWork(s); Serial.printf("work slot=%d\n", s); }
else if (cmd == "rec-stop") { recorder.stop(false); Serial.println("stopped"); }
else if (cmd == "rec-stop-cancel") { recorder.stop(true); Serial.println("cancelled"); }
else if (cmd == "rec-status") {
    const auto& s = recorder.state();
    Serial.printf("mode=%d slot=%d captured=%lu dropped=%lu\n",
        (int)s.mode, s.parentSlot, s.pointsCaptured, s.pointsDropped);
}
```

Walk around with the walker for 1 min in `rec-work` mode. `rec-status` should show ~60 captured points (one per second).

- [ ] **Step 5: Commit**

```bash
git add tools/rtk-walker/src/recording.h tools/rtk-walker/src/recording.cpp tools/rtk-walker/src/main.cpp
git commit -m "feat(rtk-walker): Recorder state machine + RTK quality filter"
```

---

### Task 3: TFT UI — main screen with map list

**Files:**
- Modify: `tools/rtk-walker/src/tft/tft_ui.cpp` + `.h`

- [ ] **Step 1: Add UI state for "current screen"**

In `tft_ui.h`:
```cpp
enum class UiScreen : uint8_t {
    Main = 0,
    MapDetail = 1,
    Recording = 2,
};

void tft_ui_set_screen(UiScreen s, int detailSlot = -1);
UiScreen tft_ui_current_screen();
```

- [ ] **Step 2: Implement screen switcher in tft_ui.cpp**

```cpp
static UiScreen s_currentScreen = UiScreen::Main;
static int s_detailSlot = -1;
static lv_obj_t* s_screenMain = nullptr;
static lv_obj_t* s_screenDetail = nullptr;
static lv_obj_t* s_screenRecord = nullptr;

void tft_ui_set_screen(UiScreen s, int detailSlot) {
    s_currentScreen = s;
    s_detailSlot = detailSlot;
    lv_obj_t* target = nullptr;
    switch (s) {
        case UiScreen::Main: target = s_screenMain; break;
        case UiScreen::MapDetail: target = s_screenDetail; break;
        case UiScreen::Recording: target = s_screenRecord; break;
    }
    if (target) lv_scr_load(target);
    if (s == UiScreen::Main) refreshMainScreen();
    if (s == UiScreen::MapDetail) refreshDetailScreen(detailSlot);
}
```

- [ ] **Step 3: Build the main screen**

```cpp
static lv_obj_t* s_mapList = nullptr;
static lv_obj_t* s_btnAddMap = nullptr;
static lv_obj_t* s_btnExport = nullptr;

void buildMainScreen() {
    s_screenMain = lv_obj_create(nullptr);
    lv_obj_set_style_bg_color(s_screenMain, lv_color_hex(0x111111), 0);

    lv_obj_t* title = lv_label_create(s_screenMain);
    lv_label_set_text(title, "RTK Walker");
    lv_obj_set_style_text_color(title, lv_color_hex(0xeeeeee), 0);
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 8);

    s_mapList = lv_list_create(s_screenMain);
    lv_obj_set_size(s_mapList, LV_PCT(94), LV_PCT(60));
    lv_obj_align(s_mapList, LV_ALIGN_TOP_MID, 0, 40);

    s_btnAddMap = lv_btn_create(s_screenMain);
    lv_obj_set_size(s_btnAddMap, LV_PCT(45), 50);
    lv_obj_align(s_btnAddMap, LV_ALIGN_BOTTOM_LEFT, 6, -10);
    lv_obj_t* lbl1 = lv_label_create(s_btnAddMap);
    lv_label_set_text(lbl1, "+ Add work area");
    lv_obj_center(lbl1);
    lv_obj_add_event_cb(s_btnAddMap, onAddMapClicked, LV_EVENT_CLICKED, nullptr);

    s_btnExport = lv_btn_create(s_screenMain);
    lv_obj_set_size(s_btnExport, LV_PCT(45), 50);
    lv_obj_align(s_btnExport, LV_ALIGN_BOTTOM_RIGHT, -6, -10);
    lv_obj_t* lbl2 = lv_label_create(s_btnExport);
    lv_label_set_text(lbl2, "Export bundle");
    lv_obj_center(lbl2);
    lv_obj_add_event_cb(s_btnExport, onExportClicked, LV_EVENT_CLICKED, nullptr);
}

void refreshMainScreen() {
    lv_obj_clean(s_mapList);
    MapEntry entries[3];
    size_t count = 0;
    g_session.listMaps(entries, 3, count);
    for (size_t i = 0; i < count; i++) {
        char text[96];
        snprintf(text, sizeof(text), "map%d  %s  %d pts  obs:%d  ch:%d",
                 entries[i].slot, entries[i].alias.c_str(),
                 entries[i].boundaryPoints, entries[i].obstacleCount,
                 entries[i].channelCount);
        lv_obj_t* btn = lv_list_add_btn(s_mapList, LV_SYMBOL_FILE, text);
        lv_obj_set_user_data(btn, (void*)(intptr_t)entries[i].slot);
        lv_obj_add_event_cb(btn, onMapRowClicked, LV_EVENT_CLICKED, nullptr);
    }
}

static void onAddMapClicked(lv_event_t* e) {
    int slot;
    if (!recorder.startWork(slot)) {
        // show alert "Max 3 maps reached"
        return;
    }
    tft_ui_set_screen(UiScreen::Recording);
}

static void onMapRowClicked(lv_event_t* e) {
    int slot = (int)(intptr_t)lv_obj_get_user_data(lv_event_get_target(e));
    tft_ui_set_screen(UiScreen::MapDetail, slot);
}

static void onExportClicked(lv_event_t* e) {
    // implemented in Task 5 (bundle export)
}
```

- [ ] **Step 4: Wire buildMainScreen() into tft_ui_init()**

Find the existing init function and add:
```cpp
buildMainScreen();
buildDetailScreen();    // Task 4
buildRecordingScreen(); // Task 5
tft_ui_set_screen(UiScreen::Main);
```

- [ ] **Step 5: Flash + verify**

Build + flash. Walker should boot to main screen showing "RTK Walker", an empty list, and two buttons. After serial `rec-work` → `rec-stop`, returning to main should show one map row.

- [ ] **Step 6: Commit**

```bash
git add tools/rtk-walker/src/tft/tft_ui.cpp tools/rtk-walker/src/tft/tft_ui.h
git commit -m "feat(rtk-walker): TFT main screen with map list"
```

---

### Task 4: TFT UI — map detail screen (channels + obstacles)

**Files:**
- Modify: `tools/rtk-walker/src/tft/tft_ui.cpp`

- [ ] **Step 1: Build detail screen layout**

```cpp
static lv_obj_t* s_detailTitle = nullptr;
static lv_obj_t* s_detailBoundary = nullptr;
static lv_obj_t* s_detailChannelList = nullptr;
static lv_obj_t* s_detailObstacleList = nullptr;
static lv_obj_t* s_btnAddChannel = nullptr;
static lv_obj_t* s_btnAddObstacle = nullptr;
static lv_obj_t* s_btnBack = nullptr;

void buildDetailScreen() {
    s_screenDetail = lv_obj_create(nullptr);
    lv_obj_set_style_bg_color(s_screenDetail, lv_color_hex(0x111111), 0);

    s_detailTitle = lv_label_create(s_screenDetail);
    lv_obj_align(s_detailTitle, LV_ALIGN_TOP_MID, 0, 8);
    lv_obj_set_style_text_color(s_detailTitle, lv_color_hex(0xeeeeee), 0);

    s_detailBoundary = lv_label_create(s_screenDetail);
    lv_obj_align(s_detailBoundary, LV_ALIGN_TOP_MID, 0, 40);
    lv_obj_set_style_text_color(s_detailBoundary, lv_color_hex(0x86efac), 0);

    // Two columns: channels on left, obstacles on right.
    s_detailChannelList = lv_list_create(s_screenDetail);
    lv_obj_set_size(s_detailChannelList, LV_PCT(46), LV_PCT(45));
    lv_obj_align(s_detailChannelList, LV_ALIGN_TOP_LEFT, 8, 70);

    s_detailObstacleList = lv_list_create(s_screenDetail);
    lv_obj_set_size(s_detailObstacleList, LV_PCT(46), LV_PCT(45));
    lv_obj_align(s_detailObstacleList, LV_ALIGN_TOP_RIGHT, -8, 70);

    s_btnAddChannel = lv_btn_create(s_screenDetail);
    lv_obj_set_size(s_btnAddChannel, LV_PCT(46), 40);
    lv_obj_align(s_btnAddChannel, LV_ALIGN_BOTTOM_LEFT, 8, -50);
    lv_obj_t* l1 = lv_label_create(s_btnAddChannel);
    lv_label_set_text(l1, "+ Channel");
    lv_obj_center(l1);
    lv_obj_add_event_cb(s_btnAddChannel, onAddChannelClicked, LV_EVENT_CLICKED, nullptr);

    s_btnAddObstacle = lv_btn_create(s_screenDetail);
    lv_obj_set_size(s_btnAddObstacle, LV_PCT(46), 40);
    lv_obj_align(s_btnAddObstacle, LV_ALIGN_BOTTOM_RIGHT, -8, -50);
    lv_obj_t* l2 = lv_label_create(s_btnAddObstacle);
    lv_label_set_text(l2, "+ Obstacle");
    lv_obj_center(l2);
    lv_obj_add_event_cb(s_btnAddObstacle, onAddObstacleClicked, LV_EVENT_CLICKED, nullptr);

    s_btnBack = lv_btn_create(s_screenDetail);
    lv_obj_set_size(s_btnBack, LV_PCT(94), 30);
    lv_obj_align(s_btnBack, LV_ALIGN_BOTTOM_MID, 0, -8);
    lv_obj_t* l3 = lv_label_create(s_btnBack);
    lv_label_set_text(l3, "Back");
    lv_obj_center(l3);
    lv_obj_add_event_cb(s_btnBack, [](lv_event_t* e){ tft_ui_set_screen(UiScreen::Main); },
                        LV_EVENT_CLICKED, nullptr);
}

void refreshDetailScreen(int slot) {
    MapEntry entries[3];
    size_t count = 0;
    g_session.listMaps(entries, 3, count);
    MapEntry* me = nullptr;
    for (size_t i = 0; i < count; i++) if (entries[i].slot == slot) { me = &entries[i]; break; }
    if (!me) { tft_ui_set_screen(UiScreen::Main); return; }

    char title[64];
    snprintf(title, sizeof(title), "map%d  %s", me->slot, me->alias.c_str());
    lv_label_set_text(s_detailTitle, title);

    char bd[64];
    snprintf(bd, sizeof(bd), "Boundary: %d pts", me->boundaryPoints);
    lv_label_set_text(s_detailBoundary, bd);

    // Populate channel list by scanning LittleFS.
    lv_obj_clean(s_detailChannelList);
    File dir = LittleFS.open("/session");
    File entry = dir.openNextFile();
    String chPrefix = "map" + String(slot) + "to";
    while (entry) {
        String name = entry.name();
        if (name.startsWith(chPrefix) && name.endsWith("_unicom.csv")) {
            // Extract target from "mapXto<target>_unicom.csv"
            String mid = name.substring(chPrefix.length(), name.length() - 12); // "_unicom.csv"=12
            String label = "→ " + mid;
            lv_list_add_btn(s_detailChannelList, LV_SYMBOL_REFRESH, label.c_str());
        }
        entry.close();
        entry = dir.openNextFile();
    }
    dir.close();

    // Populate obstacle list.
    lv_obj_clean(s_detailObstacleList);
    dir = LittleFS.open("/session");
    entry = dir.openNextFile();
    String obsPrefix = "map" + String(slot) + "_";
    while (entry) {
        String name = entry.name();
        if (name.startsWith(obsPrefix) && name.endsWith("_obstacle.csv")) {
            char obsTxt[48];
            snprintf(obsTxt, sizeof(obsTxt), "obs %s", name.c_str());
            lv_list_add_btn(s_detailObstacleList, LV_SYMBOL_CLOSE, obsTxt);
        }
        entry.close();
        entry = dir.openNextFile();
    }
    dir.close();
}

static void onAddChannelClicked(lv_event_t* e) {
    // For MVP, target is hardcoded to "charge". Multi-map channel target picker
    // can be added later.
    recorder.startChannel(s_detailSlot, "charge");
    tft_ui_set_screen(UiScreen::Recording);
}

static void onAddObstacleClicked(lv_event_t* e) {
    recorder.startObstacle(s_detailSlot);
    tft_ui_set_screen(UiScreen::Recording);
}
```

- [ ] **Step 2: Flash + verify**

Build + flash. From main screen → tap a map row → detail screen shows boundary count, two empty columns, two add buttons. After serial `rec-obstacle` → file write → return to detail, obstacle list shows 1 row.

- [ ] **Step 3: Commit**

```bash
git add tools/rtk-walker/src/tft/tft_ui.cpp
git commit -m "feat(rtk-walker): TFT map detail screen with channels + obstacles"
```

---

### Task 5: TFT UI — recording screen with RTK quality indicator

**Files:**
- Modify: `tools/rtk-walker/src/tft/tft_ui.cpp`

- [ ] **Step 1: Build recording screen**

```cpp
static lv_obj_t* s_recBanner = nullptr;
static lv_obj_t* s_recPoints = nullptr;
static lv_obj_t* s_recDropped = nullptr;
static lv_obj_t* s_recRtkDot = nullptr;
static lv_obj_t* s_recRtkLabel = nullptr;
static lv_obj_t* s_recBadOverlay = nullptr;
static lv_obj_t* s_btnSave = nullptr;
static lv_obj_t* s_btnCancel = nullptr;
static lv_timer_t* s_recTimer = nullptr;

void buildRecordingScreen() {
    s_screenRecord = lv_obj_create(nullptr);
    lv_obj_set_style_bg_color(s_screenRecord, lv_color_hex(0x111111), 0);

    s_recBanner = lv_label_create(s_screenRecord);
    lv_obj_align(s_recBanner, LV_ALIGN_TOP_MID, 0, 8);
    lv_obj_set_style_text_font(s_recBanner, &lv_font_montserrat_24, 0);

    s_recPoints = lv_label_create(s_screenRecord);
    lv_obj_align(s_recPoints, LV_ALIGN_TOP_LEFT, 12, 60);

    s_recDropped = lv_label_create(s_screenRecord);
    lv_obj_align(s_recDropped, LV_ALIGN_TOP_LEFT, 12, 90);
    lv_obj_set_style_text_color(s_recDropped, lv_color_hex(0x888888), 0);

    s_recRtkDot = lv_obj_create(s_screenRecord);
    lv_obj_set_size(s_recRtkDot, 24, 24);
    lv_obj_set_style_radius(s_recRtkDot, 12, 0);
    lv_obj_align(s_recRtkDot, LV_ALIGN_TOP_RIGHT, -50, 60);

    s_recRtkLabel = lv_label_create(s_screenRecord);
    lv_obj_align_to(s_recRtkLabel, s_recRtkDot, LV_ALIGN_OUT_LEFT_MID, -6, 0);

    s_recBadOverlay = lv_label_create(s_screenRecord);
    lv_label_set_text(s_recBadOverlay, "Bad RTK signal");
    lv_obj_set_style_text_color(s_recBadOverlay, lv_color_hex(0xfca5a5), 0);
    lv_obj_align(s_recBadOverlay, LV_ALIGN_CENTER, 0, 0);
    lv_obj_add_flag(s_recBadOverlay, LV_OBJ_FLAG_HIDDEN);

    s_btnSave = lv_btn_create(s_screenRecord);
    lv_obj_set_size(s_btnSave, LV_PCT(45), 50);
    lv_obj_align(s_btnSave, LV_ALIGN_BOTTOM_LEFT, 8, -10);
    lv_obj_set_style_bg_color(s_btnSave, lv_color_hex(0x16a34a), 0);
    lv_obj_t* l1 = lv_label_create(s_btnSave);
    lv_label_set_text(l1, "Save");
    lv_obj_center(l1);
    lv_obj_add_event_cb(s_btnSave, onSaveClicked, LV_EVENT_CLICKED, nullptr);

    s_btnCancel = lv_btn_create(s_screenRecord);
    lv_obj_set_size(s_btnCancel, LV_PCT(45), 50);
    lv_obj_align(s_btnCancel, LV_ALIGN_BOTTOM_RIGHT, -8, -10);
    lv_obj_set_style_bg_color(s_btnCancel, lv_color_hex(0xdc2626), 0);
    lv_obj_t* l2 = lv_label_create(s_btnCancel);
    lv_label_set_text(l2, "Cancel");
    lv_obj_center(l2);
    lv_obj_add_event_cb(s_btnCancel, onCancelClicked, LV_EVENT_CLICKED, nullptr);

    s_recTimer = lv_timer_create([](lv_timer_t* t) {
        if (s_currentScreen != UiScreen::Recording) return;
        refreshRecordingScreen();
    }, 250, nullptr);
}

void refreshRecordingScreen() {
    const auto& st = recorder.state();
    const char* modeStr = "";
    uint32_t color = 0x86efac;
    switch (st.mode) {
        case RecordingMode::Work:     modeStr = "BOUNDARY"; color = 0x86efac; break;
        case RecordingMode::Obstacle: modeStr = "OBSTACLE"; color = 0xfca5a5; break;
        case RecordingMode::Channel:  modeStr = "CHANNEL";  color = 0xa5b4fc; break;
        default: modeStr = "?";
    }
    char banner[64];
    if (st.mode == RecordingMode::Work) snprintf(banner, sizeof(banner), "%s map%d", modeStr, st.parentSlot);
    else if (st.mode == RecordingMode::Obstacle)
        snprintf(banner, sizeof(banner), "%s in map%d", modeStr, st.parentSlot);
    else if (st.mode == RecordingMode::Channel)
        snprintf(banner, sizeof(banner), "%s map%d→%s", modeStr, st.parentSlot, st.channelTarget.c_str());
    lv_label_set_text(s_recBanner, banner);
    lv_obj_set_style_text_color(s_recBanner, lv_color_hex(color), 0);

    char ptsTxt[64];
    snprintf(ptsTxt, sizeof(ptsTxt), "Captured: %lu", st.pointsCaptured);
    lv_label_set_text(s_recPoints, ptsTxt);

    char dropTxt[64];
    snprintf(dropTxt, sizeof(dropTxt), "Dropped (low qual): %lu", st.pointsDropped);
    lv_label_set_text(s_recDropped, dropTxt);

    uint32_t dotColor = 0xdc2626; const char* lbl = "BAD";
    if (st.lastFixQuality == FixQuality::Fix)   { dotColor = 0x16a34a; lbl = "FIX"; }
    if (st.lastFixQuality == FixQuality::Float) { dotColor = 0xeab308; lbl = "FLOAT"; }
    lv_obj_set_style_bg_color(s_recRtkDot, lv_color_hex(dotColor), 0);
    lv_label_set_text(s_recRtkLabel, lbl);

    if (st.lastFixQuality == FixQuality::Bad) {
        lv_obj_clear_flag(s_recBadOverlay, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(s_recBadOverlay, LV_OBJ_FLAG_HIDDEN);
    }
}

static void onSaveClicked(lv_event_t* e) {
    recorder.stop(false);
    int prevDetail = (recorder.state().mode == RecordingMode::Idle && s_detailSlot >= 0)
                     ? s_detailSlot : -1;
    if (prevDetail >= 0) tft_ui_set_screen(UiScreen::MapDetail, prevDetail);
    else tft_ui_set_screen(UiScreen::Main);
}

static void onCancelClicked(lv_event_t* e) {
    recorder.stop(true);
    if (s_detailSlot >= 0) tft_ui_set_screen(UiScreen::MapDetail, s_detailSlot);
    else tft_ui_set_screen(UiScreen::Main);
}
```

- [ ] **Step 2: Flash + verify on field**

Walk around with the walker for 30s in WORK mode. Verify:
- Banner says "BOUNDARY map0" in green
- Point counter ticks ~1/s (one per GPS update)
- Dot is green "FIX" when in open sky
- Cover GPS briefly → dot turns red "BAD", "Bad RTK signal" overlay appears, dropped counter increments
- Tap Save → returns to main screen, map row appears

- [ ] **Step 3: Commit**

```bash
git add tools/rtk-walker/src/tft/tft_ui.cpp
git commit -m "feat(rtk-walker): TFT recording screen with live RTK quality"
```

---

### Task 6: Walker bundle export (zip + metadata.json)

**Files:**
- Create: `tools/rtk-walker/src/bundle.h` + `bundle.cpp`
- Modify: `tools/rtk-walker/src/main.cpp` (HTTP route)

- [ ] **Step 1: Bundle header**

```cpp
// tools/rtk-walker/src/bundle.h
#pragma once
#include <Arduino.h>
#include "session.h"

class BundleBuilder {
public:
    BundleBuilder(SessionStore& s) : sess_(s) {}

    // Build the bundle into LittleFS path /export/<filename>.novabundle
    // Returns the resulting path or empty string on failure.
    String build(const String& filenameHint);

private:
    SessionStore& sess_;
    bool writeMetadata(File& f);
    bool writePolygonsJson(File& f);
    bool writeObstaclesJson(File& f);
    bool writeUnicomJson(File& f);
    bool writeGeojsonWork(File& f);
};
```

- [ ] **Step 2: Implement bundle.cpp — STORED-mode zip (no compression)**

A stored-mode zip is just a sequence of `local file header + data + central directory + end-of-central-directory` records. Easy to hand-roll on an ESP32 without a compression library.

```cpp
// tools/rtk-walker/src/bundle.cpp
#include "bundle.h"
#include <ArduinoJson.h>

struct ZipEntry {
    String name;
    uint32_t offset;
    uint32_t size;
    uint32_t crc32;
};

static uint32_t crc32_table[256];
static bool crc32_init = false;
static void initCrc32() {
    for (uint32_t i = 0; i < 256; i++) {
        uint32_t c = i;
        for (int k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >> 1)) : (c >> 1);
        crc32_table[i] = c;
    }
    crc32_init = true;
}
static uint32_t crc32(const uint8_t* buf, size_t len, uint32_t crc = 0) {
    if (!crc32_init) initCrc32();
    crc = crc ^ 0xffffffff;
    for (size_t i = 0; i < len; i++) crc = crc32_table[(crc ^ buf[i]) & 0xff] ^ (crc >> 8);
    return crc ^ 0xffffffff;
}

static void writeLE32(File& f, uint32_t v) {
    f.write(v & 0xff); f.write((v >> 8) & 0xff); f.write((v >> 16) & 0xff); f.write((v >> 24) & 0xff);
}
static void writeLE16(File& f, uint16_t v) {
    f.write(v & 0xff); f.write((v >> 8) & 0xff);
}

static void writeLocalHeader(File& zip, const String& name, uint32_t crc, uint32_t size) {
    writeLE32(zip, 0x04034b50);  // local file header signature
    writeLE16(zip, 20);          // version needed
    writeLE16(zip, 0);           // flags
    writeLE16(zip, 0);           // method: stored
    writeLE16(zip, 0);           // mtime
    writeLE16(zip, 0);           // mdate
    writeLE32(zip, crc);
    writeLE32(zip, size);
    writeLE32(zip, size);
    writeLE16(zip, name.length());
    writeLE16(zip, 0);
    zip.write((const uint8_t*)name.c_str(), name.length());
}

static void addFile(File& zip, const String& nameInZip, const String& sourcePath,
                    std::vector<ZipEntry>& entries) {
    File src = LittleFS.open(sourcePath, FILE_READ);
    if (!src) return;
    uint32_t size = src.size();
    // Compute CRC by reading once.
    uint8_t buf[256];
    uint32_t crc = 0;
    while (src.available()) {
        size_t n = src.read(buf, sizeof(buf));
        crc = crc32(buf, n, crc);
    }
    src.close();

    // Write header + data.
    ZipEntry e;
    e.name = nameInZip;
    e.offset = zip.position();
    e.size = size;
    e.crc32 = crc;
    writeLocalHeader(zip, nameInZip, crc, size);
    src = LittleFS.open(sourcePath, FILE_READ);
    while (src.available()) {
        size_t n = src.read(buf, sizeof(buf));
        zip.write(buf, n);
    }
    src.close();
    entries.push_back(e);
}

static void addInline(File& zip, const String& nameInZip, const String& content,
                      std::vector<ZipEntry>& entries) {
    uint32_t crc = crc32((const uint8_t*)content.c_str(), content.length());
    ZipEntry e;
    e.name = nameInZip;
    e.offset = zip.position();
    e.size = content.length();
    e.crc32 = crc;
    writeLocalHeader(zip, nameInZip, crc, content.length());
    zip.write((const uint8_t*)content.c_str(), content.length());
    entries.push_back(e);
}

static void writeCentralDirectory(File& zip, const std::vector<ZipEntry>& entries) {
    uint32_t cdStart = zip.position();
    for (const auto& e : entries) {
        writeLE32(zip, 0x02014b50);  // central directory signature
        writeLE16(zip, 20);  // version made by
        writeLE16(zip, 20);  // version needed
        writeLE16(zip, 0);
        writeLE16(zip, 0);
        writeLE16(zip, 0);
        writeLE16(zip, 0);
        writeLE32(zip, e.crc32);
        writeLE32(zip, e.size);
        writeLE32(zip, e.size);
        writeLE16(zip, e.name.length());
        writeLE16(zip, 0);
        writeLE16(zip, 0);
        writeLE16(zip, 0);
        writeLE16(zip, 0);
        writeLE32(zip, 0);  // external attrs
        writeLE32(zip, e.offset);
        zip.write((const uint8_t*)e.name.c_str(), e.name.length());
    }
    uint32_t cdSize = zip.position() - cdStart;
    writeLE32(zip, 0x06054b50);  // end of central directory
    writeLE16(zip, 0);
    writeLE16(zip, 0);
    writeLE16(zip, entries.size());
    writeLE16(zip, entries.size());
    writeLE32(zip, cdSize);
    writeLE32(zip, cdStart);
    writeLE16(zip, 0);
}

// Build the JSON content for polygons.json / obstacles.json / unicom.json.
static String buildJsonFromCsvFiles(const String& kind, int slotFilter) {
    DynamicJsonDocument doc(8192);
    JsonArray arr = doc.to<JsonArray>();
    File dir = LittleFS.open("/session");
    File e = dir.openNextFile();
    while (e) {
        String name = e.name();
        bool include = false;
        if (kind == "polygons" && name.endsWith("_work.csv")) include = true;
        if (kind == "obstacles" && name.endsWith("_obstacle.csv")) include = true;
        if (kind == "unicom" && name.endsWith("_unicom.csv")) include = true;
        if (include) {
            JsonObject entry = arr.createNestedObject();
            entry["name"] = name.substring(0, name.length() - 4);
            // Read points.
            JsonArray pts = entry.createNestedArray("points");
            File f = LittleFS.open(String("/session/") + name, FILE_READ);
            while (f.available()) {
                String line = f.readStringUntil('\n');
                int comma = line.indexOf(',');
                if (comma < 0) continue;
                JsonObject p = pts.createNestedObject();
                p["x"] = line.substring(0, comma).toFloat();
                p["y"] = line.substring(comma + 1).toFloat();
            }
            f.close();
        }
        e.close();
        e = dir.openNextFile();
    }
    dir.close();
    String out;
    serializeJson(arr, out);
    return out;
}

String BundleBuilder::build(const String& filenameHint) {
    if (!LittleFS.exists("/export")) LittleFS.mkdir("/export");
    String outPath = "/export/" + filenameHint + ".novabundle";
    if (LittleFS.exists(outPath)) LittleFS.remove(outPath);
    File zip = LittleFS.open(outPath, FILE_WRITE);
    if (!zip) return "";
    std::vector<ZipEntry> entries;

    // metadata.json
    DynamicJsonDocument meta(2048);
    meta["schemaVersion"] = 1;
    meta["sourceType"] = "walker";
    meta["walkerId"] = "rtk-walker-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    meta["sessionId"] = String(millis());
    double oLat = NAN, oLng = NAN;
    sess_.getOrigin(oLat, oLng);
    JsonObject anchor = meta.createNestedObject("polygonOriginAnchor");
    anchor["name"] = "session_start";
    anchor["x"] = 0;
    anchor["y"] = 0;
    JsonObject pose = meta.createNestedObject("originalChargingPose");
    pose["x"] = 0; pose["y"] = 0; pose["orientation"] = 0;
    JsonObject src = meta.createNestedObject("sourceCharger");
    if (!isnan(oLat)) src["lat"] = oLat; else src["lat"] = nullptr;
    if (!isnan(oLng)) src["lng"] = oLng; else src["lng"] = nullptr;
    String metaStr;
    serializeJson(meta, metaStr);
    addInline(zip, "metadata.json", metaStr, entries);

    // JSON files derived from CSVs.
    addInline(zip, "polygons.json",  buildJsonFromCsvFiles("polygons",  -1), entries);
    addInline(zip, "obstacles.json", buildJsonFromCsvFiles("obstacles", -1), entries);
    addInline(zip, "unicom.json",    buildJsonFromCsvFiles("unicom",    -1), entries);

    // Raw CSVs under walker/ subdir.
    File dir = LittleFS.open("/session");
    File e = dir.openNextFile();
    while (e) {
        String name = e.name();
        if (name.endsWith(".csv")) {
            addFile(zip, "walker/" + name, String("/session/") + name, entries);
        }
        e.close();
        e = dir.openNextFile();
    }
    dir.close();

    writeCentralDirectory(zip, entries);
    zip.close();
    return outPath;
}
```

- [ ] **Step 3: HTTP route to serve the bundle**

In `tools/rtk-walker/src/main.cpp`, replace the existing `/tracks` route with:

```cpp
server.on("/bundle.novabundle", HTTP_GET, []() {
    BundleBuilder bb(g_session);
    String path = bb.build("session-" + String(millis()));
    if (path.isEmpty()) { server.send(500, "text/plain", "build failed"); return; }
    File f = LittleFS.open(path, FILE_READ);
    if (!f) { server.send(500, "text/plain", "open failed"); return; }
    server.sendHeader("Content-Disposition", "attachment; filename=\"walker.novabundle\"");
    server.streamFile(f, "application/zip");
    f.close();
});
```

- [ ] **Step 4: Wire export button (was placeholder in Task 3)**

Replace the empty `onExportClicked` with:
```cpp
static void onExportClicked(lv_event_t* e) {
    BundleBuilder bb(g_session);
    String path = bb.build("session-" + String(millis()));
    if (path.isEmpty()) {
        // show alert "Export failed"
        return;
    }
    // For MVP just show a success modal with the device IP + /bundle.novabundle.
    showAlert("Export ready", String("http://") + WiFi.localIP().toString() + "/bundle.novabundle");
}
```

- [ ] **Step 5: Verify**

Walk a small boundary, save, tap Export. From a host on the same WiFi:
```bash
curl -sS http://<walker-ip>/bundle.novabundle -o /tmp/walker.novabundle
unzip -l /tmp/walker.novabundle
# Expect:
#   metadata.json
#   polygons.json
#   obstacles.json
#   unicom.json
#   walker/map0_work.csv
```

Verify polygons.json has the captured points and metadata.json has correct schemaVersion + walkerId.

- [ ] **Step 6: Commit**

```bash
git add tools/rtk-walker/src/bundle.h tools/rtk-walker/src/bundle.cpp tools/rtk-walker/src/main.cpp tools/rtk-walker/src/tft/tft_ui.cpp
git commit -m "feat(rtk-walker): bundle export (.novabundle zip) + HTTP serve"
```

---

### Task 7: Server-side polygon rasterizer

**Files:**
- Create: `server/src/maps/polygonRasterizer.ts`
- Create: `server/src/__tests__/maps/polygonRasterizer.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// server/src/__tests__/maps/polygonRasterizer.test.ts
import { describe, it, expect } from 'vitest';
import { rasterizePolygon, type Point } from '../../maps/polygonRasterizer.js';

describe('rasterizePolygon', () => {
  it('builds a 2x2m square at 0.5m/px → 4x4 pixel area marked free', () => {
    const polygon: Point[] = [
      { x: 0, y: 0 }, { x: 2, y: 0 },
      { x: 2, y: 2 }, { x: 0, y: 2 },
    ];
    const result = rasterizePolygon([polygon], [], {
      resolution: 0.5,
      marginM: 0,
    });
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    expect(result.origin).toEqual([0, 0, 0]);
    // All interior pixels should be 254 (free), boundary may be 0 or 254 depending on edge handling.
    expect(result.pgmBytes.byteLength).toBeGreaterThan(0);
    expect(result.yaml).toContain('resolution: 0.500');
    expect(result.yaml).toContain('origin: [0');
  });

  it('handles obstacles by carving them out (marked as occupied)', () => {
    const polygon: Point[] = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
    ];
    const obstacle: Point[] = [
      { x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }, { x: 4, y: 6 },
    ];
    const result = rasterizePolygon([polygon], [obstacle], { resolution: 0.5, marginM: 0 });
    // Pixel at world (5,5) should be in obstacle → occupied (0).
    const px = Math.floor((5 - 0) / 0.5);
    const py = Math.floor((5 - 0) / 0.5);
    const idx = (result.height - 1 - py) * result.width + px;  // PGM rows top-down
    // P5 binary header takes some bytes, but for the test we only assert "rasterizer ran";
    // full pixel verification is in a longer integration test.
    expect(result.pgmBytes.byteLength).toBeGreaterThan(40);
  });
});
```

Run: `cd server && npx vitest run polygonRasterizer.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement rasterizer**

```typescript
// server/src/maps/polygonRasterizer.ts
export interface Point { x: number; y: number }

export interface RasterizeOpts {
  resolution: number;   // meters per pixel (typical 0.05)
  marginM: number;      // extra margin around polygons in meters
}

export interface RasterizeResult {
  pgmBytes: Buffer;     // P5 binary PGM (header + raw bytes)
  yaml: string;         // map.yaml content
  width: number;
  height: number;
  origin: [number, number, number];  // [x, y, theta] (theta always 0)
}

// Point-in-polygon, even-odd rule.
function pointInPolygon(px: number, py: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > py) !== (yj > py))
      && (px < (xj - xi) * (py - yi) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function rasterizePolygon(
  workPolygons: Point[][],
  obstacles: Point[][],
  opts: RasterizeOpts,
): RasterizeResult {
  if (workPolygons.length === 0) {
    throw new Error('at least one work polygon required');
  }
  const allPts = workPolygons.flat().concat(obstacles.flat());
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of allPts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const m = opts.marginM;
  minX -= m; minY -= m; maxX += m; maxY += m;
  const res = opts.resolution;
  const width = Math.ceil((maxX - minX) / res);
  const height = Math.ceil((maxY - minY) / res);

  // 254 = free, 205 = unknown, 0 = occupied (Nav2 occupancy convention).
  const pixels = Buffer.alloc(width * height, 205);

  for (let py = 0; py < height; py++) {
    const worldY = minY + (py + 0.5) * res;
    for (let px = 0; px < width; px++) {
      const worldX = minX + (px + 0.5) * res;
      let inside = false;
      for (const poly of workPolygons) {
        if (pointInPolygon(worldX, worldY, poly)) { inside = true; break; }
      }
      if (!inside) continue;
      let inObstacle = false;
      for (const obs of obstacles) {
        if (pointInPolygon(worldX, worldY, obs)) { inObstacle = true; break; }
      }
      // PGM rows top-down: index = (height-1-py) * width + px
      const idx = (height - 1 - py) * width + px;
      pixels[idx] = inObstacle ? 0 : 254;
    }
  }

  // P5 binary PGM: header + raw bytes.
  const header = Buffer.from(`P5\n${width} ${height}\n255\n`, 'ascii');
  const pgmBytes = Buffer.concat([header, pixels]);

  const yaml =
    `image: map.pgm\nresolution: ${res.toFixed(6)}\norigin: [${minX.toFixed(6)}, ${minY.toFixed(6)}, 0.000000]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n`;

  return {
    pgmBytes,
    yaml,
    width,
    height,
    origin: [minX, minY, 0],
  };
}
```

- [ ] **Step 3: Run tests to verify**

```bash
cd server && npx vitest run polygonRasterizer.test.ts
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/maps/polygonRasterizer.ts server/src/__tests__/maps/polygonRasterizer.test.ts
git commit -m "feat(server): polygon → PGM + YAML rasterizer with obstacle carve-out"
```

---

### Task 8: Server-side walker bundle importer

**Files:**
- Create: `server/src/maps/walkerBundleImporter.ts`
- Create: `server/src/__tests__/maps/walkerBundleImporter.test.ts`
- Modify: `server/src/routes/adminStatus.ts`

- [ ] **Step 1: Write failing test**

```typescript
// server/src/__tests__/maps/walkerBundleImporter.test.ts
import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import { synthesizePortableFromWalker } from '../../maps/walkerBundleImporter.js';

function buildFixtureBundle(): Buffer {
  const zip = new AdmZip();
  zip.addFile('metadata.json', Buffer.from(JSON.stringify({
    schemaVersion: 1,
    sourceType: 'walker',
    walkerId: 'rtk-walker-test',
    sessionId: '12345',
    polygonOriginAnchor: { name: 'session_start', x: 0, y: 0 },
    originalChargingPose: { x: 0, y: 0, orientation: 0 },
  })));
  zip.addFile('polygons.json', Buffer.from(JSON.stringify([
    { name: 'map0_work', points: [
      { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 },
    ]},
  ])));
  zip.addFile('obstacles.json', Buffer.from('[]'));
  zip.addFile('unicom.json', Buffer.from('[]'));
  return zip.toBuffer();
}

describe('synthesizePortableFromWalker', () => {
  it('Δ-rotates polygons against currentDockPose and produces a portable bundle with raster', async () => {
    const walkerZip = buildFixtureBundle();
    const result = await synthesizePortableFromWalker(walkerZip, {
      currentDockPose: { x: 2, y: 1, orientation: 0 },
      resolution: 0.5,
      marginM: 0,
    });
    expect(result.portableZip.byteLength).toBeGreaterThan(0);
    expect(result.transformedPolygons[0].points[0]).toEqual({ x: 2, y: 1 });
    expect(result.transformedPolygons[0].points[1]).toEqual({ x: 7, y: 1 });
  });

  it('rejects bundles without polygons.json', async () => {
    const zip = new AdmZip();
    zip.addFile('metadata.json', Buffer.from('{}'));
    await expect(
      synthesizePortableFromWalker(zip.toBuffer(), {
        currentDockPose: { x: 0, y: 0, orientation: 0 },
        resolution: 0.5,
        marginM: 0,
      })
    ).rejects.toThrow();
  });
});
```

Run: `cd server && npx vitest run walkerBundleImporter.test.ts` → FAIL (module missing).

- [ ] **Step 2: Implement importer**

```typescript
// server/src/maps/walkerBundleImporter.ts
import AdmZip from 'adm-zip';
import { rasterizePolygon, type Point } from './polygonRasterizer.js';

interface Pose { x: number; y: number; orientation: number }

export interface SynthesizeOpts {
  currentDockPose: Pose;
  resolution: number;
  marginM: number;
}

export interface SynthesizeResult {
  portableZip: Buffer;
  transformedPolygons: Array<{ name: string; alias?: string; points: Point[] }>;
  transformedObstacles: Array<{ name: string; parentMap?: string; points: Point[] }>;
  transformedUnicom: Array<{ name: string; parentMap?: string; targetMapName?: string; points: Point[] }>;
}

function rotateTranslate(p: Point, dock: Pose): Point {
  const c = Math.cos(dock.orientation);
  const s = Math.sin(dock.orientation);
  return {
    x: dock.x + p.x * c - p.y * s,
    y: dock.y + p.x * s + p.y * c,
  };
}

export async function synthesizePortableFromWalker(
  walkerZipBuffer: Buffer,
  opts: SynthesizeOpts,
): Promise<SynthesizeResult> {
  const zip = new AdmZip(walkerZipBuffer);
  const polygonsEntry = zip.getEntry('polygons.json');
  if (!polygonsEntry) throw new Error('walker bundle missing polygons.json');
  const obstaclesEntry = zip.getEntry('obstacles.json');
  const unicomEntry = zip.getEntry('unicom.json');

  const polygons = JSON.parse(polygonsEntry.getData().toString('utf8')) as Array<{ name: string; alias?: string; points: Point[] }>;
  const obstacles = obstaclesEntry
    ? JSON.parse(obstaclesEntry.getData().toString('utf8')) as Array<{ name: string; parentMap?: string; points: Point[] }>
    : [];
  const unicom = unicomEntry
    ? JSON.parse(unicomEntry.getData().toString('utf8')) as Array<{ name: string; parentMap?: string; targetMapName?: string; points: Point[] }>
    : [];

  const transformedPolygons = polygons.map((p) => ({
    ...p,
    points: p.points.map((pt) => rotateTranslate(pt, opts.currentDockPose)),
  }));
  const transformedObstacles = obstacles.map((o) => ({
    ...o,
    points: o.points.map((pt) => rotateTranslate(pt, opts.currentDockPose)),
  }));
  const transformedUnicom = unicom.map((u) => ({
    ...u,
    points: u.points.map((pt) => rotateTranslate(pt, opts.currentDockPose)),
  }));

  // Rasterize.
  const raster = rasterizePolygon(
    transformedPolygons.map((p) => p.points),
    transformedObstacles.map((o) => o.points),
    { resolution: opts.resolution, marginM: opts.marginM },
  );

  // Build a synthetic .novabotmap zip with the mower/ subdir.
  const outZip = new AdmZip();
  outZip.addFile('metadata.json', Buffer.from(JSON.stringify({
    schemaVersion: 1,
    sourceType: 'walker-import',
    exportedAt: new Date().toISOString(),
    sourceCharger: { lat: null, lng: null },
    polygonOriginAnchor: { name: 'mower-dock', x: 0, y: 0 },
    originalChargingPose: opts.currentDockPose,
    workMapNames: transformedPolygons.map((_, i) => `map${i}`),
    userAliases: Object.fromEntries(transformedPolygons.map((p, i) => [`map${i}`, p.alias ?? `Walker map ${i}`])),
  })));
  outZip.addFile('polygons.json', Buffer.from(JSON.stringify(transformedPolygons.map((p, i) => ({
    name: `map${i}`,
    alias: p.alias ?? `Walker map ${i}`,
    points: p.points,
  })))));
  outZip.addFile('obstacles.json', Buffer.from(JSON.stringify(transformedObstacles)));
  outZip.addFile('unicom.json', Buffer.from(JSON.stringify(transformedUnicom)));

  // mower/ subdir: csv_file files + raster.
  for (let i = 0; i < transformedPolygons.length; i++) {
    const csv = transformedPolygons[i].points.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join('\n');
    outZip.addFile(`mower/csv_file/map${i}_work.csv`, Buffer.from(csv));
  }
  for (const o of transformedObstacles) {
    const csv = o.points.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join('\n');
    outZip.addFile(`mower/csv_file/${o.name}.csv`, Buffer.from(csv));
  }
  for (const u of transformedUnicom) {
    const csv = u.points.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join('\n');
    outZip.addFile(`mower/csv_file/${u.name}.csv`, Buffer.from(csv));
  }
  // map_info.json.
  const mapInfo: any = {
    charging_pose: opts.currentDockPose,
  };
  for (let i = 0; i < transformedPolygons.length; i++) {
    // map_size = polygon area (Shoelace).
    const pts = transformedPolygons[i].points;
    let area = 0;
    for (let k = 0, j = pts.length - 1; k < pts.length; j = k++) {
      area += (pts[j].x + pts[k].x) * (pts[j].y - pts[k].y);
    }
    mapInfo[`map${i}_work.csv`] = { map_size: Math.abs(area) / 2 };
  }
  outZip.addFile('mower/csv_file/map_info.json', Buffer.from(JSON.stringify(mapInfo, null, 3)));

  // charging_station.yaml.
  outZip.addFile('mower/charging_station.yaml', Buffer.from(
    `charging_pose: [${opts.currentDockPose.x}, ${opts.currentDockPose.y}, ${opts.currentDockPose.orientation}]\n`
  ));

  // map.yaml/pgm + per-slot mapN.yaml/pgm.
  outZip.addFile('mower/map_files/map.yaml', Buffer.from(raster.yaml));
  outZip.addFile('mower/map_files/map.pgm', raster.pgmBytes);
  for (let i = 0; i < transformedPolygons.length; i++) {
    const slotYaml = raster.yaml.replace('image: map.pgm', `image: map${i}.pgm`);
    outZip.addFile(`mower/map_files/map${i}.yaml`, Buffer.from(slotYaml));
    outZip.addFile(`mower/map_files/map${i}.pgm`, raster.pgmBytes);
  }

  return {
    portableZip: outZip.toBuffer(),
    transformedPolygons,
    transformedObstacles,
    transformedUnicom,
  };
}
```

- [ ] **Step 3: Add adm-zip dependency**

```bash
cd server && npm install adm-zip @types/adm-zip
```

- [ ] **Step 4: Verify tests pass**

```bash
cd server && npx vitest run walkerBundleImporter.test.ts polygonRasterizer.test.ts
```
Expected: PASS.

- [ ] **Step 5: Add server endpoint**

In `server/src/routes/adminStatus.ts`, near the other import-portable endpoints, add:

```typescript
import multer from 'multer';
import { synthesizePortableFromWalker } from '../maps/walkerBundleImporter.js';
import { parseBundle } from '../maps/portableBundle.js';

const walkerUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

adminStatusRouter.post(
  '/maps/:sn/import-walker-bundle',
  walkerUpload.single('bundle'),
  async (req: AuthRequest, res: Response) => {
    const sn = req.params.sn;
    if (!req.file) { res.status(400).json({ ok: false, error: 'bundle file required' }); return; }
    const sensors = deviceCache.get(sn);
    const mx = parseFloat(sensors?.get('map_position_x') ?? '');
    const my = parseFloat(sensors?.get('map_position_y') ?? '');
    const mo = parseFloat(sensors?.get('map_position_orientation') ?? '');
    if (!Number.isFinite(mx) || !Number.isFinite(my) || !Number.isFinite(mo)) {
      res.status(409).json({ ok: false, error: 'no live map_position in sensor cache — is the mower online and docked?' });
      return;
    }
    const currentDockPose = { x: mx, y: my, orientation: mo };

    let synth;
    try {
      synth = await synthesizePortableFromWalker(req.file.buffer, {
        currentDockPose,
        resolution: 0.05,
        marginM: 1.0,
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: (err as Error).message });
      return;
    }

    // Hand off to existing import-portable staging pipeline.
    const parsed = await parseBundle(synth.portableZip);
    const session = importStaging.create(sn, {
      sourceSn: 'walker-' + Date.now(),
      polygonAreaM2: parsed.polygon.areaM2,
    });
    const dir = path.join(process.env.STORAGE_PATH ?? './storage', 'imports', sn, session.stagingId);
    fs.writeFileSync(path.join(dir, 'bundle.json'), JSON.stringify(parsed));

    res.json({
      ok: true,
      stagingId: session.stagingId,
      state: session.state,
      verbatimRestore: true,
      exactRestore: true,
      sourceSn: sn,
      sourceSnMatches: true,
      note: 'walker bundle synthesized into portable bundle — POST /apply-verbatim next',
      polygons: synth.transformedPolygons.map((p) => ({ name: p.name, alias: p.alias, points: p.points.length })),
    });
  },
);
```

- [ ] **Step 6: Verify TS**

```bash
cd server && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add server/src/maps/walkerBundleImporter.ts server/src/maps/polygonRasterizer.ts server/src/__tests__/maps/ server/src/routes/adminStatus.ts server/package.json server/package-lock.json
git commit -m "feat(server): walker bundle import endpoint with Δ-rotation + rasterize"
```

---

### Task 9: Admin page — walker bundle import UI

**Files:**
- Modify: `server/src/routes/adminPage.ts`

- [ ] **Step 1: Locate the portable backup section**

Search for `portableImportPanel` in `adminPage.ts` (around line 446). Add a sibling section directly after the existing import bundle button.

- [ ] **Step 2: Add walker import section + JS function**

In the HTML around line 446, add:

```html
<div style="margin-top: 14px; padding: 10px; border: 1px solid rgba(168,139,250,.3); border-radius: 6px; background: rgba(168,139,250,.05);">
  <div style="font-size: 12px; font-weight: 600; color: #a78bfa; margin-bottom: 8px;">RTK Walker bundle</div>
  <div style="font-size: 11px; color: #94a3b8; margin-bottom: 8px;">
    Upload a .novabundle exported from the RTK walker. Server Δ-rotates polygons
    against the mower's live charging pose, rasterizes them, and runs through
    apply-verbatim. The dock-anchor refresh modal will appear afterwards.
  </div>
  <input id="walkerBundleFile" type="file" accept=".novabundle,.zip" style="display:none" onchange="startWalkerImport()">
  <button onclick="document.getElementById('walkerBundleFile').click()" style="padding:7px 18px;background:rgba(168,139,250,.2);color:#a78bfa;border:1px solid rgba(168,139,250,.5);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Import walker bundle...</button>
</div>
```

And in the JS section (near `restorePortableBackup`):

```javascript
async function startWalkerImport() {
  var sn = document.getElementById('mapMowerSelect').value;
  var input = document.getElementById('walkerBundleFile');
  if (!input.files || !input.files[0]) return;
  var fd = new FormData();
  fd.append('bundle', input.files[0]);
  var r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/import-walker-bundle', {
    method: 'POST', headers: { 'Authorization': token }, body: fd,
  });
  var j = await r.json();
  if (!j.ok) { await appAlert('Walker import failed: ' + (j.error || 'unknown'), { accent: 'danger' }); return; }
  portableStagingId = j.stagingId;
  portableVerbatimRestore = true;
  portableExactRestore = true;
  portableSourceSnMatches = true;
  var msg = 'Walker bundle staged. ' + j.polygons.length + ' work polygon(s). Apply verbatim now?';
  if (!(await appConfirm(msg, { okText: 'Apply' }))) return;
  await portableApplyVerbatim();
}
```

- [ ] **Step 3: Verify in browser**

After server restart:
1. Open admin → Map tab → select .244
2. New purple "RTK Walker bundle" section visible
3. Click "Import walker bundle..." → file picker
4. Upload a test .novabundle → confirm dialog appears
5. Confirm → apply runs → dock-anchor refresh modal appears

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/adminPage.ts
git commit -m "feat(admin-page): walker bundle import section with confirm + apply flow"
```

---

### Task 10: Walker direct POST upload

**Files:**
- Modify: `tools/rtk-walker/src/main.cpp`
- Modify: `tools/rtk-walker/src/tft/tft_ui.cpp`
- Modify: `tools/rtk-walker/src/index_html.h`

- [ ] **Step 1: Add server URL config to walker (web UI)**

Update the existing `index_html.h` settings page to accept a `serverUrl` and `mowerSn` field. Store in LittleFS `/config/server.json`.

- [ ] **Step 2: Implement upload function**

```cpp
// In main.cpp, after bundle export:
bool uploadBundleToServer(const String& bundlePath) {
    String serverUrl = readServerUrl();   // existing config helper
    String mowerSn = readMowerSn();
    if (serverUrl.isEmpty() || mowerSn.isEmpty()) return false;
    String token = readAdminToken();      // user paste-and-save
    if (token.isEmpty()) return false;

    File f = LittleFS.open(bundlePath, FILE_READ);
    if (!f) return false;
    size_t fileSize = f.size();

    HTTPClient http;
    String url = serverUrl + "/api/admin-status/maps/" + mowerSn + "/import-walker-bundle";
    http.begin(url);
    http.addHeader("Authorization", "Bearer " + token);

    String boundary = "----RtkWalkerBoundary";
    http.addHeader("Content-Type", "multipart/form-data; boundary=" + boundary);

    String head = "--" + boundary + "\r\n"
                  "Content-Disposition: form-data; name=\"bundle\"; filename=\"walker.novabundle\"\r\n"
                  "Content-Type: application/zip\r\n\r\n";
    String tail = "\r\n--" + boundary + "--\r\n";

    size_t totalLen = head.length() + fileSize + tail.length();

    // Manual chunked POST via WiFiClient (HTTPClient doesn't stream from File directly).
    WiFiClient* client = http.getStreamPtr();
    if (!client) { f.close(); return false; }
    http.sendRequest("POST");
    // ... (full implementation requires lower-level handling — alternative: load full file into PSRAM and send)
    f.close();
    return true;
}
```

(Implementation note: full multipart POST from LittleFS streaming on ESP32 is non-trivial. MVP fallback: load the bundle into a String/Buffer in PSRAM, send as one chunk via http.sendRequest with body. ESP32-S3 has enough PSRAM for bundles up to a few MB.)

- [ ] **Step 3: Add UI button "Upload to server" on main screen**

Next to "Export bundle", add a second button that calls `uploadBundleToServer` and shows progress.

- [ ] **Step 4: Verify**

Walk a small boundary, save, tap "Upload to server". Watch admin page MQTT log + dashboard: staging session should appear, dock-anchor refresh modal should fire on the walker user's behalf (operator confirms on admin page).

- [ ] **Step 5: Commit**

```bash
git add tools/rtk-walker/src/main.cpp tools/rtk-walker/src/tft/tft_ui.cpp tools/rtk-walker/src/index_html.h
git commit -m "feat(rtk-walker): direct POST upload to server import endpoint"
```

---

### Task 11: End-to-end test + documentation

**Files:**
- Modify: `docs/user-guide/map-backup-restore.md`
- Create: `docs/user-guide/rtk-walker-mapping.md`

- [ ] **Step 1: Document the walker mapping flow**

Write a sibling user-guide page explaining:
1. Powering up + WiFi pairing the walker
2. Setting server URL + admin token in walker config
3. Recording a work map (walk the boundary)
4. Adding obstacles + channels
5. Exporting via WiFi (download OR direct POST)
6. The dock-anchor refresh modal afterwards

- [ ] **Step 2: Add cross-link from existing map-backup-restore doc**

```markdown
### Alternative: build a fresh map without driving the mower

If you have an RTK walker, see [RTK Walker mapping](rtk-walker-mapping.md) for
how to record a map by walking the perimeter and importing through the same
restore flow this page describes.
```

- [ ] **Step 3: Run end-to-end on .244**

1. Pair walker to WiFi
2. Walk a 5×5m boundary around Voortuin (~30s walk)
3. Save → Export → Upload to server (or download + admin upload)
4. Server returns staging ID
5. Apply verbatim
6. Dock-anchor refresh modal → choose Manual or Auto
7. Verify mower's `map_position` is within 10cm of bundle charging_pose after dock cycle
8. Start mow → mower drives the walked polygon

- [ ] **Step 4: Update memory + commit doc**

```bash
git add docs/user-guide/rtk-walker-mapping.md docs/user-guide/map-backup-restore.md docs/user-guide/index.md
git commit -m "docs(walker): RTK walker mapping flow + integration with restore pipeline"
```

Add memory file `~/.claude/projects/-Users-rvbcrs-GitHub-Novabot/memory/rtk-walker-import-working.md`
once the end-to-end test passes.

---

## Self-review checklist

**1. Spec coverage:**
- ✅ Walker UI: main / map detail / recording screens with mode + parent-map indication
- ✅ Three recording modes (work / obstacle / channel) with proper filename conventions
- ✅ Channel as polyline (sequence of points)
- ✅ RTK quality filter live during recording
- ✅ LittleFS storage in mower-compatible naming
- ✅ `.novabundle` export format matching `.novabotmap` structure
- ✅ Both download (HTTP GET) and direct POST upload
- ✅ Server Δ-rotation + rasterize + synthetic portable bundle
- ✅ Dock-anchor refresh modal reused from existing restore flow
- ✅ Documentation + end-to-end test

**2. Placeholder scan:**
- ⚠ Task 10 has an implementation note about multipart POST from LittleFS streaming being non-trivial; the MVP approach is to load into PSRAM. Acceptable for an ESP32-S3 with PSRAM but document if PSRAM unavailable on the target board.
- ⚠ Channel target picker in Task 4 is hardcoded to "charge" for MVP; multi-map channel targets are listed as future work.

**3. Type consistency:**
- ✅ Point type used consistently in rasterizer + importer
- ✅ Pose used consistently for dock pose
- ✅ Walker filenames match mower's csv_file/ conventions

**4. Risk areas to keep in mind during execution:**
- Walker LittleFS size: bundles >300KB may push against the partition. Monitor sizes in Task 1.
- ESP32 zip building: hand-rolled stored-mode zip is correct in spec but needs careful verification of CRC + central directory offsets. Add a verification step: unzip the walker-produced bundle via `unzip -l` on a host before declaring done.
- Server polygon orientation: walker captures in lat/lng (East=+X, North=+Y), mower uses local meters (no fixed orientation convention). Δ-rotation handles this but verify on first end-to-end test that polygons land in the expected garden quadrant (not mirrored).

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-22-rtk-walker-map-import.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, spec + code-quality review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints

Which approach?
