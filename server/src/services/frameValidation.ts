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
const AUTO_RECHARGE_KEY = 'frame_auto_recharge_seen';
const unvalidated = new Set<string>();
// Mowers for which an auto_recharge (pure ArUco dock) command has been issued
// since the flag was set. The flag clears only on a docked report AFTER such a
// command - i.e. the wizard's deliberate re-anchor dock. This prevents stray
// re-docks (e.g. the mower bouncing 1cm off the dock during the backward drive
// and rolling back) from falsely clearing the flag.
const autoRechargeSeen = new Set<string>();

export function loadFrameValidationFromDb(): void {
  unvalidated.clear();
  autoRechargeSeen.clear();
  for (const row of deviceSettingsRepo.listAll()) {
    if (row.key === KEY && row.value === '1') unvalidated.add(row.sn);
    if (row.key === AUTO_RECHARGE_KEY && row.value === '1') autoRechargeSeen.add(row.sn);
  }
}

export function markFrameUnvalidated(sn: string): void {
  unvalidated.add(sn);
  autoRechargeSeen.delete(sn);
  deviceSettingsRepo.upsert(sn, KEY, '1');
  deviceSettingsRepo.upsert(sn, AUTO_RECHARGE_KEY, '0');
}

export function clearFrameUnvalidated(sn: string): void {
  unvalidated.delete(sn);
  autoRechargeSeen.delete(sn);
  deviceSettingsRepo.upsert(sn, KEY, '0');
  deviceSettingsRepo.upsert(sn, AUTO_RECHARGE_KEY, '0');
}

export function isFrameUnvalidated(sn: string): boolean {
  return unvalidated.has(sn);
}

/**
 * Record that an auto_recharge (pure ArUco dock) command was issued for this
 * mower. Only meaningful while unvalidated; arms the clear-on-dock so the next
 * docked report counts as the deliberate re-anchor.
 */
export function noteAutoRecharge(sn: string): void {
  if (!unvalidated.has(sn)) return;
  autoRechargeSeen.add(sn);
  deviceSettingsRepo.upsert(sn, AUTO_RECHARGE_KEY, '1');
}

/**
 * Feed the mower's current docked state into the re-anchor lifecycle. Clears
 * the flag only on a docked report that follows an auto_recharge command (the
 * wizard's deliberate re-anchor). The docked state present at import time, and
 * stray bounces during the backward drive, do NOT clear the flag.
 */
export function noteDockState(sn: string, docked: boolean): void {
  if (!unvalidated.has(sn)) return;
  if (docked && autoRechargeSeen.has(sn)) {
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
