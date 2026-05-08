import { createHash } from 'node:crypto';
import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import unzipper from 'unzipper';

export interface XY {
  x: number;
  y: number;
}

/**
 * Rotate every point by theta radians around the origin (the charger anchor
 * in bundle coordinates is at (0, 0)). Sign convention matches gpsToLocal:
 *   x_out =  x*cos + y*sin
 *   y_out = -x*sin + y*cos
 * so a positive theta rotates the polygon clockwise when looking down at the
 * map from above (+y is north, +x is east).
 */
export function computeAnchorRebase(points: XY[], theta: number): XY[] {
  if (points.length === 0) return [];
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return points.map((p) => ({
    x: p.x * cos + p.y * sin,
    y: -p.x * sin + p.y * cos,
  }));
}

export interface ExportPolygon {
  canonical: string;
  alias: string;
  points: XY[];
}

export interface ExportUnicom {
  canonical: string;
  targetMapName: string;
  points: XY[];
}

export interface ExportInput {
  sn: string;
  chargerLat: number;
  chargerLng: number;
  rtkQuality: number | null;
  chargingPose: { x: number; y: number; orientation: number };
  workMap: ExportPolygon;
  obstacles: ExportPolygon[];
  unicom: ExportUnicom[];
  /** Verbatim CSVs from /userdata/lfi/maps/home0/csv_file/ on the mower at
   * export time. Captured via MQTT extended `read_map_files`. Keyed by
   * filename (e.g. `map0_work.csv`, `map_info.json`, etc). Restoring these
   * back to disk on the same mower preserves exact firmware state. */
  csvFilesRaw?: Record<string, string>;
  /** Verbatim contents of /userdata/lfi/charging_station_file/charging_station.yaml
   * at export time. Single line: `charging_pose: [x, y, theta]`. */
  chargingStationYaml?: string;
}

const SCHEMA_VERSION = 1;
const METERS_PER_DEG = 111320;

function polygonAreaM2(pts: XY[]): number {
  if (pts.length < 3) return 0;
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    acc += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(acc) / 2;
}

