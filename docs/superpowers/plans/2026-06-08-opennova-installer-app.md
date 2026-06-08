# OpenNova Installer (desktop app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform Electron desktop app that flashes **stock** Raspberry Pi OS Lite 64-bit to an SD card, injects an OpenNova config + first-boot install script, and hands off to the Pi's existing `/admin` wizard — so a non-technical user gets OpenNova running with no terminal, no SSH, and no pre-baked image.

**Architecture:** Electron app under `installer/`. Renderer = React + Tailwind wizard. Main process = Node, doing all native work via `etcher-sdk` (drive scan, image download/verify, raw write) plus a post-flash boot-partition injector. No backend; only network use is the stock-image download and (at Pi first boot) Docker + the OpenNova container.

**Tech Stack:** Electron, electron-builder, TypeScript, React 18, Tailwind, Vite (renderer), `etcher-sdk`, `node:crypto` (sha256), Vitest (unit/integration). Spec: `docs/superpowers/specs/2026-06-08-opennova-installer-app-design.md`.

---

## File Structure

```
installer/
  package.json                 # app + build deps, electron-builder config, scripts
  tsconfig.json
  vitest.config.ts
  electron-builder.yml         # mac/win/linux targets + signing config
  src/
    shared/
      types.ts                 # InstallerConfig + IPC channel types
      piOsRelease.ts           # pinned Pi OS Lite 64-bit URL + sha256 (the only "version" knob)
    main/
      index.ts                 # Electron main entry; window; IPC registration
      ipc.ts                   # typed IPC handlers -> module calls
      configModel.ts           # InstallerConfig -> { firstrun.sh, .env, docker-compose.yml, cmdlineAppend, customToml? }
      imageSource.ts           # download stock image + sha256 verify (progress)
      drives.ts                # etcher-sdk drive scan + SYSTEM-DISK SAFETY filter
      flasher.ts               # etcher-sdk write + verify (progress, cancel, elevation)
      bootInject.ts            # locate boot partition cross-OS + write injected files
      discovery.ts             # poll opennova.local/api/setup/health
    renderer/
      main.tsx                 # React root
      App.tsx                  # wizard state machine (step routing)
      steps/                   # one component per wizard screen
      ipc.ts                   # renderer-side typed IPC client
  test/
    fixtures/                  # sample drive lists, etc.
```

Boilerplate (Electron bootstrapping, Vite/React wiring, Tailwind) follows standard patterns; this plan gives **complete code for the OpenNova-specific logic** (configModel, drive safety, firstrun, bootInject, imageSource, discovery) and concrete steps for the shell/UI/packaging.

---

## Task 1: Scaffold the Electron app

**Files:**
- Create: `installer/package.json`, `installer/tsconfig.json`, `installer/vitest.config.ts`
- Create: `installer/src/main/index.ts`, `installer/src/shared/types.ts`

- [ ] **Step 1: Create `installer/package.json`**

```json
{
  "name": "opennova-installer",
  "version": "0.1.0",
  "private": true,
  "main": "dist/main/index.js",
  "scripts": {
    "build:main": "tsc -p tsconfig.json",
    "test": "vitest run",
    "dev": "electron .",
    "dist": "electron-builder"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.0",
    "@types/node": "^22.0.0"
  },
  "dependencies": {
    "etcher-sdk": "^9.0.0"
  }
}
```

- [ ] **Step 2: Create `installer/tsconfig.json`** (NodeNext, strict, outDir `dist`, include `src`).
- [ ] **Step 3: Create `installer/vitest.config.ts`** with `test.environment: 'node'`.
- [ ] **Step 4: Create `installer/src/shared/types.ts`** (the config + IPC contract):

```ts
export interface InstallerConfig {
  hostname: string;                       // default "opennova"
  network:
    | { type: 'ethernet' }
    | { type: 'wifi'; ssid: string; password: string; country: string };
  timezone: string;                       // IANA, e.g. "Europe/Amsterdam"
  connectionPath: 'opennova-app' | 'novabot-app';
}

export interface GeneratedFiles {
  firstrunSh: string;
  envFile: string;
  composeYml: string;
  cmdlineAppend: string;                  // appended to cmdline.txt
}
```

- [ ] **Step 5: Minimal `installer/src/main/index.ts`** that opens a BrowserWindow loading a placeholder, so `npm run dev` shows a window.
- [ ] **Step 6: Verify build + window**

Run: `cd installer && npm install && npm run build:main`
Expected: compiles, no errors. `npm run dev` opens a window.

