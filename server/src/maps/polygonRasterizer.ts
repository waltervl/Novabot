/**
 * Pure polygon → PGM occupancy grid rasterizer.
 *
 * Converts work polygons (free space) and obstacle polygons (occupied space)
 * into a Nav2-compatible occupancy grid:
 *   - 254 = free (inside any work polygon, not inside any obstacle)
 *   - 0   = occupied (inside an obstacle)
 *   - 205 = unknown (default fill — outside all work polygons)
 *
 * Output:
 *   - PGM P5 binary buffer, row-major, top-down (first pixel = top-left).
 *   - YAML metadata with `origin` = WORLD coordinate of the LOWER-LEFT pixel.
 *
 * No I/O. All inputs in, all outputs returned. Used by the walker bundle
 * import endpoint to synthesize the map.pgm/map.yaml the mower expects.
 */
export interface Point { x: number; y: number }

export interface RasterizeOpts {
  resolution: number;   // meters per pixel
  marginM: number;      // extra margin around polygon bounds (meters)
}

export interface RasterizeResult {
  pgmBytes: Buffer;
  yaml: string;
  width: number;
  height: number;
  origin: [number, number, number]; // [worldX of lower-left pixel, worldY, theta=0]
}

function pointInPolygon(px: number, py: number, poly: Point[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > py) !== (yj > py))
      && (px < (xj - xi) * (py - yi) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function rasterizePolygon(
  workPolygons: Point[][],
  obstacles: Point[][],
  opts: RasterizeOpts,
): RasterizeResult {
  if (workPolygons.length === 0) throw new Error('at least one work polygon required');

  // Bounding box across all polygons (work + obstacle).
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of [...workPolygons, ...obstacles]) {
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const m = opts.marginM;
  minX -= m; minY -= m; maxX += m; maxY += m;

  const res = opts.resolution;
  const width = Math.ceil((maxX - minX) / res);
  const height = Math.ceil((maxY - minY) / res);

  // Default fill = 205 (unknown). Inside polygon = 254 (free). Inside obstacle = 0 (occupied).
  const pixels = Buffer.alloc(width * height, 205);

  for (let py = 0; py < height; py++) {
    const worldY = minY + (py + 0.5) * res;
    for (let px = 0; px < width; px++) {
      const worldX = minX + (px + 0.5) * res;
      let inWork = false;
      for (const poly of workPolygons) {
        if (pointInPolygon(worldX, worldY, poly)) { inWork = true; break; }
      }
      if (!inWork) continue;
      let inObs = false;
      for (const obs of obstacles) {
        if (pointInPolygon(worldX, worldY, obs)) { inObs = true; break; }
      }
      // PGM rows top-down: pixel (px, py) sits at index (height-1-py) * width + px.
      const idx = (height - 1 - py) * width + px;
      pixels[idx] = inObs ? 0 : 254;
    }
  }

  const header = Buffer.from(`P5\n${width} ${height}\n255\n`, 'ascii');
  const pgmBytes = Buffer.concat([header, pixels]);

  const yaml =
    `image: map.pgm\nresolution: ${res.toFixed(3)}\norigin: [${minX.toFixed(6)}, ${minY.toFixed(6)}, 0.000000]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n`;

  return { pgmBytes, yaml, width, height, origin: [minX, minY, 0] };
}
