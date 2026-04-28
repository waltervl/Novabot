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
import type { Answer } from 'dns-packet';

const TAG = '[MDNS]';

interface AdvertiserOptions {
  ip: string;
  hostnames: string[];
  ttl: number;
  port: number;
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
  const port = opts?.port ?? parseInt(process.env.MDNS_PORT ?? '5353', 10);

  active = { ip, hostnames, ttl, port };
  socket = mdns({ port });

  socket.on('query', (query, rinfo) => {
    const answers: Answer[] = [];
    for (const q of query.questions ?? []) {
      // RFC 6762 §6: type 'ANY' (255) means "all records".
      // @types/multicast-dns narrows RecordType — cast for ANY/wildcard match
      const wantsAny = (q.type as string) === 'ANY';
      if ((q.type === 'A' || wantsAny) && active!.hostnames.includes(q.name)) {
        answers.push({ name: q.name, type: 'A', ttl: active!.ttl, data: active!.ip });
      }
    }
    if (answers.length > 0) {
      // RFC 6762 §6.7: legacy unicast queries (source port != 5353) get a
      // unicast reply to the source rinfo. This also handles tests where the
      // client uses an ephemeral port and is not joined to the multicast group.
      const isLegacyUnicast = rinfo && rinfo.port !== 5353;
      if (isLegacyUnicast) {
        socket!.respond({ answers }, { address: rinfo.address, port: rinfo.port });
      } else {
        socket!.respond({ answers });
      }
    }
  });

  console.log(`${TAG} advertising ${hostnames.join(', ')} → ${ip} (ttl=${ttl}s, port=${port})`);
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
