"""Info-read commands.

Every handler in this module is a pure read or a small file-IO write —
no ROS service calls, no MQTT, no BLE. The stock binary implements
these by reading globals, on-disk config, or filesystem state and
returning a synchronous response. We mirror that with a single
factory (`make_handlers`) that closes over the shared aggregator + a
ConfigStore + a few path roots.

Per RE-5 catalog:
- get_para_info / set_para_info — obstacle_avoidance_sensitivity,
  target_height, etc. (decompile:349200/349300, no ROS endpoint)
- set_control_mode — sets g_sound + g_headlight globals
- get_cfg_info — reads json_config.json
- get_version_info — reads on-disk version files
- get_dev_info — reads internal state (incident bits + battery)
- get_current_pose — reads cached pose from /robot_decision/map_position
- get_vel_odom — reads cached velocity from /odom_raw
- get_log_info — reads log files
- get_map_list — directory listing of <map_dir>/csv_file/
- get_map_outline — reads <map_dir>/csv_file/<mapName>.csv
- get_map_plan_path — reads <map_dir>/<mapName>/planned_path.json
- get_map_info — reads metadata from <map_dir>/<mapName>/map_info.json

The handlers all return `{result: 0/1, ...payload}` — `result:0` is
"success" by stock decompile convention; `result:1` means the request
failed (file missing, invalid input, etc.) and the app should leave
its cached value alone.
"""
from __future__ import annotations
import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional


log = logging.getLogger('mqtt_node.info_commands')


# ─── Cached state struct ────────────────────────────────────────────────
#
# A handful of the read commands surface cached telemetry (pose, vel)
# rather than disk state. Rather than reach into SensorAggregator and
# couple this module to it, we accept callbacks that return the latest
# values. main.py wires those to the aggregator getters.


@dataclass
class InfoSources:
    """Wires the info-command handlers to live state.

    All callables are zero-arg; each returns the current snapshot.
    Callbacks are called inline on the dispatcher thread, so they must
    be cheap (they're cache reads, not RPCs).
    """
    pose: Callable[[], Dict[str, float]] = field(
        default_factory=lambda: lambda: {'x': 0.0, 'y': 0.0, 'theta': 0.0})
    vel_odom: Callable[[], Dict[str, float]] = field(
        default_factory=lambda: lambda: {'linear_x': 0.0, 'angular_wheel': 0.0})
    para_info: Callable[[], Dict[str, Any]] = field(
        default_factory=lambda: lambda: {})
    dev_info: Callable[[], Dict[str, Any]] = field(
        default_factory=lambda: lambda: {})
    versions: Callable[[], Dict[str, str]] = field(
        default_factory=lambda: lambda: {'sv': '', 'hv': '', 'ov': ''})

    map_dir: Path = Path('/userdata/lfi/maps/')
    log_dir: Path = Path('/var/log/')
    config_path: Path = Path('/userdata/lfi/json_config.json')


