# Object-Detection Cadence During Mowing - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repurpose the existing `obstacle_avoidance_sensitivity` (3 levels) to drive periodic object-DETECTION passes during mowing, so the mower sees loose objects (toys) without giving up terrain segmentation, using only our own code (no LFI binary patch).

**Architecture:** The OpenNova server forwards the level to the mower as a new extended command `set_obstacle_detection { level }` (on inbound `set_para_info` and on mower connect), mirroring the existing `set_coverage_planner_radius` path. On the mower, `extended_commands.py` stores the level and runs a daemon thread that, only while actively mowing and level>1, periodically flips `/perception/set_infer_model` to detection (id 2) for a short window then back to segmentation (id 1); the hit-count nav2 costmap keeps detected objects marked between passes. App/dashboard labels are finalized to describe the cadence.

**Tech Stack:** TypeScript (server, vitest), Python 3 (`extended_commands.py`, unittest), React Native (app), React + i18next (dashboard). ROS2 Galactic `general_msgs/srv/SetUint8` on `/perception/set_infer_model`.

**Spec:** `docs/superpowers/specs/2026-06-13-object-detection-cadence-design.md`. RE evidence: `research/documents/obstacle-avoidance-perception-analysis.md`.

**Proven facts the code relies on:** `set_infer_model` id 2 = detection, id 1 = segmentation (free runtime flag-flip, both models resident). nav2 ObstacleLayer marks any nonzero-label point as obstacle (`only_obstacle_label:False`) with hit-count accumulation. Never run two inferences in one frame (single BPU; that was the removed dual-model bug).

---

## File Structure

**Server (TypeScript)**
- Create `server/src/services/obstacleDetectionCadence.ts` - pure module: `OBSTACLE_DETECTION_KEY` + `selectObstacleDetectionLevel(rows)`. Mirrors `server/src/services/coveragePlannerRadius.ts`.
- Modify `server/src/mqtt/mapSync.ts` - add `republishObstacleDetection(sn)` (mirrors `republishCoveragePlannerRadius`), call it on connect next to `republishParaSettings(sn)` (line ~746), export it for the inbound path.
- Modify `server/src/routes/dashboard.ts` - after the inbound `set_para_info` upsert loop (line ~2710), call `republishObstacleDetection(sn)`.
- Create `server/src/__tests__/services/obstacleDetectionCadence.test.ts` - vitest for the pure selector.

**Mower (Python, ships via `research/build_custom_firmware.sh`)**
- Modify `research/extended_commands.py` - env-overridable tunables + pure `obstacle_detect_period(level)`, global `_obstacle_detection_level`, `handle_set_obstacle_detection`, HANDLERS entry, `start_obstacle_detection_cadence()` started in `main()`.
- Modify `research/test_extended_commands_tuning.py` - unittest for `obstacle_detect_period` + the handler clamp.

**App + Dashboard (labels)**
- Modify `app/src/screens/MowerSettingsScreen.tsx` - `SENSITIVITY_LEVELS` final cadence labels.
- Modify `dashboard/src/pages/SettingsPage.tsx` - inline fallbacks.
- Modify `dashboard/src/i18n/locales/en.json` + `nl.json` - `settings.mower.sensitivity.*`.

---

## Task 1: Server pure selector `selectObstacleDetectionLevel`

**Files:**
- Create: `server/src/services/obstacleDetectionCadence.ts`
- Test: `server/src/__tests__/services/obstacleDetectionCadence.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/services/obstacleDetectionCadence.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectObstacleDetectionLevel } from '../../services/obstacleDetectionCadence.js';

describe('selectObstacleDetectionLevel', () => {
  it('returns the stored obstacle_avoidance_sensitivity as a number', () => {
    expect(selectObstacleDetectionLevel([{ key: 'obstacle_avoidance_sensitivity', value: '2' }])).toBe(2);
  });

  it('clamps out-of-range values into 1..3', () => {
    expect(selectObstacleDetectionLevel([{ key: 'obstacle_avoidance_sensitivity', value: '9' }])).toBe(3);
    expect(selectObstacleDetectionLevel([{ key: 'obstacle_avoidance_sensitivity', value: '0' }])).toBe(1);
  });

  it('returns null when the key is absent', () => {
    expect(selectObstacleDetectionLevel([{ key: 'headlight', value: '5' }])).toBeNull();
  });

  it('returns null when the value is not a finite number', () => {
    expect(selectObstacleDetectionLevel([{ key: 'obstacle_avoidance_sensitivity', value: '' }])).toBeNull();
    expect(selectObstacleDetectionLevel([{ key: 'obstacle_avoidance_sensitivity', value: 'x' }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/services/obstacleDetectionCadence.test.ts`
