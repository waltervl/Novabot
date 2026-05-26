#!/usr/bin/env node
/*
 * cloud-to-bundle.mjs — build a portable .novabotmap from a mower's maps on the
 * LFI cloud, so the OpenNova admin "Import bundle..." (apply-verbatim) can push
 * a COMPLETE map (incl. a freshly rasterized occupancy grid) back onto the
 * mower. Fixes the "107 map load failed" case.
 *
 * Runs locally (Node built-ins only + system `zip`). Sources everything from
 * the cloud cross-account (same un-scoped query as cloud_scanner.js) — used for
 * owner-consented recovery. Polygons are shipped VERBATIM (charger-relative,
 * NO rotation); only the raster is synthesized. The cloud chargingPose goes
 * into charging_station.yaml so the mower's dock-cycle (ArUco) re-aligns the
 * frame to the right heading.
 *
 * Usage:
 *   node cloud-to-bundle.mjs --email <e> --password <p> --sn LFIN... \
 *     [--out ./SN_restore.novabotmap] [--res 0.05] [--margin 1]
 */
import https from 'node:https';
import crypto from 'node:crypto';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const CLOUD_HOST = '47.253.145.99';
const KEY_IV = Buffer.from('1234123412ABCDEF', 'utf8');

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; }
const EMAIL = arg('email'), PASSWORD = arg('password'), SN = arg('sn');
const RES = parseFloat(arg('res', '0.05')), MARGIN = parseFloat(arg('margin', '1'));
const OUT = arg('out', `./${SN}_restore.novabotmap`);
if (!EMAIL || !PASSWORD || !SN) { console.error('Usage: --email <e> --password <p> --sn <SN> [--out f] [--res 0.05] [--margin 1]'); process.exit(2); }

function encPw(pw) { const c = crypto.createCipheriv('aes-128-cbc', KEY_IV, KEY_IV); return c.update(pw, 'utf8', 'base64') + c.final('base64'); }
function headers(token) {
  const echostr = 'p' + crypto.randomBytes(6).toString('hex');
  const ts = String(Date.now());
  const nonce = crypto.createHash('sha1').update('qtzUser', 'utf8').digest('hex');
  const sig = crypto.createHash('sha256').update(echostr + nonce + ts + (token || ''), 'utf8').digest('hex');
  return { Host: 'app.lfibot.com', Authorization: token || '', 'Content-Type': 'application/json;charset=UTF-8', source: 'app', echostr, nonce, timestamp: ts, signature: sig };
}
function req(method, path, body, token, raw = false) {
  return new Promise((resolve, reject) => {
    const data = body == null ? '' : JSON.stringify(body);
    const h = headers(token); if (data) h['Content-Length'] = String(Buffer.byteLength(data));
    const r = https.request({ hostname: CLOUD_HOST, path, method, headers: h, rejectUnauthorized: false }, (res) => {
      let s = ''; res.on('data', (c) => s += c); res.on('end', () => raw ? resolve(s) : (() => { try { resolve(JSON.parse(s)); } catch { reject(s.slice(0, 300)); } })());
    });
    r.on('error', reject); r.setTimeout(20000, () => { r.destroy(); reject('timeout'); });
    if (data) r.write(data); r.end();
  });
}

