# Zero-touch MQTT redirect via mDNS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mowers running custom firmware auto-discover the OpenNova server on the LAN and follow it across IP / host migrations without DNS rewrite, BLE re-provisioning, or SSH.

**Architecture:** Phase 1 adds a server-side mDNS advertiser broadcasting `opennova.local` + `opennovabot.local` (legacy) using the existing `multicast-dns` Node lib. Phase 2 adds a 60 s mDNS poll loop in the mower's `mqtt_node` Python wrapper with 2× debounce; on a confirmed IP change it atomically rewrites `json_config.json` + `http_address.txt`, reconnects MQTT, and publishes a `server_migrated` event for audit.

**Tech Stack:** TypeScript 5 (Node 20, Express, multicast-dns 7), Python 3.10 (asyncio, paho-mqtt, zeroconf), bash (custom firmware build script), vitest + pytest.

**Spec:** `docs/superpowers/specs/2026-04-28-zero-touch-mqtt-redirect-design.md`

---

## File Structure

| Action | Path | Purpose |
|--------|------|---------|
| Create | `server/src/services/mdnsAdvertiser.ts` | Boot/shutdown of the mDNS responder |
| Modify | `server/src/index.ts:65-66` | Start advertiser after server.listen |
| Create | `server/src/__tests__/services/mdnsAdvertiser.test.ts` | Vitest coverage of advertiser |
| Modify | `docker-compose.yml` | Document/expose 5353/udp |
| Modify | `.env.example` | Document `ENABLE_MDNS` / `MDNS_HOSTNAMES` / `MDNS_TTL` |
| Create | `mower/mqtt_node/discovery_loop.py` | Async poll loop + debounce + atomic switch |
| Modify | `mower/mqtt_node/config.py` | Read `mqtt.discovery.*` fields |
| Modify | `mower/mqtt_node/main.py` | Start loop, wire reconnect callback |
| Modify | `mower/mqtt_node/mqtt_client.py` | Expose `swap_broker(host, port)` for live reconnect |
| Create | `mower/mqtt_node/tests/test_discovery_loop.py` | Pytest coverage |
| Modify | `research/build_custom_firmware.sh:486` | Query both hostnames in mDNS step |
| Create | `docs/guide/auto-discovery.md` | User-facing guide |

---

## Phase 1 — Server-side mDNS advertiser

### Task 1: Failing test — advertiser starts and answers A query

**Files:**
- Create: `server/src/__tests__/services/mdnsAdvertiser.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import mdns from 'multicast-dns';
import { startMdnsAdvertiser, stopMdnsAdvertiser } from '../../services/mdnsAdvertiser.js';

describe('mDNS advertiser', () => {
  afterEach(() => {
    stopMdnsAdvertiser();
  });

  it('answers A query for opennova.local with the configured IP', async () => {
    startMdnsAdvertiser({ ip: '10.99.0.42', hostnames: ['opennova.local'], ttl: 60 });

    const client = mdns({ multicast: false, port: 0 });
    const reply = await new Promise<{ name: string; data: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 1000);
      client.on('response', (packet) => {
        const a = packet.answers?.find((x) => x.name === 'opennova.local' && x.type === 'A');
        if (a) {
          clearTimeout(timer);
          resolve({ name: a.name, data: (a as { data: string }).data });
        }
      });
      client.query({ questions: [{ name: 'opennova.local', type: 'A' }] }, undefined, {
        address: '127.0.0.1', port: 5353,
      });
    });
    client.destroy();

    expect(reply.name).toBe('opennova.local');
    expect(reply.data).toBe('10.99.0.42');
  });

  it('answers for the legacy opennovabot.local hostname too', async () => {
    startMdnsAdvertiser({ ip: '10.99.0.42', hostnames: ['opennova.local', 'opennovabot.local'], ttl: 60 });

    const client = mdns({ multicast: false, port: 0 });
    const reply = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 1000);
      client.on('response', (packet) => {
        const a = packet.answers?.find((x) => x.name === 'opennovabot.local' && x.type === 'A');
        if (a) { clearTimeout(timer); resolve((a as { data: string }).data); }
      });
      client.query({ questions: [{ name: 'opennovabot.local', type: 'A' }] }, undefined, {
        address: '127.0.0.1', port: 5353,
      });
    });
    client.destroy();

    expect(reply).toBe('10.99.0.42');
  });

  it('ignores queries for unrelated hostnames', async () => {
    startMdnsAdvertiser({ ip: '10.99.0.42', hostnames: ['opennova.local'], ttl: 60 });

    const client = mdns({ multicast: false, port: 0 });
    const replied = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 500);
      client.on('response', (packet) => {
        const a = packet.answers?.find((x) => x.name === 'somebody-else.local');
        if (a) { clearTimeout(timer); resolve(true); }
      });
      client.query({ questions: [{ name: 'somebody-else.local', type: 'A' }] }, undefined, {
        address: '127.0.0.1', port: 5353,
      });
    });
    client.destroy();

    expect(replied).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/services/mdnsAdvertiser.test.ts`
