from open_mapping.core import geometry as g


def test_parse_and_format_csv_roundtrip():
    assert g.parse_csv("9.16,2.96\n9.13,2.80\n") == [(9.16, 2.96), (9.13, 2.80)]
    assert g.format_csv([(9.16, 2.96), (9.13, 2.80)]) == "9.16,2.96\n9.13,2.80\n"


def test_format_map_info_matches_stock():
    out = g.format_map_info(
        {"orientation": -1.591749273541982, "x": 2.158885196021056, "y": 0.045200415556607483},
        {"map0_work.csv": 28.577500000000004, "map1_work.csv": 21.497500000000006},
    )
    expected = (
        '{\n'
        '   "charging_pose" : {\n'
        '      "orientation" : -1.591749273541982,\n'
        '      "x" : 2.158885196021056,\n'
        '      "y" : 0.045200415556607483\n'
        '   },\n'
        '   "map0_work.csv" : {\n'
        '      "map_size" : 28.577500000000004\n'
        '   },\n'
        '   "map1_work.csv" : {\n'
        '      "map_size" : 21.497500000000006\n'
        '   }\n'
        '}\n'
    )
    assert out == expected


def test_format_charging_station():
    assert g.format_charging_station(-1.518115032497305) == "charging_pose: [0, 0, -1.518115032497305]\n"


def test_format_map_yaml():
    # Real corpus (map0.yaml, map1.yaml, etc.) ends with \n\n (trailing blank line).
    assert g.format_map_yaml("map1.pgm", (-4.75, -1.60)) == (
        "image: map1.pgm\nresolution: 0.050000\n"
        "origin: [-4.750000, -1.600000, 0.000000]\nnegate: 0\n"
        "occupied_thresh: 0.65\nfree_thresh: 0.196\n\n"
    )
