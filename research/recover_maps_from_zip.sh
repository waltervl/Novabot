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

SN=""
ROTATE_DEG="0"
SET_ORIENTATION_DEG=""
APPLY_VERBATIM="0"
while [ $# -gt 0 ]; do
  case "$1" in
    --rotate-deg) ROTATE_DEG="$2"; shift 2 ;;
    --rotate-deg=*) ROTATE_DEG="${1#*=}"; shift ;;
    --set-orientation-deg) SET_ORIENTATION_DEG="$2"; shift 2 ;;
    --set-orientation-deg=*) SET_ORIENTATION_DEG="${1#*=}"; shift ;;
    --apply-verbatim) APPLY_VERBATIM="1"; shift ;;
    -h|--help)
      echo "Usage: $0 [--rotate-deg N] <MOWER_SN>"
      echo ""
      echo "  --rotate-deg N             Add N degrees to the stored originalChargingPose"
      echo "                             orientation before writing the bundle. Use when"
      echo "                             the previous Apply-Exact rotated polygons by the"
      echo "                             wrong amount (mower picks a fresh map frame on"
      echo "                             every reboot — see map-frame-realign-after-reboot)."
      echo "  --set-orientation-deg N    Override the stored originalChargingPose"
      echo "                             orientation to exactly N degrees (ignores"
      echo "                             whatever was in map_info.json). Use when sign"
      echo "                             flip is suspected — e.g. ROS ENU vs compass"
      echo "                             handedness mismatch. Mutually exclusive with"
      echo "                             --rotate-deg."
      echo "  --apply-verbatim           Skip bundle generation. Read the ZIP, then"
      echo "                             directly publish write_map_files MQTT with"
      echo "                             the original csv_files + map_info.json +"
      echo "                             charging_station.yaml UNCHANGED. No Δ math,"
      echo "                             no charging_pose override. Mower keeps the"
      echo "                             exact state from when the ZIP was made. Use"
      echo "                             when the mower's pos.json is still anchored"
      echo "                             to the same UTM origin as the ZIP."
      echo ""
      echo "Examples:"
      echo "  $0 LFIN2231000633"
      echo "  $0 --rotate-deg 90 LFIN2231000633   # polygons came out 90° CCW → bump +90"
      echo "  $0 --rotate-deg -90 LFIN2231000633  # polygons came out 90° CW  → bump -90"
      exit 0 ;;
    *) SN="$1"; shift ;;
  esac
done
if [ -z "$SN" ]; then
  echo "Usage: $0 [--rotate-deg N] <MOWER_SN>  (try --help)" >&2
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
const ROTATE_DEG = parseFloat(process.env.ROTATE_DEG || '0');
const INPUT = `/data/storage/portable_backups/${SN}/${SN}_latest.zip`;
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
let suffix = '';
if (process.env.SET_ORIENTATION_DEG && process.env.SET_ORIENTATION_DEG !== '') {
  suffix = `_set${process.env.SET_ORIENTATION_DEG}`;
} else if (ROTATE_DEG !== 0) {
  suffix = `_rot${ROTATE_DEG}`;
}
const OUTPUT = `/data/storage/portable_backups/${SN}/${ts}_recovery${suffix}.novabotmap`;

