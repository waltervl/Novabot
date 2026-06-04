import { describe, it, expect } from 'vitest';
import { markPendingMapSync, clearPendingMapSync, hasPendingMapSync } from '../../services/pendingMapSync.js';

describe('pendingMapSync', () => {
  it('is false for an unknown mower', () => {
    expect(hasPendingMapSync('LFIN_NONE')).toBe(false);
  });

  it('marks and detects a pending sync', () => {
    markPendingMapSync('LFIN_A');
    expect(hasPendingMapSync('LFIN_A')).toBe(true);
  });

  it('clears a pending sync', () => {
    markPendingMapSync('LFIN_B');
    expect(hasPendingMapSync('LFIN_B')).toBe(true);
    clearPendingMapSync('LFIN_B');
    expect(hasPendingMapSync('LFIN_B')).toBe(false);
  });

  it('is independent per mower', () => {
    markPendingMapSync('LFIN_C');
    clearPendingMapSync('LFIN_C');
    markPendingMapSync('LFIN_D');
    expect(hasPendingMapSync('LFIN_C')).toBe(false);
    expect(hasPendingMapSync('LFIN_D')).toBe(true);
  });
});
