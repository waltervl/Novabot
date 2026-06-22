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
