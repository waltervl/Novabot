"""save_map orchestrator (mirrors stock saveScanData), byte-exact on text outputs.

Reads x3 areas + pre-existing state from input_dir, runs the overlap gate,
then emits in order: x3, csv_file (expandPolygon fan for work files, passthrough
for non-work files), map_info.json, charging_station.yaml, per-map
mapN.pgm/png/yaml, global map.pgm/png/yaml.

Text output strategy:
- x3_csv_file/*              : copy x3 areas byte-exact (read_x3_areas + write_x3)
- csv_file/mapN_work.csv     : expand_polygon fan (Strategy C clean offset)
- csv_file/non-work          : passthrough from input csv_file if present
- csv_file/map_info.json     : passthrough from input if present; else derive
- charging_station.yaml      : passthrough from input if present; else skip
- mapN.yaml / map.yaml       : passthrough from input if present; else derive from bounds

Raster output strategy:
- mapN.pgm/png, map.pgm/png  : render from x3 areas (structural fidelity ~92-97%;
                                NOT byte-exact vs firmware golden — firmware uses
                                in-memory polygons, see RE doc section 8).
                                Written only when work polygons exist.
"""
import json
from pathlib import Path

from open_mapping.core import mapfiles, clipper, raster
from open_mapping.core.overlap import check_overlap
from open_mapping.core.geometry import parse_csv


def _read_map_info(input_dir: Path):
    """Read existing csv_file/map_info.json; return (raw_bytes, charging_pose, sizes) or Nones."""
    p = input_dir / "csv_file" / "map_info.json"
    if not p.exists():
        return None, None, None
    raw = p.read_bytes()
    data = json.loads(raw)
    charging_pose = data.get("charging_pose", {})
    sizes = {
        k: v.get("map_size")
        for k, v in data.items()
        if k != "charging_pose" and isinstance(v, dict)
    }
    return raw, charging_pose, sizes


def _read_yaml(input_dir: Path, name: str):
    """Read mapN.yaml or map.yaml from input; return (raw_bytes, (ox, oy)) or (None, None)."""
    p = input_dir / name
    if not p.exists():
        return None, None
    raw = p.read_bytes()
    for line in raw.decode("utf-8").splitlines():
        if line.startswith("origin:"):
            inner = line.split("[", 1)[1].rstrip("]").strip()
            parts = [float(x.strip()) for x in inner.split(",")]
            return raw, (parts[0], parts[1])
    return raw, None


def save_map(input_dir, request: dict, out_dir) -> None:
    """Orchestrate a save_map: read x3 input, emit all output files.

    Args:
        input_dir: directory containing x3_csv_file/, recorded_boundary.csv, etc.
        request:   {type, resolution, main_id, ...}
        out_dir:   directory to write output files into (created if missing).
    """
    input_dir, out_dir = Path(input_dir), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. Read x3 areas
    areas = mapfiles.read_x3_areas(input_dir)
    works = {k: v for k, v in areas.items() if k.endswith("_work.csv")}
    obstacles = {k: v for k, v in areas.items() if "obstacle" in k}
    unicoms = {k: v for k, v in areas.items() if "unicom" in k}

    # 1b. Overlap self-guard: read the recorded_boundary and gate against
    #     existing works (excluding the work being saved) + existing unicoms.
    rb_path = input_dir / "recorded_boundary.csv"
    if rb_path.exists():
        recorded_boundary_points = parse_csv(rb_path.read_text())
        main_id = request.get("main_id")
        map_slot = f"map{main_id}" if main_id is not None else None
        # Exclude the work polygon being saved and any unicom whose filename
        # references this map slot (a corridor touching this map's boundary
        # by design should not trigger a false overlap).
        other_works = [v for k, v in works.items() if k != f"{map_slot}_work.csv"]
        other_unicoms = [v for k, v in unicoms.items() if map_slot not in k]
        code = check_overlap(recorded_boundary_points, other_works, other_unicoms)
        if code != 0:
            return

    # 2. Write x3 (byte-exact copy)
    mapfiles.write_x3(out_dir, areas)

    # 3. Write csv_file/mapN_work.csv via expand_polygon fan
    csv_out = out_dir / "csv_file"
    csv_out.mkdir(parents=True, exist_ok=True)
    for work_name, work_pts in sorted(works.items()):
        obs_for = list(obstacles.values())
        uni_for = [v for k, v in unicoms.items() if "charge" not in k]
        chg_for = [v for k, v in unicoms.items() if "charge" in k]
        contours = clipper.expand_polygon(work_pts, obs_for, uni_for, chg_for)
        clipper.write_csv_file(out_dir, work_name, contours, {})

    # 4. Passthrough non-work csv_file/* from input (obstacles, unicoms)
    input_csv = input_dir / "csv_file"
    if input_csv.is_dir():
        for src in sorted(input_csv.glob("*.csv")):
            name = src.name
            if not name.endswith("_work.csv"):
                dst = csv_out / name
                if not dst.exists():
                    dst.write_bytes(src.read_bytes())

    # 5. map_info.json: passthrough raw bytes if present in input
    mi_raw, charging_pose, sizes = _read_map_info(input_dir)
    if mi_raw is not None:
        (csv_out / "map_info.json").write_bytes(mi_raw)
    elif charging_pose and sizes:
        mapfiles.write_map_info(out_dir, charging_pose, sizes)

    # 6. charging_station.yaml: passthrough from input
    cs_src = input_dir / "charging_station_file" / "charging_station.yaml"
    if cs_src.exists():
        cs_out_dir = out_dir / "charging_station_file"
        cs_out_dir.mkdir(parents=True, exist_ok=True)
        (cs_out_dir / "charging_station.yaml").write_bytes(cs_src.read_bytes())

    # 7. Render rasters only when work polygons are present
    if not works:
        return

    pgm_bounds = raster.grid_bounds(works)

    # yaml origin: from pre-existing map.yaml if present, else derive from bounds
    map_yaml_raw, map_origin = _read_yaml(input_dir, "map.yaml")
    yaml_origin = map_origin if map_origin is not None else raster.grid_origin(pgm_bounds)

    # 8. per-map mapN.pgm / mapN.png / mapN.yaml
    for work_name in sorted(works.keys()):
        slot = work_name.replace("_work.csv", "")
        try:
            map_index = int(slot.replace("map", ""))
        except ValueError:
            continue

        body = raster.render_per_map_pgm(map_index, areas, pgm_bounds)
        w, h = raster.grid_size(pgm_bounds)
        (out_dir / f"{slot}.pgm").write_bytes(raster.pgm_bytes(w, h, body))
        raster.write_png(out_dir, f"{slot}.png", body, w, h)

        yaml_raw, _origin = _read_yaml(input_dir, f"{slot}.yaml")
        if yaml_raw is not None:
            (out_dir / f"{slot}.yaml").write_bytes(yaml_raw)
        else:
            raster.write_map_yaml(out_dir, f"{slot}.pgm", yaml_origin)

    # 9. global map.pgm / map.png / map.yaml
    global_body = raster.render_global_pgm(areas, pgm_bounds)
    gw, gh = raster.grid_size(pgm_bounds)
    (out_dir / "map.pgm").write_bytes(raster.pgm_bytes(gw, gh, global_body))
    raster.write_png(out_dir, "map.png", global_body, gw, gh)

    if map_yaml_raw is not None:
        (out_dir / "map.yaml").write_bytes(map_yaml_raw)
    else:
        raster.write_map_yaml(out_dir, "map.pgm", yaml_origin)
