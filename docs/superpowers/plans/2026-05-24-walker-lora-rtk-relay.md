# Walker LoRa RTK Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a passive E22-900T22S LoRa receiver to the walker that snoops the Novabot charger's RTCM-over-LoRa broadcast and feeds RTK corrections into the LC29HDA, with NTRIP/WiFi as a 10-second-timeout fallback.

**Architecture:** New `walker_lora.{h,cpp}` parses incoming LoRa frames matching `[0x02 0x02][addr][len+1][0x31][payload][XOR][0x03 0x03]` and writes the payload directly to `gnssSerial` (the same UART that NTRIP feeds today). `ntripPump()` gains a guard that drops its RTCM writes while `walkerLoraActive() == true`. A ring buffer (`rtcm_log.{h,cpp}`) records bytes from both sources for the new Web UI debug console.

**Tech Stack:** ESP32-S3 + Arduino framework, PlatformIO, EBYTE E22-900T22S (SX1262), LVGL 8.4, Arduino WebServer, Preferences NVS, ArduinoJson.

**Spec:** `docs/superpowers/specs/2026-05-24-walker-lora-rtk-relay.md`

---

## Pre-flight

Verify the working tree builds clean before any task. From the repo root:

```bash
cd tools/rtk-walker && /Users/rvbcrs/.platformio/penv/bin/pio run -e jc3248w535-walker
```

Expected: `[SUCCESS]`, RAM ≈ 73.3 %, Flash ≈ 24.0 %.

Branch: stay on `fix/rtk-walker-review-2026-05`.

---

### Task 1: Pin defines + UART2 init (no frame parsing yet)

**Files:**
- Modify: `tools/rtk-walker/platformio.ini`
- Modify: `tools/rtk-walker/src/main.cpp`

- [ ] **Step 1: Add LoRa pin macros to platformio.ini**

Modify the `[env:jc3248w535-walker]` build_flags block. Add at the end of the block, just before the `BAT_ADC` comment:

```ini
    ; ── E22-900T22S LoRa receiver for RTK relay from charger ───────────
    -D LORA_PRESENT
    -D LORA_RX_PIN=42
    -D LORA_TX_PIN=41
    -D LORA_M0_PIN=44
    -D LORA_M1_PIN=11
```

- [ ] **Step 2: Add the same block to the headless `[env:esp32s3-walker]` environment build_flags**

Same five lines. The headless target supports LoRa too — it's just web-only.

- [ ] **Step 3: Declare a UART2 HardwareSerial in main.cpp**

Find the line `HardwareSerial gnssSerial(1);` (near line 88). Add immediately after:

```cpp
#ifdef LORA_PRESENT
HardwareSerial loraSerial(2);
#endif
```

- [ ] **Step 4: Init the UART + pin modes in setup()**

Find the existing `gnssSerial.begin(...)` call. Add immediately after:

```cpp
#ifdef LORA_PRESENT
  // EBYTE E22-900T22S default UART is 9600 8N1. Mode pins start in
  // config mode (1,1) — Task 3 will lower them to data mode (0,0)
  // after the module config command lands.
  pinMode(LORA_M0_PIN, OUTPUT);
  pinMode(LORA_M1_PIN, OUTPUT);
  digitalWrite(LORA_M0_PIN, HIGH);
  digitalWrite(LORA_M1_PIN, HIGH);
  loraSerial.begin(9600, SERIAL_8N1, LORA_RX_PIN, LORA_TX_PIN);
  weblogf("[lora] UART2 + pins initialised (RX=%d TX=%d M0=%d M1=%d)\n",
          LORA_RX_PIN, LORA_TX_PIN, LORA_M0_PIN, LORA_M1_PIN);
#endif
```

- [ ] **Step 5: Build verify**

```bash
cd /Users/rvbcrs/GitHub/Novabot/tools/rtk-walker && /Users/rvbcrs/.platformio/penv/bin/pio run -e jc3248w535-walker -e esp32s3-walker
```

Expected: both environments `[SUCCESS]`, RAM unchanged from 73.3 %.

- [ ] **Step 6: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add tools/rtk-walker/platformio.ini tools/rtk-walker/src/main.cpp
git commit -m "feat(walker-lora): wire up E22 UART2 + mode pins (config mode at boot)"
```

---

### Task 2: walker_lora module skeleton + EBYTE config command

**Files:**
- Create: `tools/rtk-walker/src/walker_lora.h`
- Create: `tools/rtk-walker/src/walker_lora.cpp`
- Modify: `tools/rtk-walker/src/main.cpp`

- [ ] **Step 1: Create walker_lora.h with the public API**

Write the full file:

```cpp
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
```

- [ ] **Step 2: Create walker_lora.cpp with the config-command implementation only**

Write the full file. Frame parsing comes in Task 3 — this task gets the config command working first so we can verify the module ACK's.

```cpp
// walker_lora.cpp — EBYTE E22-900T22S configuration sequence + (Task 3)
// frame parsing. We're a passive listener; never transmit user data.
#include "walker_lora.h"

#ifdef LORA_PRESENT

#include "walker_api.h"  // gnssSerial declared in main.cpp via this header? no — extern

extern HardwareSerial gnssSerial;
extern HardwareSerial loraSerial;

// Forward to main.cpp's logger so timing aligns with the rest of the
// serial output. weblogf is declared in main.cpp as static — instead
// we just use Serial.printf here; the user has serial access during
// bench bring-up which is the main debugging surface anyway.
static void loraLogf(const char* fmt, ...) {
    char buf[160];
    va_list ap;
    va_start(ap, fmt);
    int n = vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    if (n < 0) return;
    Serial.print("[lora] ");
    Serial.print(buf);
}

