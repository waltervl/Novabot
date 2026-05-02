# Charger RTCM Flow Analysis — Stock vs OpenNova

**Status:** Investigation complete, OpenNova fix + walker tap design ready.
**Date:** 2026-05-02
**Context:** Building handheld RTK perimeter walker (LC29HDA + ESP32-S3 + WiFi). Need RTCM correction source. Investigated whether mower-side NTRIP relay possible — answer: no, RTCM never reaches mower Linux. Pivoted to charger-side MQTT publish.

## Hardware Topology (confirmed)

```
Charger ESP32-S3
  ├── UART1 → EBYTE LoRa modem (433 MHz)
  └── UART2 → UM980 GNSS module
              ├── COM1 (NMEA + commands + RTCM3 multiplexed)
              └── (other COM ports unused)

Mower
  ├── STM32 (chassis_control)
  │     ├── LoRa modem (matched addr+channel with charger)
  │     └── GNSS chip (separate; receives RTCM via STM32 internal UART)
  └── Linux (ROS 2)
        └── chassis_control_node ← USB CDC ttyACM0 ← STM32
```

**Key fact:** RTCM bytes flow Charger UM980 → Charger ESP32 → LoRa air → Mower STM32 → Mower GNSS chip directly. **They never reach mower Linux.** Decompiled `chassis_control_node` confirms only `/gps_raw` (parsed positions) is published, no raw RTCM.

## Stock Charger (v0.4.0) — RTK Forwarding

### State machine — `FUN_42009ed4` (rtk_config_task)

UM980 work-mode commands (queued via `RTK_CMD_*`):

| Cmd byte | Mode | State machine result |
|----------|------|----------------------|
| 0x00 | AUTO_OPT_BASE | UM980 auto-survey base (state 4) |
| 0x01 | MOVING_BASE | UM980 moving-base mode (state 7) |
| 0x02 | FIXED_BASE | UM980 fixed-base, coords from NVS `storage` (state 0xb) |
| 0x03 | START | Boot UM980 to active (state 2) |
| 0x04 | PPS | After fix acquired → state 0xe (active) |
| 0x05 | TIMEOUT | Reset |

### State 0x0e (active running) — byte forwarding

`FUN_42009...` reader (line 29191-29217 in `charger_v040_decompiled.c`):

```c
if (*DAT_420009b0 == 0xe) {
    FUN_42009500(param_1, param_2);                  // pre-process bytes
    iVar5 = xStreamBufferSend(*DAT_42000a38,         // stream buffer (LoRa drains this)
                              param_1, param_2, 0);  // raw bytes from UM980 UART
    if (param_2 == iVar5) {
        // queue cmd 0x03 to LoRa task with byte count
        xQueueSend(*DAT_42000844, &{0x03, length}, 0);
    }
}
```

### LoRa task — `FUN_4200b8d4`, queue cmd 0x03

```c
else if (local_30 == '\x03') {
    if (bStack_2f < 0xb5) {                             // length < 181 (LoRa MTU)
        *DAT_42000d44 = 0x31;                           // category 0x31 RTK_RELAY
        uVar8 = xStreamBufferReceive(*DAT_42000a38,     // drain stream buffer
                                     DAT_42000d94,
                                     bStack_2f, 0);
        if (bStack_2f == uVar8) {
            (void)strstr(DAT_42000d44, "GNGGA");        // diagnostic counter only!
            FUN_4200b2bc(DAT_42000d44, uVar8 + 1);      // build LoRa frame, send
        }
    }
}
```

The "GNGGA" strstr at line 31362 is **only a diagnostic counter** (increments `iVar6`) — it does NOT filter. Whatever bytes UM980 emits flow through byte-for-byte.

### LoRa frame format (stock + OpenNova match)

```
[0x02 0x02] [addr_hi addr_lo] [len+1] [0x31 | <UM980 bytes>] [xor_checksum] [0x03 0x03]
```

- 2-byte start markers `0x02 0x02`
- 2-byte address (charger=0x0003)
- 1-byte length field = payload_length + 1
- Payload: category byte `0x31` + raw UM980 bytes (mixed NMEA + RTCM3)
- 1-byte XOR checksum over payload
- 2-byte end markers `0x03 0x03`
- Max payload ~180 bytes per frame (LoRa MTU at this bitrate)

## OpenNova Charger (v0.1.0) — Current State

### What's implemented