// ── rasterizer (mirror of server/src/maps/polygonRasterizer.ts) ─────────────
function pip(px, py, poly) { if (poly.length < 3) return false; let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y; if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi)) inside = !inside; } return inside; }
function rasterize(work, obs, res, m, freeFill) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of [...work, ...obs]) for (const p of poly) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }
  minX -= m; minY -= m; maxX += m; maxY += m;
  const w = Math.ceil((maxX - minX) / res), h = Math.ceil((maxY - minY) / res);
  // freeFill: whole bound is free (254) except obstacles (0) — the dock + the
  // dock->zone transit sit OUTSIDE the work polygons, so a polygon-only costmap
  // strands the mower in "unknown" (205) and the coverage planner finds no path.
  // Coverage stays bounded by the polygon contour (CSV), so mowing is unaffected.
  const px = Buffer.alloc(w * h, freeFill ? 254 : 205);
  for (let y = 0; y < h; y++) { const wy = minY + (y + 0.5) * res; for (let x = 0; x < w; x++) { const wx = minX + (x + 0.5) * res; if (!freeFill) { let inW = false; for (const poly of work) if (pip(wx, wy, poly)) { inW = true; break; } if (!inW) continue; } let inO = false; for (const o of obs) if (pip(wx, wy, o)) { inO = true; break; } px[(h - 1 - y) * w + x] = inO ? 0 : 254; } }
  const yaml = `image: map.pgm\nresolution: ${res.toFixed(3)}\norigin: [${minX.toFixed(6)}, ${minY.toFixed(6)}, 0.000000]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n`;
  return { pgm: Buffer.concat([Buffer.from(`P5\n${w} ${h}\n255\n`, 'ascii'), px]), yaml };
}
function area(pts) { if (pts.length < 3) return 0; let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y); return Math.abs(a) / 2; }
function parseCsv(t) { return t.trim().split('\n').map((l) => { const [x, y] = l.trim().split(',').map(Number); return { x, y }; }).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)); }