def _ok(extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    body: Dict[str, Any] = {'result': 0}
    if extra:
        body.update(extra)
    return body


def _fail(msg: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    body: Dict[str, Any] = {'result': 1, 'msg': msg}
    if extra:
        body.update(extra)
    return body


# ─── Map directory helpers ─────────────────────────────────────────────


def _csv_dir(map_dir: Path) -> Path:
    """Per CLAUDE.md memory `mower-map-on-disk-layout.md`, every map
    has its CSV under `home0/csv_file/`. We expose the list there so
    the response shape stays compatible with what stock would return
    if the binary ran on this layout."""
    return map_dir / 'home0' / 'csv_file'


def _list_maps(map_dir: Path) -> List[str]:
    """Stable, deterministic order — `mapN` keys ascending, then
    obstacles, then arbitrary remainder. Catalog says
    get_map_list_respond carries an array of map names."""
    csv_dir = _csv_dir(map_dir)
    if not csv_dir.is_dir():
        return []
    names = []
    for f in csv_dir.iterdir():
        if f.suffix.lower() == '.csv':
            names.append(f.stem)
    # Sort: numeric mapN first (mapN where N is integer), then the rest.
    def _key(name: str):
        m = re.match(r'^map(\d+)$', name)
        if m:
            return (0, int(m.group(1)), '')
        m2 = re.match(r'^map(\d+)_(\d+)_obstacle$', name)
        if m2:
            return (1, int(m2.group(1)), m2.group(0))
        return (2, 0, name)
    return sorted(names, key=_key)


def _read_csv_outline(map_dir: Path, map_name: str) -> Optional[List[List[float]]]:
    csv_dir = _csv_dir(map_dir)
    p = csv_dir / f'{map_name}.csv'
    if not p.is_file():
        return None
    out: List[List[float]] = []
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split(',')
        if len(parts) < 2:
            continue
        try:
            out.append([float(parts[0]), float(parts[1])])
        except ValueError:
            continue
    return out


def _read_planned_path(map_dir: Path, map_name: str) -> Optional[Any]:
    """`get_map_plan_path` reads the per-map planned-coverage JSON the
    coverage planner writes to disk. Path layout from CLAUDE.md:
    `<map_dir>/<map_name>/planned_path.json`."""
    p = map_dir / map_name / 'planned_path.json'
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text())
    except Exception as e:
        log.warning('planned_path: parse failed for %s: %s', map_name, e)
        return None


def _read_map_info(map_dir: Path, map_name: str) -> Optional[Dict[str, Any]]:
    p = map_dir / map_name / 'map_info.json'
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text())
    except Exception as e:
        log.warning('map_info: parse failed for %s: %s', map_name, e)
        return None


def _read_recent_logs(log_dir: Path, limit_bytes: int = 8192) -> List[str]:
    """Tail of the latest .log file under log_dir. Stock binary
    surfaces ~8 KiB per request — enough for the app to display the
    last few error lines."""
    if not log_dir.is_dir():
        return []
    candidates = sorted(
        (p for p in log_dir.glob('*.log') if p.is_file()),
        key=lambda p: p.stat().st_mtime, reverse=True)
    if not candidates:
        return []
    try:
        data = candidates[0].read_bytes()[-limit_bytes:].decode(errors='replace')
    except Exception:
        return []
    return data.splitlines()


# ─── Handler factory ───────────────────────────────────────────────────


