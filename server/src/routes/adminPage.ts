/**
 * Admin page — self-contained HTML with login + status dashboard.
 * No build step needed — pure inline HTML/CSS/JS.
 */

export function adminPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpenNova Admin</title>
<link rel="icon" type="image/png" href="/assets/OpenNova.png">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<link rel="stylesheet" href="https://unpkg.com/xterm@5.3.0/css/xterm.css" />
<script src="https://unpkg.com/xterm@5.3.0/lib/xterm.js"></script>
<script src="https://unpkg.com/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
<style>
  @font-face {
    font-family:'Departure Mono';
    src:url('/fonts/DepartureMono-Regular.woff2') format('woff2'),
        url('/fonts/DepartureMono-Regular.woff') format('woff');
    font-weight:normal;font-style:normal;font-display:swap;
  }
  /* Roboto Mono for console/log areas. Same font honcho.dev uses on
     their dashboard. Variable weight 100-700; the .woff2 is the Latin
     subset shipped via Next.js Font Optimization on app.honcho.dev. */
  @font-face {
    font-family:'Roboto Mono';
    src:url('/fonts/RobotoMono-Variable.woff2') format('woff2');
    font-weight:100 700;font-style:normal;font-display:swap;
    unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
  }
  /* Legacy Posterama kept for any inline overrides that still reference
     it. New work should use Departure Mono. */
  @font-face {
    font-family:'Posterama 1919';
    src:url('/fonts/Posterama1919.woff2') format('woff2'),
        url('/fonts/Posterama1919.ttf') format('truetype');
    font-weight:normal;font-style:normal;font-display:swap;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  /* Departure Mono throughout, in honcho.dev style. The pixel monospace
     feel matches the OpenNova terminal aesthetic. Fallback chain ends in
     system monospace so the page stays readable if the font fails to
     load. Letter-spacing slightly relaxed since Departure Mono is wider
     than Posterama; the old 0.08em looked stretched. */
  body{font-family:'Departure Mono',ui-monospace,SFMono-Regular,Monaco,Consolas,Liberation Mono,Menlo,monospace;background:#030712;color:#e0e0e0;min-height:100vh}
  h1,h2,h3,.tab,.chip,.badge,.btn,button{font-family:'Departure Mono',ui-monospace,SFMono-Regular,monospace;letter-spacing:0.04em}
  h1{letter-spacing:0.12em;text-transform:uppercase}
  h2{letter-spacing:0.10em}
  .tab{letter-spacing:0.08em;text-transform:uppercase}
  .badge{letter-spacing:0.06em;text-transform:uppercase}
  .modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);z-index:1000;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s}
  .modal-overlay.show{opacity:1}
  .modal-box{background:#1a1a2e;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:24px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.5)}
  .modal-title{font-size:16px;font-weight:700;color:#fff;margin-bottom:8px}
  .modal-msg{font-size:13px;color:#aaa;margin-bottom:20px;line-height:1.5;word-break:break-word}
  .modal-btns{display:flex;gap:8px;justify-content:flex-end}
  .modal-btn{padding:8px 20px;border-radius:8px;border:none;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s}
  .modal-btn:hover{opacity:.85}
  .modal-btn-cancel{background:rgba(255,255,255,.08);color:#aaa}
  .modal-btn-ok{background:#7c3aed;color:#fff}
  .modal-btn-danger{background:#ef4444;color:#fff}
  .modal-btn-success{background:#22c55e;color:#fff}
  .container{max-width:1200px;margin:0 auto;padding:20px}
  h1{color:#00d4aa;font-size:24px;margin-bottom:4px}
  h2{color:#7c3aed;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
  .version{color:#666;font-size:12px;margin-bottom:24px}
  .card{background:#16213e;border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid rgba(255,255,255,.08)}
  .row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04);flex-wrap:wrap;gap:4px}
  .row:last-child{border-bottom:none}
  .label{color:#aaa;font-size:13px}
  .value{font-size:13px;font-weight:600;text-align:right;word-break:break-all}
  .on{color:#00d4aa}
  .off{color:#ef4444}
  .warn{color:#f59e0b}
  .sn{color:#a78bfa;font-family:'Roboto Mono',ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;word-break:break-all}
  .table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
  table{width:100%;border-collapse:collapse;font-size:13px;min-width:400px}
  th{text-align:left;color:#aaa;font-size:11px;text-transform:uppercase;letter-spacing:.5px;padding:8px 6px;border-bottom:1px solid rgba(255,255,255,.1);white-space:nowrap}
  td{padding:8px 6px;border-bottom:1px solid rgba(255,255,255,.04)}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
  .dot-on{background:#00d4aa}
  .dot-off{background:#ef4444}
  .pulse-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;animation:pulse 1.5s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
  .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
  .badge-admin{background:rgba(124,58,237,.2);color:#a78bfa}
  .badge-dash{background:rgba(0,212,170,.15);color:#00d4aa}
  .badge-user{background:rgba(255,255,255,.05);color:#666}
  .btn{padding:4px 12px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:600;transition:all .2s}
  .btn-sm{padding:3px 8px;font-size:11px}
  .btn-green{background:#047857;color:#fff}
  .btn-green:hover{background:#059669}
  .btn-red{background:#991b1b;color:#fff}
  .btn-red:hover{background:#b91c1c}
  .btn-purple{background:#6d28d9;color:#fff}
  .btn-purple:hover{background:#7c3aed}
  input{padding:10px 14px;background:#0d0d20;border:1px solid #333;border-radius:8px;color:#fff;font-size:14px;width:100%}
  input:focus{border-color:#7c3aed;outline:none}
  .login-box{max-width:360px;margin:80px auto;padding:0 16px}
  /* Tabs — bottom-border style, active gets accent underline */
  .tabs{display:flex;gap:0;margin-bottom:18px;border-bottom:1px solid rgba(255,255,255,.08);padding:0 4px;align-items:flex-end}
  .tab{padding:10px 18px;border-radius:6px 6px 0 0;cursor:pointer;font-size:13px;font-weight:600;background:transparent;color:#777;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .15s,border-color .15s,background .15s;position:relative}
  .tab:hover{color:#cbd5e1;background:rgba(255,255,255,.02)}
  .tab.active{background:transparent;color:#a78bfa;border-bottom:2px solid #a78bfa}
  /* Version / system info chips */
  .chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center}
  .chip{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:500;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.4;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#aaa;white-space:nowrap}
  .chip-version{background:rgba(0,212,170,.1);border-color:rgba(0,212,170,.3);color:#00d4aa}
  .chip-uptime{background:rgba(124,58,237,.08);border-color:rgba(124,58,237,.25);color:#a78bfa}
  .chip-ram{background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.25);color:#fbbf24}
  .chip-dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.7}
  .hide-mobile{}
  /* Responsive */
  @media(max-width:600px){
    .container{padding:10px}
    h1{font-size:20px}
    h2{font-size:12px}
    .card{padding:12px;border-radius:10px}
    table{font-size:12px;min-width:0}
    th,td{padding:6px 4px}
    th{font-size:9px}
    .row{flex-direction:column;align-items:flex-start;gap:2px}
    .value{text-align:left;font-size:12px}
    .sn{font-size:11px}
    .btn{font-size:11px;padding:6px 10px}
    .login-box{margin:40px auto}
    .hide-mobile{display:none!important}
    .tab{padding:8px 12px;font-size:12px}
    /* Inline form elements: drop hard min-widths so they collapse cleanly */
    select,input[type="text"],input[type="email"],input[type="password"],input[type="search"],input[type="number"]{min-width:0!important;width:100%}
    /* Cards often use inline display:flex with min-width:200/250 children — let them stack */
    .card > div[style*="display:flex"]{flex-wrap:wrap!important}
    .card > div[style*="display:flex"] > select,
    .card > div[style*="display:flex"] > input{flex:1 1 100%!important;min-width:0!important}
    /* Buttons in toolbars */
    button{font-size:12px}
    /* Avoid filenames blowing out width */
    code,pre{word-break:break-all;white-space:pre-wrap}
    /* Backup list rows: stack timestamp + actions */
    #portableBackupListContent > div > div{flex-direction:column;align-items:stretch!important;gap:6px}
    /* Modal full-width on small screens */
    .modal-box{max-width:100%;padding:18px;border-radius:12px}
    /* Tabs: horizontal scroll instead of cramped wrap */
    .tabs{overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch}
    .tab{flex:0 0 auto;white-space:nowrap}
    /* Map canvas: avoid forcing 800px min */
    #mapCanvas{height:auto!important}
    /* Polygon offset overlay: don't pin to fixed 240px on phone */
    #polygonCalPanel{width:calc(100% - 24px)!important;left:12px!important;right:12px!important;max-width:280px}
    /* Generic toolbar with labels + button: reduce gap */
    details > div[style*="display:flex"]{gap:6px!important}
    /* Long sync_map / dashboard URLs */
    .value,.sn{word-break:break-all}
  }
  @media(max-width:380px){
    h1{font-size:18px}
    .container{padding:8px}
    .card{padding:10px}
    .tab{padding:5px 10px;font-size:11px}
    button{font-size:11px;padding:5px 10px}
  }
  #app{display:none}
  .dev-row{display:grid;grid-template-columns:90px 180px 150px 90px 140px 80px minmax(180px,1fr);align-items:center;gap:8px;padding:10px 6px;border-bottom:1px solid rgba(255,255,255,.04);font-size:12px}
  .dev-row > *:last-child{justify-self:end;display:flex;align-items:center;gap:6px}
  @media(max-width:800px){.dev-row{grid-template-columns:80px 1fr;gap:4px}}
  .lora-chip{font-size:10px;color:#a78bfa;background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.2);padding:2px 6px;border-radius:4px;white-space:nowrap}
  .lora-missing{font-size:10px;color:#666;background:rgba(255,255,255,.04);border:1px dashed rgba(255,255,255,.1);padding:2px 6px;border-radius:4px;cursor:pointer}
  .lora-missing:hover{color:#a78bfa;border-color:rgba(124,58,237,.3)}
  .refresh-btn{float:right;cursor:pointer;color:#666;font-size:12px}
  .refresh-btn:hover{color:#00d4aa}
  .menu-item{padding:8px 12px;font-size:12px;color:#ccc;cursor:pointer;border-radius:6px;white-space:nowrap}
  .menu-item:hover{background:rgba(255,255,255,.08)}
  .ota-progress-bar{width:100%;height:8px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden}
  .ota-progress-fill{height:100%;background:#00d4aa;border-radius:4px;transition:width .5s ease}
  .cal-arrow {
    background: #374151; border: 0; border-radius: 6px; color: #fff;
    padding: 8px 0; cursor: pointer; font-size: 14px; line-height: 1;
  }
  .cal-arrow:hover { background: #4b5563; }
</style>
</head>
<body>

<!-- Login (hidden when first-time setup is shown) -->
<div id="login" class="login-box" style="display:none">
  <div class="card" style="text-align:center;padding:32px">
    <h1 style="margin-bottom:16px">OpenNova Admin</h1>
    <p style="color:#666;font-size:13px;margin-bottom:24px">Login with your OpenNova account</p>
    <form onsubmit="event.preventDefault(); doLogin();">
      <input id="email" type="email" placeholder="Email" style="margin-bottom:10px"><br>
      <input id="pass" type="password" placeholder="Password" style="margin-bottom:16px"><br>
      <button type="submit" class="btn btn-purple" style="width:100%;padding:12px">Login</button>
    </form>
    <p id="loginErr" style="color:#ef4444;font-size:12px;margin-top:10px"></p>
  </div>
</div>

<!-- First-time setup (shown instead of login when DB is empty) -->
<div id="firstTimeSetup" class="login-box" style="display:none">
  <div class="card" style="padding:20px 24px;max-width:420px;margin:0 auto">
    <div style="text-align:center;margin-bottom:12px">
      <img src="/assets/OpenNova.png" alt="OpenNova" style="width:200px;margin:0">
      <p style="font-size:13px;color:#888;margin:2px 0 0 0">Your local cloud replacement for Novabot</p>
    </div>

    <div style="background:rgba(0,212,170,.06);border:1px solid rgba(0,212,170,.15);border-radius:8px;padding:14px;margin-bottom:20px">
      <p style="font-size:12px;color:#aaa;margin:0 0 8px 0;font-weight:600;color:#00d4aa">First-time setup</p>
      <p style="font-size:12px;color:#999;margin:0;line-height:1.5">Sign in with your <b style="color:#ccc">Novabot app</b> account. This will:</p>
      <ul style="font-size:12px;color:#999;margin:8px 0 0 0;padding-left:18px;line-height:1.8">
        <li>Create your local admin account</li>
        <li>Import your devices (charger + mower)</li>
        <li>Download your maps from the cloud</li>
        <li>Auto-pair devices that are already online</li>
      </ul>
    </div>

    <input type="email" id="cloud_email_setup" placeholder="Novabot app email" style="margin-bottom:8px">
    <input type="password" id="cloud_pass_setup" placeholder="Novabot app password" style="margin-bottom:14px">
    <button class="btn btn-green" style="width:100%;padding:12px;font-size:14px" onclick="firstTimeCloudImport()" id="setupBtn">Connect &amp; Import from Cloud</button>
    <div id="setupResult" style="margin-top:12px"></div>

    <div style="text-align:center;color:#333;margin:18px 0;font-size:11px">&#8212; or &#8212;</div>
    <button class="btn" style="width:100%;padding:10px;background:#252535;color:#777;font-size:12px" onclick="skipSetup()">Skip cloud import &#8212; create local account only</button>
    <p style="font-size:10px;color:#444;margin-top:6px;text-align:center">You can always import from cloud later in Settings</p>
  </div>
</div>

<!-- Admin Panel -->
<div id="app" class="container" style="display:none">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:8px">
    <div style="min-width:0">
      <div style="display:flex;align-items:center;gap:12px">
        <img src="/assets/OpenNova.png" alt="OpenNova" style="height:40px;width:auto;flex-shrink:0">
        <h1 style="font-family:'Posterama 1919',sans-serif;letter-spacing:0.18em;text-transform:uppercase;font-weight:normal;color:#cbd5e1;font-size:22px;margin:0;white-space:nowrap">Admin</h1>
      </div>
      <div class="chips" id="serverInfo"><span class="chip">Loading...</span></div>
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn" style="background:#333" onclick="logout()">Logout</button>
      <button class="btn btn-purple" onclick="loadAll()">↻</button>
    </div>
  </div>

  <!-- Server update banner (mirrors the in-app updater). Hidden until
       /api/admin-status/check-server-update reports a newer Hub tag. -->
  <div id="serverUpdateBanner" style="display:none;margin-bottom:16px;padding:12px 16px;background:linear-gradient(90deg,rgba(124,58,237,.15),rgba(124,58,237,.05));border:1px solid rgba(124,58,237,.4);border-radius:10px">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div style="display:flex;gap:10px;align-items:center;flex:1;min-width:0">
        <span style="font-size:18px">⬆</span>
        <div style="min-width:0">
          <div style="font-weight:600;color:#a78bfa">Server update available</div>
          <div id="serverUpdateText" style="font-size:12px;color:#cbd5e1;margin-top:2px"></div>
        </div>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="dismissServerUpdate()" style="background:rgba(255,255,255,.06);color:#cbd5e1;border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer">Dismiss</button>
        <button onclick="showServerUpdateHint()" style="background:rgba(124,58,237,.4);color:#fff;border:0;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer">How to update</button>
      </div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="tabs">
    <button class="tab active" onclick="switchTab('devices')">Devices</button>
    <button class="tab" onclick="switchTab('console')">Console</button>
    <button class="tab" onclick="switchTab('mowerdebug')">Mower Debug</button>
    <button class="tab" onclick="switchTab('maps')">Maps</button>
    <button class="tab" onclick="switchTab('firmware')">Firmware</button>
    <button class="tab" onclick="switchTab('settings')">Settings</button>
  </div>

  <!-- Tab: Devices -->
  <div id="tab_devices">
    <div class="card">
      <h2>My Devices <span class="refresh-btn" onclick="loadMyDevices()">↻</span> <span id="deviceActivity" style="display:none;font-size:12px;font-weight:400;color:#f59e0b;margin-left:8px"><span class="pulse-dot"></span> <span id="deviceActivityText">discovering...</span></span></h2>
      <div id="myDevices">Loading...</div>
    </div>
  </div>

  <!-- Tab: Console -->
  <div id="tab_console" style="display:none">
    <div class="card" style="padding:0;overflow:hidden">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.06);flex-wrap:wrap;gap:6px">
        <h2 style="margin:0">Server Console</h2>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <div style="display:flex;gap:8px;align-items:center;background:rgba(255,255,255,.04);border-radius:6px;padding:4px 10px">
            <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:3px"><input type="checkbox" id="f_mower" checked onchange="applyFilter()"><span style="color:#22c55e">Mower</span></label>
            <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:3px"><input type="checkbox" id="f_charger" checked onchange="applyFilter()"><span style="color:#eab308">Charger</span></label>
            <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:3px"><input type="checkbox" id="f_app" checked onchange="applyFilter()"><span style="color:#3b82f6">App</span></label>
            <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:3px"><input type="checkbox" id="f_http" checked onchange="applyFilter()"><span style="color:#c084fc">HTTP</span></label>
            <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:3px"><input type="checkbox" id="f_system" checked onchange="applyFilter()"><span style="color:#aaa">System</span></label>
          </div>
          <div style="display:flex;gap:4px;align-items:center">
            <button onclick="mqttLogs=[];renderLogs()" style="background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.2);border-radius:6px;padding:4px 12px;font-size:11px;cursor:pointer">Clear</button>
            <button onclick="copyConsole()" style="background:rgba(59,130,246,.15);color:#60a5fa;border:1px solid rgba(59,130,246,.2);border-radius:6px;padding:4px 12px;font-size:11px;cursor:pointer">Copy</button>
          </div>
          <label style="font-size:11px;color:#aaa;cursor:pointer;display:flex;align-items:center;gap:3px"><input type="checkbox" id="f_autoscroll" checked>Auto-scroll</label>
        </div>
      </div>
      <div style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,.06)">
        <input id="f_search" type="text" placeholder="Search (e.g. start_run, error, LFIN...)" oninput="renderLogs()" style="width:100%;padding:6px 10px;font-size:12px;background:#0d0d20;border:1px solid #333;border-radius:6px;color:#fff">
      </div>
      <div id="mqttConsole" style="height:calc(100vh - 320px);min-height:300px;overflow-y:auto;font-family:'Roboto Mono',ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;padding:8px;background:#0a0a1a;line-height:1.6;word-break:break-all"></div>
    </div>
  </div>

  <!-- Tab: Mower Debug -->
  <div id="tab_mowerdebug" style="display:none">
    <div class="card">
      <h2>Mower Debug (via extended_commands)</h2>
      <p style="font-size:12px;color:#aaa;margin-bottom:12px">
        Haal live logs + diagnostiek op van de mower zonder SSH. Vereist custom firmware ≥ v6.0.2-custom-24 (met get_ros_log + stat_path_files handlers).
      </p>

      <!-- Device picker + quick actions -->
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
        <select id="mdMowerSelect" style="flex:1;min-width:180px;padding:8px 12px;background:#0d0d20;border:1px solid #333;border-radius:8px;color:#fff;font-size:13px">
          <option value="">Select a mower...</option>
        </select>
        <button onclick="mdQuickAction('list_ros_logs')" style="padding:8px 12px;background:rgba(124,58,237,.2);color:#a78bfa;border:1px solid rgba(124,58,237,.3);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">List log sources</button>
        <button onclick="mdQuickAction('stat_path_files')" style="padding:8px 12px;background:rgba(245,158,11,.2);color:#fbbf24;border:1px solid rgba(245,158,11,.3);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Path files info</button>
        <button onclick="mdQuickAction('get_system_info')" style="padding:8px 12px;background:rgba(34,197,94,.2);color:#4ade80;border:1px solid rgba(34,197,94,.3);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">System info</button>
      </div>

      <!-- Log fetch form -->
      <div style="background:#0a0a1a;border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:12px;margin-bottom:12px">
        <h3 style="margin:0 0 10px;font-size:13px;color:#ddd">Fetch log lines</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:10px">
          <div>
            <label style="display:block;font-size:11px;color:#888;margin-bottom:3px">Source</label>
            <select id="mdLogSource" style="width:100%;padding:6px 10px;background:#0d0d20;border:1px solid #333;border-radius:6px;color:#fff;font-size:12px">
              <option value="mqtt_error">mqtt_error (stderr/crash)</option>
              <option value="mqtt">mqtt (info)</option>
              <option value="robot_decision">robot_decision</option>
              <option value="chassis_control">chassis_control</option>
              <option value="coverage_planner">coverage_planner</option>
              <option value="nav2">nav2</option>
              <option value="timer_record">timer_record</option>
              <option value="novabot_mapping">novabot_mapping</option>
              <option value="localization">localization</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:11px;color:#888;margin-bottom:3px">Lines (max 2000)</label>
            <input id="mdLogLines" type="number" value="200" min="10" max="2000" style="width:100%;padding:6px 10px;background:#0d0d20;border:1px solid #333;border-radius:6px;color:#fff;font-size:12px">
          </div>
          <div>
            <label style="display:block;font-size:11px;color:#888;margin-bottom:3px">Level</label>
            <select id="mdLogLevel" style="width:100%;padding:6px 10px;background:#0d0d20;border:1px solid #333;border-radius:6px;color:#fff;font-size:12px">
              <option value="">any</option>
              <option value="INFO">INFO</option>
              <option value="WARN">WARN</option>
              <option value="ERROR">ERROR</option>
              <option value="DEBUG">DEBUG</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:11px;color:#888;margin-bottom:3px">Grep substring</label>
            <input id="mdLogGrep" type="text" placeholder="e.g. preview_cover" style="width:100%;padding:6px 10px;background:#0d0d20;border:1px solid #333;border-radius:6px;color:#fff;font-size:12px">
          </div>
        </div>
        <button onclick="mdFetchLog()" style="padding:8px 18px;background:rgba(34,197,94,.2);color:#4ade80;border:1px solid rgba(34,197,94,.3);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Fetch</button>
        <span id="mdStatus" style="margin-left:10px;font-size:11px;color:#888"></span>
      </div>

      <!-- Client-side additional filter + output -->
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
        <input id="mdOutputFilter" type="text" placeholder="Client-side filter (live)" oninput="mdRenderOutput()" style="flex:1;min-width:200px;padding:6px 10px;background:#0d0d20;border:1px solid #333;border-radius:6px;color:#fff;font-size:12px">
        <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:3px;color:#ccc"><input type="checkbox" id="mdOnlyErrors" onchange="mdRenderOutput()"> Errors only</label>
        <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:3px;color:#ccc"><input type="checkbox" id="mdOnlyWarns" onchange="mdRenderOutput()"> Warns</label>
        <button onclick="mdCopyOutput()" style="padding:6px 12px;background:rgba(59,130,246,.15);color:#60a5fa;border:1px solid rgba(59,130,246,.2);border-radius:6px;font-size:11px;cursor:pointer">Copy visible</button>
        <button onclick="mdOutputLines=[];mdRenderOutput()" style="padding:6px 12px;background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.2);border-radius:6px;font-size:11px;cursor:pointer">Clear</button>
      </div>
      <div id="mdOutput" style="height:calc(100vh - 460px);min-height:260px;overflow-y:auto;font-family:'Roboto Mono',ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;padding:10px;background:#0a0a1a;border:1px solid rgba(255,255,255,.06);border-radius:8px;line-height:1.55;word-break:break-all;color:#ccc"></div>
    </div>
  </div>

  <!-- Tab: Maps -->
  <div id="tab_maps" style="display:none">
    <div class="card">
      <h2>Map Viewer <span class="refresh-btn" onclick="loadMaps()">↻</span></h2>
      <!-- Above the map: only the mower picker + the polygon-offset entry,
           since polygon offset is the one calibration that overlays the
           canvas itself (live preview while nudging). Everything else
           (Portable Map Bundle, legacy Map Recovery, Debug) lives
           below the map so the canvas is the visual focal point. -->
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
        <select id="mapMowerSelect" onchange="loadMaps();loadMapBackups(this.value);startLocalizationPoll(this.value);portableCheckActive(this.value);loadPortableBackups()" style="flex:1;min-width:200px;padding:8px 12px;background:#0d0d20;border:1px solid #333;border-radius:8px;color:#fff;font-size:13px">
          <option value="">Select a mower...</option>
        </select>
        <button id="calibratePolygonBtn" onclick="enterPolygonCalibration()" title="Nudge the entire polygon by integer-cm offsets and sync to mower" style="padding:8px 16px;background:rgba(59,130,246,.2);color:#93c5fd;border:1px solid rgba(59,130,246,.5);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">Calibrate Polygon Offset</button>
      </div>
      <div id="mapInfo" style="font-size:12px;color:#aaa;margin-bottom:8px"></div>
      <div style="background:#0a0a1a;border:1px solid rgba(255,255,255,.06);border-radius:8px;overflow:hidden;position:relative">
        <canvas id="mapCanvas" width="800" height="600" style="width:100%;display:block;background:#0a0a1a"></canvas>
        <div id="polygonCalPanel" style="display:none;position:absolute;top:12px;left:12px;z-index:1000;background:rgba(15,15,30,0.95);backdrop-filter:blur(6px);border:1px solid #444;border-radius:10px;padding:14px;width:240px;box-shadow:0 6px 30px rgba(0,0,0,0.45)">
          <div id="polygonCalHeader" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;cursor:move;user-select:none" title="Drag to move">
            <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#fbbf24;font-weight:600">&#x2725; Polygon Offset</span>
            <span style="cursor:pointer;color:#888;padding:0 4px" onclick="cancelPolygonCalibration()" title="Cancel">&times;</span>
          </div>
          <div style="margin-bottom:10px;padding:6px 8px;background:rgba(15,23,42,.6);border:1px solid #1e293b;border-radius:6px;font-size:10px;color:#cbd5e1;line-height:1.5">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
              <span style="display:inline-block;width:16px;height:8px;background:rgba(255,255,255,.06);border:1.5px dashed rgba(255,255,255,.9);flex-shrink:0"></span>
              <span><b style="color:#e5e7eb">ORIGINAL</b> — current on mower</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="display:inline-block;width:16px;height:8px;background:rgba(34,197,94,.2);border:1.5px solid #166534;flex-shrink:0"></span>
              <span><b style="color:#86efac">PREVIEW</b> — after Apply</span>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:36px 36px 36px;gap:4px;justify-content:center;margin-bottom:10px">
            <span></span>
            <button class="cal-arrow" onclick="nudgePolygonOffset(0, 0.01, event)" title="North (Shift = 10 cm)">&uarr;</button>
            <span></span>
            <button class="cal-arrow" onclick="nudgePolygonOffset(-0.01, 0, event)" title="West (Shift = 10 cm)">&larr;</button>
            <div id="polygonCalDisplay" style="background:#0d0d20;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:9px;font-family:'Roboto Mono',ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:#9ca3af;padding:2px">+0.00, +0.00 m</div>
            <button class="cal-arrow" onclick="nudgePolygonOffset(0.01, 0, event)" title="East (Shift = 10 cm)">&rarr;</button>
            <span></span>
            <button class="cal-arrow" onclick="nudgePolygonOffset(0, -0.01, event)" title="South (Shift = 10 cm)">&darr;</button>
            <span></span>
          </div>
          <div style="font-size:10px;color:#666;text-align:center;margin-bottom:10px">Shift+klik = 10 cm</div>
          <div style="display:flex;gap:6px">
            <button onclick="resetPolygonOffsetUI()" style="flex:1;padding:6px;background:#374151;border:0;border-radius:6px;color:#fff;cursor:pointer">Reset</button>
            <button onclick="cancelPolygonCalibration()" style="flex:1;padding:6px;background:#374151;border:0;border-radius:6px;color:#fff;cursor:pointer">Cancel</button>
            <button id="polygonCalApplyBtn" onclick="applyPolygonOffset()" style="flex:1.2;padding:6px;background:#10b981;border:0;border-radius:6px;color:#fff;cursor:pointer;font-weight:600">Apply</button>
          </div>
          <a href="javascript:void(0)" onclick="document.getElementById('infoPolygonOffset').style.display=document.getElementById('infoPolygonOffset').style.display==='block'?'none':'block'" style="font-size:10px;color:#94a3b8;text-decoration:underline;cursor:pointer;display:inline-block;margin-top:6px">What does Apply do?</a>
          <div id="infoPolygonOffset" style="display:none;margin-top:6px;padding:8px 10px;background:rgba(15,23,42,.6);border:1px solid #1e293b;border-radius:6px;font-size:10px;color:#cbd5e1;line-height:1.55">
            <div><b>Persists the offset in DB and triggers a full sync_map.</b></div>
            <div style="margin-top:4px">Same files as Restore + Realign — wipes mower's <code>csv_file/</code> + <code>x3_csv_file/</code>, reloads polygon CSVs with shifted coords, regenerates <code>_latest.zip</code>, restarts <code>novabot_mapping</code> + <code>coverage_planner_server</code>.</div>
            <div style="margin-top:4px"><b style="color:#86efac">charging_pose theta</b> uses the saved DB value, not live IMU drift.</div>
            <div style="margin-top:4px"><b style="color:#fca5a5">Cannot un-do</b> on the mower without another Apply (or Reset to 0,0 + Apply).</div>
          </div>
          <div id="polygonCalStatus" style="margin-top:8px;font-size:11px;color:#9ca3af;min-height:14px"></div>
        </div>
      </div>
      <div id="mapLegend" style="display:none;margin-top:10px;display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#aaa">
        <span><span style="display:inline-block;width:12px;height:12px;background:rgba(34,197,94,.3);border:2px solid #166534;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Work area</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:rgba(239,68,68,.3);border:2px solid #991b1b;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Obstacle</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:transparent;border:2px solid #3b82f6;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Channel</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:#f59e0b;border-radius:50%;vertical-align:middle;margin-right:4px"></span>Charger</span>
        <span><span style="display:inline-block;width:14px;height:2px;background:#22d3ee;vertical-align:middle;margin-right:4px"></span>Mower trail</span>
        <span><span style="display:inline-block;width:14px;height:2px;background:#84cc16;vertical-align:middle;margin-right:4px"></span>RTK GPS trail</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#22d3ee;border:2px solid #0e7490;border-radius:50%;vertical-align:middle;margin-right:4px"></span>Live mower</span>
      </div>
      <div id="mapList" style="margin-top:12px"></div>

      <div style="padding:10px 12px;background:rgba(34,211,238,.05);border:1px solid rgba(34,211,238,.18);border-radius:8px;margin-top:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:12px;font-weight:600;color:#67e8f9">Portable Map Bundle <span style="background:rgba(16,185,129,.15);color:#86efac;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:6px">RECOMMENDED</span></div>
        </div>
        <div style="font-size:11px;color:#94a3b8;line-height:1.6;margin-bottom:8px">
          Export the polygons + a complete rasterized map (map.pgm/png/yaml + per-map) as a portable .novabotmap bundle. Single restore path: "Restore to mower" pushes the bundle verbatim (no rotation, pos.json untouched), then you dock-cycle the mower (1m back + ArUco redock) so the dock heading + charger pos refresh and the charger-relative map lines up. Auto-snapshots every successful save_map (last 20 retained per mower).
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
          <button onclick="exportPortableBundle()" style="padding:7px 18px;background:rgba(34,211,238,.2);color:#67e8f9;border:1px solid rgba(34,211,238,.5);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Export bundle</button>
          <input id="portableImportFile" type="file" accept=".novabotmap,.novabundle,.zip" style="display:none" onchange="startPortableImport()">
          <button onclick="document.getElementById('portableImportFile').click()" title="Accepts .novabotmap (mower export) and .novabundle (RTK walker export). Walker bundles are auto-rotated against the mower's live dock pose + rasterized server-side." style="padding:7px 18px;background:rgba(99,102,241,.2);color:#a5b4fc;border:1px solid rgba(99,102,241,.5);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Import bundle...</button>
          <button onclick="manualPortableBackup()" style="padding:7px 18px;background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.3);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Snapshot now</button>
          <button onclick="rebuildBundleFromDb()" title="Generate a self-contained bundle (rasterized map.pgm/png/yaml + per-map + csvs) from the stored polygons alone — no mower needed. Uses the faithful firmware occupancy-grid generator." style="padding:7px 18px;background:rgba(16,185,129,.15);color:#6ee7b7;border:1px solid rgba(16,185,129,.3);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Rebuild bundle (DB)</button>
          <input id="csvZipFile" type="file" accept=".zip" style="display:none" onchange="importCsvZip()">
          <button onclick="document.getElementById('csvZipFile').click()" title="Upload a .zip of a csv_file/ folder (mapN_work.csv, *_obstacle.csv, *_unicom.csv, map_info.json). Rasterizes + saves a restorable bundle." style="padding:7px 18px;background:rgba(16,185,129,.12);color:#6ee7b7;border:1px solid rgba(16,185,129,.28);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Import CSV zip...</button>
          <button onclick="loadPortableBackups()" style="padding:7px 12px;background:rgba(124,58,237,.15);color:#a78bfa;border:1px solid rgba(124,58,237,.3);border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">&#x21BB; Refresh</button>
        </div>
        <div id="portableImportPanel" style="display:none;margin-top:10px"></div>
        <div id="portableBackupList" style="margin-top:10px;display:none">
          <div style="font-size:11px;font-weight:600;color:#cbd5e1;margin-bottom:6px">Auto-saved snapshots</div>
          <div id="portableBackupListContent" style="font-size:11px;color:#aaa"></div>
        </div>
      </div>

    </div>

    <div class="card">
      <h2>Walker Maps <span class="refresh-btn" onclick="loadWalkerBundles()">&#x21BB;</span></h2>
      <div style="font-size:12px;color:#94a3b8;margin-bottom:10px;line-height:1.55">
        Library of <code>.novabundle</code> files uploaded by the RTK walker. Each row is one survey session. Pick "Assign to mower..." to run the apply-verbatim pipeline against that mower's live charging pose. Uploads are SN-agnostic, so you can walk once and decide which mower gets the map later.
      </div>
      <div id="walkerBundleList" style="font-size:12px;color:#cbd5e1">Loading...</div>
    </div>
  </div>

  <!-- Tab: Firmware -->
  <div id="tab_firmware" style="display:none">
    <div class="card">
      <div style="margin-bottom:16px;padding:12px;background:rgba(0,212,170,.04);border:1px solid rgba(0,212,170,.1);border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <span style="font-weight:600;color:#00d4aa">Firmware Updates</span>
            <span id="fwUpdateStatus" style="margin-left:8px;font-size:12px;color:#aaa"></span>
          </div>
          <button onclick="checkFirmwareUpdates()" id="fwCheckBtn" class="btn" style="padding:6px 14px;font-size:12px">Check for Updates</button>
        </div>
        <div id="fwUpdatesAvailable" style="margin-top:8px;display:none"></div>
      </div>
      <h2>Available Firmware <span class="refresh-btn" onclick="syncAndLoadFirmware()">&#x21BB;</span></h2>
      <div class="table-wrap">
        <table id="fwTable">
          <thead><tr><th>Version</th><th>Device</th><th>MD5</th><th>Notes</th><th></th></tr></thead>
          <tbody id="fwTableBody"><tr><td colspan="5" style="color:#aaa">Loading...</td></tr></tbody>
        </table>
      </div>

      <details id="walkerFwDetails" style="padding:8px 12px;background:rgba(0,212,170,.04);border:1px solid rgba(0,212,170,.15);border-radius:8px;margin-top:16px">
        <summary style="font-size:12px;font-weight:600;color:#5eead4;cursor:pointer;list-style:none">Walker firmware</summary>
        <div style="font-size:10px;color:#94a3b8;margin:6px 0">RTK boundary walker (ESP32-S3) OTA binaries. The walker polls /api/walker-firmware/latest and downloads via the admin token stored in NVS. Use Refresh from manifest to pull a freshly published .bin from downloads.ramonvanbruggen.nl, or scp the .bin into the firmware directory and reload this list.</div>
        <div id="walker-fw-list" style="margin-bottom:8px"><span style="color:#888;font-size:11px">Not loaded. Click Refresh to fetch the manifest.</span></div>
        <button onclick="checkWalkerFirmware()" class="btn" style="padding:6px 14px;font-size:12px">Refresh from manifest</button>
      </details>
    </div>

    <div class="card">
      <h2>Update Device</h2>
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <select id="otaDeviceSelect" onchange="onOtaDeviceChange()" style="flex:1;min-width:180px;padding:8px 12px;background:#0d0d20;border:1px solid #333;border-radius:8px;color:#fff;font-size:13px">
          <option value="">Select device...</option>
        </select>
        <select id="otaVersionSelect" style="flex:1;min-width:180px;padding:8px 12px;background:#0d0d20;border:1px solid #333;border-radius:8px;color:#fff;font-size:13px">
          <option value="">Select version...</option>
        </select>
      </div>
      <div id="otaCurrentVersion" style="font-size:12px;color:#aaa;margin-bottom:12px"></div>
      <button class="btn btn-purple" onclick="startOtaUpdate()" style="padding:8px 20px">Start Update</button>

      <div id="otaProgress" style="display:none;margin-top:16px;padding:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span id="otaStatusText" style="font-size:13px;font-weight:600;color:#aaa">Waiting...</span>
          <span id="otaPctText" style="font-size:13px;font-weight:600;color:#00d4aa">0%</span>
        </div>
        <div class="ota-progress-bar"><div class="ota-progress-fill" id="otaProgressFill" style="width:0%"></div></div>
      </div>
    </div>
  </div>

  <!-- Tab: Settings -->
  <div id="tab_settings" style="display:none">
    <div class="card">
      <h2>Account</h2>
      <div id="account">Loading...</div>
    </div>

    <div class="card" style="border:1px solid rgba(34,197,94,.25);background:rgba(34,197,94,.03)">
      <h2 style="color:#86efac">Resources &amp; Help</h2>
      <p style="font-size:12px;color:#aaa;margin-bottom:12px">Documentation, source code, and community channels. Bookmark these — there is no LFI cloud support left, so the wiki + GitHub issues are how problems get solved.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px">
        <a href="https://wiki.ramonvanbruggen.nl/" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25);border-radius:8px;text-decoration:none;color:#dcfce7">
          <span style="font-size:20px">📚</span>
          <div>
            <div style="font-weight:600;font-size:13px">User Guide &amp; Wiki</div>
            <div style="font-size:11px;color:#86efac;opacity:.8">wiki.ramonvanbruggen.nl</div>
          </div>
        </a>
        <a href="https://github.com/rvbcrs/Novabot" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.25);border-radius:8px;text-decoration:none;color:#e0e7ff">
          <span style="font-size:20px">⌨</span>
          <div>
            <div style="font-weight:600;font-size:13px">Source Code</div>
            <div style="font-size:11px;color:#a5b4fc;opacity:.8">github.com/rvbcrs/Novabot</div>
          </div>
        </a>
        <a href="https://github.com/rvbcrs/Novabot/issues" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:8px;text-decoration:none;color:#fecaca">
          <span style="font-size:20px">🐛</span>
          <div>
            <div style="font-weight:600;font-size:13px">Report a Bug / Issue</div>
            <div style="font-size:11px;color:#fca5a5;opacity:.8">github.com/rvbcrs/Novabot/issues</div>
          </div>
        </a>
        <a href="https://hub.docker.com/r/rvbcrs/opennova" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(14,165,233,.08);border:1px solid rgba(14,165,233,.25);border-radius:8px;text-decoration:none;color:#bae6fd">
          <span style="font-size:20px">🐳</span>
          <div>
            <div style="font-weight:600;font-size:13px">Docker Image</div>
            <div style="font-size:11px;color:#7dd3fc;opacity:.8">hub.docker.com/r/rvbcrs/opennova</div>
          </div>
        </a>
        <a href="https://github.com/rvbcrs/Novabot/releases" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:8px;text-decoration:none;color:#fde68a">
          <span style="font-size:20px">📦</span>
          <div>
            <div style="font-weight:600;font-size:13px">Releases &amp; Changelog</div>
            <div style="font-size:11px;color:#fbbf24;opacity:.8">github.com/rvbcrs/Novabot/releases</div>
          </div>
        </a>
        <a href="https://github.com/rvbcrs/Novabot/discussions" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.25);border-radius:8px;text-decoration:none;color:#e9d5ff">
          <span style="font-size:20px">💬</span>
          <div>
            <div style="font-weight:600;font-size:13px">Discussions &amp; Q&amp;A</div>
            <div style="font-size:11px;color:#d8b4fe;opacity:.8">github.com/rvbcrs/Novabot/discussions</div>
          </div>
        </a>
      </div>
      <div style="margin-top:14px;padding:10px 12px;background:rgba(255,255,255,.03);border-radius:6px;font-size:11px;color:#888">
        Server release: <span id="resVersionPill" style="color:#86efac;font-weight:600">loading…</span>
        — see the wiki <a href="https://wiki.ramonvanbruggen.nl/" target="_blank" rel="noopener" style="color:#86efac">User Guide</a> section for non-technical instructions (pairing your mower, scheduling, troubleshooting common errors).
      </div>
    </div>

    <div class="card">
      <h2>Network &amp; DNS</h2>
      <p style="font-size:12px;color:#aaa;margin-bottom:12px">Check that DNS is configured correctly so the Novabot app and mower connect to this server instead of the cloud.</p>
      <div id="dnsResults" style="margin-bottom:12px;font-size:12px">
        <div style="color:#aaa">Checking DNS...</div>
      </div>
      <div style="margin-bottom:12px;padding:8px 12px;background:rgba(255,255,255,.03);border-radius:6px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="color:#ddd;font-weight:600;font-size:12px">Built-in DNS Server (dnsmasq)</div>
          <div style="color:#aaa;font-size:11px">Redirects *.lfibot.com to this server. Point your router DNS here to use.</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span id="dnsmasqStatus" style="font-size:11px;color:#aaa">...</span>
          <button id="dnsmasqBtn" onclick="toggleDnsmasq()" class="btn" style="font-size:11px;padding:4px 12px;min-width:60px">...</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-purple" onclick="checkDns()">Re-check DNS</button>
      </div>
    </div>

    <div class="card">
      <h2>System Tools</h2>
      <!-- System tools — soft-restart system services without restarting the whole container -->
      <div style="margin-bottom:16px;padding:12px;background:rgba(245,158,11,.05);border:1px solid rgba(245,158,11,.2);border-radius:8px">
        <h3 style="margin:0 0 8px 0;font-size:13px;color:#fbbf24">mDNS Advertiser</h3>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div style="font-size:11px;color:#aaa;flex:1;min-width:240px">
            Soft-restart the mDNS advertiser if the dashboard's auto-discovery name (<code>opennova.local</code>) becomes unreachable. Does not restart the docker container.
          </div>
          <button onclick="restartMdns()" style="padding:8px 16px;background:rgba(245,158,11,.15);color:#fde68a;border:1px solid rgba(245,158,11,.4);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">Restart mDNS</button>
        </div>
        <div id="mdnsStatus" style="font-size:11px;margin-top:8px;display:none;padding:6px 8px;border-radius:6px"></div>
      </div>
    </div>

    <div class="card">
      <h2>Certificate Setup</h2>
      <p style="font-size:12px;color:#aaa;margin-bottom:12px">
        The official Novabot app requires HTTPS with a trusted certificate. Install the OpenNova CA certificate on your phone to trust the server.
      </p>
      <div style="background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.2);border-radius:8px;padding:12px;margin-bottom:12px">
        <p style="font-size:13px;color:#c4b5fd;margin:0 0 8px 0;font-weight:600">How to install:</p>
        <ol style="font-size:12px;color:#a0a0a0;margin:0;padding-left:20px;line-height:1.8">
          <li>Tap the download button below on your iPhone/iPad</li>
          <li>Go to <b style="color:#e0e0e0">Settings → General → VPN & Device Management</b></li>
          <li>Tap the <b style="color:#e0e0e0">OpenNova</b> profile → <b style="color:#e0e0e0">Install</b></li>
          <li>Go to <b style="color:#e0e0e0">Settings → General → About → Certificate Trust Settings</b></li>
          <li>Enable <b style="color:#e0e0e0">OpenNova CA Certificate</b></li>
        </ol>
      </div>
      <a href="/api/setup/profile" class="btn btn-purple" style="display:block;text-align:center;text-decoration:none;margin-bottom:8px">Download iOS Profile (.mobileconfig)</a>
      <a href="/api/setup/cert" class="btn btn-purple" style="display:block;text-align:center;text-decoration:none;background:rgba(34,197,94,.15);border-color:rgba(34,197,94,.3)">Download Android Certificate (.crt)</a>
      <p style="font-size:11px;color:#666;margin-top:8px;text-align:center">
        Android: Settings → Security → Install certificate → CA certificate
      </p>
    </div>

    <div class="card">
      <h2>Cloud Import</h2>
      <p style="font-size:12px;color:#aaa;margin-bottom:12px">Import devices from the Novabot cloud using your Novabot app credentials.</p>
      <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <input type="email" id="cloud_email" placeholder="Novabot email" style="flex:1;min-width:200px">
        <input type="password" id="cloud_pass" placeholder="Novabot password" style="flex:1;min-width:200px">
      </div>
      <button class="btn btn-purple" onclick="cloudImport()" id="cloudBtn">Connect &amp; Import</button>
      <div id="cloudResult" style="margin-top:8px"></div>
    </div>

    <div class="card" style="border:1px solid rgba(59,130,246,.3);background:rgba(59,130,246,.04)">
      <h2 style="color:#3b82f6">Remote Debug — Send Logs</h2>
      <p style="font-size:12px;color:#aaa;margin-bottom:12px">Share your MQTT logs in real-time with someone who can help you troubleshoot. Enter their relay URL and enable sharing.</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="text" id="relayUrl" value="https://opennova.ramonvanbruggen.nl/api/dashboard/remote-debug/receive" placeholder="https://their-server/api/dashboard/remote-debug/receive" style="flex:1;min-width:250px">
        <button class="btn btn-purple" id="relayToggle" onclick="toggleRelay()">Start Sharing</button>
      </div>
      <div id="relayStatus" style="margin-top:8px;font-size:12px;color:#666"></div>
    </div>

    <div class="card" id="rsUserCard" style="display:${process.env.REMOTE_SUPPORT_RELAY_ENABLED === 'true' ? 'none' : 'block'};border:1px solid rgba(99,102,241,.3);background:rgba(99,102,241,.04)">
      <h2 style="color:#a5b4fc">Remote Support — Allow Ramon to assist</h2>
      <p style="font-size:12px;color:#aaa;margin-bottom:12px">When enabled, Ramon can request an approved-by-you bash session inside this container to troubleshoot. Every keystroke is logged to disk for your review.</p>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <button id="rsToggleBtn" onclick="rsToggle()" type="button" style="position:relative;display:inline-flex;align-items:center;gap:10px;padding:10px 18px 10px 14px;border:none;border-radius:999px;cursor:pointer;font-size:14px;font-weight:600;color:#fff;background:#374151;transition:background .15s ease;min-width:170px;justify-content:flex-start">
          <span id="rsToggleDot" style="width:14px;height:14px;border-radius:999px;background:#9ca3af;box-shadow:0 0 0 3px rgba(156,163,175,.25);transition:background .15s ease,box-shadow .15s ease"></span>
          <span id="rsToggleLabel">Remote support: OFF</span>
        </button>
        <input type="checkbox" id="rsToggle" style="display:none">
        <button class="btn btn-danger" id="rsKill" onclick="rsKill()" style="display:none">Kill Active Session</button>
      </div>
      <div id="rsStatus" style="margin-top:6px;font-size:12px;color:#94a3b8">Off — Ramon cannot connect</div>
      <div id="rsBanner" style="display:none;margin-top:14px;padding:14px 18px;background:rgba(59,130,246,.14);border-radius:8px;border:2px solid rgba(59,130,246,.65);box-shadow:0 0 0 4px rgba(59,130,246,.12)">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:#3b82f6;box-shadow:0 0 0 4px rgba(59,130,246,.35);animation:rsPulse 1.4s ease-in-out infinite"></span>
          <span style="font-weight:700;color:#bfdbfe;font-size:15px;letter-spacing:.02em">RAMON IS CONNECTED RIGHT NOW</span>
        </div>
        <div id="rsBannerMsg" style="font-size:12px;color:#bfdbfe;margin-top:6px"></div>
        <div style="margin-top:10px">
          <button class="btn btn-danger" onclick="rsKill()">End session now</button>
        </div>
      </div>
      <style>@keyframes rsPulse { 0%,100% { opacity:1 } 50% { opacity:.45 } }</style>
      <div style="margin-top:12px">
        <div style="font-size:12px;color:#aaa;margin-bottom:6px">Audit logs</div>
        <ul id="rsAuditList" style="font-size:11px;color:#94a3b8;list-style:none;padding:0;margin:0"></ul>
      </div>
    </div>

    <div class="card" id="rsOperatorCard" style="display:${process.env.REMOTE_SUPPORT_RELAY_ENABLED === 'true' ? 'block' : 'none'};border:1px solid rgba(168,85,247,.3);background:rgba(168,85,247,.04)">
      <h2 style="color:#c4b5fd">Remote Support — Operator</h2>
      <p style="font-size:12px;color:#aaa;margin-bottom:12px">Users who toggled remote support ON are listed below. Click Connect to open an approval-gated bash session.</p>

      <div style="margin-bottom:12px">
        <div style="font-size:12px;color:#a5b4fc;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Pending support requests</div>
        <div id="rsOpAgents" style="font-size:13px;color:#cbd5e1"></div>
      </div>

      <details style="margin-top:8px">
        <summary style="cursor:pointer;font-size:12px;color:#94a3b8">Connect by SN manually</summary>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <input type="text" id="rsOpSn" placeholder="LFIN2231000656" style="flex:1;min-width:240px">
          <button class="btn btn-primary" onclick="rsOpConnect()">Connect</button>
          <button class="btn btn-secondary" onclick="rsOpRefresh()">Refresh</button>
        </div>
      </details>

      <div id="rsOpTerminal" style="margin-top:12px;height:400px;background:#000;display:none"></div>
    </div>

    <div class="card" style="border:1px solid rgba(34,197,94,.3);background:rgba(34,197,94,.04)">
      <h2 style="color:#22c55e">Remote Debug — Receive Logs</h2>
      <p style="font-size:12px;color:#aaa;margin-bottom:8px">View logs received from other OpenNova users who are sharing their debug data with you.</p>
      <div id="remoteDevices" style="margin-bottom:8px"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px" id="remoteSnTabs"></div>
      <div id="remoteConsoleWrap" style="display:none">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
          <input type="text" id="rf_search" placeholder="Filter..." oninput="renderRemoteLogs()" style="width:160px;font-size:11px;padding:4px 8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:6px;color:#fff">
          <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:3px"><input type="checkbox" id="rf_mower" checked onchange="renderRemoteLogs()"><span style="color:#22c55e">Mower</span></label>
          <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:3px"><input type="checkbox" id="rf_charger" checked onchange="renderRemoteLogs()"><span style="color:#eab308">Charger</span></label>
          <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:3px"><input type="checkbox" id="rf_app" checked onchange="renderRemoteLogs()"><span style="color:#3b82f6">App</span></label>
          <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:3px"><input type="checkbox" id="rf_system" checked onchange="renderRemoteLogs()"><span style="color:#aaa">System</span></label>
          <div style="display:flex;gap:4px;margin-left:auto">
            <button onclick="remoteLogBuf=[];renderRemoteLogs()" style="background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.2);border-radius:6px;padding:4px 12px;font-size:11px;cursor:pointer">Clear</button>
            <button onclick="copyRemoteConsole()" style="background:rgba(59,130,246,.15);color:#60a5fa;border:1px solid rgba(59,130,246,.2);border-radius:6px;padding:4px 12px;font-size:11px;cursor:pointer">Copy</button>
          </div>
          <label style="font-size:11px;color:#aaa;cursor:pointer;display:flex;align-items:center;gap:3px"><input type="checkbox" id="rf_autoscroll" checked>Auto-scroll</label>
        </div>
        <div id="remoteLogs" style="background:#0a0a1a;border-radius:8px;padding:8px;font:11px/1.6 monospace;color:#aaa;height:400px;overflow-y:auto"></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn" style="font-size:11px" onclick="refreshRemoteDevices(); pollRemoteLogs();">Refresh</button>
        <button class="btn" style="font-size:11px;background:rgba(239,68,68,.2);border-color:rgba(239,68,68,.3)" onclick="clearRemoteLogs()">Clear All</button>
      </div>
    </div>

    <div class="card" style="border:1px solid rgba(245,158,11,.3);background:linear-gradient(135deg,rgba(245,158,11,.06),rgba(124,58,237,.04))">
      <h2 style="color:#f59e0b;display:flex;align-items:center;gap:8px">💚 Support OpenNova</h2>
      <p style="font-size:13px;color:#ccc;margin-bottom:14px;line-height:1.6">
        OpenNova is free and open-source. If it saved your mower from a dead Novabot cloud or helped you skip a subscription, a small tip keeps the lights on.
      </p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
        <a href="https://buymeacoffee.com/rvbcrs" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:12px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);border-radius:8px;text-decoration:none;color:#fbbf24;transition:transform .15s" onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='translateY(0)'">
          <span style="font-size:20px">☕</span>
          <div style="flex:1">
            <div style="font-weight:600;font-size:13px">Buy Me a Coffee</div>
            <div style="font-size:11px;color:#999;margin-top:2px">One-off tip</div>
          </div>
        </a>
        <a href="https://paypal.me/rvbcrs" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:12px;background:rgba(0,112,186,.12);border:1px solid rgba(0,112,186,.3);border-radius:8px;text-decoration:none;color:#60a5fa;transition:transform .15s" onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='translateY(0)'">
          <span style="font-size:20px">💳</span>
          <div style="flex:1">
            <div style="font-weight:600;font-size:13px">PayPal</div>
            <div style="font-size:11px;color:#999;margin-top:2px">Any amount</div>
          </div>
        </a>
        <a href="https://github.com/sponsors/rvbcrs" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:12px;background:rgba(168,85,247,.12);border:1px solid rgba(168,85,247,.3);border-radius:8px;text-decoration:none;color:#c4b5fd;transition:transform .15s" onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='translateY(0)'">
          <span style="font-size:20px">⭐</span>
          <div style="flex:1">
            <div style="font-weight:600;font-size:13px">GitHub Sponsors</div>
            <div style="font-size:11px;color:#999;margin-top:2px">Recurring monthly</div>
          </div>
        </a>
      </div>
    </div>

    <div class="card">
      <details style="padding:8px 12px;background:rgba(239,68,68,.04);border:1px solid rgba(239,68,68,.15);border-radius:8px">
        <summary style="font-size:12px;font-weight:600;color:#fca5a5;cursor:pointer;list-style:none">Debug &mdash; manual recalibrate charging pose <span style="font-size:10px;background:rgba(148,163,184,.15);color:#94a3b8;padding:2px 6px;border-radius:4px;margin-left:6px">DEBUG</span></summary>
        <div style="font-size:10px;color:#94a3b8;margin:6px 0">Use only when polygon shape is correct but dock pose drifted. Portable Map Bundle handles this automatically. Only fall back here if exact-restore is unavailable.</div>
        <div style="padding:10px 12px;background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.2);border-radius:8px;margin-top:8px">
          <div style="font-size:11px;color:#aaa;margin-bottom:10px;line-height:1.5">
            <b style="color:#fca5a5">Recovery: wrong charger pose causes mower to drive off target.</b><br>
            Stock firmware needs a drive-back cycle to initialize localization
            before the reported pose is trustworthy. While docked at boot,
            <code>map_position</code> is always <code>(0, 0, 0)</code> placeholder.<br>
            <b>Workflow:</b>
            <ol style="margin:6px 0 0 18px;padding:0;color:#aaa;font-size:11px">
              <li>Drive the mower a short distance off the dock (e.g. start a 10s mowing task or push it manually 1-2 m)</li>
              <li>Let it return to dock so battery state shows <code>CHARGING</code></li>
              <li>Wait until <code>localization_state</code> below shows <b>Localized</b> and <code>map_position</code> is non-zero</li>
              <li>Then press <b>Recalibrate Charging Pose</b></li>
            </ol>
          </div>
          <div id="mapLocalizationStatus" style="font-size:11px;color:#ccc;background:#0d0d20;border:1px solid #2a2a3a;border-radius:6px;padding:8px 12px;margin-bottom:10px;font-family:'Roboto Mono',ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace">
            <span style="color:#888">Loading localization status...</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button onclick="recalibrateChargingPose()" id="mapRecalBtn" style="padding:8px 16px;background:rgba(239,68,68,.15);color:#fca5a5;border:1px solid rgba(239,68,68,.3);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">Recalibrate Charging Pose</button>
            <a href="javascript:void(0)" onclick="document.getElementById('infoRecal').style.display=document.getElementById('infoRecal').style.display==='block'?'none':'block'" style="font-size:11px;color:#94a3b8;text-decoration:underline;cursor:pointer">What does this do?</a>
          </div>
          <div id="infoRecal" style="display:none;margin-top:8px;padding:10px 12px;background:rgba(15,23,42,.6);border:1px solid #1e293b;border-radius:6px;font-size:11px;color:#cbd5e1;line-height:1.55">
            <div><b>Snaps the dock pose to where the mower currently sits.</b></div>
            <div style="margin-top:6px"><b style="color:#86efac">Updates:</b> <code>charging_station.yaml</code> + <code>map_info.json</code> in <code>csv_file/</code> and <code>x3_csv_file/</code> on the mower (3 files). Saves the new theta in DB so subsequent <code>sync_map</code> calls reuse it.</div>
            <div style="margin-top:6px"><b style="color:#fca5a5">Does NOT touch:</b> polygon CSVs, the <code>_latest.zip</code>, charger GPS, or the mower's coverage planner state.</div>
            <div style="margin-top:6px"><b style="color:#93c5fd">Use when:</b> mower drifted after heading discovery or theta is wrong but the polygon shape itself is fine.</div>
            <div style="margin-top:6px"><b style="color:#fbbf24">Required:</b> mower on dock + <code>battery_state == CHARGING</code> + RTK FIX + non-zero <code>map_position</code>.</div>
          </div>
          <div id="mapRecalStatus" style="font-size:12px;margin-top:8px;display:none"></div>
        </div>
        <div style="margin-top:10px;padding:10px 12px;background:rgba(34,211,238,.05);border:1px solid rgba(34,211,238,.18);border-radius:8px">
          <div style="font-size:11px;font-weight:600;color:#67e8f9;margin-bottom:6px">Position Validation (RTK FIX only)</div>
          <div style="font-size:10px;color:#94a3b8;margin-bottom:6px">Live dual-trail diagnose during mow: cyan = firmware <code>map_position</code>, lime = RTK GPS via charger anchor. Delta between them flags drift or frame-rotation issues. Read-only (use Portable Map Bundle exact-restore instead).</div>
          <div id="positionValidationPanel" style="font-size:11px;color:#ccc;font-family:'Roboto Mono',ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace">
            <span style="color:#888">Select a mower to start validation polling.</span>
          </div>
        </div>
      </details>
    </div>

    <div class="card" style="border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.04)">
      <h2 style="color:#ef4444">Danger Zone</h2>
      <p style="font-size:12px;color:#aaa;margin-bottom:12px">Permanently delete all data and start fresh. This removes your account, all devices, maps, and settings. This action cannot be undone.</p>
      <button class="btn btn-red" style="background:#dc2626" onclick="factoryReset()">Factory Reset</button>
    </div>
  </div>
</div>

<script src="/socket.io/socket.io.js" onerror="
  // Socket.io not available on this port — try main server port
  var s=document.createElement('script');
  s.src=location.protocol+'//'+location.hostname+':${process.env.PORT ?? '3000'}/socket.io/socket.io.js';
  document.head.appendChild(s);
"></script>
<script>
let token = localStorage.getItem('admin_token') || '';

// Modern modal dialogs (replaces alert/confirm)
function showModal(title, msg, buttons) {
  return new Promise(function(resolve) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    var box = document.createElement('div');
    box.className = 'modal-box';
    box.innerHTML = '<div class="modal-title">' + title + '</div><div class="modal-msg">' + msg + '</div>';
    var btns = document.createElement('div');
    btns.className = 'modal-btns';
    buttons.forEach(function(b) {
      var btn = document.createElement('button');
      btn.className = 'modal-btn ' + (b.cls || 'modal-btn-ok');
      btn.textContent = b.text;
      btn.onclick = function() { overlay.classList.remove('show'); setTimeout(function() { overlay.remove(); }, 200); resolve(b.value); };
      btns.appendChild(btn);
    });
    box.appendChild(btns);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    requestAnimationFrame(function() { overlay.classList.add('show'); });
  });
}
function modalAlert(title, msg) {
  return showModal(title, msg, [{ text: 'OK', value: true, cls: 'modal-btn-ok' }]);
}
function modalConfirm(title, msg) {
  return showModal(title, msg, [
    { text: 'Cancel', value: false, cls: 'modal-btn-cancel' },
    { text: 'Confirm', value: true, cls: 'modal-btn-danger' },
  ]);
}
let currentTab = 'devices';

function switchTab(name) {
  currentTab = name;
  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
  // Activate clicked tab
  var names = ['devices','console','mowerdebug','maps','firmware','settings'];
  for (var i = 0; i < names.length; i++) {
    document.getElementById('tab_' + names[i]).style.display = names[i] === name ? '' : 'none';
    if (names[i] === name) tabs[i].classList.add('active');
  }
  // Auto-check DNS + dnsmasq when switching to settings
  if (name === 'settings') { checkDns(); checkDnsmasqStatus(); }
  if (name === 'mowerdebug') { mdPopulateDropdown(); }
  // Load maps when switching to maps tab
  if (name === 'maps') { populateMowerDropdown(); loadWalkerBundles(); }
  if (name === 'firmware') { loadFirmwareVersions(); populateOtaDeviceDropdown(); wireWalkerFwToggle(); }
}

// Lazy-load walker firmware list the first time the operator expands the
// "Walker firmware" details panel. Mirrors how other sections defer fetch
// until visible — avoids hammering the remote manifest on every tab open.
var _walkerFwWired = false;
function wireWalkerFwToggle() {
  if (_walkerFwWired) return;
  var el = document.getElementById('walkerFwDetails');
  if (!el) return;
  _walkerFwWired = true;
  el.addEventListener('toggle', function() {
    if (el.open) checkWalkerFirmware();
  });
}

// ── MQTT Console ──────────────────────────────────────────────────
let mqttLogs = [];
const MAX_CONSOLE_LINES = 500;

function classifyLog(entry) {
  if (!entry) return 'system';
  var t = entry.type || '';
  if (t === 'http-req' || t === 'http-res') return 'http';
  var cid = (entry.clientId || '') + (entry.sn || '') + (entry.topic || '');
  if (cid.indexOf('LFIN') >= 0) return 'mower';
  if (cid.indexOf('LFIC') >= 0 || cid.indexOf('ESP32') >= 0) return 'charger';
  if (entry.clientType === 'APP' || cid.indexOf('@') >= 0 || cid.indexOf('eyJ') >= 0) return 'app';
  return 'system';
}

function logColor(cls) {
  if (cls === 'mower') return '#22c55e';
  if (cls === 'charger') return '#eab308';
  if (cls === 'app') return '#3b82f6';
  if (cls === 'http') return '#c084fc';
  return '#666';
}

function typeIcon(type) {
  if (type === 'connect') return '🔌';
  if (type === 'disconnect') return '🔴';
  if (type === 'subscribe') return '📡';
  if (type === 'publish') return '📨';
  if (type === 'forward') return '➡️';
  if (type === 'http-req') return '🌐';
  if (type === 'http-res') return '↩️';
  if (type === 'error') return '❌';
  return '·';
}

function truncate(s, n) { return s && s.length > n ? s.substring(0, n) + '...' : (s || ''); }

function highlightTerm(text, q) {
  if (!q || !text) return text;
  var idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  var result = '';
  var pos = 0;
  while (idx !== -1) {
    result += text.substring(pos, idx);
    result += '<mark style="background:#facc15;color:#000;border-radius:2px;padding:0 1px">' + text.substring(idx, idx + q.length) + '</mark>';
    pos = idx + q.length;
    idx = text.toLowerCase().indexOf(q.toLowerCase(), pos);
  }
  result += text.substring(pos);
  return result;
}

function formatLog(entry, searchTerm) {
  var cls = classifyLog(entry);
  var color = logColor(cls);
  var t = new Date(entry.ts);
  var time = t.toLocaleTimeString('nl-NL', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  var icon = typeIcon(entry.type);
  var dir = entry.direction || '';
  var sn = entry.sn || '';
  var topic = entry.topic ? entry.topic.replace('Dart/Receive_mqtt/','←').replace('Dart/Send_mqtt/','→').replace('Dart/Receive_server_mqtt/','⇐') : '';
  var payload = (entry.payload || '').split('<').join('&lt;');
  var q = searchTerm || '';

  // Highlight search term in sn, topic, payload
  if (q) {
    sn = highlightTerm(sn, q);
    topic = highlightTerm(topic, q);
    payload = highlightTerm(payload, q);
  }

  return '<div class="mqtt-line mqtt-' + cls + '" style="color:' + color + '">' +
    '<span style="color:#555">' + time + '</span> ' +
    icon + ' ' +
    '<span style="font-weight:700">' + (entry.type || '').toUpperCase() + '</span> ' +
    (sn ? '<span style="color:' + color + ';opacity:.7">' + sn + '</span> ' : '') +
    (dir ? '<span style="color:#aaa">' + dir + '</span> ' : '') +
    (topic ? '<span style="color:#aaa">' + topic + '</span> ' : '') +
    (payload ? '<span style="color:' + color + ';opacity:.6">' + payload + '</span>' : '') +
    '</div>';
}

function copyConsole() {
  var fm = document.getElementById('f_mower').checked;
  var fc = document.getElementById('f_charger').checked;
  var fa = document.getElementById('f_app').checked;
  var fh = document.getElementById('f_http').checked;
  var fs = document.getElementById('f_system').checked;
  var q = (document.getElementById('f_search').value || '').toLowerCase().trim();
  var lines = [];
  for (var i = 0; i < mqttLogs.length; i++) {
    var e = mqttLogs[i];
    var cls = classifyLog(e);
    if (cls === 'mower' && !fm) continue;
    if (cls === 'charger' && !fc) continue;
    if (cls === 'app' && !fa) continue;
    if (cls === 'http' && !fh) continue;
    if (cls === 'system' && !fs) continue;
    if (!matchesSearch(e, q)) continue;
    var t = new Date(e.ts);
    var time = t.toLocaleTimeString('nl-NL', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    var dir = e.direction || '';
    var sn = e.sn || '';
    lines.push(time + ' ' + (e.type || '').toUpperCase() + ' ' + sn + ' ' + dir + ' ' + (e.topic || '') + ' ' + (e.payload || ''));
  }
  var text = lines.join('\\n');
  navigator.clipboard.writeText(text).then(function() {
    var btn = event.target;
    btn.textContent = 'Copied!';
    setTimeout(function() { btn.textContent = 'Copy'; }, 1500);
  });
}

function applyFilter() {
  renderLogs();
}

function matchesSearch(entry, q) {
  if (!q) return true;
  var s = ((entry.sn || '') + ' ' + (entry.clientId || '') + ' ' + (entry.topic || '') + ' ' + (entry.payload || '') + ' ' + (entry.type || '')).toLowerCase();
  return s.indexOf(q) >= 0;
}

function renderLogs() {
  var fm = document.getElementById('f_mower').checked;
  var fc = document.getElementById('f_charger').checked;
  var fa = document.getElementById('f_app').checked;
  var fh = document.getElementById('f_http').checked;
  var fs = document.getElementById('f_system').checked;
  var q = (document.getElementById('f_search').value || '').toLowerCase().trim();
  var el = document.getElementById('mqttConsole');
  var html = '';
  for (var i = 0; i < mqttLogs.length; i++) {
    var cls = classifyLog(mqttLogs[i]);
    if (cls === 'mower' && !fm) continue;
    if (cls === 'charger' && !fc) continue;
    if (cls === 'app' && !fa) continue;
    if (cls === 'http' && !fh) continue;
    if (cls === 'system' && !fs) continue;
    if (!matchesSearch(mqttLogs[i], q)) continue;
    html += formatLog(mqttLogs[i], q);
  }
  el.innerHTML = html;
  if (document.getElementById('f_autoscroll').checked) {
    el.scrollTop = el.scrollHeight;
  }
}

function addLog(entry) {
  mqttLogs.push(entry);
  if (mqttLogs.length > MAX_CONSOLE_LINES) mqttLogs.splice(0, mqttLogs.length - MAX_CONSOLE_LINES);

  var cls = classifyLog(entry);
  var fm = document.getElementById('f_mower').checked;
  var fc = document.getElementById('f_charger').checked;
  var fa = document.getElementById('f_app').checked;
  var fh = document.getElementById('f_http').checked;
  var fs = document.getElementById('f_system').checked;
  var q = (document.getElementById('f_search').value || '').toLowerCase().trim();
  if (cls === 'mower' && !fm) return;
  if (cls === 'charger' && !fc) return;
  if (cls === 'app' && !fa) return;
  if (cls === 'http' && !fh) return;
  if (cls === 'system' && !fs) return;
  if (!matchesSearch(entry, q)) return;

  var el = document.getElementById('mqttConsole');
  el.insertAdjacentHTML('beforeend', formatLog(entry, q));
  if (document.getElementById('f_autoscroll').checked) {
    el.scrollTop = el.scrollHeight;
  }
}

// ── Mower Debug (extended_commands) ──────────────────────────────
var mdOutputLines = [];
var mdCurrentMeta = null;
var mdPendingCommand = null;
var mdPendingTimeout = null;

function mdPopulateDropdown() {
  fetch('/api/dashboard/devices').then(function(r){return r.json();}).then(function(d){
    var sel = document.getElementById('mdMowerSelect');
    var prev = sel.value;
    sel.innerHTML = '<option value="">Select a mower...</option>';
    var devs = (d.devices || d || []).filter(function(x){ return (x.sn || '').indexOf('LFIN') === 0; });
    for (var i = 0; i < devs.length; i++) {
      var opt = document.createElement('option');
      opt.value = devs[i].sn;
      opt.textContent = (devs[i].nickname || devs[i].sn) + ' (' + devs[i].sn + ')';
      sel.appendChild(opt);
    }
    if (prev) sel.value = prev;
    // Auto-select single mower
    if (!sel.value && devs.length === 1) sel.value = devs[0].sn;
  }).catch(function(){ /* ignore */ });
}

function mdSetStatus(text, color) {
  var s = document.getElementById('mdStatus');
  s.textContent = text || '';
  s.style.color = color || '#888';
}

function mdSendCommand(cmdName, params) {
  var sn = document.getElementById('mdMowerSelect').value;
  if (!sn) { mdSetStatus('No mower selected', '#f87171'); return false; }

  if (mdPendingTimeout) clearTimeout(mdPendingTimeout);
  mdPendingCommand = cmdName;
  mdSetStatus('Sending ' + cmdName + '...', '#fbbf24');

  var body = {};
  body[cmdName] = params || {};
  fetch('/api/dashboard/extended/' + encodeURIComponent(sn), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(function(r){ return r.json(); }).then(function(d){
    if (d.ok) {
      mdSetStatus('Waiting for ' + cmdName + '_respond...', '#fbbf24');
      mdPendingTimeout = setTimeout(function(){
        mdSetStatus('Timeout — no response within 15s', '#f87171');
        mdPendingCommand = null;
      }, 15000);
    } else {
      mdSetStatus('Error: ' + (d.error || 'unknown'), '#f87171');
      mdPendingCommand = null;
    }
  }).catch(function(e){
    mdSetStatus('HTTP error: ' + e.message, '#f87171');
    mdPendingCommand = null;
  });
  return true;
}

function mdQuickAction(cmd) {
  mdSendCommand(cmd, {});
}

function mdFetchLog() {
  var params = {
    source: document.getElementById('mdLogSource').value,
    lines: parseInt(document.getElementById('mdLogLines').value) || 200,
    level: document.getElementById('mdLogLevel').value || undefined,
    grep: document.getElementById('mdLogGrep').value || undefined,
  };
  // Server expects the same keys; strip undefined
  for (var k in params) if (params[k] === undefined || params[k] === '') delete params[k];
  mdSendCommand('get_ros_log', params);
}

function mdHandleExtendedResponse(ev) {
  // ev = {sn, command, data, timestamp}

  // ── LoRa editor hook ─────────────────────────────────────────────
  // Check FIRST zodat een openstaand LoRa-edit modal de set/get respond
  // krijgt ongeacht de debug-screen state. Matcht op sn.
  if (window._loraEditPending && ev.sn === window._loraEditPending.sn) {
    var p = window._loraEditPending;
    if (ev.command === 'set_lora_info_respond' && p.phase === 'set' && typeof p.onSetRespond === 'function') {
      p.onSetRespond(ev.data);
      return;
    }
    if (ev.command === 'get_lora_info_respond' && p.phase === 'verify' && typeof p.onGetRespond === 'function') {
      p.onGetRespond(ev.data);
      return;
    }
  }

  // Ignore if not our pending command (or from different mower)
  var selSn = document.getElementById('mdMowerSelect').value;
  if (selSn && ev.sn !== selSn) return;

  var respondKey = (mdPendingCommand || '').replace(/_respond$/, '') + '_respond';
  if (ev.command !== respondKey && !String(ev.command).startsWith(mdPendingCommand || '')) {
    // Not the command we were waiting for — still log it as info
    mdAppendLine('[other] ' + ev.command + ' = ' + JSON.stringify(ev.data).slice(0, 500));
    return;
  }

  if (mdPendingTimeout) { clearTimeout(mdPendingTimeout); mdPendingTimeout = null; }
  mdSetStatus('Received ' + ev.command, '#4ade80');

  var data = ev.data || {};
  if (data.result !== 0 && data.result !== true) {
    mdAppendLine('[ERROR] ' + ev.command + ' → result=' + data.result + ' error=' + (data.error || '(none)'));
    mdPendingCommand = null;
    return;
  }
  var value = data.value;

  if (mdPendingCommand === 'get_ros_log') {
    if (value && Array.isArray(value.lines)) {
      mdOutputLines = []; // replace, not append
      mdCurrentMeta = { source: value.source, file: value.file, raw: value.raw_count, shown: value.count };
      for (var i = 0; i < value.lines.length; i++) mdOutputLines.push(value.lines[i]);
      mdRenderOutput();
    }
  } else if (mdPendingCommand === 'list_ros_logs') {
    mdOutputLines = [];
    mdCurrentMeta = null;
    mdAppendLine('# list_ros_logs — available log sources');
    mdAppendLine('');
    if (value && typeof value === 'object') {
      for (var src in value) {
        var info = value[src] || {};
        mdAppendLine(src.padEnd(22) + ' ' + (info.size || '?').toString().padStart(10) + 'B  ' + (info.mtime_iso || '') + '  instances=' + (info.total_instances || 0));
        mdAppendLine('  ' + (info.path || ''));
      }
    }
    mdRenderOutput();
  } else if (mdPendingCommand === 'stat_path_files') {
    mdOutputLines = [];
    mdCurrentMeta = null;
    mdAppendLine('# stat_path_files');
    mdAppendLine('dir: ' + (value && value.planned_path_dir));
    mdAppendLine('');
    if (value && value.files) {
      for (var fn in value.files) {
        var f = value.files[fn];
        if (!f) { mdAppendLine(fn + ' — NOT FOUND'); continue; }
        if (f.error) { mdAppendLine(fn + ' — error: ' + f.error); continue; }
        mdAppendLine(fn.padEnd(30) + ' ' + (f.size + '').padStart(10) + 'B  ' + (f.mtime_iso || ''));
      }
    }
    if (value && value.csv_file_summary) {
      mdAppendLine('');
      mdAppendLine('csv_file/ summary: ' + JSON.stringify(value.csv_file_summary));
    }
    mdRenderOutput();
  } else if (mdPendingCommand === 'get_system_info') {
    mdOutputLines = [];
    mdCurrentMeta = null;
    mdAppendLine('# get_system_info');
    if (value && typeof value === 'object') {
      for (var k in value) mdAppendLine(k.padEnd(22) + ' = ' + JSON.stringify(value[k]));
    }
    mdRenderOutput();
  } else {
    // Generic fallback — dump the value
    mdAppendLine('# ' + ev.command);
    mdAppendLine(JSON.stringify(value, null, 2));
    mdRenderOutput();
  }

  mdPendingCommand = null;
}

function mdAppendLine(line) {
  mdOutputLines.push(line);
  // Cap total lines to avoid memory blowup
  if (mdOutputLines.length > 5000) mdOutputLines.splice(0, mdOutputLines.length - 5000);
}

function mdRenderOutput() {
  var el = document.getElementById('mdOutput');
  if (!el) return;
  var q = (document.getElementById('mdOutputFilter').value || '').toLowerCase();
  var onlyErrors = document.getElementById('mdOnlyErrors').checked;
  var onlyWarns = document.getElementById('mdOnlyWarns').checked;

  var html = '';
  if (mdCurrentMeta) {
    html += '<div style="color:#888;font-style:italic;margin-bottom:6px">source=' + mdCurrentMeta.source +
            ' • file=' + (mdCurrentMeta.file || '') +
            ' • raw=' + (mdCurrentMeta.raw || 0) +
            ' → shown=' + (mdCurrentMeta.shown || 0) + '</div>';
  }

  var visible = 0;
  for (var i = 0; i < mdOutputLines.length; i++) {
    var ln = mdOutputLines[i];
    var lower = ln.toLowerCase();
    if (q && lower.indexOf(q) < 0) continue;
    var isError = lower.indexOf('[error]') >= 0 || lower.indexOf('fatal') >= 0 || lower.indexOf('buffer overflow') >= 0 || lower.indexOf('segfault') >= 0;
    var isWarn = lower.indexOf('[warn]') >= 0 || lower.indexOf('warning') >= 0;
    if (onlyErrors && !isError) continue;
    if (onlyWarns && !isWarn && !onlyErrors) continue;

    var color = '#ccc';
    if (isError) color = '#f87171';
    else if (isWarn) color = '#fbbf24';
    else if (lower.indexOf('[info]') >= 0) color = '#9ca3af';

    var displayLine = ln.split('<').join('&lt;');
    if (q) {
      var idx = displayLine.toLowerCase().indexOf(q);
      if (idx >= 0) {
        displayLine = displayLine.substring(0, idx) +
          '<mark style="background:#facc15;color:#000;border-radius:2px;padding:0 1px">' +
          displayLine.substring(idx, idx + q.length) + '</mark>' +
          displayLine.substring(idx + q.length);
      }
    }
    html += '<div style="color:' + color + '">' + displayLine + '</div>';
    visible++;
  }

  el.innerHTML = html || '<span style="color:#555">No lines match the current filter.</span>';
  el.scrollTop = el.scrollHeight;
}

function mdCopyOutput() {
  var q = (document.getElementById('mdOutputFilter').value || '').toLowerCase();
  var onlyErrors = document.getElementById('mdOnlyErrors').checked;
  var onlyWarns = document.getElementById('mdOnlyWarns').checked;
  var lines = [];
  for (var i = 0; i < mdOutputLines.length; i++) {
    var ln = mdOutputLines[i];
    var lower = ln.toLowerCase();
    if (q && lower.indexOf(q) < 0) continue;
    var isError = lower.indexOf('[error]') >= 0 || lower.indexOf('fatal') >= 0;
    var isWarn = lower.indexOf('[warn]') >= 0 || lower.indexOf('warning') >= 0;
    if (onlyErrors && !isError) continue;
    if (onlyWarns && !isWarn && !onlyErrors) continue;
    lines.push(ln);
  }
  navigator.clipboard.writeText(lines.join('\\n')).then(function(){
    mdSetStatus('Copied ' + lines.length + ' lines', '#4ade80');
  });
}

// Connect Socket.io for real-time logs + events
// All event listeners are registered in setupSocketListeners so they work
// regardless of whether socket.io loaded from same origin or fallback port.
var mqttSocket = null;
function setupSocketListeners(sock) {
  sock.on('mqtt:log', function(entry) { addLog(entry); });
  var _lastOnline = {};
  sock.on('device:online', function(d) {
    if (token) loadMyDevices();
    var now = Date.now();
    if (!_lastOnline[d.sn] || now - _lastOnline[d.sn] > 60000) {
      showToast(d.sn + ' came online', 'green');
    }
    _lastOnline[d.sn] = now;
  });
  sock.on('device:offline', function(d) {
    if (token) loadMyDevices();
  });
  sock.on('device:bound', function(d) {
    if (token) loadMyDevices();
    showActivity('binding ' + d.sn + '...', 3000);
    showToast('Auto-bound ' + d.sn + ' to your account', 'green');
  });
  sock.on('device:paired', function(d) {
    if (token) loadMyDevices();
    showActivity('pairing devices...', 3000);
    showToast('Auto-paired ' + (d.mowerSn || '?') + ' + ' + (d.chargerSn || '?'), 'green');
  });
  sock.on('ota:event', function(evt) {
    if (!evt) return;
    var selDev = document.getElementById('otaDeviceSelect');
    if (!selDev || !selDev.value) return;
    // Filter by selected SN
    if (evt.sn && evt.sn !== selDev.value) return;
    var progressArea = document.getElementById('otaProgress');
    var fill = document.getElementById('otaProgressFill');
    var pctText = document.getElementById('otaPctText');
    var statusText = document.getElementById('otaStatusText');
    if (!progressArea || !fill) return;
    progressArea.style.display = 'block';
    var rawData = evt.data || evt;
    var rawPct = rawData.percentage ?? rawData.progress ?? evt.progress ?? 0;
    var pct = rawPct <= 1 ? Math.round(rawPct * 100) : Math.round(rawPct);
    fill.style.width = pct + '%';
    pctText.textContent = pct + '%';
    // Determine status text from progress range
    var evtStatus = rawData.status || evt.status || '';
    var label = 'Updating...';
    if (evtStatus === 'completed' || evtStatus === 'success' || pct >= 100) {
      label = 'Completed!';
      fill.style.background = '#22c55e';
      pctText.textContent = '100%';
      fill.style.width = '100%';
      showToast('OTA update completed for ' + (evt.sn || selDev.value), 'green');
    } else if (evtStatus === 'error' || evtStatus === 'failed') {
      label = 'Failed: ' + (rawData.message || evt.message || 'unknown error');
      fill.style.background = '#ef4444';
      pctText.style.color = '#ef4444';
    } else if (pct <= 62) {
      label = 'Downloading firmware... (' + pct + '%)';
    } else if (pct <= 68) {
      label = 'Unpacking firmware...';
    } else {
      label = 'Installing firmware...';
    }
    statusText.textContent = label;
    statusText.style.color = (evtStatus === 'error' || evtStatus === 'failed') ? '#ef4444' : (evtStatus === 'completed' || pct >= 100) ? '#22c55e' : '#aaa';
  });
  sock.on('extended:response', function(ev) {
    try { mdHandleExtendedResponse(ev); } catch (e) { console.error('mdHandleExtendedResponse error', e); }
  });
  // Charger uses standard Dart/Receive_mqtt/ → 'command:respond' socket event.
  // Used door de live LoRa editor voor chargers (LFIC*).
  sock.on('command:respond', function(ev) {
    try { mdHandleCommandRespond(ev); } catch (e) { console.error('mdHandleCommandRespond error', e); }
  });
  sock.emit('mqtt:log:history');
}

// Try connecting socket.io — same origin first, then explicit port fallback
if (typeof io !== 'undefined') {
  mqttSocket = io();
  setupSocketListeners(mqttSocket);
} else {
  // Wait for fallback socket.io script to load
  setTimeout(function() {
    if (typeof io !== 'undefined') {
      mqttSocket = io(location.protocol + '//' + location.hostname + ':${process.env.PORT ?? '3000'}');
      setupSocketListeners(mqttSocket);
    }
  }, 1500);
}

var _activityTimer = null;
function showActivity(text, durationMs) {
  var el = document.getElementById('deviceActivity');
  var txt = document.getElementById('deviceActivityText');
  if (!el || !txt) return;
  txt.textContent = text;
  el.style.display = 'inline';
  if (_activityTimer) clearTimeout(_activityTimer);
  _activityTimer = setTimeout(function() { el.style.display = 'none'; }, durationMs || 5000);
}

function showToast(msg, color) {
  var el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:10px 16px;border-radius:8px;font-size:13px;z-index:9999;transition:opacity .5s;color:#fff;background:' + (color === 'green' ? 'rgba(0,212,170,.9)' : color === 'gray' ? 'rgba(100,100,100,.9)' : 'rgba(0,212,170,.9)');
  document.body.appendChild(el);
  setTimeout(function() { el.style.opacity = '0'; setTimeout(function() { el.remove(); }, 500); }, 3000);
}

// Load initial logs
fetch('/api/dashboard/mqtt-logs')
  .then(function(r) { return r.json(); })
  .then(function(d) {
    var logs = d.logs || d || [];
    for (var i = 0; i < logs.length; i++) mqttLogs.push(logs[i]);
    renderLogs();
  })
  .catch(function() {});

async function api(path, method='GET', body=null) {
  const opts = { method, headers: { 'Authorization': token, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch('/api/admin-status' + path, opts);
  if (r.status === 401 || r.status === 403) { logout(); throw new Error('Unauthorized'); }
  var ct = r.headers.get('content-type') || '';
  if (!ct.includes('json')) {
    var txt = await r.text();
    var preStart = txt.indexOf(String.fromCharCode(60) + 'pre>');
    var preEnd = txt.indexOf(String.fromCharCode(60) + '/pre>');
    var inner = (preStart >= 0 && preEnd > preStart) ? txt.substring(preStart + 5, preEnd) : '';
    var errMsg = inner ? inner.split('&nbsp;').join(' ').split('&lt;').join('').split('&gt;').join('').split(String.fromCharCode(60) + 'br>').join(' ').substring(0, 200) : 'Server error: ' + r.status;
    throw new Error(errMsg);
  }
  var d = await r.json();
  if (!r.ok) throw new Error(d.error || d.message || 'Server error: ' + r.status);
  return d;
}

async function doLogin() {
  const email = document.getElementById('email').value;
  const pass = document.getElementById('pass').value;
  try {
    const r = await fetch('/api/nova-user/appUser/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });
    const d = await r.json();
    if (d.code === 200 && (d.data?.token || d.value?.accessToken)) {
      token = d.data?.token || d.value?.accessToken;
      localStorage.setItem('admin_token', token);
      showApp();
    } else {
      document.getElementById('loginErr').textContent = d.msg || 'Login failed';
    }
  } catch(e) {
    document.getElementById('loginErr').textContent = 'Connection error';
  }
}

function logout() {
  token = '';
  localStorage.removeItem('admin_token');
  document.getElementById('login').style.display = 'block';
  document.getElementById('app').style.display = 'none';
}

function dot(on) { return '<span class="dot '+(on?'dot-on':'dot-off')+'"></span>'; }
function ago(ts) {
  if (!ts) return '-';
  const d = new Date(ts+'Z');
  const s = Math.round((Date.now()-d.getTime())/1000);
  if (s<60) return s+'s ago';
  if (s<3600) return Math.round(s/60)+'m ago';
  if (s<86400) return Math.round(s/3600)+'h ago';
  return Math.round(s/86400)+'d ago';
}

async function showApp() {
  document.getElementById('login').style.display = 'none';
  document.getElementById('firstTimeSetup').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  loadAll();
}

var _refreshInterval = null;
async function loadAll() {
  loadAccount();
  loadMyDevices();
  loadRelayStatus();
  refreshRemoteDevices();
  checkServerUpdate();
  // Auto-refresh device list every 30s for timestamp updates
  if (_refreshInterval) clearInterval(_refreshInterval);
  _refreshInterval = setInterval(function() { if (token) loadMyDevices(); }, 30000);
  // Re-check Hub for newer image every 10 minutes (server side caches 5 min)
  if (_serverUpdateInterval) clearInterval(_serverUpdateInterval);
  _serverUpdateInterval = setInterval(function() { if (token) checkServerUpdate(); }, 10 * 60 * 1000);
}

var _serverUpdateInterval = null;
var _serverUpdateDismissed = '';

async function checkServerUpdate() {
  try {
    const d = await api('/check-server-update');
    if (!d || !d.updateAvailable || d.latest === _serverUpdateDismissed) {
      document.getElementById('serverUpdateBanner').style.display = 'none';
      return;
    }
    const txt = 'Running v' + d.current + ' — Docker Hub has v' + d.latest +
      (d.lastUpdatedAt ? ' (pushed ' + new Date(d.lastUpdatedAt).toLocaleString() + ')' : '');
    document.getElementById('serverUpdateText').textContent = txt;
    document.getElementById('serverUpdateBanner').style.display = 'block';
  } catch (e) {
    // Silent — Hub fetch may fail offline; don't show error to operator.
    document.getElementById('serverUpdateBanner').style.display = 'none';
  }
}

function dismissServerUpdate() {
  // Hide until a NEWER version than the one shown appears.
  const txt = document.getElementById('serverUpdateText').textContent || '';
  const m = txt.match(/Hub has v(\\S+)/);
  if (m) _serverUpdateDismissed = m[1];
  document.getElementById('serverUpdateBanner').style.display = 'none';
}

function showServerUpdateHint() {
  appModal({
    title: 'How to update',
    bodyHtml: 'Pull + restart the OpenNova container on your host:'
      + '<pre style="margin:10px 0;padding:10px 12px;background:#0d0d20;border:1px solid #333;border-radius:6px;color:#86efac;font-family:&quot;Roboto Mono&quot;,ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;overflow-x:auto">docker compose pull\\ndocker compose up -d</pre>'
      + '<div style="font-size:12px;color:#cbd5e1;margin-top:8px">Or if running on a NAS Portainer / Synology setup, trigger an image refresh from the UI.</div>',
    accent: 'info',
    buttons: [{ text: 'OK', primary: true }],
  });
}

// ── Reusable themed modal — replaces native alert() / confirm() so
//    confirmation + info dialogs match the rest of the admin theme.
function appModal(opts) {
  const accent = opts.accent || 'info';
  const accentColors = {
    info: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.5)', fg: '#93c5fd' },
    warning: { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.5)', fg: '#fbbf24' },
    danger: { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.5)', fg: '#fca5a5' },
    success: { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.5)', fg: '#86efac' },
  };
  const c = accentColors[accent] || accentColors.info;

  return new Promise(function(resolve) {
    var backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px';

    var card = document.createElement('div');
    card.style.cssText = 'max-width:440px;width:100%;background:#0f0f23;border:1px solid ' + c.border + ';border-radius:14px;padding:22px;box-shadow:0 10px 40px rgba(0,0,0,0.5)';

    var title = document.createElement('div');
    title.style.cssText = 'font-size:16px;font-weight:700;color:' + c.fg + ';margin-bottom:10px';
    title.textContent = opts.title || '';
    card.appendChild(title);

    var body = document.createElement('div');
    body.style.cssText = 'font-size:13px;color:#e5e7eb;line-height:1.5;margin-bottom:16px;white-space:pre-line';
    if (opts.bodyHtml) body.innerHTML = opts.bodyHtml;
    else if (opts.body) body.textContent = opts.body;
    card.appendChild(body);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap';
    var buttons = (opts.buttons && opts.buttons.length) ? opts.buttons : [{ text: 'OK', primary: true }];
    buttons.forEach(function(b) {
      var btn = document.createElement('button');
      btn.textContent = b.text;
      var primary = !!b.primary;
      var destructive = b.style === 'destructive';
      var bg = destructive ? '#ef4444' : (primary ? c.fg : 'rgba(255,255,255,0.06)');
      var fg = (destructive || primary) ? '#0f0f23' : '#e5e7eb';
      var borderColor = destructive ? '#ef4444' : (primary ? c.fg : 'rgba(255,255,255,0.12)');
      btn.style.cssText = 'padding:8px 18px;border-radius:8px;border:1px solid ' + borderColor + ';background:' + bg + ';color:' + fg + ';font-size:13px;font-weight:600;cursor:pointer';
      btn.addEventListener('click', function() {
        // Read any caller-provided onClick BEFORE removing the backdrop so
        // it can still query input values inside the modal.
        var ret;
        if (b.onClick) ret = b.onClick();
        document.body.removeChild(backdrop);
        resolve(ret !== undefined ? ret : (b.value !== undefined ? b.value : b.text));
      });
      btnRow.appendChild(btn);
    });
    card.appendChild(btnRow);

    backdrop.appendChild(card);
    backdrop.addEventListener('click', function(e) {
      if (e.target === backdrop && opts.dismissOnBackdrop !== false) {
        document.body.removeChild(backdrop);
        resolve(null);
      }
    });
    document.body.appendChild(backdrop);
  });
}

// Drop-in replacements for native alert() / confirm() — themed, async.
function appAlert(message, opts) {
  opts = opts || {};
  var accent = opts.accent || 'info';
  var defaultTitle = accent === 'danger' ? 'Error'
    : accent === 'warning' ? 'Heads up'
    : accent === 'success' ? 'Done'
    : 'Notice';
  return appModal({
    title: opts.title || defaultTitle,
    body: message,
    accent: accent,
    buttons: [{ text: 'OK', primary: true }],
  });
}

function appConfirm(message, opts) {
  opts = opts || {};
  var destructive = !!opts.destructive;
  var accent = opts.accent || (destructive ? 'danger' : 'warning');
  return appModal({
    title: opts.title || 'Confirm',
    body: message,
    accent: accent,
    dismissOnBackdrop: false,
    buttons: [
      { text: opts.cancelText || 'Cancel', value: false },
      {
        text: opts.okText || 'Continue',
        primary: !destructive,
        style: destructive ? 'destructive' : undefined,
        value: true,
      },
    ],
  }).then(function(v) { return v === true; });
}

function renderServerChips(s) {
  return '<span class="chip chip-version" title="Server version"><span class="chip-dot"></span>v' + (s.version || '?') + '</span>'
    + '<span class="chip chip-uptime" title="Uptime">⏱ ' + s.uptimeFormatted + '</span>'
    + '<span class="chip chip-ram" title="Memory">⚡ ' + s.memoryMB + ' MB</span>';
}

async function loadAccount() {
  try {
    const d = await api('/overview');
    const s = d.server;
    document.getElementById('serverInfo').innerHTML = renderServerChips(s);
    var resPill = document.getElementById('resVersionPill');
    if (resPill) resPill.textContent = 'v' + (s.version || '?');
    const u = d.currentUser || {};
    document.getElementById('account').innerHTML =
      '<div class="row"><span class="label">Email</span><span class="value">' + (u.email || '-') + '</span></div>' +
      '<div class="row"><span class="label">Role</span><span class="value"><span class="badge badge-admin">' + (u.is_admin ? 'admin' : 'user') + '</span></span></div>' +
      '<div class="row"><span class="label">Devices</span><span class="value">' + d.counts.equipment + ' registered · ' + d.counts.devices + ' seen</span></div>' +
      '<div class="row"><span class="label">Maps</span><span class="value">' + d.counts.maps + '</span></div>';
  } catch { document.getElementById('account').textContent = 'Failed to load'; }
}
// Refresh uptime every 30s
setInterval(async function() {
  try {
    var d = await api('/overview');
    document.getElementById('serverInfo').innerHTML = renderServerChips(d.server);
  } catch {}
}, 30000);

function devRow(dev) {
  const online = dev.is_online;
  const isCharger = dev.device_type === 'charger';
  const icon = isCharger ? '⚡' : '🤖';
  const typeColor = isCharger ? '#f59e0b' : '#00d4aa';
  const typeName = isCharger ? 'Charger' : 'Mower';
  const bound = dev.is_bound;
  const fw = dev.firmware_version || '';
  // is_opennova flag wordt server-side gezet door de MQTT extended_commands
  // detect handler — requireert dat het device ONLINE is. Offline devices
  // krijgen dan per ongeluk "Stock". Als de firmware-string "custom" of
  // "opennova" bevat, is het sowieso custom firmware. Derive lokaal voor
  // de badge zodat offline custom-XX mowers niet onterecht als Stock tonen.
  const fwLower = (fw || '').toLowerCase();
  const isON = dev.is_opennova || fwLower.indexOf('custom') >= 0 || fwLower.indexOf('opennova') >= 0;
  var fwBadge = '';
  if (fw) {
    if (isON) {
      fwBadge = '<span style="font-size:9px;background:rgba(0,212,170,.15);color:#00d4aa;padding:1px 6px;border-radius:3px;font-weight:600">OpenNova</span>';
    } else {
      fwBadge = '<span style="font-size:9px;background:rgba(245,158,11,.15);color:#f59e0b;padding:1px 6px;border-radius:3px;font-weight:600">Stock</span>';
    }
  }
  var activeBadge = '';
  if (!isCharger && dev.is_active) {
    activeBadge = '<span style="font-size:9px;background:rgba(124,58,237,.2);color:#a78bfa;padding:1px 6px;border-radius:3px;font-weight:600;margin-left:4px">Active</span>';
  }

  // Health badges — LoRa pair mismatch + mower_error gateway state.
  // Rendered next to the firmware/active chips so issues are visible at a glance.
  var healthBadges = '';
  var h = dev.health;
  if (h && h.loraPair && !h.loraPair.ok && h.loraPair.charger && h.loraPair.mower) {
    var fields = [];
    if (h.loraPair.issues.indexOf('addr-mismatch') >= 0) fields.push('addr');
    if (h.loraPair.issues.indexOf('channel-mismatch') >= 0) fields.push('channel');
    if (fields.length > 0) {
      var pairTitle = 'LoRa pair mismatch (' + fields.join(' + ') + ')'
        + ' — charger ' + h.loraPair.charger.addr + '/ch' + h.loraPair.charger.channel
        + ' vs mower ' + h.loraPair.mower.addr + '/ch' + h.loraPair.mower.channel;
      healthBadges += '<span title="' + pairTitle + '" style="font-size:9px;background:rgba(239,68,68,.18);color:#fca5a5;padding:1px 6px;border-radius:3px;font-weight:600;margin-left:4px;cursor:help">⚠ LoRa ' + fields.join('+') + '</span>';
    }
  }
  if (h && h.mowerError) {
    healthBadges += '<span title="mower_error ' + h.mowerError.code + ': ' + h.mowerError.label + '" style="font-size:9px;background:rgba(239,68,68,.18);color:#fca5a5;padding:1px 6px;border-radius:3px;font-weight:600;margin-left:4px;cursor:help">⚠ Err ' + h.mowerError.code + '</span>';
  }
  activeBadge += healthBadges;
  // Layout: één primaire actieknop (Activate/Deactivate voor mowers, niets
  // voor chargers) + kebab-menu (⋯) met destructieve / minder-gebruikte
  // opties (Unbind, Delete + Banish). Houdt rijen compact en visueel rustig.
  const btnBase = 'font-size:11px;padding:4px 12px;border-radius:6px;font-weight:600;margin-left:6px';
  let actions = '';
  if (bound) {
    if (!isCharger) {
      actions += dev.is_active
        ? '<button class="btn btn-sm" style="background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.4);min-width:90px;' + btnBase + '" title="Click to deactivate this mower" onclick="deactivateDevice(\\'' + dev.sn + '\\')">Deactivate</button>'
        : '<button class="btn btn-sm" style="background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.4);min-width:90px;' + btnBase + '" title="Set this mower as the active one" onclick="setActiveDevice(\\'' + dev.sn + '\\')">Activate</button>';
    }
    // Kebab menu — popover met Unbind + Delete + Banish. Inline HTML zonder
    // extra deps, JS toggle in onclick. Click-outside-to-close zit in
    // closeAllDeviceMenus(), aangeroepen door document-level listener
    // (hieronder, eenmalig).
    actions += '<span class="dev-menu" style="position:relative;display:inline-block;margin-left:6px;vertical-align:middle">'
      + '<button class="btn btn-sm dev-menu-btn" style="background:rgba(255,255,255,.04);color:#aaa;border:1px solid rgba(255,255,255,.1);min-width:32px;font-size:14px;padding:3px 10px;border-radius:6px;font-weight:700" onclick="event.stopPropagation();toggleDeviceMenu(this)" title="More actions">⋯</button>'
      + '<div class="dev-menu-pop" style="display:none;position:absolute;right:0;top:100%;margin-top:4px;background:#161628;border:1px solid rgba(255,255,255,.12);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.5);z-index:50;min-width:180px;overflow:hidden">'
      +   '<button class="dev-menu-item" style="display:block;width:100%;text-align:left;padding:10px 14px;background:transparent;border:0;color:#ddd;font-size:12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05)" onclick="closeAllDeviceMenus();unbindDevice(\\'' + dev.sn + '\\')" onmouseover="this.style.background=\\'rgba(255,255,255,.05)\\'" onmouseout="this.style.background=\\'transparent\\'">Unbind</button>'
      +   '<button class="dev-menu-item" style="display:block;width:100%;text-align:left;padding:10px 14px;background:transparent;border:0;color:#ef4444;font-size:12px;cursor:pointer" onclick="closeAllDeviceMenus();banishDevice(\\'' + dev.sn + '\\')" onmouseover="this.style.background=\\'rgba(239,68,68,.08)\\'" onmouseout="this.style.background=\\'transparent\\'" title="Delete + block MQTT reconnect for 30min (for re-provisioning via Novabot app)">Delete + Banish</button>'
      + '</div>'
      + '</span>';
  } else {
    actions += '<button class="btn btn-sm btn-green" style="min-width:64px;' + btnBase + '" onclick="bindDevice(\\'' + dev.sn + '\\')">Bind</button>' +
      '<button class="btn btn-sm btn-red" style="min-width:64px;' + btnBase + '" onclick="removeDevice(\\'' + dev.sn + '\\')">Remove</button>';
  }
  var loraCell = '';
  if (dev.lora_address) {
    var chPart = dev.lora_channel ? ' · ch' + dev.lora_channel : '';
    // Edit button — alleen voor MOWERS met OpenNova firmware.
    // Chargers (ESP32) accepteren set_lora_info NIET via MQTT —
    // bewezen met log-capture 2026-04-21: get_lora_info respond OK,
    // set_lora_info silent-ignored. Voor charger-LoRa wijzigen moet
    // je BLE re-provisioning gebruiken.
    var canEdit = online && !isCharger && dev.is_opennova;
    var editBtn = canEdit
      ? '<button class="lora-edit-btn" title="Edit LoRa via MQTT" onclick="openLoraEditor(\\'' + dev.sn + '\\', ' + dev.lora_address + ', ' + (dev.lora_channel || 'null') + ')" style="margin-left:4px;background:transparent;border:none;color:#888;cursor:pointer;padding:0;font-size:11px">✏️</button>'
      : '';
    loraCell = '<span class="lora-chip" title="LoRa addr / channel">📡 ' + dev.lora_address + chPart + '</span>' + editBtn;
  } else if (online) {
    // Stock mowers (no OpenNova) ignore get_lora_info; query the paired charger instead —
    // broker.ts spiegelt charger's addr+channel 1:1 naar de mower cache
    // (mower en charger staan op hetzelfde LoRa-paar, zie working-lora-pair).
    var canQueryDirect = isCharger || dev.is_opennova;
    var querySn = canQueryDirect ? dev.sn : (dev.paired_with || '');
    var queryType = canQueryDirect ? dev.device_type : 'charger';
    if (querySn) {
      var title = canQueryDirect ? 'Query LoRa config via MQTT' : 'Query paired charger (stock firmware ignores direct mower query)';
      loraCell = '<span class="lora-missing" title="' + title + '" onclick="queryLora(\\'' + querySn + '\\', \\'' + queryType + '\\')">LoRa ?</span>';
    } else {
      loraCell = '<span style="font-size:10px;color:#555">—</span>';
    }
  } else {
    loraCell = '<span style="font-size:10px;color:#555">—</span>';
  }
  return '<div class="dev-row">' +
    '<span style="color:' + typeColor + '">' + icon + ' ' + typeName + '</span>' +
    '<span class="sn">' + (dev.sn || '-') + '</span>' +
    '<span style="color:#888">' + (fw || '') + '</span>' +
    '<span>' + fwBadge + '</span>' +
    '<span>' + loraCell + '</span>' +
    '<span style="white-space:nowrap">' + dot(online) + (online ? '<span class="on">Online</span>' : '<span class="off">Offline</span>') + '</span>' +
    '<span style="text-align:right;white-space:nowrap">' + actions + '</span>' +
    '</div>';
}

async function queryLora(sn, deviceType) {
  try {
    var path = deviceType === 'charger' ? '/lora/query-charger/' + sn : '/lora/query-mower/' + sn;
    showToast('Querying LoRa config from ' + sn + '...', 'blue');
    var r = await fetch('/api/dashboard' + path, { method: 'POST', headers: { 'Authorization': token } });
    if (!r.ok) {
      var err = await r.json().catch(function() { return { error: 'Query failed' }; });
      throw new Error(err.error || 'Query failed');
    }
    showToast('LoRa config received', 'green');
    loadMyDevices();
  } catch (e) {
    modalAlert('LoRa Query Failed', e.message);
  }
}

async function loadMyDevices() {
  try {
    const [d, pendingResp, bannedResp] = await Promise.all([
      api('/devices'),
      fetch('/api/dashboard/lora/pending', { headers: { 'Authorization': token } })
        .then(function(r) { return r.ok ? r.json() : { ok: false, pending: [] }; })
        .catch(function() { return { ok: false, pending: [] }; }),
      fetch('/api/admin-status/banned-devices', { headers: { 'Authorization': token } })
        .then(function(r) { return r.ok ? r.json() : { banned: [] }; })
        .catch(function() { return { banned: [] }; }),
    ]);
    const devs = d.devices || [];
    const pending = (pendingResp && pendingResp.pending) || [];
    const banned = (bannedResp && bannedResp.banned) || [];
    if (!devs.length && !pending.length && !banned.length) { document.getElementById('myDevices').textContent = 'No devices found. Import from cloud or wait for devices to connect via MQTT.'; return; }

    let html = '';

    // ── Banned devices bar ────────────────────────────────────────────
    // Toont SN's die via "Delete + Banish" geblokkeerd zijn. Broker weigert
    // hun CONNECT tot de ban expireert of de user handmatig unbanned.
    if (banned.length > 0) {
      html += '<div style="margin-bottom:12px;padding:12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:10px">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
      html += '<span style="font-size:12px;font-weight:600;color:#ef4444">\u26D4 Banned (MQTT reconnect geblokkeerd)</span>';
      html += '<span style="font-size:11px;color:#888">Use this window to re-provision via the Novabot app</span>';
      html += '</div>';
      for (var bi = 0; bi < banned.length; bi++) {
        var b = banned[bi];
        var minsLeft = Math.ceil(b.msRemaining / 60000);
        html += '<div style="display:flex;align-items:center;gap:10px;padding:8px;background:rgba(255,255,255,.03);border-radius:8px;margin-bottom:4px">';
        html += '<span style="font-size:18px">\uD83D\uDEAB</span>';
        html += '<div style="flex:1">';
        html += '<div style="color:#fecaca;font-weight:600;font-size:14px">' + b.sn + '</div>';
        html += '<div style="color:#888;font-size:11px">ban expires in ' + minsLeft + ' min (' + new Date(b.expiresAt).toLocaleTimeString() + ')</div>';
        html += '</div>';
        html += '<button onclick="unbanishDevice(\\'' + b.sn + '\\')" style="background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.4);color:#22c55e;font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer;font-weight:600">Unban now</button>';
        html += '</div>';
      }
      html += '</div>';
    }

    // ── Pending provisioning section (top — most recent user action) ──
    // Toont reserveringen gemaakt via POST /lora/resolve die nog niet
    // geclaimd zijn door een online MQTT device. Wordt automatisch
    // verborgen als de mower boot en broker de pending row promoteert.
    if (pending.length > 0) {
      html += '<div style="margin-bottom:12px;padding:12px;background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.3);border-radius:10px">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
      html += '<span style="font-size:12px;font-weight:600;color:#a78bfa">\u23F3 Provisioning pending</span>';
      html += '<span style="font-size:11px;color:#888">Waiting for first MQTT connect…</span>';
      html += '</div>';
      for (var i = 0; i < pending.length; i++) {
        var p = pending[i];
        var ageText = p.ageSeconds != null
          ? (p.ageSeconds < 60 ? p.ageSeconds + 's ago' : Math.floor(p.ageSeconds / 60) + 'm ago')
          : '';
        var icon = p.type === 'charger' ? '\u26A1' : '\uD83D\uDD27';
        var typeLabel = p.type === 'charger' ? 'Charger' : 'Mower';
        html += '<div style="display:flex;align-items:center;gap:10px;padding:8px;background:rgba(255,255,255,.03);border-radius:8px;margin-bottom:4px">';
        html += '<span style="font-size:18px">' + icon + '</span>';
        html += '<div style="flex:1">';
        html += '<div style="color:#e2d1ff;font-weight:600;font-size:14px">' + typeLabel + '</div>';
        html += '<div style="color:#888;font-size:11px">LoRa ' + p.address + '/ch' + p.channel + ' · reserved ' + ageText + '</div>';
        html += '</div>';
        html += '<button onclick="cancelPending(\\'' + p.pendingSn + '\\')" style="background:transparent;border:1px solid rgba(239,68,68,.4);color:#ef4444;font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer">Cancel</button>';
        html += '</div>';
      }
      html += '</div>';
    }

    if (!devs.length) {
      document.getElementById('myDevices').innerHTML = html;
      return;
    }

    // Group by equipment pairing (paired_with), then solo, then unbound
    const paired = {};    // key = sorted SN pair → [dev, dev]
    const solo = [];      // bound but not paired
    const unbound = [];   // not bound at all

    for (const dev of devs) {
      if (!dev.is_bound) {
        unbound.push(dev);
      } else if (dev.paired_with) {
        var key = [dev.sn, dev.paired_with].sort().join(':');
        if (!paired[key]) paired[key] = [];
        paired[key].push(dev);
      } else {
        solo.push(dev);
      }
    }

    // Render paired sets
    for (const key in paired) {
      const group = paired[key];
      const charger = group.find(function(d) { return d.device_type === 'charger'; });
      const mower = group.find(function(d) { return d.device_type === 'mower'; });
      const anyOnline = group.some(function(d) { return d.is_online; });
      var chargerLora = charger && charger.lora_address
        ? charger.lora_address + (charger.lora_channel ? '/ch' + charger.lora_channel : '')
        : null;
      var mowerLora = mower && mower.lora_address
        ? mower.lora_address + (mower.lora_channel ? '/ch' + mower.lora_channel : '')
        : null;
      var loraSummary = '';
      if (chargerLora || mowerLora) {
        var parts = [];
        if (chargerLora) parts.push('Charger ' + chargerLora);
        if (mowerLora) parts.push('Mower ' + mowerLora);
        loraSummary = '\uD83D\uDCE1 ' + parts.join(' · ');
      } else {
        loraSummary = 'LoRa pending...';
      }

      html += '<div style="margin-bottom:12px;padding:12px;background:rgba(255,255,255,.02);border:1px solid ' + (anyOnline ? 'rgba(0,212,170,.2)' : 'rgba(255,255,255,.06)') + ';border-radius:10px">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">';
      html += '<span style="font-size:12px;font-weight:600;color:#00d4aa">\uD83D\uDD17 Paired Set</span>';
      html += '<span style="font-size:11px;color:#888">' + loraSummary + '</span>';
      html += '</div>';
      for (const dev of group) { html += devRow(dev); }
      html += '</div>';
    }

    // Render solo bound devices (charger or mower without partner)
    if (solo.length > 0) {
      html += '<div style="margin-bottom:12px;padding:12px;background:rgba(255,255,255,.02);border:1px solid rgba(245,158,11,.15);border-radius:10px">';
      html += '<div style="margin-bottom:4px"><span style="font-size:12px;font-weight:600;color:#f59e0b">Waiting for partner</span></div>';
      html += '<div style="padding:4px 8px;margin-bottom:6px"><span style="color:#aaa;font-size:11px">' +
        'Bound to your account. The partner device (charger or mower) will be paired automatically when it connects.</span></div>';
      for (const dev of solo) { html += devRow(dev); }
      html += '</div>';
    }

    // Render unbound devices
    if (unbound.length > 0) {
      html += '<div style="margin-bottom:12px;padding:12px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:10px">';
      html += '<div style="margin-bottom:4px"><span style="font-size:12px;font-weight:600;color:#aaa">New Devices</span></div>';
      html += '<div style="padding:4px 8px;margin-bottom:6px"><span style="color:#aaa;font-size:11px">' +
        'Connected via MQTT but not yet bound to your account. They will be auto-bound shortly, or click Bind.</span></div>';
      for (const dev of unbound) { html += devRow(dev); }
      html += '</div>';
    }

    document.getElementById('myDevices').innerHTML = html;

    // Auto-query LoRa config for online devices missing cache data (once per session).
    // Mower query only works on OpenNova firmware (extended_commands.py handler);
    // stock mqtt_node ignores get_lora_info, so skip to avoid 10s wait.
    window._loraAutoQueried = window._loraAutoQueried || new Set();
    window._onAutoDetected = window._onAutoDetected || new Set();
    for (const dev of devs) {
      if (dev.is_online && dev.device_type === 'mower' && !dev.is_opennova && !window._onAutoDetected.has(dev.sn)) {
        window._onAutoDetected.add(dev.sn);
        (function(mowerSn) {
          fetch('/api/dashboard/opennova/detect/' + mowerSn, { method: 'POST', headers: { 'Authorization': token } })
            .then(function(r) { return r.json(); })
            .then(function(d) {
              if (d && d.isOpenNova) {
                // Also query LoRa directly from the mower (not derived from charger).
                fetch('/api/dashboard/lora/query-mower/' + mowerSn, { method: 'POST', headers: { 'Authorization': token } })
                  .finally(function() { setTimeout(loadMyDevices, 300); });
                window._loraAutoQueried.add(mowerSn);
              }
            })
            .catch(function() {});
        })(dev.sn);
      }
      if (!dev.is_online || dev.lora_address || window._loraAutoQueried.has(dev.sn)) continue;
      if (dev.device_type === 'charger') {
        window._loraAutoQueried.add(dev.sn);
        fetch('/api/dashboard/lora/query-charger/' + dev.sn, { method: 'POST', headers: { 'Authorization': token } })
          .then(function(r) { if (r.ok) setTimeout(loadMyDevices, 500); })
          .catch(function() { /* manual LoRa ? button still works */ });
      } else if (dev.device_type === 'mower' && dev.is_opennova) {
        window._loraAutoQueried.add(dev.sn);
        fetch('/api/dashboard/lora/query-mower/' + dev.sn, { method: 'POST', headers: { 'Authorization': token } })
          .then(function(r) { if (r.ok) setTimeout(loadMyDevices, 500); })
          .catch(function() {});
      }
    }
  } catch { document.getElementById('myDevices').textContent = 'Failed to load'; }
}

function logout() {
  token = '';
  localStorage.removeItem('admin_token');
  location.reload();
}

async function bindDevice(sn) {
  try {
    await api('/bind-device', 'POST', { sn });
    loadMyDevices();
  } catch(e) { modalAlert('Bind Failed', e.message); }
}

async function cancelPending(pendingSn) {
  var ok = await modalConfirm('Cancel Provisioning', 'Release the reserved LoRa address for <b>' + pendingSn + '</b>?<br><br>The device will not auto-pair when it comes online.');
  if (!ok) return;
  try {
    await fetch('/api/dashboard/lora/pending/' + encodeURIComponent(pendingSn), {
      method: 'DELETE',
      headers: { 'Authorization': token },
    });
    loadMyDevices();
  } catch(e) { modalAlert('Cancel Failed', e.message || String(e)); }
}

// ── Device kebab menu ──────────────────────────────────────────────────
// Click-outside-to-close: één document-level listener gestart bij eerste
// open, niet per device. Idempotent — meerdere registraties zijn een no-op.
function closeAllDeviceMenus() {
  document.querySelectorAll('.dev-menu-pop').forEach(function(p) {
    p.style.display = 'none';
  });
}
function toggleDeviceMenu(btn) {
  var pop = btn.parentElement.querySelector('.dev-menu-pop');
  var isOpen = pop.style.display === 'block';
  closeAllDeviceMenus();
  if (!isOpen) pop.style.display = 'block';
}
if (!window.__devMenuOutsideClick) {
  window.__devMenuOutsideClick = true;
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.dev-menu')) closeAllDeviceMenus();
  });
}

async function setActiveDevice(sn) {
  try {
    await api('/set-active-device', 'POST', { sn });
    showToast(sn + ' set as active device', 'green');
    loadMyDevices();
  } catch(e) { modalAlert('Failed', e.message); }
}

// Live LoRa editor — send new addr/channel via MQTT extended_commands
// (set_lora_info) and verify via get_lora_info response from the mower.
// Success = mower reports back the exact same addr/channel we sent.
// This bypasses BLE (no re-provisioning needed).
window._loraEditPending = null;
async function openLoraEditor(sn, currentAddr, currentChannel) {
  // Route depends on device type:
  //   Charger (LFIC*): standard MQTT via /api/dashboard/command/<SN>
  //                    responses come on socket event 'command:respond'
  //   Mower   (LFIN*): extended_commands via /api/dashboard/extended/<SN>
  //                    responses come on socket event 'extended:response'
  var isCharger = /^LFIC/i.test(sn);
  var apiPath = isCharger ? '/api/dashboard/command/' : '/api/dashboard/extended/';
  var socketEvent = isCharger ? 'command:respond' : 'extended:response';
  // Build modal
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px';
  overlay.innerHTML =
    '<div style="background:#1a1a2e;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:20px;max-width:420px;width:100%;font-size:13px;color:#e2e2e2">' +
      '<div style="font-size:16px;font-weight:700;margin-bottom:4px">Edit LoRa — ' + sn + '</div>' +
      '<div style="color:#888;font-size:12px;margin-bottom:16px">Current: <b>' + currentAddr + '</b> / ch<b>' + (currentChannel || '?') + '</b></div>' +
      '<div style="margin-bottom:12px">' +
        '<label style="display:block;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">New address</label>' +
        '<input id="lora-edit-addr" type="number" value="' + currentAddr + '" style="width:100%;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);color:#fff;font-size:14px">' +
      '</div>' +
      '<div style="margin-bottom:16px">' +
        '<label style="display:block;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">New channel</label>' +
        '<input id="lora-edit-ch" type="number" value="' + (currentChannel || 16) + '" style="width:100%;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);color:#fff;font-size:14px">' +
      '</div>' +
      '<div id="lora-edit-status" style="min-height:36px;padding:10px;border-radius:8px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);font-size:12px;color:#888;margin-bottom:12px">Ready to send. Click Save to apply.</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button id="lora-edit-cancel" class="btn btn-sm" style="background:rgba(255,255,255,.04);color:#aaa;border:1px solid rgba(255,255,255,.1);padding:8px 16px;border-radius:8px;font-weight:600">Cancel</button>' +
        '<button id="lora-edit-save" class="btn btn-sm" style="background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.4);padding:8px 16px;border-radius:8px;font-weight:600">Save + Verify</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  var status = overlay.querySelector('#lora-edit-status');
  var setStatus = function(text, color) {
    status.textContent = text;
    status.style.color = color || '#888';
  };
  var cleanup = function() {
    window._loraEditPending = null;
    overlay.remove();
  };
  overlay.querySelector('#lora-edit-cancel').onclick = cleanup;
  overlay.onclick = function(e) { if (e.target === overlay) cleanup(); };

  overlay.querySelector('#lora-edit-save').onclick = async function() {
    var newAddr = parseInt(overlay.querySelector('#lora-edit-addr').value, 10);
    var newCh = parseInt(overlay.querySelector('#lora-edit-ch').value, 10);
    if (!Number.isFinite(newAddr) || !Number.isFinite(newCh)) {
      setStatus('Invalid addr or channel', '#ef4444');
      return;
    }

    // Helper: POST naar juiste endpoint (command= charger, extended= mower).
    // Charger MQTT verwacht {cmd: {...}} wrapper; extended doet plat.
    var postCmd = function(body) {
      var payload = isCharger ? { command: body } : body;
      return fetch(apiPath + encodeURIComponent(sn), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify(payload),
      });
    };

    // Payload verschilt: charger wil hc/lc, mower (extended) neemt {addr,channel}
    var setPayload = isCharger
      ? { set_lora_info: { addr: newAddr, channel: newCh, hc: 20, lc: 14 } }
      : { set_lora_info: { addr: newAddr, channel: newCh } };
    var getPayload = isCharger
      ? { get_lora_info: null }
      : { get_lora_info: {} };

    window._loraEditPending = {
      sn: sn,
      phase: 'set',
      isCharger: isCharger,
      expectedAddr: newAddr,
      expectedCh: newCh,
      onSetRespond: function(body) {
        if (body && (body.result === 0 || body.result === 1)) {
          setStatus('Set OK. Querying back for verification...', '#a78bfa');
          window._loraEditPending.phase = 'verify';
          postCmd(getPayload).catch(function(e) {
            setStatus('Readback send failed: ' + e.message, '#ef4444');
          });
        } else {
          setStatus('set_lora_info rejected (result=' + (body && body.result) + ')', '#ef4444');
          window._loraEditPending = null;
        }
      },
      onGetRespond: function(body) {
        // Charger body: {result:0, value:{addr, channel, hc, lc}}
        // Mower   body: {result:0, addr, channel, hc, lc}
        var actual = body && (body.value || body);
        if (!body || body.result !== 0 || !actual || actual.addr == null) {
          setStatus('get_lora_info failed (result=' + (body && body.result) + ')', '#ef4444');
        } else if (Number(actual.addr) === newAddr && Number(actual.channel) === newCh) {
          setStatus('✅ Verified on device: addr=' + actual.addr + ' ch=' + actual.channel, '#22c55e');
          setTimeout(function() { cleanup(); loadMyDevices(); }, 1500);
          return;
        } else {
          setStatus('⚠ Mismatch — device reports addr=' + actual.addr + ' ch=' + actual.channel, '#f59e0b');
          setTimeout(function() { cleanup(); loadMyDevices(); }, 2500);
          return;
        }
        window._loraEditPending = null;
      },
    };

    setStatus('Sending set_lora_info addr=' + newAddr + ' ch=' + newCh + '...', '#a78bfa');
    try {
      var res = await postCmd(setPayload);
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch (e) {
      setStatus('Send failed: ' + e.message, '#ef4444');
      window._loraEditPending = null;
    }

    // 10s global timeout
    setTimeout(function() {
      if (window._loraEditPending) {
        setStatus('Timeout — no response from device within 10s', '#ef4444');
        window._loraEditPending = null;
      }
    }, 10000);
  };
}

// Socket handler voor charger "command:respond" events — wordt opgevangen
// door de main socket listener (zie setupSocketListeners).
function mdHandleCommandRespond(ev) {
  if (!window._loraEditPending) return;
  if (ev.sn !== window._loraEditPending.sn) return;
  if (!window._loraEditPending.isCharger) return; // mower volgt extended
  var p = window._loraEditPending;
  if (ev.command === 'set_lora_info_respond' && p.phase === 'set' && typeof p.onSetRespond === 'function') {
    p.onSetRespond(ev.data);
  } else if (ev.command === 'get_lora_info_respond' && p.phase === 'verify' && typeof p.onGetRespond === 'function') {
    p.onGetRespond(ev.data);
  }
}

async function deactivateDevice(sn) {
  try {
    await api('/deactivate-device', 'POST', { sn });
    showToast(sn + ' deactivated', 'amber');
    loadMyDevices();
  } catch(e) { modalAlert('Failed', e.message); }
}

async function banishDevice(sn) {
  var ok = await modalConfirm(
    'Delete + Banish device',
    'Delete <b>' + sn + '</b> from the dashboard <u>and</u> block MQTT reconnects + auto-bind for 2 hours?<br><br>' +
    'Use this if you want to re-provision the device via the official Novabot app. ' +
    'Maps and schedules stay in the DB. The device will be rejected by the broker until the ban expires ' +
    '(or you unbanish via the banned bar at the top).'
  );
  if (!ok) return;
  try {
    await api('/banish-device', 'POST', { sn, minutes: 120 });
    showToast(sn + ' deleted + banned for 2h', 'amber');
    loadMyDevices();
  } catch(e) { modalAlert('Banish Failed', e.message || String(e)); }
}

async function unbanishDevice(sn) {
  try {
    await api('/unbanish-device', 'POST', { sn });
    showToast(sn + ' unbanned', 'green');
    loadMyDevices();
  } catch(e) { modalAlert('Unban Failed', e.message || String(e)); }
}

async function unbindDevice(sn) {
  var ok = await modalConfirm('Unbind Device', 'Unbind <b>' + sn + '</b> from your account?');
  if (!ok) return;
  try {
    await api('/unbind-device', 'POST', { sn });
    loadMyDevices();
  } catch(e) { modalAlert('Unbind Failed', e.message); }
}

async function removeDevice(sn) {
  var ok = await modalConfirm('Remove Device', 'Remove <b>' + sn + '</b>? This deletes it from the database.');
  if (!ok) return;
  try {
    await api('/remove-device', 'POST', { sn });
    loadMyDevices();
  } catch(e) { modalAlert('Remove Failed', e.message); }
}

async function pairMowerCharger(mowerSn, chargerSn) {
  try {
    await api('/pair-devices', 'POST', { mowerSn, chargerSn });
    await modalAlert('Paired!', 'Mower <b>' + mowerSn + '</b> paired with charger <b>' + chargerSn + '</b>.');
    loadMyDevices();
  } catch(e) { modalAlert('Pair Failed', e.message); }
}

var dnsmasqRunning = false;

async function checkDnsmasqStatus() {
  try {
    var r = await fetch('/api/admin-status/dnsmasq', { headers: { 'Authorization': token } });
    var d = await r.json();
    dnsmasqRunning = d.running;
    var btn = document.getElementById('dnsmasqBtn');
    var status = document.getElementById('dnsmasqStatus');
    if (d.running) {
      btn.textContent = 'Stop';
      btn.className = 'btn';
      btn.style.cssText = 'font-size:11px;padding:4px 12px;min-width:60px;background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.2);border-radius:6px;cursor:pointer';
      status.textContent = 'Running';
      status.style.color = '#22c55e';
    } else {
      btn.textContent = 'Start';
      btn.className = 'btn';
      btn.style.cssText = 'font-size:11px;padding:4px 12px;min-width:60px;background:rgba(34,197,94,.15);color:#86efac;border:1px solid rgba(34,197,94,.2);border-radius:6px;cursor:pointer';
      status.textContent = 'Stopped';
      status.style.color = '#aaa';
    }
  } catch { /* ignore */ }
}

async function toggleDnsmasq() {
  var btn = document.getElementById('dnsmasqBtn');
  btn.textContent = '...';
  try {
    await fetch('/api/admin-status/dnsmasq', {
      method: 'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enable: !dnsmasqRunning })
    });
    await checkDnsmasqStatus();
    checkDns();
  } catch(e) { btn.textContent = 'Error'; }
}

async function restartMdns() {
  var status = document.getElementById('mdnsStatus');
  status.style.display = 'block';
  status.style.background = 'rgba(245,158,11,.1)';
  status.style.color = '#fde68a';
  status.textContent = 'Restarting mDNS advertiser...';

  try {
    var r = await fetch('/api/admin-status/mdns-restart', {
      method: 'POST',
      headers: { 'Authorization': token },
    });
    var data = await r.json();
    if (!r.ok || !data.ok) {
      status.style.background = 'rgba(239,68,68,.15)';
      status.style.color = '#fca5a5';
      status.textContent = 'Failed: ' + (data.error || ('HTTP ' + r.status));
      return;
    }
    status.style.background = 'rgba(34,197,94,.15)';
    status.style.color = '#86efac';
    var ad = data.advertisement || {};
    var hostInfo = ad.host ? ad.host : '(no advertisement)';
    status.textContent = 'Restarted at ' + new Date(data.restartedAt).toLocaleTimeString() + ' — ' + hostInfo;
  } catch (err) {
    status.style.background = 'rgba(239,68,68,.15)';
    status.style.color = '#fca5a5';
    status.textContent = 'Network error: ' + (err && err.message ? err.message : err);
  }
}

async function checkDns() {
  var el = document.getElementById('dnsResults');
  el.innerHTML = '<div style="color:#aaa">Checking DNS...</div>';
  try {
    var r = await fetch('/api/admin-status/dns-check', { headers: { 'Authorization': token } });
    var d = await r.json();
    var html = '<div style="display:flex;flex-direction:column;gap:6px">';
    html += '<div style="display:flex;justify-content:space-between;padding:6px 10px;background:rgba(255,255,255,.03);border-radius:6px"><span style="color:#aaa">Server IP</span><span style="color:#fff;font-weight:600">' + (d.serverIp || '?') + '</span></div>';
    for (var i = 0; i < (d.domains || []).length; i++) {
      var dom = d.domains[i];
      var ok = dom.ok;
      var color = ok ? '#22c55e' : '#ef4444';
      var icon = ok ? '✓' : '✗';
      var detail = dom.resolvedIp ? dom.resolvedIp : dom.error || 'not resolved';
      var label = ok ? '(local)' : dom.isLocal === false && dom.resolvedIp ? '(cloud!)' : '';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(255,255,255,.03);border-radius:6px">';
      html += '<span style="color:#aaa">' + dom.domain + '</span>';
      html += '<span style="color:' + color + ';font-weight:600">' + icon + ' ' + detail + ' <span style="font-weight:400;opacity:.7">' + label + '</span></span>';
      html += '</div>';
    }
    html += '</div>';
    if (d.domains && d.domains.some(function(x) { return !x.ok; })) {
      html += '<div style="margin-top:8px;padding:8px 12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:6px;font-size:11px;color:#fca5a5">';
      html += '<b>DNS still points to cloud.</b> Configure your router DNS or AdGuard DNS rewrites to redirect *.lfibot.com to a local IP.';
      html += '</div>';
    } else if (d.domains && d.domains.length > 0) {
      html += '<div style="margin-top:8px;padding:8px 12px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:6px;font-size:11px;color:#86efac">';
      html += '<b>DNS is redirected!</b> All domains resolve to local IPs. The Novabot app and mower will connect locally.';
      html += '</div>';
    }
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = '<div style="color:#ef4444">DNS check failed: ' + e.message + '</div>';
  }
}

// ── Maps Tab ──────────────────────────────────────────────────────
var _mapsDropdownLoaded = false;

async function populateMowerDropdown() {
  var sel = document.getElementById('mapMowerSelect');
  if (_mapsDropdownLoaded && sel.options.length > 1) return;
  try {
    var d = await api('/devices');
    var devs = d.devices || [];
    // Keep current selection
    var prev = sel.value;
    sel.innerHTML = '<option value="">Select a mower...</option>';
    for (var i = 0; i < devs.length; i++) {
      if (devs[i].device_type === 'mower') {
        var opt = document.createElement('option');
        opt.value = devs[i].sn;
        opt.textContent = devs[i].sn;
        sel.appendChild(opt);
      }
    }
    _mapsDropdownLoaded = true;
    // Auto-select: restore previous if still in list, otherwise pick the
    // first mower (whether there's 1 or many — saves an extra click).
    if (prev && sel.querySelector('option[value="' + prev + '"]')) {
      sel.value = prev;
    } else if (sel.options.length > 1) {
      sel.selectedIndex = 1;
    }
    if (sel.value) {
      loadMaps();
      loadMapBackups(sel.value);
      startLocalizationPoll(sel.value);
      portableCheckActive(sel.value);
      loadPortableBackups();
    }
  } catch(e) {
    document.getElementById('mapInfo').textContent = 'Failed to load devices: ' + e.message;
  }
}

// ── Live localization status polling ──────────────────────────────
// Polls /api/dashboard/devices/:sn every 2s while a mower is selected,
// renders localization_state + map_position_* into #mapLocalizationStatus,
// and gates the Recalibrate button so the user can't write (0, 0, 0).
var __mapLocPollTimer = null;

function __renderLocStatus(sensors) {
  var el = document.getElementById('mapLocalizationStatus');
  if (!el) return false;
  var locState = (sensors && sensors.localization_state) || 'unknown';
  var battery = (sensors && sensors.battery_state) || 'unknown';
  var mx = sensors && sensors.map_position_x;
  var my = sensors && sensors.map_position_y;
  var mo = sensors && sensors.map_position_orientation;
  var hasMP = mx !== undefined && my !== undefined && mo !== undefined;
  var fx = function(v) { var n = Number(v); return Number.isFinite(n) ? n.toFixed(3) : String(v); };
  var allZero = hasMP && Number(mx) === 0 && Number(my) === 0 && Number(mo) === 0;
  // Allow any localization state EXCEPT explicitly-bad ones. Stock firmware
  // emits a mix of labels (NOT_INITIALIZED, INITIALIZING, INITIALIZED, LOST,
  // RUNNING). We only block the known-bad ones; the (0,0,0) check above
  // already filters uninitialized poses.
  var locBad = /^(not[ _]?initialized|initializing|lost|failed|error)$/i.test(String(locState)) || !locState;
  var locOk = !locBad;

  var stateColor = locOk ? '#86efac' : '#fca5a5';
  var poseColor = (allZero || !hasMP) ? '#fca5a5' : '#86efac';
  var btnColor = (locOk && !allZero && hasMP && String(battery).toUpperCase() === 'CHARGING') ? 'safe' : 'unsafe';

  el.innerHTML =
    '<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:baseline">' +
      '<span><span style="color:#888">localization_state:</span> <b style="color:' + stateColor + '">' + locState + '</b></span>' +
      '<span><span style="color:#888">battery:</span> <b style="color:' + (String(battery).toUpperCase() === 'CHARGING' ? '#86efac' : '#fbbf24') + '">' + battery + '</b></span>' +
      (hasMP
        ? '<span><span style="color:#888">map_position:</span> <b style="color:' + poseColor + '">x=' + fx(mx) + ' y=' + fx(my) + ' θ=' + fx(mo) + '</b></span>'
        : '<span><span style="color:#888">map_position:</span> <b style="color:#fca5a5">not reported</b></span>') +
      (allZero
        ? '<span style="color:#fca5a5;font-size:10px">⚠ (0,0,0) = uninitialized placeholder — drive first</span>'
        : '') +
    '</div>';

  // Gate the Recalibrate button — disable when not safe to write
  var btn = document.getElementById('mapRecalBtn');
  if (btn) {
    if (btnColor === 'safe') {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.title = 'Localization initialized + map_position non-zero + on dock — safe to recalibrate';
    } else {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      btn.title = 'Cannot recalibrate: ' +
        (allZero ? 'pose is (0,0,0) placeholder. ' : '') +
        (!locOk ? 'localization_state="' + locState + '" (need Localized). ' : '') +
        (String(battery).toUpperCase() !== 'CHARGING' ? 'battery_state="' + battery + '" (need CHARGING). ' : '') +
        'Drive mower briefly off dock so localization initializes, then return to dock.';
    }
  }
  return true;
}

async function __pollLocOnce(sn) {
  try {
    var r = await fetch('/api/dashboard/devices/' + encodeURIComponent(sn));
    if (!r.ok) return;
    var d = await r.json();
    __renderLocStatus(d.sensors || {});
  } catch (e) {
    // network blip — ignore, will retry next interval
  }
}

function startLocalizationPoll(sn) {
  if (__mapLocPollTimer) {
    clearInterval(__mapLocPollTimer);
    __mapLocPollTimer = null;
  }
  var el = document.getElementById('mapLocalizationStatus');
  if (!sn) {
    if (el) el.innerHTML = '<span style="color:#888">Select a mower to see live localization status.</span>';
    var btn0 = document.getElementById('mapRecalBtn');
    if (btn0) { btn0.disabled = true; btn0.style.opacity = '0.5'; btn0.style.cursor = 'not-allowed'; }
    return;
  }
  if (el) el.innerHTML = '<span style="color:#888">Loading localization status for ' + sn + '...</span>';
  __pollLocOnce(sn);
  __mapLocPollTimer = setInterval(function() { __pollLocOnce(sn); }, 2000);
  startPositionTrailPoll(sn);
}

// ── Live position + validation trail polling ─────────────────────────────
// Polls /api/admin-status/live-position every 1.5s for the live mower-dot
// and /api/admin-status/position-trail every 5s for the dual trail + offset
// suggestion. Updates canvas.__mapState in place + re-renders so the user
// can validate that the firmware-frame position matches the RTK-derived
// position while the mower is mowing.
var __posLivePollTimer = null;
var __posTrailPollTimer = null;

function startPositionTrailPoll(sn) {
  if (__posLivePollTimer) { clearInterval(__posLivePollTimer); __posLivePollTimer = null; }
  if (__posTrailPollTimer) { clearInterval(__posTrailPollTimer); __posTrailPollTimer = null; }
  if (!sn) return;
  __pollLivePosOnce(sn);
  __pollTrailOnce(sn);
  __posLivePollTimer = setInterval(function() { __pollLivePosOnce(sn); }, 1500);
  __posTrailPollTimer = setInterval(function() { __pollTrailOnce(sn); }, 5000);
}

async function __pollLivePosOnce(sn) {
  var canvas = document.getElementById('mapCanvas');
  if (!canvas || !canvas.__mapState || !canvas.__mapState.maps) return;
  try {
    var r = await fetch('/api/admin-status/live-position/' + encodeURIComponent(sn), {
      headers: { 'Authorization': token }
    });
    if (!r.ok) return;
    var data = await r.json();
    canvas.__mapState.livePose = data.pose;
    canvas.__mapState.mowerTrail = (data.recentTrail || []).map(function(p) {
      return { x: p.x, y: p.y };
    });
    if (typeof polygonCal !== 'undefined' && polygonCal) {
      rerenderWithGhost();
    } else {
      renderMapCanvas(canvas, canvas.__mapState.maps, canvas.__mapState.chargingPose || null);
    }
  } catch (e) { /* swallow — next tick retries */ }
}

async function __pollTrailOnce(sn) {
  var canvas = document.getElementById('mapCanvas');
  if (!canvas || !canvas.__mapState || !canvas.__mapState.maps) return;
  try {
    var r = await fetch('/api/admin-status/position-trail/' + encodeURIComponent(sn) + '?duration=600', {
      headers: { 'Authorization': token }
    });
    if (!r.ok) return;
    var data = await r.json();
    canvas.__mapState.gpsTrail = (data.gpsLocal || []).map(function(p) {
      return { x: p.x, y: p.y };
    });
    canvas.__mapState.suggestion = data.suggestion;
    canvas.__mapState.haveAnchor = data.haveAnchor;
    renderValidationPanel(data);
  } catch (e) { /* swallow */ }
}

function renderValidationPanel(data) {
  var el = document.getElementById('positionValidationPanel');
  if (!el) return;
  function debugHtml(d) {
    if (!d) return '';
    var anchor = (d.chargerLat != null && d.chargerLng != null)
      ? d.chargerLat.toFixed(7) + ', ' + d.chargerLng.toFixed(7)
      : '<span style="color:#fca5a5">null</span>';
    var chargerMap = d.chargerInMap
      ? '(' + d.chargerInMap.x.toFixed(3) + ', ' + d.chargerInMap.y.toFixed(3) + ')'
      : '<span style="color:#fca5a5">null</span>';
    var savedTheta = d.savedThetaDeg != null ? d.savedThetaDeg.toFixed(2) + '°' : '<span style="color:#fca5a5">null</span>';
    var derived = d.derivedThetaDeg != null ? d.derivedThetaDeg.toFixed(2) + '°' : '<span style="color:#888">need ≥10 samples</span>';
    var sourceColor = d.thetaSource === 'data-fit' ? '#86efac' : d.thetaSource === 'saved' ? '#fbbf24' : '#fca5a5';
    var latest = d.latestSample
      ? '(' + d.latestSample.lat.toFixed(7) + ', ' + d.latestSample.lng.toFixed(7) + ') → map(' + d.latestSample.mx.toFixed(2) + ',' + d.latestSample.my.toFixed(2) + ')'
      : '<span style="color:#888">none yet</span>';
    return '<details style="margin-top:8px;font-size:10px;color:#94a3b8">'
      + '<summary style="cursor:pointer;color:#cbd5e1">Debug info</summary>'
      + '<div style="margin-top:6px;padding:6px 8px;background:#0a0a14;border-radius:4px;line-height:1.6">'
      + '<div>Charger GPS: ' + anchor + '</div>'
      + '<div>Charger in map frame: ' + chargerMap + '</div>'
      + '<div>Saved θ (dock heading): ' + savedTheta + '</div>'
      + '<div>Derived θ (from data): <b style="color:' + sourceColor + '">' + derived + '</b></div>'
      + '<div>Active rotation source: <b style="color:' + sourceColor + '">' + (d.thetaSource || '?') + '</b></div>'
      + '<div>Total RTK samples: ' + d.totalSamples + '</div>'
      + '<div>Latest sample: ' + latest + '</div>'
      + '</div></details>';
  }
  if (!data.haveAnchor) {
    el.innerHTML = '<span style="color:#fca5a5">No charger anchor in DB — sync_map first to populate <code>map_calibration.charger_lat/lng</code>.</span>'
      + debugHtml(data.debug);
    return;
  }
  if (!data.suggestion) {
    var n = (data.gpsLocal || []).length;
    el.innerHTML = '<span style="color:#888">Waiting for RTK FIX samples while mowing... (' + n + '/5)</span>'
      + debugHtml(data.debug);
    return;
  }
  var s = data.suggestion;
  var dxCm = (s.dx * 100).toFixed(1);
  var dyCm = (s.dy * 100).toFixed(1);
  var stdMax = Math.max(s.stdevX, s.stdevY);
  var stdColor = stdMax < 0.05 ? '#86efac' : stdMax < 0.15 ? '#fbbf24' : '#fca5a5';
  // Big offset combined with high noise = anchor / orientation problem,
  // not a real polygon-drift signal. Warn the operator before they apply.
  var totalOffsetCm = Math.sqrt(s.dx * s.dx + s.dy * s.dy) * 100;
  var suspectAnchor = stdMax > 0.15 || totalOffsetCm > 50;
  var warning = suspectAnchor
    ? '<div style="margin-top:6px;padding:6px 8px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:4px;color:#fca5a5;font-size:10px;line-height:1.5">'
      + '<b>Suspect: anchor or orientation wrong.</b> Real RTK noise is &lt;5 cm and polygon drift &lt;50 cm. '
      + 'Verify <code>charger_lat/lng</code> matches the physical charger GPS and <code>polygon_charging_orientation</code> matches the heading at mapping time before applying.'
      + '</div>'
    : '';
  el.innerHTML =
    '<div style="font-size:11px;color:#cbd5e1;line-height:1.6">'
    + '<div style="margin-top:6px"><b>Δ offset:</b> dx=<b>' + dxCm + ' cm</b>, dy=<b>' + dyCm + ' cm</b> (|d|=' + totalOffsetCm.toFixed(1) + ' cm)</div>'
    + '<div style="color:' + stdColor + '">noise σ: x=' + (s.stdevX * 100).toFixed(1) + ' cm, y=' + (s.stdevY * 100).toFixed(1) + ' cm  (n=' + s.samples + ')</div>'
    + '</div>'
    + warning
    + '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">'
    + '<button onclick="clearValidationTrail()" style="padding:6px 12px;background:rgba(100,116,139,.15);color:#94a3b8;border:1px solid rgba(100,116,139,.3);border-radius:6px;font-size:11px;cursor:pointer">Clear trail</button>'
    + '</div>'
    + debugHtml(data.debug);
}

async function applySuggestedOffset(dx, dy) {
  var sn = document.getElementById('mapMowerSelect').value;
  if (!sn) return;
  if (!(await appConfirm('Apply suggested offset dx=' + (dx * 100).toFixed(1) + ' cm, dy=' + (dy * 100).toFixed(1) + ' cm to ' + sn + '?\\n\\nThis runs a full sync_map (same as the manual nudge panel).', { okText: 'Apply' }))) return;
  try {
    var r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/apply-polygon-offset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': token },
      body: JSON.stringify({ dx_m: dx, dy_m: dy })
    });
    var json = await r.json();
    await appAlert(r.ok ? 'Offset applied. Mower will resync.' : ('Failed: ' + (json.error || r.status)), { accent: r.ok ? 'success' : 'danger' });
  } catch (e) {
    await appAlert('Apply failed: ' + e.message, { accent: 'danger' });
  }
}

async function clearValidationTrail() {
  var sn = document.getElementById('mapMowerSelect').value;
  if (!sn) return;
  try {
    await fetch('/api/admin-status/position-trail/' + encodeURIComponent(sn) + '/clear', {
      method: 'POST',
      headers: { 'Authorization': token }
    });
    var canvas = document.getElementById('mapCanvas');
    if (canvas && canvas.__mapState) {
      canvas.__mapState.gpsTrail = [];
      canvas.__mapState.mowerTrail = [];
      canvas.__mapState.suggestion = null;
    }
    __pollTrailOnce(sn);
  } catch (e) { /* swallow */ }
}

async function recalibrateChargingPose() {
  var sn = document.getElementById('mapMowerSelect').value;
  var status = document.getElementById('mapRecalStatus');
  status.style.display = 'block';

  if (!sn) {
    status.style.color = '#f87171';
    status.textContent = 'Please select a mower first.';
    return;
  }

  var confirmMsg = 'Overwrite charging pose on ' + sn + ' with current mower pose?\\n\\n' +
    'Physical mower MUST be on its dock with battery_state=CHARGING\\n' +
    'AND localization_state must be Localized (drive-back done).\\n\\n' +
    'This writes map_info.json in both csv_file/ and x3_csv_file/ and charging_station.yaml.';
  if (!(await appConfirm(confirmMsg, { okText: 'Recalibrate' }))) return;

  status.style.color = '#60a5fa';
  status.textContent = 'Sending recalibrate command to ' + sn + '...';

  try {
    var r = await fetch('/api/dashboard/maps/' + encodeURIComponent(sn) + '/recalibrate-charging-pose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    var result = await r.json().catch(function() { return {}; });

    if (r.status === 400 && (result.batteryState || '').toUpperCase() !== 'CHARGING') {
      // Safety gate fired — ask once more with force
      var forceConfirm = 'Mower battery_state is "' + (result.batteryState || 'unknown') + '" (expected CHARGING).\\n\\n' +
        'Override the safety check and recalibrate anyway?';
      if (!(await appConfirm(forceConfirm, { destructive: true, okText: 'Override' }))) {
        status.style.color = '#f87171';
        status.textContent = 'Cancelled. Place mower on dock first.';
        return;
      }
      r = await fetch('/api/dashboard/maps/' + encodeURIComponent(sn) + '/recalibrate-charging-pose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      result = await r.json().catch(function() { return {}; });
    }

    if (!r.ok || !result.ok) {
      throw new Error(result.error || ('HTTP ' + r.status));
    }
    var p = result.pose || {};
    status.style.color = '#00d4aa';
    status.textContent = 'Recalibrated — x=' + p.x + ' y=' + p.y + ' theta=' + p.theta;
  } catch(e) {
    status.style.color = '#f87171';
    status.textContent = 'Recalibrate failed: ' + e.message;
  }
}

// ── Portable Map Bundle functions ─────────────────────────────────────────────

async function exportPortableBundle() {
  var sn = document.getElementById('mapMowerSelect').value;
  if (!sn) { await appAlert('Select a mower first', { accent: 'warning' }); return; }
  var url = '/api/admin-status/maps/' + encodeURIComponent(sn) + '/export-portable';
  var r = await fetch(url, { headers: { 'Authorization': token } });
  if (!r.ok) { await appAlert('Export failed: HTTP ' + r.status, { accent: 'danger' }); return; }
  var blob = await r.blob();
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  var ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  a.download = sn + '-' + ts + '-portable.novabotmap';
  a.click();
  URL.revokeObjectURL(a.href);
}

var portableStagingId = null;

// Live RTK badge polling — keeps a small indicator near the wizard header
// updated every 2 s so the operator can SEE when loc_quality reaches 100
// (RTK FIX) before triggering drive / dock steps.
var portableRtkPoll = null;
function portableStartRtkPoll(sn) {
  if (portableRtkPoll) clearInterval(portableRtkPoll);
  function tick() {
    var badge = document.getElementById('portableRtkBadge');
    if (!badge) { clearInterval(portableRtkPoll); portableRtkPoll = null; return; }
    fetch('/api/dashboard/devices/' + encodeURIComponent(sn))
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var s = (d && d.sensors) || {};
        var locQ = parseInt(s.loc_quality, 10);
        var rtkSat = parseInt(s.rtk_sat, 10);
        var batt = String(s.battery_state || '').toUpperCase();
        var col = locQ === 100 ? '#86efac' : locQ >= 50 ? '#fbbf24' : '#fca5a5';
        var lockTxt = locQ === 100 ? 'RTK FIX' : ('loc_quality=' + (isNaN(locQ) ? '?' : locQ));
        var battCol = batt.indexOf('CHARGING') >= 0 || batt.indexOf('FINISHED') >= 0 ? '#86efac' : '#fbbf24';
        badge.innerHTML =
          '<span style="color:' + col + '"><b>' + lockTxt + '</b></span>' +
          ' · sat ' + (isNaN(rtkSat) ? '?' : rtkSat) +
          ' · battery <span style="color:' + battCol + '">' + (batt || '?') + '</span>';
        var snapBtn = document.getElementById('portableSnapshotBtn');
        if (snapBtn) {
          var charging = batt.indexOf('CHARGING') >= 0;
          var rtkFix = locQ === 100;
          var ready = charging && rtkFix;
          snapBtn.disabled = !ready;
          if (ready) {
            snapBtn.textContent = '2. Snapshot anchor (mower on dock)';
            snapBtn.style.background = 'rgba(99,102,241,.2)';
            snapBtn.style.color = '#a5b4fc';
            snapBtn.style.borderColor = 'rgba(99,102,241,.5)';
            snapBtn.style.cursor = 'pointer';
            snapBtn.style.opacity = '1';
          } else {
            var missing = [];
            if (!charging) missing.push('battery=CHARGING');
            if (!rtkFix) missing.push('RTK FIX');
            snapBtn.textContent = '2. Snapshot anchor (waiting: ' + missing.join(' + ') + ')';
            snapBtn.style.background = 'rgba(99,102,241,.1)';
            snapBtn.style.color = '#6b7280';
            snapBtn.style.borderColor = 'rgba(99,102,241,.25)';
            snapBtn.style.cursor = 'not-allowed';
            snapBtn.style.opacity = '0.5';
          }
        }
      })
      .catch(function() { /* swallow */ });
  }
  tick();
  portableRtkPoll = setInterval(tick, 2000);
}

// Resume an in-progress import session if one exists for the selected mower.
// Called from mapMowerSelect onchange so a page refresh / SN switch picks up
// where the operator left off instead of demanding a fresh upload (and then
// rejecting it with a 409 because the server-side staging is still active).
var portableExactRestore = false;
var portableVerbatimRestore = false;
var portableSourceSn = null;
var portableSourceSnMatches = false;

async function manualPortableBackup() {
  var sn = document.getElementById('mapMowerSelect').value;
  if (!sn) { await appAlert('Select a mower first', { accent: 'warning' }); return; }
  var r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/portable-backups', {
    method: 'POST', headers: { 'Authorization': token, 'Content-Type': 'application/json' },
  });
  var j = await r.json();
  if (!j.ok) { await appAlert('Snapshot failed: ' + j.error, { accent: 'danger' }); return; }
  await appAlert('Snapshot saved: ' + j.backup.filename + ' (' + (j.backup.bytes / 1024).toFixed(1) + ' KB)', { accent: 'success' });
  loadPortableBackups();
}

async function rebuildBundleFromDb() {
  var sn = document.getElementById('mapMowerSelect').value;
  if (!sn) { await appAlert('Select a mower first', { accent: 'warning' }); return; }
  var r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/portable-backups/rebuild', {
    method: 'POST', headers: { 'Authorization': token, 'Content-Type': 'application/json' },
  });
  var j = await r.json();
  if (!j.ok) { await appAlert('Rebuild failed: ' + j.error, { accent: 'danger' }); return; }
  await appAlert('Bundle rebuilt from DB: ' + j.backup.filename + ' (' + (j.backup.bytes / 1024).toFixed(1) + ' KB)', { accent: 'success' });
  loadPortableBackups();
}

async function importCsvZip() {
  var sn = document.getElementById('mapMowerSelect').value;
  if (!sn) { await appAlert('Select a mower first', { accent: 'warning' }); return; }
  var input = document.getElementById('csvZipFile');
  var file = input.files && input.files[0];
  if (!file) return;
  var fd = new FormData();
  fd.append('bundle', file);
  try {
    var r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/portable-backups/from-csv-zip', {
      method: 'POST', headers: { 'Authorization': token }, body: fd,
    });
    var j = await r.json();
    if (!j.ok) { await appAlert('CSV import failed: ' + j.error, { accent: 'danger' }); return; }
    await appAlert('Bundle generated from CSV zip: ' + j.backup.filename + ' (' + (j.backup.bytes / 1024).toFixed(1) + ' KB)', { accent: 'success' });
    loadPortableBackups();
  } finally {
    input.value = '';
  }
}

async function loadPortableBackups() {
  var sn = document.getElementById('mapMowerSelect').value;
  if (!sn) return;
  var box = document.getElementById('portableBackupList');
  var content = document.getElementById('portableBackupListContent');
  try {
    var r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/portable-backups', {
      headers: { 'Authorization': token },
    });
    var j = await r.json();
    var backups = j.backups || [];
    if (backups.length === 0) {
      box.style.display = 'block';
      content.innerHTML = '<div style="color:#666;font-style:italic">No snapshots yet — auto-saved after each mapping session, or click "Snapshot now".</div>';
      return;
    }
    box.style.display = 'block';
    var html = '<div style="display:flex;flex-direction:column;gap:4px">';
    for (var i = 0; i < backups.length; i++) {
      var b = backups[i];
      var dt = new Date(b.createdAt).toLocaleString('nl-NL');
      var kb = (b.bytes / 1024).toFixed(1);
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:rgba(255,255,255,.03);border-radius:4px;font-family:&quot;Roboto Mono&quot;,ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px">';
      html += '<span><span style="color:#cbd5e1">' + dt + '</span> · <span style="color:#67e8f9">' + b.reason + '</span> · <span style="color:#888">' + kb + ' KB</span></span>';
      html += '<span style="display:flex;gap:4px">';
      html += '<button onclick="restorePortableBackup(\\'' + b.filename + '\\')" style="padding:3px 10px;background:rgba(16,185,129,.15);color:#86efac;border:1px solid rgba(16,185,129,.3);border-radius:4px;font-size:10px;font-weight:600;cursor:pointer">Restore</button>';
      html += '<a href="/api/admin-status/maps/' + encodeURIComponent(sn) + '/portable-backups/' + encodeURIComponent(b.filename) + '" download style="padding:3px 10px;background:rgba(99,102,241,.15);color:#a5b4fc;border:1px solid rgba(99,102,241,.3);border-radius:4px;font-size:10px;font-weight:600;cursor:pointer;text-decoration:none">⬇</a>';
      html += '<button onclick="deletePortableBackup(\\'' + b.filename + '\\')" style="padding:3px 10px;background:rgba(239,68,68,.15);color:#fca5a5;border:1px solid rgba(239,68,68,.3);border-radius:4px;font-size:10px;font-weight:600;cursor:pointer">×</button>';
      html += '</span>';
      html += '</div>';
    }
    html += '</div>';
    content.innerHTML = html;
  } catch (e) {
    content.innerHTML = '<div style="color:#fca5a5">Error: ' + e + '</div>';
  }
}

async function restorePortableBackup(filename) {
  var sn = document.getElementById('mapMowerSelect').value;
  if (!(await appConfirm('Restore this snapshot? Current map state on mower will be replaced.', { okText: 'Restore' }))) return;
  var r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/portable-backups/' + encodeURIComponent(filename) + '/restore', {
    method: 'POST', headers: { 'Authorization': token },
  });
  var j = await r.json();
  if (!j.ok) { await appAlert('Restore failed: ' + j.error, { accent: 'danger' }); return; }
  portableStagingId = j.stagingId;
  portableVerbatimRestore = !!j.verbatimRestore;
  portableSourceSn = j.sourceSn || null;
  portableSourceSnMatches = !!j.sourceSnMatches;
  // Single restore path: push the complete bundle verbatim (no Δ rotation,
  // pos.json untouched), then dock-cycle. Works regardless of source SN since
  // pos.json is never overwritten and the map is charger-relative.
  if (portableVerbatimRestore) {
    await portableApplyVerbatim();
  } else {
    await appAlert('Restore staged but bundle has no map files. Use the Import bundle wizard.', { accent: 'warning' });
  }
}

async function deletePortableBackup(filename) {
  var sn = document.getElementById('mapMowerSelect').value;
  if (!(await appConfirm('Delete snapshot ' + filename + '?', { destructive: true, okText: 'Delete' }))) return;
  await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/portable-backups/' + encodeURIComponent(filename), {
    method: 'DELETE', headers: { 'Authorization': token },
  });
  loadPortableBackups();
}

async function portableCheckActive(sn) {
  if (!sn) return;
  try {
    var r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/import-portable/active', {
      headers: { 'Authorization': token },
    });
    if (!r.ok) return;
    var j = await r.json();
    if (j && j.stagingId) {
      portableStagingId = j.stagingId;
      portableExactRestore = !!j.exactRestore;
      portableVerbatimRestore = !!j.verbatimRestore;
      portableSourceSn = j.sourceSn || null;
      portableSourceSnMatches = !!j.sourceSnMatches;
      renderPortableImportWizard(sn, j.state || 'UPLOADED');
    } else {
      portableStagingId = null;
      portableExactRestore = false;
      portableVerbatimRestore = false;
      portableSourceSn = null;
      portableSourceSnMatches = false;
      var panel = document.getElementById('portableImportPanel');
      if (panel) panel.style.display = 'none';
      if (portableRtkPoll) { clearInterval(portableRtkPoll); portableRtkPoll = null; }
    }
  } catch (e) { /* swallow — fresh page load races are fine */ }
}

async function startPortableImport() {
  var fi = document.getElementById('portableImportFile');
  var sn = document.getElementById('mapMowerSelect').value;
  if (!sn || !fi.files.length) return;
  var fd = new FormData();
  fd.append('bundle', fi.files[0]);
  var r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/import-portable', {
    method: 'POST', headers: { 'Authorization': token }, body: fd,
  });
  var j = await r.json();
  if (!j.ok) { await appAlert('Import failed: ' + j.error, { accent: 'danger' }); return; }
  portableStagingId = j.stagingId;
  portableExactRestore = !!j.exactRestore;
  portableVerbatimRestore = !!j.verbatimRestore;
  portableSourceSn = j.sourceSn || null;
  portableSourceSnMatches = !!j.sourceSnMatches;
  renderPortableImportWizard(sn, 'UPLOADED');
}

// startWalkerImport removed: the "Import bundle..." button now accepts
// .novabotmap AND .novabundle. Server inspects metadata.json on upload
// and auto-synthesizes walker bundles via synthesizePortableFromWalker
// before staging. One unified flow for the operator.

// ── Walker bundle library — SN-agnostic uploads + assign-to-mower ─────────
// The walker POSTs .novabundle files to /walker-bundles. The list below lets
// the operator inspect each upload and pick a target mower to run the
// apply-verbatim pipeline against. DOM is built with createElement /
// textContent only — no innerHTML with computed content — so a malicious
// filename or walker id can never inject markup.

function fmtBytes(n) {
  if (n == null || !isFinite(n)) return '?';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

function fmtWalkerDate(iso) {
  if (!iso) return '?';
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch (e) { return iso; }
}

async function loadWalkerBundles() {
  var host = document.getElementById('walkerBundleList');
  if (!host) return;
  host.textContent = 'Loading...';
  try {
    var d = await api('/walker-bundles');
    var bundles = d.bundles || [];
    host.textContent = '';
    if (bundles.length === 0) {
      var empty = document.createElement('div');
      empty.style.color = '#888';
      empty.style.fontStyle = 'italic';
      empty.textContent = 'No walker bundles yet. Hit "Upload to server" on the walker once a survey is finished.';
      host.appendChild(empty);
      return;
    }
    for (var i = 0; i < bundles.length; i++) {
      host.appendChild(renderWalkerBundleRow(bundles[i]));
    }
  } catch (e) {
    host.textContent = 'Failed to load: ' + e.message;
  }
}

function renderWalkerBundleRow(b) {
  var row = document.createElement('div');
  row.style.padding = '10px 12px';
  row.style.background = 'rgba(168,139,250,.06)';
  row.style.border = '1px solid rgba(168,139,250,.25)';
  row.style.borderRadius = '8px';
  row.style.marginBottom = '8px';
  row.style.display = 'flex';
  row.style.flexWrap = 'wrap';
  row.style.gap = '12px';
  row.style.alignItems = 'center';

  var left = document.createElement('div');
  left.style.flex = '1 1 360px';
  left.style.minWidth = '0';

  var name = document.createElement('div');
  name.style.fontWeight = '600';
  name.style.color = '#e9d5ff';
  name.style.fontFamily = 'monospace';
  name.style.fontSize = '12px';
  name.style.wordBreak = 'break-all';
  name.textContent = b.filename;
  left.appendChild(name);

  var meta = document.createElement('div');
  meta.style.fontSize = '11px';
  meta.style.color = '#94a3b8';
  meta.style.marginTop = '4px';
  var parts = [
    'Uploaded ' + fmtWalkerDate(b.uploadedAt),
    'Walker ' + (b.walkerId || 'unknown'),
    fmtBytes(b.sizeBytes),
    (b.polygons || 0) + ' polygon(s)',
    (b.obstacles || 0) + ' obstacle(s)',
    (b.unicom || 0) + ' channel(s)',
  ];
  meta.textContent = parts.join(' · ');
  left.appendChild(meta);

  if (b.lastAssignedSn) {
    var assigned = document.createElement('div');
    assigned.style.fontSize = '11px';
    assigned.style.color = '#86efac';
    assigned.style.marginTop = '4px';
    assigned.textContent = 'Last assigned to ' + b.lastAssignedSn + ' at ' + fmtWalkerDate(b.lastAssignedAt);
    left.appendChild(assigned);
  }

  row.appendChild(left);

  var actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '6px';
  actions.style.flexWrap = 'wrap';

  var assignBtn = document.createElement('button');
  assignBtn.textContent = 'Assign to mower...';
  assignBtn.style.padding = '6px 12px';
  assignBtn.style.background = 'rgba(16,185,129,.18)';
  assignBtn.style.color = '#86efac';
  assignBtn.style.border = '1px solid rgba(16,185,129,.45)';
  assignBtn.style.borderRadius = '6px';
  assignBtn.style.fontSize = '11px';
  assignBtn.style.fontWeight = '600';
  assignBtn.style.cursor = 'pointer';
  assignBtn.onclick = function() { assignWalkerBundle(b); };
  actions.appendChild(assignBtn);

  var downloadBtn = document.createElement('a');
  downloadBtn.textContent = 'Download';
  downloadBtn.href = 'javascript:void(0)';
  downloadBtn.style.padding = '6px 12px';
  downloadBtn.style.background = 'rgba(99,102,241,.15)';
  downloadBtn.style.color = '#a5b4fc';
  downloadBtn.style.border = '1px solid rgba(99,102,241,.4)';
  downloadBtn.style.borderRadius = '6px';
  downloadBtn.style.fontSize = '11px';
  downloadBtn.style.fontWeight = '600';
  downloadBtn.style.cursor = 'pointer';
  downloadBtn.style.textDecoration = 'none';
  downloadBtn.onclick = function() { downloadWalkerBundle(b); };
  actions.appendChild(downloadBtn);

  var deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Delete';
  deleteBtn.style.padding = '6px 12px';
  deleteBtn.style.background = 'rgba(239,68,68,.12)';
  deleteBtn.style.color = '#fca5a5';
  deleteBtn.style.border = '1px solid rgba(239,68,68,.35)';
  deleteBtn.style.borderRadius = '6px';
  deleteBtn.style.fontSize = '11px';
  deleteBtn.style.fontWeight = '600';
  deleteBtn.style.cursor = 'pointer';
  deleteBtn.onclick = function() { deleteWalkerBundle(b); };
  actions.appendChild(deleteBtn);

  row.appendChild(actions);
  return row;
}

async function downloadWalkerBundle(b) {
  try {
    var r = await fetch('/api/admin-status/walker-bundles/' + b.id, {
      headers: { 'Authorization': token },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var blob = await r.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = b.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    await appAlert('Download failed: ' + e.message, { accent: 'danger' });
  }
}

async function deleteWalkerBundle(b) {
  if (!(await appConfirm('Delete walker bundle ' + b.filename + '?', { okText: 'Delete', accent: 'danger' }))) return;
  try {
    var r = await fetch('/api/admin-status/walker-bundles/' + b.id, {
      method: 'DELETE',
      headers: { 'Authorization': token },
    });
    var j = await r.json();
    if (!j.ok) throw new Error(j.error || 'delete failed');
    loadWalkerBundles();
  } catch (e) {
    await appAlert('Delete failed: ' + e.message, { accent: 'danger' });
  }
}

async function assignWalkerBundle(b) {
  // Fetch the list of mowers (devices) and let the operator pick one.
  var devices;
  try {
    var r = await fetch('/api/admin-status/devices', { headers: { 'Authorization': token } });
    var jd = await r.json();
    devices = (jd.devices || []).filter(function(d) { return d.device_type === 'mower'; });
  } catch (e) {
    await appAlert('Failed to load mowers: ' + e.message, { accent: 'danger' });
    return;
  }
  if (!devices.length) {
    await appAlert('No mowers bound on this server. Bind one first via the Devices tab.', { accent: 'danger' });
    return;
  }

  var picked = await pickMowerForBundle(b, devices);
  if (!picked) return;

  // Run the apply step against the picked SN.
  var resp;
  try {
    var r2 = await fetch('/api/admin-status/walker-bundles/' + b.id + '/apply', {
      method: 'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sn: picked }),
    });
    resp = await r2.json();
  } catch (e) {
    await appAlert('Apply request failed: ' + e.message, { accent: 'danger' });
    return;
  }
  if (!resp.ok) {
    await appAlert('Apply failed: ' + (resp.error || 'unknown'), { accent: 'danger' });
    return;
  }

  // Sync the rest of the import wizard state so portableApplyVerbatim picks
  // up the freshly created staging session. mapMowerSelect MUST be set to
  // the same SN — that's the input portableApplyVerbatim reads.
  var sel = document.getElementById('mapMowerSelect');
  if (sel) {
    if (!sel.querySelector('option[value="' + picked + '"]')) {
      var opt = document.createElement('option');
      opt.value = picked;
      opt.textContent = picked;
      sel.appendChild(opt);
    }
    sel.value = picked;
  }
  portableStagingId = resp.stagingId;
  portableVerbatimRestore = !!resp.verbatimRestore;
  portableExactRestore = !!resp.exactRestore;
  portableSourceSnMatches = true;
  portableSourceSn = resp.sourceSn || null;

  var polygonSummary = (resp.polygons || [])
    .map(function(p) { return '· ' + (p.alias || p.name) + ' (' + p.pointCount + ' pts)'; })
    .join('\\n');
  var msg = 'Walker bundle staged for ' + picked + '.\\n\\n' +
            (polygonSummary || '(no polygon details returned)') + '\\n\\n' +
            'Apply verbatim now? The dock-anchor refresh modal will follow.';
  if (!(await appConfirm(msg, { okText: 'Apply' }))) {
    loadWalkerBundles();
    return;
  }
  await portableApplyVerbatim();
  loadWalkerBundles();
}

function pickMowerForBundle(b, devices) {
  return new Promise(function(resolve) {
    var overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.6)';
    overlay.style.zIndex = '5000';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    var box = document.createElement('div');
    box.style.background = '#0d0d20';
    box.style.border = '1px solid rgba(168,139,250,.4)';
    box.style.borderRadius = '12px';
    box.style.padding = '20px';
    box.style.maxWidth = '440px';
    box.style.width = '90%';
    box.style.color = '#fff';
    box.style.boxShadow = '0 8px 40px rgba(0,0,0,0.5)';

    var title = document.createElement('div');
    title.style.fontWeight = '600';
    title.style.fontSize = '15px';
    title.style.marginBottom = '6px';
    title.textContent = 'Assign walker bundle';
    box.appendChild(title);

    var sub = document.createElement('div');
    sub.style.fontSize = '12px';
    sub.style.color = '#94a3b8';
    sub.style.marginBottom = '12px';
    sub.textContent = b.filename;
    box.appendChild(sub);

    var info = document.createElement('div');
    info.style.fontSize = '11px';
    info.style.color = '#cbd5e1';
    info.style.marginBottom = '12px';
    info.style.lineHeight = '1.55';
    info.textContent = 'Pick the mower that this bundle should be staged for. The server reads the mower live charging pose, rotates + translates the polygons into its frame, then runs apply-verbatim. The mower must be online and docked with a non-zero map_position.';
    box.appendChild(info);

    var list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '6px';
    list.style.maxHeight = '300px';
    list.style.overflowY = 'auto';
    list.style.marginBottom = '12px';
    for (var i = 0; i < devices.length; i++) {
      (function(dev) {
        var btn = document.createElement('button');
        btn.style.padding = '10px 12px';
        btn.style.background = 'rgba(99,102,241,.12)';
        btn.style.border = '1px solid rgba(99,102,241,.35)';
        btn.style.borderRadius = '8px';
        btn.style.color = '#e0e7ff';
        btn.style.fontSize = '12px';
        btn.style.fontWeight = '600';
        btn.style.cursor = 'pointer';
        btn.style.textAlign = 'left';
        btn.textContent = dev.sn + (dev.is_online ? ' (online)' : ' (offline)');
        btn.onclick = function() {
          document.body.removeChild(overlay);
          resolve(dev.sn);
        };
        list.appendChild(btn);
      })(devices[i]);
    }
    box.appendChild(list);

    var cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.style.padding = '8px 14px';
    cancel.style.background = 'rgba(239,68,68,.12)';
    cancel.style.color = '#fca5a5';
    cancel.style.border = '1px solid rgba(239,68,68,.35)';
    cancel.style.borderRadius = '6px';
    cancel.style.fontSize = '12px';
    cancel.style.fontWeight = '600';
    cancel.style.cursor = 'pointer';
    cancel.onclick = function() {
      document.body.removeChild(overlay);
      resolve(null);
    };
    box.appendChild(cancel);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  });
}

function renderPortableImportWizard(sn, state) {
  var panel = document.getElementById('portableImportPanel');
  panel.style.display = 'block';
  var html = '<div style="padding:10px;background:#0d0d20;border-radius:6px;font-size:11px;color:#cbd5e1;line-height:1.7">';
  html += '<div><b>Staging:</b> <code>' + portableStagingId + '</code></div>';
  html += '<div><b>State:</b> <span style="color:#67e8f9">' + state + '</span></div>';
  html += '<div id="portableRtkBadge" style="margin-top:4px;font-size:11px"></div>';
  html += '</div>';
  html += '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">';
  if (state === 'UPLOADED') {
    if (portableVerbatimRestore) {
      // Single restore path. The bundle carries a complete map (csv_file/ +
      // server-generated map.pgm/png/yaml + per-map). Restore pushes it to the
      // mower 1-to-1 (no Δ rotation, pos.json untouched); the dock-cycle
      // (1m back + ArUco redock) then refreshes the dock heading + charger pos
      // so the charger-relative map is valid in the live frame.
      var xsn = portableSourceSn && !portableSourceSnMatches;
      html += '<div style="flex-basis:100%;font-size:10px;color:' + (xsn ? '#fbbf24' : '#86efac') + ';margin-bottom:4px">'
        + (xsn ? 'Bundle source ' + portableSourceSn + ' differs from target — pos.json is left untouched so this is safe; verify after the dock-cycle. '
               : 'Complete bundle (csv + rasterized map.pgm/png/yaml + per-map). ')
        + 'Restore pushes it to the mower, then you dock-cycle (1m back + ArUco redock).</div>';
      html += '<button onclick="portableApplyVerbatim()" style="padding:6px 12px;background:rgba(16,185,129,.3);color:#bbf7d0;border:1px solid rgba(16,185,129,.7);border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">Restore to mower</button>';
    } else {
      html += '<div style="flex-basis:100%;font-size:10px;color:#fbbf24;margin-bottom:4px">Legacy bundle with no map files — falls back to the drive+realign flow.</div>';
      html += '<button onclick="portableStartDrive()" style="padding:6px 12px;background:rgba(245,158,11,.2);color:#fbbf24;border:1px solid rgba(245,158,11,.5);border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">1. Start drive backward + RTK lock</button>';
    }
  }
  if (state === 'AUTO_DOCK') {
    html += '<div style="flex-basis:100%;font-size:10px;color:#fbbf24;margin-bottom:4px">Drive or push the mower BACK ONTO the dock manually (Control-tab joystick or by hand). Wait for battery=CHARGING and RTK FIX, then click below.</div>';
    html += '<button id="portableSnapshotBtn" onclick="portableAutoDock()" disabled style="padding:6px 12px;background:rgba(99,102,241,.1);color:#6b7280;border:1px solid rgba(99,102,241,.25);border-radius:6px;font-size:11px;font-weight:600;cursor:not-allowed;opacity:0.5">2. Snapshot anchor (waiting for CHARGING + RTK FIX)</button>';
  }
  if (state === 'ANCHOR_SET' || state === 'PREVIEW_SHOWN') {
    html += '<button onclick="portableShowPreview()" style="padding:6px 12px;background:rgba(99,102,241,.2);color:#a5b4fc;border:1px solid rgba(99,102,241,.5);border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">3. Show preview overlay</button>';
    if (state === 'PREVIEW_SHOWN') html += '<button onclick="portableConfirm()" style="padding:6px 12px;background:rgba(16,185,129,.2);color:#86efac;border:1px solid rgba(16,185,129,.5);border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">4. Confirm + apply</button>';
  }
  html += '<button onclick="portableCancel()" style="padding:6px 12px;background:rgba(239,68,68,.15);color:#fca5a5;border:1px solid rgba(239,68,68,.3);border-radius:6px;font-size:11px;cursor:pointer">Cancel</button>';
  html += '</div>';
  if (state === 'PREVIEW_SHOWN') {
    html += '<div style="margin-top:8px;padding:8px;background:#0d0d20;border:1px solid #2a2a3a;border-radius:6px;font-size:11px">';
    html += '<div style="color:#fbbf24;margin-bottom:6px"><b>Rotation override:</b> <span id="portableRotateLabel">auto (delta)</span></div>';
    html += '<div style="display:flex;gap:4px;flex-wrap:wrap">';
    html += '<button onclick="portableSetRotation(null)" style="padding:4px 8px;background:rgba(99,102,241,.15);color:#a5b4fc;border:1px solid rgba(99,102,241,.3);border-radius:4px;font-size:10px;cursor:pointer">auto</button>';
    html += '<button onclick="portableSetRotation(0)" style="padding:4px 8px;background:rgba(99,102,241,.15);color:#a5b4fc;border:1px solid rgba(99,102,241,.3);border-radius:4px;font-size:10px;cursor:pointer">0°</button>';
    html += '<button onclick="portableSetRotation(90)" style="padding:4px 8px;background:rgba(99,102,241,.15);color:#a5b4fc;border:1px solid rgba(99,102,241,.3);border-radius:4px;font-size:10px;cursor:pointer">90°</button>';
    html += '<button onclick="portableSetRotation(180)" style="padding:4px 8px;background:rgba(99,102,241,.15);color:#a5b4fc;border:1px solid rgba(99,102,241,.3);border-radius:4px;font-size:10px;cursor:pointer">180°</button>';
    html += '<button onclick="portableSetRotation(-90)" style="padding:4px 8px;background:rgba(99,102,241,.15);color:#a5b4fc;border:1px solid rgba(99,102,241,.3);border-radius:4px;font-size:10px;cursor:pointer">-90°</button>';
    html += '<button onclick="portableNudgeRotation(-15)" style="padding:4px 8px;background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.3);border-radius:4px;font-size:10px;cursor:pointer">-15°</button>';
    html += '<button onclick="portableNudgeRotation(-5)" style="padding:4px 8px;background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.3);border-radius:4px;font-size:10px;cursor:pointer">-5°</button>';
    html += '<button onclick="portableNudgeRotation(5)" style="padding:4px 8px;background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.3);border-radius:4px;font-size:10px;cursor:pointer">+5°</button>';
    html += '<button onclick="portableNudgeRotation(15)" style="padding:4px 8px;background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.3);border-radius:4px;font-size:10px;cursor:pointer">+15°</button>';
    html += '</div>';
    html += '</div>';
  }
  html += '<div id="portablePreviewBox" style="margin-top:8px;display:none;height:300px;border:1px solid #2a2a3a;border-radius:6px"></div>';
  panel.innerHTML = html;
  portableStartRtkPoll(sn);
}

async function portableApplyVerbatim() {
  var sn = document.getElementById('mapMowerSelect').value;
  var msg = 'Restore to mower: pushes csv_file/ + the rasterized map.pgm/png/yaml (+ per-map) back 1-to-1. No rotation, pos.json left untouched. After this you dock-cycle (1m back + ArUco redock) so the dock heading + charger pos refresh. Continue?';
  if (!(await appConfirm(msg, { okText: 'Restore to mower' }))) return;
  var r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/import-portable/' + portableStagingId + '/apply-verbatim', {
    method: 'POST', headers: { 'Authorization': token, 'Content-Type': 'application/json' },
  });
  var j = await r.json();
  if (!j.ok) {
    // Cross-SN block — let the operator force if they really know what they're doing.
    if (j.sourceSn && j.targetSn && j.sourceSn !== j.targetSn) {
      var forceMsg = "Bundle was made on " + j.sourceSn + ", not " + j.targetSn + ". The map is charger-relative and pos.json is left untouched, so this is generally safe; the dock-cycle re-anchors the frame. Continue?";
      if (!(await appConfirm(forceMsg, { destructive: true, okText: 'Force verbatim' }))) {
        portableCheckActive(sn);
        return;
      }
      r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/import-portable/' + portableStagingId + '/apply-verbatim?force=1', {
        method: 'POST', headers: { 'Authorization': token, 'Content-Type': 'application/json' },
      });
      j = await r.json();
      if (!j.ok) { await appAlert('Apply (forced) failed: ' + j.error, { accent: 'danger' }); portableCheckActive(sn); return; }
    } else {
      await appAlert('Apply failed: ' + j.error, { accent: 'danger' });
      portableCheckActive(sn);
      return;
    }
  }
  var w = j.written || {};
  await appAlert(
    'Verbatim restore applied.\\n\\n' +
    'CSVs: ' + (w.csvFiles || 0) + '\\n' +
    'pos.json: ' + (w.posJson ? 'yes' : 'no') + '\\n' +
    'map text files: ' + (w.mapFilesText || 0) + '\\n' +
    'map binary files: ' + (w.mapFilesB64 || 0) + '\\n' +
    'charging_station.yaml: ' + (w.chargingStationYaml ? 'yes' : 'no'),
    { accent: 'success' }
  );
  document.getElementById('portableImportPanel').style.display = 'none';
  portableStagingId = null;
  portableExactRestore = false;
  portableVerbatimRestore = false;
  loadMaps();
  if (j.requires_dock_anchor_refresh) await promptDockAnchorRefresh(sn);
}

// After any restore, the mower's pos.json (UTM anchor) no longer matches
// reality. The mower's own docking flow rewrites pos.json on a successful
// dock cycle — we just need to nudge the user (or the mower) through one.
async function promptDockAnchorRefresh(sn) {
  var explanation =
    'Polygons restored, but the mower\\'s UTM anchor is stale until the next docking. ' +
    'Without a refresh, the local frame may be 1-2m off from physical reality and ' +
    'polygons would land in the wrong spot. Pick one:';
  var choice = await appModal({
    title: 'Dock anchor refresh required',
    body: explanation,
    accent: 'warning',
    dismissOnBackdrop: false,
    buttons: [
      { text: 'Skip (do later)', value: 'skip' },
      { text: 'I will do it manually', value: 'manual' },
      { text: 'Automatic (1m drive)', primary: true, value: 'auto' },
    ],
  });
  if (choice === 'skip' || !choice) return;
  var r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/refresh-dock-anchor', {
    method: 'POST',
    headers: { 'Authorization': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: choice }),
  });
  var j = await r.json();
  if (!j.ok) { await appAlert('Dock-anchor refresh failed: ' + (j.error || 'unknown'), { accent: 'danger' }); return; }
  if (choice === 'manual') {
    await appAlert(j.instruction || 'Move mower off dock briefly then dock again.', { accent: 'info', title: 'Refresh instruction' });
    return;
  }
  // Auto: poll battery_state until Charging returns (or timeout).
  await pollDockAnchorAuto(sn);
}

async function pollDockAnchorAuto(sn) {
  var startMs = Date.now();
  var timeoutMs = 90000;
  var modal = appModal({
    title: 'Auto-redock in progress',
    body: 'Starting...',
    accent: 'info',
    dismissOnBackdrop: false,
    buttons: [{ text: 'Cancel', value: 'cancel' }],
  });
  var cancelled = false;
  modal.then(function(v) { if (v === 'cancel') cancelled = true; });
  while (Date.now() - startMs < timeoutMs && !cancelled) {
    await new Promise(function(r) { return setTimeout(r, 2000); });
    try {
      var r = await fetch('/api/admin-status/devices', { headers: { 'Authorization': token } });
      var j = await r.json();
      var devs = (j && j.data) || j || [];
      var dev = (Array.isArray(devs) ? devs : []).find(function(d) { return d.sn === sn; });
      var sensors = (dev && dev.sensors) || {};
      var battery = String(sensors.battery_state || '');
      var work = String(sensors.work_status || '');
      var elapsed = Math.round((Date.now() - startMs) / 1000);
      // Update modal body via textContent (XSS-safe).
      var bodyEl = document.querySelector('.modal-box .modal-msg');
      if (bodyEl) {
        bodyEl.textContent =
          'Elapsed: ' + elapsed + 's\\n' +
          'work_status: ' + (work || '?') + '\\n' +
          'battery_state: ' + (battery || '?');
        bodyEl.style.whiteSpace = 'pre-line';
      }
      if (battery === 'Charging' && elapsed > 10) {
        if (bodyEl) bodyEl.textContent += '\\n\\nDocked! UTM anchor refreshed via save_utm_origin.';
        return;
      }
    } catch (e) { /* keep polling */ }
  }
  var bodyEl2 = document.querySelector('.modal-box .modal-msg');
  if (bodyEl2 && !cancelled) {
    bodyEl2.textContent += '\\n\\nTimeout - check mower state manually.';
  }
}

async function portableStartDrive() {
  var sn = document.getElementById('mapMowerSelect').value;
  if (!(await appConfirm('Mower will drive 1m BACKWARD off the dock then wait for RTK FIX. Ensure clear path behind the mower. Continue?', { destructive: true, okText: 'Drive' }))) return;
  var r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/import-portable/' + portableStagingId + '/start-drive', {
    method: 'POST', headers: { 'Authorization': token },
  });
  var j = await r.json();
  if (!j.ok) {
    await appAlert('Drive failed: ' + j.error + (j.recoverable ? '\\n\\nClick "Start drive" again to retry - bundle is preserved.' : ''), { accent: 'danger' });
    // Re-fetch active state so the UI reflects whether we can retry.
    portableCheckActive(sn);
    return;
  }
  await appAlert('Drive complete. Heading derived: ' + (j.derivedHeadingRad * 180 / Math.PI).toFixed(2) + ' deg, distance ' + j.distanceM.toFixed(2) + ' m', { accent: 'success' });
  renderPortableImportWizard(sn, j.state);
}

async function portableAutoDock() {
  var sn = document.getElementById('mapMowerSelect').value;
  var r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/import-portable/' + portableStagingId + '/auto-dock', {
    method: 'POST', headers: { 'Authorization': token },
  });
  var j = await r.json();
  if (!j.ok) {
    await appAlert('Snapshot failed: ' + j.error + (j.recoverable ? '\\n\\nFix the condition then click again.' : ''), { accent: 'danger' });
    portableCheckActive(sn);
    return;
  }
  await appAlert('Anchor saved. lat=' + j.newCharger.lat.toFixed(7) + ', lng=' + j.newCharger.lng.toFixed(7), { accent: 'success' });
  renderPortableImportWizard(sn, j.state);
}

var portableRotateDeg = null; // null = use server delta math; number = override
var portableGeoLayer = null;
var portablePreviewMap = null;

async function portableShowPreview() {
  var sn = document.getElementById('mapMowerSelect').value;
  var url = '/api/admin-status/maps/' + encodeURIComponent(sn) + '/import-portable/' + portableStagingId + '/preview';
  if (portableRotateDeg !== null) url += '?rotateDeg=' + portableRotateDeg;
  var r = await fetch(url, { headers: { 'Authorization': token } });
  var geo = await r.json();
  renderPortableImportWizard(sn, 'PREVIEW_SHOWN');
  var box = document.getElementById('portablePreviewBox');
  box.style.display = 'block';
  if (!window.L) {
    box.innerHTML = '<div style="color:#fca5a5;padding:8px">Leaflet not loaded</div>';
    return;
  }
  var center = geo.features[0]?.geometry?.coordinates?.[0]?.[0] || [6.23, 52.14];
  portablePreviewMap = L.map(box).setView([center[1], center[0]], 19);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(portablePreviewMap);
  portableGeoLayer = L.geoJSON(geo, {
    style: function(f) {
      var k = f.properties.kind;
      return k === 'work' ? { color: '#10b981', weight: 2 } : k === 'obstacle' ? { color: '#ef4444', weight: 2 } : { color: '#3b82f6', weight: 2 };
    },
  }).addTo(portablePreviewMap);
  box.__map = portablePreviewMap;
  setTimeout(function() { try { portablePreviewMap.invalidateSize(); } catch (e) {} }, 100);
}

async function portableRefreshPreview() {
  if (!portablePreviewMap || !portableGeoLayer) { portableShowPreview(); return; }
  var sn = document.getElementById('mapMowerSelect').value;
  var url = '/api/admin-status/maps/' + encodeURIComponent(sn) + '/import-portable/' + portableStagingId + '/preview';
  if (portableRotateDeg !== null) url += '?rotateDeg=' + portableRotateDeg;
  var r = await fetch(url, { headers: { 'Authorization': token } });
  var geo = await r.json();
  portablePreviewMap.removeLayer(portableGeoLayer);
  portableGeoLayer = L.geoJSON(geo, {
    style: function(f) {
      var k = f.properties.kind;
      return k === 'work' ? { color: '#10b981', weight: 2 } : k === 'obstacle' ? { color: '#ef4444', weight: 2 } : { color: '#3b82f6', weight: 2 };
    },
  }).addTo(portablePreviewMap);
  var lbl = document.getElementById('portableRotateLabel');
  if (lbl) lbl.textContent = portableRotateDeg === null ? 'auto (delta)' : portableRotateDeg + '°';
}

function portableSetRotation(deg) {
  portableRotateDeg = deg;
  portableRefreshPreview();
}

function portableNudgeRotation(delta) {
  var cur = portableRotateDeg === null ? 0 : portableRotateDeg;
  portableRotateDeg = ((cur + delta + 540) % 360) - 180;
  portableRefreshPreview();
}

async function portableConfirm() {
  var sn = document.getElementById('mapMowerSelect').value;
  if (!(await appConfirm('Apply imported polygon? This wipes existing maps for this SN and triggers sync_map.', { destructive: true, okText: 'Apply' }))) return;
  var body = {};
  if (portableRotateDeg !== null) body.rotateDeg = portableRotateDeg;
  var r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/import-portable/' + portableStagingId + '/confirm', {
    method: 'POST',
    headers: { 'Authorization': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  var j = await r.json();
  if (!j.ok) { await appAlert('Confirm failed: ' + j.error, { accent: 'danger' }); return; }
  await appAlert('Applied. Sync_map triggered.', { accent: 'success' });
  document.getElementById('portableImportPanel').style.display = 'none';
  portableStagingId = null;
  portableRotateDeg = null;
  loadMaps();
}

async function portableCancel() {
  var sn = document.getElementById('mapMowerSelect').value;
  await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/import-portable/' + portableStagingId + '/cancel', {
    method: 'POST', headers: { 'Authorization': token },
  });
  document.getElementById('portableImportPanel').style.display = 'none';
  portableStagingId = null;
}

// ── Map Recovery functions ────────────────────────────────────────────────────

async function loadMapBackups(sn) {
  var sel = document.getElementById('mapBackupSelect');
  var tree = document.getElementById('mapBackupTree');
  var status = document.getElementById('mapRecoveryStatus');
  status.style.display = 'none';
  tree.innerHTML = '';
  sel.innerHTML = '<option value="">Select a backup snapshot...</option>';

  if (!sn) return;

  try {
    var r = await fetch('/api/admin-status/map-backups/' + encodeURIComponent(sn), {
      headers: { 'Authorization': token },
    });
    var data = await r.json();
    var backups = data.backups || [];

    if (backups.length === 0) {
      sel.innerHTML = '<option value="">No backups available</option>';
      return;
    }

    for (var b of backups) {
      var opt = document.createElement('option');
      opt.value = b.filename;
      var dt = new Date(b.ts);
      var label = dt.toLocaleString() + '  (' + (b.sizeBytes > 1024 ? Math.round(b.sizeBytes / 1024) + ' KB' : b.sizeBytes + ' B') + ')';
      opt.textContent = label;
      sel.appendChild(opt);
    }
  } catch(e) {
    status.style.display = 'block';
    status.style.color = '#f87171';
    status.textContent = 'Failed to load backups: ' + e.message;
  }
}

/** Render the selected backup as a dashed ghost overlay on top of the
 *  current live polygons, so the operator sees what they would get BEFORE
 *  hitting Restore. Called from the dropdown's onchange.
 *  Empty selection → clear the ghost (re-render live only). */
async function previewBackupGhost() {
  var sn = document.getElementById('mapMowerSelect').value;
  var filename = document.getElementById('mapBackupSelect').value;
  var canvas = document.getElementById('mapCanvas');
  if (!canvas || !canvas.__mapState) return;

  if (!sn || !filename) {
    // Clear ghost — re-render with live maps + no overlay.
    var st = canvas.__mapState;
    renderMapCanvas(canvas, st.maps || [], st.chargingPose || null);
    return;
  }

  try {
    var r = await fetch('/api/admin-status/map-backups/' + encodeURIComponent(sn)
                        + '/' + encodeURIComponent(filename) + '/polygons', {
      headers: { 'Authorization': token },
    });
    if (!r.ok) {
      var err = await r.json().catch(function(){return{};});
      console.warn('Backup polygon fetch failed:', err);
      return;
    }
    var data = await r.json();
    var ghostMaps = data.maps || [];
    var st = canvas.__mapState;
    // Render LIVE on top, BACKUP as ghost. renderMapCanvas already draws
    // ghosts as white dashed outlines underneath the live layer (added for
    // polygon-offset calibration; reused here without changes).
    renderMapCanvas(canvas, st.maps || [], st.chargingPose || null, ghostMaps);
  } catch(e) {
    console.warn('previewBackupGhost: ' + e.message);
  }
}


async function loadBackupContents() {
  var sn = document.getElementById('mapMowerSelect').value;
  var filename = document.getElementById('mapBackupSelect').value;
  var tree = document.getElementById('mapBackupTree');
  var status = document.getElementById('mapRecoveryStatus');
  status.style.display = 'none';
  tree.innerHTML = '';

  if (!sn || !filename) return;

  try {
    var r = await fetch('/api/admin-status/map-backups/' + encodeURIComponent(sn) + '/' + encodeURIComponent(filename) + '/contents', {
      headers: { 'Authorization': token },
    });
    if (!r.ok) { var err = await r.json().catch(function(){return{};});throw new Error(err.error||'HTTP '+r.status); }
    var data = await r.json();

    var html = '';
    function renderGroup(label, items, type, color) {
      if (!items || items.length === 0) return '';
      var h = '<div style="margin-bottom:8px">';
      h += '<label style="font-size:11px;font-weight:600;color:' + color + ';cursor:pointer;display:flex;align-items:center;gap:4px">';
      h += '<input type="checkbox" class="backup-grp-all" data-type="' + type + '" onchange="toggleBackupGroup(this)" style="cursor:pointer"> ' + label + ' (' + items.length + ')';
      h += '</label>';
      h += '<div style="margin-left:16px;margin-top:4px">';
      for (var item of items) {
        var safeCanon = escHtml(item.canonicalName);
        var conflictId = 'conflict_' + type + '_' + safeCanon.replace(/[^a-zA-Z0-9]/g, '_');
        h += '<div style="display:flex;align-items:center;gap:6px;padding:2px 0;flex-wrap:wrap">';
        h += '<label style="font-size:11px;color:#ccc;cursor:pointer;display:flex;align-items:center;gap:4px">';
        h += '<input type="checkbox" class="backup-item-chk" data-type="' + type + '" data-canonical="' + safeCanon + '" onchange="onBackupItemChange(this)" style="cursor:pointer"> ';
        h += safeCanon + ' <span style="color:#666;margin-left:4px">' + item.pointCount + ' pts</span>';
        h += '</label>';
        if (item.existsInDb) {
          h += '<span style="font-size:10px;font-weight:600;color:#f59e0b;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);border-radius:4px;padding:1px 6px">Exists in DB</span>';
          h += '<span id="' + conflictId + '" style="display:none;font-size:10px;gap:6px;align-items:center">';
          h += '<label style="cursor:pointer;display:flex;align-items:center;gap:2px;color:#94a3b8"><input type="radio" name="' + conflictId + '" class="conflict-radio" data-canonical="' + safeCanon + '" data-type="' + type + '" value="skip" checked> Skip</label>';
          h += '<label style="cursor:pointer;display:flex;align-items:center;gap:2px;color:#fca5a5"><input type="radio" name="' + conflictId + '" class="conflict-radio" data-canonical="' + safeCanon + '" data-type="' + type + '" value="overwrite"> <b>Overwrite</b></label>';
          h += '</span>';
        }
        h += '</div>';
      }
      h += '</div></div>';
      return h;
    }

    html += renderGroup('Work areas', data.work, 'work', '#86efac');
    html += renderGroup('Obstacles', data.obstacles, 'obstacle', '#fca5a5');
    html += renderGroup('Channels (unicom)', data.unicoms, 'unicom', '#93c5fd');

    if (data.chargingPose) {
      var cp = data.chargingPose;
      html += '<div style="font-size:11px;color:#aaa;margin-top:4px">Charging pose in backup: x=' + cp.x + ' y=' + cp.y + ' θ=' + cp.orientation + '</div>';
    }

    if (!html) html = '<div style="font-size:11px;color:#666">No areas found in this backup.</div>';
    tree.innerHTML = html;
    updateConflictHelpersVisibility();
  } catch(e) {
    status.style.display = 'block';
    status.style.color = '#f87171';
    status.textContent = 'Failed to load backup contents: ' + e.message;
  }
}

function toggleBackupGroup(checkbox) {
  var type = checkbox.dataset.type;
  var checked = checkbox.checked;
  var items = document.querySelectorAll('.backup-item-chk[data-type="' + type + '"]');
  items.forEach(function(cb) { toggleConflictRadio(cb, checked); cb.checked = checked; });
  updateConflictHelpersVisibility();
}

/** Show or hide the conflict radio pair next to a backup-item-chk */
function toggleConflictRadio(cb, show) {
  var safeCanon = (cb.dataset.canonical || '').replace(/[^a-zA-Z0-9]/g, '_');
  var conflictId = 'conflict_' + cb.dataset.type + '_' + safeCanon;
  var el = document.getElementById(conflictId);
  if (el) el.style.display = show ? 'inline-flex' : 'none';
}

/** Called from inline onchange on each .backup-item-chk */
function onBackupItemChange(cb) {
  toggleConflictRadio(cb, cb.checked);
  updateConflictHelpersVisibility();
}

/** Bulk-set all conflict radios to overwrite (true) or skip (false) */
function setAllConflicts(doOverwrite) {
  var radios = document.querySelectorAll('.conflict-radio[value="' + (doOverwrite ? 'overwrite' : 'skip') + '"]');
  radios.forEach(function(r) { r.checked = true; });
}

/** Show "Overwrite/Skip all" helpers only when at least one selected backup
 *  item conflicts with an existing DB row. */
function updateConflictHelpersVisibility() {
  var helpers = document.getElementById('conflictHelpers');
  if (!helpers) return;
  // A conflict-radio pair is rendered only for items that exist in the DB,
  // and shown only when its parent checkbox is checked. Use that visibility
  // as the trigger.
  var visiblePairs = 0;
  document.querySelectorAll('[id^="conflict_"]').forEach(function(el) {
    if (el.style.display && el.style.display !== 'none') visiblePairs++;
  });
  helpers.style.display = visiblePairs > 0 ? 'flex' : 'none';
}

/** Single restore entry point — branches on the "Also push to mower" checkbox.
 *  Checked = full restore-and-realign (DB + sync_map MQTT push + GPS update).
 *  Unchecked = DB-only restore. */
async function restoreBackup() {
  var realign = document.getElementById('restoreRealignChk').checked;
  if (realign) {
    return restoreAndRealign();
  }
  return restoreSelection();
}

async function restoreSelection() {
  var sn = document.getElementById('mapMowerSelect').value;
  var filename = document.getElementById('mapBackupSelect').value;
  var status = document.getElementById('mapRecoveryStatus');
  status.style.display = 'block';

  if (!sn) { status.style.color='#f87171'; status.textContent='Please select a mower first.'; return; }
  if (!filename) { status.style.color='#f87171'; status.textContent='Please select a backup snapshot first.'; return; }

  var checked = document.querySelectorAll('.backup-item-chk:checked');
  if (checked.length === 0) { status.style.color='#f87171'; status.textContent='Please select at least one item to restore.'; return; }

  var items = [];
  checked.forEach(function(cb) {
    var safeCanon = (cb.dataset.canonical || '').replace(/[^a-zA-Z0-9]/g, '_');
    var conflictId = 'conflict_' + cb.dataset.type + '_' + safeCanon;
    var overwriteRadio = document.querySelector('#' + conflictId + ' input[value="overwrite"]');
    var overwrite = overwriteRadio ? overwriteRadio.checked : false;
    items.push({ canonicalName: cb.dataset.canonical, type: cb.dataset.type, overwrite: overwrite });
  });

  status.style.color = '#60a5fa';
  status.textContent = 'Restoring ' + items.length + ' item(s)...';

  try {
    var r = await fetch('/api/admin-status/map-backups/' + encodeURIComponent(sn) + '/' + encodeURIComponent(filename) + '/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': token },
      body: JSON.stringify({ items }),
    });
    var result = await r.json().catch(function(){ return {}; });
    if (!r.ok || !result.ok) throw new Error(result.error || 'HTTP ' + r.status);

    var parts = [];
    if (result.restored > 0) parts.push('Restored ' + result.restored);
    if (result.overwritten > 0) parts.push('overwritten ' + result.overwritten);
    if (result.skippedExisting > 0) parts.push('skipped ' + result.skippedExisting + ' (already existed)');
    if (result.skippedNotInBackup > 0) parts.push('skipped ' + result.skippedNotInBackup + ' (not in backup)');
    status.style.color = '#00d4aa';
    status.textContent = parts.join(', ') + '.';
    loadMaps();
  } catch(e) {
    status.style.color = '#f87171';
    status.textContent = 'Restore failed: ' + e.message;
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Restore + Realign Mower (Novabot-ff8): one-click recovery that runs the full
// flow documented in docs/runbooks/charger-anchor-restore-runbook.md. Calls
// POST /api/admin-status/map-backups/<SN>/<filename>/restore-and-realign.
async function restoreAndRealign() {
  var sn = document.getElementById('mapMowerSelect').value;
  var filename = document.getElementById('mapBackupSelect').value;
  var status = document.getElementById('mapRecoveryStatus');
  status.style.display = 'block';

  if (!sn) { status.style.color='#f87171'; status.textContent='Please select a mower first.'; return; }
  if (!filename) { status.style.color='#f87171'; status.textContent='Please select a backup snapshot first.'; return; }

  var ok = await appConfirm(
    'Restore + Realign Mower will:\\n\\n' +
    '  1. Restore ALL polygons + obstacles + unicom from the selected backup ZIP (overwrites existing rows)\\n' +
    '  2. Re-anchor charger pose from the polygon mapNtocharge_unicom first point\\n' +
    '  3. Update DB chargerGps to the mower live RTK GPS reading\\n' +
    '  4. Regenerate <SN>_latest.zip with embedded charger pose\\n' +
    '  5. Push everything to mower via sync_map MQTT\\n' +
    '  6. Mower restarts novabot_mapping + auto_recharge_server\\n\\n' +
    'Preconditions: mower must be online + on dock + RTK FIX.',
    { destructive: true, okText: 'Restore + Realign' }
  );
  if (!ok) return;

  status.style.color = '#60a5fa';
  status.textContent = 'Restore + Realign in progress (up to 30 s)…';

  try {
    var r = await fetch('/api/admin-status/map-backups/' + encodeURIComponent(sn) + '/' + encodeURIComponent(filename) + '/restore-and-realign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': token },
    });
    var result = await r.json().catch(function(){ return {}; });
    if (!r.ok || !result.ok) {
      var errMsg = result.error || ('HTTP ' + r.status);
      if (result.partial) errMsg += ' (partial: server-side state already restored — re-run after mower recovers)';
      throw new Error(errMsg);
    }

    var anchorStr = result.anchor
      ? '(' + result.anchor.x.toFixed(2) + ', ' + result.anchor.y.toFixed(2) + ', ' + result.anchor.orientation.toFixed(2) + ')'
      : '?';
    status.style.color = '#00d4aa';
    status.textContent = 'Restore + Realign complete — restored ' + (result.restoredItems || 0) + ' items, anchor ' + anchorStr;
    loadMaps();
  } catch(e) {
    status.style.color = '#f87171';
    status.textContent = 'Restore + Realign failed: ' + e.message;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Polygon offset calibration mode
// Spec: docs/superpowers/specs/2026-05-03-admin-polygon-offset-calibration.md
// ─────────────────────────────────────────────────────────────────────────────

var polygonCal = null;  // { dx, dy, ghostMaps } | null

async function enterPolygonCalibration() {
  if (polygonCal) return;  // already in calibration mode
  var sn = document.getElementById('mapMowerSelect').value;
  if (!sn) { await appAlert('Select a mower first.', { accent: 'warning' }); return; }

  var r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/polygon-offset', {
    headers: { 'Authorization': token },
  });
  var current = r.ok ? await r.json() : { dx_m: 0, dy_m: 0 };

  var canvas = document.getElementById('mapCanvas');
  var ghostMaps = canvas.__mapState && canvas.__mapState.maps
    ? JSON.parse(JSON.stringify(canvas.__mapState.maps))
    : null;

  polygonCal = {
    dx: current.dx_m || 0,
    dy: current.dy_m || 0,
    ghostMaps: ghostMaps,
  };

  document.getElementById('polygonCalPanel').style.display = 'block';
  makePolygonCalPanelDraggable();
  updatePolygonCalDisplay();
  rerenderWithGhost();
  document.addEventListener('keydown', polygonCalKeyHandler);
}

// Make the polygon-offset panel draggable by its header so it doesn't block
// the canvas. Idempotent — only binds once per page load. Position persists
// across cancel/reopen within a single page load (reset on full reload).
function makePolygonCalPanelDraggable() {
  var panel = document.getElementById('polygonCalPanel');
  if (!panel || panel.__draggable) return;
  panel.__draggable = true;
  var header = document.getElementById('polygonCalHeader');
  if (!header) return;
  var dragging = false;
  var startX = 0, startY = 0;
  var panelStartX = 0, panelStartY = 0;
  header.addEventListener('mousedown', function(e) {
    // Don't initiate drag if the user clicked the (×) close span — it
    // carries an onclick handler we must not swallow.
    if (e.target && e.target.getAttribute && e.target.getAttribute('onclick')) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    var rect = panel.getBoundingClientRect();
    var parentRect = panel.parentElement.getBoundingClientRect();
    panelStartX = rect.left - parentRect.left;
    panelStartY = rect.top - parentRect.top;
    e.preventDefault();
  });
  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    var parent = panel.parentElement;
    var parentW = parent.clientWidth;
    var parentH = parent.clientHeight;
    var newLeft = panelStartX + (e.clientX - startX);
    var newTop = panelStartY + (e.clientY - startY);
    // Keep at least a strip of the panel visible (40px) so the user can
    // always grab it back into view.
    newLeft = Math.max(40 - panel.offsetWidth, Math.min(parentW - 40, newLeft));
    newTop = Math.max(0, Math.min(parentH - 40, newTop));
    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
  });
  document.addEventListener('mouseup', function() {
    dragging = false;
  });
}

function cancelPolygonCalibration() {
  polygonCal = null;
  document.getElementById('polygonCalPanel').style.display = 'none';
  document.removeEventListener('keydown', polygonCalKeyHandler);
  loadMaps();
}

function resetPolygonOffsetUI() {
  if (!polygonCal) return;
  polygonCal.dx = 0;
  polygonCal.dy = 0;
  updatePolygonCalDisplay();
  rerenderWithGhost();
}

function nudgePolygonOffset(dx, dy, evt) {
  if (!polygonCal) return;
  var mult = (evt && evt.shiftKey) ? 10 : 1;
  polygonCal.dx = +(polygonCal.dx + dx * mult).toFixed(3);
  polygonCal.dy = +(polygonCal.dy + dy * mult).toFixed(3);
  updatePolygonCalDisplay();
  rerenderWithGhost();
}

function polygonCalKeyHandler(e) {
  if (!polygonCal) return;
  var step = e.shiftKey ? 0.10 : 0.01;
  switch (e.key) {
    case 'ArrowUp':    nudgePolygonOffset(0, step, null); e.preventDefault(); break;
    case 'ArrowDown':  nudgePolygonOffset(0, -step, null); e.preventDefault(); break;
    case 'ArrowLeft':  nudgePolygonOffset(-step, 0, null); e.preventDefault(); break;
    case 'ArrowRight': nudgePolygonOffset(step, 0, null); e.preventDefault(); break;
    case 'Escape':     cancelPolygonCalibration(); break;
  }
}

function updatePolygonCalDisplay() {
  if (!polygonCal) return;
  var d = document.getElementById('polygonCalDisplay');
  var sx = (polygonCal.dx >= 0 ? '+' : '') + polygonCal.dx.toFixed(2);
  var sy = (polygonCal.dy >= 0 ? '+' : '') + polygonCal.dy.toFixed(2);
  d.textContent = sx + ', ' + sy + ' m';
}

function rerenderWithGhost() {
  if (!polygonCal) return;
  var canvas = document.getElementById('mapCanvas');
  if (!canvas || !canvas.__mapState) return;
  var ghostBase = polygonCal.ghostMaps || canvas.__mapState.maps;
  var live = JSON.parse(JSON.stringify(ghostBase)).map(function(m) {
    if (!m.mapArea || !Array.isArray(m.mapArea)) return m;
    var isToCharge = /^map\\d+tocharge_unicom$/.test(m.mapName || '');
    m.mapArea = m.mapArea.map(function(p, i) {
      if (isToCharge && i === 0) return p;
      return { x: p.x + polygonCal.dx, y: p.y + polygonCal.dy };
    });
    return m;
  });
  renderMapCanvas(canvas, live, canvas.__mapState.chargingPose, ghostBase);
}

async function applyPolygonOffset() {
  if (!polygonCal) return;
  var sn = document.getElementById('mapMowerSelect').value;
  var btn = document.getElementById('polygonCalApplyBtn');
  var status = document.getElementById('polygonCalStatus');
  btn.disabled = true;
  status.style.color = '#60a5fa';
  status.textContent = 'Applying...';

  try {
    var r = await fetch('/api/admin-status/maps/' + encodeURIComponent(sn) + '/apply-polygon-offset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': token },
      body: JSON.stringify({ dx_m: polygonCal.dx, dy_m: polygonCal.dy }),
    });
    var result = await r.json().catch(function(){ return {}; });
    console.log('apply-polygon-offset response:', result);
    if (!r.ok || !result.ok) {
      var msg = result.error || ('HTTP ' + r.status);
      if (result.syncResult && result.syncResult.error) msg += ' — mower: ' + result.syncResult.error;
      else if (result.syncResult) msg += ' — mower respond: ' + JSON.stringify(result.syncResult);
      if (result.partial) msg += ' (partial: DB updated, mower not yet synced)';
      throw new Error(msg);
    }
    status.style.color = '#10b981';
    status.textContent = 'Applied (' + polygonCal.dx.toFixed(2) + ', ' + polygonCal.dy.toFixed(2) + ' m). Synced.';
    setTimeout(cancelPolygonCalibration, 1200);
  } catch (e) {
    status.style.color = '#f87171';
    status.textContent = 'Apply failed: ' + e.message;
    btn.disabled = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

// Attach mouse-wheel zoom + drag pan handlers to the map canvas. Idempotent:
// only attaches once per canvas (flag set on element). Re-renders by calling
// renderMapCanvas with the cached maps + chargingPose stored on the element.
function attachMapInteraction(canvas) {
  if (canvas.__interactionBound) return;
  canvas.__interactionBound = true;
  canvas.style.cursor = 'grab';

  function reRender() {
    var st = canvas.__mapState;
    if (!st || !st.maps) return;
    // While polygon-offset calibration is active, route through
    // rerenderWithGhost() so the ghost (pre-offset reference) layer
    // stays in sync with zoom + pan. The plain renderMapCanvas path
    // dropped the 4th ghostMaps argument, which made the ghost layer
    // disappear after the first wheel/drag event.
    if (typeof polygonCal !== 'undefined' && polygonCal) {
      rerenderWithGhost();
    } else {
      renderMapCanvas(canvas, st.maps, st.chargingPose || null);
    }
  }

  // Zoom on wheel — anchor at cursor so cursor-pixel stays fixed.
  canvas.addEventListener('wheel', function(e) {
    e.preventDefault();
    var st = canvas.__mapState;
    if (!st) return;
    var rect = canvas.getBoundingClientRect();
    var cx = e.clientX - rect.left;
    var cy = e.clientY - rect.top;
    var oldScale = st.userScale;
    var factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    var newScale = Math.max(0.2, Math.min(20, oldScale * factor));
    if (newScale === oldScale) return;
    // Adjust pan so the cursor-anchor stays put: pan += (cx, cy) * (1 - newScale/oldScale)
    var ratio = newScale / oldScale;
    st.userPanX = cx - (cx - st.userPanX) * ratio;
    st.userPanY = cy - (cy - st.userPanY) * ratio;
    st.userScale = newScale;
    reRender();
  }, { passive: false });

  // Pan on drag
  var dragging = false;
  var dragX = 0, dragY = 0;
  canvas.addEventListener('mousedown', function(e) {
    dragging = true;
    dragX = e.clientX;
    dragY = e.clientY;
    canvas.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    var st = canvas.__mapState;
    if (!st) return;
    st.userPanX += (e.clientX - dragX);
    st.userPanY += (e.clientY - dragY);
    dragX = e.clientX;
    dragY = e.clientY;
    reRender();
  });
  window.addEventListener('mouseup', function() {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = 'grab';
  });

  // Double-click resets to fit-to-bounds
  canvas.addEventListener('dblclick', function() {
    var st = canvas.__mapState;
    if (!st) return;
    st.userScale = 1;
    st.userPanX = 0;
    st.userPanY = 0;
    reRender();
  });
}

async function loadMaps() {
  var sn = document.getElementById('mapMowerSelect').value;
  var info = document.getElementById('mapInfo');
  var canvas = document.getElementById('mapCanvas');
  var legend = document.getElementById('mapLegend');
  var ctx = canvas.getContext('2d');

  var mapList = document.getElementById('mapList');

  if (!sn) {
    info.textContent = '';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    legend.style.display = 'none';
    mapList.innerHTML = '';
    return;
  }

  info.textContent = 'Loading maps for ' + sn + '...';

  try {
    var r = await fetch('/api/dashboard/maps/' + encodeURIComponent(sn), {
      headers: { 'Authorization': token }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var data = await r.json();
    var maps = data.maps || [];

    if (maps.length === 0) {
      info.textContent = 'No maps found for ' + sn;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      legend.style.display = 'none';
      mapList.innerHTML = '';
      return;
    }

    var workCount = maps.filter(function(m) { return m.mapType === 'work'; }).length;
    info.textContent = workCount + ' work area(s), ' + maps.length + ' total for ' + sn;
    legend.style.display = 'flex';
    renderMapCanvas(canvas, maps, data.chargingPose || null);
    renderMapList(mapList, maps, sn);
    attachMapInteraction(canvas);
  } catch(e) {
    info.textContent = 'Failed to load maps: ' + e.message;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    legend.style.display = 'none';
    mapList.innerHTML = '';
  }
}

function renderMapCanvas(canvas, maps, chargingPose, ghostMaps) {
  // Cache last-rendered data on the canvas so wheel/drag handlers can
  // re-render without re-fetching from server. Also persists view-state
  // (user-applied zoom + pan) across re-renders so interactions feel
  // continuous instead of resetting to fit-to-bounds.
  canvas.__mapState = canvas.__mapState || { userScale: 1, userPanX: 0, userPanY: 0 };
  canvas.__mapState.maps = maps;
  canvas.__mapState.chargingPose = chargingPose;

  // Get device pixel ratio for sharp rendering
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  var W = rect.width;
  var H = rect.height;

  ctx.clearRect(0, 0, W, H);

  // Charger anchor in local meters (from server map_info.json). Falls back
  // to (0,0) when not available — same as before this change.
  var chargerLx = (chargingPose && typeof chargingPose.x === 'number') ? chargingPose.x : 0;
  var chargerLy = (chargingPose && typeof chargingPose.y === 'number') ? chargingPose.y : 0;

  // Collect all points to find bounds (include charger anchor).
  // Bounds source priority: when ghostMaps present (polygon-offset
  // calibration), anchor bounds on the GHOST so the LIVE (offset-shifted)
  // polygon visibly translates relative to a stable reference. If we used
  // the live points, fit-to-bounds would re-center every nudge, making the
  // live polygon look stationary while the ghost appeared to slide opposite
  // — confusing the operator about which way they were moving the polygon
  // in real-world coordinates.
  var boundSource = (ghostMaps && Array.isArray(ghostMaps) && ghostMaps.length > 0)
    ? ghostMaps : maps;
  var allX = [chargerLx], allY = [chargerLy];
  for (var i = 0; i < boundSource.length; i++) {
    var pts = boundSource[i].mapArea || [];
    for (var j = 0; j < pts.length; j++) {
      allX.push(pts[j].x);
      allY.push(pts[j].y);
    }
  }

  var minX = Math.min.apply(null, allX);
  var maxX = Math.max.apply(null, allX);
  var minY = Math.min.apply(null, allY);
  var maxY = Math.max.apply(null, allY);

  // Add padding
  var pad = 40;
  var rangeX = maxX - minX || 1;
  var rangeY = maxY - minY || 1;
  var scaleX = (W - pad * 2) / rangeX;
  var scaleY = (H - pad * 2) / rangeY;
  var fitScale = Math.min(scaleX, scaleY);
  var scale = fitScale * canvas.__mapState.userScale;

  // Center the drawing (using fit-to-bounds as base, then user pan offset)
  var drawW = rangeX * fitScale;
  var drawH = rangeY * fitScale;
  var baseOffsetX = pad + (W - pad * 2 - drawW) / 2;
  var baseOffsetY = pad + (H - pad * 2 - drawH) / 2;
  var offsetX = baseOffsetX + canvas.__mapState.userPanX;
  var offsetY = baseOffsetY + canvas.__mapState.userPanY;

  // Transform: local meters → canvas pixels (flip y-axis), with user zoom
  function tx(x) { return offsetX + (x - minX) * scale; }
  function ty(y) { return offsetY + (maxY - y) * scale; } // flip Y

  // Draw grid
  ctx.strokeStyle = 'rgba(255,255,255,.04)';
  ctx.lineWidth = 1;
  // Calculate nice grid step
  var gridStep = 1;
  var maxRange = Math.max(rangeX, rangeY);
  if (maxRange > 50) gridStep = 10;
  else if (maxRange > 20) gridStep = 5;
  else if (maxRange > 10) gridStep = 2;

  var gx0 = Math.floor(minX / gridStep) * gridStep;
  var gy0 = Math.floor(minY / gridStep) * gridStep;
  for (var gx = gx0; gx <= maxX; gx += gridStep) {
    var cx = tx(gx);
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
  }
  for (var gy = gy0; gy <= maxY; gy += gridStep) {
    var cy = ty(gy);
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
  }

  // Draw scale bar
  ctx.fillStyle = '#555';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'right';
  ctx.fillText(rangeX.toFixed(1) + 'm x ' + rangeY.toFixed(1) + 'm', W - 10, H - 8);

  // Calibration ghost: render the original (pre-offset) polygons
  // underneath the live (offset-shifted) layer for visual comparison.
  // High-contrast white dashed outline with a faint fill — the previous
  // grey-on-dark was almost invisible against the green work polygon.
  if (ghostMaps && Array.isArray(ghostMaps)) {
    ghostMaps.forEach(function(g) {
      if (!g.mapArea || g.mapArea.length < 2) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      g.mapArea.forEach(function(p, i) {
        var sx = offsetX + (p.x - minX) * scale;
        var sy = offsetY + (maxY - p.y) * scale;
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  }

  // Draw each map polygon
  for (var i = 0; i < maps.length; i++) {
    var map = maps[i];
    var pts = map.mapArea || [];
    if (pts.length < 2) continue;

    var type = (map.mapType || 'work').toLowerCase();
    var isObstacle = type.indexOf('obstacle') >= 0 || type.indexOf('forbidden') >= 0;
    var isUnicom = type.indexOf('unicom') >= 0 || type.indexOf('channel') >= 0 || type.indexOf('passage') >= 0;

    ctx.beginPath();
    ctx.moveTo(tx(pts[0].x), ty(pts[0].y));
    for (var j = 1; j < pts.length; j++) {
      ctx.lineTo(tx(pts[j].x), ty(pts[j].y));
    }

    if (isUnicom) {
      // Draw as polyline (not filled)
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else if (isObstacle) {
      ctx.closePath();
      ctx.fillStyle = 'rgba(239,68,68,.25)';
      ctx.fill();
      ctx.strokeStyle = '#991b1b';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      // Work area (default)
      ctx.closePath();
      ctx.fillStyle = 'rgba(34,197,94,.2)';
      ctx.fill();
      ctx.strokeStyle = '#166534';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw map name label at centroid
    if (pts.length > 0 && map.mapName) {
      var cx = 0, cy = 0;
      for (var j = 0; j < pts.length; j++) { cx += pts[j].x; cy += pts[j].y; }
      cx /= pts.length; cy /= pts.length;
      ctx.fillStyle = '#ccc';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(map.mapName, tx(cx), ty(cy) - 4);
      // Show area for non-unicom
      if (!isUnicom && pts.length >= 3) {
        var area = 0;
        for (var j = 0; j < pts.length; j++) {
          var k = (j + 1) % pts.length;
          area += pts[j].x * pts[k].y - pts[k].x * pts[j].y;
        }
        area = Math.abs(area) / 2;
        ctx.fillStyle = '#888';
        ctx.font = '10px system-ui';
        ctx.fillText(area.toFixed(1) + ' m\\u00B2', tx(cx), ty(cy) + 10);
      } else if (isUnicom && pts.length >= 2) {
        // Channels (unicom) are polylines, not polygons — show their length in
        // meters instead of an area (mapArea is in local meters).
        var ulen = 0;
        for (var j = 1; j < pts.length; j++) {
          var udx = pts[j].x - pts[j - 1].x, udy = pts[j].y - pts[j - 1].y;
          ulen += Math.sqrt(udx * udx + udy * udy);
        }
        ctx.fillStyle = '#888';
        ctx.font = '10px system-ui';
        ctx.fillText(ulen.toFixed(1) + ' m', tx(cx), ty(cy) + 10);
      }
    }
  }

  // Draw charger marker at the charger's anchor in local meters (was
  // hardcoded (0,0) which only matched maps where mapping origin == charger).
  // For polygons mapped with a non-zero charger pose (e.g. Achtertuin
  // anchored at (-1.21, 0.48)), the marker now lands on the unicom start.
  var chargerX = tx(chargerLx);
  var chargerY = ty(chargerLy);
  ctx.beginPath();
  ctx.arc(chargerX, chargerY, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Charger label
  ctx.fillStyle = '#f59e0b';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Charger', chargerX, chargerY - 10);

  // ── Validation overlay: live mower position + dual trail (firmware vs RTK)
  // Read from canvas.__mapState so the polling loop can refresh the data
  // without re-running the polygon render path (cheaper, no fit-to-bounds
  // jitter). Each piece is optional — the polygon canvas works fine when
  // none of them are set yet.
  var st = canvas.__mapState || {};
  var mowerTrail = st.mowerTrail || [];
  var gpsTrail = st.gpsTrail || [];
  var livePose = st.livePose || null;

  function drawTrail(points, color) {
    if (!Array.isArray(points) || points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var sx = tx(p.x);
      var sy = ty(p.y);
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.restore();
  }
  // Firmware-frame trail in cyan (mower's reported map_position over time).
  drawTrail(mowerTrail, 'rgba(34,211,238,0.85)');
  // RTK-derived trail in lime (GPS projected via charger anchor). During
  // polygon-offset calibration we shift this trail by the same dx/dy as
  // the preview polygon so the user can visually align both together with
  // a reference point on the map.
  var displayGpsTrail = gpsTrail;
  if (typeof polygonCal !== 'undefined' && polygonCal
      && (polygonCal.dx !== 0 || polygonCal.dy !== 0)
      && Array.isArray(gpsTrail) && gpsTrail.length > 0) {
    displayGpsTrail = gpsTrail.map(function(p) {
      return { x: p.x + polygonCal.dx, y: p.y + polygonCal.dy };
    });
  }
  drawTrail(displayGpsTrail, 'rgba(132,204,22,0.85)');

  if (livePose && Number.isFinite(livePose.x) && Number.isFinite(livePose.y)) {
    var px = tx(livePose.x);
    var py = ty(livePose.y);
    // Mower body
    ctx.save();
    ctx.fillStyle = '#22d3ee';
    ctx.strokeStyle = '#0e7490';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Heading arrow — orientation is in radians, the local-frame Y axis
    // is north so we rotate clockwise from north for the canvas (where
    // Y grows downward).
    var theta = Number.isFinite(livePose.orientation) ? livePose.orientation : 0;
    var arrowLen = 16;
    var ax = px + arrowLen * Math.cos(theta);
    var ay = py - arrowLen * Math.sin(theta);
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.restore();
  }
}

function renderMapList(container, maps, sn) {
  var typeIcons = { work: '\\u{1F7E9}', obstacle: '\\u{1F7E5}', unicom: '\\u{1F535}' };
  var html = '<div style="font-size:12px;color:#aaa;margin-bottom:6px;font-weight:600">Maps (' + maps.length + ')</div>';
  for (var i = 0; i < maps.length; i++) {
    var m = maps[i];
    var type = (m.mapType || 'work').toLowerCase();
    var icon = typeIcons[type] || '\\u{2B1C}';
    var name = m.mapName || ('map_' + (i + 1));
    var areaStr = '';
    if (type !== 'unicom' && m.mapArea && m.mapArea.length >= 3) {
      var area = 0;
      for (var j = 0; j < m.mapArea.length; j++) {
        var k = (j + 1) % m.mapArea.length;
        area += m.mapArea[j].x * m.mapArea[k].y - m.mapArea[k].x * m.mapArea[j].y;
      }
      area = Math.abs(area) / 2;
      areaStr = ' (' + area.toFixed(1) + ' m\\u00B2)';
    } else if (type === 'unicom' && m.mapArea) {
      // Channels are polylines — show length in meters (mapArea is local meters) + point count.
      var ulen = 0;
      for (var j = 1; j < m.mapArea.length; j++) {
        var udx = m.mapArea[j].x - m.mapArea[j - 1].x, udy = m.mapArea[j].y - m.mapArea[j - 1].y;
        ulen += Math.sqrt(udx * udx + udy * udy);
      }
      areaStr = ' (' + ulen.toFixed(1) + ' m, ' + m.mapArea.length + ' pts)';
    }
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;'
      + 'background:rgba(255,255,255,.03);border-radius:6px;margin-bottom:4px">'
      + '<span style="color:#ddd;font-size:12px">' + icon + ' ' + name + '<span style="color:#888">' + areaStr + '</span>'
      + ' <span style="color:#666;font-size:10px">' + type + '</span></span>'
      + '<button onclick="deleteMap(\\'' + sn + '\\',\\'' + m.mapId + '\\',\\'' + name.replace(/'/g, "\\\\'") + '\\')" '
      + 'style="padding:3px 10px;background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3);'
      + 'border-radius:6px;font-size:11px;cursor:pointer;font-weight:600">Delete</button></div>';
  }
  container.innerHTML = html;
}

async function deleteMap(sn, mapId, mapName) {
  if (!(await appConfirm('Delete map "' + mapName + '"? This cannot be undone.', { destructive: true, okText: 'Delete' }))) return;
  try {
    var r = await fetch('/api/dashboard/maps/' + encodeURIComponent(sn) + '/' + encodeURIComponent(mapId), {
      method: 'DELETE',
      headers: { 'Authorization': token }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    loadMaps();
  } catch(e) {
    await appAlert('Delete failed: ' + e.message, { accent: 'danger' });
  }
}

// ── Firmware Tab ─────────────────────────────────────────────────
var _fwVersions = [];
var _fwDevices = [];

async function syncAndLoadFirmware() {
  try { await fetch('/api/dashboard/ota/sync', { method: 'POST', headers: { 'Authorization': token } }); } catch {}
  loadFirmwareVersions();
}

async function loadFirmwareVersions() {
  try {
    var r = await fetch('/api/dashboard/ota/versions', { headers: { 'Authorization': token } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var d = await r.json();
    _fwVersions = d.versions || d || [];
    var tbody = document.getElementById('fwTableBody');
    if (!_fwVersions.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="color:#666">No firmware versions found</td></tr>';
      return;
    }
    var html = '';
    for (var i = 0; i < _fwVersions.length; i++) {
      var v = _fwVersions[i];
      var devType = (v.device_type || v.deviceType || 'mower');
      var md5 = (v.md5 || '').substring(0, 10);
      var rawNotes = v.release_notes || v.releaseNotes || v.description || '';
      var notesHtml = rawNotes ? rawNotes.split('\\n').join('<br>').replace(/- /g, '&bull; ') : '<span style="color:#666">\u2014</span>';
      html += '<tr>' +
        '<td style="color:#fff;font-weight:600;white-space:nowrap">' + (v.version || '?') + '</td>' +
        '<td><span style="color:' + (devType === 'charger' ? '#f59e0b' : '#00d4aa') + '">' + devType + '</span></td>' +
        '<td style="color:#888;font-family:&quot;Roboto Mono&quot;,ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px">' + md5 + (v.md5 && v.md5.length > 10 ? '...' : '') + '</td>' +
        '<td style="color:#aaa;font-size:11px;line-height:1.6">' + notesHtml + '</td>' +
        '<td><button class="btn btn-sm btn-red" onclick="deleteFirmwareVersion(' + (v.id || v.ID) + ')">Delete</button></td>' +
        '</tr>';
    }
    tbody.innerHTML = html;
    // Also update version dropdown if a device is selected
    onOtaDeviceChange();
  } catch(e) {
    document.getElementById('fwTableBody').innerHTML = '<tr><td colspan="5" style="color:#ef4444">Failed: ' + e.message + '</td></tr>';
  }
}

async function deleteFirmwareVersion(id) {
  var ok = await modalConfirm('Delete Firmware', 'Delete this firmware version? This cannot be undone.');
  if (!ok) return;
  try {
    var r = await fetch('/api/dashboard/ota/versions/' + id, {
      method: 'DELETE',
      headers: { 'Authorization': token }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    loadFirmwareVersions();
    showToast('Firmware version deleted', 'green');
  } catch(e) { modalAlert('Delete Failed', e.message); }
}

async function populateOtaDeviceDropdown() {
  var sel = document.getElementById('otaDeviceSelect');
  try {
    var d = await api('/devices');
    _fwDevices = d.devices || [];
    var prev = sel.value;
    sel.innerHTML = '<option value="">Select device...</option>';
    for (var i = 0; i < _fwDevices.length; i++) {
      var dev = _fwDevices[i];
      var icon = dev.device_type === 'charger' ? '\\u26A1' : '\\uD83E\\uDD16';
      var opt = document.createElement('option');
      opt.value = dev.sn;
      opt.textContent = icon + ' ' + dev.sn + (dev.is_online ? ' (online)' : ' (offline)');
      opt.dataset.type = dev.device_type || 'mower';
      sel.appendChild(opt);
    }
    if (prev && sel.querySelector('option[value="' + prev + '"]')) sel.value = prev;
    onOtaDeviceChange();
  } catch(e) { /* ignore */ }
}

function onOtaDeviceChange() {
  var sel = document.getElementById('otaDeviceSelect');
  var vSel = document.getElementById('otaVersionSelect');
  var curDiv = document.getElementById('otaCurrentVersion');
  vSel.innerHTML = '<option value="">Select version...</option>';
  curDiv.textContent = '';

  if (!sel.value) return;

  // Determine device type
  var opt = sel.options[sel.selectedIndex];
  var devType = (opt.dataset && opt.dataset.type) || (sel.value.startsWith('LFIC') ? 'charger' : 'mower');

  // Show current version from device list
  var dev = _fwDevices.find(function(d) { return d.sn === sel.value; });
  if (dev) {
    var curVer = dev.firmware_version || 'unknown';
    var isON = curVer.includes('custom');
    var badge = isON ? ' <span style="font-size:9px;background:rgba(0,212,170,.15);color:#00d4aa;padding:1px 5px;border-radius:3px;font-weight:600">OpenNova</span>'
      : (curVer !== 'unknown' ? ' <span style="font-size:9px;background:rgba(245,158,11,.15);color:#f59e0b;padding:1px 5px;border-radius:3px;font-weight:600">Stock</span>' : '');
    curDiv.innerHTML = 'Current firmware: <span style="color:#fff;font-weight:600">' + curVer + '</span>' + badge +
      (dev.is_online ? ' <span class="on" style="font-size:11px">(online)</span>' : ' <span class="off" style="font-size:11px">(offline)</span>');
  }

  // Filter versions by device type
  for (var i = 0; i < _fwVersions.length; i++) {
    var v = _fwVersions[i];
    var vType = (v.device_type || v.deviceType || 'mower');
    if (vType !== devType) continue;
    var o = document.createElement('option');
    o.value = v.id || v.ID;
    o.textContent = v.version + (v.release_notes || v.releaseNotes ? ' - ' + truncate(v.release_notes || v.releaseNotes, 30) : '');
    vSel.appendChild(o);
  }
}

async function startOtaUpdate() {
  var sn = document.getElementById('otaDeviceSelect').value;
  var versionId = document.getElementById('otaVersionSelect').value;
  if (!sn) { modalAlert('No Device', 'Please select a device.'); return; }
  if (!versionId) { modalAlert('No Version', 'Please select a firmware version.'); return; }

  var vName = '';
  for (var i = 0; i < _fwVersions.length; i++) {
    if (String(_fwVersions[i].id || _fwVersions[i].ID) === String(versionId)) { vName = _fwVersions[i].version; break; }
  }

  var ok = await modalConfirm('Start OTA Update', 'Update <b>' + sn + '</b> to <b>' + (vName || 'selected version') + '</b>?<br><br>The device will reboot during the update.');
  if (!ok) return;

  // Reset progress UI
  var progressArea = document.getElementById('otaProgress');
  var fill = document.getElementById('otaProgressFill');
  var pctText = document.getElementById('otaPctText');
  var statusText = document.getElementById('otaStatusText');
  progressArea.style.display = 'block';
  fill.style.width = '0%';
  fill.style.background = '#00d4aa';
  pctText.textContent = '0%';
  pctText.style.color = '#00d4aa';
  statusText.textContent = 'Sending update command...';
  statusText.style.color = '#aaa';

  try {
    var r = await fetch('/api/dashboard/ota/trigger/' + encodeURIComponent(sn), {
      method: 'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version_id: parseInt(versionId) })
    });
    if (!r.ok) {
      var errData = await r.json().catch(function() { return {}; });
      throw new Error(errData.error || errData.message || 'HTTP ' + r.status);
    }
    statusText.textContent = 'Update command sent. Waiting for device...';
  } catch(e) {
    statusText.textContent = 'Failed: ' + e.message;
    statusText.style.color = '#ef4444';
    fill.style.background = '#ef4444';
  }
}

// ── Firmware Updates (Download from Cloud) ──────────────────────
var _fwAvailable = [];

async function checkFirmwareUpdates() {
  var btn = document.getElementById('fwCheckBtn');
  var status = document.getElementById('fwUpdateStatus');
  var container = document.getElementById('fwUpdatesAvailable');
  btn.disabled = true;
  btn.textContent = 'Checking...';
  status.textContent = '';
  container.style.display = 'none';
  container.innerHTML = '';
  try {
    var d = await api('/check-firmware-updates');
    var available = (d.available || []).filter(function(fw) { return !fw.installed; });
    _fwAvailable = d.available || [];
    if (available.length === 0) {
      status.textContent = 'All firmware up to date';
      status.style.color = '#00d4aa';
      container.style.display = 'none';
    } else {
      status.textContent = available.length + ' update(s) available';
      status.style.color = '#f59e0b';
      var html = '';
      for (var i = 0; i < available.length; i++) {
        var fw = available[i];
        var typeColor = fw.device_type === 'charger' ? '#f59e0b' : '#00d4aa';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;' + (i > 0 ? 'border-top:1px solid rgba(255,255,255,.06)' : '') + '">' +
          '<div>' +
            '<span style="color:#fff;font-weight:600">' + fw.version + '</span>' +
            ' <span style="color:' + typeColor + ';font-size:12px">' + fw.device_type + '</span>' +
            (fw.description ? '<div style="font-size:11px;color:#888;margin-top:4px;line-height:1.6">' + fw.description.split('\\n').join('<br>').replace(/- /g, '&bull; ') + '</div>' : '') +
          '</div>' +
          '<button class="btn" style="padding:4px 12px;font-size:12px" onclick="downloadFirmwareByIdx(' + i + ')" id="fwDlBtn' + i + '">Download</button>' +
        '</div>';
      }
      container.innerHTML = html;
      container.style.display = 'block';
    }
    // Also show already-installed remote firmwares
    var installed = (d.available || []).filter(function(fw) { return fw.installed; });
    if (installed.length > 0 && available.length > 0) {
      status.textContent += ' (' + installed.length + ' already installed)';
    }
  } catch(e) {
    status.textContent = 'Failed: ' + e.message;
    status.style.color = '#ef4444';
  }
  btn.disabled = false;
  btn.textContent = 'Check for Updates';
}

function downloadFirmwareByIdx(idx) {
  var available = _fwAvailable.filter(function(fw) { return !fw.installed; });
  if (idx >= 0 && idx < available.length) downloadFirmware(available[idx], idx);
}

async function downloadFirmware(fw, btnIdx) {
  var btn = document.getElementById('fwDlBtn' + btnIdx);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="pulse-dot" style="margin-right:6px"></span>Downloading ~35 MB...';
    btn.style.opacity = '0.8';
    btn.style.minWidth = '180px';
  }
  try {
    var d = await api('/download-firmware', 'POST', {
      url: fw.url,
      filename: fw.filename,
      version: fw.version,
      device_type: fw.device_type,
      md5: fw.md5,
      description: fw.description || ''
    });
    if (d.ok) {
      showToast('Firmware ' + fw.version + ' downloaded (' + ((d.size || 0) / 1024 / 1024).toFixed(1) + ' MB)', 'green');
      if (btn) { btn.innerHTML = '&#10003; Downloaded'; btn.style.color = '#00d4aa'; }
      loadFirmwareVersions();
      checkFirmwareUpdates();
    }
  } catch(e) {
    modalAlert('Download Failed', e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Download'; btn.style.opacity = '1'; }
  }
}

// Walker firmware section — lists walker entries from the remote manifest +
// already-installed local versions. Mirrors checkFirmwareUpdates() but lives
// in its own collapsible so operators can find walker builds without scrolling
// the mower/charger update list. Safe DOM helpers only (no innerHTML with
// dynamic content — admin page CSP/security hook rejects it).
async function checkWalkerFirmware() {
  var list = document.getElementById('walker-fw-list');
  if (!list) return;
  while (list.firstChild) list.removeChild(list.firstChild);
  var loading = document.createElement('span');
  loading.style.color = '#888';
  loading.style.fontSize = '11px';
  loading.textContent = 'Loading manifest...';
  list.appendChild(loading);

  var d;
  try {
    d = await api('/check-firmware-updates');
  } catch (e) {
    while (list.firstChild) list.removeChild(list.firstChild);
    var err = document.createElement('span');
    err.style.color = '#ef4444';
    err.style.fontSize = '11px';
    err.textContent = 'Failed to fetch manifest: ' + (e && e.message ? e.message : 'unknown error');
    list.appendChild(err);
    return;
  }

  while (list.firstChild) list.removeChild(list.firstChild);
  var all = (d && d.available) ? d.available : [];
  var walkers = all.filter(function(fw) { return fw.device_type === 'walker'; });
  var installedAll = (d && d.installed) ? d.installed : [];
  var walkersInstalled = installedAll.filter(function(v) { return v.device_type === 'walker'; });

  if (walkers.length === 0 && walkersInstalled.length === 0) {
    var p = document.createElement('span');
    p.style.color = '#aaa';
    p.style.fontSize = '11px';
    p.textContent = 'No walker firmware in manifest or local DB. Publish a build via the release script or scp the .bin into the firmware directory and click Refresh.';
    list.appendChild(p);
    return;
  }

  if (walkersInstalled.length > 0) {
    var head = document.createElement('div');
    head.style.color = '#94a3b8';
    head.style.fontSize = '10px';
    head.style.textTransform = 'uppercase';
    head.style.letterSpacing = '0.5px';
    head.style.margin = '4px 0';
    head.textContent = 'Installed locally';
    list.appendChild(head);
    walkersInstalled.forEach(function(v) {
      var row = document.createElement('div');
      row.style.margin = '2px 0';
      row.style.fontSize = '12px';
      var verSpan = document.createElement('span');
      verSpan.style.color = '#fff';
      verSpan.style.fontWeight = '600';
      verSpan.textContent = v.version;
      var md5Span = document.createElement('span');
      md5Span.style.color = '#666';
      md5Span.style.fontFamily = 'monospace';
      md5Span.style.fontSize = '10px';
      md5Span.style.marginLeft = '8px';
      md5Span.textContent = v.md5 ? (v.md5.substring(0, 10) + '...') : '';
      row.appendChild(verSpan);
      row.appendChild(md5Span);
      list.appendChild(row);
    });
  }

  var pendingHead = document.createElement('div');
  pendingHead.style.color = '#94a3b8';
  pendingHead.style.fontSize = '10px';
  pendingHead.style.textTransform = 'uppercase';
  pendingHead.style.letterSpacing = '0.5px';
  pendingHead.style.margin = '8px 0 4px 0';
  pendingHead.textContent = 'In manifest';
  list.appendChild(pendingHead);

  if (walkers.length === 0) {
    var none = document.createElement('span');
    none.style.color = '#888';
    none.style.fontSize = '11px';
    none.textContent = 'No walker entries in remote manifest.';
    list.appendChild(none);
    return;
  }

  walkers.forEach(function(fw) {
    var row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.padding = '6px 0';
    row.style.borderTop = '1px solid rgba(255,255,255,.04)';

    var left = document.createElement('div');
    var verSpan = document.createElement('span');
    verSpan.style.color = '#fff';
    verSpan.style.fontWeight = '600';
    verSpan.textContent = fw.version;
    left.appendChild(verSpan);

    var sizeSpan = document.createElement('span');
    sizeSpan.style.color = '#94a3b8';
    sizeSpan.style.fontSize = '11px';
    sizeSpan.style.marginLeft = '8px';
    sizeSpan.textContent = '(' + (fw.size ? Math.round(fw.size / 1024) + ' KB' : '?') + ')';
    left.appendChild(sizeSpan);

    if (fw.installed) {
      var tag = document.createElement('span');
      tag.style.marginLeft = '8px';
      tag.style.fontSize = '10px';
      tag.style.color = '#00d4aa';
      tag.textContent = 'installed';
      left.appendChild(tag);
    }
    if (fw.description) {
      var desc = document.createElement('div');
      desc.style.fontSize = '11px';
      desc.style.color = '#888';
      desc.style.marginTop = '2px';
      desc.textContent = fw.description;
      left.appendChild(desc);
    }

    row.appendChild(left);

    var btn = document.createElement('button');
    btn.className = 'btn';
    btn.style.padding = '4px 12px';
    btn.style.fontSize = '12px';
    btn.textContent = fw.installed ? 'Re-download' : 'Download to server';
    btn.onclick = function() { downloadWalkerFw(fw, btn); };
    row.appendChild(btn);

    list.appendChild(row);
  });
}

async function downloadWalkerFw(fw, btn) {
  var ok = await modalConfirm('Download walker firmware', 'Download walker firmware ' + fw.version + ' to the server? This fetches the .bin from the manifest URL and registers it locally.');
  if (!ok) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Downloading...';
    btn.style.opacity = '0.8';
  }
  try {
    var d = await api('/download-firmware', 'POST', {
      url: fw.url,
      filename: fw.filename,
      version: fw.version,
      device_type: 'walker',
      md5: fw.md5,
      sha256: fw.sha256,
      size: fw.size,
      signature: fw.signature,
      keyId: fw.keyId || fw.signingKeyId || fw.signing_key_id,
      description: fw.description || '',
    });
    if (d && d.ok) {
      showToast('Walker firmware ' + fw.version + ' downloaded (' + ((d.size || 0) / 1024).toFixed(1) + ' KB)', 'green');
      loadFirmwareVersions();
      checkWalkerFirmware();
    } else {
      modalAlert('Download Failed', (d && d.error) ? d.error : 'Unknown error');
      if (btn) { btn.disabled = false; btn.textContent = 'Download to server'; btn.style.opacity = '1'; }
    }
  } catch (e) {
    modalAlert('Download Failed', e && e.message ? e.message : 'Unknown error');
    if (btn) { btn.disabled = false; btn.textContent = 'Download to server'; btn.style.opacity = '1'; }
  }
}

async function cloudImport() {
  const email = document.getElementById('cloud_email').value;
  const pass = document.getElementById('cloud_pass').value;
  const btn = document.getElementById('cloudBtn');
  const result = document.getElementById('cloudResult');
  if (!email || !pass) { result.innerHTML = '<div class="msg err" style="display:block">Enter email and password</div>'; return; }

  btn.disabled = true;
  btn.textContent = 'Connecting...';
  result.innerHTML = '';

  try {
    // Step 1: Login to cloud
    const loginRes = await fetch('/api/setup/cloud-login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email, password: pass})
    });
    const loginData = await loginRes.json();
    if (!loginData.ok) {
      result.innerHTML = '<div style="color:#ef4444;font-size:13px">' + (loginData.error || 'Login failed') + '</div>';
      btn.disabled = false; btn.textContent = 'Connect & Import';
      return;
    }

    // Show devices found
    const all = loginData.rawList || [];
    let devHtml = '<div style="font-size:12px;color:#00d4aa;margin-bottom:8px">Found ' + all.length + ' device(s)</div>';
    all.forEach(function(d) {
      const sn = d.mowerSn || d.chargerSn || d.sn || '?';
      const type = sn.startsWith('LFIC') ? 'Charger' : sn.startsWith('LFIN') ? 'Mower' : '?';
      devHtml += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px"><span class="sn">' + sn + '</span><span style="color:#aaa">' + type + '</span></div>';
    });
    result.innerHTML = devHtml;

    // Step 2: Merge cloud records into paired sets, then import each pair in 1 call
    btn.textContent = 'Importing...';
    // Cloud may return separate records for same pair — merge by matching chargerSn/mowerSn
    var pairs = {};
    // First pass: collect all chargers and mowers
    var chargers = [], mowers = [];
    all.forEach(function(equip) {
      var sn = equip.chargerSn || equip.mowerSn || equip.sn || '';
      var name = equip.userCustomDeviceName || equip.equipmentNickName || 'My Novabot';
      if (equip.chargerSn || String(sn).startsWith('LFIC')) {
        chargers.push({ sn: equip.chargerSn || sn, address: equip.chargerAddress, channel: equip.chargerChannel, mac: equip.macAddress, name: name });
      } else if (equip.mowerSn || String(sn).startsWith('LFIN')) {
        mowers.push({ sn: equip.mowerSn || sn, mac: equip.macAddress, version: equip.sysVersion, name: name });
      }
    });
    // Pair chargers with mowers (1:1 by order, unpaired become solo entries)
    var maxLen = Math.max(chargers.length, mowers.length, 1);
    for (var pi = 0; pi < maxLen; pi++) {
      var c = chargers[pi], m = mowers[pi];
      var key = (c ? c.sn : '') + ':' + (m ? m.sn : '');
      // Issue #19: never fall back to the charger name when a mower is
      // present — LFI defaults the charger nickname to "Charging Station"
      // and that leaked through as the mower's app-side label after every
      // factory-reset re-import. Only use the charger name when the pair
      // has no mower at all (charger-only entry).
      var pairName = (m && m.name) || (m ? null : (c && c.name)) || null;
      pairs[key] = {
        deviceName: pairName,
        charger: c ? { sn: c.sn, address: c.address, channel: c.channel, mac: c.mac } : undefined,
        mower: m ? { sn: m.sn, mac: m.mac, version: m.version } : undefined,
      };
    }
    var totalMaps = 0;
    var totalRecords = 0;
    var failed = 0;
    for (var pk in pairs) {
      var p = pairs[pk];
      const r = await fetch('/api/setup/cloud-apply', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          email, password: pass,
          deviceName: p.deviceName,
          charger: p.charger || undefined,
          mower: p.mower || undefined,
          // Settings re-import: keep locally edited maps and dedup
          // historic work records by recordId. The first-time wizard
          // (firstTimeCloudImport) leaves merge unset for fresh start.
          merge: true,
        })
      });
      const rj = await r.json();
      if (rj.ok) {
        if (rj.mapsImported) totalMaps += rj.mapsImported;
        if (rj.workRecordsImported) totalRecords += rj.workRecordsImported;
      }
      else { failed++; result.innerHTML += '<div style="color:#ef4444;font-size:12px">Failed: ' + (rj.error || 'unknown') + '</div>'; }
    }

    var pairCount = Object.keys(pairs).length - failed;
    var msg = 'Imported ' + pairCount + ' device set(s)!';
    if (totalMaps > 0) msg += ' (' + totalMaps + ' new map(s))';
    if (totalRecords > 0) msg += ' (' + totalRecords + ' new record(s))';
    result.innerHTML += '<div style="color:#00d4aa;font-size:13px;margin-top:8px;font-weight:600">' + msg + '</div>';
    result.innerHTML += '<div style="margin-top:8px;padding:8px 12px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.2);border-radius:6px;font-size:12px;color:#f59e0b">If the Novabot app is open, log out and log back in to see your devices.</div>';
    loadMyDevices();
  } catch(e) {
    result.innerHTML = '<div style="color:#ef4444;font-size:13px">Failed: ' + e.message + '</div>';
  }
  btn.disabled = false;
  btn.textContent = 'Connect & Import';
}

async function firstTimeCloudImport() {
  const email = document.getElementById('cloud_email_setup').value;
  const pass = document.getElementById('cloud_pass_setup').value;
  const btn = document.getElementById('setupBtn');
  const result = document.getElementById('setupResult');
  if (!email || !pass) { result.innerHTML = '<p style="color:#ef4444;font-size:12px">Enter email and password</p>'; return; }

  btn.disabled = true;
  btn.textContent = 'Connecting to Novabot cloud...';
  result.innerHTML = '';

  try {
    const loginRes = await fetch('/api/setup/cloud-login', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email, password: pass})
    });
    const loginData = await loginRes.json();
    if (!loginData.ok) {
      result.innerHTML = '<p style="color:#ef4444;font-size:12px">' + (loginData.error || 'Login failed') + '</p>';
      btn.disabled = false; btn.textContent = 'Connect & Import from Cloud'; return;
    }

    const all = loginData.rawList || [];
    result.innerHTML = '<p style="color:#00d4aa;font-size:12px">Found ' + all.length + ' device(s). Creating account...</p>';
    btn.textContent = 'Importing...';

    // Always create user account (even if no devices found)
    try {
      const createRes = await fetch('/api/setup/cloud-apply', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ email, password: pass })
      });
      const createData = await createRes.json();
      if (!createData.ok && createData.error) {
        result.innerHTML += '<p style="color:#ef4444;font-size:11px">' + createData.error + '</p>';
      }
    } catch(accountErr) {
      console.error('Account create failed:', accountErr);
      result.innerHTML += '<p style="color:#ef4444;font-size:11px">Account creation error: ' + accountErr.message + '</p>';
    }

    var totalMapsSetup = 0;
    var chargerGps = false;
    for (const equip of all) {
      const chargerSn = equip.chargerSn || (equip.sn && equip.sn.startsWith('LFIC') ? equip.sn : null);
      const mowerSn = equip.mowerSn || (equip.sn && equip.sn.startsWith('LFIN') ? equip.sn : null);
      // Issue #19: only forward a deviceName when it is genuinely the
      // user-set mower nickname. equipmentNickName on a charger row is
      // LFI's default "Charging Station", which previously leaked through
      // and overwrote the pair's display name. Prefer userCustomDeviceName,
      // accept equipmentNickName ONLY when the entry has a mowerSn (so it
      // is the mower-side row), and never fall back to a hard-coded
      // "My Novabot" — better blank + let the user rename than wrong.
      let pairName = equip.userCustomDeviceName || null;
      if (!pairName && mowerSn && equip.equipmentNickName
          && !/^charging[ _-]?station$/i.test(String(equip.equipmentNickName).trim())) {
        pairName = equip.equipmentNickName;
      }
      const applyRes = await fetch('/api/setup/cloud-apply', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          email, password: pass,
          deviceName: pairName,
          charger: chargerSn ? { sn: chargerSn, address: equip.chargerAddress, channel: equip.chargerChannel, mac: equip.macAddress } : undefined,
          mower: mowerSn ? { sn: mowerSn, mac: equip.macAddress, version: equip.sysVersion } : undefined
        })
      });
      const applyData = await applyRes.json();
      if (applyData.error) {
        result.innerHTML += '<p style="color:#ef4444;font-size:11px">Error: ' + applyData.error + '</p>';
      }
      if (applyData.mapsImported) totalMapsSetup += applyData.mapsImported;
      if (applyData.chargerGpsImported) chargerGps = true;
    }

    var mapInfo = '';
    if (totalMapsSetup > 0) {
      mapInfo = ' + ' + totalMapsSetup + ' map area(s)';
      if (chargerGps) mapInfo += ' + charger GPS';
    } else {
      mapInfo = ' (no maps found on cloud)';
    }
    result.innerHTML += '<p style="color:#00d4aa;font-size:13px;font-weight:600">Setup complete! ' + all.length + ' device(s)' + mapInfo + ' imported.</p>';
    result.innerHTML += '<div style="margin-top:8px;padding:8px 12px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.2);border-radius:6px;font-size:12px;color:#f59e0b">Open the Novabot app and log in with <b>' + email + '</b> to see your devices.</div>';
    btn.textContent = 'Done!';

    // Auto-login met de zojuist aangemaakte credentials
    try {
      const loginRes = await fetch('/api/nova-user/appUser/login', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ email, password: pass })
      });
      const loginData = await loginRes.json();
      var newToken = loginData.value && loginData.value.accessToken;
      if (newToken) {
        token = newToken;
        localStorage.setItem('admin_token', token);
        result.innerHTML += '<p style="color:#aaa;font-size:12px">Logging in...</p>';
        setTimeout(() => showApp(), 1000);
        return;
      }
    } catch(loginErr) { console.error('Auto-login failed:', loginErr); }

    // Fallback: reload naar login scherm
    setTimeout(() => location.reload(), 2000);
  } catch(e) {
    result.innerHTML = '<p style="color:#ef4444;font-size:12px">Failed: ' + e.message + '</p>';
    btn.disabled = false; btn.textContent = 'Connect & Import from Cloud';
  }
}

async function skipSetup() {
  try {
    await fetch('/api/setup/skip', {method:'POST'});
    await modalAlert('Account Created', 'Email: <b>admin@local</b><br>Password: <b>admin</b>');
    location.reload();
  } catch(e) { modalAlert('Failed', e.message); }
}

// ── Remote Debug relay ──
var _relayActive = false;

// Load relay status on page load
function loadRelayStatus() {
  fetch('/api/dashboard/remote-debug/status').then(function(r){return r.json()}).then(function(d) {
    if (d.active && d.url) {
      _relayActive = true;
      document.getElementById('relayUrl').value = d.url;
      document.getElementById('relayToggle').textContent = 'Stop Sharing';
      document.getElementById('relayToggle').style.background = '#ef4444';
      document.getElementById('relayStatus').textContent = 'Sharing active — logs are being sent to ' + d.url;
      document.getElementById('relayStatus').style.color = '#22c55e';
    }
  }).catch(function(){});
}

function rsAuthHeaders(extra) {
  var h = { 'Authorization': token };
  if (extra) for (var k in extra) h[k] = extra[k];
  return h;
}
async function rsRefreshStatus() {
  var r = await fetch('/api/remote-support/status', { headers: rsAuthHeaders() }).then(function(x) { return x.json(); }).catch(function() { return { enabled: false, pendingRequest: null }; });
  var t = document.getElementById('rsToggle');
  if (t) t.checked = !!r.enabled;
  var active = !!r.sessionActive;
  var btn = document.getElementById('rsToggleBtn');
  var dot = document.getElementById('rsToggleDot');
  var lbl = document.getElementById('rsToggleLabel');
  var s = document.getElementById('rsStatus');
  var banner = document.getElementById('rsBanner');
  var msg = document.getElementById('rsBannerMsg');
  var kill = document.getElementById('rsKill');
  if (active) {
    if (btn) btn.style.display = 'none';
    if (s) s.style.display = 'none';
    if (kill) kill.style.display = 'none';
    if (banner) banner.style.display = 'block';
    if (msg) msg.textContent = 'A bash session is open in your container. All keystrokes are logged to disk.';
  } else {
    if (btn) btn.style.display = 'inline-flex';
    if (s) s.style.display = 'block';
    if (banner) banner.style.display = 'none';
    if (kill) kill.style.display = 'none';
    if (btn && dot && lbl) {
      if (r.enabled) {
        btn.style.background = '#065f46';
        dot.style.background = '#22c55e';
        dot.style.boxShadow = '0 0 0 3px rgba(34,197,94,.35)';
        lbl.textContent = 'Remote support: ON';
      } else {
        btn.style.background = '#374151';
        dot.style.background = '#9ca3af';
        dot.style.boxShadow = '0 0 0 3px rgba(156,163,175,.25)';
        lbl.textContent = 'Remote support: OFF';
      }
    }
    if (s) {
      s.textContent = r.enabled
        ? 'On — Ramon can connect on request. Auto-disables after 4 hours.'
        : 'Off — Ramon cannot connect.';
    }
  }
}
async function rsToggle() {
  var t = document.getElementById('rsToggle');
  var nextEnabled = !(t && t.checked);
  if (t) t.checked = nextEnabled;
  await fetch('/api/remote-support/toggle', {
    method: 'POST', headers: rsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ enabled: nextEnabled }),
  });
  rsRefreshStatus();
}
async function rsKill() {
  await fetch('/api/remote-support/kill', {
    method: 'POST', headers: rsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({}),
  });
  rsRefreshStatus();
}
async function rsRefreshAuditLogs() {
  var sel = document.getElementById('mapMowerSelect');
  var sn = sel ? sel.value : '';
  if (!sn) return;
  var r = await fetch('/api/remote-support/audit-logs?sn=' + encodeURIComponent(sn), { headers: rsAuthHeaders() }).then(function(x) { return x.json(); }).catch(function() { return { files: [] }; });
  var list = document.getElementById('rsAuditList');
  if (!list) return;
  list.innerHTML = (r.files || []).slice(0, 10).map(function(f) {
    return '<li><a href="/api/remote-support/audit-logs/' + f.filename + '" download style="color:#a5b4fc">' + f.filename + '</a> (' + Math.round(f.bytes / 1024) + ' KB)</li>';
  }).join('');
}
var rsUserCard = document.getElementById('rsUserCard');
if (rsUserCard && rsUserCard.style.display !== 'none') {
  rsRefreshStatus();
  rsRefreshAuditLogs();
  setInterval(rsRefreshStatus, 2000);
  setInterval(rsRefreshAuditLogs, 30000);
}

