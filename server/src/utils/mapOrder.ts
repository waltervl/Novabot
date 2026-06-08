// Canonical map ordering. The mower names map slots map0, map1, map2, ... and
// the app's zone carousel shows work maps in the order the server returns them.
// findByMowerSn orders by updated_at DESC (most-recently-touched first), which
// puts whichever zone was last saved at position 1 — so a freshly-imported map2
// shows up as "1 / 3" instead of map0 (the dock zone / Zone1). Sort the response
// by the canonical slot index instead so zones always read map0, map1, map2.

export interface CanonicalNamed {
  canonical_name?: string | null;
  file_name?: string | null;
  map_name?: string | null;
}

/** Sort key for a map row: [zone index, within-zone rank]. Work maps (map0)
 *  sort before their obstacles (map0_0_obstacle) and unicoms (map0tomap1);
 *  rows with no mapN prefix sort last. Numeric on the index so map2 < map10. */
export function canonicalOrderKey(ref: string | null | undefined): [number, number] {
  const s = ref ?? '';
  const mi = /^map(\d+)/.exec(s);
  const idx = mi ? parseInt(mi[1], 10) : Number.MAX_SAFE_INTEGER;
  const obs = /^map\d+_(\d+)_obstacle/.exec(s);
  if (obs) return [idx, parseInt(obs[1], 10)]; // obstacles: after the work map, by sub-index
  if (/^map\d+to/.exec(s)) return [idx, 100_000]; // unicoms (mapXtoY): after obstacles
  return [idx, -1]; // work map: first within its zone
}

/** Comparator ordering map rows by canonical slot (map0, map1, map2, ...),
 *  preferring canonical_name then file_name then map_name. */
export function compareMapRowsByCanonical(a: CanonicalNamed, b: CanonicalNamed): number {
  const ka = canonicalOrderKey(a.canonical_name ?? a.file_name ?? a.map_name);
  const kb = canonicalOrderKey(b.canonical_name ?? b.file_name ?? b.map_name);
  return ka[0] - kb[0] || ka[1] - kb[1];
}
