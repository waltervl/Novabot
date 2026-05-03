# Restore + Realign Mower from ZIP — Design

**Date:** 2026-05-03
**Triggers:** Manual click in admin map-backups panel
**Goal:** One-click recovery that puts the mower back to a known-good state from a server-side ZIP backup, including all five mower-disk state files plus DB consistency, without SSH and without polygon transformation.

---

## Problem

The 2026-05-02 manual restore (`docs/superpowers/specs/2026-05-02-mower-charger-anchor-restore.md`) required ~15 separate SSH/SQL/MQTT commands across mower + NAS + DB to fix mower escapes-polygon symptoms after charger anchor drift. The runbook (`docs/runbooks/charger-anchor-restore-runbook.md`) describes the manual flow.

Doing this manually risks:
- Skipping a file (we already had `x3_csv_file` desync once because the recalibrate script only updated `csv_file`).
- Computing pos.json wrong (UTM math is error-prone).
- Wrong-order operations (e.g. reboot before all files written).
- No audit trail.

We need a single reproducible operation: pick a backup, click "Restore + Realign Mower", and the server orchestrates everything.

## Constraints

- **No SSH from server container to mower.** Use the existing MQTT extended-commands pipe.
- **No polygon transformation.** Polygon CSV is ground truth — we only realign metadata around it.
- **Polygon's anchor wins.** First point of `map0tocharge_unicom.csv` defines the charger pose; all other state must match.
- **Mower-side firmware changes ship in next OTA** — server-side endpoint can be deployed today, but the new mower behaviour activates only after users update extended_commands.py.
- **Decentralised deploy** — every operator runs their own server container + DB. No central state.

## Architecture

```
Admin UI ─── click "Restore + Realign Mower" ───► confirmation dialog
                                                       │
                                                       ▼
                            POST /api/admin-status/map-backups/:sn/:filename/restore-and-realign
                                                       │
                            ┌──────────────────────────┴─────────────────────────┐
                            │  Server orchestration                              │
                            │  1. DB restore from backup (existing)              │
                            │  2. getPolygonAnchor(sn) — first pt of unicom CSV  │
                            │  3. regenerateLatestZipFromBackup(...)             │
                            │     - Embeds enriched map_info.json                │
                            │     - charging_pose from polygon anchor            │
                            │  4. Compute posJson: mower live GPS + anchor       │
                            │  5. UPDATE map_calibration.charger_lat/lng         │
                            │  6. publishToExtended(sn, { sync_map: {...} })     │
                            │  7. Wait sync_map_respond (8 s timeout)            │
                            │  8. Return result                                  │
                            └────────────────────────────────────────────────────┘
                                                       │
                                                       ▼
                            Mower extended_commands.py.handle_sync_map (extended)
                            Existing:
                              - Pull <SN>_latest.zip via /sync-zip
                              - Atomically replace csv_file + x3_csv_file
                              - Write /userdata/pos.json
                              - Restart novabot_mapping
                            NEW additions:
                              - Write /userdata/lfi/charging_station_file/charging_station.yaml
                              - Mirror map_info.json to /root/novabot/data/maps/home0/{csv,x3_csv}_file/
                              - Restart auto_recharge_server (pkill — monitor respawns)
```

## Components

### 1. Server: `getPolygonAnchor(sn)` helper

**Location:** `server/src/db/repositories/maps.ts` (or new `server/src/services/anchor.ts`).

**Signature:**
```typescript
interface PolygonAnchor {
  x: number;          // local meters, from unicom CSV first point
  y: number;
  orientation: number; // radians — falls back to current sensor or 1.5 default
}

function getPolygonAnchor(sn: string): PolygonAnchor | null;
```

**Behaviour:**
- Look up `map0tocharge_unicom` row for `sn` in `maps` table.
- Parse `map_area` column (already stored as `[{x, y}, ...]`).
- Return first point's `x`, `y`. Orientation from sensor cache `map_position_orientation` if `localization_state` is non-bad, else `1.5` (a near-π/2 default that matches typical dock orientations).
- Returns `null` when the mower has no unicom map (cannot anchor).

**Tests:** `getPolygonAnchor.test.ts`
- Backup has unicom CSV → returns first point.
- No unicom → returns null.
- Multi-line unicom → returns line 1 only.
- Empty CSV → returns null.

### 2. Server: `regenerateLatestZipFromBackup()` in `mapBackup.ts`

**Behaviour:**
1. Take a backup-snapshot path + `sn`.
2. Run `generateMapZipFromDb(sn, 0)` (existing function) which builds a fresh ZIP from the just-restored DB rows.
3. Open the produced ZIP in-place, replace `csv_file/map_info.json`:
   - `charging_pose: {x: anchor.x, y: anchor.y, orientation: anchor.orientation}`
   - `map0_work.csv: {map_size: <area-from-polygon>}` — compute via shoelace from `mapArea` for the work map row.
