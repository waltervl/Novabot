# Walker GNSS TX Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serialize all LC29HDA UART writes through one owner so LoRa RTCM, NTRIP RTCM, and PAIR commands cannot interleave.

**Architecture:** Add a small `gnss_tx` module with an internal queue and a single `HardwareSerial::write()` call site. `main.cpp` enqueues NTRIP and PAIR traffic, `walker_lora.cpp` enqueues LoRa `0x31` payloads, and `gnssPump()` drains the queue before reading LC29HDA output. Remove automatic `PAIR400,2` and boot-time `PAIR513` for LC29HDA.

**Tech Stack:** ESP32 Arduino, PlatformIO, Quectel LC29HDA NMEA/RTCM, Node.js regression scripts.

---

### Task 1: Regression Checks

**Files:**
- Modify: `tools/rtk-walker/scripts/check_lora_relay_regression.js`

- [ ] **Step 1: Make the regression script require queued LoRa forwarding**

Replace the direct `gnssSerial.write(g_payloadBuf, g_payloadIdx);` assertion with:

```js
assertIncludes(
  loraCpp,
  "walkerGnssTxQueueRtcmFromLora(g_payloadBuf, g_payloadIdx);",
  "LoRa 0x31 relay must enqueue the charger payload through the single GNSS TX owner."
);

assertExcludes(
  loraCpp,
  "gnssSerial.write",
  "LoRa code must not write directly to the LC29HDA UART."
);
```

Add checks for the new queue module and bad PAIR config:

```js
const gnssTxCpp = fs.readFileSync(path.join(root, "src", "gnss_tx.cpp"), "utf8");

assertIncludes(
  gnssTxCpp,
  "g_serial->availableForWrite()",
  "GNSS TX owner must respect UART TX buffer capacity instead of blocking the realtime pump."
);

assertIncludes(
  gnssTxCpp,
  "g_serial->write(g_active.bytes + g_activeOffset, n);",
  "GNSS TX owner must contain the single LC29HDA write call site."
);

assertIncludes(
  mainCpp,
  "walkerGnssTxPump();",
  "Realtime GNSS pump must drain the GNSS TX queue."
);

assertExcludes(
  mainCpp,
  "sendGnssCommand(\"PAIR400,2\")",
  "PAIR400,2 selects SBAS in Quectel protocol v1.4 and must not be sent automatically."
);

assertExcludes(
  mainCpp,
  "sendGnssCommand(\"PAIR513\")",
  "PAIR513 must not be sent automatically on every boot."
);
```

- [ ] **Step 2: Run the regression script and confirm RED**

Run:

```bash
node tools/rtk-walker/scripts/check_lora_relay_regression.js
```

Expected: FAIL because `gnss_tx.cpp` does not exist yet and LoRa still writes directly.

### Task 2: GNSS TX Queue Module

**Files:**
- Create: `tools/rtk-walker/src/gnss_tx.h`
- Create: `tools/rtk-walker/src/gnss_tx.cpp`
- Modify: `tools/rtk-walker/src/main.cpp`
- Modify: `tools/rtk-walker/src/walker_lora.cpp`
- Modify: `tools/rtk-walker/src/walker_lora.h`

- [ ] **Step 1: Add public GNSS TX API**

Create `tools/rtk-walker/src/gnss_tx.h` with:

```cpp
#pragma once

#include <Arduino.h>

enum class WalkerGnssTxKind : uint8_t {
  RtcmFromLora,
  RtcmFromNtrip,
  PairCommand,
};

struct WalkerGnssTxStats {
  uint32_t enqueued;
  uint32_t dropped;
  uint32_t written;
  uint32_t bytesWritten;
  uint16_t queueDepth;
  uint16_t queueHighWater;
};

void walkerGnssTxSetup(HardwareSerial& serial);
bool walkerGnssTxQueue(WalkerGnssTxKind kind, const uint8_t* bytes, size_t len);
bool walkerGnssTxQueueRtcmFromLora(const uint8_t* bytes, size_t len);
bool walkerGnssTxQueueRtcmFromNtrip(const uint8_t* bytes, size_t len);
bool walkerGnssTxQueuePairPayload(const String& payload);
void walkerGnssTxPump();
void walkerGnssTxGetStats(WalkerGnssTxStats& out);
```

- [ ] **Step 2: Implement fixed-size queued writer**

Create `tools/rtk-walker/src/gnss_tx.cpp` with:

