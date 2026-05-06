# Novabot App — End-of-mapping flow analysis (v2.4.0)

Forensic decompile via blutter v2.4.0, file
`asm/flutter_novabot/pages/build_map/build_map_page/logic.dart`.

Goal: pinpoint exactly when and how the polygon gets its physical-world
anchor during the official Novabot mapping flow, so the portable
import design can either (a) faithfully reproduce or (b) skip steps
that are no longer needed when the polygon already exists.

## Sequence summary

1. **Scanning** (`start_scan_map` at 0x909ea0) — mower drives polygon outline.
   App and mower exchange `add_scan_map` events per traced point.
2. **User clicks "Finish"** — app sends `stop_scan_map` (0x8fb710).
3. **`stop_scan_map_respond` handler** at 0x905f54:
   - On result success: `Future.delayed(2s)` → `_stopSuccess()` then
     `_writeSaveMap(true)` (0x906468). This is **save_map call #1**.
4. **`save_map_respond` handler** at 0x906080:
   - On result success: branches on `field_cb` (set during the previous
     `_writeSaveMap` call). If it equals the BuildMapType enum value the
     app was working through, `uploadMapToServce()` is called (0x9063c8).
   - Otherwise: walk to next map step.
   - Other branches surface errors: "Maps cannot overlap", "channel can't
     cross", "Mapping failed,please re-mapping" — each shows
     `_showBleResErrorDialog` then exits with `finishScan` true.
5. **`uploadMapToServce()`** at 0x907760:
   - Sends MQTT `get_map_outline {map_name: "all"}`.
   - Subscribes to `mowerStatusController.field_77` (likely a "scan complete"
     notifier).
   - On notification: closure at 0x907ab8 fires (uploads the polygon to
     LFI cloud via HTTP — separate code path, not this method).
6. **User instructed to place mower 50 cm from charger, facing it.**
7. **User clicks "Save charging position"** — runs `_saveChargePosition()` at
   0x8ff930. Sends MQTT `save_recharge_pos {mapName: "map0", cmd_num: N}`.
   Sets `field_cf` to true (probably "awaiting recharge response" guard).
8. **`save_recharge_pos_respond` handler** at 0x9065e4:
   - On result success: cancels any pending Timer.
   - `Future.delayed(2s)` (Duration constant at PP+0x4d90).
   - Calls **`_writeSaveMap(true)` again** (0x906764). This is **save_map call
     #2**.
   - Reads `dis` (double) from response → stores to `field_d3`.
   - Reads `orient_flag` (int) from response → stores to a separate field.
9. **Same `save_map_respond` path runs again**, but `field_cb` value differs
   so the branch goes to `uploadMapToServce()` for the FINAL upload (this
   time the polygon includes the recharge anchor).

## The `_writeSaveMap` parameter resolves to type 0 or 2

Decoded from disasm at 0x90767c-0x90768c:

```
tst r0, #0x10        ; r0 = parameter (Dart bool, true=0x20, false=0x30)
cset r1, eq          ; r1 = (bit 4 == 0) ? 1 : 0  →  true→1, false→0
lsl r1, r1, #1       ; r1 *= 2                     →  true→2, false→0
StoreField r2->type = r1
```

So `_writeSaveMap(true)` sends `save_map {type: 2}` and `_writeSaveMap(false)`
sends `save_map {type: 0}`. **Both calls in the end-of-mapping flow use
`true` → both are `type: 2`.**

This contradicts the project memory `recovery-playbook-maps.md` which
stated "type:0 then type:1". Live capture is needed to confirm which is
right — the disasm is unambiguous about the byte value the app sends, but
the mower-side firmware may interpret 2 as "total map / commit" anyway.

## What ArUco docking actually does

The app **never** sends an ArUco-related MQTT command. ArUco docking is
fully autonomous on the mower side:

1. Mower receives `save_recharge_pos`.
2. Firmware-side `auto_recharge_server` (ROS lifecycle node, configured
   from `/userdata/lfi/charging_station_file/charging_station.yaml`) reads
   the mower's current `map_position` and saves it as the charger pose in
   the active map.
3. The same node initiates `BackToCharge` action: mower drives forward
   ~50 cm using its front camera to track the ArUco marker on the charger
   plate, aligning yaw so the docking pins land in the receptacles.
