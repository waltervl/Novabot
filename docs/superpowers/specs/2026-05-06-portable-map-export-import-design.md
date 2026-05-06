# Portable Map Export / Import — Design

**Date:** 2026-05-06
**Status:** Brainstorm complete, awaiting user review before writing implementation plan
**Owner:** Ramon

## Problem

The mower's polygon coordinates live in a session-local map frame established
at mapping time. Each subsequent boot creates a fresh frame (new IMU bias,
fresh GPS-fix-derived `pos.json` origin, new heading-discovery), so the saved
polygon drifts relative to the physical world. Symptom: mower drives off the
boundary into terras / bushes even though the admin map shows polygon and dock
in apparently sane positions.

Today's recovery requires manual SQL polygon shifts, file edits on the mower,
and process restarts — fragile, undocumented per-incident procedure that does
not survive future reboots or charger relocations.

## Goal

Enable polygon definitions to be exported once and re-applied robustly, even
when the charger physically moves or the mower is re-provisioned. The polygon
shape is treated as ground truth; only the dock anchor + heading are
re-determined at import time.

## Use cases (in scope)

1. **Charger replace** — defective charger replaced at the same physical spot.
2. **Charger relocate** — charger moved to a different position in the garden.
3. **Mower re-provision / factory reset** — fresh `pos.json`, all frames new.
4. **Multi-mower** — polygon authored on mower A applied to mower B with a
   different physical charger. (Manual verification only in first release.)
5. **Backup / restore** — yesterday's working state restored after corruption.

Out of scope: periodic auto-refresh based on drift detection (could build on
top of this later).

## Approach

Approach 3 from brainstorm: clean export module + reuse internal sync_map
pipeline for the actual on-mower apply step + new drive-calibration component.

Three new modules, two reused unchanged.

```
NEW
  server/src/services/portableMap.ts        — bundle pack/unpack + math
  server/src/services/driveCalibration.ts   — drive-test orchestrator
  mower: extended_commands.py:
    handle_calibration_drive(params, respond)  — physical drive + RTK pose stream
    handle_set_pos_origin(params, respond)     — overwrite pos.json + restart localization

REUSED
  mapRepo / sync_map / regenerateLatestZipFromBackup  — final apply step
  mapBackup.ts                                        — bundle storage / TTL
```

Polygon coordinates are stored **relative to the charger anchor** (charger at
local (0, 0); polygon points in metres around it). At import:

1. Operator sets the new charger anchor by docking the mower in the new spot
   (server reads RTK GPS from sensor cache).
2. Mower performs a 1 m forward calibration drive; server derives heading
   from the start vs end RTK pose delta.
3. Polygon is anchored at the new charger position with the derived heading.
4. Operator visually verifies the polygon overlay on a satellite map before
   final commit.
5. Server writes DB + triggers existing `sync_map` flow + read-back verify.

## Bundle format

`<sn>-<YYYYMMDD-HHMM>-portable.novabotmap` — ZIP with:

```
metadata.json     — schema, source SN, source charger lat/lng, original
                    charging-pose, user aliases, bounds, sha256 checksum
polygon.json      — work area: name, alias, areaM2, points[] (charger-relative metres)
obstacles.json    — array of obstacle polygons (same shape as work)
unicom.json       — array of channel polygons (includes targetMapName)
geojson/work.geojson         — WGS84 inspection-only export
geojson/obstacles.geojson    — same
geojson/unicom.geojson       — same
```

`originalChargingPose` (x, y, orientation) is preserved for diagnostics. Re-import does NOT reuse the orientation — it is freshly derived from the calibration drive.

GeoJSON files are inspection-only (open in QGIS / Google Earth) and are NOT consumed during re-import.

## REST endpoints

All under `/api/admin-status/maps/`:

| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/:sn/export-portable` | Stream the bundle ZIP for the current DB state |
| POST   | `/:sn/import-portable` | Multipart upload, validate, return staging_id |
| POST   | `/:sn/import-portable/:stagingId/set-anchor` | Snapshot mower's RTK GPS as new charger anchor |
| POST   | `/:sn/import-portable/:stagingId/start-drive` | Trigger calibration drive on mower |
| GET    | `/:sn/import-portable/:stagingId/preview` | Returns GeoJSON for Leaflet overlay |
| POST   | `/:sn/import-portable/:stagingId/confirm` | Final commit — writes DB, triggers sync_map |
| POST   | `/:sn/import-portable/:stagingId/cancel` | Wipe staging |
| GET    | `/:sn/import-portable/active` | Returns active staging_id (or null) for resume |

## Server state machine

One staging session per SN at a time. Persisted to `<storage>/imports/<sn>/<staging_id>/state.json`.

```
UPLOADED → ANCHOR_SET → DRIVE_REQUESTED → DRIVE_COMPLETE
        → PREVIEW_SHOWN → USER_CONFIRMED → APPLIED
