# Object-Detection Cadence During Mowing — as-built reference

> **Status:** Implemented + LIVE-CONFIRMED on `LFIN1231000211` (.100), 2026-06-15:
> at level 3 the cadence flipped detection/segmentation every ~3s and the mower
> dodged a box thrown into its path. Server side in `v2026.0615.1004` (.247). Two
> subprocess pitfalls were found and fixed during that test (see §5 and §6).
> Authoritative
> as-built doc; supersedes scattered notes. See also the design spec
> `docs/superpowers/specs/2026-06-13-object-detection-cadence-design.md`, the plan
> `docs/superpowers/plans/2026-06-13-object-detection-cadence.md`, and the
> reverse-engineering evidence `research/documents/obstacle-avoidance-perception-analysis.md`.

**One line:** during a normal coverage mow the mower runs *segmentation only*
(stay-on-lawn) and is blind to loose, un-mapped objects (a toy, a shoe). The
cadence periodically interleaves a short *object-detection* pass into that
segmentation stream — from **our** code, via the stock `/perception/set_infer_model`
service — so the mower sees and avoids loose objects without giving up the lawn
boundary and without touching any closed LFI binary. This is the fix for **issue #93**.

---

## 1. The problem (why seg-only is blind to objects)

Proven by RE (`obstacle-avoidance-perception-analysis.md`):

- The mower's `perception_node` runs **one inference model per frame** (single
  Horizon X3 BPU). Running detection + segmentation in the same frame was the
  historical "dual-model BUG" — deliberately removed in perception v0.3.0
  (`infer_mode:3` = "unsupport"). **We must never run two inferences per frame.**
- During a real coverage mow the perception is **segmentation** (lawn / non-lawn /
  road classification → keeps the mower on the lawn). Segmentation does **not**
  emit object-detection points, so a loose toy on the lawn is never marked and
  the mower drives over it.
- The app's `obstacle_avoidance_sensitivity` historically just picked a static
  perception mode and, during coverage, was effectively **dropped** for model
  selection (`coverStartDeal` → no-arg `setPerceptionLevel()` only yields seg/off,
  never detection). So the setting did nothing useful — this is what #93 reports.

**Key levers that make the fix possible (all stock, no patch):**

- `PerceptionNode::set_infer_model` (ROS service `/perception/set_infer_model`,
  `general_msgs/srv/SetUint8`) is a **free runtime flag-flip** — both models are
  already resident; switching is `id 1 = segmentation`, `id 2 = detection`. No
  model load/unload, no BPU reinit.
- nav2's `ObstacleLayer` treats the per-point `label` as a **boolean** — ANY
  nonzero-label point becomes lethal cost. A detection-mode point therefore
  stops the mower with no costmap change.
- The costmap uses **hit-count accumulation** (marks persist across frames), so
  an object seen during a brief detection window stays marked between passes.

## 2. The mechanism

While the mower is actively mowing and the level is > 1, a background thread in
`extended_commands.py` cycles:

```
set_infer_model(2)  ── hold window D (~0.6s) ──▶  set_infer_model(1)  ── idle (period − D) ──▶  repeat
   detection                                          segmentation
```

A detection pass marks any object (lethal cell, persisted by hit-count); between
passes segmentation resumes so the mower stays on the lawn. Single BPU is
respected — only one model is ever active at a time.

## 3. Levels, timing, and the repurposed setting

The existing app setting **`obstacle_avoidance_sensitivity` (1/2/3)** now drives
the detection **cadence** (its old "static mode pick" meaning is gone):

| Level | Cadence | Default period | App label (EN) |
|-------|---------|----------------|----------------|
| 1 | **Off** — segmentation only (no detection passes; max coverage, blind to loose objects) | — | "Off (terrain only)" / value 1 |
| 2 | **Occasional** — one detection window every ~6 s | `OPENNOVA_OBSTACLE_DETECT_OCCASIONAL_S` (6.0) | "Avoid objects" / value 2 |
| 3 | **Frequent** — one detection window every ~3 s (best avoidance) | `OPENNOVA_OBSTACLE_DETECT_FREQUENT_S` (3.0) | "Avoid objects (frequent)" / value 3 |

- Detection window length `D`: `OPENNOVA_OBSTACLE_DETECT_WINDOW_S` (default 0.6 s,
  min 0.3) — long enough for a few BPU detection frames to publish.
- Idle poll when off/not-mowing: `OPENNOVA_OBSTACLE_DETECT_IDLE_POLL_S` (5.0 s).
- All four are env-tunable (`research/extended_commands.py`, `obstacle_detect_*`
  functions ~L700–730) so timing can be tuned live without a rebuild.

