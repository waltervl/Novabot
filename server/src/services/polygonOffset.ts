/**
 * Pure helpers for the admin polygon-offset calibration feature.
 *
 * Spec: docs/superpowers/specs/2026-05-03-admin-polygon-offset-calibration.md
 *
 * The offset is stored on map_calibration (polygon_offset_x_m,
 * polygon_offset_y_m) and applied at ZIP-generation time. The first point of
 * any mapNtocharge_unicom polygon is the canonical charger anchor and is
 * NEVER shifted — preserving the dock pose and pos.json origin.
 */

export interface XY {
  x: number;
  y: number;
}

const TO_CHARGE_UNICOM_RE = /^map\d+tocharge_unicom$/;

/**
 * Match the canonical name for the per-map "to-charge" unicom polygon.
 * Mirrors the regex used by getPolygonAnchor in services/anchor.ts.
 */
export function isToChargeUnicomName(name: string | null | undefined): boolean {
  if (!name) return false;
  return TO_CHARGE_UNICOM_RE.test(name);
}

/**
 * Translate every point by (dx, dy) metres. When isToChargeUnicom is true,
 * the point at index 0 is returned unchanged so the charger anchor stays
 * fixed regardless of offset.
 *
 * Returns the input array reference when (dx, dy) === (0, 0) — callers can
 * use referential equality to skip downstream work.
 */
export function shiftPoints(
  pts: XY[],
  dx: number,
  dy: number,
  isToChargeUnicom: boolean,
): XY[] {
  if (dx === 0 && dy === 0) return pts;
  return pts.map((p, i) => {
    if (isToChargeUnicom && i === 0) return p;
    // Round to 9 decimal places to avoid floating-point noise in metre-scale coordinates.
    return {
      x: Math.round((p.x + dx) * 1e9) / 1e9,
      y: Math.round((p.y + dy) * 1e9) / 1e9,
    };
  });
}

/**
 * Return the axis-aligned bounding box for a polygon point list. Used to
 * refresh map_max_min after shifting so map_info.json reflects the new
 * envelope. Returns null for an empty input.
 */
export function recomputeBounds(
  pts: XY[],
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (pts.length === 0) return null;
  let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].x < minX) minX = pts[i].x;
    if (pts[i].x > maxX) maxX = pts[i].x;
    if (pts[i].y < minY) minY = pts[i].y;
    if (pts[i].y > maxY) maxY = pts[i].y;
  }
  return { minX, maxX, minY, maxY };
}
