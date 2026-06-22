# Open Mapping Node — Phase 0 Implementation Plan (scaffold + diff-oracle)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the open-mapping-node repo skeleton plus a byte-identical diff-oracle (golden-fixture capture + diff-runner) that proves we can validate a Python reimplementation against the stock `novabot_mapping` outputs.

**Architecture:** A new top-level `mapping/` project with two sibling packages: `open_mapping/` (a thin rclpy node + a pure, ROS-free `core/`) and `harness/` (fixture capture + diff-runner). Phase 0 ships stubs for `core/` and stub service responses for the node; the harness exercises the full capture → run → byte-diff loop against one real fixture from the live mower.

**Tech Stack:** Python 3.8 (the mower's ROS2 Galactic runtime), rclpy (on-mower only, lazily imported), pytest. No numpy/PIL yet (Phase 1).

## Global Constraints

- Target runtime: **ROS2 Galactic, Python 3.8, ARM64 (Horizon X3)** on the mower.
- **`core/` and `harness/` MUST NOT import `rclpy`** — they are pure Python, testable on any dev machine. Only `open_mapping/node.py` imports rclpy, and it does so **lazily inside `main()`** so the package imports without ROS.
- Fidelity: **byte-identical to stock** — Phase 0 builds only the oracle; no real transform logic. **No bug fixes** (the expandPolygon/fan stays; that is Phase 5).
- Mirror the existing `mower/` patterns: wrapper-replace `deploy.sh`, `pytest.ini`, ROS-free core.
- Activation uses `ROS_LOCALHOST_ONLY=1`. Phase 0 ships `deploy.sh`/`wrapper.sh` but **does NOT activate** (stub would break mapping).
- Mower for capture: `root@192.168.0.244` (SN `LFIN2230700238`), password `novabot`. Stock binary: `/root/novabot/install/novabot_mapping/lib/novabot_mapping/novabot_mapping`. Map dir: `/userdata/lfi/maps/home0`.
- All commits on branch `feat/open-mapping-node`. No `Co-Authored-By` trailer.

---

### Task 1: Repo scaffold + pytest infrastructure

**Files:**
- Create: `mapping/open_mapping/__init__.py`
- Create: `mapping/open_mapping/core/__init__.py`
- Create: `mapping/harness/__init__.py`
- Create: `mapping/tests/__init__.py`
- Create: `mapping/pytest.ini`
- Create: `mapping/requirements.txt`
- Test: `mapping/tests/test_scaffold.py`

**Interfaces:**
- Consumes: nothing.
- Produces: importable packages `open_mapping`, `open_mapping.core`, `harness`; a pytest config with `pythonpath = .` rooted at `mapping/`.

- [ ] **Step 1: Write the failing test**

`mapping/tests/test_scaffold.py`:
```python
def test_packages_import():
    import open_mapping
    import open_mapping.core
    import harness
    assert open_mapping.__doc__ is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mapping && python -m pytest tests/test_scaffold.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'open_mapping'`

- [ ] **Step 3: Create the package files**

`mapping/open_mapping/__init__.py`:
```python
"""Open-source drop-in replacement for the stock novabot_mapping ROS2 node.

Phase 0: scaffold + diff-oracle only. See
docs/superpowers/specs/2026-06-22-open-mapping-node-design.md.
"""
```
`mapping/open_mapping/core/__init__.py`:
```python
"""Pure-Python map transform logic. MUST NOT import rclpy."""
```
`mapping/harness/__init__.py`:
```python
"""Golden-fixture capture + byte-diff oracle. MUST NOT import rclpy."""
```
`mapping/tests/__init__.py`: (empty file)

`mapping/pytest.ini`:
```ini
[pytest]
pythonpath = .
testpaths = tests
python_files = test_*.py
```
`mapping/requirements.txt`:
```
pytest>=7.0
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mapping && python -m pytest tests/test_scaffold.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mapping/
git commit -m "feat(open-mapping): phase0 scaffold + pytest infra"
```

---

### Task 2: Service name → type table

**Files:**
- Create: `mapping/open_mapping/services.py`
- Test: `mapping/tests/test_services.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `ServiceDef(name: str, msg_type: str, handler: str)` (frozen dataclass); `SERVICES: list[ServiceDef]`; `by_name(name: str) -> ServiceDef`; `KNOWN_TYPES: set[str]`.

- [ ] **Step 1: Write the failing test**

`mapping/tests/test_services.py`:
```python
from open_mapping.services import SERVICES, by_name, KNOWN_TYPES, ServiceDef


def test_table_is_well_formed():
    assert len(SERVICES) >= 9
    names = [s.name for s in SERVICES]
    handlers = [s.handler for s in SERVICES]
    assert len(names) == len(set(names)), "service names must be unique"
    assert len(handlers) == len(set(handlers)), "handler keys must be unique"
    for s in SERVICES:
        assert isinstance(s, ServiceDef)
        assert s.msg_type in KNOWN_TYPES, f"{s.name} has unknown type {s.msg_type}"


def test_by_name():
    assert by_name("save_map").msg_type == "mapping_msgs/srv/Mapping"
    assert by_name("save_map").handler == "save_map"
    assert by_name("nope") is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mapping && python -m pytest tests/test_services.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'open_mapping.services'`

- [ ] **Step 3: Write the implementation**

`mapping/open_mapping/services.py`:
```python
"""ROS2 service NAME -> mapping_msgs TYPE -> core handler key.

The NAMES are the service names mqtt_node's clients connect to. The set below
is the best-known mapping from the RE work; it MUST be verified on the mower
(see Step: verify) with `ros2 service list -t` while the stock node runs, and
reconciled here. Types come from
research/firmware/.../mapping_msgs/share/mapping_msgs/srvs/.
"""
from dataclasses import dataclass

KNOWN_TYPES = {
    "mapping_msgs/srv/Recording",
    "mapping_msgs/srv/Mapping",
    "mapping_msgs/srv/MappingControl",
    "mapping_msgs/srv/SetChargingPose",
    "mapping_msgs/srv/GenerateEmptyMap",
    "mapping_msgs/srv/StopAutoRecording",
    "mapping_msgs/srv/SaveRecording",
}


@dataclass(frozen=True)
class ServiceDef:
    name: str       # ROS service name mqtt_node connects to
    msg_type: str   # mapping_msgs/srv/<Type>
    handler: str    # key into the core dispatch


SERVICES = [
    ServiceDef("start_scan_map",     "mapping_msgs/srv/Recording",        "recording_start"),
    ServiceDef("add_scan_map",       "mapping_msgs/srv/Recording",        "recording_add"),
    ServiceDef("stop_scan_map",      "mapping_msgs/srv/Recording",        "recording_stop"),
    ServiceDef("start_erase_map",    "mapping_msgs/srv/Recording",        "erase_start"),
    ServiceDef("stop_erase_map",     "mapping_msgs/srv/Recording",        "erase_stop"),
    ServiceDef("save_map",           "mapping_msgs/srv/Mapping",          "save_map"),
    ServiceDef("mapping_control",    "mapping_msgs/srv/MappingControl",   "mapping_control"),
    ServiceDef("set_charging_pose",  "mapping_msgs/srv/SetChargingPose",  "set_charging_pose"),
    ServiceDef("generate_empty_map", "mapping_msgs/srv/GenerateEmptyMap", "generate_empty_map"),
    ServiceDef("stop_auto_recording","mapping_msgs/srv/StopAutoRecording","stop_auto_recording"),
    ServiceDef("save_recording",     "mapping_msgs/srv/SaveRecording",    "save_recording"),
]

_BY_NAME = {s.name: s for s in SERVICES}


def by_name(name):
    """Return the ServiceDef for a service name, or None if unknown."""
    return _BY_NAME.get(name)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mapping && python -m pytest tests/test_services.py -v`
Expected: PASS

- [ ] **Step 5: Verify against the live mower (reconcile names)**

Run (records the ground-truth names/types into a notes file; reconcile any mismatch by editing `SERVICES`, then re-run Step 4):
```bash
sshpass -p novabot ssh -o StrictHostKeyChecking=no root@192.168.0.244 \
  'source /root/novabot/install/setup.bash 2>/dev/null; ros2 service list -t | grep -iE "scan_map|save_map|erase|charging|empty_map|recording|mapping_control"' \
  | tee mapping/open_mapping/SERVICES_observed.txt
```
Expected: a list of `/<name> [mapping_msgs/srv/<Type>]` lines. If any name/type differs from `SERVICES`, edit `services.py` to match, re-run Step 4 until green.

- [ ] **Step 6: Commit**

```bash
git add mapping/open_mapping/services.py mapping/tests/test_services.py mapping/open_mapping/SERVICES_observed.txt
git commit -m "feat(open-mapping): service name->type table, verified on mower"
```

---

### Task 3: Core save_map stub + transform contract

**Files:**
- Create: `mapping/open_mapping/core/save.py`
- Test: `mapping/tests/test_core_save.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `save_map(input_dir: Path, request: dict, out_dir: Path) -> None` — the file-transform contract the diff-runner drives. Phase 0 stub writes nothing.

- [ ] **Step 1: Write the failing test**

`mapping/tests/test_core_save.py`:
```python
from pathlib import Path
from open_mapping.core.save import save_map


def test_stub_is_callable_and_writes_nothing(tmp_path):
    in_dir = tmp_path / "in"
    out_dir = tmp_path / "out"
    in_dir.mkdir()
    out_dir.mkdir()
    save_map(in_dir, {"type": 1, "resolution": 0.05, "main_id": 0}, out_dir)
    assert list(out_dir.iterdir()) == [], "Phase 0 stub must produce no output"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mapping && python -m pytest tests/test_core_save.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'open_mapping.core.save'`

- [ ] **Step 3: Write the stub**

`mapping/open_mapping/core/save.py`:
```python
"""save_map file transform (Phase 0 stub).

Phase 1 implements the real logic: read `input_dir` (csv_file/, x3_csv_file/,
recorded_boundary.csv) + `request` ({type:0|1, resolution, main_id}) and write
the stock output files (csv_file/mapN_work.csv, x3_csv_file/..., mapN.pgm/png/
yaml, map.pgm, map_info.json, charging_station.yaml) into `out_dir` byte-for-byte
identical to the stock node. The Phase 0 stub intentionally writes nothing, so
the diff-runner reports the full set of files Phase 1 must reproduce.
"""
from pathlib import Path


def save_map(input_dir: Path, request: dict, out_dir: Path) -> None:
    # Phase 0: stub. Do not implement transform logic here (that is Phase 1).
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mapping && python -m pytest tests/test_core_save.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mapping/open_mapping/core/save.py mapping/tests/test_core_save.py
git commit -m "feat(open-mapping): save_map transform contract (phase0 stub)"
```

---

### Task 4: Diff-runner (the oracle)

**Files:**
- Create: `mapping/harness/diff_runner.py`
- Test: `mapping/tests/test_diff_runner.py`

**Interfaces:**
- Consumes: a `core_fn(input_dir: Path, request: dict, out_dir: Path) -> None` (e.g. `open_mapping.core.save.save_map`).
- Produces: `FileDiff(name: str, status: str, detail: str)`; `DiffReport(files: list[FileDiff])` with `.all_match` property; `run_fixture(fixture_dir: Path, core_fn) -> DiffReport`. `status` is one of `"match" | "differ" | "missing" | "extra"`.

- [ ] **Step 1: Write the failing test**

`mapping/tests/test_diff_runner.py`:
```python
import json, tarfile
from pathlib import Path
from harness.diff_runner import run_fixture


def _make_fixture(root: Path, before: dict, after: dict, request: dict) -> Path:
    """before/after: {relpath: bytes} map-dir contents."""
    fx = root / "fx"
    (fx / "input").mkdir(parents=True)
    (fx / "golden").mkdir(parents=True)
    for sub, contents in (("before", before), ("after", after)):
        d = root / sub
        for rel, data in contents.items():
            p = d / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
        tar = (fx / "input" / "mapdir_before.tar") if sub == "before" else (fx / "golden" / "mapdir_after.tar")
        with tarfile.open(tar, "w") as t:
            t.add(d, arcname=".")
    (fx / "input" / "request.json").write_text(json.dumps(request))
    (fx / "input" / "recorded_boundary.csv").write_text("0,0\n1,0\n1,1\n")
    return fx


def test_match_when_core_reproduces_golden(tmp_path):
    fx = _make_fixture(tmp_path, before={}, after={"csv_file/map0_work.csv": b"0,0\n"}, request={"type": 1})

    def core_fn(input_dir, request, out_dir):
        p = out_dir / "csv_file" / "map0_work.csv"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b"0,0\n")

    report = run_fixture(fx, core_fn)
    assert report.all_match
    assert [f.status for f in report.files] == ["match"]


def test_mismatch_when_core_writes_nothing(tmp_path):
    fx = _make_fixture(tmp_path, before={}, after={"csv_file/map0_work.csv": b"0,0\n"}, request={"type": 1})

    def core_fn(input_dir, request, out_dir):
        return None

    report = run_fixture(fx, core_fn)
    assert not report.all_match
    statuses = {f.name: f.status for f in report.files}
    assert statuses["csv_file/map0_work.csv"] == "missing"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mapping && python -m pytest tests/test_diff_runner.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'harness.diff_runner'`

- [ ] **Step 3: Write the implementation**

`mapping/harness/diff_runner.py`:
```python
"""Run a core file-transform on a fixture's input and byte-diff its output
against the frozen golden output. The oracle for byte-identical parity."""
import json
import tarfile
import tempfile
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class FileDiff:
    name: str
    status: str   # "match" | "differ" | "missing" | "extra"
    detail: str = ""


@dataclass
class DiffReport:
    files: list = field(default_factory=list)

    @property
    def all_match(self):
        return bool(self.files) and all(f.status == "match" for f in self.files)


def _extract(tar_path: Path, dest: Path):
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tar_path, "r") as t:
        t.extractall(dest)


def _rel_files(root: Path):
    return {str(p.relative_to(root)) for p in root.rglob("*") if p.is_file()}


def run_fixture(fixture_dir: Path, core_fn) -> DiffReport:
    """Load fixture_dir/input, run core_fn, byte-diff against fixture_dir/golden."""
    fixture_dir = Path(fixture_dir)
    request = json.loads((fixture_dir / "input" / "request.json").read_text())
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        in_dir = tmp / "in"
        out_dir = tmp / "out"
        golden_dir = tmp / "golden"
        out_dir.mkdir()
        _extract(fixture_dir / "input" / "mapdir_before.tar", in_dir)
        _extract(fixture_dir / "golden" / "mapdir_after.tar", golden_dir)

        core_fn(in_dir, request, out_dir)

        golden_files = _rel_files(golden_dir)
        out_files = _rel_files(out_dir)
        report = DiffReport()
        for name in sorted(golden_files | out_files):
            g = golden_dir / name
            o = out_dir / name
            if name not in out_files:
                report.files.append(FileDiff(name, "missing", "core produced no such file"))
            elif name not in golden_files:
                report.files.append(FileDiff(name, "extra", "core produced an unexpected file"))
            elif g.read_bytes() == o.read_bytes():
                report.files.append(FileDiff(name, "match"))
            else:
                report.files.append(FileDiff(name, "differ", f"{len(g.read_bytes())} vs {len(o.read_bytes())} bytes"))
        return report
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mapping && python -m pytest tests/test_diff_runner.py -v`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add mapping/harness/diff_runner.py mapping/tests/test_diff_runner.py
git commit -m "feat(open-mapping): byte-diff oracle (diff_runner) + tests"
```

---

### Task 5: Fixture capture tooling + one real fixture

**Files:**
- Create: `mapping/harness/capture.py`
- Create: `mapping/harness/fixtures/save_map_complex_map0/` (captured artifact)
- Test: `mapping/tests/test_capture.py`

**Interfaces:**
- Consumes: `harness.diff_runner.run_fixture` (for the end-to-end check).
- Produces: `pack_fixture(before_dir: Path, after_dir: Path, request: dict, recorded_boundary: bytes, meta: dict, out_fixture: Path) -> None` — writes `input/mapdir_before.tar`, `input/request.json`, `input/recorded_boundary.csv`, `golden/mapdir_after.tar`, `meta.json`.

- [ ] **Step 1: Write the failing test**

`mapping/tests/test_capture.py`:
```python
import json, tarfile
from pathlib import Path
from harness.capture import pack_fixture
from harness.diff_runner import run_fixture


def test_pack_then_run_roundtrip(tmp_path):
    before = tmp_path / "before"; before.mkdir()
    after = tmp_path / "after"; after.mkdir()
    (after / "csv_file").mkdir()
    (after / "csv_file" / "map0_work.csv").write_bytes(b"0,0\n1,1\n")
    fx = tmp_path / "fixtures" / "demo"
    pack_fixture(before, after, {"type": 1, "service": "save_map"}, b"0,0\n", {"sn": "TEST"}, fx)

    assert (fx / "input" / "mapdir_before.tar").exists()
    assert (fx / "golden" / "mapdir_after.tar").exists()
    assert json.loads((fx / "meta.json").read_text())["sn"] == "TEST"

    # A core_fn reproducing the golden file makes the oracle report match.
    def core_fn(in_dir, request, out_dir):
        p = out_dir / "csv_file" / "map0_work.csv"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b"0,0\n1,1\n")

    assert run_fixture(fx, core_fn).all_match
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mapping && python -m pytest tests/test_capture.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'harness.capture'`

- [ ] **Step 3: Write the implementation**

`mapping/harness/capture.py`:
```python
"""Pack a golden fixture from a before/after map-dir snapshot + request.

Snapshots themselves are taken from the live mower over ssh (see
capture_from_mower in the module docstring / README); this function packs them
into the committed fixture layout the diff-runner consumes.
"""
import json
import tarfile
from pathlib import Path


