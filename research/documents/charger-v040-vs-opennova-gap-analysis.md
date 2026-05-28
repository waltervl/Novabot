# Charger v0.4.0 vs OpenNova — Full Gap Analysis

Stock binary: `/Users/rvbcrs/GitHub/Novabot/research/firmware/charger_firmware_v0.4.0.bin`
Ghidra source: `/Users/rvbcrs/GitHub/Novabot/research/ghidra_output/charger_v040_decompiled.c` (296,528 lines)
OpenNova source: `/Users/rvbcrs/GitHub/Novabot/firmware/charger/{src,include}/`

All `FUN_…` / `PTR_s_…` references use the Ghidra labels in the file above.
All decimal line numbers refer to that same file unless prefixed `bin:` (binary file offset) or `s:` (strings file at `/tmp/charger_v040_strings.txt`).

---

## 1. Executive Summary

| Metric | Stock v0.4.0 | OpenNova @ HEAD | Delta |
|---|---|---|---|
| FreeRTOS tasks | **13** (`mqtt_config`, `lora_config`, `rtk_config`, `charger_config`, `cs_gpio`, `wifi_config`, `spp/ble`, `status_contro`, `https_client`, `tcp_server`, `uart1_event`, `uart2_event`, `advanced_ota_example`) | **6** (`wifi_task`, `mqtt_config_task`, `lora_config_task`, `rtk_config_task` (=gpsTaskFunc), `charger_config_task`, `ota_task`) | -7 tasks |
| LoRa categories | 7 (0x30-0x36) | 7 (0x30-0x36) | parity |
| LoRa queue cmds | 14 distinct ids | 12 | -2 (`PING` 0x07, `CONFIG_VERIFY` 0x27 missing) |
| MQTT-only cmds | 9 | 9 | parity (set of names matches) |
| BLE/shared cmds | 9 | 9 | parity (logic for `set_lora_info` / `set_rtk_info` is partial) |
| RTK FSM states | 15 (`0..0xe`) | 0 (boot-time init only) | **critical** — no runtime FSM |
| UM980 commands | 12 distinct | 11 (+SBAS DISABLE added by OpenNova) | parity-ish (init-time only) |
| NVS namespaces | 3 (`fctry`, `storage`, `log_status`) | 2 (`fctry`, `storage`) | -1 (`log_status` partition reset path missing) |
| NVS keys | 8 + sn_code/sn_flag | identical names | parity |
| UART debug single-chars | 12 (`v a m f o w d @ r b` + SN_GET / SN_SET:* / LORARSSI) | 12 (same set + SN_SET:` syntax fork — see §6) | minor diff |
| AES-128-CBC | yes (key=`abcdabcd1234`+SN[-4:], IV=`abcd1234abcd1234`) | yes (identical) | parity |
| OTA paths | (a) MQTT-triggered `esp_https_ota` from URL **(b) raw-TCP server with binary frame protocol** | MQTT-triggered HTTP OTA only | **(b) missing** |
| TCP frame OTA | `0x02 0x02 0x07 0xFF len_hi len_lo … XOR 0x03 0x03` with sub-cmd `0x3a [0x01 / 0x03 / 0x05 / 0x07]` | not implemented | **gap** |
| `up_status_info` cadence | every ~2 s (4× 500ms) | every ~2 s (4× 500ms) | parity |
| Status bitfield | `bit0=GPS_valid \| bit8=RTK_fixed \| (rssi<<1) \| (sats<<24)` | identical | parity |
| GPIO event task | yes (`cs_gpio_task` with RTK_STAT, RTK_TIMEPULSE, HALL1/HALL2, temp pins) | only placeholder hall poll | **critical** — no event-driven GPIO |
| 5×ROS-like sensors via LoRa | hall+IRQ+timepulse+RTK_STAT+temp | hall+IRQ only | -3 sensor sources |
| BLE provisioning | full GATT + bond / passkey / MITM, raw-MAC adv (0x66 0x55) | identical UUIDs, no MITM/passkey, raw-MAC adv (0x66 0x55 …) | minor (no bonding) |
| WiFi mode | APSTA mode 3, BW20, proto 7 | APSTA mode 3, default proto | parity-ish |

**Critical gaps (block mower interop or RTK quality):**
1. No `rtk_config_task` runtime FSM — UM980 base mode never re-armed after WiFi/LoRa reconfig or PPS event.
2. No `cs_gpio_task` interrupt handler — hall sensor, RTK timepulse (PPS), and RTK_STAT pin events ignored at runtime.
3. No `tcp_server_task` — second OTA path (binary protocol, port-unknown TCP) missing → cannot accept LAN-side firmware push.
4. No `status_contro_task` — heartbeat / "no MQTT command for 5 min" → no auto-reboot.
5. No `uart1_event_task` / `uart2_event_task` — UART driven via polling, will miss bursts at >115200 baud and starve LoRa during RTCM floods.
6. LoRa queue 0x07 (`PING`) and 0x27 (`CONFIG_VERIFY`) are not implemented → no LoRa link health probe and no post-channel-scan verify before NVS commit.

**Non-critical gaps:** BLE bonding/passkey, `log_status` NVS partition wipe on `d` command, hard-coded `mqtt-dev.lfibot.com` redirect on SN_SET, advanced cJSON validation (`cJSON_IsNull` checked vs OpenNova's truthy-eval).

**MSM7 RTCM:** stock emits MSM4 (`1074/1084/1094/1124`). OpenNova already emits MSM4 too. Switching to MSM7 (`1077/1087/1097/1127`) needs only the `gpsInit()` command list update + a `CONFIG SIGNALGROUP 2` precursor (see §7); no LoRa/MQTT protocol change.

**Recommended sequencing:**
1. `cs_gpio_task` + RTK_STAT/PPS/hall pins (1 day) — enables charger detect + jam recovery.
2. `rtk_config_task` FSM (2 days) — production-ready base behavior, runtime UM980 reconfig.
3. UART event tasks (1 day) — only after #1/#2 so we can stress-test.
4. `status_contro_task` watchdog (½ day).
5. LoRa queues 0x07/0x27 (½ day).
6. TCP server OTA — defer; OpenNova has its own OTA story.

---

## 2. Stock v0.4.0 Feature Inventory

### 2.1. FreeRTOS Tasks

| Task name | Created by | Priority | Stack | Core | Purpose |
|---|---|---|---|---|---|
| `mqtt_config_task` | `FUN_4200f1f8` (mqtt init) → spawns `FUN_4200f158` | 5 | 0x1000+ | any | MQTT connect, dispatch, periodic `up_status_info` publish (line 34608) |
| `lora_config_task` | `FUN_4200bf38` → spawns `FUN_4200b8d4` (line 31658) | 10 | 0x1000 | 1 | LoRa wire I/O, heartbeat poll, channel scan FSM (line 31302) |
| `rtk_config_task` | `FUN_4200a0d0` → spawns `FUN_42009ed4` (line 29687) | 10 | varies | any | RTK base mode FSM (15 states `0x00..0x0e`) (line 29529) |
| `charger_config_task` | `FUN_4200a708` → spawns `FUN_4200a56c` (line 30056) | 1 | ~3 KB | any | Hall ON/OFF handler, sends LoRa Hall ACK (line 29984) |
| `cs_gpio_task` | `FUN_4200a160` → spawns `FUN_4200a318` (line 29746) | 1 | small | any | GPIO ISR queue drain: hall, PPS, RTK_STAT, temp pins (line 29823) |
| `wifi_config_task` | `FUN_42060ec0` (region 60ec0) | 5 | 0x1000 | any | WiFi STA connect, AP up/down, 55-iter timeout |
| `spp_task` / `ble_config_task` | `FUN_4200da2c` → spawns `FUN_4200d9b4` (line 33098) | 5 | DAT_4200118c | any | BLE write-buffer drain → `FUN_4200cfc0` shared dispatcher |
| `status_contro_task` | (referenced at s:954) | — | — | — | "Heart beat" check + GET_INFO queue cmd. 600-tick counter at line 33015. |
| `https_client_task` | `FUN_4205d23c` → spawns `FUN_4205d1e8` (line 118459) | 5 | 0x600 | any | HTTPS-OTA trigger (waits for queue cmd 0/1) → calls `FUN_4205d1c8` |
| `advanced_ota_example_task` | `FUN_4205d1c8` (line 118412) | 0xc (12) | DAT_42041064 | any | esp-idf example task — performs `esp_https_ota` from URL `https://novabot-oss…/lfi-charging-station_lora.bin` |
| `tcp_server` | `FUN_4205cbac` → spawns `LAB_42040f7c` (line 118366) | 4 | DAT_42040a20 | any | LAN-side TCP socket accept loop, parses custom OTA framing (line 118229+) |
| `uart1_event_task` | from s:971 | — | — | — | LoRa UART (UART1) event-driven RX |
| `uart2_event_task` | from s:973 | — | — | — | UM980 UART (UART2) event-driven RX |

Total task entry strings located in `.rodata`:
`mqtt_config_task` (s:?), `lora_config_task` (s:?), `rtk_config_task` (s:518), `charger_config_task` (s:553), `cs_gpio_task` (s:538), `wifi_config_task` (s:2789ish), `spp_task` (s:?), `status_contro_task` (s:956), `https_client_task` (s:2630), `advanced_ota_example_task` (s:2628), `tcp_server` (s:2573), `uart1_event_task` (s:971), `uart2_event_task` (s:973).

### 2.2. UM980 / GNSS Commands

All sent on UART2 (TX=GPIO19, RX=GPIO20, 115200 baud). Command text (bin offsets `s:524..s:536`):

| Order | Command (literal) | Ghidra ref | Purpose |
|---|---|---|---|
| 1 | `UNLOGALL` | `PTR_s_UNLOGALL` (s:524) | Stop all current outputs (no `COM1` arg in stock!) |
| 2 | `mode base ` (trailing space) | s:501 | Start of `mode base <lat> <ns> <lon> <ew> <alt>` — built dynamically by `FUN_42009d24` case `param_1==2` (line 29475) with snprintf `%10.10lf` for lat/lon and `%.4lf` for alt |
| 3 | `mode base time 60 1.5 2.5` | s:536 | Auto-survey base, 60s, 1.5m horizontal accuracy, 2.5m vertical |
| 4 | `mode movingbase` | s:533 | Moving-base mode (heading) |
| 5 | `rtcm1006 com1 10` | s:525 | Base ARP, every 10 s |
| 6 | `rtcm1033 com1 10` | s:526 | Receiver/antenna descriptor, every 10 s |
| 7 | `rtcm1074 com1 1` | s:527 | GPS MSM4, 1 Hz |
| 8 | `rtcm1084 com1 1` | s:529 | GLONASS MSM4, 1 Hz |
| 9 | `rtcm1094 com1 1` | s:530 | Galileo MSM4, 1 Hz |
| 10 | `rtcm1124 com1 1` | s:528 | BeiDou MSM4, 1 Hz |
| 11 | `GNGGA    com1 1` (4 spaces) | s:531 | NMEA GGA, 1 Hz, used by charger to parse fix |
| 12 | `SAVECONFIG` | s:532 | Persist UM980 config |
| also | `rtcm1006 com1 1` + `rtcm1033 com1 1` | s:534, s:535 | Alternative 1 Hz variant (used in moving-base mode) |

UM980 response watchwords (success): `response: OK*` (s:472). Parser tracks `rev_msg_AUTO_OPT` / `rev_msg_MOVING` / `rev_msg_FIXED` (s:471-487).

GNGGA parsing extracts (line 29475ish + parseGnggaByte logic in OpenNova counterpart):
- field 1 = UTC (`rtk_parse_data_error_utc` s:481)
- field 2 = latitude `degree=%d minute=%10.10lf` (s:466-468) → DMM → DDD via `dd=%10.10lf %d` (s:469)
- field 3 = NS (`coord.ns=%c`) → XOR with `DAT_42000a98` if 'S' (sign-flip), line 29478
- field 4 = longitude (same as 2)
- field 5 = EW (`coord.ew=%c`) → XOR if 'W', line 29494
- field 6 = fix quality (not directly named, but `rtk_parse_data_ret=%d` s:476)
- field 7 = satellites (`rtk_sats_num=%d` s:457)
- fields 8..13 = strtok'd but not extracted

### 2.3. LoRa Protocol

**Wire format (charger→mower / mower→charger):**
```
[0x02 0x02] [addr_hi addr_lo] [len+1] [payload …] [XOR_over_payload] [0x03 0x03]
```
- charger addr = 0x00 0x03 (TX); mower addr = 0x00 0x01 (TX)
- `len` field = `payload_len + 1` (includes XOR byte in the count)
- XOR computed over payload bytes only (not header/trailer)

**Categories (byte 0 of payload):**

| Cat | Name | Sub-cmds | Ghidra |
|---|---|---|---|
| 0x30 | CHARGER | 0x01 Hall ACK (3-byte `[0x30 0x01 0x01]`); 0x04 IRQ ACK `[0x30 0x04]` | line 31382-31396 |
| 0x31 | RTK_RELAY | raw UM980 stream bytes (≤ 0xb5 per frame, ≤180 B) | line 31356 |
| 0x32 | CONFIG | 0x01 WiFi (98 B), 0x02 MQTT (34 B), 0x03 LoRa params (5 B), 0x04 Apply | line 31349 + relays at FUN_42060d58 |
| 0x33 | GPS | 0x01 ACK from mower (FUN_4200b7ac, line 31380) — also outbound 17-byte lat/lon double LE | (mapped via OpenNova LORA_Q_GPS_ACK) |
| 0x34 | REPORT | 0x01 Heartbeat poll (`[0x34 0x01]` line 31339); 0x02 Status report (19-byte) | line 31337-31346 |
| 0x35 | ORDER | 0x01 start_run+ack 0x02, 0x03 pause+0x04, 0x05 resume+0x06, 0x07 stop+0x08, 0x09 stop_time+0x0a, 0x0b go_pile+0x0c | line 31400-31474 |
| 0x36 | SCAN_CHANNEL | 0x01 channel set [0x36 0x01 channel hc lc] (5 B) | line 31475-31490 |

**Status report parser (cat 0x34 sub 0x02, 19-byte data):** offsets 0..18 read by `FUN_4200f00c` into globals `DAT_42000c54..c68`:
- bytes 0-3 u32 LE → `mower_status`
- bytes 4-7 u32 LE → `mower_info`
- bytes 8-10 u24 LE → `mower_x`
- bytes 11-13 u24 LE → `mower_y`
- bytes 14-16 u24 LE → `mower_z`
- bytes 17-18 u16 LE → `mower_info1`

**RSSI query (E22/EBYTE):**
- Query bytes `0xC0 0xC1 0xC2 0xC3 0x00 0x01` → response `[0xC1 0x00 0x01 <rssi>]`.
- Threshold: `0x92` (146). Below → channel acceptable (line 31557).
- Scan FSM goes UP from current ch to `hc`, flips direction, then DOWN to `lc`, samples up to `0x22` (34) channels, bubble-sorts ascending, picks `chanArr[0]` (line 31567-31597).

**LoRa queue commands (FreeRTOS queue cmd IDs):**

| Id | Name (strings) | Action | Ghidra |
|---|---|---|---|
| 0x01 | LORA_QUEUE_CMD_PING | (string s:644 — no body in stock, swallowed) | line 31398 |
| 0x02 | LORA_QUEUE_CMD_SET_CFG | Emit `[0x32 0x04]` apply signal | line 31350-31354 |
| 0x03 | LORA_QUEUE_CMD_GPS_DATA | Drain RTK stream buf ≤0xb5 B → `[0x31 <bytes>]`. If GNGGA inside, increment heartbeat skip counter (iVar6) | line 31356-31376 |
| 0x04 | LORA_QUEUE_CMD_CHARGER_ON_OFF_ACK | Calls `FUN_4200b7ac` (GPS-ack builder) | line 31378-31380 |
| 0x05 | LORA_QUEUE_CMD_CHARGER_HALL_REQ | Emit `[0x30 0x01 0x01]` | line 31382-31388 |
| 0x06 | LORA_QUEUE_CMD_CHARGER_IRQ_REQ | Emit `[0x30 0x04]` | line 31390-31395 |
| 0x07 | (no-op log only — text `LORA_QUEUE_CMD` s:647 first hit) | log only | line 31398 |
| 0x20 | LORA_QUEUE_CMD_START_RUN | Emit `[0x35 0x01 mapName area_lo cutterhigh]` (5 B) | line 31400-31413 |
| 0x21 | LORA_QUEUE_CMD_PAUSE_RUN | Emit `[0x35 0x03]` | line 31415-31425 |
| 0x22 | LORA_QUEUE_CMD_RESUME_RUN | Emit `[0x35 0x05]` | line 31427-31437 |
| 0x23 | LORA_QUEUE_CMD_STOP_RUN | Emit `[0x35 0x07]` | line 31439-31449 |
| 0x24 | LORA_QUEUE_CMD_STOP_TIME_RUN | Emit `[0x35 0x09]` | line 31451-31461 |
| 0x25 | LORA_QUEUE_CMD_GO_PILE | Emit `[0x35 0x0B]` | line 31463-31473 |
| 0x26 | LORA_QUEUE_CMD_LORA_CHANNEL_SCAN | Emit `[0x36 0x01 ch hc_low hc_hi]` then enter scan FSM | line 31475-31490 |
| 0x27 | LORA_QUEUE_CMD_LORA_SET_CHANNEL | If `uStack_2c == 0`: write new config to LoRa module via `FUN_4200b56c`. If `uStack_2c == 0x101`: write config to module via `FUN_4200b64c`, commit `DAT_42000c74=1`, clear `DAT_42000c7c=0` (post-scan persist+verify) | line 31491-31510 |
| 0xa0 (-0x60) | (debug / fill buffer with 0..199 + send) | factory test pattern | line 31513-31519 |

After each ORDER (0x20-0x26) the task: `vTaskDelay(10ms)` → send → flush UART RX (`FUN_4200abd8`) → `vTaskDelay(100ms)` → `DAT_42000bac = 0` (clear ack), then continues to read inbound at next loop iteration.

Heartbeat default: every `0x96` ticks (150 ms) the task calls `xQueueReceive` with that timeout. If `iVar6 > 1` (RTK relay was active twice in a row), it sends `[0x34 0x01]` heartbeat poll, then flushes (FUN_4200abf4 + 100 ms pause) and increments `*DAT_42000c6c` (mower_error miss counter).

### 2.4. MQTT Topics + Handlers

**Topics:**
- Pub: `Dart/Receive_mqtt/<SN>` (QoS 0, retain 0)
- Sub: `Dart/Send_mqtt/<SN>` (QoS 1)
- ClientId: SN (stock) — OpenNova uses `ESP32_<bleMac3>`
- Fallback URI: `mqtt://47.253.57.111` (s:138 in CLAUDE.md / hardcoded)
- Default URI: `mqtt-dev.lfibot.com:0x75b (1883)` (s:?)
- NVS-resolved host: from `storage/mqtt_data` blob (30 B host + 2 B port LE @ off 0x1e)

**MQTT-only commands (FUN_4200e8c4, lines 34234-34547):**

| Cmd JSON key | Detection | Action | Response |
|---|---|---|---|
| `get_lora_info` | cJSON_GetObjectItem + `cJSON_IsNull` (PTR_FUN_420013d4) line 34527 | Read DAT_42000828 (addr/ch), DAT_42000c24 (rssi) | `get_lora_info_respond` `{result:0, value:{channel, addr, rssi}}` (line 34525-34541) |
| `ota_version_info` | cJSON_IsNull line 34512 | Build sys+ver | `ota_version_info_respond` `{result:0, value:{system:"v0.0.1", version:"v0.4.0"}}` (line 34510) |
| `ota_upgrade_cmd` | cJSON_IsString on `downloadUrl`/`md5`/`version` line 34464 | strncmp(version, "v0.4.0", 6) → if `<0` value=-2 (downgrade), if `==0` value=1 (same), else queue HTTPS OTA via `*DAT_42000878` | `ota_upgrade_cmd_respond` line 34460 |
| `start_run` | `mapName`/`area`/`cutterhigh` as cJSON_Number line 34413-34433 | Queue id `0x20` to LoRa, wait 3×1s for ack (`DAT_42000c88` == 1/0x101) | `start_run_respond` line 34411 |
| `pause_run` | line 34274 | Queue 0x21 + wait | `pause_run_respond` line 34276 |
| `resume_run` | line 34309 | Queue 0x22 + wait | `resume_run_respond` line 34311 |
| `stop_run` | line 34334 | Queue 0x23 + wait | `stop_run_respond` line 34336 |
| `stop_time_run` | line 34359 | Queue 0x24 + wait | `stop_time_run_respond` line 34361 |
| `go_pile` | line 34384 | Queue 0x25 + wait | `go_pile_respond` line 34386 |

**Status publish (`FUN_4200f00c`, lines 34555-34601):** every 4 × 500ms = 2 s:
```
{"up_status_info":{
   "charger_status":<u32>,
   "mower_status":<u32>,
   "mower_info":<u32>,
   "mower_x":<u32>,
   "mower_y":<u32>,
   "mower_z":<u32>,
   "mower_info1":<u32>,
   "mower_error":0 or <miss_count>
}}
```
**`charger_status` bitfield (line 34566-34573):**
- bit 0 (`0x01`): GPS valid (`DAT_4200099c == 1`)
- bit 8 (`0x100`): RTK fixed (`DAT_420009ac == 1`)
- bits 1..7 (`0xFE`): masked by `DAT_420013d8` if `rssi-1 < 0x91` (1≤rssi≤145)
- bits 24-31: satellite count (`DAT_420009a8 << 24`)

`mower_error` reports 0 when `DAT_42000c6c < 2` (≤1 missed heartbeat), else actual miss count (line 34587-34592).

**MQTT EVENT_DATA handler (FUN_4200e7f8, lines 34182-34227):**
1. Reject if `mqtt_rec_data_flag == 1` (previous still processing).
2. Length must be `>0`, `<1024`, `%16==0`.
3. AES-128-CBC decrypt with key `"abcdabcd1234"+SN[-4:]`, IV `abcd1234abcd1234` (PTR_s_abcd1234abcd1234… at 42001310).
4. Copy plaintext (256-byte buffer auStack_130) to DAT_42001268 / signal mqttCmdQueue cmd=0x00.

Publish path: encrypt → call `(*DAT_4200067c)(3,…,uVar3)` (esp_mqtt_client_publish). QoS 0 from stock pub, but app sees PUBACK because broker (aedes) injects it.

### 2.5. BLE / GATT

**Service:** `SEC_GATTS_DEMO` (ESP-IDF demo basis, s:677) created in `FUN_4200da2c` (lines 33026-33156).

- Device name (advertising): `CHARGER_PILE` (s:?, set at FUN_42010838(PTR_s_CHARGER_PILE_42000f10) line 32298)
- Service UUID: 16-bit UUID at DAT_42001148 + 0x34 byte attribute table (line 33050) — observed live as `0x1234` 128-bit base
- Characteristic (cmd + notify): observed UUIDs `0x2222` / `0x3333` (BLE_CHAR_CMD_UUID / BLE_CHAR_DATA_UUID in OpenNova)
- Manufacturer data: `[0x66, 0x55, <BLE MAC 6B>, 0x45, 0x53, 0x50]` ("ESP" suffix)
- Advertising params (line 33076-33091): min_int=0xd, max_int=0x3, channel map 0x10, adv_type=3 (NONCONN_IND first, then CONN_IND on demand)
- Bonding/auth: `ESP_LE_AUTH_REQ_SC_MITM_BOND` keys (s:1043 LE_LOCAL_KEY_IRK, full bond)
- IO cap: DisplayYesNo + MITM
- Passkey: static (NVS-bound IRK key `587587b89901833629c1d9307c12817d` from FIRMWARE-CHARGER.md)

**Write handler (`FUN_4200c850`, lines 32153-32320):**
1. Param 0x01 = WRITE_EVT (with prepare/exec).
2. If `cJSON-like` value with raw payload: if first 9 bytes match `ble_start` (s:6703) → start frame, clear DAT_42000f30 buffer (0x400/1024 B), set `*DAT_42000f34=0` (line 32218-32223).
3. If 7-byte match `ble_end` (s:6702) → set `*DAT_42000f28 = 1` (rec_data_flag), signal queue.
4. Otherwise → append param_3[6][:param_3[5]] bytes to buffer at offset `*DAT_42000f34`. Drop+reset on >0x3ff (1024 B).

**Shared dispatcher (`FUN_4200cfc0`, lines 32534-32987):** detects 9 JSON keys, matching MQTT-side `FUN_4200e8c4` but on BLE buffer DAT_42000f30:

| Key | Action | Ghidra |
|---|---|---|
| `get_wifi_info` | Build `{wifi:<-(rssi+30) clamped 0..60>, rtk:<satellites>}` | line 32966 |
| `set_wifi_info` | Parse `sta:{ssid,passwd,encrypt}` + `ap:{ssid,passwd,encrypt}`. ssid >1 char → write `storage/wifi_data` blob; ap ssid >7 char → `storage/wifi_ap_data`. Trigger wifi_config_task cmd=0x00 (CFG_AP+STA), wait 55 s. | line 32844-32962 |
| `get_signal_info` | Trigger LoRa get-signal (queue cmd 0x01), wait 60×1s for `FUN_42009b4c(0x6d)`==0. Build `{wifi,rtk}`. | line 32795-32822 |
| `set_rtk_info` | Queue 0x02 to rtk_config_task queue (DAT_42000870), wait 30×1s for `FUN_42009b4c(0x66)`==0. | line 32767-32792 |
| `set_lora_info` | Parse `addr` (u16) → `DAT_42000828`, `channel` (u8) → `DAT_42000828+1`, optional `hc` → `DAT_42000dd0`, optional `lc` → `DAT_42000dd0+1`. Reset state via `FUN_4200b25c(0)`, queue cmd 0x01 (`uStack_3a=1`) to LoRa, wait 60×1s for `FUN_4200b22c()==0` or `==1`. On success persist via `FUN_4200e028` + `FUN_4200e100`. On timeout response `result=1` + `set_lora_info>60` log. Response value = assigned channel. | line 32684-32762 |
| `set_mqtt_info` | Clear 0x1e bytes of `DAT_420010c8`, copy `addr` string, copy `port` u16 to offset 0x1e, persist via `FUN_4200e1d4("storage")`. | line 32658-32682 |
| `get_cfg_info` | Read `storage/cfg_flag` u8 via `FUN_4200e2f0`. `value=1` if flag==1 else 0. | line 32630-32656 |
| `set_cfg_info` | If `0` → `FUN_4200dd50("storage")` erase. If `1` → `FUN_4200e2a8("storage",1)` save flag + `*DAT_420010f4='\x01'` (commit flag). After response sent: if commit==1, call `FUN_42060d58()` (sendConfigToMower) → 1000ms → `esp_restart()` (line 32837-32841). | line 32608-32628 |
| `get_dev_info` | Build `{sn:<deviceSN>, system:"v0.0.1", version:<FIRMWARE_VERSION>}` | line 32589-32607 |

Notification path: `FUN_4200ce20` (line 32450) chunks JSON into 20-byte writes, framed by `ble_start` and `ble_end` notifies with 30ms (`0x1e`) between chunks (line 32491).

### 2.6. NVS Keys

**Partition `fctry` (factory, NVS_NS_FACTORY):**

| Key | Type | Size | Strings ref |
|---|---|---|---|
| `sn_code` | string | ~20 B | s:867, ret = `g_sn_code` |
| `sn_flag` | u8 | 1 B | s:868 |

**Partition default (`storage` namespace):**

| Key | Type | Size | Default value | Strings ref |
|---|---|---|---|---|
| `wifi_data` | blob | 96 B (SSID32+passwd64) | factory `abcd1234`/`12345678` | s:843 |
| `wifi_ap_data` | blob | 96 B | AP_SSID = SN (e.g. LFIC1230700004), passwd `12345678` | s:848 |
| `mqtt_data` | blob | 32 B (host30 + port_u16 @ off 0x1e) | `mqtt-dev.lfibot.com:1883` (0x75b) | s:861 |
| `lora_data` | blob | 4 B (addrHi, addrLo, channel, 0x00) | factory varies (e.g. 0x14, channel 0x14) | s:851 |
| `lora_hc_lc` | blob | 2 B (hc, lc) | (e.g. 20, 14) | s:856 |
| `rtk_data` | blob | 40 B (lat double + NS char + lon double + EW char + alt double + …) | empty until first survey-in completes | s:834 |
| `cfg_flag` | u8 | 1 B | 0 until BLE provisioning done | s:865 |

**Partition `log_status`:** referenced at line 28195 (wiped on debug `d`). Content: opaque telemetry log (not parsed at boot).

**SN handling:** `FUN_4200e3ec(PTR_s_fctry, &flag)` reads `sn_flag`. If `flag==1`, `FUN_4200e368(PTR_s_fctry, buf)` reads `sn_code` into 20-byte buffer (line 28100-28108). Stock factory-provisioned: e.g. `LFIC1230700004` (length 14).

**`SN_SET:<sn>,<mqtt>` console handler (line 28114-28154):**
1. strtok by `,`
2. Write `sn_code` string + `sn_flag=1` to `fctry` (FUN_4200e32c + FUN_4200e3ac)
3. Clear `storage`, write `mqtt-dev.lfibot.com:1883` to `mqtt_data` (overrides current MQTT broker!)
4. Reboot.

### 2.7. GPIO + Sensor I/O

`FUN_4200a160` registers GPIOs and ISRs (line 29705-29773):

| GPIO# (hex/dec) | Mode | Pull | Intr | Purpose | ISR queue value |
|---|---|---|---|---|---|
| `0x0F` (15) | input | pulldown | rising edge | HALL_DETECT1 | 0x0f (logged as `HALL_DETECT12_…`) |
| `0x03` (3) | input | pulldown | rising | HALL_DETECT2 | 0x03 |
| `0x2F` (47) | output | — | — | LoRa M0 pin (or similar — flag toggled `lora_xTaskNotify_0_BIT`) | 0x2f |
| `0x0D` (13) | input | pulldown | both | RTK_STAT pin (RTK Fixed indicator from UM980) | 0x0d (line 29880-29891) |
| `0x09` (9) | input | pulldown | both | RTK_TIMEPULSE (PPS from UM980) | 0x09 (line 29840-29848) |
| `0x04` (4) | input | both | both | TEMP_1 sensor digital edge | 0x04 (line 29899) |
| `0x05` (5) | input | both | both | TEMP_2 sensor | 0x05 (treated identically to 0x04, both 3..5 path) |
| `0x10` (16) | output | — | — | (DAT_42000b14 / DAT_42000b18 config) | n/a |
| `0x23, 0x24, 0x25, 0x2d, 0x30, 0x0c, 0x2e, 0x02` | mixed | various | — | charger ON/OFF relays, status LEDs (see `FUN_4200a4b4`, `FUN_4200a510`) | n/a |

**`cs_gpio_task` (`FUN_4200a318`, line 29823-29906):**
Drains queue `*DAT_42000b1c` (10-deep × 4 B). Per event id:
- `0x09` (PPS): if pin reads 1 → log `RTK_TIMEPULSE_PIN1111111111` (s:545), enqueue `uStack_2c=4` to rtk_config_task queue (DAT_42000870) = `RTK_CMD_PPS`.
- `0x0F` / `0x03` (hall1/2): call `FUN_4200a2bc()` → returns 1 if both==1, 2 if one xor, 0 if both==0. If <3 → log `HALL_DETECT12_111111111or0000000` and enqueue `uStack_2b=1` to charger_config_task queue (DAT_42000b3c) = `CHARGER_QUEUE_CMD_SET_HALL_REQ`.
- `0x2F`: if pin==1 → `xTaskNotify(*DAT_42000b44, 0, 1, 3)` AND `xTaskNotify(*DAT_42000b48, 0, 1, 3)` — wakes both LoRa and ??? tasks. Else log `lora_xTaskNotify_0_BIT_0000`.
- `0x0D` (RTK_STAT): if 0 → log `RTK_STAT_PIN00000000` + enqueue `uStack_2c=3` (RTK_CMD_START). If 1 → log `RTK_STAT_PIN1111111111` only.
- `0x03..0x05` (temp): if first event after boot and `*DAT_42000b5c==0` → set 1, log `TEMP_1_2_DET_start` (s:546).

### 2.8. RTK Base State Machine

`rtk_config_task` (`FUN_42009ed4`, lines 29529-29653). State variable `*DAT_420009b0`, 15 distinct values:

| State (hex) | Meaning | Set by |
|---|---|---|
| `0x00` | IDLE — fresh boot, awaiting RTK_CMD | line 29570 (after AUTO_OPT enter) |
| `0x01` | ERROR — AUTO_OPT failed or moving-base failed | line 29559, 29582 |
| `0x02` | START_PENDING — after RTK_CMD_START arrives in state 0 | line 29612-29614 |
| `0x03` | AUTO_OPT_RUNNING — sending `mode base time 60 1.5 2.5` | line 29550 (after AUTO_OPT cmd, before FUN_42009d24(0)) |
| `0x04` | AUTO_OPT_DONE — survey-in finished | line 29554 |
| `0x06` | MOVING_BASE_RUNNING | line 29573 |
| `0x07` | MOVING_BASE_DONE | line 29577 |
| `0x08` | MOVING_BASE_PPS_RECEIVED | line 29634 |
| `0x0A` | FIXED_BASE_RUNNING — re-emitting saved `mode base lat ns lon ew alt` | line 29596 |
| `0x0B` | FIXED_BASE_DONE | line 29600 |
| `0x0C` | FIXED_BASE_PPS_RECEIVED | line 29640 |
| `0x0E` | OPERATIONAL — PPS received in state 2 or 4 (auto-opt finished → first PPS) | line 29622, 29628 |

**Queue commands (`RTK_CMD_*`, integer):**

| Cmd | Value | Trigger | Handler |
|---|---|---|---|
| `RTK_CMD_AUTO_OPT_BASET` | 0x00 | from BLE/wifi auto-init | line 29547-29560 — calls FUN_42009d24(0) |
| `RTK_CMD_MOVING_BASE` | 0x01 | from BLE `set_rtk_info` w/ moving-base mode | line 29562-29584 — FUN_42009d24(1) |
| `RTK_CMD_FIXED_BASE` | 0x02 | when stored RTK pos exists in NVS | line 29586-29607 — FUN_42009d24(2) |
| `RTK_CMD_START` | 0x03 | from cs_gpio_task on RTK_STAT=0 | line 29609 — only effective if state==0 |
| `RTK_CMD_PPS` | 0x04 | from cs_gpio_task on PPS rising | line 29617-29643 — state transitions per current state |
| `RTK_CMD_TIMEOUT` | 0x05 | watchdog from elsewhere (likely status_contro) | line 29646 |

**`FUN_42009d24(param_1)` is the actual UM980 sender (line 29426-29521):**
- `param_1==0`: AUTO_OPT path → `FUN_42009c60(PTR_PTR_42000a88)` sends a hard-coded queue of UM980 commands from .rodata.
- `param_1==1`: MOVING-BASE path → `FUN_42009bc8(PTR_PTR_42000a8c)` sends moving-base queue.
- `param_1==2`: FIXED-BASE path → read RTK pos from NVS (`FUN_4200dde0("storage", &lat/ns/lon/ew/alt)`), build `mode base <lat> ns <lon> ew <alt>` string via 4 snprintf calls (line 29475-29508), then call `FUN_42009c60()`.

**FUN_42009c60 sends in sequence (inferred from string table layout, s:524-535):**
1. `UNLOGALL`
2. (the `mode …` line built above)
3. `rtcm1006 com1 10`
4. `rtcm1033 com1 10`
5. `rtcm1074 com1 1`
6. `rtcm1124 com1 1`
7. `rtcm1084 com1 1`
8. `rtcm1094 com1 1`
9. `GNGGA    com1 1`
10. `SAVECONFIG`

**FUN_42009bc8 (moving-base) sends:**
1. `UNLOGALL`
2. `mode movingbase`
3. `rtcm1006 com1 1`
4. `rtcm1033 com1 1`
5. (RTCM 107x/108x/etc as before)
6. `GNGGA    com1 1`
7. `SAVECONFIG`

### 2.9. OTA Flow

Two parallel paths in stock:

**Path A — MQTT-triggered HTTPS OTA (`advanced_ota_example_task`, FUN_4205d1c8 line 118412):**
- Spawned from `https_client_task` (`FUN_4205d1e8` line 118422) on queue cmd 0 (`HTTPS_CMD_START`).
- queue cmd 1 = `HTTPS_CMD_TIMEOUT` (log only).
- Performs `esp_https_ota_begin` → `esp_https_ota_perform` loop → `esp_https_ota_finish` → reboot.
- Hard-coded URL fallback: `https://novabot-oss.oss-us-east-1.aliyuncs.com/novabot-file/lfi-charging-station_lora.bin` (s:2609). Real URL passed dynamically via `*DAT_42000874` (filled by `ota_upgrade_cmd` handler in FUN_4200e8c4).
- Progress publisher: `FUN_4205cd4c` (line 118377) — `{"ota_upgrade_state":{"status":<str>, "percentage":<int>}}` published to MQTT.
- Version compare: `strncmp(version, FIRMWARE_VERSION, 6)`:
  - `<0`: downgrade → value=-2
  - `==0`: same → value=1 (rejected)
  - `>0`: accept → push to ota queue (`*DAT_42000878`)
- MD5 checked if string present.

**Path B — Raw TCP server OTA (`tcp_server`, FUN_4205cbac line 118358):**
- Listens on a TCP port (port not extractable from strings — DAT_42040a20 = port var; likely 8888 based on lwip listen pattern).
- Accepts one client, reads frames into 1024 B buffer `auStack_420` (line 118324).
- Frame format identical to LoRa frame style: `[0x02 0x02] [0x07 0xFF] [len_hi len_lo] [payload …] [XOR] [0x03 0x03]` (header check at line 118218-118228).
- payload[0] == `0x3a` (`':'`) marks "OTA file frame".
- payload[1] sub-cmd:
  - `0x01`: GET_OTA_VERSION_INFO → respond `[0x3a 0x02 <ver1> <ver2> <ver3>]` (line 118233 → FUN_4205c430)
  - `0x03`: SET_OTA_FILE_INFO → file_len follows. Initialize esp_ota_begin. Respond `[0x3a 0x04 OK]` (line 118241 → FUN_4205c58c)
  - `0x05`: SET_OTA_DATA → append bytes. (line 118256 → FUN_4205c480)
  - `0x07`: SET_OTA_FILE_END → esp_ota_end + set_boot_partition. Respond `[0x3a 0x08 OK]` (line 118266 → FUN_4205c6f8). Connection then closed.
- Response sender: `FUN_4205c360` (line 118321) builds frame and sends via lwip `FUN_42075a9c` (`lwip_send`).

### 2.10. Config Caching System

NVS access wrappers (used everywhere):
- `FUN_4200dd50(<partition_or_ns>)` — erase whole partition
- `FUN_4200dde0(<ns>, &dest)` — read 40-byte rtk_data
- `FUN_4200e028(<ns>, &lora_data)` — write lora_data blob
- `FUN_4200e070(<ns>, &lora_data)` — read lora_data
- `FUN_4200e100(<ns>, &hc_lc)` — write lora_hc_lc
- `FUN_4200e148(<ns>, &hc_lc)` — read lora_hc_lc
- `FUN_4200e1d4(<ns>)` — commit mqtt_data
- `FUN_4200e2a8(<ns>, value)` — write cfg_flag u8
- `FUN_4200e2f0(<ns>, &value)` — read cfg_flag u8
- `FUN_4200e32c(<ns>, str)` — write sn_code string
- `FUN_4200e368(<ns>, &buf)` — read sn_code string
- `FUN_4200e3ac(<ns>, value)` — write sn_flag u8
- `FUN_4200e3ec(<ns>, &value)` — read sn_flag u8

No in-RAM cache between calls — values are re-read from NVS on demand (slow but simple).

---

## 3. OpenNova Feature Inventory

| Module | Key exports | Notes |
|---|---|---|
| `main.cpp` | `setup()`, `loop()`, `loraConfigTask`, `chargerConfigTask`, `gpsTaskFunc`, `sendConfigToMower()`, `channelScanStep()`, `bubbleSortBestChannel()` | Spawns wifi/mqtt/lora/gps/charger/ota tasks. No rtk_config_task, cs_gpio_task, status_contro_task, https_client_task, tcp_server, uart event tasks. |
| `mqtt_handler.cpp` | `mqttInit`, `mqttConnect`, `mqttConfigTask`, `mqttDispatchCommand` (9 MQTT cmds), `mqttPublishStatus`, `mqttPublishEncrypted`, `mqttPublishRaw`, `mqttPublishBinary`, `mqttQueueRtcm` | Adds OpenNova-only RTCM MQTT side-channel `rtk/charger/<SN>/raw` (binary). Detects cmds via truthy `JsonVariant` — does NOT use `cJSON_IsNull`. Encrypts publishes (AES). |
| `ble_provisioning.cpp` | `bleInit`, `bleStop`, `dispatchSharedCommand` (9 cmds) | Same UUIDs/manufacturer header. No bonding/MITM/passkey. Reuses dispatcher for MQTT too (deduplication). |
| `lora_driver.cpp` | `loraInit`, `loraSetMode`, `loraSetChannel`, `loraSendRaw`, `loraReadRaw`, `loraQueryRssi` | E32-style register write only (not full E22 config). |
| `lora_protocol.cpp` | `loraBuildPacket`, `loraParsePacket`, `loraXorChecksum` | Wire format byte-identical to stock. |
| `lora_commands.cpp` | `loraBuildHeartbeatPoll`, `loraBuildOrderCommand`, `loraBuildRtkRelay`, `loraBuildGpsPosition`, `loraBuildHallAck`, `loraBuildIrqAck`, `loraBuildConfig{Wifi,Mqtt,Lora}`, `loraParseStatusReport` | All 6 ORDER, REPORT 0x34/0x02, CHARGER 0x30/0x01+0x04, CONFIG 0x32/0x01..0x04. |
| `gps_parser.cpp` | `gpsInit` (UM980 init), `gpsPumpRtk` (UART2 poll + GNGGA parse + RTK stream buf), `gpsGetData`, `gpsReadRtkChunk`, `gpsRtkAvailable` | Sends 11 UM980 commands at boot, then polls UART2 at 50 Hz. **No re-arm logic**, **no PPS handling**, **no fixed-base from NVS**. |
| `nvs_storage.cpp` | `nvsInit`, `nvsReadSN`, `nvs{Read,Write}{Wifi,WifiAp,Mqtt,Lora,LoraHcLc,Rtk}`, `nvs{Read,Write}CfgFlag` | All 7 stock keys present in correct sizes. No log_status partition support. |
| `ota_handler.cpp` | `otaTask` (Arduino `Update.h`-based) | Drains otaQueue, HTTP download (not HTTPS), MD5 verify, ESP.restart. |
| `aes_crypto.cpp` | `aesEncrypt`, `aesDecrypt` | mbedTLS-backed, key/IV identical to stock, null-byte padding. |
| `wifi_manager.cpp` | `wifiInit`, `wifiTask`, `wifiIsConnected`, `wifiReconnect` | APSTA mode 3, 55-iter timeout — matches stock. |
| `uart_console.cpp` | `consoleInit`, `consoleProcess` | All 12 single-char cmds (`v a m f o w d @ r b`) + `SN_GET`, `SN_SET:`, `LORARSSI` |

---

## 4. Gap Matrix

Symbols: ✅ implemented · ⚠️ partial · ❌ missing · `N/A` not applicable

### 4.1. FreeRTOS Tasks

| Stock | Ghidra ref | OpenNova | Gap |
|---|---|---|---|
| `mqtt_config_task` | FUN_4200f158 line 34608 | ✅ `mqttConfigTask` (mqtt_handler.cpp:477) | Same cadence (500ms tick, 4× → publish). Stock waits for `FUN_42060d40()==0` (WiFi STA settled) before connecting — OpenNova waits on `WiFi.status()==WL_CONNECTED`. |
| `lora_config_task` | FUN_4200b8d4 line 31302 | ✅ `loraConfigTask` (main.cpp:225) | Queue id mapping correct (1:1). Heartbeat-skip-counter `iVar6 > 1` logic implemented. RTK stream drain (queue 0x03) port matches. |
| `rtk_config_task` | FUN_42009ed4 line 29529 | ❌ no runtime task — only `gpsInit()` sends initial cmds in `gps_parser.cpp:45-57` | **CRITICAL** — no FSM state, no PPS handling, no fixed-base reload from NVS after reboot, no RTK_CMD queue. See §5.1. |
| `charger_config_task` | FUN_4200a56c line 29984 | ⚠️ `chargerConfigTask` (main.cpp:384) — only handles `CHARGER_Q_SET_ON_OFF` (cmd 0x02), no `CHARGER_QUEUE_CMD_SET_HALL_REQ` (cmd 0x00) | Missing the hall-detect direct path (cmd 0). |
| `cs_gpio_task` | FUN_4200a318 line 29823 | ❌ no GPIO ISR or polling task | **CRITICAL** — no PPS (GPIO9), no RTK_STAT (GPIO13), no HALL_DETECT1/2 (GPIO15/3), no TEMP_1/2 (GPIO4/5). See §5.2. |
| `wifi_config_task` | FUN_42060ec0 | ✅ `wifiTask` (wifi_manager.cpp:84) | Different queue cmd numbering but same logical states. Missing `WIFI_CMD_TIMEOUT` (cmd 0x04) explicit handler — only auto-reconnect at line 121. |
| `spp_task` / ble_config_task | FUN_4200d9b4 line 32994 | ⚠️ `BLECharacteristicCallbacks::onWrite` (ble_provisioning.cpp:48-74) — synchronous in BLE stack callback context, no queue + task | OK functionally; but no 600-tick timeout monitor (line 33015-33017 in stock resets state if BLE-rx idle 10 min). |
| `status_contro_task` | s:954+956 | ❌ no equivalent | Sends `STATUS_CONTROL_QUEUE_CMD_GET_INFO` periodically to refresh status struct; OpenNova has no idle reboot. |
| `https_client_task` | FUN_4205d1e8 line 118422 | ⚠️ folded into `otaTask` directly (ota_handler.cpp) | OpenNova bypasses indirection; no queue cmd dispatch. Uses HTTP (not HTTPS). |
| `advanced_ota_example_task` | FUN_4205d1c8 line 118412 | ✅ `otaTask` (ota_handler.cpp:17) | Same end-to-end function; Update.h instead of esp_https_ota. **Stock uses HTTPS+esp_https_ota; OpenNova uses HTTP+Update — gap if MQTT broker insists on https://** |
| `tcp_server` | FUN_4205cbac line 118358 | ❌ no TCP listener | **CRITICAL for parity** — see §5.3. |
| `uart1_event_task` (LoRa UART) | s:971 | ❌ polling in loraConfigTask via `LORA_SERIAL.available()` | Polling at 150 ms tick may drop bursts >0xc0 bytes. |
| `uart2_event_task` (UM980) | s:973 | ❌ polling in gpsTaskFunc at 20 ms | Same risk during RTCM bursts. |

### 4.2. LoRa Protocol

| Stock element | Ghidra ref | OpenNova | Gap |
|---|---|---|---|
| Start markers `0x02 0x02` | line 31302 (FUN_4200b8d4 prologue) | ✅ `LORA_START_BYTE` config.h:52 | parity |
| End markers `0x03 0x03` | line 31302 | ✅ `LORA_END_BYTE` config.h:53 | parity |
| Addr (TX=0x00 0x03, RX=0x00 0x01) | line 31302 | ✅ `LORA_DEFAULT_ADDR_HI/LO` config.h:54-55 | parity |
| XOR over payload | line 31302 | ✅ `loraXorChecksum` lora_protocol.cpp:4 | parity |
| Category 0x30 CHARGER | line 31382-31396 | ✅ | parity (Hall ACK 3 B, IRQ ACK 2 B) |
| Category 0x31 RTK_RELAY (≤180 B) | line 31356-31376 | ✅ `loraBuildRtkRelay` + queue 0x03 drain in `loraConfigTask` | parity. OpenNova mirrors bytes to MQTT (new feature, no conflict with stock interop). |
| Category 0x32 CONFIG (0x01-0x04) | line 31350-31354 + FUN_42060d58 | ✅ `loraBuild{Wifi,Mqtt,Lora}Config` + apply | parity |
| Category 0x33 GPS | line 31378 (FUN_4200b7ac) | ✅ `loraBuildGpsPosition` | parity (17 B lat/lon double LE) |
| Category 0x34 REPORT 0x01 poll + 0x02 report | line 31337-31346 | ✅ `loraBuildHeartbeatPoll` + `loraParseStatusReport` | parity |
| Category 0x35 ORDER 0x01..0x0c | line 31400-31474 | ✅ `loraBuildOrderCommand` | parity |
| Category 0x36 SCAN (0x01) | line 31475-31490 | ✅ via `channelScanStep` | parity, but scan params (hc/lc) come from queue, OpenNova reads from NVS. |
| Queue cmd 0x07 PING | line 31398 | ❌ no LORA_Q_PING in config.h | **gap** — used by stock as LoRa link liveness probe |
| Queue cmd 0x27 CONFIG_VERIFY | line 31491-31510 | ❌ `LORA_Q_CONFIG_VERIFY` defined config.h:105 but never used | **gap** — post-scan verify path |
| Heartbeat-skip-counter (`iVar6 > 1` → force poll) | line 31334-31346 | ⚠️ uses `heartbeatCounter >= LORA_HEARTBEAT_TICKS` only | Different mechanism; OpenNova polls every ~1.5 s regardless of RTK relay activity. Stock skips poll while RTK GNGGA frame is in-flight (iVar6 increments per GNGGA RTK frame); only force-polls if 2+ RTK frames flushed without poll. **Behavior gap during heavy RTCM load.** |
| Post-ORDER 100 ms flush + RX drain | line 31408-31413 | ✅ `loraSendPayloadWithFlush` main.cpp:52 | parity |
| Channel scan adaptive RSSI (up→hc→down→lc, 0x22 max samples) | line 31533-31599 | ✅ `channelScanStep` main.cpp:96 | parity |
| RSSI threshold `0x92` | line 31557 | ✅ `LORA_RSSI_THRESHOLD` config.h:139 | parity |
| Bubble sort ascending | FUN_4200a6e4 | ✅ `bubbleSortBestChannel` main.cpp:63 | parity |
| Factory-test pattern (queue cmd -0x60) | line 31513-31519 | ❌ omitted | N/A (debug-only) |

### 4.3. MQTT Topics + Handlers

| Stock cmd | Ghidra ref | OpenNova | Gap |
|---|---|---|---|
| Topic `Dart/Receive_mqtt/%s` pub | mqtt init | ✅ `MQTT_TOPIC_PUB_FMT` config.h:30 | parity |
| Topic `Dart/Send_mqtt/%s` sub | mqtt init | ✅ `MQTT_TOPIC_SUB_FMT` config.h:31 | parity |
| ClientId = SN | mqtt init | ⚠️ ClientId = `ESP32_<bleMac3>` (mqtt_handler.cpp:47-63) | **stock sets ClientId = SN**. Server may reject or assign different equipment. |
| QoS pub 0 / sub 1 | mqtt init | ✅ | parity (config.h:33-34) |
| AES-128-CBC encrypt on TX | FUN_4200e7f8 line 34212 | ✅ `mqttPublishEncrypted` | parity (key + IV match) |
| AES-128-CBC decrypt on RX with `mqtt_rec_data_flag` guard | FUN_4200e7f8 lines 34195-34220 + s:889 | ⚠️ `onMqttMessage` decrypts but no rec-data-flag — re-entrant safe via FreeRTOS queue | functional parity |
| `cJSON_IsNull` validation on `get_lora_info`, `ota_version_info` | PTR_FUN_420013d4 (cJSON_IsNull), line 34527, 34512 | ❌ uses `JsonVariant v = doc["key"]` truthy check (mqtt_handler.cpp:277, 301) — accepts ANY value (`0`, `1`, `null`, `""`, …) | **PROTOCOL DEVIATION** — server can be more lenient than stock, but a stock-firmware peer sending `{get_lora_info:0}` will be rejected. OpenNova will accept it. Not a server-side risk; documented in CLAUDE.md. |
| `get_lora_info` → `{result:0, value:{channel, addr, rssi}}` | line 34525-34541 | ✅ mqtt_handler.cpp:277-297 | parity |
| `ota_version_info` → `{value:{system,version}}` | line 34510-34520 | ✅ mqtt_handler.cpp:301-316 | parity (system="v0.0.1") |
| `ota_upgrade_cmd` parses `url`/`md5`/`version`, strncmp len 6 | line 34464-34502 | ✅ mqtt_handler.cpp:321-356 | parity. Stock uses `downloadUrl` field name + `content.upgradeApp.{version,downloadUrl,md5}` wrapping; **OpenNova reads top-level `url` instead — server must produce the OpenNova shape**. Server already does this per FIRMWARE-CHARGER.md. |
| `start_run` `{mapName,area,cutterhigh}` → queue 0x20 | line 34413-34452 | ✅ mqtt_handler.cpp:362-372 (relayAndWait) | parity |
| `pause_run`/`resume_run`/`stop_run`/`stop_time_run`/`go_pile` → queue 0x21..0x25 | line 34274-34407 | ✅ mqtt_handler.cpp:376-413 | parity |
| `*_respond` JSON shape `{type,message:{result,value}}` | line 34299, 34594 etc | ✅ `publishResponseNull` etc mqtt_handler.cpp:214-236 | parity |
| `up_status_info` periodic publish (2 s) | FUN_4200f00c line 34555 | ✅ `mqttPublishStatus` mqtt_handler.cpp:422 | parity |
| `charger_status` bitfield (sat<<24 \| 0x100 RTK \| (rssi<<1) \| 0x01 GPS) | line 34566-34573 | ✅ mqtt_handler.cpp:425-444 | parity |
| `mower_error` zero-clamped if `<2` | line 34587 | ✅ mqtt_handler.cpp:458-463 | parity |
| OpenNova-only: `rtk/charger/<SN>/raw` binary RTCM topic | N/A | ✅ mqtt_handler.cpp:169-196 (`mqttPublishBinary` + `drainAndPublishRtcm`) | New side-channel for walker / NTRIP server consumers. No protocol conflict with mower. |

### 4.4. BLE GATT + Shared Dispatcher

| Stock | Ghidra ref | OpenNova | Gap |
|---|---|---|---|
| GATT service + characteristics | FUN_4200da2c | ✅ `bleInit` (ble_provisioning.cpp:78) | UUIDs same as observed live capture. |
| Adv name `CHARGER_PILE` | FUN_42010838 line 32298 | ✅ `BLE_DEVICE_NAME` config.h:42 | parity |
| Adv manufacturer data `0x66 0x55 <MAC> 0x45 0x53 0x50` | line 33076-33091 + FUN_42010854 | ✅ ble_provisioning.cpp:103-109 | parity |
| Pair: SC_MITM_BOND + DisplayYesNo + IRK | s:1043 et al | ❌ OpenNova bonds without MITM or static passkey | Provisioning works (proven 2026-03-09), but security-downgrade vs stock. |
| `ble_start` + `ble_end` framing | line 32218, FUN_4200ce20 chunking | ✅ `CmdCharCallbacks::onWrite` ble_provisioning.cpp:48-73 + `sendBleResponse` line 132-152 | parity (20 B chunks, 30 ms delay → `BLE_CHUNK_DELAY_MS` config.h:48) |
| Shared dispatcher cmds | FUN_4200cfc0 line 32534 | ✅ `dispatchSharedCommand` ble_provisioning.cpp:168 | 9/9 cmd names matched |
| `get_wifi_info` → `{wifi, rtk}` (rssi clamped 0..60) | line 32966-32978 | ✅ ble_provisioning.cpp:185-200 | parity |
| `set_wifi_info` parse sta+ap, store NVS | line 32844-32962 | ✅ ble_provisioning.cpp:205-250 | parity. **Doesn't trigger `wifi_config_task` queue cmd 0x00 (CFG_AP+STA)**, only saves blob. Effect = need restart for WiFi to use new creds. Stock also restarts after set_cfg_info. |
| `get_signal_info` → `{wifi, rtk}` with LoRa get-signal 60 s wait | line 32795-32822 | ⚠️ ble_provisioning.cpp:255-269 — no LoRa get-signal query, just returns WiFi RSSI + sat count instantly | **functional parity** but **timing differs** — stock waits up to 60 s to update LoRa RSSI; OpenNova returns last known. Acceptable. |
| `set_rtk_info` → queue cmd 0x02 to rtk_config_task, 30 s wait | line 32767-32792 | ⚠️ ble_provisioning.cpp:273-298 — `LORA_Q_CONFIG` queued instead (apply 0x32/0x04); always returns 0 | **gap** — rtk_config_task missing, so set_rtk_info is a no-op. |
| `set_lora_info` parse addr/channel/hc/lc, scan, persist on success | line 32684-32762 | ⚠️ ble_provisioning.cpp:303-357 — fires SCAN queue but does not actually wait for scan result (`break` at first iteration line 339) and saves regardless | **gap** — channel scan ack from LoRa task not awaited; persistence happens before scan completes. |
| `set_mqtt_info` parse addr+port → NVS | line 32658-32682 | ✅ ble_provisioning.cpp:361-382 | parity |
| `get_cfg_info` → flag value | line 32630-32656 | ✅ ble_provisioning.cpp:386-402 | parity |
| `set_cfg_info` (0=erase storage, 1=commit + restart) | line 32608-32628 + 32837 | ✅ ble_provisioning.cpp:407-451 | parity (restart at line 449) |
| `get_dev_info` → sn/system/version | line 32588-32606 | ✅ ble_provisioning.cpp:456-467 | parity |
| Response chunking (20 B every 30 ms) `FUN_4200ce20` | line 32450-32527 | ✅ `sendBleResponse` ble_provisioning.cpp:132 | parity |

### 4.5. NVS

| Stock element | Ghidra ref | OpenNova | Gap |
|---|---|---|---|
| Partition `fctry` + namespace `fctry` | line 28102, etc | ✅ `nvs_flash_init_partition("fctry")` (nvs_storage.cpp:18) | parity |
| Key `sn_code` (string) | s:867 | ✅ `NVS_KEY_SN` (config.h:171) | parity |
| Key `sn_flag` (u8) | s:868 | ⚠️ `NVS_KEY_SN_FLAG` defined but never read | OpenNova always reads SN, ignores flag. Stock requires flag==1 to consider SN valid. |
| Namespace `storage` | s:?? everywhere | ✅ `NVS_NS_STORAGE` (config.h:170) | parity |
| `wifi_data` 96 B (32+64) | s:843 | ✅ size 96 (nvs_storage.cpp:72-89) | parity |
| `wifi_ap_data` 96 B | s:848 | ✅ size 96 | parity |
| `mqtt_data` 32 B with port @ off 0x1e LE u16 | line 32675 | ✅ (nvs_storage.cpp:114-133) | parity |
| `lora_data` 4 B (addrHi, addrLo, channel, 0x00) | FUN_4200e028 | ✅ (nvs_storage.cpp:137-154) | parity |
| `lora_hc_lc` 2 B | FUN_4200e100 | ✅ | parity |
| `rtk_data` 40 B (lat double + NS + lon double + EW + alt double + …) | line 29467 (FUN_4200dde0) | ⚠️ `nvsReadRtk`/`nvsWriteRtk` read/write 40 B blob but **structure of 8+1+8+1+8+… is never decoded** | **gap** — OpenNova has no fixed-base re-arm path, so stored RTK position is unused. |
| `cfg_flag` u8 | line 32619 | ✅ (nvs_storage.cpp:184-204) | parity |
| Partition `log_status` (separate partition, not namespace) | line 28195 | ❌ no `log_status` init | OpenNova lacks log telemetry partition. Not used by mower protocol — pure local telemetry. |

### 4.6. GPIO + Sensor I/O

| Stock | Ghidra ref | OpenNova | Gap |
|---|---|---|---|
| Hall pins GPIO15 + GPIO3 | FUN_4200a160 line 29751-29757 | ❌ no `pinMode`/`attachInterrupt` for either | **CRITICAL** — charger cannot detect dock event itself. Mower has to assert dock via LoRa. |
| RTK_STAT pin GPIO13 | line 29761-29763 | ❌ | **CRITICAL** — no live RTK-fix indication. `gpsData.rtkFixed` set only from GNGGA quality (==4 or 5), so fine, but no edge-triggered logging. |
| RTK_TIMEPULSE pin GPIO9 (PPS) | line 29764-29766 | ❌ | **CRITICAL** — without PPS, rtk_config_task cannot transition AUTO_OPT_DONE → OPERATIONAL. OpenNova has no rtk_config_task anyway, so equally broken. |
| TEMP_1/2 GPIO4/5 | line 29767-29772 | ❌ | Cosmetic — temp event used only to flag start. |
| Other GPIO (0x10, 0x23, 0x24, 0x25, 0x2d, 0x30, 0x0c, 0x2e, 0x02) | line 29724-29732 | ❌ | Charger output relays / status LEDs — likely cosmetic. Need wiring schematic to interpret. |
| Hall logic OR (both==1 = ON, both==0 = OFF, xor = INVALID) | FUN_4200a2bc line 29779 | ❌ | OpenNova polls digitalRead in placeholder loop with no consumer. |
| GPIO event queue → ISR handler `FUN_42000b34` posting to `*DAT_42000b1c` | line 29744, 29753-29772 | ❌ | No `gpio_install_isr_service` call in OpenNova. |

### 4.7. RTK Base State Machine

| Stock state | Ghidra ref | OpenNova | Gap |
|---|---|---|---|
| FSM (15 states) | FUN_42009ed4 line 29529 | ❌ no FSM, no `rtk_config_task` | **CRITICAL** — no runtime UM980 reconfig, no fixed-base reload, no PPS-driven state advance. |
| `FUN_42009d24` UM980 cmd sender (3 modes: auto_opt, moving, fixed) | line 29426-29521 | ⚠️ partial — `gpsInit` only sends auto_opt cmd list at boot once | **gap** — no way to switch to moving-base or saved-fixed-base post-boot. |
| Stored RTK pos → `mode base <lat> <ns> <lon> <ew> <alt>` snprintf | line 29475-29508 | ❌ never built | Fixed-base re-arm broken if charger reboots without internet (cannot perform fresh survey-in). |
| Queue `RTK_CMD_*` (0x00..0x05) | s:508-518 | ❌ no queue | All BLE `set_rtk_info` calls are no-ops. |
| PPS-driven state advance | line 29617-29643 | ❌ | OpenNova never enters state 0x0e (OPERATIONAL). |
| UM980 init cmd list | s:524-536 + FUN_42009c60 | ✅ `UM980_INIT_CMDS[]` (gps_parser.cpp:30-43) | List equivalent (+ adds `CONFIG SBAS DISABLE`). |

### 4.8. OTA

| Stock | Ghidra ref | OpenNova | Gap |
|---|---|---|---|
| HTTPS OTA via esp_https_ota | FUN_4205d1c8 line 118412 | ⚠️ HTTP OTA via Arduino `Update.h` (ota_handler.cpp) | Works for HTTP URLs but not HTTPS. Mower protocol uses `http://` everywhere (per CLAUDE.md "URLs MOETEN http://"), so functionally compatible. |
| Version compare strncmp len 6 | line 34483 | ✅ ota_handler section (in mqtt_handler.cpp:330) | parity. Note: stock returns value=-2 on downgrade; OpenNova also returns -2. |
| MD5 verify | (in advanced_ota task) | ✅ MD5Builder (ota_handler.cpp:54-58, 96-108) | parity |
| Progress publish `ota_upgrade_state` | FUN_4205cd4c line 118377 | ✅ `publishOtaProgress` (ota_handler.cpp:9-15) | parity payload shape |
| TCP server OTA (alt path) | FUN_4205cbac + FUN_4205c8c4 line 118358 | ❌ no TCP listener | **gap** — see §5.3 |
| Boot partition switch on `b` console | line 28210-28218 | ✅ uart_console.cpp:160-169 | parity |

### 4.9. UART Console

| Stock single-char cmd | Ghidra ref | OpenNova | Gap |
|---|---|---|---|
| `v` print version | line 28161 | ✅ uart_console.cpp:84-89 | parity |
| `a` queue 0x00 to rtk_config_task (RTK_CMD_AUTO_OPT) | line 28165-28169 | ⚠️ queue 0x00 to LoRa queue — wrong target! | **gap** — should target rtk_config_task queue. |
| `m` queue 0x01 to rtk_config_task (RTK_CMD_MOVING_BASE) | line 28170-28174 | ⚠️ queue 0x01 to LoRa | same wrong target |
| `f` queue 0x02 to rtk_config_task (RTK_CMD_FIXED_BASE) | line 28175-28179 | ⚠️ queue 0x02 to LoRa | same wrong target |
| `o` post 0 to ota_queue (`*DAT_42000878`) | line 28180-28185 | ⚠️ queue 0x03 to LoRa | wrong target; OpenNova has otaQueue but `o` doesn't trigger OTA |
| `w` post 0 to wifi_queue | line 28186-28190 | ⚠️ queue 0x04 to LoRa | wrong target — should call `wifiReconnect()` |
| `d` wipe `storage` + `fctry` + `log_status` + reboot | line 28191-28198 | ⚠️ queue 0x05 to LoRa | doesn't actually wipe anything! |
| `@` wipe `fctry` + reboot | line 28199-28204 | ✅ uart_console.cpp:140-151 | parity |
| `r` reboot | line 28205-28208 | ✅ uart_console.cpp:154-158 | parity |
| `b` set next OTA boot partition + reboot | line 28210-28218 | ✅ uart_console.cpp:160-169 | parity |
| `SN_GET` | line 28100-28111 | ✅ uart_console.cpp:39-45 | parity |
| `SN_SET:<sn>` | line 28114-28154 | ⚠️ uart_console.cpp:48-62 — only writes SN, doesn't overwrite MQTT to mqtt-dev | **intentional gap** — OpenNova drops the dev-MQTT redirect "feature" (security improvement). |
| `SN_SET:<sn>,<mqtt>` two-arg | line 28116-28148 | ❌ not implemented | not needed |
| `LORARSSI:<5 fields>` parse + write | line 28287-28321 | ⚠️ uart_console.cpp:65-66 — only prints RSSI, doesn't parse fields | factory-only stock feature; safe to omit |

### 4.10. WiFi

| Stock | OpenNova | Gap |
|---|---|---|
| `WIFI_AP_STA` mode 3 | ✅ wifi_manager.cpp:23 | parity |
| `WIFI_PROTOCOL_11G_MAJ` (proto 7) | ❌ default proto used | minor |
| `esp_wifi_set_max_tx_power(0x50)` | ✅ `WIFI_POWER_19_5dBm` wifi_manager.cpp:36 | close (0x50 = 19.5 dBm ≈ 19.5 dBm) |
| AP SSID = SN at boot | ✅ wifi_manager.cpp:20 | parity |
| AP passwd = `12345678` default | ✅ `WIFI_AP_PASSWORD` config.h:125 | parity |
| 55-iter STA connect timeout | ✅ wifi_manager.cpp:67 | parity |
| auto-reconnect on disconnect | ✅ wifi_manager.cpp:120 | parity |

### 4.11. AES

| Stock | OpenNova | Gap |
|---|---|---|
| Algorithm AES-128-CBC | ✅ aes_crypto.cpp:43, 65 | parity |
| Key formula `"abcdabcd1234" + SN[-4:]` | ✅ `buildKey` aes_crypto.cpp:7-17 | parity |
| IV `abcd1234abcd1234` static | ✅ `AES_IV` config.h:26 | parity |
| Null-byte padding (NOT PKCS7) | ✅ aes_crypto.cpp:24, 70-72 | parity |
| Length check `>0, <1024, %16==0` | ✅ aes_crypto.cpp:51-53 | parity |

---

## 5. Critical Gaps (block mower compatibility / RTK quality)

### 5.1. No `rtk_config_task` FSM

**Stock behavior (FUN_42009ed4 line 29529):**
- After boot, FSM idles in state 0.
- On `RTK_CMD_START` (from cs_gpio_task on RTK_STAT=0): state 0 → 2 (START_PENDING).
- On `RTK_CMD_AUTO_OPT` (queued externally): state 2 → 3 (RUNNING) → call `FUN_42009d24(0)` to send auto-opt sequence. On success: state 4 (DONE).
- On `RTK_CMD_PPS` (from cs_gpio_task on GPIO9 rising): state 2 or 4 → 0xe (OPERATIONAL). state 7 → 8, state 11 → 12.
- If NVS has `rtk_data` (saved survey-in position): on `RTK_CMD_FIXED_BASE`, FSM enters state 0xa, sends `mode base <lat> <ns> <lon> <ew> <alt>` + RTCM10x6/10x3/10x{74,84,94,124} + GNGGA + SAVECONFIG, transitions to 0xb on success.

**Why this matters:**
- After every reboot, OpenNova re-runs the 60 s survey-in. A charger that wakes up mid-mow leaves the mower without RTK for 60 s. Stock skips survey-in if `rtk_data` is non-empty in NVS.
- No PPS handling means OpenNova never asserts the "RTK base is locked" status internally. Today the charger reports RTK FIX via the GNGGA-quality field (5=float, 4=fixed), which works, but there's no separate "base survey done" signal.

**Concrete payloads to send (built by FUN_42009d24 case 2, line 29475-29508):**
```
UNLOGALL                                       \r\n
mode base 52.1234567890 N 6.2345678901 E 8.8200\r\n   // lat,ns,lon,ew,alt from NVS rtk_data
rtcm1006 com1 10                               \r\n
rtcm1033 com1 10                               \r\n
rtcm1074 com1 1                                \r\n
rtcm1084 com1 1                                \r\n
rtcm1094 com1 1                                \r\n
rtcm1124 com1 1                                \r\n
GNGGA    com1 1                                \r\n
SAVECONFIG                                     \r\n
```

**Implementation hooks:** OpenNova already has `rtk_data` NVS read/write (40 B blob). Decoding: offset 0..7 = lat double LE, offset 8 = NS char ('N'/'S'), offset 9..16 = lon double LE, offset 17 = EW char, offset 18..25 = alt double LE.

### 5.2. No `cs_gpio_task` + missing GPIOs

**Stock behavior (FUN_4200a318 line 29823):**
- GPIO event queue 10 deep × 4 B.
- ISR `FUN_42000b34` posts pin# to the queue.
- Task dispatches by pin number.

**Affected pins (line 29751-29772):**

| GPIO | Stock function | Bypass strategy |
|---|---|---|
| 15 + 3 | Hall sensors (dual for direction) | Could poll in chargerConfigTask at 100 ms — degrades to "is mower docked" boolean. |
| 13 | RTK_STAT (UM980 RTK indicator) | Already inferred from GNGGA quality field. Could replicate by reading gpio 13 in gpsTaskFunc. |
| 9 | PPS (UM980 1 Hz) | Without rtk_config_task FSM, not directly needed today. |
| 4 + 5 | TEMP sensor edges | Cosmetic. |

**Recommended fix:**
1. `attachInterrupt(15, IRAM, RISING)` + `attachInterrupt(3, IRAM, RISING)` in `chargerConfigTask` init.
2. Pin-event queue in FreeRTOS.
3. Dispatch hall events → currently-stubbed CHARGER_Q_SET_ON_OFF path.

### 5.3. No TCP server OTA

**Stock behavior (FUN_4205cbac → FUN_4205c8c4 line 118358):**
- Listens on a TCP socket (port from `DAT_42040a20`).
- Recvs frames `[0x02 0x02 0x07 0xFF len_hi len_lo … XOR 0x03 0x03]` (line 118218-118228).
- payload[0] must be `0x3a` (`:`). payload[1] is sub-cmd 0x01/0x03/0x05/0x07.
- 0x01 GET_OTA_VERSION_INFO: respond with current version block.
- 0x03 SET_OTA_FILE_INFO + file_len → `esp_ota_begin`. Stops mqtt_config_task via `*DAT_42040f14` queue (line 118245). Pauses for `DAT_42040f18` ms (typically 1000).
- 0x05 SET_OTA_DATA: append payload[2..] to `esp_ota_write`.
- 0x07 SET_OTA_FILE_END: `esp_ota_end` + `esp_ota_set_boot_partition`. Return success → caller closes socket → reboot.

**Use case:** factory floor, no internet, push firmware over USB+ethernet adapter via netcat.

**Recommendation:** defer; OpenNova has its own OTA path via dashboard. Document as a stock-only feature for "factory mode".

### 5.4. No `status_contro_task`

Stock string `status_contro_task: STATUS_CONTROL_QUEUE_CMD_GET_INFO` (s:954). Behavior: periodic status query + watchdog. If no MQTT command for N ticks → presumably reboot. Without it, a hung MQTT broker won't trigger recovery.

OpenNova ETA: ½ day to add a `lastMqttCmdMs` and `if (now - lastMqttCmdMs > 600000) ESP.restart()` in `mqttConfigTask`.

### 5.5. LoRa queue 0x07 (PING) + 0x27 (CONFIG_VERIFY)

`PING` (line 31398): log-only in stock, but the very existence of the queue id tells us mower expects a periodic LoRa liveness probe. Adding it lets us detect mower-side LoRa stuck states.

`CONFIG_VERIFY` (line 31491-31510): post-scan, stock sends current addr/channel/hc via `FUN_4200b56c` (mode-3 config write) → if NAK arrives, retries via `FUN_4200b64c` and sets `DAT_42000c74=1` (commit flag). OpenNova writes lora_data to NVS BEFORE scan completes (ble_provisioning.cpp:346-347), risking persistent invalid config if mower never ack's the scan.

---

## 6. Non-Critical Gaps

| Item | Effect | Worth fixing? |
|---|---|---|
| BLE bonding + MITM + static passkey | Anyone in BT range can pair | No — provisioning is a one-shot at install time; physical security suffices |
| `log_status` NVS partition wipe in `d` console | Stale telemetry survives a "wipe storage" | No — OpenNova has dashboard logs |
| `SN_SET:<sn>,<mqtt>` MQTT-host override | Factory-only flow that hard-resets MQTT broker to `mqtt-dev.lfibot.com` | Already removed (security win) |
| Hardcoded fallback URL `https://novabot-oss.oss-us-east-1.aliyuncs.com/…` | Cloud went offline (briefly) March 2026 | No — OpenNova uses dashboard URL |
| `cJSON_IsNull` strict validation on `get_lora_info`, `ota_version_info` | OpenNova accepts `0` and `null` indiscriminately | No — strictly more permissive; mower never sends these |
| `https_client_task` separation | OpenNova merges into otaTask | No — same outcome |
| 55-iter wifi connect | OpenNova matches | parity |
| WiFi protocol 7 | OpenNova uses default | No — connectivity not affected on consumer routers |
| Factory test pattern (LoRa queue -0x60) | Production code path | No |
| `LORARSSI:<5fields>` parse | Factory write-RSSI feature | No |
| Logging strings (`rev_msg_AUTO_OPT_wait`, etc) | Debug only | No |

---

## 7. MSM7 RTCM Broadcast Addition

**Current stock + OpenNova:** MSM4 (`1074/1084/1094/1124`) — sufficient for 2-frequency RTK and most ZED-F9P / mosaic walker receivers.

**MSM7 advantages:** higher-resolution observables (24-bit phase vs 22-bit), better cycle-slip detection, modern RTK engines (`mosaic-X5`, `ZED-F9P` post-fw 1.13, u-blox UBX-RX) prefer MSM7.

**UM980 commands to switch:**

The UM980 SIGNALGROUP setting controls which signals get emitted. Default `SIGNALGROUP 1` → MSM4. For MSM7 you typically want `SIGNALGROUP 2` (multi-freq) plus the 107x/108x/109x/112x message IDs:

```text
UNLOGALL COM1                  // stop everything first
CONFIG SIGNALGROUP 2           // multi-band signals (L1/L2/L5)
MODE BASE TIME 60 1.5 2.5      // (or MODE BASE <lat> <ns> <lon> <ew> <alt> for fixed)
CONFIG SBAS DISABLE
RTCM1006 COM1 5                // base ARP, 5 s
RTCM1033 COM1 5                // antenna descriptor, 5 s
RTCM1077 COM1 1                // GPS MSM7, 1 Hz
RTCM1087 COM1 1                // GLONASS MSM7, 1 Hz
RTCM1097 COM1 1                // Galileo MSM7, 1 Hz
RTCM1127 COM1 1                // BeiDou MSM7, 1 Hz
RTCM1230 COM1 5                // GLO L1/L2 code-phase bias (essential for GLONASS RTK)
GNGGA COM1 1                   // keep for fix-quality reporting
SAVECONFIG
```

**ESP32 changes required (OpenNova):**
- `gps_parser.cpp:30-43` `UM980_INIT_CMDS[]`:
  - Replace `RTCM1074/1084/1094/1124` with `RTCM1077/1087/1097/1127`.
  - Add `CONFIG SIGNALGROUP 2` BEFORE `MODE BASE …`.
  - Add `RTCM1230 COM1 5` AFTER the MSM7 lines.
- No other changes — LoRa relay (queue 0x03) and MQTT RTCM topic (`rtk/charger/<SN>/raw`) are byte-transparent. Frame size goes from ~60-80 B/sec (MSM4) to ~120-180 B/sec (MSM7) — well within the LoRa 0xb5 byte chunking limit.

**Mower compatibility:** mower runs a u-blox ZED-F9P (per FIRMWARE-MOWER.md). ZED-F9P accepts MSM7 natively — no firmware change needed mower-side.

**Walker compatibility:** OpenNova walker uses LC29HBA / LC29DA / mosaic-X5 (varies). All accept MSM7 if F/W is current. Verify on a per-unit basis.

**Stock charger compatibility:** stock charger users running v0.4.0 will continue to get MSM4 — they're a separate product line. No cross-impact.

---

## 8. Recommended Implementation Sequence

1. **(½ day) Add status watchdog** (`status_contro_task` equivalent) — `lastMqttCmdMs` + `lastLoraAckMs` reboot triggers.
2. **(1 day) `cs_gpio_task` + ISR** — interrupts on GPIO15, 3 (hall), 13 (RTK_STAT), 9 (PPS). Post events to a 10-deep queue. Dispatch in a new task pinned to core 0.
3. **(2 days) `rtk_config_task` FSM** — port the 15-state FSM. Decode `rtk_data` NVS blob. Implement `FUN_42009d24` equivalent for AUTO_OPT/MOVING/FIXED. Wire `RTK_CMD_PPS` from cs_gpio_task. **Test cases:** (a) cold boot with empty NVS → survey-in; (b) reboot with saved NVS → fixed-base resume in <2 s.
4. **(1 day) UART event tasks** — replace polling in `gpsTaskFunc` and `loraConfigTask` with ESP-IDF `uart_driver_install + uart_event_task` pattern. Verifies under burst load.
5. **(½ day) LoRa queue 0x07 + 0x27** — PING (link liveness) and CONFIG_VERIFY (post-scan retry-then-persist).
6. **(½ day) `set_lora_info` async fix** — ble_provisioning.cpp:333-343 should actually wait for scan completion via a semaphore signaled by `loraConfigTask`.
7. **(½ day) Console `a/m/f/o/w/d` fix** — target correct queues (rtk/ota/wifi) instead of LoRa.
8. **(1 day) MSM7 RTCM** — per §7. Test with mosaic-X5 walker + ZED-F9P mower.
9. **(deferred) TCP server OTA** — only if a factory-flash story is needed.

**Total realistic effort: ~7 days end-to-end, ~10 days with full regression on RTK.**

---

## 9. Appendix — Key Ghidra Symbols (Stock v0.4.0)

| Symbol | Address | Meaning |
|---|---|---|
| `FUN_4200e8c4` | 0x4200e8c4 | MQTT JSON command dispatcher (9 cmds) |
| `FUN_4200cfc0` | 0x4200cfc0 | BLE shared JSON command dispatcher (9 cmds) |
| `FUN_4200f00c` | 0x4200f00c | `up_status_info` builder + publisher |
| `FUN_4200f158` | 0x4200f158 | mqtt_config_task body |
| `FUN_4200b8d4` | 0x4200b8d4 | lora_config_task body |
| `FUN_42009ed4` | 0x42009ed4 | rtk_config_task body |
| `FUN_42009d24` | 0x42009d24 | UM980 send-config dispatch (auto/moving/fixed) |
| `FUN_4200a318` | 0x4200a318 | cs_gpio_task body |
| `FUN_4200a56c` | 0x4200a56c | charger_config_task body |
| `FUN_4200d9b4` | 0x4200d9b4 | spp_task body |
| `FUN_4200da2c` | 0x4200da2c | ble_init (GATT setup) |
| `FUN_4200c850` | 0x4200c850 | GATT WRITE event handler (ble_start/ble_end framing) |
| `FUN_4200ce20` | 0x4200ce20 | BLE chunked notify sender |
| `FUN_4200e7f8` | 0x4200e7f8 | AES-encrypt + MQTT publish |
| `FUN_4200c008` | 0x4200c008 | UUID lookup (which characteristic was written) |
| `FUN_4205cbac` | 0x4205cbac | tcp_server init |
| `FUN_4205c8c4` | 0x4205c8c4 | tcp_server recv loop |
| `FUN_4205c748` | 0x4205c748 | TCP frame parser (`[0x02 0x02 0x07 0xFF …]`) |
| `FUN_4205c430` | 0x4205c430 | get_ota_version_info via TCP |
| `FUN_4205c58c` | 0x4205c58c | set_ota_file_info (esp_ota_begin) |
| `FUN_4205c480` | 0x4205c480 | set_ota_data (esp_ota_write) |
| `FUN_4205c6f8` | 0x4205c6f8 | set_ota_file_end (esp_ota_end + set_boot_part) |
| `FUN_4205d1c8` | 0x4205d1c8 | advanced_ota_example_task entrypoint |
| `FUN_4205d1e8` | 0x4205d1e8 | https_client_task body |
| `FUN_4200a160` | 0x4200a160 | GPIO + cs_gpio_task init |
| `FUN_4200a6e4` | 0x4200a6e4 | Bubble sort RSSI ascending |
| `FUN_4200b56c` | 0x4200b56c | LoRa write config (mode 3 → cmd → mode 0) |
| `FUN_4200b64c` | 0x4200b64c | LoRa write config + persist (post-scan) |
| `PTR_s_abcd1234abcd1234status_contro_ta_42001310` | 0x42001310 | AES IV string (16 B `abcd1234abcd1234` then "status_contro_task…" right after) |
| `DAT_42000828` | 0x42000828 | LoRa addr (u16) + channel (u8 @ off 1) globals |
| `DAT_42000c54..c68` | 0x42000c54..0x42000c68 | mower_status / mower_info / mower_x/y/z / mower_info1 cache |
| `DAT_42000c6c` | 0x42000c6c | mower_error miss counter |
| `DAT_42000c88` | 0x42000c88 | LoRa ack result (0=pending, 1=success, 0x101=error) |
| `DAT_420009b0` | 0x420009b0 | rtk_config_task FSM state variable |
| `DAT_420010f4` | 0x420010f4 | set_cfg_info commit flag (1 → restart after response) |

---

*End of analysis.*
