# RTK Walker: deterministic GNSS boot-config to fix RTK loss on motion

> Problem: the RTK walker (ESP32-S3 + Quectel LC29HDA) holds RTK FIX while
> stationary but drops straight to autonomous GPS (GGA quality 4 → 1) at the
> slightest motion, regaining FIX when set down again. RTCM via LoRa from the
> UNICORE UM960 base flows continuously and correctly. The behaviour worked in
> earlier commits, and reverting the firmware does NOT restore it.

**Goal:** make the LC29HDA's RTK configuration deterministic at every boot so a
persisted module-NVM setting can no longer silently break moving RTK, and
surface the diagnostics that distinguish a module-side cause from a base-side
(UM960) cause.

**Approach:** Approach 1 from the brainstorm - deterministic boot-config +
diagnostic readout. (Approaches 2 "manual reset" and 3 "fix the base" were
deferred; this change also tells us whether Approach 3 is needed.)

---

## Root-cause analysis (why this is the fix)

1. **The corrections are identical whether the walker is still or moving.** Same
   base, same LoRa stream. The only variable on motion is the rover's own GNSS
   engine - so "still = FIX, moving = GPS" is a rover-engine problem, not a
   corrections problem.
2. **The RTCM type-filter is not persistent.** `shouldDropRtcmType` /
   `g_rtcmDropTypes` (walker_lora.cpp) is set via the HTTP API only, never
   written to NVS, so a reflash clears it. Ruled out as the persistent cause.
3. **The firmware only ever sets the fix RATE.** `gnssPump()` sends `PAIR021`
   (version query) and `PAIR050,1000` (1 Hz) - it never asserts the DGPS/RTK
   mode or the navigation mode. `PAIR050` is saved in the module's NVM.
4. **A code revert reflashes the ESP32 but not the LC29HDA NVM.** So any drifted
   module setting survives every firmware change - which is exactly the reported
   symptom.
5. **Confirmed failure signature:** GGA quality 4 → **1** (autonomous, not even
   DGPS/float) at the slightest motion. The module abandons the differential
   solution entirely under motion. Consistent with the persistent DGPS mode no
   longer being RTK (`PAIR400` ≠ 2 → auto-fallback to autonomous under motion
   stress) and/or a non-kinematic navigation mode (`PAIR080`).
6. The prior research spec (`2026-05-22-lc29hda-5hz-rtk-analysis.md`) documents,
   with citations, that `PAIR400,<mode>` selects DGPS mode (0=off, 1=auto-fallback,
   **2=RTK, the correct rover default**) and explicitly recommends re-asserting
   `PAIR400,2` defensively. It also notes the LC29HDA is effectively L1-only RTK
   with the bases used, which makes moving FIX brittle and base-dependent - the
   reason we also need the base-diagnostic.

A persisted module setting that drifted (most likely `PAIR400` away from 2)
explains all of: works when still, fails on motion, survives code revert.

---

## Design

### 1. Boot-config asserts (the fix) - `tools/rtk-walker/src/main.cpp`

Add two idempotent, ACK-gated config asserts to the existing `gnssPump()` state
machine, mirroring the `PAIR050,1000` flow:

- **`PAIR400,2`** - force DGPS mode = RTK. Retry until `$PAIR001,400,0`.
- **`PAIR080,0`** - navigation mode = Normal (clears any over-filtering /
  non-kinematic mode). Retry until `$PAIR001,080,0`.

Mechanics (match the existing `pair050*` pattern):
- New static state per command: `pair400TxCount`/`pair400LastTxMs`/`pair400AckOk`
  and `pair080TxCount`/`pair080LastTxMs`/`pair080AckOk`.
- Extend `rememberPair001Ack(cmd, result, atMs)` to record `cmd==400` and
  `cmd==80` (result==0) into the new ack flags. (Note: the ACK echoes the numeric
  command id; verify whether it reports `400`/`80` vs zero-padded - parse both.)
- Sent after `PAIR021` + `PAIR050,1000`, gated on `sinceDetect >= 700` ms, 2 s
  retry interval, cap ~4 attempts then back off to 15 s (same as PAIR050).
- Re-asserted **every boot** (not runtime-reasserted - DGPS/nav mode don't drift
  at runtime the way rate can). This is what makes it self-healing across reboots
  and code changes.
- **No `PAIR513` save.** Asserting the known-good config at every boot is more
  robust than persisting a possibly-wrong state to NVM.

### 2. Diagnostic readout (decides module vs base)

- Log the `PAIR021` firmware version and the `$PAIR001,400/080/050` ACK results
  to the web console (`weblogf`) so the operator can confirm the module accepted
  the RTK config. (PAIR050 ACK logging already exists; extend to 400/080.)
- Surface the **RTCM-type histogram** that is already tracked in
  `g_rtcmTypes[]` (walker_lora.cpp) and already emitted in the JSON status
  (`rtcmTypes` array in main.cpp). Ensure it is readable from the web UI / status
  so we can see exactly which message types the UM960 base is streaming
  (presence of MSM7 1077/1087/1097/1127 + multi-constellation obs).

### 3. Decision criteria after flashing

- Moving FIX now holds → root cause was module-NVM drift (PAIR400/PAIR080),
  fixed and self-healing. Done.
- Still drops to quality 1 on motion **and** `$PAIR001,400,0` was ACKed → the
  cause is the **base** (UM960 not delivering usable multi-band corrections).
  That is a charger/base-side fix (Approach 3), out of scope here; the RTCM-type
  histogram from §2 provides the evidence (e.g. missing MSM7).

---

## Testing

- **Regression script** (`tools/rtk-walker/scripts/check_lora_relay_regression.js`):
  extend it to assert that the firmware emits `PAIR400,2` and `PAIR080,0` and
  tracks their ACKs (alongside the existing PAIR050 checks).
- **Manual bench** (user flashes - never auto-flash the walker):
  1. Flash, open the web console.
  2. Confirm `$PAIR001,400,0` and `$PAIR001,080,0` ACKs appear in the log.
  3. Stationary: confirm RTK FIX (quality 4).
  4. Move the walker: read GGA quality. FIX held → module fix worked.
  5. If still drops: read the RTCM-type histogram → base diagnosis.

---

## Non-goals

- Do not change the fix rate (the DA variant is hardware-locked to 1 Hz RTK).
- Do not modify the base (UM960) in this change.
- Do not `PAIR513`-save the config (assert at boot instead).
- No automatic flashing of the walker - the user flashes and monitors.

---

## Files touched

- `tools/rtk-walker/src/main.cpp` - new PAIR400/PAIR080 asserts + ACK tracking +
  config-ACK logging; ensure RTCM-type histogram is surfaced.
- `tools/rtk-walker/scripts/check_lora_relay_regression.js` - assert the new
  commands are emitted/ACK-tracked.
