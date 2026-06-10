// server/src/services/portableBackup.ts
//
// Auto + manual backup management for portable map bundles. Same payload as
// the user-facing export-portable endpoint, but written to a per-SN directory
// on disk so operators can roll back to any historical snapshot.
//
// Triggers:
//   - automatic: broker hooks save_recharge_pos_respond (post-mapping save
//     pivot — fires once per mapping session, AFTER the polygon CSVs +
//     charging_pose are committed to mower disk)
//   - manual: admin button POSTs /maps/:sn/portable-backups
//
// Retention: keep latest N (default 20) per SN; oldest pruned on each new save.

import fs from 'node:fs';
import path from 'node:path';
import { exportBundle } from './portableMap.js';
import { synthesizeMowerFiles } from '../maps/synthMowerFiles.js';
import { mapRepo } from '../db/repositories/maps.js';
import { publishToExtended, onExtendedResponse, offExtendedResponse } from '../mqtt/mapSync.js';

const BACKUP_ROOT = path.join(process.env.STORAGE_PATH ?? './storage', 'portable_backups');
const RETENTION = 20;

export interface BackupEntry {
  filename: string;
  bytes: number;
  createdAt: number;       // unix-ms
  reason: string;          // 'manual' | 'auto-save_map' | etc.
}

function backupDir(sn: string): string {
  const dir = path.join(BACKUP_ROOT, sn);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** List backups for SN, newest first. */
export function listBackups(sn: string): BackupEntry[] {
  const dir = backupDir(sn);
  const entries: BackupEntry[] = [];
  for (const fname of fs.readdirSync(dir)) {
    if (!fname.endsWith('.novabotmap')) continue;
    const full = path.join(dir, fname);
    const stat = fs.statSync(full);
    if (!stat.isFile()) continue;
    // Filename pattern: <iso>_<reason>.novabotmap
    const m = fname.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})_(.+)\.novabotmap$/);
    const reason = m?.[2] ?? 'unknown';
    entries.push({
      filename: fname,
      bytes: stat.size,
      createdAt: stat.mtimeMs,
      reason,
    });
  }
  entries.sort((a, b) => b.createdAt - a.createdAt);
  return entries;
}

/** Create the very first portable snapshot for a mower if none exists yet.
 *  Idempotent + safe to call eagerly on connect: skips entirely once ANY
 *  backup is present (so it never duplicates), and createBackup itself no-ops
 *  (returns null) until the DB has a charger anchor + work polygon. */
export async function ensureInitialBackup(sn: string): Promise<BackupEntry | null> {
  if (listBackups(sn).length > 0) return null;
  return createBackup(sn, 'auto-initial');
}

/** Read a backup's raw bytes. */
export function readBackup(sn: string, filename: string): Buffer | null {
  if (!/^[A-Za-z0-9_.-]+\.novabotmap$/.test(filename)) return null;
  const full = path.join(backupDir(sn), filename);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full);
}

/** Delete a backup. */
export function deleteBackup(sn: string, filename: string): boolean {
  if (!/^[A-Za-z0-9_.-]+\.novabotmap$/.test(filename)) return false;
  const full = path.join(backupDir(sn), filename);
  if (!fs.existsSync(full)) return false;
  fs.unlinkSync(full);
  return true;
}

/** Prune oldest entries until count ≤ RETENTION. */
function prune(sn: string): void {
  const list = listBackups(sn);
  if (list.length <= RETENTION) return;
  for (const old of list.slice(RETENTION)) {
    try { fs.unlinkSync(path.join(backupDir(sn), old.filename)); }
    catch { /* swallow — best-effort */ }
  }
}

/**
 * Build a portable bundle for SN by:
 * 1. Reading DB polygons + calibration (same source as user-facing export)
 * 2. Calling MQTT extended `read_map_files` to capture verbatim mower state
 * 3. Stuffing into ZIP via shared exportBundle()
 * 4. Writing to disk + pruning retention
 *
 * Returns the saved BackupEntry on success, null on failure (e.g. mower
 * offline, no work polygon in DB).
 */
/** Map an obstacle/unicom canonical name to its parent work map ("map0_1_obstacle" -> "map0"). */
function parentMapOf(canonical: string): string {
  const m = canonical.match(/^(map\d+)/);
  return m?.[1] ?? 'map0';
}

