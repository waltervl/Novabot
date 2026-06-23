"""Full-corpus save_map test with selective byte-exact / structural validation.

Strategy (binding — matches task-11-brief.md override):
- TEXT outputs: byte-exact against golden
  x3_csv_file/*, csv_file/map_info.json,
  charging_station_file/charging_station.yaml, mapN.yaml, map.yaml
- RASTER outputs: structural validation (present, shape within 20 cells of golden,
  value-set FREE/OCCUPIED only, fidelity >= 85% when shapes match)
  mapN.pgm, map.pgm, mapN.png, map.png
- csv_file/mapN_work.csv: strategy-C clean offset (snapshot-validated separately)
- Everything else (LFIN*.zip, planned_path/, covered_path/, map.pgm.bak_navfix,
  csv_file/non-work CSVs): not checked (not produced by save_map)

Shape note: the corpus golden pgm is 379x257 (from firmware's in-memory polygon
after SimplifyPolygons+expandPolygon). Our implementation computes bounds from
x3 CSVs (raw work polygons), producing 375x246 — a known ~4/11 cell difference
documented in test_raster_header.py and the RE doc section 8. This is within the
20-cell structural tolerance.
"""
import tarfile
import tempfile
from pathlib import Path

import numpy as np
import pytest

from open_mapping.core.save import save_map

CORPUS = Path(__file__).resolve().parent.parent / "harness" / "fixtures" / "corpus"

TEXT_PATTERNS = {
    "x3_csv_file/",
    "csv_file/map_info.json",
    "charging_station_file/charging_station.yaml",
}

RASTER_PATTERNS = (".pgm", ".png")

SKIP_PATTERNS = (
    ".zip",
    "planned_path/",
    "covered_path/",
    ".bak_navfix",
)

_SHAPE_TOLERANCE = 15   # cells; known corpus gap is ~4/11


def _is_non_work_csv(name: str) -> bool:
    return (
        name.startswith("csv_file/")
        and name.endswith(".csv")
        and "_work.csv" not in name
    )


def _is_work_csv(name: str) -> bool:
    return name.startswith("csv_file/") and name.endswith("_work.csv")


def _is_text(name: str) -> bool:
    if any(name.startswith(p) or p in name for p in TEXT_PATTERNS):
        return True
    if name.endswith(".yaml") and not name.startswith("csv_file/"):
        return True
    return False


def _is_raster(name: str) -> bool:
    return (
        any(name.endswith(ext) for ext in RASTER_PATTERNS)
        and ".bak_navfix" not in name
    )


def _should_skip(name: str) -> bool:
    if any(p in name for p in SKIP_PATTERNS):
        return True
    if _is_non_work_csv(name):
        return True
    if _is_work_csv(name):
        return True
    return False


def _parse_pgm(data: bytes):
    """Parse a P5 PGM file; return (width, height, pixel_bytes).

    Proper parser: reads magic, skips whitespace/comment lines, then reads
    width height maxval tokens, then treats the rest as raw pixel bytes.
    """
    pos = 0

    def _skip_ws():
        nonlocal pos
        while pos < len(data) and data[pos:pos+1] in (b' ', b'\t', b'\r', b'\n'):
            pos += 1

    def _skip_comments():
        nonlocal pos
        while pos < len(data) and data[pos:pos+1] == b'#':
            end = data.index(b'\n', pos)
            pos = end + 1
            _skip_ws()

    def _read_token() -> str:
        nonlocal pos
        _skip_ws()
        _skip_comments()
        start = pos
        while pos < len(data) and data[pos:pos+1] not in (b' ', b'\t', b'\r', b'\n'):
            pos += 1
        return data[start:pos].decode('ascii')

    magic = _read_token()
    assert magic == 'P5', f"Not a P5 PGM file (got {magic!r})"
    width = int(_read_token())
    height = int(_read_token())
    _read_token()  # maxval — consumed but not used
    # After maxval token, exactly one whitespace byte precedes pixel data
    pos += 1
    return width, height, data[pos:]


def _fixtures():
    return sorted(p for p in CORPUS.iterdir() if (p / "input").is_dir())


def _run_fixture(fx: Path):
    import json
    request = json.loads((fx / "input" / "request.json").read_text())
    tmp = tempfile.TemporaryDirectory()
    tmp_path = Path(tmp.name)
    in_dir = tmp_path / "in"
    out_dir = tmp_path / "out"
    golden_dir = tmp_path / "golden"
    out_dir.mkdir()

    with tarfile.open(fx / "input" / "mapdir_before.tar", "r") as t:
        t.extractall(in_dir)
    with tarfile.open(fx / "golden" / "mapdir_after.tar", "r") as t:
        t.extractall(golden_dir)

    rb = fx / "input" / "recorded_boundary.csv"
    if rb.exists():
        (in_dir / "recorded_boundary.csv").write_bytes(rb.read_bytes())

    save_map(in_dir, request, out_dir)
    return out_dir, golden_dir, tmp


