// Pure, dependency-free decision logic for the multi-zone mow queue.
// Kept import-free (like softRestartPolicy.ts) so the unit test loads it without
// dragging in the mqtt module graph (which has an init-order cycle).

export const MZ_STALE_MS = 6 * 60 * 60 * 1000; // per-zone safety drop
// After dispatching the next zone, give the mower this long to actually start
// mowing before re-firing. Covers undock + navigate-to-zone.
export const MZ_RESTART_GRACE_MS = 20_000;

export interface MZQueue {
  remaining: number[];   // canonical map indices (0,1,2…); [0] = current zone
  cutterhigh: number;    // wire value (user cm − 2)
  phase: 'running' | 'restarting';
  sawMowing: boolean;    // current zone has been observed actually mowing
  startedAt: number;     // per-zone stale guard
  lastDispatch: number;  // last start_navigation send (rate-limits the fallback)
}

export type MZAction =
  | { kind: 'none' } | { kind: 'dispatch'; mapIdx: number } | { kind: 'done' } | { kind: 'abort' };

/** 1 = map0, 10 = map1, 200 = map2 (firmware `area` param, per Flutter decomp). */
export function areaFromIdx(idx: number): number {
  return idx === 0 ? 1 : idx === 1 ? 10 : 200;
}

export function isMowingMsg(msg: string): boolean {
  return msg.includes('Work:RUNNING') || msg.includes('Work:COVERING')
      || msg.includes('Work:NAVIGATING') || msg.includes('Work:BOUNDARY_COVERING')
      || msg.includes('Work:AVOIDING');
}

/** State transition for one queued mower. Mutates `q`; returns the side effect.
 *  Goal: NO dock between zones — fire the next zone the instant the current one
 *  reports FINISHED (before it commits to returning). If the firmware ignores a
 *  mid-return start and docks anyway, the 'restarting' fallback re-fires from the
 *  dock so the next zone still runs. */
export function step(
  q: MZQueue,
  s: { msg: string; err: number; idleOnDock: boolean },
  now: number,
): MZAction {
  if (now - q.startedAt > MZ_STALE_MS) return { kind: 'abort' };

  if (q.phase === 'running') {
    if (isMowingMsg(s.msg)) { q.sawMowing = true; return { kind: 'none' }; }
    if (q.sawMowing && s.msg.includes('Work:FINISHED')) {
      if (s.err !== 0) return { kind: 'abort' };  // ended in error — stop, let the user inspect
      q.remaining.shift();                         // current zone done
      if (q.remaining.length === 0) return { kind: 'done' };
      // Fire the next zone NOW (before the mower returns to the dock).
      q.sawMowing = false; q.startedAt = now; q.lastDispatch = now; q.phase = 'restarting';
      return { kind: 'dispatch', mapIdx: q.remaining[0] };
    }
    return { kind: 'none' };
  }

  // restarting: we've fired the next zone. If it starts mowing we're continuous
  // (no dock — the goal). If the firmware docked instead (ignored the mid-return
  // start) and sits idle past the grace window, re-fire from the dock.
  if (isMowingMsg(s.msg)) { q.phase = 'running'; q.sawMowing = true; return { kind: 'none' }; }
  if (s.idleOnDock && now - q.lastDispatch > MZ_RESTART_GRACE_MS) {
    q.lastDispatch = now;
    return { kind: 'dispatch', mapIdx: q.remaining[0] };
  }
  return { kind: 'none' };
}
