# RTK Walker OTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Walker can update its own firmware over the air, polling the OpenNova server's existing firmware manifest + downloading the binary via HTTP.

**Architecture:** Walker firmware embeds a build-time version constant. On boot (default) or via TFT / web UI button, walker hits the server's manifest endpoint, compares versions, downloads a new `.bin` if newer, applies via ESP32 `Update.h`, reboots. Server extends the existing `opennova-manifest.json` flow with `walker` entries and serves binaries from the same `firmwareDir` the mower uses. Operators publish new versions by `scp`-ing a `.bin` into the firmware dir and updating the manifest.

**Tech Stack:** ESP32-S3 firmware (PlatformIO + Arduino + `Update.h` + `HTTPClient`), Node.js server (Express, existing portable-bundle + firmware-download patterns), inline HTML/JS admin page.

---

## Design decisions (locked)

1. **Manifest scope**: single `opennova-manifest.json` — walker entries alongside mower/charger.
2. **Auto-check on boot**: default ON (configurable per device via NVS).
3. **Version format**: date-based `YYYY.MMDD.HHMM` (e.g., `2026.0522.1500`).
4. **Upload flow**: manual `scp` of `.bin` into the server's `firmwareDir`. No CI auto-publish yet.

---

## File Structure

### Walker firmware (`tools/rtk-walker/`)
- **Create** `src/walker_ota.h` + `src/walker_ota.cpp` — version constant + OTA check/apply functions
- **Modify** `src/main.cpp` — boot-time auto-check, HTTP endpoint for manual trigger
- **Modify** `src/tft/tft_ui.cpp` — "Check for update" button on Settings tab + progress label
- **Modify** `src/index_html.h` — web UI button + status field
- **Modify** `src/walker_api.h` — extend `WalkerConfig` with `otaAutoCheck` (default true)
- **Modify** `platformio.ini` — inject `FIRMWARE_VERSION` via pre-build script
- **Create** `scripts/inject_version.py` — pre-build hook that writes today's `YYYY.MMDD.HHMM`
- **Create** `scripts/release.sh` — builds + names binary with version + prints scp command

### Server (`server/src/`)
- **Modify** `server/src/routes/adminStatus.ts` — extend `check-firmware-updates` to include walker; add `/walker-firmware/latest` + `/walker-firmware/binary/:filename` endpoints
- **Modify** the otaVersion repo if needed for `findLatestByDeviceType('walker')`
- **Create** `server/src/__tests__/routes/walkerFirmware.test.ts` — endpoint smoke tests

### Admin page (`server/src/routes/adminPage.ts`)
- **Modify** — extend the existing Firmware Updates card with a Walker section

### Docs
- **Create** `docs/user-guide/walker-ota.md` — operator runbook for publishing a new version
- **Modify** `docs/user-guide/rtk-walker-mapping.md` — section "Walker firmware updates" + cross-link
- **Modify** `docs/user-guide/index.md` — nav entry for walker-ota.md

---

## OTA wire protocol

### Server endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/walker-firmware/latest?currentVersion=<v>` | None (LAN-only) | Returns `{ ok, updateAvailable, version, url, md5, releaseNotes }`. Walker compares date-based strings lexically. |
| `GET /api/admin-status/walker-firmware/binary/:filename` | Bearer (admin) | Streams the `.bin`. Same auth as `import-walker-bundle`. |
| `POST /api/admin-status/download-firmware` (existing, extended) | Admin | Accepts `device_type='walker'`. |
| `GET /api/admin-status/check-firmware-updates` (existing) | Admin | Already returns walker entries when manifest has `device_type='walker'`. |

### Manifest JSON shape (existing `opennova-manifest.json`)

The manifest's `firmwares` array already accepts free-form `device_type`. New walker entries look like:

```json
{
  "firmwares": [
    { "device_type": "walker", "version": "2026.0522.1500",
      "url": "https://downloads.ramonvanbruggen.nl/everydrop/shared/walker_firmware_2026.0522.1500.bin",
      "md5": "abc123...", "description": "Walker firmware" }
  ]
}
```

For the "manual scp" flow chosen by the operator, the manifest URL is unused — the operator scps directly into `firmwareDir` and registers the version via the admin UI (which writes to the local `ota_versions` table without downloading from the manifest URL).

### Walker version comparison

Date-based strings (`2026.0522.1500`) compare correctly with lexicographic string comparison: `if (latest > current) updateAvailable`.

