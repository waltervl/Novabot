// walker_lora.h — passive LoRa RTCM receiver for the Novabot charger
// broadcast. Snoops 0x31 (RTK_RELAY) frames and enqueues the payload
// for the LC29HDA UART so the GNSS chip gets RTK corrections without
// any internet / WiFi.
#pragma once

#include <Arduino.h>

#ifdef LORA_PRESENT

struct WalkerLoraConfig {
    uint16_t addr;      // network address, default 718 (Novabot factory pair)
    uint8_t  channel;   // LoRa channel within hc..lc, default 17 (≈867 MHz)
    uint8_t  hc;        // scan high bound, default 20
    uint8_t  lc;        // scan low bound, default 14
    uint8_t  packetLenCode; // EBYTE AT+PACKET code: 0=240, 1=128, 2=64, 3=32
    uint8_t  airRateCode;   // EBYTE AT+RATE code. Stock charger uses 7 (=62.5 kbps).
};

struct WalkerLoraStats {
    bool     moduleReady;        // EBYTE config command ACK'd at boot
    bool     active;             // last valid frame in 10 s
    uint32_t framesReceived;     // valid frames (any cmd byte)
    uint32_t framesRejected;     // bad XOR or unknown cmd
    uint32_t bytesForwarded;     // 0x31 payload bytes pushed to gnssSerial
    uint32_t rawBytesIn;         // every byte read off UART2, pre-framing
    uint32_t lastFrameMsAgo;     // ms since last valid 0x31 frame, UINT32_MAX if never
    uint32_t rtcmMessages;       // complete CRC-valid RTCM3 messages observed
    uint32_t rtcmCrcRejected;    // complete RTCM3 candidates rejected by CRC
    uint32_t lastRtcmMsAgo;      // ms since last CRC-valid RTCM3 message
    uint16_t lastRtcmType;       // RTCM3 message type of the most recent valid frame
};

// Called once from setup() after Serial.begin / WiFi associated.
// Reads config from NVS (Task 4) and writes it to the E22 in config mode
// (M1=1, M0=0) via the 0xC0 command. Returns true if the module ACK'd.
bool walkerLoraSetup(const WalkerLoraConfig& cfg);

// Called from main loop every iteration. Drains UART2 RX, parses frames,
// and enqueues 0x31 payloads for the GNSS TX owner. Non-blocking.
void walkerLoraPump();

// True if a valid 0x31 frame arrived within the last 10 s. Used by
// ntripPump() to decide whether to push its own RTCM bytes.
bool walkerLoraActive();

// Re-runs the config sequence after the user changes settings via
// the UI. No reboot required.
bool walkerLoraReconfigure(const WalkerLoraConfig& cfg);

// Stats snapshot for the UI / API.
void walkerLoraGetStats(WalkerLoraStats& out);

// Formats the most recent raw UART2 bytes (pre-framing) as a space-free
// hex string into `out`. Returns the number of hex chars written (0 if no
// bytes seen yet). Bench diagnostic: lets the serial console show whether
// anything at all is arriving on the LoRa UART.
size_t walkerLoraGetRawTailHex(char* out, size_t outCap);

#else

// Headless / no-LoRa builds: stubs so callers don't need #ifdef everywhere.
struct WalkerLoraConfig {
    uint16_t addr;
    uint8_t channel;
    uint8_t hc;
    uint8_t lc;
    uint8_t packetLenCode;
    uint8_t airRateCode;
};
struct WalkerLoraStats  { bool moduleReady; bool active; uint32_t framesReceived;
                          uint32_t framesRejected; uint32_t bytesForwarded;
                          uint32_t rawBytesIn; uint32_t lastFrameMsAgo;
                          uint32_t rtcmMessages; uint32_t rtcmCrcRejected;
                          uint32_t lastRtcmMsAgo; uint16_t lastRtcmType; };
inline bool walkerLoraSetup(const WalkerLoraConfig&) { return false; }
inline void walkerLoraPump() {}
inline bool walkerLoraActive() { return false; }
inline bool walkerLoraReconfigure(const WalkerLoraConfig&) { return false; }
inline void walkerLoraGetStats(WalkerLoraStats& out) {
    out.moduleReady = false; out.active = false;
    out.framesReceived = 0; out.framesRejected = 0;
    out.bytesForwarded = 0; out.rawBytesIn = 0; out.lastFrameMsAgo = UINT32_MAX;
    out.rtcmMessages = 0; out.rtcmCrcRejected = 0;
    out.lastRtcmMsAgo = UINT32_MAX; out.lastRtcmType = 0;
}
inline size_t walkerLoraGetRawTailHex(char* out, size_t outCap) {
    if (out && outCap) out[0] = '\0';
    return 0;
}

#endif
