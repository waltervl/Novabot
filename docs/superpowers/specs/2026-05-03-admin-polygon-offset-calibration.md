# Admin Polygon Offset Calibration

**Date:** 2026-05-03
**Status:** Spec — pending implementation plan

## Problem

After a `restore-and-realign` flow the mower's saved polygon can still be a
few centimetres off from physical reality. Users can see this in the field
when the mower drives a fraction outside the visible boundary on certain
edges (e.g. corners where the original mapping pose was slightly drifted).

Today the only correction path is to remap the entire area or to manually
edit the unicom CSV — both are heavy-handed for a 1-5 cm correction.

## Goal

Add an admin-panel calibration mode that lets the operator nudge the entire
polygon by integer-cm offsets in 4 directions, preview the result against a
ghost of the original polygon, and apply the offset with one click. Apply
persists the offset to the DB, regenerates the mower's `_latest.zip`, and
pushes via the existing `sync_map` MQTT path so the mower picks up the
shifted boundary on its next sync — without re-entering its mapping flow.

The charger anchor (and therefore dock pose) stays fixed: only the polygon
geometry shifts, not the mower's notion of where the dock physically is.

## Non-Goals

- **No rotation** in v1. Translation covers the observed drift cases. Adding
  rotation later requires a pivot decision (charger? centroid?) and is
  deferred until a real use case appears.
- **No per-polygon offsets.** A single `(dx, dy)` applies to all of a
  mower's polygons. Per-zone correction is YAGNI today.
- **No automatic application.** Apply is always a single explicit click —
  no auto-push after idle, no implicit commits while nudging.
- **No GPS recalibration.** `chargerGps`, `pos.json`, and the
  `restore-and-realign` flow are untouched.

## Architecture

### 1. Database

`map_calibration` gets two new columns:

```sql
ALTER TABLE map_calibration ADD COLUMN polygon_offset_x_m REAL NOT NULL DEFAULT 0;
ALTER TABLE map_calibration ADD COLUMN polygon_offset_y_m REAL NOT NULL DEFAULT 0;
```

- **Units:** metres in the mower's local map frame (same units as
  `map_area`).
- **Semantics:** cumulative absolute offset. The latest Apply replaces the
  stored value with the operator's accumulated nudges (UI starts from the
  current DB value, each click adds, Apply writes the total).
- The existing `offset_lat`, `offset_lng`, `rotation`, `scale` columns are
  **not touched** — those are degrees/radians for the dashboard's
  GPS-Leaflet visual overlay only and have unrelated semantics.

`mapRepo` gains `getPolygonOffset(sn)` and `setPolygonOffset(sn, dx, dy)`.

### 2. Polygon shifting

A pure helper applies the offset at ZIP-generation time (never at
DB-write time — DB stays canonical):

```ts
function shiftPoints(
  pts: Array<{ x: number; y: number }>,
  dx: number,
  dy: number,
  isToChargeUnicom: boolean,
): Array<{ x: number; y: number }> {
  if (dx === 0 && dy === 0) return pts;
  return pts.map((p, i) => {
    // First point of mapNtocharge_unicom = canonical charger anchor.
    // Never shift — preserves dock pose and pos.json origin.
    if (isToChargeUnicom && i === 0) return p;
    return { x: p.x + dx, y: p.y + dy };
  });
}
```

`isToChargeUnicom` is true when the row's `canonical_name ?? map_name`
matches `/^map\d+tocharge_unicom$/` (same regex `getPolygonAnchor` uses).

After shifting, the row's `map_max_min` is recomputed from the new points
so map_info.json reflects the shifted bounds.

Applied in two call sites:

- `regenerateLatestZipFromBackup(sn)` — wraps `generateMapZipFromDb` so
  every CSV written into the ZIP gets shifted.
- `generateMapZipFromDb(sn, orientation)` — same shift applied to the
  in-memory points before CSV serialisation. Reads the offset from
  `mapRepo.getPolygonOffset(sn)`.

`getPolygonAnchor(sn)` is unchanged — it returns the first unicom-tocharge
point, which is exempt from shifting, so the anchor is stable.

### 3. Apply pipeline

New endpoint: `POST /api/admin-status/maps/:sn/apply-polygon-offset`

Body:
```json
{ "dx_m": 0.08, "dy_m": -0.03 }
```

Validation:
- Both numbers finite, |dx|, |dy| ≤ 1.0 m (sanity bound — bigger than this
  isn't calibration, it's misuse). Reject 400 otherwise.

Steps (sequential, abort on first failure):

1. `mapRepo.setPolygonOffset(sn, dx_m, dy_m)` — persist absolute offset.
2. `regenerateLatestZipFromBackup(sn)` — rebuild `<SN>_latest.zip` with
   shifted points + recomputed `map_max_min`. Returns null if no unicom
   exists — surface as 400.
3. Online check via `isDeviceOnline(sn)`. Offline → 404 with
   `{ ok: false, partial: true, error: 'Mower offline' }`. DB write
   already happened; user can retry sync later.
4. `publishToExtended(sn, { sync_map: { ... } })` — fires the existing
   sync_map flow. Mower's extended_commands.py pulls the shifted ZIP via
   `/api/dashboard/maps/:sn/sync-zip`.
5. Wait up to 8 s for the mower's sync_map ack (existing helper). Timeout →
   504 with partial flag.