function rsOpConnectSn(sn) {
  var input = document.getElementById("rsOpSn");
  if (input) input.value = sn;
  rsOpConnect();
}
function rsOpDisconnect() {
  if (rsOpWs) { try { rsOpWs.close(); } catch (_) {} rsOpWs = null; }
  if (rsOpTerm) { try { rsOpTerm.dispose(); } catch (_) {} rsOpTerm = null; }
  var el = document.getElementById("rsOpTerminal");
  if (el) { el.style.display = "none"; el.innerHTML = ""; }
  rsOpCurrentSn = null;
  rsOpRefresh();
}
async function rsOpRefresh() {
  var pAgents = fetch("/api/remote-support/active-agents", { headers: rsAuthHeaders() }).then(function(x) { return x.json(); }).catch(function() { return { agents: [] }; });
  var pSessions = fetch("/api/remote-support/sessions", { headers: rsAuthHeaders() }).then(function(x) { return x.json(); }).catch(function() { return { sessions: [] }; });
  var both = await Promise.all([pAgents, pSessions]);
  var agents = both[0].agents || [];
  var sessions = both[1].sessions || [];
  var activeSet = {};
  sessions.forEach(function(s) { activeSet[s.sn] = s; });
  var list = document.getElementById("rsOpAgents");
  if (!list) return;
  if (agents.length === 0 && sessions.length === 0) {
    list.innerHTML = "<div style=\\"font-size:12px;color:#64748b;font-style:italic;padding:8px 0\\">No pending requests. Users must toggle remote support ON in their admin panel to appear here.</div>";
    return;
  }
  list.innerHTML = agents.map(function(a) {
    var t = new Date(a.registeredAt).toLocaleTimeString();
    var snEsc = String(a.sn).replace(/[^A-Za-z0-9_-]/g, "");
    var isActive = !!activeSet[snEsc];
    var isMine = rsOpCurrentSn === snEsc;
    var border = isActive ? "rgba(34,197,94,.5)" : "rgba(168,85,247,.2)";
    var bg = isActive ? "rgba(34,197,94,.08)" : "rgba(168,85,247,.06)";
    var nameColor = isActive ? "#bbf7d0" : "#e9d5ff";
    var subline = isActive
      ? ("Session active since " + new Date(activeSet[snEsc].startedAt).toLocaleTimeString())
      : ("Waiting since " + t);
    var badge = isActive
      ? "<span style=\\"display:inline-block;padding:2px 8px;margin-left:8px;border-radius:999px;background:#16a34a;color:#fff;font-size:10px;font-weight:700;letter-spacing:.05em\\">CONNECTED</span>"
      : "";
    var btn = isMine
      ? "<button class=\\"btn btn-danger\\" onclick=\\"rsOpDisconnect()\\">Disconnect</button>"
      : (isActive
          ? "<button class=\\"btn btn-secondary\\" disabled style=\\"opacity:.5;cursor:not-allowed\\">In use</button>"
          : "<button class=\\"btn btn-primary\\" onclick=\\"rsOpConnectSn('" + snEsc + "')\\">Connect</button>");
    return "<div style=\\"display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;margin-bottom:6px;border:1px solid " + border + ";border-radius:6px;background:" + bg + "\\">"
      + "<div><div style=\\"font-weight:600;color:" + nameColor + "\\">" + snEsc + badge + "</div>"
      + "<div style=\\"font-size:11px;color:#94a3b8;margin-top:2px\\">" + subline + "</div></div>"
      + btn
      + "</div>";
  }).join("");
}
var rsOpTerm = null, rsOpWs = null, rsOpCurrentSn = null;
async function rsOpConnect() {
  var sn = document.getElementById("rsOpSn").value.trim();
  if (!sn) return;
  if (rsOpWs) { try { rsOpWs.close(); } catch (_) {} rsOpWs = null; }
  if (rsOpTerm) { try { rsOpTerm.dispose(); } catch (_) {} rsOpTerm = null; }
  var term = new Terminal({ cursorBlink: true, fontSize: 13 });
  var fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  var el = document.getElementById("rsOpTerminal");
  el.style.display = "block";
  el.innerHTML = "";
  term.open(el);
  fit.fit();
  rsOpTerm = term;
  rsOpCurrentSn = sn;
  var proto = location.protocol === "https:" ? "wss:" : "ws:";
  var ws = new WebSocket(proto + "//" + location.host + "/api/remote-support/operator/" + sn + "?token=" + encodeURIComponent(token));
  rsOpWs = ws;
  ws.binaryType = "arraybuffer";
  ws.onopen = function() { rsOpRefresh(); };
  ws.onmessage = function(ev) {
    if (typeof ev.data === "string") term.write(ev.data);
    else term.write(new Uint8Array(ev.data));
  };
  ws.onclose = function() { term.write("\\r\\n[session closed]"); rsOpCurrentSn = null; rsOpRefresh(); };
  term.onData(function(d) { if (ws.readyState === 1) ws.send(d); });
}
var rsOpCard = document.getElementById("rsOperatorCard");
if (rsOpCard && rsOpCard.style.display !== "none") {
  rsOpRefresh();
  setInterval(rsOpRefresh, 10000);
}

