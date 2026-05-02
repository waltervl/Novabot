#pragma once
#include <Arduino.h>
#include <stddef.h>
#include <stdint.h>
#include <freertos/FreeRTOS.h>
#include <freertos/stream_buffer.h>

// GPS data from UM980/UM960 NMEA parsing (diagnostic, parsed alongside RTCM forward)
struct GpsData {
    double latitude;
    double longitude;
    double altitude;
    uint8_t satellites;
    bool valid;             // GNGGA fix quality > 0
    bool rtkFixed;          // Fix quality 4 or 5 (RTK base healthy)
    char lastGngga[128];    // Raw GNGGA sentence for diagnostic / status publish
    size_t lastGnggaLen;
};

// Initialize GPS UART + UM980 base-mode commands + raw stream buffer
void gpsInit();

// Read raw bytes from UM980 UART. Pushes them to the LoRa RTK stream buffer
// AND mirrors the same bytes into outMirror (if non-NULL, up to mirrorSize).
// Returns number of bytes read this call.
//
// Caller (gps task) uses the mirror to fan out the same chunk to MQTT —
// keeps gps_parser free of MQTT dependency.
size_t gpsPumpRtk(uint8_t* outMirror, size_t mirrorSize);

// Drain up to maxLen bytes from RTK stream buffer into out. Returns bytes read.
// Used by LoRa task to chunk into 0x31 frames.
size_t gpsReadRtkChunk(uint8_t* out, size_t maxLen);

// Bytes currently waiting in RTK stream buffer
size_t gpsRtkAvailable();

// Get current GPS data (thread-safe copy)
GpsData gpsGetData();
