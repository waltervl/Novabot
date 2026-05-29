# Guided Post-Restore Re-Anchor and Safe Dock - Design

> Status: approved design, ready for implementation plan.
> Date: 2026-05-29

## Goal

After a map bundle is restored, the stored map frame is not yet validated
against the real world (the dock anchor in the map does not necessarily match
the physical charger). Today the user can press "Go home" (which sends
`go_to_charge`), and the mower navigates the bad frame and can drive anywhere.

This feature adds a guided, safe re-anchor flow that runs automatically after a
restore: establish heading via a short backward drive until RTK Fixed, prompt
the user to position the mower ~50cm in front of the dock, then dock purely on
ArUco (`auto_recharge`). While the frame is unvalidated, `go_to_charge` is made
truly impossible.

## Problem statement

- Bundle restore is dashboard-triggered (`POST /map-backups/:sn/:filename/restore`
  and `.../restore-and-realign` in `server/src/routes/adminStatus.ts`). After
  restore the map frame is not anchored to the real charger.
- `go_to_charge` navigates the map frame to the dock approach, then hands off to
  the ArUco search. With a wrong frame this drives the mower to an arbitrary
  physical location. It can currently be triggered from the app HomeScreen
  "Go home" button, the server `rainMonitor`, and the admin `refresh-dock-anchor`
  auto sequence.
- The correct post-restore dock is `auto_recharge` (pure ArUco visual dock from
  ~50cm, already wired in `app/src/screens/MappingScreen.tsx:1881`). A successful
  dock fires `save_utm_origin_info`, which rewrites `/userdata/pos.json` and
  re-anchors the frame for real.
- RTK fix alone does not give heading. A short drive (~1m) is required so the
  GPS track yields heading and localization reaches a usable state.

## Constraints

- Mower runs OpenNova custom firmware. Movement commands are safety-sensitive:
  the backward drive is only sent after an explicit user tap (see
  `feedback_safety`).
- Reuse existing primitives: `start_move` / `mst` / `stop_move` for the drive,
  `auto_recharge` for the dock, the `rtk_fix_quality` telemetry already shipped
  on `novabot/sensor/<SN>`, and the recharge_status dock-state detection already
  present in `MappingScreen.tsx`.
- No new MQTT topics or LoRa/NVS changes.
- Do not weaken the lock: `go_to_charge` must be blocked at a server choke point,
  not only in the app UI.

## State model

A single per-mower boolean `frame_unvalidated`:

- Set `true` by both restore routes when a bundle is restored.
- Cleared `false` only on a successful `auto_recharge` dock, detected by the
  recharge_status transition to docked/charging (recharge_status == 9 /
  battery_state == Charging) - the moment `save_utm_origin_info` re-anchors
  `pos.json`. No other path clears it.
- Persisted in the database (not only in memory) so a server restart mid-window
  cannot silently unlock `go_to_charge`.
- Surfaced to clients as a `frame_unvalidated` field in the per-device data,
  following the existing virtual-sensor-field pattern, so both app and dashboard
  can read it via the standard device data path.

## Architecture and data flow

```
dashboard restore (POST .../restore | .../restore-and-realign)
  -> set frame_unvalidated[sn] = true (DB + device data)
       |
       v
server publishToDevice() guard
  -> if command contains go_to_charge AND frame_unvalidated[sn]: refuse + log
       (covers app /command, rainMonitor, admin refresh-dock-anchor)
       |
       v  (frame_unvalidated surfaced in device data)
app: guided re-anchor wizard (modal overlay when frame_unvalidated is true)
  Step 1 heading init -> Step 2 position -> Step 3 auto_recharge dock
       |
       v
successful dock (recharge_status -> 9) -> clear frame_unvalidated[sn] = false
  -> overlay closes, Go-home re-enabled
```

## Components

### Component 1 - Server: frame_unvalidated state + hard block

- Storage: a DB-backed per-SN flag (small table or a column on the existing
  per-mower state). Read into an in-memory cache on startup for fast checks.
- Set: both restore handlers in `adminStatus.ts`
  (`/map-backups/:sn/:filename/restore` and `.../restore-and-realign`) set the
  flag `true` for the SN after a successful restore.
