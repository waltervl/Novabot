# Mower RTK Fix Quality Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the mower's real-time RTK fix quality (RTK Fixed / Float / DGPS / GPS / no-fix) as a label+color badge in the OpenNova app (HomeScreen + MappingScreen) and admin dashboard.

**Architecture:** The mower's `extended_commands.py` gains a background daemon that subscribes to the GPS ROS topic carrying the GGA fix quality and publishes a flat JSON `{"rtk_fix_quality":N,...}` to `novabot/sensor/<SN>` on change. The server's existing `novabot/sensor/+` broker handler auto-merges any key into `deviceCache` (no new server handler needed) and forwards to clients. The app and dashboard read `sensors.rtk_fix_quality` and render via a shared `fixQualityLabel(n)` helper.

**Tech Stack:** Python (rclpy ROS2 Galactic) on mower, TypeScript (Node + aedes broker) on server, React Native (app) + React (dashboard).

**Spec:** `docs/superpowers/specs/2026-05-29-mower-rtk-fix-quality-indicator-design.md`

**Key deviation from spec (improvement):** Use `novabot/sensor/<SN>` (the generic auto-merge sensor stream already used by the blade-RPM relay) instead of `novabot/extended_response/<SN>`. The broker's `novabot/sensor/+` handler (server/src/mqtt/broker.ts:1078) merges any flat JSON key straight into `deviceCache` and forwards to the dashboard socket, so **no server broker change is needed for data flow**. The only server change is an optional display-label translation.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `research/extended_commands.py` | Mower RTK telemetry daemon (clone of `start_blade_telemetry_relay`) | Modify: add `start_rtk_telemetry_relay()` + wire into `main()` |
| `research/build_custom_firmware.sh` | Bakes extended_commands.py into the .deb | Verify it already ships extended_commands.py (no change if it copies the whole file) |
| `server/src/mqtt/sensorData.ts` | Sensor field label translation | Modify: add `rtk_fix_quality` case to `translateValue()` |
| `server/src/__tests__/mqtt/sensorData.test.ts` (or existing test file) | Unit test the translation | Create/modify test |
| `app/src/utils/fixQuality.ts` | Shared `fixQualityLabel(n)` helper | Create |
| `app/src/utils/__tests__/fixQuality.test.ts` | Unit test the helper | Create |
| `app/src/screens/HomeScreen.tsx` | RTK badge near status chips | Modify |
| `app/src/screens/MappingScreen.tsx` | RTK fix-quality display during mapping | Modify |
| `dashboard/src/` device card (exact file located in Task 7) | RTK badge in admin device card | Modify |

---

## Task 1: Confirm the GPS fix-quality ROS topic on the live mower

**Goal:** Determine the exact ROS topic name + message type + field that carries the GGA fix quality (0/1/2/4/5). This gates the daemon implementation. No code in this task — it is a discovery task with a recorded outcome.

**Files:** none (investigation; record findings in the commit message of Task 2)

- [ ] **Step 1: List candidate topics from inside the running ROS graph**

The ad-hoc `ros2 topic list` over SSH fails DDS discovery on the Horizon X3. Instead, inspect what the running nodes publish by reading the node source already on disk and grepping the chassis decompile / localization params.

Run:
```bash
sshpass -p 'novabot' ssh -o StrictHostKeyChecking=no -o BindAddress=0.0.0.0 root@192.168.0.244 \
  'grep -rnE "create_publisher|advertise|gps_raw|NavSatFix|gps_status|/fix" \
     /root/novabot/install/*/share/*/  2>/dev/null | grep -iE "gps|fix|nav_sat" | head -30'
```
Expected: one or more publisher declarations naming the GPS topic and message type.

- [ ] **Step 2: Confirm the message type and which field holds the quality**

For the candidate topic (e.g. `/gps_raw`), find its message definition:
```bash
sshpass -p 'novabot' ssh -o StrictHostKeyChecking=no -o BindAddress=0.0.0.0 root@192.168.0.244 \
  'source /opt/ros/galactic/setup.bash; export ROS_LOCALHOST_ONLY=1; \
   ros2 interface show <pkg>/msg/<Type> 2>&1 | head -40'
```
Expected: a field like `uint8 status` / `int8 fix_quality` / `uint8 position_covariance_type` or a NavSatFix `status.status`. Record the exact `topic`, `msg_type`, and `field_name`.

- [ ] **Step 3: Cross-check the field against ground truth**

