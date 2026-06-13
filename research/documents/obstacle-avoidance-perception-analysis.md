# Obstacle Avoidance / Perception Pipeline — Full Analysis

> Status: 2026-06-13. Static analysis (Ghidra decompiles, objdump aarch64, blutter v2.4.0,
> firmware install tree v6.0.2). Investigates GitHub issue **#93 "Robot go through obstacle"**
> and the user report: "obstacle avoidance on High but it drives straight over toys lying on
> the lawn — it just doesn't see them."
>
> **Headline finding:** `obstacle_avoidance_sensitivity` (app "Obstacle avoidance" Low/Med/High)
> is **NOT an intensity slider — it is a perception MODE selector**, and the perception node
> runs **only ONE model at a time** (the detection+segmentation "fusion" mode was disabled by a
> firmware bug). On Med/High only the terrain-**segmentation** model runs, so discrete dynamic
> objects (a toy) are never classified as obstacles and get run over. The discrete-object
> **detection** model is a *separate* mode (likely Low / perception_level 1, and force-enabled at
> night). This is **stock LFI behaviour** (stock models + stock decision node), not OpenNova code.

---

## 1. The full chain (app → firmware)

### 1.1 App layer — what gets sent

Both apps send the **same** field via `set_para_info`:

- **OpenNova RN app:** `app/src/screens/MowerSettingsScreen.tsx`
  - LEVELS: `{value:1 'Low' "Less avoidance, more coverage"}`, `{2 'Med'}`, `{3 'High' "Maximum obstacle avoidance"}` (the labels/descriptions are LFI's framing and are **misleading** — see §5).
  - `handleSaveAll()` sends `set_para_info: { sound, headlight, path_direction, obstacle_avoidance_sensitivity: sensitivity, manual_controller_v, manual_controller_w }` as **one block**.
  - Dashboard equivalents: `dashboard/src/pages/SettingsPage.tsx` (`obstacle_avoidance_sensitivity: s.sensitivity`, clamped 1..3), `dashboard/src/components/settings/SettingsPanel.tsx`.
- **Stock Novabot Flutter app (blutter v2.4.0):** `research/blutter_output_v2.4.0/`
  - `pages/home_page/view/advanced_settings/advanced_settings_page.dart` → `_AdvancedSettingsPageState::_obstacle (0x8805a8)`
  - String pool: `set_para_info` @`pp+0x1d5b8`, `obstacle_avoidance_sensitivity` @`pp+0x1d5d0`, `set_para_info_respond` @`pp+0x1d5f8`, label "Obstacle avoidance sensitivity" @`pp+0x1d5d0` area.
  - **Conclusion: OpenNova app == stock app for this setting. Our wiring is correct; the behaviour is inherent to the firmware.**
- Stock app also has the string `"Perception module error. Please restart the machine or try again later."` (`pp+0x53a20`).

### 1.2 mqtt_node (stock) — stores it, injects into StartCoverageTask

`research/ghidra_output/mqtt_node_decompiled.c`:

- `api_set_para_info` (≈line 330288): reads `obstacle_avoidance_sensitivity` → global `g_obstacle_avoidance_sensitivity`
  - writes: line 330421 (from set_para_info), 334290 (`=2` default), 334296.
- **Start-coverage builders** (read-sites ≈347096 and ≈347783) build a `StartCoverageTask_Request` (`task_start_client`) and set:
  - `this[0x60]` = `specify_direction` = `(g_path_direction != -1)`
  - `this[0x61]` = `cov_direction` = `g_path_direction`
  - `this[0x63]` (99) = `specify_perception_level` = **1 (true)**
  - `this[0x64]` (100) = `perception_level` = **`g_obstacle_avoidance_sensitivity`**
  - `this[0x65]` (101) = `blade_info_level` = sound/headlight combo (1..4)
  - then `task_start_client.wait_for_service` + send.
- **So `obstacle_avoidance_sensitivity` → `StartCoverageTask.perception_level`, applied ONLY when a coverage task is (re)started.** Changing it mid-mow does nothing to the running task.

### 1.3 StartCoverageTask.srv — what perception_level means

`research/firmware/.../decision_msgs/share/decision_msgs/srv/StartCoverageTask.srv`:

```
bool  specify_perception_level   # whether to force the perception level
uint8 perception_level           # 0 关闭避障(avoidance OFF)  1 检测(DETECTION)  2 分割(SEGMENTATION)  3 分割灵敏度高(SEGMENTATION high-sensitivity)
```

(Other relevant fields: cov_mode 0=NORMAL/1=SPECIFIED_AREA/2=BOUNDARY_COV, map_ids, map_names,
polygon_area `geometry_msgs/Point[]`, blade_heights `level+2 *10` mm, cov_direction, blade_info_level.)

### 1.4 robot_decision (RobotDecision) — consumes perception_level

Binary: `research/firmware/mower_firmware_v6.0.2/install/compound_decision/lib/compound_decision/robot_decision` (aarch64, 6.3 MB, not stripped).

Symbols / addresses (`objdump -t`):
- `RobotDecision::setPerceptionLevel(PerceptionLevel)` @ `0x884c8`, size `0xecc`
- `RobotDecision::setPerceptionLevel()` @ `0x89398`
- `RobotDecision::setSemanticMode()` @ `0x6aeb8`
- `RobotDecision::enablePerception(bool)` @ `0x6c920`

Service clients (strings):
- `/perception/do_perception` (std_srvs/SetBool)
- `/perception/set_infer_model` (general_msgs/SetUint8)  ← **selects the model / fusion mode**
- `/perception/set_seg_level` (general_msgs/SetUint8)
- `/perception/save_pcd_img`, `/perception/pedestrian_detect`, `/perception/dirty_detect`
- `/local_costmap/set_detection_mode`, `/local_costmap/set_semantic_mode` (nav2_msgs/SemanticMode)

`setPerceptionLevel(PerceptionLevel)` disassembly (`objdump -d --disassemble-symbols=...`):
- It is a **level-transition state machine**: compares stored current level `[x19+0x6cc]` with the new level `w20`, branches on `cmp w20,#1/#2/#4`, and ramps.
- Calls inside it: `SetBool::async_send_request` ×4, `SetUint8::async_send_request` ×4 (to `/perception` client at `[x19+0xfd0]`), `SemanticMode::async_send_request` ×2, `enablePerception(bool)` ×1.
- **The 4 SetUint8 (set_infer_model) immediates seen are `{1, 2, 2, 1}` — never 3.** i.e. "High" (level 3) does NOT load any special/extra model; level 3 only raises segmentation sensitivity (`set_seg_level` / SemanticMode), it never switches to a different inference model.

Telling log strings in robot_decision:
- `"Force setting to detection mode for night!!!! %d %.1f"` — at night it **forces DETECTION mode**.
- `"Recover to day, recover perception level"`
- `"Set detection mode------------!!!"`, `"Set detection mode------------ignore tof height!!!"`
- `"Test Version: Set high level perception level to let robot cannot out of Lawn!!!!"` — **high level = keep robot inside the lawn = terrain segmentation.**
- `"Open perception failed, maybe node crashed!"` — perception can crash silently (cf. issue #85 CPU pressure → could starve/crash it).

### 1.5 perception_node (V0.5.3d) — the decisive evidence

Dir: `research/firmware/.../perception_node/share/perception_node/perception_conf/`

- **Two models:**
  - `novabot_detv2_11_960_512.bin` (8.1 MB) = **DETECTION** model
  - `bisenetv2-seg_2023-11-27_512-960_vanilla.bin` (3.6 MB) = **SEGMENTATION** model
  - (+ `bisenetv2-soiling-seg_...bin` for camera-dirty detection)
- Launch defaults (`launch/perception_node_shm.launch.py`): `det_model_name=novabot_detv2_11_960_512.bin`, `seg_model_name=bisenetv2-seg_2023-11-27_512-960_vanilla.bin`, `model_infer_class=infer_class.json`.
- **`set_infer_model` fusion-mode switch** (strings in the `perception_node` binary):
  ```
  switch fusion model: only segmentation
  switch fusion model: only detection
  LF_ONLY_DO_SEGMENTATION_DEFAULT
  LF_ONLY_DO_DETECTION
  LF_ONLY_DO_SEGMENTATION_HIGH
  LF_ONLY_DO_SEGMENTATION_LOW
  switch fusion model error,please check input id
  ```
  All modes are `ONLY_DO_*` → **single model at a time**.
- **`perception_node_version.json` feature_list (smoking gun):**
  - v0.2.1: "launch adds **fusion_mode**: supports pure-detection / pure-segmentation / **detection+segmentation** (post-fusion)"
  - v0.2.2: **"dual-model has a BUG → switched to single-model"**
  - v0.2.3: "added model-switch service; updated segmentation model"
  - v0.2.4: "default node starts with **do_perception = false**"
- **`infer_class.json`:**
  - segmentation (0-13): `2 lawn, 3 road, 4 terrain, 5 fixed obstacle, 6 static obstacle, 7 dynamic obstacle, 8 bush, 9 faeces, 10 charging station, 11 dirt, 12 sunlight, 13 glass`
  - detection (100-108): `person, animal, obstacle, shoes, wheel, leaf debris, faeces, rock, background` (detection IDs are output as id+100 in the unified semantic stream).

### 1.6 Other consumers (ruled out)

- `chassis_control_node` (Ghidra): only reads `obstacle_avoidance_sensitivity` and `cout`s it (`"obstacle_avoidance_sensitivity: "` + value). **No behavioural branch found** — informational only.
- `coverage_planner` (Ghidra): obstacle inflation = `CoveragePlannerInterface::preprocessMapReduceInflation` using planner **config** params (`this+0x18/0x1c/0x20/0x24`), **not** the sensitivity. So the *planning-time* buffering of SAVED obstacle polygons (the "gray circles" in the path) is independent of this setting — that is a separate mechanism (the per-map `pgm` obstacle rasterisation, see `per-map-pgm-coverage-bug.md`).

---

## 2. The three obstacle-avoidance mechanisms (don't confuse them)

| # | Mechanism | What it does | Driven by `obstacle_avoidance_sensitivity`? |
|---|---|---|---|
| A | **Planner inflation** | coverage_planner buffers SAVED obstacle polygons in the per-map `pgm` → "gray circle" in the planned path | ❌ No — fixed planner config (`preprocessMapReduceInflation`) |
| B | **Runtime camera/AI perception** | perception_node detects/segments obstacles live → costmap → nav2 avoids | ✅ Yes (→ `perception_level`), but single-model + only at task start |
| C | **chassis / ultrasonic** | chassis_control_node | ❌ No — only logs the value |

- Issue #93 "path goes through small SAVED obstacles, no gray circle" = **A** (planning).
- User report "drives over a TOY on the lawn" = **B** (runtime perception) — the subject of this doc.

---

## 3. Perception-level → mode mapping — **PROVEN end-to-end**

### 3a. `PerceptionNode::set_infer_model` id → mode (proven via log strings)

Disassembled `PerceptionNode::set_infer_model` (@`0x78598`): switch on `request->data` (`w3`),
each branch `rcutils_log`s its mode name (rodata @`0x13f5xx`–`0x13f7xx`):

| `set_infer_model` id | log string | model that runs |
|---|---|---|
| 0 / other | `switch fusion model error,please check input id` | none (error) |
| **1** | `LF_ONLY_DO_SEGMENTATION_DEFAULT` | segmentation (bisenetv2-seg) |
| **2** | `LF_ONLY_DO_DETECTION` | **detection (novabot_detv2)** |
| **3** | `LF_ONLY_DO_SEGMENTATION_HIGH` | segmentation (high sensitivity) |
| **4** | `LF_ONLY_DO_SEGMENTATION_LOW` | segmentation (low sensitivity) |

All are `ONLY_DO_*` → **single model at a time** (no combined det+seg; dual-model bug, §1.5).

### 3b. `setPerceptionLevel(level)` → `set_infer_model` id (proven by tracing the state machine)

`RobotDecision::setPerceptionLevel` calls `set_infer_model` (client `[x19+0xfd0]`) with id ∈ {1,2}
only (never 3/4 — segmentation high/low sensitivity is tuned separately via `set_seg_level` /
`SemanticMode`). Traced branch:
- `0x88aac: cmp w20,#1; b.ne 0x88c28` — **level==1** falls through → `0x88b7c: mov w0,#2; strb` →
  `set_infer_model(2)` = **DETECTION**. (Proven, direct path, no intervening redirect.)
- **level==2** → `0x88c28: cmp w20,#2; b.eq 0x88914` → segmentation path → `set_infer_model(1)` = SEG_DEFAULT.
- **level==3** (`>2,<=4`) → `0x88634` segmentation path → `set_infer_model(1)` + higher seg sensitivity.

### 3c. Net result (app button → behaviour)

| App "Obstacle avoidance" | obstacle_avoidance_sensitivity = perception_level | set_infer_model id | perception_node mode | Detects a toy? |
|---|---|---|---|---|
| **Low** | 1 | **2** | `LF_ONLY_DO_DETECTION` (person/animal/obstacle/shoes/wheel/**rock**) | **YES** |
| **Med** | 2 | 1 | `SEGMENTATION_DEFAULT` (terrain) | No |
| **High** | 3 | 1 (+seg sensitivity up) | segmentation high (terrain, "keep on lawn") | **No** |

This is now **fully proven by static RE** (not just the `.srv` comment). It also matches the
`.srv` doc (`perception_level 1=检测/detection, 2=分割/segmentation, 3=分割灵敏度高`). A physical
test (Low + toy vs High + toy) is the empirical cross-check.

---

## 4. Why "High" doesn't see the toy (root cause)

1. The detection+segmentation **fusion mode was disabled** (dual-model bug, v0.2.2) → **single model at a time**.
2. During daytime coverage, the decision node runs the **segmentation** model (terrain, "keep robot on lawn"); the **object-detection** model is therefore **off**.
3. A small toy is a discrete object — it is the *detection* model's job (classes obstacle/shoes/wheel/rock). Segmentation classifies it as lawn/background → not an obstacle → driven over.
4. "High" (level 3) only raises **segmentation** sensitivity (`set_seg_level` never sets model 3); it does nothing for object detection.
5. Ironically the firmware **force-enables detection mode at night** — so a toy may be *more* likely caught at night than on daytime "High".

This is a **fundamental stock limitation**: you cannot simultaneously "stay on the lawn" (segmentation) and "avoid loose objects" (detection) on this firmware while fusion is disabled.

---

## 5. Practical implications & options

- **Immediate workaround (verify first):** set obstacle avoidance to **Low** (= detection mode) when loose objects are a concern. Physical test: Low + toy should be avoided where High is not.
- **The app labels are misleading:** "Low = less avoidance / High = maximum avoidance" is wrong — they are different *modes*, not intensities. A future app/dashboard change could relabel (e.g. "Object detection" vs "Terrain (stay-on-lawn) low/high") instead of Low/Med/High.
- **Real fix candidates (custom-firmware territory, risky):**
  1. Re-investigate / re-enable the **detection+segmentation fusion** mode (was buggy in v0.2.2 — find out why; the BPU may not sustain both at frame rate).
  2. **Alternate** the two models periodically (run detection every N frames) so loose objects get a chance to be seen during coverage.
  3. Confirm perception_node isn't crashing/CPU-starved during mow (cf. #85) — if it crashes, no level works (`"Open perception failed, maybe node crashed!"`).

---

## 6. Evidence index (paths)

- App: `app/src/screens/MowerSettingsScreen.tsx`, `dashboard/src/pages/SettingsPage.tsx`, `dashboard/src/components/settings/SettingsPanel.tsx`
- Stock app: `research/blutter_output_v2.4.0/{pp.txt,objs.txt,asm/.../advanced_settings_page.dart}`
- mqtt_node: `research/ghidra_output/mqtt_node_decompiled.c` (api_set_para_info; StartCoverageTask builders ≈347096/347783)
- srv: `research/firmware/mower_firmware_v6.0.2/install/decision_msgs/share/decision_msgs/srv/StartCoverageTask.srv`
- decision: `research/firmware/mower_firmware_v6.0.2/install/compound_decision/lib/compound_decision/robot_decision`
  (`objdump -d --disassemble-symbols=_ZN13RobotDecision18setPerceptionLevelE15PerceptionLevel`)
- perception: `research/firmware/mower_firmware_v6.0.2/install/perception_node/lib/perception_node/perception_node`
  + `.../share/perception_node/perception_conf/{infer_class.json,perception_node_version.json,*.bin}`
  + `.../share/perception_node/launch/perception_node_shm.launch.py`
- chassis: `research/ghidra_output/chassis_control_node_decompiled.c` (≈555366)
- planner: `research/ghidra_output/coverage_planner_decompiled.c` (`preprocessMapReduceInflation`)
- server passthrough: `server/src/mqtt/paraRepush.ts`, `server/src/mqtt/sensorData.ts` (field `obstacle_avoidance_sensitivity`)

## 7. TODO (continuation)

- [x] Decompile `PerceptionNode::set_infer_model` → exact `int → LF_ONLY_DO_*` table (§3a, proven).
- [x] Trace `setPerceptionLevel` state machine → Low(1)=DETECTION, Med(2)/High(3)=SEGMENTATION (§3b, proven).
- [ ] Day/night switch threshold + the `"Force setting to detection mode for night"` condition (which `[x19+0x...]` flag / lux value) — relevant because it means detection IS available, just not selected for daytime coverage.
- [ ] Does the coverage *start* flow ever pass perception_level=1, or does the app/scheduler default it to 2/3? (i.e. can the user actually reach DETECTION during a normal mow, or only via the setting?)
- [ ] Confirm `set_seg_level` (the other SetUint8 client) is what distinguishes Med vs High.
- [ ] Decide product direction: relabel UI (mode not intensity), and/or fusion re-enable / model-alternation in custom firmware; rule out perception crash/CPU-starvation during mow (#85).
