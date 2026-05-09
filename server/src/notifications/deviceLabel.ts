/**
 * Friendly label resolver for notification channels — small standalone
 * helper so dispatcher.ts and expoPush.ts can share it without forming
 * a cyclic import.
 */
import { equipmentRepo } from '../db/repositories/equipment.js';

/**
 * Returns the user-set nickname for a device SN, falling back to the
 * SN itself when no nickname is set or the lookup throws. Used in ntfy
 * banners and push notification titles so a household with multiple
 * mowers can tell which one fired the event at a glance.
 */
export function getDeviceLabel(sn: string): string {
  try {
    const eq = equipmentRepo.findBySn(sn);
    const nick = eq?.equipment_nick_name?.trim();
    if (nick) return nick;
  } catch { /* ignore lookup failures — fall through to SN */ }
  return sn;
}
