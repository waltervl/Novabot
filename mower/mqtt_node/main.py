"""Open mqtt_node entry point.

Wire ROS2 bridge + MQTT client + dispatcher + sensor aggregator + HTTP
client + OTA client + BLE framer. MultiThreadedExecutor spins the rclpy
node. Signal handlers shut everything down cleanly.
"""
from __future__ import annotations
import json
import logging
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

import rclpy
from rclpy.executors import MultiThreadedExecutor

from config import load as load_config
from mqtt_client import MqttClient
from command_dispatcher import CommandDispatcher
from ros2_bridge import Ros2Bridge
from sensor_aggregator import SensorAggregator
from http_client import HttpClient
from ota_client import OtaClient

import asyncio as _asyncio_for_discovery

from discovery_loop import DiscoveryLoop, ResolveResult

log = logging.getLogger('mqtt_node.main')


def _detect_sn() -> str:
    """SN sources, in order of preference:

    1. SN env var (dev/host runs, also useful for shadow tests)
    2. /userdata/lfi/json_config.json sn.value.code (live mower —
       verified on LFIN1231000211 2026-04-27)
    3. /userdata/factory/sn (legacy — never observed on this firmware
       but kept for compatibility)
    4. /etc/sn (legacy)
    """
    sn = os.environ.get('SN')
    if sn:
        return sn

    cfg_path = Path('/userdata/lfi/json_config.json')
    if cfg_path.exists():
        try:
            data = json.loads(cfg_path.read_text())
            sn_section = data.get('sn', {})
            value = sn_section.get('value') if isinstance(sn_section, dict) else None
            if isinstance(value, dict):
                code = value.get('code')
                if isinstance(code, str) and code.strip():
                    return code.strip()
        except Exception:
            pass

    for p in ('/userdata/factory/sn', '/etc/sn'):
        try:
            sn = Path(p).read_text().strip()
            if sn:
                return sn
        except Exception:
            pass

    raise RuntimeError(
        'Cannot determine mower SN — set SN env var or populate '
        '/userdata/lfi/json_config.json sn.value.code')


def _detect_versions() -> dict:
    """Read sv/hv/ov from on-disk sources.

    sv (software): parse /userdata/ota/upgrade_pkg/mower_firmware_*.deb
       filename; falls back to '' if no .deb is staged.
    ov (OS): /userdata/lfi/system_version.txt (e.g. 'V0.3.2').
    hv (hardware): hardcoded 'v0.0.1' to match the stock catalog —
       /userdata/lfi/mcu_message.json only carries an int that the
       stock binary never seems to surface.
    """
    sv = ''
    pkg_dir = Path('/userdata/ota/upgrade_pkg')
    if pkg_dir.is_dir():
        for f in pkg_dir.iterdir():
            m = re.match(r'mower_firmware_(.+)\.deb$', f.name)
            if m:
                sv = m.group(1)
                break

    ov = ''
    try:
        ov = Path('/userdata/lfi/system_version.txt').read_text().strip()
    except Exception:
        pass

    return {'sv': sv, 'hv': 'v0.0.1', 'ov': ov}


