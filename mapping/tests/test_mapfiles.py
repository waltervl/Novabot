from pathlib import Path
from open_mapping.core import mapfiles


def test_x3_roundtrip_byte_exact(tmp_path):
    src = tmp_path / "in" / "x3_csv_file"; src.mkdir(parents=True)
    (src / "map1_work.csv").write_text("9.16,2.96\n9.13,2.80\n")
    areas = mapfiles.read_x3_areas(tmp_path / "in")
    out = tmp_path / "out"; out.mkdir()
    mapfiles.write_x3(out, areas)
    assert (out / "x3_csv_file" / "map1_work.csv").read_text() == "9.16,2.96\n9.13,2.80\n"


def test_map_info_written(tmp_path):
    out = tmp_path / "out"; out.mkdir()
    mapfiles.write_map_info(out, {"orientation": -1.5, "x": 2.0, "y": 0.0}, {"map0_work.csv": 28.5})
    txt = (out / "csv_file" / "map_info.json").read_text()
    assert '"map_size" : 28.5' in txt and txt.startswith("{\n")