```

Each transition records to `import_audit` table (sn, staging_id, from_state, to_state, ts, reason). Reject from any non-final state → CANCELLED.

Per-step timeouts: 5 min idle. Drive-test: 30 s.

Read-back verification (APPLIED): query `sensors.map_position_x/y` after sync_map, compare with `originalChargingPose`. Drift > 30 cm → warning banner but commit proceeds (firmware-frame numerics legitimately differ; warning surfaces gross errors).

## Mower-side: new extended commands

Two new handlers in `extended_commands.py`:

- `start_calibration_drive {distance_m, max_speed}` — drive forward 1 m,
  publish RTK pose at start + end. Used during DRIVE_REQUESTED.
- `set_pos_origin {lat, lng}` — overwrite `/userdata/pos.json` with the given
  WGS84 origin (UTM derived via pyproj equivalent), chmod 0444, restart
  `robot_combination_localization`. Used during APPLIED transition.

### `start_calibration_drive`

Payload `{distance_m: 1.0, max_speed: 0.2}`.

Pre-check: `loc_quality == 100`, battery > 30%, `error_status` not latched, mower not in mowing/recharging task. Refuse with explicit reason if any fails.

Execution:
1. Snapshot start pose (lat, lng, map_position) at t=0.
2. Publish `cmd_vel` with linear.x = max_speed for `distance_m / max_speed` seconds (with watchdog).
3. Snapshot end pose.
4. Publish single `calibration_drive_complete` event on extended response topic with both poses + duration.

If the drive is interrupted (obstacle, manual stop, RTK loss): publish `calibration_drive_aborted` with reason.

## Heading derivation

From start_pose and end_pose RTK fixes (NOT IMU):

```
gps_dx = (end.lng - start.lng) * cos(start.lat) * METERS_PER_DEG
gps_dy = (end.lat - start.lat) * METERS_PER_DEG
travel_heading_gps = atan2(gps_dy, gps_dx)   // 0 = east, π/2 = north (math convention)
```

Polygon convention: y axis = north, x axis = east. So:

```
polygon_charging_orientation = travel_heading_gps - π/2
```

Driver's seat note: dock heading and map-frame rotation are not the same physical quantity (see `polygon-rotation-bug.md` memory). This computation produces map-frame rotation specifically — the value the server uses for GPS↔map projection.

## Anchor-rebase math (pure function)

Input:
- `bundle.polygon[i].points` — charger-relative metres (charger at (0, 0) in bundle frame)
- `newAnchor` — `{ lat, lng }` from sensor RTK at dock
- `derivedTheta` — radians from drive-test (rotation between bundle-frame y axis and physical north at the new site)

Output:
- DB-ready polygon points expressed in the mower's map frame (= charger-relative metres post-rotation)
- New `chargingPose` = (0, 0, derivedTheta) by construction (charger is the origin)

```
for each point p in bundle:
  rx =  p.x * cos(theta) + p.y * sin(theta)
  ry = -p.x * sin(theta) + p.y * cos(theta)
  dbPoints.push({ x: rx, y: ry })

