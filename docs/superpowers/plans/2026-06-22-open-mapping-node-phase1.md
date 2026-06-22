# Open Mapping Node — Phase 1 Implementation Plan (byte-exact save/generate)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce the stock `novabot_mapping` `save_map` transform byte-for-byte in Python — every file one save writes — validated against a corpus of real mower map dirs via the Phase 0 diff-oracle.

**Architecture:** A shared pure-Python geometry/raster core (`open_mapping/core/{geometry,clipper,raster,mapfiles,overlap}.py`) plus per-output emitters orchestrated by `core/save.py`, implemented easiest-exact-first (x3 → csv → json/yaml → per-map pgm → global pgm → overlap). Each emitter is byte-diffed against frozen golden fixtures captured from existing mower map dirs (x3 = input, csv/pgm/yaml = golden). Same libs as stock: `pyclipper` (ClipperLib, JT_MITER) + `opencv-python` (cv::fillPoly).

**Tech Stack:** Python 3.8, `pyclipper`, `opencv-python`, `numpy`, `pytest`. (rclpy only in `node.py`, lazily — unchanged from Phase 0.)

## Global Constraints

- Fidelity is **byte-identical to stock**, including quirks AND bugs (the expandPolygon fan and the map.pgm seam are reproduced, not fixed — fixes are Phase 5). No tolerance fudge: a test is green only on an exact byte match.
- `core/` stays pure Python, no rclpy import.
- Validate every emitter with the Phase 0 oracle `harness.diff_runner.run_fixture` against the committed corpus.
- Deps `pyclipper` + `opencv-python` + `numpy` on **both** the dev machine and the mower (ARM64, Python 3.8).
- RE'd on-disk formats (use verbatim):
  - work/obstacle/unicom csv lines: `f"{x:.2f},{y:.2f}\n"` (2 decimals, comma, LF).
  - `map_info.json`: jsoncpp StyledWriter style — 3-space indent, `" : "` key/value separator, floats full `repr` precision; key order `charging_pose` `{orientation, x, y}` then each `mapN_work.csv` `{map_size}` in ascending N.
  - `charging_station.yaml`: `charging_pose: [0, 0, <orientation full precision>]\n`.
  - `mapN.yaml` / `map.yaml`: `image: <name>.pgm\nresolution: 0.050000\norigin: [<%.6f>, <%.6f>, 0.000000]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n`.
  - pgm header: `P5\n# CREATOR: map_generator.cpp 0.050 m/pix\n<W> <H>\n255\n` then raw row-major bytes (free=254, occupied=0, unknown=205 — confirm per fixture).
- Mower for corpus capture: `root@192.168.0.244` (map0/1/2 + obstacles + unicoms + charger), password `novabot`. Also pull from `.100` (Alain) when reachable for variety.
- Work on branch `feat/open-mapping-node`. No `Co-Authored-By` trailer. Run tests from `mapping/`: `python -m pytest -v`.

---

### Task 1: Phase 1 dependencies + corpus capture

**Files:**
- Modify: `mapping/requirements.txt`
- Create: `mapping/harness/capture_mapdir.py`
- Create: `mapping/harness/fixtures/corpus/<name>/...` (captured artifacts)
- Test: `mapping/tests/test_capture_mapdir.py`

**Interfaces:**
- Consumes: `harness.capture.pack_fixture` (Phase 0).
- Produces: `mapdir_to_fixture(mapdir: Path, work_map: str, out_fixture: Path) -> None` — turns a pulled map dir into an `input(x3)→golden(all files)` fixture; `work_map` (e.g. `"map1"`) names the recorded_boundary source.

- [ ] **Step 1: Add deps**

Append to `mapping/requirements.txt`:
```
pyclipper>=1.3
opencv-python>=4.5
numpy>=1.20
```
Install locally: `pip install pyclipper opencv-python numpy`.

- [ ] **Step 2: Write the failing test**

`mapping/tests/test_capture_mapdir.py`:
```python
import tarfile
from pathlib import Path
from harness.capture_mapdir import mapdir_to_fixture


def test_mapdir_becomes_input_golden_pair(tmp_path):
    md = tmp_path / "home0"
    (md / "x3_csv_file").mkdir(parents=True)
    (md / "csv_file").mkdir(parents=True)
    (md / "x3_csv_file" / "map1_work.csv").write_text("9.16,2.96\n9.13,2.80\n")
    (md / "csv_file" / "map1_work.csv").write_text("9.16,2.96\n9.13,2.80\n9.10,2.65\n")
    (md / "map1.yaml").write_text("image: map1.pgm\n")
    fx = tmp_path / "fixtures" / "map1"
    mapdir_to_fixture(md, "map1", fx)
    # input carries x3 (the boundary); golden carries the derived files
    with tarfile.open(fx / "input" / "mapdir_before.tar") as t:
        names = t.getnames()
    assert "./x3_csv_file/map1_work.csv" in names
    assert (fx / "input" / "recorded_boundary.csv").read_text() == "9.16,2.96\n9.13,2.80\n"
    with tarfile.open(fx / "golden" / "mapdir_after.tar") as t:
        gnames = t.getnames()
    assert "./csv_file/map1_work.csv" in gnames
    assert "./map1.yaml" in gnames
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd mapping && python -m pytest tests/test_capture_mapdir.py -v`
Expected: FAIL — `ModuleNotFoundError: harness.capture_mapdir`

- [ ] **Step 4: Implement**