---

### Task 1: Walker firmware version embedding + walker_ota module

**Files:**
- Create: `tools/rtk-walker/src/walker_ota.h`
- Create: `tools/rtk-walker/src/walker_ota.cpp`
- Create: `tools/rtk-walker/scripts/inject_version.py`
- Modify: `tools/rtk-walker/platformio.ini`
- Modify: `tools/rtk-walker/src/walker_api.h` — add `otaAutoCheck` field
- Modify: `tools/rtk-walker/src/main.cpp` — plumb new config field through `loadConfig`/`saveConfig`/`walkerGetConfig`/`walkerApplyConfig`

- [ ] **Step 1: Pre-build version injection**

Create `tools/rtk-walker/scripts/inject_version.py`:

```python
import datetime
Import("env")
version = datetime.datetime.now().strftime("%Y.%m%d.%H%M")
env.Append(BUILD_FLAGS=[f'-DFIRMWARE_VERSION=\\"{version}\\"'])
print(f"Walker firmware version: {version}")
```

Add to `[walker_common]` in `platformio.ini`:
```ini
extra_scripts = pre:scripts/inject_version.py
```

- [ ] **Step 2: walker_ota.h**

Use the exact interface from the architecture section above. Functions: `walkerOtaCheck()`, `walkerOtaApply(url, md5, progressCb, outErr)`, `walkerOtaAutoTick(force)`, `walkerFirmwareVersion()`. The `OtaCheckResult` struct has the seven fields shown.

- [ ] **Step 3: walker_ota.cpp**

Implement per the function bodies shown above in the architecture section. Key behaviors:
- `walkerOtaCheck`: reads serverUrl from `walkerGetConfig`, GETs `<serverUrl>/api/walker-firmware/latest?currentVersion=<FIRMWARE_VERSION>`, parses JSON, returns result.
- `walkerOtaApply`: GETs the binary with `Authorization: Bearer <cfg.adminToken>`, streams into `Update.write`, calls `Update.end(true)`, `ESP.restart()` on success.
- `walkerOtaAutoTick(force)`: if `!force && !cfg.otaAutoCheck` returns. Otherwise runs check + apply. Logs decisions via Serial.printf.

Include a 30-second timeout on the HTTP check so a stalled server doesn't block boot.

- [ ] **Step 4: walker_api.h — add otaAutoCheck**

In `WalkerConfigView` and `WalkerConfigUpdate` structs, add:
```cpp
bool otaAutoCheck = true;
```

Plumb through `walkerGetConfig` (reads from NVS, defaults to true if key absent) + `walkerApplyConfig` (writes to NVS).

- [ ] **Step 5: main.cpp — boot auto-check after WiFi connect**

In `setup()`, find where WiFi reaches connected state. Right after, add:

```cpp
walkerOtaAutoTick(false);  // respects otaAutoCheck flag, applies + reboots if newer
```

- [ ] **Step 6: Compile both envs + verify version embedded**

```bash
cd /Users/rvbcrs/GitHub/Novabot/tools/rtk-walker
~/.platformio/penv/bin/platformio run -e jc3248w535-walker 2>&1 | tail -15
~/.platformio/penv/bin/platformio run -e esp32s3-walker 2>&1 | tail -15
grep -aoE '20[0-9]{2}\.[0-9]{4}\.[0-9]{4}' .pio/build/jc3248w535-walker/firmware.bin | head -1
```

Both SUCCESS. The grep should print a fresh `2026.MMDD.HHMM` matching today.

Verify the partition table supports OTA. `platformio.ini` should reference a partition CSV with `app1` AND `app2` slots, OR `huge_app.csv` (single-slot). If only single-slot, OTA won't work — switch to `default_8MB.csv` or similar dual-app layout. If `board_build.partitions` is unset, the default differs per board. Document the partition used.

- [ ] **Step 7: Commit**

```bash
git add tools/rtk-walker/src/walker_ota.h tools/rtk-walker/src/walker_ota.cpp \
        tools/rtk-walker/scripts/inject_version.py tools/rtk-walker/platformio.ini \
        tools/rtk-walker/src/walker_api.h tools/rtk-walker/src/main.cpp
git commit -m "feat(rtk-walker): OTA module with date-based version + boot auto-check"
```

---

### Task 2: Server walker firmware endpoints