- [ ] **Step 7: Commit**

```bash
git add installer/package.json installer/tsconfig.json installer/vitest.config.ts installer/src
git commit -m "feat(installer): scaffold Electron app shell"
```

---

## Task 2: configModel (inputs → file contents)

This is the OpenNova-specific heart: turn `InstallerConfig` into the exact files written to the boot partition. Pure + fully unit-testable.

**Files:**
- Create: `installer/src/main/configModel.ts`
- Test: `installer/test/configModel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { generateFiles } from '../src/main/configModel.js';

const base = { hostname: 'opennova', network: { type: 'ethernet' } as const, timezone: 'Europe/Amsterdam' };

describe('generateFiles', () => {
  it('compose has host networking, latest image, TARGET_IP from env', () => {
    const g = generateFiles({ ...base, connectionPath: 'opennova-app' });
    expect(g.composeYml).toContain('image: rvbcrs/opennova:latest');
    expect(g.composeYml).toContain('network_mode: host');
    expect(g.composeYml).toContain('TARGET_IP: ${TARGET_IP');
  });

  it('opennova-app path does NOT enable DNS; novabot-app path DOES', () => {
    expect(generateFiles({ ...base, connectionPath: 'opennova-app' }).composeYml)
      .not.toMatch(/ENABLE_DNS:\s*"true"/);
    expect(generateFiles({ ...base, connectionPath: 'novabot-app' }).composeYml)
      .toMatch(/ENABLE_DNS:\s*"true"/);
  });

  it('firstrun installs docker and brings the stack up, auto-detecting TARGET_IP', () => {
    const g = generateFiles({ ...base, connectionPath: 'opennova-app' });
    expect(g.firstrunSh).toMatch(/^#!\/bin\/bash/);
    expect(g.firstrunSh).toContain('docker-ce');
    expect(g.firstrunSh).toContain('hostname -I');
    expect(g.firstrunSh).toContain('docker compose up -d');
  });

  it('wifi config produces an nmcli connection; ethernet does not', () => {
    const wifi = generateFiles({ ...base, network: { type: 'wifi', ssid: 'Home', password: 'secret', country: 'NL' }, connectionPath: 'opennova-app' });
    expect(wifi.firstrunSh).toContain('nmcli');
    expect(wifi.firstrunSh).toContain('Home');
    expect(generateFiles({ ...base, connectionPath: 'opennova-app' }).firstrunSh).not.toContain('nmcli');
  });

  it('cmdlineAppend triggers firstrun once then reboots', () => {
    const g = generateFiles({ ...base, connectionPath: 'opennova-app' });
    expect(g.cmdlineAppend).toContain('systemd.run=/boot/firstrun.sh');
    expect(g.cmdlineAppend).toContain('systemd.run_success_action=reboot');
  });
});
```

- [ ] **Step 2: Run it, confirm it fails** — `cd installer && npx vitest run test/configModel.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `installer/src/main/configModel.ts`**

```ts
import type { InstallerConfig, GeneratedFiles } from '../shared/types.js';

function composeYml(cfg: InstallerConfig): string {
  const dns = cfg.connectionPath === 'novabot-app'
    ? '      ENABLE_DNS: "true"\n      UPSTREAM_DNS: "1.1.1.1"\n'
    : '';
  return `services:
  opennova:
    image: rvbcrs/opennova:latest
    container_name: opennova
    restart: unless-stopped
    network_mode: host
    environment:
      TZ: \${TZ:-${cfg.timezone}}
      PORT: 80
      DB_PATH: /data/novabot.db
      STORAGE_PATH: /data/storage
      FIRMWARE_PATH: /data/firmware
      ENABLE_TLS: "true"
      ENABLE_DASHBOARD: "true"
      ENABLE_MDNS: "true"
      TARGET_IP: \${TARGET_IP:?set TARGET_IP}
      RENDER_BASE_URL: "http://\${TARGET_IP}"
${dns}    volumes:
      - ./data:/data
`;
}

function envFile(cfg: InstallerConfig): string {
  return `TZ=${cfg.timezone}\n`; // TARGET_IP is auto-detected by firstrun.sh
}

