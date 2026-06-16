import { describe, it, expect } from 'vitest';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { PassThrough } from 'node:stream';
import { synthesizePortableFromWalker } from '../../maps/walkerBundleImporter.js';
import { parseBundle } from '../../services/portableMap.js';

// Build a walker bundle (in-memory ZIP) using archiver — same lib the rest of
// the codebase already uses for portable bundles, so no new dependency.
async function buildFixtureWalkerBundle(): Promise<Buffer> {
  const metadata = {
    schemaVersion: 1,
    sourceType: 'walker',
    walkerId: 'rtk-walker-test',
    sessionId: '12345',
    polygonOriginAnchor: { name: 'session_start', x: 0, y: 0 },
    originalChargingPose: { x: 0, y: 0, orientation: 0 },
    workMapNames: ['map0'],
    userAliases: { map0: 'Voortuin' },
  };
  const polygons = [
    {
      name: 'map0_work',
      points: [
        { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 },
      ],
    },
  ];
  const unicom = [
    { name: 'map0tocharge_unicom', parentMap: 'map0', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
  ];
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const sink = new PassThrough();
    sink.on('data', (c) => chunks.push(c as Buffer));
    sink.on('end', () => resolve(Buffer.concat(chunks)));
    sink.on('error', reject);
    const a = archiver('zip');
    a.on('error', reject);
    a.pipe(sink);
    a.append(JSON.stringify(metadata), { name: 'metadata.json' });
    a.append(JSON.stringify(polygons), { name: 'polygons.json' });
    a.append('[]', { name: 'obstacles.json' });
    a.append(JSON.stringify(unicom), { name: 'unicom.json' });
    void a.finalize();
  });
}

async function listZipEntries(buf: Buffer): Promise<Set<string>> {
  const dir = await unzipper.Open.buffer(buf);
  return new Set(dir.files.filter((f) => f.type === 'File').map((f) => f.path));
}

