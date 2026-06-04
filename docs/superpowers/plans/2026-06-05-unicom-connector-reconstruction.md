# Unicom connector-reconstructie bij cloud-import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cloud-geïmporteerde multi-zone kaarten weer maaibaar maken door 0-byte inter-zone unicom-connectors tijdens de import van een (op de werk-union geclipt) pad te voorzien, plus de `charging_pose.orientation` uit de import behouden.

**Architecture:** Server-only. Een nieuwe pure-geometrie helper genereert het connector-pad; een DB-aware functie vult ontbrekende inter-zone connectors in de `maps`-tabel; `setup.ts` (cloud-import) roept beide aan na de CSV-import. `createBundleFromDb` pikt de nu-gevulde connectors + bewaarde oriëntatie vanzelf op (bestaande filter/`getPolygonChargingOrientation` blijven werken). Geen schema-wijziging, geen firmware-wijziging, geen dashboard-wijziging.

**Tech Stack:** TypeScript (ESM, NodeNext), Node, vitest, better-sqlite3 (in-memory test-DB via `vitest.config.ts` `test.env.DB_PATH=:memory:`).

Spec: `docs/superpowers/specs/2026-06-05-unicom-connector-reconstruction-design.md`

---

## File Structure

- **Create** `server/src/maps/unicomConnector.ts` — pure geometrie (`pointInPolygon`, `pointInAnyPolygon`, `generateUnicomPath`) + DB-aware `fillMissingUnicomPaths(sn)`.
- **Create** `server/src/__tests__/maps/unicomConnector.test.ts` — unit tests (geometrie + DB-aware fill met in-memory DB).
- **Modify** `server/src/routes/setup.ts` — na CSV-import `fillMissingUnicomPaths(mower.sn)` aanroepen + `charging_pose.orientation` bewaren via `setPolygonChargingOrientation`.
- **Modify (verify only)** `server/src/services/portableBackup.ts` — `createBundleFromDb` gebruikt al `getPolygonChargingOrientation(sn) ?? 0` en `filter(u => u.map_area)`; bevestig dat dit nu correct doorstroomt (geen code-wijziging verwacht).

---

## Task 1: Pure geometrie + `generateUnicomPath`

**Files:**
- Create: `server/src/maps/unicomConnector.ts`
- Test: `server/src/__tests__/maps/unicomConnector.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/__tests__/maps/unicomConnector.test.ts
import { describe, it, expect } from 'vitest';
import { pointInPolygon, pointInAnyPolygon, generateUnicomPath, type XY }
  from '../../maps/unicomConnector.js';

const square = (cx: number, cy: number, h: number): XY[] => [
  { x: cx - h, y: cy - h }, { x: cx + h, y: cy - h },
  { x: cx + h, y: cy + h }, { x: cx - h, y: cy + h },
];

describe('pointInPolygon', () => {
  it('detects inside/outside', () => {
    const sq = square(0, 0, 1);
    expect(pointInPolygon({ x: 0, y: 0 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(false);
  });
});

describe('generateUnicomPath', () => {
  it('connects two overlapping zones with an all-in-union path', () => {
    const a = square(0, 0, 1);          // x,y in [-1,1]
    const b = square(1.5, 0, 1);        // x,y in [0.5,2.5] — overlaps a in [0.5,1]
    const path = generateUnicomPath(a, b, [a, b], 0.25);
    expect(path.length).toBeGreaterThanOrEqual(2);
    for (const p of path) expect(pointInAnyPolygon(p, [a, b])).toBe(true);
  });

  it('clips out points that fall in a gap between non-overlapping zones', () => {
    const a = square(0, 0, 1);          // [-1,1]
    const b = square(4, 0, 1);          // [3,5] — 2m gap to a
    const path = generateUnicomPath(a, b, [a, b], 0.25);
    for (const p of path) expect(pointInAnyPolygon(p, [a, b])).toBe(true);
    // no point lands in the gap (1 < x < 3)
    expect(path.every((p) => !(p.x > 1 && p.x < 3))).toBe(true);
  });

  it('returns empty for degenerate input', () => {
    expect(generateUnicomPath([], [{ x: 0, y: 0 }], [], 0.25)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/maps/unicomConnector.test.ts`
Expected: FAIL — cannot find module `../../maps/unicomConnector.js`.

- [ ] **Step 3: Implement the helper**

