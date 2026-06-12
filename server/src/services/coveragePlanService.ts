import crypto from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  generateOccupancyGrid,
  type MapInput,
  type XY,
} from '../maps/occupancyGrid.js';
import {
  generateCoveragePlanWithNative,
  type CoverageNativeExecFile,
  type CoverageNativeJson,
} from './coverageNative.js';

export interface CoveragePlanMapRow {
  canonical_name: string | null;
  file_name: string | null;
  map_area: string | null;
  map_name: string | null;
  map_type: string;
}

export interface CoverageMapMetadata {
  width: number;
  height: number;
  resolution: number;
  originX: number;
  originY: number;
}

export interface CoverageDashboardPath {
  id: string;
  points: XY[];
}

export interface CoveragePlanResult {
  canonical: string;
  areaId: number;
  pgmMd5: string;
  cacheKey: string;
  cacheHit: boolean;
  coverageRadius?: number;
  metadata: CoverageMapMetadata;
  startGrid: { x: number; y: number };
  plannedPath: CoverageNativeJson;
  paths: CoverageDashboardPath[];
}

export interface GenerateNativeCoveragePlanFromRowsOptions {
  mowerSn: string;
  rows: CoveragePlanMapRow[];
  canonical: string;
  startLocal: XY;
  chargingPose: MapInput['chargingPose'];
  covDirection?: number;
  coverageRadius?: number;
  expectedPgmMd5?: string;
  binaryPath?: string;
  timeoutMs?: number;
  execFile?: CoverageNativeExecFile;
  cache?: Map<string, CachedCoveragePlan>;
  tempDir?: string;
}

type CachedCoveragePlan = Omit<CoveragePlanResult, 'cacheHit'>;

const RESOLUTION_EPS = 1e-9;
const defaultCache = new Map<string, CachedCoveragePlan>();

function canonicalFromRow(row: CoveragePlanMapRow): string | null {
  if (row.canonical_name) return row.canonical_name;
  const source = row.file_name ?? row.map_name;
  if (!source) return null;
  const base = source.endsWith('.csv') ? source.slice(0, -4) : source;
  const workMatch = base.match(/^(map\d+)_work$/);
  return workMatch?.[1] ?? base;
}

function parsePoints(row: CoveragePlanMapRow): XY[] {
  if (!row.map_area) return [];
  const raw = JSON.parse(row.map_area) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      if (p === null || typeof p !== 'object') return null;
      const point = p as { x?: unknown; y?: unknown };
      const x = Number(point.x);
      const y = Number(point.y);
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    })
    .filter((p): p is XY => p !== null);
}

function parentMapFromObstacle(canonical: string): string | null {
  return canonical.match(/^(map\d+)_\d+_obstacle$/)?.[1] ?? null;
}

export function areaIdFromCanonical(canonical: string): number {
  const match = canonical.match(/^map(\d+)$/);
  return match ? Number(match[1]) + 1 : 1;
}

export function mapRowsToCoverageInput(
  rows: CoveragePlanMapRow[],
  chargingPose: MapInput['chargingPose'],
): MapInput {
  const workMaps: MapInput['workMaps'] = [];
  const obstacles: MapInput['obstacles'] = [];
  const unicom: MapInput['unicom'] = [];

  for (const row of rows) {
    const canonical = canonicalFromRow(row);
    if (!canonical) continue;
    const points = parsePoints(row);

    if (row.map_type === 'work' && points.length >= 3) {
      workMaps.push({ canonical, points });
    } else if (row.map_type === 'obstacle' && points.length >= 3) {
      const parentMap = parentMapFromObstacle(canonical);
      if (parentMap) obstacles.push({ parentMap, points });
    } else if (row.map_type === 'unicom' && points.length > 0) {
      unicom.push({ name: canonical, points });
    }
  }

  if (workMaps.length === 0) {
    throw new Error('coverage planner: no work maps with polygon data');
  }

  return { workMaps, obstacles, unicom, chargingPose };
}

function pgmDimensions(pgm: Buffer): { width: number; height: number } {
  const tokens: string[] = [];
  let i = 0;
  while (i < pgm.length && tokens.length < 4) {
    const ch = pgm[i];
    if (ch === 35) {
      while (i < pgm.length && pgm[i] !== 10) i += 1;
      continue;
    }
    if (ch <= 32) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < pgm.length && pgm[i] > 32) i += 1;
    tokens.push(pgm.subarray(start, i).toString('ascii'));
  }

  if (tokens[0] !== 'P5' || tokens.length < 4) {
    throw new Error('coverage planner: invalid PGM header');
  }
  const width = Number(tokens[1]);
  const height = Number(tokens[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error('coverage planner: invalid PGM dimensions');
  }
  return { width, height };
}

export function metadataFromGridFile(yaml: string, pgm: Buffer): CoverageMapMetadata {
  const dimensions = pgmDimensions(pgm);
  const resolutionMatch = yaml.match(/^resolution:\s*([+-]?\d+(?:\.\d+)?)/m);
  const originMatch = yaml.match(/^origin:\s*\[\s*([^,\]]+)\s*,\s*([^,\]]+)/m);
  const resolution = Number(resolutionMatch?.[1]);
  const originX = Number(originMatch?.[1]);
  const originY = Number(originMatch?.[2]);
  if (!Number.isFinite(resolution) || resolution <= 0) {
    throw new Error('coverage planner: invalid map resolution');
  }
  if (!Number.isFinite(originX) || !Number.isFinite(originY)) {
    throw new Error('coverage planner: invalid map origin');
  }
  return { ...dimensions, resolution, originX, originY };
}