(async () => {
  const login = await req('POST', '/api/nova-user/appUser/login', { email: EMAIL, password: encPw(PASSWORD), imei: 'imei' });
  if (!login.success) { console.error('login failed:', login.message || login); process.exit(1); }
  const token = login.value.accessToken;
  console.log(`login OK (${login.value.email}) — fetching ${SN}`);

  const r = await req('GET', `/api/nova-file-server/map/queryEquipmentMap?sn=${encodeURIComponent(SN)}`, null, token);
  const val = r.value || {}; const data = val.data || {};
  const workItems = data.work || []; const unicomItems = data.unicom || [];
  const pose = (val.machineExtendedField || {}).chargingPose;
  if (!pose) { console.error('no chargingPose in response'); process.exit(1); }
  const CX = parseFloat(pose.x), CY = parseFloat(pose.y), CT = parseFloat(pose.orientation);

  // Work/obstacle CSVs live on Alibaba OSS (public objects), NOT the LFI
  // cloud host — fetch the full URL directly, no auth/signing headers.
  const download = (u) => new Promise((resolve, reject) => {
    const url = new URL(u);
    const r = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: 'GET', rejectUnauthorized: false }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve(download(res.headers.location)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} for ${u}`)); }
      let s = ''; res.on('data', (c) => s += c); res.on('end', () => resolve(s));
    });
    r.on('error', reject); r.setTimeout(20000, () => { r.destroy(); reject('timeout'); });
    r.end();
  });

  const work = [], obstacles = [], unicom = [];
  for (const w of workItems) {
    const pts = parseCsv(await download(w.url));
    const fname = w.fileName, canonical = fname.replace(/\.csv$/i, '').replace(/_work$/i, '');
    work.push({ fname, canonical, alias: w.alias || canonical, points: pts });
    for (const o of (w.obstacle || [])) {
      const op = parseCsv(await download(o.url));
      obstacles.push({ fname: o.fileName, base: o.fileName.replace(/\.csv$/i, ''), parentMap: canonical, alias: o.alias || null, points: op });
    }
  }
  for (const u of unicomItems) {
    let pts = []; try { pts = parseCsv(await download(u.url)); } catch { /* unicom CSV often empty */ }
    const base = u.fileName.replace(/\.csv$/i, ''); const mm = base.match(/^map\d+to(.+?)(?:_unicom)?$/);
    unicom.push({ fname: u.fileName, base, targetMapName: mm ? mm[1] : 'charge', points: pts });
  }
  if (work.length === 0) { console.error('no work maps'); process.exit(1); }

  // freeFill=true: the cloud has no real occupancy raster, so we synthesize one
  // where the whole bound is drivable (free) except obstacles — the dock + the
  // dock->zone transit sit outside the work polygons and must be navigable.
  const raster = rasterize(work.map((w) => w.points), obstacles.map((o) => o.points), RES, MARGIN, true);

  const polygonsJson = work.map((w) => ({ name: w.canonical, alias: w.alias, areaM2: area(w.points), points: w.points }));
  const obstaclesJson = obstacles.map((o) => ({ name: o.base, parentMap: o.parentMap, areaM2: area(o.points), points: o.points }));
  const unicomJson = unicom.map((u) => ({ name: u.base, targetMapName: u.targetMapName, points: u.points }));
  const userAliases = {}; for (const w of work) userAliases[w.canonical] = w.alias; for (const o of obstacles) if (o.alias) userAliases[o.base] = o.alias;
  const checksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify({ polygonsJson, obstaclesJson, unicomJson })).digest('hex')}`;
  const chargingPose = { x: CX, y: CY, orientation: CT };
  const metadata = { schemaVersion: 1, exportedAt: new Date().toISOString(), sourceSn: SN, sourceCharger: { lat: 0, lng: 0, rtkQualityAtExport: null }, polygonOriginAnchor: { name: 'charger', x: 0, y: 0 }, originalChargingPose: chargingPose, originalMapAreaName: polygonsJson[0].alias, workMapNames: work.map((w) => w.canonical), userAliases, checksum };
  const mapInfo = { charging_pose: chargingPose }; for (const w of work) mapInfo[w.fname] = { map_size: area(w.points) };
  const csvOf = (pts) => pts.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`).join('\n');

  // ── stage files + zip ───────────────────────────────────────────────────
  const dir = mkdtempSync(join(tmpdir(), 'novabundle-'));
  mkdirSync(join(dir, 'mower/csv_file'), { recursive: true });
  mkdirSync(join(dir, 'mower/map_files'), { recursive: true });
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  writeFileSync(join(dir, 'polygon.json'), JSON.stringify(polygonsJson[0], null, 2));
  writeFileSync(join(dir, 'polygons.json'), JSON.stringify(polygonsJson, null, 2));
  writeFileSync(join(dir, 'obstacles.json'), JSON.stringify(obstaclesJson, null, 2));
  writeFileSync(join(dir, 'unicom.json'), JSON.stringify(unicomJson, null, 2));
  for (const w of work) writeFileSync(join(dir, 'mower/csv_file', w.fname), csvOf(w.points));
  for (const o of obstacles) writeFileSync(join(dir, 'mower/csv_file', o.fname), csvOf(o.points));
  for (const u of unicom) writeFileSync(join(dir, 'mower/csv_file', u.fname), csvOf(u.points));
  writeFileSync(join(dir, 'mower/csv_file/map_info.json'), JSON.stringify(mapInfo, null, 3));
  writeFileSync(join(dir, 'mower/charging_station.yaml'), `charging_pose: [${CX}, ${CY}, ${CT}]\n`);
  writeFileSync(join(dir, 'mower/map_files/map.yaml'), raster.yaml);
  writeFileSync(join(dir, 'mower/map_files/map.pgm'), raster.pgm);
  for (const w of work) {
    writeFileSync(join(dir, 'mower/map_files', `${w.canonical}.yaml`), raster.yaml.replace('image: map.pgm', `image: ${w.canonical}.pgm`));
    writeFileSync(join(dir, 'mower/map_files', `${w.canonical}.pgm`), raster.pgm);
  }
  const outAbs = OUT.startsWith('/') ? OUT : join(process.cwd(), OUT);
  execFileSync('zip', ['-r', '-q', outAbs, '.'], { cwd: dir });
  rmSync(dir, { recursive: true, force: true });

  console.log(`OK -> ${outAbs}`);
  console.log(`  work=${work.length} obstacles=${obstacles.length} unicom=${unicom.length}`);
  console.log(`  charging_pose=[${CX}, ${CY}, ${CT}]`);
  for (const p of polygonsJson) console.log(`  ${p.name} "${p.alias}" ~${p.areaM2.toFixed(1)} m^2`);
})();
