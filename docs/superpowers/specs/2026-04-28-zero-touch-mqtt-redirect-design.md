# Zero-touch MQTT redirect via mDNS — Design

**Date**: 2026-04-28
**Status**: Approved (Ramon, 2026-04-28)
**Scope**: OpenNova server (Docker) + custom-firmware mower (`mqtt_node` Python wrapper).
Stock firmware is out of scope — DNS rewrite of `*.lfibot.com` remains the supported path
for stock devices.

## Problem

Today, redirecting a custom-firmware mower to a different OpenNova server (e.g. laptop →
NAS migration) requires one of:

- **DNS rewrite** of `mqtt.lfibot.com` at the network level — works, but assumes the user
  controls a DNS server (Pi-hole, AdGuard, router-with-overrides) and is willing to edit it.
- **BLE re-provisioning** via the bootstrap wizard — works, but interactive, requires
  Bluetooth proximity, and is overkill for "just point at the new IP".
- **SSH + manual edit** of `/userdata/lfi/json_config.json` — works, but breaks the
  "no SSH for management" promise OpenNova ships with.

We want a fourth path: the mower auto-discovers the OpenNova server on the LAN and points
its MQTT client at it. No DNS configuration, no BLE pairing, no SSH. The user installs
OpenNova on a new host (laptop, NAS, Pi), the mower reconnects within a polling interval,
and the migration is invisible.

The mower's existing `set_server_urls.sh` (custom firmware ≥ custom-16) already does an
mDNS lookup for `opennovabot.local` at boot — but no OpenNova build broadcasts that
hostname today, so the lookup always falls through to DNS / last-known-IP / hardcoded
fallback. The fix is in two phases.

## Phase 1 — Server-side mDNS broadcaster (boot-time discovery)

### What it does

The OpenNova server process advertises itself on the local network under **both**
hostnames so existing and future mower firmware can find it:

- `opennovabot.local` (legacy — already queried by `set_server_urls.sh` custom-16+)
- `opennova.local` (new short name — preferred going forward)

Both records resolve to the host IP picked up from `TARGET_IP` (or the first non-loopback
interface IP when `TARGET_IP` is unset).

### How it works

A new module `server/src/services/mdnsAdvertiser.ts` uses the existing
`multicast-dns` Node dependency to:

1. On startup, register a responder that answers `A` queries for both hostnames with
   the configured IP.
2. On each `query` event, validate the question type matches and reply.
3. On shutdown, unregister gracefully.

The advertiser is started from `server/src/index.ts` after the express server starts,
guarded by an env flag `ENABLE_MDNS` (default `true` — opt-out, not opt-in).

### Why this approach over alternatives

- **`avahi-daemon` in the container** would work but requires `--network host` or
  forwarding port `5353/udp` and adds a system service. Portability across host OSes
  drops.
- **`dnsmasq` A-record** requires `ENABLE_DNS=true` which not every user enables. Mixing
  the two responsibilities (rewrite + advertise) couples concerns.
- **Native `multicast-dns` lib** runs in the same Node process, ships with the existing
  dependency tree, and lifecycle is bound to the server process. Picked.

### Failure modes

- **Multiple OpenNova instances on the same LAN** would both answer the query. The first
  reply wins from the mower's perspective; this is racy. Document as a known
  limitation; users running two OpenNova boxes intentionally must use DNS rewrite to
  pick a winner.
- **Container without host networking** can't reach `224.0.0.251:5353` by default. The
  advertiser will start but no LAN traffic gets in or out. Documented as a prereq —
  Docker compose must use `network_mode: host` or expose `5353/udp` for mDNS to work.
- **IPv6 address binding** — only IPv4 advertised. Mower firmware is IPv4-only.

### Discoverability beyond the A record

Phase 1 ships only `A` records. We deliberately do **not** add SRV / TXT records yet —
the mower's `set_server_urls.sh` only does an A lookup, so no consumer benefits today.
A future phase could add `_opennova._tcp.local` SRV for service discovery clients.

## Phase 2 — Mower-side runtime switch (live re-discovery)

### What it does

`mqtt_node` (custom firmware Python wrapper) gets a background task that periodically
re-runs the same mDNS lookup `set_server_urls.sh` does at boot. When the resolved IP
differs from the IP currently in `json_config.json` for two consecutive polls, the
wrapper:

1. Atomically rewrites `/userdata/lfi/json_config.json` with the new MQTT host.
2. Updates `/userdata/lfi/http_address.txt` with the new HTTP host.
3. Drops the existing MQTT connection.
4. Re-reads config and reconnects to the new broker.

No reboot. No SSH. The user's only action is installing OpenNova on the new host.

### Polling behaviour

