# Faithful Mower Occupancy-Grid Generator (RE) — Design

**Date:** 2026-05-26
**Status:** Design approved, pending implementation plan
**Goal:** Reverse-engineer how the Novabot mower firmware (`novabot_mapping`) turns
boundary CSVs into the Nav2 occupancy grid (`map.yaml`/`map.pgm`/`map.png` +
per-map `mapN.*`) during `save_map type:1`, and reimplement that rasterization
**byte-identically** server-side. This lets cloud/polygon-only restores (where
the real raster is absent) produce a costmap identical to what the mower itself
would create, fixing coverage-planner **Error 125 "No valid path"** without the
crude free-fill workaround.

## Why

The OpenNova portable-restore + cloud-import flows have the boundary **polygons**
(local meters, charger-relative) but NOT the mower-generated occupancy raster
(the cloud/OSS stores only CSVs; a freshly-wiped or never-backed-up mower has no
`map.pgm`). Documented as Gap 2 in `research/documents/map-restore-flow-and-gaps.md`.

Two stopgaps were tried and rejected as the final answer:
- **Polygon-interior-only raster** (`polygonRasterizer.ts`): marks only the work
  polygon interior as free. The dock sits OUTSIDE the work polygons (charger at
  the edge — verified: dock `(0.012, -0.174)` is outside all 3 of David's zones),
  so the mower starts in "unknown" space → coverage planner finds no path → Error 125.
- **Free-fill** (everything drivable except obstacles): makes coverage plan, but
  loses real boundaries → transit relies on perception only; not faithful.

The faithful fix is to generate the SAME grid the firmware does.

## Decisions (from brainstorming)

- **Fidelity:** pixel-identical (byte-for-byte) to the firmware output. NOT merely
  functionally-equivalent.
- **Approach:** A — static decompilation + reimplementation, validated byte-for-byte
  against ground-truth pulled from a working mower. (B = qemu-emulate the firmware
  rasterizer: theoretically most faithful but operationally too heavy — the rasterizer
  is embedded in a ROS2 node; kept only as a last-resort fallback for a single
  un-RE-able detail. C = empirical-only rule derivation: used as a localized tactic
  inside A's validation loop, not as the whole approach.)
- **Ground-truth source:** live `LFIN1231000211` (Ramon's working mower) via SSH —
  pull its real `csv_file/` inputs + firmware-generated `map.*` / `mapN.*` outputs.
- **RE target binary:** `novabot_mapping` (AArch64 ELF, not stripped) at
  `research/firmware/mower_firmware_v6.0.2/install/novabot_mapping/lib/novabot_mapping/novabot_mapping`.

## Architecture & components

**1. RE phase (one-time analysis).** Ghidra on `novabot_mapping`. Find the
`SaveMap type:1` handler → the function that builds a `nav_msgs/OccupancyGrid`
from the boundary CSVs and writes PGM/YAML. Document the algorithm in
`research/documents/mower-occupancy-grid-algorithm.md`.

**2. Ground-truth harness.** From `LFIN1231000211` (SSH) pull one or more complete
sets: exact `csv_file/` (work + obstacles + unicom + `map_info.json`) +
`charging_station.yaml` PLUS the firmware-generated `map.yaml/pgm/png` and
`mapN.*`. Store as committed test fixtures. This is the byte-match target.

**3. Server-side generator (deliverable).** New module `server/src/maps/occupancyGrid.ts`,
pure (inputs in, buffers out; no I/O), implementing the RE'd algorithm to produce
output byte-identical to the firmware.

**4. Integration.** Becomes the single costmap generator — replaces the
polygon-only `polygonRasterizer.ts` and the crude free-fill in `cloud-to-bundle.mjs`.
Used by the cloud-restore recovery tool, the walker import
(`synthesizePortableFromWalker`), and the portable export. The bundle's
`mower/map_files/` is filled from it; `apply-verbatim` ships it to the mower.

## What the RE must determine (each validated byte-for-byte)

1. **Grid geometry** — resolution (YAML shows `0.050`, confirm), how `origin` is
   computed (bbox-min of which set + how much padding/margin), width/height rounding.
2. **Cell values** — exact rules for free (254), occupied (0), unknown (205):
   - free: polygon interior only? + dock area? + unicom channels? dilation radius?
   - occupied: obstacles only? + boundary drawn as a wall line? + inflation ring?
   - unknown: everything else (outside)?
3. **Boundary treatment** — is the boundary edge drawn as an occupied wall (with
   thickness) or is free simply the interior?
4. **Dock / charging-pose** — the crux of the failure: how does the dock (outside
   the work polygon) become reachable? Free corridor/disk at the charging pose, or
   unicom channels rasterized as free?
5. **Unicom channels** — rasterized as free paths (dilated polylines)? what width?
6. **Whole-area `map.pgm` vs per-map `mapN.pgm`** — does `map.pgm` merge all zones
   or hold the "active" one? Are `mapN` per-zone (zone N + its obstacles + its
   channel to dock)?
7. **PGM/YAML encoding** — P5 binary, row order, value mapping (likely standard
   Nav2 `map_saver`), and exact YAML text/precision (`origin`, `negate`,
   `occupied_thresh`/`free_thresh`) — byte-match needs identical text.

## Generator interface

```ts
interface XY { x: number; y: number }
interface MapInput {
  workMaps:  { canonical: string; points: XY[] }[];   // local meters, charger-relative
  obstacles: { parentMap: string; points: XY[] }[];
  unicom:    { name: string; points: XY[] }[];
  chargingPose: { x: number; y: number; orientation: number };
}
interface GeneratedMap {
  whole:  { yaml: string; pgm: Buffer; png?: Buffer };               // map.yaml/pgm/png
  perMap: { name: string; yaml: string; pgm: Buffer; png?: Buffer }[]; // mapN.*
}
function generateOccupancyGrid(input: MapInput): GeneratedMap;
```

Output scope: `map.yaml`+`pgm` (essential, fixes 107), `mapN.yaml`+`pgm` (per-map
coverage). `.png` included because pixel-identity implies it, but lower criticality
(coverage works without PNG).

## Data flow

CSVs (local meters) + charging pose → `generateOccupancyGrid` (RE'd algorithm) →
`map.pgm/yaml/png` + `mapN.*` → bundle `mower/map_files/` → `apply-verbatim` →
mower → coverage planner reads it → mows.

## Validation & testing

- **Fixtures:** committed `csv_file/` inputs + firmware `map.*`/`mapN.*` outputs from
  `LFIN1231000211` under `server/src/__tests__/fixtures/occupancy/<sn>/`.
- **Byte-identical test (vitest):** feed fixture CSV inputs into `generateOccupancyGrid`,
  assert output PGM bytes === fixture PGM bytes and YAML text === fixture YAML, for
  `whole` and each `mapN`. A diff helper reports the first divergent byte/region to
  localize RE gaps.
- **Iteration = plan structure:** per rule (geometry → free/occupied → boundary →
  dock → unicom → per-map): decompile → derive rule → implement → run byte-test →
  diff → refine → until green.
- **Multi-zone:** `LFIN1231000211` provides real multi-map fixtures to validate
  per-map + whole-area (mirrors David's 3-zone case).
- **Edge cases:** empty unicom, obstacles, single vs multi zone.

## Error handling / fallback

- A rule that can't be fully RE'd statically (inlining/obfuscation): pin it
  empirically via the byte-diff + ground-truth (C as a localized tactic).
- If RE genuinely stalls on one detail: document it; qemu-emulation (B) remains a
  last-resort fallback for that piece only.
- **David stays on the free-fill v2 stopgap** (working) until the faithful generator
  is implemented and byte-validated, so he is never blocked by this effort.

## Out of scope

- `covered_path/` / `planned_path/` history (Gap 9, low priority).
- `pos.json` handling (Gap 1 — separate concern; the dock-cycle re-anchors).
- Changing the firmware itself (we only replicate its output server-side).

## Deliverables

- `research/documents/mower-occupancy-grid-algorithm.md` — RE writeup.
- `server/src/maps/occupancyGrid.ts` — the generator.
- `server/src/__tests__/fixtures/occupancy/...` + byte-match vitest tests.
- Integration into `cloud-to-bundle`, `synthesizePortableFromWalker`, portable export
  (retire `polygonRasterizer.ts`'s polygon-only fill + the free-fill).
