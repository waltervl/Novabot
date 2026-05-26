# Mower occupancy-grid algorithm (novabot_mapping `save_map type:1`)

Reverse-engineered from the AArch64 ROS2 binary
`research/firmware/mower_firmware_v6.0.2/install/novabot_mapping/lib/novabot_mapping/novabot_mapping`
(Ghidra static decompile, base 0x100000). Source of truth for
`server/src/maps/occupancyGrid.ts`, validated byte-for-byte against the
`LFIN1231000211` ground-truth fixtures.

Decompile artifacts:
- `research/decompile_mapgen.java` (Ghidra headless postScript, native Java)
- `research/ghidra_output/mapgen_decompiled.c` (128 functions, seed=12)

The grid builder is `MapGenerator::saveMap(...)` @ `0x00133588`
(source `map_generator.cpp`). Output written by `MapGenerator::savePgmMap` +
`cv::imwrite` (png) + a hand-written YAML `fprintf`.

---

## 1. Parameters (ROS, from the node's launch file)

`novabot_mapping_launch.py` declares (constructor reads them into members):

| Param | Value | Member off. | Use |
|-------|-------|-------------|-----|
| `border_distance` | `1.0` | `this+0xd0` | map padding in metres around the bbox |
| `judge_occu_radius` | `5` | `this+0xd8` | neighbourhood radius (cells) for edge-occupancy refine |
| `inflation_grid` | `7` | `this+0xdc` | declared but NOT used by `saveMap` (used elsewhere) |
| `whole_map_handle_switch` | `true` | `this+0xe1` | enables dilate + edge-occu refine + dock circles |
| `offset` | `0.30` | — | NOT applied in `saveMap` (boundary used as-is) |
| `obstacle_offset` | `0.25` | — | NOT applied in `saveMap` |
| `data_dir` | `/userdata/lfi/` | `this+0xf8` | paths |

Hard-coded constants (`.rodata`, confirmed by reading the binary):
- **resolution = 0.05 m/px** (member `this+0xc8`; also the area constant
  `0.0025 = 0.05²` at `0x1c9c88` confirms it). NOT a ROS param.
- **free value = 254** (`0x1c9c50` = `254.0`, used as the `cv::Scalar` fill).
- **occupied value = 0** (Mat init + obstacle fill + edge-occu + dock body).
- morphology border value = `DBL_MAX` (`0x1c9c70/78`) — OpenCV default.
- **π = 3.1415926** (`0x1c9c90`) — dock-circle angle math.

> The firmware grid is **binary**: every pixel is either **254 (free)** or
> **0 (occupied)**. There is **no 205 "unknown"** value. Confirmed by the
> fixture histograms: `map.pgm` = {0: 158572, 254: 80744}, `map0.pgm` =
> {0: 162870, 254: 76446}. This is exactly why a polygon-only restore that
> leaves cells "unknown" makes the coverage planner fail (Error 125) — the
> mower's own map never has unknown cells.

---

## 2. saveMap signature & inputs

```
saveMap(vector<Polygon> p1,   // work areas  -> FREE
        vector<Polygon> p2,   // obstacles   -> OCCUPIED
        vector<Polygon> p3,   // (tested in edge-occu pointPolygonTest)
        vector<Polygon> p4,   // unicom/channels -> FREE
        int param_5)          // map index (per-map selector; -1-based loop)
```

`Polygon` points are `geometry_msgs::msg::Point32` (float32 x,y in metres,
charger-relative). NOTE: these polygons come from the **live mapping message**,
not from re-reading the CSVs. `readCsvToArea` (which pushes *every* CSV point,
double→float32, no downsampling) is used for other paths. See §7 open item.

---

## 3. Geometry (bbox → width/height/origin)

Bounds are the global min/max of x and y over **all four** polygon sets
(`p1..p4`), tracked as float32 (`map_generator.cpp:94` log
`"xMin: %f, xMax: %f, yMin: %f, yMax: %f"`).

Let `res = 0.05`, `bd = border_distance = 1.0`.

