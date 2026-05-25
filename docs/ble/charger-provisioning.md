# Charger Provisioning Flow

## Prerequisites

- Charger powered on (DC24-30V)
- Charger NOT connected to WiFi/MQTT (must be in provisioning mode)
- Phone Bluetooth enabled
- Charger serial number known (e.g., `LFIC1230700XXX`)

## BLE Device

| Property | Value |
|----------|-------|
| BLE Name | `CHARGER_PILE` |
| BLE MAC | `48:27:E2:1B:A4:0A` |
| Service UUID | `0x1234` |
| Command Characteristic | `0x2222` |

## Step-by-Step Flow

!!! danger "CRITICAL: `set_wifi_info` MUST come before `get_signal_info`"
    The charger has an internal state machine. `set_wifi_info` must be sent first; once `get_signal_info` is sent, the charger transitions to info mode and ignores further config writes. The working order (see `bootstrap/src/ble.ts`) is `set_wifi_info` then `get_signal_info` then the remaining config commands.

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Charger as Charger (BLE)
    participant Server as Local Server
    participant Cloud as Cloud API

    User->>App: Enter charger SN
    User->>App: Enter home WiFi credentials
    App->>Charger: BLE Connect (CHARGER_PILE)
    App->>Charger: Discover Services

    Note over App,Charger: Configuration (set_wifi_info MUST be first!)
    App->>Charger: set_wifi_info {sta + ap}
    Charger-->>App: set_wifi_info_respond {result: 0}

    App->>Charger: get_signal_info
    Charger-->>App: get_signal_info_respond {wifi, rtk}

    App->>Charger: set_rtk_info
    Charger-->>App: set_rtk_info_respond {result: 0}

    App->>Charger: set_lora_info {addr:718, channel:17, hc:20, lc:14}
    Charger-->>App: set_lora_info_respond {value: 17}
    Note over App: Charger and mower MUST share identical addr AND channel<br/>(2026-04-23 working-pair rule; older "channel - 1" is obsolete)

    App->>Charger: set_mqtt_info {addr, port}
    Charger-->>App: set_mqtt_info_respond {result: 0}

    App->>Charger: set_cfg_info (commit)
    Charger-->>App: set_cfg_info_respond {result: 0}

    Note over Charger: Disconnects BLE<br/>Reconnects WiFi + MQTT

    Note over App,Server: Equipment Registration
    App->>Server: POST getEquipmentBySN {sn}
    Server-->>App: {macAddress, chargerAddress, account, password}

    App->>Server: POST bindingEquipment {chargerSn}
    Server-->>App: {value: null}
    Note over Server: Cloud stores the requested channel (e.g. 17) on the charger record server-side

    App->>Server: POST userEquipmentList
    Server-->>App: Charger appears in device list
```

## BLE Command Sequence

!!! danger "CRITICAL: `set_wifi_info` MUST come before `get_signal_info`"
    `set_wifi_info` must come before `get_signal_info`; once `get_signal_info` is sent, the charger transitions to info mode and ignores further config writes.

!!! note "AP SSID fallback"
    The charger AP SSID is `targetSn || 'CHARGER_PILE'` (see `bootstrap/src/ble.ts`). If the SN is unknown at provisioning time, the AP SSID falls back to the literal `CHARGER_PILE` (known bug, see `charger-ap-name-bug` in project memory). Pre-fetch the SN before provisioning when possible.

| Step | Command | Key Data |
|------|---------|----------|
| 1 | `set_wifi_info` | **MUST be first** -- `sta` (home WiFi) + `ap` (charger AP, passwd=12345678; SSID = SN, falls back to `CHARGER_PILE`) |
| 2 | `get_signal_info` | Read WiFi RSSI + GPS quality (sent after WiFi config) |
| 3 | `set_rtk_info` | RTK GPS configuration |
| 4 | `set_lora_info` | `addr`: 718, `channel`: 17 (charger and mower share identical addr AND channel; the older "channel - 1" pattern is obsolete since 2026-04-23), `hc`: 20, `lc`: 14 |
| 5 | `set_mqtt_info` | `addr`: server IP or hostname, `port`: 1883 |
| 6 | `set_cfg_info` | Commit all settings (value: 1) -- causes reboot |

!!! info "LoRa channel assignment"
    The value returned in `set_lora_info_respond` equals the requested channel on current firmware. The older "charger ch16 / mower ch15" off-by-one convention is obsolete (per the 2026-04-23 working-pair rule).

## After Provisioning

Once `set_cfg_info` is sent:

1. Charger disconnects from BLE
2. Charger connects to home WiFi (STA mode)
3. Charger connects to MQTT broker on port 1883
4. Charger starts publishing `up_status_info` every ~2 seconds
5. `charger_status` changes from 0 to operational values
6. `mower_error` counter starts incrementing (charger looking for mower via LoRa)

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Network configuration error. Please retry." | `set_wifi_info` or `set_mqtt_info` returned error | Check WiFi credentials, check MQTT broker reachable |
| "Network configuration error. Please ensure antenna..." | `set_lora_info` or `set_rtk_info` error | Check antenna connection |
| Charger not appearing in device list | `getEquipmentBySN` returns wrong data | Verify MAC address in `device_registry` matches BLE MAC. For mower registration `equipment.mac_address` MUST be the mower BLE MAC, never the charger's (see `ble-mac-address-critical` in project memory). |
| App can't find CHARGER_PILE | Charger already in operational mode | Power cycle charger to enter provisioning mode |
