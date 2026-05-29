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
const NEEDS_UNDOCK_KEY = 'frame_needs_undock';
const unvalidated = new Set<string>();
// Mowers that are unvalidated AND have not yet left the dock since the flag
// was set. A bundle is usually imported while the mower is parked on the dock,
// so we must NOT treat that pre-existing docked state as a successful
// re-anchor. The flag clears only after the mower undocks (drive-back) and
// then re-docks (auto_recharge), which is the real re-anchor.
const needsUndock = new Set<string>();

export function loadFrameValidationFromDb(): void {
  unvalidated.clear();
  needsUndock.clear();
  for (const row of deviceSettingsRepo.listAll()) {
    if (row.key === KEY && row.value === '1') unvalidated.add(row.sn);
    if (row.key === NEEDS_UNDOCK_KEY && row.value === '1') needsUndock.add(row.sn);
  }
}

export function markFrameUnvalidated(sn: string): void {
  unvalidated.add(sn);
  needsUndock.add(sn);
  deviceSettingsRepo.upsert(sn, KEY, '1');
  deviceSettingsRepo.upsert(sn, NEEDS_UNDOCK_KEY, '1');
}

export function clearFrameUnvalidated(sn: string): void {
  unvalidated.delete(sn);
  needsUndock.delete(sn);
  deviceSettingsRepo.upsert(sn, KEY, '0');
  deviceSettingsRepo.upsert(sn, NEEDS_UNDOCK_KEY, '0');
}

export function isFrameUnvalidated(sn: string): boolean {
  return unvalidated.has(sn);
}

/**
 * Feed the mower's current docked state into the re-anchor lifecycle. Clears
 * the flag only on a genuine re-dock: the mower must first leave the dock
 * (drive-back) and then return (auto_recharge). The docked state present at
 * import time does NOT clear the flag.
 */
export function noteDockState(sn: string, docked: boolean): void {
  if (!unvalidated.has(sn)) return;
  if (!docked) {
    // Mower has left the dock; a subsequent re-dock now counts as the anchor.
    if (needsUndock.has(sn)) {
      needsUndock.delete(sn);
      deviceSettingsRepo.upsert(sn, NEEDS_UNDOCK_KEY, '0');
    }
    return;
  }
  // docked: only a re-dock AFTER an undock validates the frame.
  if (!needsUndock.has(sn)) {
    clearFrameUnvalidated(sn);
  }
}

/**
 * True when an outbound command must be blocked because the frame is
 * unvalidated. Only go_to_charge is dangerous (it navigates the bad frame);
 * auto_recharge (pure ArUco) and go_pile stay allowed. Pure predicate so it
 * is unit-testable without importing the MQTT broker chain.
 */
export function isGoToChargeBlocked(sn: string, command: Record<string, unknown>): boolean {
  return 'go_to_charge' in command && isFrameUnvalidated(sn);
}
