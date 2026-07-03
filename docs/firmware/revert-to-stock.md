# Revert Custom Firmware Back to Stock

Yes, you can go back from OpenNova custom firmware (`v6.0.2-custom-NN`) to the
original stock firmware. It uses the **exact same OTA / `dpkg` mechanism** that
installed the custom firmware, just with a stock `.deb` instead of a custom one.

For a `v6.0.2-custom` mower, revert to **stock `v6.0.2`** (`mower_firmware_v6.0.2.deb`),
the base the custom build was made from. `v5.7.1` also exists for mowers that
shipped on that line, but match the base your custom build came from.

---

## ⚠️ Read this first

1. **You lose SSH.** Stock firmware has **no SSH** (custom firmware adds it).
   After reverting you cannot log into the mower anymore except via a UART /
   HDMI+USB console. Do everything you need over SSH *before* reverting, and
   prefer the OTA method (Method 1) so you do not depend on SSH afterwards.
2. **Back up first.** Make an OpenNova **portable snapshot** of your maps
   (admin → Map Backups). Optionally also `cp -a /root/novabot /root/novabot.handbak`
   on the mower. User data in `/userdata` normally survives the OTA, but do not
   rely on it blindly.
3. **WiFi config may be lost.** `run_ota.sh` does not guarantee preserving
   `json_config.json`. LoRa is restored by the charger; WiFi may need to be
   **re-provisioned via BLE**. With your DNS redirect (`mqtt.lfibot.com` → your
   server) in place, stock firmware keeps talking to your **local** server, not
   the cloud.
4. **You lose all custom features:** SSH, `extended_commands` (edge-cut, camera
   stream, mapping preflight, seam-fix / obstacle-occupy, multi-map beyond the
   app limit). Basic mowing + the stock Novabot app work as before.
5. **STM32 and charger firmware are untouched** — the `.deb` is only the
   Linux / ROS 2 side. Nothing to revert there.

---

## Method 1 — OTA to stock (recommended, no physical access)

This is the safest path (it does not need SSH afterwards) and matches the
"OTA over MQTT, not SSH" rule.

1. **Place the stock `.deb` in the server's firmware directory** (the same place
   as the custom builds; `FIRMWARE_PATH`, default `<server>/firmware/`):
   - `mower_firmware_v6.0.2.deb`
   The server auto-syncs it into `ota_versions` and **computes the MD5 itself**
   (you do not set the MD5 by hand). If it does not appear, force a rescan:
   `POST /api/dashboard/ota/sync`.
2. **Find the version id**: `GET /api/dashboard/ota/versions` and note the `id`
   of the `v6.0.2` (stock) entry. Or pick it from the admin OTA UI.
3. **Put the mower on the charger and let it charge** — the OTA download only
   starts when `battery_state == CHARGING`.
4. **Trigger the OTA** to the stock version. Because it is a **downgrade**
   (`custom-NN` → `v6.0.2`), the version check would normally skip it, so this
   endpoint force-flashes by default (downgrade = a warning, never a block):

   ```bash
   curl -X POST http://<server>/api/dashboard/ota/trigger/<SN> \
     -H 'content-type: application/json' \
     -d '{"version_id": <stock-id>, "force": true}'
   ```

   The server publishes the exact command (never modify this shape):

   ```json
   {"ota_upgrade_cmd":{"cmd":"upgrade","type":"full","content":"app",
     "url":"http://<server>/api/dashboard/firmware/mower_firmware_v6.0.2.deb",
     "version":"v6.0.2","md5":"66e9210a56952bdf3dddbdef3f9bebc3"}}
   ```

5. The mower downloads over `http://`, verifies the MD5, `dpkg -x` →
   `/root/novabot.new`, writes `upgrade.txt=1`, reboots. `run_ota.sh` then backs
   up `/root/novabot` → `/root/novabot.bak`, deploys stock, verifies
   `run_novabot.sh` exists, reboots. If the verify fails it **auto-rolls back**
   from `.bak`.
6. After boot it runs stock. Check it comes online (see Verify). If WiFi is
   gone, re-provision via BLE.

---

## Method 2 — Manual via SSH / `dpkg` (fallback, while still on custom)

Only possible while you still have SSH (i.e. still on custom firmware). One user
(#90) used this to roll back.

```bash
# on the mower (custom fw has SSH):
cd /root
cp -a novabot novabot.handbak                       # your own backup
# get the stock .deb onto the mower (scp from your laptop, or wget from your server):
#   scp mower_firmware_v6.0.2.deb root@<mower-ip>:/userdata/ota/
dpkg -x /userdata/ota/mower_firmware_v6.0.2.deb /root/novabot.new
echo 1 > /userdata/ota/upgrade.txt
reboot -f
```

On boot `run_ota.sh` picks up `/root/novabot.new` and deploys it (same
backup / verify / rollback as Method 1). **After this, SSH is gone.**

---

## Method 3 — Folder swap (only right after the *first* custom install)

`/root/novabot.bak` holds the **previous** firmware. Only if you just went
stock → custom is `.bak` still stock:

```bash
ls -la /root/novabot.*          # check what .bak / .stock actually contain first
mv /root/novabot /root/novabot.custom
mv /root/novabot.bak /root/novabot
reboot -f
```

After several OTA rounds `.bak` is a previous *custom* build, not stock, so this
will not work then. Use Method 1 or 2. Some builds also keep a
`/root/novabot.stock` — check before swapping.

---

## What is kept vs lost

| Kept | Lost |
|------|------|
| Maps / user data in `/userdata` (normally) | SSH access |
| STM32 + charger firmware | `extended_commands` (edge-cut, camera, preflight, seam-fix) |
| Connection to your local server (via DNS redirect) | OpenNova app advanced features |
| | WiFi config (possibly → BLE re-provision) |

---

## Verify after revert

- Admin → Devices: mower online, `sysVersion` = `v6.0.2` (no `-custom`).
- `is_opennova` returns nothing (extended_commands gone) = confirms stock.
- Stock Novabot app + basic mowing work; OpenNova app advanced features do not.

---

## Stock firmware reference

| File | Version | MD5 | Size |
|------|---------|-----|------|
| `mower_firmware_v6.0.2.deb` | v6.0.2 (stock base for custom) | `66e9210a56952bdf3dddbdef3f9bebc3` | 35 427 756 B |
| `mower_firmware_v5.7.1.deb` | v5.7.1 (older line) | `83c2741d05c9a40ff351332af2082d7c` | 35 366 028 B |

The server recomputes and stores the MD5 on firmware sync, so the OTA payload's
`md5` is always filled in for you; the values above are for manual verification.
