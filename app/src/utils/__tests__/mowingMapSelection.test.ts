import { describe, expect, it } from 'vitest';
import {
  resolveMowingMapSelection,
  gateCoverTelemetry,
  type MowingMapCandidate,
  type CoverTelemetryBaseline,
} from '../mowingMapSelection';

const maps: MowingMapCandidate[] = [
  { mapId: 'a', mapName: 'map0', canonicalName: 'map0' },
  { mapId: 'b', mapName: 'map1', canonicalName: 'map1' },
  { mapId: 'c', mapName: 'map2', canonicalName: 'map2' },
];

describe('resolveMowingMapSelection — firmware area enum', () => {
  // The regression: cover_map_id=1 is map0 (NOT slot index 1). Mapping 1->map1
  // surfaced the false "Started map0, mower reports map1" banner.
  it('maps cover_map_id enum 1/10/200 to map0/map1/map2', () => {
    expect(resolveMowingMapSelection(maps, { coverMapId: 1 }).telemetryMap?.canonicalName).toBe('map0');
    expect(resolveMowingMapSelection(maps, { coverMapId: 10 }).telemetryMap?.canonicalName).toBe('map1');
    expect(resolveMowingMapSelection(maps, { coverMapId: 200 }).telemetryMap?.canonicalName).toBe('map2');
  });

  it('accepts raw 0/2 slot indices too', () => {
    expect(resolveMowingMapSelection(maps, { coverMapId: 0 }).telemetryMap?.canonicalName).toBe('map0');
    expect(resolveMowingMapSelection(maps, { coverMapId: 2 }).telemetryMap?.canonicalName).toBe('map2');
  });

  it('flags a mismatch only when expected and telemetry disagree', () => {
    const ok = resolveMowingMapSelection(maps, { intendedMapIds: ['a'], coverMapId: 1 });
    expect(ok.mismatch).toBe(false);
    expect(ok.activeMap?.canonicalName).toBe('map0');

    const bad = resolveMowingMapSelection(maps, { intendedMapIds: ['a'], coverMapId: 10 });
    expect(bad.mismatch).toBe(true);
    expect(bad.expectedMap?.canonicalName).toBe('map0');
    expect(bad.telemetryMap?.canonicalName).toBe('map1');
  });

  it('multi-map: telemetry on ANY selected map is not a mismatch (native multi-zone)', () => {
    // User selected map0+map1; firmware advances cover_map_id 1 -> 10 between
    // zones. Both are selected, so neither is a mismatch, and the highlight
    // follows the live zone.
    const onMap0 = resolveMowingMapSelection(maps, { intendedMapIds: ['a', 'b'], coverMapId: 1 });
    expect(onMap0.mismatch).toBe(false);
    expect(onMap0.activeMap?.canonicalName).toBe('map0');

    const onMap1 = resolveMowingMapSelection(maps, { intendedMapIds: ['a', 'b'], coverMapId: 10 });
    expect(onMap1.mismatch).toBe(false);
    expect(onMap1.activeMap?.canonicalName).toBe('map1');

    // A map the user did NOT select (map2) is still a real mismatch.
    const onMap2 = resolveMowingMapSelection(maps, { intendedMapIds: ['a', 'b'], coverMapId: 100 });
    expect(onMap2.mismatch).toBe(true);
    expect(onMap2.telemetryMap?.canonicalName).toBe('map2');
  });

  it('falls back to the expected map when telemetry is absent', () => {
    const sel = resolveMowingMapSelection(maps, { intendedMapIds: ['b'] });
    expect(sel.telemetryMap).toBeNull();
    expect(sel.activeMap?.canonicalName).toBe('map1');
    expect(sel.mismatch).toBe(false);
  });

  it('falls back to currentMapIds when coverMapId is missing', () => {
    const sel = resolveMowingMapSelection(maps, { currentMapIds: 10 });
    expect(sel.telemetryMap?.canonicalName).toBe('map1');
  });
});

describe('gateCoverTelemetry — stale-on-start gate', () => {
  // Reproduces the bug: start map0 while cover_map_id still holds the previous
  // run's "10" (map1). It must read as STALE until the value moves off baseline.
  it('treats the value captured at session start as stale', () => {
    const r = gateCoverTelemetry(null, 'map0-id', '10');
    expect(r.fresh).toBe(false);
    expect(r.baseline).toEqual({ key: 'map0-id', cover: '10' });
  });

  it('becomes fresh once cover_map_id moves off the baseline', () => {
    const baseline: CoverTelemetryBaseline = { key: 'map0-id', cover: '10' };
    expect(gateCoverTelemetry(baseline, 'map0-id', '10').fresh).toBe(false);
    expect(gateCoverTelemetry(baseline, 'map0-id', '1').fresh).toBe(true);
  });

  it('re-snapshots a fresh baseline when the intended map changes', () => {
    const prev: CoverTelemetryBaseline = { key: 'map0-id', cover: '1' };
    const r = gateCoverTelemetry(prev, 'map1-id', '1');
    expect(r.baseline).toEqual({ key: 'map1-id', cover: '1' });
    expect(r.fresh).toBe(false);
  });

  it('passes telemetry straight through when there is no active session', () => {
    expect(gateCoverTelemetry(null, '', '10')).toEqual({ baseline: null, fresh: true });
    expect(gateCoverTelemetry(null, '', null)).toEqual({ baseline: null, fresh: false });
  });

  it('end-to-end: stale map1 suppresses the false mismatch, fresh map0 clears it', () => {
    // Session start: user picked map0, firmware still reports stale 10 (map1).
    let baseline = gateCoverTelemetry(null, 'a', '10');
    let sel = resolveMowingMapSelection(maps, {
      intendedMapIds: ['a'],
      coverMapId: baseline.fresh ? 10 : undefined,
    });
    expect(sel.mismatch).toBe(false);            // no false banner
    expect(sel.activeMap?.canonicalName).toBe('map0'); // user's map stays highlighted

    // Mower drives over, emits its first map0 tick -> cover_map_id flips to 1.
    baseline = gateCoverTelemetry(baseline.baseline, 'a', '1');
    sel = resolveMowingMapSelection(maps, {
      intendedMapIds: ['a'],
      coverMapId: baseline.fresh ? 1 : undefined,
    });
    expect(baseline.fresh).toBe(true);
    expect(sel.mismatch).toBe(false);
    expect(sel.activeMap?.canonicalName).toBe('map0');
  });

  it('end-to-end: a genuine mismatch still surfaces once telemetry is fresh', () => {
    // Previous run ended on map0 (stale "1"); user starts map0; mower wrongly
    // covers map1 -> emits "10".
    const baseline = gateCoverTelemetry({ key: 'a', cover: '1' }, 'a', '10');
    expect(baseline.fresh).toBe(true);
    const sel = resolveMowingMapSelection(maps, {
      intendedMapIds: ['a'],
      coverMapId: baseline.fresh ? 10 : undefined,
    });
    expect(sel.mismatch).toBe(true);
  });
});
