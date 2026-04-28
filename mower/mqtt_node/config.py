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
