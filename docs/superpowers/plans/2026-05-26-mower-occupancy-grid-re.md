# Faithful Mower Occupancy-Grid Generator (RE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce, byte-for-byte and server-side, the Nav2 occupancy grid (`map.yaml`/`map.pgm`/`map.png` + per-map `mapN.*`) that the Novabot mower firmware (`novabot_mapping`) generates from boundary CSVs during `save_map type:1`, so cloud/polygon-only restores produce a costmap identical to the mower's own (fixing coverage-planner Error 125).

**Architecture:** Capture ground-truth (CSV inputs + real firmware PGM/YAML outputs) from a working mower as committed test fixtures. Reverse-engineer the rasterization from the `novabot_mapping` AArch64 binary in Ghidra and document it. Implement `server/src/maps/occupancyGrid.ts` incrementally, validating each rasterization rule byte-for-byte against the fixtures. Integrate it as the single costmap generator, retiring the polygon-only `polygonRasterizer` fill and the free-fill stopgap.

**Tech Stack:** TypeScript (server, ESM, Node 22, vitest), Ghidra (AArch64 static analysis), ROS2 Nav2 `map_saver` PGM/YAML format, sshpass over LAN to the mower.

**IMPORTANT — nature of this plan:** This is a reverse-engineering plan. The *exact pixel rules* of the rasterizer are NOT known until Task 3 (decompilation). Therefore: the test harness, fixtures, interfaces, and integration code are fully specified here; the rasterization rules in Tasks 5–10 are derived during execution from the RE writeup (Task 3) and are considered DONE only when the byte-match test from Task 2 turns green for that aspect. "Acceptance = byte-identical to the fixture" is the concrete contract for those tasks.

---

## File structure

| File | Responsibility |
|---|---|
| `server/src/__tests__/fixtures/occupancy/LFIN1231000211/` | Ground-truth: real `csv_file/` inputs + firmware `map.*`/`mapN.*` outputs + `charging_station.yaml`. Committed. |
| `server/src/maps/occupancyGrid.ts` | The faithful generator: `MapInput` → `GeneratedMap` (whole + per-map yaml/pgm/png). Pure, no I/O. |
| `server/src/maps/__pgmDiff.ts` | Test-only helper: parse a P5 PGM, diff two PGMs, report first divergent pixel + region. |
| `server/src/__tests__/maps/occupancyGrid.test.ts` | Byte-match tests: fixture CSV in → assert pgm bytes + yaml text === fixture. |
| `research/documents/mower-occupancy-grid-algorithm.md` | The RE writeup (geometry, cell rules, boundary, dock, unicom, per-map). |
| `server/src/maps/walkerBundleImporter.ts` | MODIFY: call `generateOccupancyGrid` instead of `rasterizePolygon`. |
| `tools/opennova-restore/cloud-to-bundle.mjs` | MODIFY: use the faithful generator (drop free-fill). |
| `server/src/maps/polygonRasterizer.ts` | RETIRE after migration (delete once no caller remains). |

---

### Task 1: Capture ground-truth fixtures from the working mower

**Files:**
- Create: `server/src/__tests__/fixtures/occupancy/LFIN1231000211/` (csv_file/ + map_files/ + charging_station.yaml + a `MANIFEST.txt`)

LFIN1231000211 = `192.168.0.100`, SSH `root` / `novabot` (per CLAUDE.md). Direct LAN, no jump host.

- [ ] **Step 1: Confirm the mower currently has a complete, firmware-generated map**

Run:
```bash
sshpass -p novabot ssh -o StrictHostKeyChecking=no -o ConnectTimeout=20 root@192.168.0.100 \
  'ls -la /userdata/lfi/maps/home0/ && echo --- && ls /userdata/lfi/maps/home0/csv_file/'
```
Expected: `home0/` lists `map.yaml`, `map.pgm`, `map.png`, `map0.yaml/pgm/png` (+ `mapN.*` if multi-zone), `csv_file/`, `x3_csv_file/`. If `map.pgm` is absent, STOP — this mower has no firmware grid to capture; pick another working mower or re-map first.

- [ ] **Step 2: Pull the inputs + outputs into the fixture dir**