interface SynthBundleInput {
  workMaps: { canonical: string; alias: string; points: { x: number; y: number }[] }[];
  obstacles: { canonical: string; parentMap: string; points: { x: number; y: number }[] }[];
  unicom: { canonical: string; targetMapName: string; points: { x: number; y: number }[] }[];
  chargingPose: { x: number; y: number; orientation: number };
  chargerLat: number;
  chargerLng: number;
}

/** Synthesize the mower file set, zip a self-contained bundle, save + prune. */
async function buildAndSaveSynthBundle(sn: string, reason: string, inp: SynthBundleInput): Promise<BackupEntry> {
  const synth = synthesizeMowerFiles({
    workMaps: inp.workMaps,
    obstacles: inp.obstacles,
    unicom: inp.unicom,
    chargingPose: inp.chargingPose,
  });
  const zip = await exportBundle({
    sn,
    chargerLat: inp.chargerLat,
    chargerLng: inp.chargerLng,
    rtkQuality: null,
    chargingPose: inp.chargingPose,
    workMaps: inp.workMaps.map((w) => ({ canonical: w.canonical, alias: w.alias, points: w.points })),
    obstacles: inp.obstacles.map((o) => ({ canonical: o.canonical, alias: o.canonical, points: o.points })),
    unicom: inp.unicom.map((u) => ({ canonical: u.canonical, targetMapName: u.targetMapName, points: u.points })),
    csvFilesRaw: synth.csvFiles,
    chargingStationYaml: synth.chargingStationYaml,
    mapFilesText: synth.mapFilesText,
    mapFilesB64: synth.mapFilesB64,
  });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeReason = reason.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32);
  const fname = `${ts}_${safeReason}.novabotmap`;
  const full = path.join(backupDir(sn), fname);
  fs.writeFileSync(full, zip);
  prune(sn);
  const stat = fs.statSync(full);
  console.log(`[portable-backup] ${sn}: synthesized ${fname} (${stat.size} B, reason=${safeReason})`);
  return { filename: fname, bytes: stat.size, createdAt: stat.mtimeMs, reason: safeReason };
}

/**
 * Build a self-contained bundle from an uploaded csv_file/ set (CSV-only
 * import). Parses work/obstacle/unicom CSVs + map_info.json, rasterizes, and
 * saves a restorable .novabotmap. No DB or mower required.
 */
export async function createBundleFromCsvFiles(
  sn: string,
  csvFiles: Record<string, string>,
  reason: string,
): Promise<BackupEntry | null> {
  const parsePts = (text: string): { x: number; y: number }[] =>
    text.trim().split('\n').map((l) => {
      const [x, y] = l.split(',').map(Number);
      return { x, y };
    }).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  const workMaps: SynthBundleInput['workMaps'] = [];
  const obstacles: SynthBundleInput['obstacles'] = [];
  const unicom: SynthBundleInput['unicom'] = [];
  for (const [fname, text] of Object.entries(csvFiles)) {
    if (!fname.endsWith('.csv')) continue;
    const base = fname.replace(/\.csv$/, '');
    const m = base.match(/^(map\d+)_work$/);
    if (m) { workMaps.push({ canonical: m[1], alias: m[1], points: parsePts(text) }); continue; }
    if (/_obstacle$/.test(base)) { obstacles.push({ canonical: base, parentMap: parentMapOf(base), points: parsePts(text) }); continue; }
    if (/_unicom$/.test(base)) {
      const um = base.match(/^map\d+to(.+?)_?unicom$/);
      unicom.push({ canonical: base, targetMapName: um?.[1] ?? 'charge', points: parsePts(text) });
    }
  }
  if (workMaps.length === 0) {
    console.warn(`[portable-backup] ${sn}: csv import — no map*_work.csv found`);
    return null;
  }
  let chargingPose = { x: 0, y: 0, orientation: 0 };
  const mi = csvFiles['map_info.json'];
  if (mi) {
    try {
      const cp = (JSON.parse(mi) as { charging_pose?: { x: number; y: number; orientation: number } }).charging_pose;
      if (cp && Number.isFinite(cp.x) && Number.isFinite(cp.y) && Number.isFinite(cp.orientation)) chargingPose = cp;
    } catch { /* malformed */ }
  }
  const cal = mapRepo.getCalibration(sn);
  return buildAndSaveSynthBundle(sn, reason, {
    workMaps, obstacles, unicom, chargingPose,
    chargerLat: cal?.charger_lat ?? 0,
    chargerLng: cal?.charger_lng ?? 0,
  });
}