function firstrunSh(cfg: InstallerConfig): string {
  const wifi = cfg.network.type === 'wifi'
    ? `nmcli connection add type wifi ifname wlan0 con-name opennova-wifi ssid '${cfg.network.ssid}' \\
  802-11-wireless-security.key-mgmt wpa-psk 802-11-wireless-security.psk '${cfg.network.password}' || true
raspi-config nonint do_wifi_country '${cfg.network.country}' || true
nmcli connection up opennova-wifi || true
`
    : '';
  return `#!/bin/bash
set -e
exec > /var/log/opennova-firstrun.log 2>&1
hostnamectl set-hostname '${cfg.hostname}' || true
${wifi}
# Docker (official Debian repo)
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<SRC
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
SRC
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker

# OpenNova
install -d -o "$(logname 2>/dev/null || echo opennova)" /home/opennova/opennova/data || mkdir -p /home/opennova/opennova/data
cd /home/opennova/opennova
TARGET_IP="$(hostname -I | awk '{print $1}')"
printf 'TZ=%s\\nTARGET_IP=%s\\n' '${cfg.timezone}' "$TARGET_IP" > .env
cat > docker-compose.yml <<'COMPOSE'
${composeYml(cfg)}COMPOSE
docker compose pull
docker compose up -d
`;
}

const CMDLINE_APPEND =
  ' systemd.run=/boot/firstrun.sh systemd.run_success_action=reboot init=/usr/lib/raspberrypi-sys-mods/firstboot';

export function generateFiles(cfg: InstallerConfig): GeneratedFiles {
  return {
    firstrunSh: firstrunSh(cfg),
    envFile: envFile(cfg),
    composeYml: composeYml(cfg),
    cmdlineAppend: CMDLINE_APPEND,
  };
}
```

- [ ] **Step 4: Run tests, confirm pass** — `npx vitest run test/configModel.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add installer/src/main/configModel.ts installer/test/configModel.test.ts && git commit -m "feat(installer): configModel generates firstrun/.env/compose"`

> NOTE for task 1 decision (from spec open question): this plan folds network/SSH/hostname into `firstrun.sh`. If, during Step 3, the live Pi OS release favours `custom.toml`, add a `customToml` field to `GeneratedFiles` and write it in bootInject — but keep firstrun for the Docker/OpenNova install regardless. Verify the exact `cmdline.txt` token sequence against the pinned Pi OS image before finalizing `CMDLINE_APPEND`.

---

## Task 3: imageSource (pinned download + sha256 verify)

**Files:**
- Create: `installer/src/shared/piOsRelease.ts`, `installer/src/main/imageSource.ts`
- Test: `installer/test/imageSource.test.ts`

- [ ] **Step 1: Create `piOsRelease.ts`** — the single version knob:

```ts
// Pinned, known-good Raspberry Pi OS Lite 64-bit. Bump deliberately + update sha256.
export const PI_OS_RELEASE = {
  url: 'https://downloads.raspberrypi.com/raspios_lite_arm64/images/RASPIOS_LITE_ARM64_PINNED.img.xz',
  sha256: 'PINNED_SHA256_TO_FILL_AT_IMPLEMENTATION',
  displayName: 'Raspberry Pi OS Lite (64-bit)',
} as const;
```

- [ ] **Step 2: Write failing test** for `verifySha256(filePath, expected)` (positive + negative) using a tiny temp file with a known hash.
- [ ] **Step 3: Implement `imageSource.ts`** — `downloadImage(url, dest, onProgress)` (stream to disk) + `verifySha256(path, expected)` via `node:crypto` createHash. (etcher-sdk can also stream from URL directly during flash; this module exists for the explicit verify-before-write gate.)
- [ ] **Step 4: Run tests → pass.**
- [ ] **Step 5: Commit** — `feat(installer): pinned Pi OS source + sha256 verify`

---

## Task 4: drives — etcher-sdk scan + SYSTEM-DISK SAFETY (critical)

**Files:**
- Create: `installer/src/main/drives.ts`
- Test: `installer/test/drives.test.ts`

- [ ] **Step 1: Write failing test (table-driven safety)** — the pure filter `isSafeTarget(drive)` must reject system disks, non-removable disks, the boot disk, too-large (> 256 GB) and too-small (< 4 GB):

```ts
import { describe, it, expect } from 'vitest';
import { isSafeTarget } from '../src/main/drives.js';

const mk = (o: Partial<any>) => ({ isSystem: false, isRemovable: true, isReadOnly: false, size: 64e9, ...o });

