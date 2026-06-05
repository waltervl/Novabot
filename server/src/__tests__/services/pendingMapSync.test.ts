import { describe, it, expect } from 'vitest';
import {
  markPendingMapSync,
  clearPendingMapSync,
  hasPendingMapSync,
  getPendingMapSync,
} from '../../services/pendingMapSync.js';

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

  it('remembers the bundle filename for a targeted re-push', () => {
    markPendingMapSync('LFIN_E', 'LFIN_E_cloud-import_20260605.zip');
    expect(hasPendingMapSync('LFIN_E')).toBe(true);
    expect(getPendingMapSync('LFIN_E')).toBe('LFIN_E_cloud-import_20260605.zip');
  });

  it('returns undefined filename when marked without one (legacy flag)', () => {
    markPendingMapSync('LFIN_F');
    expect(hasPendingMapSync('LFIN_F')).toBe(true);
    expect(getPendingMapSync('LFIN_F')).toBeUndefined();
  });

  it('forgets the filename after clear', () => {
    markPendingMapSync('LFIN_G', 'bundle.zip');
    clearPendingMapSync('LFIN_G');
    expect(hasPendingMapSync('LFIN_G')).toBe(false);
    expect(getPendingMapSync('LFIN_G')).toBeUndefined();
  });

  it('getPendingMapSync is undefined for an unknown mower', () => {
    expect(getPendingMapSync('LFIN_NONE2')).toBeUndefined();
  });
});
