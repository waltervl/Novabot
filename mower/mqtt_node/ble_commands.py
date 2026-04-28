"""BLE provisioning command handlers.

The Novabot Flutter app provisions a fresh mower over BLE before any
MQTT broker is reachable. The stock mqtt_node binary owns the BLE GATT
side — apps write commands to char 0x0011, the binary updates
/userdata/lfi/json_config.json + http_address.txt + the timezone file,
then responds back over BLE notify.

This module is the open replacement for that logic. Handlers are pure
JSON-in / JSON-out functions (with side-effects on the on-disk config),
which makes them straightforward to unit-test on macOS — no rclpy and
no BlueZ needed.

Handler return contract:
- Return a dict to publish a response (`<cmd>_respond` envelope is
  added by the dispatcher; this module returns the inner dict only).
- Return `None` to suppress the response (none of the BLE commands
  currently use this — mower always echoes status back).

Per CLAUDE.md "BLE Provisioning":
- `result:1` = "acknowledged" — both for charger and mower. The bootstrap
  client treats result:1 as success (bootstrap/src/ble.ts:413, 432).
- `set_cfg_info` carries `{cfg_value:1, tz:"Europe/Amsterdam"}` for the
  mower; the `tz` field in BLE set_cfg_info is safe (different code
  path than the OTA tz bug — see `docs/reference/BLE.md`).

Sources:
- bootstrap/src/ble.ts (Node.js noble client; verified working)
- research/documents/mqtt_node-command-catalog.md sections set_*_info
- memory ble-provisioning-protocol.md
"""
from __future__ import annotations
import json
import logging
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Optional

log = logging.getLogger('mqtt_node.ble_commands')


# ─── Config store ───────────────────────────────────────────────────────
#
# Every BLE write that mutates persistent state goes through ConfigStore.
# It owns json_config.json + http_address.txt + the timezone file,
# normalising paths so unit tests can swap in a tmpdir without monkey-
# patching constants.


@dataclass
class ConfigStore:
    """File-backed store for the persistent provisioning state.

    Lives at /userdata/lfi/ on the mower; tests pass an ephemeral
    Path() for the same effect.
    """
    json_config_path: Path
    http_address_path: Path
    timezone_path: Path
    # Optional callback fired when the broker host/port has changed —
    # main.py wires this up so the MQTT client reconnects cleanly when
    # set_mqtt_info commits a new broker.
    on_broker_changed: Optional[Callable[[str, int], None]] = field(default=None, repr=False)

    def read(self) -> Dict[str, Any]:
        if not self.json_config_path.exists():
            return {}
        try:
            return json.loads(self.json_config_path.read_text())
        except Exception:
            log.exception('ConfigStore.read: malformed json_config; treating as empty')
            return {}

    def write(self, data: Dict[str, Any]) -> None:
        self.json_config_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.json_config_path.with_suffix('.json.tmp')
        tmp.write_text(json.dumps(data, indent=2))
        tmp.replace(self.json_config_path)

    def patch_section(self, name: str, value: Any) -> None:
        """Read-modify-write a single top-level section.

        Stock layout (per CLAUDE.md "Bekende apparaten" + on-mower
        capture):

            {
              "wifi": { "ap": {...}, "sta": {...} },
              "mqtt": { "value": { "addr": ..., "port": ... } },
              "lora": { "addr": ..., "channel": ..., "hc": ..., "lc": ... },
              "rtk":  { ... },
              "para": { ... },
              "sn":   { "value": { "code": "LFIN..." } },
              ...
            }

        We mirror that nested-section layout for forward-compat with the
        stock app.
        """
        data = self.read()
        data[name] = value
        self.write(data)

    def write_http_address(self, host: str, port: int) -> None:
        """Stock binary stores broker target as 'host:port' (NO http://
        prefix, NO trailing newline) — see memory `mower-firmware`."""
        self.http_address_path.parent.mkdir(parents=True, exist_ok=True)
        self.http_address_path.write_text(f'{host}:{port}')

    def write_timezone(self, tz: str) -> None:
        """The mower keeps the timezone string in its own file. The
        BLE set_cfg_info path (this one) is safe; only the OTA path
        carries the bug we strip in the dispatcher."""
        self.timezone_path.parent.mkdir(parents=True, exist_ok=True)
        self.timezone_path.write_text(tz)

    def fire_broker_changed(self, host: str, port: int) -> None:
        if self.on_broker_changed is not None:
            try:
                self.on_broker_changed(host, port)
            except Exception:
                log.exception('on_broker_changed callback raised')


