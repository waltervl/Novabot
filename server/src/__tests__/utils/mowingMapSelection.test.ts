import { describe, expect, it } from 'vitest';
import { resolveMowingMapSelection } from '../../../../app/src/utils/mowingMapSelection.js';

const workMaps = [
  { mapId: 'db-1', mapName: 'Trampo', canonicalName: 'map0' },
  { mapId: 'db-11', mapName: 'Pool', canonicalName: 'map1' },
  { mapId: 'db-13', mapName: 'Front', canonicalName: 'map2' },
];

describe('resolveMowingMapSelection', () => {
  it('uses mower telemetry as the active map and flags mismatch with the app-started map', () => {
    const selection = resolveMowingMapSelection(workMaps, {
      intendedMapId: 'db-11',
      coverMapId: '2',
      currentMapIds: null,
    });

    expect(selection.activeMap?.mapId).toBe('db-13');
    expect(selection.expectedMap?.mapId).toBe('db-11');
    expect(selection.telemetryMap?.mapId).toBe('db-13');
    expect(selection.mismatch).toBe(true);
  });

  it('falls back to the selected map while telemetry is not available yet', () => {
    const selection = resolveMowingMapSelection(workMaps, {
      intendedMapId: 'db-11',
      coverMapId: null,
      currentMapIds: null,
    });

    expect(selection.activeMap?.mapId).toBe('db-11');
    expect(selection.mismatch).toBe(false);
  });

  it('understands both observed map2 telemetry encodings', () => {
    expect(resolveMowingMapSelection(workMaps, {
      intendedMapId: 'db-13',
      coverMapId: null,
      currentMapIds: '100',
    }).telemetryMap?.mapId).toBe('db-13');

    expect(resolveMowingMapSelection(workMaps, {
      intendedMapId: 'db-13',
      coverMapId: null,
      currentMapIds: '200',
    }).telemetryMap?.mapId).toBe('db-13');
  });
});
