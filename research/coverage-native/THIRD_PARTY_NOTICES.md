# Coverage Native Third-Party Notices

The OpenNova native coverage planner is built from OpenNova vendor-glue code plus
selected open-source ETH/CGAL coverage-planning components. It is bundled as:

```text
/opt/opennova/bin/coverage_grid_plan
```

## ETH polygon_coverage_planning

Source in this repository:

```text
research/coverage-native/eth/
```

Upstream project:

```text
polygon_coverage_planning
```

The ETH package files identify the geometry and solver packages as GPL. The
upstream repository license text is included at:

```text
research/coverage-native/eth/LICENSE
```

The OpenNova Docker image copies that license text to:

```text
/opt/opennova/share/licenses/coverage-native/GPL-3.0.txt
```

## CGAL

The Docker build pins CGAL to version 5.0.3 and installs it from the upstream
source tag. The native planner uses CGAL Epeck/Core through the ETH geometry
code. Several CGAL packages used by the ETH geometry are GPL-covered, so the
bundled native planner is treated as GPL-3.0-covered.

## OpenCV

The Docker build links against Ubuntu 20.04 OpenCV 4.2 component packages:

- `opencv_core`
- `opencv_imgproc`
- `opencv_imgcodecs`

OpenCV is used only for the vendor-glue preprocessing and contour bridge.

## Scope Note

The current `coverage_grid_plan` target links the ETH geometry modules and the
small solver files listed in `research/coverage-native/CMakeLists.txt`. It does
not link the ETH memetic GTSP solver.
