# Admin Polygon Offset Calibration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-panel calibration mode that nudges a mower's polygon by integer-cm offsets, persists the offset non-destructively, and pushes the shifted boundary to the mower via the existing sync_map flow — with the charger anchor (first point of `mapNtocharge_unicom`) exempt from the shift.

**Architecture:** Offset stored as `polygon_offset_x_m`, `polygon_offset_y_m` columns on `map_calibration`. A pure helper `shiftPoints` is applied at ZIP-generation time inside `generateMapZipFromDb` and `regenerateLatestZipFromBackup`. New `POST /api/admin-status/maps/:sn/apply-polygon-offset` orchestrates DB-write → ZIP regen → `sync_map` MQTT, mirroring the existing `restore-and-realign` pattern. Admin canvas gets a floating panel + ghost overlay.

**Tech Stack:** TypeScript ESM, better-sqlite3, vitest, supertest, vanilla HTML/JS for the admin UI.

---

## File Structure

**Create:**
- `server/src/services/polygonOffset.ts` — pure `shiftPoints` helper
- `server/src/__tests__/services/polygonOffset.test.ts`
- `server/src/__tests__/routes/adminPolygonOffset.test.ts`

**Modify:**
- `server/src/db/database.ts` — migration for two new columns
- `server/src/db/repositories/maps.ts` — `getPolygonOffset` / `setPolygonOffset`
- `server/src/mqtt/mapConverter.ts` — call `shiftPoints` on every area
- `server/src/services/mapBackup.ts` — pass offset into regen, exempt anchor
- `server/src/routes/adminStatus.ts` — new endpoints
- `server/src/routes/adminPage.ts` — calibration UI + canvas ghost layer
- `server/src/__tests__/db/maps.test.ts` — round-trip tests
- `server/src/__tests__/services/mapBackup.test.ts` — offset coverage tests
- `server/src/__tests__/routes/dashboard.test.ts` — sync-info anchor-stability test

---

## Task 1: DB migration + repository round-trip

**Files:**
- Modify: `server/src/db/database.ts:355` (add columns next to existing migration)
- Modify: `server/src/db/repositories/maps.ts:29` (extend `CalibrationRow`), `:480` (new methods)
- Test: `server/src/__tests__/db/maps.test.ts` (add round-trip case)

- [ ] **Step 1: Write the failing test**

Append to `server/src/__tests__/db/maps.test.ts`:
```ts
describe('polygon offset', () => {
  const SN = 'LFIN1234567890';

  beforeEach(() => {
    db.prepare('DELETE FROM map_calibration WHERE mower_sn = ?').run(SN);
  });

  it('returns 0/0 when no calibration row exists', () => {
    expect(mapRepo.getPolygonOffset(SN)).toEqual({ x: 0, y: 0 });
  });

  it('round-trips a positive + negative offset', () => {
    mapRepo.setPolygonOffset(SN, 0.05, -0.03);
    expect(mapRepo.getPolygonOffset(SN)).toEqual({ x: 0.05, y: -0.03 });
  });

  it('preserves other calibration fields when updating offset', () => {
    mapRepo.setCalibration(SN, { rotation: 1.5, scale: 1.1 });
    mapRepo.setPolygonOffset(SN, 0.08, 0);
    const row = mapRepo.getCalibration(SN)!;
    expect(row.rotation).toBeCloseTo(1.5);
    expect(row.scale).toBeCloseTo(1.1);
    expect(row.polygon_offset_x_m).toBeCloseTo(0.08);
    expect(row.polygon_offset_y_m).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/db/maps.test.ts -t "polygon offset"`
Expected: FAIL — `mapRepo.getPolygonOffset is not a function`

- [ ] **Step 3: Add migration**

Insert in `server/src/db/database.ts` immediately after line 362 (the existing `for (const col of ['charger_lat REAL', ...])` loop):

```ts
  // Polygon translation offset (metres, mower local map frame).
  // Applied at ZIP-generation time so the canonical map_area rows stay
  // immutable and calibration is fully reversible.
  for (const col of ['polygon_offset_x_m REAL NOT NULL DEFAULT 0', 'polygon_offset_y_m REAL NOT NULL DEFAULT 0']) {
    try { db.exec(`ALTER TABLE map_calibration ADD COLUMN ${col}`); }
    catch { /* kolom bestaat al */ }
  }
```

- [ ] **Step 4: Extend `CalibrationRow` interface**

In `server/src/db/repositories/maps.ts:29`:
```ts
export interface CalibrationRow {
  mower_sn: string;
  offset_lat: number;
  offset_lng: number;
  rotation: number;
  scale: number;
  updated_at: string;
  charger_lat: number | null;
  charger_lng: number | null;
  gps_charger_lat: number | null;
  gps_charger_lng: number | null;
  polygon_offset_x_m: number;
  polygon_offset_y_m: number;
}
```

- [ ] **Step 5: Add the prepared statement + methods**