`mapping/harness/capture_mapdir.py`:
```python
"""Turn a pulled mower map dir into an input(x3)->golden(all files) fixture.

INPUT  = x3_csv_file/* (raw recorded boundaries) — the transform input.
GOLDEN = everything the stock save wrote: csv_file/*, mapN.pgm/png/yaml,
         map.pgm/png/yaml, map_info.json, charging_station(.yaml).
recorded_boundary = the named work map's x3 (the in-memory recording the stock
node held). No saves are triggered — both halves already exist on disk.
"""
import shutil
import tempfile
from pathlib import Path
from harness.capture import pack_fixture


def mapdir_to_fixture(mapdir: Path, work_map: str, out_fixture: Path) -> None:
    mapdir = Path(mapdir)
    with tempfile.TemporaryDirectory() as tmp:
        before = Path(tmp) / "before"
        after = Path(tmp) / "after"
        # before: only the x3 areas (the inputs)
        (before / "x3_csv_file").mkdir(parents=True)
        for p in (mapdir / "x3_csv_file").glob("*"):
            if p.is_file():
                shutil.copy2(p, before / "x3_csv_file" / p.name)
        # after: the full written output set (csv_file + rasters + json/yaml)
        shutil.copytree(mapdir, after, dirs_exist_ok=True)
        recorded = (mapdir / "x3_csv_file" / f"{work_map}_work.csv").read_bytes()
        meta = {"source_mapdir": str(mapdir), "work_map": work_map}
        request = {"service": "save_map", "type": 1, "resolution": 0.05, "main_id": 0}
        pack_fixture(before, after, request, recorded, meta, out_fixture)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd mapping && python -m pytest tests/test_capture_mapdir.py -v`
Expected: PASS

- [ ] **Step 6: Capture the real corpus from the mower**

```bash
M=root@192.168.0.244
for slot in map0 map1 map2; do :; done   # informational
mkdir -p /tmp/corpus_home0
sshpass -p novabot scp -r -o StrictHostKeyChecking=no "$M:/userdata/lfi/maps/home0" /tmp/corpus_home0/
cd mapping && PYTHONPATH=. python -c "
from pathlib import Path
from harness.capture_mapdir import mapdir_to_fixture
md = Path('/tmp/corpus_home0/home0')
# map1 = simple (no obstacles), map0 = complex (obstacles+unicoms+charger)
mapdir_to_fixture(md, 'map1', Path('harness/fixtures/corpus/simple_map1'))
mapdir_to_fixture(md, 'map0', Path('harness/fixtures/corpus/complex_map0'))
mapdir_to_fixture(md, 'map2', Path('harness/fixtures/corpus/multimap_map2'))
"
```
(If `.100` is reachable, repeat for a second `home0` for variety.) Verify each fixture's golden tar lists `csv_file/`, `mapN.pgm`, `mapN.yaml`, `map.pgm`, `map.yaml`, `map_info.json`.

- [ ] **Step 7: Commit**

```bash
git add mapping/requirements.txt mapping/harness/capture_mapdir.py mapping/harness/fixtures/corpus/ mapping/tests/test_capture_mapdir.py
git commit -m "feat(open-mapping): phase1 deps + corpus capture from existing mower map dirs"
```

---

### Task 2: Harness delivers the recorded boundary to the core

**Files:**
- Modify: `mapping/harness/diff_runner.py` (in `run_fixture`)
- Test: `mapping/tests/test_diff_runner_boundary.py`

**Interfaces:**
- Consumes: existing `run_fixture(fixture_dir, core_fn)`.
- Produces: `run_fixture` now copies `input/recorded_boundary.csv` into the extracted input dir as `recorded_boundary.csv` before calling `core_fn`, so a core can read `input_dir / "recorded_boundary.csv"`.

- [ ] **Step 1: Write the failing test**

`mapping/tests/test_diff_runner_boundary.py`:
```python
import json, tarfile
from pathlib import Path
from harness.diff_runner import run_fixture


def _fixture(root, recorded: bytes):
    fx = root / "fx"
    (fx / "input").mkdir(parents=True)
    (fx / "golden").mkdir(parents=True)
    empty = root / "empty"; empty.mkdir()
    for sub, tarname in (("input", "mapdir_before.tar"), ("golden", "mapdir_after.tar")):
        with tarfile.open(fx / sub / tarname, "w") as t:
            t.add(empty, arcname=".")
    (fx / "input" / "request.json").write_text(json.dumps({"type": 1}))
    (fx / "input" / "recorded_boundary.csv").write_bytes(recorded)
    return fx


def test_core_receives_recorded_boundary(tmp_path):
    fx = _fixture(tmp_path, b"1.0,2.0\n")
    seen = {}

    def core_fn(input_dir, request, out_dir):
        seen["b"] = (input_dir / "recorded_boundary.csv").read_bytes()

    run_fixture(fx, core_fn)
    assert seen["b"] == b"1.0,2.0\n"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mapping && python -m pytest tests/test_diff_runner_boundary.py -v`
Expected: FAIL — `FileNotFoundError` (recorded_boundary.csv not in input_dir)

- [ ] **Step 3: Implement**

In `mapping/harness/diff_runner.py`, inside `run_fixture`, after `_extract(... "mapdir_before.tar", in_dir)` and before `core_fn(in_dir, request, out_dir)`, add:
```python
        rb = fixture_dir / "input" / "recorded_boundary.csv"
        if rb.exists():
            (in_dir / "recorded_boundary.csv").write_bytes(rb.read_bytes())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mapping && python -m pytest tests/test_diff_runner_boundary.py -v`
Expected: PASS

- [ ] **Step 5: Run full suite + commit**

Run: `cd mapping && python -m pytest -q` (Expected: all pass)
```bash
git add mapping/harness/diff_runner.py mapping/tests/test_diff_runner_boundary.py
git commit -m "feat(open-mapping): run_fixture delivers recorded_boundary.csv to the core"
```

---

### Task 3: geometry.py — CSV/JSON/YAML float-exact formatters

**Files:**
- Create: `mapping/open_mapping/core/geometry.py`
- Test: `mapping/tests/test_geometry.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parse_csv(text: str) -> list[tuple[float, float]]`
  - `format_csv(points) -> str` (`"{x:.2f},{y:.2f}\n"` per point)
  - `format_map_info(charging_pose: dict, sizes: dict) -> str` (jsoncpp-style; `charging_pose` has keys `orientation,x,y`; `sizes` maps `"mapN_work.csv" -> float`)
  - `format_charging_station(orientation: float) -> str` (`"charging_pose: [0, 0, <orientation>]\n"`)
  - `format_map_yaml(image: str, origin_xy: tuple[float, float]) -> str`

- [ ] **Step 1: Write the failing test**

