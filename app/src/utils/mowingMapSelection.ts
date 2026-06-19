export interface MowingMapCandidate {
  mapId: string;
  mapName?: string | null;
  canonicalName?: string | null;
}

export interface MowingMapSelectionInput {
  /** The map(s) the user selected for this run. The firmware mows them in one
   *  task (decimal-bitmask `area`), advancing cover_map_id between them with no
   *  dock — so telemetry landing on ANY selected map is correct, not a mismatch.
   *  A mismatch is only a map OUTSIDE this set. */
  intendedMapIds?: string[] | null;
  coverMapId?: unknown;
  currentMapIds?: unknown;
}

export interface MowingMapSelection<T extends MowingMapCandidate> {
  activeMap: T | null;
  expectedMap: T | null;
  telemetryMap: T | null;
  mismatch: boolean;
}

function parseFiniteInt(value: unknown): number | null {
  if (value === null || typeof value === 'undefined') return null;
  const raw = String(value).trim();
  if (!raw || !/^-?\d+$/.test(raw)) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function slotFromCoverMapId(value: unknown): number | null {
  const parsed = parseFiniteInt(value);
  if (parsed === null) return null;
  // Firmware area enum (matches the start_navigation `area` value AND
  // slotFromCurrentMapIds): map0=1, map1=10, map2=200. cover_map_id=1 is map0,
  // NOT slot index 1 — the old `0..2 -> that slot` rule wrongly mapped 1 to
  // map1, surfacing the false "Started map0, mower reports map1" banner.
  if (parsed === 1) return 0;
  if (parsed === 10) return 1;
  if (parsed === 100 || parsed === 200) return 2;
  // Some builds emit a raw 0/2 slot index for map0/map2.
  if (parsed === 0) return 0;
  if (parsed === 2) return 2;
  return null;
}

function slotFromCurrentMapIds(value: unknown): number | null {
  const parsed = parseFiniteInt(value);
  if (parsed === null) return null;
  if (parsed === 1) return 0;
  if (parsed === 10) return 1;
  if (parsed === 100 || parsed === 200) return 2;
  return null;
}

function findByCanonicalSlot<T extends MowingMapCandidate>(workMaps: T[], slot: number | null): T | null {
  if (slot === null) return null;
  const byCanonical = workMaps.find((map) => {
    const match = (map.canonicalName ?? '').match(/^map(\d+)$/);
    return match ? parseInt(match[1], 10) === slot : false;
  });
  return byCanonical ?? workMaps[slot] ?? null;
}

export interface CoverTelemetryBaseline {
  /** The intended map this baseline belongs to (a mow "session" key). */
  key: string;
  /** cover_map_id captured at the moment that session started. */
  cover: string | null;
}

/**
 * Telemetry freshness gate for cover_map_id.
 *
 * cover_map_id is sticky firmware state: the mower only ever reports it (and the
 * server never clears it on a new start), so right after the user starts a mow
 * it still holds the PREVIOUS run's map. Comparing that stale value to the
 * just-selected map false-flags a mismatch and highlights the wrong polygon
 * until the mower drives to the zone and emits its first coverage tick (can take
 * minutes). We therefore snapshot the value at session start and treat telemetry
 * as fresh only once it moves off that baseline — no timer, since drive time is
 * unbounded.
 *
 * `prev` is the caller's retained baseline (a React ref). Returns the baseline
 * to retain plus whether the live value should now be trusted. When there is no
 * active session (`sessionKey === ''`) we pass telemetry straight through
 * (fresh = any non-null value), preserving the idle/reconnect display.
 */
export function gateCoverTelemetry(
  prev: CoverTelemetryBaseline | null,
  sessionKey: string,
  liveCover: string | null,
): { baseline: CoverTelemetryBaseline | null; fresh: boolean } {
  if (!sessionKey) return { baseline: null, fresh: liveCover != null };
  const baseline = prev?.key === sessionKey ? prev : { key: sessionKey, cover: liveCover };
  const fresh = liveCover != null && liveCover !== baseline.cover;
  return { baseline, fresh };
}

export function resolveMowingMapSelection<T extends MowingMapCandidate>(
  workMaps: T[],
  input: MowingMapSelectionInput,
): MowingMapSelection<T> {
  const intendedIds = input.intendedMapIds ?? [];
  // First selected map, in work-map order — display fallback before telemetry.
  const expectedMap = intendedIds.length > 0
    ? workMaps.find((map) => intendedIds.includes(map.mapId)) ?? null
    : null;
  const telemetrySlot = slotFromCoverMapId(input.coverMapId)
    ?? slotFromCurrentMapIds(input.currentMapIds);
  const telemetryMap = findByCanonicalSlot(workMaps, telemetrySlot);
  const activeMap = telemetryMap ?? expectedMap ?? workMaps[0] ?? null;
  // Mismatch only when the mower reports a map the user did NOT select. Moving
  // between selected zones (native multi-map) is expected, not a mismatch.
  const mismatch = Boolean(
    telemetryMap && intendedIds.length > 0 && !intendedIds.includes(telemetryMap.mapId),
  );

  return {
    activeMap,
    expectedMap,
    telemetryMap,
    mismatch,
  };
}
