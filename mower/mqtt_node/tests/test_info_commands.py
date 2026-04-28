"""Info-read commands — pure-Python file/cache reads.

Each test exercises one handler against either a tmpdir-backed map
directory or live-state callables, all isolated from the real mower.
"""
import json

import pytest

from ble_commands import ConfigStore
from command_dispatcher import CommandDispatcher
from info_commands import (
    InfoSources,
    make_handlers,
    register_with_dispatcher,
)


@pytest.fixture
def map_root(tmp_path):
    """Build a synthetic /userdata/lfi/maps/ tree with two work maps
    and one obstacle, plus a planned_path + map_info side-car."""
    home = tmp_path / 'home0' / 'csv_file'
    home.mkdir(parents=True)
    (home / 'map0.csv').write_text('# polygon\n1.0,2.0\n3.0,4.0\n')
    (home / 'map1.csv').write_text('5.0,6.0\n')
    (home / 'map0_0_obstacle.csv').write_text('7.0,8.0\n')
    map0 = tmp_path / 'map0'
    map0.mkdir()
    (map0 / 'planned_path.json').write_text(json.dumps({'pts': [[0, 0], [1, 1]]}))
    (map0 / 'map_info.json').write_text(json.dumps({'area_m2': 12.3}))
    return tmp_path


@pytest.fixture
def config_store(tmp_path):
    return ConfigStore(
        json_config_path=tmp_path / 'json_config.json',
        http_address_path=tmp_path / 'http_address.txt',
        timezone_path=tmp_path / 'tz.txt',
    )


def _sources(map_root, *,
             pose=None, vel=None, para=None, dev=None, versions=None,
             config_path=None, log_dir=None):
    return InfoSources(
        pose=lambda: pose or {'x': 0.0, 'y': 0.0, 'theta': 0.0},
        vel_odom=lambda: vel or {'linear_x': 0.0, 'angular_wheel': 0.0},
        para_info=lambda: para or {},
        dev_info=lambda: dev or {},
        versions=lambda: versions or {'sv': '', 'hv': '', 'ov': ''},
        map_dir=map_root,
        log_dir=log_dir or map_root,    # reuse a benign existing path
        config_path=config_path or (map_root / 'json_config.json'),
    )


def test_get_current_pose_uses_callback_value(map_root):
    handlers = make_handlers(
        _sources(map_root, pose={'x': 1.5, 'y': -2.0, 'theta': 3.14}))
    resp = handlers['get_current_pose']({})
    assert resp == {'result': 0, 'x': 1.5, 'y': -2.0, 'theta': 3.14}


def test_get_vel_odom_uses_callback_value(map_root):
    handlers = make_handlers(
        _sources(map_root, vel={'linear_x': 0.42, 'angular_wheel': -0.18}))
    resp = handlers['get_vel_odom']({})
    assert resp == {'result': 0, 'linear_x': 0.42, 'angular_wheel': -0.18}


def test_get_para_info_returns_callback_dict(map_root):
    handlers = make_handlers(
        _sources(map_root, para={'obstacle_avoidance_sensitivity': 2,
                                 'target_height': 4}))
    resp = handlers['get_para_info']({})
    assert resp == {'result': 0,
                    'obstacle_avoidance_sensitivity': 2,
                    'target_height': 4}


def test_set_para_info_writes_section(map_root, config_store):
    handlers = make_handlers(_sources(map_root), config_store=config_store)
    resp = handlers['set_para_info']({'obstacle_avoidance_sensitivity': 3})
    assert resp == {'result': 0}
    cfg = json.loads(config_store.json_config_path.read_text())
    assert cfg['para'] == {'obstacle_avoidance_sensitivity': 3}


def test_set_para_info_rejects_non_dict(map_root, config_store):
    handlers = make_handlers(_sources(map_root), config_store=config_store)
    resp = handlers['set_para_info']('garbage')
    assert resp == {'result': 1, 'msg': 'invalid_body'}


def test_get_cfg_info_returns_existing_config(map_root, config_store):
    config_store.write({'wifi': {'ap': {'ssid': 'X'}}})
    handlers = make_handlers(
        _sources(map_root, config_path=config_store.json_config_path))
    resp = handlers['get_cfg_info']({})
    assert resp == {'result': 0,
                    'cfg': {'wifi': {'ap': {'ssid': 'X'}}}}


def test_get_cfg_info_missing_file_returns_empty_ok(map_root):
    # Path that does not exist → still result:0 with no cfg key.
    handlers = make_handlers(
        _sources(map_root, config_path=map_root / 'absent.json'))
    resp = handlers['get_cfg_info']({})
    assert resp == {'result': 0}


def test_get_version_info_returns_callback_value(map_root):
    handlers = make_handlers(
        _sources(map_root, versions={'sv': 'v6.0.2-custom-24',
                                     'hv': 'v0.0.1', 'ov': 'V0.3.2'}))
    resp = handlers['get_version_info']({})
    assert resp == {'result': 0,
                    'sv': 'v6.0.2-custom-24',
                    'hv': 'v0.0.1',
                    'ov': 'V0.3.2'}


def test_get_dev_info_returns_callback_value(map_root):
    handlers = make_handlers(
        _sources(map_root, dev={'battery_power': 87, 'error_status': 0}))
    resp = handlers['get_dev_info']({})
    assert resp == {'result': 0, 'battery_power': 87, 'error_status': 0}


