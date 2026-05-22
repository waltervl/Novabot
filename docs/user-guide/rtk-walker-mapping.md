# RTK Walker Mapping

> Walk your perimeter with an RTK handheld instead of driving the mower around.
> The bundle is imported through the same restore flow described in
> [Map Backup & Restore](map-backup-restore.md), so the dock-anchor refresh
> step at the end is identical.

## What this is for

The RTK walker is a small handheld device (ESP32-S3 with a 3.2" TFT and a
LC29HDA RTK GNSS receiver) that lets you record a map by physically walking
around it. The walker writes polygon CSVs in a Novabot-compatible bundle and
hands them off to the OpenNova server, which converts them into the same
`map.pgm` / `map.yaml` / per-slot CSV layout the mower normally produces from
its own scan-map session.

You want the walker when:

- The mower has no map yet and you would rather walk than drive a learning
  pass with the mower.
- The area is too tight, too overgrown, or too risky for the mower to drive
  on its own (steep edges, water, fragile beds).
- The mower is offline, not yet provisioned, or out for service, and you
  still want to plan + import a map ahead of time.
- You want a clean, precise boundary based on RTK FIX points rather than
  the mower's wheel odometry during a learning pass.

You do not want the walker when the mower already has a working map you
just want to back up. Use the regular backup flow for that.

## Prerequisites

| Item | Notes |
|---|---|
| RTK walker hardware | ESP32-S3 board with TFT + LC29HDA RTK receiver, in the printed case (`tools/rtk-walker/designs/`). |
| Walker firmware | Built from branch `feat/rtk-walker-map-import` (or `master` once merged). Build with `pio run -e jc3248w535-walker`, flash via USB. |
| OpenNova server | Running, version 2026.0521 or newer (the `import-walker-bundle` endpoint must exist). |
| Mower | Physically docked, powered on, online, `battery_state: Charging`. The server reads the mower's live `map_position` to align the walked polygon to the mower's local frame. |
| Admin bearer token | From the admin page. See [Admin Panel](admin-panel.md) for how to generate one. |
| RTK corrections | An NTRIP feed reachable from the walker's WiFi (the walker uses the same NTRIP plumbing as the GPS dev mode). FIX quality is required for a clean boundary; FLOAT and BAD points are filtered out automatically. |

## First-time setup

The walker stores its server credentials in NVS (Preferences). You only
have to do this once per walker.

1. Power up the walker. The TFT comes up on the GPS screen.
2. Connect the walker to your WiFi:
   - If it cannot reach a known WiFi it brings up its own AP. Connect a
     phone or laptop to that AP and open the walker's web UI.
   - Or use the existing WiFi setup flow (Settings tab on the TFT, or
     directly via the web UI at `http://<walker-ip>/`).
3. Open the walker's web UI in a browser: `http://<walker-ip>/`.
4. On the Server section of the settings page set:
   - **Server URL**: the OpenNova server, including port. Example:
     `http://192.168.0.247:8080`. No trailing slash needed (the walker
     strips it).
   - **Mower SN**: the serial of the mower you are mapping for. Example:
     `LFIN2230700238`.
   - **Admin token**: paste the raw bearer (no `Bearer ` prefix). The
     walker stores it in NVS and only sends it inside the `Authorization`
     header. It is never echoed in the web log.
5. Save. This does not require a reboot.

The walker can now POST bundles to:

```
POST <serverUrl>/api/admin-status/maps/<mowerSn>/import-walker-bundle
Authorization: Bearer <adminToken>
Content-Type: multipart/form-data
```

If you change mowers or rotate the admin token, come back to this page and
update the fields.

## Recording a work-area map

A "work area" is one of the green polygons you mow. Each map slot (`map0`,
`map1`, `map2`) on the mower corresponds to one work area. The walker
supports up to 3 maps per session.

1. On the TFT, tap the **Maps** tab in the bottom bar (next to GPS, Tracks,
   Settings).
2. Tap **+ Add area** at the bottom of the maps screen.
3. Physically stand at the dock. This becomes the session origin
   `(0, 0)` in the walker-local frame. Everything you walk is recorded
   relative to that point in the East-North plane (X = East, Y = North,
   meters).
4. Walk the boundary you want to mow. Keep the walker upright and visible
   so you can see the RTK quality dot in the corner:
   - **Green**: FIX quality. Points are recorded.
   - **Orange**: FLOAT. Points are dropped (counted as "Dropped" on the
     screen so you can see when you lose FIX).
   - **Red**: BAD or no fix. Points are dropped.