def _rel_files(root: Path):
    return {str(p.relative_to(root)) for p in root.rglob("*") if p.is_file()}


def test_corpus_not_empty():
    assert _fixtures(), "corpus is empty"


@pytest.mark.parametrize(
    "fx", _fixtures(), ids=lambda p: p.name
)
def test_text_outputs_byte_exact(fx):
    """All TEXT output files produced by save_map must byte-match the golden."""
    out_dir, golden_dir, tmp = _run_fixture(fx)
    try:
        golden_files = _rel_files(golden_dir)
        failures = []

        for name in sorted(golden_files):
            if _should_skip(name):
                continue
            if not _is_text(name):
                continue

            golden_path = golden_dir / name
            out_path = out_dir / name

            if not out_path.exists():
                failures.append(f"MISSING: {name}")
                continue

            g_bytes = golden_path.read_bytes()
            o_bytes = out_path.read_bytes()
            if g_bytes != o_bytes:
                failures.append(
                    f"DIFFER: {name} ({len(g_bytes)} golden bytes vs {len(o_bytes)} produced)"
                )

        assert not failures, f"{fx.name} TEXT mismatches:\n" + "\n".join(failures)
    finally:
        tmp.cleanup()


@pytest.mark.parametrize(
    "fx", _fixtures(), ids=lambda p: p.name
)
def test_raster_outputs_structural(fx):
    """All RASTER outputs must be present, shape within tolerance, correct values, fidelity >= 85%."""
    out_dir, golden_dir, tmp = _run_fixture(fx)
    try:
        golden_files = _rel_files(golden_dir)
        failures = []

        for name in sorted(golden_files):
            if _should_skip(name):
                continue
            if not _is_raster(name):
                continue

            golden_path = golden_dir / name
            out_path = out_dir / name

            if not out_path.exists():
                failures.append(f"MISSING raster: {name}")
                continue

            if name.endswith(".pgm"):
                g_bytes = golden_path.read_bytes()
                o_bytes = out_path.read_bytes()
                gw, gh, g_pix = _parse_pgm(g_bytes)
                ow, oh, o_pix = _parse_pgm(o_bytes)

                dw, dh = abs(gw - ow), abs(gh - oh)
                if dw > _SHAPE_TOLERANCE or dh > _SHAPE_TOLERANCE:
                    failures.append(
                        f"SHAPE MISMATCH: {name} golden={gw}x{gh} produced={ow}x{oh} "
                        f"(delta {dw}x{dh} > tolerance {_SHAPE_TOLERANCE})"
                    )
                    continue

                # Value set: only FREE (254) or OCCUPIED (0)
                o_arr = np.frombuffer(o_pix, dtype=np.uint8)
                unique = set(o_arr.tolist())
                if not unique <= {0, 254}:
                    failures.append(f"BAD VALUES in {name}: {unique - {0, 254}}")

                # Fidelity >= 85% (only when shapes match exactly)
                if (gw, gh) == (ow, oh):
                    g_arr = np.frombuffer(g_pix, dtype=np.uint8)
                    diff = int((g_arr != o_arr).sum())
                    fidelity = 100.0 * (1.0 - diff / g_arr.size)
                    if fidelity < 85.0:
                        failures.append(
                            f"LOW FIDELITY: {name} {fidelity:.1f}% < 85%"
                        )

            elif name.endswith(".png"):
                import cv2
                g_img = cv2.imread(str(golden_path), cv2.IMREAD_GRAYSCALE)
                o_img = cv2.imread(str(out_path), cv2.IMREAD_GRAYSCALE)
                if g_img is None:
                    continue
                if o_img is None:
                    failures.append(f"UNREADABLE png: {name}")
                    continue

                dh = abs(int(g_img.shape[0]) - int(o_img.shape[0]))
                dw = abs(int(g_img.shape[1]) - int(o_img.shape[1]))
                if dw > _SHAPE_TOLERANCE or dh > _SHAPE_TOLERANCE:
                    failures.append(
                        f"PNG SHAPE MISMATCH: {name} golden={g_img.shape} produced={o_img.shape}"
                    )
                    continue

                if g_img.shape == o_img.shape:
                    diff = int((g_img != o_img).sum())
                    fidelity = 100.0 * (1.0 - diff / g_img.size)
                    if fidelity < 85.0:
                        failures.append(
                            f"LOW PNG FIDELITY: {name} {fidelity:.1f}% < 85%"
                        )

        assert not failures, f"{fx.name} RASTER issues:\n" + "\n".join(failures)
    finally:
        tmp.cleanup()
