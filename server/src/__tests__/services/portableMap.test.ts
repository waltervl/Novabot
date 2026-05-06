import { describe, it, expect } from 'vitest';
import { computeAnchorRebase } from '../../services/portableMap.js';

describe('computeAnchorRebase', () => {
  it('identity rotation returns input unchanged', () => {
    const out = computeAnchorRebase([{ x: 1, y: 2 }, { x: -3, y: 4 }], 0);
    expect(out[0].x).toBeCloseTo(1, 9);
    expect(out[0].y).toBeCloseTo(2, 9);
    expect(out[1].x).toBeCloseTo(-3, 9);
    expect(out[1].y).toBeCloseTo(4, 9);
  });

  it('90 deg rotation maps (1,0) to (0,-1)', () => {
    const out = computeAnchorRebase([{ x: 1, y: 0 }], Math.PI / 2);
    expect(out[0].x).toBeCloseTo(0, 9);
    expect(out[0].y).toBeCloseTo(-1, 9);
  });

  it('-90 deg rotation maps (1,0) to (0,1)', () => {
    const out = computeAnchorRebase([{ x: 1, y: 0 }], -Math.PI / 2);
    expect(out[0].x).toBeCloseTo(0, 9);
    expect(out[0].y).toBeCloseTo(1, 9);
  });

  it('180 deg rotation negates both axes', () => {
    const out = computeAnchorRebase([{ x: 2, y: -3 }], Math.PI);
    expect(out[0].x).toBeCloseTo(-2, 9);
    expect(out[0].y).toBeCloseTo(3, 9);
  });

  it('preserves point count', () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ x: i, y: -i }));
    const out = computeAnchorRebase(pts, 0.42);
    expect(out).toHaveLength(50);
  });

  it('empty input returns empty array', () => {
    expect(computeAnchorRebase([], 1.5)).toEqual([]);
  });
});