Run:
```bash
FX=server/src/__tests__/fixtures/occupancy/LFIN1231000211
mkdir -p "$FX/csv_file" "$FX/map_files"
sshpass -p novabot scp -o StrictHostKeyChecking=no -r root@192.168.0.100:/userdata/lfi/maps/home0/csv_file/. "$FX/csv_file/"
for f in map.yaml map.pgm map.png map0.yaml map0.pgm map0.png map1.yaml map1.pgm map1.png map2.yaml map2.pgm map2.png; do
  sshpass -p novabot scp -o StrictHostKeyChecking=no root@192.168.0.100:/userdata/lfi/maps/home0/$f "$FX/map_files/" 2>/dev/null || true
done
sshpass -p novabot scp -o StrictHostKeyChecking=no root@192.168.0.100:/userdata/lfi/charging_station_file/charging_station.yaml "$FX/" 2>/dev/null || true
```

- [ ] **Step 3: Record a manifest (dims + which maps exist) for sanity**

Run:
```bash
FX=server/src/__tests__/fixtures/occupancy/LFIN1231000211
{ echo "captured $(date) from LFIN1231000211 (192.168.0.100) firmware v6.0.2-custom"; \
  for p in "$FX"/map_files/*.pgm; do echo "$(basename "$p"): $(head -2 "$p" | tail -1)"; done; \
  echo "csv: $(ls "$FX"/csv_file/)"; } > "$FX/MANIFEST.txt"
cat "$FX/MANIFEST.txt"
```
Expected: each `.pgm` header line shows `<width> <height>`; manifest lists the CSVs + map_info.json.

- [ ] **Step 4: Commit the fixtures**

```bash
git add server/src/__tests__/fixtures/occupancy/LFIN1231000211
git commit -m "test(occupancy): ground-truth fixtures from LFIN1231000211"
```

---

### Task 2: Byte-match test harness + generator skeleton

**Files:**
- Create: `server/src/maps/occupancyGrid.ts`
- Create: `server/src/maps/__pgmDiff.ts`
- Create: `server/src/__tests__/maps/occupancyGrid.test.ts`

- [ ] **Step 1: Write the PGM diff helper**

```ts
// server/src/maps/__pgmDiff.ts
export interface Pgm { width: number; height: number; max: number; data: Buffer; }

export function parsePgm(buf: Buffer): Pgm {
  if (buf.subarray(0, 2).toString('ascii') !== 'P5') throw new Error('not a P5 PGM');
  // Header: P5\n<w> <h>\n<max>\n  (whitespace-separated, may include comments starting with #)
  let i = 2; const tok: number[] = [];
  while (tok.length < 3) {
    while (i < buf.length && /\s/.test(String.fromCharCode(buf[i]))) i++;
    if (buf[i] === 0x23) { while (i < buf.length && buf[i] !== 0x0a) i++; continue; } // comment
    let n = 0, seen = false;
    while (i < buf.length && buf[i] >= 0x30 && buf[i] <= 0x39) { n = n * 10 + (buf[i] - 0x30); i++; seen = true; }
    if (seen) tok.push(n);
  }
  i++; // single whitespace after maxval
  const [width, height, max] = tok;
  return { width, height, max, data: buf.subarray(i, i + width * height) };
}

export interface PgmDiff { equal: boolean; reason?: string; firstIdx?: number; x?: number; y?: number; a?: number; b?: number; }

export function diffPgm(aBuf: Buffer, bBuf: Buffer): PgmDiff {
  const a = parsePgm(aBuf), b = parsePgm(bBuf);
  if (a.width !== b.width || a.height !== b.height) {
    return { equal: false, reason: `dims ${a.width}x${a.height} vs ${b.width}x${b.height}` };
  }
  for (let idx = 0; idx < a.data.length; idx++) {
    if (a.data[idx] !== b.data[idx]) {
      return { equal: false, reason: 'pixel mismatch', firstIdx: idx,
        x: idx % a.width, y: Math.floor(idx / a.width), a: a.data[idx], b: b.data[idx] };
    }
  }
  return { equal: true };
}
```

- [ ] **Step 2: Write the generator skeleton (stub)**