dbCharging = { x: 0, y: 0, orientation: derivedTheta }
```

`map_calibration.charger_lat/lng` updated to `newAnchor`. `mapNtocharge_unicom` first point is set to (0, 0) — the canonical charger anchor — so existing `getPolygonAnchor()` reads zero and `auto_recharge_server` docks correctly.

## Mower-side pos.json alignment (critical pre-condition)

Polygon points being charger-relative only works if the mower's local frame
ALSO has the charger at (0, 0). That requires `/userdata/pos.json` on the
mower to have `wgs84_origin` equal to the charger anchor.

Stock firmware writes `pos.json` at boot from its first GPS fix (mower is
on dock, so the fix is approximately the charger position — but with whatever
RTK quality was available at that exact second, often FLOAT not FIX).

The import flow ensures correctness explicitly:

1. ANCHOR_SET state captures the mower's RTK-FIX GPS at dock as `newAnchor`.
2. Just before sync_map at CONFIRMED → APPLIED, server writes pos.json on the
   mower (via a new extended command `set_pos_origin {lat, lng}`) and sets the
   file mode to 0444 so the next reboot's GPS-fix-write is rejected.
3. `set_pos_origin` handler also restarts `robot_combination_localization` so
   the new origin takes effect without a full reboot.

This is the inverse of today's "pos.json gets overwritten on every boot"
breakage. The portable import flow OWNS pos.json after a successful apply.

## Projection sanity (worked example)

Live LFIN1231000211 charger anchor: lat 52.14088864656, lng 6.23103579689.
After import:
- `pos.json` wgs84_origin = (52.14088864656, 6.23103579689) (= charger)
- `polygon_charging_orientation` = derived θ from drive-test
- `charging_pose` = (0, 0, derivedTheta)
- `map_position` reported by mower at dock ≈ (0, 0) (sub-cm RTK noise only)
- Polygon points in DB = bundle points rotated by derivedTheta

Then `gpsToLocal(samplePoint, chargerAnchor, derivedTheta)` produces the
sample's map-frame coordinates that match firmware's `map_position` directly.
Position-validation trail σ stays at RTK noise floor (<5 cm), Kabsch derived
θ matches saved θ.

## Error handling

Per-state failure modes (full table in section 4 of brainstorm transcript):

- Schema invalid → 400 with validation report.
- RTK quality < 100 / mower off dock → 409, retry button.
- Drive-test obstructed (distance < 0.5 m) → CANCELLED, suggest open area.
- Drive-test RTK lost → CANCELLED, retry under better sky.
- Sync_map fails (mower offline) → state CONFIRMED held 1 h with retry.
- Read-back drift > 30 cm → warning but proceed.

Cross-cutting:
- Concurrent imports per SN: 409 with active staging_id link.
- Server restart mid-flow: scan `<storage>/imports/*/state.json` at boot, expired (>24 h) wiped, in-progress preserved.
- Anchor distance > 100 m from `originalChargingPose` → confirmation modal.
- SN mismatch (cross-SN import): accepted, audit-logged.
- Polygon area < 5 m² → reject (probably corrupt).

## Testing strategy

**Unit (vitest, no mower):**
- `portableMap.exportBundle(sn)` snapshot.
- `portableMap.parseBundle(zip)` schema validation, ≥5 negative cases.
- `portableMap.computeAnchorRebase()` ≥10 cases (identity, pure rotation, pure translation, combined, edge).
- `driveCalibration.deriveHeading()` ≥6 cases (cardinal + diagonal + near-zero distance).
- State machine: every legal transition + 1 illegal-transition reject.

**Integration (in-memory DB, mocked MQTT):**
- Full UPLOADED → APPLIED with fixture bundle + simulated drive-test events.
- State.json round-trip after restart.
- Concurrent import → 409.
- Cross-SN import (use case 4).
- Anchor-too-far warning surfaced.

**Live verification (LFIN1231000211 manual checklist before merge):**
- UC1: charger replace at same spot → mowing OK.
- UC2: charger move 1 m → import flow → mowing in new position.
- UC3: factory reset → import bundle → mowing OK.
- UC5: backup/restore.
- UC4: deferred to follow-up issue (needs Alain's mower).

**Regression:**
- Existing `apply-polygon-offset` tests stay green.
- `sync_map` happy-path test fed by new portable bundle stays green.

**Telemetry:**
- Audit log query for debugging.
- Admin dashboard widget: last-import row with staging link.

## Open questions / follow-ups

- Cross-SN multi-mower (UC4) defers live test. Acceptance criteria when Alain's mower available.
- Should `start_calibration_drive` be controllable from the mobile app too, or admin-only? Default admin-only.
- Bundle versioning: schemaVersion = 1 today. Migration path when v2 lands. Defer until needed.

## References

- `polygon-rotation-bug.md` — dual-meaning theta bug context.
- `map-frame-realign-after-reboot.md` — observed drift pattern.
- `recovery-playbook-maps.md` §10 — re-provision invalidates ZIP background.
- `sync-map-anchor-flow.md` — 5-file write flow on mower.
- Server commit `c960b8e6` — saved-theta priority over IMU live.
