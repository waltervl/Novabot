/**
 * External-only auth gate.
 *
 * The server is reachable from the public internet (opennova.ramonvanbruggen.nl
 * → NGINX proxy → this container). The dashboard API, the dashboard socket and
 * the /api/admin router historically ran with no auth so the Expo app and the
 * bootstrap provisioning wizard — both on the LAN/VPN — could use them without
 * a token.
 *
 * This gate keeps that behaviour for LAN/VPN traffic but requires a valid JWT
 * for requests that arrive from a public address. The real client IP is taken
 * from the RIGHTMOST X-Forwarded-For entry (the one our own reverse proxy
 * appends — a client cannot forge it because the proxy always adds its own peer
 * IP after whatever the client sent) and falls back to the raw socket peer when
 * no proxy header is present (direct LAN hit). When the IP is private/loopback
 * the request passes through untouched; otherwise it must satisfy
 * `authMiddleware`.
 *
 * Notes / threat model:
 *  - Assumes external traffic arrives via the reverse proxy, which sets
 *    X-Forwarded-For. A direct port-forward of the container port bypasses the
 *    proxy and, under Docker source-NAT, would look internal — that path is out
 *    of scope (the documented exposure is the proxied domain).
 *  - Fails CLOSED: an unrecognised / unparseable source IP is treated as
 *    external (auth required).
 *  - Mode (DASHBOARD_PUBLIC_AUTH):
 *      unset / other → external-only (default): internal passes, external needs JWT
 *      "off"         → gate disabled entirely (legacy no-auth behaviour)
 *      "all"         → require a JWT for everyone (also useful to test the login
 *                      flow locally, where every request is internal)
 *  - Extra trusted source prefixes (e.g. a Tailscale 100.x range) can be added
 *    via DASHBOARD_TRUSTED_IP_PREFIXES (comma-separated, matched by prefix).
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/index.js';
import { authMiddleware } from './auth.js';

/** Strip an IPv4-mapped IPv6 prefix and normalise casing/whitespace. */
export function normalizeIp(raw: string | undefined | null): string {
  let s = (raw ?? '').trim().toLowerCase();
  if (s.startsWith('::ffff:')) s = s.slice(7);
  // Some stacks wrap IPv6 in brackets ("[::1]") — drop them.
  if (s.startsWith('[') && s.includes(']')) s = s.slice(1, s.indexOf(']'));
  return s;
}

function extraTrustedPrefixes(): string[] {
  const raw = process.env.DASHBOARD_TRUSTED_IP_PREFIXES;
  if (!raw) return [];
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * True when `raw` is a loopback / private / link-local / unique-local address,
 * or matches one of the operator-configured trusted prefixes. Everything else
 * (public IPv4/IPv6, empty, unparseable) is treated as NOT internal.
 */
export function isInternalIp(raw: string | undefined | null): boolean {
  const ip = normalizeIp(raw);
  if (!ip) return false;

  for (const p of extraTrustedPrefixes()) {
    if (ip.startsWith(p)) return true;
  }

  // Loopback
  if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('127.')) return true;

  // IPv6 link-local (fe80::/10) and unique-local (fc00::/7 → fc.. / fd..)
  if (ip.startsWith('fe80') || ip.startsWith('fc') || ip.startsWith('fd')) return true;

  // IPv4 ranges
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if ([a, b, Number(m[3]), Number(m[4])].some(n => n > 255)) return false;
  if (a === 10) return true;                          // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
  if (a === 192 && b === 168) return true;            // 192.168.0.0/16 (incl. WireGuard 192.168.3.0/24)
  if (a === 169 && b === 254) return true;            // 169.254.0.0/16 link-local
  return false;
}

/**
 * Resolve the IP we hold the request accountable for. Prefer the RIGHTMOST
 * X-Forwarded-For entry (appended by our trusted reverse proxy), else the raw
 * socket peer. Returning the rightmost entry — not the leftmost — is what makes
 * this spoof-resistant: a client can prepend fake XFF values but cannot control
 * the final hop the proxy adds.
 */
export function pickGateClientIp(
  xff: string | string[] | undefined,
  remoteAddress: string | undefined | null,
): string {
  if (xff) {
    const joined = Array.isArray(xff) ? xff.join(',') : xff;
    const parts = joined.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return remoteAddress ?? '';
}

export type AuthGateMode = 'off' | 'all' | 'external';

/** Resolve the gate mode from env. */
export function authGateMode(): AuthGateMode {
  const v = (process.env.DASHBOARD_PUBLIC_AUTH || '').trim().toLowerCase();
  if (v === 'off') return 'off';
  if (v === 'all') return 'all';
  return 'external';
}

/**
 * Decide whether a request from `ip` may skip authentication. Internal
 * (LAN/VPN) traffic skips it in the default external-only mode; in "all" mode
 * nothing skips; in "off" mode everything skips. Shared by the HTTP middleware
 * and the socket handshake gate.
 */
export function gateAllowsWithoutAuth(ip: string): boolean {
  const mode = authGateMode();
  if (mode === 'off') return true;
  if (mode === 'all') return false;
  return isInternalIp(ip);
}

/**
 * Express middleware: pass internal traffic through, require a valid JWT for
 * external traffic. Reuses `authMiddleware` for the actual token check so the
 * "authMiddleware only, no roles" decision holds (any logged-in user passes).
 */
export function externalAuthGate(req: AuthRequest, res: Response, next: NextFunction): void {
  const ip = pickGateClientIp(req.headers['x-forwarded-for'], req.socket?.remoteAddress);
  if (gateAllowsWithoutAuth(ip)) { next(); return; }

  if (process.env.AUTH_DEBUG === '1') {
    console.log(`[AUTH-GATE] ${req.method} ${req.originalUrl} from ${normalizeIp(ip) || '(unknown)'} — JWT required`);
  }
  authMiddleware(req, res, next);
}
