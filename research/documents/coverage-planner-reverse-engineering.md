# Mower Coverage-Path Planner — Reverse-Engineering & Exact-Replication Spec

Status: authoritative. Sources: 5 RE agents on `install/coverage_planner/lib/libcoverage_planner_ros2.so` (BuildID `54737a90…`), the shipped harness `coverage_planner_dedug_main` (BuildID `da524dae…`), and on-disk fixtures in `research/firmware/mower_firmware_6.0.3/debug_sh/`. Front-half (pgm generation) is already implemented and fixture-validated in `server/src/maps/occupancyGrid.ts`.

## 1. TL;DR / Feasibility

The planner is the vendor `coverage_plan::BsdTspPlanner`, a thin wrapper over open-source **ethz-asl/polygon_coverage_planning v2.1.0** (CGAL 5.0.3 Epeck, GPL-3.0) operating on the **per-zone occupancy grid `mapN.pgm`**. There is **one** coverage pipeline (no grid-vs-CGAL runtime dispatch); edge/boundary cutting is a *separate* pure-grid `BoundaryFollowPlanner`.

**Exact off-device replication is realistic.** The recommended route is to **replay the real ARM64 binary off-device** on *our* generated `mapN.pgm`:
- The firmware ships `coverage_planner_dedug_main` (122 KB, ARM64 ELF, **not stripped**) which does `cv::imread(pgm)` → `BsdTspPlanner::setCoverageParam(12,1,3,-6,0)` → `makePlan` → `savePlannedPathToJson`, linking the **exact production** `libcoverage_planner_ros2.so`.
- Dependencies are stock Ubuntu 20.04 (focal) arm64: `libstdc++6`, `libgmp10`, `libmpfr6`, `libopencv_{core,imgproc,imgcodecs,highgui}.so.4.2`. Runnable under `docker run --platform linux/arm64` (qemu-user) on the Mac/x86.
- Output `current_planned_path.json` is **byte-identical** to on-device by construction.

A from-scratch **pure-TS** reimplementation can reproduce the *algorithm* and a visually-correct path, but should **not** be claimed vertex-exact, because the `cv::Mat→Polygon_2` bridge (`findContours` + `removeSelfIntersection` double-rounding + `approxPolyDP`) and `findBestSweepDir` depend on OpenCV-4.2 / libstdc++ behaviour.

## 2. Inputs and the Front-Half (already deterministic)

Per-zone grid `mapN.pgm` + `mapN.yaml` (`resolution 0.050000`, `origin [ox,oy,0]`, `negate 0`, `occupied_thresh 0.65`, `free_thresh 0.196`). FREE=254, OCCUPIED=0, unknown→-1. `unknown_as_free: true`.

`server/src/maps/occupancyGrid.ts` already reproduces this pgm byte-for-byte (validated vs LFIN1231000211 fixtures and documented in `mower-occupancy-grid-algorithm.md`). Per `per-map-pgm-coverage-bug.md`, the per-slot masking (FREE = slot work-polygon ∪ own unicoms ∪ dock-disc, everything else OCCUPIED) is the **critical** input — the coverage planner plans **on the pgm** (`coverage_ros2_adapter.cpp:154` "No coverage map, using obstacle map to plan"), so a wrong mask = a wrong plan. `md5sum map0.pgm map1.pgm` must **differ** per zone (identical = the custom-30..35 bug).

## 3. Param Conversion (metres → pixels) — fully recovered

`CoverageRos2Adapter::makePlan` divides each metre param by the grid resolution (`OccupancyGrid+0x30` float32 = 0.05) and rounds via AArch64 **`fcvtzs` = truncate toward zero** (NOT ceil/round):

| Param (YAML) | metres | /0.05 | fcvtzs (px) |
|---|---|---|---|
| `inflation_radius` | 0.61 | 12.2 | **12** (a1) |
| `planner_coverage_len` | 0.16 | 3.2 | **3** (a3 = stripe pitch) |
| `boundary_inflation_radius[0]` | 0.51 | 10.2 | 10 (boundary path) |
| `boundary_inflation_radius[1]` | 0.40 | 8.0 | 8 (boundary path) |

`a2 = 1` hardcoded on the coverage path (`mov w2,#1`); `a4 = 0xFA` (`mov w4,#-6`, sentinel); `a5 = unknown_as_free`.

