/**
 * Firmware safety gate — guarantees a fresh map backup before a BETA
 * (custom/opennova) mower firmware flash. See
 * docs/superpowers/specs/2026-06-12-beta-firmware-install-gate-design.md
 */
import { listBackups, createBundleFromDb, type BackupEntry } from './portableBackup.js';
import { mapRepo } from '../db/repositories/index.js';

/** Reuse a backup younger than this; otherwise make a fresh one. */
export const BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Canonical BETA warning copy. Clients mirror this text per-package. */
export const BETA_FIRMWARE_WARNING =
  "⚠️ BETA — Custom firmware. Dit is experimentele software. Het kan je maaier " +
  "onbruikbaar maken (bricken) en AL je kaarten wissen. Er wordt automatisch een " +
  "backup gemaakt, maar installeer alleen als je de risico's accepteert.";

/** True for custom/opennova builds (the BETA firmware we gate). */
export function isBetaFirmware(version: string | null | undefined): boolean {
  if (!version) return false;
  const v = version.toLowerCase();
  return v.includes('custom') || v.includes('opennova');
}

// ── ensureBetaFlashSafe ───────────────────────────────────────────────────────

export type BetaFlashGate =
  | { allowed: true; backup: BackupEntry | null; reason: 'not-beta' | 'recent-backup' | 'backup-created' | 'no-maps' }
  | { allowed: false; error: 'BACKUP_FAILED'; detail: string };

/**
 * True when the mower has at least one work polygon worth protecting.
 * Fails CLOSED: if the DB can't be read we assume maps exist (return true) so
 * the gate blocks rather than risk silently allowing a destructive flash.
 */
export function hasMapsToProtect(sn: string): boolean {
  try {
    return mapRepo.findAllByMowerSnAndType(sn, 'work').some((w: any) => w.map_area);
  } catch (err) {
    console.error(`[firmware-safety] hasMapsToProtect DB error for ${sn}:`, err);
    return true;
  }
}

/** Newest backup for `sn` whose age is within BACKUP_MAX_AGE_MS, else null. */
function recentBackup(sn: string): BackupEntry | null {
  try {
    const newest = listBackups(sn).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!newest) return null;
    return (Date.now() - newest.createdAt) <= BACKUP_MAX_AGE_MS ? newest : null;
  } catch (err) {
    console.error(`[firmware-safety] listBackups error for ${sn}:`, err);
    return null;
  }
}

/** True when a backup ≤BACKUP_MAX_AGE_MS old already exists (filesystem-only, no MQTT). */
export function hasRecentBackup(sn: string): boolean {
  return recentBackup(sn) !== null;
}

/**
 * Synchronous gate for the MQTT broker path, which must NOT block the event
 * loop with an MQTT round-trip. Returns true if a BETA flash may proceed NOW
 * (not beta, or nothing to lose, or a recent backup already exists). When it
 * returns false it has kicked off a background backup (fire-and-forget) so the
 * stock app's next flash attempt will find a fresh backup and go through.
 * We cannot show the stock app a warning, so "deny once + snapshot, retry works"
 * is the safe behavior — maps are never lost.
 */
export function allowBetaFlashOrSnapshot(sn: string, version: string | null | undefined): boolean {
  if (!isBetaFirmware(version)) return true;
  if (!hasMapsToProtect(sn)) return true;   // nothing to lose
  if (hasRecentBackup(sn)) return true;     // already protected
  void createBundleFromDb(sn, 'pre-beta-flash').catch((err) =>
    console.error(`[firmware-safety] background backup failed for ${sn}:`, err));
  return false;
}

/**
 * Guarantee a fresh backup before a BETA mower flash. Stock firmware and
 * chargers should never reach here (callers gate on device type), but stock
 * versions are passed through defensively.
 */
export async function ensureBetaFlashSafe(sn: string, version: string | null | undefined): Promise<BetaFlashGate> {
  if (!isBetaFirmware(version)) return { allowed: true, backup: null, reason: 'not-beta' };

  const recent = recentBackup(sn);
  if (recent) return { allowed: true, backup: recent, reason: 'recent-backup' };

  let created: BackupEntry | null = null;
  try {
    created = await createBundleFromDb(sn, 'pre-beta-flash');
  } catch (err) {
    console.error(`[firmware-safety] createBundleFromDb threw for ${sn}:`, err);
  }
  if (created) return { allowed: true, backup: created, reason: 'backup-created' };

  if (hasMapsToProtect(sn)) {
    return {
      allowed: false,
      error: 'BACKUP_FAILED',
      detail: `Kon geen backup maken voor ${sn} terwijl er kaarten zijn — flash geblokkeerd.`,
    };
  }
  return { allowed: true, backup: null, reason: 'no-maps' };
}
