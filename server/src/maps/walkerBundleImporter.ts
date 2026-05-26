/**
 * Walker bundle importer.
 *
 * Walker (RTK boundary walker) exports `.novabundle` ZIPs whose polygons live
 * in a session-local frame: origin = session start point, +X = East,
 * +Y = North. To restore those polygons onto a mower we need to express them
 * in the mower's CURRENT local frame, which has its own origin (the dock)
 * and its own heading.
 *
 * This module rotates + translates every point against the mower's live
 * `map_position` (currentDockPose) and then synthesizes a `.novabotmap`
 * portable bundle so the existing `apply-verbatim` flow can consume it
 * untouched.
 *
 * Pure: no I/O, no MQTT, no DB. All inputs in, Buffer out.
 */
import archiver from 'archiver';
import unzipper from 'unzipper';
import { PassThrough } from 'node:stream';
import { synthesizeMowerFiles } from './synthMowerFiles.js';

interface Point { x: number; y: number }
function parentMapOf(name: string): string {
  const m = name.match(/^(map\d+)/);
  return m?.[1] ?? 'map0';
}

interface Pose { x: number; y: number; orientation: number }

export interface SynthesizeOpts {
  currentDockPose: Pose;
  resolution: number;
  marginM: number;
}

interface WalkerPolygon { name: string; alias?: string; points: Point[] }
interface WalkerObstacle { name: string; parentMap?: string; points: Point[] }
interface WalkerUnicom { name: string; parentMap?: string; targetMapName?: string; points: Point[] }

export interface SynthesizeResult {
  portableZip: Buffer;
  transformedPolygons: WalkerPolygon[];
  transformedObstacles: WalkerObstacle[];
  transformedUnicom: WalkerUnicom[];
}

function rotateTranslate(p: Point, dock: Pose): Point {
  const c = Math.cos(dock.orientation);
  const s = Math.sin(dock.orientation);
  return {
    x: dock.x + p.x * c - p.y * s,
    y: dock.y + p.x * s + p.y * c,
  };
}

function shoelaceArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += (points[j].x + points[i].x) * (points[j].y - points[i].y);
  }
  return Math.abs(area) / 2;
}

interface ZipFiles {
  // text content keyed by path
  text: Map<string, string>;
}

async function readWalkerZip(buf: Buffer): Promise<ZipFiles> {
  let dir;
  try {
    dir = await unzipper.Open.buffer(buf);
  } catch (err) {
    throw new Error(`walker bundle is not a valid ZIP: ${(err as Error).message}`);
  }
  const text = new Map<string, string>();
  for (const f of dir.files) {
    if (f.type !== 'File') continue;
    const raw = await f.buffer();
    text.set(f.path, raw.toString('utf8'));
  }
  return { text };
}

