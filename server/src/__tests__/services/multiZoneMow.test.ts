import { describe, it, expect } from 'vitest';
import { step, type MZQueue } from '../../services/multiZoneMowPolicy.js';

const Q = (): MZQueue => ({ remaining: [0, 1], cutterhigh: 2, phase: 'running', sawMowing: false, startedAt: 1000 });

describe('multiZone step', () => {
  it('ignores FINISHED before the zone has actually mowed (stale prior state)', () => {
    const q = Q();
    expect(step(q, { msg: 'Mode:COVERAGE Work:FINISHED', err: 0, idleOnDock: false }, 2000)).toEqual({ kind: 'none' });
    expect(q.remaining).toEqual([0, 1]);
  });

  it('on FINISHED after mowing → await_idle, drops the finished zone, no immediate dispatch', () => {
    const q = Q();
    step(q, { msg: 'Work:COVERING', err: 0, idleOnDock: false }, 2000); // sawMowing
    const a = step(q, { msg: 'Work:FINISHED', err: 0, idleOnDock: false }, 2100);
    expect(a).toEqual({ kind: 'none' });
    expect(q.phase).toBe('await_idle');
    expect(q.remaining).toEqual([1]);
  });

  it('dispatches the next zone only once idle on the dock', () => {
    const q = Q();
    step(q, { msg: 'Work:COVERING', err: 0, idleOnDock: false }, 2000);
    step(q, { msg: 'Work:FINISHED', err: 0, idleOnDock: false }, 2100);   // → await_idle
    expect(step(q, { msg: 'Work:WAIT', err: 0, idleOnDock: false }, 2200)).toEqual({ kind: 'none' }); // still returning
    expect(step(q, { msg: 'Work:WAIT', err: 0, idleOnDock: true }, 2300)).toEqual({ kind: 'dispatch', mapIdx: 1 });
    expect(q.phase).toBe('running');
  });

  it('finishing the last zone is done', () => {
    const q: MZQueue = { remaining: [1], cutterhigh: 2, phase: 'running', sawMowing: true, startedAt: 1000 };
    expect(step(q, { msg: 'Work:FINISHED', err: 0, idleOnDock: false }, 2000)).toEqual({ kind: 'done' });
  });

  it('aborts when a zone ends in error', () => {
    const q: MZQueue = { remaining: [0, 1], cutterhigh: 2, phase: 'running', sawMowing: true, startedAt: 1000 };
    expect(step(q, { msg: 'Work:FINISHED', err: 120, idleOnDock: false }, 2000)).toEqual({ kind: 'abort' });
  });

  it('aborts a zone that has run past the stale window', () => {
    const q = Q();
    expect(step(q, { msg: 'Work:COVERING', err: 0, idleOnDock: false }, 1000 + 7 * 60 * 60 * 1000)).toEqual({ kind: 'abort' });
  });
});
