# Novabot Map Import / Restore — End-to-End Flow + Gap Analysis

**Verified against:**
- Novabot Flutter app v2.4.0 (blutter_output_v2.4.0/asm/flutter_novabot)
- Server v2026.0512.2257 (`server/src/cloud-api/routes/map.ts`,
  `server/src/routes/adminStatus.ts`, `server/src/services/portableMap.ts`,
  `server/src/services/portableBackup.ts`)
- `research/extended_commands.py` write_map_files / read_map_files handlers
- Live behaviour observed on LFIN2231000633 + LFIN1231000211 + LFIN2230700238

---

## End-to-End Flow

### Phase 1 — Original mapping session (BLE, one-time per zone)
User → app → mower (BLE GATT). Sequence:
1. `start_scan_map` with `type:0`, `mapName:"mapN"`
2. `add_scan_map` streaming polygon points while user drives boundary
3. `save_map` (`type:0`) — **sub-map**: writes `csv_file/mapN_work.csv` +
   `x3_csv_file/mapN_work.csv`
4. `save_map` (`type:1`) — **total**: 500 ms later, generates whole-area
   `map.yaml/pgm/png` + per-slot `mapN.yaml/pgm/png`
5. `save_recharge_pos_respond` — pivot event; triggers the server's
   `createBackup()` auto-snapshot (Portable Bundle)

### On-mower disk after mapping (canonical state)
```
/userdata/lfi/maps/home0/
  csv_file/
    mapN_work.csv               polygon points (LOCAL frame, meters)
    mapN_M_obstacle.csv         obstacle M inside work-map N
    mapNtocharge_unicom.csv     return-to-charger channel
    mapNtomapM_K_unicom.csv     inter-map channel variant K (optional)
    map_info.json               { charging_pose:{x,y,θ}, mapN_work.csv:{map_size} }
  x3_csv_file/                  byte-identical mirror of csv_file/
  map.yaml + map.pgm + map.png  whole-area occupancy grid
  mapN.yaml + mapN.pgm + mapN.png   per-map occupancy grids (Nav2)
  LFIN<SN>.zip                  firmware-built snapshot of csv_file/

/userdata/lfi/charging_station_file/charging_station.yaml
  charging_pose: [x, y, θ]      dock pose for auto_recharge

/userdata/pos.json
  utm_origin (zone, x, y) + wgs84_origin (lat, lng)
  ANCHORS the local frame to world coordinates. Never touched by mapping.
```

### Phase 2 — Upload to server (`sync_map` MQTT extended)
Mower's sync_map handler:
1. Zips `csv_file/*` → `LFIN<SN>.zip`
2. HTTP POST to `/api/nova-file-server/map/fragmentUploadEquipmentMap`
3. Server (`map.ts`):
   - Saves chunks → assembles ZIP
   - Writes `/data/storage/maps/<SN>_<unix_ms>.zip`
   - Updates `<SN>_latest.zip`
   - Parses CSVs → upserts rows in `maps` table (work, obstacle, unicom)
   - Updates `map_calibration` (charger_lat, charger_lng)

### Phase 3 — App reads (Novabot Flutter v2.4.0)
1. `GET /api/nova-file-server/map/queryEquipmentMap?sn=<SN>` (blutter
   `pages/home_page/logic.dart` offset 0x902e64)
2. Server response (`cloud-api/routes/map.ts:173`):
   ```json
   {
     "data": {
       "work":   [{ "fileName":"mapN_work.csv","alias","mapArea","url","obstacle":[...] }],
       "unicom": [{ "fileName","alias","url" }]
     },
     "md5": "<UPPERCASE>",
     "machineExtendedField": { "chargingPose": { "x","y","orientation" } }
   }
   ```
3. App HTTP-GETs each item's `url` → CSV polygon points
4. Parses comma-separated lines → `{x,y}` in LOCAL frame
5. Renders polygons with charger as origin

### Phase 4 — Auto-snapshot bundle (`save_recharge_pos_respond` hook)
`server/src/services/portableBackup.ts::createBackup()`:
1. `publishToExtended(sn, {read_map_files:{}})`
2. Mower's `handle_read_map_files` returns `{csv_files, charging_station_yaml}`
3. Server packages into `.novabotmap` (ZIP):
   ```
   metadata.json          { sourceSn, originalChargingPose,
                            polygonOriginAnchor, workMapNames,
                            userAliases, boundsM, checksum }
   polygon.json           legacy first work-map (backward compat)
   polygons.json          all work maps (multi-map refactor 2026-05-12)
   obstacles.json
   unicom.json
   mower/csv_file/<fname> VERBATIM CSVs from mower disk
   mower/charging_station.yaml  VERBATIM dock pose
   geojson/{work,obstacles,unicom}.geojson    for inspection
   ```