**Files:**
- Modify: `server/src/routes/adminStatus.ts` (or add a new router file if cleaner)
- Modify: server's express app setup if the public `/api/walker-firmware/latest` endpoint needs to bypass admin auth — check existing pattern for any non-authenticated endpoints
- Modify: `server/src/db/repositories/otaVersionRepo.ts` (or similar) — add `findLatestByDeviceType` if missing
- Create: `server/src/__tests__/routes/walkerFirmware.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';  // or actual app factory

let app;
beforeAll(async () => { app = await createApp(); });

describe('walker firmware endpoints', () => {
  it('GET /api/walker-firmware/latest returns no-update when DB empty', async () => {
    const r = await request(app).get('/api/walker-firmware/latest?currentVersion=2026.0101.0000');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.updateAvailable).toBe(false);
  });

  it('returns updateAvailable when newer version exists', async () => {
    // seed DB with walker firmware version 2026.0601.1200
    await otaVersionRepo.create({ device_type: 'walker', version: '2026.0601.1200',
      download_url: '/api/admin-status/walker-firmware/binary/walker_2026.0601.1200.bin',
      md5: 'abc', release_notes: 'test' });
    const r = await request(app).get('/api/walker-firmware/latest?currentVersion=2026.0522.1500');
    expect(r.body.updateAvailable).toBe(true);
    expect(r.body.version).toBe('2026.0601.1200');
    expect(r.body.md5).toBe('abc');
  });
});
```

Run: vitest run walkerFirmware.test.ts → FAIL.

- [ ] **Step 2: Repository method**

Check if `otaVersionRepo.findLatestByDeviceType(dt)` exists. If not, add:

```typescript
findLatestByDeviceType(deviceType: string): OtaVersion | undefined {
  return this.db.prepare(
    `SELECT * FROM ota_versions WHERE device_type = ? ORDER BY version DESC LIMIT 1`,
  ).get(deviceType) as OtaVersion | undefined;
}
```

- [ ] **Step 3: `/api/walker-firmware/latest` endpoint**

This needs to be on the PUBLIC app (no admin auth) so the walker can poll without credentials. Find where other public endpoints live (e.g. `/api/setup/*` or the bootstrap routes) and mount alongside.

```typescript
app.get('/api/walker-firmware/latest', (req: Request, res: Response) => {
  const currentVersion = String(req.query.currentVersion ?? '');
  const latest = otaVersionRepo.findLatestByDeviceType('walker');
  if (!latest) {
    res.json({ ok: true, updateAvailable: false, version: '', url: '', md5: '' });
    return;
  }
  const updateAvailable = latest.version > currentVersion;
  const filename = (latest.download_url ?? '').split('/').pop() ?? '';
  const baseUrl = getOtaBaseUrl();
  res.json({
    ok: true,
    updateAvailable,
    version: latest.version,
    url: `${baseUrl}/api/admin-status/walker-firmware/binary/${encodeURIComponent(filename)}`,
    md5: latest.md5 ?? '',
    releaseNotes: latest.release_notes ?? '',
  });
});
```

- [ ] **Step 4: `/api/admin-status/walker-firmware/binary/:filename` endpoint**

Goes on the auth-protected `adminStatusRouter` (existing). Streams file from `firmwareDir`:

```typescript
adminStatusRouter.get('/walker-firmware/binary/:filename', (req: AuthRequest, res: Response) => {
  const safe = path.basename(req.params.filename);
  const filePath = path.join(firmwareDir, safe);
  if (!fs.existsSync(filePath)) { res.status(404).json({ ok: false, error: 'not found' }); return; }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
  fs.createReadStream(filePath).pipe(res);
});
```

- [ ] **Step 5: TS check + full test run**

```bash
cd /Users/rvbcrs/GitHub/Novabot/server
npx tsc --noEmit 2>&1 | tail -10
npx vitest run walkerFirmware.test.ts 2>&1 | tail -20
npx vitest run 2>&1 | tail -10
```

All pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/adminStatus.ts server/src/db/repositories/*.ts \
        server/src/__tests__/routes/walkerFirmware.test.ts server/src/app.ts
git commit -m "feat(server): walker firmware OTA endpoints with public version check"
```

---

### Task 3: TFT settings tab — OTA button + version label

**Files:**
- Modify: `tools/rtk-walker/src/tft/tft_ui.cpp`

- [ ] **Step 1: Find the settings screen builder**

Walker already has a settings tab (see earlier sessions). Find the function building it. Add a section labeled "Firmware":

```cpp
static lv_obj_t* s_otaVersionLabel = nullptr;
static lv_obj_t* s_otaStatusLabel = nullptr;
static lv_obj_t* s_otaCheckBtn = nullptr;
```

In the settings screen builder:
```cpp
lv_obj_t* fwHeader = lv_label_create(settingsScreen);
lv_label_set_text(fwHeader, "Firmware");
// position + style consistent with existing settings labels

s_otaVersionLabel = lv_label_create(settingsScreen);
char ver[64];
snprintf(ver, sizeof(ver), "Current: %s", walkerFirmwareVersion());
lv_label_set_text(s_otaVersionLabel, ver);

s_otaCheckBtn = lv_btn_create(settingsScreen);
lv_obj_t* lbl = lv_label_create(s_otaCheckBtn);
lv_label_set_text(lbl, "Check + Update");
lv_obj_center(lbl);
lv_obj_add_event_cb(s_otaCheckBtn, onOtaButtonClicked, LV_EVENT_CLICKED, nullptr);

s_otaStatusLabel = lv_label_create(settingsScreen);
lv_label_set_text(s_otaStatusLabel, "");
```

- [ ] **Step 2: Event handler**

```cpp
static void onOtaButtonClicked(lv_event_t*) {
    if (s_otaStatusLabel) lv_label_set_text(s_otaStatusLabel, "Checking...");
    lv_refr_now(nullptr);
    OtaCheckResult r = walkerOtaCheck();
    if (!r.ok) {
        char msg[128]; snprintf(msg, sizeof(msg), "Error: %s", r.error.c_str());
        if (s_otaStatusLabel) lv_label_set_text(s_otaStatusLabel, msg);
        return;
    }
    if (!r.updateAvailable) {
        if (s_otaStatusLabel) lv_label_set_text(s_otaStatusLabel, "Up to date");
        return;
    }
    char banner[128];
    snprintf(banner, sizeof(banner), "New: %s, updating...", r.latestVersion.c_str());
    if (s_otaStatusLabel) lv_label_set_text(s_otaStatusLabel, banner);
    lv_refr_now(nullptr);
    String err;
    if (!walkerOtaApply(r.url, r.md5, nullptr, err)) {
        snprintf(banner, sizeof(banner), "Failed: %s", err.c_str());
        if (s_otaStatusLabel) lv_label_set_text(s_otaStatusLabel, banner);
    }
    // On success walkerOtaApply reboots and never returns.
}
```

Don't forget `#include "../walker_ota.h"` at top of tft_ui.cpp.

- [ ] **Step 3: Compile + commit**

Both envs SUCCESS.

```bash
git add tools/rtk-walker/src/tft/tft_ui.cpp
git commit -m "feat(rtk-walker): TFT OTA check + update button on Settings tab"
```

---

### Task 4: Web UI OTA controls

**Files:**
- Modify: `tools/rtk-walker/src/main.cpp` — add `/api/ota/check` + `/api/ota/apply` HTTP routes
- Modify: `tools/rtk-walker/src/index_html.h` — add a Firmware card with check + apply buttons

- [ ] **Step 1: HTTP routes**

```cpp
server.on("/api/ota/check", HTTP_GET, []() {
    OtaCheckResult r = walkerOtaCheck();
    StaticJsonDocument<512> doc;
    doc["ok"] = r.ok;
    doc["updateAvailable"] = r.updateAvailable;
    doc["currentVersion"] = r.currentVersion;
    doc["latestVersion"] = r.latestVersion;
    doc["error"] = r.error;
    String out; serializeJson(doc, out);
    server.send(200, "application/json", out);
});

server.on("/api/ota/apply", HTTP_POST, []() {
    OtaCheckResult r = walkerOtaCheck();
    if (!r.ok || !r.updateAvailable) {
        server.send(200, "application/json", "{\"ok\":false,\"error\":\"no update\"}");
        return;
    }
    String err;
    bool ok = walkerOtaApply(r.url, r.md5, nullptr, err);
    StaticJsonDocument<256> doc;
    doc["ok"] = ok;
    doc["error"] = err;
    String out; serializeJson(doc, out);
    server.send(ok ? 200 : 500, "application/json", out);
});
```

`walkerOtaApply` reboots on success so the response won't actually reach the client. Browser will see fetch error / connection drop — that's OK.

- [ ] **Step 2: Web UI Firmware card**

Add to `index_html.h` (matching the existing HTML/CSS style there). Use safe DOM helpers (textContent + createElement, no innerHTML):

```html
<div class="card">
  <h3>Firmware</h3>
  <p>Current: <span id="ota-current">...</span></p>
  <button onclick="otaCheck()">Check for update</button>
  <button onclick="otaApply()" disabled id="ota-apply">Update now</button>
  <p id="ota-status"></p>
</div>
<script>
async function otaLoadCurrent() {
  const r = await (await fetch('/api/ota/check')).json();
  document.getElementById('ota-current').textContent = r.currentVersion || 'unknown';
}
async function otaCheck() {
  document.getElementById('ota-status').textContent = 'Checking...';
  const r = await (await fetch('/api/ota/check')).json();
  document.getElementById('ota-current').textContent = r.currentVersion;
  if (!r.ok) { document.getElementById('ota-status').textContent = 'Error: ' + r.error; return; }
  if (!r.updateAvailable) { document.getElementById('ota-status').textContent = 'Up to date'; return; }
  document.getElementById('ota-status').textContent = 'New version: ' + r.latestVersion;
  document.getElementById('ota-apply').disabled = false;
}
async function otaApply() {
  document.getElementById('ota-status').textContent = 'Updating, walker will reboot...';
  try { await fetch('/api/ota/apply', { method: 'POST' }); } catch (e) { /* connection drops on reboot, expected */ }
}
window.addEventListener('load', otaLoadCurrent);
</script>
```

- [ ] **Step 3: Compile + commit**

```bash
git add tools/rtk-walker/src/main.cpp tools/rtk-walker/src/index_html.h
git commit -m "feat(rtk-walker): web UI OTA check + apply controls"
```

---

### Task 5: Admin page — walker firmware section

**Files:**
- Modify: `server/src/routes/adminPage.ts`

- [ ] **Step 1: Find Firmware Updates card**

Search for `check-firmware-updates` in adminPage.ts. Mirror the existing mower/charger pattern but for walker. Use safe DOM helpers (no innerHTML with template strings).

Add a section:
```html
<details>
  <summary>Walker firmware</summary>
  <div id="walker-fw-list">Loading...</div>
  <button onclick="checkWalkerFirmware()">Refresh from manifest</button>
