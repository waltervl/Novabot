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
