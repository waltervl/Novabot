/**
 * Paint/erase brush geometry — DASHBOARD-ONLY (not part of the editGeometry
 * server mirror). Boolean polygon ops in the local meter frame (charger = 0,0).
 *
 * Paint = polygon ∪ brush-circle (add area locally).
 * Erase = polygon − brush-circle (remove area locally).
 *
 * Uses polygon-clipping (ESM default import). Its coords are
 * MultiPolygon = Ring[][] where Ring = [x,y][] and rings are CLOSED
 * (first point repeated at the end). Our XY rings are OPEN.
 */
import pc, { type MultiPolygon, type Pair } from 'polygon-clipping';
import { simplifyPolygon, polygonArea, type XY } from './editGeometry';

const BRUSH_SEGMENTS = 24;
const RESULT_SIMPLIFY_TOL = 0.03; // m — keep the boolean result's point count sane

/** BRUSH_SEGMENTS-gon (open ring) approximating a circle around `center`. */
function brushCircle(center: XY, radius: number): XY[] {
  const out: XY[] = [];
  for (let i = 0; i < BRUSH_SEGMENTS; i++) {
    const a = (2 * Math.PI * i) / BRUSH_SEGMENTS;
    out.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return out;
}

/** Open XY ring → closed [x,y] coord ring for polygon-clipping. */
function toClosedCoords(ring: XY[]): Pair[] {
  const coords: Pair[] = ring.map(p => [p.x, p.y] as Pair);
  if (coords.length > 0) coords.push([ring[0].x, ring[0].y]);
  return coords;
}

/**
 * Pick the polygon with the largest |area| from a polygon-clipping result and
 * return its OUTER ring as an open XY[] (closing duplicate stripped). Holes and
 * smaller disjoint pieces are dropped — mower maps are a single ring, no holes.
 * Returns [] for an empty result.
 *
 * MultiPolygon shape: result[polyIdx][ringIdx][ptIdx] = [x, y]; ring 0 is the
 * outer boundary of each polygon.
 */
function largestOuterRing(result: MultiPolygon): XY[] {
  if (!result || result.length === 0) return [];
  let best: XY[] = [];
  let bestArea = -1;
  for (const poly of result) {
    const outer = poly?.[0];
    if (!outer || outer.length < 4) continue; // closed ring needs >= 4 pts (incl. dup)
    // Strip the closing duplicate (polygon-clipping closes rings).
    const open: XY[] = [];
    for (let i = 0; i < outer.length - 1; i++) {
      open.push({ x: outer[i][0], y: outer[i][1] });
    }
    if (open.length < 3) continue;
    const a = polygonArea(open);
    if (a > bestArea) { bestArea = a; best = open; }
  }
  return best;
}

/** Union the brush circle into poly (add area locally). */
export function paintCircle(poly: XY[], center: XY, radius: number): XY[] {
  if (poly.length < 3) return poly;
  const res = pc.union([toClosedCoords(poly)], [toClosedCoords(brushCircle(center, radius))]);
  const ring = largestOuterRing(res);
  if (ring.length < 3) return poly;             // op failed → unchanged
  return simplifyPolygon(ring, RESULT_SIMPLIFY_TOL);
}

/** Subtract the brush circle from poly (remove area locally). */
export function eraseCircle(poly: XY[], center: XY, radius: number): XY[] {
  if (poly.length < 3) return poly;
  const res = pc.difference([toClosedCoords(poly)], [toClosedCoords(brushCircle(center, radius))]);
  const ring = largestOuterRing(res);
  if (ring.length < 3 || polygonArea(ring) < 0.25) return poly; // erased to nothing → keep prior
  return simplifyPolygon(ring, RESULT_SIMPLIFY_TOL);
}
