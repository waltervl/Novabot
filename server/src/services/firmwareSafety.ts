/**
 * Firmware safety gate — guarantees a fresh map backup before a BETA
 * (custom/opennova) mower firmware flash. See
 * docs/superpowers/specs/2026-06-12-beta-firmware-install-gate-design.md
 */
import { listBackups, createBackup, type BackupEntry } from './portableBackup.js';
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

/** True when the mower has at least one work polygon worth protecting. */
export function hasMapsToProtect(sn: string): boolean {
  try {
    return mapRepo.findAllByMowerSnAndType(sn, 'work').some((w: any) => w.map_area);
  } catch {
    return false;
  }
}

/** Newest backup for `sn` whose age is within BACKUP_MAX_AGE_MS, else null. */
function recentBackup(sn: string): BackupEntry | null {
  const newest = listBackups(sn).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!newest) return null;
  return (Date.now() - newest.createdAt) <= BACKUP_MAX_AGE_MS ? newest : null;
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

  const created = await createBackup(sn, 'pre-beta-flash');
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