After `_setCalibration` block in `server/src/db/repositories/maps.ts` (around line 218), add:
```ts
  private _setPolygonOffset = db.prepare(`
    INSERT INTO map_calibration (mower_sn, polygon_offset_x_m, polygon_offset_y_m, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(mower_sn) DO UPDATE SET
      polygon_offset_x_m = excluded.polygon_offset_x_m,
      polygon_offset_y_m = excluded.polygon_offset_y_m,
      updated_at = datetime('now')
  `);
  private _getPolygonOffset = db.prepare(
    'SELECT polygon_offset_x_m, polygon_offset_y_m FROM map_calibration WHERE mower_sn = ?',
  );
```

After `setChargerGps` (around line 513), add:
```ts
  /**
   * Returns the cumulative polygon offset (metres, local map frame) for the
   * mower. Defaults to (0, 0) when no calibration row exists.
   */
  getPolygonOffset(mowerSn: string): { x: number; y: number } {
    const row = this._getPolygonOffset.get(mowerSn) as
      { polygon_offset_x_m: number; polygon_offset_y_m: number } | undefined;
    if (!row) return { x: 0, y: 0 };
    return { x: row.polygon_offset_x_m ?? 0, y: row.polygon_offset_y_m ?? 0 };
  }

  /**
   * Persist absolute polygon offset (metres). Replaces any prior value.
   * Other calibration fields are untouched.
   */
  setPolygonOffset(mowerSn: string, x: number, y: number): void {
    this._setPolygonOffset.run(mowerSn, x, y);
  }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/db/maps.test.ts -t "polygon offset"`
Expected: PASS — all 3 cases.

- [ ] **Step 7: Commit**

```bash
git add server/src/db/database.ts server/src/db/repositories/maps.ts server/src/__tests__/db/maps.test.ts
git commit -m "feat(server): polygon_offset_x/y_m columns on map_calibration"
```

---

## Task 2: Pure `shiftPoints` helper

**Files:**
- Create: `server/src/services/polygonOffset.ts`
- Test: `server/src/__tests__/services/polygonOffset.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/services/polygonOffset.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { shiftPoints, isToChargeUnicomName, recomputeBounds } from '../../services/polygonOffset.js';

describe('shiftPoints', () => {
  const pts = [
    { x: -1.21, y: 0.48 },
    { x: -1.20, y: 0.45 },
    { x: 1.0, y: 2.0 },
  ];

  it('returns the same reference when offset is (0,0)', () => {
    expect(shiftPoints(pts, 0, 0, false)).toBe(pts);
    expect(shiftPoints(pts, 0, 0, true)).toBe(pts);
  });

  it('shifts every point by (dx, dy) when not unicom-tocharge', () => {
    const out = shiftPoints(pts, 0.05, -0.03, false);
    expect(out).toEqual([
      { x: -1.16, y: 0.45 },
      { x: -1.15, y: 0.42 },
      { x: 1.05, y: 1.97 },
    ]);
  });

  it('exempts only index 0 when isToChargeUnicom=true', () => {
    const out = shiftPoints(pts, 0.05, -0.03, true);
    expect(out[0]).toEqual({ x: -1.21, y: 0.48 });
    expect(out[1]).toEqual({ x: -1.15, y: 0.42 });
    expect(out[2]).toEqual({ x: 1.05, y: 1.97 });
  });

  it('handles single-point input', () => {
    const out = shiftPoints([{ x: 1, y: 2 }], 0.5, 0.5, false);
    expect(out).toEqual([{ x: 1.5, y: 2.5 }]);
  });
});

describe('isToChargeUnicomName', () => {
  it.each([
    ['map0tocharge_unicom', true],
    ['map12tocharge_unicom', true],
    ['map0tomap1_0_unicom', false],
    ['map0_work', false],
    ['map0_3_obstacle', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('%s -> %s', (name, expected) => {
    expect(isToChargeUnicomName(name as string | null | undefined)).toBe(expected);
  });
});

describe('recomputeBounds', () => {
  it('returns null for empty input', () => {
    expect(recomputeBounds([])).toBeNull();
  });

  it('returns the min/max envelope', () => {
    expect(recomputeBounds([{ x: -1, y: 2 }, { x: 3, y: -4 }, { x: 0, y: 5 }])).toEqual({
      minX: -1, maxX: 3, minY: -4, maxY: 5,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/services/polygonOffset.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement helper**

Create `server/src/services/polygonOffset.ts`:
```ts
/**
 * Pure helpers for the admin polygon-offset calibration feature.
 *
 * Spec: docs/superpowers/specs/2026-05-03-admin-polygon-offset-calibration.md
 *
 * The offset is stored on `map_calibration` (polygon_offset_x_m,
 * polygon_offset_y_m) and applied at ZIP-generation time. The first point of
 * any `mapNtocharge_unicom` polygon is the canonical charger anchor and is
 * NEVER shifted — preserving the dock pose and `pos.json` origin.
 */

export interface XY {
  x: number;
  y: number;
}

const TO_CHARGE_UNICOM_RE = /^map\d+tocharge_unicom$/;

/**
 * Match the canonical name for the per-map "to-charge" unicom polygon.
 * Mirrors the regex used by `getPolygonAnchor` in services/anchor.ts.
 */
export function isToChargeUnicomName(name: string | null | undefined): boolean {
  if (!name) return false;
  return TO_CHARGE_UNICOM_RE.test(name);
}

/**
 * Translate every point by (dx, dy) metres. When `isToChargeUnicom` is true,
 * the point at index 0 is returned unchanged so the charger anchor stays
 * fixed regardless of offset.
 *
 * Returns the input array reference when (dx, dy) === (0, 0) — callers can
 * use referential equality to skip downstream work.
 */
export function shiftPoints(
  pts: XY[],
  dx: number,
  dy: number,
  isToChargeUnicom: boolean,
): XY[] {
  if (dx === 0 && dy === 0) return pts;
  return pts.map((p, i) => {
    if (isToChargeUnicom && i === 0) return p;
    return { x: p.x + dx, y: p.y + dy };
  });
}

/**
 * Return the axis-aligned bounding box for a polygon point list. Used to
 * refresh `map_max_min` after shifting so map_info.json reflects the new
 * envelope. Returns null for an empty input.
 */
export function recomputeBounds(pts: XY[]): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (pts.length === 0) return null;
  let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].x < minX) minX = pts[i].x;
    if (pts[i].x > maxX) maxX = pts[i].x;
    if (pts[i].y < minY) minY = pts[i].y;
    if (pts[i].y > maxY) maxY = pts[i].y;
  }
  return { minX, maxX, minY, maxY };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/services/polygonOffset.test.ts`
Expected: PASS — all cases.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/polygonOffset.ts server/src/__tests__/services/polygonOffset.test.ts
git commit -m "feat(server): pure shiftPoints + bounds helpers for polygon offset"
```

