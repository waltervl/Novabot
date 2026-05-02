# Charger Firmware Gap Analysis — Stock v0.4.0 vs OpenNova v0.1.1

**Date:** 2026-05-02
**Method:** Side-by-side comparison: `research/ghidra_output/charger_v040_decompiled.c` (296k lines, 7.6 MB) vs `firmware/charger/` (3.3k lines source).
**Scope:** Charger ESP32-S3 firmware only — not the mower, not the app, not the server.
**Output:** Priority matrix + deep-dive per CRIT/HIGH gap.

---

## TL;DR — Top Findings

1. **CRIT — RTCM forwarding missing** (subsys 10): UM980 never configured as base, raw bytes never forwarded. Mower silently runs without RTK corrections on OpenNova-flashed chargers. *(In progress — bd issue Novabot-zzg, fix being implemented.)*
2. **HIGH — MQTT command dispatcher 50% coverage** (subsys 4): only 9 of ~18 stock commands implemented. Missing config-via-MQTT path; works because BLE is the primary provisioning route.
3. **HIGH — BLE provisioning is plaintext** (subsys 3): stock encrypts BLE responses (Ghidra `FUN_4200ce20`), OpenNova sends plain JSON. Stock-app ↔ OpenNova-charger combo broken; OpenNova-app ↔ OpenNova-charger works.
4. **HIGH — LoRa channel scan timeout/broadcast missing** (subsys 14): scan can hang indefinitely if no channel passes RSSI threshold; mower never receives `[0x36,0x01,...]` scan-complete frame.
5. **MED — Hall sensor task is a stub** (subsys 13): no GPIO polling, no state machine, no relay control. Field operation works (mower side detects docking independently), but legacy Hall-feedback flow broken.

Other 9 subsystems: **functional parity OK** for the field-tested happy path.

---

## Priority Matrix (14 subsystems)

| # | Subsystem | OpenNova file | Stock Ghidra | Coverage | Risk |
|---|-----------|---------------|--------------|----------|------|
| 1 | Boot / setup orchestration | `main.cpp setup()` | `FUN_420087d4` startup | 90% | LOW |
| 2 | WiFi STA+AP | `wifi_manager.cpp` | `FUN_42060e78` (122619) | 80% | LOW |
| 3 | **BLE provisioning** | `ble_provisioning.cpp` | shared dispatcher 32540+ | 80% (no encryption) | **HIGH** |
| 4 | **MQTT command dispatcher** | `mqtt_handler.cpp::mqttDispatchCommand` | `FUN_4200e8c4` | 50% (9/18 cmds) | **HIGH** |
| 5 | MQTT status publish | `mqtt_handler.cpp::mqttPublishStatus` | `FUN_4200f00c` | 100% | OK |
| 6 | LoRa driver (EBYTE hardware) | `lora_driver.cpp` | EBYTE config | 100% | OK |
| 7 | LoRa frame protocol | `lora_protocol.cpp` | `FUN_4200b2bc` | 100% | OK |
| 8 | LoRa task — queue dispatch + heartbeat | `main.cpp::loraConfigTask` | `FUN_4200b8d4` | 90% (q=0x27 missing) | MED |
| 9 | LoRa command builders 0x30–0x36 | `lora_commands.cpp` | per-category | 95% (0x36 resp missing) | MED |
| 10 | **GPS / RTK base + RTCM forward** | `gps_parser.cpp` | `FUN_42009ed4` + state 0x0e | 30% → 100% (in progress) | **CRIT** (in fix) |
| 11 | NVS storage layout | `nvs_storage.cpp` | `nvs_open` + key strings | 100% | OK |
| 12 | AES + OTA + UART console | `aes_crypto.cpp`, `ota_handler.cpp`, `uart_console.cpp` | OTA task + crypto | 90% | LOW |
| 13 | **Charger Hall sensor task** | `main.cpp::chargerConfigTask` | `FUN_4200a2bc` | 30% (stub) | MED |
| 14 | **LoRa channel scan state machine** | `main.cpp::channelScanStep` | `FUN_4200b8d4` scan block 31533–31600 | 80% | **HIGH** |

**Overall coverage estimate:** ~80% behavioral parity for the field-tested happy path. Gaps cluster around (a) provisioning paths and (b) RTK base forwarding.

