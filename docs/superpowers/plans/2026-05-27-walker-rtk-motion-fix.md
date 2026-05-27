# Walker RTK-loss-on-motion: deterministic GNSS boot-config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the LC29HDA assert a complete RTK-rover config (`PAIR400,2` RTK mode + `PAIR080,0` normal nav mode) at every boot so a drifted module-NVM setting can no longer make it drop RTK FIX on motion, and surface the RTCM-type histogram so a base-side cause can be distinguished from a module-side one.

**Architecture:** Two new idempotent, ACK-gated config asserts are added to the existing `gnssPump()` state machine in `tools/rtk-walker/src/main.cpp`, mirroring the existing `PAIR050,1000` retry-until-`$PAIR001,050,0` pattern exactly. ACK detection extends the existing `rememberPair001Ack()`. The existing 2 s LoRa heartbeat gains a one-line RTCM-type histogram. Validation is the existing source-level regression script (`scripts/check_lora_relay_regression.js`, run with `node`); the real RTK behaviour is verified on hardware by the user (who flashes and monitors — never auto-flash the walker).

**Tech Stack:** C++ (Arduino framework, ESP32-S3), Quectel LC29HDA PAIR/NMEA protocol, Node.js regression script.

---

## File structure

| File | Responsibility | Change |
|------|----------------|--------|
| `tools/rtk-walker/src/main.cpp` | GNSS config state machine + LoRa heartbeat | Add PAIR400/PAIR080 ACK state + asserts + RTCM-type heartbeat line |
| `tools/rtk-walker/scripts/check_lora_relay_regression.js` | Source-level regression checks | Assert the new commands/ACK handling are present |

No new files. All changes follow the existing `pair050*` / heartbeat patterns in `main.cpp`.

---

## Task 1: ACK tracking for PAIR400 + PAIR080

**Files:**
- Modify: `tools/rtk-walker/src/main.cpp:444-453` (ack state + `rememberPair001Ack` + `*AckOkSince` helpers)
- Test: `tools/rtk-walker/scripts/check_lora_relay_regression.js`

Context: the ACK line `$PAIR001,<cmd>,<result>` is already parsed (main.cpp ~536-540) and forwarded to `rememberPair001Ack(cmd, res, atMs)`. `cmd` is the integer command id (e.g. `PAIR050`→`50`, `PAIR400`→`400`, `PAIR080`→`80`). We only need to record the new acks and add matching `*AckOkSince` predicates.

- [ ] **Step 1: Write the failing test**

Append to the end of `tools/rtk-walker/scripts/check_lora_relay_regression.js`:

```js
assertIncludes(
  mainCpp,
  "if (cmd == 400) pair400AckOkAtMs = atMs;",
  "rememberPair001Ack must record the PAIR400 (RTK-mode) ACK."
);
assertIncludes(
  mainCpp,
  "if (cmd == 80) pair080AckOkAtMs = atMs;",
  "rememberPair001Ack must record the PAIR080 (nav-mode) ACK."
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/rtk-walker/scripts/check_lora_relay_regression.js`
Expected: FAIL — prints "rememberPair001Ack must record the PAIR400 (RTK-mode) ACK." and exits 1.

- [ ] **Step 3: Write minimal implementation**

In `tools/rtk-walker/src/main.cpp`, replace this block (currently lines 444-453):

```cpp
static uint32_t pair050AckOkAtMs = 0;

static void rememberPair001Ack(int cmd, int result, uint32_t atMs) {
  if (result != 0) return;
  if (cmd == 50) pair050AckOkAtMs = atMs;
}

static bool pair050AckOkSince(uint32_t sinceMs) {
  return pair050AckOkAtMs != 0 && (int32_t)(pair050AckOkAtMs - sinceMs) >= 0;
}
```

with:

```cpp
static uint32_t pair050AckOkAtMs = 0;
static uint32_t pair400AckOkAtMs = 0;
static uint32_t pair080AckOkAtMs = 0;

static void rememberPair001Ack(int cmd, int result, uint32_t atMs) {
  if (result != 0) return;
  if (cmd == 50) pair050AckOkAtMs = atMs;
  if (cmd == 400) pair400AckOkAtMs = atMs;
  if (cmd == 80) pair080AckOkAtMs = atMs;
}

static bool pair050AckOkSince(uint32_t sinceMs) {
  return pair050AckOkAtMs != 0 && (int32_t)(pair050AckOkAtMs - sinceMs) >= 0;
}

static bool pair400AckOkSince(uint32_t sinceMs) {
  return pair400AckOkAtMs != 0 && (int32_t)(pair400AckOkAtMs - sinceMs) >= 0;
}

static bool pair080AckOkSince(uint32_t sinceMs) {
  return pair080AckOkAtMs != 0 && (int32_t)(pair080AckOkAtMs - sinceMs) >= 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tools/rtk-walker/scripts/check_lora_relay_regression.js`