```ts
// server/src/maps/occupancyGrid.ts
export interface XY { x: number; y: number; }
export interface MapInput {
  workMaps: { canonical: string; points: XY[] }[];      // local meters, charger-relative
  obstacles: { parentMap: string; points: XY[] }[];
  unicom: { name: string; points: XY[] }[];
  chargingPose: { x: number; y: number; orientation: number };
}
export interface GridFile { yaml: string; pgm: Buffer; png?: Buffer; }
export interface GeneratedMap { whole: GridFile; perMap: { name: string; file: GridFile }[]; }

export function generateOccupancyGrid(_input: MapInput): GeneratedMap {
  throw new Error('generateOccupancyGrid: not implemented');
}
```

- [ ] **Step 3: Write the failing byte-match test (loads the fixture, drives the whole-map assertion)**

```ts
// server/src/__tests__/maps/occupancyGrid.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateOccupancyGrid, type MapInput, type XY } from '../../maps/occupancyGrid.js';
import { diffPgm } from '../../maps/__pgmDiff.js';

const FX = join(__dirname, '../fixtures/occupancy/LFIN1231000211');

function csv(name: string): XY[] {
  return readFileSync(join(FX, 'csv_file', name), 'utf8').trim().split('\n')
    .map((l) => { const [x, y] = l.split(',').map(Number); return { x, y }; })
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

function loadInput(): MapInput {
  const files = readdirSync(join(FX, 'csv_file'));
  const work = files.filter((f) => /^map\d+_work\.csv$/.test(f))
    .map((f) => ({ canonical: f.replace('_work.csv', ''), points: csv(f) }));
  const obstacles = files.filter((f) => /_obstacle\.csv$/.test(f))
    .map((f) => ({ parentMap: (f.match(/^(map\d+)_/) || [])[1] ?? 'map0', points: csv(f) }));
  const unicom = files.filter((f) => /_unicom\.csv$/.test(f))
    .map((f) => ({ name: f.replace('.csv', ''), points: csv(f) }));
  const mi = JSON.parse(readFileSync(join(FX, 'csv_file/map_info.json'), 'utf8'));
  const cp = mi.charging_pose;
  return { workMaps: work, obstacles, unicom, chargingPose: { x: cp.x, y: cp.y, orientation: cp.orientation } };
}

describe('generateOccupancyGrid byte-identity vs firmware', () => {
  it('whole-area map.yaml matches', () => {
    const out = generateOccupancyGrid(loadInput());
    const expected = readFileSync(join(FX, 'map_files/map.yaml'), 'utf8');
    expect(out.whole.yaml).toBe(expected);
  });
  it('whole-area map.pgm matches byte-for-byte', () => {
    const out = generateOccupancyGrid(loadInput());
    const expected = readFileSync(join(FX, 'map_files/map.pgm'));
    const d = diffPgm(out.whole.pgm, expected);
    expect(d.equal, JSON.stringify(d)).toBe(true);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd server && npx vitest run src/__tests__/maps/occupancyGrid.test.ts`
Expected: FAIL with `generateOccupancyGrid: not implemented`.

- [ ] **Step 5: Commit**

```bash
git add server/src/maps/occupancyGrid.ts server/src/maps/__pgmDiff.ts server/src/__tests__/maps/occupancyGrid.test.ts
git commit -m "test(occupancy): byte-match harness + generator skeleton"
```

---

### Task 3: Reverse-engineer the rasterization → document it

**Files:**
- Create: `research/documents/mower-occupancy-grid-algorithm.md`

No code; this produces the algorithm spec the later tasks implement. Target binary:
`research/firmware/mower_firmware_v6.0.2/install/novabot_mapping/lib/novabot_mapping/novabot_mapping` (AArch64 ELF, not stripped).

- [ ] **Step 1: Load the binary in Ghidra (AArch64) and auto-analyze**

Import the binary, language `AARCH64:LE:64:v8A`, run auto-analysis. Confirm symbols are present (`file` shows "not stripped").

- [ ] **Step 2: Locate the save_map / OccupancyGrid generation path**

Search strings + symbols for: `map.pgm`, `map.yaml`, `.pgm`, `P5`, `occupied_thresh`, `free_thresh`, `OccupancyGrid`, `save_map`, `SaveMap`, `total map`, `Saving total map`, `map_saver`, `nav2`. Cross-reference to find the function that, on `save_map type:1`, writes the PGM/YAML. Note the call chain from the `decision_msgs/SaveMap` service handler.

- [ ] **Step 3: Extract and write down each rule in the doc**

