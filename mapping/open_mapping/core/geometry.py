"""CSV / map_info.json / yaml parsing and byte-exact formatting for save_map.

Float formats reverse-engineered from real mower files:
- csv lines: 2 decimals, comma, LF.
- map_info.json: jsoncpp StyledWriter — 3-space indent, ' : ' separator, floats
  as Python repr (shortest round-trip, matches the doubles on disk).
- map yaml: resolution/origin %.6f, fixed thresholds; trailing blank line (as
  written by the stock node, confirmed from real corpus mapN.yaml files).
"""


def parse_csv(text):
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        x, y = line.split(",")
        out.append((float(x), float(y)))
    return out


def format_csv(points):
    return "".join(f"{x:.2f},{y:.2f}\n" for x, y in points)


def _num(v):
    # jsoncpp valueToString uses %.17g (17 significant digits), NOT Python repr().
    # They agree on most doubles but diverge when the shortest round-trip is fewer
    # than 17 significant digits (e.g. 0.045200415556607483 → repr drops trailing 3).
    return "%.17g" % float(v)


def format_map_info(charging_pose, sizes):
    lines = ["{"]
    lines.append('   "charging_pose" : {')
    lines.append(f'      "orientation" : {_num(charging_pose["orientation"])},')
    lines.append(f'      "x" : {_num(charging_pose["x"])},')
    lines.append(f'      "y" : {_num(charging_pose["y"])}')
    lines.append("   },")
    items = sorted(sizes.items())
    for i, (name, size) in enumerate(items):
        lines.append(f'   "{name}" : {{')
        lines.append(f'      "map_size" : {_num(size)}')
        lines.append("   }" + ("," if i < len(items) - 1 else ""))
    lines.append("}")
    return "\n".join(lines) + "\n"


def format_charging_station(orientation):
    return f"charging_pose: [0, 0, {_num(orientation)}]\n"


def format_map_yaml(image, origin_xy):
    ox, oy = origin_xy
    return (
        f"image: {image}\n"
        "resolution: 0.050000\n"
        f"origin: [{ox:.6f}, {oy:.6f}, 0.000000]\n"
        "negate: 0\n"
        "occupied_thresh: 0.65\n"
        "free_thresh: 0.196\n"
        "\n"
    )