4. Saved to `/data/storage/portable_backups/<SN>/<iso>_<reason>.novabotmap`
   (last 20 retained, oldest pruned)

### Phase 5 — Restore (Apply-Exact, Δ-aware) [`adminStatus.ts`]
`POST /api/admin-status/maps/:sn/import-portable/:stagingId/apply-exact`:
1. `parseBundle(buf)` → `{metadata, polygons[], obstacles, unicom, mowerFiles}`
2. `liveDock` = sensor cache (`map_position_x/_y/_orientation`)
   - **Fails when mower not yet localized** — returns 0,0,0 → garbage Δ
3. `origPose = metadata.originalChargingPose`
4. `Δ = liveDock.orientation − origPose.orientation`
5. `transformPoint(p)` rotates by Δ around `origPose`, translates to `dockMP`
6. For each csv in `mowerFiles.csvFiles`:
   - if `map_info.json`: **override** `charging_pose` to `liveDock`
   - if `*.csv`: transform every point by Δ
7. `publishToExtended(sn, {write_map_files: {csv_files, charging_station_yaml,
   restart_mapping:true}})`
8. Mower's handler wipes csv_file/ + x3_csv_file/, writes transformed CSVs
   to BOTH dirs, mirrors `map.yaml→mapN.yaml`, restarts `novabot_mapping`
9. `DELETE FROM maps WHERE mower_sn=?` → INSERT new rows
10. `mapRepo.setChargerGps` + `setPolygonChargingOrientation`
11. `publishToExtended(sn, {regenerate_per_map_files:{}})` after 3 s

### Phase 5-alt — Restore (VERBATIM, no Δ) [`recover_maps_from_zip.sh --apply-verbatim`]
1. Read source ZIP from
   `/data/storage/portable_backups/<SN>/<SN>_latest.zip`
2. Build `{write_map_files: {csv_files, charging_station_yaml,
   restart_mapping:true}}` — payload UNCHANGED from ZIP
3. Direct MQTT publish to `novabot/extended/<SN>` (broker at
   `mqtt://localhost:1883` inside opennova container)
4. Mower's handler writes verbatim, no rotation/translation,
   `charging_pose` NOT overwritten
5. Server DB stays stale until next `sync_map` upload

### Phase 6 — Mower boot / localization (after every reboot, restore or not)
1. `systemd` → `run_novabot.sh start` spawns iox-roudi + daemon_monitor +
   ROS2 nodes (chassis_control, perception, mapping, decision,
   coverage_planner, auto_recharge, aruco_localization, extended_commands)
2. Localization init:
   - `robot_combination_localization` reads `/userdata/pos.json` →
     UTM origin = local-frame anchor in world
   - Waits for first GPS-fix → derives local position
   - `localization_state = NOT_INITIALIZED`, `map_position = (0,0,0)`
   - Self-init drive (~1 m forward) → derives heading from GPS track
   - `localization_state = RUNNING`, `loc_quality > 50`
   - `map_position` now reports real (x, y, θ) inside saved frame
3. `mqtt_node` connects to broker, starts `report_state_robot`

### Phase 7 — Pre-conditions for restore to actually align with reality
- `csv_file/*` + `x3_csv_file/*` present + identical content
- `map_info.json` present, `charging_pose` consistent with CSV frame
- `charging_station.yaml` present + dock pose realistic
- `/userdata/pos.json` UNCHANGED since polygons were captured
  (UTM origin is the world-anchor; if it shifted, polygons sit at wrong
  UTM coords → mower can't recognise them)
- `mapN.yaml/pgm` exist (Nav2 costmap) — auto-mirrored from `map.yaml`
- `novabot_mapping` running + has reloaded `csv_file/` contents
- Mower physically near its dock for first heading-discovery
- STM32 responsive (chassis_control healthy, no `not data head` spam)

---

## Key observations

**A. `pos.json` is the world-anchor.** Polygons are in local meters
anchored to UTM origin in pos.json. As long as pos.json + polygons don't
change, polygons sit at the same UTM coordinates → mower works after any
number of reboots.

**B. Apply-Exact's Δ math is for CROSS-DEVICE migration** (different mower
or moved charger). For same-mower-same-dock restore Δ should be ~0 — BUT
only when `liveDock` is real. When mower isn't localized yet,
`liveDock = (0,0,0)` → Δ rotation is `−origPose.orientation`, polygons
get rotated around origin by an arbitrary angle.