- **Interval**: 60 s. Trade-off between migration latency and network load. At ~50 bytes
  per query and ~50 bytes per reply, the steady-state cost is negligible.
- **Debounce**: 2 consecutive polls must agree on the new IP before triggering a
  switch. Single-poll flapping (e.g. one OpenNova restarting during port-pause) does
  not move the mower.
- **Trigger**: only on IP change. A successful query that matches the current config is
  a no-op.

### Migration event emission

After a successful switch, mqtt_node publishes one event to the new broker as soon as
it connects:

```
Topic: novabot/events/<SN>/server_migrated
Payload: { "from_ip": "<old>", "to_ip": "<new>", "ts": <unix-ms> }
```

This goes through the standard event-publishing path so it surfaces in:

- Dashboard event log
- HA `novabot/events/<SN>` MQTT integration
- ntfy push (if configured)
- HTTP polling at `GET /api/events/<SN>`

Audit-trail without extra plumbing.

### Failure modes

- **Network partition during switch**: the rewrite is atomic (`write tmp + rename`).
  Power-loss between rewrite and reconnect leaves a valid config pointing at the new
  broker; next boot tries the new IP, falls back via existing chain if unreachable.
- **mDNS query times out**: skip the cycle, retry next interval. Don't touch config.
- **New IP unreachable**: standard MQTT reconnect backoff applies. After N failures the
  background task could fall back to the previous IP — but that's complexity for a
  rare case; document a manual recovery via `set_server_urls.sh` instead.

## Configuration knobs

Server side:

| Env var | Default | Purpose |
|---------|---------|---------|
| `ENABLE_MDNS` | `true` | Set `false` to disable advertiser |
| `MDNS_HOSTNAMES` | `opennova.local,opennovabot.local` | Comma-separated list |
| `MDNS_TTL` | `120` | Record TTL in seconds |

Mower side (`/userdata/lfi/json_config.json` extension):

| Field | Default | Purpose |
|-------|---------|---------|
| `mqtt.discovery.enabled` | `true` | Master toggle for runtime re-discovery |
| `mqtt.discovery.interval_s` | `60` | Polling interval |
| `mqtt.discovery.debounce` | `2` | Consecutive matching polls before switch |

## Testing plan

Phase 1:

- Unit test: advertiser responds to A query for both hostnames with the configured IP.
- Integration test: spin up the server, run `dig @224.0.0.251 -p 5353 opennova.local`
  from a sibling container, expect the IP back.
- Live test: run OpenNova on laptop, run `avahi-resolve -n opennova.local` from a
  Linux host on the same LAN, expect the laptop IP.

Phase 2:

- Unit test: discovery loop changes IP only after 2 consecutive matching polls.
- Unit test: discovery loop never writes config when the resolved IP equals the current
  one.
- Unit test: atomic write semantics (kill mid-write, config remains valid).
- Integration test (manual): run OpenNova on laptop, mow connects. Stop laptop OpenNova,
  start OpenNova on NAS with same `TARGET_IP`. Mower should reconnect within
  `2 * interval_s + reconnect_backoff` (≤ ~3 min).

## Documentation deliverable

A new guide at `docs/guide/auto-discovery.md` covering:

- What zero-touch migration is and when to use it
- Network requirements (mDNS multicast must work on the LAN — usually fine, but VLAN
  bridges may strip)
- How to migrate laptop → NAS in practice (install OpenNova on NAS, leave AdGuard /
  router DNS alone, mower follows automatically)
- Troubleshooting:
  - Why `avahi-resolve opennova.local` should work from any LAN host
  - What to do if mDNS is blocked (fall back to DNS rewrite as before)
  - How to verify the mower picked up the new IP (`/api/dashboard/raw-tcp/<sn>`
    health check, or check server log for new MQTT connection)

## Out of scope

- Stock firmware: continues to use DNS rewrite. Stock has no `set_server_urls.sh`,
  no SSH, and no auto-discovery path. Scope-creep risk: do not add custom-firmware
  features to stock.
- Multi-server failover: a mower can only point at one server at a time. We do not add
  primary/secondary lists.
- IPv6: not supported on either side; defer until mower firmware adds IPv6.
- Service-type SRV records: only `A` records in this iteration.

## Migration plan from existing custom firmware

Existing custom-X mowers already query `opennovabot.local` at boot via
`set_server_urls.sh`. After Phase 1 ships, those mowers will start finding the server on
boot — no firmware update required. They keep using the boot-time path until their
firmware is rebuilt with Phase 2's discovery loop.

The next custom firmware build adds:

1. The Phase 2 discovery loop in `mqtt_node` Python wrapper.
2. The new `mqtt.discovery.*` config fields in `json_config.json` template.
3. Bumped `set_server_urls.sh` to also try `opennova.local` alongside `opennovabot.local`.