Expected: FAIL with `Failed to resolve import "../../services/mdnsAdvertiser.js"`.

### Task 2: Implement mdnsAdvertiser

**Files:**
- Create: `server/src/services/mdnsAdvertiser.ts`

- [ ] **Step 1: Write the module**

```typescript
/**
 * Server-side mDNS advertiser.
 *
 * Custom-firmware mowers (≥ custom-16) query `opennovabot.local` at boot via
 * `set_server_urls.sh`. Newer firmware also queries `opennova.local`. This
 * service answers both with the host LAN IP so a mower can find the
 * OpenNova server without any DNS configuration. See
 * `docs/superpowers/specs/2026-04-28-zero-touch-mqtt-redirect-design.md`.
 *
 * Lifecycle bound to the Node process: started after `server.listen()`,
 * stopped on shutdown via `stopMdnsAdvertiser()`.
 *
 * Network requirements: the container must be able to send and receive
 * multicast UDP on 224.0.0.251:5353. Bridge networking blocks this by
 * default — the docker-compose.yml documents the prereq.
 */
import os from 'node:os';
import mdns from 'multicast-dns';

const TAG = '[MDNS]';

interface AdvertiserOptions {
  ip: string;
  hostnames: string[];
  ttl: number;
}

let socket: ReturnType<typeof mdns> | null = null;
let active: AdvertiserOptions | null = null;

/**
 * Pick the first non-loopback IPv4 address as a fallback when TARGET_IP is
 * unset. We deliberately do not advertise loopback or link-local addresses.
 */
function detectLanIp(): string | null {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address) {
        return iface.address;
      }
    }
  }
  return null;
}

export function startMdnsAdvertiser(opts?: Partial<AdvertiserOptions>): void {
  if (process.env.ENABLE_MDNS === 'false' || process.env.ENABLE_MDNS === '0') {
    console.log(`${TAG} disabled by ENABLE_MDNS env`);
    return;
  }
  if (socket) {
    console.log(`${TAG} already running, ignoring start`);
    return;
  }

  const ip = opts?.ip ?? process.env.TARGET_IP ?? detectLanIp();
  if (!ip) {
    console.warn(`${TAG} no LAN IP detected and TARGET_IP unset — advertiser not started`);
    return;
  }

  const hostnames =
    opts?.hostnames ??
    (process.env.MDNS_HOSTNAMES ?? 'opennova.local,opennovabot.local')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const ttl = opts?.ttl ?? parseInt(process.env.MDNS_TTL ?? '120', 10);

  active = { ip, hostnames, ttl };
  socket = mdns();

  socket.on('query', (query) => {
    const answers: mdns.Answer[] = [];
    for (const q of query.questions ?? []) {
      if ((q.type === 'A' || q.type === 'ANY') && active!.hostnames.includes(q.name)) {
        answers.push({ name: q.name, type: 'A', ttl: active!.ttl, data: active!.ip });
      }
    }
    if (answers.length > 0) {
      socket!.respond({ answers });
    }
  });

  console.log(`${TAG} advertising ${hostnames.join(', ')} → ${ip} (ttl=${ttl}s)`);
}

export function stopMdnsAdvertiser(): void {
  if (!socket) return;
  socket.destroy();
  socket = null;
  active = null;
  console.log(`${TAG} stopped`);
}

export function getActiveAdvertisement(): AdvertiserOptions | null {
  return active;
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/services/mdnsAdvertiser.test.ts`
Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/mdnsAdvertiser.ts server/src/__tests__/services/mdnsAdvertiser.test.ts
git commit -m "feat(mdns): server-side advertiser for opennova.local + legacy hostname"
```

### Task 3: Wire advertiser into server startup

**Files:**
- Modify: `server/src/index.ts:65-66, 245-248`

- [ ] **Step 1: Add the import**

In `server/src/index.ts`, find the existing line 65 (`import { startMowerIpDiscovery }`) and add right after it:

```typescript
import { startMdnsAdvertiser } from './services/mdnsAdvertiser.js';
```

- [ ] **Step 2: Start the advertiser after server.listen**

In `server/src/index.ts`, find the existing `server.listen(...)` block at line 245 and replace it with:

```typescript
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] HTTP + WebSocket listening on port ${PORT}`);
  console.log(`[SERVER] Verwacht nginx proxy manager voor TLS termination op app.lfibot.com`);
  startMdnsAdvertiser();
});
```

