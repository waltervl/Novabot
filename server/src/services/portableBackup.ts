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
  }>((resolve) => {
    let settled = false;
    const handler = (data: Record<string, unknown>) => {
      const r = data.read_map_files_respond as {
        result?: number;
        csv_files?: Record<string, string>;
        charging_station_yaml?: string;
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
      });
    };
    onExtendedResponse(sn, handler);
    publishToExtended(sn, { read_map_files: {} });
    setTimeout(() => {
      if (settled) return;
      settled = true;
      offExtendedResponse(sn, handler);
      resolve({});
    }, 8000);
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
    unicom: unicom.filter((u) => u.map_area).map((u) => {
      const m = (u.canonical_name ?? '').match(/^map\d+to(.+?)_?unicom$/);
      return {
        canonical: u.canonical_name ?? '',
        targetMapName: m?.[1] ?? 'charge',
        points: JSON.parse(u.map_area as string),
      };
    }),
    csvFilesRaw: mowerData.csvFiles,
    chargingStationYaml: mowerData.chargingStationYaml,
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