def _tar_dir(src: Path, tar_path: Path):
    tar_path.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tar_path, "w") as t:
        t.add(src, arcname=".")


def pack_fixture(before_dir: Path, after_dir: Path, request: dict,
                 recorded_boundary: bytes, meta: dict, out_fixture: Path) -> None:
    out_fixture = Path(out_fixture)
    (out_fixture / "input").mkdir(parents=True, exist_ok=True)
    (out_fixture / "golden").mkdir(parents=True, exist_ok=True)
    _tar_dir(Path(before_dir), out_fixture / "input" / "mapdir_before.tar")
    _tar_dir(Path(after_dir), out_fixture / "golden" / "mapdir_after.tar")
    (out_fixture / "input" / "request.json").write_text(json.dumps(request, indent=1))
    (out_fixture / "input" / "recorded_boundary.csv").write_bytes(recorded_boundary)
    (out_fixture / "meta.json").write_text(json.dumps(meta, indent=1))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mapping && python -m pytest tests/test_capture.py -v`
Expected: PASS

- [ ] **Step 5: Capture one real fixture from the mower**

Run (pulls a before/after map-dir snapshot around a save; here we reconstruct the `save_map_complex_map0` we already have — the corrupt golden csv was saved as `.corrupt_bak`):
```bash
SN=LFIN2230700238; M=root@192.168.0.244
mkdir -p /tmp/fx_after /tmp/fx_before
# golden "after" = the live map dir WITH the stock-written (corrupt) map0_work.csv
sshpass -p novabot scp -r -o StrictHostKeyChecking=no "$M:/userdata/lfi/maps/home0/csv_file" /tmp/fx_after/
sshpass -p novabot scp -r -o StrictHostKeyChecking=no "$M:/userdata/lfi/maps/home0/x3_csv_file" /tmp/fx_after/
# restore the corrupt stock output into the golden snapshot (we replaced it with x3 during cleanup)
sshpass -p novabot scp -o StrictHostKeyChecking=no "$M:/tmp/map0_work.csv.corrupt_bak" /tmp/fx_after/csv_file/map0_work.csv
# "before" = same dir minus map0's regenerated files (Phase 1 will reproduce them)
cp -r /tmp/fx_after /tmp/fx_before && rm -f /tmp/fx_before/csv_file/map0_work.csv /tmp/fx_before/x3_csv_file/map0_work.csv
# recorded boundary = the clean raw recording (x3, 147 pts)
sshpass -p novabot scp -o StrictHostKeyChecking=no "$M:/userdata/lfi/maps/home0/x3_csv_file/map0_work.csv" /tmp/recorded_boundary.csv
python -c "
from pathlib import Path
from harness.capture import pack_fixture
pack_fixture(Path('/tmp/fx_before'), Path('/tmp/fx_after'),
  {'service':'save_map','type':1,'resolution':0.05,'main_id':0},
  Path('/tmp/recorded_boundary.csv').read_bytes(),
  {'sn':'LFIN2230700238','fw':'v6.0.2-custom-37','note':'complex map0: 2 obstacles+2 unicoms+charger -> expandPolygon fan (~23x)'},
  Path('mapping/harness/fixtures/save_map_complex_map0'))
