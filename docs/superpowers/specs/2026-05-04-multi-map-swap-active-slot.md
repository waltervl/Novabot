# Multi-Map Support via Active-Slot Swap

**Date:** 2026-05-04
**Status:** Spec — pending implementation plan

## Problem

The mower's stock firmware enum for `start_navigation.area` only supports
three magic values: `1` (map0), `10` (map1), `200` (map2). Any work map
beyond the third slot is unreachable from the app/dashboard — selecting
"map3" or higher silently dispatches the wrong polygon (or does nothing
at all).

This is not a true firmware limit. The actual mowing is driven by
whatever `home0/map.yaml` + `home0/map.pgm` are loaded into the nav
stack at the moment `StartCoverageTask` fires. The firmware writes
per-slot files (`mapN.yaml`, `mapN.pgm`, `mapN.png`) during BLE
mapping but only ever loads `map.yaml` itself. The 1/10/200 enum is
mostly cosmetic — it sets `request_map_ids` in telemetry but does not
gate which polygon gets mowed.

The `area` enum is therefore a stock-app convention, not a firmware
constraint. Once we control the swap-to-`map.yaml` step on the mower
we can support an arbitrary number of work maps without touching
`mqtt_node`, `robot_decision`, or `coverage_planner`.

## Goal

Add a `swap_active_map` extended-command handler on the mower plus a
matching server endpoint that the app/dashboard call before any
`start_navigation` whose target slot ≠ the currently-loaded slot. The
handler copies `mapN.{yaml,pgm,png}` over `map.{yaml,pgm,png}` and
issues a `LoadMap` ROS service call so the nav stack picks up the new
grid. After the swap, `start_navigation` runs with `area: 0` and the
mower mowes whatever `map.yaml` now points at.

## Non-Goals

- **No synthetic yaml/pgm generation.** A slot is "swappable" only when
  the mower physically mapped it (so `mapN.yaml` + `mapN.pgm` exist on
  disk). Polygon-only uploads from the app — where the user pushes a
  CSV without ever having walked the perimeter on the mower — are
  out-of-scope and continue to fail with "map N never physically
  mapped on this mower". A separate flow can add synthetic-grid
  fallback later.
- **No firmware patches.** No edits to the closed `mqtt_node`,
  `robot_decision`, or `coverage_planner` binaries. The swap operates
  purely on disk + a public ROS service (`/map_server/load_map`).
- **No `area` enum extension.** We deliberately stop relying on the
  `area` enum to identify the slot — the active slot is server-side
  state and reflected back in telemetry via a new `active_map_slot`
  cache key.
- **No mid-mow swaps.** The mower handler refuses a swap when coverage
  is active. The user must stop the running task first.

## Architecture

```
app / dashboard
  │
  │ POST /api/dashboard/maps/<sn>/active-slot { slot: N }
  ▼
server
  │  ├─ idempotency check: deviceCache[sn].active_map_slot === N → 200 cached
  │  └─ publishToExtended(sn, { swap_active_map: { slot: N } })
  │       │   await swap_active_map_respond (15s timeout)
  │       ▼
  │  mower extended_commands.py
  │    │  guards:
  │    │    slot < 0                 → result:1
  │    │    mapN.yaml or .pgm absent → result:2
  │    │    coverage active          → result:3
  │    │  steps:
  │    │    cp mapN.yaml → map.yaml.tmp; rename(map.yaml.tmp, map.yaml)
  │    │    cp mapN.pgm  → map.pgm.tmp;  rename(map.pgm.tmp,  map.pgm)
  │    │    cp mapN.png  → map.png.tmp;  rename(map.png.tmp,  map.png)
  │    │    ros2 service call /map_server/load_map nav2_msgs/srv/LoadMap
  │    │      "{map_url: '/userdata/lfi/maps/home0/map.yaml'}"
  │    │  LoadMap rc != 0           → result:4
  │    └─ respond { result: 0, slot: N }
  │
  ▼ on success:
  deviceCache[sn].active_map_slot = String(N)
  forwardToDashboard(sn, { active_map_slot: N })
  res.json({ ok: true, slot: N })

app / dashboard
  │
  │ POST /api/dashboard/command/<sn>
  │   body { command: { start_navigation: { area: 0, cutterhigh, cmd_num } } }
  ▼
mqtt → mower → mowes whatever map.yaml currently points at
```

