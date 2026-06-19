import { describe, expect, it } from 'vitest';
import { offsetPolygon, offsetLocalPolygon } from '../polygonOffset';

const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const bbox = (pts: { x: number; y: number }[]) => {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};

describe('offsetLocalPolygon', () => {
  it('returns the input unchanged for offset 0 or <3 points', () => {
    expect(offsetLocalPolygon(square, 0)).toEqual(square);
    expect(offsetLocalPolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }], 1)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  });

  it('keeps the square centred and shifts each side by 1m for a 1m offset', () => {
    // Direction (expand vs shrink) is an internal sign convention; assert the
    // magnitude (1m per side at a 90° corner) and the symmetry instead.
    const a = offsetLocalPolygon(square, 1);
    const b = offsetLocalPolygon(square, -1);
    const ba = bbox(a), bb = bbox(b);
    expect((ba.minX + ba.maxX) / 2).toBeCloseTo(5, 6);
    expect((ba.minY + ba.maxY) / 2).toBeCloseTo(5, 6);
    const halfA = (ba.maxX - ba.minX) / 2;
    const halfB = (bb.maxX - bb.minX) / 2;
    expect([halfA, halfB].map(h => Math.round(h)).sort()).toEqual([4, 6]); // one shrinks, one expands
    expect(halfA + halfB).toBeCloseTo(10, 6);                              // symmetric ±1m
  });
});

describe('offsetPolygon (GPS)', () => {
  it('returns input unchanged for offset 0 / degenerate', () => {
    const gps = [{ lat: 52, lng: 5 }, { lat: 52.001, lng: 5 }, { lat: 52.001, lng: 5.001 }];
    expect(offsetPolygon(gps, 0)).toBe(gps);            // offset 0 short-circuits
    const twoPts = gps.slice(0, 2);
    expect(offsetPolygon(twoPts, 1)).toBe(twoPts);      // <3 points short-circuits
  });

  it('produces a polygon that round-trips back near the original scale', () => {
    const gps = [
      { lat: 52.0000, lng: 5.0000 },
      { lat: 52.0000, lng: 5.0010 },
      { lat: 52.0010, lng: 5.0010 },
      { lat: 52.0010, lng: 5.0000 },
    ];
    const out = offsetPolygon(gps, 2);
    expect(out).toHaveLength(4);
    // Stays in the same neighbourhood (within a few metres ~ 1e-4 deg).
    for (const p of out) {
      expect(Math.abs(p.lat - 52.0005)).toBeLessThan(0.001);
      expect(Math.abs(p.lng - 5.0005)).toBeLessThan(0.001);
    }
  });
});
