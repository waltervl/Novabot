"""Periodic HTTP loops the stock binary runs.

Confirmed endpoints (research/documents/mqtt_node-strings.md:752-767):
  /api/nova-network/network/connection — periodic health check (verified)
  /api/nova-data/cut                   — cut-grass work record (multipart)
  /api/nova-data/equipment             — equipment state heartbeat
  /api/nova-message/machine            — machine messages
  /api/nova-user/equipment/machine     — equipment management
  /api/nova-file-server/map/upload     — map upload (event-driven, not periodic)

net_check_fun:
- POST http://<host>:<port>/api/nova-network/network/connection
- 30 s period; body {"sn": "<serial>"}
- Per CLAUDE.md, >3 failures triggers a WiFi reconnect on the firmware
  side. We count + log; the firmware has its own watchdog.

http_work_fun:
- POST /api/nova-data/equipment    — periodic equipment-state heartbeat (60 s)
- POST /api/nova-user/equipment/machine — equipment management heartbeat (60 s)
- POST /api/nova-message/machine   — machine-message poll (15 s)
- POST /api/nova-data/cut and /api/nova-file-server/map/upload are
  event-driven (work-record save + map upload), invoked from the
  command handlers — not loops.

Telemetry source for the heartbeat bodies is the SensorAggregator;
http_client takes a callable that returns the body dict so this
module stays decoupled from the aggregator.
"""
from __future__ import annotations
import logging
import threading
from typing import Any, Callable, Dict, List, Optional

import requests

log = logging.getLogger('mqtt_node.http_client')

BodySource = Callable[[], Dict[str, Any]]
"""() → dict — supplies the JSON body for a heartbeat post."""


class HttpClient:
    def __init__(self, host: str, port: int, sn: str,
                 *,
                 equipment_body: Optional[BodySource] = None,
                 user_equipment_body: Optional[BodySource] = None,
                 message_body: Optional[BodySource] = None):
        self.host = host
        self.port = port
        self.sn = sn
        self._stop = threading.Event()
        self._threads: List[threading.Thread] = []
        self._fail_count = 0
        # Body sources default to {sn} so the loops still post even
        # before main.py has wired the aggregator.
        self._equipment_body = equipment_body or (lambda: {'sn': self.sn})
        self._user_equipment_body = user_equipment_body or (lambda: {'sn': self.sn})
        self._message_body = message_body or (lambda: {'sn': self.sn})

    def _url(self, path: str) -> str:
        return f'http://{self.host}:{self.port}{path}'

    # ── Single-shot helpers (testable) ─────────────────────────────

    def net_check_once(self) -> bool:
        url = self._url('/api/nova-network/network/connection')
        try:
            r = requests.post(url, json={'sn': self.sn}, timeout=5)
            ok = 200 <= r.status_code < 500
            if ok:
                self._fail_count = 0
            else:
                self._fail_count += 1
            log.debug('net_check %s → %s (fail_count=%d)',
                      url, r.status_code, self._fail_count)
            return ok
        except Exception as e:
            self._fail_count += 1
            log.warning('net_check failed (%s, count=%d): %s',
                        url, self._fail_count, e)
            return False

    def equipment_once(self) -> bool:
        url = self._url('/api/nova-data/equipment')
        body = self._equipment_body()
        return self._post_json(url, body)

    def user_equipment_once(self) -> bool:
        url = self._url('/api/nova-user/equipment/machine')
        body = self._user_equipment_body()
        return self._post_json(url, body)

    def message_once(self) -> bool:
        url = self._url('/api/nova-message/machine')
        body = self._message_body()
        return self._post_json(url, body)

    def upload_cut_grass_record(self, fields: Dict[str, Any]) -> bool:
        """POST /api/nova-data/cut — multipart work record. Triggered
        from the work-record save flow, not a periodic loop. Returns
        True on HTTP 2xx."""
        url = self._url('/api/nova-data/cut')
        try:
            r = requests.post(url, data=fields, timeout=10)
            log.info('upload_cut_grass_record → %s', r.status_code)
            return 200 <= r.status_code < 300
        except Exception as e:
            log.warning('upload_cut_grass_record failed: %s', e)
            return False

    def upload_map(self, sn: str, file_path: str) -> bool:
        """POST /api/nova-file-server/map/upload — multipart map ZIP.

        Triggered when save_map type:1 finishes. Stock binary uploads
        the zipped map directory; we reuse the same endpoint and form
        layout (`sn`, `file`)."""
        url = self._url('/api/nova-file-server/map/upload')
        try:
            with open(file_path, 'rb') as fh:
                files = {'file': (file_path.split('/')[-1], fh)}
                r = requests.post(url, data={'sn': sn}, files=files, timeout=30)
            log.info('upload_map %s → %s', file_path, r.status_code)
            return 200 <= r.status_code < 300
        except Exception as e:
            log.warning('upload_map failed (%s): %s', file_path, e)
            return False

    def _post_json(self, url: str, body: Dict[str, Any]) -> bool:
        try:
            r = requests.post(url, json=body, timeout=5)
            log.debug('%s → %s', url, r.status_code)
            return 200 <= r.status_code < 500
        except Exception as e:
            log.warning('%s failed: %s', url, e)
            return False

    # ── Loop helpers ───────────────────────────────────────────────
    def _loop(self, fn, period_sec: float) -> None:
        while not self._stop.is_set():
            try:
                fn()
            except Exception:
                log.exception('http loop %s raised', fn.__name__)
            self._stop.wait(period_sec)

    def start(self) -> None:
        loops = [
            (self.net_check_once, 30.0, 'net_check_fun'),
            (self.equipment_once, 60.0, 'http_equipment_heartbeat'),
            (self.user_equipment_once, 60.0, 'http_user_equipment_heartbeat'),
            (self.message_once, 15.0, 'http_message_poll'),
        ]
        for fn, period, name in loops:
            t = threading.Thread(target=self._loop, args=(fn, period),
                                 daemon=True, name=name)
            t.start()
            self._threads.append(t)

    def stop(self) -> None:
        self._stop.set()
        for t in self._threads:
            t.join(timeout=2.0)