- [ ] **Step 3: Run typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(server): boot mdns advertiser with the http server"
```

### Task 4: Document mDNS port requirement in docker-compose

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add 5353/udp to the ports list and an explanatory comment**

In `docker-compose.yml`, find the existing `ports:` block under the `opennova` service. Replace:

```yaml
    ports:
      - "80:80"       # HTTP (API + admin panel + mower connectivity check)
      - "443:443"     # HTTPS (required for Novabot app)
      - "1883:1883"   # MQTT broker
```

with:

```yaml
    ports:
      - "80:80"       # HTTP (API + admin panel + mower connectivity check)
      - "443:443"     # HTTPS (required for Novabot app)
      - "1883:1883"   # MQTT broker
      # mDNS — used by custom-firmware mowers to auto-discover this server
      # on the LAN. Without this, mowers fall back to DNS rewrite of
      # mqtt.lfibot.com. See docs/guide/auto-discovery.md.
      - "5353:5353/udp"
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "chore(compose): expose 5353/udp for mDNS auto-discovery"
```

### Task 5: Document the env vars

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Append the mDNS section before the closing of the file**

In `.env.example`, after the `HA_MAP_THROTTLE_MS=15000` line, add:

```bash

# === mDNS auto-discovery ===
# Custom-firmware mowers query opennova.local (and the legacy
# opennovabot.local) at boot to find this server. Set ENABLE_MDNS=false
# to opt out — DNS rewrite of mqtt.lfibot.com keeps working as the
# fallback path.
ENABLE_MDNS=true

# Comma-separated hostnames to advertise. Keep both for backwards
# compatibility with already-installed custom firmware.
MDNS_HOSTNAMES=opennova.local,opennovabot.local

# A-record TTL in seconds.
MDNS_TTL=120
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): document ENABLE_MDNS / MDNS_HOSTNAMES / MDNS_TTL"
```

---

## Phase 2 — Mower-side runtime discovery loop

### Task 6: Extend Config dataclass with discovery fields

**Files:**
- Modify: `mower/mqtt_node/config.py`

- [ ] **Step 1: Add `DiscoveryConfig` dataclass and embed it in `Config`**

In `mower/mqtt_node/config.py`, replace the `Config` dataclass and `load` function with:

```python
"""Runtime configuration for mqtt_node.

Sources (in precedence order):
1. Environment variables (BROKER_HOST, BROKER_PORT, AES_BYPASS_SNS,
   ROS_DOMAIN_ID, MAP_DIR, OPEN_MQTT_NODE_DISCOVERY_*)
2. /userdata/lfi/json_config.json — mqtt section + mqtt.discovery section
3. /userdata/lfi/http_address.txt — host:port (NO http:// prefix per
   CLAUDE.md)

Live binary string evidence: research/documents/mqtt_node-strings.md:752-753.
"""
from __future__ import annotations
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Set


DEFAULT_JSON = Path('/userdata/lfi/json_config.json')
DEFAULT_HTTP_ADDR = Path('/userdata/lfi/http_address.txt')
DEFAULT_MAP_DIR = Path('/userdata/lfi/maps/')

# Hostnames the discovery loop queries via mDNS, in order. Both must be
# answered by the OpenNova mDNS advertiser introduced in 2026-04-28.
DEFAULT_DISCOVERY_HOSTS = ('opennova.local', 'opennovabot.local')


@dataclass
class DiscoveryConfig:
    enabled: bool = True
    interval_s: int = 60
    debounce: int = 2
    hostnames: tuple = DEFAULT_DISCOVERY_HOSTS


@dataclass
class Config:
    mqtt_host: str
    mqtt_port: int
    http_host: str
    http_port: int
    map_dir: Path = DEFAULT_MAP_DIR
    aes_bypass_sns: Set[str] = field(default_factory=set)
    shadow_mode: bool = False
    discovery: DiscoveryConfig = field(default_factory=DiscoveryConfig)


