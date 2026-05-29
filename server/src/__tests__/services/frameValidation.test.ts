import { describe, it, expect, beforeEach } from 'vitest';
import {
  markFrameUnvalidated, clearFrameUnvalidated, isFrameUnvalidated,
  loadFrameValidationFromDb,
} from '../../services/frameValidation.js';
import { deviceSettingsRepo } from '../../db/repositories/deviceSettings.js';

const SN = 'LFIN_TEST_0001';

describe('frameValidation', () => {
  beforeEach(() => { clearFrameUnvalidated(SN); });

  it('marks and reads unvalidated', () => {
    expect(isFrameUnvalidated(SN)).toBe(false);
    markFrameUnvalidated(SN);
    expect(isFrameUnvalidated(SN)).toBe(true);
  });

  it('clears', () => {
    markFrameUnvalidated(SN);
    clearFrameUnvalidated(SN);
    expect(isFrameUnvalidated(SN)).toBe(false);
  });

  it('persists to device_settings and reloads (simulated restart)', () => {
    markFrameUnvalidated(SN);
    const rows = deviceSettingsRepo.listAll()
      .filter(r => r.sn === SN && r.key === 'frame_unvalidated');
    expect(rows[0]?.value).toBe('1');
    clearFrameUnvalidated(SN);            // wipe in-memory + persist '0'
    markFrameUnvalidated(SN);             // re-persist '1'
    loadFrameValidationFromDb();
    expect(isFrameUnvalidated(SN)).toBe(true);
  });
});
