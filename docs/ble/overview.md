# BLE Protocol Overview

The Novabot app configures devices via **BLE GATT** (not via WiFi AP or MQTT).
Commands are sent as JSON over a GATT characteristic.

## GATT Service Structure

Two distinct GATT layouts exist (see `bootstrap/src/ble.ts`).

| Device | Service UUID | Write Characteristic | Notify Characteristic | Aux Characteristic |
|--------|--------------|----------------------|-----------------------|--------------------|
| Charger | `0x1234` | `0x2222` (Write Without Response + Notify) | `0x2222` (same) | `0x3333` (flush) |
| Mower | `0x0201` | `0x0011` (Write Without Response) | `0x0021` (Notify) | n/a |

## BLE Device Names

| Device | BLE Name | Name Match (case-insensitive) |
|--------|----------|------------------------------|
| Charger | `CHARGER_PILE` | `chargerpile` |
| Mower | `Novabot` / `NOVABOT` | `novabot` |

## Frame Format

Large payloads are split into 20-byte chunks (~100ms between chunks), surrounded by ASCII markers:

```
ble_start
{"set_wifi_info":{"sta":{"ss
id":"MyNetwork","passwd":"pa
ssword123","encrypt":0},"ap"
:{"ssid":"LFIC1230700XXX","p
asswd":"12345678","encrypt":
0}}}
ble_end
```

## Command Flow

!!! danger "CRITICAL: Command order differs between charger and mower"
    The charger has an internal state machine that switches from "provisioning" mode to "info" mode after receiving `get_signal_info`. For chargers, `set_wifi_info` MUST be the first command. For mowers, `get_signal_info` can be sent first.

### Charger Command Order

```mermaid
sequenceDiagram
    participant App
    participant Charger as Charger (BLE)

    App->>Charger: BLE Connect
    App->>Charger: Discover Services (UUID 0x1234)
    App->>Charger: Subscribe to 0x2222 Notify
    App->>Charger: Write: set_wifi_info (MUST be first!)
    Charger-->>App: Notify: set_wifi_info_respond
    App->>Charger: Write: get_signal_info
    Charger-->>App: Notify: get_signal_info_respond
    App->>Charger: Write: set_rtk_info
    Charger-->>App: Notify: set_rtk_info_respond
    App->>Charger: Write: set_lora_info
    Charger-->>App: Notify: set_lora_info_respond
    App->>Charger: Write: set_mqtt_info
    Charger-->>App: Notify: set_mqtt_info_respond
    App->>Charger: Write: set_cfg_info (commit + reboot)
    Charger-->>App: Notify: set_cfg_info_respond
    Note over Charger: Reconnects WiFi + MQTT
```

### Mower Command Order

```mermaid
sequenceDiagram
    participant App
    participant Mower as Mower (BLE)

    App->>Mower: BLE Connect
    App->>Mower: Discover Services (UUID 0x1234)
    App->>Mower: Subscribe to 0x2222 Notify
    App->>Mower: Write: get_signal_info
    Mower-->>App: Notify: get_signal_info_respond
    App->>Mower: Write: set_wifi_info (chunked)
    Mower-->>App: Notify: set_wifi_info_respond
    App->>Mower: Write: set_lora_info
    Mower-->>App: Notify: set_lora_info_respond
    App->>Mower: Write: set_mqtt_info
    Mower-->>App: Notify: set_mqtt_info_respond
    App->>Mower: Write: set_cfg_info {cfg_value:1, tz:<host-tz>} (commit + reboot)
    Mower-->>App: Notify: set_cfg_info_respond
    Note over Mower: Reconnects WiFi + MQTT
```

!!! note "set_cfg_info payload differs by device"
    - Charger: plain integer `1`, e.g. `{"set_cfg_info":1}`.
    - Mower: object `{"set_cfg_info":{"cfg_value":1,"tz":"<host-tz>"}}`. The wizard derives `tz` from the host (it is not hard-coded).

## BLE Commands Summary

| Command | Response | Description |
|---------|----------|-------------|
| `get_signal_info` | `get_signal_info_respond` | Read WiFi RSSI + GPS quality |
| `get_wifi_rssi` | `get_wifi_rssi_respond` | Read WiFi signal strength |
| `set_wifi_info` | `set_wifi_info_respond` | Set WiFi SSID + password |
| `set_mqtt_info` | `set_mqtt_info_respond` | Set MQTT broker host/port |
| `set_lora_info` | `set_lora_info_respond` | Set LoRa configuration |
| `set_rtk_info` | `set_rtk_info_respond` | Set RTK GPS configuration |
| `set_para_info` | `set_para_info_respond` | Set other parameters |
| `set_cfg_info` | `set_cfg_info_respond` | Commit/activate configuration |

See [Charger Provisioning](charger-provisioning.md) and [Mower Provisioning](mower-provisioning.md) for detailed flows.

See [BLE Commands](commands.md) for full payload specifications.

!!! info "Provisioning mode only"
    Devices do NOT respond to BLE commands when already connected to WiFi+MQTT (operational mode). BLE provisioning only works when the device is in setup mode.