> **`coverage_length: 0.21` is NOT used by the stripe path.** It feeds the separate `CoverageGridMap2D::setCoverageParam(double,double)` (`map_coverage_len`/`map_extend_size`). The realized stripe pitch is `planner_coverage_len 0.16/0.05 = 3.2 → 3 px = 0.15 m` — **0.01 m tighter** than requested (more overlap).

Evidence: `@0x34f15c-0x34f198` `ldr s0,[x19,#0x30]; fcvt d0,s0; fdiv; fcvtzs w3/w1; bl setCoverageParam`. Resolution-field proof via the `"… resolution: %.2f"` log loading `[x28+0x8]`.

## 4. `setCoverageParam(a1,a2,a3,a4,a5)` field derivations

`@0x34be88` (offsets verified vs getters):

| Offset | Field | Formula | Default px |
|---|---|---|---|
| +0x14 | `coverage_length` (STRIPE PITCH) | a3 | **3** |
| +0x18 | `obstacle_erode_value` | 2·a1+1 | **25** |
| +0x20 | `coverage_erode_value` | a3 | 1 (force odd) | **3** |
| +0x28 | `boundary_erode_value` | 2·a2+1 | 3 (cov) / 21 / 17 |
| +0x1c/+0x24/+0x2c | morph-open (obstacle/coverage/boundary) | const | 1 / 1 / 2 |

Disasm: `lsl w9,w1,#1; add w9,w9,#1` (2a1+1); `add w8,w3,w3,lsr#31; orr w8,w8,#1` (a3|1 odd); `lsl w6,w2,#1; add w6,w6,#1` (2a2+1); `mov w10,#2`.

## 5. Morphology (`preprocessMap`)

Kernel = `cv::getStructuringElement(MORPH_ELLIPSE, cv::Size(N,N), Point(-1,-1))`, square N×N where N = erode value px (the 2r+1 doubling already baked into N). `cv::morphologyEx(MORPH_OPEN=2)`. Wrapper runs it on the obstacle map (25, open 1), then the coverage map (3, open 1), then `cv::bitwise_and`. (Open question §10: ELLIPSE vs CROSS at N=3 — re-confirm via replay.)

## 6. Contours → CGAL polygon, BCD, Sweep

`BsdTspPlanner::getPlan` (`@0x2ff678`):
1. `cv::findContours`; keep contours with `cv::contourArea > 200.0 px²` (drops cells < ~0.5 m²); push indices in discovery order.
2. `coverage_plan::removeSelfIntersection` (recursive loop-snip via `pointToLineMinGridDis`) + `DoEdgesIntersect`; `approxPolyDP`; build Epeck `Polygon_with_holes_2` (largest = hull, rest = holes); `create_offset_polygons_2` inflates.
3. `computeBestBCDFromPolygonWithHoles` (sole caller @0x300d2c). **Default** `specify_direction=false`: `findPerpEdgeDirections` × `computeBCD` × `findBestSweepDir`, keep min-cost direction. **Specified**: `Direction_2` at `angle = cov_direction·(π/180) + π/2` (consts @0x35f950/0x35f958, ×100 truncate).
4. Per cell: `computeSweep` — `sortVerticesToLine`; perpendicular offset vector = `coverage_length()` = 3 cells; translate sweep `Line_2` each pass; `findSweepSegment` + `checkObservability`; **boustrophedon** alternating endpoints; `calculateShortestPath` over a `VisibilityGraph` (A*) connects stripe ends around holes/concavities. `computeAllSweeps` tries CW+CCW, keeps shorter. "extra"/"final" sweep close the far-edge band.

Per-cell output: `std::vector<StatusGridPos>`, where `StatusGridPos` = 8-byte POD `{int32 x@+0, int32 y@+4}` (no separate status byte despite the name).

## 7. Cell visit order ("TSP" — not a real TSP)

**One `std::sort`** of the surviving cell-index `vector<int>`, comparator `cv::contourArea(a) > cv::contourArea(b)` → **descending area, largest cell first**. No nearest-neighbour, no 2-opt, no permutation. Equal-area ties → libstdc++ introsort/findContours order (`std::sort` is not stable).