---

## Task 3: Wire `shiftPoints` into `generateMapZipFromDb`

**Files:**
- Modify: `server/src/mqtt/mapConverter.ts:233` (`generateMapZipFromDb`)
- Modify: `server/src/__tests__/services/mapBackup.test.ts` (add coverage via existing helper)

- [ ] **Step 1: Write the failing test**

Append to `server/src/__tests__/services/mapBackup.test.ts` (inside the existing `regenerateLatestZipFromBackup` describe block):

```ts
  it('shifts every point except the first unicom-tocharge point when offset is set', () => {
    seedFullPolygonFor(SN);
    mapRepo.setPolygonOffset(SN, 0.05, -0.03);

    const zipPath = regenerateLatestZipFromBackup(SN);
    expect(zipPath).not.toBeNull();

    // Extract csv_file/ contents and assert per-CSV shift correctness.
    const dir = mkdtempSync(path.join(tmpdir(), 'shift-test-'));
    execSync(`unzip -o -q "${zipPath}" -d "${dir}"`);
    const csvDir = path.join(dir, 'csv_file');

    const work = readCsv(path.join(csvDir, 'map0_work.csv'));
    expect(work[0]).toEqual({ x: WORK_PTS[0].x + 0.05, y: WORK_PTS[0].y - 0.03 });

    const obs = readCsv(path.join(csvDir, 'map0_0_obstacle.csv'));
    expect(obs[0]).toEqual({ x: OBSTACLE_PTS[0].x + 0.05, y: OBSTACLE_PTS[0].y - 0.03 });

    const toCharge = readCsv(path.join(csvDir, 'map0tocharge_unicom.csv'));
    expect(toCharge[0]).toEqual(UNICOM_TOCHARGE_PTS[0]);  // anchor exempt
    expect(toCharge[1]).toEqual({ x: UNICOM_TOCHARGE_PTS[1].x + 0.05, y: UNICOM_TOCHARGE_PTS[1].y - 0.03 });

    rmSync(dir, { recursive: true, force: true });
  });

  it('with offset (0,0) produces equivalent output to no-offset path', () => {
    seedFullPolygonFor(SN);
    const zipA = regenerateLatestZipFromBackup(SN);
    mapRepo.setPolygonOffset(SN, 0, 0);
    const zipB = regenerateLatestZipFromBackup(SN);
    expect(readFileSync(zipA!).length).toBeGreaterThan(0);
    expect(readFileSync(zipB!).length).toBeGreaterThan(0);
    // CSV bytes must be identical
    const dirA = mkdtempSync(path.join(tmpdir(), 'noff-a-'));
    const dirB = mkdtempSync(path.join(tmpdir(), 'noff-b-'));
    execSync(`unzip -o -q "${zipA}" -d "${dirA}"`);
    execSync(`unzip -o -q "${zipB}" -d "${dirB}"`);
    expect(readFileSync(path.join(dirA, 'csv_file/map0_work.csv')).toString())
      .toEqual(readFileSync(path.join(dirB, 'csv_file/map0_work.csv')).toString());
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  });
```

Add helpers near the top of the test file (above the `describe`) if not already present:
```ts
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import path from 'path';

const WORK_PTS = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }];
const OBSTACLE_PTS = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }];
const UNICOM_TOCHARGE_PTS = [{ x: -1.21, y: 0.48 }, { x: -0.5, y: 0.2 }, { x: 0, y: 0 }];

function readCsv(p: string): Array<{ x: number; y: number }> {
  return readFileSync(p, 'utf8').trim().split('\n').map(l => {
    const [x, y] = l.split(',').map(parseFloat);
    return { x, y };
  });
}

function seedFullPolygonFor(sn: string) {
  // Insert one work, one obstacle, one tocharge unicom row covering the
  // canonical mapping the production path expects.
  // Implementation detail: reuse the `mapRepo.create` helper your test setup
  // already uses — see other tests in this file for the exact call shape.
  // ...
}
```

> **Note:** if your existing test file already has a polygon seeder, use it instead of `seedFullPolygonFor` and keep its naming. Do NOT define a duplicate.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/services/mapBackup.test.ts -t "shifts every point"`
Expected: FAIL — points come back unshifted.

- [ ] **Step 3: Apply offset inside `generateMapZipFromDb`**

In `server/src/mqtt/mapConverter.ts`, top of the file, add the import:
```ts
import { mapRepo } from '../db/repositories/maps.js';
import { shiftPoints, isToChargeUnicomName } from '../services/polygonOffset.js';
```

Inside `generateMapZipFromDb`, immediately after line 244 (`if (rows.length === 0) return null;`), insert:
```ts
  const offset = mapRepo.getPolygonOffset(sn);
```

Replace the three `points` assignments inside the work/obstacle/unicom loop:

Work polygon — change line 255:
```ts
    const rawPoints: LocalPoint[] = JSON.parse(row.map_area!);
    if (!rawPoints || rawPoints.length < 3) continue;
    const points = shiftPoints(rawPoints, offset.x, offset.y, false);