On success: `{ ok: true, dx_m, dy_m, restoredItems: <count> }`.

A separate POST `…/reset-polygon-offset` writes `(0, 0)` and runs the same
regenerate + sync, so the user has a one-click undo.

### 4. Admin UI

Map Viewer card gets a new toolbar button "Calibrate Polygon Offset" next
to the existing "Restore + Realign Mower" button. Click enters calibration
mode.

**Floating panel** (top-left of map canvas, mirrors the existing dashboard
MowerMap calibration panel pattern):

```
┌─ POLYGON OFFSET ─────────── ✕ ─┐
│            [↑ N]               │
│  [← W]   +0.05, -0.03 m   [→ E]│
│            [↓ S]               │
│                                │
│  Shift+klik = 10 cm            │
│                                │
│  [ Reset ]  [ Cancel ] [ Apply]│
└────────────────────────────────┘
```

Behaviour:
- Panel loads with the current DB offset as starting value (so 5 cm in DB
  appears as `+0.05, +0.00`).
- Arrow buttons: ±1 cm per click; Shift+click = ±10 cm. Keyboard arrow
  keys (when canvas focused) mirror the buttons; Shift+arrow = 10 cm.
- "Reset" sets the in-UI value back to `(0, 0)` — DB unchanged until Apply.
- "Cancel" exits calibration mode and discards UI changes.
- "Apply" → POST endpoint, status spinner, success reloads maps and exits
  mode.

**Canvas rendering in calibration mode:**

- Ghost layer = polygons drawn from the **original DB rows** (no shift):
  greyed `rgba(120,120,120,0.35)` fill, dashed 1 px border.
- Live layer = polygons drawn with the **current UI offset applied**:
  normal colour, full opacity.
- Both layers render every frame; ghost provides the visual reference for
  how far the polygon has moved.
- Outside calibration mode the canvas behaves exactly as today (no ghost,
  shift only applied implicitly via DB read — i.e. shows the persisted
  offset).

Calibration mode is mutually exclusive with the existing pan/zoom drag
(canvas wheel zoom still works; mouse drag is suppressed). This matches
the dashboard pattern and avoids accidental nudges from drag gestures.

### 5. Tests

- `mapRepo.test.ts` — `setPolygonOffset` round-trips; `getPolygonOffset`
  returns 0/0 when no row exists.
- `mapBackup.test.ts` — `regenerateLatestZipFromBackup` with
  `(dx=0.05, dy=-0.03)` produces a CSV where every work-polygon point is
  shifted, the obstacle CSV is shifted, the unicom-tomap CSV is shifted in
  full, and the unicom-tocharge CSV has every point shifted **except**
  index 0. `map_info.json` `charging_pose` matches the unshifted anchor.
- `mapBackup.test.ts` — offset `(0, 0)` produces byte-identical output to
  the no-offset path (regression guard for the early-return).
- `adminPolygonOffset.test.ts` (new) — happy path returns 200, mower
  offline returns 404 with `partial: true` and DB still updated, dx > 1 m
  returns 400 without DB write, regenerate failure returns 500.
- `dashboard.test.ts` — `/sync-info` reports the unshifted `charging_pose`
  even when offset is non-zero.

## Failure Modes

| Failure | Behaviour |
|---|---|
| dx/dy NaN, ±Infinity, or absent | 400, no DB write, no regenerate. |
| dx or dy magnitude > 1 m | 400, treated as misuse. |
| No unicom CSV in DB | 400 — `regenerateLatestZipFromBackup` returns null, no anchor available. DB offset still persisted (so user can fix unicom and retry). |
| `regenerateLatestZipFromBackup` throws | 500, DB offset persisted, no MQTT fire. |
| Mower offline at sync time | 404 with `{ partial: true }`. DB + ZIP both updated; mower will pick up on next reconnect via existing sync_map fallback. |
| Mower online but no sync_map ack within 8 s | 504 with `partial: true`. |
| User Cancel | UI state cleared, no API call, no DB change. |

## Anti-patterns

- **Don't shift map_area in DB.** Offset is metadata applied at read time.
  Mutating DB rows on every nudge would lose the original mapping data and
  make iterative calibration destructive.
- **Don't shift the charger anchor.** First point of unicom-tocharge is
  the dock pose. Shifting it desynchronises the mower's `charging_station.yaml`
  from physical reality and breaks docking.
- **Don't recompute pos.json on every offset change.** `pos.json` derives
  from `chargerGps` and the (unshifted) anchor — both are stable across
  polygon-offset operations. Touching pos.json risks the same UTM-origin
  drift that triggered the original 1 May escape incident.
- **Don't auto-apply.** Every push to the mower must be an explicit user
  action so the operator knows when the boundary will change live.

## Operator Runbook

1. Open admin Map Viewer → select mower.
2. Drive mower around a few times, observe escape spots.
3. Click "Calibrate Polygon Offset" — panel appears, ghost overlay shown.
4. Nudge with arrow buttons or keyboard until the live polygon visually
   matches where the boundary should be (use the ghost as reference).
5. Click "Apply" — wait for green "Synced (dx, dy)" status.
6. Verify on the mower: next mowing session should respect the new
   boundary. If still off, re-open calibration (panel will load the new
   total) and nudge further.
7. To revert: open calibration, click "Reset", then "Apply".