`mapping/tests/test_geometry.py`:
```python
from open_mapping.core import geometry as g


def test_parse_and_format_csv_roundtrip():
    assert g.parse_csv("9.16,2.96\n9.13,2.80\n") == [(9.16, 2.96), (9.13, 2.80)]
    assert g.format_csv([(9.16, 2.96), (9.13, 2.80)]) == "9.16,2.96\n9.13,2.80\n"


def test_format_map_info_matches_stock():
    out = g.format_map_info(
        {"orientation": -1.591749273541982, "x": 2.158885196021056, "y": 0.045200415556607483},
        {"map0_work.csv": 28.577500000000004, "map1_work.csv": 21.497500000000006},
    )
    expected = (
        '{\n'
        '   "charging_pose" : {\n'
        '      "orientation" : -1.591749273541982,\n'
        '      "x" : 2.158885196021056,\n'
        '      "y" : 0.045200415556607483\n'
        '   },\n'
        '   "map0_work.csv" : {\n'
        '      "map_size" : 28.577500000000004\n'
        '   },\n'
        '   "map1_work.csv" : {\n'
        '      "map_size" : 21.497500000000006\n'
        '   }\n'
        '}\n'
    )
    assert out == expected


def test_format_charging_station():
    assert g.format_charging_station(-1.518115032497305) == "charging_pose: [0, 0, -1.518115032497305]\n"


def test_format_map_yaml():
    assert g.format_map_yaml("map1.pgm", (-4.75, -1.60)) == (
        "image: map1.pgm\nresolution: 0.050000\n"
        "origin: [-4.750000, -1.600000, 0.000000]\nnegate: 0\n"
        "occupied_thresh: 0.65\nfree_thresh: 0.196\n"
    )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mapping && python -m pytest tests/test_geometry.py -v`
Expected: FAIL — `ModuleNotFoundError: open_mapping.core.geometry`

- [ ] **Step 3: Implement**

`mapping/open_mapping/core/geometry.py`:
```python
"""CSV / map_info.json / yaml parsing and byte-exact formatting for save_map.

Float formats reverse-engineered from real mower files:
- csv lines: 2 decimals, comma, LF.
- map_info.json: jsoncpp StyledWriter — 3-space indent, ' : ' separator, floats
  as Python repr (shortest round-trip, matches the doubles on disk).
- map yaml: resolution/origin %.6f, fixed thresholds.
"""


def parse_csv(text):
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        x, y = line.split(",")
        out.append((float(x), float(y)))
    return out


def format_csv(points):
    return "".join(f"{x:.2f},{y:.2f}\n" for x, y in points)


def _num(v):
    # jsoncpp prints doubles with shortest round-trip; Python repr() matches.
    return repr(float(v))


def format_map_info(charging_pose, sizes):
    lines = ["{"]
    lines.append('   "charging_pose" : {')
    lines.append(f'      "orientation" : {_num(charging_pose["orientation"])},')
    lines.append(f'      "x" : {_num(charging_pose["x"])},')
    lines.append(f'      "y" : {_num(charging_pose["y"])}')
    lines.append("   },")
    items = sorted(sizes.items())
    for i, (name, size) in enumerate(items):
        lines.append(f'   "{name}" : {{')
        lines.append(f'      "map_size" : {_num(size)}')
        lines.append("   }" + ("," if i < len(items) - 1 else ""))
    lines.append("}")
    return "\n".join(lines) + "\n"


def format_charging_station(orientation):
    return f"charging_pose: [0, 0, {_num(orientation)}]\n"


def format_map_yaml(image, origin_xy):
    ox, oy = origin_xy
    return (
        f"image: {image}\n"
        "resolution: 0.050000\n"
        f"origin: [{ox:.6f}, {oy:.6f}, 0.000000]\n"
        "negate: 0\n"
        "occupied_thresh: 0.65\n"
        "free_thresh: 0.196\n"
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mapping && python -m pytest tests/test_geometry.py -v`
Expected: PASS. **If `format_map_info` mismatches** the stock byte-for-byte, diff against a real `map_info.json` (Task 1 corpus) and adjust `_num`/indent until identical — do not relax the assertion.

- [ ] **Step 5: Commit**

```bash
git add mapping/open_mapping/core/geometry.py mapping/tests/test_geometry.py
git commit -m "feat(open-mapping): geometry float-exact csv/json/yaml formatters"
```

---

### Task 4: x3 + map_info + charging_station emitters (corpus byte-match)

**Files:**
- Create: `mapping/open_mapping/core/mapfiles.py`
- Test: `mapping/tests/test_mapfiles.py`

**Interfaces:**
- Consumes: `core.geometry` formatters; `harness.diff_runner.run_fixture`.
- Produces:
  - `read_x3_areas(input_dir: Path) -> dict[str, list[tuple[float,float]]]` (filename → points, from `x3_csv_file/`)
  - `write_x3(out_dir: Path, areas: dict) -> None`
  - `write_map_info(out_dir, charging_pose, sizes) -> None`
  - `write_charging_station(out_dir, orientation) -> None`

- [ ] **Step 1: Write the failing test**

`mapping/tests/test_mapfiles.py`:
```python
from pathlib import Path
from open_mapping.core import mapfiles


def test_x3_roundtrip_byte_exact(tmp_path):
    src = tmp_path / "in" / "x3_csv_file"; src.mkdir(parents=True)
    (src / "map1_work.csv").write_text("9.16,2.96\n9.13,2.80\n")
    areas = mapfiles.read_x3_areas(tmp_path / "in")
    out = tmp_path / "out"; out.mkdir()
    mapfiles.write_x3(out, areas)
    assert (out / "x3_csv_file" / "map1_work.csv").read_text() == "9.16,2.96\n9.13,2.80\n"


def test_map_info_written(tmp_path):
    out = tmp_path / "out"; out.mkdir()
    mapfiles.write_map_info(out, {"orientation": -1.5, "x": 2.0, "y": 0.0}, {"map0_work.csv": 28.5})
    txt = (out / "csv_file" / "map_info.json").read_text()
    assert '"map_size" : 28.5' in txt and txt.startswith("{\n")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mapping && python -m pytest tests/test_mapfiles.py -v`
Expected: FAIL — `ModuleNotFoundError: open_mapping.core.mapfiles`

- [ ] **Step 3: Implement**

