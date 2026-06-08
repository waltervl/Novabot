# OpenNova Installer (desktop app) — Design

**Status:** Approved (brainstorm 2026-06-08). Ready for implementation plan.

## Goal

A small cross-platform desktop app that lets a non-technical user set up a
Raspberry Pi running OpenNova with the least possible effort and **without a
pre-baked image**. The app collects the user's settings, flashes a **stock**
Raspberry Pi OS image to the SD card, injects the configuration + a first-boot
install script, and hands off to the Pi's existing `/admin` setup wizard once it
boots. No terminal, no SSH, no manual file editing.

In one sentence: a tailored "OpenNova Imager" — Raspberry Pi Imager's flashing
power + OpenNova's config baked into the post-flash step.

## Non-goals

- **No pre-baked OpenNova OS image.** We flash stock Raspberry Pi OS Lite 64-bit
  and configure it on first boot. (This is a deliberate constraint from the user.)
- **We do not rebuild the post-boot setup UI.** OpenNova's existing `/admin`
  first-time wizard (account / cloud import / device pairing) stays the authority;
  the installer only gets OpenNova *running* and then links to it.
- Not a general-purpose imaging tool; it only targets the OpenNova-on-Pi flow.

## Architecture

Electron app. Two processes:

- **Renderer (UI):** React + Tailwind, reusing the dashboard's component/style
  conventions. Implements the wizard. Talks to main over IPC.
- **Main (Node):** owns all privileged/native work via **`@balena/etcher-sdk`**
  (the engine inside balenaEtcher):
  - enumerate removable drives (with system-disk filtering),
  - download + decompress the stock Pi OS image (`.img.xz`) from a pinned URL,
  - raw write + verify to the chosen SD, prompting for OS elevation (admin/root),
  - after writing, locate the freshly-written **boot (FAT32) partition** and write
    the injected config files onto it.

No backend server, no cloud component. Everything runs locally on the user's
computer; the only network use is downloading the stock image and (at Pi first
boot) Docker packages + the OpenNova container.

### Module breakdown (main process)

| Module | Responsibility |
|--------|----------------|
| `imageSource` | Pinned Pi OS Lite 64-bit URL + sha256; download with progress; verify checksum |
| `drives` | etcher-sdk drive scan; filter out system/too-large/too-small disks; expose safe candidates |
| `flasher` | etcher-sdk write + validate; progress + cancel; elevation |
| `bootInject` | Find the boot partition post-flash (cross-OS); write `firstrun.sh`, network/SSH/hostname config, patch `cmdline.txt` |
| `configModel` | Turn the wizard inputs into the file set (`.env`, `docker-compose.yml`, `firstrun.sh`) |
| `discovery` | Poll `http://opennova.local/api/setup/health` to detect the booted Pi |

## User flow (wizard screens)

1. **Welcome + hardware check** — what you need (RPi 4/5, official PSU, 64 GB+
   high-endurance microSD), with buy links. Plain-language.
2. **Config**
   - Hostname (default `opennova`).
   - Network: Ethernet (recommended) or Wi-Fi (SSID + password).
   - Timezone.
   - Connection path: **OpenNova app** (default; relies on mDNS auto-discovery) or
     **original Novabot app** (sets `ENABLE_DNS=true` + shows the DNS-redirect note).
3. **Choose SD card** — drive list from `drives`; hard guard so a system disk or a
   disk that's too large/small can never be selected; explicit "this will erase
   the card" confirmation.
4. **Flash** — download pinned stock Pi OS Lite 64-bit (sha256-verified) → raw
   write + verify via etcher-sdk, with progress and the OS elevation prompt.
5. **Inject** — write to the boot partition: `firstrun.sh` + network/SSH/hostname
   config + the `cmdline.txt` patch that triggers `firstrun.sh` on first boot
   (the same mechanism Raspberry Pi Imager uses).
6. **Finish + find your Pi** — "Insert the SD into the Pi and power it on." A
   **Find my Pi** action polls `opennova.local/api/setup/health`; when it returns
   (`server: "running"`), an **Open admin** button deep-links to
   `http://opennova.local/admin`, where the existing setup wizard takes over.

## Configuration model

Collected from the wizard:

```
hostname           string (default "opennova")
network            { type: "ethernet" } | { type: "wifi", ssid, password, country }
timezone           string (IANA, e.g. "Europe/Amsterdam")
connectionPath     "opennova-app" | "novabot-app"
```

## Generated artifacts (written to the boot partition)

