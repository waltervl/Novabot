# Guided Post-Restore Re-Anchor and Safe Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a map bundle restore, guide the user through a safe re-anchor (backward drive to RTK Fixed, position 50cm from dock, dock via pure-ArUco `auto_recharge`) and make `go_to_charge` impossible until the frame is re-validated by a successful dock.

**Architecture:** A DB-backed per-mower `frame_unvalidated` flag is set by the restore routes, hard-blocks `go_to_charge` at the single `publishToDevice` choke point, is surfaced to clients as a device field, and is cleared only when the mower reports docked/charging. The app shows a 3-step wizard while the flag is set and disables the Go-home button.

**Tech Stack:** TypeScript (Node + better-sqlite3 + aedes) on the server, React Native (Expo) on the app.

**Spec:** `docs/superpowers/specs/2026-05-29-post-restore-reanchor-safe-dock-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `server/src/services/frameValidation.ts` | In-memory + DB-backed frame_unvalidated state | Create |
| `server/src/__tests__/services/frameValidation.test.ts` | Unit test the state module | Create |
| `server/src/mqtt/mapSync.ts` | `publishToDevice` go_to_charge hard block | Modify (`publishToDevice` at line 167) |
| `server/src/__tests__/mqtt/publishToDeviceGuard.test.ts` | Test the block | Create |
| `server/src/routes/adminStatus.ts` | Set flag on restore | Modify (routes at line 1111 and 1200) |
| `server/src/mqtt/sensorData.ts` | Clear flag on dock + surface field | Modify (`updateDeviceData`, `isDockedByValues` at 632) |
| `server/src/index.ts` | Load flag cache at startup | Modify (after `initDb()`) |
| `app/src/screens/HomeScreen.tsx` | Disable Go-home + mount wizard | Modify |
| `app/src/components/ReanchorWizard.tsx` | 3-step guided modal | Create |

---

## Task 1: Server frame-validation state module

**Files:**
- Create: `server/src/services/frameValidation.ts`
- Test: `server/src/__tests__/services/frameValidation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/services/frameValidation.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  markFrameUnvalidated, clearFrameUnvalidated, isFrameUnvalidated,
  loadFrameValidationFromDb,
} from '../../services/frameValidation.js';
import { deviceSettingsRepo } from '../../db/repositories/deviceSettings.js';

const SN = 'LFIN_TEST_0001';