`mapping/open_mapping/core/mapfiles.py`:
```python
"""Read existing map-dir inputs and write the text output families."""
from pathlib import Path
from open_mapping.core import geometry as g


def read_x3_areas(input_dir):
    d = Path(input_dir) / "x3_csv_file"
    areas = {}
    if d.is_dir():
        for p in sorted(d.glob("*.csv")):
            areas[p.name] = g.parse_csv(p.read_text())
    return areas


def write_x3(out_dir, areas):
    d = Path(out_dir) / "x3_csv_file"
    d.mkdir(parents=True, exist_ok=True)
    for name, pts in areas.items():
        (d / name).write_text(g.format_csv(pts))


def write_map_info(out_dir, charging_pose, sizes):
    d = Path(out_dir) / "csv_file"
    d.mkdir(parents=True, exist_ok=True)
    (d / "map_info.json").write_text(g.format_map_info(charging_pose, sizes))


def write_charging_station(out_dir, orientation):
    d = Path(out_dir) / "charging_station_file"
    d.mkdir(parents=True, exist_ok=True)
    (d / "charging_station.yaml").write_text(g.format_charging_station(orientation))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mapping && python -m pytest tests/test_mapfiles.py -v`
Expected: PASS. Confirm the `charging_station.yaml` path matches the fixture (Task 1 showed `charging_station_file/charging_station.yaml`); adjust the subdir if the corpus differs.

- [ ] **Step 5: Commit**

```bash
git add mapping/open_mapping/core/mapfiles.py mapping/tests/test_mapfiles.py
git commit -m "feat(open-mapping): x3 + map_info + charging_station emitters"
```

---

### Task 5: clipper.py + csv_file emitter — the expandPolygon fan (corpus byte-match)

**Files:**
- Create: `mapping/open_mapping/core/clipper.py`
- Test: `mapping/tests/test_clipper_csv.py`

**Interfaces:**
- Consumes: `core.geometry`, `pyclipper`, `harness.diff_runner.run_fixture`, the `complex_map0` corpus fixture.
- Produces: `expand_polygon(work_pts, obstacle_polys, unicom_polys, charge_polys, scale: int) -> list[list[tuple[float,float]]]` (the offset solution contours — the fan); `write_csv_file(out_dir, work_name, contours, others) -> None`.

This is a byte-exact RE task: the goal is for the produced `csv_file/map0_work.csv` to byte-equal the golden (the ~23-contour fan). The disassembly anchor is `expandPolygon` @ 0x594d0 → `ClipperLib::ClipperOffset::Execute`, JoinType `jtMiter`, accumulating every result contour.

- [ ] **Step 1: Write the failing test (corpus-driven)**

`mapping/tests/test_clipper_csv.py`:
```python
from pathlib import Path
from harness.diff_runner import run_fixture
from open_mapping.core import clipper, mapfiles

FX = Path(__file__).resolve().parent.parent / "harness" / "fixtures" / "corpus" / "complex_map0"


def test_csv_file_map0_byte_matches_golden():
    def core_fn(input_dir, request, out_dir):
        areas = mapfiles.read_x3_areas(input_dir)
        work = areas["map0_work.csv"]
        obst = [v for k, v in areas.items() if "obstacle" in k]
        uni = [v for k, v in areas.items() if "unicom" in k and "charge" not in k]
        chg = [v for k, v in areas.items() if "charge" in k]
        contours = clipper.expand_polygon(work, obst, uni, chg, scale=clipper.SCALE)
        clipper.write_csv_file(out_dir, "map0_work.csv", contours, {})

    report = run_fixture(FX, core_fn)
    csv_diffs = [f for f in report.files if f.name == "csv_file/map0_work.csv"]
    assert csv_diffs and csv_diffs[0].status == "match", csv_diffs and csv_diffs[0].detail
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mapping && python -m pytest tests/test_clipper_csv.py -v`
Expected: FAIL — `ModuleNotFoundError: open_mapping.core.clipper` (then, after Step 3, a byte mismatch to iterate on).

- [ ] **Step 3: Implement the offset, then iterate scale/delta/jointype to byte-match**

`mapping/open_mapping/core/clipper.py`:
```python
"""ClipperLib polygon offset (the stock `expandPolygon`) via pyclipper.

Reproduces the work boundary's offset solution contours that the stock node
writes to csv_file/. `Execute` can return multiple contours for a complex
boundary (obstacles/unicoms/charger pinch it) — ALL are emitted, in order: the
"fan". Parameters (SCALE, DELTA, join type, miter limit) are tuned until the
output byte-matches the corpus golden — start from these RE'd values.
"""
import pyclipper
from open_mapping.core import geometry as g

SCALE = 1000           # meters -> integer; tune to match (try 1000, 100, 10000)
DELTA = 0.0            # offset distance in meters for csv_file; tune (the csv path
                       # may use delta 0 / a small value — confirm vs golden)
MITER_LIMIT = 2.0


def expand_polygon(work_pts, obstacle_polys, unicom_polys, charge_polys, scale=SCALE):
    co = pyclipper.PyclipperOffset(miter_limit=MITER_LIMIT)
    path = [(round(x * scale), round(y * scale)) for x, y in work_pts]
    co.AddPath(path, pyclipper.JT_MITER, pyclipper.ET_CLOSEDPOLYGON)
    solution = co.Execute(DELTA * scale)
    contours = [[(x / scale, y / scale) for x, y in c] for c in solution]
    return contours


def write_csv_file(out_dir, work_name, contours, others):
    from pathlib import Path
    d = Path(out_dir) / "csv_file"
    d.mkdir(parents=True, exist_ok=True)
    text = "".join(g.format_csv(c) for c in contours)
    (d / work_name).write_text(text)
    for name, pts in others.items():
        (d / name).write_text(g.format_csv(pts))
```
**Iterate:** run the test; if the byte-diff shows wrong contour count, point count, or coordinates, adjust `SCALE`/`DELTA`/join type and the obstacle/unicom/charge handling against the golden until `status == "match"`. Use the disassembly (`expandPolygon` @ 0x594d0, `ClipperOffset::Execute` @ 0xc4bc8) and the golden bytes as the oracle. Record the final tuned values in the module docstring. Do NOT relax the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mapping && python -m pytest tests/test_clipper_csv.py -v`
Expected: PASS (byte-exact `csv_file/map0_work.csv`).

- [ ] **Step 5: Commit**

```bash
git add mapping/open_mapping/core/clipper.py mapping/tests/test_clipper_csv.py
git commit -m "feat(open-mapping): expandPolygon (pyclipper) + csv_file emitter, byte-exact on corpus"
```

---

### Task 6: raster.py — grid math, pgm header + map yaml (corpus byte-match, non-pixel parts)

**Files:**
- Create: `mapping/open_mapping/core/raster.py`
- Test: `mapping/tests/test_raster_header.py`

**Interfaces:**
- Consumes: `core.geometry`, the corpus.
- Produces:
  - `grid_bounds(areas) -> tuple[float,float,float,float]` (xmin,ymin,xmax,ymax incl. the stock padding)
  - `grid_size(bounds, resolution=0.05) -> tuple[int,int]` (width,height)
  - `pgm_bytes(width, height, pixels: bytes) -> bytes` (header `P5\n# CREATOR: map_generator.cpp 0.050 m/pix\n<W> <H>\n255\n` + pixels)
  - `write_map_yaml(out_dir, image_name, origin_xy) -> None`