Expected: PASS — no error output, exits 0.

- [ ] **Step 5: Commit**

```bash
git add tools/rtk-walker/src/main.cpp tools/rtk-walker/scripts/check_lora_relay_regression.js
git commit -m "feat(walker): track PAIR400/PAIR080 ACKs"
```

---

## Task 2: PAIR400,2 + PAIR080,0 boot-config asserts

**Files:**
- Modify: `tools/rtk-walker/src/main.cpp:1287-1300` (add per-command state) and `:1370-1376` (add assert blocks after the PAIR050 ACK-detect block)
- Test: `tools/rtk-walker/scripts/check_lora_relay_regression.js`

Context: this mirrors the existing PAIR050 assert (main.cpp 1360-1375): send the command, retry every 2 s for the first 4 attempts (then 15 s), and mark `*Acked` once `*AckOkSince(lastTxMs)` is true. These are asserted once per boot (DGPS/nav mode don't drift at runtime), so no continuous re-assert loop is needed.

- [ ] **Step 1: Write the failing test**

Append to the end of `tools/rtk-walker/scripts/check_lora_relay_regression.js`:

```js
assertIncludes(
  mainCpp,
  'sendGnssCommand("PAIR400,2");',
  "gnssPump must assert PAIR400,2 (force DGPS mode = RTK) at boot."
);
assertIncludes(
  mainCpp,
  'sendGnssCommand("PAIR080,0");',
  "gnssPump must assert PAIR080,0 (normal navigation mode) at boot."
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/rtk-walker/scripts/check_lora_relay_regression.js`
Expected: FAIL — prints "gnssPump must assert PAIR400,2 (force DGPS mode = RTK) at boot." and exits 1.

- [ ] **Step 3a: Add per-command state**

In `tools/rtk-walker/src/main.cpp`, find this line (currently line 1300):

```cpp
static uint32_t lastRateReassertMs = 0;
```

and insert immediately ABOVE it:

```cpp
// PAIR400 (force DGPS mode = RTK) + PAIR080 (normal nav mode) boot-assert
// state. Mirror the pair050 retry-until-ACK pattern. Asserted once per boot
// so a drifted module-NVM DGPS/nav mode can't silently break moving RTK.
static uint32_t pair400LastTxMs = 0;
static uint8_t  pair400TxCount  = 0;
static bool     pair400Acked    = false;
static uint32_t pair080LastTxMs = 0;
static uint8_t  pair080TxCount  = 0;
static bool     pair080Acked    = false;
```

- [ ] **Step 3b: Add the assert blocks**

In `tools/rtk-walker/src/main.cpp`, find the end of the PAIR050 ACK-detect block followed by the reassert block (currently lines 1370-1377):

```cpp
  if (!pair050Acked && pair050TxCount > 0 && pair050AckOkSince(pair050LastTxMs)) {
    pair050Acked = true;
    pair050AckedAtMs = millis();
    pair050RateReady = true;
    weblogf("[gnss] PAIR050 ACKed after %u attempt(s)\n", (unsigned) pair050TxCount);
  }

  if (enforceDa1Hz && gnssRateHz > 2 && sinceDetect >= 5000 &&
```

and insert the two assert blocks BETWEEN the closing `}` of the PAIR050 ACK-detect block and the `if (enforceDa1Hz && gnssRateHz > 2 ...` line, so it reads:

```cpp
  if (!pair050Acked && pair050TxCount > 0 && pair050AckOkSince(pair050LastTxMs)) {
    pair050Acked = true;
    pair050AckedAtMs = millis();
    pair050RateReady = true;
    weblogf("[gnss] PAIR050 ACKed after %u attempt(s)\n", (unsigned) pair050TxCount);
  }

  // Force DGPS mode = RTK (PAIR400,2). If the module's NV-stored DGPS mode
  // drifted to 0 (off) or 1 (auto-fallback), the rover holds RTK while
  // stationary but falls back to autonomous GPS (GGA quality 1) under motion.
  // Re-assert every boot so module-NVM history can't silently break moving RTK.
  if (sinceDetect >= 700 && !pair400Acked && pair400TxCount < 4) {
    uint32_t retryMs = (pair400TxCount < 4) ? 2000 : 15000;
    if (pair400TxCount == 0 || nowCfgMs - pair400LastTxMs >= retryMs) {
      sendGnssCommand("PAIR400,2");
      pair400LastTxMs = nowCfgMs;
      if (pair400TxCount < UINT8_MAX) pair400TxCount++;
      weblogf("[gnss] PAIR400 RTK-mode attempt %u\n", (unsigned) pair400TxCount);
    }
  }
  if (!pair400Acked && pair400TxCount > 0 && pair400AckOkSince(pair400LastTxMs)) {
    pair400Acked = true;
    weblogf("[gnss] PAIR400 RTK mode ACKed after %u attempt(s)\n", (unsigned) pair400TxCount);
  }

  // Force navigation mode = Normal (PAIR080,0) — clears any over-filtering /
  // non-kinematic nav mode that would reject motion. Same boot-assert pattern.
  if (sinceDetect >= 700 && !pair080Acked && pair080TxCount < 4) {
    uint32_t retryMs = (pair080TxCount < 4) ? 2000 : 15000;
    if (pair080TxCount == 0 || nowCfgMs - pair080LastTxMs >= retryMs) {
      sendGnssCommand("PAIR080,0");
      pair080LastTxMs = nowCfgMs;
      if (pair080TxCount < UINT8_MAX) pair080TxCount++;
      weblogf("[gnss] PAIR080 nav-mode attempt %u\n", (unsigned) pair080TxCount);
    }
  }
  if (!pair080Acked && pair080TxCount > 0 && pair080AckOkSince(pair080LastTxMs)) {
    pair080Acked = true;
    weblogf("[gnss] PAIR080 nav mode ACKed after %u attempt(s)\n", (unsigned) pair080TxCount);
  }

  if (enforceDa1Hz && gnssRateHz > 2 && sinceDetect >= 5000 &&
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tools/rtk-walker/scripts/check_lora_relay_regression.js`
Expected: PASS — no error output, exits 0.

- [ ] **Step 5: Commit**

```bash
git add tools/rtk-walker/src/main.cpp tools/rtk-walker/scripts/check_lora_relay_regression.js
git commit -m "feat(walker): assert PAIR400,2 RTK mode + PAIR080,0 nav mode at boot"
```

---

## Task 3: RTCM-type histogram in the LoRa heartbeat

**Files:**
- Modify: `tools/rtk-walker/src/main.cpp:1428-1434` (inside the `if (ls.moduleReady)` heartbeat block, after the existing `weblogf`)
- Test: `tools/rtk-walker/scripts/check_lora_relay_regression.js`

Context: `WalkerLoraStats` already carries `rtcmTypes[WALKER_LORA_RTCM_TYPE_SLOTS]`, each with `.type` (uint16) and `.count` (uint32). The 2 s heartbeat already calls `walkerLoraGetStats(ls)` and prints `lastRtcmType`; we add a second line listing every seen type so the console shows the UM960 base's full message set (e.g. whether MSM7 1077/1087/1097/1127 are present).

- [ ] **Step 1: Write the failing test**

Append to the end of `tools/rtk-walker/scripts/check_lora_relay_regression.js`:

```js
assertIncludes(
  mainCpp,
  '[lora] rtcm-types',
  "LoRa heartbeat must log the RTCM-type histogram for base-vs-module diagnosis."
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/rtk-walker/scripts/check_lora_relay_regression.js`
Expected: FAIL — prints "LoRa heartbeat must log the RTCM-type histogram for base-vs-module diagnosis." and exits 1.

- [ ] **Step 3: Write minimal implementation**

In `tools/rtk-walker/src/main.cpp`, find the end of the existing heartbeat `weblogf(...)` call inside `if (ls.moduleReady) {` — it ends with:

```cpp
              ls.lastRtcmMsAgo == UINT32_MAX ? -1L : (long) ls.lastRtcmMsAgo,
              rawHex);
    }
    lastLoraStatsMs = nowLora;
```

Insert the histogram builder between the closing `);` of that `weblogf` and the closing `}` of the `if (ls.moduleReady)` block, so it reads:

```cpp
              ls.lastRtcmMsAgo == UINT32_MAX ? -1L : (long) ls.lastRtcmMsAgo,
              rawHex);
      // RTCM message-type histogram (type:count, comma-separated). Lets us
      // see exactly which messages the UM960 base is streaming — if the
      // multi-band MSM7 types (1077/1087/1097/1127) are missing the rover is
      // L1-only and moving RTK will be brittle regardless of module config.
      char typesStr[96];
      size_t tp = 0;
      typesStr[0] = '\0';
      for (uint8_t i = 0; i < WALKER_LORA_RTCM_TYPE_SLOTS; i++) {
        if (ls.rtcmTypes[i].type == 0) continue;
        tp += snprintf(typesStr + tp, sizeof(typesStr) - tp, "%s%u:%lu",
                       tp ? "," : "", (unsigned) ls.rtcmTypes[i].type,
                       (unsigned long) ls.rtcmTypes[i].count);
        if (tp >= sizeof(typesStr) - 1) break;
      }
      weblogf("[lora] rtcm-types %s\n", typesStr[0] ? typesStr : "(none)");
    }
    lastLoraStatsMs = nowLora;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tools/rtk-walker/scripts/check_lora_relay_regression.js`
Expected: PASS — no error output, exits 0.

- [ ] **Step 5: Commit**

```bash
git add tools/rtk-walker/src/main.cpp tools/rtk-walker/scripts/check_lora_relay_regression.js
git commit -m "feat(walker): log RTCM-type histogram in LoRa heartbeat"
```

---

## Task 4: Hardware verification (manual — user flashes)

**Files:** none (verification only).

> The user flashes the walker and monitors. Do NOT run `pio run -t upload` or grab the serial port.

- [ ] **Step 1: User builds + flashes** the walker firmware from the current branch and opens the web console (or serial).

- [ ] **Step 2: Confirm config ACKs.** Within ~10 s of boot the web log shows:
  - `[gnss] PAIR400 RTK mode ACKed after N attempt(s)`
  - `[gnss] PAIR080 nav mode ACKed after N attempt(s)`
  - `[gnss] PAIR050 ACKed after N attempt(s)` (unchanged)
  If a `PAIR400`/`PAIR080` ACK never appears, note how many attempts were logged (the command was sent but the module didn't ACK — report back).

- [ ] **Step 3: Stationary check.** With the walker still, confirm RTK FIX (GGA quality 4) on the TFT / status.

- [ ] **Step 4: Motion check.** Move the walker. Read the GGA quality:
  - **Holds FIX (4) while moving → fixed.** Root cause was module-NVM drift; the boot-assert now self-heals it.
  - **Still drops to quality 1 → it's the base.** Proceed to Step 5.

- [ ] **Step 5: Base diagnosis (only if Step 4 still fails).** Read the `[lora] rtcm-types …` heartbeat line. If the multi-band MSM7 types (1077/1087/1097/1127) are absent — only legacy/L1 messages present — the UM960 base is not delivering usable multi-band corrections. That is a charger/base-side fix (deferred Approach 3), out of scope for this plan; capture the histogram and the `PAIR400`/`PAIR080` ACK lines for that follow-up.

---

## Self-review

**Spec coverage:**
- §1 boot-config asserts (PAIR400,2 + PAIR080,0, ACK-gated retry, every boot, no PAIR513) → Tasks 1+2. ✓
- §2 diagnostics: ACK logging → Task 2 weblogf lines; RTCM-type histogram surfaced → Task 3. ✓
- §3 decision criteria (module vs base) → Task 4 Steps 4-5. ✓
- Testing: regression-script asserts → Tasks 1-3 Step 1; manual hardware → Task 4. ✓
- Non-goals (no rate change, no base change, no PAIR513, no auto-flash) → respected; Task 4 explicitly warns against auto-flash. ✓

**Placeholder scan:** none — every code step shows full code and exact anchors.

**Type/identifier consistency:** `pair400AckOkAtMs`/`pair080AckOkAtMs` (Task 1) match `pair400AckOkSince`/`pair080AckOkSince` (Task 1) and the `pair400Acked`/`pair400TxCount`/`pair400LastTxMs` + `pair080*` state (Task 2). `rememberPair001Ack` uses `cmd == 400`/`cmd == 80` consistent with the ACK ids. Heartbeat uses `ls.rtcmTypes[i].type`/`.count` which exist on `WalkerLoraStats`. ✓
