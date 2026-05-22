# Mower Provisioning Flow

!!! success "Fully Working (March 2026)"
    BLE provisioning for the mower has been confirmed working end-to-end using both the official Novabot app and the bootstrap wizard's native BLE (`@stoprocent/noble`). The mower connects to WiFi and MQTT without requiring a restart.

## Key Differences from Charger

| Aspect | Charger | Mower |
|--------|---------|-------|
| BLE name | `CHARGER_PILE` | `Novabot` / `NOVABOT` |
| BLE GATT service | `0x1234` | `0x0201` |
| Write characteristic | `0x2222` | `0x0011` |
| Notify characteristic | `0x2222` (same) | `0x0021` |
| `set_wifi_info` | `sta` + `ap` | **Only `ap`** |
| `set_rtk_info` | Yes | **No** |
| `set_cfg_info` | `1` | `{"cfg_value":1,"tz":"<host-tz>"}` |
| `set_lora_info_respond` | Channel number (e.g., 17) | `null` |
| Command order | wifi → mqtt → lora → rtk → cfg | wifi → lora → mqtt → cfg |

!!! info "Mower notify routing"
    Mower notify characteristic is `0x0021`. The wizard subscribes to every notify-capable characteristic on the service and filters incoming frames by `expectedType`, so it does not matter which characteristic the device emits on.

!!! warning "`result:1` does NOT mean rejected"
    Both `result:0` and `result:1` mean "acknowledged/applied". This was proven: `set_wifi_info` returned `result:1` but the WiFi password was successfully changed. All BLE commands work regardless of result value.

## Prerequisites

- Charger already provisioned and online
- Mower powered on and in provisioning mode
- Mower serial number known (e.g., `LFIN2230700XXX`)

## Step-by-Step Flow

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Mower as Mower (BLE)
    participant Server

    User->>App: Enter mower SN (or scan QR)
    User->>App: Enter home WiFi credentials

    App->>Mower: BLE Connect (Novabot)
    App->>Mower: get_signal_info (handshake, non-fatal)

    Note over App,Mower: Configuration sequence
    App->>Mower: set_wifi_info {ap only!}
    Mower-->>App: set_wifi_info_respond {result: 0 or 1}

    App->>Mower: set_lora_info {addr:718, channel:17, hc:20, lc:14}
    Mower-->>App: set_lora_info_respond {value: null}
    Note over App,Mower: Charger and mower MUST share identical addr AND channel<br/>(2026-04-23 working-pair rule; older "mower = charger - 1" is obsolete)

    App->>Mower: set_mqtt_info {addr, port}
    Mower-->>App: set_mqtt_info_respond {result: 0 or 1}

    App->>Mower: set_cfg_info {cfg_value: 1, tz: <host-tz>}
    Mower-->>App: set_cfg_info_respond {result: 0 or 1}

    Note over Mower: Disconnects BLE<br/>Connects WiFi + MQTT

    App->>Server: POST getEquipmentBySN {sn}
    App->>Server: POST bindingEquipment {sn, appUserId, userCustomDeviceName}
```

## BLE Command Payloads

### set_wifi_info (Mower — AP only)

```json
{
  "set_wifi_info": {
    "ap": {
      "ssid": "HomeNetwork",
      "passwd": "wifi-password",
      "encrypt": 0
    }
  }
}
```

!!! warning "No `sta` sub-object"
    Unlike the charger, the mower does NOT receive a `sta` WiFi configuration. The mower connects directly to the home network via the `ap` credentials.

### set_lora_info

```json
{"set_lora_info":{"addr":718,"channel":17,"hc":20,"lc":14}}
```

Response: `{"type":"set_lora_info_respond","message":{"value":null}}`

!!! important "Identical pair rule (2026-04-23)"
    Use the SAME `addr` and SAME `channel` as the paired charger. The older "mower = charger channel - 1" convention is obsolete; mismatched pairs cause Error 8 (LoRa comm fail) and Error 132 (data transmission loss).

### set_mqtt_info

```json
{"set_mqtt_info":{"addr":"mqtt.lfibot.com","port":1883}}
```

Response: `{"type":"set_mqtt_info_respond","message":{"result":0}}`

!!! info "MQTT redirect via BLE"
    `set_mqtt_info` modifies the mower's `json_config.json` directly. This is how the mower is pointed to the local server instead of `mqtt.lfibot.com`.

### set_cfg_info (with timezone)

```json
{"set_cfg_info":{"cfg_value":1,"tz":"<host-tz>"}}
```

The wizard derives `tz` from the host running the provisioner; it is not hard-coded to `Europe/Amsterdam`.

!!! note "`tz` in BLE set_cfg_info is SAFE"
    The `tz` field in BLE `set_cfg_info` writes to `json_config.json` via the BLE handler. This is a completely different code path from the MQTT `ota_upgrade_cmd` timezone bug. BLE timezone is safe.

## BLE Frame Protocol

| Property | Value |
|----------|-------|
| Company ID | `0x5566` (in manufacturer data) |
| Frame start | `ble_start` string |
| Frame end | `ble_end` string |
| Chunk size | 20 bytes |
| Chunk delay | 100ms between chunks |
| Payload | JSON, split into 20-byte chunks |

!!! tip "Response filtering"
    Use an `expectedType` parameter when waiting for responses. The mower may send stale responses from previous commands. Filter by the expected response type (e.g., `set_wifi_info_respond`).

!!! warning "Char 0x0021 binary data"
    The mower's notify characteristic (`0x0021`) may emit unrelated binary data (hex `6262...6363...`) that is NOT a BLE frame response. The wizard subscribes to every notify-capable characteristic on the service and filters frames by `expectedType`, so spurious binary chatter is discarded.

## Server-Side Requirements

For BLE provisioning to work with the local server, these server responses are critical:

| Endpoint | Critical Detail |
|----------|----------------|
| `getEquipmentBySN` | `userId: 0` for unbound devices (not a number) → triggers BLE provisioning in app |
| `getEquipmentBySN` | `chargerAddress: null, chargerChannel: null` for mower (ALWAYS) |
| `bindingEquipment` | Body: only `sn`, `appUserId`, `userCustomDeviceName` — no LoRa fields |
| `saveCutGrassRecord` | Must return `ok(null)` on empty/unparseable body (mower sends multipart) |

### skipBle Logic

The server uses `skipBle` to prevent BLE overwrite of an already-online mower:

- **Online mower** → `macAddress: null` in response → app skips BLE
- **Offline mower** → `macAddress: "50:41:1C:39:BD:C1"` (example MAC; the actual value is read from `device_factory`) → app starts BLE provisioning

### Recovery

If the mower gets stuck in BLE provisioning mode:

1. Turn OFF charging station
2. Turn OFF mower
3. Turn ON charging station, wait 30 seconds
4. Turn ON mower
5. Connection restores automatically