function bounds(pts: XY[]) {
  if (pts.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

function localToGps(p: XY, originLat: number, originLng: number): [number, number] {
  // Inverse of gpsToLocal with theta=0 (charger-relative bundle frame).
  const cosLat = Math.cos((originLat * Math.PI) / 180);
  const lng = originLng + p.x / (cosLat * METERS_PER_DEG);
  const lat = originLat + p.y / METERS_PER_DEG;
  return [lng, lat];
}

function buildGeoJson(
  features: Array<{ name: string; type: 'Polygon' | 'LineString'; pts: XY[] }>,
  originLat: number,
  originLng: number,
): unknown {
  return {
    type: 'FeatureCollection',
    features: features.map((f) => {
      const ring = f.pts.map((p) => localToGps(p, originLat, originLng));
      if (f.type === 'Polygon') {
        ring.push(ring[0]);
        return {
          type: 'Feature',
          properties: { name: f.name },
          geometry: { type: 'Polygon', coordinates: [ring] },
        };
      }
      return {
        type: 'Feature',
        properties: { name: f.name },
        geometry: { type: 'LineString', coordinates: ring },
      };
    }),
  };
}

export async function exportBundle(input: ExportInput): Promise<Buffer> {
  const polygonJson = {
    name: input.workMap.canonical,
    alias: input.workMap.alias,
    areaM2: polygonAreaM2(input.workMap.points),
    points: input.workMap.points,
  };
  const obstaclesJson = input.obstacles.map((o) => ({
    name: o.canonical,
    alias: o.alias,
    areaM2: polygonAreaM2(o.points),
    points: o.points,
  }));
  const unicomJson = input.unicom.map((u) => ({
    name: u.canonical,
    targetMapName: u.targetMapName,
    points: u.points,
  }));

  const allPts = [
    ...input.workMap.points,
    ...input.obstacles.flatMap((o) => o.points),
    ...input.unicom.flatMap((u) => u.points),
  ];

  const userAliases: Record<string, string> = {};
  for (const o of input.obstacles) userAliases[o.canonical] = o.alias;

  const checksumSrc = JSON.stringify({ polygonJson, obstaclesJson, unicomJson });
  const checksum = `sha256:${createHash('sha256').update(checksumSrc).digest('hex')}`;

  const metadata = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sourceSn: input.sn,
    sourceCharger: {
      lat: input.chargerLat,
      lng: input.chargerLng,
      rtkQualityAtExport: input.rtkQuality,
    },
    polygonOriginAnchor: {
      name: 'charger',
      x: 0,
      y: 0,
      comment:
        'All polygon coordinates relative to charger position. Charger heading at export = ' +
        String(input.chargingPose.orientation) +
        ' rad.',
    },
    originalChargingPose: input.chargingPose,
    originalMapAreaName: input.workMap.alias,
    userAliases,
    boundsM: bounds(allPts),
    checksum,
  };

  const workGeo = buildGeoJson(
    [{ name: input.workMap.alias, type: 'Polygon', pts: input.workMap.points }],
    input.chargerLat,
    input.chargerLng,
  );
  const obsGeo = buildGeoJson(
    input.obstacles.map((o) => ({ name: o.alias, type: 'Polygon' as const, pts: o.points })),
    input.chargerLat,
    input.chargerLng,
  );
  const uniGeo = buildGeoJson(
    input.unicom.map((u) => ({ name: u.targetMapName, type: 'LineString' as const, pts: u.points })),
    input.chargerLat,
    input.chargerLng,
  );

  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const sink = new PassThrough();
    sink.on('data', (c) => chunks.push(c as Buffer));
    sink.on('end', () => resolve(Buffer.concat(chunks)));
    sink.on('error', reject);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', reject);
    archive.pipe(sink);

    archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });
    archive.append(JSON.stringify(polygonJson, null, 2), { name: 'polygon.json' });
    archive.append(JSON.stringify(obstaclesJson, null, 2), { name: 'obstacles.json' });
    archive.append(JSON.stringify(unicomJson, null, 2), { name: 'unicom.json' });
    archive.append(JSON.stringify(workGeo, null, 2), { name: 'geojson/work.geojson' });
    archive.append(JSON.stringify(obsGeo, null, 2), { name: 'geojson/obstacles.geojson' });
    archive.append(JSON.stringify(uniGeo, null, 2), { name: 'geojson/unicom.geojson' });

    // Verbatim mower files — when present, an exact-restore import skips
    // the rebuild-from-DB path and ships these straight back to the mower
    // (with rotation+translation derived from charging_pose delta applied).
    if (input.csvFilesRaw) {
      for (const [fname, content] of Object.entries(input.csvFilesRaw)) {
        archive.append(content, { name: `mower/csv_file/${fname}` });
      }
    }
    if (input.chargingStationYaml) {
      archive.append(input.chargingStationYaml, { name: 'mower/charging_station.yaml' });
    }

    void archive.finalize();
  });
}

// ---------------------------------------------------------------------------
// parseBundle — Task 4
// ---------------------------------------------------------------------------

export class BundleValidationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'BundleValidationError';
  }
}

export interface ParsedBundle {
  metadata: {
    schemaVersion: number;
    exportedAt: string;
    sourceSn: string;
    sourceCharger: { lat: number; lng: number; rtkQualityAtExport: number | null };
    originalChargingPose: { x: number; y: number; orientation: number };
    originalMapAreaName: string;
    userAliases: Record<string, string>;
    checksum: string;
  };
  polygon: { name: string; alias: string; areaM2: number; points: XY[] };
  obstacles: Array<{ name: string; alias: string; areaM2: number; points: XY[] }>;
  unicom: Array<{ name: string; targetMapName: string; points: XY[] }>;
  /** Verbatim mower files captured at export. Optional — older bundles
   * without these fall back to DB-reconstructed CSVs. */
  mowerFiles?: {
    csvFiles: Record<string, string>;
    chargingStationYaml: string | null;
  };
}

const REQUIRED_FILES = ['metadata.json', 'polygon.json', 'obstacles.json', 'unicom.json'];
const MIN_AREA_M2 = 5;

function assertObject(v: unknown, where: string): asserts v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new BundleValidationError(`${where}: expected object`);
  }
}

