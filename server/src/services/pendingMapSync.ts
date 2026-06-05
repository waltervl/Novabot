/**
 * Pending map-sync flag.
 *
 * When a cloud import (or any server-side map import) builds a bundle for a
 * mower that is not online yet, we cannot push the map immediately. We mark a
 * pending flag here; `onMowerConnected` reads it and runs the apply-verbatim
 * push as soon as the mower connects, then clears it. Backed by device_settings
 * so it survives a container restart.
 *
 * The flag value stores the EXACT bundle filename to push, so the deferred
 * re-push targets the freshly imported bundle instead of falling back to the
 * newest existing backup (which could be a stale, unrelated map for the same
 * SN). Marking without a filename stores the legacy flag '1'; `getPendingMapSync`
 * then returns undefined and the caller may fall back to the newest backup.
 */
import { deviceSettingsRepo } from '../db/repositories/index.js';

const KEY = 'pending_map_sync';
const NONE = '0';
const LEGACY_FLAG = '1';

function isPendingValue(value: string | null | undefined): boolean {
  return value != null && value !== '' && value !== NONE;
}

export function markPendingMapSync(sn: string, filename?: string): void {
  deviceSettingsRepo.upsert(sn, KEY, filename && filename.length > 0 ? filename : LEGACY_FLAG);
}

export function clearPendingMapSync(sn: string): void {
  deviceSettingsRepo.upsert(sn, KEY, NONE);
}

export function hasPendingMapSync(sn: string): boolean {
  return deviceSettingsRepo.findBySn(sn).some((r) => r.key === KEY && isPendingValue(r.value));
}

/**
 * The bundle filename remembered for a pending push, or undefined when nothing
 * is pending or it was marked the legacy way (value '1'). A legacy/undefined
 * result lets the caller fall back to the newest backup.
 */
export function getPendingMapSync(sn: string): string | undefined {
  const row = deviceSettingsRepo.findBySn(sn).find((r) => r.key === KEY);
  if (!row || !isPendingValue(row.value) || row.value === LEGACY_FLAG) return undefined;
  return row.value;
}
