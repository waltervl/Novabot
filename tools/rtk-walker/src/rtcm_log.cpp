// rtcm_log.cpp — see header.
#include "rtcm_log.h"
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

#define RTCM_LOG_SIZE 4096   // raw bytes kept in the ring

static uint8_t g_buf[RTCM_LOG_SIZE];
static uint32_t g_head = 0;          // next write index
static uint32_t g_totalBytes = 0;    // monotonic byte counter (since boot)
static RtcmLogSource g_lastSrc = RTCM_SRC_NONE;
static SemaphoreHandle_t g_mux = nullptr;

static void ensureMux() {
    if (!g_mux) g_mux = xSemaphoreCreateRecursiveMutex();
}

void rtcmLogAppend(const uint8_t* bytes, size_t n, RtcmLogSource src) {
    if (n == 0 || !bytes) return;
    ensureMux();
    xSemaphoreTakeRecursive(g_mux, portMAX_DELAY);
    for (size_t i = 0; i < n; i++) {
        g_buf[g_head] = bytes[i];
        g_head = (g_head + 1) % RTCM_LOG_SIZE;
    }
    g_totalBytes += n;
    g_lastSrc = src;
    xSemaphoreGiveRecursive(g_mux);
}

size_t rtcmLogSnapshot(char* outHex, size_t maxBytes,
                       uint32_t* outSeq, RtcmLogSource* outSrc) {
    if (!outHex || maxBytes == 0) return 0;
    ensureMux();
    xSemaphoreTakeRecursive(g_mux, portMAX_DELAY);

    size_t avail = (g_totalBytes < RTCM_LOG_SIZE) ? g_totalBytes : RTCM_LOG_SIZE;
    size_t want  = (maxBytes < avail) ? maxBytes : avail;
    // Read backwards from `g_head`, wrapping.
    size_t start = (g_head + RTCM_LOG_SIZE - want) % RTCM_LOG_SIZE;
    static const char kHex[] = "0123456789abcdef";
    size_t outIdx = 0;
    for (size_t i = 0; i < want; i++) {
        uint8_t b = g_buf[(start + i) % RTCM_LOG_SIZE];
        outHex[outIdx++] = kHex[(b >> 4) & 0x0F];
        outHex[outIdx++] = kHex[b & 0x0F];
    }
    outHex[outIdx] = '\0';
    if (outSeq) *outSeq = g_totalBytes;
    if (outSrc) *outSrc = g_lastSrc;
    xSemaphoreGiveRecursive(g_mux);
    return want;
}
