import { describe, it, expect } from 'vitest';
import { pointInPolygon, pointInAnyPolygon, generateUnicomPath, type XY,
  fillMissingUnicomPaths }
  from '../../maps/unicomConnector.js';
import { mapRepo } from '../../db/repositories/maps.js';

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

describe('fillMissingUnicomPaths', () => {
  const sn = 'TESTSN0001';
  it('fills a 0-byte inter-zone connector with an in-union path', () => {
    const a = JSON.stringify(square(0, 0, 2));
    const b = JSON.stringify(square(3, 0, 2)); // overlaps a in x[1,2]
    mapRepo.upsert({ map_id: 'w0', mower_sn: sn, map_name: 'map0', map_area: a,
      file_name: 'map0_work.csv', file_size: null, map_type: 'work', canonical_name: 'map0' });
    mapRepo.upsert({ map_id: 'w1', mower_sn: sn, map_name: 'map1', map_area: b,
      file_name: 'map1_work.csv', file_size: null, map_type: 'work', canonical_name: 'map1' });
    mapRepo.upsert({ map_id: 'u01', mower_sn: sn, map_name: 'map0tomap1_0_unicom', map_area: null,
      file_name: 'map0tomap1_0_unicom.csv', file_size: null, map_type: 'unicom',
      canonical_name: 'map0tomap1_0_unicom' });

    const filled = fillMissingUnicomPaths(sn);
    expect(filled).toBe(1);

    const rows = mapRepo.findAllByMowerSnAndType(sn, 'unicom');
    const u = rows.find((r) => r.canonical_name === 'map0tomap1_0_unicom')!;
    expect(u.map_area).toBeTruthy();
    const pts = JSON.parse(u.map_area as string) as XY[];
    expect(pts.length).toBeGreaterThanOrEqual(2);
    // Every persisted point must lie inside the work-union (the two zones).
    expect(pts.every((p) => pointInAnyPolygon(p, [JSON.parse(a), JSON.parse(b)]))).toBe(true);
  });

  it('leaves map*tocharge connectors untouched (regex skip, not early return)', () => {
    // Self-contained SN with its OWN two indexed work zones so the function
    // proceeds past the byIdx guard, plus a map*tocharge row. This proves the
    // tocharge channel is skipped by the regex, not by an early return.
    const sn3 = 'TESTSN0003';
    mapRepo.upsert({ map_id: 'w30', mower_sn: sn3, map_name: 'map0',
      map_area: JSON.stringify(square(0, 0, 2)),
      file_name: 'map0_work.csv', file_size: null, map_type: 'work', canonical_name: 'map0' });
    mapRepo.upsert({ map_id: 'w31', mower_sn: sn3, map_name: 'map1',
      map_area: JSON.stringify(square(3, 0, 2)),
      file_name: 'map1_work.csv', file_size: null, map_type: 'work', canonical_name: 'map1' });
    mapRepo.upsert({ map_id: 'uc3', mower_sn: sn3, map_name: 'map0tocharge_unicom',
      map_area: JSON.stringify([{ x: 0, y: 0 }, { x: 0, y: -1 }]),
      file_name: 'map0tocharge_unicom.csv', file_size: null, map_type: 'unicom',
      canonical_name: 'map0tocharge_unicom' });
    const before = mapRepo.findAllByMowerSnAndType(sn3, 'unicom')
      .find((r) => r.canonical_name === 'map0tocharge_unicom')!.map_area;
    fillMissingUnicomPaths(sn3);
    const after = mapRepo.findAllByMowerSnAndType(sn3, 'unicom')
      .find((r) => r.canonical_name === 'map0tocharge_unicom')!.map_area;
    expect(after).toBe(before);
  });
});

describe('charging-pose orientation persistence', () => {
  it('round-trips through the polygon_charging_orientation store', () => {
    const sn = 'TESTSN0002';
    mapRepo.setPolygonChargingOrientation(sn, 1.6227);
    expect(mapRepo.getPolygonChargingOrientation(sn)).toBeCloseTo(1.6227, 4);
  });
});
