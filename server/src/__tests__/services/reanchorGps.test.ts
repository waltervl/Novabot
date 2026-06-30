import { describe, it, expect } from 'vitest';
import { medianGps, gpsSpreadMeters } from '../../services/reanchorGps.js';

describe('reanchorGps', () => {
  it('medianGps returns the per-axis middle element', () => {
    const m = medianGps([
      { lat: 52.1410, lng: 6.2313 },
      { lat: 52.1408, lng: 6.2311 },
      { lat: 52.1409, lng: 6.2312 },
    ]);
    expect(m.lat).toBeCloseTo(52.1409, 6);
    expect(m.lng).toBeCloseTo(6.2312, 6);
  });

  it('a tight cluster has a small spread (well under the 10cm gate)', () => {
    // ~1cm of jitter around the dock
    const spread = gpsSpreadMeters([
      { lat: 52.140850, lng: 6.231150 },
      { lat: 52.1408501, lng: 6.2311501 },
      { lat: 52.1408499, lng: 6.2311499 },
    ]);
    expect(spread).toBeLessThan(0.05);
  });

  it('a ~0.68m lng spread is measured in metres (rejected by the gate)', () => {
    // 0.00001 deg lng at lat 52.14 ~= 0.68 m
    const spread = gpsSpreadMeters([
      { lat: 52.14085, lng: 6.231150 },
      { lat: 52.14085, lng: 6.231160 },
    ]);
    expect(spread).toBeCloseTo(0.68, 1);
  });

  it('fewer than two samples has no spread', () => {
    expect(gpsSpreadMeters([])).toBe(0);
    expect(gpsSpreadMeters([{ lat: 52.14, lng: 6.23 }])).toBe(0);
  });
});