---

## Deep-Dive: HIGH/CRIT Gaps

### Gap A (CRIT, in fix) — RTCM forwarding missing (subsys 10)

**Stock behavior** (`FUN_42009ed4` rtk_config_task @ 29527, byte forwarder @ 29191, LoRa task @ 31302):

- UM980 configured as RTK base via state machine: AUTO_BASE / MOVING_BASE / FIXED_BASE
- State 0x0e (PPS-active running): all UM980 UART bytes (NMEA + RTCM3 mixed) → `xStreamBufferSend(*DAT_42000a38, …)` → LoRa queue cmd 0x03 → frame `[0x02 0x02 | addr | len | 0x31 | bytes | xor | 0x03 0x03]`
- Mower STM32 receives RTCM via LoRa → routes to its GNSS chip's RTCM input UART → cm-level RTK FIX

**OpenNova behavior:**

- `gpsInit` only opens UART2 — no UM980 base-mode commands
- `gpsTaskFunc` parses only `$GNGGA` lines; RTCM3 binary discarded
- `loraBuildRtkRelay` sends only the GNGGA NMEA string as `[0x31, …]`
- Mower has no usable RTCM source — falls back to SBAS (~30 cm – 1 m), never RTK FIX

**Impact:** Latent silent regression. Mowers on OpenNova-flashed chargers cannot achieve cm-level positioning. Probably masked in casual operation by aruco markers + dead-reckoning, but mowing-line accuracy degraded and edge-cut precision worse.

**Fix sketch:**
1. `gpsInit` — send `MODE BASE TIME 60 1.5 2.5` + `RTCM10{06,33,74,84,94,124} COM1 [1|5]` + `SAVECONFIG` to UM980
2. `gps_parser.cpp` — raw byte read into FreeRTOS stream buffer (4 KB), parallel GNGGA parse for diagnostics
3. `main.cpp loraConfigTask` — implement `case LORA_Q_RTK_RELAY:` that drains stream buffer in ≤180 B chunks, builds `[0x31, …]` frames
4. (Walker support) parallel MQTT publish on topic `rtk/charger/<SN>/raw`

**Status:** In progress. `gps_parser.{h,cpp}` + `config.h` already updated (compile clean). `main.cpp` refactor pending. Bd issue: **Novabot-zzg**.

**Reference:** `research/documents/charger-rtcm-flow-analysis.md` (full byte-for-byte breakdown).

---

### Gap B (HIGH) — MQTT command dispatcher 50% coverage (subsys 4)

**Stock command set** (Ghidra `FUN_4200e8c4` + dispatcher branches at 32540+):

| Command | Purpose |
|---------|---------|
| `get_wifi_info` | Read STA/AP config from NVS |
| `set_wifi_info` | Write STA/AP config to NVS |
| `get_signal_info` | Report LoRa RSSI sample |
| `set_rtk_info` | Configure RTK fixed-base coordinates |
| `set_lora_info` | Set LoRa addr + channel + scan range (HC/LC) |
| `get_lora_info` | Read LoRa config |
| `set_mqtt_info` | Set broker host/port |
| `get_cfg_info` | Read commit flag / device config |
| `set_cfg_info` | Write commit flag / timezone |
| `get_dev_info` | Report SN + firmware version + hardware |
| `ota_version_info` | Report current FW version |
| `ota_upgrade_cmd` | Trigger OTA download + flash |
| `start_run`, `pause_run`, `resume_run`, `stop_run`, `stop_time_run`, `go_pile` | Mowing relays |

**OpenNova command set** (`mqttDispatchCommand` lines 234–373):

`get_lora_info`, `ota_version_info`, `ota_upgrade_cmd`, `start_run`, `pause_run`, `resume_run`, `stop_run`, `stop_time_run`, `go_pile` (9 commands, all matching stock).

**Missing:** `get_wifi_info`, `set_wifi_info`, `get_signal_info`, `set_rtk_info`, `set_lora_info`, `set_mqtt_info`, `get_cfg_info`, `set_cfg_info`, `get_dev_info` (9 commands).

**Impact:** Server cannot reconfigure WiFi/MQTT/LoRa via MQTT. All config flows through BLE provisioning (which is the OpenNova primary path anyway, so currently not blocking). Production gaps:
- Cannot remotely re-key LoRa pair after charger swap without physical BLE access
- Cannot push timezone updates via MQTT
- Cannot query device firmware version + hardware info from server (dashboard discovery)
- Cannot read live LoRa RSSI samples for monitoring