def _read_system_metrics() -> dict:
    """Snapshot polled system metrics for report_state_to_server_work_respond.

    Returns mb counts + working_time_min (since boot).
    """
    disk_mb = 0
    try:
        v = os.statvfs('/userdata')
        disk_mb = (v.f_bavail * v.f_frsize) // (1024 * 1024)
    except Exception:
        pass

    memory_mb = 0
    try:
        with open('/proc/meminfo') as f:
            for line in f:
                if line.startswith('MemAvailable:'):
                    memory_mb = int(line.split()[1]) // 1024
                    break
    except Exception:
        pass

    working_time_min = 0
    try:
        with open('/proc/uptime') as f:
            working_time_min = int(float(f.read().split()[0]) // 60)
    except Exception:
        pass

    return {
        'disk_mb': disk_mb,
        'memory_mb': memory_mb,
        'working_time_min': working_time_min,
    }


def _read_wifi_rssi() -> int:
    """Read wifi signal strength from /proc/net/wireless.
    Returns 0 on failure (matches stock behavior when no wifi).
    Format: link quality (0-70) — we keep the raw integer to match the
    stock catalog's value range (54 in the live capture).
    """
    try:
        with open('/proc/net/wireless') as f:
            for line in f.readlines()[2:]:
                parts = line.split()
                if len(parts) >= 3:
                    return int(float(parts[2].rstrip('.')))
    except Exception:
        pass
    return 0


async def _zeroconf_resolve(hostnames: tuple) -> ResolveResult:
    """Best-effort A-record resolution. Tries Python's stdlib resolver
    first (fast on systems with libnss-mdns), then falls back to a
    `zeroconf` browser query if the package is available. Returns
    ResolveResult(host=None, ip=None) when nothing resolves."""
    import socket as _socket
    for h in hostnames:
        try:
            ip = await _asyncio_for_discovery.get_event_loop().run_in_executor(
                None, _socket.gethostbyname, h)
            if ip and not ip.startswith('127.'):
                return ResolveResult(host=h, ip=ip)
        except Exception:
            continue
    try:
        from zeroconf import Zeroconf, ServiceInfo  # noqa: F401
        from zeroconf import IPVersion
        zc = Zeroconf()
        try:
            for h in hostnames:
                info = await _asyncio_for_discovery.get_event_loop().run_in_executor(
                    None,
                    lambda host=h: zc.get_service_info(  # noqa: E501
                        '_workstation._tcp.local.', host, timeout=2000),
                )
                if info and info.parsed_addresses(IPVersion.V4Only):
                    return ResolveResult(host=h, ip=info.parsed_addresses(IPVersion.V4Only)[0])
        finally:
            zc.close()
    except Exception:
        pass
    return ResolveResult(host=None, ip=None)


def main():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s %(name)s %(levelname)s %(message)s')

    cfg = load_config()
    sn = _detect_sn()
    if cfg.shadow_mode:
        log.warning('open_mqtt_node SHADOW MODE for %s, broker %s:%s — '
                    'service calls logged only, outbound MQTT goes to '
                    'Dart/Receive_mqtt_shadow/<SN>',
                    sn, cfg.mqtt_host, cfg.mqtt_port)
    else:
        log.info('open_mqtt_node starting for %s, broker %s:%s',
                 sn, cfg.mqtt_host, cfg.mqtt_port)

    # ROS 2 init
    rclpy.init()
    bridge = Ros2Bridge(shadow_mode=cfg.shadow_mode)
    aggregator = SensorAggregator()
    bridge.bind_aggregator(aggregator)

    # One-shot version read (sv/hv/ov)
    versions = _detect_versions()
    aggregator.update_versions(**versions)
    log.info('versions: sv=%r ov=%r hv=%r',
             versions['sv'], versions['ov'], versions['hv'])

    # MQTT side: register every command on the bridge.
    # MQTT key → handler (keys per ros2_bridge docstrings + RE-5 catalog)
    dispatcher = CommandDispatcher()
    dispatcher.register('start_navigation', bridge.handle_start_navigation)
    dispatcher.register('start_run', bridge.handle_start_run)
    dispatcher.register('stop_task', bridge.handle_stop_task)
    dispatcher.register('stop_run', bridge.handle_stop_run)
    dispatcher.register('pause_run', bridge.handle_pause_run)
    dispatcher.register('resume_run', bridge.handle_resume_run)
    dispatcher.register('stop_to_charge', bridge.handle_stop_to_charge)
    dispatcher.register('auto_recharge', bridge.handle_auto_recharge)
    dispatcher.register('go_to_charge', bridge.handle_nav_to_recharge)
    dispatcher.register('go_pile', bridge.handle_go_pile)
    dispatcher.register('cancel_task', bridge.handle_cancel_task)
    dispatcher.register('cancel_recharge', bridge.handle_cancel_recharge)
    dispatcher.register('start_scan_map', bridge.handle_start_scan_map)
    dispatcher.register('add_scan_map', bridge.handle_add_scan_map)
    dispatcher.register('save_map', bridge.handle_save_map)
    dispatcher.register('delete_map', bridge.handle_delete_map)
    dispatcher.register('quit_mapping_mode', bridge.handle_quit_mapping_mode)
    dispatcher.register('start_assistant_build_map',
                        bridge.handle_start_assistant_build_map)
    dispatcher.register('get_preview_cover_path',
                        bridge.handle_get_preview_cover_path)
    dispatcher.register('save_recharge_pos', bridge.handle_save_recharge_pos)
    dispatcher.register('get_recharge_pos', bridge.handle_get_recharge_pos)
    dispatcher.register('stop_scan_map', bridge.handle_stop_scan_map)
    dispatcher.register('start_erase_map', bridge.handle_start_erase_map)
    dispatcher.register('stop_erase_map', bridge.handle_stop_erase_map)
    dispatcher.register('reset_map', bridge.handle_reset_map)
    dispatcher.register('generate_preview_cover_path',
                        bridge.handle_generate_preview_cover_path)
    dispatcher.register('dev_pin_info', bridge.handle_dev_pin_info)

    # Manual movement (joystick) — /cloud_move_cmd publisher
    dispatcher.register('start_move', bridge.handle_start_move)
    dispatcher.register('mst', bridge.handle_mst)
    dispatcher.register('stop_move', bridge.handle_stop_move)

    # Scheduled mowing (timer queue — stock uses internal C++ queue)
    dispatcher.register('start_time_navigation',
                        bridge.handle_start_time_navigation)
    dispatcher.register('stop_time_navigation',
                        bridge.handle_stop_time_navigation)

    # Stubs — JSON-echo only (patrol, auto_connect, report_state_*)
    from stub_commands import register_with_dispatcher as register_stubs
    register_stubs(dispatcher)

    # ── Scheduled mowing timer queue ────────────────────────────
    # Stock binary uses an internal C++ task_timer_queue; we replicate
    # in Python so start_time_navigation actually schedules instead of
    # ack-only-stub behavior.
    from timer_queue import TimerQueue

    def _on_scheduled_fire(payload):
        log.info('timer_queue fire → start_navigation %r', payload)
        try:
            bridge.handle_start_navigation(payload)
        except Exception:
            log.exception('scheduled fire handler raised')

    timer_queue = TimerQueue(
        state_path=Path('/userdata/open_mqtt_node/scheduled_tasks.json'),
        on_fire=_on_scheduled_fire,
    )
    timer_queue.start()
    bridge._plan_lookup = timer_queue.plan_lookup

    # Override start/stop_time_navigation so they also touch the queue.
    _bridge_start_time = _wrapped_start_time  # already wrapped earlier with timer_task announce
    _bridge_stop_time = _wrapped_stop_time

    def _scheduled_start_time(payload):
        # Same body shape as handle_start_time_navigation: id, week,
        # hour/minute, work_time, plus mowing fields.
        inner = payload if not isinstance(payload, dict) else (
            payload.get('start_time_navigation', payload)
            if isinstance(payload.get('start_time_navigation'), dict)
            else payload)
        if isinstance(inner, dict) and inner.get('id'):
            try:
                week_raw = inner.get('week') or []
                if isinstance(week_raw, str):
                    week_raw = json.loads(week_raw)
                week = [int(d) for d in (week_raw or [])]
                if not week:
                    week = [1, 2, 3, 4, 5, 6, 7]   # default = every day
                timer_queue.add_task(
                    task_id=str(inner['id']),
                    week=week,
                    hour=int(inner.get('hour', 0)),
                    minute=int(inner.get('minute', 0)),
                    work_time=int(inner.get('work_time', 0)),
                    payload={'start_navigation': {
                        'cmd_num': int(inner.get('cmd_num', 0)),
                        'area': int(inner.get('area', 0)),
                        'cutterhigh': int(inner.get('cutterhigh', 0)),
                    }},
                )
            except Exception:
                log.exception('scheduled add_task failed')
        return _bridge_start_time(payload)

    def _scheduled_stop_time(payload):
        inner = payload if not isinstance(payload, dict) else (
            payload.get('stop_time_navigation', payload)
            if isinstance(payload.get('stop_time_navigation'), dict)
            else payload)
        if isinstance(inner, dict) and inner.get('id'):
            try:
                timer_queue.cancel(str(inner['id']))
            except Exception:
                log.exception('scheduled cancel failed')
        return _bridge_stop_time(payload)

    dispatcher.register('start_time_navigation', _scheduled_start_time)
    dispatcher.register('stop_time_navigation', _scheduled_stop_time)

    # OTA — wire state_cb so progress events go out as ota_upgrade_state
    # on the same outbound MQTT topic the response uses. Stock binary
    # interleaves state updates between download chunks; we mirror that
    # cadence by emitting at every percent change inside _download.
    def _ota_state_cb(state_payload):
        try:
            payload = json.dumps({'ota_upgrade_state': state_payload},
                                 separators=(',', ':')).encode('utf-8')
            mqtt.publish(outbound_topic, payload, encrypted=True)
        except Exception:
            log.exception('ota_state_cb publish failed')

    ota = OtaClient(
        work_dir=Path('/userdata/ota'),
        progress_cb=lambda pct: log.info('ota progress: %s%%', pct),
        state_cb=_ota_state_cb,
    )
    dispatcher.register('ota_upgrade_cmd', ota.handle_upgrade)
    dispatcher.register('ota_version_info', ota.handle_version_info)
    # Forward installer-side phase signals (/ota/upgrade_status sub) to
    # the same state_cb so the app sees a unified ota_upgrade_state stream.
    bridge._ota_state_forwarder = _ota_state_cb

    # MQTT client glue
    mqtt = MqttClient(host=cfg.mqtt_host, port=cfg.mqtt_port, sn=sn)
    outbound_topic = (
        f'Dart/Receive_mqtt_shadow/{sn}' if cfg.shadow_mode
        else f'Dart/Receive_mqtt/{sn}'
    )
    server_topic = (
        f'Dart/Receive_server_mqtt_shadow/{sn}' if cfg.shadow_mode
        else f'Dart/Receive_server_mqtt/{sn}'
    )

    def publish_respond(respond_key: str, body: dict) -> None:
        wrapped = json.dumps({respond_key: body}, separators=(',', ':')).encode('utf-8')
        mqtt.publish(outbound_topic, wrapped, encrypted=True)

    dispatcher.set_respond_publisher(publish_respond)

    def on_inbound(_sn, _topic, payload_bytes):
        try:
            payload = json.loads(payload_bytes.decode('utf-8'))
        except Exception as e:
            log.warning('main: bad JSON inbound: %s', e)
            return
        dispatcher.dispatch(payload)

    mqtt.on_message(on_inbound)
    mqtt.connect()
    mqtt.loop_start()

    # ── Discovery loop (Phase 2 of zero-touch MQTT redirect) ─────────────
    def _on_server_switch(new_host: str, new_port: int) -> None:
        previous_host = mqtt.host  # mqtt client's authoritative current host
        mqtt.swap_broker(new_host, new_port)
        try:
            payload = json.dumps({
                'from_ip': previous_host,
                'to_ip': new_host,
                'port': new_port,
                'ts': int(time.time() * 1000),
            }).encode('utf-8')
            topic = f'novabot/events/{sn}/server_migrated'
            mqtt.publish(topic, payload, encrypted=False, qos=1)
            log.info('emitted server_migrated event topic=%s from=%s to=%s',
                     topic, previous_host, new_host)
        except Exception:
            log.exception('failed to publish server_migrated event')

    discovery = DiscoveryLoop(
        config=cfg,
        json_path=Path('/userdata/lfi/json_config.json'),
        http_addr_path=Path('/userdata/lfi/http_address.txt'),
        resolver=_zeroconf_resolve,
        on_switch=_on_server_switch,
    )

    discovery_loop_thread = threading.Thread(
        target=lambda: _asyncio_for_discovery.run(discovery.run()),
        name='discovery-loop',
        daemon=True,
    )
    discovery_loop_thread.start()
    log.info('discovery loop started')

    # ── Info-read commands (file/cache reads, no ROS calls) ─────────
    from info_commands import InfoSources, register_with_dispatcher as register_info_commands

    # ConfigStore is shared between BLE and MQTT info-write paths so
    # that set_para_info / set_cfg_info / set_control_mode all persist
    # to the same `/userdata/lfi/json_config.json`.
    from ble_commands import default_config_store
    config_store = default_config_store()  # broker_changed callback wired below

    info_sources = InfoSources(
        pose=lambda: {
            'x': float(getattr(aggregator, '_pose').x),
            'y': float(getattr(aggregator, '_pose').y),
            'theta': float(getattr(aggregator, '_pose').theta),
        },
        # vel_odom not yet wired to ROS — return zero until /odom_raw
        # subscription lands. Stock value range is small (m/s).
        vel_odom=lambda: {'linear_x': 0.0, 'angular_wheel': 0.0},
        # para_info: surface the runtime tunables we can read out
        # without re-reading the file. target_height + battery is the
        # subset most app builds query.
        para_info=lambda: {
            'target_height': int(getattr(aggregator, '_target_height', 0)),
        },
        dev_info=lambda: {
            'battery_power': int(getattr(aggregator, '_battery').power_percent),
            'battery_state': str(getattr(aggregator, '_battery').state),
            'error_status': int(getattr(aggregator, '_error_status', 0)),
            'error_msg': str(getattr(aggregator, '_error_msg', '')),
        },
        versions=lambda: {
            'sv': str(getattr(aggregator, '_sv', '')),
            'hv': str(getattr(aggregator, '_hv', '')),
            'ov': str(getattr(aggregator, '_ov', '')),
        },
        map_dir=cfg.map_dir,
        log_dir=Path('/userdata/log/'),
        config_path=Path('/userdata/lfi/json_config.json'),
    )

    def _set_control_mode(body):
        # Globals on the stock binary; we expose env-style flags here so
        # other modules (sensor_aggregator, future plumbing) can read.
        if isinstance(body, dict):
            if 'sound' in body:
                os.environ['NOVABOT_SOUND'] = str(int(bool(body.get('sound'))))
            if 'headlight' in body:
                os.environ['NOVABOT_HEADLIGHT'] = str(int(bool(body.get('headlight'))))

    register_info_commands(dispatcher, info_sources,
                           config_store=config_store,
                           set_control_mode_cb=_set_control_mode)

    # ── BLE GATT server + BLE provisioning dispatcher ───────────────
    # The BLE side of the protocol is independent from MQTT: provisioning
    # commands (set_wifi_info, set_mqtt_info, set_lora_info, set_cfg_info,
    # set_rtk_info, set_para_info, get_signal_info, get_wifi_rssi) arrive
    # over GATT writes BEFORE the MQTT broker is reachable. They get
    # their own dispatcher + their own respond_publisher (BLE notify).
    from ble_handler import BleFramer, BleGattServer
    from ble_commands import register_with_dispatcher as register_ble_commands

    ble_dispatcher = CommandDispatcher()
    ble_server = None  # populated below; closed-over by ble_publish

    def ble_publish_respond(respond_key: str, body: dict) -> None:
        if ble_server is None:
            log.warning('ble_publish_respond: server not started')
            return
        ble_server.notify({respond_key: body})

    ble_dispatcher.set_respond_publisher(ble_publish_respond)

    def _on_broker_changed(host: str, port: int) -> None:
        # set_mqtt_info commits → reconnect MQTT client to the new
        # broker so subsequent reports land on the right cloud.
        log.info('broker change: reconnecting to %s:%d', host, port)
        try:
            mqtt.reconnect(host, port)
        except Exception:
            log.exception('reconnect after set_mqtt_info failed')

    config_store.on_broker_changed = _on_broker_changed
    register_ble_commands(ble_dispatcher, store=config_store)

    framer = BleFramer()

    def on_ble_command(cmd: dict) -> None:
        try:
            ble_dispatcher.dispatch(cmd)
        except Exception:
            log.exception('on_ble_command raised')

    try:
        ble_server = BleGattServer(on_command=on_ble_command, framer=framer)
        ble_server.start()
        log.info('ble: GATT server up + advertising as Novabot')
    except Exception:
        log.exception('ble: GATT server failed to start (continuing without BLE)')
        ble_server = None

    # HTTP loops — heartbeat bodies pull real-time state from the
    # aggregator so the cloud sees current battery + error_status.
    def _equipment_body():
        return {
            'sn': sn,
            'battery_power': int(getattr(aggregator, '_battery').power_percent),
            'error_status': int(getattr(aggregator, '_error_status', 0)),
            'work_status': int(getattr(aggregator, '_work_status', 0)),
            'task_mode': int(getattr(aggregator, '_task_mode', 0)),
        }

    def _user_equipment_body():
        return {
            'sn': sn,
            'sv': str(getattr(aggregator, '_sv', '')),
            'ov': str(getattr(aggregator, '_ov', '')),
            'hv': str(getattr(aggregator, '_hv', '')),
        }

    def _message_body():
        return {'sn': sn}

    http = HttpClient(
        host=cfg.http_host, port=cfg.http_port, sn=sn,
        equipment_body=_equipment_body,
        user_equipment_body=_user_equipment_body,
        message_body=_message_body,
    )
    http.start()

    # Periodic state report publish (matches stock ~2.3 s cadence —
    # see research/documents/mqtt_node-payload-catalog.md report_state_robot).
    publish_period_sec = 2.3
    publish_stop = threading.Event()

    def publish_state_reports():
        while not publish_stop.is_set():
            try:
                for builder_name in ('report_state_robot',
                                     'report_state_timer_data',
                                     'report_exception_state'):
                    builder = getattr(aggregator, f'build_{builder_name}', None)
                    if builder is None:
                        continue
                    body = builder()
                    payload = json.dumps({builder_name: body},
                                         separators=(',', ':')).encode('utf-8')
                    mqtt.publish(outbound_topic, payload, encrypted=True)
            except Exception:
                log.exception('publish_state_reports iteration failed')
            publish_stop.wait(publish_period_sec)

    publish_thread = threading.Thread(
        target=publish_state_reports,
        daemon=True,
        name='mqtt_node_publish_loop')
    publish_thread.start()

    # Server-only reports (Dart/Receive_server_mqtt/<SN>) — 60 s cadence.
    # Same loop also polls /proc + statvfs + /proc/net/wireless for the
    # system metrics that go inside report_state_to_server_work_respond.
    server_period_sec = 60.0

    def publish_server_reports():
        while not publish_stop.is_set():
            try:
                metrics = _read_system_metrics()
                aggregator.update_system_metrics(**metrics)
                aggregator.update_signal(
                    wifi_rssi=_read_wifi_rssi(),
                    rtk_sat=getattr(aggregator, '_rtk_sat', 0),
                )
                # Stock binary publishes BOTH every 60 s — exception is
                # documented as event-driven but the catalog only saw it
                # once per 30 min window. Mirror the cadence here for
                # parity; receivers idempotently read either.
                for builder_name in (
                        'report_state_to_server_work_respond',
                        'report_state_to_server_exception_respond'):
                    builder = getattr(aggregator, f'build_{builder_name}', None)
                    if builder is None:
                        continue
                    body = builder()
                    payload = json.dumps(body, separators=(',', ':')).encode('utf-8')
                    mqtt.publish(server_topic, payload, encrypted=True)
            except Exception:
                log.exception('publish_server_reports iteration failed')
            publish_stop.wait(server_period_sec)

    server_thread = threading.Thread(
        target=publish_server_reports,
        daemon=True,
        name='mqtt_node_server_loop')
    server_thread.start()

    # Announce mqtt_node is up so chassis nodes that gate on
    # /mqtt_node_active(1) can release their startup hold.
    # Stock binary publishes both /mqtt_node_active(1) AND
    # /novabot/init_mower(1) at boot — chassis listens on both.
    try:
        bridge.announce_active(1)
        bridge.init_mower()
        bridge.announce_wifi_ble(1 if ble_server is not None else 0)
    except Exception:
        log.exception('boot announces failed')

    # Wire reset_factory subscriber → publish unbind_finish(1) once the
    # aggregator has cleared. Stock does this in the C++ subscriber too.
    _orig_on_reset_factory = bridge._on_reset_factory

    def _wrapped_on_reset_factory(msg):
        _orig_on_reset_factory(msg)
        if int(getattr(msg, 'data', 0)) == 1:
            try:
                bridge.announce_unbind(1)
            except Exception:
                log.exception('announce_unbind failed')

    bridge._on_reset_factory = _wrapped_on_reset_factory

    # get_log_info → publish /x3/log/upload(1) so the log uploader
    # service rotates fresh logs to /userdata/log/ before the read
    # handler in info_commands actually tails them. Stock binary does
    # this synchronously inside api_get_log_info.
    _orig_get_log_handler = info_sources  # placeholder for clarity
    # Re-register get_log_info to chain a publish before the read.
    _existing_log_handler = dispatcher._handlers.get('get_log_info')
    if _existing_log_handler is not None:
        def _get_log_info_with_upload(payload):
            try:
                bridge.request_log_upload(1)
            except Exception:
                log.exception('request_log_upload failed')
            return _existing_log_handler(payload)
        dispatcher.register('get_log_info', _get_log_info_with_upload)

    # start_time_navigation success → /timer_task_active(1)
    # stop_time_navigation       → /timer_task_active(0)
    _orig_start_time = bridge.handle_start_time_navigation
    _orig_stop_time = bridge.handle_stop_time_navigation

    def _wrapped_start_time(payload):
        resp = _orig_start_time(payload)
        if isinstance(resp, dict) and resp.get('result') == 0:
            try:
                bridge.announce_timer_task(1)
            except Exception:
                log.exception('announce_timer_task(1) failed')
        return resp

    def _wrapped_stop_time(payload):
        resp = _orig_stop_time(payload)
        try:
            bridge.announce_timer_task(0)
        except Exception:
            log.exception('announce_timer_task(0) failed')
        return resp

    dispatcher.register('start_time_navigation', _wrapped_start_time)
    dispatcher.register('stop_time_navigation', _wrapped_stop_time)

    # ROS2 spin
    executor = MultiThreadedExecutor(num_threads=4)
    executor.add_node(bridge)

    stop_evt = threading.Event()

    def _shutdown(_sig=None, _frame=None):
        log.info('mqtt_node shutting down')
        stop_evt.set()

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    try:
        while not stop_evt.is_set():
            executor.spin_once(timeout_sec=1.0)
    finally:
        try:
            bridge.announce_active(0)
        except Exception:
            log.exception('announce_active(0) failed at shutdown')
        try:
            timer_queue.stop()
        except Exception:
            log.exception('timer_queue.stop failed')
        publish_stop.set()
        publish_thread.join(timeout=2.0)
        server_thread.join(timeout=2.0)
        http.stop()
        if ble_server is not None:
            try:
                ble_server.stop()
            except Exception:
                log.exception('ble_server.stop raised')
        mqtt.loop_stop()
        mqtt.disconnect()
        bridge.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