Expected: FAIL - cannot resolve `../../services/obstacleDetectionCadence.js` (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `server/src/services/obstacleDetectionCadence.ts`:

```ts
/**
 * Pure selector for the object-detection cadence level driven from the existing
 * `obstacle_avoidance_sensitivity` setting (1 = off, 2 = occasional, 3 = frequent).
 * Side-effect-free so it can be unit-tested without the mapSync/broker graph,
 * mirroring `coveragePlannerRadius.ts` / `paraRepush.ts`.
 */
export const OBSTACLE_DETECTION_KEY = 'obstacle_avoidance_sensitivity';

/** Extract the cadence level (1..3) from device_settings rows, or null if unset/invalid. */
export function selectObstacleDetectionLevel(
  rows: { key: string; value: string }[],
): number | null {
  const row = rows.find((r) => r.key === OBSTACLE_DETECTION_KEY);
  if (!row) return null;
  const n = Number(row.value);
  if (row.value.trim() === '' || !Number.isFinite(n)) return null;
  return Math.max(1, Math.min(3, Math.round(n)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/services/obstacleDetectionCadence.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/obstacleDetectionCadence.ts server/src/__tests__/services/obstacleDetectionCadence.test.ts
git commit -m "feat(server): obstacle-detection cadence level selector"
```

---

## Task 2: Server - republish cadence to mower on connect

**Files:**
- Modify: `server/src/mqtt/mapSync.ts` (add `republishObstacleDetection`, call at line ~746 next to `republishParaSettings(sn)`)

This mirrors the existing `republishCoveragePlannerRadius` (mapSync.ts:570). The publish helper is `publishToExtended` (already used in this file). No new unit test: the decision logic is the pure selector (Task 1); wiring is verified by `tsc` and the existing connect flow. Exported so Task 3 can reuse it.

- [ ] **Step 1: Add the import**

In `server/src/mqtt/mapSync.ts`, near the existing import (line ~21 `import { selectParaRepush } from './paraRepush.js';`), add:

```ts
import { selectObstacleDetectionLevel } from '../services/obstacleDetectionCadence.js';
```

- [ ] **Step 2: Add the republish function**

Immediately AFTER `republishCoveragePlannerRadius` (ends ~line 581) in `server/src/mqtt/mapSync.ts`, add:

```ts
/**
 * Her-push de objectdetectie-cadans naar de maaier. De stand komt uit het
 * bestaande `obstacle_avoidance_sensitivity` (1 = uit, 2 = af en toe, 3 = vaak);
 * de mower (`extended_commands.py`) zet daarop een detectie-cadans tijdens het
 * maaien. Mirror van `republishCoveragePlannerRadius`.
 */
export function republishObstacleDetection(sn: string): void {
  const level = selectObstacleDetectionLevel(deviceSettingsRepo.findBySn(sn));
  if (level == null) return;
  console.log(`${TAG} Her-push objectdetectie-cadans naar ${sn}: level=${level}`);
  publishToExtended(sn, { set_obstacle_detection: { level } });
}
```

- [ ] **Step 3: Call it on connect**

In `server/src/mqtt/mapSync.ts` at the connect path (line ~746, immediately after `republishParaSettings(sn);`), add:

```ts
      republishObstacleDetection(sn);
```

- [ ] **Step 4: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/src/mqtt/mapSync.ts
git commit -m "feat(server): push obstacle-detection cadence to mower on connect"
```

---

## Task 3: Server - forward cadence on inbound set_para_info

**Files:**
- Modify: `server/src/routes/dashboard.ts` (after the `set_para_info` upsert loop, line ~2710)

When the app/dashboard changes the setting it arrives here as `set_para_info`; after persisting to `device_settings` we re-send the cadence so it takes effect without waiting for a reconnect.

- [ ] **Step 1: Add the import**

In `server/src/routes/dashboard.ts`, extend the existing mapSync import (line ~21, the `from '../mqtt/mapSync.js'` line) to include `republishObstacleDetection`:

```ts
import { requestMapList, requestMapOutline, publishToDevice, publishRawToDevice, publishEncryptedOnTopic, publishToTopic, goToChargePayload, getNextCmdNum, patchLatestZipChargingPose, republishObstacleDetection } from '../mqtt/mapSync.js';
```

- [ ] **Step 2: Call it after the para upsert loop**

In `server/src/routes/dashboard.ts`, inside `if (paraInfo) { ... }`, immediately AFTER `forwardToDashboard(sn, changes);` (line ~2713), add:

```ts
    // Objectdetectie-cadans: stuur de nieuwe stand direct door naar de maaier
    // (extended_commands.py zet daarop de detectie-cadans tijdens maaien).
    if ('obstacle_avoidance_sensitivity' in paraInfo) republishObstacleDetection(sn);
```

- [ ] **Step 3: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full server suite (no regressions)**

Run: `cd server && npm test --silent`
Expected: all tests pass (the new Task-1 test included).

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/dashboard.ts
git commit -m "feat(server): forward obstacle-detection cadence on set_para_info change"
```

---

## Task 4: Mower - tunables + pure `obstacle_detect_period`

**Files:**
- Modify: `research/extended_commands.py`
- Test: `research/test_extended_commands_tuning.py`

Follows the existing env-overridable getter pattern (e.g. `charging_station_guard_interval_seconds`).

- [ ] **Step 1: Write the failing test**

Append to `research/test_extended_commands_tuning.py` inside `ExtendedCommandsTuningTest`:

```python
    def test_obstacle_detect_period_maps_levels_to_cadence(self):
        with patch.dict(os.environ, {}, clear=True):
            # level 1 = off (no detection passes)
            self.assertIsNone(ext.obstacle_detect_period(1))
            # level 2 = occasional, level 3 = frequent (shorter period)
            self.assertEqual(ext.obstacle_detect_period(2), 6.0)
            self.assertEqual(ext.obstacle_detect_period(3), 3.0)
            # >3 clamps to frequent, <1 treated as off
            self.assertEqual(ext.obstacle_detect_period(5), 3.0)
            self.assertIsNone(ext.obstacle_detect_period(0))

    def test_obstacle_detect_tunables_have_safe_minimums(self):
        with patch.dict(os.environ, {
            "OPENNOVA_OBSTACLE_DETECT_WINDOW_S": "0.0",
            "OPENNOVA_OBSTACLE_DETECT_FREQUENT_S": "0.1",
            "OPENNOVA_OBSTACLE_DETECT_OCCASIONAL_S": "0.1",
            "OPENNOVA_OBSTACLE_DETECT_IDLE_POLL_S": "0.1",
        }, clear=True):
            self.assertEqual(ext.obstacle_detect_window_seconds(), 0.3)
            self.assertEqual(ext.obstacle_detect_period_frequent_seconds(), 1.0)
            self.assertEqual(ext.obstacle_detect_period_occasional_seconds(), 2.0)
            self.assertEqual(ext.obstacle_detect_idle_poll_seconds(), 2.0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd research && python3 -m unittest test_extended_commands_tuning -v`
Expected: FAIL - `AttributeError: module 'extended_commands' has no attribute 'obstacle_detect_period'`.

- [ ] **Step 3: Write minimal implementation**

In `research/extended_commands.py`, after the `ros2_run` definition (line ~692), add:

```python
def _env_float(name, default, minimum):
    try:
        v = float(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        v = default
    return max(minimum, v)


def obstacle_detect_window_seconds():
    """Length of one detection pass (seconds)."""
    return _env_float("OPENNOVA_OBSTACLE_DETECT_WINDOW_S", 0.6, 0.3)


def obstacle_detect_period_occasional_seconds():
    """Seconds between detection passes at level 2 (occasional)."""
    return _env_float("OPENNOVA_OBSTACLE_DETECT_OCCASIONAL_S", 6.0, 2.0)


def obstacle_detect_period_frequent_seconds():
    """Seconds between detection passes at level 3 (frequent)."""
    return _env_float("OPENNOVA_OBSTACLE_DETECT_FREQUENT_S", 3.0, 1.0)


def obstacle_detect_idle_poll_seconds():
    """Poll interval when cadence is off or not mowing."""
    return _env_float("OPENNOVA_OBSTACLE_DETECT_IDLE_POLL_S", 5.0, 2.0)


def obstacle_detect_period(level):
    """Seconds between detection windows for a cadence level. None = off.

    level 1 (or <1) = off (segmentation only); 2 = occasional; 3 (or >3) = frequent.
    """
    if level is None or level <= 1:
        return None
    if level >= 3:
        return obstacle_detect_period_frequent_seconds()
    return obstacle_detect_period_occasional_seconds()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd research && python3 -m unittest test_extended_commands_tuning -v`
Expected: PASS (the two new tests + existing ones).

- [ ] **Step 5: Commit**

```bash
git add research/extended_commands.py research/test_extended_commands_tuning.py
git commit -m "feat(mower): obstacle-detection cadence tunables + period mapping"
```

---

## Task 5: Mower - `set_obstacle_detection` handler + register

**Files:**
- Modify: `research/extended_commands.py` (global, handler, HANDLERS dict ~line 3254 near `set_perception_mode`)
- Test: `research/test_extended_commands_tuning.py`

- [ ] **Step 1: Write the failing test**

Append to `research/test_extended_commands_tuning.py` inside `ExtendedCommandsTuningTest`:

```python
    def test_set_obstacle_detection_clamps_and_stores_level(self):
        captured = {}

        def fake_respond(cmd, payload):
            captured["cmd"] = cmd
            captured["payload"] = payload

        ext.handle_set_obstacle_detection({"level": 9}, fake_respond)
        self.assertEqual(ext._obstacle_detection_level, 3)
        self.assertEqual(captured["cmd"], "set_obstacle_detection_respond")
        self.assertEqual(captured["payload"]["result"], 0)
        self.assertEqual(captured["payload"]["level"], 3)

        ext.handle_set_obstacle_detection({"level": "bogus"}, fake_respond)
        self.assertEqual(ext._obstacle_detection_level, 1)  # invalid -> off

        ext.handle_set_obstacle_detection({"level": 2}, fake_respond)
        self.assertEqual(ext._obstacle_detection_level, 2)

    def test_set_obstacle_detection_is_registered(self):
        self.assertIs(ext.HANDLERS["set_obstacle_detection"], ext.handle_set_obstacle_detection)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd research && python3 -m unittest test_extended_commands_tuning -v`
Expected: FAIL - `AttributeError: module 'extended_commands' has no attribute 'handle_set_obstacle_detection'`.

- [ ] **Step 3: Write minimal implementation**

In `research/extended_commands.py`, immediately AFTER `handle_set_perception_mode` (ends ~line 744), add the module global and handler:

```python
# Object-detection cadence level (1 = off, 2 = occasional, 3 = frequent).
# Set by the server via the `set_obstacle_detection` extended command, read by
# the cadence thread (start_obstacle_detection_cadence). Default off until told.
_obstacle_detection_level = 1


def handle_set_obstacle_detection(params, respond):
    """Set the object-detection cadence level driven by the app's
    obstacle_avoidance_sensitivity (1 = off, 2 = occasional, 3 = frequent)."""
    global _obstacle_detection_level
    try:
        level = int(params.get("level", 1))
    except (TypeError, ValueError):
        level = 1
    level = max(1, min(3, level))
    _obstacle_detection_level = level
    log(f"[obstacle-detect] cadence level set to {level}")
    respond("set_obstacle_detection_respond", {"result": 0, "level": level})
```

Then register it in the `HANDLERS` dict (line ~3254, next to `"set_perception_mode": handle_set_perception_mode,`):

```python
    "set_obstacle_detection": handle_set_obstacle_detection,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd research && python3 -m unittest test_extended_commands_tuning -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add research/extended_commands.py research/test_extended_commands_tuning.py
git commit -m "feat(mower): set_obstacle_detection extended-command handler"
```

---

## Task 6: Mower - cadence thread

**Files:**
- Modify: `research/extended_commands.py` (add `start_obstacle_detection_cadence`, call in `main()`)

Glue around the pure `obstacle_detect_period` (Task 4, already tested) and the existing `_coverage_is_active()` mowing guard and `ros2_run` service caller. Mirrors `start_charging_station_guard`. Verified by build + live (no unit test for the thread itself).

- [ ] **Step 1: Add the cadence thread starter**

In `research/extended_commands.py`, immediately AFTER `start_charging_station_guard` (ends ~line 4030), add:

```python
def start_obstacle_detection_cadence():
    """Background cadence: while actively mowing and level>1, periodically flip the
    perception model to DETECTION (id 2) for a short window then back to
    SEGMENTATION (id 1). The hit-count nav2 costmap keeps detected objects marked
    between passes. Never runs two inferences in one frame (single BPU)."""
    def _set_model(model_id):
        try:
            ros2_run(
                ["ros2", "service", "call", "/perception/set_infer_model",
                 "general_msgs/srv/SetUint8", f"'{{value: {model_id}}}'"],
                timeout=10,
            )
        except Exception as ex:
            log(f"[obstacle-detect] set_infer_model({model_id}) failed: {ex}")

    def _loop():
        while True:
            try:
                period = obstacle_detect_period(_obstacle_detection_level)
                if period is None or not _coverage_is_active():
                    time.sleep(obstacle_detect_idle_poll_seconds())
                    continue
                window = obstacle_detect_window_seconds()
                _set_model(2)            # detection pass
                time.sleep(window)
                _set_model(1)            # back to segmentation
                time.sleep(max(0.0, period - window))
            except Exception as ex:
                log(f"[obstacle-detect] loop error: {ex}")
                time.sleep(obstacle_detect_idle_poll_seconds())

    threading.Thread(target=_loop, daemon=True, name="obstacle-detect-cadence").start()
    log("[obstacle-detect] cadence thread started")
```

- [ ] **Step 2: Start it in main()**

In `research/extended_commands.py` `main()` (starts ~line 4191), next to where the other guards are started (e.g. after `start_charging_station_guard()`), add:

```python
    start_obstacle_detection_cadence()
```

- [ ] **Step 3: Syntax + import check**

Run: `cd research && python3 -c "import ast; ast.parse(open('extended_commands.py').read()); print('syntax OK')"`
Expected: `syntax OK`.

Run: `cd research && python3 -m unittest test_extended_commands_tuning -v`
Expected: PASS (imports the module cleanly; no regressions).

- [ ] **Step 4: Commit**

```bash
git add research/extended_commands.py
git commit -m "feat(mower): object-detection cadence thread (set_infer_model toggling)"
```

---

## Task 7: App labels (finalize to cadence)

**Files:**
- Modify: `app/src/screens/MowerSettingsScreen.tsx` (`SENSITIVITY_LEVELS`, ~line 34)

Replaces the earlier interim labels. No em-dashes (project rule).

- [ ] **Step 1: Update SENSITIVITY_LEVELS**

In `app/src/screens/MowerSettingsScreen.tsx`, replace the `SENSITIVITY_LEVELS` block (currently the interim "Avoid objects / Stay on lawn / ..." values) with:

```ts
// obstacle_avoidance_sensitivity now drives object-detection CADENCE during
// mowing (server -> set_obstacle_detection -> extended_commands cadence thread):
// 1 = off (segmentation only), 2 = occasional detection, 3 = frequent detection.
const SENSITIVITY_LEVELS = [
  { value: 1, label: 'Off (terrain only)', desc: 'Segmentation only, no object detection (max coverage)' },
  { value: 2, label: 'Avoid objects', desc: 'Periodic object detection while mowing' },
  { value: 3, label: 'Avoid objects (frequent)', desc: 'Frequent object detection (best avoidance)' },
];
```

- [ ] **Step 2: Typecheck the app**

Run: `cd app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/screens/MowerSettingsScreen.tsx
git commit -m "feat(app): label obstacle-avoidance as detection cadence (off/occasional/frequent)"
```

(UI text: confirm with the user via Expo hot reload before relying on it - per project rule on UI changes.)

---

## Task 8: Dashboard labels (fallbacks + en/nl json)

**Files:**
- Modify: `dashboard/src/pages/SettingsPage.tsx` (inline fallbacks, ~line 457)
- Modify: `dashboard/src/i18n/locales/en.json` (`settings.mower.sensitivity`, ~line 554)
- Modify: `dashboard/src/i18n/locales/nl.json` (`settings.mower.sensitivity`, ~line 600)

- [ ] **Step 1: Update the inline fallbacks in SettingsPage.tsx**

Replace the two `t(...)` fallback expressions (label + desc) with:

```tsx
                    {t(`settings.mower.sensitivity.${o.key}`, o.key === 'low' ? 'Off (terrain only)' : o.key === 'medium' ? 'Avoid objects' : 'Avoid objects (frequent)')}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {t(`settings.mower.sensitivity.${o.key}Desc`,
                      o.key === 'low' ? 'Segmentation only, no object detection (max coverage)'
                      : o.key === 'medium' ? 'Periodic object detection while mowing'
                      : 'Frequent object detection (best avoidance)')}
```

- [ ] **Step 2: Update en.json**

In `dashboard/src/i18n/locales/en.json`, replace the `settings.mower.sensitivity` block with:

```json
      "sensitivity": {
        "low": "Off (terrain only)", "lowDesc": "Segmentation only, no object detection (max coverage)",
        "medium": "Avoid objects", "mediumDesc": "Periodic object detection while mowing",
        "high": "Avoid objects (frequent)", "highDesc": "Frequent object detection (best avoidance)"
      },
```

- [ ] **Step 3: Update nl.json**

In `dashboard/src/i18n/locales/nl.json`, replace the `settings.mower.sensitivity` block with:

```json
      "sensitivity": {
        "low": "Uit (alleen terrein)", "lowDesc": "Alleen segmentatie, geen objectdetectie (max dekking)",
        "medium": "Objecten ontwijken", "mediumDesc": "Periodieke objectdetectie tijdens maaien",
        "high": "Objecten ontwijken (vaak)", "highDesc": "Vaak objectdetectie (beste ontwijking)"
      },
```

- [ ] **Step 4: Validate JSON + build dashboard**

Run: `node -e "JSON.parse(require('fs').readFileSync('dashboard/src/i18n/locales/en.json','utf8')); JSON.parse(require('fs').readFileSync('dashboard/src/i18n/locales/nl.json','utf8')); console.log('JSON OK')"`
Expected: `JSON OK`.

Run: `cd dashboard && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/SettingsPage.tsx dashboard/src/i18n/locales/en.json dashboard/src/i18n/locales/nl.json
git commit -m "feat(dashboard): label obstacle-avoidance as detection cadence (off/occasional/frequent)"
```

(de/fr fall back to the English inline fallbacks; translate as a follow-up.)

---

## Live validation (on `LFIN1231000211`, after the firmware build ships)

Not code - run these on the mower once `extended_commands.py` is deployed via `research/build_custom_firmware.sh`. Set conservative defaults first, then tune `OPENNOVA_OBSTACLE_DETECT_*`:

1. With level 2/3 during a mow, confirm the cadence thread logs `[obstacle-detect]` toggles and `/perception/set_infer_model` actually switches mid-mission.
2. `ros2 topic echo /local_costmap/costmap` (or inspect) - confirm a detected object's mark PERSISTS between detection passes; if it decays faster than the period, lower `OPENNOVA_OBSTACLE_DETECT_OCCASIONAL_S`/`_FREQUENT_S`.
3. Confirm rapid toggling is stable (no perception_node crash, no stall) over a full mow.
4. Confirm the mower does NOT drift off the lawn during a detection window (coverage follows the planned path); shorten `OPENNOVA_OBSTACLE_DETECT_WINDOW_S` if needed.
5. Place a test object in the coverage area: level 2/3 -> mower marks + avoids it; level 1 -> no detection (baseline). 
6. Watch for night-detection conflict (stock forces detection at night) - if it misbehaves, add a night guard (open item in the spec).

---

## Notes for the implementer

- `ros2_run` is subprocess-based (`ros2 service call`), independent of the MQTT `_send_lock`; the cadence thread does NOT need that lock.
- The server publish helper inside `mapSync.ts` is `publishToExtended` (NOT `publishExtendedCommand`); match the file's existing usage.
- `set_infer_model` id mapping is FIXED: 2 = detection, 1 = segmentation. Do not send 3/4 from the cadence thread (segmentation high/low is the stock daytime default; we only need det vs the default seg).
- Never make the thread run both models concurrently - one `set_infer_model` at a time, always returning to 1.
- The cadence level defaults to 1 (off) on the mower until the server pushes a value, so the feature is inert until the user opts in via the (relabeled) setting.