- Clear: in the sensor-update path (`server/src/mqtt/sensorData.ts`
  `updateDeviceData`), when a mower with the flag set transitions to docked
  (recharge_status == 9 or battery_state == Charging), clear the flag.
- Hard block: in `publishToDevice()` (`server/src/mqtt/mapSync.ts:167`), if the
  command object contains the key `go_to_charge` and `frame_unvalidated[sn]` is
  set, do not publish; log a warning and return. `go_pile` and `auto_recharge`
  remain allowed.
- Surface: add `frame_unvalidated` to the device data so it reaches the app
  (cloud-api / devices) and dashboard (socket.io), following the existing field
  pattern. Value is a boolean string consistent with the other sensor fields.

### Component 2 - App: guided re-anchor wizard

A modal overlay shown whenever `frame_unvalidated` is true for the active mower.
It blocks normal controls and walks three steps:

- Step 1 - Heading init. Title "Re-anchoring after restore". A **Start** button
  (the explicit safety confirmation). On tap, the app auto-commands the low-speed
  backward drive: `start_move: 4`, then `mst: { x_w: 0.2, y_v: 0, z_g: 0 }`
  repeated at 200ms for ~25 ticks (~1m), then `stop_move: {}`. The app then
  watches `rtk_fix_quality` until it reads 4 (RTK Fixed). Advance on Fixed.
  Timeout ~90s: allow the user to proceed with a visible "still Float, accuracy
  may be reduced" warning so the flow never hangs.
- Step 2 - Position. Instruction "Place the mower ~50cm directly in front of the
  dock, facing the markers." with a **Continue** button.
- Step 3 - Dock. A single **Dock now (ArUco)** button that sends
  `auto_recharge: { cmd_num }`. The app shows live dock state by reusing the
  recharge_status detection already in `MappingScreen.tsx` (autoDockInProgress /
  dockedOnCharger / autoDockFailed). On success the server clears the flag, the
  overlay closes. On failure the user can retry `auto_recharge` or re-position.

The normal HomeScreen "Go home" button is disabled or hidden, with an
explanation ("Frame not yet validated - dock via the re-anchor flow first"),
whenever `frame_unvalidated` is true. This is UI defense in depth on top of the
server block.

### Component 3 - Dashboard (optional surfacing)

The dashboard device card may show a "Frame unvalidated" indicator when the flag
is set, reusing the same field. No dashboard control change is required; the
admin `refresh-dock-anchor` and any `go_to_charge` path is already blocked
server-side.

## Edge cases

- Server restart mid-window: the flag is DB-persisted, so it stays locked.
- `auto_recharge` repeatedly fails: the user stays in the wizard; only a real
  dock clears the flag. Manual fallback - physically placing the mower on the
  dock - also triggers `save_utm_origin_info`, which surfaces as docked/charging
  and clears the flag.
- Stock firmware or no RTK telemetry: Step 1 cannot confirm Fixed; the 90s
  timeout path lets the user proceed to positioning anyway.
- Backward drive obstruction: low speed (0.2 m/s) over ~1m limits risk; the user
  initiates it with an explicit tap after placing the mower.

## Testing

- Server unit tests:
  - Restoring a bundle sets `frame_unvalidated[sn]`.
  - `publishToDevice` refuses a `go_to_charge` command while the flag is set, and
    allows `auto_recharge` and `go_pile`.
  - A sensor update with recharge_status == 9 (or battery_state == Charging)
    clears the flag.
  - The flag round-trips through the DB (persists across a simulated restart).
- App:
  - The wizard renders the three steps and advances on the documented
    conditions; the Go-home button is disabled while the flag is set.
  - The Step-1 RTK-Fixed watch and 90s timeout fallback behave as specified.

## Non-goals (v1)

- No automatic backward-drive without the explicit Start tap.
- No change to the existing `refresh-dock-anchor` admin tool (it stays for the
  on-dock re-anchor case; it is simply covered by the new `go_to_charge` block).
- No new map-frame math; re-anchoring remains the firmware `save_utm_origin_info`
  on a successful ArUco dock.
- No automatic retrying of the whole sequence; the user drives each step.