### Components

**Mower handler — `research/extended_commands.py`**

- New `handle_swap_active_map(params, respond)` registered in `COMMANDS`
  dict.
- Inputs: `slot` (int, required, ≥0).
- Reads `/userdata/lfi/maps/home0/map<slot>.{yaml,pgm,png}` and
  rewrites `/userdata/lfi/maps/home0/map.{yaml,pgm,png}` via
  `shutil.copy2 → os.replace` for atomicity.
- Calls `/map_server/load_map` via the existing ROS launch env (same
  pattern as `_restart_novabot_mapping`).
- Returns `swap_active_map_respond` with one of these results:

| `result` | meaning |
|----------|---------|
| 0 | success — `slot` field echoes the active slot |
| 1 | bad request (negative or missing slot) or copy failure |
| 2 | requested slot was never mapped on this mower (file missing) |
| 3 | coverage is active — refuse to swap mid-task |
| 4 | files copied but `LoadMap` ROS call failed |

The handler is independent of `mqtt_node` (uses `extended_commands.py`
own MQTT client). It does NOT touch `auto_recharge_server` or
`charging_station.yaml`.

**Server endpoint — `server/src/routes/dashboard.ts`**

`POST /api/dashboard/maps/:sn/active-slot` body `{ slot: number }`:

- Validation: integer, ≥0, mower online, mower not in demo mode.
- Idempotency: if `deviceCache[sn].active_map_slot === String(slot)`
  reply `{ ok: true, slot, cached: true }` immediately.
- Otherwise publish `{swap_active_map: {slot}}` via
  `publishToExtended` and await `swap_active_map_respond` with a
  15-second timeout (copy + LoadMap takes 5–10 s in practice).
- On `result === 0`: cache the slot, broadcast it through
  `forwardToDashboard` so the active map UI updates live.
- Translate mower error codes:

| mower `result` | HTTP status | body |
|----------------|-------------|------|
| 0 | 200 | `{ok:true, slot}` |
| 1 / copy fail | 400 | `{ok:false, error}` |
| 2 / not mapped | 400 | `{ok:false, error: 'map N never physically mapped on this mower — map it from the app first'}` |
| 3 / coverage active | 409 | `{ok:false, error: 'coverage active — stop mowing first'}` |
| 4 / LoadMap failed | 500 | `{ok:false, error, respond}` |
| timeout | 504 | `{ok:false, error: 'mower did not ack within 15s'}` |

**App side — `StartMowSheet.tsx`, `MowQueueContext.tsx`, schedule runner**

Before any `start_navigation`/`start_run` dispatch:

1. Compute `slot = parseInt(canonicalName.match(/^map(\d+)/)?.[1] ?? '')`.
2. If `slot != null` AND `slot !== currentActiveSlot` (read from
   `mower.sensors.active_map_slot`), call
   `api.setActiveMapSlot(sn, slot)`. Treat 200/cached as success.
3. On 4xx/5xx surface a Toast / inline error and abort the mow.
4. Send the start command with `area: 0` (the enum is now meaningless
   because the loaded `map.yaml` IS the requested map).

`MowQueueContext` performs the swap before each per-map dispatch in
the queue.

`server/src/services/scheduleRunner.ts`'s `triggerSchedule` calls the
swap server-side via the same code path before invoking `startMowing`.

### Telemetry

A new synthetic sensor key `active_map_slot` is written to
`deviceCache` on every successful swap. It feeds:

- `report_state_robot` snapshots forwarded over Socket.io for the
  dashboard's "active map" badge.
- App `MowerState` so HomeScreen can display the active polygon
  unambiguously instead of decoding the firmware's
  `current_map_ids` enum.