(async () => {
  const dir = await unzipper.Open.file(INPUT);
  const entries = {};
  for (const f of dir.files) {
    if (f.type === 'File') entries[f.path] = (await f.buffer()).toString('utf8');
  }
  console.log('Source entries:', Object.keys(entries).length);

  // ── Verbatim path (no bundle, no Δ math, no charging_pose override) ──
  // Direct MQTT publish to broker on novabot/extended/<SN>. Mower's
  // extended_commands.py write_map_files handler writes files 1-to-1
  // to /userdata/lfi/maps/home0/{csv_file,x3_csv_file}/. map_info.json
  // and charging_station.yaml stay exactly as captured in the ZIP.
  if (process.env.APPLY_VERBATIM === '1') {
    const mqtt = require('mqtt');
    const csvFiles = {};
    for (const [name, content] of Object.entries(entries)) {
      if (name.startsWith('csv_file/')) {
        const fname = name.slice('csv_file/'.length);
        csvFiles[fname] = content;
      }
    }
    const csYaml = entries['charging_station_file/charging_station.yaml']
      || entries['charging_station.yaml']
      || null;
    console.log(`Verbatim publish: ${Object.keys(csvFiles).length} CSVs, charging_station.yaml=${csYaml ? 'present' : 'missing'}`);
    const broker = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
    console.log(`Connecting to ${broker}...`);
    const client = mqtt.connect(broker, { connectTimeout: 5000, clientId: `recover-verbatim-${Date.now()}` });
    await new Promise((resolve, reject) => {
      client.on('connect', resolve);
      client.on('error', reject);
      setTimeout(() => reject(new Error('mqtt connect timeout')), 10000);
    });
    const topic = `novabot/extended/${SN}`;
    const payload = JSON.stringify({
      write_map_files: {
        csv_files: csvFiles,
        charging_station_yaml: csYaml,
        restart_mapping: true,
      },
    });
    await new Promise((resolve, reject) => {
      client.publish(topic, payload, { qos: 1 }, (err) => err ? reject(err) : resolve());
    });
    console.log(`Published to ${topic} (${payload.length} bytes)`);
    // Wait briefly for ack before exiting
    await new Promise((r) => setTimeout(r, 2000));
    client.end();
    console.log('Verbatim write dispatched. Check mower logs:');
    console.log('  sshpass -p novabot ssh root@<mower-ip> "tail -30 /root/novabot/data/extended_commands.log"');
    return;
  }

  let chargingPose = { x: 0, y: 0, orientation: 0 };
  if (entries['csv_file/map_info.json']) {
    try {
      const mi = JSON.parse(entries['csv_file/map_info.json']);
      if (mi.charging_pose && Number.isFinite(mi.charging_pose.x)) chargingPose = mi.charging_pose;
    } catch {}
  }
  // Override / offset stored orientation. apply-exact computes
  // Δ = liveDock - bundleStored, so changing bundleStored changes Δ.
  // --set-orientation-deg sets an absolute value (handy for sign-flip
  // tests). --rotate-deg adds an offset to whatever map_info.json had.
  if (process.env.SET_ORIENTATION_DEG && process.env.SET_ORIENTATION_DEG !== '') {
    const targetRad = (parseFloat(process.env.SET_ORIENTATION_DEG) * Math.PI) / 180;
    const before = chargingPose.orientation;
    chargingPose = { ...chargingPose, orientation: targetRad };
    console.log(`Set orientation override: ${process.env.SET_ORIENTATION_DEG}° (was ${before.toFixed(4)} rad → now ${targetRad.toFixed(4)} rad)`);
  } else if (ROTATE_DEG !== 0) {
    const before = chargingPose.orientation;
    chargingPose = { ...chargingPose, orientation: before + (ROTATE_DEG * Math.PI) / 180 };
    console.log(`Applied rotation offset: ${ROTATE_DEG}° (orientation ${before.toFixed(4)} → ${chargingPose.orientation.toFixed(4)} rad)`);
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

  // Filenames in mower csv_file/ follow these patterns (see map-format.md):
  //   map{N}_work.csv               work polygon
  //   map{N}_{K}_obstacle.csv       obstacle K inside work map N
  //   map{N}tocharge_unicom.csv     return-to-charger channel from N
  //   map{N}tomap{M}_{K}_unicom.csv inter-map channel from N to M (variant K)
  const polygons = [], obstacles = [], unicom = [];
  const skipped = [];
  for (const [name, content] of Object.entries(entries)) {
    if (!name.startsWith('csv_file/')) continue;
    const fname = name.slice('csv_file/'.length);
    let m;
    if ((m = fname.match(/^(map\d+)_work\.csv$/))) {
      polygons.push({ name: m[1], alias: m[1], areaM2: 0, points: parsePoints(content) });
    } else if ((m = fname.match(/^(map\d+_\d+_obstacle)\.csv$/))) {
      obstacles.push({ name: m[1], alias: m[1], areaM2: 0, points: parsePoints(content) });
    } else if ((m = fname.match(/^(map\d+tocharge_unicom)\.csv$/))) {
      unicom.push({ name: m[1], targetMapName: 'charge', points: parsePoints(content) });
    } else if ((m = fname.match(/^(map\d+tomap(\d+)(?:_\d+)?_unicom)\.csv$/))) {
      unicom.push({ name: m[1], targetMapName: `map${m[2]}`, points: parsePoints(content) });
    } else if (fname !== 'map_info.json') {
      skipped.push(fname);
    }
  }
  if (skipped.length > 0) console.log('Skipped non-matching csv files:', skipped);
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
docker exec -e SN="$SN" -e ROTATE_DEG="$ROTATE_DEG" -e SET_ORIENTATION_DEG="$SET_ORIENTATION_DEG" -e APPLY_VERBATIM="$APPLY_VERBATIM" -e NODE_PATH=/app/server/node_modules "$CONTAINER" sh -c 'cd /app/server && node /tmp/recover_maps.js'

echo
echo '=== Resulting bundles ==='
docker exec "$CONTAINER" ls -la "/data/storage/portable_backups/${SN}/"
echo
echo 'Next: open the OpenNova dashboard → Mowers → '"${SN}"' → Portable Map Bundle'
echo '      section. Click Refresh, then Restore on the new <iso>_recovery'
echo '      entry, then Apply Exact.'
