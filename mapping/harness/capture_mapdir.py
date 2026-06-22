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
