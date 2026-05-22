// tools/rtk-walker/src/bundle.cpp
//
// Hand-rolled STORED-mode zip writer for the .novabundle export. We don't
// use a third-party zip library because:
//   * STORED-mode is trivially short (no deflate state machine).
//   * Bundles are <1 MB and we don't need compression.
//   * Adding miniz/zlib bloats the ESP32-S3 firmware and pulls in heap-
//     hungry buffer allocators that fight with LittleFS streaming.
//
// Zip layout we produce (PKZIP spec, single disk, no zip64):
//
//   [Local File Header 1][file data 1]
//   ...
//   [Local File Header N][file data N]
//   [Central Directory Header 1]
//   ...
//   [Central Directory Header N]
//   [End of Central Directory Record]
//
// Every header writes little-endian, version 2.0, method 0 (stored). We
// stream each source file twice: once to compute the CRC-32, once to copy
// the bytes into the zip. That keeps RAM use bounded — no whole-file
// buffering, no /tmp staging beyond a 1 KB copy buffer.
#include "bundle.h"

#include <ArduinoJson.h>
#include <LittleFS.h>

#include <vector>

namespace {

constexpr const char* kExportDir  = "/export";
constexpr const char* kBundlePath = "/export/walker.novabundle";
constexpr const char* kSessionDir = "/session";

// Same file-tree we mirror raw into walker/<name> inside the zip.
constexpr const char* kZipWalkerDir = "walker/";

// IEEE 802.3 CRC-32 — required by PKZIP. Table is lazy-initialised on
// first call. Standard reflected polynomial 0xEDB88320.
uint32_t kCrcTable[256];
bool kCrcTableReady = false;

void crcInitTable() {
    for (uint32_t i = 0; i < 256; i++) {
        uint32_t c = i;
        for (int k = 0; k < 8; k++) {
            c = (c & 1u) ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
        }
        kCrcTable[i] = c;
    }
    kCrcTableReady = true;
}

uint32_t crc32Update(uint32_t crc, const uint8_t* buf, size_t len) {
    if (!kCrcTableReady) crcInitTable();
    crc ^= 0xFFFFFFFFu;
    for (size_t i = 0; i < len; i++) {
        crc = kCrcTable[(crc ^ buf[i]) & 0xFFu] ^ (crc >> 8);
    }
    return crc ^ 0xFFFFFFFFu;
}

bool writeBytes(File& f, const void* data, size_t len) {
    if (len == 0) return true;
    size_t wrote = f.write((const uint8_t*) data, len);
    return wrote == len;
}

bool writeLE16(File& f, uint16_t v) {
    uint8_t b[2] = { (uint8_t)(v & 0xFF), (uint8_t)((v >> 8) & 0xFF) };
    return writeBytes(f, b, 2);
}

bool writeLE32(File& f, uint32_t v) {
    uint8_t b[4] = { (uint8_t)(v & 0xFF), (uint8_t)((v >> 8) & 0xFF),
                     (uint8_t)((v >> 16) & 0xFF), (uint8_t)((v >> 24) & 0xFF) };
    return writeBytes(f, b, 4);
}

struct ZipEntry {
    String   name;        // path inside the zip (no leading slash)
    uint32_t crc;
    uint32_t size;        // both compressed and uncompressed (stored mode)
    uint32_t offset;      // offset of local header in the zip
};

// Write a Local File Header for `name`. Caller MUST follow with exactly
// `size` bytes of payload. Returns false on any write short.
bool writeLocalHeader(File& zip, const String& name, uint32_t crc, uint32_t size) {
    if (!writeLE32(zip, 0x04034b50u)) return false;  // local file header sig
    if (!writeLE16(zip, 20))           return false;  // version needed
    if (!writeLE16(zip, 0))            return false;  // general purpose flags
    if (!writeLE16(zip, 0))            return false;  // method = stored
    if (!writeLE16(zip, 0))            return false;  // mod time (0 = midnight)
    if (!writeLE16(zip, 0x21))         return false;  // mod date = 1980-01-01
    if (!writeLE32(zip, crc))          return false;
    if (!writeLE32(zip, size))         return false;  // compressed size
    if (!writeLE32(zip, size))         return false;  // uncompressed size
    if (!writeLE16(zip, (uint16_t) name.length())) return false;
    if (!writeLE16(zip, 0))            return false;  // extra field len
    return writeBytes(zip, name.c_str(), name.length());
}

// Stream-add a file already on LittleFS at `sourcePath` to the zip under
// `nameInZip`. Computes CRC by scanning the file first, then re-opens to
// copy bytes. Two passes use the same 1 KB stack buffer.
bool addFileFromLittleFS(File& zip, const String& nameInZip,
                         const String& sourcePath, std::vector<ZipEntry>& entries) {
    if (!LittleFS.exists(sourcePath)) {
        Serial.printf("[bundle] addFileFromLittleFS: missing %s\n", sourcePath.c_str());
        return false;
    }

    // Pass 1 — CRC + size.
    uint32_t crc = 0;
    uint32_t size = 0;
    {
        File src = LittleFS.open(sourcePath, FILE_READ);
        if (!src) {
            Serial.printf("[bundle] addFileFromLittleFS: open1 failed %s\n",
                          sourcePath.c_str());
            return false;
        }
        uint8_t buf[1024];
        while (src.available()) {
            int n = src.read(buf, sizeof(buf));
            if (n <= 0) break;
            crc = crc32Update(crc, buf, (size_t) n);
            size += (uint32_t) n;
        }
        src.close();
    }

    uint32_t headerOffset = zip.position();
    if (!writeLocalHeader(zip, nameInZip, crc, size)) {
        Serial.println("[bundle] writeLocalHeader failed");
        return false;
    }

    // Pass 2 — copy payload.
    {
        File src = LittleFS.open(sourcePath, FILE_READ);
        if (!src) {
            Serial.printf("[bundle] addFileFromLittleFS: open2 failed %s\n",
                          sourcePath.c_str());
            return false;
        }
        uint8_t buf[1024];
        while (src.available()) {
            int n = src.read(buf, sizeof(buf));
            if (n <= 0) break;
            if (!writeBytes(zip, buf, (size_t) n)) {
                src.close();
                return false;
            }
        }
        src.close();
    }

    entries.push_back({ nameInZip, crc, size, headerOffset });
    return true;
}

// Add a fully in-RAM payload (String/buffer). Use for the small JSON
// manifests — these are bounded by the polygon-point count, which we
// keep modest in practice. For very large JSON, write to a temp file
// and use addFileFromLittleFS instead.
bool addInline(File& zip, const String& nameInZip, const String& content,
               std::vector<ZipEntry>& entries) {
    const uint8_t* p = (const uint8_t*) content.c_str();
    uint32_t size = (uint32_t) content.length();
    uint32_t crc = crc32Update(0, p, size);

    uint32_t headerOffset = zip.position();
    if (!writeLocalHeader(zip, nameInZip, crc, size)) return false;
    if (size > 0 && !writeBytes(zip, p, size))         return false;

    entries.push_back({ nameInZip, crc, size, headerOffset });
    return true;
}

bool writeCentralDirectory(File& zip, const std::vector<ZipEntry>& entries) {
    uint32_t cdStart = zip.position();
    for (const ZipEntry& e : entries) {
        if (!writeLE32(zip, 0x02014b50u)) return false;  // central dir sig
        if (!writeLE16(zip, 20))           return false;  // version made by
        if (!writeLE16(zip, 20))           return false;  // version needed
        if (!writeLE16(zip, 0))            return false;  // flags
        if (!writeLE16(zip, 0))            return false;  // method
        if (!writeLE16(zip, 0))            return false;  // time
        if (!writeLE16(zip, 0x21))         return false;  // date
        if (!writeLE32(zip, e.crc))        return false;
        if (!writeLE32(zip, e.size))       return false;  // compressed
        if (!writeLE32(zip, e.size))       return false;  // uncompressed
        if (!writeLE16(zip, (uint16_t) e.name.length())) return false;
        if (!writeLE16(zip, 0))            return false;  // extra
        if (!writeLE16(zip, 0))            return false;  // comment
        if (!writeLE16(zip, 0))            return false;  // disk number
        if (!writeLE16(zip, 0))            return false;  // internal attrs
        if (!writeLE32(zip, 0))            return false;  // external attrs
        if (!writeLE32(zip, e.offset))     return false;
        if (!writeBytes(zip, e.name.c_str(), e.name.length())) return false;
    }
    uint32_t cdEnd = zip.position();
    uint32_t cdSize = cdEnd - cdStart;

    // End of central directory record.
    if (!writeLE32(zip, 0x06054b50u)) return false;
    if (!writeLE16(zip, 0))            return false;  // disk
    if (!writeLE16(zip, 0))            return false;  // start disk
    if (!writeLE16(zip, (uint16_t) entries.size())) return false;
    if (!writeLE16(zip, (uint16_t) entries.size())) return false;
    if (!writeLE32(zip, cdSize))       return false;
    if (!writeLE32(zip, cdStart))      return false;
    if (!writeLE16(zip, 0))            return false;  // comment len
    return true;
}

// Return the leaf filename of an entry handle. LittleFS varies across
// versions: openNextFile sometimes returns absolute paths, sometimes
// bare names. Normalise to the bare leaf.
String leafName(const String& raw) {
    int slash = raw.lastIndexOf('/');
    return slash >= 0 ? raw.substring(slash + 1) : raw;
}

// Parse "x,y\n"-style CSV file into a JSON array attached to `out`.
// Each emitted element is {x: <num>, y: <num>}. Lines that don't parse
// as two floats are skipped silently — the walker writes well-formed
// rows, so the only reason to bail is a stray empty trailing line.
void csvToPointArray(const String& path, JsonArray out) {
    File f = LittleFS.open(path, FILE_READ);
    if (!f) return;

    String line;
    while (f.available()) {
        char c = (char) f.read();
        if (c == '\n' || c == '\r') {
            if (line.length() > 0) {
                int comma = line.indexOf(',');
                if (comma > 0) {
                    String xs = line.substring(0, comma);
                    String ys = line.substring(comma + 1);
                    xs.trim();
                    ys.trim();
                    if (xs.length() > 0 && ys.length() > 0) {
                        JsonObject p = out.add<JsonObject>();
                        p["x"] = xs.toDouble();
                        p["y"] = ys.toDouble();
                    }
                }
                line = "";
            }
        } else {
            line += c;
        }
    }
    if (line.length() > 0) {
        int comma = line.indexOf(',');
        if (comma > 0) {
            JsonObject p = out.add<JsonObject>();
            p["x"] = line.substring(0, comma).toDouble();
            p["y"] = line.substring(comma + 1).toDouble();
        }
    }
    f.close();
}

// Collect bare leaf names of files under /session/ matching a suffix.
// `prefixOpt` if non-empty limits the match to names that start with it.
std::vector<String> listSessionFiles(const String& prefixOpt, const String& suffix) {
    std::vector<String> result;
    File dir = LittleFS.open(kSessionDir);
    if (!dir || !dir.isDirectory()) return result;
    File entry = dir.openNextFile();
    while (entry) {
        String name = leafName(String(entry.name()));
        entry.close();
        bool prefixOk = prefixOpt.length() == 0 || name.startsWith(prefixOpt);
        if (prefixOk && name.endsWith(suffix)) {
            result.push_back(name);
        }
        entry = dir.openNextFile();
    }
    dir.close();
    return result;
}

// Locate sessionId / walkerId. We don't currently persist these — the
// session metadata only has aliases + origin. So we synthesise:
//   walkerId  — from the WiFi MAC (last 6 hex chars), prefixed with "rtk-"
//   sessionId — millis() since boot, formatted as a hex string. Stable
//               for the duration of the build() call but not persistent.
String synthWalkerId() {
    uint64_t mac = ESP.getEfuseMac();
    char buf[24];
    snprintf(buf, sizeof(buf), "rtk-%06lx", (unsigned long)(mac & 0xFFFFFFu));
    return String(buf);
}

String synthSessionId() {
    char buf[24];
    snprintf(buf, sizeof(buf), "sess-%08lx", (unsigned long) millis());
    return String(buf);
}

}  // namespace