Document, with the decompiled evidence (addresses/snippets) for each:
1. Grid geometry — resolution; origin = which bbox-min + padding/margin; width/height rounding.
2. Cell values — exact predicate for free(254) / occupied(0) / unknown(205).
3. Boundary treatment — is the polygon edge drawn as an occupied wall, and with what thickness/inflation.
4. Dock / charging-pose — how free space at/around the dock and the dock→zone route is produced.
5. Unicom channels — whether/how they are rasterized (polyline width / dilation).
6. Whole `map.pgm` vs per-map `mapN.pgm` — merge rule + per-map contents.
7. PGM/YAML encoding — P5 row order, value mapping, exact YAML text + numeric precision.

- [ ] **Step 4: Commit the writeup**

```bash
git add research/documents/mower-occupancy-grid-algorithm.md
git commit -m "docs(re): novabot_mapping occupancy-grid rasterization algorithm"
```

---

### Task 4: Implement grid geometry + YAML (drive the yaml test green)

**Files:**
- Modify: `server/src/maps/occupancyGrid.ts`

- [ ] **Step 1: Implement geometry + YAML emission per the Task-3 doc**

In `generateOccupancyGrid`, compute width/height/origin exactly as documented (bbox + padding + rounding from §1) and emit `whole.yaml` as the exact text/precision from §7 (e.g. `image`, `resolution`, `origin: [x, y, theta]`, `negate`, `occupied_thresh`, `free_thresh`). Return a zero-filled `pgm` of the correct dimensions for now so the yaml test can run.

- [ ] **Step 2: Run the yaml test**

Run: `cd server && npx vitest run src/__tests__/maps/occupancyGrid.test.ts -t "map.yaml matches"`
Expected: PASS. (If FAIL, the diff is plain string mismatch — fix precision/field order per §1/§7, re-run.)

- [ ] **Step 3: Commit**

```bash
git add server/src/maps/occupancyGrid.ts
git commit -m "feat(occupancy): grid geometry + byte-exact map.yaml"
```

---

### Task 5: Implement base cell fill — free / occupied / unknown

**Files:**
- Modify: `server/src/maps/occupancyGrid.ts`

- [ ] **Step 1: Implement the documented free/occupied/unknown predicate (§2) into the PGM buffer**

Fill the `whole.pgm` data per §2 (e.g. point-in-polygon for free interior, obstacle polygons → occupied, else unknown), using the P5 row order from §7.

- [ ] **Step 2: Run the pgm byte-match test, read the diff**

Run: `cd server && npx vitest run src/__tests__/maps/occupancyGrid.test.ts -t "map.pgm matches"`
Expected: still FAIL, but the `diffPgm` JSON now reports the first divergent pixel `(x,y,a,b)`. Use it to confirm the base fill is right where it should be (interior pixels match) and isolate the remaining differences to boundary/dock/unicom (handled in Tasks 6–8).

- [ ] **Step 3: Commit**

```bash
git add server/src/maps/occupancyGrid.ts
git commit -m "feat(occupancy): base free/occupied/unknown fill"
```

---

### Task 6: Implement boundary-wall treatment

**Files:**
- Modify: `server/src/maps/occupancyGrid.ts`

- [ ] **Step 1: Apply the §3 boundary rule (draw the boundary edge as occupied with the documented thickness/inflation)**

Implement exactly as documented in §3.

- [ ] **Step 2: Run the pgm test; verify border pixels now match**

Run: `cd server && npx vitest run src/__tests__/maps/occupancyGrid.test.ts -t "map.pgm matches"`
Expected: the `diffPgm` first-divergence moves OFF the boundary ring (border pixels match). Remaining diffs should localize to the dock area / channels.

- [ ] **Step 3: Commit**

```bash
git add server/src/maps/occupancyGrid.ts
git commit -m "feat(occupancy): boundary-wall rasterization"
```

---

### Task 7: Implement dock / charging-pose free area

**Files:**
- Modify: `server/src/maps/occupancyGrid.ts`

- [ ] **Step 1: Apply the §4 dock rule (free area/corridor at the charging pose)**

Implement exactly as documented in §4 (this is what makes the dock-outside-polygon reachable — the original Error-125 cause).

- [ ] **Step 2: Run the pgm test; verify the dock region matches**

Run: `cd server && npx vitest run src/__tests__/maps/occupancyGrid.test.ts -t "map.pgm matches"`
Expected: `diffPgm` first-divergence moves off the dock region.

