export interface MowingMapCandidate {
  mapId: string;
  mapName?: string | null;
  canonicalName?: string | null;
}

export interface MowingMapSelectionInput {
  intendedMapId?: string | null;
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
  if (parsed >= 0 && parsed <= 2) return parsed;
  if (parsed === 10) return 1;
  if (parsed === 100 || parsed === 200) return 2;
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

export function resolveMowingMapSelection<T extends MowingMapCandidate>(
  workMaps: T[],
  input: MowingMapSelectionInput,
): MowingMapSelection<T> {
  const expectedMap = input.intendedMapId
    ? workMaps.find((map) => map.mapId === input.intendedMapId) ?? null
    : null;
  const telemetrySlot = slotFromCoverMapId(input.coverMapId)
    ?? slotFromCurrentMapIds(input.currentMapIds);
  const telemetryMap = findByCanonicalSlot(workMaps, telemetrySlot);
  const activeMap = telemetryMap ?? expectedMap ?? workMaps[0] ?? null;
  const mismatch = Boolean(expectedMap && telemetryMap && expectedMap.mapId !== telemetryMap.mapId);

  return {
    activeMap,
    expectedMap,
    telemetryMap,
    mismatch,
  };
}
