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

  <details class="card config" id="authCard">
    <summary style="cursor:pointer;font-weight:600;color:var(--text)">API auth</summary>
    <form id="authForm">
      <label>API token<input id="auth_token" type="password" placeholder="8+ characters"></label>
      <button type="submit" style="margin-top:12px">Save token</button>
      <div id="authStatus" style="margin-top:8px;font-size:12px;min-height:16px"></div>
    </form>
  </details>

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

  <!-- Obstacle management for the currently-viewed saved map. Hidden
       unless the user is actually viewing a map AND that map has at
       least one obstacle ring on disk. Lists each ring with its file
       name + point count + a delete button, plus a one-click "Keep
       only newest" convenience when there are 2+ rings. -->
  <div id="obstacleManager" class="card" style="display:none">
    <h3 style="margin:0 0 8px;font-size:14px;letter-spacing:-0.01em">
      Obstacles
      <span id="obstacleCount" style="font-weight:400;color:var(--text-dim);font-size:12px"></span>
    </h3>
    <div id="obstacleList"></div>
    <div id="obstacleStatus" style="margin-top:8px;font-size:12px;color:var(--text-dim);min-height:16px"></div>
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
    <h1>Saved maps</h1>
    <div style="font-size:11px;color:var(--text-dim);margin:-6px 0 8px;line-height:1.4">
      Maps captured on the walker via the +Channel / +Obstacle flow.
      Tapping a row loads that map on the TFT too — useful for verifying
      a freshly walked boundary against the live cursor before recording
      obstacles inside it.
    </div>
    <div id="mapList"></div>
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
      Server URL is the only thing the walker needs. Bundle upload and OTA firmware
      download both run against public LAN-only endpoints, so no JWT or mower SN to
      paste here.
    </p>
    <form id="srvForm">
      <label>Server URL<input id="srv_url" type="text" placeholder="http://192.168.0.247:8080"></label>
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
let authToken = localStorage.getItem('rtkWalkerAuthToken') || '';

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

function authHeaders(extra) {
  const h = Object.assign({}, extra || {});
  if (authToken) h['X-Auth-Token'] = authToken;
  return h;
}

function authFetch(url, opts) {
  const o = Object.assign({}, opts || {});
  o.headers = authHeaders(o.headers);
  return fetch(url, o);
}

function showAuthNeeded(targetId) {
  const msg = 'Auth required. Enter the API token above.';
  if (targetId) {
    const el = document.getElementById(targetId);
    if (el) { el.style.color = 'var(--red)'; el.textContent = msg; return; }
  }
  alert(msg);
}

async function loadAuthStatus() {
  try {
    const r = await fetch('/api/auth');
    const d = await r.json();
    const el = document.getElementById('authStatus');
    if (!el) return;
    el.style.color = d.configured ? 'var(--emerald)' : 'var(--amber)';
    el.textContent = d.configured ? 'Token configured on device.' : 'No token configured; protected endpoints only work unauthenticated on the setup AP.';
  } catch (e) { /* ignore */ }
}

