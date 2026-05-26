# Occupancy-grid restore system (faithful map generation + single-path restore)

Status: **working, validated live 2026-05-26** on David's mower LFIN2231000633
(3 zones) - coverage planner finds a valid path, Error 125 fixed, mower mowing.

This document is the authoritative "what we built and how" for the occupancy-grid
/ bundle-restore work. For the firmware reverse-engineering details (the exact
`map_generator.cpp` algorithm) see the companion doc
`research/documents/mower-occupancy-grid-algorithm.md`.

---

## 1. Goal / problem

Cloud or CSV-only map restores produced a costmap where the dock + dock→zone
transit sat in "unknown", so `coverage_planner_server` reported **Error 125 "no
valid path"**. The stopgap was a crude free-fill raster (whole area free). The
real fix: reproduce the mower firmware's own occupancy-grid generation
server-side so a restore ships the same costmap the mower would build itself,
including the dock free-disc that makes the dock reachable.

---

## 2. The algorithm (summary; full detail in the algorithm doc)

`novabot_mapping`'s `MapGenerator::saveMap` (`save_map type:1`) was reverse-
engineered with Ghidra. Key facts:

- **Binary grid**: every pixel is `254` (free) or `0` (occupied). There is **no
  `205` unknown**. (A polygon-only restore leaving "unknown" is what broke
  coverage.)
- Resolution **0.05 m/px** (hardcoded), `border_distance` 1.0 m (20-cell pad).
- `width = 2*20 + round((xMax-xMin)/0.05)`, `height` likewise;
  `origin = [0.05*trunc(xMin/0.05) - 1.0, 0.05*trunc(yMin/0.05) - 1.0, 0]`.
- Fill order: work + unicom → free (254), obstacles → occupied (0), then a
  **3×3 ellipse dilate ×2** (re-stamping obstacles between).
- **Dock circles** (the Error-125 fix): an occupied body circle (r6 ≈ 0.30 m) at
  `pose + 0.5·(cosθ,sinθ)`, and a **free approach-disc (r16 ≈ 0.80 m)** at
  `pose + 1.2·(cos(θ+π),sin(θ+π))` - this free disc makes the dock reachable.
- PGM header: `P5\n# CREATOR: map_generator.cpp %.3f m/pix\n%d %d\n255\n`.
- **Pre-step `NovabotMapping::expandPolygon`** (ClipperLib `ClipperOffset`,
  scale ×10000, miterLimit 2.0, arcTolerance 0.25, jtRound, etClosedPolygon):
  work `+offset` (0.30), obstacles `-obstacle_offset` (0.25), unicom
  `-obstacle_offset/2`. The firmware applies these to the **recorded** boundary.

### Byte-identity status
Byte-for-byte reproduction from the **stored csv is NOT achievable** (proven):
the firmware rasterizes an in-memory, expand-offset boundary that differs from
the on-disk csv by ~1 cell at the extremes, and csv/pgm mtimes differ. Our
generator is **99.49 % pixel-identical** to the real `map.pgm` with the dock
disc reproduced - which is what matters for navigation. For final cloud/restore
boundaries the correct offset is ~0, so `DEFAULT_OFFSETS = {0,0,0}` (the
`OffsetOpts` hook remains for raw recorded boundaries). True byte-identity would
need the post-expand polygon captured live (`ros2` during `save_map type:1`).

---

## 3. Implementation - files & responsibilities

