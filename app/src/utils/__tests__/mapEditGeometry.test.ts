// MIRROR of server/src/__tests__/maps/editGeometry.test.ts. mapEditGeometry.ts
// is an intentional copy of the server's editGeometry.ts (source of truth); this
// test pins the app copy to identical behaviour so drift between the two fails
// CI instead of silently shipping. Keep in sync when the server test changes.
import { describe, it, expect } from 'vitest';
import {
  polygonArea, pointInPolygon, densifyPolygon, simplifyPolygon,
  selfIntersects, polygonContains, maxDisplacement, validateMapSet,
  applyBrush, hitTestVertex, hitTestEdge,
} from '../mapEditGeometry';

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

  it('densifyPolygon: guard tegen maxSpacing <= 0 (infinite-loop preventie)', () => {
    expect(densifyPolygon(square, 0)).toEqual(square);
    expect(densifyPolygon(square, NaN)).toEqual(square);
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

  it('simplifyPolygon: safety fallback — resultaat altijd ≥ 3 punten', () => {
    expect(simplifyPolygon(densifyPolygon(square, 0.5), 1000).length).toBeGreaterThanOrEqual(3);
  });
});

describe('editGeometry validatie', () => {
  it('selfIntersects: vlinder-polygon = true, vierkant = false', () => {
    const bowtie = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    expect(selfIntersects(bowtie)).toBe(true);
    expect(selfIntersects(square)).toBe(false);
  });

  it('polygonContains: obstacle binnen work = true, half erbuiten = false', () => {
    const inner = [{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }];
    const sticking = [{ x: 8, y: 8 }, { x: 12, y: 8 }, { x: 12, y: 12 }, { x: 8, y: 12 }];
    expect(polygonContains(square, inner)).toBe(true);
    expect(polygonContains(square, sticking)).toBe(false);
  });

  it('polygonContains: vangt edge-crossing met alle vertices binnen', () => {
    const cShape = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 2, y: 4 },
                    { x: 2, y: 6 }, { x: 10, y: 6 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const crossing = [{ x: 1, y: 1 }, { x: 1, y: 9 }, { x: 0.5, y: 9 }, { x: 0.5, y: 1 }];
    expect(polygonContains(cShape, crossing)).toBe(true); // links van de inham — ok
    const through = [{ x: 1, y: 3 }, { x: 9, y: 3 }, { x: 9, y: 7 }, { x: 1, y: 7 }];
    expect(polygonContains(cShape, through)).toBe(false); // dekt de inham
  });

  it('maxDisplacement: meet grootste verschuiving t.o.v. origineel', () => {
    const shifted = square.map(p => (p.x === 10 ? { x: 10.8, y: p.y } : p));
    const d = maxDisplacement(shifted, square);
    expect(d).toBeGreaterThan(0.7);
    expect(d).toBeLessThan(0.9);
    expect(maxDisplacement(square, square)).toBeCloseTo(0, 6);
  });

  it('validateMapSet: editedCanonicals — onaangeraakte (zelf-kruisende) map blokkeert niet', () => {
    const bowtie = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }]; // zelf-kruisend
    const goodObstacle = [{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }];
    // map0 (zelf-kruisend) is NIET bewerkt; alleen het obstakel is een draft.
    const res = validateMapSet({
      work: [{ canonical: 'map0', points: bowtie }],
      obstacles: [{ canonical: 'map0_0_obstacle', parentMap: 'map0', points: goodObstacle }],
    }, new Map(), new Set(['map0_0_obstacle']));
    // map0's self-intersect mag NIET als fout verschijnen; het obstakel is geldig.
    expect(res.errors.some(e => e.canonical === 'map0')).toBe(false);
    // Zonder editedCanonicals zou map0 wél falen (backwards-compat):
    const all = validateMapSet({
      work: [{ canonical: 'map0', points: bowtie }],
      obstacles: [],
    }, new Map());
    expect(all.errors.some(e => e.canonical === 'map0' && e.code === 'self_intersect')).toBe(true);
  });

  it('validateMapSet: goede set = ok, fouten worden per canonical gemeld', () => {
    const ok = validateMapSet({
      work: [{ canonical: 'map0', points: square }],
      obstacles: [{ canonical: 'map0_0_obstacle', parentMap: 'map0',
        points: [{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }] }],
    }, new Map());
    expect(ok.ok).toBe(true);
    expect(ok.errors).toEqual([]);

    const bad = validateMapSet({
      work: [{ canonical: 'map0', points: square }],
      obstacles: [
        { canonical: 'map0_0_obstacle', parentMap: 'map0',
          points: [{ x: 9, y: 9 }, { x: 12, y: 9 }, { x: 12, y: 12 }, { x: 9, y: 12 }] },
        { canonical: 'map0_1_obstacle', parentMap: 'map0',
          points: [{ x: 2, y: 2 }, { x: 2.3, y: 2 }, { x: 2.3, y: 2.3 }] },
      ],
    }, new Map());
    expect(bad.ok).toBe(false);
    expect(bad.errors.some(e => e.canonical === 'map0_0_obstacle' && e.code === 'outside_work')).toBe(true);
    expect(bad.errors.some(e => e.canonical === 'map0_1_obstacle' && e.code === 'too_small')).toBe(true);
  });

  it('validateMapSet: >1m verschuiving = warning, geen error', () => {
    const moved = square.map(p => (p.x === 10 ? { x: 11.5, y: p.y } : p));
    const res = validateMapSet(
      { work: [{ canonical: 'map0', points: moved }], obstacles: [] },
      new Map([['map0', square]]),
    );
    expect(res.ok).toBe(true);
    expect(res.warnings.some(w => w.canonical === 'map0' && w.code === 'large_displacement')).toBe(true);
  });

  it('validateMapSet: obstacle met onbekende parentMap = unknown_parent error', () => {
    const res = validateMapSet({
      work: [{ canonical: 'map0', points: square }],
      obstacles: [{ canonical: 'map9_0_obstacle', parentMap: 'map9',
        points: [{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }] }],
    }, new Map());
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.canonical === 'map9_0_obstacle' && e.code === 'unknown_parent')).toBe(true);
  });

  it('validateMapSet: werkkaart met 2 punten = too_few_points', () => {
    const res = validateMapSet({
      work: [{ canonical: 'map0', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }],
      obstacles: [],
    }, new Map());
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.canonical === 'map0' && e.code === 'too_few_points')).toBe(true);
  });

  it('validateMapSet: vlinder werkkaart = self_intersect', () => {
    const bowtie = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    const res = validateMapSet({
      work: [{ canonical: 'map0', points: bowtie }],
      obstacles: [],
    }, new Map());
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.canonical === 'map0' && e.code === 'self_intersect')).toBe(true);
  });
});