**Fix sketch:** Implement each missing command with the same JSON pattern existing dispatcher uses. Each command:
1. Parse JSON params (some are objects, some are scalars)
2. Read or write NVS
3. Trigger a queue command if state needs to propagate (e.g., `set_lora_info` → SCAN_CHANNEL queue)
4. Publish `<cmd>_respond` with result

Estimated effort: 1 day (most are mechanical; `set_rtk_info` is the only one needing care because it interacts with the RTK fix being added in Gap A).

**Suggested decomposition:** 3 bd sub-issues — (a) wifi/mqtt info commands, (b) lora/rtk/cfg info commands, (c) signal/dev info commands.

---

### Gap C (HIGH) — BLE provisioning is plaintext (subsys 3)

**Stock behavior** (Ghidra dispatcher at 32540+, response path at 32830):

- Stock has identical 9-command set: `get_wifi_info`, `set_wifi_info`, `get_signal_info`, `set_rtk_info`, `set_lora_info`, `set_mqtt_info`, `get_cfg_info`, `set_cfg_info`, `get_dev_info`
- After serializing response JSON, calls `FUN_4200ce20()` (line 32830) — likely AES encryption (matches the AES decrypt path on inbound)
- Frame format: `ble_start` marker → chunked payload → `ble_end` marker (matches OpenNova)
- After `set_cfg_info value=1`: relays config to mower over LoRa (`FUN_42060d58`) → 1 s delay → reboot

**OpenNova behavior:**

- Same 9 commands handled (lines 53–66, dispatch via `dispatchSharedCommand`)
- `aes_crypto.cpp` exists but is NOT called from BLE path — both inbound and outbound JSON is plaintext
- Same `ble_start` / `ble_end` framing
- `set_cfg_info value=1`: same flow (`sendConfigToMower` → 1 s delay → `ESP.restart()`)

**Impact:**
- OpenNova-app ↔ OpenNova-charger: works (both ends plaintext).
- Stock-Novabot-app ↔ OpenNova-charger: broken — stock app sends AES-encrypted frames, OpenNova charger tries to JSON-parse them and fails.
- OpenNova-app ↔ stock-charger (post-recovery): broken — OpenNova app sends plaintext, stock charger expects AES.

**Why HIGH not CRIT:** the OpenNova ecosystem is end-to-end consistent today. Becomes CRIT the moment a user mixes app and firmware versions — common after a partial flash or recovery scenario.

**Fix sketch:**
1. Move outbound JSON through `aesEncrypt(serialNumber, …)` before `setValue/notify`
2. On inbound, attempt `aesDecrypt` first; if it fails, fall back to raw JSON for backward compat with current OpenNova app installs
3. Once new OpenNova app version ships with encryption, drop the plaintext fallback

This same dual-path is already used in `mqtt_handler.cpp::onMqttMessage` (lines 65–80) — copy that pattern into BLE handler.

---

### Gap D (HIGH) — LoRa channel scan: no timeout, no scan-complete broadcast (subsys 14)

**Stock behavior** (Ghidra `FUN_4200b8d4` lines 31533–31600 + 31594):

- Adaptive RSSI scan: UP from current channel to `HC`, then DOWN to `LC`. Threshold 0x92 (-110 dBm).
- After scan completes (channel found OR all 0x22=34 channels sampled): writes new channel to NVS
- Sends scan-response frame to mower: `[0x36, 0x01, hc, lc, best_channel]` (line 31479–31485)
- Has timeout safeguard inferred from `LORA_SCAN_TIMEOUT_S = 60` config constant + outer state-machine fallback

**OpenNova behavior** (`channelScanStep` + state machine in `main.cpp`):

- Same RSSI sweep, same threshold, same bubble-sort, same NVS write
- `loraSetChannel(loraGlobalCfg.channel)` after scan persists locally
- **No scan-response builder** — mower never receives `[0x36, …]` confirmation
- **No timeout** — if every channel is above -110 dBm AND fewer than 34 samples taken (e.g., HC – LC < 34), scan can deadlock the LoRa task

