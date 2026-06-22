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


def test_real_fixture_with_stub_reports_mismatch():
    from open_mapping.core.save import save_map
    fx = Path(__file__).resolve().parent.parent / "harness" / "fixtures" / "save_map_complex_map0"
    report = run_fixture(fx, save_map)            # stub writes nothing
    assert not report.all_match                   # golden has files the stub can't produce yet
    missing = [f.name for f in report.files if f.status == "missing"]
    assert any("map0_work.csv" in n for n in missing)
