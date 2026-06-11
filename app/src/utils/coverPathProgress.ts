/**
 * Cover-path progress helpers — GEDEELD tussen de OpenNova app en het dashboard.
 * Bron van waarheid; mirror in dashboard/src/utils/coverPathProgress.ts (houd
 * identiek, net als editGeometry/mapEditGeometry).
 *
 * De maaier publiceert cover_path.covered via report_state_timer_data; de server
 * (sensorData.ts) sluist de ruwe strings door. Deze helpers parsen ze zodat zowel
 * de app (SVG) als het dashboard (Leaflet) elk pad-segment kunnen classificeren:
 *   - finished  → dik groen ("gemaaid")
 *   - actief    → emerald tot de al-gedekte punt (covering_area_points)
 *   - resterend → dunne hint-lijn
 * Pure, dependency-vrij.
 */

/**
 * finished_area (" 0 1 2 3 ...") → sub-area-indices. plannedPaths[].id is
 * "{map_id}_{sub_id}" (bv. "1_0"), dus we prefixen elke index met de actieve
 * cover_map_id om te matchen, én geven de kale index mee voor compat.
 */
export function parseFinishedAreas(
  raw: string | undefined,
  mapId: string | undefined,
): string[] | undefined {
  if (!raw) return undefined;
  const ids = raw.trim().split(/\s+/).filter((s) => s.length > 0);
  if (mapId && mapId.length > 0) {
    return ids.flatMap((sub) => [`${mapId}_${sub}`, sub]);
  }
  return ids;
}

/** covering_area_id + cover_map_id → het actieve pad-id ("{map_id}_{sub_id}"). */
export function prefixedAreaId(
  raw: string | undefined,
  mapId: string | undefined,
): string | undefined {
  if (!raw) return undefined;
  if (mapId && mapId.length > 0) return `${mapId}_${raw}`;
  return raw;
}

/**
 * covering_points ("2.48 -1.62,2.49 -1.63") → live cover-segment (lokale meters).
 * Komma scheidt punten, spatie scheidt x/y.
 */
export function parseCoveringPoints(
  raw: string | undefined,
): Array<{ x: number; y: number }> | undefined {
  if (!raw) return undefined;
  const points: Array<{ x: number; y: number }> = [];
  for (const chunk of raw.split(',')) {
    const [xs, ys] = chunk.trim().split(/\s+/);
    const x = parseFloat(xs);
    const y = parseFloat(ys);
    if (!isNaN(x) && !isNaN(y)) points.push({ x, y });
  }
  return points.length > 0 ? points : undefined;
}
