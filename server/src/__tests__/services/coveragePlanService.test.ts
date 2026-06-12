import { describe, expect, it } from 'vitest';
import {
  generateNativeCoveragePlanFromRows,
  type CoveragePlanMapRow,
} from '../../services/coveragePlanService.js';
import type { CoverageNativeExecFile } from '../../services/coverageNative.js';

function workRow(canonical: string, points: Array<{ x: number; y: number }>): CoveragePlanMapRow {
  return {
    canonical_name: canonical,
    file_name: `${canonical}_work.csv`,
    map_area: JSON.stringify(points),
    map_name: canonical,
    map_type: 'work',
  };
}

function obstacleRow(canonical: string, points: Array<{ x: number; y: number }>): CoveragePlanMapRow {
  return {
    canonical_name: canonical,
    file_name: `${canonical}.csv`,
    map_area: JSON.stringify(points),
    map_name: canonical,
    map_type: 'obstacle',
  };
}

describe('coverage plan service', () => {
  const rows = [
    workRow('map0', [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ]),
    workRow('map1', [
      { x: 10, y: 0 },
      { x: 14, y: 0 },
      { x: 14, y: 4 },
      { x: 10, y: 4 },
    ]),
    obstacleRow('map1_0_obstacle', [
      { x: 11, y: 1 },
      { x: 12, y: 1 },
      { x: 12, y: 2 },
      { x: 11, y: 2 },
    ]),
  ];

  it('synthesizes selected map PGM and calls native planner with world metadata', async () => {
    const calls: { file: string; args: string[] }[] = [];
    const execFile: CoverageNativeExecFile = (file, args, _opts, cb) => {
      calls.push({ file, args });
      cb(null, '{"2":{"0":"10.00 1.00,11.00 1.00","5":"11.00 2.00,12.00 2.00"}}\n', '');
    };

    const result = await generateNativeCoveragePlanFromRows({
      mowerSn: 'LFINTEST',
      rows,
      canonical: 'map1',
      startLocal: { x: 11, y: 2 },
      covDirection: 90,
      chargingPose: { x: 0, y: 0, orientation: 0 },
      execFile,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].args.slice(1)).toEqual([
      '240',
      '59',
      '90',
      '--world',
      '320',
      '120',
      '0.05',
      '-1',
      '-1',
      '2',
    ]);
    expect(result.canonical).toBe('map1');
    expect(result.areaId).toBe(2);
    expect(result.startGrid).toEqual({ x: 240, y: 59 });
    expect(result.metadata).toEqual({
      width: 320,
      height: 120,
      resolution: 0.05,
      originX: -1,
      originY: -1,
    });
    expect(result.paths).toEqual([
      { id: '2_0', points: [{ x: 10, y: 1 }, { x: 11, y: 1 }] },
      { id: '2_5', points: [{ x: 11, y: 2 }, { x: 12, y: 2 }] },
    ]);
    expect(result.cacheHit).toBe(false);
    expect(result.cacheKey).toContain(result.pgmMd5);
  });

  it('caches by pgm md5, start, direction, and map', async () => {
    let spawnCount = 0;
    const cache = new Map();
    const execFile: CoverageNativeExecFile = (_file, _args, _opts, cb) => {
      spawnCount += 1;
      cb(null, '{"1":{"0":"0.00 0.00,1.00 1.00"}}\n', '');
    };

    const request = {
      mowerSn: 'LFINTEST',
      rows,
      canonical: 'map0',
      startLocal: { x: 1, y: 1 },
      covDirection: 45,
      chargingPose: { x: 0, y: 0, orientation: 0 },
      execFile,
      cache,
    };

    const first = await generateNativeCoveragePlanFromRows(request);
    const second = await generateNativeCoveragePlanFromRows(request);

    expect(spawnCount).toBe(1);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.plannedPath).toEqual(first.plannedPath);
    expect(second.cacheKey).toBe(first.cacheKey);
  });

  it('rejects when the synthesized PGM md5 does not match the gate', async () => {
    const execFile: CoverageNativeExecFile = () => {
      throw new Error('native planner should not be called');
    };

    await expect(generateNativeCoveragePlanFromRows({
      mowerSn: 'LFINTEST',
      rows,
      canonical: 'map0',
      startLocal: { x: 1, y: 1 },
      chargingPose: { x: 0, y: 0, orientation: 0 },
      expectedPgmMd5: 'not-the-server-pgm',
      execFile,
    })).rejects.toThrow(/pgm md5 mismatch/);
  });
});
