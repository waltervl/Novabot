/**
 * Faithful server-side reimplementation of the mower firmware's
 * `map_generator.cpp` occupancy-grid generation (the `save_map type:1` path in
 * `novabot_mapping`). Produces the Nav2 map_saver-style outputs
 * (map.yaml/pgm/png + per-map mapN.*) so cloud/polygon-only restores get a
 * costmap matching what the mower itself writes.
 *
 * Algorithm + constants are documented in
 * research/documents/mower-occupancy-grid-algorithm.md (Ghidra RE of
 * MapGenerator::saveMap @ 0x00133588) and validated byte-for-byte by
 * server/src/__tests__/maps/occupancyGrid.test.ts against the LFIN1231000211
 * fixtures.
 *
 * Pure: inputs in, buffers out. No I/O.
 */
import ClipperLib from 'clipper-lib';

export interface XY { x: number; y: number; }

export interface MapInput {
  workMaps: { canonical: string; points: XY[] }[];   // local meters, charger-relative
  obstacles: { parentMap: string; points: XY[] }[];
  unicom: { name: string; points: XY[] }[];
  chargingPose: { x: number; y: number; orientation: number };
}

export interface GridFile { yaml: string; pgm: Buffer; png?: Buffer; }
export interface GeneratedMap { whole: GridFile; perMap: { name: string; file: GridFile }[]; }

/** ClipperOffset deltas (metres) applied to each polygon set before rasterizing,
 * mirroring NovabotMapping::expandPolygon (work +offset, obstacle -obstacle_offset,
 * unicom -obstacle_offset/2). The firmware applies these to the RECORDED (sensor)
 * boundary; for already-final boundaries (cloud/restore CSVs) the correct delta is
 * ~0, so default to no offset. See research/documents/mower-occupancy-grid-algorithm.md §8. */
export interface OffsetOpts { work: number; obstacle: number; unicom: number; }
const DEFAULT_OFFSETS: OffsetOpts = { work: 0, obstacle: 0, unicom: 0 };

// ── Firmware constants (see algorithm doc §1) ───────────────────────────────
const RES = 0.05;            // resolution_ (hardcoded; area const 0.0025 = RES^2)
const BORDER_DISTANCE = 1.0; // ROS param border_distance
const FREE = 254;            // .rodata 0x1c9c50
const OCCUPIED = 0;          // Mat init + obstacle fill + dock body
const PI = 3.1415926;        // .rodata 0x1c9c90

const trunc = (v: number): number => Math.trunc(v);
const iround = (v: number): number => Math.trunc(v + 0.5); // firmware (int)(v+0.5)

interface Geometry { width: number; height: number; originX: number; originY: number; }

function computeGeometry(pts: XY[]): Geometry {
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const p of pts) {
    const x = Math.fround(p.x), y = Math.fround(p.y);
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  const borderCells = trunc(BORDER_DISTANCE / RES);   // 20
  const borderMetres = borderCells * RES;             // 1.0
  const width = 2 * borderCells + iround((xMax - xMin) / RES);
  const height = 2 * borderCells + iround((yMax - yMin) / RES);
  const originX = RES * trunc(xMin / RES) - borderMetres;
  const originY = RES * trunc(yMin / RES) - borderMetres;
  return { width, height, originX, originY };
}

function toPx(x: number, y: number, g: Geometry): { c: number; r: number } {
  const c = trunc((x - g.originX) / RES);
  const r = (g.height - 1) - trunc((y - g.originY) / RES);
  return { c, r };
}

function polyToPx(points: XY[], g: Geometry): { c: number; r: number }[] {
  return points.map((p) => toPx(Math.fround(p.x), Math.fround(p.y), g));
}

