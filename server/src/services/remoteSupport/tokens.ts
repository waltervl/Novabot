/** Wire format for the remote-support agent → relay credential.
 *
 *  Old design: HMAC-signed token `sn.exp.hmac` with a shared secret on
 *  both sides. Required users to set `REMOTE_SUPPORT_SECRET` matching
 *  Ramon's central instance — not friendly.
 *
 *  New design: agent sends its raw 32-byte hex `instanceToken` together
 *  with its SN as query params. The relay validates via TOFU
 *  (`remoteSupportIdentitiesRepo`): first connect for an SN stores
 *  sha256(token), subsequent connects must match. No shared secret. */

export interface AgentCredential {
  sn: string;
  instanceToken: string;
}

export function encodeAgentQuery(cred: AgentCredential): string {
  const sn = encodeURIComponent(cred.sn);
  const token = encodeURIComponent(cred.instanceToken);
  return `sn=${sn}&token=${token}`;
}

export type ParseResult =
  | { ok: true; cred: AgentCredential }
  | { ok: false; reason: 'missing-sn' | 'missing-token' | 'malformed-token' };

/** Parse `?sn=...&token=...` query params from an upgrade request URL.
 *  Validates the token is a 64-char hex string (matches the format
 *  `getOrCreateInstanceToken` writes) — anything else is rejected before
 *  it can reach the TOFU table. */
export function parseAgentQuery(rawUrl: string): ParseResult {
  let params: URLSearchParams;
  try {
    params = new URL(rawUrl, 'http://localhost').searchParams;
  } catch {
    return { ok: false, reason: 'missing-sn' };
  }
  const sn = params.get('sn');
  const token = params.get('token');
  if (!sn) return { ok: false, reason: 'missing-sn' };
  if (!token) return { ok: false, reason: 'missing-token' };
  if (!/^[0-9a-f]{64}$/.test(token)) {
    return { ok: false, reason: 'malformed-token' };
  }
  return { ok: true, cred: { sn, instanceToken: token } };
}
