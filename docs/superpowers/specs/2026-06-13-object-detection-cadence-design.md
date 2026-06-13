# Object-Detection Cadence During Mowing - Design

**Date:** 2026-06-13
**Status:** Approved design (brainstorm complete), pending spec review → implementation plan.

**Goal:** Make the Novabot mower actually see and avoid loose, un-mapped objects (e.g. a toy on the lawn) during a normal coverage mow, WITHOUT giving up the terrain "stay-on-lawn" segmentation, and WITHOUT touching any closed LFI binary.

**Approach (one line):** Periodically interleave a short object-DETECTION pass into the otherwise segmentation-only perception during mowing, driven from our own code via the existing `/perception/set_infer_model` service; the hit-count costmap keeps detected objects marked between passes. The existing app setting `obstacle_avoidance_sensitivity` (3 levels) is repurposed to control the detection cadence.

---

## 1. Background / why this shape (proven by RE)

Full reverse-engineering evidence: `research/documents/obstacle-avoidance-perception-analysis.md` and the workflow synthesis (2026-06-13). Key proven facts this design relies on:

- The mower's perception runs **one inference model per frame** (single Horizon X3 BPU). Running BOTH detection + segmentation per frame is the historical dual-model bug (`perception_node` v0.2.2 "双模型存在BUG,单模型切换"), deliberately removed in v0.3.0 (`infer_mode:3` = "unsupport"). **We must never run two inferences in one frame.**
- `PerceptionNode::set_infer_model` (@0x78598) is a **free runtime flag-flip** (`str w3,[x19,#0x554]` + logging; no model load/release). Both models are already resident from the ctor. id **2 = LF_ONLY_DO_DETECTION**, id **1 = LF_ONLY_DO_SEGMENTATION_DEFAULT** (proven via the mode log-strings).
- The downstream nav2 `ObstacleLayer` consuming `/perception/points_labeled` treats the per-point `label` byte as a **boolean** (`only_obstacle_label:False`, `cbnz` @0x18e8e0): ANY nonzero-label point becomes lethal cost. So a detection-mode point WILL stop the mower; no costmap change is needed.
- The costmap uses **hit-count accumulation** (`hit_count_mode:True`, `updateWithMaxByCount`): marks build up and persist across frames, so an object seen during an occasional detection pass stays marked between passes.
- The app's `obstacle_avoidance_sensitivity` → `StartCoverageTask.perception_level` is currently **dropped** for model selection during a real coverage mow (`coverStartDeal` calls the no-arg `setPerceptionLevel()` which only yields seg/off, never detection). So the setting does nothing useful today - this design gives it a real function.

**No source available:** `perception_node` (and `nano_det`/`seg_perception`/`lf_fusion`) ship as closed LFI C++ binaries; no source, no hbDNN SDK in our tree; `build_custom_firmware.sh` does not compile any LFI node. Therefore the fix lives entirely in **our** layers (OpenNova server + `extended_commands.py`) using the existing ROS service - no binary patch, no recompile of LFI code.

## 2. Non-goals

- NOT true per-frame det+seg fusion (rejected: needs a binary patch / no source, and re-triggers the BPU bug).
- NOT a costmap/nav2 change (the costmap is already object-agnostic and capable).
- NOT per-class behaviour (stop only for person/rock, ignore X) - the costmap is label-boolean today; out of scope.
- NOT changing the stock night-forced-detection or localization-recover behaviours.

## 3. Cadence mapping

`obstacle_avoidance_sensitivity` (existing 1/2/3) maps to detection cadence during mowing:

| Level | Behaviour | Final label (EN) | Final label (NL) |
|---|---|---|---|
| 1 | **Off** - segmentation only, no detection passes (max coverage, no loose-object detection) | "Off (terrain only)" | "Uit (alleen terrein)" |
| 2 | **Occasional** - one detection window every ~T2 s | "Avoid objects" | "Objecten ontwijken" |
| 3 | **Frequent** - one detection window every ~T3 s (T3 < T2) | "Avoid objects (frequent)" | "Objecten ontwijken (vaak)" |

Conservative starting defaults (tuned live in §6):
- Detection window length `D` ≈ 0.6 s (long enough for ≥ a few BPU detection frames to run and publish).
- Level 2 period `T2` ≈ 6 s (≈10% detection duty).
- Level 3 period `T3` ≈ 3 s (≈20% detection duty).

Direction confirmed: level 1 = detection OFF, level 3 = most frequent.

## 4. Architecture & data flow

```
App / Dashboard
  └─ set_para_info { obstacle_avoidance_sensitivity: 1|2|3 }  ──▶  OpenNova server
        server (source of truth; already receives set_para_info)
          └─ NEW extended command:  set_obstacle_detection { level: 1|2|3 }  ──▶  extended_commands.py (mower)
                cadence timer (ROS):
                   if mowing && level>1:  set_infer_model(2)  ──[window D]──▶  set_infer_model(1)  (repeat every T_level)
                        │
                        ▼
                   perception_node publishes detection points → /perception/points_labeled
                        → nav2 ObstacleLayer (hit-count) → mower avoids the object
```

