/**
 * Per-mower "frame unvalidated" state. Set when a map bundle is restored
 * (the stored map frame is not yet anchored to the real charger), cleared
 * only when the mower reports docked/charging (a successful auto_recharge
 * dock rewrites pos.json and re-anchors the frame). While set, go_to_charge
 * is hard-blocked in publishToDevice because navigating the bad frame can
 * drive the mower anywhere. Backed by device_settings so a server restart
 * does not silently unlock go_to_charge.
 */
import { deviceSettingsRepo } from '../db/repositories/deviceSettings.js';

const KEY = 'frame_unvalidated';
const unvalidated = new Set<string>();

export function loadFrameValidationFromDb(): void {
  unvalidated.clear();
  for (const row of deviceSettingsRepo.listAll()) {
    if (row.key === KEY && row.value === '1') unvalidated.add(row.sn);
  }
}

export function markFrameUnvalidated(sn: string): void {
  unvalidated.add(sn);
  deviceSettingsRepo.upsert(sn, KEY, '1');
}

export function clearFrameUnvalidated(sn: string): void {
  unvalidated.delete(sn);
  deviceSettingsRepo.upsert(sn, KEY, '0');
}

export function isFrameUnvalidated(sn: string): boolean {
  return unvalidated.has(sn);
}