</details>
```

JS:
```javascript
async function checkWalkerFirmware() {
  const r = await fetch('/api/admin-status/check-firmware-updates', { headers: { Authorization: token } });
  const j = await r.json();
  const walkers = (j.firmwares || []).filter(f => f.device_type === 'walker');
  const list = document.getElementById('walker-fw-list');
  while (list.firstChild) list.removeChild(list.firstChild);
  if (walkers.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'No walker firmware in manifest.';
    list.appendChild(p);
    return;
  }
  walkers.forEach(fw => {
    const row = document.createElement('div');
    const verSpan = document.createElement('span');
    verSpan.textContent = fw.version + ' ';
    const btn = document.createElement('button');
    btn.textContent = 'Download';
    btn.onclick = () => downloadWalkerFw(fw.version, fw.url, fw.md5);
    row.appendChild(verSpan);
    row.appendChild(btn);
    list.appendChild(row);
  });
}
async function downloadWalkerFw(version, url, md5) {
  const r = await fetch('/api/admin-status/download-firmware', {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_type: 'walker', version, url, md5 }),
  });
  const j = await r.json();
  if (j.ok) await appAlert('Walker firmware ' + version + ' downloaded', { accent: 'success' });
  else await appAlert('Download failed: ' + j.error, { accent: 'danger' });
}
window.addEventListener('load', () => { /* lazy-load when card opens */ });
```

- [ ] **Step 2: Verify + commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot/server && npx tsc --noEmit
git add server/src/routes/adminPage.ts
git commit -m "feat(admin-page): walker firmware download + list section"
```

---

### Task 6: Release script + operator runbook

**Files:**
- Create: `tools/rtk-walker/scripts/release.sh`
- Create: `docs/user-guide/walker-ota.md`
- Modify: `docs/user-guide/rtk-walker-mapping.md` — add Firmware Updates section + cross-link

- [ ] **Step 1: release.sh**

