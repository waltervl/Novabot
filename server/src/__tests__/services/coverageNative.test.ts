import { describe, expect, it } from 'vitest';
import {
  buildCoverageNativeArgs,
  coverageNativeBinaryPath,
  generateCoveragePlanWithNative,
  type CoverageNativeExecFile,
} from '../../services/coverageNative.js';

describe('coverage native service', () => {
  it('builds CLI arguments with optional direction and world metadata', () => {
    expect(buildCoverageNativeArgs({
      pgmPath: '/maps/map0.pgm',
      start: { x: 12, y: 34 },
      covDir: 45,
      world: {
        width: 181,
        height: 124,
        resolution: 0.05,
        originX: -1.25,
        originY: 2.5,
        areaId: 7,
      },
    })).toEqual([
      '/maps/map0.pgm',
      '12',
      '34',
      '45',
      '--world',
      '181',
      '124',
      '0.05',
      '-1.25',
      '2.5',
      '7',
    ]);
  });

  it('uses env override before the Docker binary path', () => {
    const old = process.env.COVERAGE_NATIVE_BIN;
    process.env.COVERAGE_NATIVE_BIN = '/tmp/native-plan';
    try {
      expect(coverageNativeBinaryPath()).toBe('/tmp/native-plan');
    } finally {
      if (old === undefined) delete process.env.COVERAGE_NATIVE_BIN;
      else process.env.COVERAGE_NATIVE_BIN = old;
    }
  });

  it('spawns the native binary and parses JSON stdout', async () => {
    const calls: { file: string; args: string[] }[] = [];
    const execFile: CoverageNativeExecFile = (file, args, _opts, cb) => {
      calls.push({ file, args });
      cb(null, '{"1":{"0":"10.25 21.25"}}\n', 'cells=1 verts=1');
    };

    const plan = await generateCoveragePlanWithNative({
      pgmPath: '/maps/map0.pgm',
      start: { x: 1, y: 2 },
      binaryPath: '/opt/test/coverage_grid_plan',
      execFile,
    });

    expect(calls).toEqual([{
      file: '/opt/test/coverage_grid_plan',
      args: ['/maps/map0.pgm', '1', '2'],
    }]);
    expect(plan).toEqual({ '1': { '0': '10.25 21.25' } });
  });

  it('includes stderr when native execution fails', async () => {
    const execFile: CoverageNativeExecFile = (_file, _args, _opts, cb) => {
      const err = new Error('exit 1') as Error & { code: number };
      err.code = 1;
      cb(err, '', 'coverage_grid_plan: failed');
    };

    await expect(generateCoveragePlanWithNative({
      pgmPath: '/maps/map0.pgm',
      start: { x: 1, y: 2 },
      binaryPath: '/opt/test/coverage_grid_plan',
      execFile,
    })).rejects.toThrow(/coverage_grid_plan: failed/);
  });
});