- [ ] **Step 1: Write the failing test**

`mapping/tests/test_raster_header.py`:
```python
from open_mapping.core import raster


def test_pgm_header_exact():
    body = bytes([254, 0, 205])
    out = raster.pgm_bytes(379, 257, body)
    assert out.startswith(b"P5\n# CREATOR: map_generator.cpp 0.050 m/pix\n379 257\n255\n")
    assert out.endswith(body)


def test_grid_size_from_bounds():
    # bounds 0..3.79 x 0..2.57 at 0.05 -> 379 x 257 (matches map1.pgm)
    w, h = raster.grid_size((0.0, 0.0, 3.79, 2.57), resolution=0.05)
    assert (w, h) == (379, 257)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mapping && python -m pytest tests/test_raster_header.py -v`
Expected: FAIL — `ModuleNotFoundError: open_mapping.core.raster`

- [ ] **Step 3: Implement**

`mapping/open_mapping/core/raster.py`:
```python
"""Occupancy-grid rasterisation (pgm) for save_map.

Header + grid sizing are byte-exact from RE; the pixel fill (Task 7) uses
cv2.fillPoly on the ClipperLib-offset polygons. Free=254, occupied=0,
unknown=205 (confirm against the corpus).
"""
import math
from pathlib import Path
from open_mapping.core import geometry as g

FREE, OCCUPIED, UNKNOWN = 254, 0, 205
PGM_HEADER = "P5\n# CREATOR: map_generator.cpp 0.050 m/pix\n{w} {h}\n255\n"


def grid_bounds(areas):
    xs = [p[0] for pts in areas.values() for p in pts]
    ys = [p[1] for pts in areas.values() for p in pts]
    return (min(xs), min(ys), max(xs), max(ys))


def grid_size(bounds, resolution=0.05):
    xmin, ymin, xmax, ymax = bounds
    w = int(round((xmax - xmin) / resolution))
    h = int(round((ymax - ymin) / resolution))
    return (w, h)


def pgm_bytes(width, height, pixels):
    return PGM_HEADER.format(w=width, h=height).encode("ascii") + pixels


def write_map_yaml(out_dir, image_name, origin_xy):
    p = Path(out_dir) / image_name.replace(".pgm", ".yaml")
    p.write_text(g.format_map_yaml(image_name, origin_xy))
```
**Iterate** `grid_bounds`/`grid_size` padding against a real `mapN.pgm` width/height + `mapN.yaml` origin until they match exactly (the stock adds a margin and snaps the origin — confirm the rule from the corpus; map1 was 379×257, origin [-4.75, -1.60]).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mapping && python -m pytest tests/test_raster_header.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mapping/open_mapping/core/raster.py mapping/tests/test_raster_header.py
git commit -m "feat(open-mapping): raster grid math + pgm header + map yaml"
```

---

### Task 7: per-map pgm pixel fill — offset + cv2.fillPoly (corpus byte-match)

**Files:**
- Modify: `mapping/open_mapping/core/raster.py` (add `render_pgm`)
- Test: `mapping/tests/test_raster_pixels.py`

**Interfaces:**
- Consumes: `core.clipper` (0.2 m dilate), `cv2`, `numpy`, the corpus.
- Produces: `render_pgm(work, obstacles, bounds, resolution=0.05) -> bytes` (the full pgm pixel block: 0.2 m ClipperLib offset of work → `cv2.fillPoly` FREE, obstacles OCCUPIED, outside OCCUPIED).

This is a byte-exact RE task driven by the corpus per-map pgm golden.

- [ ] **Step 1: Write the failing test (corpus-driven)**

`mapping/tests/test_raster_pixels.py`:
```python
from pathlib import Path
from harness.diff_runner import run_fixture
from open_mapping.core import mapfiles, raster

FX = Path(__file__).resolve().parent.parent / "harness" / "fixtures" / "corpus" / "simple_map1"


def test_map1_pgm_byte_matches_golden():
    def core_fn(input_dir, request, out_dir):
        areas = mapfiles.read_x3_areas(input_dir)
        work = areas["map1_work.csv"]
        bounds = raster.grid_bounds({"w": work})
        body = raster.render_pgm(work, [], bounds)
        w, h = raster.grid_size(bounds)
        (out_dir).mkdir(parents=True, exist_ok=True)
        (out_dir / "map1.pgm").write_bytes(raster.pgm_bytes(w, h, body))

    report = run_fixture(FX, core_fn)
    pgm = [f for f in report.files if f.name == "map1.pgm"]
    assert pgm and pgm[0].status == "match", pgm and pgm[0].detail
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mapping && python -m pytest tests/test_raster_pixels.py -v`
Expected: FAIL — `AttributeError: render_pgm` (then a byte mismatch to iterate on).

- [ ] **Step 3: Implement, then iterate offset/fill to byte-match**

Add to `mapping/open_mapping/core/raster.py`:
```python
import numpy as np
import cv2
from open_mapping.core import clipper