"
```
(run the `python` line from inside `mapping/`). Expected: `mapping/harness/fixtures/save_map_complex_map0/` populated.

- [ ] **Step 6: Add an end-to-end oracle test on the real fixture**

Append to `mapping/tests/test_capture.py`:
```python
def test_real_fixture_with_stub_reports_mismatch():
    from open_mapping.core.save import save_map
    fx = Path(__file__).resolve().parent.parent / "harness" / "fixtures" / "save_map_complex_map0"
    report = run_fixture(fx, save_map)            # stub writes nothing
    assert not report.all_match                   # golden has files the stub can't produce yet
    missing = [f.name for f in report.files if f.status == "missing"]
    assert any("map0_work.csv" in n for n in missing)
```

- [ ] **Step 7: Run + commit**

Run: `cd mapping && python -m pytest tests/test_capture.py -v`
Expected: PASS (3 tests; the oracle proves end-to-end on real data)
```bash
git add mapping/harness/capture.py mapping/harness/fixtures/ mapping/tests/test_capture.py
git commit -m "feat(open-mapping): fixture capture + real save_map_complex_map0 golden + e2e oracle proof"
```

---

### Task 6: rclpy node skeleton (stub responses)

**Files:**
- Create: `mapping/open_mapping/node.py`
- Test: `mapping/tests/test_node.py`

**Interfaces:**
- Consumes: `open_mapping.services.SERVICES`.
- Produces: `build_service_specs() -> list[tuple[str, str, str]]` (name, msg_type, handler) and `handle(handler: str, request_fields: dict) -> dict` (stub responses), both pure (no rclpy). `main()` (rclpy, lazily imported) registers each service.

- [ ] **Step 1: Write the failing test**

`mapping/tests/test_node.py`:
```python
from open_mapping.node import build_service_specs, handle
from open_mapping.services import SERVICES


