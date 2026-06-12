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