`firmware/charger/src/main.cpp` lines 263-272:
```c
case LORA_Q_GPS_POS: {
    GpsData gps = gpsGetData();
    if (gps.lastGnggaLen > 0) {
        payloadLen = loraBuildRtkRelay(payload, sizeof(payload),
                                       gps.lastGngga, gps.lastGnggaLen);
        if (payloadLen > 0) loraSendPayload(payload, payloadLen);
    }
    break;
}
```

`firmware/charger/src/gps_parser.cpp` only captures `$GNGGA` lines and parses fix quality. Other NMEA sentences and RTCM3 binary are discarded.

### Gaps vs stock

| Capability | Stock | OpenNova | Gap |
|------------|-------|----------|-----|
| UM980 base-mode config (AUTO/MOVING/FIXED) | ✅ via `FUN_42009d24` | ❌ none | **CRITICAL — no RTCM is ever generated** |
| UM980 RTCM3 output enabled | ✅ implicit when in base mode | ❌ default factory NMEA only | **Mower receives no RTCM** |
| Raw byte forwarding to LoRa | ✅ stream buffer + queue 0x03 | ❌ filters to GNGGA only | **CRITICAL — even if UM980 produced RTCM, it'd be discarded** |
| Diagnostic GNGGA counter | ✅ for monitoring base health | ✅ data is parsed | OK |

### Implication

OpenNova-flashed chargers do **not provide RTK corrections to the mower**. The mower receives only GNGGA position lines. Mower fix quality on OpenNova firmware ≈ SBAS sub-meter at best, **never RTK FIX**.

This is a latent bug, possibly unnoticed because:
- Most users use stock charger firmware (only mower is custom)
- OpenNova charger flashing is recent / experimental
- Mower can still localize via aruco markers + charger position, masking RTK absence

## Required Fixes

### Fix 1 — Configure UM980 as base station

Add UM980 init sequence to `gpsInit()` or new `rtkInit()`:

```cpp
// UM980 Unicore command set — see UM980 Reference Manual
GPS_SERIAL.println("MODE BASE TIME 60 1.5 2.5");          // auto-survey, 60s, 1.5m H, 2.5m V
GPS_SERIAL.println("CONFIG SBAS DISABLE");                 // base shouldn't use SBAS
GPS_SERIAL.println("RTCM1006 COM1 5");                     // base position, every 5s
GPS_SERIAL.println("RTCM1033 COM1 5");                     // antenna descriptor
GPS_SERIAL.println("RTCM1074 COM1 1");                     // GPS observations, 1Hz
GPS_SERIAL.println("RTCM1084 COM1 1");                     // GLONASS
GPS_SERIAL.println("RTCM1094 COM1 1");                     // Galileo
GPS_SERIAL.println("RTCM1124 COM1 1");                     // BeiDou
GPS_SERIAL.println("GNGGA COM1 1");                        // keep GNGGA for diagnostics
GPS_SERIAL.println("SAVECONFIG");                          // persist
```

Alternative for FIXED_BASE: use stored coords from NVS (matches stock state 2). For most users AUTO_BASE is fine.

### Fix 2 — Forward raw UM980 bytes to LoRa

Replace GNGGA-filter logic with raw stream buffer. New design:

```cpp
// gps_parser.cpp — add raw stream
static StreamBufferHandle_t rtkStreamBuf = NULL;
#define RTK_STREAM_SIZE 4096

void gpsInit() {
    GPS_SERIAL.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
    rtkStreamBuf = xStreamBufferCreate(RTK_STREAM_SIZE, 1);
    // ... UM980 base config commands ...
}

void gpsTaskFunc(void* param) {
    uint8_t buf[180];
    for (;;) {
        size_t n = 0;
        while (GPS_SERIAL.available() && n < sizeof(buf)) {
            buf[n++] = GPS_SERIAL.read();
        }
        if (n > 0) {
            // Raw forward to LoRa stream buffer
            xStreamBufferSend(rtkStreamBuf, buf, n, 0);

            // Notify LoRa task: queue cmd 0x03 with length
            LoraQueueCmd cmd = {};
            cmd.queueId = LORA_Q_RTK_RELAY;  // was 0x01 unused, now actual RTK relay
            cmd.area = n;                     // re-purpose 16-bit field as length
            xQueueSend(mqttGetLoraQueue(), &cmd, 0);

            // ALSO: parse GNGGA in-place for diagnostics (existing code)
            for (size_t i = 0; i < n; i++) parseGnggaByte(buf[i]);
        }
        vTaskDelay(pdMS_TO_TICKS(20));  // ~50Hz read rate
    }
}
```

