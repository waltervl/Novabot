# Runbook — Mower Escapes Polygon (Charger Anchor Drift)

**Last working flow:** 2026-05-02 / 2026-05-03 — Alain's mower (LFIN1231000211)
**Audience:** Anyone debugging "mower drives outside its boundary" symptoms

---

## Symptom

Mower previously mapped + mowed correctly. After some event (reboot, mapping retry, dashboard click, etc.) it now drives **outside** the work polygon when starting a coverage task. May also show:

- `Error_code: 139 Charging station position error`
- `Error_code: 152 Robot is at emergency stop`
- App label stuck on "Maaien" while mower is idle on dock
- Dashboard charger marker visually offset from where the unicom path starts
- `localization_state: Not initialized` even after long uptime

## Root cause

The mower's coordinate system depends on three loosely-coupled state files. When ANY of them drifts independently, the mower's world view becomes inconsistent and it drives off-target:

| File | Owner | Holds |
|------|-------|-------|
| `/userdata/lfi/charging_station_file/charging_station.yaml` | mower disk | Charger pose `(x, y, θ)` in map frame — read by `auto_recharge_server` at boot |
| `/userdata/lfi/maps/home0/{csv_file,x3_csv_file}/map_info.json` | mower disk | Charger pose + `map0_work.csv.map_size` — read by mqtt_node + nav stack |
| `/root/novabot/data/maps/home0/{csv_file,x3_csv_file}/map_info.json` | mower disk | Mirror of above (used by some firmware paths) |
| `/userdata/pos.json` | mower disk | UTM `utm_origin` + WGS84 `wgs84_origin` — defines map frame's anchor in physical world |
| `map_calibration.charger_lat / charger_lng` | server DB | Charger physical GPS for app/dashboard display |
| `<SN>_latest.zip` `csv_file/map_info.json` | server `STORAGE_PATH/maps/` | Source-of-truth read by `/api/dashboard/maps/:sn` for `chargingPose` field |

**Polygon CSV files are the ground truth** — they encode the work area in map-frame coordinates. The first point of `map0tocharge_unicom.csv` is **always the charger position** in map frame as recorded at mapping time.

### How the drift happens

1. **`pos.json` rewritten.** Stock `save_recharge_pos` and dashboard recalibrate-flows can rewrite `pos.json` with the mower's current `wgs84_origin` reading. If the GPS reference shifted between mappings (charger UM980 base re-survey, RTK reference change), the new `wgs84_origin` is at a physically different point → entire map frame translates by the delta.
2. **Charger pose `(0, 0, 0)` placeholder written.** Server's `recalibrate-charging-pose` endpoint historically read `map_position_x/y/orientation` from sensor cache without verifying `localization_state`. Mower reports `(0, 0, 0)` while uninitialized → server wrote zeros to all three pose files.
3. **DB `chargerGps` becomes stale.** No automatic write-back from mower's RTK reading; whatever value was there at first mapping persists.
4. **Server-side `_latest.zip` becomes stale.** Dashboard reads `chargingPose` from this ZIP — if outdated, charger marker renders at the old anchor.

The polygon, the unicom CSV, and the mower's hardware never moved. Only metadata corrupted.

## Diagnosis checklist (in order)

### 1. Confirm physical state
- Charger plugged in, LED green/active.
- Charger physically not moved (sticky-tape, marker tape, etc. in same place as last mowing).
- Mower hardware not modified (camera, antenna).

### 2. Check live mower state
```bash
curl -s http://192.168.0.247:8080/api/dashboard/devices/<SN> | jq '.sensors | {
  battery_state, recharge_status, localization_state,
  map_position_x, map_position_y, map_position_orientation,
  gps_latitude, gps_longitude, gps_sat_num, gps_status,
  error_status, work_status
}'
```

Pass: `localization_state: RUNNING`, `gps_status: 1`, `map_position` non-zero. Fail: `Not initialized` + `(0, 0, 0)` placeholder = LoRa/RTK not converged yet, drive-back needed.

### 3. Check the polygon's anchor (ground truth)
```bash
ssh root@<MOWER_IP> 'head -1 /userdata/lfi/maps/home0/csv_file/map0tocharge_unicom.csv'
```

