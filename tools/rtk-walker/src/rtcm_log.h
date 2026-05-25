// rtcm_log.h — Ring buffer for RTCM3 byte stream, fed by BOTH the LoRa
// path (walker_lora.cpp 0x31 forward) AND the NTRIP path (main.cpp
// ntripPump RTCM forward). The Web UI debug console polls a hex
// snapshot via GET /api/rtcm/log and runs an RTCM3 message decoder
// client-side.
#pragma once

#include <Arduino.h>

// Source tag for each entry — lets the UI show "from LoRa" vs "from
// NTRIP" without keeping a per-byte tag.
enum RtcmLogSource : uint8_t {
    RTCM_SRC_NONE = 0,
    RTCM_SRC_LORA = 1,
    RTCM_SRC_NTRIP = 2,
};

// Append bytes to the ring buffer. Wraps when full. Thread-safe — the
// internal mutex matches the rest of the firmware's pattern.
void rtcmLogAppend(const uint8_t* bytes, size_t n, RtcmLogSource src);

// Snapshot the last `maxBytes` bytes (capped at the buffer size).
// Writes hex characters into `outHex` (must be 2 * maxBytes + 1 bytes).
// Returns the number of bytes actually emitted. `outSeq` receives the
// monotonic byte offset of the newest entry so the client can detect
// gaps / wrap. `outSrc` receives the source of the most recent byte.
size_t rtcmLogSnapshot(char* outHex, size_t maxBytes,
                       uint32_t* outSeq, RtcmLogSource* outSrc);