| File | Responsibility |
|------|----------------|
| `server/src/maps/occupancyGrid.ts` | Pure generator. `generateOccupancyGrid(input, offsets?) -> {whole, perMap[]}`. fillPoly (scanline), 3×3 dilate, filled circle, ClipperOffset (`clipper-lib`), grayscale PNG (`node:zlib`), per-map grids on the shared canvas. |
| `server/src/maps/clipper-lib.d.ts` | Minimal type decls for `clipper-lib`. |
| `server/src/maps/synthMowerFiles.ts` | `synthesizeMowerFiles(input)` → full mower file set: `csv_file/*` + `map_info.json`, `map_files/map.{pgm,png,yaml}` + `mapN.*`, `charging_station.yaml`. No I/O. |
| `server/src/services/portableBackup.ts` | `createBundleFromDb(sn, reason)` and `createBundleFromCsvFiles(sn, csvFiles, reason)` - build a self-contained `.novabotmap` from polygons alone (no mower), saved to the per-SN backup dir. Shared `buildAndSaveSynthBundle` helper. |
| `server/src/services/portableMap.ts` | `exportBundle` / `parseBundle` (unchanged interface; mower files now generated when absent). |
| `server/src/maps/walkerBundleImporter.ts` | `synthesizePortableFromWalker` - migrated off the old `polygonRasterizer` to `synthesizeMowerFiles`. |
| `tools/opennova-restore/cloud-to-bundle.mjs` | Standalone: fetch a mower's maps from LFI cloud (cross-account), build a `.novabotmap` via `synthesizeMowerFiles`. **Run with tsx** so the TS import + clipper-lib resolve: `cd server && npx tsx ../tools/opennova-restore/cloud-to-bundle.mjs --email <e> --password <p> --sn <SN> --out <path>`. |
| `server/src/maps/polygonRasterizer.ts` | **DELETED** (free-fill stopgap retired). |

---

## 4. Flows

### 4a. Cloud re-import (auto-bundle)
`routes/setup.ts`: after importing a mower's maps from the cloud into the DB +
writing `_latest.zip`, it calls `createBundleFromDb(sn, 'cloud-import')` so a
self-contained restorable bundle is auto-generated and saved.

### 4b. CSV-only import (admin upload)
`POST /api/admin-status/maps/:sn/portable-backups/from-csv-zip` (multipart, field
`bundle`): upload a **.zip of a `csv_file/` folder** (mapN_work.csv,
*_obstacle.csv, *_unicom.csv, map_info.json). Server parses + rasterizes +
saves a bundle. UI: "Import CSV zip..." button.

### 4c. Manual rebuild
`POST /api/admin-status/maps/:sn/portable-backups/rebuild` → `createBundleFromDb`.
UI: "Rebuild bundle (DB)" button.

### 4d. Restore - SINGLE PATH
The restore path is **apply-verbatim only** (`apply-exact` + `apply-selective`
were removed). Steps:
1. Admin: "Import bundle..." (or pick a saved snapshot) → "Restore to mower".
2. Server pushes `csv_file/` + `map_files/` (our generated raster) + `charging
   _station.yaml` verbatim via MQTT `write_map_files`. **pos.json is NOT pushed.**
3. **When the bundle ships a whole-area raster (`map.pgm`), the on-device
   `save_map type:1` + `regenerate_per_map_files` are SKIPPED** - we trust the
   server raster; coverage_planner loads `map_yaml` fresh from disk per task.
   (Fallback to on-device save_map only when a bundle has no raster.)
4. **Dock-cycle**: drive the mower ~1 m back, then redock via ArUco.

Rationale for dropping `apply-exact`: its Δ-rotation was computed against the
mower's *pre-redock* charging pose, which the dock-cycle re-derives anyway -
the source of `polygon_charging_orientation` mismatch. The map is
charger-relative; the dock-cycle re-anchors the live frame.

---

## 5. Admin endpoints + UI (routes/adminStatus.ts, routes/adminPage.ts)

- `GET/POST /maps/:sn/portable-backups` (list / manual MQTT snapshot)
- `POST /maps/:sn/portable-backups/rebuild` (DB → bundle)
- `POST /maps/:sn/portable-backups/from-csv-zip` (CSV zip → bundle)
- `GET/DELETE /maps/:sn/portable-backups/:filename`
- `POST /maps/:sn/portable-backups/:filename/restore` (stage → apply-verbatim)
- `POST /maps/:sn/import-portable/:stagingId/apply-verbatim` (single restore)
- UI buttons (Portable Map Bundle panel): Export bundle, Import bundle...,
  Snapshot now, **Rebuild bundle (DB)**, **Import CSV zip...**, Refresh; restore
  shows a single **"Restore to mower"** button.

Note: the admin page is **server-rendered** (`adminPage.ts`). After an image
update, browsers may cache the old HTML → **hard-refresh (Cmd/Ctrl+Shift+R)**.

---

## 6. Validation

