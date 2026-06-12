# Coverage-Planner Native Port — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or executing-plans to implement this plan phase-by-phase. Steps use checkbox (`- [ ]`) tracking.

**Goal:** Generate the mower's lawn-coverage path off-device, vertex-for-vertex identical to the firmware, as our OWN code (no proprietary firmware binary shipped) — by linking the open-source ETH `polygon_coverage_planning` geometry core and reimplementing only the vendor "glue" recovered from the firmware RE.

**Architecture:** A native C++ module (`coverage_native`) = stock ETH geometry (BCD/sweep/visibility on CGAL Epeck) + a reimplemented vendor layer (`BsdTspPlanner` orchestration, `CoveragePlannerInterface` OpenCV preprocessing, `pathAssessFunction` TSP cost, `removeSelfIntersection`, `RosMapWorldConverter`). The lean binary-replay container (already built, `research/coverage-replay/`) is the GROUND-TRUTH ORACLE: every component is validated by diffing against the firmware's own output.

**Tech Stack:** C++17, CGAL 5.0.3 (Epeck, `Core`), OpenCV 4.2, plain CMake (no catkin/ROS). Packaged for OpenNova as an N-API addon or a CLI child-process; built natively for x86_64 + arm64 (no qemu — it's our code).

**Why exactness is achievable:** the part that is hard to reproduce bit-for-bit (CGAL exact-rational decomposition/sweep/routing) is NOT reproduced — it is the same ETH library on the same Epeck kernel. The reimplemented glue is deterministic OpenCV + integer/double arithmetic whose formulas are already recovered (`research/documents/coverage-planner-reverse-engineering.md`).

---

## Source map

| Layer | Source | Action |
|---|---|---|
| BCD/TCD decomposition | ETH `polygon_coverage_geometry/src/{bcd,tcd,decomposition}.cc` | **link as-is** |
| Boustrophedon sweep | ETH `sweep.cc` | **link as-is** |
| Best sweep direction | ETH `decomposition.cc` `findBestSweepDir` | **link as-is** |
| Visibility graph / routing | ETH `visibility_graph.cc`, `polygon_coverage_solvers/graph_base` | **link as-is** |
| CGAL helpers, offset, boolean, triangulation | ETH `cgal_comm.cc`, `offset.cc`, `boolean.cc`, `triangulation.cc`, `visibility_polygon.cc` | **link as-is** |
| Param→pixel + OpenCV preprocess | vendor `CoveragePlannerInterface` | **reimplement** (RE'd: trunc(m/0.05); erode 25/3px; MORPH_ELLIPSE; open 1/1/2) |
| Grid→polygon bridge | vendor `findContours` + `removeSelfIntersection` + `approxPolyDP` | **reimplement** (OpenCV 4.2 same lib) |
| Orchestration | vendor `BsdTspPlanner::makePlan/getPlan` | **reimplement** |
| Cell visit order (TSP) | vendor `pathAssessFunction` (+ `calculatePathLength`, `calculateRotations`) | **reimplement** (3 weights from RE) |
| Grid↔world | vendor `RosMapWorldConverter::mapToWorld` | **reimplement** (origin + (mx+0.5)*res, y-flip) |
| Boundary follow (edge) | vendor `BoundaryFollowPlanner` | **reimplement** (phase 3, optional) |

ETH is GPL — the resulting module is GPL-3.0. Acceptable for OpenNova (local-cloud replacement); document it.

---

## Phase 0 — Build foundation (de-risk first)

**Files:**
- Create: `research/coverage-native/CMakeLists.txt`, `research/coverage-native/Dockerfile.build`
- Use: cloned ETH at `research/coverage-native/eth/`

- [ ] **Step 1:** Build CGAL 5.0.3 + OpenCV 4.2 image (Ubuntu 20.04 has OpenCV 4.2; pin CGAL 5.0.3 from source or apt `libcgal-dev` if 5.0.x).
- [ ] **Step 2:** De-ROS `polygon_coverage_geometry` + `polygon_coverage_solvers`: replace `ros/console.h` `ROS_*` macros with no-op/`std::cerr`; drop catkin; write a plain CMake that compiles the `.cc` set into `libcoverage_geometry.a`.
- [ ] **Step 3:** Compile a smoke test: build a `PolygonWithHoles` (Epeck), call `computeBestBCDFromPolygonWithHoles` + `computeSweep`, print cell count. Verify it links + runs.
- [ ] **Step 4:** Decision gate — if CGAL/ETH builds clean and the smoke test runs, proceed; else evaluate CGAL version pinning (5.0.3 vs distro) for result stability.

## Phase 1 — Oracle dataset (from the lean replay)

**Files:**
- Create: `research/coverage-native/oracle/gen_oracle.sh`, `research/coverage-native/oracle/cases/*.pgm`

- [ ] **Step 1:** Collect input pgms: the `debug_sh` maps + the adversarial ones named in the binary (`self_intersection/house_map`, `collinear_map_11inflation`, `dead_cycle_map`, `narrow_and_self_intersection`) + a live capture from LFIN1231000211 (current `mapN.pgm`).
- [ ] **Step 2:** For each pgm × {several starts} × {specify_direction 0, and cov_direction 0/45/90}, run `cov-replay-lean` → store grid-path JSON as golden.
- [ ] **Step 3:** Also capture the WORLD-coord goldens: run the production `CoverageRos2Adapter` path (or scp a live `current_planned_path.json` + its pgm) for end-to-end world validation.

## Phase 2 — Vendor glue port (validate each vs oracle)

**Files:**
- Create: `research/coverage-native/src/{params,preprocess,contour_bridge,planner,tsp,world_convert}.cc/.h`

- [ ] **Step 1 — params/preprocess:** Port `setCoverageParam` + `preprocessMap` (OpenCV `getStructuringElement(MORPH_ELLIPSE, N)` + `morphologyEx(OPEN)` + `bitwise_and`). Test: preprocessed Mat md5 == replay's internal (instrument the replay once to dump it) for the battery.
- [ ] **Step 2 — contour bridge:** Port `findContours` (area>200 filter, discovery order) + `removeSelfIntersection` (recursive `pointToLineMinGridDis` snip) + `approxPolyDP` → `PolygonWithHoles`. Test: polygon vertex sets match per pgm.
- [ ] **Step 3 — decomposition+sweep:** Wire the polygon into ETH `computeBestBCDFromPolygonWithHoles` (specify_direction false → enumerate; true → angle = covDir·π/180 + π/2) + per-cell `computeSweep` at pitch = `coverage_length()` (3px). Test: per-cell stripe set == oracle (grid).
- [ ] **Step 4 — TSP order:** Port `pathAssessFunction(map, w1, w2, w3)` over `calculatePathLength` + `calculateRotations`; reproduce the cell visit order + start-cell selection. Test: ordered cell sequence == oracle for matching start.
- [ ] **Step 5 — world transform:** Port `RosMapWorldConverter::mapToWorld` (origin + (mx+0.5)*res, y-flip). Test: world coords == world-oracle (2-dp).

## Phase 3 — Integration + exactness validation

- [ ] **Step 1:** Full pipeline `generateCoveragePlan(pgm, startPose, {specify_direction, cov_direction})` → world path JSON in `planned_path.json` format.
- [ ] **Step 2:** Differential harness: for every oracle case, assert T2 vertex/order equality (identical cell keys; per cell identical ordered vertex list to 2-dp). Iterate the glue until green on the WHOLE battery, especially the adversarial maps (where double-rounding/`findContours`/introsort tie-breaks bite).
- [ ] **Step 3:** Lock: pin CGAL/OpenCV versions; record a regression corpus; CI runs the differential harness.

## Phase 4 — OpenNova integration + packaging

- [ ] **Step 1:** Expose `generateCoveragePlan` as an N-API addon (or a static CLI the server spawns).
- [ ] **Step 2:** Wire into the server: `occupancyGrid.ts` → `mapN.pgm` → native planner → path; cache by `md5(pgm)+start+params`. Add the `pgm-md5` gate (server pgm must equal on-device `mapN.pgm`).
- [ ] **Step 3:** Build for x86_64 + arm64 (multi-arch), bundle into the OpenNova image. No firmware binary, no qemu.

---

## Risks
- **CGAL version drift:** exact-construction results are stable for the same algorithm, but pin 5.0.3 to be safe; a different CGAL minor *could* alter degenerate-case resolution. Validate against the oracle, not assumptions.
- **`removeSelfIntersection` / `findContours` / introsort tie-breaks:** the known divergence points (RE doc). These are why we validate on the adversarial maps; they are reimplemented to match, not approximated.
- **pgm substrate must match on-device** (`per-map-pgm-coverage-bug.md`): the server `occupancyGrid.ts` masking must equal the mower's `regenerate_per_map_files` output, else the plan differs regardless of planner correctness.
- **Start pose:** the path's cell order is start-dependent; end-to-end world validation needs the same start the mower used (live capture).

## Effort
High — estimate ~2–4 weeks: Phase 0 ~2–3 days (build is the gate), Phase 2 the bulk, Phase 3 the long-tail (adversarial exactness). The oracle (Phase 1) makes it measurable, not guesswork.
