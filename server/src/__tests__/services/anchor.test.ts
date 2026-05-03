import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock data sources before importing the SUT so the module pulls our stubs.
vi.mock('../../db/repositories/maps.js', () => ({
  mapRepo: {
    findAllByMowerSnAndType: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('../../mqtt/sensorData.js', () => ({
  deviceCache: new Map<string, Map<string, string>>(),
}));

import { getPolygonAnchor } from '../../services/anchor.js';
import { mapRepo } from '../../db/repositories/maps.js';
import { deviceCache } from '../../mqtt/sensorData.js';

const SN = 'LFIN1231000211';

function unicomRow(canonical: string, points: Array<{ x: number; y: number }>) {
  return {
    id: 1,
    map_id: canonical,
    mower_sn: SN,
    map_name: canonical,
    map_type: 'unicom',
    map_area: JSON.stringify(points),
    map_max_min: null,
    file_name: null,
    file_size: null,
    canonical_name: canonical,
    created_at: '',
    updated_at: '',
  };
}

beforeEach(() => {
  vi.mocked(mapRepo.findAllByMowerSnAndType).mockReset().mockReturnValue([]);
  deviceCache.clear();
});

describe('getPolygonAnchor', () => {
  it('returns null when no unicom map exists', () => {
    expect(getPolygonAnchor(SN)).toBeNull();
  });

  it('returns first point of mapNtocharge_unicom + default orientation', () => {
    vi.mocked(mapRepo.findAllByMowerSnAndType).mockReturnValue([
      unicomRow('map0tocharge_unicom', [
        { x: -1.21, y: 0.48 },
        { x: -1.2, y: 0.45 },
      ]),
    ]);
    const a = getPolygonAnchor(SN);
    expect(a).not.toBeNull();
    expect(a!.x).toBeCloseTo(-1.21);
    expect(a!.y).toBeCloseTo(0.48);
    expect(a!.orientation).toBeCloseTo(1.5);
    expect(a!.orientationSource).toBe('default');
  });

  it('prefers tocharge_unicom over map-to-map unicom', () => {
    vi.mocked(mapRepo.findAllByMowerSnAndType).mockReturnValue([
      unicomRow('map0tomap1_0_unicom', [{ x: 99, y: 99 }]),
      unicomRow('map0tocharge_unicom', [{ x: -1.21, y: 0.48 }]),
    ]);
    const a = getPolygonAnchor(SN);
    expect(a!.x).toBeCloseTo(-1.21);
    expect(a!.y).toBeCloseTo(0.48);
  });

  it('uses sensor map_position_orientation when localization is healthy', () => {
    vi.mocked(mapRepo.findAllByMowerSnAndType).mockReturnValue([
      unicomRow('map0tocharge_unicom', [{ x: -1.21, y: 0.48 }]),
    ]);
    const sensors = new Map<string, string>();
    sensors.set('localization_state', 'RUNNING');
    sensors.set('map_position_orientation', '1.586');
    deviceCache.set(SN, sensors);

    const a = getPolygonAnchor(SN);
    expect(a!.orientation).toBeCloseTo(1.586);
    expect(a!.orientationSource).toBe('sensor');
  });

  it('falls back to default orientation when localization is Not initialized', () => {
    vi.mocked(mapRepo.findAllByMowerSnAndType).mockReturnValue([
      unicomRow('map0tocharge_unicom', [{ x: -1.21, y: 0.48 }]),
    ]);
    const sensors = new Map<string, string>();
    sensors.set('localization_state', 'Not initialized');
    sensors.set('map_position_orientation', '0');
    deviceCache.set(SN, sensors);

    const a = getPolygonAnchor(SN);
    expect(a!.orientation).toBeCloseTo(1.5);
    expect(a!.orientationSource).toBe('default');
  });

  it.each([
    ['Initializing'],
    ['LOST'],
    ['failed'],
    ['error'],
    [''],
  ])('rejects bad localization_state %s and uses default', (state) => {
    vi.mocked(mapRepo.findAllByMowerSnAndType).mockReturnValue([
      unicomRow('map0tocharge_unicom', [{ x: -1.21, y: 0.48 }]),
    ]);
    const sensors = new Map<string, string>();
    sensors.set('localization_state', state);
    sensors.set('map_position_orientation', '2.5');
    deviceCache.set(SN, sensors);

    const a = getPolygonAnchor(SN);
    expect(a!.orientationSource).toBe('default');
  });

  it('returns null when unicom CSV has no points', () => {
    vi.mocked(mapRepo.findAllByMowerSnAndType).mockReturnValue([
      unicomRow('map0tocharge_unicom', []),
    ]);
    expect(getPolygonAnchor(SN)).toBeNull();
  });

  it('returns null when map_area JSON is malformed', () => {
    vi.mocked(mapRepo.findAllByMowerSnAndType).mockReturnValue([
      {
        id: 1,
        map_id: 'map0tocharge_unicom',
        mower_sn: SN,
        map_name: 'map0tocharge_unicom',
        map_type: 'unicom',
        map_area: 'not-json{',
        map_max_min: null,
        file_name: null,
        file_size: null,
        canonical_name: 'map0tocharge_unicom',
        created_at: '',
        updated_at: '',
      },
    ]);
    expect(getPolygonAnchor(SN)).toBeNull();
  });

  it('returns null when first point has non-finite coords', () => {
    vi.mocked(mapRepo.findAllByMowerSnAndType).mockReturnValue([
      unicomRow('map0tocharge_unicom', [{ x: NaN, y: 0 }]),
    ]);
    expect(getPolygonAnchor(SN)).toBeNull();
  });
});