**C. Verbatim restore is the correct path** when pos.json + physical dock
are unchanged. Server DB needs to be repopulated via a subsequent
`sync_map` upload from the mower.

**D. After any restore, mower MUST cleanly reboot/restart** so:
- `novabot_mapping` re-reads csv_file/
- Localization re-anchors via pos.json + fresh GPS-fix
- Self-init drive establishes heading

---

## Gap analysis — current portable bundle import vs verified flow

The portable bundle feature was specced as a complete on-mower state
snapshot. Comparing actual code to that spec, the following gaps remain.

### Gap 1 — `pos.json` is NOT in the bundle
- `read_map_files` handler (extended_commands.py:1432) only emits
  `csv_files` + `charging_station_yaml`. `pos.json` is missing.
- Apply-Exact does NOT push pos.json back to the mower.
- Consequence: if a user wipes their mower / re-provisions / SWAPS in a
  new mower, the new pos.json's UTM origin is different → restored
  polygon coords sit at wrong UTM location → mower can't localise inside
  them.
- **Fix:** include `/userdata/pos.json` in the read_map_files response +
  write_map_files writer. Add field to bundle metadata so an explicit
  "is the same pos.json safe to use" check can be done before write.

### Gap 2 — `map.yaml/pgm/png` (whole-area occupancy) is NOT in the bundle
- Bundle ships CSVs only. Apply-Exact relies on the mower already having
  a `map.yaml` so it can mirror it to `mapN.yaml`. After a full wipe
  there is no `map.yaml` to mirror → coverage_planner Error 107/118.
- Current workaround: server triggers `save_map type:1` after write to
  regenerate, but that only works if mower is in MAPPING mode and not
  driving — fragile.
- **Fix:** include `map.yaml`, `map.pgm`, `map.png` in `read_map_files`
  and `write_map_files`. Always write them back so Nav2 has its costmap
  even on a freshly-wiped mower.

### Gap 3 — Apply-Exact requires `liveDock` but doesn't check `loc_quality`
- `adminStatus.ts:2075` validates `Number.isFinite(mx)` etc. but does NOT
  check `loc_quality` or `localization_state`.
- A mower that's online but not yet localized returns `(0,0,0)` for
  `map_position_*`, all finite, so Apply-Exact proceeds with garbage
  anchor → polygons end up rotated by `-origPose.orientation`.
- **Fix:** require `loc_quality >= 50` AND `localization_state == RUNNING`
  before Apply-Exact runs. Otherwise return 409 with clear message
  ("drive mower 1 m forward to initialise localization, then retry").

### Gap 4 — `map_info.json` `charging_pose` is overwritten on restore
- `adminStatus.ts:2099` rewrites `mi.charging_pose = liveDock` before
  writing the file back to the mower.
- This is fine for cross-device migration (dock moved) but DESTROYS the
  bundle's original frame anchor for same-mower restore. After restore,
  mower's map_info.json says the dock is at `liveDock` (possibly garbage
  if mower wasn't localized) instead of the original captured pose.
- **Fix:** when bundle's `sourceSn == sn` AND user picks "same-mower
  verbatim restore" path, write `map_info.json` UNCHANGED. The current
  apply-verbatim recovery script already does this correctly.

### Gap 5 — No "verbatim restore" first-class server endpoint
- Server only exposes Apply-Exact (Δ-aware) via `adminStatus.ts`. The
  verbatim path exists only as a side-script (`recover_maps_from_zip.sh
  --apply-verbatim`) that bypasses the staging session and publishes
  directly via MQTT.
- Dashboard UI has no "Restore exact (no Δ)" button.
- Server DB is not updated by the verbatim push, so the dashboard map
  view + Novabot app stay stale until the mower does a follow-up
  `sync_map` upload.