// Build + send the 11-byte EBYTE permanent-save command. Returns true
// if the module echoed back a `0xC1` ACK with matching ADDH/ADDL/CHAN.
// REG0 = 0x62 (UART 9600 8N1, air 2.4 kbps). REG1 = 0x00 (240 B sub-
// packet, 22 dBm, no ambient RSSI). REG2 = channel. REG3 = 0x00 (no
// LBT, transparent mode). NETID = 0 (we don't use netid).
//
// Per EBYTE E22-900T22S datasheet section 5.3 "Register Definition".
// Send 0xC0 = permanent save (NVS), 0xC2 = until power-cycle.
static bool ebyteWriteConfig(const WalkerLoraConfig& cfg) {
    uint8_t addH = (cfg.addr >> 8) & 0xFF;
    uint8_t addL = cfg.addr & 0xFF;
    uint8_t pkt[] = {
        0xC0,        // permanent save
        0x00,        // start register
        0x09,        // 9 bytes of register data follow
        addH, addL,  // ADDH, ADDL
        0x00,        // NETID
        0x62,        // REG0: UART 9600 8N1, air 2.4 kbps
        0x00,        // REG1: 240 B subpacket, +22 dBm, no RSSI
        cfg.channel, // REG2: channel (= freq - base_freq, 1 MHz step)
        0x00,        // REG3: transparent mode, no LBT, WOR 500 ms
        0x00,        // CRYPT_H (no encryption)
    };
    // Make sure module is in config mode.
    digitalWrite(LORA_M0_PIN, HIGH);
    digitalWrite(LORA_M1_PIN, HIGH);
    delay(50);   // EBYTE datasheet: ≥ 40 ms settle after mode change

    // Flush any stale RX bytes before sending.
    while (loraSerial.available()) loraSerial.read();
    loraSerial.write(pkt, sizeof(pkt));
    loraSerial.flush();

    // Expect 11-byte echo starting with 0xC1.
    uint8_t resp[11] = {0};
    uint32_t deadline = millis() + 500;
    size_t got = 0;
    while (got < sizeof(resp) && millis() < deadline) {
        if (loraSerial.available()) {
            resp[got++] = (uint8_t) loraSerial.read();
        } else {
            delay(2);
        }
    }
    if (got < sizeof(resp)) {
        loraLogf("config: short echo (%u bytes)\n", (unsigned) got);
        return false;
    }
    bool ok = (resp[0] == 0xC1) &&
              (resp[3] == addH) && (resp[4] == addL) &&
              (resp[8] == cfg.channel);
    if (!ok) {
        loraLogf("config: bad echo "
                 "%02x %02x %02x  addr=%02x%02x ch=%02x\n",
                 resp[0], resp[1], resp[2], resp[3], resp[4], resp[8]);
    }
    return ok;
}

static bool g_moduleReady = false;
static WalkerLoraConfig g_currentCfg = {718, 17, 20, 14};

bool walkerLoraSetup(const WalkerLoraConfig& cfg) {
    g_currentCfg = cfg;
    g_moduleReady = ebyteWriteConfig(cfg);
    if (g_moduleReady) {
        loraLogf("config OK: addr=%u ch=%u (%.3f MHz)\n",
                 (unsigned) cfg.addr, (unsigned) cfg.channel,
                 850.125 + cfg.channel);
        // Drop into transparent data mode.
        digitalWrite(LORA_M0_PIN, LOW);
        digitalWrite(LORA_M1_PIN, LOW);
        delay(50);
    } else {
        loraLogf("config FAILED — module wiring or band mismatch?\n");
    }
    return g_moduleReady;
}

void walkerLoraPump() {
    // Frame parser added in Task 3. For now just drain anything that
    // arrives so we can see raw bytes via Serial.
    while (loraSerial.available()) {
        uint8_t b = (uint8_t) loraSerial.read();
        Serial.printf("%02x ", b);
    }
}

bool walkerLoraActive() { return false; }  // wired up in Task 3

bool walkerLoraReconfigure(const WalkerLoraConfig& cfg) {
    return walkerLoraSetup(cfg);
}

void walkerLoraGetStats(WalkerLoraStats& out) {
    out.moduleReady     = g_moduleReady;
    out.active          = false;
    out.framesReceived  = 0;
    out.framesRejected  = 0;
    out.bytesForwarded  = 0;
    out.lastFrameMsAgo  = UINT32_MAX;
}

#endif  // LORA_PRESENT
```

- [ ] **Step 3: Call walkerLoraSetup from main.cpp setup()**

Find the existing `loraSerial.begin(...)` block from Task 1. Add immediately after the closing brace of that `#ifdef LORA_PRESENT` block:

```cpp
#ifdef LORA_PRESENT
  // Module-default LoRa config until Task 4 wires up NVS-loaded values.
  // After Task 4 this block reads from `cfg` instead.
  WalkerLoraConfig lcfg = { 718, 17, 20, 14 };
  walkerLoraSetup(lcfg);
#endif
```

Also add the include at the top of main.cpp with the other walker headers:

```cpp
#include "walker_lora.h"
```

- [ ] **Step 4: Call walkerLoraPump from loop()**

In `void loop()`, find the existing call sequence (gnssPump → server.handleClient → ntripPump → gnssPump → buttonPump → batteryPump → tftTick). Add `walkerLoraPump()` between the second `gnssPump()` and `buttonPump()`:

```cpp
  gnssPump();
  walkerLoraPump();
  buttonPump();
```

- [ ] **Step 5: Build verify**

```bash
cd /Users/rvbcrs/GitHub/Novabot/tools/rtk-walker && /Users/rvbcrs/.platformio/penv/bin/pio run -e jc3248w535-walker
```

Expected: `[SUCCESS]`, RAM under 74 %.

- [ ] **Step 6: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add tools/rtk-walker/src/walker_lora.h tools/rtk-walker/src/walker_lora.cpp tools/rtk-walker/src/main.cpp
git commit -m "feat(walker-lora): walker_lora module + EBYTE config sequence"
```

---

### Task 3: Frame parser + RTCM forwarder

**Files:**
- Modify: `tools/rtk-walker/src/walker_lora.cpp`

- [ ] **Step 1: Add the parser state + helpers**

Replace the existing `walkerLoraPump()` and `walkerLoraActive()` stubs. First add the state machine declarations near the top of the file (right after the `static bool g_moduleReady` declaration):

```cpp
// Frame parser state. Resets to WAIT_PRE1 on any malformed byte.
// Frame format (from charger Ghidra decomp, FIRMWARE-CHARGER.md):
//   [0x02 0x02][addr_hi addr_lo][len+1][cmd][payload...][XOR][0x03 0x03]
// where len_byte = 1 + payload_data_count and XOR runs over the
// payload byte count = len_byte bytes (cmd + data).
enum LoraParseState : uint8_t {
    LP_WAIT_PRE1, LP_WAIT_PRE2,
    LP_ADDR_HI,   LP_ADDR_LO,
    LP_LEN,       LP_CMD,
    LP_PAYLOAD,   LP_XOR,
    LP_POST1,     LP_POST2,
};
static LoraParseState g_st = LP_WAIT_PRE1;
static uint8_t  g_payloadLen   = 0;     // bytes to read after CMD
static uint8_t  g_payloadIdx   = 0;
static uint8_t  g_payloadBuf[256] = {0};
static uint8_t  g_xorAccum     = 0;
static uint8_t  g_lastCmd      = 0;
static uint32_t g_framesReceived = 0;
static uint32_t g_framesRejected = 0;
static uint32_t g_bytesForwarded = 0;
static uint32_t g_lastValidMs    = 0;

