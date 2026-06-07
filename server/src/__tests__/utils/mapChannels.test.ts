import { describe, expect, it } from 'vitest';
import { findMissingChannels } from '../../../../app/src/utils/mapChannels.js';

const work = (canon: string) => ({ mapType: 'work', fileName: `${canon}_work.csv`, mapName: 'Zone' });
const unicom = (name: string) => ({ mapType: 'unicom', fileName: `${name}.csv`, mapName: name });

describe('findMissingChannels', () => {
  it('flags an adjacent work-map pair with no channel', () => {
    expect(findMissingChannels([work('map0'), work('map1')])).toEqual([{ from: 'map1', to: 'map0' }]);
  });

  it('returns empty when the channel exists (either direction)', () => {
    expect(findMissingChannels([work('map0'), work('map1'), unicom('map0tomap1_0_unicom')])).toEqual([]);
    expect(findMissingChannels([work('map0'), work('map1'), unicom('map1tomap0_0_unicom')])).toEqual([]);
  });

  it('ignores the charger unicom (not an inter-zone channel)', () => {
    expect(findMissingChannels([work('map0'), work('map1'), unicom('map0tocharge_unicom')]))
      .toEqual([{ from: 'map1', to: 'map0' }]);
  });

  it('detects a gap only on the unconnected adjacent pair', () => {
    const maps = [work('map0'), work('map1'), work('map2'), unicom('map0tomap1_0_unicom')];
    expect(findMissingChannels(maps)).toEqual([{ from: 'map2', to: 'map1' }]);
  });

  it('returns empty for a single map', () => {
    expect(findMissingChannels([work('map0')])).toEqual([]);
  });

  it('orders work maps numerically so map10 sorts after map2', () => {
    const maps = [work('map0'), work('map1'), work('map2'), work('map10')];
    expect(findMissingChannels(maps)).toEqual([
      { from: 'map10', to: 'map2' },
      { from: 'map2', to: 'map1' },
      { from: 'map1', to: 'map0' },
    ]);
  });

  it('works with canonicalName-only maps and an alias mapName (MapScreen shape)', () => {
    const maps = [
      { mapType: 'work', canonicalName: 'map0', mapName: 'Pool' },
      { mapType: 'work', canonicalName: 'map1', mapName: 'Front' },
      { mapType: 'unicom', canonicalName: 'map0tocharge_unicom', mapName: 'Dock' },
    ];
    expect(findMissingChannels(maps)).toEqual([{ from: 'map1', to: 'map0' }]);
  });

  it('finds an existing channel via canonicalName when the alias differs', () => {
    const maps = [
      { mapType: 'work', canonicalName: 'map0', mapName: 'Pool' },
      { mapType: 'work', canonicalName: 'map1', mapName: 'Front' },
      { mapType: 'unicom', canonicalName: 'map0tomap1_0_unicom', mapName: 'Channel' },
    ];
    expect(findMissingChannels(maps)).toEqual([]);
  });

  it('matches an existing channel by fileName even when the alias differs', () => {
    const maps = [
      work('map0'),
      work('map1'),
      { mapType: 'unicom', fileName: 'map0tomap1_0_unicom.csv', mapName: 'My Channel' },
    ];
    expect(findMissingChannels(maps)).toEqual([]);
  });

  it('treats a 0-byte / metadata-only connector row as still missing', () => {
    const maps = [
      { mapType: 'work', canonicalName: 'map0', mapName: 'Pool' },
      { mapType: 'work', canonicalName: 'map1', mapName: 'Front' },
      { mapType: 'unicom', canonicalName: 'map0tomap1_0_unicom', mapName: 'Channel', pointCount: 0 },
    ];
    expect(findMissingChannels(maps)).toEqual([{ from: 'map1', to: 'map0' }]);
  });

  it('counts a connector with real geometry as present', () => {
    const maps = [
      { mapType: 'work', canonicalName: 'map0' },
      { mapType: 'work', canonicalName: 'map1' },
      { mapType: 'unicom', canonicalName: 'map0tomap1_0_unicom', pointCount: 25 },
    ];
    expect(findMissingChannels(maps)).toEqual([]);
  });
});
