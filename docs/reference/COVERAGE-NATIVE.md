# Coverage Native Planner

This document tracks the OpenNova native coverage planner port. The intent is to
generate Novabot coverage paths off-device without shipping or invoking the
proprietary mower firmware binary.

## Runtime Packaging

The normal OpenNova Docker image builds the planner in `Dockerfile` stage
`coverage-native` and copies the resulting executable into the runtime image:

```text
/opt/opennova/bin/coverage_grid_plan
```

The server discovers it through:

```text
COVERAGE_NATIVE_BIN=/opt/opennova/bin/coverage_grid_plan
```

This is a native binary inside the OpenNova container. It is not a sidecar
container, it does not call the firmware binary, and it does not require qemu at
runtime.

The image also contains third-party notices at:

```text
/opt/opennova/share/licenses/coverage-native/
```

## Version Pins

The exactness-sensitive dependency stack is pinned in the Docker build:

| Component | Version | Source |
|---|---:|---|
| Ubuntu | 20.04 | Docker base image |
| CGAL | 5.0.3 | downloaded from upstream tag `v5.0.3` |
| OpenCV | 4.2 | Ubuntu 20.04 component packages |
| C++ | C++17 | plain CMake/Ninja build |

CGAL is installed from source into `/opt/cgal-5.0.3`. OpenCV is linked from the
Ubuntu 20.04 component packages (`core`, `imgproc`, `imgcodecs`) so the native
planner uses the same OpenCV 4.2 family as the firmware analysis expects.

## What Is Reused

The exact CGAL geometry is not reimplemented. The native binary links the
de-ROSed ETH `polygon_coverage_planning` geometry core:

- BCD/TCD decomposition
- boustrophedon sweep
- sweep direction selection
- visibility graph routing
- CGAL boolean, offset, triangulation, visibility helpers

This preserves the Epeck/CGAL behavior where vertex-level drift would be hardest
to reproduce.

## What Is Reimplemented

The vendor glue recovered from firmware reverse engineering is implemented in
`research/coverage-native/src/`:

- coverage params to pixel params
- OpenCV preprocessing
- `findContours` bridge plus self-intersection removal
- `BsdTspPlanner` orchestration
- TSP/path assessment weights
- grid to world transform

The server integration is in `server/src/services/coveragePlanService.ts` and
the dashboard preview route is:

```text
POST /api/dashboard/native-preview-path/:sn
```

## Oracle Status

The oracle corpus lives in `research/coverage-native/oracle/` and is verified by:

```bash
research/coverage-native/oracle/verify_oracle.sh
```

The native CMake test suite runs:

```bash
ctest --output-on-failure
```

The OpenNova Docker build also runs the native CTest suite and `coverage_smoke`
before copying `coverage_grid_plan` into the runtime image.

## Licensing

The native coverage planner is GPL-covered because it links ETH
`polygon_coverage_planning` and CGAL components that are GPL-licensed.
OpenNova therefore treats the bundled native planner as GPL-3.0-covered source.

The complete ETH GPL license text is stored in:

```text
research/coverage-native/eth/LICENSE
```

Runtime image copies are stored under:

```text
/opt/opennova/share/licenses/coverage-native/GPL-3.0.txt
/opt/opennova/share/licenses/coverage-native/THIRD_PARTY_NOTICES.md
```

The current native build links the ETH geometry plus the small solver files
listed in `research/coverage-native/CMakeLists.txt`. It does not link the ETH
memetic GTSP solver.

## Remaining Exactness Gates

Two gates remain intentionally blocked rather than guessed around:

| Beads issue | Status | Gate |
|---|---|---|
| `Novabot-828` | blocked | adversarial PGM fixtures referenced by the firmware binary are not present locally |
| `Novabot-efu` | blocked | byte-identical occupancy-grid proof needs a live post-`expandPolygon` `save_map type:1` capture |

Do not replace these with approximations. Unblock `Novabot-828` only when the
missing fixtures are recovered. Unblock `Novabot-efu` only with explicit approval
for a live capture window, or with a non-mutating source of the exact
post-processed polygon plus matching `map.pgm`/`map.yaml`.