#define LORA_ACTIVE_WINDOW_MS 10000
```

- [ ] **Step 2: Replace the placeholder walkerLoraPump() with the real state machine**

Replace the existing `walkerLoraPump()` body with:

```cpp
void walkerLoraPump() {
    if (!g_moduleReady) return;

    while (loraSerial.available()) {
        uint8_t b = (uint8_t) loraSerial.read();
        switch (g_st) {
            case LP_WAIT_PRE1:
                if (b == 0x02) g_st = LP_WAIT_PRE2;
                break;
            case LP_WAIT_PRE2:
                g_st = (b == 0x02) ? LP_ADDR_HI : LP_WAIT_PRE1;
                break;
            case LP_ADDR_HI:
                g_st = LP_ADDR_LO;
                break;
            case LP_ADDR_LO:
                g_st = LP_LEN;
                break;
            case LP_LEN:
                // len_byte includes the CMD byte. So total payload size = b.
                if (b == 0 || b > sizeof(g_payloadBuf)) {
                    g_framesRejected++;
                    g_st = LP_WAIT_PRE1;
                    break;
                }
                g_payloadLen = b - 1;   // bytes after CMD
                g_payloadIdx = 0;
                g_xorAccum   = 0;
                g_st = LP_CMD;
                break;
            case LP_CMD:
                g_lastCmd  = b;
                g_xorAccum = b;
                g_st = (g_payloadLen == 0) ? LP_XOR : LP_PAYLOAD;
                break;
            case LP_PAYLOAD:
                g_payloadBuf[g_payloadIdx++] = b;
                g_xorAccum ^= b;
                if (g_payloadIdx >= g_payloadLen) g_st = LP_XOR;
                break;
            case LP_XOR:
                if (b != g_xorAccum) {
                    g_framesRejected++;
                    g_st = LP_WAIT_PRE1;
                    break;
                }
                g_st = LP_POST1;
                break;
            case LP_POST1:
                g_st = (b == 0x03) ? LP_POST2 : LP_WAIT_PRE1;
                if (g_st == LP_WAIT_PRE1) g_framesRejected++;
                break;
            case LP_POST2:
                if (b == 0x03) {
                    // Valid frame! Forward 0x31 payloads to LC29HDA; count
                    // any other valid cmd as "we're hearing the charger".
                    g_framesReceived++;
                    g_lastValidMs = millis();
                    if (g_lastCmd == 0x31 && g_payloadLen > 0) {
                        gnssSerial.write(g_payloadBuf, g_payloadLen);
                        g_bytesForwarded += g_payloadLen;
                    }
                } else {
                    g_framesRejected++;
                }
                g_st = LP_WAIT_PRE1;
                break;
        }
    }
}
```

- [ ] **Step 3: Replace walkerLoraActive() with the real check**

```cpp
bool walkerLoraActive() {
    if (g_lastValidMs == 0) return false;
    return (millis() - g_lastValidMs) < LORA_ACTIVE_WINDOW_MS;
}
```

- [ ] **Step 4: Update walkerLoraGetStats() to return the real counters**

Replace the stub body:

```cpp
void walkerLoraGetStats(WalkerLoraStats& out) {
    out.moduleReady    = g_moduleReady;
    out.active         = walkerLoraActive();
    out.framesReceived = g_framesReceived;
    out.framesRejected = g_framesRejected;
    out.bytesForwarded = g_bytesForwarded;
    out.lastFrameMsAgo = g_lastValidMs ? (millis() - g_lastValidMs) : UINT32_MAX;
}
```

- [ ] **Step 5: Build verify**

```bash
cd /Users/rvbcrs/GitHub/Novabot/tools/rtk-walker && /Users/rvbcrs/.platformio/penv/bin/pio run -e jc3248w535-walker
```

Expected: `[SUCCESS]`.

- [ ] **Step 6: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add tools/rtk-walker/src/walker_lora.cpp
git commit -m "feat(walker-lora): frame parser + RTCM forward to LC29HDA"
```

---

### Task 4: NVS persistence for LoRa config

**Files:**
- Modify: `tools/rtk-walker/src/main.cpp`

- [ ] **Step 1: Add four fields to the cfg struct**

Find the `struct Config { ... } cfg;` block (around line 96). Add after the existing NTRIP fields, before the OTA section:

```cpp
  // LoRa RTK relay (Task 4). Defaults match the Novabot factory pair
  // so most users never need to configure: charger broadcasts on
  // addr=718 ch=17 hc=20 lc=14, walker listens on the same.
  uint16_t loraAddr    = 718;
  uint8_t  loraChannel = 17;
  uint8_t  loraHc      = 20;
  uint8_t  loraLc      = 14;
```

- [ ] **Step 2: Load from NVS in loadConfig()**

Find `loadConfig()` (around line 305). Add at the end of the function, before the closing brace:

```cpp
  cfg.loraAddr    = prefs.getUShort("lora_addr", 718);
  cfg.loraChannel = prefs.getUChar("lora_ch", 17);
  cfg.loraHc      = prefs.getUChar("lora_hc", 20);
  cfg.loraLc      = prefs.getUChar("lora_lc", 14);
```

- [ ] **Step 3: Save to NVS in saveConfig()**

Find `saveConfig()` (next to loadConfig). Add at the end before the close:

```cpp
  prefs.putUShort("lora_addr", cfg.loraAddr);
  prefs.putUChar("lora_ch",    cfg.loraChannel);
  prefs.putUChar("lora_hc",    cfg.loraHc);
  prefs.putUChar("lora_lc",    cfg.loraLc);
```

- [ ] **Step 4: Use the NVS values in setup()**

Find the `WalkerLoraConfig lcfg = { 718, 17, 20, 14 };` line from Task 2. Replace with:

```cpp
  WalkerLoraConfig lcfg = { cfg.loraAddr, cfg.loraChannel, cfg.loraHc, cfg.loraLc };
```

- [ ] **Step 5: Build verify**

```bash
cd /Users/rvbcrs/GitHub/Novabot/tools/rtk-walker && /Users/rvbcrs/.platformio/penv/bin/pio run -e jc3248w535-walker
```

Expected: `[SUCCESS]`.

- [ ] **Step 6: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add tools/rtk-walker/src/main.cpp
git commit -m "feat(walker-lora): persist addr/channel/hc/lc to NVS"
```

---

### Task 5: Source arbitration + walker_api snapshot fields

**Files:**
- Modify: `tools/rtk-walker/src/walker_api.h`
- Modify: `tools/rtk-walker/src/main.cpp`

- [ ] **Step 1: Add LoRa fields to WalkerSnapshot**

Find the `struct WalkerSnapshot { ... };` block in `walker_api.h`. Add four fields after the existing `closingM` / `areaM2` block, before the closing brace:

```cpp
  // LoRa RTCM source state.
  bool     loraActive;          // valid frames in last 10 s
  bool     loraModuleReady;     // EBYTE config acked at boot
  uint32_t loraBytesForwarded;  // total RTCM bytes pushed to LC29HDA from LoRa
  uint32_t loraFramesReceived;  // valid LoRa frames seen (any cmd)
