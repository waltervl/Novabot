"""Phase 1 tests for core/save.py orchestrator."""
from pathlib import Path
from open_mapping.core.save import save_map


def test_save_map_produces_x3_output(tmp_path):
    """save_map must produce x3_csv_file output when x3 input exists."""
    in_dir = tmp_path / "in"
    out_dir = tmp_path / "out"
    in_dir.mkdir()
    out_dir.mkdir()
    x3 = in_dir / "x3_csv_file"
    x3.mkdir()
    (x3 / "map0_work.csv").write_text("0.00,0.00\n5.00,0.00\n5.00,5.00\n0.00,5.00\n")

    save_map(in_dir, {"type": 1, "resolution": 0.05, "main_id": 0}, out_dir)

    assert (out_dir / "x3_csv_file" / "map0_work.csv").exists(), \
        "save_map must write x3_csv_file output"
    assert (out_dir / "map0.pgm").exists(), \
        "save_map must write per-map pgm"
    assert (out_dir / "map.pgm").exists(), \
        "save_map must write global pgm"


def test_save_map_empty_input_produces_no_rasters(tmp_path):
    """save_map with no x3 input produces no raster files."""
    in_dir = tmp_path / "in"
    out_dir = tmp_path / "out"
    in_dir.mkdir()
    out_dir.mkdir()

    save_map(in_dir, {"type": 1, "resolution": 0.05, "main_id": 0}, out_dir)

    pgms = list(out_dir.glob("*.pgm"))
    assert pgms == [], f"Expected no pgm output, got: {pgms}"


def test_save_map_passthrough_map_info(tmp_path):
    """save_map passes through pre-existing map_info.json byte-exactly."""
    in_dir = tmp_path / "in"
    out_dir = tmp_path / "out"
    in_dir.mkdir()
    out_dir.mkdir()
    csv_dir = in_dir / "csv_file"
    csv_dir.mkdir()
    x3 = in_dir / "x3_csv_file"
    x3.mkdir()
    (x3 / "map0_work.csv").write_text("0.00,0.00\n5.00,0.00\n5.00,5.00\n0.00,5.00\n")
    mi_content = b'{"charging_pose": {"x": 1.0, "y": 2.0, "orientation": 0.0}}\n'
    (csv_dir / "map_info.json").write_bytes(mi_content)

    save_map(in_dir, {"type": 1, "resolution": 0.05, "main_id": 0}, out_dir)

    out_mi = out_dir / "csv_file" / "map_info.json"
    assert out_mi.exists(), "map_info.json must be written"
    assert out_mi.read_bytes() == mi_content, "map_info.json must be passed through byte-exact"
