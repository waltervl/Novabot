import { describe, it, expect } from 'vitest';
import { canonicalOrderKey, compareMapRowsByCanonical } from '../../utils/mapOrder.js';

describe('canonicalOrderKey', () => {
  it('keys work maps by numeric zone index', () => {
    expect(canonicalOrderKey('map0')).toEqual([0, -1]);
    expect(canonicalOrderKey('map2')).toEqual([2, -1]);
    expect(canonicalOrderKey('map10')).toEqual([10, -1]);
  });

  it('sorts map2 before map10 (numeric, not string)', () => {
    const [i2] = canonicalOrderKey('map2');
    const [i10] = canonicalOrderKey('map10');
    expect(i2).toBeLessThan(i10);
  });

  it('ranks work < obstacle < unicom within a zone', () => {
    expect(canonicalOrderKey('map0')[1]).toBeLessThan(canonicalOrderKey('map0_0_obstacle')[1]);
    expect(canonicalOrderKey('map0_0_obstacle')[1]).toBeLessThan(canonicalOrderKey('map0tomap1_0_unicom')[1]);
  });

  it('puts rows with no mapN prefix last', () => {
    expect(canonicalOrderKey('charge')[0]).toBe(Number.MAX_SAFE_INTEGER);
    expect(canonicalOrderKey(null)[0]).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('compareMapRowsByCanonical', () => {
  it('reorders updated_at-DESC work maps back to map0, map1, map2 (David case)', () => {
    // findByMowerSn returned them most-recently-touched first → map2 at position 1.
    const rows = [
      { canonical_name: 'map2', map_name: 'Zone3' },
      { canonical_name: 'map1', map_name: 'Zone2' },
      { canonical_name: 'map0', map_name: 'Zone1' },
    ];
    rows.sort(compareMapRowsByCanonical);
    expect(rows.map(r => r.canonical_name)).toEqual(['map0', 'map1', 'map2']);
  });

  it('groups obstacles + unicoms after their work map, per zone', () => {
    const rows = [
      { canonical_name: 'map1tomap2_0_unicom' },
      { canonical_name: 'map0_1_obstacle' },
      { canonical_name: 'map1' },
      { canonical_name: 'map0' },
      { canonical_name: 'map0_0_obstacle' },
    ];
    rows.sort(compareMapRowsByCanonical);
    expect(rows.map(r => r.canonical_name)).toEqual([
      'map0', 'map0_0_obstacle', 'map0_1_obstacle', 'map1', 'map1tomap2_0_unicom',
    ]);
  });

  it('falls back to file_name / map_name when canonical_name is null', () => {
    const rows = [
      { canonical_name: null, file_name: 'map2_work.csv' },
      { canonical_name: null, file_name: 'map0_work.csv' },
    ];
    rows.sort(compareMapRowsByCanonical);
    expect(rows.map(r => r.file_name)).toEqual(['map0_work.csv', 'map2_work.csv']);
  });
});
