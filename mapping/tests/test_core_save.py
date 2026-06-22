from pathlib import Path
from open_mapping.core.save import save_map


def test_stub_is_callable_and_writes_nothing(tmp_path):
    in_dir = tmp_path / "in"
    out_dir = tmp_path / "out"
    in_dir.mkdir()
    out_dir.mkdir()
    save_map(in_dir, {"type": 1, "resolution": 0.05, "main_id": 0}, out_dir)
    assert list(out_dir.iterdir()) == [], "Phase 0 stub must produce no output"
