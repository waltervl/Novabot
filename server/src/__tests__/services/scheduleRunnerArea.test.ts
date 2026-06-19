import { describe, it, expect } from 'vitest';
import { computeScheduleArea } from '../../services/scheduleRunner.js';

// firmware `area` = decimal positional bitmask (map0=1, map1=10, map2=100).
const workMaps = [
  { map_id: 'uuid-a', canonical_name: 'map0' },
  { map_id: 'uuid-b', canonical_name: 'map1' },
  { map_id: 'uuid-c', canonical_name: 'map2' },
];

describe('computeScheduleArea', () => {
  it('resolves a specific map to its slot weight (10^slot)', () => {
    expect(computeScheduleArea(workMaps, 'uuid-a')).toBe(1);   // map0
    expect(computeScheduleArea(workMaps, 'uuid-b')).toBe(10);  // map1
    expect(computeScheduleArea(workMaps, 'uuid-c')).toBe(100); // map2 (NOT 200)
  });

  it('"All work areas" (null) sums to the bitmask of every work map', () => {
    expect(computeScheduleArea(workMaps, null)).toBe(111);                       // all three
    expect(computeScheduleArea(workMaps.slice(0, 2), null)).toBe(11);            // map0 + map1
    expect(computeScheduleArea([workMaps[0], workMaps[2]], null)).toBe(101);     // map0 + map2
  });

  it('falls back to map0 when the selection cannot be resolved', () => {
    expect(computeScheduleArea(workMaps, 'unknown-uuid')).toBe(1); // stale/deleted map
    expect(computeScheduleArea([], null)).toBe(1);                 // no work maps
    expect(computeScheduleArea([{ map_id: 'x', canonical_name: null }], null)).toBe(1); // no canonical
  });
});
