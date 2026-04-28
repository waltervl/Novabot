"""BLE provisioning command handlers.

Each handler reads/writes /userdata/lfi/json_config.json on the live
mower; the tests redirect to a tmpdir-backed ConfigStore so we never
touch real device state.
"""
import json
from pathlib import Path

import pytest

from ble_commands import (
    ConfigStore,
    make_handlers,
    register_with_dispatcher,
)
from command_dispatcher import CommandDispatcher


@pytest.fixture
def store(tmp_path):
    return ConfigStore(
        json_config_path=tmp_path / 'json_config.json',
        http_address_path=tmp_path / 'http_address.txt',
        timezone_path=tmp_path / 'novabot_timezone.txt',
    )


@pytest.fixture
def handlers(store):
    return make_handlers(store)


def _read_json(p: Path):
    return json.loads(p.read_text())


def test_set_wifi_info_persists_payload(handlers, store):
    body = {'ap': {'ssid': 'Foo', 'passwd': 'Bar', 'encrypt': 0}}
    resp = handlers['set_wifi_info'](body)
    assert resp == {'result': 1}
    assert _read_json(store.json_config_path)['wifi'] == body


def test_set_mqtt_info_writes_http_address_and_fires_callback(handlers, store):
    seen = []
    store.on_broker_changed = lambda host, port: seen.append((host, port))

    resp = handlers['set_mqtt_info']({'addr': '192.168.0.222', 'port': 1883})

    assert resp == {'result': 1}
    cfg = _read_json(store.json_config_path)
    assert cfg['mqtt']['value'] == {'addr': '192.168.0.222', 'port': 1883}
    assert store.http_address_path.read_text() == '192.168.0.222:1883'
    assert seen == [('192.168.0.222', 1883)]


def test_set_mqtt_info_rejects_missing_addr(handlers):
    resp = handlers['set_mqtt_info']({'port': 1883})
    assert resp == {'result': 1, 'msg': 'addr_required'}


def test_set_lora_info_persists_all_four_fields(handlers, store):
    resp = handlers['set_lora_info']({'addr': 718, 'channel': 15, 'hc': 20, 'lc': 14})
    assert resp == {'result': 1}
    assert _read_json(store.json_config_path)['lora'] == {
        'addr': 718, 'channel': 15, 'hc': 20, 'lc': 14,
    }


def test_set_cfg_info_writes_timezone_when_present(handlers, store):
    resp = handlers['set_cfg_info']({'cfg_value': 1, 'tz': 'Europe/Amsterdam'})
    assert resp == {'result': 1}
    assert store.timezone_path.read_text() == 'Europe/Amsterdam'
    assert _read_json(store.json_config_path)['cfg'] == {
        'cfg_value': 1, 'tz': 'Europe/Amsterdam',
    }


def test_set_cfg_info_charger_plain_int_form(handlers, store):
    resp = handlers['set_cfg_info'](1)
    assert resp == {'result': 1}
    assert not store.timezone_path.exists()
    assert _read_json(store.json_config_path)['cfg'] == {'cfg_value': 1}


def test_set_rtk_info_persists_section(handlers, store):
    resp = handlers['set_rtk_info'](0)
    assert resp == {'result': 1}
    assert _read_json(store.json_config_path)['rtk'] == 0


def test_set_para_info_persists_section(handlers, store):
    resp = handlers['set_para_info']({'obstacle_avoidance_sensitivity': 2})
    assert resp == {'result': 1}
    assert _read_json(store.json_config_path)['para'] == {
        'obstacle_avoidance_sensitivity': 2,
    }


def test_get_signal_info_returns_wifi_rssi_field(handlers):
    resp = handlers['get_signal_info'](0)
    assert resp['result'] == 1
    assert 'wifi_rssi' in resp
    assert isinstance(resp['wifi_rssi'], int)


def test_get_wifi_rssi_returns_integer(handlers):
    resp = handlers['get_wifi_rssi'](0)
    assert resp['result'] == 1
    assert isinstance(resp['wifi_rssi'], int)


def test_register_with_dispatcher_wires_all_eight(store):
    dispatcher = CommandDispatcher()
    register_with_dispatcher(dispatcher, store)
    assert sorted(dispatcher.registered_commands) == [
        'get_signal_info',
        'get_wifi_rssi',
        'set_cfg_info',
        'set_lora_info',
        'set_mqtt_info',
        'set_para_info',
        'set_rtk_info',
        'set_wifi_info',
    ]


def test_dispatcher_round_trip_publishes_respond(store):
    seen = []
    dispatcher = CommandDispatcher(respond_publisher=lambda key, body: seen.append((key, body)))
    register_with_dispatcher(dispatcher, store)

    dispatcher.dispatch({'set_mqtt_info': {'addr': '10.0.0.1', 'port': 1884}})

    assert seen == [('set_mqtt_info_respond', {'result': 1})]
    cfg = _read_json(store.json_config_path)
    assert cfg['mqtt']['value']['addr'] == '10.0.0.1'


def test_set_mqtt_info_handles_string_port(handlers, store):
    resp = handlers['set_mqtt_info']({'addr': 'h', 'port': '1885'})
    assert resp == {'result': 1}
    assert _read_json(store.json_config_path)['mqtt']['value']['port'] == 1885


def test_existing_sections_preserved_on_patch(handlers, store):
    # Seed two sections; the second patch must keep the first.
    handlers['set_wifi_info']({'ap': {'ssid': 'A'}})
    handlers['set_lora_info']({'addr': 718, 'channel': 16, 'hc': 20, 'lc': 14})
    cfg = _read_json(store.json_config_path)
    assert cfg['wifi'] == {'ap': {'ssid': 'A'}}
    assert cfg['lora']['addr'] == 718


def test_invalid_body_set_wifi_returns_msg_invalid(handlers):
    resp = handlers['set_wifi_info']('garbage')
    assert resp == {'result': 1, 'msg': 'invalid'}
