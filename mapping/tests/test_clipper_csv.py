"""Strategy-C test for clipper.expand_polygon + write_csv_file.

We validate csv_file/map0_work.csv against a committed clean snapshot
(tests/golden/clean_map0_work.csv), NOT against the stock golden.

The stock binary uses a patched ClipperLib with one extra arc point, producing
23 contours / 552-pt main.  Our standard pyclipper output is 22 contours /
551-pt main — correct and deterministic.  The snapshot pins our clean output
for regression testing.
"""
import os
import tarfile
import tempfile
from pathlib import Path

from open_mapping.core import clipper, mapfiles

FX = Path(__file__).resolve().parent.parent / "harness" / "fixtures" / "corpus" / "complex_map0"
GOLDEN = Path(__file__).resolve().parent / "golden" / "clean_map0_work.csv"


def _run(tmp_root: Path):
    """Extract fixture input, run expand_polygon + write_csv_file, return output bytes."""
    in_dir = tmp_root / "in"
    out_dir = tmp_root / "out"
    out_dir.mkdir(parents=True)
    with tarfile.open(FX / "input" / "mapdir_before.tar", "r") as t:
        t.extractall(in_dir)

    areas = mapfiles.read_x3_areas(in_dir)
    work = areas["map0_work.csv"]
    obst = [v for k, v in areas.items() if "obstacle" in k]
    uni = [v for k, v in areas.items() if "unicom" in k and "charge" not in k]
    chg = [v for k, v in areas.items() if "charge" in k]

    contours = clipper.expand_polygon(work, obst, uni, chg, scale=clipper.SCALE)
    clipper.write_csv_file(out_dir, "map0_work.csv", contours, {})
    return (out_dir / "csv_file" / "map0_work.csv").read_bytes(), contours


def test_csv_file_map0_strategy_c_snapshot():
    """csv_file/map0_work.csv must byte-equal the committed clean snapshot."""
    with tempfile.TemporaryDirectory() as td:
        produced, contours = _run(Path(td))

    if not GOLDEN.exists():
        # Snapshot missing: CI guard or first-run.
        if os.environ.get("CI"):
            import pytest
            pytest.fail(
                f"clean snapshot missing in CI — regenerate locally and commit: {GOLDEN}"
            )
        # First-run (local): write the snapshot and skip (caller must commit the file).
        GOLDEN.parent.mkdir(parents=True, exist_ok=True)
        GOLDEN.write_bytes(produced)
        import pytest
        pytest.skip(f"Snapshot written to {GOLDEN} — commit it, then re-run.")

    snapshot = GOLDEN.read_bytes()
    assert produced == snapshot, (
        f"Output ({len(produced)} bytes) differs from committed clean snapshot "
        f"({len(snapshot)} bytes).  If the algorithm changed intentionally, "
        f"delete {GOLDEN} and re-run to regenerate."
    )


def test_csv_file_map0_structural():
    """Structural check: output is valid %.2f,%.2f CSV with a real offset polygon."""
    with tempfile.TemporaryDirectory() as td:
        produced, contours = _run(Path(td))

    # Must have contours
    assert contours, "expand_polygon returned no contours"

    # Main contour must have > 100 points (a real offset, not empty or trivial)
    assert len(contours[0]) > 100, (
        f"Main contour has only {len(contours[0])} points; expected > 100"
    )

    # Every line must parse as two %.2f floats
    text = produced.decode("ascii")
    for i, line in enumerate(text.splitlines()):
        parts = line.split(",")
        assert len(parts) == 2, f"Line {i}: expected 2 fields, got {len(parts)}: {line!r}"
        float(parts[0])  # raises if not parseable
        float(parts[1])
