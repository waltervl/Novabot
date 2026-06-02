# Re-anchor after ArUco dock — root cause + mechanism (2026-06-02)

Mower: LFIN2230700238 (.244). Symptom: after a successful ArUco dock the app
shows the charger marker ~2 m away from where the mower physically docked, even
after page refresh. User wants the **polygon re-anchored after the ArUco dock**.

## Firmware architecture (Ghidra-verified, do not guess)

- **Localization is GPS/RTK only.** `robot_combination_localization` fuses
  `/gps_raw + /imu_raw + /nmea_raw + /psrdopa_raw` through a ceres trajectory
  optimizer. It has **no ArUco input** (no subscription, no string). The UTM
  origin it holds (persisted to `pos.json` via `/save_utm_origin_info`,
  `saveUtmOriginInfoCallback`) is the only map↔GPS anchor.
- **ArUco is dock-approach only.** `aruco_localization` publishes `/aruco/pose`,
  consumed by `auto_recharge_server` for the final visual approach. It never
  reaches localization. There is **no "ArUco snap" that corrects the frame**.
  (The MAP-BACKUP-RESTORE doc's claim that the dock re-anchors via ArUco is wrong.)
- **No dock command writes `pos.json`.** `robot_decision::saveUtmInfo()` calls
  `/save_utm_origin_info` only from `deleteChildMap`, `deleteObstacle`,
  `deleteUnicom`, `handleMapStopRecord` (end of mapping). The "new pos written"
  popup comes from those, not docking.
- `auto_recharge` (MQTT) = `handleAutoRechargeTask` → flag `this+0x736` →
  `rechargeDeal(true)` = "no guide pose mode" (AutoCharging goal with empty pose,
  pure visual dock). `go_to_charge` (MQTT) = `handleNavToRechargeTask` → flag
  `this+0x73d` → `rechargeDeal(false)` = "guide pose mode" (loadMap +
  getChargingPose + nav, then same ArUco approach). Neither touches the frame.
- `save_recharge_pos` (mqtt_node `api_save_recharge_pos`) only **measures**
  `map_charging_dis = |docked map_position − stored charging_pose|` and returns
  it. It writes no file (proven: deleted both charging_station.yaml, value still
  not written; mapping node did not crash).

## Live ground truth (mower docked, 2026-06-02 ~16:48)

| Source | charger / dock position (map frame) |
|---|---|
| Live docked `map_position` (report_state_robot) | **(1.985, -0.059, -1.549)** |
| `auto_recharge` file `/userdata/lfi/charging_station_file/charging_station.yaml` | **(2.092, 0.043, -1.549)** |
| `map0tocharge_unicom.csv` dock-end | **(2.09, 0.04)** |
| `map_info.json` `charging_pose` (csv_file) | **(0, 0.06, -1.518)** ← STALE |
| `home0/charging_station_file/charging_station.yaml` (140-guard wrote) | (0, 0.06, -1.518) ← from stale map_info.json |

Work polygons: `map0_work.csv` x[-7.0, 17.26] y[-1.05, 19.31] (2336 pts),
`map1_work.csv` x[-24.56, -9.96] y[1.62, 18.29]. The dock at (2.09) sits inside
map0; the whole on-disk map (work CSVs + tocharge + auto_recharge file + live
localization) is internally consistent with the charger at **~(2.0)**.

## Root cause

Everything agrees the charger/dock is at ~(2.0) in the live map frame **except
`map_info.json` charging_pose, stuck at the origin (0, 0.06)** — ~2 m off. The
app's charger marker is built server-side from `<sn>_latest.zip →
csv_file/map_info.json → charging_pose` (`server/src/cloud-api/routes/map.ts`
≈L339-366), so the app draws the charger at the stale origin while the polygon
(from the DB work CSVs) and the mower sit ~2 m away.

Most likely history: a prior re-anchor/apply-exact updated the work CSVs +
`auto_recharge` charging_station.yaml into the live frame but **never updated
`map_info.json` charging_pose**. The polygon is already correct; only the stored
charging_pose the app reads is stale. The 140-guard then propagated that stale
origin value into `home0/charging_station_file/charging_station.yaml`.

## Re-anchor mechanism (what must happen after the ArUco dock)

The dock gives us the one true correspondence: when ArUco-docked, the mower's
live `map_position` IS the charger position in the current localization frame.
So re-anchoring = **write the live docked `map_position` as the charging_pose
everywhere the charger is read**:

1. ArUco dock (`auto_recharge`, visual, reliable) → mower physically at charger.
2. Confirm docked (recharge_status 9) + read live `map_position` (x, y, θ) from
   the server's report_state_robot cache (already available:
   `map_position_x/_y/_orientation`).
3. `recalibrate_charging_pose {x, y, theta}` to the mower → rewrites
   `map_info.json` charging_pose in `csv_file/` + `x3_csv_file/` (and the
   `/userdata/lfi/charging_station_file/charging_station.yaml`).
4. Server: patch `<sn>_latest.zip → csv_file/map_info.json` charging_pose so
   `queryEquipmentMap` returns the new charger immediately (the app reads the
   charger from the ZIP, not the DB). Equivalent: re-sync the map.
5. Clear `frame_unvalidated`.

Result: `queryEquipmentMap` returns the charger at the docked position → marker
lands on the mower; polygon unchanged (already in the live frame). The
140-guard, sourcing from the now-correct `map_info.json`, recreates the home0
charging_station.yaml consistently.

Polygon does NOT need shifting in this case (it is already in the live frame).
If a future case shows the polygon itself offset (CSVs in a different frame than
localization), the correct operation is apply-exact: shift all CSV points +
charging_pose by the (live docked − stored charging) delta.
