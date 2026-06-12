import { describe, it, expect } from 'vitest';
import { isBetaFirmware, BACKUP_MAX_AGE_MS, BETA_FIRMWARE_WARNING } from '../../services/firmwareSafety.js';

describe('isBetaFirmware', () => {
  it('flags custom builds', () => {
    expect(isBetaFirmware('v6.0.2-custom-36')).toBe(true);
    expect(isBetaFirmware('v6.0.2-opennova-1')).toBe(true);
    expect(isBetaFirmware('V6.0.2-CUSTOM-2')).toBe(true);
  });
  it('does not flag stock builds', () => {
    expect(isBetaFirmware('v6.0.2')).toBe(false);
    expect(isBetaFirmware('v5.7.1')).toBe(false);
    expect(isBetaFirmware('')).toBe(false);
    expect(isBetaFirmware(null)).toBe(false);
    expect(isBetaFirmware(undefined)).toBe(false);
  });
  it('exposes a 24h recency window and the canonical warning copy', () => {
    expect(BACKUP_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
    expect(BETA_FIRMWARE_WARNING).toContain('BETA');
    expect(BETA_FIRMWARE_WARNING).toContain('bricken');
    expect(BETA_FIRMWARE_WARNING).toContain('kaarten');
    expect(BETA_FIRMWARE_WARNING).toContain("risico's");
  });
});