While the mower is docked (known fix state from `robot_combination_localization` log `fixed:` line), echo the topic for ~5s to confirm the field value matches the log:
```bash
sshpass -p 'novabot' ssh -o StrictHostKeyChecking=no -o BindAddress=0.0.0.0 root@192.168.0.244 \
  'source /opt/ros/galactic/setup.bash; export ROS_LOCALHOST_ONLY=1; \
   timeout 8 ros2 topic echo <topic> 2>&1 | head -30'
```
Expected: the field value tracks the localization log state. If discovery never resolves (empty output after 8s twice), **abandon Approach A and use the Approach B fallback in Task 2** (log parsing).

- [ ] **Step 4: Record the decision**

Write one line to carry into Task 2: either
`TOPIC=<topic> MSGTYPE=<pkg/msg/Type> FIELD=<field> GGA_MAPPING=<how field maps to 0/1/2/4/5>`
or
`FALLBACK=log-parse robot_combination_localization`.

No commit (no files changed).

---

## Task 2: Mower RTK telemetry daemon in `extended_commands.py`

**Files:**
- Modify: `research/extended_commands.py` (add `start_rtk_telemetry_relay()` after `start_blade_telemetry_relay`, wire into `main()` near line 3514 where the blade relay is started)

**Pattern to follow:** `start_blade_telemetry_relay(sn, mqtt_ref)` at `research/extended_commands.py:3270`. It is a daemon thread that runs an rclpy node, subscribes to a ROS topic, and publishes changed values to `novabot/sensor/<SN>`. Clone its structure.

- [ ] **Step 1: Add the daemon function (Approach A — topic subscription)**

Insert after the blade relay function. Replace `<TOPIC>`, `<MSGTYPE import>`, and the `_quality_from_msg` body with the values recorded in Task 1.

```python
# RTK fix-quality telemetry: subscribe to the GPS topic that carries the
# GGA fix quality and relay it to MQTT novabot/sensor/<SN> so the server
# merges rtk_fix_quality into deviceCache (same path as blade RPM). Publish
# on CHANGE only (no per-tick spam); a 2s heartbeat re-publishes the last
# value so a late-joining app still sees the current state.
def start_rtk_telemetry_relay(sn, mqtt_ref):
    try:
        import rclpy  # type: ignore
        from rclpy.node import Node  # type: ignore
        # TASK1: import the confirmed message type, e.g.:
        # from sensor_msgs.msg import NavSatFix
        from <MSGTYPE_IMPORT>  # type: ignore
    except ImportError as ex:
        log(f"[RtkRelay] rclpy import failed, RTK telemetry disabled: {ex}")
        return

    def _spin():
        try:
            try:
                rclpy.init()
            except RuntimeError:
                pass  # already initialised

            class _RtkRelay(Node):
                def __init__(self):
                    super().__init__('rtk_telemetry_relay')
                    self._topic = f'novabot/sensor/{sn}'
                    self._last_quality = None
                    self._last_sat = None
                    self._last_hdop = None
                    self._last_publish_ms = 0
                    self.create_subscription(
                        <MSGTYPE>, '<TOPIC>', self._on_msg, 10,
                    )
                    # 2s heartbeat re-publishes last known value
                    self.create_timer(2.0, self._tick)
                    log(f"[RtkRelay] subscribed <TOPIC> -> MQTT {self._topic}")

                def _quality_from_msg(self, msg):
                    # TASK1: map the message field to GGA quality 0/1/2/4/5.
                    # Example for NavSatFix.status.status:
                    #   -1 NO_FIX -> 0 ; 0 FIX -> 1 ; 1 SBAS -> 2 ; 2 GBAS -> 4
                    # Replace with the confirmed mapping.
                    return <MAP msg -> int 0/1/2/4/5>

                def _on_msg(self, msg):
                    q = self._quality_from_msg(msg)
                    sat = getattr(msg, '<SAT_FIELD>', None)   # None if not in msg
                    hdop = getattr(msg, '<HDOP_FIELD>', None)
                    changed = (q != self._last_quality)
                    self._last_quality = q
                    if sat is not None:
                        self._last_sat = int(sat)
                    if hdop is not None:
                        self._last_hdop = round(float(hdop), 2)
                    if changed:
                        self._publish()

                def _tick(self):
                    if self._last_quality is not None:
                        self._publish()

                def _publish(self):
                    payload = {'rtk_fix_quality': self._last_quality}
                    if self._last_sat is not None:
                        payload['rtk_sat'] = self._last_sat
                    if self._last_hdop is not None:
                        payload['hdop'] = self._last_hdop
                    try:
                        mqtt_ref[0].publish(self._topic, json.dumps(payload))
                    except Exception as ex:
                        log(f"[RtkRelay] publish failed: {ex}")

            node = _RtkRelay()
            rclpy.spin(node)
        except Exception as ex:
            log(f"[RtkRelay] spin crashed: {ex}")

    threading.Thread(target=_spin, daemon=True, name='rtk-relay').start()
```

