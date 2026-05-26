#!/usr/bin/env node
/*
 * db-map-to-bundle.mjs — one-off recovery tool.
 *
 * Builds a portable `.novabotmap` bundle from the maps already stored in the
 * OpenNova DB for one mower SN, so the existing admin "Import bundle..." →
 * apply-verbatim flow can push a COMPLETE map (incl. a freshly rasterized
 * occupancy grid) back onto the mower. Fixes the "107 map load failed" case
 * where the mower has the polygon but no map.yaml/map.pgm.
 *
 * Why this exists instead of the walker-bundle path: synthesizePortableFromWalker
 * rotate+translates every point by the mower's live dock pose, which is correct
 * for walker session-local coordinates but WRONG for the DB polygons here —
 * those are already charger-relative (the mower's own frame). Rotating them by
 * the dock heading (~1.6 rad) reintroduces the -90 deg orientation bug. So this
 * tool ships the polygons VERBATIM (no transform) and only synthesizes the
 * raster from those same coordinates.
 *
 * Run INSIDE the opennova container (needs /data/novabot.db + node_modules):
 *   docker exec opennova node /tmp/db-map-to-bundle.mjs \
 *     --sn LFIN2231000633 --x 0.0121 --y -0.1738 --theta 1.6227 \
 *     --out /data/LFIN2231000633_restore.novabotmap
 *
 * --x/--y/--theta = the dock's charging_pose in the mower's local frame
 * (read from the mower's /userdata/lfi/maps/home0/csv_file/map_info.json or
 * /userdata/lfi/charging_station_file/charging_station.yaml). Required so
 * charging_station.yaml in the bundle matches the real dock heading — getting
 * theta wrong is exactly the -90 deg trap.
 */
import Database from 'better-sqlite3';
import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// ── args ──────────────────────────────────────────────────────────────────
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}
const SN = arg('sn');
const CHARGE_X = parseFloat(arg('x', 'NaN'));
const CHARGE_Y = parseFloat(arg('y', 'NaN'));
const CHARGE_THETA = parseFloat(arg('theta', 'NaN'));
const RES = parseFloat(arg('res', '0.05'));
const MARGIN = parseFloat(arg('margin', '1'));
const DB_PATH = arg('db', process.env.DB_PATH || '/data/novabot.db');
const OUT = arg('out', `/data/${SN}_restore.novabotmap`);

if (!SN || Number.isNaN(CHARGE_X) || Number.isNaN(CHARGE_Y) || Number.isNaN(CHARGE_THETA)) {
  console.error('Usage: --sn <SN> --x <m> --y <m> --theta <rad> [--res 0.05] [--margin 1] [--out path] [--db path]');
  process.exit(2);
}

// ── pure rasterizer (mirror of server/src/maps/polygonRasterizer.ts) ────────
function pointInPolygon(px, py, poly) {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function rasterize(workPolys, obstacles, res, marginM) {
  if (workPolys.length === 0) throw new Error('no work polygon to rasterize');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of [...workPolys, ...obstacles]) {
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  minX -= marginM; minY -= marginM; maxX += marginM; maxY += marginM;
  const width = Math.ceil((maxX - minX) / res);
  const height = Math.ceil((maxY - minY) / res);
  const pixels = Buffer.alloc(width * height, 205);
  for (let py = 0; py < height; py++) {
    const worldY = minY + (py + 0.5) * res;
    for (let px = 0; px < width; px++) {
      const worldX = minX + (px + 0.5) * res;
      let inWork = false;
      for (const poly of workPolys) if (pointInPolygon(worldX, worldY, poly)) { inWork = true; break; }
      if (!inWork) continue;
      let inObs = false;
      for (const obs of obstacles) if (pointInPolygon(worldX, worldY, obs)) { inObs = true; break; }
      pixels[(height - 1 - py) * width + px] = inObs ? 0 : 254;
    }
  }
  const header = Buffer.from(`P5\n${width} ${height}\n255\n`, 'ascii');
  const yaml = `image: map.pgm\nresolution: ${res.toFixed(3)}\norigin: [${minX.toFixed(6)}, ${minY.toFixed(6)}, 0.000000]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n`;
  return { pgmBytes: Buffer.concat([header, pixels]), yaml };
}
function shoelace(pts) {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  }
  return Math.abs(a) / 2;
}

// ── read DB ─────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH, { readonly: true });
const rows = db.prepare(
  'SELECT map_id, map_name, map_area, file_name, map_type FROM maps WHERE mower_sn = ? AND map_area IS NOT NULL',
).all(SN);
db.close();
if (rows.length === 0) {
  console.error(`No maps with polygon data found for ${SN}`);
  process.exit(1);
}

