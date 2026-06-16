/**
 * Synthesize the full mower-side file set (csv_file/ + map_files/ +
 * charging_station.yaml) from polygon data alone, using the faithful
 * occupancy-grid generator. This makes a bundle built from cloud/DB/CSV
 * polygons self-contained and restorable (apply-verbatim) without needing the
 * mower online — replacing the polygon-only + free-fill stopgap.
 *
 * Pure: inputs in, file maps out. No I/O.
 */
import { generateOccupancyGrid, type MapInput, type XY } from './occupancyGrid.js';

export interface SynthWorkMap { canonical: string; alias: string; points: XY[]; }
export interface SynthObstacle { canonical: string; parentMap: string; points: XY[]; }
export interface SynthUnicom { canonical: string; targetMapName: string; points: XY[]; }

export interface SynthInput {
  workMaps: SynthWorkMap[];
  obstacles: SynthObstacle[];
  unicom: SynthUnicom[];
  chargingPose: { x: number; y: number; orientation: number };
}

export interface SynthResult {
  /** filename -> text (mower/csv_file/<name>) */
  csvFiles: Record<string, string>;
  /** map.yaml + mapN.yaml (mower/map_files/<name>) */
  mapFilesText: Record<string, string>;
  /** map.pgm/png + mapN.pgm/png as base64 (mower/map_files/<name>) */
  mapFilesB64: Record<string, string>;
  /** mower/charging_station.yaml content */
  chargingStationYaml: string;
}

function csvText(points: XY[]): string {
  // One "x,y" per line, matching the mower's csv_file format.
  return points.map((p) => `${p.x},${p.y}`).join('\n') + '\n';
}

function polygonAreaM2(pts: XY[]): number {
  if (pts.length < 3) return 0;
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    acc += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(acc) / 2;
}

export function synthesizeMowerFiles(input: SynthInput): SynthResult {
  if (input.workMaps.length === 0) throw new Error('synthesizeMowerFiles: no work maps');

  // CENTRAL fail-closed guard for the charging pose. This value is written
  // verbatim into map_info.json AND rasterized into the pgm; pushing a zeroed
  // or invalid dock pose to a mower silently corrupts its map_info + occupancy
  // grid and breaks auto-docking (this is exactly what corrupted production
  // mower .100). A real mower's docked pose is NEVER exactly {0,0,0} — there is
  // always a dock offset + heading — so all-zero is the corruption signature.
  // This single guard protects EVERY caller (DB synth, CSV/snapshot import,
  // walker import, offline backup): {0,0,0} must NEVER be written, not even
  // when the mower is offline. Callers must supply a real pose or skip.
  const cp = input.chargingPose;
  if (
    !cp ||
    !Number.isFinite(cp.x) || !Number.isFinite(cp.y) || !Number.isFinite(cp.orientation) ||
    (cp.x === 0 && cp.y === 0 && cp.orientation === 0)
  ) {
    throw new Error(
      `synthesizeMowerFiles: refusing to synthesize with a zeroed/invalid charging pose ` +
      `(${JSON.stringify(cp)}) — this corrupts the mower's dock pose. Provide a real ` +
      `charging pose (recalibrate the dock) or skip.`,
    );
  }

  const csvFiles: Record<string, string> = {};
  for (const w of input.workMaps) csvFiles[`${w.canonical}_work.csv`] = csvText(w.points);
  for (const o of input.obstacles) csvFiles[`${o.canonical}.csv`] = csvText(o.points);
  for (const u of input.unicom) csvFiles[`${u.canonical}.csv`] = csvText(u.points);

  // map_info.json: charging_pose + per-work-map area (m^2), matching firmware.
  const mapInfo: Record<string, unknown> = {
    charging_pose: {
      orientation: input.chargingPose.orientation,
      x: input.chargingPose.x,
      y: input.chargingPose.y,
    },
  };
  for (const w of input.workMaps) {
    mapInfo[`${w.canonical}_work.csv`] = { map_size: polygonAreaM2(w.points) };
  }
  csvFiles['map_info.json'] = JSON.stringify(mapInfo, null, 3);

  // Rasterize via the faithful generator (DEFAULT_OFFSETS = 0 for final boundaries).
  const gridInput: MapInput = {
    workMaps: input.workMaps.map((w) => ({ canonical: w.canonical, points: w.points })),
    obstacles: input.obstacles.map((o) => ({ parentMap: o.parentMap, points: o.points })),
    unicom: input.unicom.map((u) => ({ name: u.canonical, points: u.points })),
    chargingPose: input.chargingPose,
  };
  const gen = generateOccupancyGrid(gridInput);

  const mapFilesText: Record<string, string> = { 'map.yaml': gen.whole.yaml };
  const mapFilesB64: Record<string, string> = { 'map.pgm': gen.whole.pgm.toString('base64') };
  if (gen.whole.png) mapFilesB64['map.png'] = gen.whole.png.toString('base64');
  for (const m of gen.perMap) {
    mapFilesText[`${m.name}.yaml`] = m.file.yaml;
    mapFilesB64[`${m.name}.pgm`] = m.file.pgm.toString('base64');
    if (m.file.png) mapFilesB64[`${m.name}.png`] = m.file.png.toString('base64');
  }

  const chargingStationYaml = `charging_pose: [${cp.x}, ${cp.y}, ${cp.orientation}]`;

  return { csvFiles, mapFilesText, mapFilesB64, chargingStationYaml };
}
