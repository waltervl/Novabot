// walker_lora.h — passive LoRa RTCM receiver for the Novabot charger
// broadcast. Snoops 0x31 (RTK_RELAY) frames and writes the payload
// straight to the LC29HDA UART so the GNSS chip gets RTK corrections
// without any internet / WiFi.
#pragma once

#include <Arduino.h>

#ifdef LORA_PRESENT

struct WalkerLoraConfig {
    uint16_t addr;      // network address, default 718 (Novabot factory pair)
    uint8_t  channel;   // LoRa channel within hc..lc, default 17 (≈867 MHz)
    uint8_t  hc;        // scan high bound, default 20
    uint8_t  lc;        // scan low bound, default 14
};

struct WalkerLoraStats {
    bool     moduleReady;        // EBYTE config command ACK'd at boot
    bool     active;             // last valid frame in 10 s
    uint32_t framesReceived;     // valid frames (any cmd byte)
    uint32_t framesRejected;     // bad XOR or unknown cmd
    uint32_t bytesForwarded;     // 0x31 payload bytes pushed to gnssSerial
    uint32_t lastFrameMsAgo;     // ms since last valid 0x31 frame, UINT32_MAX if never
};

// Called once from setup() after Serial.begin / WiFi associated.
// Reads config from NVS (Task 4) and writes it to the E22 via M0/M1=1,1
// command sequence. Returns true if the module ACK'd.
bool walkerLoraSetup(const WalkerLoraConfig& cfg);

// Called from main loop every iteration. Drains UART2 RX, parses
// frames, forwards 0x31 payloads to gnssSerial. Non-blocking.
void walkerLoraPump();

// True if a valid 0x31 frame arrived within the last 10 s. Used by
// ntripPump() to decide whether to push its own RTCM bytes.
bool walkerLoraActive();

// Re-runs the config sequence after the user changes settings via
// the UI. No reboot required.
bool walkerLoraReconfigure(const WalkerLoraConfig& cfg);

// Stats snapshot for the UI / API.
void walkerLoraGetStats(WalkerLoraStats& out);

#else

// Headless / no-LoRa builds: stubs so callers don't need #ifdef everywhere.
struct WalkerLoraConfig { uint16_t addr; uint8_t channel; uint8_t hc; uint8_t lc; };
struct WalkerLoraStats  { bool moduleReady; bool active; uint32_t framesReceived;
                          uint32_t framesRejected; uint32_t bytesForwarded;
                          uint32_t lastFrameMsAgo; };
inline bool walkerLoraSetup(const WalkerLoraConfig&) { return false; }
inline void walkerLoraPump() {}
inline bool walkerLoraActive() { return false; }
inline bool walkerLoraReconfigure(const WalkerLoraConfig&) { return false; }
inline void walkerLoraGetStats(WalkerLoraStats& out) {
    out.moduleReady = false; out.active = false;
    out.framesReceived = 0; out.framesRejected = 0;
    out.bytesForwarded = 0; out.lastFrameMsAgo = UINT32_MAX;
}

#endif
