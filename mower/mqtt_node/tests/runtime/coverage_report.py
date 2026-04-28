#!/usr/bin/env python3
"""Mac-side coverage report — runs from the repo root and prints how
much of the stock /mqtt_node ROS2 graph + MQTT command surface our
open implementation covers. No mower needed.

Usage:
    python mower/mqtt_node/tests/runtime/coverage_report.py

Sources cross-referenced:
- research/documents/mqtt_node-graph-snapshot.txt — live ROS2 graph
- research/documents/mqtt_node-command-catalog.md — RE-5 MQTT cmd list
- mower/mqtt_node/main.py — registered MQTT handlers
- mower/mqtt_node/ros2_bridge.py — ROS2 endpoints wired
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
REPO = HERE.parents[4]
PKG = HERE.parents[2]
SNAPSHOT = REPO / 'research' / 'documents' / 'mqtt_node-graph-snapshot.txt'
CATALOG = REPO / 'research' / 'documents' / 'mqtt_node-command-catalog.md'

SYSTEM_OWNED = {
    '/rosout',
    '/parameter_events',
    '/mqtt_node/describe_parameters',
    '/mqtt_node/get_parameter_types',
    '/mqtt_node/get_parameters',
    '/mqtt_node/list_parameters',
    '/mqtt_node/set_parameters',
    '/mqtt_node/set_parameters_atomically',
}


def _wired_endpoints(src: str) -> set[str]:
    rx = re.compile(
        r"(?:create_client|create_publisher|create_subscription|"
        r"create_service|ActionClient|ActionServer)\s*\("
        r"[^)]*?'(/[^']+)'", re.DOTALL,
    )
    return set(rx.findall(src))


def _stock_endpoints(snap: str) -> set[str]:
    rx = re.compile(r'^\s+(/[A-Za-z0-9_/\-]+)\s*:?', re.MULTILINE)
    return {ep for ep in rx.findall(snap) if ep not in SYSTEM_OWNED}


def _registered_mqtt_cmds(src: str) -> set[str]:
    rx = re.compile(r"dispatcher\.register\(\s*'([^']+)'")
    return set(rx.findall(src))


def _stock_mqtt_cmds() -> set[str]:
    """Canonical stock app→mower MQTT command set, derived from
    gap analysis section 3A + Ghidra-confirmed handlers (api_*).
    Pinned so the regex-based catalog parse can't drift.
    """
    return {
        # Mowing / task control
        'start_run', 'start_navigation', 'stop_run', 'stop_task',
        'pause_run', 'resume_run',
        # Charging / recharge
        'go_to_charge', 'go_pile', 'stop_to_charge', 'auto_recharge',
        # Mapping
        'start_scan_map', 'add_scan_map', 'stop_scan_map',
        'save_map', 'delete_map', 'reset_map',
        'start_assistant_build_map', 'quit_mapping_mode',
        'start_erase_map', 'stop_erase_map',
        'save_recharge_pos', 'get_recharge_pos',
        # Preview
        'generate_preview_cover_path', 'get_preview_cover_path',
        # Manual movement
        'start_move', 'stop_move', 'mst',
        # Stubs (Ghidra-confirmed JSON-echo)
        'start_patrol', 'stop_patrol', 'auto_connect',
        'report_state_map_outline', 'report_state_map_path_list',
        'report_state_unbind',
        # Scheduled mowing
        'start_time_navigation', 'stop_time_navigation',
        # Info reads (no ROS service)
        'get_para_info', 'set_para_info', 'set_control_mode',
        'get_cfg_info', 'get_version_info', 'get_dev_info',
        'get_current_pose', 'get_vel_odom', 'get_log_info',
        'get_map_list', 'get_map_outline', 'get_map_plan_path',
        'get_map_info', 'get_wifi_rssi',
        # OTA
        'ota_upgrade_cmd', 'ota_version_info',
        # BLE provisioning
        'set_wifi_info', 'set_mqtt_info', 'set_lora_info',
        'set_rtk_info', 'set_cfg_info', 'get_signal_info',
        # Chassis PIN action
        'dev_pin_info',
        # Misc
        'cancel_task', 'cancel_recharge',
    }


def _print_section(title: str, total: int, hit: int, missing: list[str]):
    pct = (hit / total * 100.0) if total else 100.0
    print(f'== {title}: {hit}/{total} ({pct:.1f}%) ==')
    if missing:
        print('  missing:')
        for m in missing:
            print(f'    {m}')
    print()


def main() -> int:
    src = '\n'.join(
        f.read_text() for f in PKG.glob('*.py')
        if not f.name.startswith('test_'))
    main_src = (PKG / 'main.py').read_text()

    snap = SNAPSHOT.read_text() if SNAPSHOT.is_file() else ''
    stock_eps = _stock_endpoints(snap) if snap else set()
    wired_eps = _wired_endpoints(src)

    stock_cmds = _stock_mqtt_cmds()
    # The dispatcher registers commands across main.py + the plug-ins.
    # Pull both `dispatcher.register('...')` calls and the literal keys
    # returned by each plug-in's make_handlers() dict.
    registered_cmds = _registered_mqtt_cmds(main_src)
    for plugin in ('info_commands.py', 'ble_commands.py',
                   'stub_commands.py'):
        p = PKG / plugin
        if p.is_file():
            text = p.read_text()
            registered_cmds |= _registered_mqtt_cmds(text)
            # Also collect literal `'cmd_name': handler,` table entries
            # — make_handlers returns them as dict literals.
            for m in re.finditer(r"^\s+'([a-z][a-z0-9_]+)':\s+(?:_?[a-zA-Z][a-zA-Z0-9_]*|h_)",
                                 text, re.MULTILINE):
                registered_cmds.add(m.group(1))

    missing_eps = sorted(ep for ep in stock_eps if ep not in src)
    extra_eps = sorted(ep for ep in wired_eps if ep not in stock_eps)

    missing_cmds = sorted(c for c in stock_cmds if c not in registered_cmds)

    _print_section('ROS2 endpoints wired',
                   len(stock_eps), len(stock_eps) - len(missing_eps),
                   missing_eps)
    if extra_eps:
        print('Extra (open-only) endpoints:')
        for e in extra_eps:
            print(f'  {e}')
        print()

    _print_section('MQTT inbound commands',
                   len(stock_cmds), len(stock_cmds) - len(missing_cmds),
                   missing_cmds)

    print('---')
    overall_hit = (len(stock_eps) - len(missing_eps)) + (
        len(stock_cmds) - len(missing_cmds))
    overall_total = len(stock_eps) + len(stock_cmds)
    overall_pct = (overall_hit / overall_total * 100.0) if overall_total else 100.0
    print(f'Overall surface coverage: {overall_hit}/{overall_total} '
          f'({overall_pct:.1f}%)')
    return 0 if (overall_total > 0 and overall_pct >= 99.0) else 1


if __name__ == '__main__':
    sys.exit(main())
