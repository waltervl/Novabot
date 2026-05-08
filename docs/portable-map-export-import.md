# Portable Map Export / Import — Working Flow

**Status**: Live-validated 2026-05-08 on LFIN1231000211. One-click apply-exact restores polygon to mower in any frame state. Mowing works without drift.

## TL;DR

Export captures verbatim mower files (CSVs + map_info.json + charging_station.yaml) at a known dock pose. Import reads mower's current dock pose, computes Δ rotation+translation against the stored pose, transforms every CSV point, and pushes the result back to disk via MQTT. Mowing continues without re-mapping.

No drive-test, no GPS heading derivation, no manual snapshot, no preview/confirm. Single button.

## Architecture

```
EXPORT
┌─────────────┐   MQTT extended       ┌──────────────────┐
│ Admin page  │  read_map_files →     │ Mower            │
│             │ ← csv_files +         │ extended_commands│
│             │   charging_station    │      .py         │
│             │   yaml + map_info     │                  │
│             │   .json (live!)       │ /userdata/lfi/   │
│             │                       │   maps/home0/    │
│             │   ZIP bundle          │   csv_file/      │
│             │   ↓                   │                  │
│             │ user.novabotmap       │                  │
└─────────────┘                       └──────────────────┘

IMPORT (apply-exact, one-click)
┌─────────────┐                       ┌──────────────────┐
│ Admin page  │ apply-exact endpoint  │ Mower            │
│  Apply      │ → live map_position   │ MQTT cache feeds │
│  bundle     │   from sensor cache   │ live charging_   │
│             │ → Δθ + Δxy compute    │   pose at click  │
│             │ → transform CSVs      │                  │
│             │ → write_map_files →   │ csv_file/ +      │
│             │   verbatim push       │ x3_csv_file/ +   │
│             │ → generate_empty_map  │ charging_station │
│             │   → raster regenerate │ .yaml updated    │
└─────────────┘                       └──────────────────┘
```

## Why It Works (and prior approaches didn't)

### The frame-rotation problem

Mower's "local map frame" is not a fixed physical reference. Cartographer rebuilds it on every (re)init — typically with slightly different rotation relative to ENU. Same physical dock = different (x, y, θ) in mower's frame between sessions.

A polygon CSV stored from one session becomes invalid in a later session unless you can re-project it.

### Insight: dock pose IS the frame anchor

Bundle stores polygon points + the **exact charging_pose** at export-time. That pose is the polygon's frame anchor. At import-time:

```
Δθ = current_dock.orientation − bundle_dock.orientation
Δxy = current_dock_xy − rotated(bundle_dock_xy)

For each polygon point P:
  rel = P − bundle_dock_xy
  rotated = R(Δθ) * rel
  P_new = current_dock_xy + rotated
```

Result: polygon's relative position to dock is preserved, real-world location preserved (charger physically unchanged).

### Why GPS / RTK isn't required

Earlier iterations tried to derive frame rotation from RTK GPS drive vectors. Issues:
- Stock-charger setups have unstable RTK FIX (FLOAT-mode drift)
- 1m drive vector is below GPS noise floor
- User's mower drove off-track because GPS-derived heading was wrong

Charging-pose-based Δ is purely from local-frame data on disk. No GPS needed for the math. Result: rock-solid restore on same mower.

## Files Touched

### Mower-side (`research/extended_commands.py`)

Two new MQTT extended-command handlers:

#### `read_map_files`

Returns verbatim contents of `/userdata/lfi/maps/home0/csv_file/` (every file) plus `/userdata/lfi/charging_station_file/charging_station.yaml`.

Request:
```json
{"read_map_files": {}}
```

Response (`novabot/extended_response/<SN>`):
```json
{
  "read_map_files_respond": {
    "result": 0,
    "csv_files": {
      "map0_work.csv": "x,y\nx,y\n...",
      "map0_2_obstacle.csv": "...",
      "map0tocharge_unicom.csv": "...",
      "map_info.json": "{...}"
    },
    "charging_station_yaml": "charging_pose: [x, y, θ]\n"
  }
}
```

#### `write_map_files`

