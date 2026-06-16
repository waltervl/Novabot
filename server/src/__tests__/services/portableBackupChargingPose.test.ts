/**
 * Unit tests — createBundleFromDb charging-pose fail-closed guard
 *
 * Regression test for the latent data-corruption bug where createBundleFromDb
 * synthesized a bundle with a {x:0, y:0, orientation:0} charging_pose for any
 * mower that had no stored polygon_charging_orientation. That zeroed dock pose
 * was rasterized into map_info.json + the pgm and, on a map-edit apply, pushed
 * to the mower — silently breaking auto-docking (this corrupted .100, which had
 * never been recalibrated).
 *
 * The fix is fail-closed: synthesize the REAL dock pose (position from the
 * to-charge unicom CSV, heading from the saved orientation) when BOTH are
 * present, and THROW (never write a {0,0,0} bundle) when either is missing.
 *
 * Hermetic: uses the in-memory test DB (DB_PATH=:memory: via vitest.config.ts)
 * seeded directly through mapRepo, and mocks the mapSync MQTT chain (which
 * createBundleFromDb never invokes on the DB-only path, but importing it would
 * otherwise pull the broker → socketHandler circular chain into the runtime).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Avoid pulling the broker → socketHandler chain into the test runtime.
vi.mock('../../mqtt/mapSync.js', () => ({
  publishToExtended: vi.fn(),
  onExtendedResponse: vi.fn(),
  offExtendedResponse: vi.fn(),
}));
vi.mock('../../mqtt/sensorData.js', () => ({
  deviceCache: new Map<string, Map<string, string>>(),
}));

import { createBundleFromDb, createBundleFromCsvFiles, listBackups } from '../../services/portableBackup.js';
import { mapRepo } from '../../db/repositories/index.js';
import { db } from '../../db/database.js';

const SN_NO_POSE = 'LFIN_POSE_NONE';
const SN_WITH_POSE = 'LFIN_POSE_OK';
const SN_CSV = 'LFIN_POSE_CSV';
const BACKUP_ROOT = path.join(process.env.STORAGE_PATH ?? './storage', 'portable_backups');

/** Seed the calibration + work polygon both fixtures need. */
function seedAnchorAndWork(sn: string): void {
  mapRepo.setCalibration(sn, { charger_lat: 52.1, charger_lng: 4.2 });
  mapRepo.create({
    map_id: `${sn}-work`,
    mower_sn: sn,
    map_name: 'map0',
    file_name: 'map0_work.csv',
    canonical_name: 'map0',
    map_type: 'work',
    map_area: JSON.stringify([
      { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 },
    ]),
  });
}

beforeEach(() => {
  // Clean DB rows + any prior backup files for all fixtures.
  for (const sn of [SN_NO_POSE, SN_WITH_POSE, SN_CSV]) {
    db.prepare('DELETE FROM maps WHERE mower_sn = ?').run(sn);
    db.prepare('DELETE FROM map_calibration WHERE mower_sn = ?').run(sn);
    fs.rmSync(path.join(BACKUP_ROOT, sn), { recursive: true, force: true });
  }
});

/** A minimal valid csv_file/ set (one work map + a charge unicom). */
function csvFilesWith(mapInfo: Record<string, unknown> | null): Record<string, string> {
  const files: Record<string, string> = {
    'map0_work.csv': '0,0\n5,0\n5,5\n0,5\n',
    'map0tocharge_unicom.csv': '-1.21,0.48\n-0.5,0.2\n',
  };
  if (mapInfo) files['map_info.json'] = JSON.stringify(mapInfo);
  return files;
}