- Fixtures: `server/src/__tests__/fixtures/occupancy/LFIN1231000211/` (+ x3_csv_file).
  Byte-identity test (`occupancyGrid.test.ts`) is **`describe.skip`** with the
  reason documented (unreachable from stored csv).
- `synthMowerFiles.test.ts` covers the file-set synthesis. Full suite: 416 pass.
- **Live**: David's LFIN2231000633 bundle regenerated with the faithful
  generator (3 zones, 12 obstacles), restored verbatim, dock-cycled, **mowing OK**.

---

## 7. Operational notes / gotchas

- **release.sh + buildx**: `docker buildx build --push` (multiplatform) pushes to
  the registry but does **not** load the image into the local Docker store, so
  `docker compose up -d` would reuse a stale local image. Fixed in `release.sh`
  (commit 665fec5d): it now `docker pull`s the pushed tag before restarting.
  Diagnose stale local image: `docker image inspect rvbcrs/opennova:latest
  --format '{{.Created}}'`.
- **pos.json behavior**: on David's mower the ArUco dock did **NOT** rewrite
  `/userdata/pos.json` (it stayed at the original mapping anchor, 2026-05-11) and
  did not change `charging_station.yaml` (= our restored cloud pose, written at
  restore time). `pos.json` is the **fixed UTM anchor of the charger**; it only
  changes on (re)provisioning/mapping, not on every dock. The frame was still
  valid because the charger is in the same physical spot + RTK localized at 2 cm
  on the correct map. The earlier assumption "the dock-cycle rewrites heading +
  charger pos to disk" is NOT literally true for stock firmware's pos.json.
- **Accessing David's mower** (owner-consented support):
  - Jump host is a **restricted `screen`-based SSH shell** ("nur 'ssh <ziel>'
    erlaubt") on `l-it.at:443` (user `support`, pw `pleaseHelpMe!`). It needs a
    real PTY (`ssh -tt`, `TERM=xterm-256color`) and only accepts bare
    `ssh <target>` (no flags). Drive it with `expect`:
    jump (pw) → `ssh root@lfin2231000633` → pw `novabot` → run read-only cmds.
    Direct `-W`/ProxyCommand forwarding is "administratively prohibited".
  - Mower: `root@lfin2231000633` pw `novabot`. RPi server: `pi@rpi4-server` pw
    `opennova`.
- **Cloud cross-account (IDOR)**: one LFI cloud account token can query ANY SN
  (`queryEquipmentMap`). Used `cloud-to-bundle.mjs` with Ramon's creds to fetch
  David's maps (owner-consented).

---

## 8. Open items / next steps

- `tools/opennova-restore/db-map-to-bundle.mjs` still has the old embedded
  free-fill rasterizer - migrate it to `synthesizeMowerFiles` like
  `cloud-to-bundle.mjs` if it's still used.
- The description/guard text fixes (commits b07115d5) and the single-path UI ship
  in v2026.0526.1140's source but a **re-release** is needed for the corrected
  panel-header copy to reach images (cosmetic).
- `start_navigation`'s costmap caching is unverified - coverage loads `map_yaml`
  per task (confirmed), but if point-to-point nav caches a running map_server, a
  raster-only restore might need a light reload nudge. Watch on the next restore.
- True byte-identity (if ever needed) requires capturing the post-`expandPolygon`
  polygon live via `ros2` during `save_map type:1`.

---

## 9. Key commits (branch `codex/walker-hda-rate-fix`, off master @ 4c5f75c3)

- `e6245bc4` docs: RE of save_map type:1 occupancy-grid algorithm
- `851f930e` occupancyGrid.ts faithful generator + ClipperLib pre-step finding
- `f0fedd8e` port expandPolygon (clipper-lib) + prove byte-identity limit
- `4c5f75c3` self-contained bundle generation engine + wiring (on master)
- `9dc4baed` single restore path - verbatim only, no on-device save_map
- `1b441d61` cloud-to-bundle uses faithful generator (David's bundle)
- `b07115d5` correct stale UI/guard text for single-path restore
- `665fec5d` release.sh pulls pushed image before restart
- Released image: `rvbcrs/opennova:2026.0526.1140`
