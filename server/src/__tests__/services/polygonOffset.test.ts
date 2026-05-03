import { describe, it, expect } from 'vitest';
import { shiftPoints, isToChargeUnicomName, recomputeBounds } from '../../services/polygonOffset.js';

describe('shiftPoints', () => {
  const pts = [
    { x: -1.21, y: 0.48 },
    { x: -1.20, y: 0.45 },
    { x: 1.0, y: 2.0 },
  ];

  it('returns the same reference when offset is (0,0)', () => {
    expect(shiftPoints(pts, 0, 0, false)).toBe(pts);
    expect(shiftPoints(pts, 0, 0, true)).toBe(pts);
  });

  it('shifts every point by (dx, dy) when not unicom-tocharge', () => {
    const out = shiftPoints(pts, 0.05, -0.03, false);
    expect(out).toHaveLength(3);
    expect(out[0].x).toBeCloseTo(-1.16);
    expect(out[0].y).toBeCloseTo(0.45);
    expect(out[1].x).toBeCloseTo(-1.15);
    expect(out[1].y).toBeCloseTo(0.42);
    expect(out[2].x).toBeCloseTo(1.05);
    expect(out[2].y).toBeCloseTo(1.97);
  });

  it('exempts only index 0 when isToChargeUnicom=true', () => {
    const out = shiftPoints(pts, 0.05, -0.03, true);
    expect(out[0]).toEqual({ x: -1.21, y: 0.48 });
    expect(out[1].x).toBeCloseTo(-1.15);
    expect(out[1].y).toBeCloseTo(0.42);
    expect(out[2].x).toBeCloseTo(1.05);
    expect(out[2].y).toBeCloseTo(1.97);
  });

  it('handles single-point input', () => {
    const out = shiftPoints([{ x: 1, y: 2 }], 0.5, 0.5, false);
    expect(out).toEqual([{ x: 1.5, y: 2.5 }]);
  });
});

describe('isToChargeUnicomName', () => {
  it.each([
    ['map0tocharge_unicom', true],
    ['map12tocharge_unicom', true],
    ['map0tomap1_0_unicom', false],
    ['map0_work', false],
    ['map0_3_obstacle', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('%s -> %s', (name, expected) => {
    expect(isToChargeUnicomName(name as string | null | undefined)).toBe(expected);
  });
});

describe('recomputeBounds', () => {
  it('returns null for empty input', () => {
    expect(recomputeBounds([])).toBeNull();
  });

  it('returns the min/max envelope', () => {
    expect(recomputeBounds([{ x: -1, y: 2 }, { x: 3, y: -4 }, { x: 0, y: 5 }])).toEqual({
      minX: -1, maxX: 3, minY: -4, maxY: 5,
    });
  });
});
