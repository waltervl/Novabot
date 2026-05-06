import { describe, it, expect } from 'vitest';
import { computeAnchorRebase, exportBundle } from '../../services/portableMap.js';
import { ZipReader, BlobReader, TextWriter, type FileEntry } from '@zip.js/zip.js';

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

describe('exportBundle', () => {
  const fixture = {
    sn: 'LFIN1231000211',
    chargerLat: 52.14088864656,
    chargerLng: 6.23103579689,
    rtkQuality: 100,
    chargingPose: { x: -1.21, y: 0.48, orientation: 1.4979 },
    workMap: {
      canonical: 'map0',
      alias: 'Achtertuin',
      points: [
        { x: -2.6, y: -13.87 },
        { x: 3.3, y: -13.87 },
        { x: 3.3, y: 1.45 },
        { x: -2.6, y: 1.45 },
      ],
    },
    obstacles: [
      {
        canonical: 'map0_0_obstacle',
        alias: 'Trampoline',
        points: [
          { x: 0.06, y: -1.85 },
          { x: 0.5, y: -1.85 },
          { x: 0.5, y: -1.4 },
          { x: 0.06, y: -1.4 },
        ],
      },
    ],
    unicom: [
      {
        canonical: 'map0tocharge_unicom',
        targetMapName: 'charge',
        points: [
          { x: -1.21, y: 0.48 },
          { x: -1.0, y: 0.0 },
        ],
      },
    ],
  };

  it('produces a valid ZIP containing metadata + polygon JSONs', async () => {
    const zip = await exportBundle(fixture);
    expect(Buffer.isBuffer(zip)).toBe(true);
    expect(zip.length).toBeGreaterThan(200);

    const reader = new ZipReader(new BlobReader(new Blob([zip])));
    const entries = await reader.getEntries();
    const names = entries.map((e) => e.filename).sort();
    expect(names).toEqual([
      'geojson/obstacles.geojson',
      'geojson/unicom.geojson',
      'geojson/work.geojson',
      'metadata.json',
      'obstacles.json',
      'polygon.json',
      'unicom.json',
    ]);

    const meta = JSON.parse(
      await (entries.find((e) => e.filename === 'metadata.json') as FileEntry).getData(new TextWriter()),
    );
    expect(meta.schemaVersion).toBe(1);
    expect(meta.sourceSn).toBe(fixture.sn);
    expect(meta.sourceCharger.lat).toBeCloseTo(fixture.chargerLat, 9);
    expect(meta.originalChargingPose).toEqual(fixture.chargingPose);
    expect(meta.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);

    const polygon = JSON.parse(
      await (entries.find((e) => e.filename === 'polygon.json') as FileEntry).getData(new TextWriter()),
    );
    expect(polygon.alias).toBe('Achtertuin');
    expect(polygon.points).toHaveLength(4);
    expect(polygon.areaM2).toBeCloseTo(5.9 * 15.32, 1);

    await reader.close();
  });
});
