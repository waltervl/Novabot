/**
 * Remote support TOFU (trust-on-first-use) identity registry.
 *
 * Each agent generates a random token at first boot (persisted to
 * `/data/.rs_token`). On its first WebSocket connect the relay stores
 * `(sn, sha256(token))`. Subsequent connects must present a token whose
 * fingerprint matches the stored one — otherwise we assume the SN is
 * being impersonated and reject the upgrade.
 *
 * This replaces the previous shared-secret HMAC scheme so users no
 * longer need to set `REMOTE_SUPPORT_SECRET` in their docker env.
 */
import { db } from '../database.js';

export type VerifyVerdict =
  | { ok: true; firstSeen: boolean }
  | { ok: false; reason: 'mismatch' };

class RemoteSupportIdentitiesRepository {
  private _find = db.prepare(
    'SELECT token_fp FROM remote_support_identities WHERE sn = ?'
  );

  private _insert = db.prepare(
    'INSERT INTO remote_support_identities (sn, token_fp, first_seen) VALUES (?, ?, ?)'
  );

  private _deleteBySn = db.prepare(
    'DELETE FROM remote_support_identities WHERE sn = ?'
  );

  /** Verify or register the (sn, fingerprint) pair. New SN → store and
   *  accept. Known SN with matching fingerprint → accept. Known SN with
   *  different fingerprint → reject; an operator must `reset(sn)` if the
   *  user legitimately re-generated their token. */
  verifyOrRegister(sn: string, fingerprint: string): VerifyVerdict {
    const row = this._find.get(sn) as { token_fp: string } | undefined;
    if (!row) {
      this._insert.run(sn, fingerprint, Date.now());
      return { ok: true, firstSeen: true };
    }
    if (row.token_fp !== fingerprint) {
      return { ok: false, reason: 'mismatch' };
    }
    return { ok: true, firstSeen: false };
  }

  /** Drop the stored fingerprint for an SN. Used when a user has
   *  re-generated their instance token (rare) and an admin needs to
   *  re-pair the agent. */
  reset(sn: string): void {
    this._deleteBySn.run(sn);
  }
}

export const remoteSupportIdentitiesRepo = new RemoteSupportIdentitiesRepository();