// NovabotMapping::expandPolygon — ClipperOffset(miterLimit=2.0, arcTolerance=0.25),
// scale x10000, jtRound + etClosedPolygon. Returns offset rings (may be >1) in metres.
const CLIP_SCALE = 10000;
function expandPolygon(points: XY[], deltaM: number): XY[][] {
  if (deltaM === 0 || points.length < 3) return points.length ? [points] : [];
  const path = points.map((p) => ({
    X: Math.trunc(Math.fround(p.x) * CLIP_SCALE),
    Y: Math.trunc(Math.fround(p.y) * CLIP_SCALE),
  }));
  const co = new ClipperLib.ClipperOffset(2.0, 0.25);
  co.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const sol: { X: number; Y: number }[][] = [];
  co.Execute(sol, deltaM * CLIP_SCALE);
  return sol.map((ring) => ring.map((q) => ({ x: q.X / CLIP_SCALE, y: q.Y / CLIP_SCALE })));
}

// ── OpenCV-compatible scanline polygon fill (even-odd) ──────────────────────
// Mirrors cv::fillPoly / FillEdgeCollection for integer vertices: edges are
// half-open on the lower-y endpoint, spans filled inclusive [xl, xr].
function fillPoly(grid: Uint8Array, W: number, H: number,
                  poly: { c: number; r: number }[], value: number): void {
  const n = poly.length;
  if (n < 2) return;
  // edge list
  interface Edge { y0: number; y1: number; x: number; dxdy: number; }
  const edges: Edge[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    let { c: x0, r: y0 } = a;
    let { c: x1, r: y1 } = b;
    if (y0 === y1) continue;
    let xAtY0: number, dxdy: number, ya: number, yb: number;
    if (y0 < y1) { ya = y0; yb = y1; xAtY0 = x0; dxdy = (x1 - x0) / (y1 - y0); }
    else { ya = y1; yb = y0; xAtY0 = x1; dxdy = (x0 - x1) / (y0 - y1); }
    edges.push({ y0: ya, y1: yb, x: xAtY0, dxdy });
  }
  if (!edges.length) return;
  let yTop = Infinity, yBot = -Infinity;
  for (const e of edges) { if (e.y0 < yTop) yTop = e.y0; if (e.y1 > yBot) yBot = e.y1; }
  if (yTop < 0) yTop = 0;
  if (yBot > H) yBot = H;
  for (let y = yTop; y < yBot; y++) {
    const sy = y + 0.5; // scan at pixel center
    const xs: number[] = [];
    for (const e of edges) {
      if (sy >= e.y0 && sy < e.y1) {
        xs.push(e.x + (sy - e.y0) * e.dxdy);
      }
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      let xl = Math.round(xs[i]);
      let xr = Math.round(xs[i + 1]);
      if (xr < 0 || xl >= W) continue;
      if (xl < 0) xl = 0;
      if (xr >= W) xr = W - 1;
      const row = y * W;
      for (let x = xl; x <= xr; x++) grid[row + x] = value;
    }
  }
}

// ── 3x3 ellipse (cross) dilate: free (254) spreads into neighbors ───────────
function dilate3x3(grid: Uint8Array, W: number, H: number): void {
  const src = grid.slice();
  // MORPH_ELLIPSE size 3 => cross: center + 4-neighbors
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      let m = src[r * W + c];
      if (r > 0 && src[(r - 1) * W + c] > m) m = src[(r - 1) * W + c];
      if (r < H - 1 && src[(r + 1) * W + c] > m) m = src[(r + 1) * W + c];
      if (c > 0 && src[r * W + c - 1] > m) m = src[r * W + c - 1];
      if (c < W - 1 && src[r * W + c + 1] > m) m = src[r * W + c + 1];
      grid[r * W + c] = m;
    }
  }
}

// ── OpenCV-style filled circle (cv::circle thickness=-1) ────────────────────
function fillCircle(grid: Uint8Array, W: number, H: number,
                    cx: number, cy: number, radius: number, value: number): void {
  let x = 0, y = radius;
  let dErr = 3 - 2 * radius;
  const hline = (xl: number, xr: number, yy: number) => {
    if (yy < 0 || yy >= H) return;
    if (xl < 0) xl = 0;
    if (xr >= W) xr = W - 1;
    const row = yy * W;
    for (let xi = xl; xi <= xr; xi++) grid[row + xi] = value;
  };
  while (x <= y) {
    hline(cx - x, cx + x, cy + y);
    hline(cx - x, cx + x, cy - y);
    hline(cx - y, cx + y, cy + x);
    hline(cx - y, cx + y, cy - x);
    if (dErr < 0) { dErr += 4 * x + 6; }
    else { dErr += 4 * (x - y) + 10; y--; }
    x++;
  }
}

