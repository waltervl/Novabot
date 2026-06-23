from open_mapping.node import build_service_specs, handle
from open_mapping.services import SERVICES


def test_build_service_specs_covers_table():
    specs = build_service_specs()
    assert len(specs) == len(SERVICES)
    names = {name for name, _type, _handler in specs}
    assert names == {s.name for s in SERVICES}


def test_handle_save_map_returns_success():
    resp = handle("save_map", {"type": 1, "resolution": 0.05, "main_id": 0})
    assert resp["result"] is True
    assert resp["error_code"] == 0          # no overlap geometry provided -> 0
    assert isinstance(resp["message"], str)


def test_handle_save_map_overlap_detection():
    """When new_work overlaps existing_works, error_code=1 is returned."""
    square = [(0.0, 0.0), (5.0, 0.0), (5.0, 5.0), (0.0, 5.0)]
    overlapping = [(2.0, 2.0), (7.0, 2.0), (7.0, 7.0), (2.0, 7.0)]
    resp = handle("save_map", {
        "new_work": square,
        "existing_works": [overlapping],
        "existing_unicoms": [],
    })
    assert resp["result"] is False
    assert resp["error_code"] == 1


def test_handle_unknown_handler():
    resp = handle("does_not_exist", {})
    assert resp["result"] is False