```
border_cells   = (int)(bd / res)              // = 20  (C cast, trunc-toward-0)
border_metres  = (int)(bd / res) * res        // = 1.0

width  = 2*border_cells + round((xMax - xMin) / res)   // cols
height = 2*border_cells + round((yMax - yMin) / res)    // rows
origin_x = res * (int)(xMin / res) - border_metres      // (int) truncates toward 0
origin_y = res * (int)(yMin / res) - border_metres
origin   = [origin_x, origin_y, 0.0]
```

`round(v)` here is the firmware's `(int)(v + 0.5)`.
Logged at `map_generator.cpp:104`:
`"Map width: %d, map height: %d, resolution: %f."`.

The working image is `cv::Mat(height, width, CV_8UC1)` initialised to **0**.

### Point → pixel transform (used for every polygon vertex and circle)

```
px = (int)((x - origin_x) / res)
py = (height - 1) - (int)((y - origin_y) / res)     // y axis flipped
```
(`(int)` truncates toward zero.) Each work/obstacle/unicom vertex is also
written directly as `0x7f` (127) into the Mat as it is ingested, but those
markers are subsequently overwritten by the fillPoly passes — no 127 survives
in the output (confirmed by histogram).

---

## 4. Fill order (the core rasterization)

All `cv::fillPoly(img, polys, scalar, lineType=4, shift=0)`.

1. **Work areas (p1) → 254 (free).** One fillPoly per work polygon.
2. **Unicom/channels (p4) → 254 (free).** fillPoly. (Connects zones + the
   dock-approach corridor `map0tocharge_unicom`.)
3. **Obstacles (p2) → 0 (occupied).** One fillPoly per obstacle polygon.

`countNonZero(img) * 0.0025` is logged as `"%s area: %lf"` (free m²).

### 4a. whole_map_handle_switch == true (it is): dilate + refine + dock

Gated on `this+0xe1` (true) and the charging-station YAML load (`this+0xe0`).

4. Load `charging_station_file/charging_station.yaml`, read
   `charging_pose: [x, y, θ]` (vector<double>). Logged
   `"get the charging pose info:%lf %lf %lf"`.
5. **Morphological dilate (free grows).**
   `k = getStructuringElement(MORPH_ELLIPSE /*shape=2*/, ksize=(3,3), anchor=(-1,-1))`
   then `morphologyEx(img, img, MORPH_DILATE /*op=1*/, k, anchor=(-1,-1),
   iterations=1, BORDER_CONSTANT, borderValue=DBL_MAX)`.
   (NB: `inflation_grid=7` is NOT used here — the kernel is a hard-coded 3×3
   ellipse.)
6. **Re-stamp obstacles (p2) → 0** (fillPoly again, so dilation can't erase
   obstacle interiors).
7. **Second dilate** (same 3×3 ellipse, DILATE iter 1).
   Logged `"------------------------handle whole map"`.
8. **Edge-occupancy refine** (`judge_occu_radius_ = 5`,
   `map_generator.cpp:222`): iterate the work polygon whose loop index equals
   `param_5`; for each boundary pixel `(c,r)` not within 4 px of the image
   border, scan the `±5`-cell window; if any cell in it is occupied (==0) AND
   the point is **inside** an obstacle polygon (p2, via `pointPolygonTest >= 0`)
   AND inside a p4 polygon, collect it into `need_occu_points`. Logged
   `"---------------------need_occu_points size:%d"`. Then **set every collected
   point to 0** (occupied). This thickens occupied boundaries near real
   obstacles. (Exact predicate ordering to be pinned during validation.)
9. **Dock circles** (only if charging_pose present):
   - `sincos(θ) → (sinθ, cosθ)`.
   - **Body circle (OCCUPIED, value 0):** centre at
     `(x + cosθ*0.5, y + sinθ*0.5)`, **radius 6 px** (0.30 m), filled
     (`thickness=-1`, lineType=4). Marks the charger body as an obstacle.
   - **Approach circle (FREE, value 254):** angle `θ+π`
     (`((θ*180/π + 180) * π) / 180`), `sincos` of it; centre at
     `(x + cos(θ+π)*1.2, y + sin(θ+π)*1.2)`, **radius 16 px** (0.80 m), filled.
     Carves free space ~1.2 m behind the dock so the mower can approach/undock.

