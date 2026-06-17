// Pure, dependency-free decision logic for the multi-zone mow queue.
// Kept import-free (like softRestartPolicy.ts) so the unit test loads it without
// dragging in the mqtt module graph (which has an init-order cycle).

export const MZ_STALE_MS = 6 * 60 * 60 * 1000; // per-zone safety drop

export interface MZQueue {
  remaining: number[];   // canonical map indices (0,1,2…); [0] = current zone
  cutterhigh: number;    // wire value (user cm − 2)
  phase: 'running' | 'await_idle';
  sawMowing: boolean;    // current zone has been observed actually mowing
  startedAt: number;     // per-zone stale guard
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

/** State transition for one queued mower. Mutates `q`; returns the side effect. */
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
      q.phase = 'await_idle';                      // wait for the mower to dock before the next zone
    }
    return { kind: 'none' };
  }
  // await_idle: only start the next zone once the mower is idle on the dock.
  // start_navigation mid-return-to-pile is unreliable — that was the client bug.
  if (s.idleOnDock) {
    q.phase = 'running'; q.sawMowing = false; q.startedAt = now;
    return { kind: 'dispatch', mapIdx: q.remaining[0] };
  }
  return { kind: 'none' };
}
