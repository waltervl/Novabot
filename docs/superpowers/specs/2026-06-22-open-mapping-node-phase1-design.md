# Open Mapping Node — Phase 1 Design (byte-exact save/generate pipeline)

Date: 2026-06-22
Status: approved for planning
Builds on: `2026-06-22-open-mapping-node-design.md` (overall), Phase 0 (scaffold + diff-oracle, merged on `feat/open-mapping-node`)

## Context

Phase 0 delivered the open-mapping-node scaffold and a byte-diff oracle
(`harness/diff_runner.py`) plus one real golden fixture. The `core/save.py`
transform is a stub. Phase 1 implements the **complete `save_map` transform,
byte-identical to the stock `novabot_mapping` node** — all output files for one
save, validated against a corpus of real golden fixtures.

Disassembly anchors (stock binary, ARM64, not stripped):
`NovabotMapping::saveScanData` @ 0x5f278 orchestrates a save: it reads the
existing areas from `x3_csv_file/` for all maps, writes `x3_csv_file/` (raw,
overwrite) and `csv_file/` (via `expandPolygon` @ 0x594d0 = `ClipperLib::
ClipperOffset::Execute`, which emits one contour per offset solution — the
"fan"), then rasterizes via OpenCV `cv::fillPoly` to `mapN.pgm/png/yaml`, writes
the global `map.pgm` (`# CREATOR: map_generator.cpp`, with a grid-construction
seam artifact at pixel-column ~253), and writes `map_info.json` +
`charging_station.yaml`. `saveData` @ 0x4bdd0 writes a vector of polygons to one
file sequentially. The pgm method is open-source-reproducible: CSV → 0.2 m
ClipperLib offset (JT_MITER) → `cv::fillPoly` → obstacles/outside occupied
(`novabot-mapping-pgm-occupancy-flow.md` reproduces `map.pgm` to 96 %; pixel-exact
needs `pyclipper` + the exact `cv::fillPoly`). Both core libs (ClipperLib via
`pyclipper`, OpenCV via `opencv-python`) are open source.

## Decisions

| Decision | Choice |
|---|---|
| Scope | **Full `save_map` byte-exact in one phase** — x3, csv_file, map_info.json, charging_station.yaml, per-map `mapN.pgm/png/yaml`, the global `map.pgm` (incl. the seam artifact), and overlap detection + `error_code`. |
| Ground truth | **Analytical reimplementation + frozen golden-fixture corpus.** No binary execution on the main path. |
| Libraries | **`pyclipper` (= ClipperLib, JT_MITER) + `opencv-python` (= `cv::fillPoly`)** — the same libs the stock binary uses — on dev machine and mower. |
| Strategy | **Approach A:** a shared geometry/raster core + per-output emitters, implemented easiest-exact-first, each byte-diffed against the corpus. |
| Fidelity | **Byte-identical** to stock, including quirks AND bugs (the fan stays; the seam stays). Fixes are Phase 5. |

## The fixture corpus (validation ground truth)

A golden fixture is an `input → golden` pair. The key insight: **the input and
the golden already coexist on the mowers' map dirs** — no triggered saves needed:

- INPUT = `x3_csv_file/*` (the raw recorded boundaries for work/obstacle/unicom/
  charge) + `map_info.json` (charging pose, per-map size, resolution).
- GOLDEN = `csv_file/*` (= `expandPolygon(x3)`, the fan) + `mapN.pgm/png/yaml` +
  global `map.pgm/png/yaml` + `map_info.json` + `charging_station.yaml`.

Confirmed live this session: `x3_csv_file/map0_work.csv` (147 pts) →
`csv_file/map0_work.csv` (13771 pts = 23 Clipper contours). So
`csv/pgm = f(x3-areas + map_info)`.