Writes provided files to disk. Backs up existing `charging_station.yaml` to `.bak.<unix_ts>` before overwrite. Wipes existing files in `csv_file/` + `x3_csv_file/` so stale obstacles don't bleed in.

Request:
```json
{
  "write_map_files": {
    "csv_files": {"<filename>": "<content>", ...},
    "charging_station_yaml": "charging_pose: [...]\n",
    "restart_mapping": false
  }
}
```

`restart_mapping`: default `true` legacy, set to `false` for apply-exact since coverage_planner reads CSVs from disk per task. Restart caused 140 false-positives because stock save-flow exits the node by design after a save.

### Server-side

#### `server/src/services/portableMap.ts`

`ExportInput` extended with:
- `csvFilesRaw?: Record<string, string>` — verbatim files
- `chargingStationYaml?: string`

`exportBundle()` now appends `mower/csv_file/<filename>` + `mower/charging_station.yaml` entries to the ZIP.

`ParsedBundle.mowerFiles?: { csvFiles, chargingStationYaml }` — populated when bundle has the verbatim payload.

#### `server/src/routes/adminStatus.ts`

**GET `/api/admin-status/maps/:sn/export-portable`** — fetches mower data live via MQTT extended `read_map_files`. Pulls `charging_pose` from the returned `map_info.json` (firmware truth, not DB). Includes verbatim files in bundle.

**POST `/api/admin-status/maps/:sn/import-portable/:stagingId/apply-exact`** — one-click restore:
1. Read live `map_position` from MQTT sensor cache
2. Compute Δ rotation + translation
3. Transform every CSV point
4. Update `map_info.json` `charging_pose` to current dock pose
5. Generate new `charging_station.yaml`
6. Update DB `maps` rows + `map_calibration.charger_lat/lng/orientation`
7. Push via MQTT extended `write_map_files` (no restart)
8. Generate raster via `generate_empty_map` (size + origin from polygon bbox)

**GET `/api/admin-status/maps/:sn/import-portable/active`** — surfaces `exactRestore: bool` so wizard hides drive-back step when bundle ships verbatim files.

#### `server/src/services/importStaging.ts`

State machine: `UPLOADED → APPLIED` direct transition allowed for exact-restore one-click flow.

#### `server/src/routes/adminPage.ts`

Wizard renders **single "Apply bundle (exact-restore)" button** when `exactRestore: true`. Legacy bundles still get drive-back + snapshot + preview/confirm flow.

## Why DON'T Restart `novabot_mapping`?

The mapping node only runs during active scan_map sessions in stock firmware. After `save_map type:1` it logs `Stop mapping` and exits — by design.

Earlier versions of `_restart_novabot_mapping` succeeded briefly (pgrep matched the bash wrapper) but the binary either failed DDS init (missing `RMW_IMPLEMENTATION` + `CYCLONEDDS_URI` envs) or exited after re-reading existing CSVs as if it were a save-flow.

`robot_decision` runs a 5s health-check that fires `Error 140 Process crashed` whenever `novabot_mapping` is absent. If this fires during `Work:COVERING`, robot_decision aborts coverage to `RECOVER_ERROR_STOP`.

**Solution**: don't restart it. coverage_planner_server reads CSVs from disk every coverage task; it doesn't cache. The fresh polygon takes effect at next coverage start without bouncing the mapping node.

`_restart_novabot_mapping()` was also fixed: missing `RMW_IMPLEMENTATION=rmw_cyclonedds_cpp` + `CYCLONEDDS_URI=file:///root/novabot/shm_config/shm_cyclonedds.xml` exports added so future explicit restart calls actually keep the binary alive.

## Failure Modes (and why we hit them)

### Frame drift after restore

**Symptom**: mower drove 14m to wrong direction.

**Cause**: 27-april CSV restore preserved polygon shape but not the global ENU↔local rotation. Mower's localization init since-then chose a different frame orientation. Polygon points navigated to wrong real-world spot.

**Fix**: don't restore old CSVs. Use exact-restore with current charging_pose to compute Δ.

### Error 120 + 140 after partial mapping

**Symptom**: mapping flow saved type:0 but `save_map type:1` crashed with mapping-soft-error.