def test_set_control_mode_invokes_callback_and_writes(map_root, config_store):
    seen = []
    handlers = make_handlers(
        _sources(map_root),
        config_store=config_store,
        set_control_mode_cb=lambda body: seen.append(body))
    resp = handlers['set_control_mode']({'sound': 1, 'headlight': 0})
    assert resp == {'result': 0}
    assert seen == [{'sound': 1, 'headlight': 0}]
    cfg = json.loads(config_store.json_config_path.read_text())
    assert cfg['control_mode'] == {'sound': 1, 'headlight': 0}


def test_get_map_list_returns_sorted_work_maps_first(map_root):
    handlers = make_handlers(_sources(map_root))
    resp = handlers['get_map_list']({})
    assert resp == {'result': 0,
                    'map_list': ['map0', 'map1', 'map0_0_obstacle']}


def test_get_map_outline_reads_csv_floats(map_root):
    handlers = make_handlers(_sources(map_root))
    resp = handlers['get_map_outline']({'mapName': 'map0'})
    assert resp == {'result': 0,
                    'mapName': 'map0',
                    'outline': [[1.0, 2.0], [3.0, 4.0]]}


def test_get_map_outline_unknown_name_fails(map_root):
    handlers = make_handlers(_sources(map_root))
    resp = handlers['get_map_outline']({'mapName': 'mapX'})
    assert resp == {'result': 1, 'msg': 'not_found', 'mapName': 'mapX'}


def test_get_map_outline_missing_name_fails(map_root):
    handlers = make_handlers(_sources(map_root))
    resp = handlers['get_map_outline']({})
    assert resp == {'result': 1, 'msg': 'mapName_required'}


def test_get_map_plan_path_reads_planned_json(map_root):
    handlers = make_handlers(_sources(map_root))
    resp = handlers['get_map_plan_path']({'mapName': 'map0'})
    assert resp == {'result': 0,
                    'mapName': 'map0',
                    'plan_path': {'pts': [[0, 0], [1, 1]]}}


def test_get_map_info_with_name_reads_metadata(map_root):
    handlers = make_handlers(_sources(map_root))
    resp = handlers['get_map_info']({'mapName': 'map0'})
    assert resp == {'result': 0, 'mapName': 'map0',
                    'info': {'area_m2': 12.3}}


def test_get_map_info_no_name_returns_list(map_root):
    handlers = make_handlers(_sources(map_root))
    resp = handlers['get_map_info']({})
    assert resp == {'result': 0,
                    'map_list': ['map0', 'map1', 'map0_0_obstacle']}


def test_get_log_info_tails_latest_log(tmp_path):
    log_dir = tmp_path / 'logs'
    log_dir.mkdir()
    (log_dir / 'a.log').write_text('line1\nline2\n')
    (log_dir / 'b.log').write_text('newer1\nnewer2\n')
    # Touch newer file to be most recent
    import os
    os.utime(log_dir / 'b.log', (1_000_000, 9_999_999_999))
    handlers = make_handlers(
        _sources(tmp_path, log_dir=log_dir))
    resp = handlers['get_log_info']({})
    assert resp['result'] == 0
    assert resp['log'] == ['newer1', 'newer2']


def test_get_log_info_no_logs_returns_empty(tmp_path):
    handlers = make_handlers(_sources(tmp_path, log_dir=tmp_path / 'absent'))
    resp = handlers['get_log_info']({})
    assert resp == {'result': 0, 'log': []}


def test_register_with_dispatcher_wires_all_thirteen(map_root):
    dispatcher = CommandDispatcher()
    sources = _sources(map_root)
    register_with_dispatcher(dispatcher, sources)
    assert sorted(dispatcher.registered_commands) == [
        'get_cfg_info',
        'get_current_pose',
        'get_dev_info',
        'get_log_info',
        'get_map_info',
        'get_map_list',
        'get_map_outline',
        'get_map_plan_path',
        'get_para_info',
        'get_vel_odom',
        'get_version_info',
        'set_control_mode',
        'set_para_info',
    ]


def test_dispatcher_round_trip_publishes_respond(map_root):
    seen = []
    dispatcher = CommandDispatcher(respond_publisher=lambda key, body: seen.append((key, body)))
    register_with_dispatcher(dispatcher, _sources(map_root))
    dispatcher.dispatch({'get_map_list': {}})
    assert seen == [
        ('get_map_list_respond',
         {'result': 0, 'map_list': ['map0', 'map1', 'map0_0_obstacle']}),
    ]


def test_extract_map_name_string_form(map_root):
    handlers = make_handlers(_sources(map_root))
    resp = handlers['get_map_outline']('map0')
    assert resp['result'] == 0
    assert resp['mapName'] == 'map0'


def test_pose_callback_failure_falls_back_to_error(map_root):
    def boom():
        raise RuntimeError('disk full')
    handlers = make_handlers(InfoSources(
        pose=boom,
        map_dir=map_root,
        log_dir=map_root,
        config_path=map_root / 'cfg.json',
    ))
    resp = handlers['get_current_pose']({})
    assert resp == {'result': 1, 'msg': 'source_unavailable'}