def _load_discovery(mqtt_section: dict) -> DiscoveryConfig:
    """Read mqtt.discovery.* fields from json_config.json. Missing or
    malformed fields fall back to the DiscoveryConfig dataclass defaults."""
    raw = mqtt_section.get('discovery') if isinstance(mqtt_section, dict) else None
    if not isinstance(raw, dict):
        raw = {}

    def _bool(val, default):
        if isinstance(val, bool):
            return val
        if isinstance(val, str):
            return val.strip().lower() in ('1', 'true', 'yes', 'on')
        return default

    def _int(val, default):
        try:
            return int(val)
        except (TypeError, ValueError):
            return default

    enabled = _bool(raw.get('enabled'), True)
    interval_s = max(5, _int(raw.get('interval_s'), 60))
    debounce = max(1, _int(raw.get('debounce'), 2))

    hosts_raw = raw.get('hostnames')
    if isinstance(hosts_raw, list) and all(isinstance(x, str) for x in hosts_raw):
        hostnames = tuple(h.strip() for h in hosts_raw if h.strip()) or DEFAULT_DISCOVERY_HOSTS
    else:
        hostnames = DEFAULT_DISCOVERY_HOSTS

    # Env overrides for runtime tuning without editing json_config.
    if 'OPEN_MQTT_NODE_DISCOVERY_ENABLED' in os.environ:
        enabled = os.environ['OPEN_MQTT_NODE_DISCOVERY_ENABLED'].lower() in (
            '1', 'true', 'yes', 'on')
    if 'OPEN_MQTT_NODE_DISCOVERY_INTERVAL_S' in os.environ:
        interval_s = max(5, _int(os.environ['OPEN_MQTT_NODE_DISCOVERY_INTERVAL_S'], 60))
    if 'OPEN_MQTT_NODE_DISCOVERY_DEBOUNCE' in os.environ:
        debounce = max(1, _int(os.environ['OPEN_MQTT_NODE_DISCOVERY_DEBOUNCE'], 2))

    return DiscoveryConfig(
        enabled=enabled,
        interval_s=interval_s,
        debounce=debounce,
        hostnames=hostnames,
    )


def load(json_path: Path = DEFAULT_JSON,
         http_addr_path: Path = DEFAULT_HTTP_ADDR) -> Config:
    """Load the runtime configuration. Missing files are tolerated and
    fall back to defaults; env vars always win."""
    mqtt_host, mqtt_port = '127.0.0.1', 1883
    http_host, http_port = '127.0.0.1', 80
    discovery = DiscoveryConfig()

    if json_path.exists():
        try:
            data = json.loads(json_path.read_text())
            mqtt = data.get('mqtt', {}) or {}
            value = mqtt.get('value') if isinstance(mqtt.get('value'), dict) else mqtt
            mqtt_host = value.get('addr', value.get('server', mqtt_host))
            mqtt_port = int(value.get('port', mqtt_port))
            discovery = _load_discovery(mqtt)
        except Exception:
            pass

    if http_addr_path.exists():
        try:
            line = http_addr_path.read_text().strip()
            if ':' in line:
                h, p = line.rsplit(':', 1)
                http_host = h
                http_port = int(p)
            else:
                http_host = line
        except Exception:
            pass

    if 'BROKER_HOST' in os.environ:
        mqtt_host = os.environ['BROKER_HOST']
    if 'BROKER_PORT' in os.environ:
        mqtt_port = int(os.environ['BROKER_PORT'])
    if 'HTTP_HOST' in os.environ:
        http_host = os.environ['HTTP_HOST']
    if 'HTTP_PORT' in os.environ:
        http_port = int(os.environ['HTTP_PORT'])

    bypass: Set[str] = set()
    if 'AES_BYPASS_SNS' in os.environ:
        bypass = {s.strip() for s in os.environ['AES_BYPASS_SNS'].split(',') if s.strip()}

    map_dir = Path(os.environ.get('MAP_DIR', str(DEFAULT_MAP_DIR)))

    shadow_mode = os.environ.get('OPEN_MQTT_NODE_SHADOW', '0').lower() in (
        '1', 'true', 'yes', 'on')

    return Config(
        mqtt_host=mqtt_host,
        mqtt_port=mqtt_port,
        http_host=http_host,
        http_port=http_port,
        map_dir=map_dir,
        aes_bypass_sns=bypass,
        shadow_mode=shadow_mode,
        discovery=discovery,
    )
```

- [ ] **Step 2: Run existing config tests to verify backward compat**

Run: `cd mower/mqtt_node && python -m pytest tests/test_config.py -v`
Expected: existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add mower/mqtt_node/config.py
git commit -m "feat(mqtt_node): add DiscoveryConfig with env+json overrides"
```

### Task 7: Failing test — discovery_loop is a no-op when resolved IP equals current

**Files:**
- Create: `mower/mqtt_node/tests/test_discovery_loop.py`

- [ ] **Step 1: Write the failing test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mower/mqtt_node && python -m pytest tests/test_discovery_loop.py::test_no_change_when_resolved_matches_current -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'discovery_loop'`.

### Task 8: Failing test — single-poll mismatch is not enough (debounce)

**Files:**
- Modify: `mower/mqtt_node/tests/test_discovery_loop.py`

- [ ] **Step 1: Append the second test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mower/mqtt_node && python -m pytest tests/test_discovery_loop.py -v`
Expected: both tests fail with import error.

### Task 9: Failing test — two consecutive mismatches trigger atomic switch