String BundleBuilder::build() {
    if (!LittleFS.begin(true)) {
        Serial.println("[bundle] LittleFS begin failed");
        return String();
    }
    if (!LittleFS.exists(kExportDir)) {
        if (!LittleFS.mkdir(kExportDir)) {
            Serial.println("[bundle] mkdir /export failed");
            return String();
        }
    }
    if (LittleFS.exists(kBundlePath)) {
        LittleFS.remove(kBundlePath);
    }

    // Enumerate work maps + aliases once; reused by metadata, polygons,
    // obstacles, unicom.
    MapEntry mapEntries[3];
    size_t mapCount = 0;
    sess_.listMaps(mapEntries, 3, mapCount);

    double originLat = 0, originLng = 0;
    bool hasOrigin = sess_.getOrigin(originLat, originLng);

    // Bounds tracking (optional) — populated as we walk the work CSVs.
    bool   haveBounds = false;
    double minX = 0, maxX = 0, minY = 0, maxY = 0;

    // ── Build polygons.json (and bounds) ────────────────────────────
    String polygonsJson;
    {
        JsonDocument doc;
        JsonArray arr = doc.to<JsonArray>();
        for (size_t i = 0; i < mapCount; i++) {
            int slot = mapEntries[i].slot;
            String path = String(kSessionDir) + "/map" + slot + "_work.csv";
            if (!LittleFS.exists(path)) continue;
            JsonObject obj = arr.add<JsonObject>();
            obj["name"] = String("map") + slot;
            JsonArray pts = obj["points"].to<JsonArray>();
            csvToPointArray(path, pts);
            // Walk the just-added points to update bounds.
            for (JsonObject p : pts) {
                double x = p["x"].as<double>();
                double y = p["y"].as<double>();
                if (!haveBounds) {
                    minX = maxX = x;
                    minY = maxY = y;
                    haveBounds = true;
                } else {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        serializeJson(doc, polygonsJson);
    }

    // ── Build obstacles.json ────────────────────────────────────────
    String obstaclesJson;
    {
        JsonDocument doc;
        JsonArray arr = doc.to<JsonArray>();
        // Iterate the session dir for *_obstacle.csv files and group by
        // slot so the order is stable (slot ascending, then index).
        for (size_t i = 0; i < mapCount; i++) {
            int slot = mapEntries[i].slot;
            String prefix = String("map") + slot + "_";
            std::vector<String> files = listSessionFiles(prefix, "_obstacle.csv");
            // Sort lexicographically — file names are mapN_<i>_obstacle.csv
            // so this also sorts by index numerically up to 9.
            std::sort(files.begin(), files.end());
            for (const String& leaf : files) {
                JsonObject obj = arr.add<JsonObject>();
                String nameNoExt = leaf.substring(0, leaf.length() - 4);  // strip .csv
                obj["name"] = nameNoExt;
                JsonArray pts = obj["points"].to<JsonArray>();
                csvToPointArray(String(kSessionDir) + "/" + leaf, pts);
            }
        }
        serializeJson(doc, obstaclesJson);
    }

    // ── Build unicom.json ───────────────────────────────────────────
    String unicomJson;
    {
        JsonDocument doc;
        JsonArray arr = doc.to<JsonArray>();
        for (size_t i = 0; i < mapCount; i++) {
            int slot = mapEntries[i].slot;
            String prefix = String("map") + slot + "to";
            std::vector<String> files = listSessionFiles(prefix, "_unicom.csv");
            std::sort(files.begin(), files.end());
            for (const String& leaf : files) {
                JsonObject obj = arr.add<JsonObject>();
                String nameNoExt = leaf.substring(0, leaf.length() - 4);
                obj["name"] = nameNoExt;
                JsonArray pts = obj["points"].to<JsonArray>();
                csvToPointArray(String(kSessionDir) + "/" + leaf, pts);
            }
        }
        serializeJson(doc, unicomJson);
    }

    // ── Build metadata.json ─────────────────────────────────────────
    String metadataJson;
    {
        JsonDocument doc;
        doc["schemaVersion"] = 1;
        doc["sourceType"]    = "walker";
        doc["walkerId"]      = synthWalkerId();
        doc["sessionId"]     = synthSessionId();
        // exportedAt — wall-clock ISO 8601 if NTP synced, else millis()-derived.
        {
            time_t now = time(nullptr);
            if (now > 1700000000) {  // anything past ~2023 means NTP fired
                struct tm tmv;
                gmtime_r(&now, &tmv);
                char ts[32];
                strftime(ts, sizeof(ts), "%Y-%m-%dT%H:%M:%SZ", &tmv);
                doc["exportedAt"] = String(ts);
            } else {
                char ts[32];
                snprintf(ts, sizeof(ts), "boot+%lums", (unsigned long) millis());
                doc["exportedAt"] = String(ts);
            }
        }

        JsonObject src = doc["sourceCharger"].to<JsonObject>();
        if (hasOrigin) {
            src["lat"] = originLat;
            src["lng"] = originLng;
        } else {
            src["lat"] = nullptr;
            src["lng"] = nullptr;
        }
        src["rtkQualityAtExport"] = nullptr;

        JsonObject anchor = doc["polygonOriginAnchor"].to<JsonObject>();
        anchor["name"]    = "session_start";
        anchor["x"]       = 0;
        anchor["y"]       = 0;
        anchor["comment"] = "Walker session origin (first GPS fix). Server "
                            "must re-anchor onto the real charging pose at "
                            "import time.";

        JsonObject pose = doc["originalChargingPose"].to<JsonObject>();
        pose["x"]           = 0;
        pose["y"]           = 0;
        pose["orientation"] = 0;

        JsonArray names = doc["workMapNames"].to<JsonArray>();
        for (size_t i = 0; i < mapCount; i++) {
            names.add(String("map") + mapEntries[i].slot);
        }

        JsonObject aliases = doc["userAliases"].to<JsonObject>();
        for (size_t i = 0; i < mapCount; i++) {
            String key = String("map") + mapEntries[i].slot;
            // Suppress trivial aliases (where alias == key) to keep the
            // manifest lean — server side treats absent entry as default.
            if (mapEntries[i].alias.length() > 0 && mapEntries[i].alias != key) {
                aliases[key] = mapEntries[i].alias;
            }
        }

        if (haveBounds) {
            JsonObject bounds = doc["boundsM"].to<JsonObject>();
            bounds["minX"] = minX;
            bounds["maxX"] = maxX;
            bounds["minY"] = minY;
            bounds["maxY"] = maxY;
        }

        serializeJson(doc, metadataJson);
    }

    // ── Open the zip and stream entries ─────────────────────────────
    File zip = LittleFS.open(kBundlePath, FILE_WRITE);
    if (!zip) {
        Serial.println("[bundle] open zip for write failed");
        return String();
    }

    std::vector<ZipEntry> entries;
    entries.reserve(8 + mapCount * 4);

    bool ok = true;
    ok = ok && addInline(zip, "metadata.json",  metadataJson,  entries);
    ok = ok && addInline(zip, "polygons.json",  polygonsJson,  entries);
    ok = ok && addInline(zip, "obstacles.json", obstaclesJson, entries);
    ok = ok && addInline(zip, "unicom.json",    unicomJson,    entries);

    // Mirror every CSV under /session/ into walker/<leaf>.
    if (ok) {
        File dir = LittleFS.open(kSessionDir);
        if (dir && dir.isDirectory()) {
            std::vector<String> csvNames;
            File entry = dir.openNextFile();
            while (entry) {
                String name = leafName(String(entry.name()));
                bool isDir = entry.isDirectory();
                entry.close();
                if (!isDir && name.endsWith(".csv")) {
                    csvNames.push_back(name);
                }
                entry = dir.openNextFile();
            }
            dir.close();
            std::sort(csvNames.begin(), csvNames.end());
            for (const String& leaf : csvNames) {
                String src = String(kSessionDir) + "/" + leaf;
                String inZip = String(kZipWalkerDir) + leaf;
                if (!addFileFromLittleFS(zip, inZip, src, entries)) {
                    ok = false;
                    break;
                }
            }
        }
    }

    if (ok) ok = writeCentralDirectory(zip, entries);
    zip.close();

    if (!ok) {
        Serial.println("[bundle] build failed — removing partial zip");
        LittleFS.remove(kBundlePath);
        return String();
    }

    Serial.printf("[bundle] wrote %s (%u entries)\n", kBundlePath, (unsigned) entries.size());
    return String(kBundlePath);
}