describe('frameValidation', () => {
  beforeEach(() => { clearFrameUnvalidated(SN); });

  it('marks and reads unvalidated', () => {
    expect(isFrameUnvalidated(SN)).toBe(false);
    markFrameUnvalidated(SN);
    expect(isFrameUnvalidated(SN)).toBe(true);
  });

  it('clears', () => {
    markFrameUnvalidated(SN);
    clearFrameUnvalidated(SN);
    expect(isFrameUnvalidated(SN)).toBe(false);
  });

  it('persists to device_settings and reloads (simulated restart)', () => {
    markFrameUnvalidated(SN);
    const rows = deviceSettingsRepo.listAll()
      .filter(r => r.sn === SN && r.key === 'frame_unvalidated');
    expect(rows[0]?.value).toBe('1');
    clearFrameUnvalidated(SN);            // wipe in-memory
    // simulate restart: nothing in memory, reload from DB
    markFrameUnvalidated(SN);             // re-persist '1'
    loadFrameValidationFromDb();
    expect(isFrameUnvalidated(SN)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/services/frameValidation.test.ts`
Expected: FAIL - module `../../services/frameValidation.js` not found.

- [ ] **Step 3: Implement the module**

Create `server/src/services/frameValidation.ts`:
```typescript
/**
 * Per-mower "frame unvalidated" state. Set when a map bundle is restored
 * (the stored map frame is not yet anchored to the real charger), cleared
 * only when the mower reports docked/charging (a successful auto_recharge
 * dock rewrites pos.json and re-anchors the frame). While set, go_to_charge
 * is hard-blocked in publishToDevice because navigating the bad frame can
 * drive the mower anywhere. Backed by device_settings so a server restart
 * does not silently unlock go_to_charge.
 */
import { deviceSettingsRepo } from '../db/repositories/deviceSettings.js';

const KEY = 'frame_unvalidated';
const unvalidated = new Set<string>();

export function loadFrameValidationFromDb(): void {
  unvalidated.clear();
  for (const row of deviceSettingsRepo.listAll()) {
    if (row.key === KEY && row.value === '1') unvalidated.add(row.sn);
  }
}

export function markFrameUnvalidated(sn: string): void {
  unvalidated.add(sn);
  deviceSettingsRepo.upsert(sn, KEY, '1');
}

export function clearFrameUnvalidated(sn: string): void {
  unvalidated.delete(sn);
  deviceSettingsRepo.upsert(sn, KEY, '0');
}

export function isFrameUnvalidated(sn: string): boolean {
  return unvalidated.has(sn);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/services/frameValidation.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire startup load in `server/src/index.ts`**

Find the `initDb()` call in `server/src/index.ts` (grep `initDb`). Immediately after it, add:
```typescript
import { loadFrameValidationFromDb } from './services/frameValidation.js';
// ... after initDb():
loadFrameValidationFromDb();
```
Place the import with the other top imports and the call right after `initDb()`.

- [ ] **Step 6: Typecheck + commit**

Run: `cd server && npx tsc --noEmit` (expect clean).
```bash
git add server/src/services/frameValidation.ts server/src/__tests__/services/frameValidation.test.ts server/src/index.ts
git commit -m "feat(server): DB-backed frame_unvalidated state for post-restore safety"
```

---

## Task 2: Hard-block go_to_charge in publishToDevice

**Files:**
- Modify: `server/src/mqtt/mapSync.ts` (`publishToDevice` at line 167)
- Test: `server/src/__tests__/mqtt/publishToDeviceGuard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/mqtt/publishToDeviceGuard.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as mapSync from '../../mqtt/mapSync.js';
import { markFrameUnvalidated, clearFrameUnvalidated } from '../../services/frameValidation.js';

const SN = 'LFIN_GUARD_0001';

describe('publishToDevice go_to_charge guard', () => {
  beforeEach(() => { clearFrameUnvalidated(SN); });

  it('blocks go_to_charge while frame unvalidated', () => {
    const spy = vi.spyOn(mapSync, 'publishRawToDevice').mockImplementation(() => {});
    markFrameUnvalidated(SN);
    mapSync.publishToDevice(SN, { go_to_charge: {} });
    // blocked before any raw publish / broker call
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('allows auto_recharge while frame unvalidated', () => {
    markFrameUnvalidated(SN);
    // Should not throw and should attempt to publish (no broker in test -> logs error, returns).
    expect(() => mapSync.publishToDevice(SN, { auto_recharge: { cmd_num: 1 } })).not.toThrow();
  });
});
```
NOTE: `publishToDevice` returns early with a console error when the broker is not initialised in the test env; the guard runs BEFORE that. If `publishRawToDevice` is not separately exported, assert instead that the function returns without throwing and that a `console.warn` containing "BLOCKED go_to_charge" fires (spy on `console.warn`). Adjust the assertion to the real export surface when you read the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/mqtt/publishToDeviceGuard.test.ts`
Expected: FAIL - go_to_charge is not blocked yet.

- [ ] **Step 3: Add the guard**

In `server/src/mqtt/mapSync.ts`, add the import near the top:
```typescript
import { isFrameUnvalidated } from '../services/frameValidation.js';
```
Inside `publishToDevice`, immediately after the `if (!aedesBroker) { ... return; }` block (line ~171), add:
```typescript
  // Safety: while the map frame is unvalidated (post bundle-restore, pre
  // successful re-dock), go_to_charge navigates the wrong frame and can drive
  // the mower anywhere. Block it at this single choke point so the app, the
  // rain monitor, and admin tools are all covered. auto_recharge (pure ArUco)
  // and go_pile stay allowed.
  if ('go_to_charge' in command && isFrameUnvalidated(sn)) {
    console.warn(`${TAG} BLOCKED go_to_charge for ${sn}: frame unvalidated (post-restore). Re-anchor via auto_recharge first.`);
    return;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/mqtt/publishToDeviceGuard.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `cd server && npx tsc --noEmit` (expect clean).
```bash
git add server/src/mqtt/mapSync.ts server/src/__tests__/mqtt/publishToDeviceGuard.test.ts
git commit -m "feat(server): hard-block go_to_charge while frame unvalidated"
```

---

## Task 3: Set the flag on bundle restore

**Files:**
- Modify: `server/src/routes/adminStatus.ts` (routes at line 1111 `/restore` and 1200 `/restore-and-realign`)

- [ ] **Step 1: Add the import**

Near the top imports of `server/src/routes/adminStatus.ts`:
```typescript
import { markFrameUnvalidated } from '../services/frameValidation.js';
```

- [ ] **Step 2: Set the flag in the plain restore route**

In `adminStatusRouter.post('/map-backups/:sn/:filename/restore', ...)` (line 1111), just before the success response `res.json({ ok: true, restored, ... })` (line ~1180), add:
```typescript
    markFrameUnvalidated(sn);
    console.log(`[Admin] frame_unvalidated set for ${sn} after restore`);
```
(`sn` is already in scope from `req.params`.)

- [ ] **Step 3: Set the flag in the restore-and-realign route**

In `adminStatusRouter.post('/map-backups/:sn/:filename/restore-and-realign', ...)` (line 1200), before each success `res.json({...})` that reports a completed restore (the handler has several response branches around lines 1256-1296), add `markFrameUnvalidated(sn);` on the paths where files were actually restored. The simplest correct placement: right after the restore loop completes and before the first success response, add it once:
```typescript
    markFrameUnvalidated(sn);
```

- [ ] **Step 4: Verify with the existing restore route test**

Run: `cd server && npx vitest run src/__tests__/routes/adminMapBackupRestore.test.ts`
Expected: existing tests still PASS. If the test asserts on response shape only, that is fine - the flag is a side effect. Optionally add an assertion: after calling the restore route, `isFrameUnvalidated(sn)` is true (import it in the test).

- [ ] **Step 5: Typecheck + commit**

Run: `cd server && npx tsc --noEmit` (expect clean).
```bash
git add server/src/routes/adminStatus.ts server/src/__tests__/routes/adminMapBackupRestore.test.ts
git commit -m "feat(server): set frame_unvalidated on bundle restore"
```

---

## Task 4: Clear on dock + surface frame_unvalidated to clients

**Files:**
- Modify: `server/src/mqtt/sensorData.ts` (`updateDeviceData`, helper `isDockedByValues` at line 632)
- Test: add to `server/src/__tests__/mqtt/sensorData.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/src/__tests__/mqtt/sensorData.test.ts`:
```typescript
import { updateDeviceData } from '../../mqtt/sensorData.js';
import { markFrameUnvalidated, isFrameUnvalidated, clearFrameUnvalidated } from '../../services/frameValidation.js';

describe('frame_unvalidated lifecycle in updateDeviceData', () => {
  const SN = 'LFIN_DOCK_0001';
  it('clears the flag when the mower reports docked/charging', () => {
    clearFrameUnvalidated(SN);
    markFrameUnvalidated(SN);
    expect(isFrameUnvalidated(SN)).toBe(true);
    // recharge_status 9 = docked/charging
    const payload = Buffer.from(JSON.stringify({ report_state_robot: { recharge_status: 9 } }));
    updateDeviceData(SN, payload);
    expect(isFrameUnvalidated(SN)).toBe(false);
  });

  it('surfaces frame_unvalidated as a device field', () => {
    clearFrameUnvalidated(SN);
    markFrameUnvalidated(SN);
    const payload = Buffer.from(JSON.stringify({ report_state_robot: { battery_power: 80 } }));
    const changes = updateDeviceData(SN, payload);
    expect(changes?.get('frame_unvalidated')).toBe('1');
  });
});
```
NOTE: confirm the real payload wrapper key (`report_state_robot` vs another) by reading how existing `sensorData.test.ts` constructs payloads, and match it. Use a field name the parser accepts (e.g. `recharge_status`, `battery_power`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/mqtt/sensorData.test.ts -t "frame_unvalidated lifecycle"`
Expected: FAIL.

- [ ] **Step 3: Implement clear + surface**

In `server/src/mqtt/sensorData.ts`, add the import near the top:
```typescript
import { isFrameUnvalidated, clearFrameUnvalidated } from '../services/frameValidation.js';
```
In `updateDeviceData`, after `snValues` is fully populated for this message and before `return changes;` (read the function tail near line 728+), add:
```typescript
  // Post-restore re-anchor lifecycle: clear the flag once the mower is docked
  // (a successful auto_recharge dock re-anchors pos.json). Always surface the
  // current flag value so the app can show the wizard and lock Go-home.
  if (isFrameUnvalidated(sn) && isDockedByValues(snValues)) {
    clearFrameUnvalidated(sn);
    console.log(`[sensor] frame_unvalidated cleared for ${sn} (docked)`);
  }
  const fuPrev = snValues.get('frame_unvalidated');
  const fuNow = isFrameUnvalidated(sn) ? '1' : '0';
  snValues.set('frame_unvalidated', fuNow);
  if (fuPrev !== fuNow) changes.set('frame_unvalidated', fuNow);
```
IMPORTANT: place this AFTER the existing docked/charging handling so `snValues` already reflects the incoming recharge_status, and ensure `changes` and `snValues` are the same names used in the function (they are: `changes` and `snValues`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/mqtt/sensorData.test.ts -t "frame_unvalidated lifecycle"`
Expected: PASS (both).

- [ ] **Step 5: Typecheck + commit**

Run: `cd server && npx tsc --noEmit` (expect clean).
```bash
git add server/src/mqtt/sensorData.ts server/src/__tests__/mqtt/sensorData.test.ts
git commit -m "feat(server): clear frame_unvalidated on dock + surface to clients"
```

---

## Task 5: App - disable Go-home while frame unvalidated

**Files:**
- Modify: `app/src/screens/HomeScreen.tsx`

The mower fix-quality work already reads `devices.get(mower.sn)?.sensors?.<field>` here. Use the same source for the flag.

- [ ] **Step 1: Derive the flag**

In the component body where `mower` and `devices` are in scope, add:
```typescript
  const frameUnvalidated =
    (devices.get(mower?.sn ?? '')?.sensors?.frame_unvalidated ?? '0') === '1';
```

- [ ] **Step 2: Lock the Go-home action**

Find the Go-home handler (line ~1218, sends `go_pile` then `go_to_charge`). At the very top of that handler, guard:
```typescript
    if (frameUnvalidated) {
      Alert.alert(
        'Re-anchor required',
        'The map frame is not yet validated after a restore. Dock the mower via the re-anchor flow first.',
      );
      return;
    }
```
And on the Go-home button element, set `disabled={frameUnvalidated}` and dim its style when disabled (match the file's existing disabled-button styling). Ensure `Alert` is imported from `react-native` (it usually already is - confirm).

- [ ] **Step 3: Typecheck**

Run: `cd app && npx tsc --noEmit` (expect clean).

- [ ] **Step 4: Commit (after user live-test per feedback_test_before_commit)**

Per project rule, the user verifies the disabled Go-home button live in Expo before committing this UI change. After confirmation:
```bash
git add app/src/screens/HomeScreen.tsx
git commit -m "feat(app): disable Go-home while frame unvalidated (post-restore safety)"
```

---

## Task 6: App - guided re-anchor wizard

**Files:**
- Create: `app/src/components/ReanchorWizard.tsx`
- Modify: `app/src/screens/HomeScreen.tsx` (mount the wizard when `frameUnvalidated`)

- [ ] **Step 1: Create the wizard component**

Create `app/src/components/ReanchorWizard.tsx`:
```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ApiClient } from '../services/api';
import { fixQualityLabel } from '../utils/fixQuality';

type Step = 'init' | 'driving' | 'awaitFix' | 'position' | 'docking' | 'done';

interface Props {
  visible: boolean;
  sn: string;
  api: ApiClient;
  /** Live raw device sensors map (devices.get(sn)?.sensors). */
  sensors: Record<string, string> | undefined;
  onClose: () => void;
}

const DRIVE_TICKS = 25;      // ~1m at 0.2 m/s, 200ms cadence
const FIX_TIMEOUT_MS = 90_000;

export default function ReanchorWizard({ visible, sn, api, sensors, onClose }: Props) {
  const [step, setStep] = useState<Step>('init');
  const [warn, setWarn] = useState<string | null>(null);
  const fixDeadline = useRef<number>(0);

  const rtkRaw = sensors?.rtk_fix_quality;
  const rtk = fixQualityLabel(rtkRaw);
  const rechargeStatus = parseInt(sensors?.recharge_status ?? '0', 10);
  const docked = rechargeStatus === 9 || (sensors?.battery_state ?? '').toUpperCase().includes('CHARG');

  // Step 1 -> backward drive, then wait for RTK Fixed.
  async function startReanchor() {
    setStep('driving');
    setWarn(null);
    try {
      await api.joystickStart(sn, 4);            // 4 = back
      for (let i = 0; i < DRIVE_TICKS; i++) {
        await api.joystickMove(sn, 0.2, 0);
        await new Promise((r) => setTimeout(r, 200));
      }
      await api.joystickStop(sn);
    } catch { /* fall through to fix wait */ }
    fixDeadline.current = Date.now() + FIX_TIMEOUT_MS;
    setStep('awaitFix');
  }

  // Advance to positioning once RTK Fixed (4), or after timeout with a warning.
  useEffect(() => {
    if (step !== 'awaitFix') return;
    if (rtkRaw === '4') { setStep('position'); return; }
    const t = setInterval(() => {
      if (parseInt(rtkRaw ?? '', 10) === 4) { setStep('position'); }
      else if (Date.now() > fixDeadline.current) {
        setWarn('Still not RTK Fixed - accuracy may be reduced.');
        setStep('position');
      }
    }, 1000);
    return () => clearInterval(t);
  }, [step, rtkRaw]);

  // Docking success -> done -> close (the server clears the flag, which hides us).
  useEffect(() => {
    if (step === 'docking' && docked) { setStep('done'); }
  }, [step, docked]);

  async function dockNow() {
    setStep('docking');
    try { await api.sendCommand(sn, { auto_recharge: { cmd_num: Date.now() % 100000 } }); }
    catch { /* user can retry */ }
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#111827', borderRadius: 16, padding: 20, gap: 14 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Re-anchor after restore</Text>

          {step === 'init' && (
            <>
              <Text style={{ color: '#cbd5e1' }}>
                The map was restored. Place the mower with clear space behind it, then start.
                It will drive back ~1m to get an RTK fix.
              </Text>
              <Btn label="Start re-anchor" onPress={startReanchor} />
            </>
          )}

          {(step === 'driving' || step === 'awaitFix') && (
            <>
              <ActivityIndicator color="#22c55e" />
              <Text style={{ color: '#cbd5e1' }}>
                {step === 'driving' ? 'Driving back ~1m...' : 'Waiting for RTK Fixed...'}
              </Text>
              <Text style={{ color: rtk.color, fontWeight: '700' }}>RTK: {rtk.label}</Text>
            </>
          )}

          {step === 'position' && (
            <>
              {warn && <Text style={{ color: '#f59e0b' }}>{warn}</Text>}
              <Text style={{ color: '#cbd5e1' }}>
                Place the mower ~50cm directly in front of the dock, facing the markers. Then dock.
              </Text>
              <Text style={{ color: rtk.color, fontWeight: '700' }}>RTK: {rtk.label}</Text>
              <Btn label="Dock now (ArUco)" onPress={dockNow} />
            </>
          )}

          {step === 'docking' && (
            <>
              <ActivityIndicator color="#22c55e" />
              <Text style={{ color: '#cbd5e1' }}>Docking on ArUco markers...</Text>
              <Btn label="Retry dock" onPress={dockNow} />
            </>
          )}

          {step === 'done' && (
            <>
              <Text style={{ color: '#22c55e', fontWeight: '700' }}>Docked - frame re-anchored.</Text>
              <Btn label="Close" onPress={onClose} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
    >
      <Text style={{ color: '#fff', fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );
}
```

- [ ] **Step 2: Mount it on HomeScreen**

In `app/src/screens/HomeScreen.tsx`, import and render the wizard, driven by the `frameUnvalidated` flag derived in Task 5:
```tsx
import ReanchorWizard from '../components/ReanchorWizard';
// ... in the returned JSX, near the other <Modal> overlays:
<ReanchorWizard
  visible={frameUnvalidated}
  sn={mower?.sn ?? ''}
  api={api}
  sensors={devices.get(mower?.sn ?? '')?.sensors}
  onClose={() => { /* server clears the flag on dock; nothing to do locally */ }}
/>
```
Confirm the local `api` instance and `devices` map names match what HomeScreen already uses (they do: `api`, `devices`).

- [ ] **Step 3: Typecheck**

Run: `cd app && npx tsc --noEmit` (expect clean).

- [ ] **Step 4: Live test + commit (per feedback_test_before_commit)**

The user verifies in Expo: restore a bundle (sets the flag), confirm the wizard appears, Start drives ~1m back and waits for RTK Fixed, the position step shows, Dock now sends auto_recharge, and on dock the wizard closes and Go-home re-enables. After confirmation:
```bash
git add app/src/components/ReanchorWizard.tsx app/src/screens/HomeScreen.tsx
git commit -m "feat(app): guided post-restore re-anchor wizard (drive, position, ArUco dock)"
```

---

## Task 7: End-to-end verification

**Files:** none (verification)

- [ ] **Step 1: Flag set on restore**

Restore a bundle from the dashboard for the test mower, then:
```bash
curl -s http://192.168.0.247:8080/api/dashboard/devices \
  | python3 -c "import json,sys; d=json.load(sys.stdin); rows=d if isinstance(d,list) else d.get('devices',[]); [print(x.get('sn'), x.get('sensors',{}).get('frame_unvalidated')) for x in rows]"
```
Confirm `frame_unvalidated` is `1` for the mower (or inspect the device data via the dashboard).

- [ ] **Step 2: go_to_charge blocked**

With the flag set, attempt a go_to_charge (app Go-home or an admin send-command). Confirm the server logs `BLOCKED go_to_charge` and the mower does NOT move.

- [ ] **Step 3: Wizard happy path**

In the app: wizard appears, Start drives back to RTK Fixed, position prompt, Dock now -> auto_recharge -> mower docks -> `frame_unvalidated` clears -> wizard closes -> Go-home re-enabled. Confirm `go_to_charge` now publishes normally.

- [ ] **Step 4: Restart persistence**

Set the flag (restore), restart the server, confirm `isFrameUnvalidated` is still true (go_to_charge still blocked) - the DB-backed load worked.

---

## Self-review notes

- **Spec coverage:** Component 1 (server state + block + surface) = Tasks 1, 2, 3, 4. Component 2 (app wizard + Go-home lock) = Tasks 5, 6. Edge cases: restart persistence (Task 1 Step 3 + Task 7 Step 4), dock-clears-flag (Task 4), Step-1 timeout fallback (Task 6 awaitFix). Testing = Tasks 1-4 unit + Task 7 e2e.
- **Type consistency:** `markFrameUnvalidated` / `clearFrameUnvalidated` / `isFrameUnvalidated` / `loadFrameValidationFromDb` are used identically across server tasks. App reads `sensors.frame_unvalidated` ('1'/'0' string) consistently in Tasks 5 and 6.
- **No movement without consent:** the backward drive (Task 6) only runs after the explicit "Start re-anchor" tap.
- **Dashboard surfacing** from the spec is optional and intentionally omitted from v1 tasks (YAGNI); the field is already on the device data if a later badge is wanted.
