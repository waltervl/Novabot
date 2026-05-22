import { describe, it, expect } from 'vitest';
import { rasterizePolygon, type Point } from '../../maps/polygonRasterizer.js';

describe('rasterizePolygon', () => {
  it('builds a 2x2m square at 0.5m/px → 4x4 image', () => {
    const polygon: Point[] = [
      { x: 0, y: 0 }, { x: 2, y: 0 },
      { x: 2, y: 2 }, { x: 0, y: 2 },
    ];
    const result = rasterizePolygon([polygon], [], {
      resolution: 0.5,
      marginM: 0,
    });
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    expect(result.origin).toEqual([0, 0, 0]);
    expect(result.pgmBytes.byteLength).toBeGreaterThan(0);
    expect(result.yaml).toContain('resolution: 0.500');
    expect(result.yaml).toContain('origin: [0');
    // Header should start with P5
    const header = result.pgmBytes.slice(0, 3).toString('ascii');
    expect(header).toBe('P5\n');
  });

  it('carves obstacles out of polygon', () => {
    const polygon: Point[] = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
    ];
    const obstacle: Point[] = [
      { x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }, { x: 4, y: 6 },
    ];
    const result = rasterizePolygon([polygon], [obstacle], { resolution: 0.5, marginM: 0 });
    // Bytes after the header: find a pixel inside the obstacle (e.g. world 5,5).
    // PGM has header bytes then raw width*height pixels in row-major order, top-down.
    // Pixel at world (5,5): px = (5-0)/0.5 = 10, py = (5-0)/0.5 = 10.
    // height = (10-0)/0.5 = 20. Top-down row index = height-1-py = 9.
    // Header ends at the third newline ('255\n'). Skip header bytes.
    const headerText = `P5\n${result.width} ${result.height}\n255\n`;
    const headerLen = Buffer.byteLength(headerText, 'ascii');
    const pixels = result.pgmBytes.slice(headerLen);
    expect(pixels.byteLength).toBe(result.width * result.height);
    const px = Math.floor((5 - 0) / 0.5);
    const py = Math.floor((5 - 0) / 0.5);
    const rowFromTop = result.height - 1 - py;
    const pixelIndex = rowFromTop * result.width + px;
    expect(pixels[pixelIndex]).toBe(0); // occupied = inside obstacle
  });

  it('marks pixels OUTSIDE the work polygon as unknown (205) or occupied (per convention)', () => {
    const polygon: Point[] = [
      { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 },
    ];
    const result = rasterizePolygon([polygon], [], { resolution: 0.5, marginM: 2 });
    // With margin 2, image extends from -2,-2 to 7,7 → 18x18.
    expect(result.width).toBe(18);
    expect(result.height).toBe(18);
    // Pixel at world (-1, -1) is OUTSIDE polygon, inside image. Should be 205.
    const headerLen = Buffer.byteLength(`P5\n${result.width} ${result.height}\n255\n`, 'ascii');
    const pixels = result.pgmBytes.slice(headerLen);
    const px = Math.floor((-1 - (-2)) / 0.5);  // = 2
    const py = Math.floor((-1 - (-2)) / 0.5);  // = 2
    const rowFromTop = result.height - 1 - py;
    const pixelIndex = rowFromTop * result.width + px;
    expect(pixels[pixelIndex]).toBe(205);
  });
});
