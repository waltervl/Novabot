export interface XY {
  x: number;
  y: number;
}

/**
 * Rotate every point by theta radians around the origin (the charger anchor
 * in bundle coordinates is at (0, 0)). Sign convention matches gpsToLocal:
 *   x_out =  x*cos + y*sin
 *   y_out = -x*sin + y*cos
 * so a positive theta rotates the polygon clockwise when looking down at the
 * map from above (+y is north, +x is east).
 */
export function computeAnchorRebase(points: XY[], theta: number): XY[] {
  if (points.length === 0) return [];
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return points.map((p) => ({
    x: p.x * cos + p.y * sin,
    y: -p.x * sin + p.y * cos,
  }));
}
