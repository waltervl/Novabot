import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateOccupancyGrid, type MapInput, type XY } from '../../maps/occupancyGrid.js';
import { diffPgm } from '../../maps/__pgmDiff.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, '../fixtures/occupancy/LFIN1231000211');

function csv(name: string): XY[] {
  return readFileSync(join(FX, 'csv_file', name), 'utf8').trim().split('\n')
    .map((l) => { const [x, y] = l.split(',').map(Number); return { x, y }; })
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

function loadInput(): MapInput {
  const files = readdirSync(join(FX, 'csv_file'));
  const workMaps = files.filter((f) => /^map\d+_work\.csv$/.test(f))
    .map((f) => ({ canonical: f.replace('_work.csv', ''), points: csv(f) }));
  const obstacles = files.filter((f) => /_obstacle\.csv$/.test(f))
    .map((f) => ({ parentMap: (f.match(/^(map\d+)_/) ?? [])[1] ?? 'map0', points: csv(f) }));
  const unicom = files.filter((f) => /_unicom\.csv$/.test(f))
    .map((f) => ({ name: f.replace('.csv', ''), points: csv(f) }));
  const mi = JSON.parse(readFileSync(join(FX, 'csv_file/map_info.json'), 'utf8'));
  const cp = mi.charging_pose;
  return { workMaps, obstacles, unicom, chargingPose: { x: cp.x, y: cp.y, orientation: cp.orientation } };
}

// SKIPPED pending a matched input fixture. The fixture map.pgm was rasterized
// by the firmware from an in-memory ClipperLib-simplified boundary, NOT from the
// stored csv_file/x3_csv_file (proven: csv_file->541x446, x3->529x434, target
// map.pgm 539x444 matches neither). Byte-identity needs the post-simplify
// polygon captured live (ros2 topic echo of the Polygon publisher during
// save_map type:1) or ClipperLib replicated server-side. See
// research/documents/mower-occupancy-grid-algorithm.md §7.
describe.skip('generateOccupancyGrid byte-identity vs firmware', () => {
  it('whole-area map.yaml matches', () => {
    const out = generateOccupancyGrid(loadInput());
    const expected = readFileSync(join(FX, 'map_files/map.yaml'), 'utf8');
    expect(out.whole.yaml).toBe(expected);
  });

  it('whole-area map.pgm matches byte-for-byte', () => {
    const out = generateOccupancyGrid(loadInput());
    const expected = readFileSync(join(FX, 'map_files/map.pgm'));
    const d = diffPgm(out.whole.pgm, expected);
    expect(d.equal, JSON.stringify(d)).toBe(true);
  });
});