function assertNumber(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new BundleValidationError(`${where}: expected finite number, got ${String(v)}`);
  }
  return v;
}

function assertPoints(v: unknown, where: string): XY[] {
  if (!Array.isArray(v)) throw new BundleValidationError(`${where}: expected array`);
  return v.map((p, i) => {
    assertObject(p, `${where}[${i}]`);
    return { x: assertNumber(p.x, `${where}[${i}].x`), y: assertNumber(p.y, `${where}[${i}].y`) };
  });
}

export async function parseBundle(buf: Buffer): Promise<ParsedBundle> {
  let entries: Map<string, string>;
  try {
    const dir = await unzipper.Open.buffer(buf);
    entries = new Map();
    for (const f of dir.files) {
      if (f.type === 'File') entries.set(f.path, (await f.buffer()).toString('utf8'));
    }
  } catch (e) {
    throw new BundleValidationError(`not a valid ZIP: ${(e as Error).message}`);
  }

  for (const r of REQUIRED_FILES) {
    if (!entries.has(r)) throw new BundleValidationError(`missing ${r} in bundle`);
  }

  const metaRaw = JSON.parse(entries.get('metadata.json')!) as unknown;
  assertObject(metaRaw, 'metadata.json');
  if (metaRaw.schemaVersion !== 1) {
    throw new BundleValidationError(`unsupported schemaVersion ${String(metaRaw.schemaVersion)}, expected 1`);
  }

  const polygonRaw = JSON.parse(entries.get('polygon.json')!) as unknown;
  assertObject(polygonRaw, 'polygon.json');
  const polygon = {
    name: String(polygonRaw.name ?? ''),
    alias: String(polygonRaw.alias ?? ''),
    areaM2: assertNumber(polygonRaw.areaM2, 'polygon.areaM2'),
    points: assertPoints(polygonRaw.points, 'polygon.points'),
  };
  if (polygon.areaM2 < MIN_AREA_M2) {
    throw new BundleValidationError(`polygon area ${polygon.areaM2.toFixed(2)} m^2 below ${MIN_AREA_M2} m^2 minimum`);
  }

  const obstaclesRaw = JSON.parse(entries.get('obstacles.json')!) as unknown;
  if (!Array.isArray(obstaclesRaw)) throw new BundleValidationError('obstacles.json: expected array');
  const obstacles = obstaclesRaw.map((o: unknown, i: number) => {
    assertObject(o, `obstacles[${i}]`);
    return {
      name: String(o.name ?? ''),
      alias: String(o.alias ?? ''),
      areaM2: assertNumber(o.areaM2, `obstacles[${i}].areaM2`),
      points: assertPoints(o.points, `obstacles[${i}].points`),
    };
  });

  const unicomRaw = JSON.parse(entries.get('unicom.json')!) as unknown;
  if (!Array.isArray(unicomRaw)) throw new BundleValidationError('unicom.json: expected array');
  const unicom = unicomRaw.map((u: unknown, i: number) => {
    assertObject(u, `unicom[${i}]`);
    return {
      name: String(u.name ?? ''),
      targetMapName: String(u.targetMapName ?? ''),
      points: assertPoints(u.points, `unicom[${i}].points`),
    };
  });

  // Optional verbatim mower files — present in bundles exported with
  // exact-restore data captured live from the mower. Older bundles omit
  // these; downstream import handles the absence by falling back to
  // DB-reconstructed CSVs.
  const csvFiles: Record<string, string> = {};
  let chargingStationYaml: string | null = null;
  for (const [path, content] of entries.entries()) {
    if (path.startsWith('mower/csv_file/')) {
      const fname = path.slice('mower/csv_file/'.length);
      if (fname && !fname.includes('/')) csvFiles[fname] = content;
    } else if (path === 'mower/charging_station.yaml') {
      chargingStationYaml = content;
    }
  }
  const mowerFiles = Object.keys(csvFiles).length > 0 || chargingStationYaml !== null
    ? { csvFiles, chargingStationYaml }
    : undefined;

  return {
    metadata: metaRaw as ParsedBundle['metadata'],
    polygon, obstacles, unicom,
    mowerFiles,
  };
}
