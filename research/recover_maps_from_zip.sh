#!/bin/bash
# recover_maps_from_zip.sh
#
# One-shot recovery for a mower whose `*_latest.zip` portable backup contains
# more work-maps than the live mower currently has on disk (typically caused
# by an older single-map bundle import that wiped csv_file/).
#
# Converts a mower-format ZIP (csv_file/* at root) into a proper portable
# .novabotmap bundle that the dashboard's "Portable Map Bundle → Restore →
# Apply Exact" flow can apply with Δ rotation/translation.
#
# Usage on the RPi running the OpenNova docker:
#   curl -O https://example/recover_maps_from_zip.sh
#   chmod +x recover_maps_from_zip.sh
#   sudo ./recover_maps_from_zip.sh LFIN2231000633
#
# Default container name is `opennova`. Override with CONTAINER=mycontainer.
#
# Output: a new `<iso>_recovery.novabotmap` in
#   /data/storage/portable_backups/<SN>/
# which appears in the dashboard's portable-bundle list after Refresh.

set -euo pipefail

SN="${1:-}"
if [ -z "$SN" ]; then
  echo "Usage: $0 <MOWER_SN>" >&2
  echo "Example: $0 LFIN2231000633" >&2
  exit 1
fi

CONTAINER="${CONTAINER:-opennova}"
INPUT="/data/storage/portable_backups/${SN}/${SN}_latest.zip"

# Sanity checks --------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not on PATH. Run on the OpenNova host." >&2
  exit 1
fi
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "ERROR: container '$CONTAINER' is not running. Set CONTAINER=<name> if different." >&2
  exit 1
fi
if ! docker exec "$CONTAINER" test -f "$INPUT"; then
  echo "ERROR: $INPUT not found inside container." >&2
  echo "Make sure '$SN' is the correct serial — a *_latest.zip must exist for it." >&2
  exit 1
fi

# Drop the converter script into the container -------------------------------
docker exec -i "$CONTAINER" sh -c 'cat > /tmp/recover_maps.js' <<'JSEOF'
const fs = require('fs');
const unzipper = require('unzipper');
const archiver = require('archiver');
const { PassThrough } = require('node:stream');
const { createHash } = require('node:crypto');

const SN = process.env.SN;
const INPUT = `/data/storage/portable_backups/${SN}/${SN}_latest.zip`;
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUTPUT = `/data/storage/portable_backups/${SN}/${ts}_recovery.novabotmap`;

(async () => {
  const dir = await unzipper.Open.file(INPUT);
  const entries = {};
  for (const f of dir.files) {
    if (f.type === 'File') entries[f.path] = (await f.buffer()).toString('utf8');
  }
  console.log('Source entries:', Object.keys(entries).length);

  let chargingPose = { x: 0, y: 0, orientation: 0 };
  if (entries['csv_file/map_info.json']) {
    try {
      const mi = JSON.parse(entries['csv_file/map_info.json']);
      if (mi.charging_pose && Number.isFinite(mi.charging_pose.x)) chargingPose = mi.charging_pose;
    } catch {}
  }

  const parsePoints = (txt) => {
    const pts = [];
    for (const line of txt.split('\n')) {
      const [xs, ys] = line.trim().split(',');
      const x = parseFloat(xs), y = parseFloat(ys);
      if (!isNaN(x) && !isNaN(y)) pts.push({ x, y });
    }
    return pts;
  };
  const area = (pts) => {
    if (pts.length < 3) return 0;
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      acc += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    return Math.abs(acc) / 2;
  };

  const polygons = [], obstacles = [], unicom = [];
  for (const [name, content] of Object.entries(entries)) {
    if (!name.startsWith('csv_file/')) continue;
    const fname = name.slice('csv_file/'.length);
    let m;
    if ((m = fname.match(/^(map\d+)_work\.csv$/))) {
      polygons.push({ name: m[1], alias: m[1], areaM2: 0, points: parsePoints(content) });
    } else if ((m = fname.match(/^(map\d+_\d+_obstacle)\.csv$/))) {
      obstacles.push({ name: m[1], alias: m[1], areaM2: 0, points: parsePoints(content) });
    } else if ((m = fname.match(/^(map\d+to(.+?)_?unicom)\.csv$/))) {
      unicom.push({ name: m[1], targetMapName: m[2], points: parsePoints(content) });
    }
  }
  for (const p of polygons) p.areaM2 = area(p.points);
  for (const o of obstacles) o.areaM2 = area(o.points);

  if (polygons.length === 0) throw new Error('no work polygons found in source ZIP');
  console.log(`Parsed: ${polygons.length} work-map(s), ${obstacles.length} obstacle(s), ${unicom.length} unicom`);

  const allPts = [...polygons, ...obstacles, ...unicom].flatMap((g) => g.points);
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  if (allPts.length > 0) {
    minX = maxX = allPts[0].x; minY = maxY = allPts[0].y;
    for (const p of allPts) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
  }

  const checksumSrc = JSON.stringify({ polygonsJson: polygons, obstaclesJson: obstacles, unicomJson: unicom });
  const checksum = `sha256:${createHash('sha256').update(checksumSrc).digest('hex')}`;

  const metadata = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    sourceSn: SN,
    sourceCharger: { lat: 0, lng: 0, rtkQualityAtExport: null },
    polygonOriginAnchor: { name: 'charger', x: 0, y: 0, comment: 'recovered from mower-format ZIP via recover_maps_from_zip.sh' },
    originalChargingPose: chargingPose,
    originalMapAreaName: polygons[0].alias,
    workMapNames: polygons.map((p) => p.name),
    userAliases: Object.fromEntries([...polygons, ...obstacles].map((p) => [p.name, p.alias])),
    boundsM: { minX, maxX, minY, maxY },
    checksum,
  };

  await new Promise((resolve, reject) => {
    const sink = new PassThrough();
    const chunks = [];
    sink.on('data', (c) => chunks.push(c));
    sink.on('end', () => { fs.writeFileSync(OUTPUT, Buffer.concat(chunks)); resolve(); });
    sink.on('error', reject);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', reject);
    archive.pipe(sink);
    archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });
    archive.append(JSON.stringify(polygons[0], null, 2), { name: 'polygon.json' });
    archive.append(JSON.stringify(polygons, null, 2), { name: 'polygons.json' });
    archive.append(JSON.stringify(obstacles, null, 2), { name: 'obstacles.json' });
    archive.append(JSON.stringify(unicom, null, 2), { name: 'unicom.json' });
    for (const [name, content] of Object.entries(entries)) {
      if (name.startsWith('csv_file/')) {
        const fname = name.slice('csv_file/'.length);
        archive.append(content, { name: `mower/csv_file/${fname}` });
      }
    }
    archive.finalize();
  });

  console.log('OK — wrote bundle:', OUTPUT);
  console.log('Size:', fs.statSync(OUTPUT).size, 'bytes');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
JSEOF

# Run the converter inside the container -------------------------------------
docker exec -e SN="$SN" -e NODE_PATH=/app/server/node_modules "$CONTAINER" sh -c 'cd /app/server && node /tmp/recover_maps.js'

echo
echo '=== Resulting bundles ==='
docker exec "$CONTAINER" ls -la "/data/storage/portable_backups/${SN}/"
echo
echo 'Next: open the OpenNova dashboard → Mowers → '"${SN}"' → Portable Map Bundle'
echo '      section. Click Refresh, then Restore on the new <iso>_recovery'
echo '      entry, then Apply Exact.'