```ts
// server/src/maps/unicomConnector.ts
export interface XY { x: number; y: number; }

/** Ray-casting point-in-polygon (even-odd). */
export function pointInPolygon(p: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y))
      && (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInAnyPolygon(p: XY, polys: XY[][]): boolean {
  return polys.some((poly) => poly.length >= 3 && pointInPolygon(p, poly));
}

/**
 * Generate a connector path from one work zone to another, sampled at `stepM`
 * and CLIPPED to the free union of all work polygons so the corridor never
 * crosses outside-boundary or obstacle space. For overlapping zones (the LFI
 * multi-zone norm) the straight line stays entirely inside the union; for a
 * real gap the in-gap samples are dropped.
 */
export function generateUnicomPath(
  fromPts: XY[], toPts: XY[], workPolys: XY[][], stepM = 0.25,
): XY[] {
  if (fromPts.length === 0 || toPts.length === 0) return [];
  const target: XY = {
    x: toPts.reduce((s, p) => s + p.x, 0) / toPts.length,
    y: toPts.reduce((s, p) => s + p.y, 0) / toPts.length,
  };
  let closest = fromPts[0], best = Infinity;
  for (const p of fromPts) {
    const d = (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
    if (d < best) { best = d; closest = p; }
  }
  const dist = Math.hypot(closest.x - target.x, closest.y - target.y);
  const steps = Math.max(2, Math.ceil(dist / stepM));
  const path: XY[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const p: XY = {
      x: target.x + t * (closest.x - target.x),
      y: target.y + t * (closest.y - target.y),
    };
    if (pointInAnyPolygon(p, workPolys)) path.push(p);
  }
  return path;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/maps/unicomConnector.test.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add server/src/maps/unicomConnector.ts server/src/__tests__/maps/unicomConnector.test.ts
git commit -m "feat(maps): unicom connector path geometry (clipped to work union)"
```

---

## Task 2: `fillMissingUnicomPaths(sn)` (DB-aware)

**Files:**
- Modify: `server/src/maps/unicomConnector.ts`
- Modify: `server/src/__tests__/maps/unicomConnector.test.ts`

- [ ] **Step 1: Confirm the repo API**

Read `server/src/db/repositories/maps.ts` and confirm these exist with the assumed signatures:
- `mapRepo.findAllByMowerSnAndType(sn, type)` → `MapRow[]` (includes rows with `map_area === null`).
- `mapRepo.updateAreaAndBoundsById(mapId, mapAreaJson, boundsJson)`.
- `MapRow` has `map_id`, `map_area`, `canonical_name`.

If `updateAreaAndBoundsById` differs, adapt the call in Step 3 to the actual setter (e.g. `upsert`/`updateAreaById`). Note the real name here before coding.

- [ ] **Step 2: Write the failing test**

```ts
// add to server/src/__tests__/maps/unicomConnector.test.ts
import { fillMissingUnicomPaths } from '../../maps/unicomConnector.js';
import { mapRepo } from '../../db/repositories/maps.js';

describe('fillMissingUnicomPaths', () => {
  const sn = 'TESTSN0001';
  it('fills a 0-byte inter-zone connector with an in-union path', () => {
    const a = JSON.stringify(square(0, 0, 2));
    const b = JSON.stringify(square(3, 0, 2)); // overlaps a in x[1,2]
    mapRepo.upsert({ map_id: 'w0', mower_sn: sn, map_name: 'map0', map_area: a,
      file_name: 'map0_work.csv', file_size: null, map_type: 'work', canonical_name: 'map0' });
    mapRepo.upsert({ map_id: 'w1', mower_sn: sn, map_name: 'map1', map_area: b,
      file_name: 'map1_work.csv', file_size: null, map_type: 'work', canonical_name: 'map1' });
    mapRepo.upsert({ map_id: 'u01', mower_sn: sn, map_name: 'map0tomap1_0_unicom', map_area: null,
      file_name: 'map0tomap1_0_unicom.csv', file_size: null, map_type: 'unicom',
      canonical_name: 'map0tomap1_0_unicom' });

    const filled = fillMissingUnicomPaths(sn);
    expect(filled).toBe(1);

    const rows = mapRepo.findAllByMowerSnAndType(sn, 'unicom');
    const u = rows.find((r) => r.canonical_name === 'map0tomap1_0_unicom')!;
    expect(u.map_area).toBeTruthy();
    const pts = JSON.parse(u.map_area as string) as XY[];
    expect(pts.length).toBeGreaterThanOrEqual(2);
  });

  it('leaves map*tocharge connectors untouched', () => {
    mapRepo.upsert({ map_id: 'uc', mower_sn: sn, map_name: 'map0tocharge_unicom',
      map_area: JSON.stringify([{ x: 0, y: 0 }, { x: 0, y: -1 }]),
      file_name: 'map0tocharge_unicom.csv', file_size: null, map_type: 'unicom',
      canonical_name: 'map0tocharge_unicom' });
    const before = mapRepo.findAllByMowerSnAndType(sn, 'unicom')
      .find((r) => r.canonical_name === 'map0tocharge_unicom')!.map_area;
    fillMissingUnicomPaths(sn);
    const after = mapRepo.findAllByMowerSnAndType(sn, 'unicom')
      .find((r) => r.canonical_name === 'map0tocharge_unicom')!.map_area;
    expect(after).toBe(before);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/maps/unicomConnector.test.ts`