/**
 * Build a self-contained portable bundle for SN from DB polygons ALONE — no
 * mower required. Generates the full mower/ file set (csv_file/, map_files/
 * map.pgm/png/yaml + mapN.*, charging_station.yaml) via the faithful
 * occupancy-grid generator, so the bundle restores (apply-verbatim) into a
 * working costmap. Used after cloud re-import / CSV-only import and the manual
 * "rebuild bundle" admin action.
 *
 * Returns the saved BackupEntry, or null if there's no usable polygon/anchor.
 */
export async function createBundleFromDb(sn: string, reason: string): Promise<BackupEntry | null> {
  const cal = mapRepo.getCalibration(sn);
  if (!cal?.charger_lat || !cal?.charger_lng) {
    console.warn(`[portable-backup] ${sn}: skip synth — no charger anchor`);
    return null;
  }
  const workRows = mapRepo.findAllByMowerSnAndType(sn, 'work').filter((w) => w.map_area);
  if (workRows.length === 0) {
    console.warn(`[portable-backup] ${sn}: skip synth — no work polygon in DB`);
    return null;
  }
  const obstacleRows = mapRepo.findAllByMowerSnAndType(sn, 'obstacle').filter((o) => o.map_area);
  // Do NOT filter unicoms by map_area. Inter-zone connectors
  // (mapXtomapY_unicom) are legitimately metadata-only (0-byte / map_area
  // NULL) in the LFI/firmware design, but they MUST still be restored as
  // (empty) CSV files: the mower regenerates its occupancy grid at every
  // coverage start (RobotDecision::loadMap -> novabot_mapping Mapping service),
  // and that regeneration needs every unicom file present to connect the zones.
  // Dropping them (as the work/obstacle filter does) left the zones as
  // disconnected free-islands -> nav2 "no valid path to goal" (Error 127).
  const unicomRows = mapRepo.findAllByMowerSnAndType(sn, 'unicom');

  const workMaps = workRows.map((w, i) => ({
    canonical: w.canonical_name ?? `map${i}`,
    alias: w.map_name ?? `work${i}`,
    points: JSON.parse(w.map_area as string) as { x: number; y: number }[],
  }));
  const obstacles = obstacleRows.map((o) => ({
    canonical: o.canonical_name ?? '',
    parentMap: parentMapOf(o.canonical_name ?? ''),
    points: JSON.parse(o.map_area as string) as { x: number; y: number }[],
  }));
  const unicom = unicomRows.map((u) => {
    const m = (u.canonical_name ?? '').match(/^map\d+to(.+?)_?unicom$/);
    return {
      canonical: u.canonical_name ?? '',
      targetMapName: m?.[1] ?? 'charge',
      // metadata-only inter-zone connectors have no map_area -> empty points
      // (synthMowerFiles still writes the empty CSV the firmware expects).
      points: u.map_area ? (JSON.parse(u.map_area as string) as { x: number; y: number }[]) : [],
    };
  });

  // charging pose: charger-relative frame (0,0); orientation from stored value.
  const fallbackOrient = mapRepo.getPolygonChargingOrientation(sn);
  const chargingPose = { x: 0, y: 0, orientation: fallbackOrient ?? 0 };

  return buildAndSaveSynthBundle(sn, reason, {
    workMaps, obstacles, unicom, chargingPose,
    chargerLat: cal.charger_lat, chargerLng: cal.charger_lng,
  });
}

