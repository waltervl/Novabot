"""Stub command handlers — start_patrol, stop_patrol, auto_connect.

Decompile lines 321148-321411 confirm patrol is JSON-echo only.
auto_connect has no handler in the stock binary at all (silent drop).
"""
from command_dispatcher import CommandDispatcher
from stub_commands import make_handlers, register_with_dispatcher


def test_start_patrol_echo_ack():
    h = make_handlers()
    assert h['start_patrol']({'cmd_num': 99}) == {'result': 0, 'value': 0}


def test_stop_patrol_echo_ack():
    h = make_handlers()
    assert h['stop_patrol']({}) == {'result': 0, 'value': 0}


def test_auto_connect_silent_ack():
    h = make_handlers()
    assert h['auto_connect']({}) == {'result': 0}


def test_register_wires_six_commands():
    dispatcher = CommandDispatcher()
    register_with_dispatcher(dispatcher)
    assert sorted(dispatcher.registered_commands) == [
        'auto_connect',
        'report_state_map_outline',
        'report_state_map_path_list',
        'report_state_unbind',
        'start_patrol',
        'stop_patrol',
    ]


def test_report_state_map_outline_echoes_status_and_percentage():
    h = make_handlers()
    resp = h['report_state_map_outline']({'status': 'mapping', 'percentage': 42.5})
    assert resp == {'status': 'mapping', 'percentage': 42.5}


def test_report_state_map_path_list_echoes_status_and_percentage():
    h = make_handlers()
    resp = h['report_state_map_path_list']({'status': 'planning', 'percentage': 99.9})
    assert resp == {'status': 'planning', 'percentage': 99.9}


def test_report_state_unbind_echoes_status_int():
    h = make_handlers()
    resp = h['report_state_unbind']({'status': 1})
    assert resp == {'status': 1}


def test_report_stubs_tolerate_missing_fields():
    h = make_handlers()
    assert h['report_state_map_outline']({}) == {'status': '', 'percentage': 0.0}
    assert h['report_state_unbind']({}) == {'status': 0}


def test_dispatcher_round_trip_publishes_respond():
    seen = []
    dispatcher = CommandDispatcher(respond_publisher=lambda key, body: seen.append((key, body)))
    register_with_dispatcher(dispatcher)
    dispatcher.dispatch({'start_patrol': {}})
    assert seen == [('start_patrol_respond', {'result': 0, 'value': 0})]
