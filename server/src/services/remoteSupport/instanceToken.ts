import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

/** Per-instance long-lived auth credential for the remote support tunnel.
 *  Generated once at first agent start and persisted under
 *  `/data/.rs_token`. Replaces the previous shared `REMOTE_SUPPORT_SECRET`
 *  env var so users don't need to coordinate a secret with Ramon's relay.
 *  The token IS the credential — relay records its sha256 fingerprint at
 *  first connect (TOFU) and verifies matching fingerprints on reconnect.
 */
export function getOrCreateInstanceToken(storagePath: string): string {
  const file = path.resolve(storagePath, '.rs_token');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (/^[0-9a-f]{64}$/.test(existing)) return existing;
  } catch {
    /* fall through to generate */
  }
  const fresh = randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Restrictive perms — the token grants relay access for this SN.
  fs.writeFileSync(file, fresh + '\n', { mode: 0o600 });
  return fresh;
}

/** Token → fingerprint stored by the relay's TOFU table. Plain sha256;
 *  the agent transmits the raw token only over a TLS-terminated WS so
 *  this is purely defence-in-depth in case the DB is read in isolation. */
export function tokenFingerprint(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