If Task 1 recorded `FALLBACK=log-parse`, instead implement `_spin` as a loop that every 2s reads the tail of `robot_combination_localization` via the existing `_LOG_SOURCES` log path and regexes the latest `fixed: N` / `RTKContinuous::DGPS|SINGLE` line, mapping: `fixed: 1` -> 4; `No fixed` while corrections present -> 5; `RTKContinuous::DGPS` -> 2; `SINGLE` -> 1; no recent line -> 0; then publish the same `{'rtk_fix_quality':...}` payload to `novabot/sensor/<SN>`.

- [ ] **Step 2: Wire the daemon into `main()`**

Find where the blade relay is started in `main()` (research/extended_commands.py around line 3514, `Spin up the ROS -> MQTT blade-RPM relay`). Add the RTK relay start right after it, using the same `mqtt` reference passed to the blade relay:

```python
    start_rtk_telemetry_relay(sn, mqtt_ref)
```
Match the exact `mqtt_ref` variable name the blade relay uses (read the surrounding lines to confirm — it is the holder passed to `start_blade_telemetry_relay`).

- [ ] **Step 3: Syntax-check locally**

Run:
```bash
python3 -m py_compile research/extended_commands.py && echo "py_compile OK"
```
Expected: `py_compile OK` (no syntax errors). This does NOT need rclpy installed locally — `py_compile` only parses.

- [ ] **Step 4: Deploy to mower + live verify**

Per `feedback_mower_scripts_local_first.md`, the edit is already in `research/`. Copy to the mower and restart extended_commands:
```bash
sshpass -p 'novabot' ssh -o StrictHostKeyChecking=no -o BindAddress=0.0.0.0 root@192.168.0.244 \
  'cp /root/novabot/scripts/extended_commands.py /root/novabot/scripts/extended_commands.py.bak.$(date +%s)' 2>/dev/null || true
sshpass -p 'novabot' scp -o StrictHostKeyChecking=no research/extended_commands.py \
  root@192.168.0.244:/root/novabot/scripts/extended_commands.py
# Restart only the extended_commands process (it is respawned by the monitor / launch)
sshpass -p 'novabot' ssh -o StrictHostKeyChecking=no -o BindAddress=0.0.0.0 root@192.168.0.244 \
  'pkill -f extended_commands.py; sleep 2; echo restarted'
```
NOTE: confirm the on-mower path of extended_commands.py first with
`sshpass ... 'find /root/novabot -name extended_commands.py'` — adjust the scp target to the real path.

- [ ] **Step 5: Confirm the MQTT stream**

```bash
timeout 12 mosquitto_sub -h 192.168.0.247 -p 1883 -t 'novabot/sensor/LFIN2230700238' -C 4
```
Expected: JSON lines like `{"rtk_fix_quality": 4, "rtk_sat": 27, "hdop": 0.6}` roughly every 2s, and the value matches the live `robot_combination_localization` `fixed:` state.

- [ ] **Step 6: Commit**

```bash
git add research/extended_commands.py
git commit -m "feat(mower): publish RTK fix quality to novabot/sensor via extended_commands

Adds start_rtk_telemetry_relay daemon (cloned from the blade-RPM relay):
subscribes to <TOPIC> (<MSGTYPE>.<FIELD>), maps to GGA fix quality
0/1/2/4/5, publishes {rtk_fix_quality,rtk_sat,hdop} to novabot/sensor/<SN>
on change with a 2s heartbeat. Server auto-merges into deviceCache.

Topic/field confirmed live on LFIN2230700238 (Task 1)."
```

---

## Task 3: Verify build script ships extended_commands.py

**Files:**
- Verify (likely no change): `research/build_custom_firmware.sh`

- [ ] **Step 1: Check how the build script handles extended_commands.py**

