/**
 * robot_messages channel — every MowerEvent is also written to the
 * `robot_messages` SQLite table so the stock Novabot v2.4.0 app sees
 * OpenNova-detected events in its Messages tab on the next poll of
 * `POST /api/novabot-message/message/queryRobotMsgPageByUserId`.
 *
 * This is NOT a push-to-phone delivery (those need APNS/FCM with
 * Novabot's developer credentials we don't have). It's the in-app
 * message inbox that the stock app shows under Settings → Messages.
 */
import { v4 as uuidv4 } from 'uuid';
import { messageRepo } from '../db/repositories/messages.js';
import { equipmentRepo } from '../db/repositories/equipment.js';
import { MowerEvent } from './types.js';

const TAG = '[NOTIFY:ROBOTMSG]';

function formatBody(ev: MowerEvent): string {
  // Stock app's RobotMessageEntity.fromJson reads `contentEn` (which we
  // map to `robot_msg` in the DB). Combine title + message for parity
  // with how Novabot-cloud-sourced messages typically look.
  if (ev.title === ev.message) return ev.title;
  return `${ev.title}: ${ev.message}`;
}

export function writeRobotMessage(ev: MowerEvent): void {
  // Look up the owning user via equipment row. Anonymous mowers have
  // user_id NULL — skip those (no inbox to write to).
  const equip = equipmentRepo.findByMowerSn(ev.sn);
  const userId = equip?.user_id;
  if (!userId) return;

  const equipmentId = equip?.equipment_id ?? ev.sn;
  try {
    messageRepo.createMessage(uuidv4(), userId, equipmentId, formatBody(ev));
  } catch (err) {
    console.warn(`${TAG} write failed for ${ev.sn}:`, err);
  }
}