describe('isSafeTarget', () => {
  it('accepts a normal removable 64GB card', () => expect(isSafeTarget(mk({}))).toBe(true));
  it('rejects system disk', () => expect(isSafeTarget(mk({ isSystem: true }))).toBe(false));
  it('rejects non-removable', () => expect(isSafeTarget(mk({ isRemovable: false }))).toBe(false));
  it('rejects too large (>256GB, probably an external drive)', () => expect(isSafeTarget(mk({ size: 1e12 }))).toBe(false));
  it('rejects too small (<4GB)', () => expect(isSafeTarget(mk({ size: 2e9 }))).toBe(false));
  it('rejects read-only', () => expect(isSafeTarget(mk({ isReadOnly: true }))).toBe(false));
});
```

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement `drives.ts`** — `isSafeTarget(d)` (pure predicate above) + `scanDrives()` that wraps etcher-sdk's `scanner` and returns only `isSafeTarget` candidates with `{ device, description, size }`.
- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit** — `feat(installer): drive scan with strict system-disk safety filter`

---

## Task 5: flasher — etcher-sdk write + verify

**Files:**
- Create: `installer/src/main/flasher.ts`
- Test: `installer/test/flasher.test.ts` (mock etcher-sdk; assert it calls write with the chosen device + verify=true, and forwards progress/cancel; never writes a drive that fails `isSafeTarget`)

- [ ] **Step 1: Write failing test** with a mocked etcher-sdk multiWrite, asserting: refuses if `!isSafeTarget`; passes `verify: true`; emits progress.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement `flasher.ts`** — `flash({ imagePath, device, onProgress, signal })` using etcher-sdk `sourceDestination` + `multiWrite` with `{ verify: true }`; re-check `isSafeTarget` immediately before writing; surface elevation errors verbatim.
- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit** — `feat(installer): etcher-sdk flash with pre-write safety recheck + verify`

---

## Task 6: bootInject — write config to the boot partition (cross-OS)

**Files:**
- Create: `installer/src/main/bootInject.ts`
- Test: `installer/test/bootInject.test.ts`

- [ ] **Step 1: Write failing test** against a temp directory standing in for a mounted boot partition: `writeBootFiles(dir, generated)` must create `firstrun.sh` (mode 0755), append `cmdlineAppend` to an existing `cmdline.txt` exactly once (idempotent — running twice does not double-append), and write an empty `ssh` file.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeBootFiles } from '../src/main/bootInject.js';

const gen = { firstrunSh: '#!/bin/bash\necho hi\n', envFile: 'TZ=x\n', composeYml: 'services: {}\n', cmdlineAppend: ' systemd.run=/boot/firstrun.sh' };

describe('writeBootFiles', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'bootfs-')); writeFileSync(join(dir, 'cmdline.txt'), 'console=serial0 root=PARTUUID=xx rootwait'); });

  it('writes firstrun.sh executable + ssh + appends cmdline once', () => {
    writeBootFiles(dir, gen);
    expect(existsSync(join(dir, 'firstrun.sh'))).toBe(true);
    expect(statSync(join(dir, 'firstrun.sh')).mode & 0o111).toBeTruthy();
    expect(existsSync(join(dir, 'ssh'))).toBe(true);
    const c1 = readFileSync(join(dir, 'cmdline.txt'), 'utf8');
    writeBootFiles(dir, gen); // idempotent
    expect(readFileSync(join(dir, 'cmdline.txt'), 'utf8')).toBe(c1);
    expect((c1.match(/systemd.run=\/boot\/firstrun.sh/g) || []).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement `bootInject.ts`** — `writeBootFiles(bootDir, gen)` (the pure file-writing above) **and** `findBootPartition(device)` which re-scans the just-written device's partitions and returns the mounted FAT/`bootfs` path per-OS (Windows drive letter via the volume label `bootfs`; macOS `/Volumes/bootfs`; Linux `/media/$USER/bootfs` or `/run/media`). `cmdline.txt` append is guarded by a substring check for idempotency.
- [ ] **Step 4: Run → pass.** (Unit covers `writeBootFiles`; `findBootPartition` is exercised in the manual E2E task.)
- [ ] **Step 5: Commit** — `feat(installer): boot-partition injector (firstrun/cmdline/ssh, idempotent)`

---

## Task 7: discovery — find the booted Pi

**Files:**
- Create: `installer/src/main/discovery.ts`
- Test: `installer/test/discovery.test.ts` (mock fetch)

- [ ] **Step 1: Write failing test** — `waitForPi({ host, timeoutMs, fetchFn })` resolves when `fetchFn` returns `{ server: 'running' }`, rejects on timeout; tries `opennova.local` then a user-supplied IP.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement `discovery.ts`** polling `http://<host>/api/setup/health`, success when JSON `server === 'running'`.
- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit** — `feat(installer): pi discovery via /api/setup/health poll`