4. Re-write the ZIP atomically (write to `${dest}.tmp` then rename).
5. Place at `${STORAGE_PATH}/maps/${sn}_latest.zip`.

**Tests:** `mapBackup.regenerateLatestZipFromBackup.test.ts`
- Backup with unicom + work polygon → enriched ZIP has charger pose from unicom + non-zero map_size.
- Backup without unicom → returns error (cannot anchor).
- Idempotent: running twice gives same content (modulo timestamps).

### 3. Server: enhance `/api/dashboard/maps/:sn/sync-info`

Already returns `posJson` for mower. Extend to:
- Compute `posJson` from current charger GPS + polygon anchor:
  - `mower_utm = utm_project(charger_lat, charger_lng)` — from `map_calibration.charger_lat/lng` (already updated by step 5)
  - `utm_origin = mower_utm - (anchor.x, anchor.y)`
  - `wgs84_origin = reverse_project(utm_origin)`
- Include `charging_pose` field for the mower to write into yaml.

**Schema returned:**
```json
{
  "md5": "<zip-md5>",
  "zipUrl": "/api/dashboard/maps/<SN>/sync-zip",
  "posJson": {
    "time_stamp": <unix>,
    "utm_origin": {"utm_zone": 32, "x": ..., "y": ..., "z": 0},
    "wgs84_origin": {"latitude": ..., "longitude": ...}
  },
  "charging_pose": {"x": ..., "y": ..., "orientation": ...}
}
```

**Backwards compat:** Old mowers ignore extra `charging_pose` field. New mowers consume it.

### 4. Server: `POST /api/admin-status/map-backups/:sn/:filename/restore-and-realign`

**Location:** `server/src/routes/adminStatus.ts`, next to existing `/restore` (line 894).

**Request body:** none (filename in path is sufficient).

**Pseudocode:**
```typescript
adminStatusRouter.post('/map-backups/:sn/:filename/restore-and-realign', async (req, res) => {
  const { sn, filename } = req.params;

  // 1. Existing DB restore
  const restoreResult = await mapBackup.restoreFromBackup(sn, filename);
  if (!restoreResult.ok) return res.status(400).json(restoreResult);

  // 2. Resolve polygon anchor
  const anchor = getPolygonAnchor(sn);
  if (!anchor) return res.status(400).json({ ok: false, error: 'No unicom map — cannot anchor' });

  // 3. Get mower live GPS (from sensor cache)
  const sensors = deviceCache.get(sn);
  const lat = parseFloat(sensors?.get('gps_latitude') ?? '');
  const lng = parseFloat(sensors?.get('gps_longitude') ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ ok: false, error: 'Mower GPS not reported — wait + retry' });
  }

  // 4. Update map_calibration with current GPS
  mapRepo.setChargerGps(sn, lat, lng);

  // 5. Regenerate enriched _latest.zip
  await regenerateLatestZipFromBackup(sn);

  // 6. Trigger sync_map MQTT
  if (!isDeviceOnline(sn)) {
    return res.status(404).json({ ok: false, error: 'Mower offline — sync_map cannot run' });
  }
  const result = await publishExtendedAndWait(sn, { sync_map: {} }, 'sync_map_respond', 8000);

  res.json({ ok: result.ok, anchor, gps: { lat, lng }, syncResult: result });
});
```

**Response shape:**
```json
{
  "ok": true,
  "anchor": {"x": -1.21, "y": 0.48, "orientation": 1.5},
  "gps": {"lat": 52.14088864656, "lng": 6.23103579689},
  "syncResult": {"ok": true, "md5": "...", "sizeBytes": ...}
}
```

**Tests:** `dashboardMapsRestoreAndRealign.test.ts`
- Mower offline → 404.
- Backup missing unicom → 400.
- GPS missing → 400.
- Happy path → DB restored, ZIP regenerated, MQTT cmd published, response 200 with anchor + GPS.
- sync_map_respond timeout → 504 with partial state info.

### 5. Mower: extend `extended_commands.py` `handle_sync_map`

**Location:** `mower-side scripts/extended_commands.py` `handle_sync_map`.

Existing behaviour (no change):
- Pull ZIP from `/sync-zip`.
- Atomically replace `csv_file` + `x3_csv_file` directories.
- Write `pos.json`.
- Restart `novabot_mapping`.

**NEW additions inside the same handler:**
1. After ZIP unpack, parse `csv_file/map_info.json`. If `charging_pose` present → write `/userdata/lfi/charging_station_file/charging_station.yaml`:
   ```yaml
   charging_pose: [<x>, <y>, <orientation>]
   ```
2. Mirror `csv_file` + `x3_csv_file` directories to `/root/novabot/data/maps/home0/`.
3. After `_restart_novabot_mapping()`, also `pkill -f auto_recharge_server` (monitor respawns it). The server reads `charging_station.yaml` only at boot, so a service restart is sufficient — no full reboot.