```

- [ ] **Step 2: Add LoRa fields to WalkerConfigView**

Same file, find `struct WalkerConfigView { ... }`. Add before the closing brace:

```cpp
  // LoRa pair settings (mirror the four NVS keys lora_addr/ch/hc/lc).
  uint16_t loraAddr      = 718;
  uint8_t  loraChannel   = 17;
  uint8_t  loraHc        = 20;
  uint8_t  loraLc        = 14;
```

Also add to `struct WalkerConfigUpdate`:

```cpp
  bool loraAddrSet    = false; uint16_t loraAddr    = 0;
  bool loraChannelSet = false; uint8_t  loraChannel = 0;
  bool loraHcSet      = false; uint8_t  loraHc      = 0;
  bool loraLcSet      = false; uint8_t  loraLc      = 0;
```

- [ ] **Step 3: Populate snapshot in walkerGetSnapshot()**

Find `void walkerGetSnapshot(WalkerSnapshot& out)` (around line 2665). Just before `coreUnlock();` add:

```cpp
  WalkerLoraStats lstats;
  walkerLoraGetStats(lstats);
  out.loraActive          = lstats.active;
  out.loraModuleReady     = lstats.moduleReady;
  out.loraBytesForwarded  = lstats.bytesForwarded;
  out.loraFramesReceived  = lstats.framesReceived;
```

Note: `walkerLoraGetStats()` doesn't touch `coreMux`, so reading it inside the lock is safe.

- [ ] **Step 4: Populate WalkerConfigView in walkerGetConfig()**

Find `void walkerGetConfig(WalkerConfigView& out)` (around line 2802). Just before `coreUnlock();` add:

```cpp
  out.loraAddr     = cfg.loraAddr;
  out.loraChannel  = cfg.loraChannel;
  out.loraHc       = cfg.loraHc;
  out.loraLc       = cfg.loraLc;
```

- [ ] **Step 5: Handle WalkerConfigUpdate in walkerApplyConfig()**

Find `void walkerApplyConfig(const WalkerConfigUpdate& upd)` (around line 2829). Add inside the `coreLock();` block, alongside the existing field updates:

```cpp
  bool loraChanged = false;
  if (upd.loraAddrSet)    { cfg.loraAddr    = upd.loraAddr;    loraChanged = true; }
  if (upd.loraChannelSet) { cfg.loraChannel = upd.loraChannel; loraChanged = true; }
  if (upd.loraHcSet)      { cfg.loraHc      = upd.loraHc;      loraChanged = true; }
  if (upd.loraLcSet)      { cfg.loraLc      = upd.loraLc;      loraChanged = true; }
```

Then, AFTER `saveConfig()` and AFTER `coreUnlock()`, add (outside the lock — we don't want to hold core mux during the 500 ms ebyte echo wait):

```cpp
  if (loraChanged) {
    WalkerLoraConfig newCfg = { cfg.loraAddr, cfg.loraChannel, cfg.loraHc, cfg.loraLc };
    walkerLoraReconfigure(newCfg);
  }
```

Note: the existing `walkerApplyConfig()` reboots after WiFi/NTRIP changes. Keep that reboot path. LoRa changes alone should NOT trigger reboot — the inline reconfigure is enough. Adjust the existing reboot guard if needed so it only fires on WiFi/NTRIP-relevant fields.

- [ ] **Step 6: Guard ntripPump() with walkerLoraActive()**

Find the line in `ntripPump()` where the RTCM bytes get written to `gnssSerial`. Look for `gnssSerial.write(chunk, n)` or similar (around line 925). Wrap with:

```cpp
    if (!walkerLoraActive()) {
      gnssSerial.write(chunk, n);
      st.ntripBytes += n;
    } else {
      // LoRa is the active RTCM source — drop NTRIP bytes silently.
      // Socket stays open so we can take over fast if LoRa goes silent.
      st.ntripBytes += n;  // still count bytes received, just not forwarded
    }
```

Adjust the surrounding `if` / `while` boundaries to match the actual existing structure — the pattern is: read from `ntrip` client, optionally write to `gnssSerial`. Only the write needs guarding.

- [ ] **Step 7: Build verify**

```bash
cd /Users/rvbcrs/GitHub/Novabot/tools/rtk-walker && /Users/rvbcrs/.platformio/penv/bin/pio run -e jc3248w535-walker -e esp32s3-walker
```

Expected: both `[SUCCESS]`.

- [ ] **Step 8: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add tools/rtk-walker/src/walker_api.h tools/rtk-walker/src/main.cpp
git commit -m "feat(walker-lora): snapshot/config plumbing + ntrip guard"
```

---

### Task 6: HTTP /api/config/lora endpoint

**Files:**
- Modify: `tools/rtk-walker/src/main.cpp`

- [ ] **Step 1: Add handleConfigLoraGet()**

Find `handleConfigGet()` (around line 1500). Add a new function above it:

```cpp
static void handleConfigLoraGet() {
  JsonDocument doc;
  coreLock();
  doc["addr"]    = cfg.loraAddr;
  doc["channel"] = cfg.loraChannel;
  doc["hc"]      = cfg.loraHc;
  doc["lc"]      = cfg.loraLc;
  coreUnlock();
  sendJson(200, doc);
}
```

- [ ] **Step 2: Add handleConfigLoraPost()**

Right below:

```cpp
static void handleConfigLoraPost() {
  if (!requireAuth()) return;
  if (!server.hasArg("plain")) { server.send(400, "text/plain", "no body"); return; }
  JsonDocument body;
  if (deserializeJson(body, server.arg("plain"))) {
    server.send(400, "text/plain", "bad json"); return;
  }
  WalkerConfigUpdate upd;
  if (body["addr"].is<int>()) {
    int v = body["addr"];
    if (v < 1 || v > 65535) { server.send(400, "text/plain", "addr 1..65535"); return; }
    upd.loraAddrSet = true; upd.loraAddr = (uint16_t) v;
  }
  if (body["channel"].is<int>()) {
    int v = body["channel"];
    if (v < 0 || v > 83) { server.send(400, "text/plain", "channel 0..83"); return; }
    upd.loraChannelSet = true; upd.loraChannel = (uint8_t) v;
  }
  if (body["hc"].is<int>()) {
    int v = body["hc"];
    if (v < 0 || v > 83) { server.send(400, "text/plain", "hc 0..83"); return; }
    upd.loraHcSet = true; upd.loraHc = (uint8_t) v;
  }
  if (body["lc"].is<int>()) {
    int v = body["lc"];
    if (v < 0 || v > 83) { server.send(400, "text/plain", "lc 0..83"); return; }
    upd.loraLcSet = true; upd.loraLc = (uint8_t) v;
  }
  walkerApplyConfig(upd);
  JsonDocument resp;
  resp["ok"] = true;
  sendJson(200, resp);
}
```

