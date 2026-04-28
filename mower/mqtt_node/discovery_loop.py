"""Mower-side mDNS discovery loop.

Polls mDNS for `opennova.local` (or any hostname listed in
DiscoveryConfig.hostnames) every `interval_s` seconds. When the resolved
IP differs from the current `mqtt_host` for `debounce` consecutive polls,
atomically rewrite json_config.json + http_address.txt and call the
`on_switch` callback so the MQTT client can reconnect.

Design notes:
- All file writes go through `_atomic_write` (write tmp + rename) so a
  power-loss between `write` and `rename` cannot leave a half-written
  config behind.
- `resolver` is injected for testability — production wires it to
  `_zeroconf_lookup` which uses the `zeroconf` package already shipped
  in the firmware's `ota_lib/` site-packages.
- The loop never modifies mqtt_port / http_port — only the host changes
  during a server migration. If the user wants a different port they
  should re-provision via BLE.
- Spec: docs/superpowers/specs/2026-04-28-zero-touch-mqtt-redirect-design.md
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Awaitable, Callable, Optional

from config import Config

log = logging.getLogger('mqtt_node.discovery_loop')


@dataclass
class ResolveResult:
    host: Optional[str]
    ip: Optional[str]


Resolver = Callable[[tuple], Awaitable[ResolveResult]]
SwitchCallback = Callable[[str, int], None]


def _atomic_write(path: Path, content: str) -> None:
    """Write `content` to `path` atomically: write to a tmp file in the
    same directory, fsync, then rename. Mirrors the safety set_server_urls.sh
    aims for."""
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(content)
    fd = os.open(str(tmp), os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    os.replace(str(tmp), str(path))


def _rewrite_json_config(json_path: Path, new_host: str, port: int) -> None:
    if not json_path.exists():
        log.warning('json_config missing at %s — cannot rewrite', json_path)
        return
    data = json.loads(json_path.read_text())
    mqtt = data.setdefault('mqtt', {})
    if isinstance(mqtt.get('value'), dict):
        mqtt['value']['addr'] = new_host
        mqtt['value']['port'] = port
    else:
        # Older test shape — keep the same key the loader reads.
        mqtt['server'] = new_host
        mqtt['port'] = port
    _atomic_write(json_path, json.dumps(data, indent=2))


def _rewrite_http_addr(http_addr_path: Path, new_host: str) -> None:
    """http_address.txt format is `host:port` — port stays put, host swaps."""
    if not http_addr_path.exists():
        # Best-effort: write host with default port 80.
        _atomic_write(http_addr_path, f'{new_host}:80')
        return
    line = http_addr_path.read_text().strip()
    if ':' in line:
        _, p = line.rsplit(':', 1)
        _atomic_write(http_addr_path, f'{new_host}:{p}')
    else:
        _atomic_write(http_addr_path, new_host)


class DiscoveryLoop:
    """Async poll loop with debounce. Inject `resolver` and `on_switch`
    for tests; production wires real implementations in main.py."""

    def __init__(
        self,
        config: Config,
        json_path: Path,
        http_addr_path: Path,
        resolver: Resolver,
        on_switch: SwitchCallback,
    ) -> None:
        self._config = config
        self._json_path = json_path
        self._http_addr_path = http_addr_path
        self._resolver = resolver
        self._on_switch = on_switch
        self._current_host = config.mqtt_host
        self._candidate: Optional[str] = None
        self._candidate_hits = 0
        self._task: Optional[asyncio.Task] = None
        self._stopped = asyncio.Event()

    async def poll_once(self) -> None:
        result = await self._resolver(self._config.discovery.hostnames)
        if not result.ip:
            log.debug('mdns resolve failed — skipping cycle')
            self._candidate = None
            self._candidate_hits = 0
            return

        if result.ip == self._current_host:
            # Either nothing changed, or a previous candidate flapped back.
            self._candidate = None
            self._candidate_hits = 0
            return

        if self._candidate == result.ip:
            self._candidate_hits += 1
        else:
            self._candidate = result.ip
            self._candidate_hits = 1

        if self._candidate_hits < self._config.discovery.debounce:
            log.info(
                'mdns candidate %s seen %d/%d times',
                self._candidate,
                self._candidate_hits,
                self._config.discovery.debounce,
            )
            return

        log.info(
            'mdns confirmed switch %s -> %s after %d polls',
            self._current_host,
            self._candidate,
            self._candidate_hits,
        )
        _rewrite_json_config(self._json_path, self._candidate, self._config.mqtt_port)
        _rewrite_http_addr(self._http_addr_path, self._candidate)
        old_host = self._current_host
        self._current_host = self._candidate
        self._candidate = None
        self._candidate_hits = 0
        try:
            self._on_switch(self._current_host, self._config.mqtt_port)
        except Exception:
            log.exception('on_switch callback raised — config still rewritten')
        log.info('switch complete (was=%s, now=%s)', old_host, self._current_host)

    async def run(self) -> None:
        if not self._config.discovery.enabled:
            log.info('discovery disabled by config')
            return
        try:
            while not self._stopped.is_set():
                try:
                    await self.poll_once()
                except Exception:
                    log.exception('poll_once raised')
                try:
                    await asyncio.wait_for(
                        self._stopped.wait(),
                        timeout=self._config.discovery.interval_s,
                    )
                except asyncio.TimeoutError:
                    pass
        finally:
            log.info('discovery loop stopped')

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self.run())

    async def stop(self) -> None:
        self._stopped.set()
        if self._task is not None:
            try:
                await self._task
            except Exception:
                log.exception('discovery task raised on stop')
