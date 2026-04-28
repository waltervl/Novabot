"""Tests for discovery_loop — runtime mDNS rediscovery.

The loop polls mDNS every interval_s and switches the MQTT broker only
after `debounce` consecutive matching polls return an IP that differs
from the current one. See
docs/superpowers/specs/2026-04-28-zero-touch-mqtt-redirect-design.md.
"""
from __future__ import annotations

import asyncio
import json
import pytest

from config import Config, DiscoveryConfig
from discovery_loop import DiscoveryLoop, ResolveResult


def _make_config(mqtt_host: str = '192.168.0.10') -> Config:
    return Config(
        mqtt_host=mqtt_host,
        mqtt_port=1883,
        http_host=mqtt_host,
        http_port=80,
        discovery=DiscoveryConfig(enabled=True, interval_s=1, debounce=2),
    )


@pytest.mark.asyncio
async def test_no_change_when_resolved_matches_current(tmp_path):
    json_cfg = tmp_path / 'json_config.json'
    json_cfg.write_text(json.dumps({'mqtt': {'value': {'addr': '192.168.0.10', 'port': 1883}}}))
    http_addr = tmp_path / 'http_address.txt'
    http_addr.write_text('192.168.0.10:80')

    switches: list[str] = []

    async def resolve(_hosts):
        return ResolveResult(host='opennova.local', ip='192.168.0.10')

    loop = DiscoveryLoop(
        config=_make_config('192.168.0.10'),
        json_path=json_cfg,
        http_addr_path=http_addr,
        resolver=resolve,
        on_switch=lambda new_host, new_port: switches.append(f'{new_host}:{new_port}'),
    )

    await loop.poll_once()
    await loop.poll_once()

    assert switches == []
    assert json.loads(json_cfg.read_text())['mqtt']['value']['addr'] == '192.168.0.10'


@pytest.mark.asyncio
async def test_single_mismatch_does_not_switch(tmp_path):
    json_cfg = tmp_path / 'json_config.json'
    json_cfg.write_text(json.dumps({'mqtt': {'value': {'addr': '192.168.0.10', 'port': 1883}}}))
    http_addr = tmp_path / 'http_address.txt'
    http_addr.write_text('192.168.0.10:80')

    answers = iter([
        ResolveResult(host='opennova.local', ip='192.168.0.99'),
        ResolveResult(host='opennova.local', ip='192.168.0.10'),
    ])
    switches: list[str] = []

    async def resolve(_hosts):
        return next(answers)

    loop = DiscoveryLoop(
        config=_make_config('192.168.0.10'),
        json_path=json_cfg,
        http_addr_path=http_addr,
        resolver=resolve,
        on_switch=lambda new_host, new_port: switches.append(f'{new_host}:{new_port}'),
    )

    await loop.poll_once()  # first mismatch -> debounce starts
    await loop.poll_once()  # second poll matches current -> debounce reset

    assert switches == []
    assert json.loads(json_cfg.read_text())['mqtt']['value']['addr'] == '192.168.0.10'


@pytest.mark.asyncio
async def test_two_mismatches_trigger_switch(tmp_path):
    json_cfg = tmp_path / 'json_config.json'
    json_cfg.write_text(json.dumps({'mqtt': {'value': {'addr': '192.168.0.10', 'port': 1883}}}))
    http_addr = tmp_path / 'http_address.txt'
    http_addr.write_text('192.168.0.10:80')

    switches: list[str] = []

    async def resolve(_hosts):
        return ResolveResult(host='opennova.local', ip='192.168.0.99')

    loop = DiscoveryLoop(
        config=_make_config('192.168.0.10'),
        json_path=json_cfg,
        http_addr_path=http_addr,
        resolver=resolve,
        on_switch=lambda new_host, new_port: switches.append(f'{new_host}:{new_port}'),
    )

    await loop.poll_once()  # debounce 1/2
    await loop.poll_once()  # debounce 2/2 -> switch

    assert switches == ['192.168.0.99:1883']

    written = json.loads(json_cfg.read_text())
    assert written['mqtt']['value']['addr'] == '192.168.0.99'
    assert written['mqtt']['value']['port'] == 1883
    assert http_addr.read_text() == '192.168.0.99:80'

    # Subsequent polls with the now-matching IP are no-ops
    await loop.poll_once()
    assert len(switches) == 1


@pytest.mark.asyncio
async def test_resolve_failure_does_not_change_config(tmp_path):
    json_cfg = tmp_path / 'json_config.json'
    json_cfg.write_text(json.dumps({'mqtt': {'value': {'addr': '192.168.0.10', 'port': 1883}}}))
    http_addr = tmp_path / 'http_address.txt'
    http_addr.write_text('192.168.0.10:80')

    switches: list[str] = []

    async def resolve(_hosts):
        return ResolveResult(host=None, ip=None)

    loop = DiscoveryLoop(
        config=_make_config('192.168.0.10'),
        json_path=json_cfg,
        http_addr_path=http_addr,
        resolver=resolve,
        on_switch=lambda new_host, new_port: switches.append(f'{new_host}:{new_port}'),
    )

    await loop.poll_once()
    await loop.poll_once()

    assert switches == []
    assert json.loads(json_cfg.read_text())['mqtt']['value']['addr'] == '192.168.0.10'