def _to_px(pts, bounds, resolution):
    xmin, ymin, xmax, ymax = bounds
    h = int(round((ymax - ymin) / resolution))
    out = []
    for x, y in pts:
        px = int(round((x - xmin) / resolution))
        py = h - 1 - int(round((y - ymin) / resolution))  # pgm is top-down; confirm flip
        out.append((px, py))
    return np.array(out, dtype=np.int32)


def render_pgm(work, obstacles, bounds, resolution=0.05):
    w, h = grid_size(bounds, resolution)
    grid = np.full((h, w), OCCUPIED, dtype=np.uint8)            # outside = occupied
    inflated = clipper.offset_meters(work, 0.2)                  # 0.2 m dilate (ClipperLib)
    cv2.fillPoly(grid, [_to_px(inflated, bounds, resolution)], FREE)
    for ob in obstacles:
        cv2.fillPoly(grid, [_to_px(ob, bounds, resolution)], OCCUPIED)
    return grid.tobytes()
```
Add the helper to `clipper.py`:
```python
def offset_meters(pts, delta, scale=SCALE):
    co = pyclipper.PyclipperOffset(miter_limit=MITER_LIMIT)
    co.AddPath([(round(x*scale), round(y*scale)) for x, y in pts],
               pyclipper.JT_MITER, pyclipper.ET_CLOSEDPOLYGON)
    sol = co.Execute(delta * scale)
    return [(x/scale, y/scale) for x, y in (sol[0] if sol else [])]
```
**Iterate:** run the test; against the golden `map1.pgm`, tune the y-flip, the pixel rounding (floor vs round), the 0.2 m offset (the 96 % repro measured d≈0.2 with JT_MITER), and the FREE/OCCUPIED values until byte-exact. The known 4 % gap in the prior repro was mitre-join + unicom areas; for a simple no-obstacle map1 it should reach 100 %. Record tuned values.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mapping && python -m pytest tests/test_raster_pixels.py -v`
Expected: PASS (byte-exact `map1.pgm`).

- [ ] **Step 5: Commit**

```bash
git add mapping/open_mapping/core/raster.py mapping/open_mapping/core/clipper.py mapping/tests/test_raster_pixels.py
git commit -m "feat(open-mapping): per-map pgm pixel fill (offset + cv2.fillPoly), byte-exact on simple map"
```

---

### Task 8: global map.pgm incl. the seam artifact (corpus byte-match — highest risk)

**Files:**
- Modify: `mapping/open_mapping/core/raster.py` (add `render_global_pgm`)
- Test: `mapping/tests/test_global_pgm.py`

**Interfaces:**
- Consumes: `render_pgm` building blocks, the multi-map corpus fixture.
- Produces: `render_global_pgm(all_areas, bounds, resolution=0.05) -> bytes` — the union of all work maps + obstacles + the `map_generator.cpp` grid seam artifact, byte-exact.

- [ ] **Step 1: Write the failing test (corpus-driven)**

`mapping/tests/test_global_pgm.py`:
```python
from pathlib import Path
from harness.diff_runner import run_fixture
from open_mapping.core import mapfiles, raster

FX = Path(__file__).resolve().parent.parent / "harness" / "fixtures" / "corpus" / "multimap_map2"


def test_global_map_pgm_byte_matches_golden():
    def core_fn(input_dir, request, out_dir):
        areas = mapfiles.read_x3_areas(input_dir)
        works = {k: v for k, v in areas.items() if k.endswith("_work.csv")}
        bounds = raster.grid_bounds(works)
        body = raster.render_global_pgm(areas, bounds)
        w, h = raster.grid_size(bounds)
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "map.pgm").write_bytes(raster.pgm_bytes(w, h, body))

    report = run_fixture(FX, core_fn)
    g = [f for f in report.files if f.name == "map.pgm"]
    assert g and g[0].status == "match", g and g[0].detail
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mapping && python -m pytest tests/test_global_pgm.py -v`
Expected: FAIL — `AttributeError: render_global_pgm` then byte mismatch (the seam).

- [ ] **Step 3: Implement union + reproduce the seam, iterate to byte-match**

Add to `raster.py`:
```python
def render_global_pgm(all_areas, bounds, resolution=0.05):
    w, h = grid_size(bounds, resolution)
    grid = np.full((h, w), OCCUPIED, dtype=np.uint8)
    works = {k: v for k, v in all_areas.items() if k.endswith("_work.csv")}
    for pts in works.values():
        inflated = clipper.offset_meters(pts, 0.2)
        cv2.fillPoly(grid, [_to_px(inflated, bounds, resolution)], FREE)
    for k, pts in all_areas.items():
        if "obstacle" in k:
            cv2.fillPoly(grid, [_to_px(pts, bounds, resolution)], OCCUPIED)
    # map_generator.cpp seam: a ~0.6 m occupied band on the power-of-two tile
    # boundary (~pixel column 253). Reproduce the grid-construction artifact —
    # iterate column index/width against the golden (see
    # novabot-mapping-pgm-occupancy-flow.md "DEFINITIEVE root cause").
    return grid.tobytes()
```
**Iterate hard against the golden `map.pgm`:** the seam is a grid-construction quirk (vertical occupied band ~pixel-column 253, tile boundary). Diff the produced vs golden bytes, locate the differing columns, and add the exact band the stock writes. If it resists analytical reproduction after a focused effort, fall back to the off-device binary-replay oracle for this one file (record the decision); do not relax the test or skip the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mapping && python -m pytest tests/test_global_pgm.py -v`
Expected: PASS (byte-exact `map.pgm`).

- [ ] **Step 5: Commit**

```bash
git add mapping/open_mapping/core/raster.py mapping/tests/test_global_pgm.py
git commit -m "feat(open-mapping): global map.pgm incl. map_generator seam, byte-exact on corpus"
```

---

### Task 9: png emitters (corpus byte-match — encoder risk)

**Files:**
- Modify: `mapping/open_mapping/core/raster.py` (add `write_png`)
- Test: `mapping/tests/test_png.py`

**Interfaces:**
- Consumes: `cv2`, the corpus.
- Produces: `write_png(out_dir, name, grid_bytes, width, height) -> None` — byte-exact `mapN.png` / `map.png`.

PNG byte-exactness depends on matching the stock encoder (OpenCV `imwrite` zlib level + filter). This is a known-hard target.

- [ ] **Step 1: Write the failing test (corpus-driven)**

`mapping/tests/test_png.py`:
```python
from pathlib import Path
from harness.diff_runner import run_fixture
from open_mapping.core import mapfiles, raster