def make_handlers(sources: InfoSources, *,
                  config_store=None,
                  set_control_mode_cb: Optional[Callable[[Dict[str, Any]], None]] = None
                  ) -> Dict[str, Callable[[Any], Optional[Dict[str, Any]]]]:
    """Build {cmd_name: handler} dict.

    `config_store` is the same ConfigStore instance the BLE module uses;
    we share it so set_para_info / set_cfg_info / set_control_mode all
    persist to the same `/userdata/lfi/json_config.json`. If None, those
    setters become no-ops (still return result:0 to avoid retry loops).

    `set_control_mode_cb` is a hook main.py wires up to flip
    `g_sound`/`g_headlight` global flags — kept opaque here to avoid
    coupling.
    """

    def h_get_current_pose(_):
        try:
            p = sources.pose() or {}
        except Exception:
            log.exception('get_current_pose: source raised')
            return _fail('source_unavailable')
        return _ok({'x': float(p.get('x', 0.0)),
                    'y': float(p.get('y', 0.0)),
                    'theta': float(p.get('theta', 0.0))})

    def h_get_vel_odom(_):
        try:
            v = sources.vel_odom() or {}
        except Exception:
            log.exception('get_vel_odom: source raised')
            return _fail('source_unavailable')
        return _ok({'linear_x': float(v.get('linear_x', 0.0)),
                    'angular_wheel': float(v.get('angular_wheel', 0.0))})

    def h_get_para_info(_):
        try:
            return _ok(sources.para_info() or {})
        except Exception:
            log.exception('get_para_info: source raised')
            return _fail('source_unavailable')

    def h_set_para_info(body):
        if not isinstance(body, dict):
            return _fail('invalid_body')
        if config_store is not None:
            config_store.patch_section('para', body)
        log.info('set_para_info: %r', body)
        return _ok()

    def h_get_cfg_info(_):
        if not sources.config_path.is_file():
            return _ok()
        try:
            data = json.loads(sources.config_path.read_text())
        except Exception:
            log.exception('get_cfg_info: parse failed')
            return _fail('parse_error')
        return _ok({'cfg': data})

    def h_get_version_info(_):
        try:
            return _ok(sources.versions() or {})
        except Exception:
            log.exception('get_version_info: source raised')
            return _fail('source_unavailable')

    def h_get_dev_info(_):
        try:
            return _ok(sources.dev_info() or {})
        except Exception:
            log.exception('get_dev_info: source raised')
            return _fail('source_unavailable')

    def h_set_control_mode(body):
        if set_control_mode_cb is not None and isinstance(body, dict):
            try:
                set_control_mode_cb(body)
            except Exception:
                log.exception('set_control_mode_cb raised')
        if isinstance(body, dict) and config_store is not None:
            config_store.patch_section('control_mode', body)
        log.info('set_control_mode: %r', body)
        return _ok()

    def h_get_log_info(_):
        return _ok({'log': _read_recent_logs(sources.log_dir)})

    def h_get_map_list(_):
        return _ok({'map_list': _list_maps(sources.map_dir)})

    def h_get_map_outline(body):
        name = _extract_map_name(body)
        if not name:
            return _fail('mapName_required')
        outline = _read_csv_outline(sources.map_dir, name)
        if outline is None:
            return _fail('not_found', {'mapName': name})
        return _ok({'mapName': name, 'outline': outline})

    def h_get_map_plan_path(body):
        name = _extract_map_name(body)
        if not name:
            return _fail('mapName_required')
        path = _read_planned_path(sources.map_dir, name)
        if path is None:
            return _fail('not_found', {'mapName': name})
        return _ok({'mapName': name, 'plan_path': path})

    def h_get_map_info(body):
        name = _extract_map_name(body)
        if not name:
            # Empty form — return the full map list so the app can pick.
            return _ok({'map_list': _list_maps(sources.map_dir)})
        info = _read_map_info(sources.map_dir, name)
        if info is None:
            return _fail('not_found', {'mapName': name})
        return _ok({'mapName': name, 'info': info})

    return {
        'get_current_pose': h_get_current_pose,
        'get_vel_odom': h_get_vel_odom,
        'get_para_info': h_get_para_info,
        'set_para_info': h_set_para_info,
        'get_cfg_info': h_get_cfg_info,
        'get_version_info': h_get_version_info,
        'get_dev_info': h_get_dev_info,
        'set_control_mode': h_set_control_mode,
        'get_log_info': h_get_log_info,
        'get_map_list': h_get_map_list,
        'get_map_outline': h_get_map_outline,
        'get_map_plan_path': h_get_map_plan_path,
        'get_map_info': h_get_map_info,
    }


def _extract_map_name(body: Any) -> Optional[str]:
    """Map-read commands accept either:
        { mapName: "map0" }       — most app builds
        "map0"                    — older firmware spelling
        { "map_name": "map0" }    — snake_case variant
    Returns the map name string, or None if not parseable.
    """
    if isinstance(body, str) and body.strip():
        return body.strip()
    if isinstance(body, dict):
        for key in ('mapName', 'map_name', 'name'):
            v = body.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
    return None


def register_with_dispatcher(dispatcher,
                             sources: InfoSources,
                             *,
                             config_store=None,
                             set_control_mode_cb: Optional[Callable[[Dict[str, Any]], None]] = None
                             ) -> None:
    """Wire all info-read commands into the dispatcher in one call."""
    for cmd, handler in make_handlers(
            sources,
            config_store=config_store,
            set_control_mode_cb=set_control_mode_cb).items():
        dispatcher.register(cmd, handler)
