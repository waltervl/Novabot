import { mapRepo } from '../db/repositories/maps.js';

export interface XY { x: number; y: number; }

/** Ray-casting point-in-polygon (even-odd). */
export function pointInPolygon(p: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    // The (yi > p.y) !== (yj > p.y) parity check already rejects horizontal
    // edges (yi === yj), so the 1e-12 epsilon only guards near-horizontal ones.
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
  // Destination centroid is the target: LFI work zones are convex/overlapping,
  // so the centroid is always inside the zone and a safe aim point.
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
    // Path goes from->to: start at `closest` (source zone), end at `target`
    // (destination centroid), matching the (fromPts, toPts) contract.
    const p: XY = {
      x: closest.x + t * (target.x - closest.x),
      y: closest.y + t * (target.y - closest.y),
    };
    if (pointInAnyPolygon(p, workPolys)) path.push(p);
  }
  return path;
}

/**
 * For every inter-zone unicom (`map<i>tomap<j>_<n>_unicom`) that has no path
 * yet (cloud imports them 0-byte), generate a clipped connector path between
 * the two work zones and persist it. Returns the number of connectors filled.
 * No-op for single-zone maps, for map*tocharge channels, and for connectors
 * that already have a path (snapshot/native restores).
 */
export function fillMissingUnicomPaths(sn: string): number {
  const workRows = mapRepo.findAllByMowerSnAndType(sn, 'work').filter((w) => w.map_area);
  if (workRows.length < 2) return 0;
  const byIdx = new Map<number, XY[]>();
  for (const w of workRows) {
    const m = (w.canonical_name ?? '').match(/^map(\d+)$/);
    if (m) byIdx.set(parseInt(m[1], 10), JSON.parse(w.map_area as string) as XY[]);
  }
  const workPolys = [...byIdx.values()];
  let filled = 0;
  for (const u of mapRepo.findAllByMowerSnAndType(sn, 'unicom')) {
    if (u.map_area) continue;
    const m = (u.canonical_name ?? '').match(/^map(\d+)tomap(\d+)_\d+_unicom$/);
    if (!m) continue;
    const from = byIdx.get(parseInt(m[1], 10));
    const to = byIdx.get(parseInt(m[2], 10));
    if (!from || !to) continue;
    const path = generateUnicomPath(from, to, workPolys);
    if (path.length < 2) {
      console.warn(`[unicom] ${sn}: ${u.canonical_name} clipped to empty — skipped`);
      continue;
    }
    mapRepo.updateAreaAndBoundsById(u.map_id, JSON.stringify(path), '{}');
    filled++;
    console.log(`[unicom] ${sn}: filled ${u.canonical_name} (${path.length} pts)`);
  }
  return filled;
}