---

## Task 8: IPC wiring (main)

**Files:**
- Create: `installer/src/main/ipc.ts`; Modify: `installer/src/main/index.ts`

- [ ] **Step 1: Implement `ipc.ts`** — typed `ipcMain.handle` channels: `drives:scan`, `image:ensure` (download+verify, with progress events), `flash:start`/`flash:cancel` (progress events), `boot:inject`, `pi:find`. Each delegates to its module; errors returned as `{ ok:false, error }`.
- [ ] **Step 2: Register in `index.ts`**; add a `preload.ts` exposing a typed `window.installer` bridge (contextIsolation on).
- [ ] **Step 3: Smoke test** — `npm run dev`, call `drives:scan` from devtools, see candidates (or empty on a machine with no SD).
- [ ] **Step 4: Commit** — `feat(installer): typed IPC bridge for the wizard`

---

## Task 9: Renderer wizard UI

**Files:**
- Create: `installer/src/renderer/{main.tsx,App.tsx,ipc.ts}`, `installer/src/renderer/steps/*.tsx`, Tailwind config + Vite config.

- [ ] **Step 1:** Vite + React + Tailwind wired into Electron renderer; `App.tsx` is a step state machine: `welcome → config → chooseSd → flash → inject → finish`.
- [ ] **Step 2:** Implement each step component, calling `window.installer.*`:
  - Welcome (hardware checklist + links).
  - Config (form → `InstallerConfig`, validation).
  - ChooseSd (`drives:scan`, radio list, erase confirmation).
  - Flash (`image:ensure` then `flash:start`; progress bars; cancel).
  - Inject (`boot:inject`; on failure, fallback panel: "download these files + drop on the SD boot drive").
  - Finish (`pi:find` with a manual-IP fallback; **Open admin** → `opennova.local/admin`).
- [ ] **Step 3:** Manual click-through with mocked main handlers (no real SD) to verify routing + error states.
- [ ] **Step 4: Commit** — `feat(installer): wizard UI (welcome → config → sd → flash → inject → finish)`

---

## Task 10: Packaging (electron-builder)

**Files:**
- Create: `installer/electron-builder.yml`

- [ ] **Step 1:** Configure mac (`dmg`, `hardenedRuntime`, entitlements, notarize placeholder), win (`nsis`), linux (`AppImage`); `asarUnpack` etcher-sdk native deps.
- [ ] **Step 2:** `npm run dist` produces installers for the current OS. (Signing creds wired via env; unsigned builds allowed internally with a documented "allow unsigned" note — sign before wide release per the spec.)
- [ ] **Step 3: Commit** — `build(installer): electron-builder targets + signing config`

---

## Task 11: End-to-end hardware verification (manual)

**Not automated.** Document a checklist in `installer/README.md`:

- [ ] Flash on Windows, macOS, Linux (each: pick SD → flash stock Pi OS → inject).
- [ ] Boot a real **RPi 4** and a **RPi 5**; confirm first boot auto-installs Docker + OpenNova and `opennova.local/api/setup/health` returns `server: "running"`.
- [ ] Ethernet path and Wi-Fi path.
- [ ] Both connection paths: OpenNova app (mDNS), original Novabot app (`ENABLE_DNS`).
- [ ] Safety: confirm a system disk / external HDD is never selectable.
- [ ] Commit the README checklist.

---

## Self-Review

- **Spec coverage:** wizard flow (T9), config generation (T2), pinned image + verify (T3), drive safety (T4), flash (T5), inject + firstrun + cmdline (T2/T6), discovery/handoff (T7/T9), distribution/signing (T10), cross-OS + hardware testing (T6/T11), both connection paths (T2). All spec sections map to a task.
- **Placeholders:** the only intentional fill-in is the pinned Pi OS URL+sha256 in `piOsRelease.ts` (Task 3 Step 1) — a real value to set at implementation, not vague code. `CMDLINE_APPEND`/firstrun verified against the live Pi OS in Task 2's NOTE.
- **Type consistency:** `InstallerConfig`/`GeneratedFiles` (T1) are the contract used by configModel (T2), bootInject (T6), IPC (T8), UI (T9). `isSafeTarget` (T4) is reused by flasher (T5).

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-06-08-opennova-installer-app.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task + two-stage review between tasks; fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
