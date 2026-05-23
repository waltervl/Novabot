// tools/rtk-walker/src/session.cpp
//
// Implementation of SessionStore — see session.h for the layout contract.
#include "session.h"

#include <math.h>

#include <vector>

namespace {

constexpr int kMaxWorkSlots = 3;
constexpr int kMaxObstacles = 32;

// listMaps() decodes the slot via `name.charAt(3) - '0'`, which only works
// for single-digit slot numbers. If kMaxWorkSlots ever grows past 10 that
// decoder breaks silently — guard it.
static_assert(kMaxWorkSlots <= 10, "Single-digit slot encoding assumed in listMaps");

String workPath(int slot) {
    return String("/session/map") + slot + "_work.csv";
}

String obstaclePath(int slot, int idx) {
    return String("/session/map") + slot + "_" + idx + "_obstacle.csv";
}

String channelPath(int slot, const String& target) {
    return String("/session/map") + slot + "to" + target + "_unicom.csv";
}

String rawPath(const String& base) {
    return String("/session/") + base + ".raw";
}

// Count rows (newline-terminated entries) in a CSV-like file. Returns 0 when
// the file is missing or empty.
int countRows(const String& path) {
    if (!LittleFS.exists(path)) return 0;
    File f = LittleFS.open(path, FILE_READ);
    if (!f) return 0;
    uint8_t buf[128];
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

bool appendLine(const String& path, const String& line) {
    // FILE_APPEND on Arduino-LittleFS already creates the file if missing —
    // do NOT fall back to FILE_WRITE here, that would truncate any existing
    // data on a transient open failure.
    File f = LittleFS.open(path, FILE_APPEND);
    if (!f) {
        Serial.printf("[session] appendLine open failed: %s\n", path.c_str());
        return false;
    }
    size_t want = line.length();
    size_t wrote = f.print(line);
    f.close();
    return wrote == want;
}

bool isSafeName(const String& s) {
    if (s.length() == 0) return false;
    if (s.indexOf("..") >= 0) return false;
    for (size_t i = 0; i < s.length(); i++) {
        char c = s.charAt(i);
        bool ok = (c >= 'A' && c <= 'Z') ||
                  (c >= 'a' && c <= 'z') ||
                  (c >= '0' && c <= '9') ||
                  c == '.' || c == '_' || c == '-';
        if (!ok) return false;
    }
    return true;
}

class SessionGuard {
public:
    explicit SessionGuard(SessionStore& s) : s_(s) { s_.lock(); }
    ~SessionGuard() { s_.unlock(); }
private:
    SessionStore& s_;
};

}  // namespace

void SessionStore::ensureMutex() {
    if (!mux_) {
        mux_ = xSemaphoreCreateRecursiveMutex();
    }
}

void SessionStore::lock() {
    ensureMutex();
    if (mux_) xSemaphoreTakeRecursive(mux_, portMAX_DELAY);
}

void SessionStore::unlock() {
    if (mux_) xSemaphoreGiveRecursive(mux_);
}

bool SessionStore::begin() {
    SessionGuard guard(*this);
    if (!LittleFS.begin(true)) {
        return false;
    }
    if (!LittleFS.exists(kSessionDir)) {
        if (!LittleFS.mkdir(kSessionDir)) {
            return false;
        }
    }
    return ensureMetadata();
}

bool SessionStore::reset() {
    SessionGuard guard(*this);
    // Wipe every file under /session/.
    File dir = LittleFS.open(kSessionDir);
    if (!dir || !dir.isDirectory()) {
        // Try to recreate the directory and metadata anyway.
        LittleFS.mkdir(kSessionDir);
        return ensureMetadata();
    }
    File entry = dir.openNextFile();
    while (entry) {
        String name = entry.name();
        // openNextFile() can return either bare names or absolute paths
        // depending on the LittleFS version — normalise to absolute.
        String full = name.startsWith("/") ? name : (String(kSessionDir) + "/" + name);
        entry.close();
        LittleFS.remove(full);
        entry = dir.openNextFile();
    }
    dir.close();
    return ensureMetadata();
}

int SessionStore::allocWorkSlot() {
    SessionGuard guard(*this);
    for (int slot = 0; slot < kMaxWorkSlots; slot++) {
        if (!LittleFS.exists(workPath(slot))) {
            return slot;
        }
    }
    return -1;
}

bool SessionStore::setAlias(int slot, const String& alias) {
    SessionGuard guard(*this);
    if (slot < 0 || slot >= kMaxWorkSlots) return false;
    JsonDocument doc;
    if (!readMetadata(doc)) return false;
    JsonObject aliases = doc["mapAliases"].is<JsonObject>()
                             ? doc["mapAliases"].as<JsonObject>()
                             : doc["mapAliases"].to<JsonObject>();
    String key = String("map") + slot;
    aliases[key] = alias;
    return writeMetadata(doc);
}

int SessionStore::allocObstacleIndex(int parentSlot) {
    SessionGuard guard(*this);
    if (parentSlot < 0 || parentSlot >= kMaxWorkSlots) return -1;
    for (int i = 0; i < kMaxObstacles; i++) {
        if (!LittleFS.exists(obstaclePath(parentSlot, i))) {
            return i;
        }
    }
    return -1;
}

bool SessionStore::listMaps(MapEntry* out, size_t maxEntries, size_t& count) {
    SessionGuard guard(*this);
    count = 0;
    if (!out || maxEntries == 0) return false;

    JsonDocument doc;
    bool metaOk = readMetadata(doc);
    JsonObject aliases;
    if (metaOk && doc["mapAliases"].is<JsonObject>()) {
        aliases = doc["mapAliases"].as<JsonObject>();
    }

    for (int slot = 0; slot < kMaxWorkSlots && count < maxEntries; slot++) {
        String wp = workPath(slot);
        if (!LittleFS.exists(wp)) continue;

        MapEntry& e = out[count];
        e.slot = slot;
        String key = String("map") + slot;
        if (!aliases.isNull() && aliases[key].is<const char*>()) {
            e.alias = String((const char*) aliases[key]);
        } else {
            e.alias = key;
        }
        e.boundaryPoints = countRows(wp);
        e.obstacleCount = 0;
        e.channelCount = 0;
        count++;
    }

    // Scan the session dir once for obstacle/channel files and attribute
    // them to the corresponding slot entry.
    File dir = LittleFS.open(kSessionDir);
    if (dir && dir.isDirectory()) {
        File entry = dir.openNextFile();
        while (entry) {
            String name = entry.name();
            // Normalise to a leaf name.
            int slash = name.lastIndexOf('/');
            if (slash >= 0) name = name.substring(slash + 1);
            entry.close();

            if (name.startsWith("map") && name.length() > 4) {
                int slot = name.charAt(3) - '0';
                if (slot >= 0 && slot < kMaxWorkSlots) {
                    // Find the matching MapEntry (may not exist if work file
                    // is missing — orphans are ignored).
                    for (size_t i = 0; i < count; i++) {
                        if (out[i].slot != slot) continue;
                        if (name.endsWith("_obstacle.csv")) {
                            out[i].obstacleCount++;
                        } else if (name.endsWith("_unicom.csv")) {
                            out[i].channelCount++;
                        }
                        break;
                    }
                }
            }
            entry = dir.openNextFile();
        }
        dir.close();
    }
    return true;
}

bool SessionStore::appendWorkPoint(int slot, double x, double y) {
    SessionGuard guard(*this);
    if (slot < 0 || slot >= kMaxWorkSlots) return false;
    char buf[64];
    snprintf(buf, sizeof(buf), "%.4f,%.4f\n", x, y);
    return appendLine(workPath(slot), buf);
}

bool SessionStore::appendObstaclePoint(int parentSlot, int obstacleIdx, double x, double y) {
    SessionGuard guard(*this);
    if (parentSlot < 0 || parentSlot >= kMaxWorkSlots) return false;
    if (obstacleIdx < 0 || obstacleIdx >= kMaxObstacles) return false;
    char buf[64];
    snprintf(buf, sizeof(buf), "%.4f,%.4f\n", x, y);
    return appendLine(obstaclePath(parentSlot, obstacleIdx), buf);
}

bool SessionStore::appendChannelPoint(int parentSlot, const String& target, double x, double y) {
    SessionGuard guard(*this);
    if (parentSlot < 0 || parentSlot >= kMaxWorkSlots) return false;
    if (!isSafeName(target)) return false;
    char buf[64];
    snprintf(buf, sizeof(buf), "%.4f,%.4f\n", x, y);
    return appendLine(channelPath(parentSlot, target), buf);
}

bool SessionStore::appendRawRow(const String& baseName, unsigned long ts, double lat,
                                 double lng, double alt, int fix, int sats, double hdop) {
    SessionGuard guard(*this);
    // Reject path-traversal attempts before composing a filesystem path.
    if (!isSafeName(baseName)) {
        Serial.printf("[session] appendRawRow rejected baseName: %s\n", baseName.c_str());
        return false;
    }
    String path = rawPath(baseName);
    bool needHeader = !LittleFS.exists(path);
    if (!needHeader) {
        File probe = LittleFS.open(path, FILE_READ);
        if (probe) {
            if (probe.size() == 0) needHeader = true;
            probe.close();
        }
    }
    if (needHeader) {
        if (!appendLine(path, String("ts,lat,lng,alt,fix,sats,hdop\n"))) {
            return false;
        }
    }
    char buf[160];
    snprintf(buf, sizeof(buf), "%lu,%.7f,%.7f,%.3f,%d,%d,%.2f\n",
             ts, lat, lng, alt, fix, sats, hdop);
    return appendLine(path, buf);
}

bool SessionStore::deleteMap(int slot) {
    SessionGuard guard(*this);
    if (slot < 0 || slot >= kMaxWorkSlots) return false;
    String prefix = String("map") + slot;

    File dir = LittleFS.open(kSessionDir);
    if (!dir || !dir.isDirectory()) return false;

    // Collect names first because removing while iterating is fragile on
    // LittleFS — gather, close, then delete.
    std::vector<String> toRemove;
    File entry = dir.openNextFile();
    while (entry) {
        String name = entry.name();
        int slash = name.lastIndexOf('/');
        String leaf = slash >= 0 ? name.substring(slash + 1) : name;
        entry.close();

        // Match map<slot>_*, map<slot>to* — but NOT map<slot+1>... For a
        // single-digit slot the next char after the slot digit determines
        // whether this is a related file.
        if (leaf.startsWith(prefix)) {
            if (leaf.length() == prefix.length()) {
                toRemove.push_back(leaf);
            } else {
                char next = leaf.charAt(prefix.length());
                if (next == '_' || next == 't' || next == '.') {
                    toRemove.push_back(leaf);
                }
            }
        }
        entry = dir.openNextFile();
    }
    dir.close();

    for (const String& leaf : toRemove) {
        LittleFS.remove(String(kSessionDir) + "/" + leaf);
    }

    // Drop the alias entry too so the slot is fully freed.
    JsonDocument doc;
    if (readMetadata(doc)) {
        if (doc["mapAliases"].is<JsonObject>()) {
            JsonObject aliases = doc["mapAliases"].as<JsonObject>();
            String key = String("map") + slot;
            aliases.remove(key);
            writeMetadata(doc);
        }
    }
    return true;
}

bool SessionStore::setOrigin(double lat, double lng, bool overwrite) {
    SessionGuard guard(*this);
    JsonDocument doc;
    if (!readMetadata(doc)) return false;
    if (!overwrite && doc["origin"].is<JsonObject>()) {
        JsonObject existing = doc["origin"].as<JsonObject>();
        if (existing["lat"].is<double>() && existing["lng"].is<double>()) {
            return true;
        }
    }
    JsonObject origin = doc["origin"].is<JsonObject>()
                            ? doc["origin"].as<JsonObject>()
                            : doc["origin"].to<JsonObject>();
    origin["lat"] = lat;
    origin["lng"] = lng;
    return writeMetadata(doc);
}

bool SessionStore::getOrigin(double& lat, double& lng) {
    SessionGuard guard(*this);
    JsonDocument doc;
    if (!readMetadata(doc)) return false;
    if (!doc["origin"].is<JsonObject>()) return false;
    JsonObject origin = doc["origin"].as<JsonObject>();
    if (!origin["lat"].is<double>() || !origin["lng"].is<double>()) return false;
    lat = origin["lat"].as<double>();
    lng = origin["lng"].as<double>();
    return true;
}

bool SessionStore::gpsToLocal(double lat, double lng, double& outX, double& outY) {
    SessionGuard guard(*this);
    double oLat = 0, oLng = 0;
    if (!getOrigin(oLat, oLng)) {
        if (!setOrigin(lat, lng)) return false;
        oLat = lat;
        oLng = lng;
    }
    constexpr double kMetersPerDeg = 111320.0;
    constexpr double kDegToRad = M_PI / 180.0;
    outY = (lat - oLat) * kMetersPerDeg;
    outX = (lng - oLng) * cos(oLat * kDegToRad) * kMetersPerDeg;
    return true;
}

bool SessionStore::localToGps(double x, double y, double& outLat, double& outLng) {
    // No origin yet -> cannot invert. Caller falls back to "not viewable".
    double oLat = 0, oLng = 0;
    if (!getOrigin(oLat, oLng)) return false;
    constexpr double kMetersPerDeg = 111320.0;
    constexpr double kDegToRad = M_PI / 180.0;
    outLat = oLat + (y / kMetersPerDeg);
    double cosLat = cos(oLat * kDegToRad);
    // Guard against the pole edge-case so a bogus origin can't divide by ~0.
    if (cosLat < 1e-6) cosLat = 1e-6;
    outLng = oLng + (x / (cosLat * kMetersPerDeg));
    return true;
}

bool SessionStore::ensureMetadata() {
    if (LittleFS.exists(kMetaFile)) {
        return true;
    }
    JsonDocument doc;
    doc["mapAliases"].to<JsonObject>();
    // origin is intentionally absent until setOrigin() fires on the first
    // captured fix — getOrigin() treats missing/blank as "not set".
    return writeMetadata(doc);
}

bool SessionStore::readMetadata(JsonDocument& doc) {
    if (!LittleFS.exists(kMetaFile)) {
        if (!ensureMetadata()) return false;
    }
    File f = LittleFS.open(kMetaFile, FILE_READ);
    if (!f) return false;
    DeserializationError err = deserializeJson(doc, f);
    f.close();
    if (err) {
        // Corrupted — re-init.
        doc.clear();
        doc["mapAliases"].to<JsonObject>();
        return writeMetadata(doc);
    }
    return true;
}

bool SessionStore::writeMetadata(const JsonDocument& doc) {
    // Atomic-ish write: serialize to a temp file first, then remove+rename.
    // LittleFS doesn't have true atomic rename semantics under power loss,
    // but this is strictly better than truncating kMetaFile up-front and
    // crashing mid-serialize — which would wipe every alias.
    const char* tmpPath = "/session/metadata.json.tmp";
    File f = LittleFS.open(tmpPath, FILE_WRITE);
    if (!f) {
        Serial.println("[session] writeMetadata: tmp open failed");
        return false;
    }
    if (serializeJson(doc, f) == 0) {
        f.close();
        LittleFS.remove(tmpPath);
        Serial.println("[session] writeMetadata: serialize wrote 0 bytes");
        return false;
    }
    f.close();
    if (LittleFS.exists(kMetaFile)) LittleFS.remove(kMetaFile);
    if (!LittleFS.rename(tmpPath, kMetaFile)) {
        Serial.println("[session] writeMetadata: rename failed");
        LittleFS.remove(tmpPath);
        return false;
    }
    return true;
}
