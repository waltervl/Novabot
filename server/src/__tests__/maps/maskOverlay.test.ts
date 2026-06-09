import { describe, it, expect } from 'vitest';
import { parsePgm } from '../../maps/validateGrid.js';
import { buildMaskOverlay } from '../../maps/maskOverlay.js';

const FREE = 254, OCC = 0;
function makePgm(W: number, H: number, free: (x: number, y: number) => boolean): Buffer {
  const header = Buffer.from(`P5\n# CREATOR: map_generator.cpp 0.050 m/pix\n${W} ${H}\n255\n`, 'ascii');
  const body = Buffer.alloc(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) body[y * W + x] = free(x, y) ? FREE : OCC;
  return Buffer.concat([header, body]);
}
const oneBlob = (W = 40, H = 40) => makePgm(W, H, (x, y) => x > 4 && x < W - 5 && y > 4 && y < H - 5);
const twoBlobs = (W = 40, H = 40) => makePgm(W, H, (x, y) =>
  y > 4 && y < H - 5 && ((x > 4 && x < W / 2 - 2) || (x > W / 2 + 2 && x < W - 5)));

function isValidRgbaPng(png: Buffer): { ok: boolean; w: number; h: number; colorType: number } {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ok = sig.every((b, i) => png[i] === b) && png.toString('ascii', 12, 16) === 'IHDR';
  return { ok, w: png.readUInt32BE(16), h: png.readUInt32BE(20), colorType: png[25] };
}

describe('buildMaskOverlay', () => {
  it('produces a valid 8-bit RGBA PNG of the grid dimensions', () => {
    const grid = parsePgm(oneBlob(48, 36))!;
    const { png } = buildMaskOverlay(grid, { x: 24, y: 18 });
    const v = isValidRgbaPng(png);
    expect(v.ok).toBe(true);
    expect(v.w).toBe(48);
    expect(v.h).toBe(36);
    expect(v.colorType).toBe(6); // RGBA
  });

  it('marks all free space reachable when the dock sits inside one blob', () => {
    const grid = parsePgm(oneBlob())!;
    const { stats } = buildMaskOverlay(grid, { x: 20, y: 20 });
    expect(stats.freeCells).toBeGreaterThan(0);
    expect(stats.reachableFrac).toBeCloseTo(1, 5);
  });

  it('marks only the dock-side blob reachable when a wall splits the map (~half)', () => {
    const grid = parsePgm(twoBlobs())!;
    const { stats } = buildMaskOverlay(grid, { x: 10, y: 20 }); // left blob
    expect(stats.reachableFrac).toBeGreaterThan(0.4);
    expect(stats.reachableFrac).toBeLessThan(0.6);
  });

  it('with no dock seed, highlights the single largest free component', () => {
    const grid = parsePgm(twoBlobs())!;
    const { stats } = buildMaskOverlay(grid, null);
    // equal blobs → largest is ~half of total free
    expect(stats.reachableFrac).toBeGreaterThan(0.4);
    expect(stats.reachableFrac).toBeLessThanOrEqual(0.55);
  });

  it('snaps to nearest free cell when the dock pixel lands on occupied', () => {
    const grid = parsePgm(oneBlob())!;
    const { stats } = buildMaskOverlay(grid, { x: 0, y: 0 }); // corner = occupied
    expect(stats.reachableFrac).toBeCloseTo(1, 5); // snaps into the blob, floods all
  });
});
