from open_mapping.node import build_service_specs, handle
from open_mapping.services import SERVICES


def test_build_service_specs_covers_table():
    specs = build_service_specs()
    assert len(specs) == len(SERVICES)
    names = {name for name, _type, _handler in specs}
    assert names == {s.name for s in SERVICES}


def test_handle_returns_stub_success():
    resp = handle("save_map", {"type": 1, "resolution": 0.05, "main_id": 0})
    assert resp["result"] is True
    assert resp["error_code"] == 0          # Mapping has error_code; stub = 0 (no overlap)
    assert "stub" in resp["message"].lower()


def test_handle_unknown_handler():
    resp = handle("does_not_exist", {})
    assert resp["result"] is False