```

Obstacle polygon — change line 281:
```ts
        const rawObsPoints: LocalPoint[] = JSON.parse(obs.map_area!);
        if (!rawObsPoints || rawObsPoints.length < 3) continue;
        const obsPoints = shiftPoints(rawObsPoints, offset.x, offset.y, false);
```

Unicom polygon — change line 300:
```ts
      const rawUnicomPoints: LocalPoint[] = JSON.parse(unicomRows[i].map_area!);
      const unicomName = unicomRows[i].file_name ?? unicomRows[i].map_name ?? '';
      const unicomPoints = shiftPoints(rawUnicomPoints, offset.x, offset.y, isToChargeUnicomName(unicomName));
      if (unicomPoints && unicomPoints.length >= 2) {
```

(Keep the rest of the unicom block — just remove the now-duplicate `unicomName` lookup that follows.)

For the auto-generated fallback unicom (line ~315), the points are derived from the work polygon which has already been shifted (`points` variable). The fallback target is always 'charge', and the auto-generated path is built from the shifted closest point — so the dock-end of that path is the shifted polygon corner. To preserve the anchor-exempt invariant for the auto-generated case, override its first point to (0, 0):
```ts
    // The fallback path runs from charger (0,0) to the closest polygon
    // vertex. Index 0 IS (0,0) by construction (t=0), so the anchor stays
    // at origin without further intervention.
```
(No code change needed — the `for s=0` step already produces `{x:0, y:0}` which is the origin charger anchor.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/services/mapBackup.test.ts -t "shifts every point|with offset"`
Expected: PASS.

- [ ] **Step 5: Run full server suite to catch regressions**

Run: `cd server && npx vitest run`
Expected: PASS — all tests, no regressions.

- [ ] **Step 6: Commit**

```bash
git add server/src/mqtt/mapConverter.ts server/src/__tests__/services/mapBackup.test.ts
git commit -m "feat(server): apply polygon offset in generateMapZipFromDb (anchor exempt)"
```

---

## Task 4: Anchor-stability assertion in regenerate + sync-info

**Files:**
- Modify: `server/src/services/mapBackup.ts:241` (`regenerateLatestZipFromBackup`) — verify charging_pose stays unshifted
- Modify: `server/src/__tests__/services/mapBackup.test.ts` (add anchor-stability assertion)
- Modify: `server/src/__tests__/routes/dashboard.test.ts` (sync-info anchor stability)

- [ ] **Step 1: Write the failing tests**

Add to `mapBackup.test.ts` inside the regenerate describe:
```ts
  it('charging_pose in map_info.json stays at unshifted anchor when offset is non-zero', () => {
    seedFullPolygonFor(SN);
    mapRepo.setPolygonOffset(SN, 0.10, 0.10);

    const zipPath = regenerateLatestZipFromBackup(SN);
    expect(zipPath).not.toBeNull();

    const dir = mkdtempSync(path.join(tmpdir(), 'anchor-stable-'));
    execSync(`unzip -o -q "${zipPath}" -d "${dir}"`);
    const info = JSON.parse(readFileSync(path.join(dir, 'csv_file/map_info.json'), 'utf8'));
    expect(info.charging_pose.x).toBeCloseTo(UNICOM_TOCHARGE_PTS[0].x);
    expect(info.charging_pose.y).toBeCloseTo(UNICOM_TOCHARGE_PTS[0].y);
    rmSync(dir, { recursive: true, force: true });
  });
```

Add to `server/src/__tests__/routes/dashboard.test.ts` (find the existing `/sync-info` describe block):
```ts
  it('returns unshifted charging_pose even when polygon offset is non-zero', async () => {
    // … reuse the existing setup helpers from this describe block …
    mapRepo.setPolygonOffset(SN, 0.07, -0.04);
    const r = await request(app).get(`/api/dashboard/maps/${SN}/sync-info`);
    expect(r.status).toBe(200);
    expect(r.body.charging_pose.x).toBeCloseTo(UNICOM_TOCHARGE_PTS[0].x);
    expect(r.body.charging_pose.y).toBeCloseTo(UNICOM_TOCHARGE_PTS[0].y);
  });
```

- [ ] **Step 2: Run tests**

Run: `cd server && npx vitest run src/__tests__/services/mapBackup.test.ts -t "charging_pose"`
Run: `cd server && npx vitest run src/__tests__/routes/dashboard.test.ts -t "unshifted charging_pose"`

Expected: both PASS without code changes — `getPolygonAnchor` already reads first-point of unshifted DB rows, and Task 3 made `shiftPoints` skip index 0 of `mapNtocharge_unicom`.

If either FAILS, audit the call sites:
- `mapBackup.ts` calls `getPolygonAnchor(sn)` directly — that reads DB rows untouched by offset, so it returns the unshifted first point. Good.
- `dashboard.ts` `/sync-info` handler does the same. Good.

The only way these can fail is if a future refactor mutates the DB row before reading the anchor. The tests guard against that.

- [ ] **Step 3: Commit (test-only — no source change expected)**

```bash
git add server/src/__tests__/services/mapBackup.test.ts server/src/__tests__/routes/dashboard.test.ts
git commit -m "test(server): assert charging_pose stays at unshifted anchor under offset"
```

---

## Task 5: Apply + reset endpoints

**Files:**
- Modify: `server/src/routes/adminStatus.ts` — append two routes after the existing `restore-and-realign` block
- Test: `server/src/__tests__/routes/adminPolygonOffset.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/routes/adminPolygonOffset.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../mqtt/sensorData.js', () => ({
  deviceCache: new Map<string, Map<string, string>>(),
  isDeviceOnline: vi.fn().mockReturnValue(true),
}));

vi.mock('../../services/mapBackup.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/mapBackup.js')>(
    '../../services/mapBackup.js',
  );
  return {
    ...actual,
    regenerateLatestZipFromBackup: vi.fn().mockReturnValue('/tmp/fake-latest.zip'),
  };
});

vi.mock('../../mqtt/mapSync.js', () => ({
  publishToExtended: vi.fn().mockResolvedValue(true),
}));

import { app } from '../helpers/testApp.js';  // existing test app builder
import { mapRepo } from '../../db/repositories/maps.js';
import { isDeviceOnline } from '../../mqtt/sensorData.js';
import { regenerateLatestZipFromBackup } from '../../services/mapBackup.js';
import { publishToExtended } from '../../mqtt/mapSync.js';

const SN = 'LFIN9999999999';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isDeviceOnline).mockReturnValue(true);
  vi.mocked(regenerateLatestZipFromBackup).mockReturnValue('/tmp/fake-latest.zip');
  mapRepo.setPolygonOffset(SN, 0, 0);
});

describe('POST /api/admin-status/maps/:sn/apply-polygon-offset', () => {
  it('persists offset, regenerates, and pushes sync_map on happy path', async () => {
    const r = await request(app)
      .post(`/api/admin-status/maps/${SN}/apply-polygon-offset`)
      .send({ dx_m: 0.05, dy_m: -0.03 });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.dx_m).toBeCloseTo(0.05);
    expect(r.body.dy_m).toBeCloseTo(-0.03);
    expect(mapRepo.getPolygonOffset(SN)).toEqual({ x: 0.05, y: -0.03 });
    expect(regenerateLatestZipFromBackup).toHaveBeenCalledWith(SN);
    expect(publishToExtended).toHaveBeenCalledWith(SN, expect.objectContaining({ sync_map: expect.anything() }));
  });

  it('rejects non-finite dx with 400 and does not write DB', async () => {
    const r = await request(app)
      .post(`/api/admin-status/maps/${SN}/apply-polygon-offset`)
      .send({ dx_m: 'banana', dy_m: 0 });
    expect(r.status).toBe(400);
    expect(mapRepo.getPolygonOffset(SN)).toEqual({ x: 0, y: 0 });
    expect(regenerateLatestZipFromBackup).not.toHaveBeenCalled();
  });

  it('rejects |dx| > 1.0 with 400 and does not write DB', async () => {
    const r = await request(app)
      .post(`/api/admin-status/maps/${SN}/apply-polygon-offset`)
      .send({ dx_m: 1.5, dy_m: 0 });
    expect(r.status).toBe(400);
    expect(mapRepo.getPolygonOffset(SN)).toEqual({ x: 0, y: 0 });
  });

  it('returns 404 with partial flag when mower offline (DB still updated)', async () => {
    vi.mocked(isDeviceOnline).mockReturnValue(false);
    const r = await request(app)
      .post(`/api/admin-status/maps/${SN}/apply-polygon-offset`)
      .send({ dx_m: 0.02, dy_m: 0 });
    expect(r.status).toBe(404);
    expect(r.body.ok).toBe(false);
    expect(r.body.partial).toBe(true);
    expect(mapRepo.getPolygonOffset(SN)).toEqual({ x: 0.02, y: 0 });
  });

  it('returns 500 when regenerate fails', async () => {
    vi.mocked(regenerateLatestZipFromBackup).mockReturnValue(null);
    const r = await request(app)
      .post(`/api/admin-status/maps/${SN}/apply-polygon-offset`)
      .send({ dx_m: 0.02, dy_m: 0 });
    expect(r.status).toBe(500);
    expect(r.body.ok).toBe(false);
  });
});

describe('POST /api/admin-status/maps/:sn/reset-polygon-offset', () => {
  it('writes (0,0), regenerates, and pushes', async () => {
    mapRepo.setPolygonOffset(SN, 0.05, 0.05);
    const r = await request(app)
      .post(`/api/admin-status/maps/${SN}/reset-polygon-offset`)
      .send({});
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(mapRepo.getPolygonOffset(SN)).toEqual({ x: 0, y: 0 });
  });
});
```

> **Note:** if `helpers/testApp.js` doesn't exist in your test setup, swap to whatever supertest harness the existing `adminMapBackupRestore.test.ts` uses — copy its setup pattern verbatim.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/routes/adminPolygonOffset.test.ts`
Expected: FAIL — endpoints not registered (404 on POST).

- [ ] **Step 3: Add the endpoints**

In `server/src/routes/adminStatus.ts`, after the `restore-and-realign` route (around the end of the existing routes block), insert:

```ts
// ─────────────────────────────────────────────────────────────────────────────
// Polygon offset calibration (Novabot-XXX): persist a (dx, dy) translation,
// regenerate <SN>_latest.zip with shifted points (anchor exempt), and push to
// the mower via sync_map MQTT. See spec
// docs/superpowers/specs/2026-05-03-admin-polygon-offset-calibration.md.

const MAX_OFFSET_M = 1.0;

adminStatusRouter.post('/maps/:sn/apply-polygon-offset', async (req, res) => {
  const { sn } = req.params;
  const { dx_m, dy_m } = req.body as { dx_m?: unknown; dy_m?: unknown };
  const dx = typeof dx_m === 'number' ? dx_m : NaN;
  const dy = typeof dy_m === 'number' ? dy_m : NaN;

  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    res.status(400).json({ ok: false, error: 'dx_m and dy_m must be finite numbers' });
    return;
  }
  if (Math.abs(dx) > MAX_OFFSET_M || Math.abs(dy) > MAX_OFFSET_M) {
    res.status(400).json({ ok: false, error: `Offset magnitude must be ≤ ${MAX_OFFSET_M} m per axis` });
    return;
  }

  // 1. Persist (idempotent — even when downstream fails the operator can retry).
  mapRepo.setPolygonOffset(sn, dx, dy);

  // 2. Regenerate ZIP with the new offset baked in.
  const regenPath = regenerateLatestZipFromBackup(sn);
  if (!regenPath) {
    res.status(500).json({ ok: false, error: 'Failed to regenerate <SN>_latest.zip', dx_m: dx, dy_m: dy });
    return;
  }

  // 3. Online check — DB is already updated, just need MQTT to fire.
  if (!isDeviceOnline(sn)) {
    res.status(404).json({
      ok: false,
      partial: true,
      error: 'Mower offline — sync_map not pushed; mower will pick up offset on next reconnect',
      dx_m: dx, dy_m: dy,
    });
    return;
  }

  // 4. Fire sync_map. publishToExtended already returns a promise that
  // resolves once the mower acks (with internal 8 s timeout).
  try {
    await publishToExtended(sn, { sync_map: { reason: 'polygon-offset-apply' } });
  } catch (err) {
    res.status(504).json({
      ok: false, partial: true,
      error: `Mower did not ack sync_map: ${String(err)}`,
      dx_m: dx, dy_m: dy,
    });
    return;
  }

  res.json({ ok: true, dx_m: dx, dy_m: dy });
});

adminStatusRouter.post('/maps/:sn/reset-polygon-offset', async (req, res) => {
  // Re-use the apply path so the side-effects stay identical.
  req.body = { dx_m: 0, dy_m: 0 };
  return (adminStatusRouter as any).handle(
    Object.assign(req, { url: `/maps/${req.params.sn}/apply-polygon-offset`, method: 'POST' }),
    res,
    () => { /* noop */ },
  );
});
```

If your `adminStatus.ts` doesn't already import `publishToExtended` and `regenerateLatestZipFromBackup`, add at the top:
```ts
import { regenerateLatestZipFromBackup } from '../services/mapBackup.js';
import { publishToExtended } from '../mqtt/mapSync.js';
```

> **Note on the `reset-polygon-offset` re-dispatch:** if your express version doesn't expose `.handle()` cleanly, replace the body of the reset handler with an inline copy of the apply logic using `dx = 0, dy = 0`. The behaviour must be identical to apply (same DB write, regen, MQTT push).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/routes/adminPolygonOffset.test.ts`
Expected: PASS — all 6 cases.

- [ ] **Step 5: Run full server suite**

Run: `cd server && npx vitest run`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/adminStatus.ts server/src/__tests__/routes/adminPolygonOffset.test.ts
git commit -m "feat(server): apply/reset-polygon-offset endpoints with sync_map push"
```

---

## Task 6: Admin UI — calibration mode

**Files:**
- Modify: `server/src/routes/adminPage.ts` — add the toolbar button, floating panel, ghost rendering, keyboard handlers, fetch logic

This is the biggest task. There is no automated test for the inline JS — manual verification only. We commit after each sub-step so a regression can be bisected to a small change.

- [ ] **Step 1: Add toolbar button next to "Restore + Realign Mower"**

Find the Map Recovery card in `adminPage.ts` (look for `Restore + Realign Mower` button). Immediately after that button, add:

```html
        <button id="calibratePolygonBtn" onclick="enterPolygonCalibration()" class="recovery-btn"
          style="background:linear-gradient(135deg,#3b82f6,#1e40af);color:#fff;border:0">
          Calibrate Polygon Offset
        </button>
```

Use whatever class name your existing recovery buttons use (look at the "Restore + Realign Mower" markup for the exact class). The inline gradient is fine if the recovery buttons don't share a stylesheet.

- [ ] **Step 2: Inject the floating panel HTML**

Add inside the Map Viewer card, immediately after the `<canvas id="mapCanvas">`:

```html
        <div id="polygonCalPanel" style="display:none;position:absolute;top:12px;left:12px;z-index:1000;
          background:rgba(15,15,30,0.95);backdrop-filter:blur(6px);border:1px solid #444;
          border-radius:10px;padding:14px;width:240px;box-shadow:0 6px 30px rgba(0,0,0,0.45)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#fbbf24;font-weight:600">
              Polygon Offset
            </span>
            <span style="cursor:pointer;color:#888" onclick="cancelPolygonCalibration()" title="Cancel">✕</span>
          </div>
          <div style="display:grid;grid-template-columns:36px 36px 36px;gap:4px;justify-content:center;margin-bottom:10px">
            <span></span>
            <button class="cal-arrow" onclick="nudgePolygonOffset(0, 0.01, event)" title="North (Shift = 10 cm)">↑</button>
            <span></span>
            <button class="cal-arrow" onclick="nudgePolygonOffset(-0.01, 0, event)" title="West (Shift = 10 cm)">←</button>
            <div id="polygonCalDisplay" style="background:#0d0d20;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:9px;font-family:monospace;color:#9ca3af;padding:2px">+0.00, +0.00 m</div>
            <button class="cal-arrow" onclick="nudgePolygonOffset(0.01, 0, event)" title="East (Shift = 10 cm)">→</button>
            <span></span>
            <button class="cal-arrow" onclick="nudgePolygonOffset(0, -0.01, event)" title="South (Shift = 10 cm)">↓</button>
            <span></span>
          </div>
          <div style="font-size:10px;color:#666;text-align:center;margin-bottom:10px">Shift+klik = 10 cm</div>
          <div style="display:flex;gap:6px">
            <button onclick="resetPolygonOffsetUI()" style="flex:1;padding:6px;background:#374151;border:0;border-radius:6px;color:#fff;cursor:pointer">Reset</button>
            <button onclick="cancelPolygonCalibration()" style="flex:1;padding:6px;background:#374151;border:0;border-radius:6px;color:#fff;cursor:pointer">Cancel</button>
            <button id="polygonCalApplyBtn" onclick="applyPolygonOffset()" style="flex:1.2;padding:6px;background:#10b981;border:0;border-radius:6px;color:#fff;cursor:pointer;font-weight:600">Apply</button>
          </div>
          <div id="polygonCalStatus" style="margin-top:8px;font-size:11px;color:#9ca3af;min-height:14px"></div>
        </div>
```

Add the `.cal-arrow` style block (anywhere in the existing `<style>` section):
```css
        .cal-arrow {
          background:#374151; border:0; border-radius:6px; color:#fff;
          padding:8px 0; cursor:pointer; font-size:14px; line-height:1;
        }
        .cal-arrow:hover { background:#4b5563; }
```

The Map Viewer's containing element must be `position: relative` so the panel is positioned over the canvas. If it isn't already, add `position:relative` to the parent `<div>` of `<canvas id="mapCanvas">`.

- [ ] **Step 3: Add JS state + enter/exit functions**

Add to the script block in `adminPage.ts` (anywhere after `function loadMaps()`):

```js
// ─────────────────────────────────────────────────────────────────────────
// Polygon offset calibration mode
// Spec: docs/superpowers/specs/2026-05-03-admin-polygon-offset-calibration.md
// ─────────────────────────────────────────────────────────────────────────

var polygonCal = null;  // { dxStart, dyStart, dx, dy, ghostMaps } | null

async function enterPolygonCalibration() {
  var sn = document.getElementById('mapMowerSelect').value;
  if (!sn) { alert('Select a mower first.'); return; }

  // Pull current offset from the server (so panel starts where DB is).
  var r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/polygon-offset', {
    headers: { 'Authorization': token },
  });
  var current = r.ok ? await r.json() : { dx_m: 0, dy_m: 0 };

  // Cache a snapshot of the current canvas data as the ghost layer.
  var canvas = document.getElementById('mapCanvas');
  var ghostMaps = canvas.__mapState && canvas.__mapState.maps
    ? JSON.parse(JSON.stringify(canvas.__mapState.maps))
    : null;

  polygonCal = {
    dxStart: current.dx_m || 0,
    dyStart: current.dy_m || 0,
    dx: current.dx_m || 0,
    dy: current.dy_m || 0,
    ghostMaps: ghostMaps,
  };

  document.getElementById('polygonCalPanel').style.display = 'block';
  updatePolygonCalDisplay();
  rerenderWithGhost();
  document.addEventListener('keydown', polygonCalKeyHandler);
}

