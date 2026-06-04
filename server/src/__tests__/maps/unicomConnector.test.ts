import { describe, it, expect } from 'vitest';
import { pointInPolygon, pointInAnyPolygon, generateUnicomPath, type XY }
  from '../../maps/unicomConnector.js';

const square = (cx: number, cy: number, h: number): XY[] => [
  { x: cx - h, y: cy - h }, { x: cx + h, y: cy - h },
  { x: cx + h, y: cy + h }, { x: cx - h, y: cy + h },
];

describe('pointInPolygon', () => {
  it('detects inside/outside', () => {
    const sq = square(0, 0, 1);
    expect(pointInPolygon({ x: 0, y: 0 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(false);
  });
});

describe('pointInAnyPolygon', () => {
  it('ignores polygons with fewer than 3 points', () => {
    const degenerate: XY[] = [{ x: -1, y: -1 }, { x: 1, y: 1 }];
    expect(pointInAnyPolygon({ x: 0, y: 0 }, [degenerate])).toBe(false);
  });
});

describe('generateUnicomPath', () => {
  it('connects two overlapping zones with an all-in-union path', () => {
    const a = square(0, 0, 1);          // x,y in [-1,1]
    const b = square(1.5, 0, 1);        // x,y in [0.5,2.5] — overlaps a in [0.5,1]
    const path = generateUnicomPath(a, b, [a, b], 0.25);
    expect(path.length).toBeGreaterThanOrEqual(2);
    for (const p of path) expect(pointInAnyPolygon(p, [a, b])).toBe(true);
  });

  it('clips out points that fall in a gap between non-overlapping zones', () => {
    const a = square(0, 0, 1);          // [-1,1]
    const b = square(4, 0, 1);          // [3,5] — 2m gap to a
    const path = generateUnicomPath(a, b, [a, b], 0.25);
    for (const p of path) expect(pointInAnyPolygon(p, [a, b])).toBe(true);
    expect(path.every((p) => !(p.x > 1 && p.x < 3))).toBe(true);
  });

  it('returns empty for degenerate input', () => {
    expect(generateUnicomPath([], [{ x: 0, y: 0 }], [], 0.25)).toEqual([]);
  });

  it('returns empty when there are no work polygons to clip against', () => {
    const a = square(0, 0, 1);
    const b = square(1.5, 0, 1);
    expect(generateUnicomPath(a, b, [], 0.25)).toEqual([]);
  });
});
