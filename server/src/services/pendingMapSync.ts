/**
 * Pending map-sync flag.
 *
 * When a cloud import (or any server-side map import) builds a bundle for a
 * mower that is not online yet, we cannot push the map immediately. We mark a
 * pending flag here; `onMowerConnected` reads it and runs the sync_map push as
 * soon as the mower connects, then clears it. Backed by device_settings so it
 * survives a container restart.
 */
import { deviceSettingsRepo } from '../db/repositories/index.js';

const KEY = 'pending_map_sync';

export function markPendingMapSync(sn: string): void {
  deviceSettingsRepo.upsert(sn, KEY, '1');
}

export function clearPendingMapSync(sn: string): void {
  deviceSettingsRepo.upsert(sn, KEY, '0');
}

export function hasPendingMapSync(sn: string): boolean {
  return deviceSettingsRepo.findBySn(sn).some((r) => r.key === KEY && r.value === '1');
}