function cancelPolygonCalibration() {
  polygonCal = null;
  document.getElementById('polygonCalPanel').style.display = 'none';
  document.removeEventListener('keydown', polygonCalKeyHandler);
  loadMaps();  // restore canonical render
}

function resetPolygonOffsetUI() {
  if (!polygonCal) return;
  polygonCal.dx = 0;
  polygonCal.dy = 0;
  updatePolygonCalDisplay();
  rerenderWithGhost();
}

function nudgePolygonOffset(dx, dy, evt) {
  if (!polygonCal) return;
  var mult = (evt && evt.shiftKey) ? 10 : 1;
  polygonCal.dx = +(polygonCal.dx + dx * mult).toFixed(3);
  polygonCal.dy = +(polygonCal.dy + dy * mult).toFixed(3);
  updatePolygonCalDisplay();
  rerenderWithGhost();
}

function polygonCalKeyHandler(e) {
  if (!polygonCal) return;
  var step = e.shiftKey ? 0.10 : 0.01;
  switch (e.key) {
    case 'ArrowUp':    nudgePolygonOffset(0, step, e); e.preventDefault(); break;
    case 'ArrowDown':  nudgePolygonOffset(0, -step, e); e.preventDefault(); break;
    case 'ArrowLeft':  nudgePolygonOffset(-step, 0, e); e.preventDefault(); break;
    case 'ArrowRight': nudgePolygonOffset(step, 0, e); e.preventDefault(); break;
    case 'Escape':     cancelPolygonCalibration(); break;
  }
}

