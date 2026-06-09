/**
 * Builds a colored, semi-transparent RGBA overlay of an occupancy grid for the
 * admin Map Viewer "what the mower sees" layer. Colors mirror the live
 * diagnostics: occupied=red, free+reachable-from-dock=green, free-but-cut-off=
 * blue, unknown=transparent. The reachability flood is exactly what Nav2's
 * global planner can route, so a blue patch = a zone the mower CANNOT reach.
 *
 * Pure: grid in, PNG + stats out. No I/O. RGBA PNG (color type 6) so it
 * overlays the canvas with the polygons showing through.
 */
import { deflateSync } from 'node:zlib';
import { parsePgm, type PgmGrid } from './validateGrid.js';

export { parsePgm };
export type { PgmGrid };

const FREE = 200;     // > this = free
const OCCUPIED = 50;  // < this = occupied (else unknown/unexplored)
const ALPHA = 170;    // overlay opacity for colored cells

export interface OverlayStats {
  W: number; H: number;
  freeCells: number; reachableCells: number; reachableFrac: number;
}
export interface OverlayResult { png: Buffer; stats: OverlayStats; }

// ── CRC32 + PNG (RGBA, color type 6) ────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])) >>> 0, 0);
  return Buffer.concat([len, tb, data, crc]);
}
function encodeRgbaPng(rgba: Uint8Array, w: number, h: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let r = 0; r < h; r++) {
    const ro = r * (w * 4 + 1);
    raw[ro] = 0; // filter type 0
    rgba.subarray(r * w * 4, r * w * 4 + w * 4).forEach((v, i) => { raw[ro + 1 + i] = v; });
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/** Flood-fill (4-conn) the free cells reachable from a seed; nearest-free snap
 * if the seed isn't free. Returns the reachable mask (Uint8Array, 1=reachable).
 * When seed is null, seeds the single largest free component instead. */
function reachableMask(W: number, H: number, free: Uint8Array, seed: { x: number; y: number } | null): Uint8Array {
  const n = W * H;
  const vis = new Uint8Array(n);
  const pushFloodFrom = (start: number): number => {
    let size = 0; const stack = [start]; vis[start] = 1;
    while (stack.length) {
      const p = stack.pop() as number; size++;
      const x = p % W, y = (p - x) / W;
      if (x + 1 < W && free[p + 1] && !vis[p + 1]) { vis[p + 1] = 1; stack.push(p + 1); }
      if (x - 1 >= 0 && free[p - 1] && !vis[p - 1]) { vis[p - 1] = 1; stack.push(p - 1); }
      if (y + 1 < H && free[p + W] && !vis[p + W]) { vis[p + W] = 1; stack.push(p + W); }
      if (y - 1 >= 0 && free[p - W] && !vis[p - W]) { vis[p - W] = 1; stack.push(p - W); }
    }
    return size;
  };
  if (seed) {
    // snap to nearest free cell
    let si = -1;
    if (seed.x >= 0 && seed.x < W && seed.y >= 0 && seed.y < H && free[seed.y * W + seed.x]) {
      si = seed.y * W + seed.x;
    } else {
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        if (!free[i]) continue;
        const x = i % W, y = (i - x) / W;
        const d = (x - seed.x) * (x - seed.x) + (y - seed.y) * (y - seed.y);
        if (d < best) { best = d; si = i; }
      }
    }
    if (si >= 0) pushFloodFrom(si);
    return vis;
  }
  // no seed: keep only the largest free component
  let bestStart = -1, bestSize = 0;
  const tmp = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!free[i] || tmp[i]) continue;
    const stack = [i]; tmp[i] = 1; let size = 0; const cells: number[] = [];
    while (stack.length) {
      const p = stack.pop() as number; size++; cells.push(p);
      const x = p % W, y = (p - x) / W;
      if (x + 1 < W && free[p + 1] && !tmp[p + 1]) { tmp[p + 1] = 1; stack.push(p + 1); }
      if (x - 1 >= 0 && free[p - 1] && !tmp[p - 1]) { tmp[p - 1] = 1; stack.push(p - 1); }
      if (y + 1 < H && free[p + W] && !tmp[p + W]) { tmp[p + W] = 1; stack.push(p + W); }
      if (y - 1 >= 0 && free[p - W] && !tmp[p - W]) { tmp[p - W] = 1; stack.push(p - W); }
    }
    if (size > bestSize) { bestSize = size; bestStart = i; }
  }
  if (bestStart >= 0) pushFloodFrom(bestStart);
  return vis;
}

/** Build the RGBA overlay PNG for a grid. dockPx seeds the reachability flood
 * (use the dock for the whole map / per-zone); pass null to highlight the
 * largest connected free component instead. */
export function buildMaskOverlay(grid: PgmGrid, dockPx: { x: number; y: number } | null): OverlayResult {
  const { W, H, data } = grid;
  const n = W * H;
  const free = new Uint8Array(n);
  let freeCells = 0;
  for (let i = 0; i < n; i++) if (data[i] > FREE) { free[i] = 1; freeCells++; }
  const reach = reachableMask(W, H, free, dockPx);

  const rgba = new Uint8Array(n * 4);
  let reachableCells = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (free[i]) {
      if (reach[i]) { rgba[o] = 40; rgba[o + 1] = 180; rgba[o + 2] = 60; rgba[o + 3] = ALPHA; reachableCells++; }
      else { rgba[o] = 40; rgba[o + 1] = 110; rgba[o + 2] = 235; rgba[o + 3] = ALPHA; }
    } else if (data[i] < OCCUPIED) {
      rgba[o] = 210; rgba[o + 1] = 45; rgba[o + 2] = 45; rgba[o + 3] = ALPHA;
    } // else unknown → transparent (alpha 0)
  }
  return {
    png: encodeRgbaPng(rgba, W, H),
    stats: { W, H, freeCells, reachableCells, reachableFrac: freeCells ? reachableCells / freeCells : 0 },
  };
}
