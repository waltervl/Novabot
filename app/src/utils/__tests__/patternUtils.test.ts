import { describe, expect, it } from 'vitest';
import { parsePattern, transformToGps, contourToSvgPath, loadAllPatterns, type NormContour } from '../patternUtils';

describe('parsePattern', () => {
  it('normalises contours to a centred [-0.5, 0.5] box', () => {
    const out = parsePattern({ contours: { c1: '0 0,10 0,10 10,0 10' } });
    expect(out).toEqual([[[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]]);
  });

  it('returns [] for no contours', () => {
    expect(parsePattern({ contours: {} })).toEqual([]);
  });
});

describe('contourToSvgPath', () => {
  it('emits an M/L path closed with Z, scaled into the size box', () => {
    const contour: NormContour = [[-0.5, -0.5], [0.5, 0.5]];
    expect(contourToSvgPath(contour, 60, 4)).toBe('M4.0 4.0 L56.0 56.0 Z');
  });
});

describe('transformToGps', () => {
  it('maps the contour centre to the given GPS centre', () => {
    const [p] = transformToGps([[0, 0]], { lat: 52, lng: 5 }, 10, 0);
    expect(p.lat).toBeCloseTo(52, 9);
    expect(p.lng).toBeCloseTo(5, 9);
  });

  it('a +x contour point shifts east (lng up), lat unchanged at rot 0', () => {
    const [p] = transformToGps([[1, 0]], { lat: 52, lng: 5 }, 10, 0);
    expect(p.lat).toBeCloseTo(52, 9);
    expect(p.lng).toBeGreaterThan(5);
  });

  it('rotating 90° turns a +x point into a northward (lat up) shift', () => {
    const [p] = transformToGps([[1, 0]], { lat: 52, lng: 5 }, 10, 90);
    expect(p.lat).toBeGreaterThan(52);
    expect(p.lng).toBeCloseTo(5, 6);
  });
});

describe('loadAllPatterns', () => {
  it('loads the bundled pattern assets (smoke test)', () => {
    const all = loadAllPatterns();
    expect(all.size).toBeGreaterThan(0);
    for (const contours of all.values()) {
      expect(contours.length).toBeGreaterThan(0);
    }
  });
});
