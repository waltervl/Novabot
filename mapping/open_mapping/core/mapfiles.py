"""Read existing map-dir inputs and write the text output families."""
from pathlib import Path
from open_mapping.core import geometry as g


def read_x3_areas(input_dir):
    d = Path(input_dir) / "x3_csv_file"
    areas = {}
    if d.is_dir():
        for p in sorted(d.glob("*.csv")):
            areas[p.name] = g.parse_csv(p.read_text())
    return areas


def write_x3(out_dir, areas):
    d = Path(out_dir) / "x3_csv_file"
    d.mkdir(parents=True, exist_ok=True)
    for name, pts in areas.items():
        (d / name).write_text(g.format_csv(pts))


def write_map_info(out_dir, charging_pose, sizes):
    d = Path(out_dir) / "csv_file"
    d.mkdir(parents=True, exist_ok=True)
    (d / "map_info.json").write_text(g.format_map_info(charging_pose, sizes))


def write_charging_station(out_dir, orientation):
    d = Path(out_dir) / "charging_station_file"
    d.mkdir(parents=True, exist_ok=True)
    (d / "charging_station.yaml").write_text(g.format_charging_station(orientation))
