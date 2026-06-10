# Map & Obstacle Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Work-boundaries en obstacle-randen plaatselijk bewerken (vertex + brush), nieuwe obstacles tekenen en obstacles verwijderen — via dashboard én OpenNova app — met drafts, expliciete Apply naar de maaier en revert.

**Architecture:** Server-centrische `mapEdit` service (drafts in `map_edit_drafts`, snapshots in `map_versions`, validatie in pure-TS `editGeometry` module). Apply hergebruikt de **bewezen restore-flow**: DB bijwerken → `createBundleFromDb()` (synthesiseert CSVs + complete rasters incl. per-slot mapN.pgm server-side) → `pushMapToMowerVerbatim()` (`applyVerbatimToMower` → `write_map_files`, raster-validatie ingebouwd). Dashboard (canvas, inline JS in adminPage.ts) en app (SVG + gesture-handler) zijn dunne clients.

**Tech Stack:** TypeScript ESM (imports MET `.js` extensie!), better-sqlite3, Express, vitest (in-memory DB), React Native + react-native-svg + react-native-gesture-handler.

**Spec:** `docs/superpowers/specs/2026-06-10-map-obstacle-editing-design.md`

---

## Bestaande bouwstenen (NIET herbouwen)

| Wat | Waar | Gebruik |
|---|---|---|
| `mapRepo` (find/create/update/delete, calibration) | `server/src/db/repositories/maps.ts` | singleton `mapRepo` uit `../db/repositories/index.js` |
| `createBundleFromDb(sn, reason)` → `BackupEntry \| null` | `server/src/services/portableBackup.ts:206` | apply: bundle uit DB-polygonen (vereist charger anchor) |
| `pushMapToMowerVerbatim(sn, filename?)` → `{ok, offline?, noBundle?, noFiles?, invalidMap?}` | `server/src/mqtt/mapSync.ts:637` | apply: push naar maaier (doet zelf online-check + rastervalidatie) |
| `isDeviceOnline(sn)` | `server/src/mqtt/broker.ts:391` | pre-check |
| `deviceCache: Map<string, Map<string,string>>` | `server/src/mqtt/sensorData.ts:598` | busy-check (zelfde logica als `isCoverageActive` in dashboard.ts:734) |
| `deviceSettingsRepo.upsert(sn, key, value)` / `.findBySn(sn)` | `server/src/db/repositories/deviceSettings.ts` | pending-sync vlag |
| `LocalPoint {x,y}` | `server/src/mqtt/mapConverter.ts:61` | puntformaat (meters, charger=0,0) |
| Dashboard route-patroon (geen auth-middleware, `res.status(400).json({error})`) | `server/src/routes/dashboard.ts` | nieuwe endpoints |
| Canvas viewer: `renderMapCanvas(canvas, maps, chargingPose, ghostMaps)` + `canvas.__mapState` | `server/src/routes/adminPage.ts:5416` | editor bouwt hierop |
| App API-client (`request<T>` + Authorization token) | `app/src/services/api.ts:277` | nieuwe methods |
| App SVG viewer (bounds/scale/Y-flip) | `app/src/components/LiveMapView.tsx` | referentie voor MapEditScreen projectie |

**Kritieke regels:**
- Tests: NOOIT `process.env.DB_PATH` in setup files zetten — staat al in `vitest.config.ts` `test.env`. Testfiles horen in `server/src/__tests__/**/*.test.ts`.
- `charging_station.yaml` / `pos.json` worden door dit plan NIET aangeraakt (de bundle-push regelt charging_station.yaml zelf, identiek aan restore).
- Unicoms: read-only, maar moeten WEL mee in elke bundle (metadata-only unicoms = lege CSV, zie portableBackup.ts:218-226) — `createBundleFromDb` doet dit al.
- Commits: GEEN Co-Authored-By trailer.

## File-structuur

```
server/src/maps/editGeometry.ts            NIEUW  pure geometrie (RDP, brush, validatie, hit-test)
server/src/db/database.ts                  WIJZIG +2 tabellen
server/src/db/repositories/mapEdits.ts     NIEUW  drafts + versions repo
server/src/db/repositories/index.ts        WIJZIG barrel export
server/src/services/mapEdit.ts             NIEUW  getGeometry/saveDraft/discard/apply/revert
server/src/routes/dashboard.ts             WIJZIG 5 endpoints /maps/:sn/edit/*
server/src/routes/adminPage.ts             WIJZIG editor-UI (toolbar HTML + inline JS)
server/src/__tests__/maps/editGeometry.test.ts        NIEUW
server/src/__tests__/repositories/mapEdits.test.ts    NIEUW
server/src/__tests__/services/mapEdit.test.ts         NIEUW
app/src/utils/mapEditGeometry.ts           NIEUW  spiegel van editGeometry (zelfde inhoud)
app/src/services/api.ts                    WIJZIG 5 methods
app/src/screens/MapEditScreen.tsx          NIEUW  SVG editor
app/src/navigation/types.ts                WIJZIG MapEdit in MapStackParams
App.tsx                                    WIJZIG MapStack.Screen registratie
app/src/screens/MapScreen.tsx              WIJZIG "Kaart bewerken" knop
app/src/i18n/{en,nl,de,fr}.ts              WIJZIG keys
```

---

### Task 1: DB-tabellen `map_edit_drafts` + `map_versions`

**Files:**
- Modify: `server/src/db/database.ts` (na de `map_calibration` CREATE TABLE, ~regel 234)
- Test: `server/src/__tests__/repositories/mapEdits.test.ts` (eerste test)

- [ ] **Step 1: Schrijf failing test (tabellen bestaan)**

```typescript
// server/src/__tests__/repositories/mapEdits.test.ts
import { describe, it, expect } from 'vitest';
import { db } from '../../db/database.js';

describe('map edit tables', () => {
  it('map_edit_drafts and map_versions exist', () => {
    const names = (db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('map_edit_drafts','map_versions')"
    ).all() as { name: string }[]).map(r => r.name).sort();
    expect(names).toEqual(['map_edit_drafts', 'map_versions']);
  });
});
```

- [ ] **Step 2: Run test, verwacht FAIL**

Run: `cd server && npx vitest run src/__tests__/repositories/mapEdits.test.ts`
Expected: FAIL — `expected [] to deeply equal ['map_edit_drafts','map_versions']`

- [ ] **Step 3: Voeg tabellen toe in database.ts**

In `initDb()`, direct na het `map_calibration` CREATE TABLE blok:

```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS map_edit_drafts (
    mower_sn       TEXT NOT NULL,
    canonical_name TEXT NOT NULL,           -- map0, map0_0_obstacle, ...
    map_id         TEXT,                    -- NULL = nieuw getekend obstacle
    map_type       TEXT NOT NULL,           -- 'work' | 'obstacle'
    parent_map     TEXT,                    -- voor obstacles: 'map0'
    -- JSON array [{x,y}] lokale meters; NULL als deleted=1
    draft_area     TEXT,
    deleted        INTEGER NOT NULL DEFAULT 0,
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (mower_sn, canonical_name)
  );

  CREATE TABLE IF NOT EXISTS map_versions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    mower_sn   TEXT NOT NULL,
    -- JSON snapshot: [{map_id, canonical_name, map_type, map_name, map_area, map_max_min, file_name}]
    snapshot   TEXT NOT NULL,
    label      TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_map_versions_sn ON map_versions(mower_sn, id DESC);
`);
```

- [ ] **Step 4: Run test, verwacht PASS**

Run: `cd server && npx vitest run src/__tests__/repositories/mapEdits.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/db/database.ts server/src/__tests__/repositories/mapEdits.test.ts
git commit -m "feat(map-edit): map_edit_drafts + map_versions tabellen"
```

---

### Task 2: `mapEditsRepo` (drafts CRUD + versions)

**Files:**
- Create: `server/src/db/repositories/mapEdits.ts`
- Modify: `server/src/db/repositories/index.ts`
- Test: `server/src/__tests__/repositories/mapEdits.test.ts`

- [ ] **Step 1: Schrijf failing tests**

Voeg toe aan `mapEdits.test.ts`:

```typescript
import { mapEditsRepo } from '../../db/repositories/index.js';

describe('MapEditsRepository', () => {
  const sn = 'LFIN0001';
  const pts = JSON.stringify([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }]);

  it('upserts and lists drafts', () => {
    mapEditsRepo.upsertDraft({ mower_sn: sn, canonical_name: 'map0', map_id: 'm0', map_type: 'work', parent_map: null, draft_area: pts, deleted: 0 });
    mapEditsRepo.upsertDraft({ mower_sn: sn, canonical_name: 'map0', map_id: 'm0', map_type: 'work', parent_map: null, draft_area: pts, deleted: 0 });
    const drafts = mapEditsRepo.listDrafts(sn);
    expect(drafts.length).toBe(1);
    expect(drafts[0].canonical_name).toBe('map0');
  });

  it('deleteDraft removes one, clearDrafts removes all', () => {
    mapEditsRepo.upsertDraft({ mower_sn: sn, canonical_name: 'map0', map_id: 'm0', map_type: 'work', parent_map: null, draft_area: pts, deleted: 0 });
    mapEditsRepo.upsertDraft({ mower_sn: sn, canonical_name: 'map0_0_obstacle', map_id: null, map_type: 'obstacle', parent_map: 'map0', draft_area: pts, deleted: 0 });
    mapEditsRepo.deleteDraft(sn, 'map0');
    expect(mapEditsRepo.listDrafts(sn).length).toBe(1);
    mapEditsRepo.clearDrafts(sn);
    expect(mapEditsRepo.listDrafts(sn).length).toBe(0);
  });

  it('saves and reads back latest version snapshot', () => {
    mapEditsRepo.saveVersion(sn, '[{"map_id":"a"}]', 'voor-edit');
    mapEditsRepo.saveVersion(sn, '[{"map_id":"b"}]', 'voor-edit-2');
    const latest = mapEditsRepo.latestVersion(sn);
    expect(latest?.snapshot).toBe('[{"map_id":"b"}]');
    mapEditsRepo.deleteVersion(latest!.id);
    expect(mapEditsRepo.latestVersion(sn)?.snapshot).toBe('[{"map_id":"a"}]');
  });

  it('prunes versions beyond keep-count', () => {
    for (let i = 0; i < 12; i++) mapEditsRepo.saveVersion(sn, `[${i}]`, `v${i}`);
    mapEditsRepo.pruneVersions(sn, 10);
    expect(mapEditsRepo.countVersions(sn)).toBe(10);
    expect(mapEditsRepo.latestVersion(sn)?.snapshot).toBe('[11]');
  });
});
```

- [ ] **Step 2: Run, verwacht FAIL** (`mapEditsRepo` bestaat niet)

Run: `cd server && npx vitest run src/__tests__/repositories/mapEdits.test.ts`

- [ ] **Step 3: Implementeer repository**

```typescript
// server/src/db/repositories/mapEdits.ts
import { db } from '../database.js';

export interface MapEditDraftRow {
  mower_sn: string;
  canonical_name: string;
  map_id: string | null;
  map_type: string;            // 'work' | 'obstacle'
  parent_map: string | null;
  draft_area: string | null;   // JSON [{x,y}]; null als deleted
  deleted: number;             // 0 | 1
  updated_at: string;
}

export interface MapVersionRow {
  id: number;
  mower_sn: string;
  snapshot: string;            // JSON array van map-rows
  label: string | null;
  created_at: string;
}

export class MapEditsRepository {
  private _upsert = db.prepare(`
    INSERT INTO map_edit_drafts (mower_sn, canonical_name, map_id, map_type, parent_map, draft_area, deleted, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(mower_sn, canonical_name) DO UPDATE SET
      map_id = excluded.map_id, map_type = excluded.map_type, parent_map = excluded.parent_map,
      draft_area = excluded.draft_area, deleted = excluded.deleted, updated_at = datetime('now')
  `);
  private _list = db.prepare('SELECT * FROM map_edit_drafts WHERE mower_sn = ? ORDER BY canonical_name');
  private _delete = db.prepare('DELETE FROM map_edit_drafts WHERE mower_sn = ? AND canonical_name = ?');
  private _clear = db.prepare('DELETE FROM map_edit_drafts WHERE mower_sn = ?');
  private _saveVersion = db.prepare('INSERT INTO map_versions (mower_sn, snapshot, label) VALUES (?, ?, ?)');
  private _latest = db.prepare('SELECT * FROM map_versions WHERE mower_sn = ? ORDER BY id DESC LIMIT 1');
  private _deleteVersion = db.prepare('DELETE FROM map_versions WHERE id = ?');
  private _count = db.prepare('SELECT COUNT(*) AS n FROM map_versions WHERE mower_sn = ?');
  private _prune = db.prepare(`
    DELETE FROM map_versions WHERE mower_sn = ? AND id NOT IN (
      SELECT id FROM map_versions WHERE mower_sn = ? ORDER BY id DESC LIMIT ?
    )
  `);

  upsertDraft(d: Omit<MapEditDraftRow, 'updated_at'>): void {
    this._upsert.run(d.mower_sn, d.canonical_name, d.map_id, d.map_type, d.parent_map, d.draft_area, d.deleted);
  }
  listDrafts(sn: string): MapEditDraftRow[] { return this._list.all(sn) as MapEditDraftRow[]; }
  deleteDraft(sn: string, canonical: string): void { this._delete.run(sn, canonical); }
  clearDrafts(sn: string): void { this._clear.run(sn); }