```bash
#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

VERSION=$(date +"%Y.%m%d.%H%M")
echo "Building walker firmware $VERSION..."
~/.platformio/penv/bin/platformio run -e jc3248w535-walker
SRC=.pio/build/jc3248w535-walker/firmware.bin
OUT="walker_firmware_${VERSION}.bin"
cp "$SRC" "$OUT"
MD5=$(md5sum "$OUT" | awk '{print $1}')
SIZE=$(stat -f %z "$OUT" 2>/dev/null || stat -c %s "$OUT")
echo
echo "Built: $OUT ($SIZE bytes, md5=$MD5)"
echo
echo "To publish to OpenNova server:"
echo "  scp $OUT rvbcrs@192.168.0.247:/tmp/"
echo "  ssh rvbcrs@192.168.0.247 'echo M@rleen146 | sudo -S docker cp /tmp/$OUT opennova:/data/firmware/'"
echo
echo "Then in admin page > Firmware Updates > Walker firmware, register version $VERSION with md5 $MD5"
```

Make executable: `chmod +x tools/rtk-walker/scripts/release.sh`.

- [ ] **Step 2: walker-ota.md operator runbook**

Document the publish flow:
1. Run `./tools/rtk-walker/scripts/release.sh` — builds + names the binary.
2. scp the .bin to the OpenNova server.
3. Register in admin page Firmware Updates card.
4. On next walker boot (auto-check on by default), it pulls + applies.
5. Manual trigger: TFT Settings tab "Check + Update" button OR walker web UI Firmware card.

Include a section on first-time OTA: the existing walker firmware doesn't have the OTA module; one USB flash of an OTA-capable build is required.

Include a troubleshooting section: failed downloads (check serverUrl + adminToken in walker config), partition errors (verify board_build.partitions has dual app slots), bricked walker recovery (USB reflash).

- [ ] **Step 3: rtk-walker-mapping.md updates**

Add a "Firmware updates" section near the end with a cross-link to walker-ota.md.

- [ ] **Step 4: Commit**

```bash
git add tools/rtk-walker/scripts/release.sh \
        docs/user-guide/walker-ota.md docs/user-guide/rtk-walker-mapping.md \
        docs/user-guide/index.md
git commit -m "feat(rtk-walker): release script + OTA operator runbook"
```

---

## Self-review checklist

**1. Spec coverage:**
- ✅ Manifest scope: single `opennova-manifest.json` (Task 2 + Task 5)
- ✅ Auto-check on boot default ON (Task 1 Step 5 + Task 3 settings)
- ✅ Date-based version `YYYY.MMDD.HHMM` (Task 1 Step 1 pre-build script)
- ✅ Manual scp upload flow (Task 6 release.sh + runbook)

**2. Placeholder scan:**
- One potentially-missing piece: `otaVersionRepo.findLatestByDeviceType` may not exist; Task 2 Step 2 adds it.
- Public mount of `/api/walker-firmware/latest`: need to verify which router file mounts public endpoints. Task 2 Step 3 says "find where other public endpoints live" — keep this explicit during implementation.
- Partition table check (Task 1 Step 6): MUST verify `platformio.ini` board_build.partitions has dual OTA slots. If single-app, OTA is impossible without a partition change.

**3. Type consistency:**
- `OtaCheckResult` struct used uniformly across walker_ota + tft_ui + main HTTP handlers.
- `otaAutoCheck` field added to `WalkerConfigView` AND `WalkerConfigUpdate` AND plumbed through `walkerGetConfig` + `walkerApplyConfig` (NVS read/write).

**4. Risk areas:**
- **Partition layout**: if `huge_app.csv` is in use, OTA needs partition swap. Document fallback to USB-flash.
- **Bricking**: ESP32 OTA reverts to the previous partition on a failed boot (built-in). Document.
- **Boot timing**: `walkerOtaAutoTick` after WiFi connect; if WiFi never connects within N seconds, the call still returns quickly because the `walkerOtaCheck` HTTP call will time out. Use a 30s HTTP timeout to prevent indefinite boot stalls.
- **Auth on binary download**: walker carries the admin token from T10 already; reuse. If token expires, OTA will fail with HTTP 401 — surface clearly in the status label.

---

## Execution

Plan saved at `docs/superpowers/plans/2026-05-22-rtk-walker-ota.md`. Two execution options:

1. **Subagent-Driven** (recommended) — fresh subagent per task, spec + code-quality review between tasks
2. **Inline Execution** — execute tasks sequentially in this session

Which approach?