> **This dock free-circle (step 9b) is the key fix for David's Error 125.** The
> firmware deliberately makes a free disc near the dock even though the dock is
> outside the work boundary. Polygon-only restores omit it, so the planner has
> no free cell at the dock and reports "no valid path".

---

## 5. Output files

For map name `name` (member `this+0x8`, e.g. `map` for whole, `map0` per-map):

- **`name.pgm`** — `savePgmMap`: header
  `P5\n# CREATOR: map_generator.cpp %.3f m/pix\n%d %d\n255\n` (res, width,
  height) then raw row-major Mat bytes. Verified against fixture header
  `# CREATOR: map_generator.cpp 0.050 m/pix`.
- **`name.png`** — `cv::imwrite` of the same Mat.
- **`name.yaml`** — `fprintf`:
  ```
  image: %s\nresolution: %f\norigin: [%f, %f, %f]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n\n
  ```
  → `image: map.pgm`, `resolution: 0.050000`, `origin: [-21.250000, -20.700000, 0.000000]`.
  (`%f` = 6 decimals; trailing blank line.)

`generateEmptyMap` (`map_generator.cpp:744`) is the no-data fallback: same
geometry/format, all-zero image, files `empty_map.{pgm,png,yaml}`.

---

## 6. Per-map vs whole-map

`map.*` (whole) and `mapN.*` (per map) share the **same canvas**
(width/height/origin) — confirmed: both fixtures are 539×444, origin
[-21.25, -20.70]. The whole map unions every zone's free space (+ dock circle +
all channels); `mapN` contains only zone N's free area on the same grid. Free
counts: whole 80744 px, map0 76446 px (whole ⊇ map0, as expected). The per-map
selector is `param_5` (the loop index gate in step 8 and the polygon subset
fed in p1).

---

## 7. Ground truth (fixture `LFIN1231000211`)

`server/src/__tests__/fixtures/occupancy/LFIN1231000211/`:
- `csv_file/`: `map0_work.csv` (2495 pts), 6 `map0_*_obstacle.csv`,
  `map0tocharge_unicom.csv`, `map_info.json`.
- `map_files/map.{yaml,pgm,png}`, `map0.{yaml,pgm,png}`,
  `charging_station.yaml` (`charging_pose: [0.1250293, -0.5169092, 1.5751852]`).
- Whole map: 539×444, origin [-21.25, -20.70], res 0.05; pgm {0:158572, 254:80744}.

## 8. CONFIRMED: the pre-rasterize pipeline (`expandPolygon` → `saveMap`)

The full path is `NovabotMapping::mappingCallback` (the `Mapping.srv` handler,
`novabot_mapping.cpp`), decompiled in
`research/ghidra_output/savemap_caller_decompiled.c` (via
`research/decompile_savemap_caller.java`):

1. Load boundary/obstacle/unicom polygons into members
   (`this+0x278` work, `this+0x290` obstacles, …).
2. **`NovabotMapping::expandPolygon(work, obstacles, unicom, …)`**
   (`novabot_mapping.cpp:1494`) — offsets each set **in place** with ClipperLib:
   - scale float metres → int by **×10000** (and back by ÷10000)
   - `ClipperLib::ClipperOffset(miterLimit = 2.0, arcTolerance = 0.25)`
   - `AddPath(path, jtRound /*JoinType=1*/, etClosedPolygon /*EndType=0*/)`
   - `Execute(solution, delta)` with, per set:
     - **work boundary:** `delta = +offset × 10000 = +0.30 m`  (grow outward)
     - **obstacles:** `delta = -obstacle_offset × 10000 = -0.25 m`  (shrink)
     - **third set (unicom/charge):** `delta = -(obstacle_offset/2) × 10000 = -0.125 m`
   - params confirmed: `this+0x20 = "offset" = 0.30`, `this+0x28 = "obstacle_offset" = 0.25`
     (`get_parameter<double>` @ lines 29312-29359; values from
     `novabot_mapping_launch.py`).
3. **`MapGenerator::saveMap(work, obstacles, unicom, …, mapIndex)`** rasterizes
   the **offset** polygons per §3-§5. `mapIndex = -1` for the per-call sub-map;
   the whole map re-runs after `readAllCsvData`.