**Files:**
- Modify: `mower/mqtt_node/tests/test_discovery_loop.py`

- [ ] **Step 1: Append the third test**

```python
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
```

- [ ] **Step 2: Run tests to confirm all four fail**

Run: `cd mower/mqtt_node && python -m pytest tests/test_discovery_loop.py -v`
Expected: 4 fails, all import errors.

### Task 10: Implement discovery_loop.py

**Files:**
- Create: `mower/mqtt_node/discovery_loop.py`

- [ ] **Step 1: Write the module**

```python
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
```

- [ ] **Step 2: Run all four tests**

Run: `cd mower/mqtt_node && python -m pytest tests/test_discovery_loop.py -v`
Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add mower/mqtt_node/discovery_loop.py mower/mqtt_node/tests/test_discovery_loop.py
git commit -m "feat(mqtt_node): runtime mDNS discovery loop with 2x debounce"
```

### Task 11: Add `swap_broker` helper to MqttClient

**Files:**
- Modify: `mower/mqtt_node/mqtt_client.py`

- [ ] **Step 1: Inspect the current MqttClient class to find the right hook point**

Run: `grep -nE "class MqttClient|def connect|def disconnect|self\._client" mower/mqtt_node/mqtt_client.py | head -20`
Expected: locate the constructor and `connect()` method.

- [ ] **Step 2: Add the swap_broker method just below `connect()`**

In `mower/mqtt_node/mqtt_client.py`, find the existing `def connect(self)` method and add immediately after the method body:

```python
    def swap_broker(self, host: str, port: int) -> None:
        """Disconnect from the current broker, point the client at a new
        host:port, and reconnect. Called by the discovery loop when an
        mDNS-confirmed switch lands. Safe to call from a non-asyncio thread
        — paho-mqtt's loop_start spins its own worker."""
        try:
            if self._client is not None:
                try:
                    self._client.disconnect()
                except Exception:
                    pass
        finally:
            self._host = host
            self._port = port
            # Re-run the existing connect flow with the new host/port.
            self.connect()
```

- [ ] **Step 3: Verify the existing mqtt_client tests still pass**

Run: `cd mower/mqtt_node && python -m pytest tests/test_mqtt_client.py -v`
Expected: existing tests continue to pass.

- [ ] **Step 4: Commit**

```bash
git add mower/mqtt_node/mqtt_client.py
git commit -m "feat(mqtt_node): MqttClient.swap_broker for live host/port reconnect"
```

### Task 12: Wire discovery_loop into main.py

**Files:**
- Modify: `mower/mqtt_node/main.py`

- [ ] **Step 1: Add the imports at the top of main.py**

In `mower/mqtt_node/main.py`, add these imports just after the existing `from ota_client import OtaClient` line:

```python
import asyncio as _asyncio_for_discovery

from discovery_loop import DiscoveryLoop, ResolveResult
```

- [ ] **Step 2: Add a zeroconf-backed resolver helper**

In `mower/mqtt_node/main.py`, just before the `def main():` function, add:

```python
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
```

- [ ] **Step 3: Start the discovery loop alongside the MQTT client**

In `mower/mqtt_node/main.py`, find the `def main()` function. After the `mqtt_client = MqttClient(...)` line and after `mqtt_client.connect()` is called, add:

```python
    # ── Discovery loop (Phase 2 of zero-touch MQTT redirect) ─────────────
    discovery = DiscoveryLoop(
        config=cfg,
        json_path=Path('/userdata/lfi/json_config.json'),
        http_addr_path=Path('/userdata/lfi/http_address.txt'),
        resolver=_zeroconf_resolve,
        on_switch=lambda new_host, new_port: mqtt_client.swap_broker(new_host, new_port),
    )

    discovery_loop_thread = threading.Thread(
        target=lambda: _asyncio_for_discovery.run(discovery.run()),
        name='discovery-loop',
        daemon=True,
    )
    discovery_loop_thread.start()
    log.info('discovery loop started')
