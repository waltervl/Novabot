# Admin Panel

The admin panel is the OpenNova server's built-in web UI. It lives at `http://<your-server-ip>/` (default port 80) or at whatever hostname you put behind a reverse proxy (e.g. `opennova.example.com`). Log in with the email + password you set during first-time setup.

It has six tabs across the top. This page walks through what each tab is for and which cards you'll actually use day-to-day vs. the ones you can ignore unless something's wrong.

## Top bar (always visible)

- **Connection chips** — three little pills next to the OpenNova logo. They show the server version, uptime, and current memory use. If uptime suddenly resets to seconds, the container restarted — something to investigate if you didn't trigger it.
- **Tabs** — Devices / Console / Mower Debug / Maps / Firmware / Settings.
- **Refresh arrows** (↻) on every card title — manual reload, in case auto-refresh is paused.

## Devices

The default landing tab. Shows every mower and charger paired with your account, with:

- Online/offline pill (driven by MQTT — green = receiving status reports).
- Serial number, nickname, firmware version, last seen.
- Quick actions per device: "Open dashboard" (full dashboard view), "OTA update", "Settings".

Click a device card to drill into per-device controls: live map, battery, RTK status, manual joystick, schedules, work history, sensors.

This is the only tab most users ever need.

## Console

Live server console — same lines you'd see in `docker logs opennova -f`. Useful when something goes wrong and you want to watch the request flow in real time. Filter buttons across the top toggle severity (info / warn / error) and a pause button stops the auto-scroll so you can copy-paste lines.

If you're going to file a bug, opening this tab and reproducing the problem gives you exact log lines to paste into the issue.

## Mower Debug

Sends low-level `extended_commands` MQTT payloads to the mower for diagnosis. Buttons here include:

- **Reboot mqtt_node** — soft-restart the on-mower bridge that talks to the MQTT broker. Use this if the mower goes offline after the server restarts but SSH still works (the classic `MQTT_EVENT_INIT_NET_ERROR` stuck state).
- **Re-run set_server_urls.sh** — forces the mower to re-discover the server via mDNS / DNS and rewrite `http_address.txt` + `json_config.json`. The cure for "mower offline after I moved my server's IP".
- **Restart navigation** — reloads the ROS navigation stack without rebooting the whole mower. Useful when localization is stuck.
- **Reboot mower** — full hardware reboot. Treat as last resort — see [Troubleshooting](troubleshooting.md#i-bricked-something-and-the-mower-wont-boot) for the limitations.

Each button shows the exact MQTT payload it'll send before firing — read it first, especially the destructive ones.

## Maps

Visual viewer for every map stored on the server: work boundaries, obstacles, unicom (zone-to-charger) channels. Hover over a polygon to see its area and canonical name; click to download the underlying CSV.

You can rename maps here (alias) — the change reflects in the Novabot app the next time it calls `queryEquipmentMap`. If renames seem to randomly shuffle between sessions, [issue #66](https://github.com/rvbcrs/Novabot/issues/66) tracks it; the workaround in the meantime is to rename in pairs.

## Firmware

OTA management — both for your own mowers and for community-built custom firmware:

- **Available Firmware** — list of versions the server knows about, with download URL, MD5, and changelog. New firmware drops in `/data/firmware/` are picked up automatically.
- **Update Device** — pick a target mower, pick a version, click "Trigger OTA". The progress bar updates from MQTT status reports.

The `0 → 62%` range is download, `62 → 68%` is unpacking, `68 → 100%` is installing. If you see the percentage stuck at one of those boundaries, see [Troubleshooting → OTA failures](troubleshooting.md#ota-update-fails-download-failed-percentage-stuck-below-62).

## Settings

Catch-all for everything that isn't a per-device operation. Cards in order of how often you'll touch them:

- **Account** — your email, role, password change. The chips at the top of the card show the server release version (you can compare against [the changelog](https://github.com/rvbcrs/Novabot/releases) to see what's new).
- **Resources & Help** — link tiles to the wiki, GitHub, Docker Hub, releases, discussions. Bookmark these — the LFI support hotline is gone, so this is how problems get solved.
- **Network & DNS** — checks that `app.lfibot.com` and `mqtt.lfibot.com` resolve to your server. If both rows say ✓, your app and mower can find you. Built-in dnsmasq toggle here too — turn it on if your router can't do DNS rewrites and you want to point the mower's resolver straight at this server.
- **System Tools → mDNS Advertiser** — soft-restart the auto-discovery service if `opennova.local` stops resolving. Doesn't restart the container.
- **Certificate Setup** — install the OpenNova CA on your phone. Required for iOS (the Novabot stock app refuses self-signed certs). Optional but convenient for Android too.
- **Cloud Import** — pull your existing mower / charger pairs from the real Novabot cloud using your LFI account. One-shot — after the import you can leave the LFI cloud forever.
- **Remote Debug → Send Logs** — start streaming your live MQTT log to someone else's server (used when someone is helping you debug). You enter their relay URL and they see your traffic. Stop sharing any time.
- **Remote Support → Allow Ramon to assist** — opt-in toggle that lets Ramon (project maintainer) open a one-session, approved shell into your container. Every keystroke logs to your disk for review. Toggle off when done.
- **Remote Support → Operator** — only visible on Ramon's own central instance. Lists connected agents and opens a browser terminal for the selected one.
- **Remote Debug → Receive Logs** — only relevant if you're helping someone else; surfaces the live stream from their container in your console.
- **Support OpenNova** — donation links if you want to throw a few euros at the project. Optional.
- **Danger Zone** — destructive operations: wipe DB, force re-pair, factory reset. Each one prompts twice. Don't touch unless you mean it.

## Keyboard shortcuts

- `R` — refresh the active tab
- `D` — jump to Devices
- `C` — jump to Console
- `S` — jump to Settings
- `Esc` — close any open modal

## When the admin panel itself won't load

Nine times out of ten the OpenNova server itself crashed. Check `docker ps` to confirm the container is running; if it's not, `docker compose up -d` brings it back. If the container is up but the page returns 502, your reverse proxy (NGINX Proxy Manager / Caddy / Traefik) lost the route — check its log.