- **`firstrun.sh`** — runs once on first boot, then triggers a reboot. Steps
  (reuse of the guide's install sequence):
  1. set hostname; apply Wi-Fi/SSH if configured (NetworkManager / `nmcli` on
     Bookworm) — or rely on a written `custom.toml` for the network/SSH/user bits
     and keep `firstrun.sh` for the OpenNova install only.
  2. `apt-get update`; install Docker via the official Debian repo method.
  3. create `~/opennova/{data}`, write `.env` (`TZ`, `TARGET_IP` auto-detected via
     `hostname -I`) and `docker-compose.yml` (the host-networking compose from the
     beginner guide; `ENABLE_DNS=true` only when `connectionPath = novabot-app`).
  4. `docker compose pull && docker compose up -d`.
- **`cmdline.txt` patch** — append the `systemd.run=/boot/firstrun.sh
  systemd.run_success_action=reboot init=/usr/lib/raspberrypi-sys-mods/firstboot`
  sequence so stock Pi OS executes `firstrun.sh` once. (Exact tokens verified
  against current Pi OS during implementation; this is the documented Imager
  mechanism.)
- **`docker-compose.yml` / `.env`** — also written into the firstrun payload so the
  Pi has them without any download from us.

## Stock image handling

- Source: official Raspberry Pi OS Lite **64-bit** `.img.xz`, **pinned** to a
  known-good release URL + its sha256. Bump deliberately (not "always latest") so
  every install is reproducible and tested.
- etcher-sdk handles streaming download, decompression, write, and verification.

## SD-card safety (critical)

- Never list internal/system disks. Filter on removable + reasonable size window;
  exclude the boot disk. etcher-sdk provides this metadata; add our own guard on
  top.
- Require an explicit "erase this card" confirmation showing the device label/size.
- Verify after write (etcher-sdk read-back) before declaring success.

## Cross-platform concerns

- **Elevation:** raw block write needs admin/root. etcher-sdk handles the per-OS
  elevation prompt (sudo / UAC).
- **Boot-partition detection after flash:** Windows = a new drive letter;
  macOS = `/Volumes/bootfs`; Linux = `/media/<user>/bootfs` (or auto-mount). The
  `bootInject` module resolves this per-OS (re-scan partitions of the just-written
  device; match the FAT/`bootfs` label).
- **`opennova.local` resolution** for "find my Pi" depends on the host having mDNS
  (Bonjour on Windows is not guaranteed) — fall back to letting the user type the
  Pi's IP if `.local` doesn't resolve.

## Error handling

- Download failure / checksum mismatch → clear retry, never flash an unverified
  image.
- Wrong/again-mounted card mid-flash → abort + surface.
- Elevation denied → explain and allow retry.
- Inject step failure (partition not found) → fall back to "download these files
  and copy them onto the SD's boot drive" (the website-style manual fallback) so
  the user is never stuck.
- "Find my Pi" timeout → show manual instructions (open `opennova.local/admin` or
  the IP), don't block.

## Distribution

- Build with **electron-builder** → `.dmg` (macOS), `.exe`/NSIS (Windows),
  `AppImage` (Linux). Host on `downloads.ramonvanbruggen.nl`.
- **Code-signing / notarization** for a clean UX (macOS notarization needs an
  Apple Developer account; Windows needs a code-signing cert). Plan: build and test
  unsigned internally; **sign before any wide release** so end users never see
  "unidentified developer" warnings. v1 may ship with explicit "allow unsigned"
  instructions if certs aren't ready.
- Auto-update: out of scope for v1 (manual re-download); revisit later.

## Repo layout

- New top-level directory `installer/` containing the Electron app (its own
  `package.json`, `main/`, `renderer/`, `build/` config). Independent of the
  `app/` (Expo) and `server/` trees.

## Testing strategy

- Unit: `configModel` (inputs → exact file contents), `drives` filtering (never
  selects a system disk — table-driven), `imageSource` checksum verify.
- Integration: flash to a throwaway SD, mount the boot partition, assert the
  injected files exist and `cmdline.txt` is patched.
- End-to-end (manual, on hardware): real RPi 4 **and** RPi 5; Ethernet and Wi-Fi
  paths; both connection paths (OpenNova app, original Novabot app); on
  Windows + macOS + Linux. Confirm: boots, installs Docker + OpenNova
  automatically, `opennova.local/admin` reachable.

## Resolved decisions

1. **Both connection paths** supported in v1 (OpenNova app default; original app =
   `ENABLE_DNS` toggle).
2. **Pinned** Pi OS Lite 64-bit + sha256; bumped deliberately.
3. **Code-signing** required before wide release; internal builds may be unsigned.

## Open questions for the plan

- Exact current Pi OS first-boot token sequence (`custom.toml` vs `firstrun.sh` +
  `cmdline.txt`) — verify against the live Pi OS release at implementation time.
- Whether to drive network/SSH/hostname via `custom.toml` (cleaner, Bookworm-native)
  or fold it into `firstrun.sh` (one mechanism). Decide in task 1.
