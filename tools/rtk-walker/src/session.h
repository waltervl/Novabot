// tools/rtk-walker/src/session.h
//
// SessionStore — LittleFS-backed multi-file session manager that mirrors the
// Novabot mower's csv_file/ naming convention so server-side imports can map
// a walker session 1:1 onto a mower work directory.
//
// Layout under /session/:
//   metadata.json                       — mapAliases + origin lat/lng
//   mapN_work.csv                       — boundary points (x,y), N in 0..2
//   mapN_<i>_obstacle.csv               — obstacle ring i for parent N
//   mapNto<target>_unicom.csv           — channel from N to "charge" or "mapX"
//   <base>.raw                          — companion full GPS telemetry CSV
//
// Coordinates are local meters with the first captured GPS fix taken as the
// origin (cos-lat projection, identical to the conversion used elsewhere in
// the codebase).
#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

struct MapEntry {
    int slot;            // 0..2 (max 3 work maps)
    String alias;        // user-friendly name
    int boundaryPoints;  // row count in mapN_work.csv
    int obstacleCount;
    int channelCount;
};

class SessionStore {
public:
    bool begin();
    void lock();
    void unlock();
    bool reset();
    int allocWorkSlot();
    bool setAlias(int slot, const String& alias);
    int allocObstacleIndex(int parentSlot);
    bool listMaps(MapEntry* out, size_t maxEntries, size_t& count);
    bool appendWorkPoint(int slot, double x, double y);
    bool appendObstaclePoint(int parentSlot, int obstacleIdx, double x, double y);
    bool appendChannelPoint(int parentSlot, const String& target, double x, double y);
    bool appendRawRow(const String& baseName, unsigned long ts, double lat, double lng,
                      double alt, int fix, int sats, double hdop);
    bool deleteMap(int slot);
    bool setOrigin(double lat, double lng, bool overwrite = false);
    bool getOrigin(double& lat, double& lng);
    bool gpsToLocal(double lat, double lng, double& outX, double& outY);
    // Inverse of gpsToLocal: convert stored x,y in local meters back to a
    // lat/lng pair using the saved origin. Returns false when the origin
    // has not been set yet (no recording has ever fired onFix). Use this
    // on the playback side so the map list can render saved polygons
    // through the same lat/lng-based renderer the live track uses.
    bool localToGps(double x, double y, double& outLat, double& outLng);

private:
    static constexpr const char* kSessionDir = "/session";
    static constexpr const char* kMetaFile = "/session/metadata.json";
    SemaphoreHandle_t mux_ = nullptr;
    void ensureMutex();
    bool ensureMetadata();
    bool readMetadata(JsonDocument& doc);
    bool writeMetadata(const JsonDocument& doc);
};