describe('editGeometry brush + hit-test', () => {
  it('applyBrush: verplaatst alleen punten binnen radius, met falloff', () => {
    const dense = densifyPolygon(square, 0.5);
    const anchor = { x: 5, y: 0 };
    const out = applyBrush(dense, anchor, { x: 0, y: 1 }, 2.0);
    const moved = out.filter((p, i) => Math.abs(p.y - dense[i].y) > 1e-9);
    expect(moved.length).toBeGreaterThan(0);
    const center = dense.findIndex(p => Math.abs(p.x - 5) < 0.01 && Math.abs(p.y) < 0.01);
    expect(out[center].y).toBeCloseTo(1, 2);
    const farIdx = dense.findIndex(p => Math.abs(p.x - 5) > 3 && Math.abs(p.y) < 0.01);
    expect(out[farIdx].y).toBeCloseTo(0, 9);
    const halfway = dense.findIndex(p => Math.abs(p.x - 6) < 0.01 && Math.abs(p.y) < 0.01);
    expect(out[halfway].y).toBeGreaterThan(0.1);
    expect(out[halfway].y).toBeLessThan(0.95);
  });

  it('hitTestVertex: vindt dichtstbijzijnde vertex binnen tolerantie', () => {
    expect(hitTestVertex(square, { x: 10.2, y: -0.1 }, 0.5)).toBe(1);
    expect(hitTestVertex(square, { x: 5, y: 5 }, 0.5)).toBe(-1);
  });

  it('hitTestEdge: geeft invoeg-index op het geraakte segment', () => {
    const hit = hitTestEdge(square, { x: 5, y: 0.1 }, 0.5);
    expect(hit).toEqual({ insertIndex: 1, point: { x: 5, y: 0 } });
    expect(hitTestEdge(square, { x: 5, y: 5 }, 0.5)).toBeNull();
  });

  it('hitTestEdge: sluitend segment (0,10)->(0,0) wordt correct geraakt', () => {
    // square = [{0,0},{10,0},{10,10},{0,10}]; sluitend segment is i=3: (0,10)->(0,0)
    const hit = hitTestEdge(square, { x: 0.1, y: 5 }, 0.5);
    expect(hit).not.toBeNull();
    expect(hit!.insertIndex).toBe(4);
    expect(hit!.point.x).toBeCloseTo(0, 6);
    expect(hit!.point.y).toBeCloseTo(5, 6);
  });
});
