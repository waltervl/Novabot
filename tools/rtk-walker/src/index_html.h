#pragma once

// Live status page served at GET /.  Polls /api/status every 500 ms,
// shows the active fix, sat count, HDOP, recording state, and the
// current track point count. The BOOT-button toggle is mirrored as a
// "Start / Stop" button so phones without physical access to the
// device can still control logging.

static const char INDEX_HTML[] PROGMEM = R"INDEX(
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RTK Walker</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  :root {
    --bg: #030712;
    --card: #16213e;
    --emerald: #00d4aa;
    --emerald-dim: rgba(0, 212, 170, 0.16);
    --amber: #f59e0b;
    --red: #ef4444;
    --text: #e0e0e0;
    --text-dim: #9ca3af;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
  body { max-width: 480px; margin: 0 auto; padding: 16px 16px 80px; }
  h1 { font-size: 18px; margin: 0 0 16px; letter-spacing: -0.01em; }
  .card { background: var(--card); border-radius: 12px; padding: 16px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.04); }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 14px; }
  .row .label { color: var(--text-dim); }
  .row .value { font-variant-numeric: tabular-nums; font-weight: 600; }
  .fix-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .fix-0 { background: rgba(239,68,68,0.18); color: var(--red); }
  .fix-1 { background: rgba(156,163,175,0.18); color: #9ca3af; }
  .fix-2 { background: rgba(245,158,11,0.18); color: var(--amber); }
  .fix-4 { background: rgba(0,212,170,0.18); color: var(--emerald); }
  .fix-5 { background: rgba(245,158,11,0.22); color: var(--amber); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
  button { width: 100%; padding: 14px; border-radius: 10px; border: 0; background: var(--emerald); color: #00211a; font-size: 15px; font-weight: 700; cursor: pointer; letter-spacing: -0.01em; }
  button.stop { background: var(--red); color: white; }
  button:disabled { opacity: 0.4; }
  .tracks { margin-top: 16px; }
  .track { display: flex; justify-content: space-between; padding: 10px 12px; background: rgba(255,255,255,0.03); border-radius: 8px; margin-bottom: 6px; font-size: 13px; align-items: center; }
  .track a { color: var(--emerald); text-decoration: none; font-weight: 600; }
  .track .meta { color: var(--text-dim); font-size: 11px; }
  .track-actions { display: flex; flex-direction: column; gap: 4px; text-align: right; }
  .config { font-size: 12px; color: var(--text-dim); }
  .config input { width: 100%; padding: 8px; background: rgba(0,0,0,0.4); color: var(--text); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; margin-top: 4px; font-family: inherit; }
  .config label { display: block; margin-top: 8px; font-weight: 600; color: var(--text-dim); }
  .small { font-size: 11px; color: var(--text-dim); margin-top: 8px; }
  .map-card { padding: 0; overflow: hidden; }
  #map {
    width: 100%;
    height: 320px;
    background: #0b1220;
  }
  .map-overlay {
    position: absolute;
    top: 8px;
    left: 8px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    pointer-events: none;
    background: rgba(3, 7, 18, 0.7);
    color: var(--text);
    backdrop-filter: blur(4px);
    z-index: 500;
  }
  .map-wrap { position: relative; }
  .leaflet-container { background: #0b1220; }
  .log-card { padding: 12px 14px; }
  .log-card pre {
    margin: 0;
    background: #020409;
    border: 1px solid rgba(255,255,255,0.04);
    border-radius: 8px;
    padding: 10px;
    font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    line-height: 1.45;
    max-height: 280px;
    overflow-y: auto;
    color: var(--text-dim);
    white-space: pre-wrap;
    word-break: break-all;
  }
  .log-toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; font-size: 12px; }
  .log-toolbar label { display: flex; gap: 4px; align-items: center; color: var(--text-dim); cursor: pointer; }
  .log-toolbar .grow { flex: 1; }
  .log-toolbar button { width: auto; padding: 4px 10px; font-size: 11px; font-weight: 600; background: rgba(255,255,255,0.06); color: var(--text); }
</style>
</head>
<body>
  <h1>RTK Walker</h1>

  <div class="card">
    <div class="row">
      <span class="label">Fix</span>
      <span class="value"><span id="fix" class="fix-pill fix-0"><span class="dot"></span> <span id="fixLabel">NO FIX</span></span></span>
    </div>
    <div class="row"><span class="label">Satellites</span><span class="value" id="sats">-</span></div>
    <div class="row"><span class="label">HDOP</span><span class="value" id="hdop">-</span></div>
    <div class="row"><span class="label">Latitude</span><span class="value" id="lat">-</span></div>
    <div class="row"><span class="label">Longitude</span><span class="value" id="lng">-</span></div>
    <div class="row"><span class="label">Altitude</span><span class="value" id="alt">-</span></div>
    <div class="row"><span class="label">NTRIP bytes</span><span class="value" id="ntrip">0</span></div>
    <div class="row" id="batteryRow" style="display:none"><span class="label">Battery</span><span class="value" id="battery">-</span></div>
  </div>

  <div class="card">
    <div class="row">
      <span class="label">Recording</span>
      <span class="value" id="recStatus">stopped</span>
    </div>
    <div class="row">
      <span class="label">Points</span>
      <span class="value" id="points">0</span>
    </div>
    <button id="recBtn">Start recording</button>
    <div class="small">Or press the BOOT button on the device.</div>
  </div>

  <div class="card map-card">
    <div class="map-wrap">
      <div id="map"></div>
      <div class="map-overlay" id="mapOverlay">no track yet</div>
    </div>
  </div>

  <details class="card log-card">
    <summary style="cursor:pointer;font-weight:600;color:var(--text)">Console log</summary>
    <div class="log-toolbar">
      <label><input id="logFollow" type="checkbox" checked> follow tail</label>
      <span class="grow"></span>
      <button type="button" id="logClear">clear view</button>
    </div>
    <pre id="logView"></pre>

    <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06)">
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">GNSS command (proprietary NMEA, checksum added automatically)</div>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <input id="gnssCmd" type="text" placeholder="PAIR021" style="flex:1;padding:8px;background:rgba(0,0,0,0.4);color:var(--text);border:1px solid rgba(255,255,255,0.08);border-radius:6px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px">
        <button type="button" id="gnssSendBtn" style="width:auto;padding:8px 14px;font-size:12px">Send</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="gnss-quick" data-cmd="PAIR021" style="width:auto;padding:4px 10px;font-size:11px;background:rgba(255,255,255,0.06);color:var(--text)">FW version</button>
        <button type="button" class="gnss-quick" data-cmd="PAIR050,1000" style="width:auto;padding:4px 10px;font-size:11px;background:rgba(255,255,255,0.06);color:var(--text)">1 Hz fix</button>
        <button type="button" class="gnss-quick" data-cmd="PAIR050,200" style="width:auto;padding:4px 10px;font-size:11px;background:rgba(255,255,255,0.06);color:var(--text)">5 Hz fix</button>
        <button type="button" class="gnss-quick" data-cmd="PAIR432,1" style="width:auto;padding:4px 10px;font-size:11px;background:rgba(255,255,255,0.06);color:var(--text)">Save config</button>
        <button type="button" class="gnss-quick" data-cmd="PAIR002" style="width:auto;padding:4px 10px;font-size:11px;background:rgba(255,255,255,0.06);color:var(--text)">Cold start</button>
      </div>
    </div>
  </details>

  <div class="tracks">
    <h1>Saved tracks</h1>
    <div id="trackList"></div>
  </div>

  <details class="card config">
    <summary style="cursor:pointer;font-weight:600;color:var(--text)">WiFi &amp; NTRIP setup</summary>
    <form id="cfgForm">
      <label>WiFi SSID<input id="cfg_ssid" type="text"></label>
      <label>WiFi password <span style="color:var(--text-dim);font-weight:400;font-size:10px">(leave blank to keep stored value)</span><input id="cfg_pass" type="password" placeholder="••• (unchanged if empty)"></label>
      <label>NTRIP host<input id="cfg_host" type="text" placeholder="caster.centipede.fr"></label>
      <label>NTRIP port<input id="cfg_port" type="number" placeholder="2101"></label>
      <label>NTRIP mountpoint<input id="cfg_mount" type="text" placeholder="e.g. NLDB"></label>
      <label>NTRIP user<input id="cfg_user" type="text" placeholder="centipede"></label>
      <label>NTRIP password <span style="color:var(--text-dim);font-weight:400;font-size:10px">(leave blank to keep stored value)</span><input id="cfg_npass" type="text" placeholder="••• (unchanged if empty)"></label>
      <button type="submit" style="margin-top:12px">Save &amp; reboot</button>
      <div id="cfgStatus" style="margin-top:8px;font-size:12px;min-height:16px"></div>
    </form>
  </details>

  <details class="card config">
    <summary style="cursor:pointer;font-weight:600;color:var(--text)">OpenNova server setup</summary>
    <p style="font-size:11px;color:var(--text-dim);margin:6px 0 10px;line-height:1.4">
      Server URL is enough for "Upload to server" (LAN-only public endpoint, no token
      required). Admin token is only needed for OTA firmware updates (the bearer-
      protected binary download); leave blank if you don't plan to OTA-upgrade.
    </p>
    <form id="srvForm">
      <label>Server URL<input id="srv_url" type="text" placeholder="http://192.168.0.247:8080"></label>
      <label>Mower SN <span style="color:var(--text-dim);font-weight:400;font-size:10px">(legacy hint, optional)</span><input id="srv_msn" type="text" placeholder="LFIN2230700238"></label>
      <label>Admin token <span style="color:var(--text-dim);font-weight:400;font-size:10px">(only for OTA — leave blank if not using)</span><input id="srv_token" type="text" placeholder="eyJhbGc... (unchanged if empty)"></label>
      <button type="submit" style="margin-top:12px">Save server config</button>
      <div id="srvStatus" style="margin-top:8px;font-size:12px;min-height:16px"></div>
    </form>
  </details>

  <div class="card">
    <h3 style="margin:0 0 10px;font-size:14px;letter-spacing:-0.01em">Firmware</h3>
    <div class="row"><span class="label">Current</span><span class="value" id="ota-current">loading...</span></div>
    <div class="row"><span class="label">Latest</span><span class="value" id="ota-latest">-</span></div>
    <button type="button" id="ota-check" style="margin-top:8px">Check for update</button>
    <button type="button" id="ota-apply" disabled style="margin-top:6px">Update now</button>
    <div id="ota-status" style="margin-top:8px;font-size:12px;color:var(--text-dim);min-height:16px"></div>
  </div>

<script>
let recording = false;
const FIX_LABELS = { 0: 'NO FIX', 1: 'GPS', 2: 'DGPS', 4: 'RTK FIX', 5: 'RTK FLOAT' };

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

async function refresh() {
  try {
    const r = await fetch('/api/status');
    const d = await r.json();
    setText('sats', d.sats != null ? d.sats : '-');
    setText('hdop', d.hdop != null ? d.hdop.toFixed(2) : '-');
    setText('lat', d.lat != null ? d.lat.toFixed(7) : '-');
    setText('lng', d.lng != null ? d.lng.toFixed(7) : '-');
    setText('alt', d.alt != null ? (d.alt.toFixed(1) + ' m') : '-');
    setText('ntrip', d.ntripBytes != null ? d.ntripBytes : 0);
    setText('points', d.points != null ? d.points : 0);
    const batRow = document.getElementById('batteryRow');
    if (d.batteryVolts != null && d.batteryPercent != null) {
      batRow.style.display = '';
      setText('battery', d.batteryPercent + '% (' + d.batteryVolts.toFixed(2) + ' V)');
    } else {
      batRow.style.display = 'none';
    }
    setText('recStatus', d.recording ? 'recording' : 'stopped');
    recording = !!d.recording;
    const btn = document.getElementById('recBtn');
    btn.textContent = recording ? 'Stop recording' : 'Start recording';
    btn.className = recording ? 'stop' : '';
    const fixPill = document.getElementById('fix');
    const fixCode = d.fix != null ? d.fix : 0;
    fixPill.className = 'fix-pill fix-' + fixCode;
    setText('fixLabel', FIX_LABELS[fixCode] || ('FIX ' + fixCode));
  } catch (e) { /* ignore */ }
}

async function toggleRecord() {
  await fetch('/api/record', {
    method: 'POST',
    body: JSON.stringify({ recording: !recording }),
    headers: { 'Content-Type': 'application/json' }
  });
  refresh();
  loadTracks();
}

function makeTrackRow(t) {
  const wrap = document.createElement('div');
  wrap.className = 'track';

  const left = document.createElement('div');
  const name = document.createElement('div');
  name.textContent = t.name;
  // Click the track name to load it onto the map. Cheaper than a
  // separate "View" button; the .meta line below tells the user how
  // many points are in there before they pull the trigger.
  name.style.cursor = 'pointer';
  name.style.color = 'var(--emerald)';
  name.style.fontWeight = '600';
  name.addEventListener('click', function() { viewTrack(t.name); });
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = (t.points != null ? t.points : 0) + ' pts · ' + (t.size != null ? t.size : 0) + ' bytes';
  left.appendChild(name);
  left.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'track-actions';

  const csv = document.createElement('a');
  csv.href = '/track/' + encodeURIComponent(t.name);
  csv.setAttribute('download', '');
  csv.textContent = 'Download CSV';

  const poly = document.createElement('a');
  poly.href = '/track/' + encodeURIComponent(t.name) + '.polygon';
  poly.setAttribute('download', '');
  poly.textContent = 'Novabot polygon';
  poly.title = 'lat,lng pairs only, deduped — drop into OpenNova polygon import';

  actions.appendChild(csv);
  actions.appendChild(poly);

  wrap.appendChild(left);
  wrap.appendChild(actions);
  return wrap;
}

async function loadTracks() {
  const r = await fetch('/api/tracks');
  const list = await r.json();
  const container = document.getElementById('trackList');
  while (container.firstChild) container.removeChild(container.firstChild);
  for (const t of list) container.appendChild(makeTrackRow(t));
}

async function loadConfig() {
  const r = await fetch('/api/config');
  const c = await r.json();
  for (const k of ['ssid', 'host', 'port', 'mount', 'user']) {
    const el = document.getElementById('cfg_' + k);
    if (el && c[k] != null) el.value = c[k];
  }
}

async function saveConfig() {
  const status = document.getElementById('cfgStatus');
  status.style.color = 'var(--text-dim)';
  status.textContent = 'Saving...';
  const body = {
    ssid: document.getElementById('cfg_ssid').value,
    pass: document.getElementById('cfg_pass').value,
    host: document.getElementById('cfg_host').value,
    port: parseInt(document.getElementById('cfg_port').value || '2101', 10),
    mount: document.getElementById('cfg_mount').value,
    user: document.getElementById('cfg_user').value,
    npass: document.getElementById('cfg_npass').value,
  };
  try {
    const r = await fetch('/api/config', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    if (!r.ok) {
      status.style.color = 'var(--red)';
      status.textContent = 'Save failed: HTTP ' + r.status;
      return;
    }
    status.style.color = 'var(--emerald)';
    status.textContent = 'Saved. Device rebooting — page will be unreachable for ~5 s.';
  } catch (e) {
    // Fetch promise rejects when the ESP closes the TCP connection on
    // reboot. That happens AFTER the server has already accepted + saved
    // the body (saveConfig() runs before ESP.restart()), so a thrown
    // fetch error here is still a successful save.
    status.style.color = 'var(--emerald)';
    status.textContent = 'Save accepted; device rebooting.';
  }
}

document.getElementById('recBtn').addEventListener('click', toggleRecord);
document.getElementById('cfgForm').addEventListener('submit', function(e) {
  e.preventDefault();
  saveConfig();
});

// Server config (separate form because saving doesn't reboot the
// device — adopting a new server URL / mower SN / admin token should
// take effect on the next upload without losing the active recording.)
async function loadServerConfig() {
  try {
    const r = await fetch('/api/config/server');
    if (!r.ok) return;
    const c = await r.json();
    const urlEl = document.getElementById('srv_url');
    const msnEl = document.getElementById('srv_msn');
    if (urlEl && c.serverUrl) urlEl.value = c.serverUrl;
    if (msnEl && c.mowerSn) msnEl.value = c.mowerSn;
    // Token field stays empty — server returns only a tail preview so
    // the user knows "set" vs "unset" without exposing the full bearer
    // back to the browser. We surface the preview in the status line.
    if (c.tokenPreview) {
      const status = document.getElementById('srvStatus');
      if (status) {
        status.style.color = 'var(--text-dim)';
        status.textContent = 'Stored token: ' + c.tokenPreview;
      }
    }
  } catch (e) { /* keep silent — settings UI just stays blank */ }
}

async function saveServerConfig() {
  const status = document.getElementById('srvStatus');
  status.style.color = 'var(--text-dim)';
  status.textContent = 'Saving...';
  const body = {
    serverUrl: document.getElementById('srv_url').value.trim(),
    mowerSn: document.getElementById('srv_msn').value.trim(),
    adminToken: document.getElementById('srv_token').value,
  };
  try {
    const r = await fetch('/api/config/server', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    if (!r.ok) {
      status.style.color = 'var(--red)';
      status.textContent = 'Save failed: HTTP ' + r.status;
      return;
    }
    status.style.color = 'var(--emerald)';
    status.textContent = 'Saved. Upload + OTA can use these credentials now.';
    // Clear the token field so the preview line refreshes from /api/config/server
    document.getElementById('srv_token').value = '';
    loadServerConfig();
  } catch (e) {
    status.style.color = 'var(--red)';
    status.textContent = 'Save failed: ' + (e && e.message ? e.message : e);
  }
}

document.getElementById('srvForm').addEventListener('submit', function(e) {
  e.preventDefault();
  saveServerConfig();
});

loadServerConfig();

// ── Live map ──────────────────────────────────────────────────────
// Default centre is somewhere on land; the first incoming fix or
// track point shifts it to the real location and we never recenter
// automatically after that — only on demand (button below the map
// could be added later).
let map = null;
let trackLine = null;
let trackMarker = null;
let cursorMarker = null;
let mapInitialised = false;
let mapAutoFitDone = false;
let lastPointCount = 0;

function initMap() {
  if (mapInitialised) return;
  map = L.map('map', {
    zoomControl: true,
    attributionControl: false,
    tap: true,
  }).setView([52.1, 5.3], 8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 22,
    crossOrigin: true,
  }).addTo(map);
  trackLine = L.polyline([], { color: '#00d4aa', weight: 4 }).addTo(map);
  mapInitialised = true;
}

function setOverlay(text) {
  const el = document.getElementById('mapOverlay');
  if (el) el.textContent = text;
}

// Viewing a saved track from the list pauses the live polyline poll
// and renders the loaded points instead. null = live mode (default).
let viewingTrack = null;

async function viewTrack(name) {
  try {
    const r = await fetch('/track/' + encodeURIComponent(name) + '.json');
    if (!r.ok) { alert('Could not load ' + name); return; }
    const d = await r.json();
    const pts = (d.points || []).map(function(p){ return [p[0], p[1]]; });
    viewingTrack = name;
    if (trackLine) trackLine.setLatLngs(pts);
    if (pts.length >= 2) {
      map.fitBounds(trackLine.getBounds(), { padding: [30, 30], maxZoom: 21 });
    }
    mapAutoFitDone = true;
    setOverlay('viewing ' + name + ' · ' + pts.length + ' pts');
    // Slip a back-to-live button into the overlay container.
    const ov = document.getElementById('mapOverlay');
    if (ov && !document.getElementById('backToLive')) {
      const btn = document.createElement('button');
      btn.id = 'backToLive';
      btn.textContent = 'Back to live';
      btn.style.cssText = 'margin-left:8px;padding:2px 8px;font-size:11px;border:0;border-radius:4px;background:rgba(0,212,170,0.2);color:var(--emerald);cursor:pointer';
      btn.addEventListener('click', backToLive);
      ov.appendChild(btn);
    }
  } catch (e) { alert('Failed to load track: ' + e); }
}

function backToLive() {
  viewingTrack = null;
  mapAutoFitDone = false;
  if (trackLine) trackLine.setLatLngs([]);
  const btn = document.getElementById('backToLive');
  if (btn) btn.remove();
}

async function refreshMap() {
  if (!mapInitialised) return;
  // While viewing a saved track, don't overwrite its polyline with the
  // live recording's. The cursor still moves so the user can see where
  // they are vs the loaded track.
  if (viewingTrack) {
    try {
      const sresp = await fetch('/api/status');
      const s = await sresp.json();
      const liveOk = s.lat && s.lng && Math.abs(s.lat) > 0.0001;
      if (liveOk) {
        const here = [s.lat, s.lng];
        const colourByFix = { 0: '#9ca3af', 1: '#9ca3af', 2: '#f59e0b', 4: '#00d4aa', 5: '#f59e0b' };
        const colour = colourByFix[s.fix] || '#ef4444';
        if (!cursorMarker) {
          cursorMarker = L.circleMarker(here, {
            radius: 7, color: colour, weight: 3, fillColor: colour, fillOpacity: 0.6
          }).addTo(map);
        } else {
          cursorMarker.setLatLng(here);
          cursorMarker.setStyle({ color: colour, fillColor: colour });
        }
      }
    } catch (e) { /* ignore */ }
    return;
  }
  try {
    // Polyline from the active recording (server keeps it in RAM
    // capped at LIVE_POINTS_MAX). We also drop a "cursor" marker on
    // the latest known live position regardless of recording state.
    const r = await fetch('/api/track/current');
    const d = await r.json();
    const pts = (d.points || []).map(function(p){ return [p[0], p[1]]; });

    if (trackLine) trackLine.setLatLngs(pts);

    // Marker for the current GNSS reading (from /api/status latest),
    // even when not recording — handy to verify position before tap-Start.
    const sresp = await fetch('/api/status');
    const s = await sresp.json();
    const liveOk = s.lat && s.lng && Math.abs(s.lat) > 0.0001;

    if (liveOk) {
      const here = [s.lat, s.lng];
      const colourByFix = { 0: '#9ca3af', 1: '#9ca3af', 2: '#f59e0b', 4: '#00d4aa', 5: '#f59e0b' };
      const colour = colourByFix[s.fix] || '#ef4444';
      if (!cursorMarker) {
        cursorMarker = L.circleMarker(here, {
          radius: 7, color: colour, weight: 3, fillColor: colour, fillOpacity: 0.6
        }).addTo(map);
      } else {
        cursorMarker.setLatLng(here);
        cursorMarker.setStyle({ color: colour, fillColor: colour });
      }
    }

    // Auto-fit once when we first have geometry. Don't keep recentring
    // — it'd fight the user when they pan/zoom to look around.
    if (!mapAutoFitDone) {
      if (pts.length >= 2) {
        map.fitBounds(trackLine.getBounds(), { padding: [30, 30], maxZoom: 21 });
        mapAutoFitDone = true;
      } else if (liveOk) {
        map.setView([s.lat, s.lng], 19);
        mapAutoFitDone = true;
      }
    }

    if (d.recording) {
      setOverlay(pts.length + ' pts · recording');
    } else if (pts.length > 0) {
      setOverlay(pts.length + ' pts · stopped');
    } else if (liveOk) {
      setOverlay('live ' + (s.fix === 4 ? 'RTK FIX' : (s.fix === 5 ? 'RTK FLOAT' : 'no RTK')));
    } else {
      setOverlay('no track yet');
    }
    lastPointCount = pts.length;
  } catch (e) { /* ignore */ }
}

// Reset the one-shot auto-fit whenever the user (re)starts recording
// so the next walk gets a fresh fit when it has enough geometry.
const origToggleRecord = toggleRecord;
toggleRecord = async function() {
  // Starting a recording always drops you back into live mode - it'd
  // be weird if Start Recording left a saved track on the map.
  if (viewingTrack) backToLive();
  await origToggleRecord();
  mapAutoFitDone = false;
  if (trackLine) trackLine.setLatLngs([]);
};

// ── Console log polling ──────────────────────────────────────────
// Server keeps an 8 KB ring buffer; we ask for the current snapshot +
// the monotonic byte offset of its newest byte. Between polls we know
// `lastSeenSeq`, so we figure out which suffix of `buf` is new and
// only append that. Buffer drops 25 % off the front when it fills up,
// so a stale client gets a `firstSeq > lastSeenSeq` jump — handled by
// replacing the whole view rather than appending.
let lastSeenSeq = 0;

async function refreshLog() {
  try {
    const r = await fetch('/api/log');
    const d = await r.json();
    const view = document.getElementById('logView');
    if (!view) return;
    const seq = d.seq | 0;
    const firstSeq = d.firstSeq | 0;
    const buf = d.buf || '';
    if (firstSeq > lastSeenSeq && lastSeenSeq !== 0) {
      // Server trimmed past our last-seen point — show full buffer.
      view.textContent = buf;
    } else if (lastSeenSeq === 0) {
      view.textContent = buf;
    } else {
      const skip = lastSeenSeq - firstSeq;
      if (skip < buf.length) {
        view.textContent += buf.substring(skip);
      }
    }
    lastSeenSeq = seq;
    if (document.getElementById('logFollow').checked) {
      view.scrollTop = view.scrollHeight;
    }
  } catch (e) { /* ignore */ }
}

document.getElementById('logClear').addEventListener('click', function() {
  document.getElementById('logView').textContent = '';
});

// ── GNSS command sender ─────────────────────────────────────────
async function sendGnssCmd(cmd) {
  if (!cmd) return;
  await fetch('/api/gnss/send', {
    method: 'POST',
    body: JSON.stringify({ cmd: cmd }),
    headers: { 'Content-Type': 'application/json' },
  });
  // Immediate poll so the [gnss-tx] line shows up without 1 s lag.
  setTimeout(refreshLog, 100);
}

document.getElementById('gnssSendBtn').addEventListener('click', function() {
  const cmd = document.getElementById('gnssCmd').value.trim();
  sendGnssCmd(cmd);
});
document.getElementById('gnssCmd').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    sendGnssCmd(e.target.value.trim());
  }
});
const quickButtons = document.querySelectorAll('.gnss-quick');
for (let i = 0; i < quickButtons.length; i++) {
  quickButtons[i].addEventListener('click', function(e) {
    const cmd = e.currentTarget.getAttribute('data-cmd');
    // Mirror into the textbox so users see what they just dispatched,
    // and force-open the console + enable follow-tail so the response
    // is actually visible.
    document.getElementById('gnssCmd').value = cmd;
    const det = document.querySelector('details.log-card');
    if (det && !det.open) det.open = true;
    const follow = document.getElementById('logFollow');
    if (follow && !follow.checked) follow.checked = true;
    sendGnssCmd(cmd);
  });
}