**Cause**: I deleted `/userdata/lfi/charging_station_file/charging_station.yaml` during a "wipe maps" earlier. Stock `save_recharge_pos` handler tries to back up the existing yaml before writing — file missing → handler errors → 120 → process exits → 140.

**Fix**: never delete `charging_station.yaml` during cleanup. Restored from `.bak.*` and the partial-mapping flow completed cleanly. Memory note: `dont-wipe-charging-station-yaml.md`.

### Lime trail E↔W when mower drove N↔S

**Symptom**: mower position-trail dashboard showed RTK GPS path orthogonal to actual movement.

**Cause**: server's position-trail endpoint fell back to `polygon_charging_orientation` (≈π/2) as ENU↔map rotation when too few RTK samples. That field is the dock heading IN map frame, not the ENU↔map rotation. Using it as a rotation over-rotates the trail by 90°.

**Fix**: fall back to identity (0) when no RTK Kabsch fit available. Once 10+ samples accumulate, derived rotation takes over. Was changed in `adminStatus.ts:position-trail`.

### App over-rotation in BLE LoRa setup

**Symptom**: charger NVS pair didn't match mower file pair after BLE re-provisioning. mower_error LoRa heartbeat counter incrementing.

**Cause**: BLE `set_lora_info` returns `result:1` with the channel the charger ESP32 actually picked (it can override the requested value). App used user-input channel for cache + DB registration instead of the charger-assigned value.

**Fix**: app/services/ble.ts now parses `set_lora_info` response, exposes `assignedLora` from `provisionDevice` return. ProvisionScreen uses device-truth for cache/registration.

### Wipe-maps procedure

When wiping mower for a fresh re-map (and to test apply-exact):

```bash
ssh root@<mower>
# WIPE
rm -f /userdata/lfi/maps/home0/csv_file/*.csv
rm -f /userdata/lfi/maps/home0/csv_file/*.json
rm -f /userdata/lfi/maps/home0/x3_csv_file/*.csv
rm -f /userdata/lfi/maps/home0/x3_csv_file/*.json
rm -f /userdata/lfi/maps/home0/*.png
rm -f /userdata/lfi/maps/home0/*.yaml
rm -f /userdata/lfi/maps/home0/*.pgm
rm -f /userdata/lfi/maps/home0/*.zip
rm -rf /userdata/lfi/maps/home0/covered_path
rm -rf /userdata/lfi/maps/home0/planned_path

# DO NOT touch /userdata/lfi/charging_station_file/charging_station.yaml
# Stock firmware crashes save_recharge_pos when this file is missing.
```

DB-side wipe (server, container `opennova`):
```sql
DELETE FROM maps WHERE mower_sn='<SN>';
UPDATE map_calibration
   SET polygon_offset_x_m=0,
       polygon_offset_y_m=0,
       polygon_charging_orientation=NULL
 WHERE mower_sn='<SN>';
-- charger_lat/lng KEEP — geographic anchor doesn't change between maps.
```

## Operator Procedure

### Export

1. Admin page → "Export bundle" button on mower's map section
2. Server fetches live mower files via MQTT (mower must be online)
3. Browser downloads `<SN>-<timestamp>-portable.novabotmap`
4. Bundle is ~30-50 KB depending on polygon complexity

### Import (same mower, frame may have rotated since export)

1. Admin page → "Import bundle..." → select `.novabotmap`
2. Wizard detects exact-restore → shows "Apply bundle (exact-restore)" button
3. Mower must be online (live `map_position` in MQTT sensor cache)
4. Click Apply → response shows `delta: {dx, dy, dtheta}` + transformed file count
5. CSVs land on mower disk in csv_file/ + x3_csv_file/
6. charging_station.yaml updated with current dock pose
7. Raster regenerated via generate_empty_map
8. DB `maps` table replaced with transformed polygon points
9. Map calibration row updated

### After import — verify

```bash
# On mower
cat /userdata/lfi/maps/home0/csv_file/map_info.json
# charging_pose should match live map_position
cat /userdata/lfi/charging_station_file/charging_station.yaml
# charging_pose: [x, y, θ] should match map_info
head -1 /userdata/lfi/maps/home0/csv_file/map0tocharge_unicom.csv
# unicom first row ≈ dock pose (x, y)
```