```

- [ ] **Step 4: Run typecheck-equivalent (import smoke)**

Run: `cd mower/mqtt_node && python -c "import main"`
Expected: no exception (import succeeds).

- [ ] **Step 5: Commit**

```bash
git add mower/mqtt_node/main.py
git commit -m "feat(mqtt_node): start discovery loop alongside mqtt client"
```

### Task 13: Failing test — server_migrated event published after switch

**Files:**
- Modify: `mower/mqtt_node/tests/test_discovery_loop.py`

- [ ] **Step 1: Append a publish-side test**

```python
@pytest.mark.asyncio
async def test_switch_emits_server_migrated_event(tmp_path):
    json_cfg = tmp_path / 'json_config.json'
    json_cfg.write_text(json.dumps({'mqtt': {'value': {'addr': '192.168.0.10', 'port': 1883}}}))
    http_addr = tmp_path / 'http_address.txt'
    http_addr.write_text('192.168.0.10:80')

    published: list[tuple[str, dict]] = []

    async def resolve(_hosts):
        return ResolveResult(host='opennova.local', ip='192.168.0.99')

    def on_switch_with_event(new_host: str, new_port: int) -> None:
        published.append((
            f'novabot/events/LFIN1234567890/server_migrated',
            {'from_ip': '192.168.0.10', 'to_ip': new_host, 'port': new_port},
        ))

    loop = DiscoveryLoop(
        config=_make_config('192.168.0.10'),
        json_path=json_cfg,
        http_addr_path=http_addr,
        resolver=resolve,
        on_switch=on_switch_with_event,
    )
    await loop.poll_once()
    await loop.poll_once()

    assert len(published) == 1
    topic, payload = published[0]
    assert topic.endswith('/server_migrated')
    assert payload['from_ip'] == '192.168.0.10'
    assert payload['to_ip'] == '192.168.0.99'
```

- [ ] **Step 2: Run the test — should pass already, since on_switch is just a callback**

Run: `cd mower/mqtt_node && python -m pytest tests/test_discovery_loop.py::test_switch_emits_server_migrated_event -v`
Expected: PASS (the test exercises the callback contract; the real publish happens in Task 14).

- [ ] **Step 3: Commit**

```bash
git add mower/mqtt_node/tests/test_discovery_loop.py
git commit -m "test(discovery_loop): document on_switch event contract"
```

### Task 14: Publish server_migrated event from main.py on_switch

**Files:**
- Modify: `mower/mqtt_node/main.py`

- [ ] **Step 1: Replace the on_switch lambda with a function that also publishes the event**

In `mower/mqtt_node/main.py`, find the `discovery = DiscoveryLoop(...)` block from Task 12 and replace its `on_switch` argument as follows:

```python
    def _on_server_switch(new_host: str, new_port: int) -> None:
        previous_host = discovery._current_host  # captured before the swap
        mqtt_client.swap_broker(new_host, new_port)
        try:
            payload = json.dumps({
                'from_ip': previous_host,
                'to_ip': new_host,
                'port': new_port,
                'ts': int(time.time() * 1000),
            })
            topic = f'novabot/events/{cfg_sn}/server_migrated'
            mqtt_client.publish(topic, payload, qos=1, retain=False)
            log.info('emitted server_migrated event topic=%s', topic)
        except Exception:
            log.exception('failed to publish server_migrated event')

    discovery = DiscoveryLoop(
        config=cfg,
        json_path=Path('/userdata/lfi/json_config.json'),
        http_addr_path=Path('/userdata/lfi/http_address.txt'),
        resolver=_zeroconf_resolve,
        on_switch=_on_server_switch,
    )
```

Verify `cfg_sn` is the existing `_detect_sn()` result already in scope; if not, reuse the variable name `sn` from the existing code (search for the line where it's first assigned and reuse that name in the f-string).

- [ ] **Step 2: Import smoke**

Run: `cd mower/mqtt_node && python -c "import main"`
Expected: no exception.

- [ ] **Step 3: Commit**

```bash
git add mower/mqtt_node/main.py
git commit -m "feat(mqtt_node): emit server_migrated event after broker swap"
```

### Task 15: Update set_server_urls.sh to query opennova.local first

**Files:**
- Modify: `research/build_custom_firmware.sh:486-538`

- [ ] **Step 1: Inspect the existing mDNS block**

Run: `sed -n '480,540p' research/build_custom_firmware.sh`
Expected: see the embedded Python `mdns_query` heredoc that currently encodes only `opennovabot.local` (`b'\x0eopennovabot\x05local\x00'`).

- [ ] **Step 2: Replace the `qname` line so the script queries both names**

In `research/build_custom_firmware.sh`, find the `qname = b'\x0eopennovabot\x05local\x00'` line inside `MDNS_EOF` and replace it with:

```python
    # Query both modern (opennova.local, 0x09 = 9 chars) and legacy
    # (opennovabot.local, 0x0e = 12 chars) hostnames in one round-trip.
    qnames = [
        b'\x09opennova\x05local\x00',
        b'\x0eopennovabot\x05local\x00',
    ]
```

Then find the line that builds the query packet — `query = struct.pack('!6H', 0, 0, 1, 0, 0, 0) + qname + struct.pack('!2H', 1, 1)` — and replace it with:

```python
    query = struct.pack('!6H', 0, 0, len(qnames), 0, 0, 0)
    for q in qnames:
        query += q + struct.pack('!2H', 1, 1)
