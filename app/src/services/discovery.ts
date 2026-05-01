/**
 * Discover OpenNova servers on the local network.
 *
 * Strategy ladder (each fires onFound as soon as it confirms a server):
 *   1. Hostname resolve — try opennova.local and opennovabot.local. iOS/macOS
 *      resolve .local via mDNSResponder; Android with NSD does too. Fast,
 *      no native deps.
 *   2. (skipped — no UDP socket dep available in current bundle)
 *   3. Subnet probe fallback — common subnets + a wider host suffix list.
 */

export interface DiscoveredServer {
  /**
   * Best-effort identifier the device should use to reach the server.
   * For hostname-based finds this is e.g. `opennova.local`; for IP-based
   * sweeps it's the dotted-quad. Stored verbatim so future requests reuse
   * whatever the device proved it can resolve.
   */
  ip: string;
  /**
   * The non-loopback LAN IP reported by the server's health endpoint, when
   * available. UI shows this next to the hostname so the user can tell two
   * `opennova.local` candidates apart on a multi-homed network.
   */
  lanIp?: string | null;
}

const PROBE_TIMEOUT = 2000;

const HOSTNAMES = ['opennova.local', 'opennovabot.local'];

const SUBNETS = ['192.168.0', '192.168.1', '192.168.2', '192.168.178', '10.0.0', '10.0.1'];

// Wider sweep — covers Mac DHCP-assigned ranges (.200-.230 typical for
// dynamic leases on consumer routers).
const HOST_IPS = [
  1, 2, 3, 4, 5, 10, 20, 30, 50,
  90, 100, 110, 120, 150, 177, 200,
  210, 220, 222, 230, 240, 247, 250, 254,
];

/**
 * Probe a single URL. Returns the best-effort identifier for the server
 * (LAN IP when available, or fallbackHost when the serverIp in the response
 * looks like a Docker-internal/container address).
 *
 * fallbackHost should be:
 *   - the .local hostname when probing by hostname (device can already
 *     resolve it so storing the hostname lets future requests skip IP-pinning)
 *   - the IP itself when probing by IP
 */
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
    // Docker bridge networks live in 172.17-21; treat those as
    // unreachable-from-LAN so the LAN-IP shown next to the hostname is
    // correct (or null when only Docker IP is known).
    const lanIp =
      reported && /^192\.168\.|^10\.\d{1,3}\./.test(reported) ? reported : null;

    const urlHost = new URL(url).hostname;
    const isIpProbe = /^\d+\.\d+\.\d+\.\d+$/.test(urlHost);

    if (isIpProbe) {
      // Probed by IP — that IP IS the LAN address.
      return { id: urlHost, lanIp: urlHost };
    }
    // Probed by hostname (.local) — keep hostname as the id, expose the
    // LAN IP separately for the UI.
    return { id: fallbackHost, lanIp };
  } catch {
    return null;
  }
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

  // 1. Hostname resolve — fast path. Race both hostnames in parallel.
  await Promise.all(
    HOSTNAMES.map(async (host) => {
      const result = await probeUrl(`http://${host}/api/setup/health`, host);
      if (result) fire(result);
    }),
  );

  // If we already found something, don't bother sweeping the subnets.
  if (found.size > 0) return;

  // 3. Subnet probe fallback.
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
      batch.map(async (ip) => {
        const result = await probeUrl(`http://${ip}/api/setup/health`, ip);
        if (result) fire(result);
      }),
    );
  }
}