export async function createBackup(sn: string, reason: string): Promise<BackupEntry | null> {
  const cal = mapRepo.getCalibration(sn);
  if (!cal?.charger_lat || !cal?.charger_lng) {
    console.warn(`[portable-backup] ${sn}: skip — no charger anchor`);
    return null;
  }
  const workRows = mapRepo.findAllByMowerSnAndType(sn, 'work').filter((w) => w.map_area);
  if (workRows.length === 0) {
    console.warn(`[portable-backup] ${sn}: skip — no work polygon in DB`);
    return null;
  }
  const obstacles = mapRepo.findAllByMowerSnAndType(sn, 'obstacle');
  const unicom = mapRepo.findAllByMowerSnAndType(sn, 'unicom');

  // Live mower files via MQTT extended (8s timeout — same as export endpoint)
  const mowerData = await new Promise<{
    csvFiles?: Record<string, string>;
    chargingStationYaml?: string;
    chargingPose?: { x: number; y: number; orientation: number };
    posJson?: string;
    mapFilesText?: Record<string, string>;
    mapFilesB64?: Record<string, string>;
  }>((resolve) => {
    let settled = false;
    const handler = (data: Record<string, unknown>) => {
      const r = data.read_map_files_respond as {
        result?: number;
        csv_files?: Record<string, string>;
        charging_station_yaml?: string;
        pos_json?: string | null;
        map_files_text?: Record<string, string>;
        map_files_b64?: Record<string, string>;
      } | undefined;
      if (!r || settled) return;
      settled = true;
      offExtendedResponse(sn, handler);
      if (r.result !== 0) { resolve({}); return; }
      let chargingPose: { x: number; y: number; orientation: number } | undefined;
      const mapInfoStr = r.csv_files?.['map_info.json'];
      if (mapInfoStr) {
        try {
          const mi = JSON.parse(mapInfoStr) as { charging_pose?: { x: number; y: number; orientation: number } };
          if (mi.charging_pose
            && Number.isFinite(mi.charging_pose.x)
            && Number.isFinite(mi.charging_pose.y)
            && Number.isFinite(mi.charging_pose.orientation)) {
            chargingPose = mi.charging_pose;
          }
        } catch { /* malformed map_info.json */ }
      }
      resolve({
        csvFiles: r.csv_files,
        chargingStationYaml: r.charging_station_yaml,
        chargingPose,
        posJson: r.pos_json ?? undefined,
        mapFilesText: r.map_files_text,
        mapFilesB64: r.map_files_b64,
      });
    };
    onExtendedResponse(sn, handler);
    publishToExtended(sn, { read_map_files: {} });
    // Longer timeout — bundle now ships pgm/png base64 which can push the
    // response payload past 3 MB on a 3-map mower. Old 8 s budget assumed
    // CSV-only response which fit in <50 KB.
    setTimeout(() => {
      if (settled) return;
      settled = true;
      offExtendedResponse(sn, handler);
      resolve({});
    }, 20000);
  });

  if (!mowerData.csvFiles) {
    console.warn(`[portable-backup] ${sn}: skip — mower didn't return read_map_files (offline or no extended_commands?)`);
    return null;
  }

  const fallbackOrient = mapRepo.getPolygonChargingOrientation(sn);
  const chargingPose = mowerData.chargingPose ?? {
    x: 0, y: 0, orientation: fallbackOrient ?? 0,
  };

  const zip = await exportBundle({
    sn,
    chargerLat: cal.charger_lat,
    chargerLng: cal.charger_lng,
    rtkQuality: null,
    chargingPose,
    workMaps: workRows.map((w, i) => ({
      canonical: w.canonical_name ?? `map${i}`,
      alias: w.map_name ?? `work${i}`,
      points: JSON.parse(w.map_area as string),
    })),
    obstacles: obstacles.filter((o) => o.map_area).map((o) => ({
      canonical: o.canonical_name ?? '',
      alias: o.map_name ?? '',
      points: JSON.parse(o.map_area as string),
    })),
    // Do NOT filter unicoms by map_area. Inter-zone connectors can be
    // metadata-only (0-byte) and must still be listed so a restore knows the
    // channel exists; the verbatim mower CSV (csvFilesRaw) carries the real
    // geometry when present. Keeps unicom.json consistent with createBundleFromDb.
    unicom: unicom.map((u) => {
      const m = (u.canonical_name ?? '').match(/^map\d+to(.+?)_?unicom$/);
      return {
        canonical: u.canonical_name ?? '',
        targetMapName: m?.[1] ?? 'charge',
        points: u.map_area ? (JSON.parse(u.map_area as string) as { x: number; y: number }[]) : [],
      };
    }),
    csvFilesRaw: mowerData.csvFiles,
    chargingStationYaml: mowerData.chargingStationYaml,
    posJson: mowerData.posJson,
    mapFilesText: mowerData.mapFilesText,
    mapFilesB64: mowerData.mapFilesB64,
  });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeReason = reason.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32);
  const fname = `${ts}_${safeReason}.novabotmap`;
  const full = path.join(backupDir(sn), fname);
  fs.writeFileSync(full, zip);
  prune(sn);

  const stat = fs.statSync(full);
  console.log(`[portable-backup] ${sn}: saved ${fname} (${stat.size} B, reason=${safeReason})`);
  return {
    filename: fname,
    bytes: stat.size,
    createdAt: stat.mtimeMs,
    reason: safeReason,
  };
}