DB:
```sql
SELECT * FROM map_calibration WHERE mower_sn='<SN>';
-- polygon_charging_orientation = current dock orientation
SELECT id, map_name, map_type FROM maps WHERE mower_sn='<SN>';
-- 1 work + N obstacles + 1 unicom
```

### Mowing after import

Press start_navigation in app or dashboard. coverage_planner reads new CSVs from disk per task. No restart needed. Polygon is in current mower frame → no drift.

## Backup Snapshots

For peace-of-mind before destructive operations, this command captures the full mower map state:

```bash
ssh root@<mower> "tar czf /tmp/maps.tgz -C /userdata/lfi maps charging_station_file pos.json"
scp root@<mower>:/tmp/maps.tgz ~/Downloads/<SN>_<date>_<label>.tgz
```

Restore (on same mower, frame should match):
```bash
scp ~/Downloads/<bundle>.tgz root@<mower>:/tmp/restore.tgz
ssh root@<mower> "tar xzf /tmp/restore.tgz -C /userdata/lfi"
```

Or — more correctly — re-import via the portable-map admin flow which handles frame mismatches automatically.

## State Machine (legacy + exact-restore paths)

```
                    ┌──────────────────────────────────────┐
upload bundle ─────►│ UPLOADED                             │
                    └─────┬─────────────┬──────────────────┘
                          │             │
            (legacy)      │             │  (exact-restore)
            drive-back    │             │  apply-exact
                          ▼             ▼
                    ┌──────────┐   ┌──────────┐
                    │AUTO_DOCK │   │ APPLIED  │
                    └─────┬────┘   └──────────┘
                          │ snapshot
                          ▼
                    ┌──────────────┐
                    │ ANCHOR_SET   │
                    └──────┬───────┘
                           │ preview
                           ▼
                    ┌──────────────┐
                    │PREVIEW_SHOWN │
                    └──────┬───────┘
                           │ confirm
                           ▼
                    ┌──────────────┐
                    │ APPLIED      │
                    └──────────────┘
```

Exact-restore bundles skip the entire middle column. Legacy bundles (bundle without `mowerFiles`) take the drive-snapshot-preview-confirm path with rotation override option.

## Why This Took A Week

The portable-map feature went through several broken iterations:

1. **DB-only export**: server reconstructed polygon from `DB.maps.map_area` rows. DB had drift accumulated from the dual-meaning `polygon_charging_orientation` field. Bundle exported drift, import re-applied drift differently → polygon drove off real-world location.
2. **GPS-derived heading**: tried using RTK GPS drive vectors to derive Δ rotation. Failed because mower didn't have stable RTK FIX (LoRa pair mismatch + stock charger NMEA-only RTCM forwarding issues). 1m drive vector below GPS noise floor.
3. **Verbatim CSV export**: introduced `read_map_files` extended handler. Bundle now ships exact mower disk state.
4. **Δ from charging_pose**: replaced GPS-derived heading with `current_dock.orientation − bundle_dock.orientation`. Trivial math, exact result.
5. **Drop unnecessary restart**: removing `_restart_novabot_mapping()` from the apply path eliminated the Error 140 false-positive that was aborting coverage mid-mow.

Lesson: stay in mower-local frame. GPS coordination only matters for cross-mower transfers (different physical machine), not same-mower restore.

## Future Work

- **Cross-mower transfer**: requires real-world GPS anchoring. Polygon stored as WGS84 lat/lng + new mower derives ENU↔local rotation via RTK Kabsch fit during a calibration drive. Existing `position-trail` endpoint already has the math via `derivedTheta` Kabsch fit; needs wiring into export/import path. Blocker: stock-charger setups need real RTCM forwarding (see `charger-rtcm-flow.md`).
- **Auto-export on every save_map**: hook into stock save flow to dump bundle to server automatically. User then has continuous backup history without manual export.
- **Diff visualization**: dashboard could show old polygon vs new polygon overlay before apply, with rotation/translation metrics.
