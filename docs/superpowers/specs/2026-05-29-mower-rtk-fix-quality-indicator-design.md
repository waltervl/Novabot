# Mower RTK Fix Quality Indicator - Design

> Status: approved design, ready for implementation plan.
> Date: 2026-05-29

## Goal

Show the mower's real-time RTK fix quality (RTK Fixed / RTK Float / DGPS / GPS /
no-fix) in the OpenNova app and admin dashboard, so the operator can tell at a
glance whether the mower has centimeter-grade positioning before starting a mow
or while mapping.

## Problem statement

The mower's true GGA fix quality (NMEA quality field: 0=invalid, 1=GPS SPS,
2=DGPS, 4=RTK Fixed, 5=RTK Float) lives only inside the mower's
`robot_combination_localization` ROS node. It is not published over MQTT today.

What MQTT currently carries is insufficient for this:
- `charger_status` bitfield bit 8 ("RTK quality OK") is a charger-side
  altitude-deviation heuristic, not the GGA fix type, and reflects the charger's
  GPS, not the mower's rover GPS. It cannot distinguish Float from Fixed.
- `report_state_robot` exposes `loc_quality` (0-100 localization confidence) and
  `rtk_sat` (satellite count) but no fix-quality field.

Therefore the feature requires exposing the rover GGA fix quality from the mower
firmware, piping it through the server, and rendering it in the clients.

## Constraints

- Mower runs OpenNova custom firmware v6.0.2-custom-33 with `extended_commands.py`
  (a Python ROS node + MQTT client running alongside `mqtt_node`).
- Mower script changes follow `feedback_mower_scripts_local_first.md`: edit the
  copy in `research/extended_commands.py` and `research/build_custom_firmware.sh`
  first, then scp to the mower for a live test. Never hand-edit only on-device.
- MQTT topics, LoRa frame protocol, and NVS layout must stay unchanged.
- No new server HTTP endpoint - reuse the existing extended_response → device
  data cache → socket.io / cloud-api path.

## Architecture and data flow

```
mower robot_combination_localization (ROS node)
  └─ publishes a GPS/localization topic carrying GGA fix quality
       │ subscribe (ROS, same DDS graph)
       ▼
extended_commands.py (ROS node + MQTT client)
  └─ caches latest fix quality; every ~2s publishes
     {"type":"rtk_status","rtk_fix_quality":N,"rtk_sat":M,"hdop":H}
     to novabot/extended_response/<SN>  (AES, local broker)
       │
       ▼
server sensorData.ts (extended_response handler)
  └─ extract rtk_fix_quality (+ rtk_sat, hdop) into device data cache
       │ socket.io (dashboard) + cloud-api (app)
       ▼
app HomeScreen badge + MappingScreen  ·  dashboard admin device card
  └─ fixQualityLabel(N) → {label, color}
```

## Components

### Component 1 - Mower: `extended_commands.py` RTK publisher

Data source decision (Approach A, with B as documented fallback):

- **Approach A (chosen): ROS topic subscription.** `extended_commands.py` is
  already a long-running ROS node with a working `_do_subscribe` path (ad-hoc
  `ros2 topic` CLI discovery is unreliable on the Horizon X3 DDS stack, but a
  resident node's subscription is not - it joins the same graph the other nodes
  publish on). Subscribe to the GPS topic that carries the GGA fix quality.
- **The first implementation task is to confirm the exact topic name and message
  type** that carries the GGA fix quality (candidate: `/gps_raw`; the message
  type and which field holds the quality must be verified on the live mower).
- **Approach B (fallback): log parsing.** If the topic proves unreliable or the
  quality is not in any published message, tail `robot_combination_localization`
  via the existing `_LOG_SOURCES`/log-read infrastructure and regex the `fixed: N`
  and `RTKContinuous::DGPS or SINGLE` lines. Map: `fixed: 1` → 4 (Fixed);
  `No fixed` with corrections → 5 (Float); `RTKContinuous::DGPS` → 2; `SINGLE` →
  1; nothing recent → 0.

Publisher behavior:

- Maintain a cached latest fix quality from the subscription (or log tail).
- A background timer publishes every 2 seconds to `novabot/extended_response/<SN>`
  with payload:
  ```json
  {"type":"rtk_status","rtk_fix_quality":4,"rtk_sat":27,"hdop":0.6}
  ```
  `rtk_sat` and `hdop` are included for future use even though the v1 UI only
  renders label + color. They are cheap and avoid a second round trip later.
- The 2s cadence matches the mower's existing `report_state_robot` rhythm so the
  app sees RTK status refresh at the same rate as other live data.

### Component 2 - Server: `sensorData.ts`

- Extend the existing `extended_response` handler to recognize
  `type == "rtk_status"` and write `rtk_fix_quality` (and `rtk_sat`, `hdop` if not
  already present) into the per-SN device data cache, following the existing
  virtual-sensor-field pattern used for `gps_satellites` / `rtk_ok`.
- Add a sensor field definition for `rtk_fix_quality` with a value translation:
  `0→"No fix"`, `1→"GPS"`, `2→"DGPS"`, `4→"RTK Fixed"`, `5→"RTK Float"`.
- Changes flow to clients via the existing socket.io broadcast (dashboard) and
  cloud-api equipment-state path (app). No new endpoint.

### Component 3 - Clients: app + dashboard

- **Shared mapping helper** `fixQualityLabel(n)` returning `{label, color}`:
  | n | label | color |
  |---|---|---|
  | 4 | RTK Fixed | green |
  | 5 | RTK Float | orange |
  | 2 | DGPS | yellow |
  | 1 | GPS | grey |
  | 0 | No fix | red |
  | absent/stale | No data | dim grey |
- **App HomeScreen**: a small RTK badge near the existing status chips.
- **App MappingScreen**: a prominent fix-quality display during mapping/edge-cut
  so the operator knows whether recorded points are cm-grade.
- **Dashboard (admin React)**: a matching badge in the device card.

## Edge cases

- **No data yet / stale (>10s since last rtk_status):** clients show "No data"
  (dim grey), distinct from `0` "No fix" (red). The server timestamps the field
  so clients can detect staleness.
- **Stock firmware (no extended_commands):** the `rtk_status` message never
  arrives; the field stays absent; clients hide/grey the badge gracefully.
- **Mower offline:** covered by existing offline handling; the badge follows the
  device's online state.

## Testing

- **Mower:** `mosquitto_sub -t 'novabot/extended_response/<SN>'` shows the
  `rtk_status` payload every ~2s. Cross-check the published `rtk_fix_quality`
  against the live `robot_combination_localization` log `fixed:` /
  `RTKContinuous` state.
- **Server:** unit test that an `rtk_status` extended_response payload maps to the
  `rtk_fix_quality` cache field with the correct value translation.
- **App + dashboard:** render all five states plus the no-data state; verify the
  badge hides when the field is absent.

## Non-goals (v1)

- No Float-vs-Fixed history graph or logging.
- No charger RTK status (this is the mower rover fix only).
- No automatic action on fix loss (e.g., pause mowing) - display only.
- UI shows label + color only; sat/hdop ride in the payload but are not rendered
  yet.
