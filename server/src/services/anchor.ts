/**
 * Polygon anchor lookup — returns the canonical charger pose that the mower's
 * polygon was built around.
 *
 * Source-of-truth ordering:
 *   1. `map0tocharge_unicom.csv` first point — automatically written by the
 *      mower at mapping time (save_recharge_pos). Survives metadata corruption
 *      because it lives inside the polygon CSV itself, not in a sidecar file.
 *   2. Orientation is not in unicom CSV — fall back to mower's current
 *      `map_position_orientation` sensor reading when localization is healthy,
 *      else 1.5 rad (≈ 86°, typical dock orientation default).
 *
 * Used by:
 *   - regenerateLatestZipFromBackup (Novabot-kmn) — embed correct charger pose
 *     in the ZIP's map_info.json so dashboard renders + mower realign work.
 *   - /api/dashboard/maps/:sn/sync-info (Novabot-aev) — return canonical
 *     `charging_pose` for mower's extended sync_map handler to write into yaml.
 *   - /api/admin-status/map-backups/:sn/:filename/restore-and-realign
 *     (Novabot-uvf) — full one-click restore endpoint.
 *
 * Spec: docs/superpowers/specs/2026-05-03-restore-and-realign-mower-from-zip.md
 */

import { mapRepo } from '../db/repositories/maps.js';
import { deviceCache } from '../mqtt/sensorData.js';

export interface PolygonAnchor {
  /** Charger position in map-frame meters, x. */
  x: number;
  /** Charger position in map-frame meters, y. */
  y: number;
  /** Charger heading in radians. From sensor cache when localization is
   *  healthy; else default 1.5 rad. */
  orientation: number;
  /** Where the orientation came from — useful for callers to log/decide
   *  whether to retry once localization stabilises. */
  orientationSource: 'sensor' | 'default';
}

const DEFAULT_ORIENTATION = 1.5;

/**
 * Localization states we trust enough to read map_position_orientation from.
 * Stock firmware emits a mix of literal labels (NOT_INITIALIZED, INITIALIZING,
 * INITIALIZED, LOST) and free-form labels (RUNNING) depending on the source
 * node. We deny-list the explicitly-bad ones; everything else is acceptable.
 */
function isLocalizationHealthy(state: string | null | undefined): boolean {
  if (!state) return false;
  return !/^(not[ _]?initialized|initializing|lost|failed|error)$/i.test(state);
}

/**
 * Pull the polygon's charger anchor from the unicom CSV stored in the maps
 * table. Returns null when the mower has no unicom map (in which case the
 * caller cannot anchor and must fail or fall back).
 *
 * The unicom CSV is stored in `maps.map_area` as a JSON-encoded array of
 * {x, y} points. By construction the first point is the mower's pose at
 * `save_recharge_pos` time — i.e. the charger position in map frame.
 */
export function getPolygonAnchor(sn: string): PolygonAnchor | null {
  const unicomMaps = mapRepo.findAllByMowerSnAndType(sn, 'unicom');
  if (unicomMaps.length === 0) return null;

  // Prefer the canonical `mapNtocharge_unicom` over `mapNtomapM_K_unicom`.
  // The to-charge unicom anchors at the dock; map-to-map unicoms anchor
  // at adjacent map borders, which is not what we want.
  const toCharge = unicomMaps.find((m) =>
    /^map\d+tocharge_unicom$/.test(m.canonical_name ?? m.map_name ?? ''),
  );
  const chosen = toCharge ?? unicomMaps[0];
  if (!chosen.map_area) return null;

  let pts: Array<{ x: number; y: number }>;
  try {
    pts = JSON.parse(chosen.map_area) as Array<{ x: number; y: number }>;
  } catch {
    return null;
  }
  if (!Array.isArray(pts) || pts.length === 0) return null;

  const first = pts[0];
  // JSON.stringify converts NaN/Infinity to null, so an explicit null/undefined
  // check is needed before Number() (which would coerce null to 0).
  if (first == null || first.x == null || first.y == null) return null;
  const x = Number(first.x);
  const y = Number(first.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  // Orientation: try sensor cache, else default.
  const sensors = deviceCache.get(sn);
  const locState = sensors?.get('localization_state');
  const orientationRaw = sensors?.get('map_position_orientation');
  const orientationNum = orientationRaw != null ? Number(orientationRaw) : NaN;
  const sensorUsable = isLocalizationHealthy(locState ?? null) && Number.isFinite(orientationNum);

  return {
    x,
    y,
    orientation: sensorUsable ? orientationNum : DEFAULT_ORIENTATION,
    orientationSource: sensorUsable ? 'sensor' : 'default',
  };
}