5. Walk back to the start point and close the loop. The polygon does not
   have to be perfect; the server rasterises the polygon as drawn.
6. Tap **Save** to keep the recording. The map appears in the list with
   its point count. Tap **Cancel** instead to discard.

Dropped points do not break the polygon. They just mean the boundary in
those segments is reconstructed from the surrounding FIX points. If the
dropped count is high, walk the bad sections again before saving.

## Adding obstacles and channels

Open a saved map from the list to reach the map detail screen.

### Obstacles

An obstacle is a polygon the mower must avoid (tree, flower bed, pond).

1. From the map list, tap the map row to open MapDetail.
2. Tap **+ Obstacle**.
3. Walk around the obstacle (close the loop the same way as the work area).
4. Tap **Save**.
5. The obstacle appears in the right-hand list on the detail screen.

You can add multiple obstacles per map. Each one is its own polygon.

### Channels

A channel is a narrow corridor between two areas (currently used to wire
the mower's route to the charger). The MVP build hardcodes the target to
`charge`. Multi-map channel targets are tracked for a later build.

1. From MapDetail, tap **+ Channel**.
2. Walk the channel path.
3. Tap **Save**.
4. The channel appears in the left-hand list on the detail screen.

## Exporting and uploading

There are two ways to get the bundle to the server. Pick whichever is more
convenient.

### Method A: direct POST from the walker

Fastest path. Requires the walker to have working WiFi reach to the
OpenNova server.

1. On the main maps screen, tap **Upload**.
2. The title flips to `Uploading...` while the POST is in flight. Typical
   bundles upload in a few seconds.
3. On success the title shows `Upload OK (<bytes> B): <staging response>`.
   The server returns a JSON body with a `stagingId` you can use on the
   admin page to confirm and apply.
4. On failure the title shows `ERR: <HTTP code> <reply>`. Check that the
   server URL, mower SN, and admin token are all current.

### Method B: manual download then upload

Useful when the walker and the server are on different networks, or when
you want to inspect the bundle before sending it.

1. On the main maps screen, tap **Export**. The title shows the on-flash
   path where the bundle was written.
2. From any device on the same WiFi as the walker, open
   `http://<walker-ip>/bundle.novabundle` in a browser. The walker rebuilds
   the bundle on demand and streams it back as `walker.novabundle`.
3. Save the file to your laptop.
4. In the admin page, open the **Map** tab, select the target mower, and
   click **Import walker bundle...**. Pick the saved file.
5. The admin page stages the bundle, shows a confirm dialog with the
   polygon summary, and then runs the same handoff as Method A.

## What happens server-side

When the bundle hits `/api/admin-status/maps/:sn/import-walker-bundle`,
the server:

1. Reads the mower's live `map_position` `(x, y, orientation)` over MQTT.
   This is the dock's pose in the mower's current local frame.
2. Treats the walker's session origin `(0, 0)` as the dock too, with the
   walker-local axes (X = East, Y = North) as the polygon frame.
3. Computes the rotation and translation Δ that maps walker-local
   coordinates onto the mower's local frame, and applies it to every
   polygon point, obstacle, and channel.
4. Rasterises the polygon set into a Nav2-compatible `map.pgm` + `map.yaml`
   pair, carving obstacles out of free space.
5. Wraps the transformed CSVs + raster into a synthetic portable bundle
   that looks identical to a bundle produced by a normal save_map.
6. Hands off to the existing apply-verbatim flow described in
   [Map Backup & Restore](map-backup-restore.md). All the same hooks fire
   (write_map_files, regenerate_per_map_files, charging_station.yaml
   refresh).

This means the admin page after import looks exactly like a regular
restore: a dock-anchor refresh modal appears asking whether to redock
manually or automatically.

## After import

1. Pick a dock-anchor refresh option on the modal. See
   [Map Backup & Restore](map-backup-restore.md#why-the-dock-cycle-is-the-whole-game)
   for why this step matters and what each mode does. Short version:
   - **Manual**: pick the mower up briefly and put it back, or joystick it
     1m off and back.
   - **Automatic**: server drives the mower 1m back and sends
     `go_to_charge`. Requires `battery_state: Charging` to start.
2. Wait for `battery_state` to return to `Charging` and for the dock
   ArUco alignment to snap the local frame.
3. Verify the alignment by polling `/api/dashboard/devices` and checking
   that `map_position_x/y/orientation` is within roughly 10cm and a few
   degrees of the bundle's `charging_pose`.
4. Start a mow on the new map from the app or admin page. The coverage
   planner reads CSVs from disk per task, so the walked polygon is used
   without further restarts.

## End-to-end test runbook

Use this when you are validating the walker import flow from a clean
slate. Do not run on a production garden you care about until the rest
of the runbook has succeeded once in a safe test patch.

### 1. Pre-flight

- Walker firmware is built from the current branch:
  ```
  cd tools/rtk-walker
  pio run -e jc3248w535-walker
  pio run -e jc3248w535-walker -t upload   # flash via USB
  ```
- Server is on the same branch (or has the merged image). Restart the
  container after pulling so the `import-walker-bundle` route is live.
- Mower is online, docked, `battery_state: Charging`. Confirm with:
  ```
  curl -s http://<server>/api/dashboard/devices \
    | jq '.[] | select(.sn=="LFIN2230700238") | .sensors | {battery_state,map_position_x,map_position_y,map_position_orientation,error_status}'
  ```

### 2. Wipe state for a clean-slate test

Skip this step if you are testing on top of an existing map you want to
preserve.

On the mower:

```
sshpass -p 'novabot' ssh root@192.168.0.244 \
  "mv /userdata/lfi/maps/home0 /userdata/lfi/maps/home0.bak.\$(date +%s); \
   mkdir -p /userdata/lfi/maps/home0/csv_file; \
   mkdir -p /userdata/lfi/maps/home0/x3_csv_file"
```

On the server (replace `<server>` with your host):

```
ssh <server> "sqlite3 /opt/novabot/novabot.db \
  \"DELETE FROM maps WHERE mower_sn = 'LFIN2230700238';\""
```

### 3. Walker setup

- Power up the walker.
- Connect to your WiFi (either AP fallback or pre-configured).
- Open `http://<walker-ip>/` in a browser.
- Set Server URL, Mower SN, Admin token. Save.

### 4. Record a small test boundary

- Stand at the dock with the walker.
- TFT: **Maps** tab → **+ Add area**.
- Walk a roughly 3x3m square around an open spot. Keep the RTK quality
  dot green; if it drops to orange or red, pause walking until it
  recovers.
- Walk back to start. Tap **Save**.
- Verify the map row in the list shows a non-zero point count and that
  Dropped is low (single digits at most).

### 5. Upload to server

- TFT main maps screen: tap **Upload**.
- Watch the title:
  - `Uploading...` while in flight.
  - `Upload OK (<bytes> B): {"stagingId":"..."}` on success.
- If you see `ERR:` instead, fix the underlying cause (token expired,
  server unreachable, mower SN wrong) and try again.

### 6. Apply on the admin page

- Open the admin page in a browser.
- **Map** tab, mower `LFIN2230700238` selected.
- The walker bundle is shown as staged. A confirm dialog summarises the
  polygon: point count, area in m², obstacles, channels.
- Click **Apply**.
- The apply-verbatim handoff runs. When it finishes the dock-anchor
  refresh modal appears.

### 7. Dock-anchor refresh

- Pick **Manual** or **Automatic** on the modal. See
  [Map Backup & Restore](map-backup-restore.md#why-the-dock-cycle-is-the-whole-game)
  for what each option does.
- Wait for `battery_state` to return to `Charging`.
- Confirm alignment:
  ```
  curl -s http://<server>/api/dashboard/devices \
    | jq '.[] | select(.sn=="LFIN2230700238") | .sensors | {map_position_x,map_position_y,map_position_orientation}'
  ```
  These values should be within roughly 10cm and a few degrees of the
  bundle's `charging_pose`. If they are not, repeat the dock cycle.

### 8. Mow test

- From the app or admin page, start a mow on the new map.
- The mower should drive the polygon you walked.
- Photograph the actual mowed area and overlay it on the walker bundle's
  polygon for the wiki. The two should agree to within roughly half a
  blade-width.

### 9. If something fails

- Check the mower's robot_decision log for error codes:
  ```
  sshpass -p 'novabot' ssh root@192.168.0.244 \
    "ls -t /userdata/ros2_log/robot_decision_*.log | head -1 \
     | xargs tail -200"
  ```
- Check the server's import endpoint response in the server log around
  the time of the upload. Look for the `[walker-import]` lines.
- If the failure looks reproducible, re-run the runbook from step 2
  (clean slate) before assuming the code is broken. Walker bundles are
  cheap to regenerate; the most common failure modes are stale local
  state, not a code bug.

## Firmware updates

The walker can update itself over the air. See
[Walker firmware updates (OTA)](walker-ota.md) for the publishing flow.