The firmware's `current_map_ids` field stays untouched (still
reflects whatever the mower itself reports — typically 1 / 10 / 100
post-swap).

## Tests

**Server** — `server/src/__tests__/routes/dashboardActiveSlot.test.ts`:

- POST happy path → 200 + `cache.active_map_slot === '3'` after mock
  ack with `result: 0`.
- Idempotent retry → 200 with `cached:true`, no second `publishToExtended`.
- `slot: -1` / missing → 400 before any MQTT.
- Mower offline → 404.
- Mower returns `result: 2` → 400 with the human-readable error.
- Mower returns `result: 3` → 409.
- 15-second timeout → 504.

**Mower handler** — covered by acceptance test (Python ROS env makes
unit-testing `subprocess.run('ros2 service call …')` brittle and
low-value).

**Acceptance** — live mower runbook:

1. Map a 2nd work area via the Novabot app on a mower that already
   has map0.
2. Verify `/userdata/lfi/maps/home0/map1.yaml` and `map1.pgm` exist.
3. `POST /api/dashboard/maps/<sn>/active-slot {slot: 1}` → expect 200,
   followed by `swap_active_map_respond {result: 0}` in
   `extended_commands.log` and a `LoadMap` line in `map_server.log`.
4. `POST /api/dashboard/command/<sn>
    {command:{start_navigation:{area: 0, cutterhigh: 2, cmd_num: <ts>}}}`
   → mower drives the 2nd polygon.
5. Repeat with `slot: 0` to verify swap-back.

## Failure Modes

| Failure | Behaviour |
|---|---|
| Slot file missing on mower | 400, error names the missing slot, app surfaces "map N never physically mapped — map it via the app first". |
| Coverage active during swap | 409, app surfaces "stop mowing first". No file changes. |
| Disk-write failure (read-only fs, low storage) | 400 with copy error, no partial state because copies use `.tmp + os.replace`. |
| `LoadMap` ROS call fails | 500 with stderr tail. `map.yaml` is already the requested slot (so a manual reload would still work) — the user can retry. |
| Mower offline before swap | 404. |
| Mower disconnects mid-swap | 504. Server cache NOT updated, so next attempt retries. |
| Server restart wipes `deviceCache` | Idempotency is lost (we'll always swap on first request after restart) — acceptable: swap is fast when files unchanged. |

## Anti-Patterns

- **Don't synthesize yaml/pgm server-side.** Wrong origin or
  resolution sends the mower to the wrong physical spot. If the slot
  is missing on the mower, fail loud.
- **Don't swap during active coverage.** Reloading `map.yaml`
  mid-task corrupts the nav state and triggers Error 140-class
  crashes. The mower handler refuses; the app must respect the 409.
- **Don't extend the `area` enum.** Pretending area=10000 means
  "slot 4" couples us to a firmware behaviour we never validated. The
  swap renders the enum irrelevant — keep `area: 0` and own the slot
  state server-side.
- **Don't skip the LoadMap call.** Just rewriting the files isn't
  enough — the running `map_server` keeps serving the previously
  loaded grid until reload.
- **Don't trust the server cache as ground truth.** The cache speeds up
  idempotency but a manual rollback (mower SSH `cp`, a `sync_map` from
  the admin panel, a reboot) can desync it. The cache is a hint,
  not authority — when in doubt the user can force a fresh swap by
  explicitly re-selecting the map. A future enhancement can read the
  active slot back from a marker file (e.g. `home0/.active_slot`)
  the handler writes after a successful copy.

## Operator Runbook

1. App / dashboard: pick the work map you want to mow.
2. App calls `setActiveMapSlot(sn, slot)` if the cached
   `active_map_slot` differs.
3. Server publishes `swap_active_map`; mower copies files + reloads
   `map_server`.
4. App sends `start_navigation` with `area: 0`. Mower mowes the just-
   swapped map.
5. To switch maps without stopping the queue: ensure the previous mow
   reaches `Work:FINISHED` first (handler's coverage-active guard
   blocks otherwise).