  saveVersion(sn: string, snapshot: string, label: string | null): void { this._saveVersion.run(sn, snapshot, label); }
  latestVersion(sn: string): MapVersionRow | undefined { return this._latest.get(sn) as MapVersionRow | undefined; }
  deleteVersion(id: number): void { this._deleteVersion.run(id); }
  countVersions(sn: string): number { return (this._count.get(sn) as { n: number }).n; }
  pruneVersions(sn: string, keep: number): void { this._prune.run(sn, sn, keep); }
}

export const mapEditsRepo = new MapEditsRepository();
```

In `server/src/db/repositories/index.ts` toevoegen (volg bestaand barrel-patroon):

```typescript
export { MapEditsRepository, mapEditsRepo } from './mapEdits.js';
```

- [ ] **Step 4: Run, verwacht PASS**

Run: `cd server && npx vitest run src/__tests__/repositories/mapEdits.test.ts`

- [ ] **Step 5: Commit**

```bash
git add server/src/db/repositories/mapEdits.ts server/src/db/repositories/index.ts server/src/__tests__/repositories/mapEdits.test.ts
git commit -m "feat(map-edit): mapEditsRepo (drafts + versie-snapshots)"
```

---

### Task 3: `editGeometry` — basis (area, pointInPolygon, densify, simplify)

**Files:**
- Create: `server/src/maps/editGeometry.ts`
- Test: `server/src/__tests__/maps/editGeometry.test.ts`

LET OP: deze module is de bron van waarheid en wordt in Task 10 1-op-1 gespiegeld naar `app/src/utils/mapEditGeometry.ts`. Houd hem dependency-vrij (geen imports behalve types).

- [ ] **Step 1: Schrijf failing tests**

```typescript
// server/src/__tests__/maps/editGeometry.test.ts
import { describe, it, expect } from 'vitest';
import {
  polygonArea, pointInPolygon, densifyPolygon, simplifyPolygon,
} from '../../maps/editGeometry.js';

const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

describe('editGeometry basics', () => {
  it('polygonArea: 10x10 vierkant = 100 m²', () => {
    expect(polygonArea(square)).toBeCloseTo(100, 6);
    expect(polygonArea([...square].reverse())).toBeCloseTo(100, 6); // winding-onafhankelijk
  });

  it('pointInPolygon: binnen/buiten', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
  });

  it('densifyPolygon: max afstand tussen opvolgende punten ≤ spacing', () => {
    const dense = densifyPolygon(square, 1.0);
    for (let i = 0; i < dense.length; i++) {
      const a = dense[i], b = dense[(i + 1) % dense.length];
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThanOrEqual(1.0 + 1e-9);
    }
    expect(dense.length).toBeGreaterThanOrEqual(40); // 40m omtrek / 1m
  });

  it('simplifyPolygon: verwijdert collineaire punten, behoudt hoeken', () => {
    const noisy = densifyPolygon(square, 0.5);          // 80 punten op rechte randen
    const simple = simplifyPolygon(noisy, 0.05);
    expect(simple.length).toBeLessThanOrEqual(8);        // ~4 hoekpunten
    expect(polygonArea(simple)).toBeCloseTo(100, 1);     // vorm behouden
  });

  it('simplifyPolygon: laat kleine polygonen (<4 punten) intact', () => {
    const tri = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
    expect(simplifyPolygon(tri, 0.5)).toEqual(tri);
  });
});
```

- [ ] **Step 2: Run, verwacht FAIL** (module bestaat niet)

Run: `cd server && npx vitest run src/__tests__/maps/editGeometry.test.ts`

- [ ] **Step 3: Implementeer**

```typescript
// server/src/maps/editGeometry.ts
/**
 * Pure geometrie voor map/obstacle bewerking. Bron van waarheid — wordt
 * 1-op-1 gespiegeld naar app/src/utils/mapEditGeometry.ts (geen imports!).
 * Alle afstanden in meters, lokale frame (charger = 0,0).
 */
export interface XY { x: number; y: number }

/** Shoelace-oppervlak, altijd positief (winding-onafhankelijk). */
export function polygonArea(pts: XY[]): number {
  if (pts.length < 3) return 0;
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    acc += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(acc) / 2;
}

/** Ray-casting point-in-polygon (randpunten tellen als binnen genoeg voor onze checks). */
export function pointInPolygon(p: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y)
        && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Voeg punten in zodat geen segment (incl. sluitend segment) langer is dan maxSpacing. */
export function densifyPolygon(pts: XY[], maxSpacing: number): XY[] {
  if (pts.length < 3) return pts.slice();
  const out: XY[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    out.push(a);
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.ceil(d / maxSpacing) - 1;
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function perpDist(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

function rdp(pts: XY[], eps: number): XY[] {
  if (pts.length < 3) return pts.slice();
  let maxD = 0, idx = 0;
  const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], a, b);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= eps) return [a, b];
  const left = rdp(pts.slice(0, idx + 1), eps);
  const right = rdp(pts.slice(idx), eps);
  return left.slice(0, -1).concat(right);
}

/**
 * Ramer-Douglas-Peucker voor GESLOTEN polygon: splits op het verste puntenpaar
 * zodat het sluitsegment correct behandeld wordt.
 */
export function simplifyPolygon(pts: XY[], tolerance: number): XY[] {
  if (pts.length < 4) return pts.slice();
  // Verste punt van pts[0] als tweede anker
  let far = 1, maxD = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y);
    if (d > maxD) { maxD = d; far = i; }
  }
  const half1 = rdp(pts.slice(0, far + 1), tolerance);
  const half2 = rdp(pts.slice(far).concat([pts[0]]), tolerance);
  const out = half1.slice(0, -1).concat(half2.slice(0, -1));
  return out.length >= 3 ? out : pts.slice();
}
```

- [ ] **Step 4: Run, verwacht PASS**

Run: `cd server && npx vitest run src/__tests__/maps/editGeometry.test.ts`

- [ ] **Step 5: Commit**

```bash
git add server/src/maps/editGeometry.ts server/src/__tests__/maps/editGeometry.test.ts
git commit -m "feat(map-edit): editGeometry basis (area, PIP, densify, RDP-simplify)"
```

---

### Task 4: `editGeometry` — validatie (self-intersect, containment, displacement, validateMapSet)

**Files:**
- Modify: `server/src/maps/editGeometry.ts`
- Test: `server/src/__tests__/maps/editGeometry.test.ts`

- [ ] **Step 1: Schrijf failing tests**

Voeg toe aan `editGeometry.test.ts`:

```typescript
import {
  selfIntersects, polygonContains, maxDisplacement, validateMapSet,
} from '../../maps/editGeometry.js';

