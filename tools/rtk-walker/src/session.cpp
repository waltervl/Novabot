// tools/rtk-walker/src/session.cpp
//
// Implementation of SessionStore — see session.h for the layout contract.
#include "session.h"

#include <math.h>

#include <vector>

namespace {

constexpr int kMaxWorkSlots = 3;
constexpr int kMaxObstacles = 32;

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
    int rows = 0;
    while (f.available()) {
        if (f.read() == '\n') rows++;
    }
    f.close();
    return rows;
}

bool appendLine(const String& path, const String& line) {
    File f = LittleFS.open(path, FILE_APPEND);
    if (!f) {
        // Try create.
        f = LittleFS.open(path, FILE_WRITE);
        if (!f) return false;
    }
    size_t want = line.length();
    size_t wrote = f.print(line);
    f.close();
    return wrote == want;
}

}  // namespace

bool SessionStore::begin() {
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
    for (int slot = 0; slot < kMaxWorkSlots; slot++) {
        if (!LittleFS.exists(workPath(slot))) {
            return slot;
        }
    }
    return -1;
}

bool SessionStore::setAlias(int slot, const String& alias) {
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
    if (parentSlot < 0 || parentSlot >= kMaxWorkSlots) return -1;
    for (int i = 0; i < kMaxObstacles; i++) {
        if (!LittleFS.exists(obstaclePath(parentSlot, i))) {
            return i;
        }
    }
    return -1;
}

bool SessionStore::listMaps(MapEntry* out, size_t maxEntries, size_t& count) {
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
    if (slot < 0 || slot >= kMaxWorkSlots) return false;
    char buf[64];
    snprintf(buf, sizeof(buf), "%.4f,%.4f\n", x, y);
    return appendLine(workPath(slot), buf);
}

bool SessionStore::appendObstaclePoint(int parentSlot, int obstacleIdx, double x, double y) {
    if (parentSlot < 0 || parentSlot >= kMaxWorkSlots) return false;
    if (obstacleIdx < 0 || obstacleIdx >= kMaxObstacles) return false;
    char buf[64];
    snprintf(buf, sizeof(buf), "%.4f,%.4f\n", x, y);
    return appendLine(obstaclePath(parentSlot, obstacleIdx), buf);
}

bool SessionStore::appendChannelPoint(int parentSlot, const String& target, double x, double y) {
    if (parentSlot < 0 || parentSlot >= kMaxWorkSlots) return false;
    if (target.length() == 0) return false;
    char buf[64];
    snprintf(buf, sizeof(buf), "%.4f,%.4f\n", x, y);
    return appendLine(channelPath(parentSlot, target), buf);
}

bool SessionStore::appendRawRow(const String& baseName, unsigned long ts, double lat,
                                 double lng, double alt, int fix, int sats, double hdop) {
    if (baseName.length() == 0) return false;
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

bool SessionStore::setOrigin(double lat, double lng) {
    JsonDocument doc;
    if (!readMetadata(doc)) return false;
    JsonObject origin = doc["origin"].is<JsonObject>()
                            ? doc["origin"].as<JsonObject>()
                            : doc["origin"].to<JsonObject>();
    origin["lat"] = lat;
    origin["lng"] = lng;
    return writeMetadata(doc);
}

bool SessionStore::getOrigin(double& lat, double& lng) {
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
    File f = LittleFS.open(kMetaFile, FILE_WRITE);
    if (!f) return false;
    size_t wrote = serializeJson(doc, f);
    f.close();
    return wrote > 0;
}