const work = [], obstacles = [], unicom = [];
for (const r of rows) {
  let pts;
  try { pts = JSON.parse(r.map_area); } catch { continue; }
  if (!Array.isArray(pts) || pts.length < 2) continue;
  pts = pts.map((p) => ({ x: Number(p.x), y: Number(p.y) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const fname = r.file_name || `${r.map_id}.csv`;
  const base = fname.replace(/\.csv$/i, '');
  // Canonical slot name: the mower's per-map raster files are map0/map1/...,
  // NOT map0_work. Strip the _work suffix for work maps.
  const canonical = base.replace(/_work$/i, '');
  const entry = { fname, base, canonical, alias: r.map_name || null, points: pts };
  if (r.map_type === 'obstacle') obstacles.push(entry);
  else if (r.map_type === 'unicom') unicom.push(entry);
  else work.push(entry);
}
if (work.length === 0) {
  console.error('No WORK polygons found — cannot rasterize a costmap.');
  process.exit(1);
}

// ── derive parent/target names ──────────────────────────────────────────────
const obstaclesJson = obstacles.map((o) => {
  const m = o.base.match(/^(map\d+)_/);
  return { name: o.base, parentMap: m ? m[1] : 'map0', areaM2: shoelace(o.points), points: o.points };
});
const unicomJson = unicom.map((u) => {
  const m = u.base.match(/^map\d+to(.+?)(?:_unicom)?$/);
  return { name: u.base, targetMapName: m ? m[1] : 'charge', points: u.points };
});
const polygonsJson = work.map((w) => ({
  name: w.canonical, alias: w.alias ?? w.canonical, areaM2: shoelace(w.points), points: w.points,
}));

// ── rasterize (NO rotation — points are already charger-relative) ───────────
const raster = rasterize(work.map((w) => w.points), obstacles.map((o) => o.points), RES, MARGIN);

const chargingPose = { x: CHARGE_X, y: CHARGE_Y, orientation: CHARGE_THETA };
const workMapNames = work.map((w) => w.canonical);
const userAliases = {};
for (const w of work) userAliases[w.canonical] = w.alias ?? w.canonical;
for (const o of obstacles) userAliases[o.base] = o.alias ?? o.base;

const checksum = `sha256:${createHash('sha256').update(JSON.stringify({ polygonsJson, obstaclesJson, unicomJson })).digest('hex')}`;
const metadata = {
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  sourceSn: SN,
  sourceCharger: { lat: 0, lng: 0, rtkQualityAtExport: null },
  polygonOriginAnchor: { name: 'charger', x: 0, y: 0, comment: 'charger-relative; no transform applied' },
  originalChargingPose: chargingPose,
  originalMapAreaName: polygonsJson[0].alias,
  workMapNames,
  userAliases,
  checksum,
};

const mapInfo = { charging_pose: chargingPose };
for (const w of work) mapInfo[w.fname] = { map_size: shoelace(w.points) };

const csvOf = (pts) => pts.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`).join('\n');

// ── build .novabotmap ───────────────────────────────────────────────────────
const chunks = [];
const sink = new PassThrough();
sink.on('data', (c) => chunks.push(c));
await new Promise((resolve, reject) => {
  sink.on('end', resolve);
  sink.on('error', reject);
  const a = archiver('zip', { zlib: { level: 9 } });
  a.on('error', reject);
  a.pipe(sink);

  a.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });
  a.append(JSON.stringify(polygonsJson[0], null, 2), { name: 'polygon.json' });
  a.append(JSON.stringify(polygonsJson, null, 2), { name: 'polygons.json' });
  a.append(JSON.stringify(obstaclesJson, null, 2), { name: 'obstacles.json' });
  a.append(JSON.stringify(unicomJson, null, 2), { name: 'unicom.json' });

  // Verbatim mower files — what apply-verbatim ships to the mower.
  for (const w of work) a.append(csvOf(w.points), { name: `mower/csv_file/${w.fname}` });
  for (const o of obstacles) a.append(csvOf(o.points), { name: `mower/csv_file/${o.fname}` });
  for (const u of unicom) a.append(csvOf(u.points), { name: `mower/csv_file/${u.fname}` });
  a.append(JSON.stringify(mapInfo, null, 3), { name: 'mower/csv_file/map_info.json' });
  a.append(`charging_pose: [${CHARGE_X}, ${CHARGE_Y}, ${CHARGE_THETA}]\n`, { name: 'mower/charging_station.yaml' });

  // Freshly rasterized occupancy grid (NO rotation) + per-slot mirrors.
  a.append(raster.yaml, { name: 'mower/map_files/map.yaml' });
  a.append(raster.pgmBytes, { name: 'mower/map_files/map.pgm' });
  for (const w of work) {
    a.append(raster.yaml.replace('image: map.pgm', `image: ${w.canonical}.pgm`), { name: `mower/map_files/${w.canonical}.yaml` });
    a.append(raster.pgmBytes, { name: `mower/map_files/${w.canonical}.pgm` });
  }
  a.finalize();
});

writeFileSync(OUT, Buffer.concat(chunks));
console.log(`OK: wrote ${OUT}`);
console.log(`  work=${work.length} obstacles=${obstacles.length} unicom=${unicom.length}`);
console.log(`  charging_pose=[${CHARGE_X}, ${CHARGE_Y}, ${CHARGE_THETA}]  res=${RES} margin=${MARGIN}`);
console.log(`  first work area ~${polygonsJson[0].areaM2.toFixed(1)} m^2`);