FX = Path(__file__).resolve().parent.parent / "harness" / "fixtures" / "corpus" / "simple_map1"


def test_map1_png_byte_matches_golden():
    def core_fn(input_dir, request, out_dir):
        areas = mapfiles.read_x3_areas(input_dir)
        work = areas["map1_work.csv"]
        bounds = raster.grid_bounds({"w": work})
        body = raster.render_pgm(work, [], bounds)
        w, h = raster.grid_size(bounds)
        out_dir.mkdir(parents=True, exist_ok=True)
        raster.write_png(out_dir, "map1.png", body, w, h)

    report = run_fixture(FX, core_fn)
    png = [f for f in report.files if f.name == "map1.png"]
    assert png and png[0].status == "match", png and png[0].detail
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mapping && python -m pytest tests/test_png.py -v`
Expected: FAIL — `AttributeError: write_png` then byte mismatch.

- [ ] **Step 3: Implement via cv2.imwrite, iterate encoder params to byte-match**

Add to `raster.py`:
```python
def write_png(out_dir, name, grid_bytes, width, height):
    arr = np.frombuffer(grid_bytes, dtype=np.uint8).reshape(height, width)
    # Match the stock OpenCV PNG encoder. Iterate IMWRITE_PNG_COMPRESSION /
    # strategy against the golden until byte-exact.
    cv2.imwrite(str(Path(out_dir) / name), arr,
                [cv2.IMWRITE_PNG_COMPRESSION, 3])
```
**Iterate:** PNG bytes depend on the encoder's zlib level/strategy and the OpenCV/libpng version. Diff vs the golden `map1.png`; try compression levels and `IMWRITE_PNG_STRATEGY_*`. If byte-exact proves infeasible with the available OpenCV build, record this as a known gap and gate the png at structural (decoded-pixels) equality with an explicit note — escalate the decision to the controller rather than silently relaxing.

- [ ] **Step 4: Run test to verify it passes (or escalate)**

Run: `cd mapping && python -m pytest tests/test_png.py -v`
Expected: PASS, OR a documented escalation if encoder byte-parity is infeasible.

- [ ] **Step 5: Commit**

```bash
git add mapping/open_mapping/core/raster.py mapping/tests/test_png.py
git commit -m "feat(open-mapping): png emitter (cv2 encoder match) for corpus"
```

---

### Task 10: overlap.py — detection + error_code

**Files:**
- Create: `mapping/open_mapping/core/overlap.py`
- Test: `mapping/tests/test_overlap.py`

**Interfaces:**
- Consumes: `pyclipper` (polygon intersection), `core.mapfiles`.
- Produces: `check_overlap(new_work, existing_works, existing_unicoms) -> int` returning `0` (ok), `1` (OVERLAP_MAP), `2` (OVERLAP_UNICOM), or `3` (CROSS_MULTI_MAPS).

- [ ] **Step 1: Write the failing test**

`mapping/tests/test_overlap.py`:
```python
from open_mapping.core.overlap import check_overlap

SQ = [(0, 0), (2, 0), (2, 2), (0, 2)]


def test_disjoint_is_ok():
    assert check_overlap(SQ, [[(5, 5), (6, 5), (6, 6), (5, 6)]], []) == 0


def test_overlapping_map_is_code_1():
    assert check_overlap(SQ, [[(1, 1), (3, 1), (3, 3), (1, 3)]], []) == 1


def test_overlapping_unicom_is_code_2():
    assert check_overlap(SQ, [], [[(1, 1), (3, 1), (3, 3), (1, 3)]]) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mapping && python -m pytest tests/test_overlap.py -v`
Expected: FAIL — `ModuleNotFoundError: open_mapping.core.overlap`

- [ ] **Step 3: Implement**

`mapping/open_mapping/core/overlap.py`:
```python
"""Overlap detection gating a save (mapping_msgs/srv/Mapping error_code).

1 = OVERLAPING_OTHER_MAP, 2 = OVERLAPING_OTHER_UNICOM, 3 = CROSS_MULTI_MAPS, 0 = ok.
"""
import pyclipper

SCALE = 1000


def _intersects(a, b):
    pc = pyclipper.Pyclipper()
    pc.AddPath([(round(x * SCALE), round(y * SCALE)) for x, y in a], pyclipper.PT_SUBJECT, True)
    pc.AddPath([(round(x * SCALE), round(y * SCALE)) for x, y in b], pyclipper.PT_CLIP, True)
    sol = pc.Execute(pyclipper.CT_INTERSECTION, pyclipper.PFT_NONZERO, pyclipper.PFT_NONZERO)
    return bool(sol)


def check_overlap(new_work, existing_works, existing_unicoms):
    for w in existing_works:
        if _intersects(new_work, w):
            return 1
    for u in existing_unicoms:
        if _intersects(new_work, u):
            return 2
    return 0
```
(Code 3 CROSS_MULTI_MAPS: confirm the stock trigger from `Mapping.srv` semantics + a corpus reject fixture; add when the constructed overlap fixture exercises it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mapping && python -m pytest tests/test_overlap.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mapping/open_mapping/core/overlap.py mapping/tests/test_overlap.py
git commit -m "feat(open-mapping): overlap detection + Mapping error_code"
```

---

### Task 11: save.py orchestrator + node wiring (full corpus byte-match)

**Files:**
- Modify: `mapping/open_mapping/core/save.py` (replace the stub)
- Modify: `mapping/open_mapping/node.py` (wire `handle("save_map")` to core)
- Test: `mapping/tests/test_save_full.py`

**Interfaces:**
- Consumes: every `core.*` emitter; `harness.diff_runner.run_fixture`; the whole corpus.
- Produces: real `save_map(input_dir, request, out_dir) -> None` orchestrating all emitters in order, and an overlap pre-check that returns early (writing nothing) when `check_overlap != 0`. `node.handle("save_map", fields)` returns `{result, message, error_code}` from the same path.

- [ ] **Step 1: Write the failing test (whole-corpus)**

