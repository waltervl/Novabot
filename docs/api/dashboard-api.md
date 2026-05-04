# Dashboard API (Local)

Local-only endpoints for the React web dashboard. No authentication required.

---

## Admin Endpoints

### GET `/api/admin/devices`

List all known devices from the device registry.

```json title="Response"
[
  {
    "sn": "LFIC1230700XXX",
    "macAddress": "48:27:E2:1B:A4:0A",
    "lastSeen": "2026-02-26T10:00:00Z",
    "deviceType": "charger"
  }
]
```

---

### POST `/api/admin/devices/:sn/mac`

Manually register a MAC address for a device.

```json title="Request"
{
  "macAddress": "48:27:E2:1B:A4:0A"
}
```

```json title="Response"
{
  "sn": "LFIC1230700XXX",
  "macAddress": "48:27:E2:1B:A4:0A",
  "status": "ok"
}
```

---

## Device Endpoints

### GET `/api/dashboard/devices`

List all devices with their current sensor snapshots.

```json title="Response"
{
  "devices": [
    {
      "sn": "LFIC1230700XXX",
      "macAddress": "48:27:E2:1B:A4:0A",
      "lastSeen": "2026-02-26T10:00:00Z",
      "online": true,
      "deviceType": "charger",
      "nickname": "Base Station",
      "sensors": {
        "charger_status": 285212929,
        "mower_x": 0,
        "mower_y": 0,
        "mower_z": 0,
        "battery_capacity": 100
      }
    }
  ]
}
```

---

### GET `/api/dashboard/devices/:sn`

Get a single device with sensor data.

---

### GET `/api/dashboard/sensors`

Get sensor definitions and translations.

---

## Map Endpoints

### GET `/api/dashboard/maps/:sn`

Get all maps for a device.

```json title="Response"
{
  "maps": [
    {
      "mapId": "uuid",
      "mapName": "Front Garden",
      "mapType": "work",
      "mapArea": [
        [52.1409, 6.2310],
        [52.1412, 6.2310],
        [52.1412, 6.2315],
        [52.1409, 6.2315]
      ],
      "createdAt": "2026-02-21T18:32:12Z"
    }
  ]
}
```

---

### POST `/api/dashboard/maps/:sn`

Create a new map (polygon).

```json title="Request"
{
  "mapName": "Back Garden",
  "mapType": "work",
  "mapArea": [
    [52.1409, 6.2310],
    [52.1412, 6.2310],
    [52.1412, 6.2315],
    [52.1409, 6.2315]
  ]
}
```

Map types: `work` (working area), `obstacle`, `channel` (unicom)

---

### PATCH `/api/dashboard/maps/:sn/:mapId`

Update map name or polygon area.

```json title="Request"
{
  "mapName": "Updated Name",
  "mapArea": [[52.14, 6.23], [52.15, 6.24]]
}
```

---

### DELETE `/api/dashboard/maps/:sn/:mapId`

Delete a map.

---

### POST `/api/dashboard/maps/:sn/request`

Request map list from mower via MQTT (`get_map_list`).

---

### POST `/api/dashboard/maps/:sn/request-outline`

Request map outline from mower via MQTT (`get_map_outline`).

```json title="Request"
{
  "mapId": "map0"
}
```

---

### POST `/api/dashboard/maps/:sn/export-zip`

Export maps as Novabot firmware-format ZIP.

```json title="Request"
{
  "chargingStation": {
    "lat": 52.1409,
    "lng": 6.2310
  },
  "chargingOrientation": 1.326
}
```

```json title="Response"
{
  "ok": true,
  "zipPath": "/path/to/export.zip",
  "downloadUrl": "/api/dashboard/maps/LFIN2230700XXX/download-zip"
}
```

---

### GET `/api/dashboard/maps/:sn/download-zip`

Download the exported ZIP file.

**Response**: Binary ZIP file download

---

### POST `/api/dashboard/maps/:sn/import-zip`

Import a Novabot-format ZIP into the database.

```json title="Request"
{
  "zipPath": "/path/to/import.zip",
  "chargingStation": {
    "lat": 52.1409,
    "lng": 6.2310
  }
}
```

---

### POST `/api/dashboard/maps/convert`

Convert coordinates between GPS and local (meters).

```json title="Request"
{
  "direction": "gps-to-local",
  "origin": { "lat": 52.1409, "lng": 6.2310 },
  "points": [[52.1412, 6.2315]]
}
```

---

## Trail Endpoints

### GET `/api/dashboard/trail/:sn`

Get GPS trail points for a device.

```json title="Response"
{
  "trail": [
    {
      "lat": 52.1409,
      "lng": 6.2310,
      "timestamp": "2026-02-26T10:00:00Z"
    }
  ]
}
```

---

### DELETE `/api/dashboard/trail/:sn`

Clear all trail data for a device.

---

## Calibration Endpoints

### GET `/api/dashboard/calibration/:sn`

Get map calibration settings.

```json title="Response"
{
  "calibration": {
    "offsetLat": 0.0001,
    "offsetLng": -0.0002,
    "rotation": 5.0,
    "scale": 1.02
  }
}
```

---

### PUT `/api/dashboard/calibration/:sn`

Save map calibration settings.

```json title="Request"
{
  "offsetLat": 0.0001,
  "offsetLng": -0.0002,
  "rotation": 5.0,
  "scale": 1.02
}
```