- [ ] **Step 3: Commit**

```bash
git add server/src/maps/occupancyGrid.ts
git commit -m "feat(occupancy): dock/charging-pose free area"
```

---

### Task 8: Implement unicom-channel rasterization

**Files:**
- Modify: `server/src/maps/occupancyGrid.ts`

- [ ] **Step 1: Apply the §5 unicom rule (rasterize channels as free, with the documented width/dilation)**

Implement exactly as documented in §5. Handle empty unicom CSVs (no points) as a no-op.

- [ ] **Step 2: Run the pgm test — expect whole-area byte-identical**

Run: `cd server && npx vitest run src/__tests__/maps/occupancyGrid.test.ts -t "map.pgm matches"`
Expected: PASS (`diffPgm` equal). If not, the JSON localizes the last divergence; refine the responsible rule.

- [ ] **Step 3: Commit**

```bash
git add server/src/maps/occupancyGrid.ts
git commit -m "feat(occupancy): unicom-channel free paths — whole map.pgm byte-identical"
```

---

### Task 9: Per-map `mapN.*` output + whole-area merge

**Files:**
- Modify: `server/src/maps/occupancyGrid.ts`
- Modify: `server/src/__tests__/maps/occupancyGrid.test.ts`

- [ ] **Step 1: Add per-map assertions to the test**

```ts
  it('per-map mapN.yaml + mapN.pgm match byte-for-byte', () => {
    const out = generateOccupancyGrid(loadInput());
    for (const m of out.perMap) {
      const yaml = readFileSync(join(FX, `map_files/${m.name}.yaml`), 'utf8');
      expect(m.file.yaml, `${m.name}.yaml`).toBe(yaml);
      const pgm = readFileSync(join(FX, `map_files/${m.name}.pgm`));
      const d = diffPgm(m.file.pgm, pgm);
      expect(d.equal, `${m.name}.pgm ${JSON.stringify(d)}`).toBe(true);
    }
  });
```

- [ ] **Step 2: Run to verify it fails (perMap empty)**

Run: `cd server && npx vitest run src/__tests__/maps/occupancyGrid.test.ts -t "per-map"`
Expected: FAIL (no perMap entries yet).

- [ ] **Step 3: Implement per-map generation per §6**

Populate `perMap` per the documented §6 rule (per-zone polygon + its obstacles + its channel, and whatever the whole-vs-per-map merge rule is).

- [ ] **Step 4: Run the full test file**

Run: `cd server && npx vitest run src/__tests__/maps/occupancyGrid.test.ts`
Expected: PASS — whole + all `mapN` byte-identical.

- [ ] **Step 5: Commit**

```bash
git add server/src/maps/occupancyGrid.ts server/src/__tests__/maps/occupancyGrid.test.ts
git commit -m "feat(occupancy): byte-identical per-map mapN.yaml/pgm"
```

---

### Task 10: PNG output

**Files:**
- Modify: `server/src/maps/occupancyGrid.ts`
- Modify: `server/src/__tests__/maps/occupancyGrid.test.ts`

- [ ] **Step 1: Add a PNG assertion (only if §7 documents the exact PNG encoding the firmware uses)**

```ts
  it('whole-area map.png matches', () => {
    const out = generateOccupancyGrid(loadInput());
    const expected = readFileSync(join(FX, 'map_files/map.png'));
    expect(out.whole.png && Buffer.compare(out.whole.png, expected)).toBe(0);
  });
```

- [ ] **Step 2: Implement PNG emission per §7**

Encode the same grid as PNG matching the firmware's encoder settings from §7. If byte-identical PNG proves impractical (encoder library/version differences), downgrade this test to "PNG decodes to the same pixel matrix" and note the deviation in the spec — PNG is visualization-only, not coverage-critical.

- [ ] **Step 3: Run + commit**

Run: `cd server && npx vitest run src/__tests__/maps/occupancyGrid.test.ts`
Expected: PASS.
```bash
git add server/src/maps/occupancyGrid.ts server/src/__tests__/maps/occupancyGrid.test.ts
git commit -m "feat(occupancy): map.png output"
```

---

### Task 11: Integrate as the single costmap generator

**Files:**
- Modify: `server/src/maps/walkerBundleImporter.ts:156-274`
- Modify: `tools/opennova-restore/cloud-to-bundle.mjs`
- Delete: `server/src/maps/polygonRasterizer.ts` (after no caller remains)

