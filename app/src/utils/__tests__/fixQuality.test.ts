import { describe, expect, it } from 'vitest';
import { fixQualityLabel } from '../fixQuality';

describe('fixQualityLabel', () => {
  it('maps raw NMEA GGA codes', () => {
    expect(fixQualityLabel(4).label).toBe('RTK Fixed');
    expect(fixQualityLabel(5).label).toBe('RTK Float');
    expect(fixQualityLabel(2).label).toBe('DGPS');
    expect(fixQualityLabel(1).label).toBe('GPS');
    expect(fixQualityLabel(0).label).toBe('No fix');
  });
  it('maps numeric codes passed as strings', () => {
    expect(fixQualityLabel('4').label).toBe('RTK Fixed');
  });
  it('maps server-translated labels (the socket path)', () => {
    expect(fixQualityLabel('RTK Fixed').label).toBe('RTK Fixed');
    expect(fixQualityLabel('RTK Float').color).toBe('#f59e0b');
  });
  it('returns "No data" for null/undefined/unknown', () => {
    expect(fixQualityLabel(null).label).toBe('No data');
    expect(fixQualityLabel(undefined).label).toBe('No data');
    expect(fixQualityLabel('whatever').label).toBe('No data');
  });
});