function updatePolygonCalDisplay() {
  if (!polygonCal) return;
  var d = document.getElementById('polygonCalDisplay');
  var sx = (polygonCal.dx >= 0 ? '+' : '') + polygonCal.dx.toFixed(2);
  var sy = (polygonCal.dy >= 0 ? '+' : '') + polygonCal.dy.toFixed(2);
  d.textContent = sx + ', ' + sy + ' m';
}

function rerenderWithGhost() {
  if (!polygonCal) return;
  var canvas = document.getElementById('mapCanvas');
  if (!canvas || !canvas.__mapState) return;
  // Build a synthetic maps array: each polygon shifted by current dx/dy
  // (with anchor exempt for unicom-tocharge).
  var ghostBase = polygonCal.ghostMaps || canvas.__mapState.maps;
  var live = JSON.parse(JSON.stringify(ghostBase)).map(function(m) {
    if (!m.points || !Array.isArray(m.points)) return m;
    var isToCharge = /^map\d+tocharge_unicom$/.test(m.canonical_name || m.map_name || '');
    m.points = m.points.map(function(p, i) {
      if (isToCharge && i === 0) return p;
      return { x: p.x + polygonCal.dx, y: p.y + polygonCal.dy };
    });
    return m;
  });
  // Pass both ghost and live to the renderer; renderer draws ghost first
  // then live on top.
  renderMapCanvas(canvas, live, canvas.__mapState.chargingPose, ghostBase);
}
```

- [ ] **Step 4: Extend `renderMapCanvas` to accept an optional ghost layer**

Find `function renderMapCanvas(canvas, maps, chargingPose) {` in `adminPage.ts` (around line 2492). Change the signature to:
```js
function renderMapCanvas(canvas, maps, chargingPose, ghostMaps) {
```

Inside the function, immediately before the polygon-drawing loop, add a ghost-draw pass when `ghostMaps` is provided:
```js
  // Calibration ghost: render the original polygons greyed out underneath
  // the live (offset-shifted) layer for visual comparison.
  if (ghostMaps && Array.isArray(ghostMaps)) {
    ghostMaps.forEach(function(g) {
      if (!g.points || g.points.length < 2) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(120,120,120,0.6)';
      ctx.fillStyle = 'rgba(120,120,120,0.18)';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      g.points.forEach(function(p, i) {
        var sx = offsetX + p.x * scale;
        var sy = offsetY - p.y * scale;
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  }
```

(Insert this immediately after the existing `// Draw each map polygon` comment, before the live-polygon loop.)

- [ ] **Step 5: Add the `applyPolygonOffset` + GET helper**

Add to the script block:
```js
async function applyPolygonOffset() {
  if (!polygonCal) return;
  var sn = document.getElementById('mapMowerSelect').value;
  var btn = document.getElementById('polygonCalApplyBtn');
  var status = document.getElementById('polygonCalStatus');
  btn.disabled = true;
  status.style.color = '#60a5fa';
  status.textContent = 'Applying…';

  try {
    var r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/apply-polygon-offset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': token },
      body: JSON.stringify({ dx_m: polygonCal.dx, dy_m: polygonCal.dy }),
    });
    var result = await r.json().catch(function(){ return {}; });
    if (!r.ok || !result.ok) {
      var msg = result.error || ('HTTP ' + r.status);
      if (result.partial) msg += ' (partial: DB updated, mower not yet synced)';
      throw new Error(msg);
    }
    status.style.color = '#10b981';
    status.textContent = 'Applied (' + polygonCal.dx.toFixed(2) + ', ' + polygonCal.dy.toFixed(2) + ' m). Synced.';
    setTimeout(cancelPolygonCalibration, 1200);
  } catch (e) {
    status.style.color = '#f87171';
    status.textContent = 'Apply failed: ' + e.message;
    btn.disabled = false;
  }
}
```

Add the GET endpoint to `adminStatus.ts` (next to the apply endpoint from Task 5):
```ts
adminStatusRouter.get('/maps/:sn/polygon-offset', (req, res) => {
  const off = mapRepo.getPolygonOffset(req.params.sn);
  res.json({ dx_m: off.x, dy_m: off.y });
});
```

- [ ] **Step 6: Manual smoke test**

Run: `cd server && npm run dev`
- Open admin page, select a mower with maps.
- Click "Calibrate Polygon Offset" — panel should appear with the current offset (should be `+0.00, +0.00 m` for a fresh mower).
- Press Right arrow on the keyboard 5 times — display should show `+0.05, +0.00 m`, polygon should visually shift right by 5 cm relative to the dashed grey ghost.
- Press Shift+Up — display should jump to `+0.05, +0.10 m`.
- Click Reset — display returns to `+0.00, +0.00 m`, polygon snaps back over ghost.
- Click Cancel — panel closes, canvas re-renders with persisted state.
- Re-enter calibration, nudge to (+0.03, +0.02), click Apply — status should turn green "Applied (0.03, 0.02 m). Synced.", panel auto-closes after 1.2 s.
- Re-enter calibration — panel should now show `+0.03, +0.02 m` as the starting value (proves persistence).
- Click Reset → Apply — status "Applied (0.00, 0.00 m). Synced.", DB should be back to (0, 0).

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/adminPage.ts server/src/routes/adminStatus.ts
git commit -m "feat(server): admin polygon-offset calibration UI with ghost overlay"
```

---

## Task 7: Runbook update + lint pass

**Files:**
- Modify: `docs/runbooks/charger-anchor-restore-runbook.md` — add a note about polygon offset
- Verify: `cd server && npx eslint src/ && npx tsc --noEmit`

- [ ] **Step 1: Append note to existing runbook**

Add at the end of `docs/runbooks/charger-anchor-restore-runbook.md`:
```markdown
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
```

- [ ] **Step 2: Run eslint + tsc**

Run: `cd server && npx eslint src/ && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the full suite once more**

Run: `cd server && npx vitest run`
Expected: ALL PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/runbooks/charger-anchor-restore-runbook.md
git commit -m "docs: runbook note for polygon-offset calibration"
```

---

## Done

After all tasks pass:
- `git push` to publish the branch.
- The user will run `release.sh` (or quick docker push to `latest`) when ready to ship.
- Verify in the live admin panel by opening `/admin`, selecting a mower, clicking Calibrate Polygon Offset, and confirming the panel + ghost overlay behaves as in Task 6 step 6.