```bash
grep -n "extended_commands" research/build_custom_firmware.sh
```
Expected: a line that copies `extended_commands.py` into the firmware tree (e.g. `cp .../extended_commands.py "$FIRMWARE_DATA/.../scripts/"`). If it copies the whole file, the Task 2 change is automatically included in the next custom build — **no edit needed**, this task is a verification only.

- [ ] **Step 2: If the script inlines a stale copy or patches selectively**

Only if Step 1 shows the script embeds a different/older copy: update the embedded path to point at `research/extended_commands.py` so the relay ships. If Step 1 shows a clean whole-file copy, skip.

- [ ] **Step 3: Commit (only if a change was made)**

```bash
git add research/build_custom_firmware.sh
git commit -m "build(mower): ensure RTK-relay extended_commands.py ships in custom firmware"
```
If no change was needed, record "build script already ships extended_commands.py verbatim — no change" and move on.

---

## Task 4: Server display-label translation for `rtk_fix_quality`

**Files:**
- Modify: `server/src/mqtt/sensorData.ts` (function `translateValue` at line 288)
- Test: `server/src/__tests__/mqtt/sensorData.test.ts` (create if absent, else add a case)

No data-flow change is needed (the broker `novabot/sensor/+` handler already merges `rtk_fix_quality` into `deviceCache`). This task only adds a human label for dashboard display.

- [ ] **Step 1: Write the failing test**

Create or append to `server/src/__tests__/mqtt/sensorData.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { translateValue } from '../../mqtt/sensorData.js';

describe('translateValue rtk_fix_quality', () => {
  it('maps GGA quality codes to labels', () => {
    expect(translateValue('rtk_fix_quality', '4')).toBe('RTK Fixed');
    expect(translateValue('rtk_fix_quality', '5')).toBe('RTK Float');
    expect(translateValue('rtk_fix_quality', '2')).toBe('DGPS');
    expect(translateValue('rtk_fix_quality', '1')).toBe('GPS');
    expect(translateValue('rtk_fix_quality', '0')).toBe('No fix');
  });
  it('passes through unknown codes unchanged', () => {
    expect(translateValue('rtk_fix_quality', '7')).toBe('7');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/mqtt/sensorData.test.ts -t "rtk_fix_quality"`
Expected: FAIL — `translateValue('rtk_fix_quality','4')` returns `'4'`, not `'RTK Fixed'`.

- [ ] **Step 3: Add the translation case**

In `server/src/mqtt/sensorData.ts`, inside `translateValue(field, rawValue)` (line 288), add a branch before the default return:
```typescript
  if (field === 'rtk_fix_quality') {
    switch (rawValue) {
      case '0': return 'No fix';
      case '1': return 'GPS';
      case '2': return 'DGPS';
      case '4': return 'RTK Fixed';
      case '5': return 'RTK Float';
      default:  return rawValue;
    }
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/mqtt/sensorData.test.ts -t "rtk_fix_quality"`
Expected: PASS (both cases).

- [ ] **Step 5: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/mqtt/sensorData.ts server/src/__tests__/mqtt/sensorData.test.ts
git commit -m "feat(server): translate rtk_fix_quality codes to human labels

novabot/sensor/+ already merges rtk_fix_quality into deviceCache; this adds
the display-label translation (4=RTK Fixed, 5=RTK Float, 2=DGPS, 1=GPS,
0=No fix) used by the dashboard."
```

---

## Task 5: Shared `fixQualityLabel` helper in the app

**Files:**
- Create: `app/src/utils/fixQuality.ts`
- Test: `app/src/utils/__tests__/fixQuality.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/src/utils/__tests__/fixQuality.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { fixQualityLabel } from '../fixQuality';

