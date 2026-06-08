// Pure soft-restart policy: the safety gate (never while mowing) and the
// auto-recovery decision (sustained Error 140 + idle + cooldown). NO imports —
// kept dependency-free so it is unit-testable without loading the MQTT/broker
// graph, and so the safety classification lives in one obvious place.

// work_status values where a soft restart is UNSAFE: the mower is actively
// moving/working and cycling the ROS stack would abort it. Mirrors
// WORK_STATUS_LABELS in sensorData. Everything else (idle/ready/charging/
// finished/cancelled/error-stopped) is considered safe to restart.
export const SOFT_RESTART_BUSY_STATUSES: ReadonlySet<number> = new Set<number>([
  10,                                   // leaving dock
  20, 21, 22, 23, 24, 25, 26, 27, 28,   // mapping (active)
  50, 51, 52,                           // returning / aligning / visual-search dock
  84,                                   // recovering
  100, 101, 102, 103, 110, 120, 150,    // mowing / edge / re-cover / driving / patrol / avoid / edge
  200, 201, 202, 203,                   // deleting child map / obstacle / channel
  250,                                  // driving
]);

/** True when the raw work_status string names an active/working state where a
 *  soft restart must be refused. Unknown/missing/non-numeric is NOT busy
 *  (a crashed mower often stops reporting a status — treat as idle). */
export function isBusyWorkStatus(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && SOFT_RESTART_BUSY_STATUSES.has(n);
}

export const SUSTAINED_MS = 60_000;       // Error 140 must persist this long
export const COOLDOWN_MS = 15 * 60_000;   // at most one auto-restart per 15 min
export const AUTO_RECOVER_INTERVAL_MS = 30_000;

export interface AutoRecoverState {
  since: number | null;   // when Error 140 was first seen (null = not in 140)
  lastRestart: number;    // ms epoch of the last auto-restart issued
}

/** Pure auto-recovery decision for one mower. Returns the next state and
 *  whether to dispatch a soft restart now. Restart only when Error 140 has
 *  been sustained, the mower is not busy, and the cooldown has elapsed. */
export function evalAutoRecover(
  prev: AutoRecoverState | undefined,
  has140: boolean,
  busy: boolean,
  now: number,
): { state: AutoRecoverState; restart: boolean } {
  const state: AutoRecoverState = prev ? { ...prev } : { since: null, lastRestart: 0 };
  if (!has140) {
    state.since = null; // cleared / different error → reset the sustain timer
    return { state, restart: false };
  }
  if (state.since == null) state.since = now;
  if (now - state.since < SUSTAINED_MS) return { state, restart: false };
  if (now - state.lastRestart < COOLDOWN_MS) return { state, restart: false };
  if (busy) return { state, restart: false };
  state.lastRestart = now;
  state.since = null;
  return { state, restart: true };
}