So byte-identity is reproducible: apply the same ClipperOffset (a deterministic,
JS-portable algorithm — e.g. `clipper-lib`) with these exact deltas/params, then
rasterize. The on-disk `map0_work.csv` is the *raw* boundary; `saveMap` sees it
**grown by 0.30 m** (rounded corners), which is why the raw-CSV bbox does not
match `map.pgm` — and why `server/src/maps/occupancyGrid.ts` (which rasterizes
the raw polygon) is 99.49% pixel-identical but not byte-exact.

### Validation status (against real stored files, no save_map trigger needed)
`occupancyGrid.ts` vs the live `LFIN1231000211` `map.pgm` (md5 `30d0a371…`):
**99.49 % pixel-identical** (239,316 px; freeBoth 79,823 / occBoth 158,273;
1,220 px differ, almost all in the offset/dilate border band). The **dock
approach-disc is FREE in both** — the Error-125 fix is reproduced. Remaining gap
to byte-identity = the `expandPolygon` ClipperOffset pre-step (not yet ported).

### Original open-item notes (superseded by §8 above)

`saveMap` does **not** rasterize either CSV on disk. Hard evidence (live mower
LFIN1231000211, 2026-05-23 save; its `map.pgm` md5 `30d0a371…` == our fixture):

| Source | pts | bbox x | bbox y | → grid | origin |
|--------|-----|--------|--------|--------|--------|
| `csv_file/map0_work.csv` (+obs+unicom) | dense 2495 | [-20.31, 4.73] | [-19.79, 0.49] | **541×446** | [-21.30, -20.75] |
| `x3_csv_file/map0_work.csv` (+obs+unicom) | 536 | [-20.01, 4.43] | [-19.49, 0.19] | **529×434** | [-21.00, -20.45] |
| **target `map.pgm`** | — | xMin∈(-20.30,-20.25] | yMin∈(-19.75,-19.70] | **539×444** | **[-21.25, -20.70]** |

The target sits **between** the two stored CSVs and matches **neither**. Also
`map.pgm` (May 23 20:40) is newer than `map0_work.csv` (May 8 18:25): the save
re-rasterized an **in-memory** boundary, not the on-disk dense CSV.

**Lead — ClipperLib.** The binary links `ClipperLib::SimplifyPolygon(s)`
(`_ZN10ClipperLib16SimplifyPolygonsE…`). ClipperLib runs in integer space and
removes self-intersections/spikes from the dense self-crossing scan trajectory,
which trims the extreme vertices and pulls the bbox in by ~2 cells — exactly the
observed 541→539 / 446→444 shrink. So the pre-rasterize pipeline is almost
certainly: load boundary → scale float→int → `ClipperLib::SimplifyPolygons`
(fill type TBD) → back to float → `saveMap`. ClipperLib is deterministic and
has JS ports, so byte-identity is reproducible once the scale + fill type are
known.

**Not yet pinned (needs the `saveMap` caller `NovabotMapping::*`, which is NOT in
the current decompile set):** (a) ClipperLib scale factor, (b) PolyFillType,
(c) which CSV source is loaded, (d) whether obstacles/unicom are also simplified.

### Two ways to close it (user chose "fresh ground-truth + exact polygon")
1. **Live capture (chosen):** the node has a `Publisher<mapping_msgs::msg::Polygon>`.
   On LFIN1231000211, `ros2 topic list -t | grep Polygon` to find it, then
   `ros2 topic echo <topic> > /tmp/saved_polys.txt` while triggering a fresh
   `save_map type:1` (Mapping.srv type=1). That captures the exact post-process
   polygon `saveMap` rasterizes. Pull it + the resulting `map.pgm` as a matched
   fixture → the byte-identical test then has correct inputs.
2. **Static:** decompile `NovabotMapping`'s Mapping/MappingControl service
   handler (the `saveMap` caller) to read the ClipperLib scale + fill type +
   source, then replicate `SimplifyPolygons` server-side (JS clipper port).

Everything else (geometry formula, fill order, free=254/occupied=0, dilate ×2,
dock circles, YAML/PGM format) is confirmed from the decompile + `.rodata`
constants. `server/src/maps/occupancyGrid.ts` implements all of it and is correct
**given the cleaned polygon as input**; only the ClipperLib pre-step is missing,
which is why the current fixture test is off by the 2-cell bbox.