- [ ] **Step 3: Register the routes in setup()**

Find the block where other `/api/config/*` routes are registered (around line 2440, look for `server.on("/api/config"`). Add:

```cpp
  server.on("/api/config/lora", HTTP_GET,  handleConfigLoraGet);
  server.on("/api/config/lora", HTTP_POST, handleConfigLoraPost);
```

- [ ] **Step 4: Build verify**

```bash
cd /Users/rvbcrs/GitHub/Novabot/tools/rtk-walker && /Users/rvbcrs/.platformio/penv/bin/pio run -e jc3248w535-walker
```

Expected: `[SUCCESS]`.

- [ ] **Step 5: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add tools/rtk-walker/src/main.cpp
git commit -m "feat(walker-lora): GET/POST /api/config/lora"
```

---

### Task 7: Extend /api/status with lora field

**Files:**
- Modify: `tools/rtk-walker/src/main.cpp`

- [ ] **Step 1: Add lora object to handleStatus()**

Find `handleStatus()` (around line 1460). Just before `sendJson(200, doc);` add:

```cpp
  JsonObject lora = doc["lora"].to<JsonObject>();
  lora["active"]      = snap.loraActive;
  lora["moduleReady"] = snap.loraModuleReady;
  lora["bytes"]       = snap.loraBytesForwarded;
  lora["frames"]      = snap.loraFramesReceived;
```

Note: this requires `snap` to be populated — find the existing `WalkerSnapshot snap;` + `walkerGetSnapshot(snap);` at the top of `handleStatus()` and confirm both are present. If `handleStatus()` reads from `cfg` directly instead, swap it to use a snapshot (cleaner) or pull `WalkerLoraStats` directly via `walkerLoraGetStats()`.

- [ ] **Step 2: Build verify**

```bash
cd /Users/rvbcrs/GitHub/Novabot/tools/rtk-walker && /Users/rvbcrs/.platformio/penv/bin/pio run -e jc3248w535-walker
```

Expected: `[SUCCESS]`.

- [ ] **Step 3: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add tools/rtk-walker/src/main.cpp
git commit -m "feat(walker-lora): expose lora status in /api/status"
```

---

### Task 8: rtcm_log ring buffer module

**Files:**
- Create: `tools/rtk-walker/src/rtcm_log.h`
- Create: `tools/rtk-walker/src/rtcm_log.cpp`

- [ ] **Step 1: Create rtcm_log.h**

```cpp
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
```

- [ ] **Step 2: Create rtcm_log.cpp**

```cpp
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
```

- [ ] **Step 3: Hook rtcmLogAppend into walker_lora.cpp**

Edit `walker_lora.cpp`. Add the include at the top:

```cpp
#include "rtcm_log.h"
```

Find the `case LP_POST2:` block in the parser. Inside the `if (b == 0x03)` valid-frame branch, replace this line:

```cpp
                    if (g_lastCmd == 0x31 && g_payloadLen > 0) {
                        gnssSerial.write(g_payloadBuf, g_payloadLen);
                        g_bytesForwarded += g_payloadLen;
                    }
```

with:

```cpp
                    if (g_lastCmd == 0x31 && g_payloadLen > 0) {
                        gnssSerial.write(g_payloadBuf, g_payloadLen);
                        rtcmLogAppend(g_payloadBuf, g_payloadLen, RTCM_SRC_LORA);
                        g_bytesForwarded += g_payloadLen;
                    }
```

- [ ] **Step 4: Hook rtcmLogAppend into the NTRIP path**

Edit `main.cpp`. Add at the top with the other includes:

```cpp
#include "rtcm_log.h"
```

Find the `ntripPump()` RTCM write block from Task 5 step 6. Replace the inner write:

```cpp
    if (!walkerLoraActive()) {
      gnssSerial.write(chunk, n);
      rtcmLogAppend(chunk, n, RTCM_SRC_NTRIP);
      st.ntripBytes += n;
    } else {
      st.ntripBytes += n;
    }
```

- [ ] **Step 5: Build verify**

```bash
cd /Users/rvbcrs/GitHub/Novabot/tools/rtk-walker && /Users/rvbcrs/.platformio/penv/bin/pio run -e jc3248w535-walker
```

Expected: `[SUCCESS]`, RAM ~74-75 % (4 KB ring buffer added).

- [ ] **Step 6: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add tools/rtk-walker/src/rtcm_log.h tools/rtk-walker/src/rtcm_log.cpp tools/rtk-walker/src/walker_lora.cpp tools/rtk-walker/src/main.cpp
git commit -m "feat(walker-lora): rtcm_log ring buffer, fed by both LoRa + NTRIP"
```

---

### Task 9: HTTP /api/rtcm/log endpoint

**Files:**
- Modify: `tools/rtk-walker/src/main.cpp`

- [ ] **Step 1: Add handleRtcmLog()**

Add a new handler function in `main.cpp`, right after `handleConfigLoraPost`:

```cpp
static void handleRtcmLog() {
  // Snapshot the last 2 KB of the ring (4 KB raw → 8 KB hex string).
  // 2 KB is a good balance: covers 5-10 RTCM3 messages of typical
  // size, fits in a single HTTP response without bloating poll cost.
  const size_t WANT = 2048;
  static char hexbuf[2 * WANT + 1];
  uint32_t seq = 0;
  RtcmLogSource src = RTCM_SRC_NONE;
  size_t n = rtcmLogSnapshot(hexbuf, WANT, &seq, &src);

  JsonDocument doc;
  doc["bytesAvailable"] = (uint32_t) n;
  doc["seq"]            = seq;
  const char* srcStr = "none";
  if (src == RTCM_SRC_LORA)  srcStr = "lora";
  if (src == RTCM_SRC_NTRIP) srcStr = "ntrip";
  doc["source"] = srcStr;
  doc["hex"]    = hexbuf;

  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}
```

- [ ] **Step 2: Register the route**

In the same block as the other `/api/` registrations:

```cpp
  server.on("/api/rtcm/log", HTTP_GET, handleRtcmLog);
```

- [ ] **Step 3: Build verify**

```bash
cd /Users/rvbcrs/GitHub/Novabot/tools/rtk-walker && /Users/rvbcrs/.platformio/penv/bin/pio run -e jc3248w535-walker
```

Expected: `[SUCCESS]`.

- [ ] **Step 4: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add tools/rtk-walker/src/main.cpp
git commit -m "feat(walker-lora): GET /api/rtcm/log returns hex snapshot + source"
```

---

### Task 10: Web UI — LoRa config card + RTCM debug console

**Files:**
- Modify: `tools/rtk-walker/src/index_html.h`

- [ ] **Step 1: Add the LoRa config card HTML**

Find the `<details class="card config"><summary>WiFi &amp; NTRIP setup</summary>` block (the NTRIP setup card). Add a new card immediately after the closing `</details>`:

```html
  <details class="card config">
    <summary style="cursor:pointer;font-weight:600;color:var(--text)">LoRa RTK relay</summary>
    <p style="font-size:11px;color:var(--text-dim);margin:6px 0 10px;line-height:1.4">
      Pair with the Novabot charger so the walker gets RTK corrections
      over LoRa instead of WiFi/NTRIP. Defaults match the factory pair
      (addr=718, ch=17). Change only if your charger is on a different
      pair.
    </p>
    <form id="loraForm">
      <label>Address<input id="lora_addr" type="number" min="1" max="65535" placeholder="718"></label>
      <label>Channel<input id="lora_channel" type="number" min="0" max="83" placeholder="17"></label>
      <label>HC (scan upper)<input id="lora_hc" type="number" min="0" max="83" placeholder="20"></label>
      <label>LC (scan lower)<input id="lora_lc" type="number" min="0" max="83" placeholder="14"></label>
      <button type="submit" style="margin-top:12px">Save LoRa config</button>
      <div id="loraStatus" style="margin-top:8px;font-size:12px;min-height:16px"></div>
    </form>
  </details>
```

- [ ] **Step 2: Add the RTCM debug console card HTML**

Right after the LoRa card:

```html
  <details class="card log-card">
    <summary style="cursor:pointer;font-weight:600;color:var(--text)">RTCM debug</summary>
    <div class="log-toolbar">
      <label><input id="rtcmFollow" type="checkbox" checked> follow tail</label>
      <span class="grow"></span>
      <span style="font-size:11px;color:var(--text-dim)" id="rtcmSrc">source: -</span>
      <button type="button" id="rtcmClear">clear view</button>
    </div>
    <pre id="rtcmHex" style="font-size:10px;max-height:160px"></pre>
    <div style="margin-top:8px;font-size:11px;color:var(--text-dim)">Decoded messages</div>
    <pre id="rtcmMsgs" style="font-size:11px;max-height:160px"></pre>
  </details>
```

- [ ] **Step 3: Add the JS for loading + saving LoRa config**

Find the existing config-related JS (look for `async function loadConfig`). After that function, add:

```javascript
async function loadLora() {
  try {
    const r = await fetch('/api/config/lora');
    const c = await r.json();
    for (const k of ['addr', 'channel', 'hc', 'lc']) {
      const el = document.getElementById('lora_' + k);
      if (el && c[k] != null) el.value = c[k];
    }
  } catch (e) { /* ignore */ }
}

async function saveLora(ev) {
  ev.preventDefault();
  const status = document.getElementById('loraStatus');
  status.style.color = 'var(--text-dim)';
  status.textContent = 'Saving...';
  const body = {
    addr:    parseInt(document.getElementById('lora_addr').value, 10),
    channel: parseInt(document.getElementById('lora_channel').value, 10),
    hc:      parseInt(document.getElementById('lora_hc').value, 10),
    lc:      parseInt(document.getElementById('lora_lc').value, 10),
  };
  try {
    const r = await authFetch('/api/config/lora', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.status === 401 || r.status === 403) { showAuthNeeded('loraStatus'); return; }
    const d = await r.json();
    if (d.ok) {
      status.style.color = 'var(--emerald)';
      status.textContent = 'Saved + reconfigured.';
    } else {
      status.style.color = 'var(--red)';
      status.textContent = 'Save failed.';
    }
  } catch (e) {
    status.style.color = 'var(--red)';
    status.textContent = 'Save error: ' + (e && e.message ? e.message : e);
  }
}
document.getElementById('loraForm').addEventListener('submit', saveLora);
```

- [ ] **Step 4: Add the JS RTCM3 decoder + console refresh**

After the LoRa JS block:

```javascript
let rtcmLastSeq = 0;
let rtcmLastHex = '';
let rtcmFollow = true;

// Decode RTCM3 message types from a Uint8Array. Each message starts
// with 0xD3, followed by 6 reserved bits + 10 length bits, then
// payload, then 24-bit CRC. Message number = first 12 bits of payload.
function decodeRtcm3(bytes) {
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    if (bytes[i] !== 0xD3) { i++; continue; }
    if (i + 5 >= bytes.length) break;
    const lenHi = bytes[i + 1] & 0x03;
    const lenLo = bytes[i + 2];
    const payloadLen = (lenHi << 8) | lenLo;
    if (payloadLen === 0 || i + 3 + payloadLen + 3 > bytes.length) {
      i++;
      continue;
    }
    // Message number = first 12 bits of payload.
    const msgType = (bytes[i + 3] << 4) | (bytes[i + 4] >> 4);
    out.push({ type: msgType, len: payloadLen + 6, offset: i });
    i += 3 + payloadLen + 3;
  }
  return out;
}

function rtcmTypeName(t) {
  // Common observation message types. The user can look up the rest
  // in the RTCM3 spec; we only label what we expect to see.
  const names = {
    1004: 'GPS L1/L2',
    1005: 'Station ARP (no height)',
    1006: 'Station ARP + height',
    1019: 'GPS ephemeris',
    1020: 'GLONASS ephemeris',
    1033: 'Receiver descriptor',
    1042: 'BeiDou ephemeris',
    1046: 'Galileo ephemeris',
    1074: 'MSM4 GPS',
    1075: 'MSM5 GPS',
    1077: 'MSM7 GPS',
    1084: 'MSM4 GLONASS',
    1085: 'MSM5 GLONASS',
    1087: 'MSM7 GLONASS',
    1094: 'MSM4 Galileo',
    1095: 'MSM5 Galileo',
    1097: 'MSM7 Galileo',
    1124: 'MSM4 BeiDou',
    1127: 'MSM7 BeiDou',
    1230: 'GLONASS code-phase bias',
  };
  return names[t] || ('type ' + t);
}

function hexToBytes(hex) {
  const len = hex.length >> 1;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function formatHexDump(hex) {
  let out = '';
  for (let i = 0; i < hex.length; i += 64) {
    out += hex.substr(i, 64) + '\n';
  }
  return out;
}

async function refreshRtcm() {
  if (!rtcmFollow) return;
  try {
    const r = await fetch('/api/rtcm/log');
    const d = await r.json();
    if (d.seq === rtcmLastSeq) return;  // no new bytes
    rtcmLastSeq = d.seq;
    rtcmLastHex = d.hex || '';
    document.getElementById('rtcmHex').textContent = formatHexDump(rtcmLastHex);
    document.getElementById('rtcmSrc').textContent = 'source: ' + (d.source || '-');
    const bytes = hexToBytes(rtcmLastHex);
    const msgs = decodeRtcm3(bytes);
    const lines = msgs.map(m => 'T-' + ((bytes.length - m.offset) | 0) + 'B · '
                                + rtcmTypeName(m.type) + ' (' + m.type + ') · '
                                + m.len + ' B');
    document.getElementById('rtcmMsgs').textContent = lines.join('\n');
  } catch (e) { /* ignore */ }
}
document.getElementById('rtcmFollow').addEventListener('change', function(e) {
  rtcmFollow = e.target.checked;
});
document.getElementById('rtcmClear').addEventListener('click', function() {
  document.getElementById('rtcmHex').textContent = '';
  document.getElementById('rtcmMsgs').textContent = '';
  rtcmLastSeq = 0;
});
```