**Idempotency:** Running sync_map twice without server changes is a no-op (ETag 304).

**Backwards compat:** old server (no enriched map_info.json) → no `charging_pose` in JSON → skip yaml write. Behaviour unchanged.

**Ships in:** Next mower firmware OTA. Filed as separate bd issue.

### 6. Admin UI: button + dialog in `adminPage.ts`

In the existing Map Recovery card, next to "Restore selection to DB":

```html
<button onclick="restoreAndRealign()" id="restoreRealignBtn"
  style="background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.5); color: #86efac">
  Restore + Realign Mower
</button>
```

**Click handler pseudocode:**
```javascript
async function restoreAndRealign() {
  const sn = document.getElementById('mapMowerSelect').value;
  const filename = document.getElementById('mapBackupSelect').value;
  if (!sn || !filename) return alert('Select mower + backup snapshot');

  const ok = confirm(
    'Restore + Realign will:\n' +
    '  1. Restore map polygon to DB from selected backup\n' +
    '  2. Re-anchor charger pose from polygon\'s unicom CSV\n' +
    '  3. Update DB chargerGps to mower\'s live GPS reading\n' +
    '  4. Push everything to mower via sync_map MQTT\n' +
    '  5. Mower restarts novabot_mapping + auto_recharge_server\n\n' +
    'Mower must be online + on dock + RTK FIX.\n' +
    'Continue?'
  );
  if (!ok) return;

  const r = await fetch(`/api/admin-status/map-backups/${encodeURIComponent(sn)}/${encodeURIComponent(filename)}/restore-and-realign`, {
    method: 'POST',
    headers: { Authorization: token },
  });
  const data = await r.json();
  if (data.ok) {
    showToast('Restore + Realign complete: anchor (' + data.anchor.x + ', ' + data.anchor.y + ')', 'green');
  } else {
    showToast('Restore + Realign failed: ' + (data.error ?? r.status), 'red');
  }
}
```

## Failure modes + handling

| Mode | Status | Response | Operator action |
|------|--------|----------|-----------------|
| Mower offline | 404 | `{ ok: false, error: 'Mower offline' }` | Wait for mower MQTT reconnect |
| `localization_state: Not initialized` | 400 | `{ ok: false, error: 'GPS placeholder', hint: 'drive briefly off dock' }` | Joystick mower 1-2 m + back |
| GPS not RTK FIX | warn-only (proceed with cached GPS) | `{ ok: true, warning: 'non-RTK GPS used' }` | Operator can re-run later when RTK back |
| Backup missing unicom CSV | 400 | `{ ok: false, error: 'Backup missing unicom' }` | Pick different backup |
| sync_map response timeout | 504 | `{ ok: false, error: 'sync_map timeout', partial: true }` | Server-side state already partly applied — re-run after mower recovers |
| Mower in active coverage task | 200 with skip | `{ ok: false, skipped: 'coverage active', retry: true }` (existing sync_map guard) | Wait for task end |

## Out of scope

- Bulk restore (multiple SNs at once).
- UI for editing backup snapshots before restore.
- Visual diff between current state vs proposed restore.
- Polygon transformation (out of scope by design — polygon is ground truth).
- ZIP versioning / version pinning.

## Validation post-implement

Reproduce 2026-05-02 manual restore via the new endpoint, verify identical end state:
- All 5 mower files match polygon anchor.
- DB `chargerGps` = mower's live RTK reading.
- `<SN>_latest.zip` `map_info.json` has correct anchor.
- Mower navigates without polygon escape.

## Bd issues

| ID (TBD) | Title | Component |
|----------|-------|-----------|
| `bd-server-anchor-helper` | server: getPolygonAnchor + tests | 1 |
| `bd-server-regen-zip` | server: regenerateLatestZipFromBackup + tests | 2 |
| `bd-server-sync-info-anchor` | server: enhance /sync-info with charging_pose + posJson from anchor | 3 |
| `bd-server-restore-realign-endpoint` | server: POST /restore-and-realign endpoint + tests | 4 |
| `bd-mower-sync-map-yaml` | mower OTA: extend handle_sync_map (yaml + /root mirrors + auto_recharge restart) | 5 |
| `bd-admin-restore-realign-ui` | admin UI: Restore + Realign button + dialog | 6 |

Server-side (1-4, 6) can ship today. Mower-side (5) blocks "yaml + auto_recharge restart" features until OTA — server endpoint still works on old mowers (sync_map ignores unknown fields, just less complete).

## References

- Manual flow: `docs/superpowers/specs/2026-05-02-mower-charger-anchor-restore.md`
- Operator runbook: `docs/runbooks/charger-anchor-restore-runbook.md`
- Existing sync_map flow: `extended_commands.py` `handle_sync_map` (line 1998+)
- MQTT extended dispatcher: `server/src/mqtt/mapSync.ts` `publishToExtended`
- DB schema: `server/src/db/database.ts` `map_calibration` table