describe('fixQualityLabel', () => {
  it('maps known codes to label + color', () => {
    expect(fixQualityLabel(4)).toEqual({ label: 'RTK Fixed', color: '#22c55e' });
    expect(fixQualityLabel(5)).toEqual({ label: 'RTK Float', color: '#f59e0b' });
    expect(fixQualityLabel(2)).toEqual({ label: 'DGPS',      color: '#eab308' });
    expect(fixQualityLabel(1)).toEqual({ label: 'GPS',       color: '#9ca3af' });
    expect(fixQualityLabel(0)).toEqual({ label: 'No fix',    color: '#ef4444' });
  });
  it('returns No data for undefined / null / unknown', () => {
    expect(fixQualityLabel(undefined)).toEqual({ label: 'No data', color: '#6b7280' });
    expect(fixQualityLabel(null)).toEqual({ label: 'No data', color: '#6b7280' });
    expect(fixQualityLabel(7)).toEqual({ label: 'No data', color: '#6b7280' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npx vitest run src/utils/__tests__/fixQuality.test.ts`
Expected: FAIL — module `../fixQuality` not found.

- [ ] **Step 3: Implement the helper**

Create `app/src/utils/fixQuality.ts`:
```typescript
/** Map an NMEA GGA fix-quality code to a display label + color.
 * 4 = RTK Fixed, 5 = RTK Float, 2 = DGPS, 1 = GPS SPS, 0 = no fix.
 * undefined/null/unknown -> "No data" (mower not reporting / stock firmware). */
export interface FixQualityDisplay {
  label: string;
  color: string;
}

const NO_DATA: FixQualityDisplay = { label: 'No data', color: '#6b7280' };

export function fixQualityLabel(
  q: number | string | null | undefined,
): FixQualityDisplay {
  const n = typeof q === 'string' ? parseInt(q, 10) : q;
  switch (n) {
    case 4: return { label: 'RTK Fixed', color: '#22c55e' };
    case 5: return { label: 'RTK Float', color: '#f59e0b' };
    case 2: return { label: 'DGPS',      color: '#eab308' };
    case 1: return { label: 'GPS',       color: '#9ca3af' };
    case 0: return { label: 'No fix',    color: '#ef4444' };
    default: return NO_DATA;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && npx vitest run src/utils/__tests__/fixQuality.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/utils/fixQuality.ts app/src/utils/__tests__/fixQuality.test.ts
git commit -m "feat(app): add fixQualityLabel helper for RTK fix-quality badges"
```

---

## Task 6: RTK badge on app HomeScreen + MappingScreen

**Files:**
- Modify: `app/src/screens/HomeScreen.tsx`
- Modify: `app/src/screens/MappingScreen.tsx`

The mower fix quality arrives as `mower.sensors.rtk_fix_quality` (a string, same way `s.rtk_sat` is read at HomeScreen.tsx:305 and `sensors.loc_quality` at MappingScreen.tsx:272).

- [ ] **Step 1: HomeScreen — import the helper**

At the top of `app/src/screens/HomeScreen.tsx` with the other imports:
```typescript
import { fixQualityLabel } from '../utils/fixQuality';
```

- [ ] **Step 2: HomeScreen — derive the display value**

In the component body where `const s = mower.sensors;` is in scope (around line 132), add:
```typescript
  const rtkFix = fixQualityLabel(s.rtk_fix_quality);
```

- [ ] **Step 3: HomeScreen — render the badge near the status chips**

Locate the status-chip / header row that renders battery / status (search for where `battery` is displayed in JSX). Add a small badge:
```tsx
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: rtkFix.color }} />
    <Text style={{ fontSize: 12, color: rtkFix.color }}>{rtkFix.label}</Text>
  </View>
```
Place it adjacent to the existing battery/status chips so it sits in the same row. Match the existing chip styling conventions in the file (reuse a nearby chip's `style` if one exists rather than the inline style above).

- [ ] **Step 4: MappingScreen — import + derive**

At the top of `app/src/screens/MappingScreen.tsx`:
```typescript
import { fixQualityLabel } from '../utils/fixQuality';
```
Where `const sensors = mower?.sensors ?? {};` is in scope (line 128):
```typescript
  const rtkFix = fixQualityLabel(sensors.rtk_fix_quality);
```

- [ ] **Step 5: MappingScreen — render prominent fix indicator**

Near the existing mapping-readiness UI (around the `gpsValid` / `locQuality` usage at lines 268-275), add a prominent fix-quality line:
```tsx
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 4 }}>
    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: rtkFix.color }} />
    <Text style={{ fontSize: 15, fontWeight: '600', color: rtkFix.color }}>
      RTK: {rtkFix.label}
    </Text>
  </View>
```

- [ ] **Step 6: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/HomeScreen.tsx app/src/screens/MappingScreen.tsx
git commit -m "feat(app): RTK fix-quality badge on HomeScreen + MappingScreen"
```

NOTE: per `feedback_test_before_commit`, the user verifies the UI live via Expo hot reload before this commit is considered done. Coordinate with the user to confirm the badge renders and updates before marking the task complete.

---

## Task 7: RTK badge on the admin dashboard device card

**Files:**
- Modify: dashboard device-card component (located in Step 1)

- [ ] **Step 1: Locate the device card + sensor rendering**

```bash
grep -rln "sensors" dashboard/src 2>/dev/null || grep -rln "sensors" server/src/dashboard 2>/dev/null
grep -rnE "loc_quality|battery_power|rtk_sat" dashboard/src 2>/dev/null | head
```
Record the exact component file that renders per-device sensor values (the dashboard is React + Vite + Tailwind per CLAUDE.md). The sensor object exposes `rtk_fix_quality` as a raw code AND the server already translated it for display via `translateValue`; decide whether the card shows the raw code (apply a local color map) or the translated label (apply color by matching the label).

- [ ] **Step 2: Add a fix-quality color map in the dashboard**

In the located component (or a shared `dashboard/src/utils/`), add:
```typescript
const RTK_COLORS: Record<string, string> = {
  '4': '#22c55e', '5': '#f59e0b', '2': '#eab308', '1': '#9ca3af', '0': '#ef4444',
};
const RTK_LABELS: Record<string, string> = {
  '4': 'RTK Fixed', '5': 'RTK Float', '2': 'DGPS', '1': 'GPS', '0': 'No fix',
};
```

- [ ] **Step 3: Render the badge in the device card**

Where the card renders other sensor values (next to battery / loc_quality), add:
```tsx
{sensors.rtk_fix_quality !== undefined && (
  <span
    className="inline-flex items-center gap-1 text-xs"
    style={{ color: RTK_COLORS[sensors.rtk_fix_quality] ?? '#6b7280' }}
  >
    <span
      className="inline-block w-2 h-2 rounded-full"
      style={{ backgroundColor: RTK_COLORS[sensors.rtk_fix_quality] ?? '#6b7280' }}
    />
    {RTK_LABELS[sensors.rtk_fix_quality] ?? 'No data'}
  </span>
)}
```

- [ ] **Step 4: Build the dashboard dist**

Per CLAUDE.md the dashboard dist must be rebuilt after frontend changes:
```bash
cd novabot-dashboard && npm run build
```
(adjust to the real dashboard dir found in Step 1). Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add <dashboard component path> <dashboard dist if committed>
git commit -m "feat(dashboard): RTK fix-quality badge on device card"
```

---

## Task 8: End-to-end verification

**Files:** none (verification)

- [ ] **Step 1: Confirm the full path live**

With the mower docked and extended_commands restarted (Task 2), confirm `rtk_fix_quality` shows in the device API:
```bash
curl -s http://192.168.0.247:8080/api/dashboard/devices \
  | python3 -c "import json,sys; d=json.load(sys.stdin); \
    [print(x['sn'], x.get('sensors',{}).get('rtk_fix_quality')) for x in d if isinstance(d,list)]" 2>&1 | head
```
Expected: the mower SN with a value of `0/1/2/4/5` (or its translated label, depending on the endpoint).

- [ ] **Step 2: Confirm the app badge updates**

In the OpenNova app (Expo), open HomeScreen and MappingScreen with the mower online. The badge shows the current state and updates within ~2s when the mower's fix state changes (e.g. when it transitions Fixed -> Float, observable in the localization log).

- [ ] **Step 3: Confirm the dashboard badge**

Open the admin dashboard device card for the mower. The RTK badge matches the app.

- [ ] **Step 4: Confirm graceful absence**

On a device with stock firmware (no extended_commands, e.g. a mower not running OpenNova), the badge shows "No data" / hidden, never a crash or a misleading "No fix".

---

## Self-review notes

- **Spec coverage:** Component 1 (mower publisher) = Tasks 1-3. Component 2 (server) = Task 4 (data-flow auto-handled by existing broker, label only). Component 3 (clients) = Tasks 5-7. Edge cases (no-data/stale, stock firmware, offline) = fixQualityLabel default + Task 8 Step 4. Testing = Tasks 4, 5 unit + Task 8 e2e.
- **Push model + 2s cadence:** Task 2 Step 1 (timer 2.0s, publish-on-change + heartbeat).
- **Label+color only, sat/hdop in payload:** Task 2 payload includes sat/hdop; Tasks 5-7 render label+color only.
- **Local-first mower change:** Task 2 edits `research/`, then scp (Step 4); Task 3 verifies build script.
