import { createHmac, timingSafeEqual } from 'node:crypto';

/** Tokens look like `<sn>.<expiresUnixSec>.<base64url-hmac>` and are
 *  signed with REMOTE_SUPPORT_SECRET. The agent embeds its token in the
 *  Authorization header when it dials the relay; the relay re-derives
 *  the HMAC with its own copy of the secret and refuses to register the
 *  agent unless the signature matches and the timestamp is still in the
 *  future. The SN is part of the signed payload so a token issued for
 *  one mower can't be reused to impersonate another. */
const DEFAULT_TTL_SEC = 60 * 60 * 24; // 24h — agent reconnect window.

function hmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signAgentToken(
  sn: string,
  secret: string,
  expiresAtSec = Math.floor(Date.now() / 1000) + DEFAULT_TTL_SEC,
): string {
  const payload = `${sn}.${expiresAtSec}`;
  return `${payload}.${hmac(payload, secret)}`;
}

export type VerifyResult = { ok: true; sn: string } | { ok: false; reason: string };

export function verifyAgentToken(token: string, secret: string): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [sn, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return { ok: false, reason: 'bad-exp' };
  if (exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };
  const expected = hmac(`${sn}.${expStr}`, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad-signature' };
  }
  return { ok: true, sn };
}
