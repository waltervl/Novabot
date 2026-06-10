import { describe, it, expect } from 'vitest';
import {
  polygonArea, pointInPolygon, densifyPolygon, simplifyPolygon,
} from '../../maps/editGeometry.js';

const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

describe('editGeometry basics', () => {
  it('polygonArea: 10x10 vierkant = 100 m²', () => {
    expect(polygonArea(square)).toBeCloseTo(100, 6);
    expect(polygonArea([...square].reverse())).toBeCloseTo(100, 6); // winding-onafhankelijk
  });

  it('pointInPolygon: binnen/buiten', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
  });

  it('densifyPolygon: max afstand tussen opvolgende punten ≤ spacing', () => {
    const dense = densifyPolygon(square, 1.0);
    for (let i = 0; i < dense.length; i++) {
      const a = dense[i], b = dense[(i + 1) % dense.length];
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThanOrEqual(1.0 + 1e-9);
    }
    expect(dense.length).toBeGreaterThanOrEqual(40); // 40m omtrek / 1m
  });

  it('simplifyPolygon: verwijdert collineaire punten, behoudt hoeken', () => {
    const noisy = densifyPolygon(square, 0.5);          // 80 punten op rechte randen
    const simple = simplifyPolygon(noisy, 0.05);
    expect(simple.length).toBeLessThanOrEqual(8);        // ~4 hoekpunten
    expect(polygonArea(simple)).toBeCloseTo(100, 1);     // vorm behouden
  });

  it('simplifyPolygon: laat kleine polygonen (<4 punten) intact', () => {
    const tri = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
    expect(simplifyPolygon(tri, 0.5)).toEqual(tri);
  });
});