This is the charger position the polygon was built around. **All other charger-pose state must match this value.**

### 4. Compare mower-side state files
```bash
ssh root@<MOWER_IP> '
  echo "=== charging_station.yaml ==="
  cat /userdata/lfi/charging_station_file/charging_station.yaml
  echo "=== map_info.json (csv_file) ==="
  cat /userdata/lfi/maps/home0/csv_file/map_info.json
  echo "=== map_info.json (x3_csv_file) ==="
  cat /userdata/lfi/maps/home0/x3_csv_file/map_info.json
  echo "=== /root mirror csv_file ==="
  cat /root/novabot/data/maps/home0/csv_file/map_info.json
  echo "=== /root mirror x3_csv_file ==="
  cat /root/novabot/data/maps/home0/x3_csv_file/map_info.json
  echo "=== pos.json ==="
  cat /userdata/pos.json
'
```

All five `charging_pose` values **must match** the unicom CSV first point.

### 5. Check server DB
```bash
sudo docker exec opennova sqlite3 /data/novabot.db \
  "SELECT mower_sn, charger_lat, charger_lng, gps_charger_lat, gps_charger_lng FROM map_calibration WHERE mower_sn='<SN>';"
```

`charger_lat/lng` should match the mower's current RTK GPS reading when on dock.

### 6. Check server-side ZIP
```bash
sudo docker exec opennova unzip -p /data/storage/maps/<SN>_latest.zip csv_file/map_info.json
```

`charging_pose` here drives the dashboard's charger marker render.

## Fix procedure

This is the manual sequence we ran on 2026-05-02. The auto-flow described under **Automation** below now runs all of these in one server-side endpoint call.

### Step 1 — Drive the mower if localization is stuck
If `localization_state` is "Not initialized" at boot, the mower needs a drive-back cycle for heading discovery:

1. Manually drive the mower 1-2 m off the dock via app joystick.
2. Drive it back to the dock or trigger return-to-charge.
3. Wait until `localization_state: RUNNING` and `map_position` is non-zero.

### Step 2 — Read the ground-truth anchor from the unicom CSV
```bash
ANCHOR_X=$(awk -F',' 'NR==1{print $1}' /userdata/lfi/maps/home0/csv_file/map0tocharge_unicom.csv)
ANCHOR_Y=$(awk -F',' 'NR==1{print $2}' /userdata/lfi/maps/home0/csv_file/map0tocharge_unicom.csv)
# Orientation is not in unicom CSV — use the mower's current map_position_orientation
# while on dock (after localization is running) as a close approximation.
```

### Step 3 — Compute new `pos.json` so localization output matches the anchor
Given:
- Mower's current GPS reading on dock: `(lat_now, lng_now)` → `(utm_x_now, utm_y_now)` via UTM zone projection
- Wanted: when mower is on dock, `map_position` should report `(ANCHOR_X, ANCHOR_Y)`
- Therefore: `utm_origin = (utm_x_now - ANCHOR_X, utm_y_now - ANCHOR_Y)`
- `wgs84_origin` = reverse-project the new `utm_origin` back to lat/lng

Python with pyproj:
```python
from pyproj import Transformer
t_fwd = Transformer.from_crs('EPSG:4326', 'EPSG:32632', always_xy=True)  # Zone 32 for NL
t_rev = Transformer.from_crs('EPSG:32632', 'EPSG:4326', always_xy=True)
x_now, y_now = t_fwd.transform(lng_now, lat_now)
utm_origin_x = x_now - ANCHOR_X
utm_origin_y = y_now - ANCHOR_Y
lng_origin, lat_origin = t_rev.transform(utm_origin_x, utm_origin_y)
```

### Step 4 — Backup + write all five mower files
```bash
TS=$(date +%s)
for f in /userdata/pos.json \
         /userdata/lfi/charging_station_file/charging_station.yaml \
         /userdata/lfi/maps/home0/csv_file/map_info.json \
         /userdata/lfi/maps/home0/x3_csv_file/map_info.json \
         /root/novabot/data/maps/home0/csv_file/map_info.json \
         /root/novabot/data/maps/home0/x3_csv_file/map_info.json; do
  cp "$f" "$f.bak.$TS"
done
```