LoRa task `case LORA_Q_RTK_RELAY:` becomes:
```cpp
case LORA_Q_RTK_RELAY: {
    uint8_t payload[LORA_MAX_PAYLOAD];
    size_t maxChunk = LORA_MAX_PAYLOAD - 1;  // -1 for category byte
    size_t requested = cmd.area;
    if (requested > maxChunk) requested = maxChunk;
    payload[0] = LORA_CAT_RTK_RELAY;
    size_t got = xStreamBufferReceive(rtkStreamBuf, payload + 1, requested, 0);
    if (got > 0) {
        loraSendPayload(payload, got + 1);
    }
    break;
}
```

### Fix 3 — Walker MQTT publish (branch RTCM to MQTT)

In the gps task, parallel to LoRa stream buffer push, publish raw bytes to MQTT:

```cpp
// In gpsTaskFunc, after xStreamBufferSend:
if (mqttIsConnected()) {
    // Topic: rtk/charger/<SN>/raw — binary RTCM3+NMEA stream
    char topic[64];
    snprintf(topic, sizeof(topic), "rtk/charger/%s/raw", serialNumber);
    mqttPublishRaw(topic, buf, n);  // QoS 0, no retain
}
```

`mqttPublishRaw` is a thin wrapper around `PubSubClient::publish` with binary payload (existing `PubSubClient` lib already supports this; just need a non-string overload exposed).

### Walker side (LC29HDA + ESP32-S3)

```cpp
// On MQTT message received for topic rtk/charger/+/raw:
void onRtcmMessage(const uint8_t* payload, size_t len) {
    // Forward bytes verbatim to LC29HDA UART RX
    LC29_SERIAL.write(payload, len);
}
```

LC29HDA accepts RTCM3 input on its main UART when configured as RTK rover (default).

## Walker Coordinate Frame Match

Same RTK base = same coordinate frame as mower. Walker punten kunnen rechtstreeks worden vergeleken met maaier kaart zonder UTM→lokaal transform op server. Charger UTM origin is impliciet in beide stromen.

Caveat: if charger is in MOVING_BASE mode (rare for stationary docking), walker frame becomes relative to current charger position. For perimeter mapping, FIXED_BASE or AUTO_BASE-then-FIXED is preferred.

## Open Questions

1. **UM980 baseline status on charger boot:** does stock firmware always end in state 0x0e, or only when commanded? OpenNova should mirror.
2. **RTCM bandwidth over LoRa:** at ~180 bytes/frame and ~5-10 RTCM3 messages/sec, total bytes/sec is well within LoRa air bitrate at SF7 BW125. No concern.
3. **MQTT broker bandwidth:** ~2-5 KB/s of binary RTCM. Aedes broker handles this fine but local LAN required (no cloud).
4. **Walker NTRIP-via-MQTT vs raw subscribe:** consider running a small NTRIP caster wrapper on the server that subscribes to `rtk/charger/+/raw` and serves standard NTRIP on port 2101. Walker uses standard ESP32-NTRIPClient lib instead of custom MQTT-binary handling. Cleaner.

## Implementation Path (suggested order)

1. Add UM980 base-mode config to OpenNova `gpsInit()` (Fix 1)
2. Refactor gps task to raw stream buffer + LoRa queue (Fix 2)
3. Test mower RTK FIX with patched OpenNova charger
4. Add MQTT raw publish branch (Fix 3)
5. Optionally: NTRIP caster on server that subscribes MQTT, exposes port 2101
6. Walker firmware: LC29HDA + NTRIP-client (or MQTT subscriber if no caster)

## References

- Stock charger Ghidra: `research/ghidra_output/charger_v040_decompiled.c`
  - LoRa frame builder `FUN_4200b2bc` @ line 30913
  - LoRa task main `FUN_4200b8d4` @ line 31302
  - RTK config state machine `FUN_42009ed4` @ line 29527
  - UART2 byte handler with stream-buffer fan-out @ line 29191
- OpenNova source: `firmware/charger/src/{main,gps_parser,lora_commands,lora_protocol}.cpp`
- LoRa pair memory: `working-lora-pair.md` (identical addr+channel rule)
- Mower-side LoRa proof: `chassis_control_node_decompiled.c:302632` ("warning_lora_rtk_data_overtime")