Expected: FAIL — `fillMissingUnicomPaths` is not exported.

- [ ] **Step 4: Implement `fillMissingUnicomPaths`**

```ts
// append to server/src/maps/unicomConnector.ts
import { mapRepo } from '../db/repositories/maps.js';

/**
 * For every inter-zone unicom (`map<i>tomap<j>_<n>_unicom`) that has no path
 * yet (cloud imports them 0-byte), generate a clipped connector path between
 * the two work zones and persist it. Returns the number of connectors filled.
 * No-op for single-zone maps, for map*tocharge channels, and for connectors
 * that already have a path (snapshot/native restores).
 */
export function fillMissingUnicomPaths(sn: string): number {
  const workRows = mapRepo.findAllByMowerSnAndType(sn, 'work').filter((w) => w.map_area);
  if (workRows.length < 2) return 0;
  const byIdx = new Map<number, XY[]>();
  for (const w of workRows) {
    const m = (w.canonical_name ?? '').match(/^map(\d+)$/);
    if (m) byIdx.set(parseInt(m[1], 10), JSON.parse(w.map_area as string) as XY[]);
  }
  const workPolys = [...byIdx.values()];
  let filled = 0;
  for (const u of mapRepo.findAllByMowerSnAndType(sn, 'unicom')) {
    if (u.map_area) continue;
    const m = (u.canonical_name ?? '').match(/^map(\d+)tomap(\d+)_\d+_unicom$/);
    if (!m) continue;
    const from = byIdx.get(parseInt(m[1], 10));
    const to = byIdx.get(parseInt(m[2], 10));
    if (!from || !to) continue;
    const path = generateUnicomPath(from, to, workPolys);
    // A non-contiguous (gapped) clip leaves jumps > 2*step; warn but still
    // persist the in-union samples — for overlapping LFI zones the path is
    // contiguous. True pathfinding is a future enhancement (see spec).
    if (path.length < 2) {
      console.warn(`[unicom] ${sn}: ${u.canonical_name} clipped to empty — skipped`);
      continue;
    }
    mapRepo.updateAreaAndBoundsById(u.map_id, JSON.stringify(path), '{}');
    filled++;
    console.log(`[unicom] ${sn}: filled ${u.canonical_name} (${path.length} pts)`);
  }
  return filled;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/maps/unicomConnector.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/maps/unicomConnector.ts server/src/__tests__/maps/unicomConnector.test.ts
git commit -m "feat(maps): fillMissingUnicomPaths for 0-byte inter-zone connectors"
```

---

## Task 3: Wire into cloud-import (`setup.ts`)

**Files:**
- Modify: `server/src/routes/setup.ts`

- [ ] **Step 1: Add the import**

At the top of `server/src/routes/setup.ts`, add:

```ts
import { fillMissingUnicomPaths } from '../maps/unicomConnector.js';
```

- [ ] **Step 2: Call the fill + store orientation after CSV import**

Locate the comment block `// Geen auto-generatie van unicom paddata meer.` (the spot where f6191a46 removed the old generation, ~line 430). Replace that comment block with:

```ts
            // Reconstruct inter-zone unicom connector paths. LFI ships these
            // channels 0-byte (path data lives only on a natively-mapped
            // mower). Without a path the connector is dropped by the bundle
            // filter, leaving multi-zone maps with unbridged necks that the
            // costmap inflation seals shut. We fill them with a union-clipped
            // path so the bundle keeps a navigable corridor. (Reverses the
            // mower-breaking half of f6191a46; see spec 2026-06-05.)
            try {
              const n = fillMissingUnicomPaths(mower.sn);
              if (n > 0) console.log(`[Setup] Reconstructed ${n} unicom connector(s) for ${mower.sn}`);
            } catch (e) {
              console.warn(`[Setup] unicom reconstruction failed (non-fatal):`, e);
            }
```