async function otaLoadCurrent() {
  try {
    const r = await (await fetch('/api/ota/check')).json();
    setText('ota-current', r.currentVersion || 'unknown');
    if (r.ok && r.latestVersion) setText('ota-latest', r.latestVersion);
    if (r.ok && r.updateAvailable) {
      const btn = document.getElementById('ota-apply');
      if (btn) btn.disabled = false;
    }
  } catch (e) {
    setText('ota-current', 'error');
  }
}

async function otaCheck() {
  setText('ota-status', 'Checking...');
  const applyBtn = document.getElementById('ota-apply');
  if (applyBtn) applyBtn.disabled = true;
  try {
    const r = await (await fetch('/api/ota/check')).json();
    setText('ota-current', r.currentVersion || 'unknown');
    setText('ota-latest', r.latestVersion || '-');
    if (!r.ok) {
      setText('ota-status', 'Error: ' + (r.error || 'check failed'));
      return;
    }
    if (!r.updateAvailable) {
      setText('ota-status', 'Up to date');
      return;
    }
    setText('ota-status', 'New version available: ' + (r.latestVersion || '?'));
    if (applyBtn) applyBtn.disabled = false;
  } catch (e) {
    setText('ota-status', 'Network error');
  }
}

async function otaApply() {
  setText('ota-status', 'Updating, walker will reboot...');
  const applyBtn = document.getElementById('ota-apply');
  if (applyBtn) applyBtn.disabled = true;
  try {
    const res = await fetch('/api/ota/apply', { method: 'POST' });
    // If the request returned, the apply failed before reboot.
    try {
      const r = await res.json();
      if (r && r.ok === false) {
        setText('ota-status', 'Update failed: ' + (r.error || 'unknown'));
      }
    } catch (parseErr) {
      setText('ota-status', 'Update failed (no response)');
    }
  } catch (e) {
    // Connection drop is expected on a successful reboot.
  }
}

const otaCheckBtn = document.getElementById('ota-check');
if (otaCheckBtn) otaCheckBtn.addEventListener('click', otaCheck);
const otaApplyBtn = document.getElementById('ota-apply');
if (otaApplyBtn) otaApplyBtn.addEventListener('click', otaApply);

initMap();
setInterval(refresh, 500);
setInterval(refreshMap, 1000);
setInterval(refreshLog, 1000);
refresh();
refreshMap();
refreshLog();
loadTracks();
loadConfig();
otaLoadCurrent();
</script>
</body>
</html>
)INDEX";
