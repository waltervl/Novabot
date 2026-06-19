import { describe, expect, it } from 'vitest';
import { isOpenNovaFirmware } from '../firmwareCapability';

describe('isOpenNovaFirmware', () => {
  it('detects custom and opennova builds (case-insensitive)', () => {
    expect(isOpenNovaFirmware('v6.0.2-custom-37')).toBe(true);
    expect(isOpenNovaFirmware('v6.0.2-OpenNova-1')).toBe(true);
  });
  it('treats stock versions as not OpenNova', () => {
    expect(isOpenNovaFirmware('v6.0.2')).toBe(false);
    expect(isOpenNovaFirmware('v5.7.1')).toBe(false);
  });
  it('handles null/undefined/empty', () => {
    expect(isOpenNovaFirmware(null)).toBe(false);
    expect(isOpenNovaFirmware(undefined)).toBe(false);
    expect(isOpenNovaFirmware('')).toBe(false);
  });
});