**Impact:**
- Mower unaware that charger has selected a new channel → mower keeps listening on old channel → LoRa link loss until manual reconfig
- LoRa task can hang during scan, blocking heartbeat polls

**Fix sketch:**
1. Add `loraBuildScanResponse(buf, hc, lc, channel)` in `lora_commands.cpp` → `[0x36, 0x01, hc, lc, channel]` 5 bytes
2. In `loraConfigTask` after `bubbleSortBestChannel` returns: send scan response over LoRa
3. Add scan timeout: track `scanStartMs = millis()`; if `millis() - scanStartMs > LORA_SCAN_TIMEOUT_S*1000`, abort with current best (or fall back to default channel)
4. Optional: also enqueue a CONFIG_APPLY frame so mower re-syncs

Estimated effort: 2–3 hours.

---

## Appendix — MED / LOW Gaps (one-liners)

| # | Subsystem | Gap | Risk |
|---|-----------|-----|------|
| 1 | Boot | Stock has BLE always-on; OpenNova only when WiFi unset. Different recovery semantics. | LOW |
| 2 | WiFi | AP SSID format possibly differs (`CHARGER_PILE_xxx` in stock vs raw SN in OpenNova) — needs runtime confirm | LOW |
| 2 | WiFi | `wifi_scan` MQTT command not implemented (RSSI list, signal-quality reporting) | LOW |
| 8 | LoRa task | Queue cmd `0x27` (CONFIG_VERIFY) — stock retries config write up to 3 times with ACK verification; OpenNova writes once, no retry | MED |
| 8 | LoRa task | Queue cmd `0x04` (GPS_ACK) — OpenNova sends `[0x33, lat, lon]` doubles. Stock calls undocumented `FUN_4200b7ac()` — payload unverified, may differ | MED |
| 9 | LoRa builders | Category 0x36 scan response (covered in Gap D above) | HIGH |
| 12 | OTA | Encryption key derivation matches stock; no known gaps. UART console commands subset of stock factory test commands | LOW |
| 13 | Hall task | OpenNova has no Hall GPIO polling, no state machine, no relay control. Stock polls every ~40 ms. Field operation works (mower has its own dock-detect). | MED |

---

## Suggested bd Issues to File

| Priority | Title | Subsys |
|----------|-------|--------|
| P1 (in flight as Novabot-zzg) | Fix OpenNova charger RTCM forwarding | 10 |
| P2 | Implement missing 9 MQTT dispatcher commands (set_wifi_info, set_lora_info, set_mqtt_info, set_cfg_info, get_wifi_info, get_cfg_info, get_dev_info, get_signal_info, set_rtk_info) | 4 |
| P2 | Add AES encryption to BLE provisioning request/response (with plaintext fallback for transition) | 3 |
| P2 | LoRa channel scan: add timeout safeguard + scan-complete broadcast `[0x36,0x01,hc,lc,ch]` | 14 |
| P3 | Implement queue cmd `0x27` (CONFIG_VERIFY) with retry + ACK verification | 8 |
| P3 | Verify queue cmd `0x04` GPS_ACK payload format against stock `FUN_4200b7ac` | 8 |
| P4 | Hall sensor task: add GPIO polling + state machine + relay control (only if needed for legacy mowers) | 13 |
| P4 | WiFi: add `wifi_scan` MQTT command + AP SSID format check | 2 |

---

## Out-of-Scope (Not Investigated)

- **App side** — covered by `research/documents/gap_analysis_novabot_vs_opennova.md` (last updated 2026-04-18)
- **Mower firmware** — different binary, different gaps
- **Server** — no stock equivalent to compare against
- **Performance** — no profiling done; assume parity until measured
- **Security audit** — only encryption presence/absence noted, no crypto strength review

---

## References

- Stock decompile: `research/ghidra_output/charger_v040_decompiled.c`
- OpenNova source: `firmware/charger/{src,include}/`
- RTCM analysis (Gap A): `research/documents/charger-rtcm-flow-analysis.md`
- App-side gap analysis: `research/documents/gap_analysis_novabot_vs_opennova.md`
- LoRa pair memory: `working-lora-pair.md` (charger+mower addr+channel rule)
- BLE protocol reference: `docs/reference/BLE.md`
- MQTT protocol reference: `docs/reference/MQTT.md`
