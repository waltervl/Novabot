import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { synthesizeMowerFiles } from '../../maps/synthMowerFiles.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, '../fixtures/occupancy/LFIN1231000211');

function csv(name: string): { x: number; y: number }[] {
  return readFileSync(join(FX, 'csv_file', name), 'utf8').trim().split('\n')
    .map((l) => { const [x, y] = l.split(',').map(Number); return { x, y }; })
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

describe('synthesizeMowerFiles', () => {
  const files = readdirSync(join(FX, 'csv_file'));
  const cp = JSON.parse(readFileSync(join(FX, 'csv_file/map_info.json'), 'utf8')).charging_pose;
  const input = {
    workMaps: files.filter((f) => /^map\d+_work\.csv$/.test(f))
      .map((f) => ({ canonical: f.replace('_work.csv', ''), alias: f.replace('_work.csv', ''), points: csv(f) })),
    obstacles: files.filter((f) => /_obstacle\.csv$/.test(f))
      .map((f) => ({ canonical: f.replace('.csv', ''), parentMap: (f.match(/^(map\d+)_/) ?? [])[1] ?? 'map0', points: csv(f) })),
    unicom: files.filter((f) => /_unicom\.csv$/.test(f))
      .map((f) => ({ canonical: f.replace('.csv', ''), targetMapName: 'charge', points: csv(f) })),
    chargingPose: { x: cp.x, y: cp.y, orientation: cp.orientation },
  };

  it('emits csv_file/, map_files/ rasters and charging_station.yaml', () => {
    const out = synthesizeMowerFiles(input);
    // csv set includes work + obstacles + unicom + map_info.json
    expect(out.csvFiles['map0_work.csv']).toBeTruthy();
    expect(out.csvFiles['map_info.json']).toBeTruthy();
    expect(Object.keys(out.csvFiles).filter((f) => /_obstacle\.csv$/.test(f)).length).toBe(6);
    // whole + per-map rasters
    expect(out.mapFilesText['map.yaml']).toContain('image: map.pgm');
    expect(out.mapFilesText['map0.yaml']).toContain('image: map0.pgm');
    expect(out.mapFilesB64['map.pgm']).toBeTruthy();
    expect(out.mapFilesB64['map.png']).toBeTruthy();
    // pgm is a valid P5 with the firmware creator comment + binary free/occupied
    const pgm = Buffer.from(out.mapFilesB64['map.pgm'], 'base64');
    expect(pgm.subarray(0, 2).toString()).toBe('P5');
    expect(pgm.toString('latin1', 0, 64)).toContain('map_generator.cpp');
    // charging_station.yaml single line
    expect(out.chargingStationYaml).toMatch(/^charging_pose: \[/);
  });

  it('map_info.json carries charging_pose + per-map area', () => {
    const out = synthesizeMowerFiles(input);
    const mi = JSON.parse(out.csvFiles['map_info.json']);
    expect(mi.charging_pose.x).toBeCloseTo(input.chargingPose.x);
    expect(mi['map0_work.csv'].map_size).toBeGreaterThan(0);
  });

  describe('charging-pose fail-closed guard', () => {
    // A real docked pose is never exactly {0,0,0}; all-zero is the corruption
    // signature that broke production mower .100 (zeroed dock pose rasterized
    // into map_info.json + pgm → broken auto-docking). The guard must throw
    // before any file is produced.
    it('throws on an all-zero charging pose', () => {
      expect(() => synthesizeMowerFiles({ ...input, chargingPose: { x: 0, y: 0, orientation: 0 } }))
        .toThrow(/zeroed\/invalid charging pose/);
    });

    it('throws on non-finite x', () => {
      expect(() => synthesizeMowerFiles({ ...input, chargingPose: { x: NaN, y: 1, orientation: 0.5 } }))
        .toThrow(/zeroed\/invalid charging pose/);
    });

    it('throws on non-finite orientation', () => {
      expect(() => synthesizeMowerFiles({ ...input, chargingPose: { x: 1, y: 2, orientation: Infinity } }))
        .toThrow(/zeroed\/invalid charging pose/);
    });

    it('throws on a missing charging pose', () => {
      expect(() => synthesizeMowerFiles({ ...input, chargingPose: undefined as unknown as { x: number; y: number; orientation: number } }))
        .toThrow(/zeroed\/invalid charging pose/);
    });

    it('succeeds on a real (non-zero, finite) charging pose', () => {
      // A pose with x===0 but a real y/orientation is NOT all-zero → allowed.
      const out = synthesizeMowerFiles({ ...input, chargingPose: { x: 0, y: -0.51, orientation: 1.57 } });
      expect(out.csvFiles['map_info.json']).toBeTruthy();
      expect(JSON.parse(out.csvFiles['map_info.json']).charging_pose.y).toBeCloseTo(-0.51);
      expect(out.chargingStationYaml).toMatch(/^charging_pose: \[/);
    });
  });
});