`mapping/tests/test_save_full.py`:
```python
from pathlib import Path
from harness.diff_runner import run_fixture
from open_mapping.core.save import save_map

CORPUS = Path(__file__).resolve().parent.parent / "harness" / "fixtures" / "corpus"


def _fixtures():
    return [p for p in CORPUS.iterdir() if (p / "input").is_dir()]


def test_save_map_byte_matches_every_corpus_fixture():
    assert _fixtures(), "corpus is empty"
    for fx in _fixtures():
        report = run_fixture(fx, save_map)
        bad = [f"{f.name}:{f.status}" for f in report.files if f.status != "match"]
        assert not bad, f"{fx.name}: {bad}"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mapping && python -m pytest tests/test_save_full.py -v`
Expected: FAIL — the stub writes nothing; many files mismatch.

- [ ] **Step 3: Implement the orchestrator + wire the node**

Replace `mapping/open_mapping/core/save.py`:
```python
"""save_map orchestrator (mirrors stock saveScanData), byte-exact.

Reads x3 areas + the recorded boundary from input_dir, runs the overlap gate,
then emits in order: x3, csv_file (expandPolygon fan), map_info.json,
charging_station.yaml, per-map mapN.pgm/png/yaml, global map.pgm/png/yaml.
"""
from pathlib import Path
from open_mapping.core import mapfiles, clipper, raster, overlap, geometry as g


def save_map(input_dir, request, out_dir):
    input_dir, out_dir = Path(input_dir), Path(out_dir)
    areas = mapfiles.read_x3_areas(input_dir)
    works = {k: v for k, v in areas.items() if k.endswith("_work.csv")}
    obst = {k: v for k, v in areas.items() if "obstacle" in k}
    # (overlap gate runs on the recorded boundary vs existing works/unicoms;
    #  for regeneration corpus fixtures it is non-overlapping -> code 0)
    mapfiles.write_x3(out_dir, areas)
    for wname, wpts in works.items():
        obs_for = [v for k, v in obst.items() if k.startswith(wname.split("_")[0])]
        uni = [v for k, v in areas.items() if "unicom" in k and "charge" not in k]
        chg = [v for k, v in areas.items() if "charge" in k]
        contours = clipper.expand_polygon(wpts, obs_for, uni, chg, scale=clipper.SCALE)
        clipper.write_csv_file(out_dir, wname, contours, {})
        bounds = raster.grid_bounds({wname: wpts})
        body = raster.render_pgm(wpts, obs_for, bounds)
        w, h = raster.grid_size(bounds)
        slot = wname.split("_")[0]
        (out_dir / f"{slot}.pgm").write_bytes(raster.pgm_bytes(w, h, body))
        raster.write_png(out_dir, f"{slot}.png", body, w, h)
        raster.write_map_yaml(out_dir, f"{slot}.pgm", (bounds[0], bounds[1]))
    # global map.pgm/png/yaml
    gbounds = raster.grid_bounds(works)
    gbody = raster.render_global_pgm(areas, gbounds)
    gw, gh = raster.grid_size(gbounds)
    (out_dir / "map.pgm").write_bytes(raster.pgm_bytes(gw, gh, gbody))
    raster.write_png(out_dir, "map.png", gbody, gw, gh)
    raster.write_map_yaml(out_dir, "map.pgm", (gbounds[0], gbounds[1]))
    # map_info + charging_station: sizes/pose read from input map_info if present
```
Wire the node — in `mapping/open_mapping/node.py`, change `handle` so the `save_map` handler reports the overlap `error_code` (the orchestration itself runs in the ROS callback in Phase 2's live path; the pure `handle` keeps returning the stub-shaped dict but now sets `error_code` from an overlap check when fields carry the geometry). Keep `handle` pure (no file I/O); the file-writing `save_map` is the diff-runner path.

**Iterate** until `test_save_full.py` is green on every corpus fixture (this composes Tasks 4–10; fix integration mismatches — origin per-map vs global, charging pose source, map_info sizes — against the goldens).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mapping && python -m pytest tests/test_save_full.py -v && python -m pytest -q`
Expected: PASS — byte-exact across the whole corpus; full suite green.

- [ ] **Step 5: Commit**

```bash
git add mapping/open_mapping/core/save.py mapping/open_mapping/node.py mapping/tests/test_save_full.py
git commit -m "feat(open-mapping): save_map orchestrator byte-exact across corpus + node wiring"
```

---

## Self-Review

**Spec coverage:** corpus from existing map dirs → T1; harness recorded-boundary tweak → T2; geometry float formats → T3; x3/map_info/charging_station emitters → T4; csv_file fan (expandPolygon/pyclipper) → T5; grid math + pgm header + yaml → T6; per-map pgm pixels (offset + fillPoly) → T7; global map.pgm + seam → T8; png → T9; overlap + error_code → T10; orchestrator + node wiring → T11. Deps (pyclipper/opencv/numpy) → T1. All spec sections covered.

**Placeholder scan:** The byte-exact geometric tasks (T5, T7, T8, T9) are test-driven against the corpus with a concrete starting implementation + RE'd parameters + the iterate-until-byte-match instruction and a named fallback — this is the honest shape of byte-exact RE, not a "TODO". The format-known tasks (T3, T4, T6, T10) carry complete code. No bare "implement later".

**Type consistency:** `save_map(input_dir, request, out_dir) -> None` consistent T11/diff_runner. `expand_polygon(...)→list[contours]` + `write_csv_file` consistent T5/T11. `render_pgm`/`render_global_pgm`/`pgm_bytes`/`grid_bounds`/`grid_size`/`write_png`/`write_map_yaml` consistent T6/T7/T8/T9/T11. `read_x3_areas`/`write_x3`/`write_map_info`/`write_charging_station` consistent T4/T11. `check_overlap(...) -> int` consistent T10/T11. `clipper.SCALE`/`offset_meters` consistent T5/T7.

**Note for the executor:** T5/T7/T8/T9 are byte-exact search tasks — budget iteration; the test (corpus byte-match) is the spec, the RE'd params are the starting point, the disassembly + golden bytes are the oracle. T8 (seam) and T9 (png) carry explicit fallbacks/escalation.
