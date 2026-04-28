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

## Port 5353 already in use on the host (ZimaOS / CasaOS / Synology)

If your NAS already runs an `avahi-daemon` (ZimaOS, CasaOS, Synology,
most Linux distros with desktop bits), the OpenNova container can't
bind UDP port 5353 — it's already taken. The container start will fail
or silently skip the advertiser.

Diagnosis from a shell on the NAS:

```bash
sudo ss -ulnp | grep :5353
# UNCONN  ...  *:5353  ...  users:(("avahi-daemon",pid=...,fd=...))
```

The fix is to disable the in-container advertiser and use the host's
existing avahi-daemon to publish the same A-records. avahi already
listens on 5353; we just give it two extra hostnames to answer for.

### Step 1 — Tell the container to stop trying to advertise

In `docker-compose.yml`:

```yaml
environment:
  - ENABLE_MDNS=false
ports:
  # remove the 5353/udp line entirely; nothing inside the container
  # uses that port now
  - "80:80"
  - "443:443"
  - "1883:1883"
```

Restart the container so the env change takes effect.

### Step 2 — Publish the hostnames via host avahi

Verify the helper is installed:

```bash
which avahi-publish-address
# /usr/bin/avahi-publish-address
```

If missing: `sudo apt install avahi-utils` (Debian/Ubuntu) or your
distro's equivalent.

Create two persistent systemd units (substitute your NAS LAN IP):

```bash
sudo tee /etc/systemd/system/opennova-mdns.service > /dev/null <<'EOF'
[Unit]
Description=mDNS A-record alias for OpenNova (opennova.local)
After=avahi-daemon.service network-online.target
Wants=avahi-daemon.service

[Service]
Type=simple
ExecStart=/usr/bin/avahi-publish-address -R opennova.local 192.168.0.247
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/opennova-mdns-legacy.service > /dev/null <<'EOF'
[Unit]
Description=mDNS A-record alias for legacy opennovabot.local
After=avahi-daemon.service network-online.target
Wants=avahi-daemon.service

[Service]
Type=simple
ExecStart=/usr/bin/avahi-publish-address -R opennovabot.local 192.168.0.247
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now opennova-mdns opennova-mdns-legacy
```

Verify both units are running:

```bash
sudo systemctl status opennova-mdns opennova-mdns-legacy --no-pager
```

And that the names resolve from anywhere on the LAN:

```bash
dns-sd -G v4 opennova.local      # macOS
avahi-resolve -n opennova.local  # Linux
```

You should see your NAS IP back in under a second.

### Why this works

The host avahi already owns 5353 — fighting it is wasteful. We hand the
two hostnames to it and disable the container's advertiser. The mower
side doesn't care which process answers the mDNS query, only that
`opennova.local` resolves to a working IP.

`avahi-publish-address -R` keeps the entry alive as long as the
service runs; `Restart=always` makes the unit survive avahi-daemon
restarts (which kick the publishers off).

## Switching a *running* mower to a new server without rebooting

Custom firmware before Phase 2 of this feature lands shipped with a
boot-time discovery script (`set_server_urls.sh`) that respects existing
custom MQTT configs — it logs `MQTT addr KEPT (custom)` and won't
overwrite a non-`mqtt.lfibot.com` host. Useful safety, but it means you
can't trigger the migration just by re-running that script.

The reliable soft-restart procedure (verified live on `LFIN1231000211`,
2026-04-29):

```bash
ssh root@<mower-ip>   # password: novabot

# 1. Rewrite both config files in place
python3 -c "
import json
p = '/userdata/lfi/json_config.json'
d = json.load(open(p))
d['mqtt']['value']['addr'] = '192.168.0.247'   # new server IP
open(p, 'w').write(json.dumps(d, indent=2))
"
printf '%s' '192.168.0.247:80' > /userdata/lfi/http_address.txt

# 2. Kill mqtt_node — mqtt_node_monitor.sh respawns it within ~3s,
#    re-reading the config we just wrote.
kill $(pgrep -f /root/novabot/install/novabot_api/lib/novabot_api/mqtt_node)
```

What happens:

1. `mqtt_node_monitor.sh` (already running as part of `novabot_launch`)
   notices the binary died.
2. It respawns mqtt_node. The new process reads the now-updated
   `json_config.json` and `http_address.txt`.
3. mqtt_node connects to the new broker. Verify with `ss -tnp | grep
   1883` on the mower, or `docker logs opennova | grep CONNECT` on the
   server.

Importantly, **a single `kill` is enough**. The monitor script handles
the respawn cleanly — no need to kill twice or restart
`novabot_launch`. Rebooting the mower is heavier and unnecessary.

The full Phase 2 implementation (the `discovery_loop` in mqtt_node)
removes the manual edit — once a custom firmware build with the loop is
flashed, the mower polls mDNS every 60 s and switches automatically
without any SSH at all.