def default_config_store(
        on_broker_changed: Optional[Callable[[str, int], None]] = None
) -> ConfigStore:
    """Production paths used on the mower."""
    return ConfigStore(
        json_config_path=Path('/userdata/lfi/json_config.json'),
        http_address_path=Path('/userdata/lfi/http_address.txt'),
        timezone_path=Path('/userdata/ota/novabot_timezone.txt'),
        on_broker_changed=on_broker_changed,
    )


# ─── System info readers ────────────────────────────────────────────────


def read_wifi_rssi() -> int:
    """Read the link-quality column from /proc/net/wireless.

    Stock binary returns 0 when WiFi is down, otherwise an integer in
    roughly the same range (0..70). Live capture on LFIN1231000211 saw
    `54` — we keep the raw integer to match.
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


def read_signal_info() -> Dict[str, Any]:
    """Snapshot of radio + identity used in `get_signal_info_respond`.

    The bootstrap client (charger only) calls this purely as a probe to
    confirm the GATT connection is alive — the response payload is
    advisory. Mower-side, the field set is a superset; we publish the
    same view as `get_wifi_rssi_respond` for parity.
    """
    return {
        'wifi_rssi': read_wifi_rssi(),
    }


# ─── Handlers (registered against the dispatcher) ──────────────────────


def _ack(extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Standard ack envelope: {result: 1[, ...]}."""
    body: Dict[str, Any] = {'result': 1}
    if extra:
        body.update(extra)
    return body