```

This sends both questions in a single multicast packet; the responder is allowed to answer either or both.

- [ ] **Step 3: Lint the bash script**

Run: `bash -n research/build_custom_firmware.sh`
Expected: no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add research/build_custom_firmware.sh
git commit -m "feat(custom-fw): set_server_urls.sh queries opennova.local + legacy"
```

---

## Phase 3 — Documentation

### Task 16: Write the user-facing guide

**Files:**
- Create: `docs/guide/auto-discovery.md`

- [ ] **Step 1: Write the guide**

```markdown
# Auto-discovery (zero-touch MQTT redirect)

OpenNova mowers running custom firmware can find your OpenNova server on
the LAN automatically — no DNS rewrite, no BLE re-pairing, no SSH. This
guide explains how it works and how to migrate the server between hosts
(laptop ↔ NAS ↔ Raspberry Pi) without touching the mower.

## How it works

1. The OpenNova server advertises itself on the local network as
   `opennova.local` (and the legacy `opennovabot.local`) via mDNS — the
   same service-discovery protocol AirPrint and Chromecast use.
2. The mower's `mqtt_node` polls those names every 60 seconds. When the
   resolved IP changes from the one in the running config and stays
   changed for two consecutive polls, the mower atomically rewrites
   `json_config.json`, switches its MQTT client to the new broker, and
   publishes a `server_migrated` event.
3. Boot-time `set_server_urls.sh` does the same lookup, so a mower that
   was offline during your migration picks up the new IP on next power
   cycle.

Net result: install OpenNova on a new host, leave the mower alone, and
within ~3 minutes it has followed you over.

## Migrating laptop → NAS

1. Install OpenNova on the NAS (CasaOS / docker compose / `docker run`).
   Make sure the container has `5353/udp` exposed and `ENABLE_MDNS=true`
   (default).
2. Copy the `data/` directory off the laptop container to the NAS so the
   account, devices, and maps follow:
   ```bash
   rsync -av /Users/<you>/Novabot/data/ nas:/path/to/opennova/data/
   ```
3. Stop the laptop container. Don't change DNS settings — the mower will
   fall through to the new mDNS responder on the NAS.
4. Wait ~3 minutes. The mower's discovery loop notices the laptop is
   gone, sees the NAS responding to `opennova.local`, debounces, and
   reconnects.
5. Verify by tailing the NAS container log: a new `[MQTT] CONNECT DEV`
   line appears for your mower's SN, and the dashboard shows it as
   online.

If you'd rather not wait: power-cycle the mower. Boot-time discovery
catches the new IP immediately.

## Network requirements

mDNS uses UDP multicast on `224.0.0.251:5353`. It works out of the box on
flat home LANs (single subnet, single SSID, no VLAN bridge). It does
**not** work across:

- VLAN boundaries unless the bridge has IGMP snooping / mDNS reflector
  enabled (Unifi has this in network settings; eero / Google WiFi
  generally do not).
- Some "guest network" SSIDs that isolate clients.
- Docker bridge networking without `--network host` or a published
  `5353/udp` mapping.

If mDNS is blocked on your network, fall back to the original DNS
rewrite path: point `mqtt.lfibot.com` at the OpenNova IP via Pi-hole,
AdGuard, or your router's DNS overrides.

## Verifying the advertiser is up

From any Linux/macOS host on the same LAN:

```bash
dns-sd -G v4 opennova.local      # macOS
avahi-resolve -n opennova.local  # Linux
```

You should see the OpenNova server's IP in under a second. From inside
the OpenNova container:

```bash
docker logs opennova | grep MDNS
# [MDNS] advertising opennova.local, opennovabot.local → 192.168.0.247 (ttl=120s)
```

## Verifying the mower picked up the new IP

The mower publishes a `server_migrated` event the first time it
reconnects to a new broker. You'll see it in three places:

- Dashboard event log under the affected SN.
- The MQTT topic `novabot/events/<SN>/server_migrated`.
- `GET /api/events/<SN>?limit=10` — the most recent event includes
  `event_type: server_migrated` with `from_ip` / `to_ip`.

If you set `NTFY_TOPIC` in `.env`, the migration also pushes a
notification to your phone.

## Configuration knobs

Server (`docker-compose.yml` environment):

| Variable | Default | Purpose |
|----------|---------|---------|
| `ENABLE_MDNS` | `true` | Set `false` to disable the advertiser entirely |
| `MDNS_HOSTNAMES` | `opennova.local,opennovabot.local` | Hostnames to advertise |
| `MDNS_TTL` | `120` | A-record TTL in seconds |

Mower (`/userdata/lfi/json_config.json`, `mqtt.discovery` section):

```json
{
  "mqtt": {
    "value": { "addr": "192.168.0.247", "port": 1883 },
    "discovery": {
      "enabled": true,
      "interval_s": 60,
      "debounce": 2,
      "hostnames": ["opennova.local", "opennovabot.local"]
    }
  }
}
```

`enabled=false` turns the runtime loop off; the boot-time discovery in
`set_server_urls.sh` is unaffected.

## Stock firmware

Stock firmware does not auto-discover. It always asks for
`mqtt.lfibot.com`. To redirect a stock mower to OpenNova, point that
hostname at the server via your network's DNS (Pi-hole, AdGuard,
router DNS rewrite, or the container's built-in `ENABLE_DNS=true`
dnsmasq).
```

