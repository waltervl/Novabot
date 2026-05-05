import { describe, it, expect } from 'vitest';
import { sanitizeNickName } from '../../utils/sanitizeNickName.js';

describe('sanitizeNickName', () => {
  it('returns null for null / undefined / empty / whitespace', () => {
    expect(sanitizeNickName(null)).toBeNull();
    expect(sanitizeNickName(undefined)).toBeNull();
    expect(sanitizeNickName('')).toBeNull();
    expect(sanitizeNickName('   ')).toBeNull();
  });

  it('trims surrounding whitespace from real names', () => {
    expect(sanitizeNickName('  Backyard  ', 'LFIN1231000211')).toBe('Backyard');
  });

  it('passes user-set nicknames through unchanged', () => {
    expect(sanitizeNickName('Achtertuin', 'LFIN1231000211')).toBe('Achtertuin');
    expect(sanitizeNickName('My Novabot', 'LFIN1231000211')).toBe('My Novabot');
  });

  describe('Charging Station LFI default', () => {
    it.each([
      ['Charging Station'],
      ['charging station'],
      ['CHARGING STATION'],
      ['charging_station'],
      ['Charging-Station'],
      ['charging-station'],
      ['  Charging Station  '],  // padded — trim handles this
    ])('drops "%s" when a mower SN is present', (variant) => {
      expect(sanitizeNickName(variant, 'LFIN1231000211')).toBeNull();
    });

    it('keeps "Charging Station" when no mower SN is present (charger-only legitimate name)', () => {
      // A real charger record can legitimately carry that nickname.
      expect(sanitizeNickName('Charging Station', null)).toBe('Charging Station');
      expect(sanitizeNickName('Charging Station')).toBe('Charging Station');
    });

    it('does not match unrelated strings that contain "charging" or "station"', () => {
      expect(sanitizeNickName('Charging Spot', 'LFIN...')).toBe('Charging Spot');
      expect(sanitizeNickName('My Charging Station Backup', 'LFIN...')).toBe('My Charging Station Backup');
      expect(sanitizeNickName('Station 5', 'LFIN...')).toBe('Station 5');
    });
  });

  it('coerces non-string inputs through String()', () => {
    // Defensive against callers that pass numbers / objects via API.
    expect(sanitizeNickName(123 as unknown as string, 'LFIN...')).toBe('123');
  });
});
