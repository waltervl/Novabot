import { describe, it, expect } from 'vitest';
import {
  parsePgm,
  largestFreeFraction,
  validateMapRasters,
} from '../../maps/validateGrid.js';

const FREE = 254, OCC = 0;

/** Build a binary P5 PGM buffer; `free(x,y)` decides free (254) vs occupied (0). */
function makePgm(W: number, H: number, free: (x: number, y: number) => boolean): Buffer {
  const header = Buffer.from(`P5\n# CREATOR: map_generator.cpp 0.050 m/pix\n${W} ${H}\n255\n`, 'ascii');
  const body = Buffer.alloc(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) body[y * W + x] = free(x, y) ? FREE : OCC;
  }
  return Buffer.concat([header, body]);
}
const b64 = (b: Buffer) => b.toString('base64');

// one solid centered free rectangle (one connected component)
const cleanZone = (W = 40, H = 40) => makePgm(W, H, (x, y) => x > 4 && x < W - 5 && y > 4 && y < H - 5);
// two free rectangles separated by an occupied column at the middle (a "wall")
const walledZone = (W = 40, H = 40) => makePgm(W, H, (x, y) =>
  y > 4 && y < H - 5 && ((x > 4 && x < W / 2 - 2) || (x > W / 2 + 2 && x < W - 5)));

describe('parsePgm', () => {
  it('parses dimensions and body past the comment line', () => {
    const g = parsePgm(cleanZone(12, 18));
    expect(g).not.toBeNull();
    expect(g!.W).toBe(12);
    expect(g!.H).toBe(18);
    expect(g!.data.length).toBe(12 * 18);
  });
  it('returns null on garbage', () => {
    expect(parsePgm(Buffer.from('not a pgm'))).toBeNull();
  });
});

describe('largestFreeFraction', () => {
  it('reports 1.0 for a single free blob', () => {
    const { frac, components } = largestFreeFraction(parsePgm(cleanZone())!);
    expect(components).toBe(1);
    expect(frac).toBeCloseTo(1, 5);
  });
  it('reports ~0.5 for two equal blobs split by a wall', () => {
    const { frac, components } = largestFreeFraction(parsePgm(walledZone())!);
    expect(components).toBe(2);
    expect(frac).toBeGreaterThan(0.4);
    expect(frac).toBeLessThan(0.6);
  });
  it('reports 0 when there is no free space', () => {
    const { frac, total } = largestFreeFraction(parsePgm(makePgm(10, 10, () => false))!);
    expect(total).toBe(0);
    expect(frac).toBe(0);
  });
});

describe('validateMapRasters', () => {
  it('passes a clean, dimensionally-consistent set', () => {
    const v = validateMapRasters({
      'map.pgm': b64(cleanZone()),
      'map0.pgm': b64(cleanZone()),
      'map1.pgm': b64(cleanZone()),
    });
    expect(v.ok).toBe(true);
    expect(v.hardFailures).toEqual([]);
  });

  it('HARD-FAILS a per-zone grid that is fragmented (the wall bug)', () => {
    const v = validateMapRasters({
      'map.pgm': b64(cleanZone()),
      'map1.pgm': b64(walledZone()),
    });
    expect(v.ok).toBe(false);
    expect(v.hardFailures.some((f) => f.includes('map1.pgm') && f.includes('fragmented'))).toBe(true);
  });

  it('HARD-FAILS on raster dimension mismatch (the corrupt David bundle)', () => {
    const v = validateMapRasters({
      'map.pgm': b64(cleanZone(80, 100)),
      'map1.pgm': b64(cleanZone(78, 98)),
    });
    expect(v.ok).toBe(false);
    expect(v.hardFailures.some((f) => f.includes('dimension mismatch'))).toBe(true);
  });

  it('treats an empty raster set as allowed (mower regenerates on-device)', () => {
    const v = validateMapRasters({});
    expect(v.ok).toBe(true);
  });
  it('treats a bundle with only non-pgm files as allowed', () => {
    const v = validateMapRasters({ 'map.png': b64(Buffer.from('x')) });
    expect(v.ok).toBe(true);
  });

  it('WARNS (not hard-fail) on whole-map fragmentation with no per-maps', () => {
    const v = validateMapRasters({ 'map.pgm': b64(walledZone()) });
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => w.includes('map.pgm'))).toBe(true);
  });

  it('HARD-FAILS an unparseable pgm', () => {
    const v = validateMapRasters({ 'map.pgm': b64(Buffer.from('P5 broken')) });
    expect(v.ok).toBe(false);
    expect(v.hardFailures.some((f) => f.includes('unparseable'))).toBe(true);
  });
});