interface OffsetRings { work: XY[][]; obstacles: XY[][]; unicom: XY[][]; }
function offsetAll(input: MapInput, o: OffsetOpts): OffsetRings {
  const work: XY[][] = [], obstacles: XY[][] = [], unicom: XY[][] = [];
  for (const w of input.workMaps) work.push(...expandPolygon(w.points, o.work));
  for (const ob of input.obstacles) obstacles.push(...expandPolygon(ob.points, o.obstacle));
  for (const u of input.unicom) unicom.push(...expandPolygon(u.points, o.unicom));
  return { work, obstacles, unicom };
}
function collectRingPoints(r: OffsetRings): XY[] {
  const pts: XY[] = [];
  for (const ring of r.work) pts.push(...ring);
  for (const ring of r.obstacles) pts.push(...ring);
  for (const ring of r.unicom) pts.push(...ring);
  return pts;
}

function yaml(image: string, g: Geometry): string {
  const f = (v: number) => v.toFixed(6);
  return `image: ${image}\nresolution: ${f(RES)}\norigin: [${f(g.originX)}, ${f(g.originY)}, ${f(0)}]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n\n`;
}

function pgm(grid: Uint8Array, g: Geometry): Buffer {
  const header = `P5\n# CREATOR: map_generator.cpp ${RES.toFixed(3)} m/pix\n${g.width} ${g.height}\n255\n`;
  return Buffer.concat([Buffer.from(header, 'ascii'), Buffer.from(grid)]);
}

function buildWhole(input: MapInput, rings: OffsetRings, g: Geometry): Uint8Array {
  const W = g.width, H = g.height;
  const grid = new Uint8Array(W * H); // init 0 (OCCUPIED)

  // 1. work areas -> free
  for (const ring of rings.work) fillPoly(grid, W, H, polyToPx(ring, g), FREE);
  // 2. unicom -> free
  for (const ring of rings.unicom) fillPoly(grid, W, H, polyToPx(ring, g), FREE);
  // 3. obstacles -> occupied
  for (const ring of rings.obstacles) fillPoly(grid, W, H, polyToPx(ring, g), OCCUPIED);

  // 4a. whole_map_handle_switch == true: dilate, re-stamp obstacles, dilate
  dilate3x3(grid, W, H);
  for (const ring of rings.obstacles) fillPoly(grid, W, H, polyToPx(ring, g), OCCUPIED);
  dilate3x3(grid, W, H);

  // 9. dock circles
  const { x, y, orientation: th } = input.chargingPose;
  if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(th)) {
    const sinT = Math.sin(th), cosT = Math.cos(th);
    // body circle (occupied), r6, at pose + 0.5*(cos,sin)
    {
      const p = toPx(x + cosT * 0.5, y + sinT * 0.5, g);
      fillCircle(grid, W, H, p.c, p.r, 6, OCCUPIED);
    }
    // approach circle (free), r16, at pose + 1.2*(cos(th+pi),sin(th+pi))
    {
      const th2 = ((th * 180.0) / PI + 180.0) * PI / 180.0;
      const s2 = Math.sin(th2), c2 = Math.cos(th2);
      const p = toPx(x + c2 * 1.2, y + s2 * 1.2, g);
      fillCircle(grid, W, H, p.c, p.r, 16, FREE);
    }
  }
  return grid;
}

export function generateOccupancyGrid(input: MapInput, offsets: OffsetOpts = DEFAULT_OFFSETS): GeneratedMap {
  const rings = offsetAll(input, offsets);
  const all = collectRingPoints(rings);
  if (!all.length) throw new Error('generateOccupancyGrid: no input points');
  const g = computeGeometry(all);
  const grid = buildWhole(input, rings, g);
  const whole: GridFile = { yaml: yaml('map.pgm', g), pgm: pgm(grid, g) };
  return { whole, perMap: [] };
}
