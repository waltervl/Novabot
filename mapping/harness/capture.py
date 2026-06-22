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