Then, inside the existing `if (chargingPose?.x && chargingPose?.y) { ... }` block (where `chargingPose` is read from `machineField`), add — after the `setCalibration`/GPS handling:

```ts
              // Preserve the cloud charging-pose orientation so the generated
              // bundle keeps it (createBundleFromDb reads polygon_charging_orientation).
              const poseOrient = parseFloat((chargingPose.orientation as string) ?? 'NaN');
              if (Number.isFinite(poseOrient) && poseOrient !== 0) {
                mapRepo.setPolygonChargingOrientation(mower.sn, poseOrient);
              }
```

(Confirm `mapRepo` is already imported in `setup.ts`; it is used elsewhere in the file.)

- [ ] **Step 3: Type-check**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/setup.ts
git commit -m "feat(setup): reconstruct unicom connectors + preserve charging-pose orientation on cloud import"
```

---

## Task 4: Lock the orientation flow through the bundle

**Files:**
- Modify: `server/src/__tests__/maps/unicomConnector.test.ts` (or a focused bundle test)

- [ ] **Step 1: Confirm `createBundleFromDb` orientation source**

Read `server/src/services/portableBackup.ts` `createBundleFromDb`. Confirm it still does `const fallbackOrient = mapRepo.getPolygonChargingOrientation(sn); const chargingPose = { x: 0, y: 0, orientation: fallbackOrient ?? 0 };` and that the unicom branch is `findAllByMowerSnAndType(sn, 'unicom').filter((u) => u.map_area)`. No code change expected — these now receive the filled connectors + stored orientation.

- [ ] **Step 2: Write a regression test for the orientation round-trip**

```ts
// add to server/src/__tests__/maps/unicomConnector.test.ts
import { mapRepo as repo2 } from '../../db/repositories/maps.js';

describe('charging-pose orientation persistence', () => {
  it('round-trips through the polygon_charging_orientation store', () => {
    const sn = 'TESTSN0002';
    repo2.setPolygonChargingOrientation(sn, 1.6227);
    expect(repo2.getPolygonChargingOrientation(sn)).toBeCloseTo(1.6227, 4);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `cd server && npx vitest run src/__tests__/maps/unicomConnector.test.ts`
Expected: PASS.

- [ ] **Step 4: Run the full server test suite (regression)**

Run: `cd server && npx vitest run`
Expected: all green — existing `occupancyGrid`, bundle, and map tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add server/src/__tests__/maps/unicomConnector.test.ts
git commit -m "test(maps): lock charging-pose orientation round-trip"
```

---

## Task 5: Live acceptance (manual — niet auto-uitvoeren)

Geen code. Uitvoeren mét de gebruiker / David, na deploy van de server:

- [ ] Re-import David's kaart (cloud-apply opnieuw) zodat de import-hook draait.
- [ ] Bevestig in de DB/bundle dat `map0tomap1` + `map1tomap2` unicom nu `map_area` hebben.
- [ ] Push de bundle (apply-verbatim) naar de maaier.
- [ ] Snapshot de live `/global_costmap/costmap` en draai de flood-fill start→doel: bij `cost ≥ 99` moet het nu **CONNECTED** zijn (was DISCONNECTED).
- [ ] Bevestig met David dat een maaisessie nu wél start (verlaat dock, begint te maaien i.p.v. terug naar charger).

> Bewegingscommando's en de maaitest gebeuren alleen op expliciete bevestiging van de gebruiker.

---

## Self-Review

- **Spec coverage:** connector-generatie (Task 1/2), import-hook (Task 3), clip-op-union (Task 1), oriëntatie-behoud (Task 3/4), acceptatie (Task 5). Dashboard: bewust geen wijziging (spec). ✓
- **Placeholders:** geen TBD; elke code-stap heeft volledige code. Task 2 Step 1 / Task 4 Step 1 zijn expliciete API-verificaties (geen placeholder maar een bevestig-stap met fallback-instructie).
- **Type-consistentie:** `XY` overal gelijk; `generateUnicomPath(fromPts, toPts, workPolys, stepM)` consistent tussen Task 1 (def) en Task 2 (call); `fillMissingUnicomPaths(sn)` consistent tussen Task 2 (def) en Task 3 (call).
- **Risico:** `mapRepo.updateAreaAndBoundsById` / `upsert` signatuur — afgedekt door de verificatie-stap (Task 2 Step 1) met fallback.
