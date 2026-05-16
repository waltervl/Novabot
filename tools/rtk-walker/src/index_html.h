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
  .config { font-size: 12px; color: var(--text-dim); }
  .config input { width: 100%; padding: 8px; background: rgba(0,0,0,0.4); color: var(--text); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; margin-top: 4px; font-family: inherit; }
  .config label { display: block; margin-top: 8px; font-weight: 600; color: var(--text-dim); }
  .small { font-size: 11px; color: var(--text-dim); margin-top: 8px; }
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

  <div class="tracks">
    <h1>Saved tracks</h1>
    <div id="trackList"></div>
  </div>

  <details class="card config">
    <summary style="cursor:pointer;font-weight:600;color:var(--text)">WiFi &amp; NTRIP setup</summary>
    <form id="cfgForm">
      <label>WiFi SSID<input id="cfg_ssid" type="text"></label>
      <label>WiFi password<input id="cfg_pass" type="password"></label>
      <label>NTRIP host<input id="cfg_host" type="text" placeholder="caster.centipede.fr"></label>
      <label>NTRIP port<input id="cfg_port" type="number" placeholder="2101"></label>
      <label>NTRIP mountpoint<input id="cfg_mount" type="text" placeholder="closest base station code"></label>
      <label>NTRIP user<input id="cfg_user" type="text" placeholder="centipede"></label>
      <label>NTRIP password<input id="cfg_npass" type="text" placeholder="centipede"></label>
      <button type="submit" style="margin-top:12px">Save &amp; reboot</button>
    </form>
  </details>

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
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = (t.points != null ? t.points : 0) + ' pts · ' + (t.size != null ? t.size : 0) + ' bytes';
  left.appendChild(name);
  left.appendChild(meta);

  const link = document.createElement('a');
  link.href = '/track/' + encodeURIComponent(t.name);
  link.setAttribute('download', '');
  link.textContent = 'Download CSV';

  wrap.appendChild(left);
  wrap.appendChild(link);
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
  const body = {
    ssid: document.getElementById('cfg_ssid').value,
    pass: document.getElementById('cfg_pass').value,
    host: document.getElementById('cfg_host').value,
    port: parseInt(document.getElementById('cfg_port').value || '2101', 10),
    mount: document.getElementById('cfg_mount').value,
    user: document.getElementById('cfg_user').value,
    npass: document.getElementById('cfg_npass').value,
  };
  await fetch('/api/config', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  alert('Saved. Rebooting...');
}

document.getElementById('recBtn').addEventListener('click', toggleRecord);
document.getElementById('cfgForm').addEventListener('submit', function(e) {
  e.preventDefault();
  saveConfig();
});

setInterval(refresh, 500);
refresh();
loadTracks();
loadConfig();
</script>
</body>
</html>
)INDEX";