4. Once docked, `auto_recharge_server` records the FINAL map_position as
   the canonical charger anchor and writes:
   - `csv_file/map_info.json` `charging_pose: {x, y, orientation}`
   - `x3_csv_file/map_info.json` (mirror)
   - `charging_station.yaml` (during a later sync — handler-specific)
5. Mower returns `save_recharge_pos_respond` with:
   - `result: 0` (success) or non-zero (failure)
   - `value`: secondary status flag
   - `dis`: physical distance the mower travelled during the dock attempt
   - `orient_flag`: success/failure of yaw alignment

So the moment the polygon becomes "anchored to the physical world" is:

- **Polygon shape** is already in the mower's map frame from the scan
  phase (CSV points relative to wherever the mower thought it was at
  mapping start).
- **Charger position in map frame** is set during step 4 of the
  ArUco-docking sequence above.
- **GPS-to-map alignment** comes from `pos.json` which the
  `robot_combination_localization` node writes at boot from the first GPS
  fix (or via our `set_pos_origin` extended command, when used).

## What our portable import must (and must not) replicate

Original mapping needs:
- Drive-the-perimeter scan to make the polygon shape.
- 50 cm placement + ArUco dock to anchor charger in map frame.

Re-importing an existing portable bundle does NOT need either:

- Polygon shape is already in the bundle (charger-relative metres).
- Charger anchor in map frame is `(0, 0)` BY CONSTRUCTION because the
  bundle is charger-relative; the mower's docking maintenance is a
  **runtime concern** (`auto_recharge_server` keeps using the saved YAML
  pose), not a re-import concern.

What the re-import flow DOES need:
- Set `pos.json` `wgs84_origin` to the new charger lat/lng (so GPS↔map
  projection makes sense at the new site). This is the
  `set_pos_origin` extended command in the spec.
- Determine `polygon_charging_orientation` (= GPS-frame ↔ map-frame
  rotation at the new site). Achievable by either:
  - Drive-test (1 m forward; compare RTK heading to map +x axis).
  - User-supplied compass heading on import.
  - The ArUco-docking sequence — but that requires `save_recharge_pos`,
    which only works during a fresh mapping session because firmware
    expects scan state to be active.

The drive-test (Approach C in the brainstorm) is therefore the right
choice: it captures the same heading information ArUco docking would,
without requiring scan state, and works regardless of map-frame
re-alignment after reboot.

## Implication for the design

- The spec already correctly skips `save_recharge_pos` and ArUco at
  re-import time.
- One refinement: instead of writing `chargingPose = (0, 0, theta)` on
  the mower, we write `chargingPose = (offset_x, offset_y, theta)` where
  `(offset_x, offset_y)` is the dock pose stored in the bundle (the
  charging station maintenance position — usually 0,0 if export was done
  on a fresh mapping, but bundles from later sessions may have non-zero
  saved values). The bundle's `originalChargingPose` already preserves
  this. Update the design to read from the bundle rather than hard-coding
  zero.
- Consider exposing `dis` and `orient_flag` in the audit log when re-
  triggering ArUco docking through normal post-import operation, since
  those tell us if the mower found the charger correctly.

## Live verification needed before implementation

1. Capture stock-app mapping session via mqtt_node log to confirm:
   - Both `save_map` calls really use `type: 2` (not 0, not 1).
   - `save_recharge_pos_respond` field shapes (`value`, `dis`,
     `orient_flag`).
2. Confirm `auto_recharge_server` writes `charging_station.yaml` itself
   on `save_recharge_pos`, OR if this is only done by a later
   `recalibrate_charging_pose` extended command (current
   `recalibrate-charging-pose.md` memory implies the latter).

If point 1 turns out to require `type: 1` for the second save, the spec
needs an extra step in the apply flow to invoke that explicitly when
the bundle is the bootstrap of a fresh map (rather than a re-import).

## Cross-reference

- `recovery-playbook-maps.md` §10 — re-provision invalidates ZIP; same
  root cause as our charger-relocation use case.
- `obstacle-mapping-flow.md` — type:0/type:2 numbering may need update
  after live verification.
- `polygon-rotation-bug.md` — explains why `polygon_charging_orientation`
  is inherently ambiguous (dock heading vs map-frame rotation).
- `sync-map-anchor-flow.md` — 5-file write that the import flow reuses.