export function localToGridStart(
  point: XY,
  metadata: CoverageMapMetadata,
): { x: number; y: number } {
  if (metadata.resolution <= RESOLUTION_EPS) {
    throw new Error('coverage planner: invalid map resolution');
  }
  const x = Math.trunc((point.x - metadata.originX) / metadata.resolution);
  const y =
    metadata.height - 1 -
    Math.trunc((point.y - metadata.originY) / metadata.resolution);
  if (x < 0 || x >= metadata.width || y < 0 || y >= metadata.height) {
    throw new Error(
      `coverage planner: start outside map grid (${x},${y}) for ${metadata.width}x${metadata.height}`,
    );
  }
  return { x, y };
}

function coveragePlanCacheKey(opts: {
  mowerSn: string;
  canonical: string;
  areaId: number;
  pgmMd5: string;
  startGrid: { x: number; y: number };
  covDirection?: number;
  coverageRadius?: number;
}): string {
  return [
    opts.mowerSn,
    opts.canonical,
    String(opts.areaId),
    opts.pgmMd5,
    `${opts.startGrid.x},${opts.startGrid.y}`,
    opts.covDirection === undefined ? 'auto' : String(opts.covDirection),
    opts.coverageRadius === undefined ? 'stock-radius' : `radius=${opts.coverageRadius}`,
  ].join('|');
}

export function parsePlannedPathJson(data: CoverageNativeJson): CoverageDashboardPath[] {
  const paths: CoverageDashboardPath[] = [];
  for (const mapKey of Object.keys(data)) {
    const subPaths = data[mapKey];
    if (typeof subPaths !== 'object' || subPaths === null) continue;
    for (const subKey of Object.keys(subPaths)) {
      const pointsStr = subPaths[subKey];
      if (typeof pointsStr !== 'string') continue;
      const points = pointsStr
        .split(',')
        .map((p) => {
          const [x, y] = p.trim().split(/\s+/).map(Number);
          return { x, y };
        })
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (points.length >= 2) {
        paths.push({ id: `${mapKey}_${subKey}`, points });
      }
    }
  }
  return paths;
}

export async function generateNativeCoveragePlanFromRows(
  opts: GenerateNativeCoveragePlanFromRowsOptions,
): Promise<CoveragePlanResult> {
  const mapInput = mapRowsToCoverageInput(opts.rows, opts.chargingPose);
  const generated = generateOccupancyGrid(mapInput);
  const selected = generated.perMap.find((m) => m.name === opts.canonical);
  if (!selected) {
    throw new Error(`coverage planner: map ${opts.canonical} not found`);
  }

  const metadata = metadataFromGridFile(selected.file.yaml, selected.file.pgm);
  const startGrid = localToGridStart(opts.startLocal, metadata);
  const pgmMd5 = crypto
    .createHash('md5')
    .update(selected.file.pgm)
    .digest('hex');

  if (
    opts.expectedPgmMd5 &&
    opts.expectedPgmMd5.toLowerCase() !== pgmMd5.toLowerCase()
  ) {
    throw new Error(
      `coverage planner: pgm md5 mismatch expected=${opts.expectedPgmMd5} actual=${pgmMd5}`,
    );
  }

  const areaId = areaIdFromCanonical(opts.canonical);
  const cacheKey = coveragePlanCacheKey({
    mowerSn: opts.mowerSn,
    canonical: opts.canonical,
    areaId,
    pgmMd5,
    startGrid,
    covDirection: opts.covDirection,
    coverageRadius: opts.coverageRadius,
  });

  const cache = opts.cache ?? defaultCache;
  const cached = cache.get(cacheKey);
  if (cached) return { ...cached, cacheHit: true };

  const tempRoot = opts.tempDir ?? os.tmpdir();
  const tempPath = await mkdtemp(path.join(tempRoot, 'opennova-coverage-'));
  const pgmPath = path.join(tempPath, `${opts.canonical}.pgm`);

  try {
    await writeFile(pgmPath, selected.file.pgm);
    const plannedPath = await generateCoveragePlanWithNative({
      pgmPath,
      start: startGrid,
      covDir: opts.covDirection,
      inflationRadius: opts.coverageRadius,
      world: { ...metadata, areaId },
      binaryPath: opts.binaryPath,
      timeoutMs: opts.timeoutMs,
      execFile: opts.execFile,
    });
    const result: CachedCoveragePlan = {
      canonical: opts.canonical,
      areaId,
      pgmMd5,
      cacheKey,
      coverageRadius: opts.coverageRadius,
      metadata,
      startGrid,
      plannedPath,
      paths: parsePlannedPathJson(plannedPath),
    };
    cache.set(cacheKey, result);
    return { ...result, cacheHit: false };
  } finally {
    await rm(tempPath, { recursive: true, force: true });
  }
}
