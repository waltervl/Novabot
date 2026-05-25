# BLE Commands

Full payload specifications for all BLE provisioning commands.

---

## get_signal_info

Read WiFi RSSI and GPS satellite count.

```json title="Command"
{"get_signal_info":0}
```

```json title="Response"
{
  "type": "get_signal_info_respond",
  "message": {
    "result": 0,
    "value": {
      "wifi": 0,
      "rtk": 17
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `wifi` | WiFi RSSI (0 = strong signal) |
| `rtk` | GPS satellite count (17 = good) |

---

## set_wifi_info

Configure WiFi networks.

=== "Charger (STA + AP)"

    ```json
    {
      "set_wifi_info": {
        "sta": {
          "ssid": "HomeNetwork",
          "passwd": "wifi-password",
          "encrypt": 0
        },
        "ap": {
          "ssid": "LFIC1230700XXX",
          "passwd": "12345678",
          "encrypt": 0
        }
      }
    }
    ```

    The charger gets **both** `sta` (connect to home router) and `ap` (own access point).

    !!! note "AP SSID fallback"
        The provisioner sets `ssid = targetSn || 'CHARGER_PILE'`. If the SN is unknown at provisioning time the AP name falls back to the literal `CHARGER_PILE` (known bug, see `charger-ap-name-bug` in project memory).

=== "Mower (AP only)"

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

    The mower only gets `ap` — it connects via the charger's AP, not directly to the home router.

```json title="Response"
{
  "type": "set_wifi_info_respond",
  "message": {
    "result": 0,
    "value": null
  }
}
```

!!! warning "Charger vs Mower difference"
    - **Charger**: receives `sta` + `ap` (connects to home WiFi directly)
    - **Mower**: receives only `ap` (connects via charger AP OR home WiFi)

---

## set_mqtt_info

Configure MQTT broker connection. Only host and port — no credentials via BLE.

```json title="Command"
{"set_mqtt_info":{"addr":"mqtt.lfibot.com","port":1883}}
```

```json title="Response"
{
  "type": "set_mqtt_info_respond",
  "message": {
    "result": 0,
    "value": null
  }
}
```

---

## set_lora_info

Configure LoRa communication parameters.

```json title="Command"
{"set_lora_info":{"addr":718,"channel":16,"hc":20,"lc":14}}
```

| Field | Description |
|-------|-------------|
| `addr` | LoRa address (shared between charger and mower) |
| `channel` | Requested LoRa channel |
| `hc` | High channel limit (for scanning) |
| `lc` | Low channel limit (for scanning) |

!!! info "After scan, identical pair"
    After the channel scan the firmware picks an actual channel; charger and mower end up on identical `addr` AND identical `channel` (per the 2026-04-23 working-pair rule). The older "mower = charger - 1" convention is obsolete.

=== "Charger Response"

    ```json
    {
      "type": "set_lora_info_respond",
      "message": {
        "value": 15
      }
    }
    ```

    Returns the **actually assigned** channel (may differ from requested).

=== "Mower Response"

    ```json
    {
      "type": "set_lora_info_respond",
      "message": {
        "value": null
      }
    }
    ```

    Mower returns `null` (channel assigned by charger).

!!! warning "`result:1` is NOT an error"
    Both `result:0` and `result:1` mean "acknowledged" on these responses. Only specific non-zero codes indicate failure. Do NOT treat `result:1` as a failure (see `docs/reference/BLE.md` and the BLE provisioning section in `CLAUDE.md`).

!!! important "chargerChannel in bindingEquipment"
    The cloud stores the requested `channel` (e.g. 16) on the charger record server-side. `bindingEquipment` does NOT carry a `chargerChannel` field; see `docs/reference/BLE.md` (lines 66-77) for the actual binding payload shape.

---

## set_rtk_info

Configure RTK GPS.

```json title="Command"
{"set_rtk_info":0}
```

```json title="Response"
{
  "type": "set_rtk_info_respond",
  "message": {
    "result": 0,
    "value": null
  }
}
```

!!! note
    Only sent during **charger** provisioning, not mower.

---

## set_cfg_info

Commit and activate all configuration changes.

=== "Charger"

    ```json
    {"set_cfg_info":1}
    ```

=== "Mower (with timezone)"

    ```json
    {"set_cfg_info":{"cfg_value":1,"tz":"Europe/Amsterdam"}}
    ```

```json title="Response"
{
  "type": "set_cfg_info_respond",
  "message": {
    "result": 0,
    "value": null
  }
}
```

After `set_cfg_info`, the device disconnects from BLE and reconnects to WiFi + MQTT.

---

## Error Handling

The app treats specific error codes (NOT `result:1`, which means "acknowledged") as configuration failures:

> **"Network configuration error. Please retry."**

is shown when `set_wifi_info_respond` or `set_mqtt_info_respond` returns a recognised error code, and:

> **"Network configuration error. Please ensure the antenna is connected properly and try again."**

is shown when `set_lora_info_respond` or `set_rtk_info_respond` returns a recognised error code. `result:1` is acknowledged and is NOT one of these failure codes.