function parseJsonArray<T>(content: string | undefined, where: string): T[] {
  if (content == null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`${where}: invalid JSON (${(e as Error).message})`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${where}: expected JSON array`);
  }
  return parsed as T[];
}

export async function synthesizePortableFromWalker(
  walkerZipBuffer: Buffer,
  opts: SynthesizeOpts,
): Promise<SynthesizeResult> {
  const { text } = await readWalkerZip(walkerZipBuffer);

  const polygonsContent = text.get('polygons.json');
  if (polygonsContent == null) {
    throw new Error('walker bundle missing polygons.json');
  }
  const polygons = parseJsonArray<WalkerPolygon>(polygonsContent, 'polygons.json');
  if (polygons.length === 0) {
    throw new Error('walker bundle has no work polygons');
  }
  const obstacles = parseJsonArray<WalkerObstacle>(text.get('obstacles.json'), 'obstacles.json');
  const unicom = parseJsonArray<WalkerUnicom>(text.get('unicom.json'), 'unicom.json');

  // Δ-rotate + translate every point into the mower's current local frame.
  // The walker session-start is the polygon origin (0,0). Rotating by the
  // dock's orientation then translating by its position aligns the walker
  // frame with the mower frame.
  const transformedPolygons: WalkerPolygon[] = polygons.map((p) => ({
    name: p.name,
    alias: p.alias,
    points: (p.points ?? []).map((pt) => rotateTranslate(pt, opts.currentDockPose)),
  }));
  const transformedObstacles: WalkerObstacle[] = obstacles.map((o) => ({
    name: o.name,
    parentMap: o.parentMap,
    points: (o.points ?? []).map((pt) => rotateTranslate(pt, opts.currentDockPose)),
  }));
  const transformedUnicom: WalkerUnicom[] = unicom.map((u) => ({
    name: u.name,
    parentMap: u.parentMap,
    targetMapName: u.targetMapName,
    points: (u.points ?? []).map((pt) => rotateTranslate(pt, opts.currentDockPose)),
  }));

  // parseBundle (services/portableMap.ts) requires every work polygon to
  // carry `areaM2`, every obstacle `areaM2`, every unicom `targetMapName`,
  // plus a singular `polygon.json` for the first work polygon. Walker
  // exports omit all of these — compute / derive them here so the synthetic
  // .novabotmap round-trips through parseBundle without validation errors.
  const transformedPolygonsWithArea = transformedPolygons.map((p) => ({
    ...p,
    areaM2: shoelaceArea(p.points),
  }));
  const transformedObstaclesWithArea = transformedObstacles.map((o) => ({
    ...o,
    areaM2: shoelaceArea(o.points),
  }));
  const transformedUnicomWithTarget = transformedUnicom.map((u) => {
    let targetMapName = u.targetMapName;
    if (!targetMapName && typeof u.name === 'string') {
      // Walker names unicoms like `mapNto<target>` (e.g. `map0tocharge`,
      // `map0tomap1_0`). Extract the part after `to` as the target.
      const m = u.name.match(/^map\d+to(.+)$/);
      if (m) targetMapName = m[1];
    }
    return { ...u, targetMapName: targetMapName ?? 'charge' };
  });

  // Synthesize the full mower file set (rasterized map.pgm/png/yaml + per-map +
  // csvs) via the faithful occupancy-grid generator — same path the mower
  // firmware uses, including the dock free-disc that makes coverage planning
  // succeed (retires the old free-fill polygonRasterizer).
  const synth = synthesizeMowerFiles({
    workMaps: transformedPolygons.map((p, i) => ({
      canonical: `map${i}`,
      alias: p.alias ?? `Walker map ${i}`,
      points: p.points,
    })),
    obstacles: transformedObstacles.map((o) => ({
      canonical: o.name,
      parentMap: o.parentMap ?? parentMapOf(o.name),
      points: o.points,
    })),
    unicom: transformedUnicomWithTarget.map((u) => ({
      canonical: u.name,
      targetMapName: u.targetMapName,
      points: u.points,
    })),
    chargingPose: opts.currentDockPose,
  });

  // Build the synthetic .novabotmap ZIP. Layout mirrors what apply-verbatim
  // expects (see routes/adminStatus.ts apply-verbatim handler).
  const workMapNames = transformedPolygons.map((_, i) => `map${i}`);
  const userAliases = Object.fromEntries(
    transformedPolygons.map((p, i) => [`map${i}`, p.alias ?? `Walker map ${i}`]),
  );

  const metadata = {
    schemaVersion: 1,
    sourceType: 'walker-import',
    exportedAt: new Date().toISOString(),
    sourceCharger: { lat: null, lng: null, rtkQualityAtExport: null },
    polygonOriginAnchor: { name: 'mower-dock', x: 0, y: 0 },
    originalChargingPose: opts.currentDockPose,
    workMapNames,
    userAliases,
  };

  const polygonsJson = transformedPolygonsWithArea.map((p, i) => ({
    name: `map${i}`,
    alias: p.alias ?? `Walker map ${i}`,
    points: p.points,
    areaM2: p.areaM2,
  }));

  // Singular polygon.json — first work polygon. parseBundle treats this as
  // the primary map and validates `areaM2` strictly. Required by REQUIRED_FILES.
  const firstWithArea = transformedPolygonsWithArea[0];
  const polygonSingular = {
    name: 'map0',
    alias: firstWithArea.alias ?? 'Walker map 0',
    points: firstWithArea.points,
    areaM2: firstWithArea.areaM2,
  };

  const obstaclesJson = transformedObstaclesWithArea.map((o) => ({
    name: o.name,
    parentMap: o.parentMap,
    points: o.points,
    areaM2: o.areaM2,
  }));
  const unicomJson = transformedUnicomWithTarget.map((u) => ({
    name: u.name,
    parentMap: u.parentMap,
    targetMapName: u.targetMapName,
    points: u.points,
  }));

  return await new Promise<SynthesizeResult>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const sink = new PassThrough();
    sink.on('data', (c) => chunks.push(c as Buffer));
    sink.on('end', () => {
      resolve({
        portableZip: Buffer.concat(chunks),
        transformedPolygons,
        transformedObstacles,
        transformedUnicom,
      });
    });
    sink.on('error', reject);

    const a = archiver('zip', { zlib: { level: 9 } });
    a.on('error', reject);
    a.pipe(sink);

    a.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });
    a.append(JSON.stringify(polygonSingular, null, 2), { name: 'polygon.json' });
    a.append(JSON.stringify(polygonsJson, null, 2), { name: 'polygons.json' });
    a.append(JSON.stringify(obstaclesJson, null, 2), { name: 'obstacles.json' });
    a.append(JSON.stringify(unicomJson, null, 2), { name: 'unicom.json' });

    // Mower-side files — what apply-verbatim ships back to the mower. All
    // generated by synthesizeMowerFiles (csv_file/ + map_files/ rasters +
    // charging_station.yaml).
    for (const [fname, content] of Object.entries(synth.csvFiles)) {
      a.append(content, { name: `mower/csv_file/${fname}` });
    }
    a.append(synth.chargingStationYaml, { name: 'mower/charging_station.yaml' });
    for (const [fname, content] of Object.entries(synth.mapFilesText)) {
      a.append(content, { name: `mower/map_files/${fname}` });
    }
    for (const [fname, b64] of Object.entries(synth.mapFilesB64)) {
      a.append(Buffer.from(b64, 'base64'), { name: `mower/map_files/${fname}` });
    }

    void a.finalize();
  });
}