describe('editGeometry validatie', () => {
  it('selfIntersects: vlinder-polygon = true, vierkant = false', () => {
    const bowtie = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    expect(selfIntersects(bowtie)).toBe(true);
    expect(selfIntersects(square)).toBe(false);
  });

  it('polygonContains: obstacle binnen work = true, half erbuiten = false', () => {
    const inner = [{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }];
    const sticking = [{ x: 8, y: 8 }, { x: 12, y: 8 }, { x: 12, y: 12 }, { x: 8, y: 12 }];
    expect(polygonContains(square, inner)).toBe(true);
    expect(polygonContains(square, sticking)).toBe(false);
  });

  it('polygonContains: vangt edge-crossing met alle vertices binnen', () => {
    // Beide vertices binnen, maar segment steekt door een inham → edges kruisen
    const cShape = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 2, y: 4 },
                    { x: 2, y: 6 }, { x: 10, y: 6 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const crossing = [{ x: 1, y: 1 }, { x: 1, y: 9 }, { x: 0.5, y: 9 }, { x: 0.5, y: 1 }];
    expect(polygonContains(cShape, crossing)).toBe(true); // links van de inham — ok
    const through = [{ x: 1, y: 3 }, { x: 9, y: 3 }, { x: 9, y: 7 }, { x: 1, y: 7 }];
    expect(polygonContains(cShape, through)).toBe(false); // dekt de inham (y=4..6 strip buiten cShape)
  });

  it('maxDisplacement: meet grootste verschuiving t.o.v. origineel', () => {
    const shifted = square.map(p => (p.x === 10 ? { x: 10.8, y: p.y } : p));
    const d = maxDisplacement(shifted, square);
    expect(d).toBeGreaterThan(0.7);
    expect(d).toBeLessThan(0.9);
    expect(maxDisplacement(square, square)).toBeCloseTo(0, 6);
  });

  it('validateMapSet: goede set = ok, fouten worden per canonical gemeld', () => {
    const ok = validateMapSet({
      work: [{ canonical: 'map0', points: square }],
      obstacles: [{ canonical: 'map0_0_obstacle', parentMap: 'map0',
        points: [{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }] }],
    }, new Map());
    expect(ok.ok).toBe(true);
    expect(ok.errors).toEqual([]);

    const bad = validateMapSet({
      work: [{ canonical: 'map0', points: square }],
      obstacles: [
        { canonical: 'map0_0_obstacle', parentMap: 'map0',
          points: [{ x: 9, y: 9 }, { x: 12, y: 9 }, { x: 12, y: 12 }, { x: 9, y: 12 }] }, // buiten work
        { canonical: 'map0_1_obstacle', parentMap: 'map0',
          points: [{ x: 2, y: 2 }, { x: 2.3, y: 2 }, { x: 2.3, y: 2.3 }] },              // < 0.5 m²
      ],
    }, new Map());
    expect(bad.ok).toBe(false);
    expect(bad.errors.some(e => e.canonical === 'map0_0_obstacle' && e.code === 'outside_work')).toBe(true);
    expect(bad.errors.some(e => e.canonical === 'map0_1_obstacle' && e.code === 'too_small')).toBe(true);
  });

  it('validateMapSet: >1m verschuiving = warning, geen error', () => {
    const moved = square.map(p => (p.x === 10 ? { x: 11.5, y: p.y } : p));
    const res = validateMapSet(
      { work: [{ canonical: 'map0', points: moved }], obstacles: [] },
      new Map([['map0', square]]),
    );
    expect(res.ok).toBe(true);
    expect(res.warnings.some(w => w.canonical === 'map0' && w.code === 'large_displacement')).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verwacht FAIL**

Run: `cd server && npx vitest run src/__tests__/maps/editGeometry.test.ts`

- [ ] **Step 3: Implementeer in editGeometry.ts**

```typescript
function segIntersects(a: XY, b: XY, c: XY, d: XY): boolean {
  const cross = (o: XY, p: XY, q: XY) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/** True als niet-aangrenzende randen elkaar kruisen (O(n²), prima voor ≤ ~500 punten). */
export function selfIntersects(pts: XY[]): boolean {
  const n = pts.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // aangrenzend via sluiting
      if (segIntersects(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** inner volledig binnen outer: alle vertices binnen ÉN geen rand-kruisingen. */
export function polygonContains(outer: XY[], inner: XY[]): boolean {
  for (const p of inner) if (!pointInPolygon(p, outer)) return false;
  const n = outer.length, m = inner.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (segIntersects(outer[i], outer[(i + 1) % n], inner[j], inner[(j + 1) % m])) return false;
    }
  }
  return true;
}

function distToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Max over edited-punten van min-afstand tot de originele polygon-rand (meters). */
export function maxDisplacement(edited: XY[], original: XY[]): number {
  if (original.length < 2) return 0;
  let worst = 0;
  for (const p of edited) {
    let best = Infinity;
    for (let i = 0; i < original.length; i++) {
      best = Math.min(best, distToSegment(p, original[i], original[(i + 1) % original.length]));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

export interface MapSetInput {
  work: { canonical: string; points: XY[] }[];
  obstacles: { canonical: string; parentMap: string; points: XY[] }[];
}
export interface ValidationIssue { canonical: string; code: string; message: string }
export interface ValidationResult { ok: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[] }

export const MIN_OBSTACLE_AREA_M2 = 0.5;
export const MIN_WORK_AREA_M2 = 5;
export const DISPLACEMENT_WARN_M = 1.0;

/**
 * Valideer de volledige (merged) set. `originals` = canonical → originele punten
 * (alleen voor displacement-warning; lege Map = geen warning-check).
 */
export function validateMapSet(input: MapSetInput, originals: Map<string, XY[]>): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const checkCommon = (canonical: string, pts: XY[], minArea: number) => {
    if (pts.length < 3) { errors.push({ canonical, code: 'too_few_points', message: 'Minimaal 3 punten nodig' }); return false; }
    if (selfIntersects(pts)) { errors.push({ canonical, code: 'self_intersect', message: 'Lijn kruist zichzelf' }); return false; }
    if (polygonArea(pts) < minArea) { errors.push({ canonical, code: 'too_small', message: `Oppervlak kleiner dan ${minArea} m²` }); return false; }
    const orig = originals.get(canonical);
    if (orig && maxDisplacement(pts, orig) > DISPLACEMENT_WARN_M) {
      warnings.push({ canonical, code: 'large_displacement', message: `Verschuiving groter dan ${DISPLACEMENT_WARN_M} m — buiten ooit-gescand gebied is nav-gedrag onbewezen` });
    }
    return true;
  };
  for (const w of input.work) checkCommon(w.canonical, w.points, MIN_WORK_AREA_M2);
  for (const o of input.obstacles) {
    if (!checkCommon(o.canonical, o.points, MIN_OBSTACLE_AREA_M2)) continue;
    const parent = input.work.find(w => w.canonical === o.parentMap);
    if (parent && !polygonContains(parent.points, o.points)) {
      errors.push({ canonical: o.canonical, code: 'outside_work', message: `Obstacle steekt buiten ${o.parentMap}` });
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}
```

- [ ] **Step 4: Run, verwacht PASS**

Run: `cd server && npx vitest run src/__tests__/maps/editGeometry.test.ts`

- [ ] **Step 5: Commit**

```bash
git add server/src/maps/editGeometry.ts server/src/__tests__/maps/editGeometry.test.ts
git commit -m "feat(map-edit): editGeometry validatie (self-intersect, containment, validateMapSet)"
```

---

### Task 5: `editGeometry` — brush + hit-testing

**Files:**
- Modify: `server/src/maps/editGeometry.ts`
- Test: `server/src/__tests__/maps/editGeometry.test.ts`

- [ ] **Step 1: Schrijf failing tests**

```typescript
import { applyBrush, hitTestVertex, hitTestEdge } from '../../maps/editGeometry.js';

describe('editGeometry brush + hit-test', () => {
  it('applyBrush: verplaatst alleen punten binnen radius, met falloff', () => {
    const dense = densifyPolygon(square, 0.5);
    const anchor = { x: 5, y: 0 };                       // midden onderrand
    const out = applyBrush(dense, anchor, { x: 0, y: 1 }, 2.0);
    const moved = out.filter((p, i) => Math.abs(p.y - dense[i].y) > 1e-9);
    expect(moved.length).toBeGreaterThan(0);
    // punt exact op anchor krijgt volle delta
    const center = dense.findIndex(p => Math.abs(p.x - 5) < 0.01 && Math.abs(p.y) < 0.01);
    expect(out[center].y).toBeCloseTo(1, 2);
    // punt buiten radius beweegt niet
    const farIdx = dense.findIndex(p => Math.abs(p.x - 5) > 3 && Math.abs(p.y) < 0.01);
    expect(out[farIdx].y).toBeCloseTo(0, 9);
    // falloff: halverwege radius beweegt minder dan vol
    const halfway = dense.findIndex(p => Math.abs(p.x - 6) < 0.01 && Math.abs(p.y) < 0.01);
    expect(out[halfway].y).toBeGreaterThan(0.1);
    expect(out[halfway].y).toBeLessThan(0.95);
  });

  it('hitTestVertex: vindt dichtstbijzijnde vertex binnen tolerantie', () => {
    expect(hitTestVertex(square, { x: 10.2, y: -0.1 }, 0.5)).toBe(1);
    expect(hitTestVertex(square, { x: 5, y: 5 }, 0.5)).toBe(-1);
  });

  it('hitTestEdge: geeft invoeg-index op het geraakte segment', () => {
    const hit = hitTestEdge(square, { x: 5, y: 0.1 }, 0.5);
    expect(hit).toEqual({ insertIndex: 1, point: { x: 5, y: 0 } });
    expect(hitTestEdge(square, { x: 5, y: 5 }, 0.5)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verwacht FAIL**

Run: `cd server && npx vitest run src/__tests__/maps/editGeometry.test.ts`

- [ ] **Step 3: Implementeer**

```typescript
/**
 * Duw/trek-brush: verplaats punten binnen `radius` van `anchor` met `delta`,
 * cosinus-falloff naar de rand. Densify VOORAF (clients doen densifyPolygon
 * met spacing radius/4) zodat er genoeg punten zijn om te verplaatsen.
 */
export function applyBrush(pts: XY[], anchor: XY, delta: XY, radius: number): XY[] {
  return pts.map(p => {
    const d = Math.hypot(p.x - anchor.x, p.y - anchor.y);
    if (d >= radius) return p;
    const f = 0.5 * (1 + Math.cos(Math.PI * d / radius));
    return { x: p.x + delta.x * f, y: p.y + delta.y * f };
  });
}

/** Index van dichtstbijzijnde vertex binnen tol, anders -1. */
export function hitTestVertex(pts: XY[], p: XY, tol: number): number {
  let best = -1, bestD = tol;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - p.x, pts[i].y - p.y);
    if (d <= bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Dichtstbijzijnde rand binnen tol: insertIndex (nieuwe punt-index) + projectiepunt. */
export function hitTestEdge(pts: XY[], p: XY, tol: number): { insertIndex: number; point: XY } | null {
  let best: { insertIndex: number; point: XY } | null = null;
  let bestD = tol;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) continue;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d <= bestD) { bestD = d; best = { insertIndex: i + 1, point: q }; }
  }
  return best;
}
```

- [ ] **Step 4: Run, verwacht PASS** (hele geometry suite)

Run: `cd server && npx vitest run src/__tests__/maps/editGeometry.test.ts`

- [ ] **Step 5: Commit**

```bash
git add server/src/maps/editGeometry.ts server/src/__tests__/maps/editGeometry.test.ts
git commit -m "feat(map-edit): editGeometry brush + hit-testing"
```

---

### Task 6: `mapEdit` service — getGeometry / saveDraft / discardDrafts

**Files:**
- Create: `server/src/services/mapEdit.ts`
- Test: `server/src/__tests__/services/mapEdit.test.ts`

- [ ] **Step 1: Schrijf failing tests**

```typescript
// server/src/__tests__/services/mapEdit.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de maaier-kant VOOR de service-import (apply/revert gebruiken dit in Task 7)
vi.mock('../../services/portableBackup.js', () => ({
  createBundleFromDb: vi.fn(async () => ({ filename: 'test.novabotmap', bytes: 1, createdAt: 0, reason: 'map_edit' })),
}));
vi.mock('../../mqtt/mapSync.js', () => ({
  pushMapToMowerVerbatim: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../mqtt/broker.js', () => ({
  isDeviceOnline: vi.fn(() => true),
}));

import { mapRepo, mapEditsRepo } from '../../db/repositories/index.js';
import { getEditGeometry, saveDraft, discardDrafts } from '../../services/mapEdit.js';

const sn = 'LFIN0001';
const square = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];
const obst = [{ x: 5, y: 5 }, { x: 8, y: 5 }, { x: 8, y: 8 }, { x: 5, y: 8 }];

function seedMaps() {
  mapRepo.create({ map_id: 'w0', mower_sn: sn, map_name: 'Voortuin', map_type: 'work',
    file_name: 'map0_work.csv', map_area: JSON.stringify(square) });
  mapRepo.create({ map_id: 'o0', mower_sn: sn, map_type: 'obstacle',
    file_name: 'map0_0_obstacle.csv', map_area: JSON.stringify(obst) });
}

describe('mapEdit service: geometry + drafts', () => {
  beforeEach(seedMaps);

  it('getEditGeometry: levert maps met canonical, type en punten', () => {
    const g = getEditGeometry(sn);
    expect(g.maps.length).toBe(2);
    const work = g.maps.find(m => m.canonical === 'map0')!;
    expect(work.mapType).toBe('work');
    expect(work.points.length).toBeGreaterThanOrEqual(3);
    expect(work.draft).toBeNull();
    expect(g.hasVersions).toBe(false);
    expect(g.pendingSync).toBe(false);
  });

  it('saveDraft: bestaande polygon → draft opgeslagen en zichtbaar in geometry', () => {
    const moved = square.map(p => (p.x === 20 ? { x: 20.5, y: p.y } : p));
    const res = saveDraft(sn, { canonical: 'map0', points: moved });
    expect(res.ok).toBe(true);
    const g = getEditGeometry(sn);
    expect(g.maps.find(m => m.canonical === 'map0')!.draft?.points[1].x).toBeCloseTo(20.5, 6);
  });

  it('saveDraft: nieuw obstacle krijgt volgend vrij slot', () => {
    const res = saveDraft(sn, { mapType: 'obstacle', parentMap: 'map0',
      points: [{ x: 10, y: 10 }, { x: 12, y: 10 }, { x: 12, y: 12 }, { x: 10, y: 12 }] });
    expect(res.ok).toBe(true);
    expect(res.canonical).toBe('map0_1_obstacle');     // map0_0_obstacle bestaat al
  });

  it('saveDraft: delete-markering voor obstacle', () => {
    const res = saveDraft(sn, { canonical: 'map0_0_obstacle', deleted: true });
    expect(res.ok).toBe(true);
    const g = getEditGeometry(sn);
    expect(g.maps.find(m => m.canonical === 'map0_0_obstacle')!.draft?.deleted).toBe(true);
  });

  it('saveDraft: weigert delete van work-map en kapotte polygon', () => {
    expect(saveDraft(sn, { canonical: 'map0', deleted: true }).ok).toBe(false);
    expect(saveDraft(sn, { canonical: 'map0', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }).ok).toBe(false);
  });

  it('discardDrafts: alles weg', () => {
    saveDraft(sn, { canonical: 'map0_0_obstacle', deleted: true });
    discardDrafts(sn);
    expect(mapEditsRepo.listDrafts(sn).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run, verwacht FAIL**

Run: `cd server && npx vitest run src/__tests__/services/mapEdit.test.ts`

- [ ] **Step 3: Implementeer service (deel 1)**

```typescript
// server/src/services/mapEdit.ts
/**
 * Map & obstacle bewerking: drafts, validatie, apply naar maaier, revert.
 * Spec: docs/superpowers/specs/2026-06-10-map-obstacle-editing-design.md
 */
import { mapRepo, mapEditsRepo, deviceSettingsRepo } from '../db/repositories/index.js';
import type { MapRow } from '../db/repositories/maps.js';
import {
  simplifyPolygon, validateMapSet, type XY, type ValidationResult,
} from '../maps/editGeometry.js';

const TAG = '[MAP-EDIT]';
const SIMPLIFY_TOL_M = 0.05;
const PENDING_KEY = 'map_edit_pending_sync';
const VERSIONS_KEEP = 10;

export interface EditMapEntry {
  mapId: string;
  canonical: string;
  mapType: 'work' | 'obstacle' | 'unicom';
  alias: string | null;
  parentMap: string | null;
  points: XY[];                                   // vereenvoudigd, lokale meters
  draft: { points: XY[]; deleted: boolean; isNew: boolean } | null;
}
export interface EditGeometry {
  maps: EditMapEntry[];
  pendingSync: boolean;
  hasVersions: boolean;
}

function parentMapOf(canonical: string): string | null {
  const m = canonical.match(/^(map\d+)_\d+_obstacle$/);
  return m ? m[1] : null;
}

function parseArea(row: Pick<MapRow, 'map_area'>): XY[] {
  if (!row.map_area) return [];
  try { return JSON.parse(row.map_area) as XY[]; } catch { return []; }
}

function isPendingSync(sn: string): boolean {
  return deviceSettingsRepo.findBySn(sn).some(r => r.key === PENDING_KEY && r.value === '1');
}

export function getEditGeometry(sn: string): EditGeometry {
  const rows = mapRepo.findByMowerSn(sn);
  const drafts = new Map(mapEditsRepo.listDrafts(sn).map(d => [d.canonical_name, d]));
  const maps: EditMapEntry[] = [];

  for (const row of rows) {
    const canonical = row.canonical_name;
    if (!canonical) continue;                      // niet-canonieke rijen (zips e.d.) niet editbaar
    const pts = parseArea(row);
    if (row.map_type !== 'unicom' && pts.length < 3) continue;
    const d = drafts.get(canonical);
    drafts.delete(canonical);
    maps.push({
      mapId: row.map_id,
      canonical,
      mapType: (row.map_type as EditMapEntry['mapType']) ?? 'work',
      alias: row.map_name,
      parentMap: parentMapOf(canonical),
      points: row.map_type === 'unicom' ? pts : simplifyPolygon(pts, SIMPLIFY_TOL_M),
      draft: d ? { points: d.draft_area ? (JSON.parse(d.draft_area) as XY[]) : [], deleted: d.deleted === 1, isNew: !d.map_id } : null,
    });
  }
  // Overgebleven drafts = nieuw getekende obstacles (geen maps-rij)
  for (const d of drafts.values()) {
    maps.push({
      mapId: d.map_id ?? '',
      canonical: d.canonical_name,
      mapType: 'obstacle',
      alias: null,
      parentMap: d.parent_map,
      points: [],
      draft: { points: d.draft_area ? (JSON.parse(d.draft_area) as XY[]) : [], deleted: d.deleted === 1, isNew: true },
    });
  }
  return { maps, pendingSync: isPendingSync(sn), hasVersions: !!mapEditsRepo.latestVersion(sn) };
}

export interface SaveDraftInput {
  canonical?: string;
  mapType?: 'work' | 'obstacle';
  parentMap?: string;          // verplicht bij nieuw obstacle
  points?: XY[];
  deleted?: boolean;
}
export interface SaveDraftResult { ok: boolean; canonical?: string; error?: string }

export function saveDraft(sn: string, input: SaveDraftInput): SaveDraftResult {
  // Bestaande polygon of nieuw obstacle?
  if (input.canonical) {
    const row = mapRepo.findBySnAndCanonical(sn, input.canonical);
    if (!row) return { ok: false, error: `Onbekende kaart ${input.canonical}` };
    if (row.map_type === 'unicom') return { ok: false, error: 'Unicom-paden zijn niet bewerkbaar' };
    if (input.deleted) {
      if (row.map_type !== 'obstacle') return { ok: false, error: 'Alleen obstacles kunnen verwijderd worden' };
      mapEditsRepo.upsertDraft({ mower_sn: sn, canonical_name: input.canonical, map_id: row.map_id,
        map_type: 'obstacle', parent_map: parentMapOf(input.canonical), draft_area: null, deleted: 1 });
      return { ok: true, canonical: input.canonical };
    }
    if (!input.points || input.points.length < 3) return { ok: false, error: 'Minimaal 3 punten nodig' };
    mapEditsRepo.upsertDraft({ mower_sn: sn, canonical_name: input.canonical, map_id: row.map_id,
      map_type: row.map_type as 'work' | 'obstacle', parent_map: parentMapOf(input.canonical),
      draft_area: JSON.stringify(input.points), deleted: 0 });
    return { ok: true, canonical: input.canonical };
  }

  // Nieuw obstacle
  if (input.mapType !== 'obstacle' || !input.parentMap) {
    return { ok: false, error: 'Nieuw tekenen kan alleen als obstacle met parentMap' };
  }
  if (!input.points || input.points.length < 3) return { ok: false, error: 'Minimaal 3 punten nodig' };
  // Volgend vrij slot: bestaande maps + drafts meetellen
  const taken = new Set<string>([
    ...mapRepo.findByMowerSn(sn).map(r => r.canonical_name ?? ''),
    ...mapEditsRepo.listDrafts(sn).map(d => d.canonical_name),
  ]);
  let idx = 0;
  while (taken.has(`${input.parentMap}_${idx}_obstacle`)) idx++;
  const canonical = `${input.parentMap}_${idx}_obstacle`;
  mapEditsRepo.upsertDraft({ mower_sn: sn, canonical_name: canonical, map_id: null,
    map_type: 'obstacle', parent_map: input.parentMap,
    draft_area: JSON.stringify(input.points), deleted: 0 });
  return { ok: true, canonical };
}

export function discardDrafts(sn: string): void {
  mapEditsRepo.clearDrafts(sn);
}
```

LET OP: `deviceSettingsRepo` import faalt als die niet in de barrel zit — check `server/src/db/repositories/index.ts` en voeg zo nodig de export toe.

- [ ] **Step 4: Run, verwacht PASS**

Run: `cd server && npx vitest run src/__tests__/services/mapEdit.test.ts`

- [ ] **Step 5: Commit**

```bash
git add server/src/services/mapEdit.ts server/src/__tests__/services/mapEdit.test.ts
git commit -m "feat(map-edit): mapEdit service — geometry + drafts"
```

---

### Task 7: `mapEdit` service — apply / revert / pending-sync

**Files:**
- Modify: `server/src/services/mapEdit.ts`
- Test: `server/src/__tests__/services/mapEdit.test.ts`

- [ ] **Step 1: Schrijf failing tests**

Voeg toe aan `mapEdit.test.ts` (de mocks bovenaan staan er al; importeer extra symbolen):

```typescript
import { applyEdits, revertEdits } from '../../services/mapEdit.js';
import { createBundleFromDb } from '../../services/portableBackup.js';
import { pushMapToMowerVerbatim } from '../../mqtt/mapSync.js';
import { isDeviceOnline } from '../../mqtt/broker.js';
import { deviceCache } from '../../mqtt/sensorData.js';

describe('mapEdit service: apply + revert', () => {
  beforeEach(() => {
    seedMaps();
    vi.mocked(isDeviceOnline).mockReturnValue(true);
    vi.mocked(pushMapToMowerVerbatim).mockResolvedValue({ ok: true });
    deviceCache.delete(sn);
  });

  it('apply: happy path — DB bijgewerkt, snapshot gemaakt, push gedaan, drafts weg', async () => {
    const moved = square.map(p => (p.x === 20 ? { x: 20.5, y: p.y } : p));
    saveDraft(sn, { canonical: 'map0', points: moved });
    const res = await applyEdits(sn);
    expect(res.ok).toBe(true);
    expect(JSON.parse(mapRepo.findBySnAndCanonical(sn, 'map0')!.map_area!)[1].x).toBeCloseTo(20.5, 6);
    expect(mapEditsRepo.latestVersion(sn)).toBeTruthy();
    expect(mapEditsRepo.listDrafts(sn).length).toBe(0);
    expect(vi.mocked(createBundleFromDb)).toHaveBeenCalledWith(sn, 'map_edit');
    expect(vi.mocked(pushMapToMowerVerbatim)).toHaveBeenCalledWith(sn, 'test.novabotmap');
  });

  it('apply: nieuw obstacle → maps-rij aangemaakt; delete → rij weg', async () => {
    saveDraft(sn, { mapType: 'obstacle', parentMap: 'map0',
      points: [{ x: 10, y: 10 }, { x: 12, y: 10 }, { x: 12, y: 12 }, { x: 10, y: 12 }] });
    saveDraft(sn, { canonical: 'map0_0_obstacle', deleted: true });
    const res = await applyEdits(sn);
    expect(res.ok).toBe(true);
    expect(mapRepo.findBySnAndCanonical(sn, 'map0_1_obstacle')).toBeTruthy();
    expect(mapRepo.findBySnAndCanonical(sn, 'map0_0_obstacle')).toBeUndefined();
  });

  it('apply: validatiefout → 422-shape, niets gemuteerd', async () => {
    saveDraft(sn, { canonical: 'map0_0_obstacle',
      points: [{ x: 18, y: 18 }, { x: 25, y: 18 }, { x: 25, y: 25 }, { x: 18, y: 25 }] }); // buiten work
    const res = await applyEdits(sn);
    expect(res.ok).toBe(false);
    expect(res.validation?.errors.some(e => e.code === 'outside_work')).toBe(true);
    expect(mapEditsRepo.listDrafts(sn).length).toBe(1);          // drafts blijven
    expect(vi.mocked(pushMapToMowerVerbatim)).not.toHaveBeenCalled();
  });

  it('apply: maaier offline → geweigerd zonder mutatie', async () => {
    vi.mocked(isDeviceOnline).mockReturnValue(false);
    saveDraft(sn, { canonical: 'map0_0_obstacle', deleted: true });
    const res = await applyEdits(sn);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('offline');
  });

  it('apply: maaier maait → geweigerd', async () => {
    deviceCache.set(sn, new Map([['msg', 'Mode:COVERAGE Work:RUNNING']]));
    saveDraft(sn, { canonical: 'map0_0_obstacle', deleted: true });
    const res = await applyEdits(sn);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('busy');
  });

  it('apply: push faalt → pendingSync gezet; retry zonder drafts pusht opnieuw', async () => {
    vi.mocked(pushMapToMowerVerbatim).mockResolvedValueOnce({ ok: false, offline: true });
    saveDraft(sn, { canonical: 'map0_0_obstacle', deleted: true });
    const r1 = await applyEdits(sn);
    expect(r1.ok).toBe(false);
    expect(r1.reason).toBe('push_failed');
    expect(getEditGeometry(sn).pendingSync).toBe(true);
    // retry: geen drafts, wel pendingSync → bundle+push opnieuw
    const r2 = await applyEdits(sn);
    expect(r2.ok).toBe(true);
    expect(getEditGeometry(sn).pendingSync).toBe(false);
  });

  it('revert: zet snapshot terug en pusht', async () => {
    const orig = mapRepo.findBySnAndCanonical(sn, 'map0')!.map_area;
    saveDraft(sn, { canonical: 'map0', points: square.map(p => (p.x === 20 ? { x: 22, y: p.y } : p)) });
    await applyEdits(sn);
    const res = await revertEdits(sn);
    expect(res.ok).toBe(true);
    expect(mapRepo.findBySnAndCanonical(sn, 'map0')!.map_area).toBe(orig);
    expect(mapEditsRepo.latestVersion(sn)).toBeUndefined();      // versie verbruikt
  });
});
```

- [ ] **Step 2: Run, verwacht FAIL** (`applyEdits` bestaat niet)

- [ ] **Step 3: Implementeer apply/revert in mapEdit.ts**

```typescript
import { deviceCache } from '../mqtt/sensorData.js';
import { isDeviceOnline } from '../mqtt/broker.js';
import { db } from '../db/database.js';

// Zelfde logica als isCoverageActive in dashboard.ts:734 (daar private; hier
// gedupliceerd om een route↔service import-cyclus te vermijden).
function isMowerBusy(sn: string): boolean {
  const sensors = deviceCache.get(sn);
  if (!sensors) return false;
  const msg = sensors.get('msg') ?? '';
  if (msg.includes('Work:RUNNING') || msg.includes('Work:COVERING')
      || msg.includes('Work:NAVIGATING') || msg.includes('Work:MOVING')) return true;
  if (msg.includes('Mode:COVERAGE') && !msg.includes('Work:STANDBY') && !msg.includes('Work:IDLE')) return true;
  return false;
}

export interface ApplyResult {
  ok: boolean;
  reason?: 'offline' | 'busy' | 'locked' | 'no_changes' | 'validation' | 'bundle_failed' | 'push_failed' | 'no_version';
  validation?: ValidationResult;
  applied?: { canonical: string; action: 'updated' | 'created' | 'deleted' }[];
}

const applyLocks = new Set<string>();

interface SnapshotRow {
  map_id: string; canonical_name: string | null; map_type: string;
  map_name: string | null; map_area: string | null; map_max_min: string | null; file_name: string | null;
}

function snapshotMaps(sn: string): string {
  const rows = mapRepo.findByMowerSn(sn).map((r): SnapshotRow => ({
    map_id: r.map_id, canonical_name: r.canonical_name, map_type: r.map_type,
    map_name: r.map_name, map_area: r.map_area, map_max_min: r.map_max_min, file_name: r.file_name,
  }));
  return JSON.stringify(rows);
}

function boundsOf(pts: XY[]): string {
  return JSON.stringify({
    minX: Math.min(...pts.map(p => p.x)), maxX: Math.max(...pts.map(p => p.x)),
    minY: Math.min(...pts.map(p => p.y)), maxY: Math.max(...pts.map(p => p.y)),
  });
}

async function bundleAndPush(sn: string): Promise<ApplyResult> {
  const { createBundleFromDb } = await import('./portableBackup.js');
  const { pushMapToMowerVerbatim } = await import('../mqtt/mapSync.js');
  const bundle = await createBundleFromDb(sn, 'map_edit');
  if (!bundle) {
    deviceSettingsRepo.upsert(sn, PENDING_KEY, '1');
    return { ok: false, reason: 'bundle_failed' };
  }
  const push = await pushMapToMowerVerbatim(sn, bundle.filename);
  if (!push.ok) {
    deviceSettingsRepo.upsert(sn, PENDING_KEY, '1');
    console.warn(`${TAG} ${sn}: push mislukt (${JSON.stringify(push)}) — pending sync gezet`);
    return { ok: false, reason: 'push_failed' };
  }
  deviceSettingsRepo.upsert(sn, PENDING_KEY, '0');
  return { ok: true };
}

export async function applyEdits(sn: string): Promise<ApplyResult> {
  if (applyLocks.has(sn)) return { ok: false, reason: 'locked' };
  applyLocks.add(sn);
  try {
    if (!isDeviceOnline(sn)) return { ok: false, reason: 'offline' };
    if (isMowerBusy(sn)) return { ok: false, reason: 'busy' };

    const drafts = mapEditsRepo.listDrafts(sn);
    if (drafts.length === 0) {
      // Geen edits — maar een eerdere apply kan zijn blijven hangen: retry de push.
      if (isPendingSync(sn)) return bundleAndPush(sn);
      return { ok: false, reason: 'no_changes' };
    }

    // Merged state opbouwen: huidige maps + drafts erover
    const rows = mapRepo.findByMowerSn(sn);
    const byCanonical = new Map(rows.filter(r => r.canonical_name).map(r => [r.canonical_name as string, r]));
    const originals = new Map<string, XY[]>();
    const work: { canonical: string; points: XY[] }[] = [];
    const obstacles: { canonical: string; parentMap: string; points: XY[] }[] = [];
    for (const row of rows) {
      if (!row.canonical_name || !row.map_area) continue;
      originals.set(row.canonical_name, parseArea(row));
    }
    const draftMap = new Map(drafts.map(d => [d.canonical_name, d]));
    const allCanonicals = new Set([...byCanonical.keys(), ...draftMap.keys()]);
    for (const canonical of allCanonicals) {
      const d = draftMap.get(canonical);
      const row = byCanonical.get(canonical);
      if (d?.deleted) continue;                          // verwijderd → niet valideren
      const pts: XY[] = d?.draft_area ? JSON.parse(d.draft_area) : (row ? parseArea(row) : []);
      const type = d?.map_type ?? row?.map_type;
      if (type === 'work' && pts.length >= 3) work.push({ canonical, points: pts });
      else if (type === 'obstacle' && pts.length >= 3) {
        obstacles.push({ canonical, parentMap: d?.parent_map ?? parentMapOf(canonical) ?? 'map0', points: pts });
      }
    }
    const validation = validateMapSet({ work, obstacles }, originals);
    if (!validation.ok) return { ok: false, reason: 'validation', validation };

    // Snapshot + mutaties in één transactie
    const applied: NonNullable<ApplyResult['applied']> = [];
    db.transaction(() => {
      mapEditsRepo.saveVersion(sn, snapshotMaps(sn), `voor apply ${new Date().toISOString()}`);
      mapEditsRepo.pruneVersions(sn, VERSIONS_KEEP);
      for (const d of drafts) {
        const row = byCanonical.get(d.canonical_name);
        if (d.deleted) {
          if (row) { mapRepo.deleteByIdAndMower(row.map_id, sn); applied.push({ canonical: d.canonical_name, action: 'deleted' }); }
        } else if (row) {
          const pts = JSON.parse(d.draft_area as string) as XY[];
          mapRepo.updateAreaAndBoundsByIdAndMower(row.map_id, sn, JSON.stringify(pts), boundsOf(pts));
          applied.push({ canonical: d.canonical_name, action: 'updated' });
        } else {
          const pts = JSON.parse(d.draft_area as string) as XY[];
          mapRepo.create({
            map_id: `edit_${d.canonical_name}_${Date.now()}`, mower_sn: sn,
            map_type: 'obstacle', file_name: `${d.canonical_name}.csv`,
            map_area: JSON.stringify(pts), map_max_min: boundsOf(pts),
          });
          applied.push({ canonical: d.canonical_name, action: 'created' });
        }
      }
      mapEditsRepo.clearDrafts(sn);
    })();

    const pushRes = await bundleAndPush(sn);
    return { ...pushRes, validation, applied };
  } finally {
    applyLocks.delete(sn);
  }
}

export async function revertEdits(sn: string): Promise<ApplyResult> {
  if (applyLocks.has(sn)) return { ok: false, reason: 'locked' };
  applyLocks.add(sn);
  try {
    if (!isDeviceOnline(sn)) return { ok: false, reason: 'offline' };
    if (isMowerBusy(sn)) return { ok: false, reason: 'busy' };
    const version = mapEditsRepo.latestVersion(sn);
    if (!version) return { ok: false, reason: 'no_version' };
    const snapshot = JSON.parse(version.snapshot) as SnapshotRow[];

    db.transaction(() => {
      const current = mapRepo.findByMowerSn(sn);
      const snapIds = new Set(snapshot.map(r => r.map_id));
      // Rijen die na de apply zijn bijgekomen (nieuw obstacle) → weg
      for (const row of current) {
        if (!snapIds.has(row.map_id)) mapRepo.deleteByIdAndMower(row.map_id, sn);
      }
      // Snapshot-rijen terugzetten (area/bounds) of opnieuw aanmaken (verwijderd obstacle)
      const currentIds = new Set(current.map(r => r.map_id));
      for (const r of snapshot) {
        if (currentIds.has(r.map_id)) {
          if (r.map_area && r.map_max_min) mapRepo.updateAreaAndBoundsByIdAndMower(r.map_id, sn, r.map_area, r.map_max_min);
        } else {
          mapRepo.create({ map_id: r.map_id, mower_sn: sn, map_name: r.map_name,
            map_type: r.map_type, file_name: r.file_name, map_area: r.map_area, map_max_min: r.map_max_min });
        }
      }
      mapEditsRepo.deleteVersion(version.id);
      mapEditsRepo.clearDrafts(sn);
    })();

    return bundleAndPush(sn);
  } finally {
    applyLocks.delete(sn);
  }
}
```

- [ ] **Step 4: Run, verwacht PASS** (hele service-suite + bestaande suites)

Run: `cd server && npx vitest run src/__tests__/services/mapEdit.test.ts && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add server/src/services/mapEdit.ts server/src/__tests__/services/mapEdit.test.ts
git commit -m "feat(map-edit): apply/revert pipeline (snapshot, bundle, verbatim push, pending-sync)"
```

---

### Task 8: REST endpoints `/api/dashboard/maps/:sn/edit/*`

**Files:**
- Modify: `server/src/routes/dashboard.ts` (na de bestaande `DELETE /maps/:sn/:mapId` route, vóór `autoPushMapsInBackground`)

Routes zijn dunne wrappers — alle logica zit in de service (getest in Task 6/7). Geen route-tests (project heeft geen supertest-infra); verificatie via tsc + handmatige curl in Step 3.

- [ ] **Step 1: Voeg routes toe**

Bovenaan dashboard.ts bij de imports:

```typescript
import { getEditGeometry, saveDraft, discardDrafts, applyEdits, revertEdits } from '../services/mapEdit.js';
```

Routes (let op: `/maps/:sn/edit/...` MOET vóór eventuele `/maps/:sn/:mapId` catch-alls geregistreerd worden in de file-volgorde — Express matcht in registratievolgorde; controleer dat `edit` niet als `:mapId` gegrepen wordt door eerdere routes. `GET /maps/:sn` heeft geen sub-segment dus zit goed; `DELETE /maps/:sn/:mapId` matcht alleen DELETE):

```typescript
// ── Map editing (spec: 2026-06-10-map-obstacle-editing-design.md) ──────────
dashboardRouter.get('/maps/:sn/edit/geometry', (req: Request, res: Response) => {
  res.json(getEditGeometry(req.params.sn));
});

dashboardRouter.put('/maps/:sn/edit/draft', (req: Request, res: Response) => {
  const { canonical, mapType, parentMap, points, deleted } = req.body as {
    canonical?: string; mapType?: 'work' | 'obstacle'; parentMap?: string;
    points?: { x: number; y: number }[]; deleted?: boolean;
  };
  const result = saveDraft(req.params.sn, { canonical, mapType, parentMap, points, deleted });
  if (!result.ok) { res.status(400).json({ error: result.error }); return; }
  res.json({ ok: true, canonical: result.canonical });
});

dashboardRouter.delete('/maps/:sn/edit/drafts', (req: Request, res: Response) => {
  discardDrafts(req.params.sn);
  res.json({ ok: true });
});

dashboardRouter.post('/maps/:sn/edit/apply', async (req: Request, res: Response) => {
  const result = await applyEdits(req.params.sn);
  if (!result.ok) {
    const status = result.reason === 'validation' ? 422
      : result.reason === 'no_changes' ? 400
      : result.reason === 'offline' || result.reason === 'busy' || result.reason === 'locked' ? 409 : 502;
    res.status(status).json(result);
    return;
  }
  res.json(result);
});

dashboardRouter.post('/maps/:sn/edit/revert', async (req: Request, res: Response) => {
  const result = await revertEdits(req.params.sn);
  if (!result.ok) {
    const status = result.reason === 'no_version' ? 404
      : result.reason === 'offline' || result.reason === 'busy' || result.reason === 'locked' ? 409 : 502;
    res.status(status).json(result);
    return;
  }
  res.json(result);
});
```

- [ ] **Step 2: TypeScript check**

Run: `cd server && npx tsc --noEmit`
Expected: geen errors

- [ ] **Step 3: Handmatige smoke (dev server)**

Run: `cd server && npm run dev` en in een tweede terminal:

```bash
curl -s localhost:3000/api/dashboard/maps/LFIN1231000211/edit/geometry | head -c 400
```

Expected: JSON met `{"maps":[...],"pendingSync":false,...}` (let op: poort van de dev-omgeving; productie draait op .247:8080 — test lokaal, NIET tegen productie).

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/dashboard.ts
git commit -m "feat(map-edit): REST endpoints geometry/draft/apply/revert"
```

---

### Task 9: Dashboard editor (adminPage.ts)

**Files:**
- Modify: `server/src/routes/adminPage.ts` — drie plekken: (a) toolbar-HTML in `tab_maps`, (b) transform-expose in `renderMapCanvas`, (c) edit-mode JS-blok

adminPage.ts is één grote template-string; alle client-code is inline vanilla JS. Verificatie is handmatig (geen test-infra voor deze page). **Wacht met committen tot de user het getest heeft** (feedback_test_before_commit).

- [ ] **Step 1: Toolbar-HTML toevoegen**

In de `tab_maps` sectie (~regel 636-758), direct boven `<canvas id="mapCanvas" ...>`:

```html
<div id="mapEditBar" style="display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap">
  <button class="btn" id="mapEditToggle" onclick="enterMapEdit()">&#9998; Bewerken</button>
  <span id="mapEditTools" style="display:none;gap:8px;align-items:center">
    <button class="btn" id="toolVertex" onclick="setEditTool('vertex')">Vertex</button>
    <button class="btn" id="toolBrush" onclick="setEditTool('brush')">Duwen/trekken</button>
    <button class="btn" id="toolDraw" onclick="setEditTool('draw')">Nieuw obstacle</button>
    <label style="font-size:12px">Radius <input type="range" id="brushRadius" min="0.3" max="2" step="0.1" value="0.8" style="vertical-align:middle">
      <span id="brushRadiusVal">0.8m</span></label>
    <button class="btn" id="deleteObstacleBtn" onclick="deleteSelectedObstacle()" disabled>Obstacle verwijderen</button>
    <span style="flex:1"></span>
    <button class="btn" onclick="resetMapEdit()">Reset</button>
    <button class="btn" id="applyMapEdit" onclick="applyMapEdit()" style="background:#16a34a">Toepassen op maaier</button>
    <button class="btn" id="revertMapEdit" onclick="revertMapEdit()" style="display:none">Terugdraaien</button>
    <button class="btn" onclick="exitMapEdit()">Sluiten</button>
  </span>
  <span id="mapEditStatus" style="font-size:12px;color:#9ca3af"></span>
</div>
```

(Gebruik dezelfde `btn`-class als de bestaande knoppen in die tab; check de exacte class-naam ter plekke en pas aan.)

- [ ] **Step 2: Transform exposen in renderMapCanvas + draft-overlay tekenen**

In `renderMapCanvas` (regel ~5416), direct na de definitie van `tx`/`ty` (regels ~5490-5491), de inverse opslaan zodat handlers pixels→meters kunnen omrekenen:

```javascript
canvas.__mapTransform = {
  toPx: function(p) { return { x: tx(p.x), y: ty(p.y) }; },
  toM: function(px, py) { return { x: minX + (px - offsetX) / scale, y: maxY - (py - offsetY) / scale }; },
  scale: scale
};
```

Aan het einde van `renderMapCanvas` (na alle bestaande lagen), de edit-overlay:

```javascript
if (window.__mapEdit && window.__mapEdit.active) drawEditOverlay(canvas);
```

- [ ] **Step 3: Edit-mode JS-blok toevoegen**

Plaats bij de andere map-viewer functies (na de polygon-calibration code, ~regel 5284). Geometrie-helpers zijn een minimale JS-port van `editGeometry.ts` (zelfde formules — bij wijzigingen in de TS-module deze port bijwerken):

```javascript
// ── Map edit mode ──────────────────────────────────────────────────────────
window.__mapEdit = null;

function geomDensify(pts, maxSpacing) {
  if (pts.length < 3) return pts.slice();
  var out = [];
  for (var i = 0; i < pts.length; i++) {
    var a = pts[i], b = pts[(i + 1) % pts.length];
    out.push(a);
    var d = Math.hypot(b.x - a.x, b.y - a.y);
    var n = Math.ceil(d / maxSpacing) - 1;
    for (var k = 1; k <= n; k++) {
      var t = k / (n + 1);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}
function geomBrush(pts, anchor, delta, radius) {
  return pts.map(function(p) {
    var d = Math.hypot(p.x - anchor.x, p.y - anchor.y);
    if (d >= radius) return p;
    var f = 0.5 * (1 + Math.cos(Math.PI * d / radius));
    return { x: p.x + delta.x * f, y: p.y + delta.y * f };
  });
}
function geomHitVertex(pts, p, tol) {
  var best = -1, bestD = tol;
  for (var i = 0; i < pts.length; i++) {
    var d = Math.hypot(pts[i].x - p.x, pts[i].y - p.y);
    if (d <= bestD) { bestD = d; best = i; }
  }
  return best;
}
function geomHitEdge(pts, p, tol) {
  var best = null, bestD = tol;
  for (var i = 0; i < pts.length; i++) {
    var a = pts[i], b = pts[(i + 1) % pts.length];
    var dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) continue;
    var t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    var q = { x: a.x + t * dx, y: a.y + t * dy };
    var d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d <= bestD) { bestD = d; best = { insertIndex: i + 1, point: q }; }
  }
  return best;
}

async function enterMapEdit() {
  var sn = document.getElementById('mapViewerSn').value; // zelfde SN-bron als loadMapsFor — check exacte id ter plekke
  if (!sn) return;
  var r = await fetch('/api/dashboard/maps/' + encodeURIComponent(sn) + '/edit/geometry',
    { headers: { 'Authorization': token } });
  if (!r.ok) { alert('Geometry laden mislukt'); return; }
  var g = await r.json();
  // Werkkopie: draft als die er is, anders origineel. Origineel apart voor ghost.
  var polys = g.maps.filter(function(m) { return m.mapType !== 'unicom'; }).map(function(m) {
    return {
      canonical: m.canonical, mapType: m.mapType, mapId: m.mapId, parentMap: m.parentMap,
      original: m.points,
      points: (m.draft && !m.draft.deleted) ? m.draft.points.slice() : m.points.slice(),
      deleted: !!(m.draft && m.draft.deleted),
      isNew: !!(m.draft && m.draft.isNew)
    };
  });
  window.__mapEdit = {
    active: true, sn: sn, tool: 'vertex', brushRadius: 0.8,
    polys: polys, selected: -1, dragVertex: -1, brushAnchor: null, brushBase: null,
    drawPoints: [], dirty: false, saveTimer: null,
    pendingSync: g.pendingSync, hasVersions: g.hasVersions
  };
  document.getElementById('mapEditTools').style.display = 'inline-flex';
  document.getElementById('mapEditToggle').style.display = 'none';
  document.getElementById('revertMapEdit').style.display = g.hasVersions ? '' : 'none';
  document.getElementById('applyMapEdit').textContent = g.pendingSync ? 'Opnieuw synchroniseren' : 'Toepassen op maaier';
  setEditTool('vertex');
  reRenderMap(); // bestaande re-render entry van de viewer — check exacte naam ter plekke
}

function exitMapEdit() {
  window.__mapEdit = null;
  document.getElementById('mapEditTools').style.display = 'none';
  document.getElementById('mapEditToggle').style.display = '';
  reRenderMap();
}

function setEditTool(tool) {
  var st = window.__mapEdit; if (!st) return;
  st.tool = tool; st.drawPoints = [];
  ['toolVertex', 'toolBrush', 'toolDraw'].forEach(function(id) {
    document.getElementById(id).style.outline = '';
  });
  document.getElementById(tool === 'vertex' ? 'toolVertex' : tool === 'brush' ? 'toolBrush' : 'toolDraw')
    .style.outline = '2px solid #16a34a';
}

document.getElementById('brushRadius').addEventListener('input', function(e) {
  if (window.__mapEdit) window.__mapEdit.brushRadius = parseFloat(e.target.value);
  document.getElementById('brushRadiusVal').textContent = e.target.value + 'm';
});

function editStatus(msg) { document.getElementById('mapEditStatus').textContent = msg; }

function scheduleDraftSave(poly) {
  var st = window.__mapEdit; if (!st) return;
  st.dirty = true;
  clearTimeout(st.saveTimer);
  st.saveTimer = setTimeout(function() { saveDraftNow(poly); }, 800);
}

async function saveDraftNow(poly) {
  var st = window.__mapEdit; if (!st) return;
  var body = poly.deleted
    ? { canonical: poly.canonical, deleted: true }
    : poly.canonical
      ? { canonical: poly.canonical, points: poly.points }
      : { mapType: 'obstacle', parentMap: poly.parentMap, points: poly.points };
  var r = await fetch('/api/dashboard/maps/' + encodeURIComponent(st.sn) + '/edit/draft', {
    method: 'PUT', headers: { 'Authorization': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  var j = await r.json();
  if (!r.ok) { editStatus('Draft fout: ' + (j.error || r.status)); return; }
  if (!poly.canonical) poly.canonical = j.canonical;   // nieuw obstacle kreeg slot
  editStatus('Draft opgeslagen (' + poly.canonical + ')');
}

async function resetMapEdit() {
  var st = window.__mapEdit; if (!st) return;
  await fetch('/api/dashboard/maps/' + encodeURIComponent(st.sn) + '/edit/drafts',
    { method: 'DELETE', headers: { 'Authorization': token } });
  exitMapEdit(); enterMapEdit();
}

async function applyMapEdit() {
  var st = window.__mapEdit; if (!st) return;
  if (!confirm('Wijzigingen toepassen op de maaier? Dit herschrijft de kaartbestanden.')) return;
  editStatus('Toepassen...');
  var r = await fetch('/api/dashboard/maps/' + encodeURIComponent(st.sn) + '/edit/apply',
    { method: 'POST', headers: { 'Authorization': token } });
  var j = await r.json();
  if (!r.ok) {
    if (j.reason === 'validation') {
      editStatus('Validatie mislukt: ' + j.validation.errors.map(function(e) { return e.canonical + ': ' + e.message; }).join('; '));
    } else if (j.reason === 'busy') { editStatus('Maaier is bezig — stop eerst de taak.'); }
    else if (j.reason === 'offline') { editStatus('Maaier offline.'); }
    else if (j.reason === 'push_failed' || j.reason === 'bundle_failed') {
      editStatus('Push mislukt — status: pending sync. Probeer "Opnieuw synchroniseren".');
      document.getElementById('applyMapEdit').textContent = 'Opnieuw synchroniseren';
    } else { editStatus('Fout: ' + (j.reason || r.status)); }
    return;
  }
  var warns = (j.validation && j.validation.warnings) || [];
  editStatus('Toegepast ✓' + (warns.length ? ' — let op: ' + warns.map(function(w) { return w.message; }).join('; ') : ''));
  exitMapEdit(); enterMapEdit();   // her-laad geometry (incl. hasVersions)
}

async function revertMapEdit() {
  var st = window.__mapEdit; if (!st) return;
  if (!confirm('Vorige versie terugzetten en naar de maaier pushen?')) return;
  editStatus('Terugdraaien...');
  var r = await fetch('/api/dashboard/maps/' + encodeURIComponent(st.sn) + '/edit/revert',
    { method: 'POST', headers: { 'Authorization': token } });
  var j = await r.json();
  editStatus(r.ok ? 'Teruggedraaid ✓' : 'Terugdraaien mislukt: ' + (j.reason || r.status));
  if (r.ok) { exitMapEdit(); enterMapEdit(); }
}

function deleteSelectedObstacle() {
  var st = window.__mapEdit; if (!st || st.selected < 0) return;
  var poly = st.polys[st.selected];
  if (poly.mapType !== 'obstacle') return;
  poly.deleted = true;
  st.selected = -1;
  document.getElementById('deleteObstacleBtn').disabled = true;
  scheduleDraftSave(poly);
  reRenderMap();
}

function drawEditOverlay(canvas) {
  var st = window.__mapEdit, tf = canvas.__mapTransform;
  if (!st || !tf) return;
  var ctx = canvas.getContext('2d');
  st.polys.forEach(function(poly, idx) {
    if (poly.deleted) return;
    // Origineel als ghost (wit gestippeld, zelfde stijl als calibration-ghost)
    if (poly.original.length >= 3 && !poly.isNew) {
      ctx.beginPath();
      poly.original.forEach(function(p, i) {
        var q = tf.toPx(p); i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.setLineDash([6, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.setLineDash([]);
    }
    // Werkkopie (oranje = bewerkt, geel = geselecteerd)
    if (poly.points.length >= 2) {
      ctx.beginPath();
      poly.points.forEach(function(p, i) {
        var q = tf.toPx(p); i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.strokeStyle = idx === st.selected ? '#facc15' : '#fb923c';
      ctx.lineWidth = 2; ctx.stroke();
      // Vertex handles (alleen vertex-tool + geselecteerd)
      if (st.tool === 'vertex' && idx === st.selected) {
        poly.points.forEach(function(p) {
          var q = tf.toPx(p);
          ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, 2 * Math.PI);
          ctx.fillStyle = '#fde047'; ctx.fill();
          ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
        });
      }
    }
  });
  // Draw-mode: punten-in-wording
  if (st.tool === 'draw' && st.drawPoints.length > 0) {
    ctx.beginPath();
    st.drawPoints.forEach(function(p, i) {
      var q = tf.toPx(p); i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y);
    });
    ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2; ctx.stroke();
    st.drawPoints.forEach(function(p) {
      var q = tf.toPx(p);
      ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, 2 * Math.PI); ctx.fillStyle = '#f87171'; ctx.fill();
    });
  }
  // Brush-cursor
  if (st.tool === 'brush' && st.cursorM) {
    var c = tf.toPx(st.cursorM);
    ctx.beginPath(); ctx.arc(c.x, c.y, st.brushRadius * tf.scale, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(34,197,94,0.8)'; ctx.lineWidth = 1; ctx.stroke();
  }
}
```

- [ ] **Step 4: Muis-handlers integreren**

In de bestaande canvas mousedown/mousemove/mouseup/dblclick handlers (~regels 5291-5365): bovenaan elke handler een edit-branch die `return`t zodat pan/zoom niet tegelijk vuurt (wheel-zoom blijft werken):

```javascript
// in mousedown:
if (window.__mapEdit) { mapEditMouseDown(e); return; }
// in mousemove:
if (window.__mapEdit) { mapEditMouseMove(e); return; }
// in mouseup:
if (window.__mapEdit) { mapEditMouseUp(e); return; }
// in dblclick:
if (window.__mapEdit) { mapEditDblClick(e); return; }
```

En de implementaties (bij het edit-blok uit Step 3):

```javascript
function evtToM(e) {
  var canvas = document.getElementById('mapCanvas');
  var rect = canvas.getBoundingClientRect();
  var px = (e.clientX - rect.left) * (canvas.width / rect.width);
  var py = (e.clientY - rect.top) * (canvas.height / rect.height);
  return canvas.__mapTransform.toM(px, py);
}
function hitTol() {
  var canvas = document.getElementById('mapCanvas');
  return 8 / canvas.__mapTransform.scale;   // 8px in meters
}

function mapEditMouseDown(e) {
  var st = window.__mapEdit, m = evtToM(e), tol = hitTol();
  if (st.tool === 'vertex') {
    // 1) vertex van geselecteerde poly?
    if (st.selected >= 0) {
      var poly = st.polys[st.selected];
      var vi = geomHitVertex(poly.points, m, tol);
      if (vi >= 0) {
        if (e.altKey) {                      // alt-klik = punt verwijderen
          if (poly.points.length > 3) { poly.points.splice(vi, 1); scheduleDraftSave(poly); reRenderMap(); }
          return;
        }
        st.dragVertex = vi; return;
      }
    }
    // 2) anders: poly selecteren via rand-hit
    for (var i = 0; i < st.polys.length; i++) {
      if (st.polys[i].deleted) continue;
      if (geomHitEdge(st.polys[i].points, m, tol)) {
        st.selected = i;
        document.getElementById('deleteObstacleBtn').disabled = st.polys[i].mapType !== 'obstacle';
        reRenderMap(); return;
      }
    }
    st.selected = -1; document.getElementById('deleteObstacleBtn').disabled = true; reRenderMap();
  } else if (st.tool === 'brush') {
    // dichtstbijzijnde poly-rand binnen 2x radius → die poly brushen
    for (var j = 0; j < st.polys.length; j++) {
      if (st.polys[j].deleted) continue;
      if (geomHitEdge(st.polys[j].points, m, st.brushRadius * 2)) {
        st.selected = j;
        st.brushAnchor = m;
        st.brushBase = geomDensify(st.polys[j].points, st.brushRadius / 4);
        return;
      }
    }
  } else if (st.tool === 'draw') {
    st.drawPoints.push(m); reRenderMap();
  }
}

function mapEditMouseMove(e) {
  var st = window.__mapEdit, m = evtToM(e);
  st.cursorM = m;
  if (st.tool === 'vertex' && st.dragVertex >= 0 && st.selected >= 0) {
    st.polys[st.selected].points[st.dragVertex] = m;
    reRenderMap();
  } else if (st.tool === 'brush' && st.brushAnchor && st.selected >= 0) {
    var delta = { x: m.x - st.brushAnchor.x, y: m.y - st.brushAnchor.y };
    st.polys[st.selected].points = geomBrush(st.brushBase, st.brushAnchor, delta, st.brushRadius);
    reRenderMap();
  } else if (st.tool === 'brush') {
    reRenderMap();   // cursor-cirkel volgen
  }
}

function mapEditMouseUp() {
  var st = window.__mapEdit;
  if (st.tool === 'vertex' && st.dragVertex >= 0) {
    st.dragVertex = -1; scheduleDraftSave(st.polys[st.selected]);
  } else if (st.tool === 'brush' && st.brushAnchor) {
    st.brushAnchor = null; st.brushBase = null; scheduleDraftSave(st.polys[st.selected]);
  }
}

function mapEditDblClick(e) {
  var st = window.__mapEdit, m = evtToM(e), tol = hitTol();
  if (st.tool === 'draw') {
    // dubbelklik sluit nieuw obstacle af
    if (st.drawPoints.length >= 3) {
      var parent = st.polys.find(function(p) { return p.mapType === 'work' && !p.deleted; });
      var poly = { canonical: null, mapType: 'obstacle', parentMap: parent ? parent.canonical : 'map0',
        original: [], points: st.drawPoints.slice(), deleted: false, isNew: true };
      st.polys.push(poly);
      st.drawPoints = [];
      scheduleDraftSave(poly);
      setEditTool('vertex'); st.selected = st.polys.length - 1;
      document.getElementById('deleteObstacleBtn').disabled = false;
    }
    reRenderMap();
  } else if (st.tool === 'vertex' && st.selected >= 0) {
    // dubbelklik op rand = punt invoegen
    var poly2 = st.polys[st.selected];
    var hit = geomHitEdge(poly2.points, m, tol);
    if (hit) { poly2.points.splice(hit.insertIndex, 0, hit.point); scheduleDraftSave(poly2); reRenderMap(); }
  }
}
```

LET OP integratiepunten (regelnummers verschuiven — zoek op anker-tekst):
- SN-bron: gebruik dezelfde variabele/element als de bestaande `loadMaps`-flow in de Maps-tab (zoek naar de fetch van `/api/dashboard/maps/`).
- `reRenderMap()`: gebruik de bestaande re-render functie van de viewer (de functie die `renderMapCanvas(canvas, st.maps, ...)` aanroept bij zoom/pan). Als die inline is, factor hem naar een benoemde functie.
- De `dblclick`-handler reset nu zoom (regel ~5354) — de edit-branch moet dáárvóór staan.

- [ ] **Step 5: TypeScript check + dev-server smoke**

Run: `cd server && npx tsc --noEmit && npm run dev`
Handmatig in browser (localhost:3000/admin): Maps-tab → Bewerken → vertex slepen, brush trekken, obstacle tekenen/verwijderen, Reset, Toepassen (verwacht foutmelding 'offline' zonder maaier — dat is correct gedrag).

- [ ] **Step 6: WACHT op user-test, commit daarna pas**

```bash
git add server/src/routes/adminPage.ts
git commit -m "feat(dashboard): map/obstacle editor in Map Viewer (vertex, brush, draw, apply/revert)"
```

---

### Task 10: App — geometrie-spiegel + API-methods

**Files:**
- Create: `app/src/utils/mapEditGeometry.ts`
- Modify: `app/src/services/api.ts`

- [ ] **Step 1: Spiegel de geometrie-module**

Kopieer `server/src/maps/editGeometry.ts` LETTERLIJK naar `app/src/utils/mapEditGeometry.ts` en pas alleen de kop-comment aan:

```typescript
/**
 * SPIEGEL van server/src/maps/editGeometry.ts — NIET los aanpassen.
 * Wijzigingen eerst server-side (bron van waarheid + tests), dan hierheen kopiëren.
 */
```

(Bestand is dependency-vrij, dus 1-op-1 kopieerbaar.)

- [ ] **Step 2: API-methods toevoegen in api.ts**

In de `ApiClient` class (na `sendCommand`, ~regel 380). Types bovenin het bestand bij de andere interfaces:

```typescript
export interface MapEditDraftDto { points: { x: number; y: number }[]; deleted: boolean; isNew: boolean }
export interface MapEditEntryDto {
  mapId: string; canonical: string; mapType: 'work' | 'obstacle' | 'unicom';
  alias: string | null; parentMap: string | null;
  points: { x: number; y: number }[]; draft: MapEditDraftDto | null;
}
export interface MapEditGeometryDto { maps: MapEditEntryDto[]; pendingSync: boolean; hasVersions: boolean }
export interface MapEditApplyDto {
  ok: boolean; reason?: string;
  validation?: { ok: boolean; errors: { canonical: string; code: string; message: string }[]; warnings: { canonical: string; code: string; message: string }[] };
}
```

Methods (apply/revert lezen óók de error-body, dus die gaan buiten `request<T>` om):

```typescript
async getMapEditGeometry(sn: string): Promise<MapEditGeometryDto> {
  return this.request<MapEditGeometryDto>('GET', `/api/dashboard/maps/${encodeURIComponent(sn)}/edit/geometry`);
}

async saveMapEditDraft(sn: string, body: {
  canonical?: string; mapType?: 'work' | 'obstacle'; parentMap?: string;
  points?: { x: number; y: number }[]; deleted?: boolean;
}): Promise<{ ok: boolean; canonical?: string }> {
  return this.request('PUT', `/api/dashboard/maps/${encodeURIComponent(sn)}/edit/draft`, { body });
}

async discardMapEditDrafts(sn: string): Promise<{ ok: boolean }> {
  return this.request('DELETE', `/api/dashboard/maps/${encodeURIComponent(sn)}/edit/drafts`);
}

private async postMapEdit(sn: string, action: 'apply' | 'revert'): Promise<MapEditApplyDto> {
  const res = await fetch(`${this.baseUrl}/api/dashboard/maps/${encodeURIComponent(sn)}/edit/${action}`, { method: 'POST' });
  try { return (await res.json()) as MapEditApplyDto; }
  catch { return { ok: false, reason: `http_${res.status}` }; }
}
async applyMapEdits(sn: string): Promise<MapEditApplyDto> { return this.postMapEdit(sn, 'apply'); }
async revertMapEdits(sn: string): Promise<MapEditApplyDto> { return this.postMapEdit(sn, 'revert'); }
```

(Check of `request` in deze client een token meegeeft voor dashboard-routes — volg wat `sendCommand` doet; als die een token meestuurt, geef hem in `postMapEdit` hetzelfde mee via headers.)

- [ ] **Step 3: TypeScript check**

Run: `cd app && npx tsc --noEmit`
Expected: geen nieuwe errors

- [ ] **Step 4: Commit**

```bash
git add app/src/utils/mapEditGeometry.ts app/src/services/api.ts
git commit -m "feat(app): mapEditGeometry spiegel + map-edit API methods"
```

---

### Task 11: App — `MapEditScreen` + navigatie + i18n

**Files:**
- Create: `app/src/screens/MapEditScreen.tsx`
- Modify: `app/src/navigation/types.ts` (MapStackParams), `App.tsx` (Screen-registratie), `app/src/screens/MapScreen.tsx` ("Kaart bewerken" knop), `app/src/i18n/{en,nl,de,fr}.ts`

- [ ] **Step 1: Navigatie + i18n**

`app/src/navigation/types.ts`:

```typescript
export type MapStackParams = {
  MapMain: undefined;
  Mapping: { mode?: string } | undefined;
  MapEdit: { sn: string };
};
```

`App.tsx`, in `MapTabScreen` naast de bestaande screens:

```tsx
<MapStack.Screen name="MapEdit" component={MapEditScreen} />
```

(+ `import { MapEditScreen } from './app/src/screens/MapEditScreen';` — volg de bestaande import-stijl van MappingScreen.)

i18n keys — `en.ts` (analoog vertaald in `nl.ts`, `de.ts`, `fr.ts`):

```typescript
mapEditTitle: 'Edit map',
mapEditVertex: 'Points',
mapEditBrush: 'Push/pull',
mapEditDraw: 'New obstacle',
mapEditDeleteObstacle: 'Delete obstacle',
mapEditReset: 'Reset',
mapEditApply: 'Apply to mower',
mapEditResync: 'Re-sync to mower',
mapEditRevert: 'Undo last apply',
mapEditApplied: 'Applied to mower',
mapEditBusy: 'Mower is busy — stop the current task first',
mapEditOffline: 'Mower is offline',
mapEditPushFailed: 'Push failed — pending sync, try re-sync',
mapEditConfirmApply: 'Apply changes to the mower? This rewrites the map files.',
mapEditConfirmRevert: 'Restore the previous version and push it to the mower?',
mapEditDrawHint: 'Tap to place points, long-press to close',
```

nl.ts: `mapEditTitle: 'Kaart bewerken'`, `mapEditVertex: 'Punten'`, `mapEditBrush: 'Duwen/trekken'`, `mapEditDraw: 'Nieuw obstakel'`, `mapEditDeleteObstacle: 'Obstakel verwijderen'`, `mapEditReset: 'Reset'`, `mapEditApply: 'Toepassen op maaier'`, `mapEditResync: 'Opnieuw synchroniseren'`, `mapEditRevert: 'Laatste apply terugdraaien'`, `mapEditApplied: 'Toegepast op maaier'`, `mapEditBusy: 'Maaier is bezig — stop eerst de taak'`, `mapEditOffline: 'Maaier is offline'`, `mapEditPushFailed: 'Push mislukt — pending sync, probeer opnieuw'`, `mapEditConfirmApply: 'Wijzigingen toepassen op de maaier? Dit herschrijft de kaartbestanden.'`, `mapEditConfirmRevert: 'Vorige versie terugzetten en naar de maaier pushen?'`, `mapEditDrawHint: 'Tik om punten te plaatsen, lang indrukken om te sluiten'`.

- [ ] **Step 2: MapEditScreen implementeren**

```tsx
// app/src/screens/MapEditScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Svg, { Circle, Polygon, Polyline } from 'react-native-svg';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useI18n } from '../i18n';
import { useTheme } from '../theme';                       // volg bestaand theming-patroon van MappingScreen
import { useApi } from '../services/ApiContext';           // volg hoe MappingScreen de ApiClient verkrijgt — pas aan naar werkelijkheid
import {
  applyBrush, densifyPolygon, hitTestEdge, hitTestVertex, type XY,
} from '../utils/mapEditGeometry';
import type { MapEditEntryDto } from '../services/api';

type Tool = 'vertex' | 'brush' | 'draw';

interface EditPoly {
  canonical: string | null;
  mapType: string;
  parentMap: string | null;
  original: XY[];
  points: XY[];
  deleted: boolean;
  isNew: boolean;
}

const PADDING = 24;

export function MapEditScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { t } = useI18n();
  const { colors: c } = useTheme();
  const api = useApi();
  const sn = (route.params as { sn: string }).sn;
  const { width: winW, height: winH } = useWindowDimensions();
  const viewW = winW;
  const viewH = winH - 220;                                 // ruimte voor toolbar/bottombar

  const [polys, setPolys] = useState<EditPoly[]>([]);
  const [tool, setTool] = useState<Tool>('vertex');
  const [selected, setSelected] = useState(-1);
  const [brushRadius, setBrushRadius] = useState(0.8);
  const [drawPoints, setDrawPoints] = useState<XY[]>([]);
  const [status, setStatus] = useState('');
  const [pendingSync, setPendingSync] = useState(false);
  const [hasVersions, setHasVersions] = useState(false);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });   // user pinch/pan bovenop fit
  const dragRef = useRef<{ vertex: number; brushAnchor: XY | null; brushBase: XY[] | null; startView: typeof view }>(
    { vertex: -1, brushAnchor: null, brushBase: null, startView: view });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const g = await api.getMapEditGeometry(sn);
    setPolys(g.maps.filter((m: MapEditEntryDto) => m.mapType !== 'unicom').map((m: MapEditEntryDto) => ({
      canonical: m.canonical, mapType: m.mapType, parentMap: m.parentMap,
      original: m.points,
      points: (m.draft && !m.draft.deleted) ? [...m.draft.points] : [...m.points],
      deleted: !!(m.draft?.deleted), isNew: !!(m.draft?.isNew),
    })));
    setPendingSync(g.pendingSync); setHasVersions(g.hasVersions);
    setSelected(-1); setDrawPoints([]);
  }, [api, sn]);
  useEffect(() => { load().catch(e => setStatus(String(e))); }, [load]);

  // ── Projectie: meters → scherm (fit + user view), en terug ──
  const fit = useMemo(() => {
    const all = polys.flatMap(p => (p.deleted ? [] : p.points)).concat(polys.flatMap(p => p.original));
    if (all.length === 0) return { minX: 0, maxY: 0, scale: 1 };
    const minX = Math.min(...all.map(p => p.x)), maxX = Math.max(...all.map(p => p.x));
    const minY = Math.min(...all.map(p => p.y)), maxY = Math.max(...all.map(p => p.y));
    const scale = Math.min((viewW - 2 * PADDING) / Math.max(maxX - minX, 1), (viewH - 2 * PADDING) / Math.max(maxY - minY, 1));
    return { minX, maxY, scale };
  }, [polys, viewW, viewH]);

  const toPx = useCallback((p: XY) => ({
    x: (PADDING + (p.x - fit.minX) * fit.scale) * view.scale + view.tx,
    y: (PADDING + (fit.maxY - p.y) * fit.scale) * view.scale + view.ty,
  }), [fit, view]);
  const toM = useCallback((px: number, py: number): XY => ({
    x: fit.minX + ((px - view.tx) / view.scale - PADDING) / fit.scale,
    y: fit.maxY - ((py - view.ty) / view.scale - PADDING) / fit.scale,
  }), [fit, view]);
  const hitTolM = 22 / (fit.scale * view.scale);            // 22pt aanraak-tolerantie

  // ── Draft persistence (debounced) ──
  const persistDraft = useCallback((poly: EditPoly) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const body = poly.deleted
          ? { canonical: poly.canonical!, deleted: true }
          : poly.canonical
            ? { canonical: poly.canonical, points: poly.points }
            : { mapType: 'obstacle' as const, parentMap: poly.parentMap ?? 'map0', points: poly.points };
        const r = await api.saveMapEditDraft(sn, body);
        if (r.canonical && !poly.canonical) poly.canonical = r.canonical;
        setStatus(`✓ ${poly.canonical}`);
      } catch (e) { setStatus(String(e)); }
    }, 800);
  }, [api, sn]);

  // ── Gestures ──
  const onTouchStart = useCallback((px: number, py: number) => {
    const m = toM(px, py);
    if (tool === 'vertex') {
      if (selected >= 0) {
        const vi = hitTestVertex(polys[selected].points, m, hitTolM);
        if (vi >= 0) { dragRef.current.vertex = vi; return; }
      }
      const idx = polys.findIndex(p => !p.deleted && hitTestEdge(p.points, m, hitTolM));
      setSelected(idx);
    } else if (tool === 'brush') {
      const idx = polys.findIndex(p => !p.deleted && hitTestEdge(p.points, m, brushRadius * 2));
      if (idx >= 0) {
        setSelected(idx);
        dragRef.current.brushAnchor = m;
        dragRef.current.brushBase = densifyPolygon(polys[idx].points, brushRadius / 4);
      }
    }
  }, [tool, selected, polys, toM, hitTolM, brushRadius]);

  const onTouchMove = useCallback((px: number, py: number) => {
    const m = toM(px, py);
    const d = dragRef.current;
    if (tool === 'vertex' && d.vertex >= 0 && selected >= 0) {
      setPolys(prev => prev.map((p, i) => i === selected
        ? { ...p, points: p.points.map((q, qi) => (qi === d.vertex ? m : q)) } : p));
    } else if (tool === 'brush' && d.brushAnchor && d.brushBase && selected >= 0) {
      const delta = { x: m.x - d.brushAnchor.x, y: m.y - d.brushAnchor.y };
      const moved = applyBrush(d.brushBase, d.brushAnchor, delta, brushRadius);
      setPolys(prev => prev.map((p, i) => (i === selected ? { ...p, points: moved } : p)));
    }
  }, [tool, selected, toM, brushRadius]);

  const onTouchEnd = useCallback(() => {
    const d = dragRef.current;
    if ((tool === 'vertex' && d.vertex >= 0) || (tool === 'brush' && d.brushAnchor)) {
      d.vertex = -1; d.brushAnchor = null; d.brushBase = null;
      if (selected >= 0) persistDraft(polys[selected]);
    }
  }, [tool, selected, polys, persistDraft]);

  const onTap = useCallback((px: number, py: number) => {
    if (tool === 'draw') setDrawPoints(prev => [...prev, toM(px, py)]);
  }, [tool, toM]);

  const closeDrawnObstacle = useCallback(() => {
    if (drawPoints.length < 3) return;
    const parent = polys.find(p => p.mapType === 'work' && !p.deleted);
    const poly: EditPoly = { canonical: null, mapType: 'obstacle',
      parentMap: parent?.canonical ?? 'map0', original: [], points: drawPoints, deleted: false, isNew: true };
    setPolys(prev => [...prev, poly]);
    setDrawPoints([]); setTool('vertex');
    persistDraft(poly);
  }, [drawPoints, polys, persistDraft]);

  const pan = Gesture.Pan().minPointers(1).maxPointers(1)
    .onBegin(e => { runOnJS(onTouchStart)(e.x, e.y); })
    .onUpdate(e => { runOnJS(onTouchMove)(e.x, e.y); })
    .onEnd(() => { runOnJS(onTouchEnd)(); });
  const tap = Gesture.Tap().onEnd(e => { runOnJS(onTap)(e.x, e.y); });
  const longPress = Gesture.LongPress().onStart(() => { runOnJS(closeDrawnObstacle)(); });
  const pinch = Gesture.Pinch()
    .onBegin(() => { dragRef.current.startView = view; })
    .onUpdate(e => {
      const sv = dragRef.current.startView;
      runOnJS(setView)({ scale: Math.max(0.5, Math.min(8, sv.scale * e.scale)), tx: sv.tx, ty: sv.ty });
    });
  const twoFingerPan = Gesture.Pan().minPointers(2)
    .onBegin(() => { dragRef.current.startView = view; })
    .onUpdate(e => {
      const sv = dragRef.current.startView;
      runOnJS(setView)({ scale: sv.scale, tx: sv.tx + e.translationX, ty: sv.ty + e.translationY });
    });
  const gestures = Gesture.Race(Gesture.Simultaneous(pinch, twoFingerPan), Gesture.Exclusive(longPress, tap, pan));

  // ── Acties ──
  const doApply = useCallback(() => {
    Alert.alert(t('mapEditTitle') || 'Edit map', t('mapEditConfirmApply') || 'Apply to mower?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'OK', onPress: async () => {
        setStatus('…');
        const r = await api.applyMapEdits(sn);
        if (r.ok) { setStatus(t('mapEditApplied') || 'Applied'); await load(); }
        else if (r.reason === 'busy') setStatus(t('mapEditBusy') || 'Mower busy');
        else if (r.reason === 'offline') setStatus(t('mapEditOffline') || 'Mower offline');
        else if (r.reason === 'validation') setStatus((r.validation?.errors ?? []).map(e => `${e.canonical}: ${e.message}`).join('\n'));
        else if (r.reason === 'push_failed' || r.reason === 'bundle_failed') { setStatus(t('mapEditPushFailed') || 'Push failed'); setPendingSync(true); }
        else setStatus(r.reason ?? 'error');
      } },
    ]);
  }, [api, sn, t, load]);

  const doRevert = useCallback(() => {
    Alert.alert(t('mapEditRevert') || 'Undo', t('mapEditConfirmRevert') || 'Restore previous version?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'OK', onPress: async () => {
        const r = await api.revertMapEdits(sn);
        setStatus(r.ok ? (t('mapEditApplied') || 'Applied') : (r.reason ?? 'error'));
        if (r.ok) await load();
      } },
    ]);
  }, [api, sn, t, load]);

  const doReset = useCallback(async () => { await api.discardMapEditDrafts(sn); await load(); }, [api, sn, load]);
  const doDeleteObstacle = useCallback(() => {
    if (selected < 0 || polys[selected].mapType !== 'obstacle') return;
    const poly = { ...polys[selected], deleted: true };
    setPolys(prev => prev.map((p, i) => (i === selected ? poly : p)));
    setSelected(-1);
    persistDraft(poly);
  }, [selected, polys, persistDraft]);

  const svgPts = (pts: XY[]) => pts.map(p => { const q = toPx(p); return `${q.x},${q.y}`; }).join(' ');

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.background }}>
      {/* Toolbar */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, paddingTop: 56 }}>
        {(['vertex', 'brush', 'draw'] as Tool[]).map(tl => (
          <TouchableOpacity key={tl} testID={`mapedit-tool-${tl}`} onPress={() => setTool(tl)}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
              backgroundColor: tool === tl ? c.primary : c.card }}>
            <Text style={{ color: tool === tl ? '#fff' : c.text }}>
              {t(tl === 'vertex' ? 'mapEditVertex' : tl === 'brush' ? 'mapEditBrush' : 'mapEditDraw')}
            </Text>
          </TouchableOpacity>
        ))}
        {tool === 'brush' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity onPress={() => setBrushRadius(r => Math.max(0.3, +(r - 0.1).toFixed(1)))}><Text style={{ color: c.text, fontSize: 18 }}> − </Text></TouchableOpacity>
            <Text style={{ color: c.text }}>{brushRadius.toFixed(1)}m</Text>
            <TouchableOpacity onPress={() => setBrushRadius(r => Math.min(2, +(r + 0.1).toFixed(1)))}><Text style={{ color: c.text, fontSize: 18 }}> + </Text></TouchableOpacity>
          </View>
        )}
      </View>

      {/* Canvas */}
      <GestureDetector gesture={gestures}>
        <View style={{ width: viewW, height: viewH }}>
          <Svg width={viewW} height={viewH}>
            {polys.map((p, i) => p.deleted ? null : (
              <React.Fragment key={p.canonical ?? `new${i}`}>
                {!p.isNew && p.original.length >= 3 && (
                  <Polygon points={svgPts(p.original)} fill="none" stroke="rgba(255,255,255,0.35)" strokeDasharray="6 4" strokeWidth={1} />
                )}
                <Polygon points={svgPts(p.points)}
                  fill={p.mapType === 'obstacle' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.10)'}
                  stroke={i === selected ? '#facc15' : p.mapType === 'obstacle' ? '#ef4444' : '#22c55e'}
                  strokeWidth={2} />
                {tool === 'vertex' && i === selected && p.points.map((q, qi) => {
                  const s = toPx(q);
                  return <Circle key={qi} cx={s.x} cy={s.y} r={8} fill="#fde047" stroke="#000" strokeWidth={1} />;
                })}
              </React.Fragment>
            ))}
            {drawPoints.length > 0 && (
              <Polyline points={svgPts(drawPoints)} fill="none" stroke="#f87171" strokeWidth={2} />
            )}
          </Svg>
        </View>
      </GestureDetector>

      {/* Status + bottom bar */}
      <Text style={{ color: c.muted ?? '#9ca3af', paddingHorizontal: 12, fontSize: 12 }}>
        {tool === 'draw' ? (t('mapEditDrawHint') || '') : status}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 }}>
        <TouchableOpacity testID="mapedit-delete" onPress={doDeleteObstacle}
          disabled={selected < 0 || polys[selected]?.mapType !== 'obstacle'}
          style={{ padding: 10, borderRadius: 8, backgroundColor: c.card, opacity: selected >= 0 && polys[selected]?.mapType === 'obstacle' ? 1 : 0.4 }}>
          <Text style={{ color: '#ef4444' }}>{t('mapEditDeleteObstacle')}</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="mapedit-reset" onPress={doReset} style={{ padding: 10, borderRadius: 8, backgroundColor: c.card }}>
          <Text style={{ color: c.text }}>{t('mapEditReset')}</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="mapedit-apply" onPress={doApply} style={{ padding: 10, borderRadius: 8, backgroundColor: '#16a34a' }}>
          <Text style={{ color: '#fff' }}>{pendingSync ? t('mapEditResync') : t('mapEditApply')}</Text>
        </TouchableOpacity>
        {hasVersions && (
          <TouchableOpacity testID="mapedit-revert" onPress={doRevert} style={{ padding: 10, borderRadius: 8, backgroundColor: c.card }}>
            <Text style={{ color: c.text }}>{t('mapEditRevert')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </GestureHandlerRootView>
  );
}
```

LET OP integratie:
- `useApi`/`useTheme`: pas de imports aan naar hoe `MappingScreen.tsx` zijn ApiClient en theme echt verkrijgt (regels 1-40 daar) — dit verschilt mogelijk van de namen hierboven.
- Het theme-kleurenobject (`c.card`, `c.primary`, `c.muted`): gebruik de werkelijke keys uit het theme.

- [ ] **Step 3: "Kaart bewerken" knop in MapScreen**

In `app/src/screens/MapScreen.tsx`, bij de bestaande kaart-actieknoppen (zoek `testID="map-create"`), een knop ernaast:

```tsx
<TouchableOpacity testID="map-edit" onPress={() => (navigation as any).navigate('MapEdit', { sn: mowerSn })}>
  {/* zelfde styling als de map-create knop */}
  <Text>{t('mapEditTitle') || 'Kaart bewerken'}</Text>
</TouchableOpacity>
```

(`mowerSn`: gebruik dezelfde SN-bron als de rest van MapScreen.)

- [ ] **Step 4: TypeScript check + Expo hot-reload test**

Run: `cd app && npx tsc --noEmit`
Daarna user-test via Expo (NOOIT zelf APK bouwen): scherm openen, pinch/pan, vertex slepen, brush, obstacle tekenen (lang indrukken sluit), apply → verwachte foutafhandeling.

- [ ] **Step 5: WACHT op user-test, commit daarna**

```bash
git add app/src/screens/MapEditScreen.tsx app/src/navigation/types.ts App.tsx app/src/screens/MapScreen.tsx app/src/i18n/en.ts app/src/i18n/nl.ts app/src/i18n/de.ts app/src/i18n/fr.ts
git commit -m "feat(app): MapEditScreen — vertex/brush/draw editor met apply naar maaier"
```

---

### Task 12: Eindverificatie + live acceptatie

- [ ] **Step 1: Volledige test-suite + typechecks**

```bash
cd server && npx vitest run && npx tsc --noEmit
cd ../app && npx tsc --noEmit
```
Expected: alles groen, geen TS-errors.

- [ ] **Step 2: Live acceptatie (USER doet dit — niet de agent)**

Op LFIN1231000211 (NIET .244): één obstacle-rand ~30 cm naar binnen trekken op een probleemplek → Apply → zone maaien → checken dat de maaier dichter langs het object maait → Terugdraaien testen. **Geen bewegingscommando's zonder expliciete user-bevestiging.** Controleer na apply op de maaier: `md5sum /userdata/lfi/maps/home0/map*.pgm` — per-slot pgm's moeten onderling verschillen.

- [ ] **Step 3: Beads + push**

```bash
bd close Novabot-51x
git pull --rebase && bd dolt push && git push && git status
```
Expected: "up to date with origin".

---

## Self-review checklist (door planner afgewerkt)

- Spec-dekking: drafts (T1/T2/T6), geometrie+validatie (T3-T5), apply/revert/pending-sync (T7), endpoints (T8), dashboard-editor incl. ghost/brush/draw/delete (T9), app-editor + nav + i18n (T10/T11), live acceptatie (T12). Unicom read-only: afgedwongen in saveDraft + uitgefilterd in clients. `charging_station.yaml`/pos.json: ongemoeid (bundle-flow regelt dit, identiek aan restore).
- Afwijking t.o.v. spec (verbetering): apply gebruikt `createBundleFromDb` + `pushMapToMowerVerbatim` i.p.v. losse CSV-push + on-device regen — de rasters (incl. globale map.pgm én per-slot mapN.pgm) worden server-side gesynthetiseerd door de bewezen occupancy-grid generator; de md5-check uit de spec wordt daarmee een acceptatie-stap (T12) i.p.v. runtime-stap. De >1m-waarschuwing blijft (T4).
- Type-consistentie: `XY`, `SaveDraftInput`, `ApplyResult`, endpoints-shapes en api.ts DTO's zijn consistent doorgevoerd; dashboard-JS gebruikt dezelfde veldnamen (`canonical`, `points`, `deleted`, `reason`, `validation`).