describe('createBundleFromDb — charging-pose fail-closed guard', () => {
  it('throws (never writes a {0,0,0} bundle) when the mower has no stored orientation', async () => {
    // Work polygon + charger anchor present, but NO to-charge unicom (no
    // anchor position) and NO saved orientation — exactly .100's state.
    seedAnchorAndWork(SN_NO_POSE);

    await expect(createBundleFromDb(SN_NO_POSE, 'map_edit')).rejects.toThrow(
      /no resolvable charging pose|zeroed/i,
    );
    // Crucially: nothing was written to disk (no corrupt bundle).
    expect(listBackups(SN_NO_POSE)).toHaveLength(0);
  });

  it('throws when the anchor exists but orientation is still null', async () => {
    // Add a to-charge unicom (anchor resolvable) but leave orientation unset.
    seedAnchorAndWork(SN_NO_POSE);
    mapRepo.create({
      map_id: `${SN_NO_POSE}-unicom`,
      mower_sn: SN_NO_POSE,
      map_name: 'map0tocharge_unicom',
      file_name: 'map0tocharge_unicom.csv',
      canonical_name: 'map0tocharge_unicom',
      map_type: 'unicom',
      map_area: JSON.stringify([{ x: -1.21, y: 0.48 }, { x: -0.5, y: 0.2 }]),
    });
    expect(mapRepo.getPolygonChargingOrientation(SN_NO_POSE)).toBeNull();

    await expect(createBundleFromDb(SN_NO_POSE, 'map_edit')).rejects.toThrow(
      /no resolvable charging pose|zeroed/i,
    );
    expect(listBackups(SN_NO_POSE)).toHaveLength(0);
  });

  it('produces the correct charging_pose from anchor + saved orientation when both are present', async () => {
    seedAnchorAndWork(SN_WITH_POSE);
    const anchorPt = { x: -1.21, y: 0.48 };
    mapRepo.create({
      map_id: `${SN_WITH_POSE}-unicom`,
      mower_sn: SN_WITH_POSE,
      map_name: 'map0tocharge_unicom',
      file_name: 'map0tocharge_unicom.csv',
      canonical_name: 'map0tocharge_unicom',
      map_type: 'unicom',
      map_area: JSON.stringify([anchorPt, { x: -0.5, y: 0.2 }, { x: 0, y: 0 }]),
    });
    mapRepo.setPolygonChargingOrientation(SN_WITH_POSE, 1.7);

    const entry = await createBundleFromDb(SN_WITH_POSE, 'map_edit');
    expect(entry).not.toBeNull();
    expect(entry!.filename).toMatch(/\.novabotmap$/);
    expect(listBackups(SN_WITH_POSE)).toHaveLength(1);

    // Verify the bundle embeds the REAL dock pose, not {0,0,0}: unzip the
    // saved .novabotmap and read both the synthesized mower map_info.json
    // (mower/csv_file/map_info.json) and the metadata.json originalChargingPose.
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const os = await import('node:os');
    const zipPath = path.join(BACKUP_ROOT, SN_WITH_POSE, entry!.filename);
    const peek = fs.mkdtempSync(path.join(os.tmpdir(), 'peek-charging-pose-'));
    // execFile (argument array, no shell) — avoids any shell interpolation.
    await promisify(execFile)('unzip', ['-o', '-q', zipPath, '-d', peek]);
    const info = JSON.parse(
      fs.readFileSync(path.join(peek, 'mower', 'csv_file', 'map_info.json'), 'utf8'),
    ) as { charging_pose: { x: number; y: number; orientation: number } };
    const metadata = JSON.parse(
      fs.readFileSync(path.join(peek, 'metadata.json'), 'utf8'),
    ) as { originalChargingPose: { x: number; y: number; orientation: number } };
    fs.rmSync(peek, { recursive: true, force: true });

    for (const pose of [info.charging_pose, metadata.originalChargingPose]) {
      expect(pose.x).toBeCloseTo(anchorPt.x);
      expect(pose.y).toBeCloseTo(anchorPt.y);
      expect(pose.orientation).toBeCloseTo(1.7);
      // Sanity: this is NOT the old zeroed default that corrupted the mower.
      expect(pose).not.toEqual({ x: 0, y: 0, orientation: 0 });
    }
  });
});

describe('createBundleFromCsvFiles — charging-pose fail-closed guard', () => {
  it('returns null (no bundle) when the snapshot has no map_info.json', async () => {
    const entry = await createBundleFromCsvFiles(SN_CSV, csvFilesWith(null), 'csv-import');
    expect(entry).toBeNull();
    expect(listBackups(SN_CSV)).toHaveLength(0);
  });

  it('returns null when map_info.json has no charging_pose', async () => {
    const entry = await createBundleFromCsvFiles(
      SN_CSV,
      csvFilesWith({ 'map0_work.csv': { map_size: 25 } }),
      'csv-import',
    );
    expect(entry).toBeNull();
    expect(listBackups(SN_CSV)).toHaveLength(0);
  });

  it('returns null (never writes a {0,0,0} bundle) when charging_pose is all-zero', async () => {
    const entry = await createBundleFromCsvFiles(
      SN_CSV,
      csvFilesWith({ charging_pose: { x: 0, y: 0, orientation: 0 } }),
      'csv-import',
    );
    expect(entry).toBeNull();
    expect(listBackups(SN_CSV)).toHaveLength(0);
  });

  it('returns null when charging_pose has a non-finite component', async () => {
    const entry = await createBundleFromCsvFiles(
      SN_CSV,
      // JSON can't carry NaN — a missing/null component is the on-disk shape.
      csvFilesWith({ charging_pose: { x: 1, y: null, orientation: 0.5 } }),
      'csv-import',
    );
    expect(entry).toBeNull();
    expect(listBackups(SN_CSV)).toHaveLength(0);
  });

  it('produces a bundle from a real (non-zero, finite) charging_pose', async () => {
    const pose = { x: -1.21, y: 0.48, orientation: 1.7 };
    const entry = await createBundleFromCsvFiles(
      SN_CSV,
      csvFilesWith({ charging_pose: pose }),
      'csv-import',
    );
    expect(entry).not.toBeNull();
    expect(entry!.filename).toMatch(/\.novabotmap$/);
    expect(listBackups(SN_CSV)).toHaveLength(1);
  });
});
