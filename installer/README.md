# OpenNova Installer

A cross-platform Electron desktop app that flashes stock Raspberry Pi OS Lite
64-bit to an SD card, injects an OpenNova first-boot configuration, and hands off
to the Pi's existing `/admin` setup wizard. The goal is to let a non-technical
user prepare a ready-to-run OpenNova appliance with no terminal, no SSH, no
manual file editing, and no pre-baked image.

See `docs/superpowers/specs/2026-06-08-opennova-installer-app-design.md` for the
design and `docs/superpowers/plans/2026-06-08-opennova-installer-app.md` for the
implementation plan.

## How it works

1. Collect the user's settings (hostname, network, timezone, connection path).
2. Download the pinned stock Raspberry Pi OS Lite 64-bit image and verify its
   sha256.
3. Raw-write the image to the chosen SD card with verification, after a strict
   safety filter that refuses system disks and anything outside a plausible
   SD-card size window.
4. Write `firstrun.sh`, an empty `ssh` sentinel, and a `cmdline.txt` patch onto
   the freshly written boot partition. On first boot the Pi runs `firstrun.sh`
   once, installs Docker, and brings up the OpenNova container.
5. Poll `http://opennova.local/api/setup/health` to detect the booted Pi, then
   deep-link to `http://opennova.local/admin`.

## Architecture

- **Main process** (`src/main/`): all privileged and native work.
  - `configModel.ts` - turns `InstallerConfig` into `firstrun.sh`, `.env`,
    `docker-compose.yml`, and the `cmdline.txt` append.
  - `imageSource.ts` - streaming download + sha256 verify.
  - `drives.ts` - etcher-sdk drive scan behind a default-deny safety filter
    (`isSafeTarget`).
  - `flasher.ts` - etcher-sdk raw write + verify, re-checks `isSafeTarget`
    immediately before writing.
  - `bootInject.ts` - locate the boot partition cross-OS and write the injected
    files (idempotent `cmdline.txt` append).
  - `discovery.ts` - poll the health endpoint until the Pi answers `running`.
  - `ipc.ts` + `preload.ts` - typed, context-isolated bridge exposed on
    `window.installer`.
- **Renderer** (`src/renderer/`): React + Tailwind wizard
  (welcome, config, choose SD, flash, inject, finish). `wizard.ts` is a pure,
  unit-tested step state machine.
- **Shared** (`src/shared/`): the IPC contract (`types.ts`) and the pinned Pi OS
  release descriptor (`piOsRelease.ts`).

## Development

```bash
cd installer
npm install

# main process (TypeScript -> dist/main)
npm run build:main

# renderer (Vite -> dist/renderer)
npm run build:renderer

# both
npm run build

# unit + integration tests (Vitest)
npm test
```

To run the app against the live Vite dev server, start the renderer
(`npm run dev:renderer`) and launch Electron with `OPENNOVA_DEV_SERVER_URL` set
to the dev server URL. Without that variable the window loads the built
`dist/renderer/index.html`.

## Packaging

```bash
npm run pack    # build + electron-builder --dir (unpacked app, fast, for testing)
npm run dist    # build + electron-builder (dmg / nsis / AppImage)
```

Targets are configured in `electron-builder.yml`: `dmg` (macOS, hardened
runtime), `nsis` (Windows, per-machine with elevation so raw-device writes
work), and `AppImage` (Linux). etcher-sdk's native modules are unpacked from the
asar (`asarUnpack`) so they load at runtime.

### Code signing and notarization

Internal builds may be unsigned. Sign before any wide release. Credentials are
read from environment variables and are never committed:

- macOS / Windows code signing: `CSC_LINK`, `CSC_KEY_PASSWORD`.
- macOS notarization: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
  (and uncomment the `mac.notarize` block in `electron-builder.yml`).

Windows and Linux artifacts should be built on their native OS or in CI.

## Pinning the Raspberry Pi OS image

`src/shared/piOsRelease.ts` holds the single version knob: the image URL, its
sha256, and a display name. The committed value is a placeholder. Before any
real build, set it to a known-good Raspberry Pi OS Lite 64-bit release and its
real sha256. Bump it deliberately (not "always latest") so every install is
reproducible. The `cmdline.txt` token sequence in `configModel.ts` is the
documented Raspberry Pi Imager first-boot mechanism and should be re-verified
against the pinned release.

## End-to-end hardware verification (manual)

These steps are not automated. Run the full matrix before a release. The unit and
integration tests cover the pure logic (config generation, drive safety, sha256
verify, boot-file injection, discovery, the wizard state machine); the items
below cover the parts that only a real card and a real Pi can prove.

### Flashing (each host OS)

- [ ] **macOS**: pick an SD, flash stock Pi OS, inject config. Confirm the boot
      partition mounts and `firstrun.sh`, `ssh`, and the patched `cmdline.txt`
      are present.
- [ ] **Windows**: same flow. Confirm the elevation prompt appears and the write
      completes with verification.
- [ ] **Linux**: same flow.

### First boot (real hardware)

- [ ] Boot a real **Raspberry Pi 4**: confirm first boot auto-installs Docker and
      OpenNova, then `http://opennova.local/api/setup/health` returns
      `server: "running"`.
- [ ] Boot a real **Raspberry Pi 5**: same confirmation.
- [ ] Confirm `firstrun.sh` runs exactly once (the `cmdline.txt` patch is removed
      / not re-triggered on the second boot) and the log at
      `/var/log/opennova-firstrun.log` shows a clean install.

### Network paths

- [ ] **Ethernet**: leave Wi-Fi unset, connect by cable, confirm the Pi comes up
      and is discoverable.
- [ ] **Wi-Fi**: set SSID, password, and country, confirm the Pi joins the
      network on first boot.

### Connection paths

- [ ] **OpenNova app** (default): confirm `ENABLE_DNS` is NOT set and the Pi is
      reachable via mDNS (`opennova.local`).
- [ ] **Original Novabot app**: confirm `ENABLE_DNS: "true"` is set in the
      generated `docker-compose.yml` and the DNS-redirect note was shown.

### Safety

- [ ] Confirm an internal/system disk is never listed as a target.
- [ ] Confirm a large external HDD/SSD (above the size window) is never
      selectable.
- [ ] Confirm the explicit "this will erase the card" confirmation is required
      before flashing can start.

### Discovery and handoff

- [ ] "Find my Pi" resolves `opennova.local` and "Open admin" opens
      `http://opennova.local/admin`.
- [ ] On a host without mDNS (for example Windows without Bonjour), the manual-IP
      fallback works and the wizard never blocks on a timeout.

### Inject fallback

- [ ] Simulate a boot partition that cannot be located, confirm the wizard shows
      the manual-copy fallback (the generated `firstrun.sh`, the `cmdline.txt`
      line, and `docker-compose.yml`) and that following it by hand yields a
      working first boot.