`pathAssessFunction` (`@0x2f8b70`) computes `cost = pathLength·0.05/0.4 + rotations·1.57/0.8` (≈ estimated seconds; `pathLength = Σ` intra-cell `hypot(dx,dy)`, `rotations = Σ` waypoint count) **exactly once, and only LOGS it** ("path_length:%d, rotations:%d, time_estimate:%lf"). It does **not** influence the emitted order. Weights: 0.05 (=res m/px), 0.4 (drive m/s), 1.57 (=π/2 rad/quarter-turn), 0.8 (turn rad/s).

`calculateDecompositionAdjacency` builds cell adjacency; cells are concatenated with collinear join-waypoint removal (`Collinear_2`; "cell N tail collinear with cell M…" logs).

## 8. Grid → World + Serialization (output format)

Per grid point: `topLeftOriginMapToWorld`: `py_flip = height-1-py`; `wx = (px+0.5)·res + ox`; `wy = (py_flip+0.5)·res + oy`. `pathToString` (`@0x345af0`): `"x y"` at **2 decimals**, comma-separated, no z/orientation, no trailing comma.

`savePlannedPathToJson` (`@0x4abd0`): JsonCpp object keyed by **area-id** (string), value = object keyed by **cell index** ("0".."N") → polyline string. Covered map keyed by area-id+100. Output: `/userdata/lfi/maps/home0/planned_path/current_planned_path.json` (compact FastWriter).

**Reference fixture** `debug_sh/planned_path/planned_path.json`: area `"1"`, **140 cells, 2598 vertices**, 2-decimal world metres, e.g. `"0" : "-9.42 28.73,-8.97 29.08,-8.82 29.13"`. Cells 3→4 share endpoint `-9.22 27.78` (stitching continuity confirmed).

## 9. Reimplementation & Validation

**Route 1 (exact, recommended):** arm64 Docker (focal) with OpenCV 4.2 + GMP/MPFR + the shipped `.so` and `coverage_planner_dedug_main`; feed it our `mapN.pgm`; parse the resulting `current_planned_path.json`. Byte-identical by construction.

**Route 2 (native port):** port ethz-asl/polygon_coverage_planning v2.1.0 verbatim (`bcd/tcd/sweep/decomposition/cgal_comm/visibility_*`) + reimplement the vendor bridge (`findContours→Polygon_2`, `removeSelfIntersection`, the 2-extra-arg `computeBestBCDFromPolygonWithHoles`, descending-area cell order, `BoundaryFollowPlanner`). CGAL 5.0.3 Epeck + Straight_skeleton + BSO + Arrangement_2 + Triangulation, GPL-3.0.

**Route 3 (TS preview, non-exact):** BCD + boustrophedon at pitch 3px + descending-area order; visualization only.

**Validation tiers:** T1 sha256 equality (replay route) → T2 vertex/order equality (2-dp) → T3 Hausdorff < 1 px (preview only). Differential-fuzz with the harness's own adversarial maps (`self_intersection/house_map.pgm`, `dead_cycle_map`, `collinear_map_11inflation`). Always md5-gate `mapN.pgm` against the on-device file first — a wrong mask guarantees a wrong plan.

## 10. Remaining Unknowns

ELLIPSE-vs-CROSS structuring element at N=3 (resolve via replay); exact `findBestSweepDir` objective; resolution-always-0.05 assumption; `a4=0xFA` semantics; libstdc++ tie-break for equal areas (non-issue on the same toolchain); which entry points set `specify_direction=true`; possible later upstream commit (native port only).

## 11. Key file references

- Binary: `research/firmware/mower_firmware_6.0.3/install/coverage_planner/lib/libcoverage_planner_ros2.so`
- Harness: `…/install/coverage_planner/lib/coverage_planner/coverage_planner_dedug_main`
- Params: `…/share/coverage_planner/params/coverage_planner_params.yaml`
- Golden: `…/debug_sh/planned_path/planned_path.json` + `…/debug_sh/map.pgm`
- Front-half: `server/src/maps/occupancyGrid.ts` (+ `__tests__/maps/occupancyGrid.test.ts`)
- Related docs: `research/documents/per-map-pgm-coverage-bug.md`, `mower-occupancy-grid-algorithm.md`