Everything new is in **our** code: TypeScript server + Python `extended_commands.py` (ships via `build_custom_firmware.sh`). No LFI binary touched.

## 5. Components

### 5.1 Server (TypeScript)
- The server already processes `set_para_info` and re-pushes para (`server/src/mqtt/paraRepush.ts`, field `obstacle_avoidance_sensitivity`). 
- Add: when `obstacle_avoidance_sensitivity` is set/changed, AND on mower (re)connect (`onMowerConnected` in `mapSync.ts`), the server sends the mower a new extended command `set_obstacle_detection { level }`. This reuses the existing server→mower extended-command channel (the same path that sends `start_edge_cut`).
- The level value already lives in the DB / sensor cache; no new storage needed.

### 5.2 `extended_commands.py` (mower, Python - ships via build script)
- New handler `set_obstacle_detection`: stores the requested `level` (default 1/off until told otherwise).
- A ROS timer implementing the cadence state machine:
  - Guard: only act when the mower is in active autonomous mowing (work status RUNNING/COVERING/NAVIGATING) AND `level > 1`. Otherwise do nothing (leave stock perception alone).
  - Cycle: call `/perception/set_infer_model` with id **2** (detection) → hold for window `D` → call with id **1** (segmentation) → idle until next period `T_level`.
  - Uses a `general_msgs/srv/SetUint8` client on `/perception/set_infer_model` (the service `extended_commands` can reach in the ROS graph; verify `ROS_LOCALHOST_ONLY` handling like other nodes).
- Must respect the existing send-lock discipline in `extended_commands.py` (see `extended-commands-socket-lock.md`) - service calls go through the established locking, no raw concurrent publishes.

### 5.3 App + Dashboard (labels)
- Finalize the labels per §3 (replaces the held-back "Stay on lawn" change). Files: `app/src/screens/MowerSettingsScreen.tsx` (`SENSITIVITY_LEVELS`), `dashboard/src/pages/SettingsPage.tsx` fallbacks, `dashboard/src/i18n/locales/{en,nl}.json` `settings.mower.sensitivity.*` (+ de/fr follow-up).
- The setting now genuinely controls behaviour, so the labels are honest.

## 6. Live tuning + validation (on `LFIN1231000211`)

Non-destructive checks before declaring done; set conservative defaults first, then tune:
1. Confirm `/perception/set_infer_model` switches mid-mission (a detection log line / behaviour change).
2. Confirm a detection mark **persists** in `/local_costmap/costmap` between detection passes (this sets `T2`/`T3` - the period must be shorter than the costmap's clear/decay of a static mark).
3. Confirm rapid toggling is stable (no node crash, no perception stall).
4. Confirm the mower does NOT drift off the lawn during a detection window `D` (coverage follows the planned path on the saved map; a short `D` should be safe - verify).
5. Place a test object in the coverage area at level 2/3 and confirm a lethal cell appears and the mower avoids it; confirm level 1 = no detection (object run over) as the off-baseline.

## 7. Trigger & guard conditions (safety)

- Active ONLY during normal autonomous mowing; never during localization-recover (stock level 5) or out-of-map (stock level 3) states.
- After each detection window, always return to segmentation (id 1) so stay-on-lawn resumes.
- Night: stock already forces detection at night; v1 limitation - our cadence may briefly restore segmentation at night. Validate live; if it conflicts, add a night guard (skip cadence when stock night-detection is active). Tracked as open item §10.
- Keep `D` short to bound any window without live segmentation.

## 8. Testing

- **Server (vitest):** `obstacle_avoidance_sensitivity` change + mower connect → emits `set_obstacle_detection { level }`; level clamped 1..3; no command when unchanged.
- **`extended_commands` cadence state machine:** pure-Python unit test (pattern: `research/test_extended_commands_tuning.py`) - given level + mock work-status + clock, asserts the det/seg toggle sequence and timing, and that level 1 / non-mowing produces no calls.
- **Live acceptance:** §6 checklist on `LFIN1231000211`.

## 9. Rollback

- Level 1 (off) fully disables the feature (no detection passes) - a safe default and an instant "off" switch from the app.
- Server change is additive (a new extended command); not sending it leaves stock behaviour.
- `extended_commands.py` change ships in the firmware build; reverting the build restores prior behaviour.

## 10. Open items / to verify

- Exact `T2`/`T3`/`D` values (live-tuned, §6).
- Night-detection conflict handling (§7) - confirm/avoid fighting stock night override.
- Whether `extended_commands` already tracks work-status, or needs a new subscription, to implement the mowing guard.
- Confirm the `set_infer_model` `SetUint8` client works from `extended_commands`' ROS context (localhost/DDS).
- de/fr label translations (follow-up).
