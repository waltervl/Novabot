#include "gps_parser.h"
#include "config.h"
#include <TinyGPSPlus.h>

static TinyGPSPlus gps;
static GpsData currentData;
static SemaphoreHandle_t gpsMutex = NULL;
static StreamBufferHandle_t rtkStream = NULL;

// Diagnostic GNGGA capture buffer
static char lineBuf[256];
static size_t lineIdx = 0;
static bool inGngga = false;

// Raw read scratch (~50 Hz × 256B max ≈ 12.5 KB/s peak — well within UART throughput)
static uint8_t rawBuf[256];

// ── UM980 Base-Mode Configuration ───────────────────────────────────────────
// Sends Unicore command set on UART2 to configure UM980 as RTK base station.
// Commands accepted on COM1 by default; UM980 echoes "$command,...,response: OK*XX".
//
// MODE BASE TIME 60 1.5 2.5 — auto-survey base, 60s, 1.5m H tolerance, 2.5m V tolerance
// CONFIG SBAS DISABLE       — base must not use SBAS corrections
// RTCM10{06,33,74,84,94,124} — emit MSM4 RTCM3 messages on COM1 at 1 Hz (1006/1033 every 5s)
// GNGGA COM1 1              — keep GNGGA NMEA at 1 Hz for diagnostic / status publish
// SAVECONFIG                — persist to flash so settings survive reboot
//
// Stock charger v0.4.0 sends these via the rtk_config_task state machine
// (see research/documents/charger-rtcm-flow-analysis.md).
static const char* UM980_INIT_CMDS[] = {
    "UNLOGALL COM1",
    "MODE BASE TIME 60 1.5 2.5",
    "CONFIG SBAS DISABLE",
    "RTCM1006 COM1 5",
    "RTCM1033 COM1 5",
    "RTCM1074 COM1 1",
    "RTCM1084 COM1 1",
    "RTCM1094 COM1 1",
    "RTCM1124 COM1 1",
    "GNGGA COM1 1",
    "SAVECONFIG",
    NULL,
};

static void um980SendInit() {
    Serial.println("[GPS] Sending UM980 base-mode init...");
    for (size_t i = 0; UM980_INIT_CMDS[i] != NULL; i++) {
        GPS_SERIAL.print(UM980_INIT_CMDS[i]);
        GPS_SERIAL.print("\r\n");
        Serial.printf("[GPS]  → %s\n", UM980_INIT_CMDS[i]);
        // UM980 needs ~100 ms between commands to ack
        vTaskDelay(pdMS_TO_TICKS(150));
        // Drain ack/echo bytes so they don't pollute the RTCM stream during init
        while (GPS_SERIAL.available()) GPS_SERIAL.read();
    }
    Serial.println("[GPS] UM980 init complete");
}

void gpsInit() {
    GPS_SERIAL.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
    gpsMutex = xSemaphoreCreateMutex();
    rtkStream = xStreamBufferCreate(RTK_STREAM_BUF_SIZE, 1);
    memset(&currentData, 0, sizeof(currentData));

    // Allow UM980 to settle after power-on
    vTaskDelay(pdMS_TO_TICKS(500));
    um980SendInit();

    Serial.println("[GPS] Initialized UART2 + RTK stream buffer");
}

// Parse a single byte for GNGGA diagnostic (not on critical path; RTCM forward is)
static void parseGnggaByte(char c) {
    gps.encode(c);

    if (c == '$') {
        lineIdx = 0;
        lineBuf[lineIdx++] = c;
        inGngga = false;
        return;
    }

    if (lineIdx == 0) return;
    if (lineIdx >= sizeof(lineBuf) - 1) {
        lineIdx = 0;
        return;
    }

    lineBuf[lineIdx++] = c;

    if (lineIdx == 6) {
        inGngga = (memcmp(lineBuf + 1, "GNGGA", 5) == 0);
    }

    if (c != '\n' && c != '\r') return;

    if (inGngga && lineIdx > 10) {
        lineBuf[lineIdx] = '\0';

        if (xSemaphoreTake(gpsMutex, pdMS_TO_TICKS(50))) {
            currentData.latitude = gps.location.lat();
            currentData.longitude = gps.location.lng();
            currentData.altitude = gps.altitude.meters();
            currentData.satellites = gps.satellites.value();
            currentData.valid = gps.location.isValid();

            // Field 6 of GNGGA = fix quality (0=invalid, 1=GPS, 4=RTK fixed, 5=RTK float)
            int commaCount = 0;
            for (size_t i = 0; i < lineIdx && commaCount < 6; i++) {
                if (lineBuf[i] == ',') commaCount++;
                if (commaCount == 6) {
                    int quality = lineBuf[i + 1] - '0';
                    currentData.rtkFixed = (quality == 4 || quality == 5);
                    break;
                }
            }

            size_t copyLen = lineIdx;
            if (copyLen >= sizeof(currentData.lastGngga))
                copyLen = sizeof(currentData.lastGngga) - 1;
            memcpy(currentData.lastGngga, lineBuf, copyLen);
            currentData.lastGngga[copyLen] = '\0';
            currentData.lastGnggaLen = copyLen;

            xSemaphoreGive(gpsMutex);
        }
    }

    lineIdx = 0;
    inGngga = false;
}

size_t gpsPumpRtk(uint8_t* outMirror, size_t mirrorSize) {
    if (!rtkStream) return 0;

    size_t total = 0;
    while (GPS_SERIAL.available() && total < sizeof(rawBuf)) {
        rawBuf[total++] = (uint8_t)GPS_SERIAL.read();
    }
    if (total == 0) return 0;

    // Push raw bytes (RTCM3 + NMEA mixed) to stream buffer for LoRa drain.
    // Drop on overflow rather than block — RTCM is realtime, stale corrections useless.
    xStreamBufferSend(rtkStream, rawBuf, total, 0);

    // Mirror the same bytes for the caller's secondary consumer (MQTT).
    if (outMirror && mirrorSize > 0) {
        size_t copyLen = total < mirrorSize ? total : mirrorSize;
        memcpy(outMirror, rawBuf, copyLen);
    }

    // Parse GNGGA in-place for diagnostic data (RTK fix quality, sat count, etc.)
    for (size_t i = 0; i < total; i++) {
        parseGnggaByte((char)rawBuf[i]);
    }

    return total;
}

size_t gpsReadRtkChunk(uint8_t* out, size_t maxLen) {
    if (!rtkStream || !out || maxLen == 0) return 0;
    return xStreamBufferReceive(rtkStream, out, maxLen, 0);
}

size_t gpsRtkAvailable() {
    if (!rtkStream) return 0;
    return xStreamBufferBytesAvailable(rtkStream);
}

GpsData gpsGetData() {
    GpsData copy;
    if (gpsMutex && xSemaphoreTake(gpsMutex, pdMS_TO_TICKS(50))) {
        copy = currentData;
        xSemaphoreGive(gpsMutex);
    } else {
        memset(&copy, 0, sizeof(copy));
    }
    return copy;
}
