from open_mapping.services import SERVICES, by_name, KNOWN_TYPES, ServiceDef


def test_table_is_well_formed():
    assert len(SERVICES) >= 9
    names = [s.name for s in SERVICES]
    handlers = [s.handler for s in SERVICES]
    assert len(names) == len(set(names)), "service names must be unique"
    assert len(handlers) == len(set(handlers)), "handler keys must be unique"
    for s in SERVICES:
        assert isinstance(s, ServiceDef)
        assert s.msg_type in KNOWN_TYPES, f"{s.name} has unknown type {s.msg_type}"


def test_by_name():
    assert by_name("save_map").msg_type == "mapping_msgs/srv/Mapping"
    assert by_name("save_map").handler == "save_map"
    assert by_name("nope") is None
