/**
 * Event detector — turns deviceCache state transitions into MowerEvent
 * objects and forwards to the dispatcher.
 *
 * Tracks the previous values of the fields that drive transitions so the
 * very first sensor frame after server restart never produces spurious
 * events (we can't tell a transition from "first seen").
 */
import { dispatchEvent } from './dispatcher.js';
import { lookupError } from './errorMap.js';
import { MowerEvent, EventType } from './types.js';

const LOW_BATTERY_THRESHOLD = parseInt(process.env.LOW_BATTERY_THRESHOLD ?? '20', 10);

// Friendlier titles per category — keeps notification banners short
// while the body carries the firmware-translated message.
const TITLE_BY_TYPE: Record<EventType, string> = {
  error:                'Mower error',
  error_cleared:        'Mower error cleared',
  mowing_started:       'Mowing started',
  mowing_finished:      'Mowing finished',
  docked:               'Mower docked',
  low_battery:          'Low battery',
  stuck:                'Mower stuck',
  safety:               'Mower safety stop',
  pin_locked:           'PIN required',
  connection_lost:      'Mower connection lost',
  gps_weak:             'GPS issue',
  map_error:            'Mapping issue',
  initialization_error: 'Mower starting up',
  hardware_fault:       'Hardware fault',
};

interface SnapshotState {
  errorStatus: string;
  msg: string;
  rechargeStatus: string;
  batteryPower: number;
  initialised: boolean;        // false until first frame seen — suppresses startup events
}

const stateBySn = new Map<string, SnapshotState>();

function readSnapshot(snValues: Map<string, string>): SnapshotState {
  return {
    errorStatus: snValues.get('error_status') ?? '0',
    msg: snValues.get('msg') ?? '',
    rechargeStatus: snValues.get('recharge_status') ?? '0',
    batteryPower: parseInt(snValues.get('battery_power') ?? '0', 10) || 0,
    initialised: true,
  };
}

function isMowing(msg: string): boolean {
  return msg.includes('Work:RUNNING')
      || msg.includes('Work:COVERING')
      || msg.includes('Work:NAVIGATING')
      || msg.includes('Work:BOUNDARY_COVERING')
      || msg.includes('Work:AVOIDING');
}

function isFinished(msg: string): boolean {
  return msg.includes('Work:FINISHED');
}

function makeEvent(sn: string, type: EventType, title: string, message: string,
                   data: Record<string, unknown>): MowerEvent {
  return { sn, type, ts: Date.now(), title, message, data };
}

/**
 * Inspect the latest sensor state for `sn` and emit any events triggered
 * by the transition. Idempotent — only state TRANSITIONS produce events,
 * so calling on every sensor tick is safe.
 */
export function detectAndDispatch(sn: string, snValues: Map<string, string>): void {
  const next = readSnapshot(snValues);
  const prev = stateBySn.get(sn);
  stateBySn.set(sn, next);

  // No prior snapshot → can't compute a transition. Suppress.
  if (!prev) return;

  // ── Error transitions ───────────────────────────────────────
  if (prev.errorStatus !== next.errorStatus) {
    if (next.errorStatus !== '0') {
      const errMsg = snValues.get('error_msg') ?? `error_status=${next.errorStatus}`;
      const code = parseInt(next.errorStatus, 10) || 0;
      const entry = lookupError(code, errMsg);
      // Body prefers the curated message text from the stock app's
      // translation table; fall back to firmware error_msg if unmapped.
      const body = entry.type === 'error' ? errMsg : entry.message;
      dispatchEvent(makeEvent(
        sn,
        entry.type,
        TITLE_BY_TYPE[entry.type] ?? 'Mower event',
        body,
        { error_status: next.errorStatus, error_msg: errMsg, msg: next.msg },
      ));
    } else {
      dispatchEvent(makeEvent(
        sn,
        'error_cleared',
        TITLE_BY_TYPE.error_cleared,
        `Previous error_status=${prev.errorStatus} now 0`,
        { previous_error_status: prev.errorStatus, msg: next.msg },
      ));
    }
  }

  // ── Mowing started / finished ───────────────────────────────
  const wasMowing = isMowing(prev.msg);
  const nowMowing = isMowing(next.msg);
  if (!wasMowing && nowMowing) {
    dispatchEvent(makeEvent(
      sn,
      'mowing_started',
      'Mowing started',
      next.msg,
      { msg: next.msg },
    ));
  } else if (wasMowing && !nowMowing && isFinished(next.msg) && next.errorStatus === '0') {
    dispatchEvent(makeEvent(
      sn,
      'mowing_finished',
      'Mowing finished',
      next.msg,
      { msg: next.msg },
    ));
  }

  // ── Docked ──────────────────────────────────────────────────
  if (prev.rechargeStatus !== next.rechargeStatus && next.rechargeStatus === '9') {
    dispatchEvent(makeEvent(
      sn,
      'docked',
      'Mower docked',
      `recharge_status=9 (FINISHED on dock), battery=${next.batteryPower}%`,
      { recharge_status: next.rechargeStatus, battery_power: next.batteryPower },
    ));
  }

  // ── Low battery (one-shot per dip below threshold) ──────────
  if (prev.batteryPower > LOW_BATTERY_THRESHOLD && next.batteryPower <= LOW_BATTERY_THRESHOLD) {
    dispatchEvent(makeEvent(
      sn,
      'low_battery',
      `Battery ${next.batteryPower}%`,
      `Battery dropped below ${LOW_BATTERY_THRESHOLD}% threshold`,
      { battery_power: next.batteryPower, threshold: LOW_BATTERY_THRESHOLD },
    ));
  }
}

/**
 * Reset the cached snapshot for `sn`. Called when a device is unbound /
 * factory-reset so the next frame doesn't fire spurious clear events.
 */
export function resetEventState(sn: string): void {
  stateBySn.delete(sn);
}
