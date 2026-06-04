export interface XY { x: number; y: number; }

/** Ray-casting point-in-polygon (even-odd). */
export function pointInPolygon(p: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y))
      && (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInAnyPolygon(p: XY, polys: XY[][]): boolean {
  return polys.some((poly) => poly.length >= 3 && pointInPolygon(p, poly));
}

/**
 * Generate a connector path from one work zone to another, sampled at `stepM`
 * and CLIPPED to the free union of all work polygons so the corridor never
 * crosses outside-boundary or obstacle space. For overlapping zones (the LFI
 * multi-zone norm) the straight line stays entirely inside the union; for a
 * real gap the in-gap samples are dropped.
 */
export function generateUnicomPath(
  fromPts: XY[], toPts: XY[], workPolys: XY[][], stepM = 0.25,
): XY[] {
  if (fromPts.length === 0 || toPts.length === 0) return [];
  const target: XY = {
    x: toPts.reduce((s, p) => s + p.x, 0) / toPts.length,
    y: toPts.reduce((s, p) => s + p.y, 0) / toPts.length,
  };
  let closest = fromPts[0], best = Infinity;
  for (const p of fromPts) {
    const d = (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
    if (d < best) { best = d; closest = p; }
  }
  const dist = Math.hypot(closest.x - target.x, closest.y - target.y);
  const steps = Math.max(2, Math.ceil(dist / stepM));
  const path: XY[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const p: XY = {
      x: target.x + t * (closest.x - target.x),
      y: target.y + t * (closest.y - target.y),
    };
    if (pointInAnyPolygon(p, workPolys)) path.push(p);
  }
  return path;
}