```cpp
#include "gnss_tx.h"

struct WalkerGnssTxItem {
  WalkerGnssTxKind kind;
  uint16_t len;
  uint8_t bytes[256];
};

static HardwareSerial* g_serial = nullptr;
static QueueHandle_t g_queue = nullptr;
static WalkerGnssTxStats g_stats = {};

void walkerGnssTxSetup(HardwareSerial& serial) {
  g_serial = &serial;
  if (!g_queue) {
    g_queue = xQueueCreate(24, sizeof(WalkerGnssTxItem));
  }
}

bool walkerGnssTxQueue(WalkerGnssTxKind kind, const uint8_t* bytes, size_t len) {
  if (!bytes || len == 0 || !g_queue) return false;
  size_t off = 0;
  bool ok = true;
  while (off < len) {
    WalkerGnssTxItem item = {};
    item.kind = kind;
    size_t n = len - off;
    if (n > sizeof(item.bytes)) n = sizeof(item.bytes);
    item.len = (uint16_t)n;
    memcpy(item.bytes, bytes + off, n);
    if (xQueueSend(g_queue, &item, 0) != pdTRUE) {
      g_stats.dropped++;
      ok = false;
      break;
    }
    g_stats.enqueued++;
    UBaseType_t depth = uxQueueMessagesWaiting(g_queue);
    g_stats.queueDepth = (uint16_t)depth;
    if (depth > g_stats.queueHighWater) g_stats.queueHighWater = (uint16_t)depth;
    off += n;
  }
  return ok;
}

bool walkerGnssTxQueueRtcmFromLora(const uint8_t* bytes, size_t len) {
  return walkerGnssTxQueue(WalkerGnssTxKind::RtcmFromLora, bytes, len);
}

bool walkerGnssTxQueueRtcmFromNtrip(const uint8_t* bytes, size_t len) {
  return walkerGnssTxQueue(WalkerGnssTxKind::RtcmFromNtrip, bytes, len);
}

bool walkerGnssTxQueuePairPayload(const String& payload) {
  uint8_t cs = 0;
  for (size_t i = 0; i < payload.length(); i++) cs ^= (uint8_t)payload[i];
  char out[200];
  int n = snprintf(out, sizeof(out), "$%s*%02X\r\n", payload.c_str(), cs);
  if (n <= 0 || n >= (int)sizeof(out)) return false;
  return walkerGnssTxQueue(WalkerGnssTxKind::PairCommand,
                           reinterpret_cast<const uint8_t*>(out),
                           (size_t)n);
}

void walkerGnssTxPump() {
  if (!g_serial || !g_queue) return;
  uint8_t budget = 8;
  while (budget-- > 0) {
    if (!g_hasActive) {
      if (xQueueReceive(g_queue, &g_active, 0) != pdTRUE) break;
      g_activeOffset = 0;
      g_hasActive = true;
    }
    int writable = g_serial->availableForWrite();
    if (writable <= 0) break;
    size_t remain = g_active.len - g_activeOffset;
    size_t n = remain;
    if (n > (size_t)writable) n = (size_t)writable;
    if (n > 64) n = 64;
    size_t wrote = g_serial->write(g_active.bytes + g_activeOffset, n);
    if (wrote == 0) break;
    g_activeOffset += wrote;
    g_stats.bytesWritten += wrote;
    if (g_activeOffset >= g_active.len) {
      g_hasActive = false;
      g_stats.written++;
    }
  }
  g_stats.queueDepth = (uint16_t)uxQueueMessagesWaiting(g_queue) + (g_hasActive ? 1 : 0);
}

void walkerGnssTxGetStats(WalkerGnssTxStats& out) {
  out = g_stats;
  if (g_queue) out.queueDepth = (uint16_t)uxQueueMessagesWaiting(g_queue);
}
```

- [ ] **Step 3: Wire setup and pump**

In `main.cpp`, include `gnss_tx.h`, call `walkerGnssTxSetup(gnssSerial);` immediately after `gnssSerial.begin(...)`, and call `walkerGnssTxPump();` at the start of `gnssPump()`.

- [ ] **Step 4: Move PAIR command writes to queue**

Change `sendGnssCommand(...)` so it builds the same log string but calls `walkerGnssTxQueuePairPayload(payload)` instead of writing to `gnssSerial` directly.

- [ ] **Step 5: Move NTRIP writes to queue**

Replace:

```cpp
gnssSerial.write(chunk, n);
```

with:

```cpp
walkerGnssTxQueueRtcmFromNtrip(chunk, n);
```

Keep `rtcmLogAppend(chunk, n, RTCM_SRC_NTRIP);` unchanged.

- [ ] **Step 6: Move LoRa writes to queue**

In `walker_lora.cpp`, include `gnss_tx.h`, remove `extern HardwareSerial gnssSerial;`, and replace:

```cpp
gnssSerial.write(g_payloadBuf, g_payloadIdx);
```

with:

```cpp
walkerGnssTxQueueRtcmFromLora(g_payloadBuf, g_payloadIdx);
```

### Task 3: LC29HDA Boot Config Cleanup

**Files:**
- Modify: `tools/rtk-walker/src/main.cpp`

- [ ] **Step 1: Remove stale PAIR400/PAIR513 state**

Delete `pair400RtkSent`, `pair513SaveSent`, and `pair050SaveStage` state where it is no longer used.

- [ ] **Step 2: Remove automatic `PAIR400,2` and `PAIR513` sends**

Delete the blocks that send `PAIR400,2` and `PAIR513`.

- [ ] **Step 3: Update reassert path**

When `PAIR050,1000` is reasserted due to measured rate drift, only reset the PAIR050 ACK/rate state. Do not reset any deleted PAIR400/PAIR513 state.

### Task 4: Verify and Commit

**Files:**
- All files changed above.

- [ ] **Step 1: Run regression script**

Run:

```bash
node tools/rtk-walker/scripts/check_lora_relay_regression.js
```

Expected: `LoRa relay regression check passed`.

- [ ] **Step 2: Build firmware**

Run:

```bash
pio run -d tools/rtk-walker -e jc3248w535-walker
```

Expected: successful PlatformIO build.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-05-27-walker-gnss-tx-isolation.md \
  tools/rtk-walker/scripts/check_lora_relay_regression.js \
  tools/rtk-walker/src/gnss_tx.h \
  tools/rtk-walker/src/gnss_tx.cpp \
  tools/rtk-walker/src/main.cpp \
  tools/rtk-walker/src/walker_lora.cpp \
  tools/rtk-walker/src/walker_lora.h
git commit -m "fix(walker): serialize gnss tx stream"
git push
```
