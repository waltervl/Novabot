import { describe, it, expect } from 'vitest';
import {
  isBusyWorkStatus,
  evalAutoRecover,
  SUSTAINED_MS,
  COOLDOWN_MS,
} from '../../services/softRestartPolicy.js';

describe('isBusyWorkStatus — the never-while-mowing gate', () => {
  it('is busy while actively mowing (100)', () => {
    expect(isBusyWorkStatus('100')).toBe(true);
  });

  it('is busy for every active/transit status (leaving dock, mapping, docking, recovering, deleting, driving)', () => {
    for (const s of ['10', '20', '50', '52', '84', '101', '102', '103', '110', '120', '150', '200', '250']) {
      expect(isBusyWorkStatus(s)).toBe(true);
    }
  });

  it('is NOT busy when idle (0), ready (9) or finished (70)', () => {
    expect(isBusyWorkStatus('0')).toBe(false);
    expect(isBusyWorkStatus('9')).toBe(false);
    expect(isBusyWorkStatus('70')).toBe(false);
  });

  it('treats unknown / missing / non-numeric as NOT busy (idle)', () => {
    expect(isBusyWorkStatus(undefined)).toBe(false);
    expect(isBusyWorkStatus(null)).toBe(false);
    expect(isBusyWorkStatus('')).toBe(false);
    expect(isBusyWorkStatus('nonsense')).toBe(false);
  });
});

describe('evalAutoRecover — sustained Error 140 auto-recovery decision', () => {
  it('does not restart on first sight of 140 (starts the sustain timer)', () => {
    const r = evalAutoRecover(undefined, true, false, 1_000_000);
    expect(r.restart).toBe(false);
    expect(r.state.since).toBe(1_000_000);
  });

  it('restarts once 140 has been sustained while idle', () => {
    const first = evalAutoRecover(undefined, true, false, 1_000_000);
    const r = evalAutoRecover(first.state, true, false, 1_000_000 + SUSTAINED_MS + 1);
    expect(r.restart).toBe(true);
    expect(r.state.since).toBeNull();
    expect(r.state.lastRestart).toBe(1_000_000 + SUSTAINED_MS + 1);
  });

  it('NEVER restarts while busy/mowing, even with sustained 140', () => {
    const first = evalAutoRecover(undefined, true, true, 2_000_000);
    const r = evalAutoRecover(first.state, true, true, 2_000_000 + SUSTAINED_MS + 1);
    expect(r.restart).toBe(false);
  });

  it('respects the cooldown — no second restart within COOLDOWN_MS', () => {
    const a = evalAutoRecover(undefined, true, false, 3_000_000);
    const b = evalAutoRecover(a.state, true, false, 3_000_000 + SUSTAINED_MS + 1); // restart #1
    expect(b.restart).toBe(true);
    const c = evalAutoRecover(b.state, true, false, b.state.lastRestart + SUSTAINED_MS + 1); // sustained again
    expect(c.restart).toBe(false); // still within cooldown
    const d = evalAutoRecover(c.state, true, false, b.state.lastRestart + COOLDOWN_MS + SUSTAINED_MS + 1);
    expect(d.restart).toBe(true); // cooldown elapsed
  });

  it('resets the sustain timer when 140 clears before the window', () => {
    const first = evalAutoRecover(undefined, true, false, 4_000_000);
    const cleared = evalAutoRecover(first.state, false, false, 4_000_000 + 10_000);
    expect(cleared.state.since).toBeNull();
    const r = evalAutoRecover(cleared.state, true, false, 4_000_000 + SUSTAINED_MS + 1);
    expect(r.restart).toBe(false); // timer restarted at re-detection, not yet sustained
  });
});
