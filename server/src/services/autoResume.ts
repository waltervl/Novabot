/**
 * Auto-resume coverage task after low-battery dock cycle.
 *
 * Stock OEM firmware drives the mower back to the dock when the battery
 * dips below its return threshold (work_status BATTERY_LOW_RECHARGE /
 * USER_RECHARGE_STOP) but does NOT auto-leave the dock after charging —
 * stock Novabot Flutter app requires the operator to tap "Continue" in
 * the home screen, which then publishes `resume_navigation`. Issue #30
 * captures the missing behaviour: the operator expects the mower to pick
 * the session back up on its own.
 *
 * This watcher is called from sensorData.ts after each device-state
 * update. It maintains a tiny per-SN state machine:
 *
 *   IDLE               ──[on dock + BATTERY_LOW_RECHARGE]──→ WAITING_FOR_CHARGE
 *   WAITING_FOR_CHARGE ──[battery_power ≥ threshold]────────→ resume_navigation + IDLE
 *   any                ──[off dock OR task_mode != 1]──────→ IDLE
 *
 * Threshold is configurable via `AUTO_RESUME_BATTERY_THRESHOLD` (default
 * 90%). A cooldown prevents back-to-back resume_navigation publishes if
 * the mower bounces in and out of the work-status string.
 */

import { publishToDevice, getNextCmdNum } from '../mqtt/mapSync.js';

const TAG = '[AUTO-RESUME]';

const AUTO_RESUME_BATTERY_THRESHOLD = (() => {
  const raw = process.env.AUTO_RESUME_BATTERY_THRESHOLD;
  if (raw == null) return 90;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 50 && n <= 100 ? n : 90;
})();

const RESUME_COOLDOWN_MS = 60_000; // ignore duplicate triggers within 1 min

interface ResumeState {
  waitingForCharge: boolean;
  lastResumeAt: number;
}

const stateBySn = new Map<string, ResumeState>();

function getState(sn: string): ResumeState {
  let s = stateBySn.get(sn);
  if (!s) {
    s = { waitingForCharge: false, lastResumeAt: 0 };
    stateBySn.set(sn, s);
  }
  return s;
}

/**
 * Inspect the latest sensor snapshot for `sn` and decide whether the
 * mower should be auto-resumed. Safe to call on every sensor update;
 * the state machine handles debouncing internally.
 */
export function checkAutoResume(sn: string, snValues: Map<string, string>): void {
  const msg = snValues.get('msg') ?? '';
  const taskMode = parseInt(snValues.get('task_mode') ?? '0', 10);
  const batteryPower = parseInt(snValues.get('battery_power') ?? '0', 10);
  const batteryState = (snValues.get('battery_state') ?? '').toUpperCase();

  // Detect the "paused for low battery on dock" state. mqtt_node emits
  // the msg field as e.g. "Mode:COVERAGE Work:BATTERY_LOW_RECHARGE
  // Prev work:COVERING Recharge: GOING" while driving back, then
  // "Mode:COVERAGE Work:CANCELLED Prev work:USER_RECHARGE_STOP" after
  // it docks. We match on either Work: or Prev work:.
  const isLowBatteryPause = (
    /Work:BATTERY_LOW_RECHARGE\b/.test(msg) ||
    /Prev work:BATTERY_LOW_RECHARGE\b/.test(msg) ||
    /Work:USER_RECHARGE_STOP\b/.test(msg) ||
    /Prev work:USER_RECHARGE_STOP\b/.test(msg)
  );

  const isCharging = batteryState === 'CHARGING';
  const state = getState(sn);

  if (taskMode !== 1) {
    // Not in a coverage task at all → reset.
    state.waitingForCharge = false;
    return;
  }

  // Latch the "waiting" flag when we see the mower pause for low battery.
  // Don't require CHARGING here yet — the mower transits through
  // BATTERY_LOW_RECHARGE while still driving back, and we want to keep
  // the latch through the dock-handover.
  if (isLowBatteryPause) {
    if (!state.waitingForCharge) {
      console.log(`${TAG} ${sn} → waiting for charge (battery=${batteryPower}%, msg="${msg}")`);
    }
    state.waitingForCharge = true;
  }

  // Resume conditions: latched, charging on dock, battery at or above
  // threshold, cooldown elapsed. We send resume_navigation — stock
  // app's _clickContinue uses the same MQTT command for dock-return
  // resume (resume_run is for pause-mid-mow).
  if (
    state.waitingForCharge &&
    isCharging &&
    batteryPower >= AUTO_RESUME_BATTERY_THRESHOLD &&
    Date.now() - state.lastResumeAt > RESUME_COOLDOWN_MS
  ) {
    console.log(`${TAG} ${sn} → auto-resume (battery=${batteryPower}% ≥ ${AUTO_RESUME_BATTERY_THRESHOLD}%)`);
    state.lastResumeAt = Date.now();
    state.waitingForCharge = false;
    try {
      publishToDevice(sn, { resume_navigation: { cmd_num: getNextCmdNum(sn) } });
    } catch (err) {
      console.warn(`${TAG} ${sn} resume publish failed:`, err);
      // Keep waitingForCharge=false; next sensor update will re-trigger
      // if the work_status string still indicates a paused session.
    }
  }
}

/** Clear per-SN state — used by test cleanup + on device delete. */
export function resetAutoResumeState(sn: string): void {
  stateBySn.delete(sn);
}