function toggleRelay() {
  var urlInput = document.getElementById('relayUrl');
  var btn = document.getElementById('relayToggle');
  var status = document.getElementById('relayStatus');
  if (_relayActive) {
    fetch('/api/dashboard/remote-debug/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      .then(function(r) { return r.json(); })
      .then(function() {
        _relayActive = false;
        btn.textContent = 'Start Sharing';
        btn.style.background = '';
        status.textContent = 'Sharing stopped.';
        status.style.color = '#666';
      });
  } else {
    var url = urlInput.value.trim();
    if (!url) { status.textContent = 'Enter a relay URL first.'; status.style.color = '#ef4444'; return; }
    fetch('/api/dashboard/remote-debug/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ relayUrl: url }) })
      .then(function(r) { return r.json(); })
      .then(function(r) {
        if (r.ok) {
          _relayActive = true;
          btn.textContent = 'Stop Sharing';
          btn.style.background = '#ef4444';
          status.textContent = 'Sharing active — logs are being sent to ' + url;
          status.style.color = '#22c55e';
        } else {
          status.textContent = 'Failed: ' + (r.error || 'unknown');
          status.style.color = '#ef4444';
        }
      });
  }
}

// ── Remote Debug receiver ──
var _activeRemoteSn = null;
// Use a timestamp cursor instead of a count cursor. The server buffer is
// capped per SN, so a count cursor walks past the array end once the cap
// is exceeded and the server returns nothing. Switching to "logs newer
// than this ts" keeps polling working indefinitely. Live bug 2026-05-07:
// dashboard froze at the 2000-line mark even though new logs kept arriving.
var _remoteLogSinceTs = 0;
var _remoteLogTimer = null;
var remoteLogBuf = [];
var MAX_REMOTE_CONSOLE = 5000;

function refreshRemoteDevices() {
  fetch('/api/dashboard/remote-debug/devices').then(function(r){return r.json()}).then(function(d) {
    var container = document.getElementById('remoteSnTabs');
    var devInfo = document.getElementById('remoteDevices');
    var devices = d.devices || [];
    if (devices.length === 0) {
      devInfo.innerHTML = '<span style="color:#666;font-size:12px">No remote devices connected. Users need to enable log sharing in their admin panel.</span>';
      container.innerHTML = '';
      return;
    }
    devInfo.innerHTML = '<span style="color:#22c55e;font-size:12px">' + devices.length + ' device(s) sharing logs</span>';
    container.innerHTML = '';
    devices.forEach(function(dev) {
      var btn = document.createElement('button');
      btn.className = 'btn' + (dev.sn === _activeRemoteSn ? ' btn-purple' : '');
      btn.style.fontSize = '12px';
      btn.textContent = dev.sn + ' (' + dev.count + ')';
      btn.onclick = function() { selectRemoteSn(dev.sn); };
      container.appendChild(btn);
    });
  }).catch(function(){});
}

function selectRemoteSn(sn) {
  _activeRemoteSn = sn;
  _remoteLogSinceTs = 0;
  remoteLogBuf = [];
  document.getElementById('remoteConsoleWrap').style.display = 'block';
  document.getElementById('remoteLogs').innerHTML = '';
  refreshRemoteDevices();
  if (_remoteLogTimer) clearInterval(_remoteLogTimer);
  pollRemoteLogs();
  _remoteLogTimer = setInterval(pollRemoteLogs, 2000);
}

function pollRemoteLogs() {
  if (!_activeRemoteSn) return;
  fetch('/api/dashboard/remote-debug/logs?sn=' + encodeURIComponent(_activeRemoteSn) + '&sinceTs=' + _remoteLogSinceTs)
    .then(function(r){return r.json()})
    .then(function(d) {
      var entries = d.logs || [];
      for (var i = 0; i < entries.length; i++) {
        remoteLogBuf.push(entries[i]);
        var ts = entries[i].ts || 0;
        if (ts > _remoteLogSinceTs) _remoteLogSinceTs = ts;
      }
      if (remoteLogBuf.length > MAX_REMOTE_CONSOLE) remoteLogBuf.splice(0, remoteLogBuf.length - MAX_REMOTE_CONSOLE);
      if (entries.length > 0) renderRemoteLogs();
    }).catch(function(){});
}

// Reuse the same classifyLog, logColor, typeIcon, formatLog, matchesSearch, highlightTerm from MQTT console
function formatRemoteLog(entry, q) {
  var cls = classifyLog(entry);
  var color = logColor(cls);
  var t = entry.ts ? new Date(entry.ts) : new Date();
  var time = t.toLocaleTimeString('nl-NL', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  var icon = typeIcon(entry.type);
  var sn = entry.sn || '';
  var topic = entry.topic ? entry.topic.replace('Dart/Receive_mqtt/','\\u2190').replace('Dart/Send_mqtt/','\\u2192').replace('Dart/Receive_server_mqtt/','\\u21D0') : '';
  // Show the full payload — no truncation. Wrap across lines so JSON
  // doesn't get cut off at the right edge of the console.
  var payload = (entry.payload || '').split('<').join('&lt;');
  if (q) { sn = highlightTerm(sn, q); topic = highlightTerm(topic, q); payload = highlightTerm(payload, q); }
  return '<div style="color:' + color + ';border-bottom:1px solid #1a1a2e;padding:1px 0;white-space:pre-wrap;word-break:break-all">' +
    '<span style="color:#555">' + time + '</span> ' + icon + ' ' +
    '<span style="font-weight:700">' + (entry.type || '').toUpperCase() + '</span> ' +
    (sn ? '<span style="opacity:.7">' + sn + '</span> ' : '') +
    (entry.direction ? '<span style="color:#aaa">' + entry.direction + '</span> ' : '') +
    (topic ? '<span style="color:#aaa">' + topic + '</span> ' : '') +
    (payload ? '<span style="opacity:.6">' + payload + '</span>' : '') +
    '</div>';
}

function renderRemoteLogs() {
  var fm = document.getElementById('rf_mower').checked;
  var fc = document.getElementById('rf_charger').checked;
  var fa = document.getElementById('rf_app').checked;
  var fs = document.getElementById('rf_system').checked;
  var q = (document.getElementById('rf_search').value || '').toLowerCase().trim();
  var el = document.getElementById('remoteLogs');
  var html = '';
  for (var i = 0; i < remoteLogBuf.length; i++) {
    var cls = classifyLog(remoteLogBuf[i]);
    if (cls === 'mower' && !fm) continue;
    if (cls === 'charger' && !fc) continue;
    if (cls === 'app' && !fa) continue;
    if (cls === 'system' && !fs) continue;
    if (!matchesSearch(remoteLogBuf[i], q)) continue;
    html += formatRemoteLog(remoteLogBuf[i], q);
  }
  el.innerHTML = html;
  if (document.getElementById('rf_autoscroll').checked) el.scrollTop = el.scrollHeight;
}

function copyRemoteConsole() {
  var fm = document.getElementById('rf_mower').checked;
  var fc = document.getElementById('rf_charger').checked;
  var fa = document.getElementById('rf_app').checked;
  var fs = document.getElementById('rf_system').checked;
  var q = (document.getElementById('rf_search').value || '').toLowerCase().trim();
  var lines = [];
  for (var i = 0; i < remoteLogBuf.length; i++) {
    var e = remoteLogBuf[i];
    var cls = classifyLog(e);
    if (cls === 'mower' && !fm) continue;
    if (cls === 'charger' && !fc) continue;
    if (cls === 'app' && !fa) continue;
    if (cls === 'system' && !fs) continue;
    if (!matchesSearch(e, q)) continue;
    var t = e.ts ? new Date(e.ts) : new Date();
    var time = t.toLocaleTimeString('nl-NL', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    lines.push(time + ' ' + (e.type || '').toUpperCase() + ' ' + (e.sn || '') + ' ' + (e.direction || '') + ' ' + (e.topic || '') + ' ' + (e.payload || ''));
  }
  navigator.clipboard.writeText(lines.join('\\n')).then(function() {
    event.target.textContent = 'Copied!';
    setTimeout(function() { event.target.textContent = 'Copy'; }, 1500);
  });
}

function clearRemoteLogs() {
  var url = _activeRemoteSn ? '/api/dashboard/remote-debug/logs?sn=' + encodeURIComponent(_activeRemoteSn) : '/api/dashboard/remote-debug/logs';
  fetch(url, { method: 'DELETE' }).then(function() {
    remoteLogBuf = [];
    _remoteLogSeen = 0;
    document.getElementById('remoteLogs').innerHTML = '';
    refreshRemoteDevices();
  });
}

async function factoryReset() {
  var ok = await modalConfirm('Factory Reset', 'This will <b>permanently delete</b> all data:<br><br>&#8226; Your account<br>&#8226; All devices &amp; pairings<br>&#8226; All maps<br>&#8226; Schedules &amp; settings<br><br>This action <b>cannot be undone</b>.');
  if (!ok) return;
  try {
    const r = await api('/factory-reset', 'POST');
    if (r.ok) {
      token = '';
      localStorage.removeItem('admin_token');
      showSetup();
    }
  } catch(e) {
    modalAlert('Failed', e.message);
  }
}

function showLogin() {
  document.getElementById('login').style.display = 'block';
  document.getElementById('firstTimeSetup').style.display = 'none';
  document.getElementById('app').style.display = 'none';
}

function showSetup() {
  document.getElementById('login').style.display = 'none';
  document.getElementById('firstTimeSetup').style.display = 'block';
  document.getElementById('app').style.display = 'none';
}

// Check if this is first time (no users) or returning user
(async function init() {
  // Always check setup status first (no auth needed)
  let needsSetup = false;
  try {
    const s = await fetch('/api/setup/status');
    const sd = await s.json();
    needsSetup = sd && !sd.setupComplete;
  } catch { /* assume setup complete if endpoint fails */ }

  if (needsSetup) {
    showSetup();
    return;
  }

  // Setup is complete — try auto-login
  if (token) {
    try {
      await api('/overview');
      showApp();
      return;
    } catch {
      token = '';
      localStorage.removeItem('admin_token');
      showToast('Session expired — please log in again', 'gray');
    }
  }

  showLogin();
})();
</script>
</body>
</html>`;
}