async function saveAuthToken() {
  const status = document.getElementById('authStatus');
  const nextToken = document.getElementById('auth_token').value.trim();
  status.style.color = 'var(--text-dim)';
  status.textContent = 'Saving...';
  if (nextToken.length < 8) {
    status.style.color = 'var(--red)';
    status.textContent = 'Token must be at least 8 characters.';
    return;
  }
  try {
    const r = await authFetch('/api/auth', {
      method: 'POST',
      body: JSON.stringify({ token: nextToken }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (!r.ok) {
      status.style.color = 'var(--red)';
      status.textContent = r.status === 401 ? 'Current token required to change it.' : ('Save failed: HTTP ' + r.status);
      return;
    }
    authToken = nextToken;
    localStorage.setItem('rtkWalkerAuthToken', authToken);
    document.getElementById('auth_token').value = '';
    status.style.color = 'var(--emerald)';
    status.textContent = 'Token saved.';
    loadMaps();
  } catch (e) {
    status.style.color = 'var(--red)';
    status.textContent = 'Save failed: ' + (e && e.message ? e.message : e);
  }
}

async function refresh() {
  if (mapLoading) return;  // single-threaded WebServer — don't queue behind the polygon stream
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

    // The walker may have loaded (or exited) a saved map on its own
    // (TFT tap, BLE, anything). Mirror that into the web UI so the
    // canvas + map list stay in sync without a manual refresh.
    const dSlot = (d.viewingSlot != null) ? d.viewingSlot : -1;
    if (dSlot >= 0 && viewingSavedMap !== dSlot) {
      // Device picked a different slot — render that one. viewSavedMap
      // re-POSTs the slot but the server short-circuits when it's
      // already viewing, so this is cheap.
      viewSavedMap(dSlot);
    } else if (dSlot < 0 && viewingSavedMap != null) {
      // Device exited viewing mode — drop our overlay too.
      backToLiveSavedMap();
    }
  } catch (e) { /* ignore */ }
}

async function toggleRecord() {
  await authFetch('/api/record', {
    method: 'POST',
    body: JSON.stringify({ recording: !recording }),
    headers: { 'Content-Type': 'application/json' }
  });
  refresh();
  loadMaps();
}

// ── Saved maps (Recording-screen output) ───────────────────────────
// Mirrors what the on-device Maps tab shows. Each row has an alias,
// a metadata line (boundary / obstacle / channel counts) and a click
// handler that asks the walker to load that map (POST /api/maps/view)
// and pulls the polygon data down for the Leaflet canvas.
let lastViewingSlot = -1;

function makeMapRow(m, active) {
  const wrap = document.createElement('div');
  wrap.className = 'track';
  if (active) {
    wrap.style.borderLeft = '3px solid var(--emerald)';
    wrap.style.background = 'rgba(0,212,170,0.06)';
  }

  const left = document.createElement('div');
  const name = document.createElement('div');
  name.textContent = m.alias || ('map' + m.slot);
  name.style.cursor = 'pointer';
  name.style.color = active ? 'var(--emerald)' : '#cbd5f5';
  name.style.fontWeight = '600';
  name.addEventListener('click', function() { viewSavedMap(m.slot); });
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = (m.boundaryPoints || 0) + ' pts boundary · ' +
                     (m.obstacleCount || 0) + ' obstacles · ' +
                     (m.channelCount || 0) + ' channels';
  left.appendChild(name);
  left.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'track-actions';

  const view = document.createElement('a');
  view.href = '#';
  view.textContent = active ? 'Viewing' : 'View on walker';
  view.style.color = active ? 'var(--emerald)' : 'var(--text)';
  view.addEventListener('click', function(e) {
    e.preventDefault();
    if (active) backToLiveSavedMap();
    else viewSavedMap(m.slot);
  });
  actions.appendChild(view);

  wrap.appendChild(left);
  wrap.appendChild(actions);
  return wrap;
}

async function loadMaps() {
  if (mapLoading) return;
  try {
    const r = await fetch('/api/maps');
    if (!r.ok) return;
    const d = await r.json();
    lastViewingSlot = (d.viewingSlot != null) ? d.viewingSlot : -1;
    const container = document.getElementById('mapList');
    while (container.firstChild) container.removeChild(container.firstChild);
    const maps = d.maps || [];
    if (maps.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'meta';
      empty.style.padding = '12px 0';
      empty.textContent = 'No saved maps yet. Walk a boundary on the walker and tap Save as area.';
      container.appendChild(empty);
      return;
    }
    for (const m of maps) {
      container.appendChild(makeMapRow(m, m.slot === lastViewingSlot));
    }
  } catch (e) { /* ignore */ }
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
    const r = await authFetch('/api/config', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    if (!r.ok) {
      status.style.color = 'var(--red)';
      status.textContent = r.status === 401 ? 'Auth required.' : ('Save failed: HTTP ' + r.status);
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
// device — adopting a new server URL should take effect on the next
// upload or OTA check without losing the active recording.)
async function loadServerConfig() {
  try {
    const r = await fetch('/api/config/server');
    if (!r.ok) return;
    const c = await r.json();
    const urlEl = document.getElementById('srv_url');
    if (urlEl && c.serverUrl) urlEl.value = c.serverUrl;
  } catch (e) { /* keep silent — settings UI just stays blank */ }
}

async function saveServerConfig() {
  const status = document.getElementById('srvStatus');
  status.style.color = 'var(--text-dim)';
  status.textContent = 'Saving...';
  const body = {
    serverUrl: document.getElementById('srv_url').value.trim(),
  };
  try {
    const r = await authFetch('/api/config/server', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    if (!r.ok) {
      status.style.color = 'var(--red)';
      status.textContent = r.status === 401 ? 'Auth required.' : ('Save failed: HTTP ' + r.status);
      return;
    }
    status.style.color = 'var(--emerald)';
    status.textContent = 'Saved. Upload + OTA can use the server immediately.';
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
document.getElementById('authForm').addEventListener('submit', function(e) {
  e.preventDefault();
  saveAuthToken();
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

// Layer group holding everything that belongs to the saved-map view
// (boundary polygon, obstacle rings, channel polylines). Created on
// initMap, populated by viewSavedMap, cleared by backToLiveSavedMap.
let savedMapLayer = null;
let viewingSavedMap = null;  // slot number, or null when in live mode

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
  savedMapLayer = L.layerGroup().addTo(map);
  mapInitialised = true;
}

function setOverlay(text) {
  const el = document.getElementById('mapOverlay');
  if (el) el.textContent = text;
}

// Tracks whether a saved-map fetch is in flight. Live status / log /
// map / maps-list polls all short-circuit while this is true so the
// ESP32 WebServer (single-threaded — only one request at a time) can
// focus on streaming the polygon response. Without this every poll
// fires from the browser in parallel and stacks up behind the slow
// GET, making the user-visible load time 5-10x worse than it has to
// be.
let mapLoading = false;

async function viewSavedMap(slot) {
  if (mapLoading) return;  // ignore double-clicks while one is in flight
  mapLoading = true;
  try {
    setOverlay('loading map ' + slot + '...');

    // First: tell the walker which map to load on its TFT. This must
    // complete BEFORE the polygon GET so the walker's HTTP handler can
    // start the LittleFS scan in parallel with our request — and it's
    // a tiny POST, single-digit-ms on the wire. Auth-gated; if no
    // token is set the device just won't follow along (the canvas
    // still renders).
    try {
      await authFetch('/api/maps/view', {
        method: 'POST',
        body: JSON.stringify({ slot: slot }),
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) { /* best-effort */ }

    const r = await fetch('/api/maps/' + slot);
    if (!r.ok) {
      setOverlay('map ' + slot + ' load failed');
      return;
    }
    const d = await r.json();

    // Wipe any previous saved-map render + the live track polyline.
    if (savedMapLayer) savedMapLayer.clearLayers();
    if (trackLine) trackLine.setLatLngs([]);

    const work = (d.work || []).map(function(p){ return [p.lat, p.lng]; });
    if (work.length >= 2) {
      // Boundary as a closed emerald polygon. Polygon (not Polyline) so
      // Leaflet auto-closes the ring + we can tint the fill lightly.
      L.polygon(work, {
        color: '#00d4aa', weight: 3, fillColor: '#00d4aa', fillOpacity: 0.08,
      }).addTo(savedMapLayer);
    }

    // Obstacles — red, semi-transparent fill so the operator can see
    // the work polygon through them.
    (d.obstacles || []).forEach(function(ob) {
      const pts = (ob.points || []).map(function(p){ return [p.lat, p.lng]; });
      if (pts.length >= 2) {
        L.polygon(pts, {
          color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.15,
        }).addTo(savedMapLayer);
      }
    });

    // Channels — blue lines (not polygons; channels are routes, not
    // areas). Dashed so they don't get confused with the boundary.
    (d.channels || []).forEach(function(ch) {
      const pts = (ch.points || []).map(function(p){ return [p.lat, p.lng]; });
      if (pts.length >= 2) {
        L.polyline(pts, {
          color: '#a5b4fc', weight: 3, dashArray: '6,4',
        }).addTo(savedMapLayer);
      }
    });

    // Fit to the boundary (or the obstacle if no boundary somehow).
    if (work.length >= 2) {
      const bounds = L.polygon(work).getBounds();
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 21 });
    }

    viewingSavedMap = slot;
    mapAutoFitDone = true;
    const alias = d.alias || ('map' + slot);
    setOverlay('viewing ' + alias + ' · ' + (d.boundaryPoints || 0) + ' pts · '
               + (d.obstacleCount || 0) + ' obs');

    // Same "back to live" affordance the legacy track viewer uses.
    const ov = document.getElementById('mapOverlay');
    if (ov && !document.getElementById('backToLive')) {
      const btn = document.createElement('button');
      btn.id = 'backToLive';
      btn.textContent = 'Back to live';
      btn.style.cssText = 'margin-left:8px;padding:2px 8px;font-size:11px;border:0;border-radius:4px;background:rgba(0,212,170,0.2);color:var(--emerald);cursor:pointer';
      btn.addEventListener('click', backToLiveSavedMap);
      ov.appendChild(btn);
    }

    // Populate the Obstacles card so the user can prune duplicates
    // ("I walked it twice, only the last one is real").
    renderObstacleManager(slot, d.obstacles || []);

    // Refresh the maps list so the active row highlights.
    loadMaps();
  } catch (e) {
    setOverlay('viewSavedMap failed: ' + (e && e.message ? e.message : e));
  } finally {
    mapLoading = false;
  }
}

// Populate the Obstacles card with one row per loaded ring. Each row
// has its own Delete link. obstacleRecs comes straight from
// /api/maps/N — each entry has {name, points: [...]}.
function renderObstacleManager(slot, obstacleRecs) {
  const card = document.getElementById('obstacleManager');
  const list = document.getElementById('obstacleList');
  const countEl = document.getElementById('obstacleCount');
  const status = document.getElementById('obstacleStatus');
  if (!card || !list) return;

  // Reset state
  while (list.firstChild) list.removeChild(list.firstChild);
  status.textContent = '';
  status.style.color = 'var(--text-dim)';
  if (obstacleRecs.length === 0) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';
  countEl.textContent = ' (' + obstacleRecs.length + ')';

  // Sort by extracted index so the user sees them in capture order.
  // Filename format: mapN_<i>_obstacle.csv.
  obstacleRecs.forEach(function(ob) {
    const m = (ob.name || '').match(/^map\d+_(\d+)_obstacle\.csv$/);
    ob._idx = m ? parseInt(m[1], 10) : 0;
  });
  obstacleRecs.sort(function(a, b) { return a._idx - b._idx; });

  obstacleRecs.forEach(function(ob) {
    const row = document.createElement('div');
    row.className = 'track';
    const left = document.createElement('div');
    const title = document.createElement('div');
    title.textContent = 'obstacle ' + ob._idx;
    title.style.color = '#cbd5f5';
    title.style.fontWeight = '600';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = (ob.points || []).length + ' pts · ' + ob.name;
    left.appendChild(title);
    left.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'track-actions';
    const del = document.createElement('a');
    del.href = '#';
    del.textContent = 'Delete';
    del.style.color = 'var(--red)';
    del.addEventListener('click', function(e) {
      e.preventDefault();
      deleteObstacle(slot, ob.name);
    });
    actions.appendChild(del);

    row.appendChild(left);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

async function deleteObstacle(slot, name) {
  const status = document.getElementById('obstacleStatus');
  status.style.color = 'var(--text-dim)';
  status.textContent = 'Deleting ' + name + '...';
  try {
    const r = await authFetch('/api/maps/obstacles/delete?name=' + encodeURIComponent(name), {
      method: 'POST',
    });
    if (r.status === 401 || r.status === 403) {
      showAuthNeeded('obstacleStatus');
      return;
    }
    if (!r.ok) {
      const txt = await r.text();
      status.style.color = 'var(--red)';
      status.textContent = 'Delete failed: ' + txt;
      return;
    }
    status.style.color = 'var(--emerald)';
    status.textContent = 'Deleted. Reloading...';
    // Re-fetch the map so the canvas + obstacle list reflect reality.
    await viewSavedMap(slot);
  } catch (e) {
    status.style.color = 'var(--red)';
    status.textContent = 'Delete error: ' + (e && e.message ? e.message : e);
  }
}

function backToLiveSavedMap() {
  viewingSavedMap = null;
  mapAutoFitDone = false;
  if (savedMapLayer) savedMapLayer.clearLayers();
  const btn = document.getElementById('backToLive');
  if (btn) btn.remove();
  const om = document.getElementById('obstacleManager');
  if (om) om.style.display = 'none';
  // Tell the walker to exit viewing too. Auth-gated; fail silently.
  authFetch('/api/maps/view', {
    method: 'POST',
    body: JSON.stringify({ slot: -1 }),
    headers: { 'Content-Type': 'application/json' },
  }).catch(function() {});
  loadMaps();
}

async function refreshMap() {
  if (!mapInitialised) return;
  if (mapLoading) return;  // wait for the polygon stream to finish
  // While viewing a saved session map, don't overwrite its polyline with
  // the live recording's. The cursor still moves so the user can see
  // where they are vs the loaded geometry.
  if (viewingSavedMap != null) {
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
    const r = await authFetch('/api/track/current');
    if (r.status === 401) { setOverlay('auth required'); return; }
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
  // be weird if Start Recording left a saved session map on the canvas.
  if (viewingSavedMap != null) backToLiveSavedMap();
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
  if (mapLoading) return;
  try {
    const r = await authFetch('/api/log');
    if (r.status === 401 || r.status === 403) { showAuthNeeded('logView'); return; }
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
  const r = await authFetch('/api/gnss/send', {
    method: 'POST',
    body: JSON.stringify({ cmd: cmd }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (r.status === 401) { showAuthNeeded(); return; }
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
    const res = await authFetch('/api/ota/apply', { method: 'POST' });
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
// Maps list refresh every 3 s so a recording finished on the walker
// appears in the web list without the operator having to reload.
setInterval(loadMaps, 3000);
refresh();
refreshMap();
refreshLog();
loadMaps();
loadConfig();
loadAuthStatus();
otaLoadCurrent();
</script>
</body>
</html>
)INDEX";
