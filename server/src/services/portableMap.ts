import { createHash } from 'node:crypto';
import archiver from 'archiver';
import { PassThrough } from 'node:stream';

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

    void archive.finalize();
  });
}
