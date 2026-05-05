/**
 * Discover OpenNova servers on the local network.
 *
 * Strategy ladder (each fires onFound as soon as it confirms a server):
 *   1. mDNS Bonjour / NSD via react-native-zeroconf — looks for the
 *      `_opennova-http._tcp` service the server advertises (services/
 *      mdnsAdvertiser.ts). Returns host + port directly so we never have
 *      to hardcode HTTP ports.
 *   2. Hostname resolve fallback — try opennova.local / opennovabot.local
 *      on a small set of common HTTP ports. Used when zeroconf fails
 *      (Wi-Fi without multicast, missing entitlements on iOS, etc.).
 *   3. Subnet probe fallback — last resort, sweeps known LAN ranges.
 */

import Zeroconf from 'react-native-zeroconf';

export interface DiscoveredServer {
  /** `host:port` (or just `host` if HTTP default 80) the device should
   *  use to reach the server. The LoginScreen prefixes `http://`. */
  ip: string;
  /** Optional non-loopback LAN IP reported by the server's health
   *  endpoint, shown next to the hostname so the user can disambiguate. */
  lanIp?: string | null;
}

const PROBE_TIMEOUT = 2000;
const ZEROCONF_TIMEOUT = 4000;

const HOSTNAMES = ['opennova.local', 'opennovabot.local'];

// Hostname-fallback ports. Used only when zeroconf produced nothing.
// These cover the common operator setups (80 stand-alone, 8080 NAS,
// 3000 dev). Rare custom ports still work via the manual URL field.
const FALLBACK_PORTS = [80, 8080, 3000];

const SUBNETS = ['192.168.0', '192.168.1', '192.168.2', '192.168.178', '10.0.0', '10.0.1'];
const HOST_IPS = [
  1, 2, 3, 4, 5, 10, 20, 30, 50,
  90, 100, 110, 120, 150, 177, 200,
  210, 220, 222, 230, 240, 247, 250, 254,
];

function hostWithPort(host: string, port: number): string {
  return port === 80 ? host : `${host}:${port}`;
}

async function probeUrl(url: string, fallbackHost: string): Promise<{ id: string; lanIp: string | null } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = (await res.json()) as { server?: string; serverIp?: string } | null;
    if (body?.server !== 'running') return null;

    const reported = body.serverIp ?? null;
    const lanIp =
      reported && /^192\.168\.|^10\.\d{1,3}\./.test(reported) ? reported : null;

    const parsed = new URL(url);
    const urlHost = parsed.hostname;
    const port = parsed.port ? parseInt(parsed.port, 10) : 80;
    const idHost = hostWithPort(urlHost, port);
    const isIpProbe = /^\d+\.\d+\.\d+\.\d+$/.test(urlHost);

    if (isIpProbe) return { id: idHost, lanIp: urlHost };
    return { id: hostWithPort(fallbackHost, port), lanIp };
  } catch {
    return null;
  }
}

/**
 * Run a one-shot Bonjour / NSD scan for `_opennova-http._tcp` and verify
 * each candidate via /api/setup/health. Resolves with the count of unique
 * servers fired so the caller can decide whether to also kick off the
 * fallback HTTP sweeps.
 */
async function discoverViaZeroconf(
  fire: (entry: { id: string; lanIp: string | null }) => void,
): Promise<number> {
  return new Promise((resolve) => {
    let firedCount = 0;
    let stopped = false;
    let zc: Zeroconf | null = null;
    try {
      zc = new Zeroconf();
    } catch {
      resolve(0);
      return;
    }

    const stop = () => {
      if (stopped) return;
      stopped = true;
      try { zc?.stop(); } catch { /* ignore */ }
      try { zc?.removeDeviceListeners(); } catch { /* ignore */ }
      resolve(firedCount);
    };

    // resolved fires once the SRV + A records are joined into a single
    // record with `host` + `port` populated. `found` fires earlier with
    // just the service name and is not actionable yet.
    zc.on('resolved', async (service: { host?: string; port?: number; name?: string }) => {
      const host = service.host ?? service.name ?? null;
      const port = service.port ?? null;
      if (!host || !port) return;
      // Confirm the service is actually our server by hitting the same
      // health endpoint we use elsewhere — guards against unrelated
      // services that happen to use the same advertisement name.
      const cleanHost = host.replace(/\.$/, '');
      const result = await probeUrl(`http://${hostWithPort(cleanHost, port)}/api/setup/health`, cleanHost);
      if (result) {
        firedCount++;
        fire(result);
      }
    });
    zc.on('error', () => { /* swallow — fall back to HTTP sweep */ });

    try {
      zc.scan('opennova-http', 'tcp', 'local.');
    } catch {
      stop();
      return;
    }
    setTimeout(stop, ZEROCONF_TIMEOUT);
  });
}

export async function discoverServers(
  onFound: (server: DiscoveredServer) => void,
): Promise<void> {
  const found = new Set<string>();
  const fire = (entry: { id: string; lanIp: string | null }) => {
    if (!found.has(entry.id)) {
      found.add(entry.id);
      onFound({ ip: entry.id, lanIp: entry.lanIp });
    }
  };

  // 1. mDNS service discovery — port-agnostic, works for any operator
  // who runs the OpenNova server on any port.
  await discoverViaZeroconf(fire);
  if (found.size > 0) return;

  // 2. Hostname fallback — when multicast is blocked or Bonjour
  // entitlement is missing, race both hostnames × the common ports.
  await Promise.all(
    HOSTNAMES.flatMap((host) =>
      FALLBACK_PORTS.map(async (port) => {
        const result = await probeUrl(`http://${hostWithPort(host, port)}/api/setup/health`, host);
        if (result) fire(result);
      }),
    ),
  );
  if (found.size > 0) return;

  // 3. Subnet probe — last-resort sweep.
  const candidates = new Set<string>();
  for (const subnet of SUBNETS) {
    for (const host of HOST_IPS) {
      candidates.add(`${subnet}.${host}`);
    }
  }

  const all = Array.from(candidates);
  const batchSize = 20;
  for (let i = 0; i < all.length; i += batchSize) {
    const batch = all.slice(i, i + batchSize);
    await Promise.all(
      batch.flatMap((ip) =>
        FALLBACK_PORTS.map(async (port) => {
          const result = await probeUrl(`http://${hostWithPort(ip, port)}/api/setup/health`, ip);
          if (result) fire(result);
        }),
      ),
    );
  }
}