def make_handlers(store: ConfigStore) -> Dict[str, Callable[[Any], Optional[Dict[str, Any]]]]:
    """Build the {cmd_name: handler} table bound to a ConfigStore.

    main.py calls this once at startup and feeds each entry into the
    dispatcher's `register()` API. The same dispatcher serves both BLE
    and MQTT inbound paths; on the wire these only ever arrive via BLE,
    but routing them through the same dispatcher keeps the test surface
    uniform.
    """

    def h_set_wifi_info(body: Any) -> Dict[str, Any]:
        if not isinstance(body, dict):
            return _ack({'msg': 'invalid'})
        store.patch_section('wifi', body)
        log.info('set_wifi_info: ap=%r sta_present=%s',
                 (body.get('ap') or {}).get('ssid'),
                 'sta' in body)
        return _ack()

    def h_set_mqtt_info(body: Any) -> Dict[str, Any]:
        if not isinstance(body, dict):
            return _ack({'msg': 'invalid'})
        addr = body.get('addr')
        try:
            port = int(body.get('port', 1883))
        except (TypeError, ValueError):
            port = 1883
        if not isinstance(addr, str) or not addr.strip():
            return _ack({'msg': 'addr_required'})
        # Persist BOTH json_config and http_address so the next boot uses
        # the new broker even before any MQTT call comes in.
        # http_address.txt is the source of truth for set_server_urls.sh
        # at boot time (CLAUDE.md "MQTT Topics" + "Mower Firmware").
        store.patch_section('mqtt', {'value': {'addr': addr, 'port': port}})
        store.write_http_address(addr, port)
        store.fire_broker_changed(addr, port)
        log.info('set_mqtt_info: addr=%s port=%d', addr, port)
        return _ack()

    def h_set_lora_info(body: Any) -> Dict[str, Any]:
        # Stock dispatches to /chassis_lora_set action; bootstrap waits
        # for `result:1` on the ack alone. We persist + ack here so a
        # caller without a chassis (test mower w/ no mainboard) still
        # sees the ack the app expects. Real action dispatch happens via
        # the ROS bridge — see ros2_bridge.handle_set_lora_info_action.
        if not isinstance(body, dict):
            return _ack({'msg': 'invalid'})
        store.patch_section('lora', {
            'addr': body.get('addr'),
            'channel': body.get('channel'),
            'hc': body.get('hc'),
            'lc': body.get('lc'),
        })
        log.info('set_lora_info: addr=%s channel=%s hc=%s lc=%s',
                 body.get('addr'), body.get('channel'),
                 body.get('hc'), body.get('lc'))
        return _ack()

    def h_set_rtk_info(body: Any) -> Dict[str, Any]:
        # Charger-only command per bootstrap/src/ble.ts:411. Mower
        # receives nothing from the app for set_rtk_info, but the stock
        # binary still defines a handler that simply persists the body
        # for later consumption. We mirror that behaviour.
        store.patch_section('rtk', body)
        log.info('set_rtk_info: %r', body)
        return _ack()

    def h_set_para_info(body: Any) -> Dict[str, Any]:
        if not isinstance(body, dict):
            return _ack({'msg': 'invalid'})
        store.patch_section('para', body)
        log.info('set_para_info: %r', body)
        return _ack()

    def h_set_cfg_info(body: Any) -> Dict[str, Any]:
        # Two shapes per bootstrap/src/ble.ts:457-462:
        #   Charger: 1 (or {set_cfg_info: 1})
        #   Mower:   {cfg_value: 1, tz: "Europe/Amsterdam"}
        # The cfg_value bit just means "commit" — stock binary uses it
        # as a fence to apply pending changes (wifi reconnect, tz file
        # write). We persist and write tz (BLE path is safe per
        # CLAUDE.md OTA section).
        tz = None
        if isinstance(body, dict):
            tz = body.get('tz')
            store.patch_section('cfg', body)
        else:
            # Plain `1` form — record as committed.
            store.patch_section('cfg', {'cfg_value': body})
        if isinstance(tz, str) and tz.strip():
            store.write_timezone(tz)
            log.info('set_cfg_info: commit tz=%s', tz)
        else:
            log.info('set_cfg_info: commit (no tz)')
        return _ack()

    def h_get_signal_info(body: Any) -> Dict[str, Any]:
        # Probe used by bootstrap during the mower handshake (line 376).
        # Body is `0` per bootstrap; we ignore it.
        return _ack(read_signal_info())

    def h_get_wifi_rssi(body: Any) -> Dict[str, Any]:
        # Variant published by some app builds; same source as
        # get_signal_info but a different command key.
        return _ack({'wifi_rssi': read_wifi_rssi()})

    return {
        'set_wifi_info': h_set_wifi_info,
        'set_mqtt_info': h_set_mqtt_info,
        'set_lora_info': h_set_lora_info,
        'set_rtk_info': h_set_rtk_info,
        'set_para_info': h_set_para_info,
        'set_cfg_info': h_set_cfg_info,
        'get_signal_info': h_get_signal_info,
        'get_wifi_rssi': h_get_wifi_rssi,
    }


def register_with_dispatcher(dispatcher,
                             store: Optional[ConfigStore] = None,
                             *,
                             on_broker_changed: Optional[Callable[[str, int], None]] = None
                             ) -> ConfigStore:
    """Wire all 8 handlers into the dispatcher in one call.

    Returns the ConfigStore so callers can hold a reference for later
    inspection (test harness, manual provisioning audits)."""
    if store is None:
        store = default_config_store(on_broker_changed=on_broker_changed)
    elif on_broker_changed is not None and store.on_broker_changed is None:
        store.on_broker_changed = on_broker_changed
    for cmd, handler in make_handlers(store).items():
        dispatcher.register(cmd, handler)
    return store
