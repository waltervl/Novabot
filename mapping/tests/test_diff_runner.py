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
        d.mkdir(parents=True, exist_ok=True)
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