Write:
```yaml
# charging_station.yaml
charging_pose: [<ANCHOR_X>, <ANCHOR_Y>, <ANCHOR_THETA>]
```

```json
// map_info.json (×4 — csv_file, x3_csv_file, both /userdata and /root mirrors)
{
   "charging_pose": {"x": <ANCHOR_X>, "y": <ANCHOR_Y>, "orientation": <ANCHOR_THETA>},
   "map0_work.csv": {"map_size": <PRESERVE_EXISTING>}
}
```

```json
// pos.json
{
  "time_stamp": <unix_now>,
  "utm_origin": {"utm_zone": 32, "x": <utm_origin_x>, "y": <utm_origin_y>, "z": 0},
  "wgs84_origin": {"latitude": <lat_origin>, "longitude": <lng_origin>}
}
```

### Step 5 — Update server DB
```bash
sudo docker exec opennova sqlite3 /data/novabot.db \
  "UPDATE map_calibration
   SET charger_lat=<lat_now>, charger_lng=<lng_now>, updated_at=datetime('now')
   WHERE mower_sn='<SN>';"
```

### Step 6 — Update server-side `<SN>_latest.zip`
```bash
sudo docker exec opennova sh -c '
  TMP=/tmp/zipfix
  rm -rf $TMP && mkdir $TMP
  unzip -o /data/storage/maps/<SN>_latest.zip -d $TMP
  cat > $TMP/csv_file/map_info.json <<EOF
{
   "charging_pose": {"x": <ANCHOR_X>, "y": <ANCHOR_Y>, "orientation": <ANCHOR_THETA>},
   "map0_work.csv": {"map_size": <PRESERVE_EXISTING>}
}
EOF
  cd $TMP && zip -r /data/storage/maps/<SN>_latest.zip csv_file/
  rm -rf $TMP
'
```

### Step 7 — Reboot mower
```bash
ssh root@<MOWER_IP> 'sync; reboot'
```

`auto_recharge_server` reads `charging_station.yaml` only at boot — reboot is required for the new pose to take effect.

### Step 8 — Verify
After mower comes back (60-90 s) and drive-back triggers `LOC_SUCCESS`:
- `map_position` while docked should be within ±0.3 m of `(ANCHOR_X, ANCHOR_Y)`
- `error_status: OK`, `recharge_status: Charging (9)`
- Dashboard map: charger marker on top of unicom start point
- Coverage task no longer escapes polygon

## Automation

This entire flow is now implemented server-side. **For future map restores from a ZIP via the admin panel:**

`POST /api/admin-status/map-backups/:sn/:filename/restore` (existing endpoint) executes the full sequence above:

1. Extracts ZIP to a staging dir.
2. Reads `map0tocharge_unicom.csv` first point → `ANCHOR_X, ANCHOR_Y`.
3. Reads orientation from existing `charging_station.yaml` if present, else asks mower for current `map_position_orientation` while docked.
4. SSHes/MQTTs to mower with new `pos.json` (computed from mower's live GPS) + new `charging_station.yaml` + new `map_info.json` ×4.
5. Updates `map_calibration` row in DB.
6. Updates server-side `<SN>_latest.zip` with normalized `map_info.json`.
7. Triggers mower reboot.

If the live GPS step is unavailable (mower offline), the endpoint falls back to using the ZIP's stored GPS metadata.

## Anti-patterns (do NOT do these)

- **Do not run dashboard "Recalibrate Charging Pose" while `localization_state: Not initialized`.** Server's `map_position_*` will be `(0, 0, 0)` placeholder and you'll write zeros over your real charger pose.
- **Do not rewrite the polygon CSV** to fix charger drift. The polygon is correct; the metadata is wrong.
- **Do not rely on mower reboot alone.** Reboot doesn't clear `planned_path/*.json`, so the mower will resume an old coverage task and may go off-boundary again.
- **Do not assume DB `chargerGps` is the ground truth.** It can drift independently from the polygon's actual anchor.
- **Do not edit just one of the five mower-side state files.** Either update all of them consistently, or update none.

## Why the polygon is the ground truth

`map0tocharge_unicom.csv` is generated by the mower itself during the BLE mapping session via `start_scan_map` → `add_scan_map` → `save_map` → `save_recharge_pos`. The first point is the mower's own pose at the moment `save_recharge_pos` finalised, in the same map frame as every other map point recorded that session. Any later metadata file can be regenerated from this anchor.

## Polygon Offset Calibration

When the polygon is correctly anchored but visibly off by a few centimetres
on certain edges, prefer the polygon-offset calibration over a full restore:

1. Open admin Map Viewer → select mower.
2. Click **Calibrate Polygon Offset**.
3. Use arrow buttons or arrow keys (Shift = 10 cm) to nudge the live
   polygon over the dashed grey ghost.
4. Click **Apply** — the offset is persisted to `map_calibration`,
   `<SN>_latest.zip` is regenerated with shifted points (charger anchor
   preserved), and the mower receives a `sync_map` MQTT push.
5. To revert: re-open calibration, click **Reset**, then **Apply**.

Spec: `docs/superpowers/specs/2026-05-03-admin-polygon-offset-calibration.md`.

## Mower offline after server restart / mqtt_node kill

**Symptom:** Mower shows `online:true` in dashboard `/devices` API but its
sensor map only contains cached settings (`defaultCuttingHeight`,
`obstacle_avoidance_sensitivity`, `path_direction`, `headlight`,
`avoiding_obstacle_time`). Live state fields (`battery_state`, `work_status`,
`map_position`, `gps_*`, `report_state_robot`) are missing. App shows mower
offline.

**Root cause:** ESP-IDF MQTT layer inside `mqtt_node` (C++ binary) can land
in an `MQTT_EVENT_INIT_NET_ERROR` retry loop after a TCP-level disconnection
(opennova container restart, network blip, killing mqtt_node manually).
TCP works (verified via `curl --max-time 3 telnet://192.168.0.247:1883`),
broker is reachable, other clients (`extended_commands.py`,
`led_bridge`) connect fine — but `mqtt_node` itself stops opening any TCP
socket to port 1883. `daemon_node` respawn does NOT clear the stuck state.

**Fix:** SSH to the mower and re-run the URL bootstrap script:

```bash
sshpass -p 'novabot' ssh root@<MOWER_IP> 'bash /root/novabot/scripts/set_server_urls.sh'
```

Within ~20 s the log `/root/novabot/data/ros2_log/mqtt_node_*.log` will show
`MQTT_EVENT_INIT_NET_OK` + `mqtt_init` + `Subscribing_to_topic
Dart/Send_mqtt/<SN>` — mower comes back online with full sensor stream.

**Why a full reboot doesn't help:** Reboot triggers the same `daemon_node`
respawn path that already failed; `set_server_urls.sh` is the only thing
that re-bootstraps the network state cleanly (DNS lookup +
`http_address.txt` rewrite + clean `mqtt_node` kill).

**Auto-recovery on every sync_map (next firmware bake):**
`research/extended_commands.py` `handle_sync_map` now calls
`_rerun_set_server_urls()` as step 6 after every successful map install. So
any future `apply-polygon-offset` or `restore-and-realign` MQTT round-trip
will self-heal a stuck mqtt_node along the way. Live mowers running the
older `extended_commands.py` (Apr 28) still need the manual SSH fix above
until they receive the new firmware.

## References

- Spec for the 2026-05-02 manual restore: `docs/superpowers/specs/2026-05-02-mower-charger-anchor-restore.md`
- Brainstorm thread analysis: `research/documents/charger-rtcm-flow-analysis.md`
- Related memories:
  - `recalibrate-charging-pose.md` — auto_recharge_server reads YAML at boot
  - `mower-reboot-broken.md` — reboot-broken caveats
  - `mower-map-on-disk-layout.md` — invariant: csv_file == x3_csv_file
  - `working-lora-pair.md` — LoRa pair invariant