> Note the semantic flip vs the old `obstacle_avoidance_sensitivity`: historically
> "High" meant segmentation-heavy → *less* object detection (the #93 trap). Now
> level **3 ("frequent")** means the **most** object detection. The app labels
> ([MowerSettingsScreen.tsx](../../app/src/screens/MowerSettingsScreen.tsx) `SENSITIVITY_LEVELS`)
> reflect the new, honest meaning.

## 4. End-to-end wiring (app → server → mower)

```
App (Mower settings)
  pick "Avoid objects (frequent)" = 3
  └─ set_para_info { obstacle_avoidance_sensitivity: 3 }   (api.sendCommand)
        │  app/src/screens/MowerSettingsScreen.tsx (SENSITIVITY_LEVELS, save ~L283)
        ▼
OpenNova server (.247)
  on set_para_info with obstacle_avoidance_sensitivity  →  republishObstacleDetection(sn)
        │  server/src/routes/dashboard.ts ~L2827
        │  server/src/mqtt/mapSync.ts republishObstacleDetection() ~L590
        │  level = selectObstacleDetectionLevel(deviceSettings)  (server/src/services/obstacleDetectionCadence.ts,
        │           key = obstacle_avoidance_sensitivity)
        └─ publishToExtended(sn, { set_obstacle_detection: { level } })
              (also re-pushed on mow start / onMowerConnected — mapSync.ts ~L762)
        ▼
Mower extended_commands.py (.100, /root/novabot/scripts/extended_commands.py)
  handle_set_obstacle_detection → _obstacle_detection_level = level
        → persist to /tmp/obstacle_detection_level
  start_obstacle_detection_cadence() thread → flips /perception/set_infer_model 2↔1
        ▼
  perception_node → /perception/points_labeled → nav2 ObstacleLayer (hit-count) → mower avoids object
```

The level is pushed **immediately on Save** (the `set_para_info` path), and again
on mow start / mower (re)connect. So changing the app setting takes effect at once.

## 5. The mower cadence thread (as-built)

`start_obstacle_detection_cadence()` (`extended_commands.py` ~L4182) launches a
daemon thread that, each iteration:

1. reads `level` (from `_obstacle_detection_level`) and `period = obstacle_detect_period(level)` (None when level ≤ 1),
2. checks `_cadence_coverage_active()` (§6),
3. `running = active and period is not None`,
4. logs **only on state change** (`ACTIVE cadence` / `idle`, with level + reason),
5. if not running → sleep idle-poll and loop,
6. if running → `set_infer_model(2)` (detection) → `sleep(D)` → `set_infer_model(1)` (segmentation) → `sleep(period − D)`.

It is **observable by design**: every gate transition and every model flip is
logged (`[obstacle-detect] …`). The prior version was silent, so a non-firing
cadence was invisible — that is why earlier testing looked like "nothing happened."

The model flip goes through a **persistent rclpy `SetUint8` client** on
`/perception/set_infer_model` — `start_perception_model_client()` adds the client
node to the shared executor the blade/RTK relays already spin, and
`_set_infer_model_fast()` does `call_async` + a short future poll. It does NOT
shell out per flip.

**PITFALL (fixed 2026-06-15):** the first build flipped via `ros2 service call`
(`ros2_run`, a subprocess that sources the ROS env + starts the `ros2` CLI). Under
mow-time CPU load that measured **~13s per call** (env-source ~5s + CLI discovery
~8s) and blew the 10s timeout EVERY time, so the cadence armed but never actually
switched models (`set_infer_model(2) FAILED … timed out after 10 seconds`). The
persistent client makes each switch milliseconds; `_set_model()` only falls back to
the subprocess if the client never came up. Do NOT turn the flip back into a
per-call subprocess.

**Perception model IDs** (`handle_set_perception_mode`, ~L739): `1 = segmentation`
(default / stay-on-lawn), `2 = detection`, `3 = seg_high`, `4 = seg_low`. The
cadence only uses 1 ↔ 2.

## 6. The work-status gate (the fix that made it actually fire)

`_cadence_coverage_active()` (`extended_commands.py` ~L4150) decides whether the
mower is in an active coverage state **right now**:

- It reads the **latest `Work:<state>` line** from the **tail** of the newest
  `/root/novabot/data/ros2_log/robot_decision_*.log` (a direct Python seek + read
  of the last ~200 KB via `_newest_robot_decision_log()`), the same `Mode:… Work:…`
  string the server sees over MQTT.
- Requires a **fresh** line (`< 60 s`), so a stale `COVERING` left after a crash
  or idle does **not** keep the cadence running.
- Active states (`_CADENCE_ACTIVE_WORK`): `RUNNING`, `COVERING`, `NAVIGATING`,
  `BOUNDARY_COVERING`, `AVOIDING`, `MOVING`. `FINISHED` / `CANCELLED` (and
  `PAUSED` / `USER_STOP`, which aren't in the set) are **not** active. Mirrors the
  dashboard's `coverageSessionActive`.

**Why this matters (two bugs, both fixed):** (1) the first implementation gated on a
**blade-current proxy** (`cut_motor_current_ma > 200`) that read ~3.7 mA when idle
and never armed, replaced by the work-status line. (2) The work-status read then
used a `bash -lc "grep … $(ls -t …) | tail -1"` subprocess; the login shell sources
the ROS env (~5s), which under mow load blew the gate's 5s timeout EVERY poll
(`idle … err: … timed out after 5 seconds`), so it STILL never armed. Replaced by
the direct Python tail read (~11ms). **Do not gate on blade current, and do not read
the log via a shell subprocess.**

## 7. Level persistence across respawns

`_obstacle_detection_level` is persisted to **`/tmp/obstacle_detection_level`**
(`_persist_…` / `_load_…`, ~L784). The cadence thread loads it on start. Reason:
the server only re-pushes the level on a **fresh MQTT (re)connect**
(`onMowerConnected`), NOT on a bare `extended_commands.py` respawn — without the
file, the level silently reset to 1 (off) after any respawn mid-session. A reboot
clears `/tmp`, but the server's reconnect re-push covers that case.

## 8. Safety / guards / open items

- Active **only** during active autonomous mowing (the work-status gate); never
  during localization-recover or out-of-map states.
- Every detection window always returns to segmentation (id 1), so stay-on-lawn
  resumes; `D` is kept short to bound any window without segmentation.
- **Night (open):** stock firmware forces detection at night. The cadence may
  briefly restore segmentation during a night mow. Validate live; add a night
  guard if it fights the stock override.
- Tuning of `D` / `T2` / `T3` is live-tunable via the env vars above.

## 9. Deployment

- Source of truth: `research/extended_commands.py`. Ships in the firmware via
  `research/build_custom_firmware.sh` (copies to `/root/novabot/scripts/extended_commands.py`).
- On-mower path: `/root/novabot/scripts/extended_commands.py`, launched as a
  background `python3` process with the ROS env (galactic + novabot install,
  `RMW_IMPLEMENTATION=rmw_cyclonedds_cpp`, `ROS_LOCALHOST_ONLY=1`).
- **Restart to load a new version** (single instance — avoid the double-spawn /
  duplicate MQTT client_id issue): `pkill -f scripts/extended_commands.py`, then
  relaunch with that ROS env, redirecting to the boot's
  `novabot_log/.../extended_commands.log`.
- Server side (`republishObstacleDetection`, `obstacleDetectionCadence.ts`,
  `dashboard.ts` trigger) is in `v2026.0615.1004` on `.247`.
- A pre-change backup was left on the mower: `extended_commands.py.bak-pre-obstaclepunch`.

## 10. How to test

1. App → Mower settings → **"Avoid objects (frequent)"** (level 3) → **Save**.
   Expect on the mower: `[obstacle-detect] cadence level set to 3`.
2. **Start a mow.** When `Work:` is a fresh active state, expect
   `[obstacle-detect] ACTIVE cadence (level=3, work=COVERING)` and then alternating
   `set_infer_model(2) ok (detection)` / `set_infer_model(1) ok (segmentation)`.
3. Place a test object in the path: at level 2/3 a lethal cell should appear and
   the mower routes around it; at level 1 (off) it is the run-over baseline.
4. Watch live: tail `/root/novabot/novabot_log/<boot>/extended_commands.log`.

## 11. What this does NOT fix (scope)

- **Mapped obstacles** (obstacle polygons drawn in the app) are a **separate**
  mechanism — they must be *occupied in the per-zone `mapN.pgm`* the coverage
  planner reads. That is the `regenerate_per_map_files` obstacle-punch fix, not
  the cadence. See `per-map-pgm-coverage-bug.md` and the obstacle-punch in
  `handle_regenerate_per_map_files`. The cadence is for **loose, un-mapped**
  objects only.
- NOT true per-frame det+seg fusion (re-triggers the BPU bug; no source/patch).
- NOT a costmap/nav2 change, NOT per-class behaviour.

## 12. References

- Design: `docs/superpowers/specs/2026-06-13-object-detection-cadence-design.md`
- Plan: `docs/superpowers/plans/2026-06-13-object-detection-cadence.md`
- RE evidence: `research/documents/obstacle-avoidance-perception-analysis.md`
- Auto-memory: `obstacle-avoidance-perception.md`
- GitHub: issue **#93** (Robot go through obstacle)
- Code: `research/extended_commands.py` (`obstacle_detect_*`, `handle_set_obstacle_detection`,
  `start_obstacle_detection_cadence`, `_cadence_coverage_active`, `handle_set_perception_mode`);
  `server/src/mqtt/mapSync.ts` (`republishObstacleDetection`);
  `server/src/services/obstacleDetectionCadence.ts`; `server/src/routes/dashboard.ts` (~L2827);
  `app/src/screens/MowerSettingsScreen.tsx` (`SENSITIVITY_LEVELS`).