describe('synthesizePortableFromWalker', () => {
  it('Δ-translates polygons to currentDockPose and produces a portable bundle with raster', async () => {
    const walkerZip = await buildFixtureWalkerBundle();
    const result = await synthesizePortableFromWalker(walkerZip, {
      currentDockPose: { x: 2, y: 1, orientation: 0 },
      resolution: 0.5,
      marginM: 0,
    });
    expect(result.portableZip.byteLength).toBeGreaterThan(0);
    expect(result.transformedPolygons).toHaveLength(1);
    expect(result.transformedPolygons[0].points[0]).toEqual({ x: 2, y: 1 });
    expect(result.transformedPolygons[0].points[1]).toEqual({ x: 7, y: 1 });

    const entries = await listZipEntries(result.portableZip);
    expect(entries.has('mower/csv_file/map0_work.csv')).toBe(true);
    expect(entries.has('mower/map_files/map.pgm')).toBe(true);
    expect(entries.has('mower/map_files/map.yaml')).toBe(true);
  });

  it('applies rotation when currentDockPose has non-zero orientation', async () => {
    const walkerZip = await buildFixtureWalkerBundle();
    const result = await synthesizePortableFromWalker(walkerZip, {
      currentDockPose: { x: 0, y: 0, orientation: Math.PI / 2 }, // 90 deg
      resolution: 0.5,
      marginM: 0,
    });
    // Original (5,0) rotated 90 deg = (0,5) — within float tolerance.
    const p1 = result.transformedPolygons[0].points[1];
    expect(p1.x).toBeCloseTo(0, 5);
    expect(p1.y).toBeCloseTo(5, 5);
  });

  it('synth output round-trips through parseBundle without validation errors', async () => {
    const walkerZip = await buildFixtureWalkerBundle();
    const synth = await synthesizePortableFromWalker(walkerZip, {
      currentDockPose: { x: 2, y: 1, orientation: 0.1 },
      resolution: 0.5,
      marginM: 0,
    });
    // Should NOT throw.
    const parsed = await parseBundle(synth.portableZip);
    expect(parsed.polygon).toBeDefined();
    expect(parsed.polygon.areaM2).toBeGreaterThan(0);
    expect(parsed.polygons.length).toBeGreaterThan(0);
    expect(parsed.polygons[0].areaM2).toBeGreaterThan(0);
  });

  it('derives unicom targetMapName from the name pattern', async () => {
    const metadata = {
      schemaVersion: 1, sourceType: 'walker', workMapNames: ['map0'],
      userAliases: { map0: 'Voortuin' },
    };
    const polygons = [{
      name: 'map0_work',
      points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }],
    }];
    const unicom = [
      { name: 'map0tocharge_unicom', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
      { name: 'map0tomap1_0_unicom', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
    ];
    const walkerZip: Buffer = await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const sink = new PassThrough();
      sink.on('data', (c) => chunks.push(c as Buffer));
      sink.on('end', () => resolve(Buffer.concat(chunks)));
      sink.on('error', reject);
      const a = archiver('zip');
      a.on('error', reject);
      a.pipe(sink);
      a.append(JSON.stringify(metadata), { name: 'metadata.json' });
      a.append(JSON.stringify(polygons), { name: 'polygons.json' });
      a.append('[]', { name: 'obstacles.json' });
      a.append(JSON.stringify(unicom), { name: 'unicom.json' });
      void a.finalize();
    });
    const synth = await synthesizePortableFromWalker(walkerZip, {
      // Non-zero dock pose: a real docked mower is never {0,0,0}, and the
      // synth path now fails closed on a zeroed pose. The value is incidental
      // to this test (it asserts unicom-target derivation, not the pose).
      currentDockPose: { x: 2, y: 1, orientation: 0 },
      resolution: 0.5, marginM: 0,
    });
    const parsed = await parseBundle(synth.portableZip);
    expect(parsed.unicom[0].targetMapName).toBe('charge');
    expect(parsed.unicom[1].targetMapName).toBe('map1_0');
  });

  it('anchors the import on the charger side of map0tocharge and reverses the CSV when needed', async () => {
    const metadata = {
      schemaVersion: 1, sourceType: 'walker', workMapNames: ['map0'],
      userAliases: { map0: 'Voortuin' },
    };
    const polygons = [{
      name: 'map0',
      points: [{ x: 10, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 5 }, { x: 10, y: 5 }],
    }];
    // Walked from polygon edge back to charger. The importer must identify
    // the last endpoint as the charger anchor and reverse the output so the
    // mower sees row 1 at the dock, matching stock map0tocharge_unicom.csv.
    const unicom = [
      { name: 'map0tocharge_unicom', points: [{ x: 10, y: 0 }, { x: 0, y: 0 }] },
    ];
    const walkerZip: Buffer = await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const sink = new PassThrough();
      sink.on('data', (c) => chunks.push(c as Buffer));
      sink.on('end', () => resolve(Buffer.concat(chunks)));
      sink.on('error', reject);
      const a = archiver('zip');
      a.on('error', reject);
      a.pipe(sink);
      a.append(JSON.stringify(metadata), { name: 'metadata.json' });
      a.append(JSON.stringify(polygons), { name: 'polygons.json' });
      a.append('[]', { name: 'obstacles.json' });
      a.append(JSON.stringify(unicom), { name: 'unicom.json' });
      void a.finalize();
    });

    const synth = await synthesizePortableFromWalker(walkerZip, {
      currentDockPose: { x: 2, y: 1, orientation: 0 },
      resolution: 0.5,
      marginM: 0,
    });
    expect(synth.transformedPolygons[0].points[0]).toEqual({ x: 12, y: 1 });
    expect(synth.transformedUnicom[0].points[0]).toEqual({ x: 2, y: 1 });
    expect(synth.transformedUnicom[0].points[1]).toEqual({ x: 12, y: 1 });

    const parsed = await parseBundle(synth.portableZip);
    expect(parsed.unicom[0].points[0]).toEqual({ x: 2, y: 1 });
  });

  it('rejects walker bundles without a map-to-charger unicom', async () => {
    const metadata = {
      schemaVersion: 1, sourceType: 'walker', workMapNames: ['map0'],
      userAliases: { map0: 'Voortuin' },
    };
    const polygons = [{
      name: 'map0',
      points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }],
    }];
    const walkerZip: Buffer = await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const sink = new PassThrough();
      sink.on('data', (c) => chunks.push(c as Buffer));
      sink.on('end', () => resolve(Buffer.concat(chunks)));
      sink.on('error', reject);
      const a = archiver('zip');
      a.on('error', reject);
      a.pipe(sink);
      a.append(JSON.stringify(metadata), { name: 'metadata.json' });
      a.append(JSON.stringify(polygons), { name: 'polygons.json' });
      a.append('[]', { name: 'obstacles.json' });
      a.append('[]', { name: 'unicom.json' });
      void a.finalize();
    });

    await expect(
      synthesizePortableFromWalker(walkerZip, {
        currentDockPose: { x: 0, y: 0, orientation: 0 },
        resolution: 0.5,
        marginM: 0,
      }),
    ).rejects.toThrow(/map0tocharge_unicom/);
  });

  it('rejects a zeroed/invalid currentDockPose (never synthesizes a {0,0,0} bundle)', async () => {
    const walkerZip = await buildFixtureWalkerBundle();
    // All-zero dock pose — the corruption signature that broke mower .100.
    await expect(
      synthesizePortableFromWalker(walkerZip, {
        currentDockPose: { x: 0, y: 0, orientation: 0 },
        resolution: 0.5,
        marginM: 0,
      }),
    ).rejects.toThrow(/zeroed\/invalid mower dock pose/);

    // Non-finite component is rejected too.
    await expect(
      synthesizePortableFromWalker(walkerZip, {
        currentDockPose: { x: 2, y: NaN, orientation: 0.1 },
        resolution: 0.5,
        marginM: 0,
      }),
    ).rejects.toThrow(/zeroed\/invalid mower dock pose/);
  });

  it('rejects bundles missing polygons.json', async () => {
    const buf: Buffer = await new Promise((res, rej) => {
      const chunks: Buffer[] = [];
      const sink = new PassThrough();
      sink.on('data', (c) => chunks.push(c as Buffer));
      sink.on('end', () => res(Buffer.concat(chunks)));
      const a = archiver('zip');
      a.on('error', rej);
      a.pipe(sink);
      a.append('{}', { name: 'metadata.json' });
      void a.finalize();
    });
    await expect(
      synthesizePortableFromWalker(buf, {
        currentDockPose: { x: 0, y: 0, orientation: 0 },
        resolution: 0.5,
        marginM: 0,
      }),
    ).rejects.toThrow();
  });
});
