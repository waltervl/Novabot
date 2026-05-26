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
export interface XY { x: number; y: number; }

export interface MapInput {
  workMaps: { canonical: string; points: XY[] }[];   // local meters, charger-relative
  obstacles: { parentMap: string; points: XY[] }[];
  unicom: { name: string; points: XY[] }[];
  chargingPose: { x: number; y: number; orientation: number };
}

export interface GridFile { yaml: string; pgm: Buffer; png?: Buffer; }
export interface GeneratedMap { whole: GridFile; perMap: { name: string; file: GridFile }[]; }

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

function collectAllPoints(input: MapInput): XY[] {
  const pts: XY[] = [];
  for (const w of input.workMaps) pts.push(...w.points);
  for (const o of input.obstacles) pts.push(...o.points);
  for (const u of input.unicom) pts.push(...u.points);
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

function buildWhole(input: MapInput, g: Geometry): Uint8Array {
  const W = g.width, H = g.height;
  const grid = new Uint8Array(W * H); // init 0 (OCCUPIED)

  // 1. work areas -> free
  for (const w of input.workMaps) fillPoly(grid, W, H, polyToPx(w.points, g), FREE);
  // 2. unicom -> free
  for (const u of input.unicom) fillPoly(grid, W, H, polyToPx(u.points, g), FREE);
  // 3. obstacles -> occupied
  for (const o of input.obstacles) fillPoly(grid, W, H, polyToPx(o.points, g), OCCUPIED);

  // 4a. whole_map_handle_switch == true: dilate, re-stamp obstacles, dilate
  dilate3x3(grid, W, H);
  for (const o of input.obstacles) fillPoly(grid, W, H, polyToPx(o.points, g), OCCUPIED);
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

export function generateOccupancyGrid(input: MapInput): GeneratedMap {
  const all = collectAllPoints(input);
  if (!all.length) throw new Error('generateOccupancyGrid: no input points');
  const g = computeGeometry(all);
  const grid = buildWhole(input, g);
  const whole: GridFile = { yaml: yaml('map.pgm', g), pgm: pgm(grid, g) };
  return { whole, perMap: [] };
}