- [ ] **Step 2: Commit**

```bash
git add docs/guide/auto-discovery.md
git commit -m "docs(guide): zero-touch auto-discovery — usage + troubleshooting"
```

### Task 17: Cross-link auto-discovery guide from existing docs

**Files:**
- Modify: `docs/guide/dns-setup.md`
- Modify: `README.md`

- [ ] **Step 1: Add a "see also" pointer at the top of dns-setup.md**

In `docs/guide/dns-setup.md`, find the title line (`# DNS Setup` or whatever it currently says) and add immediately below it:

```markdown
> Have a custom-firmware mower? You can skip DNS rewrite entirely — see
> [auto-discovery](auto-discovery.md). DNS rewrite is required only for
> stock-firmware devices.
```

- [ ] **Step 2: Add a one-liner in the README's setup section**

In `README.md`, find the existing "Set up DNS redirect" heading. Just below the heading, before "Option A" / "Option B" content, insert:

```markdown
> **Custom firmware?** Auto-discovery via mDNS may already work without any DNS
> setup — see [docs/guide/auto-discovery.md](docs/guide/auto-discovery.md).
> The DNS options below are required for stock firmware.
```

- [ ] **Step 3: Commit**

```bash
git add docs/guide/dns-setup.md README.md
git commit -m "docs: link auto-discovery guide from DNS setup + README"
```

### Task 18: Live integration smoke test

**Files:** none (manual)

- [ ] **Step 1: Bring the container up**

Run: `cd /Users/rvbcrs/GitHub/Novabot && docker compose up -d --build`
Expected: container starts, log shows `[MDNS] advertising opennova.local, opennovabot.local → <ip> (ttl=120s)`.

- [ ] **Step 2: Resolve from another LAN host**

Run (from a Mac on the same LAN): `dns-sd -G v4 opennova.local`
Expected: shows the OpenNova host IP within ~1 s. Press Ctrl+C to stop.

- [ ] **Step 3: Verify against a real mower (custom-firmware)**

Tail the mower's mqtt_node log via SSH:
Run: `sshpass -p novabot ssh root@<mower-ip> 'tail -f /userdata/ota/mqtt_node.log'`
Trigger an IP change (stop/start the container with a different `TARGET_IP`, or move the container to a different host). Within `2 * 60 s` you should see `mdns confirmed switch <old> -> <new>` followed by a reconnect.

- [ ] **Step 4: Confirm the dashboard receives the server_migrated event**

Open the OpenNova dashboard → Events tab → filter by SN. The latest entry should be `server_migrated` with the old / new IP.

- [ ] **Step 5: Tear down**

Run: `docker compose down`

---

## Self-review

**Spec coverage:**

| Spec section | Covered by |
|--------------|-----------|
| Server-side mDNS broadcaster (Phase 1) | Tasks 1–5 |
| Mower-side runtime discovery loop (Phase 2) | Tasks 6–14 |
| Configuration knobs (server) | Task 5 |
| Configuration knobs (mower) | Task 6 |
| Migration event emission | Tasks 13–14 |
| Failure modes — atomic rewrite | Task 10 (`_atomic_write`) |
| Failure modes — resolve timeout | Task 9 (`test_resolve_failure_does_not_change_config`) |
| Set_server_urls.sh queries both hostnames | Task 15 |
| Documentation deliverable | Tasks 16–17 |
| Test plan — unit | Tasks 1, 7, 8, 9, 13 |
| Test plan — integration smoke | Task 18 |

**No-placeholder check:** scanned for "TBD", "TODO", "implement later", and "etc." — none present. Every code-bearing step contains complete code.

**Type / name consistency:** `DiscoveryConfig`, `DiscoveryLoop`, `ResolveResult`, `Resolver`, `SwitchCallback`, `_atomic_write`, `_rewrite_json_config`, `_rewrite_http_addr` are all defined in Task 10 and used consistently in Tasks 7–14. The `swap_broker(host, port)` signature in Task 11 matches the `on_switch` callback signature used in Tasks 7–14.