- **Fix:** add `POST /api/admin-status/maps/:sn/import-portable/:stagingId/apply-verbatim`
  that:
    a. Validates bundle integrity (parseBundle).
    b. Publishes write_map_files with verbatim payload.
    c. Updates server DB from the bundle's polygon data directly (no
       Δ transform).
    d. Updates calibration from the bundle's `originalChargingPose` +
       `sourceCharger` fields.
  Add dashboard button "Restore Verbatim (same mower, no rotation)".

### Gap 6 — `pos.json` mismatch is silently ignored
- If a user accidentally restores a bundle from mower-A onto mower-B
  (different pos.json), nothing warns them. Polygons go in but at wrong
  UTM coords → mower drives off-map.
- **Fix:** when bundle includes pos.json (Gap 1 fix), compare bundle's
  `utm_origin` to mower's current pos.json. If different by more than
  e.g. 10 m, require explicit operator confirmation before proceeding.

### Gap 7 — `extended_commands.py` deployment is not part of bundle
- Bundles assume mower runs custom firmware with `extended_commands.py`
  to handle `read_map_files`/`write_map_files`. Stock firmware doesn't.
  No graceful fallback exists today.
- **Fix:** detect via `device_factory.sys_version` or live-MQTT probe.
  If mower lacks the handler, return clear error ("upgrade firmware to
  v6.0.2-custom-29 or higher to use portable bundles") instead of
  letting the publish silently no-op.

### Gap 8 — Bundle does NOT store `pos.json`'s GPS reference
- Without the original (lat, lng) anchor of UTM origin, we can't even
  verify whether the new mower's pos.json should match. Currently we
  only have `sourceCharger.lat/lng` in metadata which is the dock's
  WGS84 position, not the UTM origin.
- **Fix:** add `metadata.posJson = { utm_origin:{x,y,zone},
  wgs84_origin:{lat,lng} }` field to bundle. Captured from
  `read_map_files` extension. Used by Gap 6's check.

### Gap 9 — `covered_path/` + `planned_path/` are not in the bundle
- These dirs track historical mowing coverage. Not strictly needed for
  the polygon restore but if user wants a TRUE state clone they should
  be preserved.
- **Priority:** low. Most users only care about polygons.

### Gap 10 — `start_navigation` after restore can take old map.yaml
- If `map.yaml` is older than the new `csv_file/`, coverage_planner may
  load stale occupancy. Today's `write_map_files` mirrors map.yaml →
  mapN.yaml but doesn't REPLACE map.yaml itself with anything new.
- **Fix:** after write_map_files, automatically dispatch `save_map
  type:1` to regenerate the whole-area `map.yaml/pgm/png` from current
  csv_file/ contents.

---

## Recommended priorities

1. **Gap 3** (liveDock validation) — quick fix, prevents the most common
   "polygons rotated wrong" failure mode users hit.
2. **Gap 5** (verbatim endpoint + UI button) — moves the side-script
   logic into the supported path. Solves the same-mower restore case
   cleanly.
3. **Gap 2 + Gap 10** (map.yaml in bundle, auto-regen) — eliminates
   coverage_planner Error 107/118 after restore.
4. **Gap 1 + Gap 8 + Gap 6** (pos.json in bundle + drift check) — needed
   for cross-device migrations to be reliable.
5. **Gap 7** (firmware detection) — UX, prevents silent failures on
   stock firmware.
6. **Gap 4** (don't override map_info.json on same-mower verbatim
   restore) — small, but matters for Gap 5's verbatim path.
7. **Gap 9** (covered_path/planned_path) — only if users explicitly ask.

---

## Glossary

- **Local frame** — 2-D coordinate system the mower uses internally,
  in meters. Origin anchored to UTM via pos.json.
- **UTM origin** — the (utm_zone, utm_x, utm_y) tuple stored in
  pos.json. Maps local (0,0) to a specific point on Earth.
- **Δ rotation** — `liveDock.orientation − bundle.originalChargingPose.orientation`,
  applied by Apply-Exact to align polygons with a moved/swapped dock.
- **Self-init drive** — automatic 1 m forward+reverse the firmware does
  on first boot to derive heading from GPS track (no manual driving
  needed).
- **Verbatim restore** — write polygon CSVs + map_info.json +
  charging_station.yaml back to mower disk UNCHANGED, no Δ applied.
- **Apply-Exact** — server endpoint that applies Δ math (rotation +
  translation) before writing CSVs back to mower disk.
