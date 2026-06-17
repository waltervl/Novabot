import { describe, it, expect } from 'vitest';
import { step, MZ_RESTART_GRACE_MS, type MZQueue } from '../../services/multiZoneMowPolicy.js';

const Q = (over: Partial<MZQueue> = {}): MZQueue => ({
  remaining: [0, 1], cutterhigh: 2, phase: 'running', sawMowing: false, startedAt: 1000, lastDispatch: 1000, ...over,
});

describe('multiZone step', () => {
  it('ignores FINISHED before the zone has mowed (stale prior state)', () => {
    const q = Q();
    expect(step(q, { msg: 'Mode:COVERAGE Work:FINISHED', err: 0, idleOnDock: false }, 2000)).toEqual({ kind: 'none' });
    expect(q.remaining).toEqual([0, 1]);
  });

  it('fires the next zone immediately on FINISHED (no dock wait) → restarting', () => {
    const q = Q();
    step(q, { msg: 'Work:COVERING', err: 0, idleOnDock: false }, 2000); // sawMowing
    const a = step(q, { msg: 'Work:FINISHED', err: 0, idleOnDock: false }, 2100);
    expect(a).toEqual({ kind: 'dispatch', mapIdx: 1 });
    expect(q.phase).toBe('restarting');
    expect(q.remaining).toEqual([1]);
  });

  it('restarting → running once the next zone actually mows (continuous, no dock)', () => {
    const q = Q({ remaining: [1], phase: 'restarting', lastDispatch: 2100 });
    expect(step(q, { msg: 'Work:COVERING', err: 0, idleOnDock: false }, 2200)).toEqual({ kind: 'none' });
    expect(q.phase).toBe('running');
  });

  it('restarting fallback: re-fires from the dock if the firmware docked instead', () => {
    const q = Q({ remaining: [1], phase: 'restarting', lastDispatch: 2100 });
    expect(step(q, { msg: 'Work:WAIT', err: 0, idleOnDock: true }, 2100 + 1000)).toEqual({ kind: 'none' });      // within grace
    expect(step(q, { msg: 'Work:WAIT', err: 0, idleOnDock: true }, 2100 + MZ_RESTART_GRACE_MS + 1)).toEqual({ kind: 'dispatch', mapIdx: 1 });
  });

  it('finishing the last zone is done', () => {
    const q = Q({ remaining: [1], sawMowing: true });
    expect(step(q, { msg: 'Work:FINISHED', err: 0, idleOnDock: false }, 2000)).toEqual({ kind: 'done' });
  });

  it('aborts when a zone ends in error', () => {
    const q = Q({ sawMowing: true });
    expect(step(q, { msg: 'Work:FINISHED', err: 120, idleOnDock: false }, 2000)).toEqual({ kind: 'abort' });
  });

  it('aborts a zone past the stale window', () => {
    const q = Q();
    expect(step(q, { msg: 'Work:COVERING', err: 0, idleOnDock: false }, 1000 + 7 * 60 * 60 * 1000)).toEqual({ kind: 'abort' });
  });
});