Corpus = **snapshots of existing map dirs** pulled from the mowers we have
(.244 with map0/1/2 + 2 obstacles + 2 unicoms + charger; .100 Alain; David's),
each a self-contained fixture, giving case variety:

| Fixture source | Covers |
|---|---|
| a simple single work map (no obstacles) | 1 Clipper contour, clean pgm |
| the complex map0 (obstacles + unicoms + charger) | the fan + per-map masking |
| a multi-map dir (2+ adjacent maps) | the global `map.pgm` seam artifact |
| (constructed) overlapping input | `error_code` 1/2/3 + no write |

Fixture layout (unchanged from Phase 0): `input/mapdir_before.tar` +
`input/recorded_boundary.csv` + `input/request.json` → `golden/mapdir_after.tar`
+ `meta.json`. For a regeneration fixture, `mapdir_before` carries the
`x3_csv_file/*`; `recorded_boundary.csv` is the work map's x3; the golden carries
the full output set. The overlap-reject fixture is constructed (a deliberately
overlapping input → golden with no new files + the expected `error_code`).

## Module layout (fills `open_mapping/core/`)

The Phase 0 stub `save_map(input_dir, request, out_dir) -> None` becomes the real
orchestrator. New pure-Python (no rclpy) modules, one responsibility each:

```
open_mapping/core/
  save.py        # orchestrator: read inputs → overlap-check → emit in order (mirrors saveScanData)
  geometry.py    # x3-CSV parse + CSV/JSON/YAML float-exact formatting; polygon types; point-in-poly
  clipper.py     # ClipperOffset wrapper (pyclipper: int-scaling, JT_MITER, miter limit) = expandPolygon + the 0.2 m dilate
  raster.py      # polygon → occupancy grid (cv2.fillPoly); grid origin/resolution/size math; pgm/png/yaml writers
  mapfiles.py    # read existing map dir (x3 areas); write csv_file/x3_csv_file, map_info.json, charging_station.yaml
  overlap.py     # detect_overlapping + error_code (1=OVERLAP_MAP, 2=OVERLAP_UNICOM, 3=CROSS_MULTI_MAPS)
```

Harness tweak: `run_fixture` (Phase 0) is extended to deliver
`input/recorded_boundary.csv` to the core (a fixed filename inside `input_dir`),
so `save_map` receives the recorded boundary the stock node holds in memory. The
Phase 2 service handler will fill it from the live recording.

## The emitters (`save.py` pipeline, easiest-exact-first)

`save.py` orchestrates; each emitter is independently byte-diffable against the
corpus golden, implemented in this order so the simplest land first and the
riskiest (global pgm/seam) is isolated last:

1. **x3** — write the boundary in the stock float format (input ≈ output; fastest 1:1 proof).
2. **csv_file** — `expandPolygon(x3-areas)` via `clipper` → the fan (contours + float exact).
3. **map_info.json** — charging_pose + per-map `map_size`; key order / indent / float exact.
4. **charging_station.yaml**.
5. **per-map `mapN.pgm/png/yaml`** — raster (offset + fillPoly).
6. **global `map.pgm/png/yaml`** — raster + `map_generator.cpp` grid + seam.
7. **overlap** — `detect_overlapping` → `error_code`; on overlap, return the code and write nothing (gate before all emitters).

## Validation, deps & testing

- **Oracle:** the Phase 0 `diff_runner` byte-diffs each emitter's output against
  the corpus golden. One test per emitter; an emitter is done when it 100 %
  byte-matches across the whole corpus.
- **Deps:** `pyclipper` + `opencv-python` on **both** the dev machine (for
  pytest — not installed locally yet) and the mower (ARM64, Py3.8). Phase 1
  tasks: add to `requirements.txt`; confirm/install on the mower (or bundle an
  ARM64 wheel) and add to the deploy.
- **Standard:** byte-exact, not approximate. Where a library version causes a
  sub-pixel/format difference, RE the exact parameter/version until it matches —
  no tolerance fudge.

## Risks & unknowns (each has a fallback)

- **`pyclipper` version ↔ stock ClipperLib version.** If pyclipper's bundled
  ClipperLib offsets slightly differently, contours can differ by a point → pin/
  vendor the matching ClipperLib version.
- **`cv2.fillPoly` ↔ stock OpenCV version** (edge pixels). May require matching
  the OpenCV version or replicating the scanline fill exactly.
- **Global `map.pgm` seam artifact** — reproducing a grid-construction quirk
  byte-exact is the riskiest. If it resists analytical repro, fall back to
  off-device binary-replay for that one file only.
- **Float formatting** (csv/json/yaml) — sprintf format strings; RE from the
  binary if byte-diff shows format drift.
- **Integer scaling** ClipperLib uses (meters→int) — RE from the data/binary.

## Out of scope (Phase 1)

- The recording subsystem (trajectory → boundary) — Phase 2.
- MappingControl / edit file ops, charging-pose write service, GenerateEmptyMap,
  autonomous mapping — Phases 3–4.
- Bug fixes (the fan, the seam) — Phase 5.
- Production activation of the node (waits until the full save pipeline is
  byte-verified across the corpus).