def test_build_service_specs_covers_table():
    specs = build_service_specs()
    assert len(specs) == len(SERVICES)
    names = {name for name, _type, _handler in specs}
    assert names == {s.name for s in SERVICES}


def test_handle_returns_stub_success():
    resp = handle("save_map", {"type": 1, "resolution": 0.05, "main_id": 0})
    assert resp["result"] is True
    assert resp["error_code"] == 0          # Mapping has error_code; stub = 0 (no overlap)
    assert "stub" in resp["message"].lower()


def test_handle_unknown_handler():
    resp = handle("does_not_exist", {})
    assert resp["result"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mapping && python -m pytest tests/test_node.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'open_mapping.node'`

- [ ] **Step 3: Write the implementation**

`mapping/open_mapping/node.py`:
```python
"""rclpy ROS2 node for the open mapping node (Phase 0: stub responses).

rclpy is imported lazily inside main() so this module imports on any machine
(tests run the pure build_service_specs() / handle() without ROS). Phase 1+
wires `handle` to open_mapping.core.
"""
from open_mapping.services import SERVICES


def build_service_specs():
    """(name, msg_type, handler) for every service the node registers."""
    return [(s.name, s.msg_type, s.handler) for s in SERVICES]


def handle(handler: str, request_fields: dict) -> dict:
    """Phase 0 stub: acknowledge every call without doing work.

    Returns the union of fields the mapping_msgs responses use; the ROS layer
    copies the relevant ones onto the concrete response message. `result=True`,
    `error_code=0` (Mapping), benign defaults elsewhere.
    """
    known = {s.handler for s in SERVICES}
    if handler not in known:
        return {"result": False, "message": f"unknown handler: {handler}", "error_code": 0}
    return {"result": True, "message": "open-mapping phase0 stub", "error_code": 0}


def main(args=None):
    import rclpy
    from rclpy.node import Node

    rclpy.init(args=args)
    node = Node("novabot_mapping")  # claim the stock node name
    node.get_logger().warn("open-mapping PHASE 0 stub node — services acknowledge only")
    # Phase 1+: import the concrete mapping_msgs srv types and register a
    # service per build_service_specs() that deserializes -> handle() -> response.
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mapping && python -m pytest tests/test_node.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add mapping/open_mapping/node.py mapping/tests/test_node.py
git commit -m "feat(open-mapping): rclpy node skeleton + pure dispatch (phase0 stub)"
```

---

### Task 7: Deploy wrapper + README (prepared, not activated)

**Files:**
- Create: `mapping/wrapper.sh`
- Create: `mapping/deploy.sh`
- Create: `mapping/README.md`
- Test: `mapping/tests/test_deploy_scripts.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `wrapper.sh` (started in place of the stock binary), `deploy.sh` (`deploy`/`--hot`/`--rollback`/`--status`). Both are shell; the test asserts they parse and contain the required safety pieces.

- [ ] **Step 1: Write the failing test**

`mapping/tests/test_deploy_scripts.py`:
```python
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_scripts_have_valid_syntax():
    for name in ("wrapper.sh", "deploy.sh"):
        subprocess.run(["bash", "-n", str(ROOT / name)], check=True)


def test_deploy_has_rollback_and_backup_and_localhost():
    deploy = (ROOT / "deploy.sh").read_text()
    wrapper = (ROOT / "wrapper.sh").read_text()
    assert "--rollback" in deploy
    assert ".orig" in deploy, "must back up the stock binary before replacing it"
    assert "ROS_LOCALHOST_ONLY=1" in wrapper
    assert "novabot_mapping" in deploy
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mapping && python -m pytest tests/test_deploy_scripts.py -v`
Expected: FAIL — `bash: .../wrapper.sh: No such file or directory`

- [ ] **Step 3: Write the scripts + README**

`mapping/wrapper.sh`:
```bash
#!/bin/bash
# wrapper.sh — installed in place of the stock novabot_mapping binary.
# novabot_launch execs this; it starts the open Python node with correct DDS
# timing (no kill/restart). Mirrors mower/ robot_decision wrapper strategy.
export ROS_LOCALHOST_ONLY=1
DEPLOY_DIR=/userdata/open_mapping
source /root/novabot/install/setup.bash 2>/dev/null
exec python3 -m open_mapping.node "$@" >>"$DEPLOY_DIR/mapping.log" 2>&1
```

`mapping/deploy.sh`:
```bash
#!/bin/bash
# deploy.sh — deploy the open mapping node to the mower via wrapper-replace.
# Phase 0: scaffolding only. Do NOT run plain `deploy` in production until a
# later phase is byte-verified — the stub node would break mapping.
set -e
MOWER=${MOWER_IP:-192.168.0.244}
MOWER_USER=root
DEPLOY_DIR=/userdata/open_mapping
BINARY_DIR=/root/novabot/install/novabot_mapping/lib/novabot_mapping
BINARY=$BINARY_DIR/novabot_mapping
BACKUP=$BINARY_DIR/novabot_mapping.orig
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export SSHPASS=novabot
SSH="sshpass -e ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no $MOWER_USER@$MOWER"
SCP="sshpass -e scp -o ConnectTimeout=10 -o StrictHostKeyChecking=no"

case "${1:-status}" in
  --status)
    $SSH "test -f $BACKUP && echo 'wrapper INSTALLED (open node active)' || echo 'stock binary active'"
    ;;
  --hot)
    echo ">>> Copying Python files only (no restart)..."
    $SSH "mkdir -p $DEPLOY_DIR/open_mapping"
    $SCP -r "$SCRIPT_DIR/open_mapping/." "$MOWER_USER@$MOWER:$DEPLOY_DIR/open_mapping/"
    ;;
  --rollback)
    echo ">>> Rollback: restore stock binary..."
    $SSH "test -f $BACKUP && cp $BACKUP $BINARY && rm -f $BACKUP && echo restored || echo 'no backup; already stock'"
    ;;
  deploy)
    echo ">>> Deploy: install wrapper in place of stock binary..."
    echo ">>> WARNING: Phase 0 node is a STUB and will break mapping. Abort unless byte-verified."
    $SSH "mkdir -p $DEPLOY_DIR/open_mapping"
    $SCP -r "$SCRIPT_DIR/open_mapping/." "$MOWER_USER@$MOWER:$DEPLOY_DIR/open_mapping/"
    $SCP "$SCRIPT_DIR/wrapper.sh" "$MOWER_USER@$MOWER:$DEPLOY_DIR/wrapper.sh"
    $SSH "test -f $BACKUP || cp $BINARY $BACKUP; cp $DEPLOY_DIR/wrapper.sh $BINARY; chmod +x $BINARY"
    echo ">>> Done. Reboot the mower so novabot_launch starts the wrapper."
    ;;
  *) echo "usage: deploy.sh [deploy|--hot|--rollback|--status]"; exit 1 ;;
esac
```

`mapping/README.md`:
```markdown
# Open Mapping Node

Open-source drop-in replacement for the stock `novabot_mapping` ROS2 node.
Python (rclpy), byte-identical fidelity. See the spec:
`docs/superpowers/specs/2026-06-22-open-mapping-node-design.md`.

## Layout
- `open_mapping/` — rclpy node (`node.py`, thin) + pure ROS-free `core/`.
- `harness/` — golden-fixture capture (`capture.py`) + byte-diff oracle (`diff_runner.py`) + `fixtures/`.
- `tests/` — pytest. Run: `cd mapping && python -m pytest -v`.

## Status: Phase 0 (scaffold + diff-oracle)
`core/` is stubbed; the node acknowledges services without doing work. The
harness proves the byte-diff oracle end-to-end on `fixtures/save_map_complex_map0`.
**Not deployed** — `deploy.sh` is prepared but activating the stub would break
mapping. Activation waits until Phase 1 is byte-verified.

## Deploy (later)
`./deploy.sh --status | --hot | --rollback | deploy` (wrapper-replace strategy,
mirrors `mower/deploy.sh`; backs up the stock binary to `.orig`).
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mapping && python -m pytest tests/test_deploy_scripts.py -v && chmod +x mapping/deploy.sh mapping/wrapper.sh`
Expected: PASS (2 tests)

- [ ] **Step 5: Full suite + commit**

Run: `cd mapping && python -m pytest -v`
Expected: PASS (all tasks' tests green)
```bash
git add mapping/wrapper.sh mapping/deploy.sh mapping/README.md mapping/tests/test_deploy_scripts.py
git commit -m "feat(open-mapping): deploy/wrapper scaffolding + README (not activated)"
```

---

## Self-Review

**Spec coverage:** Phase 0 done-criteria → tasks: (1) scaffold+pytest → T1; (2) deploy.sh/wrapper.sh not activated → T7; (3) ≥1 real golden fixture committed → T5; (4) diff_runner runs stub on real fixture, reports diff → T5 Step 6; (5) pytest infra → T1. Service-name→type table (spec §Service surface) → T2. Node skeleton claiming names → T6. ROS/core split (spec §Architecture) → T3/T4/T6 (core+harness ROS-free, node lazy-imports rclpy). All covered.

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The "Phase 1 implements …" notes are scope markers inside stubs, not plan gaps.

**Type consistency:** `save_map(input_dir, request, out_dir) -> None` is identical in T3 (def), T4 (consumed by run_fixture), T5 (used in e2e test). `run_fixture(fixture_dir, core_fn) -> DiffReport` consistent T4/T5. `FileDiff.status` values `match/differ/missing/extra` used consistently. `build_service_specs`/`handle` signatures match T6 test/impl. `pack_fixture(...)` signature matches T5 test/impl.
