import { describe, expect, it } from 'vitest';
import { findMissingChannels, type ChannelMapLike } from '../mapChannels';

const work = (canonicalName: string): ChannelMapLike => ({ mapType: 'work', canonicalName });
const unicom = (canonicalName: string, pointCount = 10): ChannelMapLike => ({ mapType: 'unicom', canonicalName, pointCount });

describe('findMissingChannels', () => {
  it('returns [] for a single work map', () => {
    expect(findMissingChannels([work('map0')])).toEqual([]);
  });

  it('returns [] when the only other map is connected to the dock', () => {
    expect(findMissingChannels([work('map0'), work('map1'), unicom('map0tomap1_0_unicom')])).toEqual([]);
  });

  it('flags an unconnected zone, suggesting the dock map', () => {
    expect(findMissingChannels([work('map0'), work('map1')])).toEqual([{ from: 'map1', to: 'map0' }]);
  });

  it('hub-and-spoke is reachable transitively — no direct map1<->map2 needed (issue #97)', () => {
    const maps = [
      work('map0'), work('map1'), work('map2'),
      unicom('map0tomap1_0_unicom'),
      unicom('map0tomap2_0_unicom'),
    ];
    expect(findMissingChannels(maps)).toEqual([]);
  });

  it('suggests attaching an unreachable zone to the nearest reachable lower-index map', () => {
    // map0<->map1 only; map2 is unreachable. Nearest reachable lower-index = map1.
    const maps = [work('map0'), work('map1'), work('map2'), unicom('map0tomap1_0_unicom')];
    expect(findMissingChannels(maps)).toEqual([{ from: 'map2', to: 'map1' }]);
  });

  it('a metadata-only connector (<2 points) is not navigable', () => {
    const maps = [work('map0'), work('map1'), unicom('map0tomap1_0_unicom', 1)];
    expect(findMissingChannels(maps)).toEqual([{ from: 'map1', to: 'map0' }]);
  });

  it('ignores charge connectors (map0tocharge)', () => {
    const maps = [work('map0'), work('map1'), unicom('map0tocharge_unicom'), unicom('map0tomap1_0_unicom')];
    expect(findMissingChannels(maps)).toEqual([]);
  });
});