Calibration parameters:

| Field | Range | Description |
|-------|-------|-------------|
| `offsetLat` | any float | Latitude nudge |
| `offsetLng` | any float | Longitude nudge |
| `rotation` | -180° to +180° | Map rotation |
| `scale` | 0.5x to 2.0x | Map scale factor |

---

## Command Endpoint

### POST `/api/dashboard/command/:sn`

Send an arbitrary MQTT command to a device. The `command` object is encrypted
(AES-128-CBC, key = `"abcdabcd1234" + SN[-4:]`) when the SN starts with `LFI`
and then published to `Dart/Send_mqtt/<SN>`. Stock firmware v6+ expects this
encryption; for stock v5.x mowers add `"encrypt": false` at the top level of
the request body to disable it.

The five mowing actions below are taken straight from `mowingService.ts` and
match exactly what the OpenNova app and the dashboard send.

#### Start mowing (full coverage on map0)

```bash
curl -X POST http://<server>/api/dashboard/command/<SN> \
  -H 'Content-Type: application/json' \
  -d '{"command":{"start_navigation":{"mapName":"test","cutterhigh":3,"area":1,"cmd_num":12345}}}'
```

| Field | Notes |
|-------|-------|
| `mapName` | Required, literal string `"test"` (firmware ignores the value but rejects when missing). |
| `cutterhigh` | Wire enum, range `0..7`. Formula: `user_cm − 2`. So 5 cm → `3`, 6 cm → `4`. |
| `area` | Map enum: `1` = map0, `10` = map1, `200` = map2. Firmware only knows three slots. |
| `cmd_num` | Must be unique per call — the firmware ignores duplicates. Use `$(date +%s)` or `$RANDOM`. |

#### Stop

```bash
curl -X POST http://<server>/api/dashboard/command/<SN> \
  -H 'Content-Type: application/json' \
  -d '{"command":{"stop_navigation":{"cmd_num":12346}}}'
```

The key is `stop_navigation`, **not** `stop_task` or `stop_run`.

#### Pause

```bash
curl -X POST http://<server>/api/dashboard/command/<SN> \
  -H 'Content-Type: application/json' \
  -d '{"command":{"pause_navigation":{"cmd_num":12347}}}'
```

#### Resume

```bash
curl -X POST http://<server>/api/dashboard/command/<SN> \
  -H 'Content-Type: application/json' \
  -d '{"command":{"resume_navigation":{"cmd_num":12348}}}'
```

The keys are `pause_navigation` / `resume_navigation`, **not** `pause_run` /
`resume_run` (those exist as legacy LoRa commands but the navigation stack
uses the `*_navigation` variants).

#### Go home (back to charger)

This is a two-step sequence with a 500 ms gap — the app does the same:

```bash
curl -X POST http://<server>/api/dashboard/command/<SN> \
  -H 'Content-Type: application/json' \
  -d '{"command":{"go_pile":{}}}'

sleep 0.5

curl -X POST http://<server>/api/dashboard/command/<SN> \
  -H 'Content-Type: application/json' \
  -d '{"command":{"go_to_charge":{"cmd_num":12349,"chargerpile":{"latitude":200,"longitude":200}}}}'
```

The `chargerpile:{latitude:200, longitude:200}` is required — those are
sentinel values; the mower computes the actual dock pose from its own
saved map state.

#### Disabling encryption (stock v5.x firmware only)

```bash
curl -X POST http://<server>/api/dashboard/command/<SN> \
  -H 'Content-Type: application/json' \
  -d '{"encrypt":false,"command":{"start_navigation":{"mapName":"test","cutterhigh":3,"area":1,"cmd_num":12345}}}'
```

---

## Schedule Endpoints

### GET `/api/dashboard/schedules/:sn`

Get all dashboard schedules for a mower.

```json title="Response"
{
  "schedules": [
    {
      "scheduleId": "uuid",
      "mowerSn": "LFIN2230700XXX",
      "scheduleName": "Morning Mow",
      "startTime": "08:00",
      "endTime": "12:00",
      "weekdays": [1, 3, 5],
      "enabled": true,
      "mapId": "map0",
      "mapName": "Front Garden",
      "cuttingHeight": 5,
      "pathDirection": 90,
      "workMode": 0,
      "taskMode": 0,
      "createdAt": "2026-02-21T18:32:12Z",
      "updatedAt": "2026-02-21T18:32:12Z"
    }
  ]
}
```

---

### POST `/api/dashboard/schedules/:sn`

Create a new schedule. Also pushes `timer_task` + `set_para_info` via MQTT.

```json title="Request"
{
  "scheduleName": "Morning Mow",
  "startTime": "08:00",
  "endTime": "12:00",
  "weekdays": [1, 3, 5],
  "mapId": "map0",
  "mapName": "Front Garden",
  "cuttingHeight": 5,
  "pathDirection": 90,
  "workMode": 0,
  "taskMode": 0
}
```

---

### PATCH `/api/dashboard/schedules/:sn/:scheduleId`

Update a schedule.

---

### DELETE `/api/dashboard/schedules/:sn/:scheduleId`

Delete a schedule.

---

### POST `/api/dashboard/schedules/:sn/:scheduleId/send`

Push a schedule to the mower via MQTT (`timer_task` + `set_para_info`).

---

## Logs Endpoint

### GET `/api/dashboard/logs`

Get recent MQTT message logs.