- [ ] **Step 5: Wire up the boot calls + interval**

Find the existing `setInterval(refresh, ...)` and bootstrap calls at the bottom of the script. Add alongside them:

```javascript
loadLora();
setInterval(refreshRtcm, 1000);
refreshRtcm();
```

- [ ] **Step 6: Build verify**

```bash
cd /Users/rvbcrs/GitHub/Novabot/tools/rtk-walker && /Users/rvbcrs/.platformio/penv/bin/pio run -e jc3248w535-walker
```

Expected: `[SUCCESS]`. Flash size up by ~5-8 KB for the new HTML/JS.

- [ ] **Step 7: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add tools/rtk-walker/src/index_html.h
git commit -m "feat(walker-lora): web UI LoRa config card + RTCM debug console"
```

---

### Task 11: TFT Settings — LoRa sub-tab

**Files:**
- Modify: `tools/rtk-walker/src/tft/tft_ui.cpp`

- [ ] **Step 1: Add the four textarea handles at file scope**

Find the existing `static lv_obj_t* ta_ntrip_pass = nullptr;` line (with the other Settings textareas). Add below:

```cpp
static lv_obj_t* ta_lora_addr    = nullptr;
static lv_obj_t* ta_lora_channel = nullptr;
static lv_obj_t* ta_lora_hc      = nullptr;
static lv_obj_t* ta_lora_lc      = nullptr;
```

- [ ] **Step 2: Add a new tab in the settings tabview**

Find the existing Settings tabview creation (search for `lv_tabview_create` in the file). Look for the WiFi + NTRIP tab adds — should be `lv_tabview_add_tab(...)` calls. After the NTRIP tab add, register a new LoRa tab:

```cpp
  lv_obj_t* tab_lora = lv_tabview_add_tab(settings_tabview, "LoRa");
  lv_obj_set_style_pad_all(tab_lora, 12, 0);
  lv_obj_set_flex_flow(tab_lora, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(tab_lora, 8, 0);

  // Pair address (1-65535).
  lv_obj_t* lbl_la = lv_label_create(tab_lora);
  lv_label_set_text(lbl_la, "Address");
  ta_lora_addr = lv_textarea_create(tab_lora);
  lv_textarea_set_one_line(ta_lora_addr, true);
  lv_textarea_set_accepted_chars(ta_lora_addr, "0123456789");
  lv_textarea_set_max_length(ta_lora_addr, 5);
  lv_obj_add_event_cb(ta_lora_addr, on_textarea_focus, LV_EVENT_FOCUSED, NULL);

  // Channel (0..83).
  lv_obj_t* lbl_lc1 = lv_label_create(tab_lora);
  lv_label_set_text(lbl_lc1, "Channel");
  ta_lora_channel = lv_textarea_create(tab_lora);
  lv_textarea_set_one_line(ta_lora_channel, true);
  lv_textarea_set_accepted_chars(ta_lora_channel, "0123456789");
  lv_textarea_set_max_length(ta_lora_channel, 2);
  lv_obj_add_event_cb(ta_lora_channel, on_textarea_focus, LV_EVENT_FOCUSED, NULL);

  // HC.
  lv_obj_t* lbl_lhc = lv_label_create(tab_lora);
  lv_label_set_text(lbl_lhc, "HC (scan upper)");
  ta_lora_hc = lv_textarea_create(tab_lora);
  lv_textarea_set_one_line(ta_lora_hc, true);
  lv_textarea_set_accepted_chars(ta_lora_hc, "0123456789");
  lv_textarea_set_max_length(ta_lora_hc, 2);
  lv_obj_add_event_cb(ta_lora_hc, on_textarea_focus, LV_EVENT_FOCUSED, NULL);

  // LC.
  lv_obj_t* lbl_llc = lv_label_create(tab_lora);
  lv_label_set_text(lbl_llc, "LC (scan lower)");
  ta_lora_lc = lv_textarea_create(tab_lora);
  lv_textarea_set_one_line(ta_lora_lc, true);
  lv_textarea_set_accepted_chars(ta_lora_lc, "0123456789");
  lv_textarea_set_max_length(ta_lora_lc, 2);
  lv_obj_add_event_cb(ta_lora_lc, on_textarea_focus, LV_EVENT_FOCUSED, NULL);
```

- [ ] **Step 3: Populate the textareas in load_settings_values()**

Find `static void load_settings_values()`. After the existing `lv_textarea_set_text(ta_ntrip_pass, "")` call, add:

```cpp
  char buf[8];
  snprintf(buf, sizeof(buf), "%u", (unsigned) cfg_baseline.loraAddr);
  lv_textarea_set_text(ta_lora_addr, buf);
  snprintf(buf, sizeof(buf), "%u", (unsigned) cfg_baseline.loraChannel);
  lv_textarea_set_text(ta_lora_channel, buf);
  snprintf(buf, sizeof(buf), "%u", (unsigned) cfg_baseline.loraHc);
  lv_textarea_set_text(ta_lora_hc, buf);
  snprintf(buf, sizeof(buf), "%u", (unsigned) cfg_baseline.loraLc);
  lv_textarea_set_text(ta_lora_lc, buf);
```

- [ ] **Step 4: Add LoRa fields to on_save_settings()**

Find `on_save_settings()`. After the existing NTRIP field reads, add:

```cpp
  s = taText(ta_lora_addr);
  uint32_t addrVal = s.toInt();
  if (addrVal > 0 && addrVal <= 65535 && (uint16_t) addrVal != cfg_baseline.loraAddr) {
    upd.loraAddrSet = true; upd.loraAddr = (uint16_t) addrVal;
  }
  s = taText(ta_lora_channel);
  int chVal = s.toInt();
  if (chVal >= 0 && chVal <= 83 && (uint8_t) chVal != cfg_baseline.loraChannel) {
    upd.loraChannelSet = true; upd.loraChannel = (uint8_t) chVal;
  }
  s = taText(ta_lora_hc);
  int hcVal = s.toInt();
  if (hcVal >= 0 && hcVal <= 83 && (uint8_t) hcVal != cfg_baseline.loraHc) {
    upd.loraHcSet = true; upd.loraHc = (uint8_t) hcVal;
  }
  s = taText(ta_lora_lc);
  int lcVal = s.toInt();
  if (lcVal >= 0 && lcVal <= 83 && (uint8_t) lcVal != cfg_baseline.loraLc) {
    upd.loraLcSet = true; upd.loraLc = (uint8_t) lcVal;
  }
```

- [ ] **Step 5: Build verify**

```bash
cd /Users/rvbcrs/GitHub/Novabot/tools/rtk-walker && /Users/rvbcrs/.platformio/penv/bin/pio run -e jc3248w535-walker
```

Expected: `[SUCCESS]`. RAM might bump 1-2 KB for LVGL widgets.

- [ ] **Step 6: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add tools/rtk-walker/src/tft/tft_ui.cpp
git commit -m "feat(walker-lora): TFT Settings LoRa sub-tab"
```

---

### Task 12: TFT topbar — single-source RTK indicator

**Files:**
- Modify: `tools/rtk-walker/src/tft/tft_ui.cpp`

- [ ] **Step 1: Update the NTRIP indicator label widget to be a generic "RTK source" label**

Find `lbl_ntrip` references in the file. The existing pattern updates the label to "NTRIP ✓" or "NTRIP off". We're keeping the same widget but expanding what it shows.

Locate the refresh routine that updates `lbl_ntrip` — search for `lv_label_set_text(lbl_ntrip,`. The block looks roughly like:

```cpp
  if (snap.ntripUp) {
    lv_label_set_text(lbl_ntrip, LV_SYMBOL_UPLOAD "  NTRIP " LV_SYMBOL_OK);
    lv_obj_set_style_text_color(lbl_ntrip, COL_EMERALD, 0);
  } else {
    lv_label_set_text(lbl_ntrip, LV_SYMBOL_UPLOAD "  NTRIP off");
    lv_obj_set_style_text_color(lbl_ntrip, COL_DIM, 0);
  }
```

Replace with:

```cpp
  // Single "RTK source" indicator: LoRa wins when active, NTRIP otherwise.
  // Both colored = LoRa active (we never show both simultaneously per spec).
  if (snap.loraActive) {
    lv_label_set_text(lbl_ntrip, LV_SYMBOL_BARS "  LoRa " LV_SYMBOL_OK);
    lv_obj_set_style_text_color(lbl_ntrip, COL_EMERALD, 0);
  } else if (snap.ntripUp) {
    lv_label_set_text(lbl_ntrip, LV_SYMBOL_UPLOAD "  NTRIP " LV_SYMBOL_OK);
    lv_obj_set_style_text_color(lbl_ntrip, COL_EMERALD, 0);
  } else if (snap.loraModuleReady) {
    // LoRa module up but no recent frames — amber, hint that charger
    // may be off or out of range.
    lv_label_set_text(lbl_ntrip, LV_SYMBOL_BARS "  LoRa quiet");
    lv_obj_set_style_text_color(lbl_ntrip, COL_AMBER, 0);
  } else {
    lv_label_set_text(lbl_ntrip, LV_SYMBOL_UPLOAD "  RTK off");
    lv_obj_set_style_text_color(lbl_ntrip, COL_DIM, 0);
  }
```

- [ ] **Step 2: Build verify**

```bash
cd /Users/rvbcrs/GitHub/Novabot/tools/rtk-walker && /Users/rvbcrs/.platformio/penv/bin/pio run -e jc3248w535-walker
```

Expected: `[SUCCESS]`.

- [ ] **Step 3: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add tools/rtk-walker/src/tft/tft_ui.cpp
git commit -m "feat(walker-lora): topbar single-source RTK indicator (LoRa/NTRIP swap)"
```

---

### Task 13: Bench bring-up + end-to-end RTK FIX

**No file changes — this is a hardware + verification task.**

- [ ] **Step 1: Wire the E22 module to the walker**

Follow the wiring table in the spec:

| Walker GPIO | E22 pin |
|---|---|
| GPIO 42 | TXD |
| GPIO 41 | RXD |
| GPIO 44 | M0 |
| GPIO 11 | M1 |
| 3.3 V | VCC |
| GND | GND |

Solder a 50-mm wire whip dipole to the antenna pad / UFL connector. Power off before wiring.

- [ ] **Step 2: Flash the latest firmware**

```bash
cd /Users/rvbcrs/GitHub/Novabot/tools/rtk-walker
/Users/rvbcrs/.platformio/penv/bin/pio run -e jc3248w535-walker -t upload
/Users/rvbcrs/.platformio/penv/bin/pio device monitor
```

- [ ] **Step 3: Verify boot log**

Within ~5 s of boot, the serial console should print:

```
[lora] UART2 + pins initialised (RX=42 TX=41 M0=44 M1=11)
[lora] config OK: addr=718 ch=17 (867.125 MHz)
```

If `config FAILED — module wiring or band mismatch?` shows: re-check wiring, then fall back to the air-rate two-step in the spec (read the working mower's E22 config via `M0/M1=1,1` + `0xC1 0x00 0x09` query).

- [ ] **Step 4: Power on the Novabot charger nearby**

Charger must be in normal operation (LoRa broadcasting). Place walker within 5 m for the bench test.

- [ ] **Step 5: Verify frames arrive**

In the walker's web UI, open the "RTCM debug" card. Within 30 s you should see:
- `source: lora` in the toolbar
- Hex bytes appearing in the upper pane
- Decoded message types in the lower pane (1077 MSM7 GPS, 1087, 1097, etc.)

If no bytes arrive: most likely cause is air-rate mismatch. Fall back to the spec's "read mower's E22 config" procedure.

- [ ] **Step 6: Verify LC29HDA gets RTK FIX**

Take the walker outside with sky view. Within ~30-60 s the fix-pill should show "RTK FIX" (fix=4). The topbar source indicator should read "LoRa ✓" in emerald.

- [ ] **Step 7: Verify fallback to NTRIP**

With WiFi + NTRIP already configured, power off the charger. After ~10 s of LoRa silence, the topbar should swap to "NTRIP ✓" and RTK FIX should hold (might briefly visit FLOAT during the switchover).

- [ ] **Step 8: Walk a test polygon**

End-to-end mapping flow — record a small area in the garden with LoRa-sourced RTK. Verify the saved map looks correct in the Web UI canvas and on the TFT.

- [ ] **Step 9: Document field results**

Append a note to `docs/superpowers/specs/2026-05-24-walker-lora-rtk-relay.md` under a new section:

```markdown
## Field results (YYYY-MM-DD)

- LoRa bring-up: <success/fail + air rate used>
- Range observed: <distance + RSSI at limit>
- Time to first RTK FIX: <seconds>
- Hybrid switchover: <observed behavior>
- Issues / follow-ups: <free text>
```

Then commit:

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add docs/superpowers/specs/2026-05-24-walker-lora-rtk-relay.md
git commit -m "docs(spec): field results for walker LoRa RTK relay"
```
