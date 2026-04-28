#!/usr/bin/env python3
"""Standalone runtime mDNS discovery loop for mowers running custom-firmware
without the open mqtt_node Python wrapper.

Polls `opennova.local` every 60 s. When the resolved IP differs from the
current mqtt addr in /userdata/lfi/json_config.json for 2 consecutive
polls, atomically rewrites both config files and kills mqtt_node so the
existing mqtt_node_monitor.sh respawns it with the new broker.

Verified deployment target: LFIN1231000211 (Python 3.8.10, aarch64).
Uses only Python stdlib + libnss-mdns (which is already wired into
nsswitch on this firmware — `getent hosts opennova.local` works).
"""
from __future__ import annotations

import json
import logging
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

LOG = logging.getLogger('opennova_discovery')

JSON_PATH = Path('/userdata/lfi/json_config.json')
HTTP_ADDR_PATH = Path('/userdata/lfi/http_address.txt')
HOSTNAMES = ('opennova.local', 'opennovabot.local')
INTERVAL_S = 60
DEBOUNCE = 2
MQTT_NODE_BINARY = '/root/novabot/install/novabot_api/lib/novabot_api/mqtt_node'


def resolve_mdns(hostnames):
    """Best-effort A-record lookup via stdlib resolver (libnss-mdns)."""
    for h in hostnames:
        try:
            ip = socket.gethostbyname(h)
            if ip and not ip.startswith('127.'):
                return ip
        except OSError:
            continue
    return None


def read_current_mqtt_host():
    if not JSON_PATH.exists():
        return None
    try:
        d = json.loads(JSON_PATH.read_text())
        m = d.get('mqtt', {}) or {}
        v = m.get('value') if isinstance(m.get('value'), dict) else m
        return v.get('addr', v.get('server'))
    except Exception:
        LOG.exception('failed to read %s', JSON_PATH)
        return None


def atomic_write(path: Path, content: str):
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(content)
    fd = os.open(str(tmp), os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    os.replace(str(tmp), str(path))


def rewrite_configs(new_ip):
    if JSON_PATH.exists():
        d = json.loads(JSON_PATH.read_text())
        m = d.setdefault('mqtt', {})
        if isinstance(m.get('value'), dict):
            m['value']['addr'] = new_ip
        else:
            m['server'] = new_ip
        atomic_write(JSON_PATH, json.dumps(d, indent=2))
    if HTTP_ADDR_PATH.exists():
        line = HTTP_ADDR_PATH.read_text().strip()
        if ':' in line:
            _, p = line.rsplit(':', 1)
            atomic_write(HTTP_ADDR_PATH, '%s:%s' % (new_ip, p))
        else:
            atomic_write(HTTP_ADDR_PATH, new_ip)
    else:
        atomic_write(HTTP_ADDR_PATH, '%s:80' % new_ip)


def kill_mqtt_node():
    try:
        out = subprocess.check_output(['pgrep', '-f', MQTT_NODE_BINARY])
        for pid in out.decode().split():
            try:
                os.kill(int(pid), signal.SIGTERM)
                LOG.info('sent SIGTERM to mqtt_node pid=%s', pid)
            except ProcessLookupError:
                pass
    except subprocess.CalledProcessError:
        LOG.warning('mqtt_node not running — nothing to kill')


def main():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s %(name)s %(levelname)s %(message)s',
    )

    candidate = None
    candidate_hits = 0

    while True:
        current = read_current_mqtt_host()
        resolved = resolve_mdns(HOSTNAMES)

        if not resolved:
            LOG.debug('mDNS resolve failed — skipping')
            candidate = None
            candidate_hits = 0
        elif resolved == current:
            if candidate is not None:
                LOG.info('candidate %s matched current — debounce reset', candidate)
            candidate = None
            candidate_hits = 0
        else:
            if candidate == resolved:
                candidate_hits += 1
            else:
                candidate = resolved
                candidate_hits = 1

            LOG.info('mDNS candidate %s seen %d/%d (current=%s)',
                     candidate, candidate_hits, DEBOUNCE, current)

            if candidate_hits >= DEBOUNCE:
                LOG.warning('confirmed switch %s -> %s, rewriting configs',
                            current, candidate)
                try:
                    rewrite_configs(candidate)
                    LOG.info('configs rewritten — killing mqtt_node so monitor respawns it')
                    kill_mqtt_node()
                except Exception:
                    LOG.exception('switch failed — leaving previous config alone')
                candidate = None
                candidate_hits = 0

        time.sleep(INTERVAL_S)


if __name__ == '__main__':
    sys.exit(main())
