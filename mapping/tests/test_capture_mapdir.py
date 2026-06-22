import tarfile
from pathlib import Path
from harness.capture_mapdir import mapdir_to_fixture


def test_mapdir_becomes_input_golden_pair(tmp_path):
    md = tmp_path / "home0"
    (md / "x3_csv_file").mkdir(parents=True)
    (md / "csv_file").mkdir(parents=True)
    (md / "x3_csv_file" / "map1_work.csv").write_text("9.16,2.96\n9.13,2.80\n")
    (md / "csv_file" / "map1_work.csv").write_text("9.16,2.96\n9.13,2.80\n9.10,2.65\n")
    (md / "map1.yaml").write_text("image: map1.pgm\n")
    fx = tmp_path / "fixtures" / "map1"
    mapdir_to_fixture(md, "map1", fx)
    # input carries x3 (the boundary); golden carries the derived files
    with tarfile.open(fx / "input" / "mapdir_before.tar") as t:
        names = t.getnames()
    assert "./x3_csv_file/map1_work.csv" in names
    assert (fx / "input" / "recorded_boundary.csv").read_text() == "9.16,2.96\n9.13,2.80\n"
    with tarfile.open(fx / "golden" / "mapdir_after.tar") as t:
        gnames = t.getnames()
    assert "./csv_file/map1_work.csv" in gnames
    assert "./map1.yaml" in gnames