- [ ] **Step 1: Swap `walkerBundleImporter` to the new generator**

Replace the `rasterizePolygon(...)` call + the manual `map_files` appends with `generateOccupancyGrid(input)`, writing `whole` to `mower/map_files/map.{yaml,pgm,png}` and each `perMap` to `mower/map_files/<name>.{yaml,pgm,png}`. Build the `MapInput` from the transformed polygons/obstacles/unicom + `currentDockPose`.

- [ ] **Step 2: Run the existing walker-import tests**

Run: `cd server && npx vitest run` (filter to the import/portable tests).
Expected: PASS (adjust any fixture-shape expectations that referenced the old polygon-only raster).

- [ ] **Step 3: Port `cloud-to-bundle.mjs` to the generator + drop free-fill**

Replace the inline `rasterize(...)` (free-fill) with a call into the compiled generator (or a shared port), producing `map.{yaml,pgm}` + `mapN.*`. Remove the `freeFill` path.

- [ ] **Step 4: Delete `polygonRasterizer.ts` and fix imports**

Run: `cd server && grep -rl polygonRasterizer src | grep -v dist` → expect no results after edits. Then `git rm server/src/maps/polygonRasterizer.ts server/src/__tests__/maps/polygonRasterizer.test.ts`.

- [ ] **Step 5: tsc + full suite + commit**

Run: `cd server && npx tsc --noEmit && npx vitest run`
Expected: clean + all pass.
```bash
git add -A && git commit -m "feat(occupancy): use faithful generator everywhere; retire polygonRasterizer + free-fill"
```

---

### Task 12: End-to-end validation on the real (David) multi-zone case

**Files:** none (validation only)

- [ ] **Step 1: Regenerate David's bundle with the faithful generator**

Run:
```bash
node tools/opennova-restore/cloud-to-bundle.mjs --email <ramon-lfi-email> --password <pw> \
  --sn LFIN2231000633 --out ~/Downloads/LFIN2231000633_restore_v3.novabotmap
unzip -l ~/Downloads/LFIN2231000633_restore_v3.novabotmap | grep map_files
```
Expected: `mower/map_files/map.{yaml,pgm,png}` + `map0/map1/map2.{yaml,pgm,png}` present, with dimensions/headers consistent with the fixtures' rules.

- [ ] **Step 2: Hand off for on-mower test**

David imports v3 via admin "Import bundle..." → apply-verbatim → (frame already aligned; no re-dock) → start Zone1. Acceptance: coverage planner produces a path (no Error 125) and the mower mows within Zone1. Capture `robot_decision` + `coverage_planner_server` logs to confirm.

- [ ] **Step 3: Note the result in the spec's status**

Update `docs/superpowers/specs/2026-05-26-mower-occupancy-grid-re-design.md` status line to reflect validated/working, and `git commit`.

---

## Self-review

**Spec coverage:** RE writeup (Task 3 → spec §"What the RE must determine"); generator module + interface (Tasks 2,4–10 → spec §"Generator interface"); each RE rule geometry/free-occ/boundary/dock/unicom/per-map (Tasks 4–9 → spec §RE rules 1–6); PGM/YAML encoding (Tasks 4,5,10 → rule 7); ground-truth harness (Task 1 → spec §2); byte-match tests (Task 2,9 → spec §Validation); integration + retire old (Task 11 → spec §Integration + Deliverables); free-fill stays as stopgap until done (Task 12 handoff → spec §fallback). PNG lower-criticality handled (Task 10 downgrade clause → spec scope note). No gaps.

**Placeholder scan:** The only non-literal code is the RE-derived rasterization in Tasks 5–8/9 — this is inherent to an RE plan and is bounded by a concrete acceptance (byte-identical to the committed fixture) plus the Task-3 doc as the source of the rules. All harness/interface/integration code is literal. `<ramon-lfi-email>`/`<pw>` in Task 12 are runtime secrets, intentionally not committed.

**Type consistency:** `MapInput`/`GeneratedMap`/`GridFile`/`XY` defined in Task 2 are used unchanged in Tasks 4–11. `generateOccupancyGrid(input: MapInput): GeneratedMap` signature consistent throughout. `diffPgm`/`parsePgm` from `__pgmDiff.ts` used in Tasks 2 and 9.
