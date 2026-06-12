# BETA Custom-Firmware Install Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep custom (BETA) mower firmware installable, but guarantee a fresh map backup (≤24h) is taken before any beta flash, and show OpenNova users a loud BETA warning before they confirm.

**Architecture:** A server-side gate is the unbypassable backbone — it auto-creates a portable backup before dispatching a beta (custom/opennova) OTA to a mower, on both the dashboard/Expo `POST /ota/trigger/:sn` path and the stock-app MQTT path (broker `authorizePublish`). OpenNova clients (dashboard + Expo app) layer a red BETA confirmation dialog on top. The stock Flutter app is protected silently. Charger and stock firmware are never gated.

**Tech Stack:** TypeScript, Node/Express, Aedes MQTT broker, better-sqlite3, Vitest (server), React + Vite (dashboard), React Native / Expo (app).

**Spec:** `docs/superpowers/specs/2026-06-12-beta-firmware-install-gate-design.md`

---

## File Structure

**Server (enforcement — the backbone):**
- Create `server/src/services/firmwareSafety.ts` — beta detection, backup-recency check, `ensureBetaFlashSafe()` gate, and the canonical warning constant.
- Create `server/src/__tests__/services/firmwareSafety.test.ts` — unit tests for the gate.
- Modify `server/src/routes/dashboard.ts` — make `/ota/trigger/:sn` async and call the gate in the mower branch.
- Modify `server/src/mqtt/broker.ts` — call the gate in the `ota_upgrade_cmd` intercept (stock-app path).

**Dashboard (OpenNova warning UI):**
- Create `dashboard/src/utils/betaFirmware.ts` — `BETA_FIRMWARE_WARNING_LINES` constant (mirrors server copy).
- Modify `dashboard/src/api/client.ts` — add `createPortableBackup()` + `fetchPortableBackups()`.
- Modify `dashboard/src/components/ota/OtaManager.tsx` — add `beta` confirm variant + backup pre-create.

**Expo app (OpenNova warning UI):**
- Create `app/src/utils/betaFirmware.ts` — `BETA_FIRMWARE_WARNING_LINES` constant (mirrors server copy).
- Modify `app/src/services/api.ts` — add `createPortableBackup()`.
- Modify `app/src/screens/OtaScreen.tsx` — add BETA warning modal + backup pre-create before `triggerOta`.

**Messaging-only surfaces:**
- Modify `docs/reference/OTA.md`, `README.md`, `research/build_custom_firmware.sh`, and the installer/wizard custom-firmware screen.

---

## Task 1: Server beta-detection + recency helpers

**Files:**
- Create: `server/src/services/firmwareSafety.ts`
- Test: `server/src/__tests__/services/firmwareSafety.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/__tests__/services/firmwareSafety.test.ts
import { describe, it, expect } from 'vitest';
import { isBetaFirmware, BACKUP_MAX_AGE_MS, BETA_FIRMWARE_WARNING } from '../../services/firmwareSafety.js';

describe('isBetaFirmware', () => {
  it('flags custom builds', () => {
    expect(isBetaFirmware('v6.0.2-custom-36')).toBe(true);
    expect(isBetaFirmware('v6.0.2-opennova-1')).toBe(true);
    expect(isBetaFirmware('V6.0.2-CUSTOM-2')).toBe(true);
  });
  it('does not flag stock builds', () => {
    expect(isBetaFirmware('v6.0.2')).toBe(false);
    expect(isBetaFirmware('v5.7.1')).toBe(false);
    expect(isBetaFirmware('')).toBe(false);
    expect(isBetaFirmware(null)).toBe(false);
    expect(isBetaFirmware(undefined)).toBe(false);
  });
  it('exposes a 24h recency window and a non-empty warning', () => {
    expect(BACKUP_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
    expect(BETA_FIRMWARE_WARNING.length).toBeGreaterThan(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/services/firmwareSafety.test.ts`
Expected: FAIL — `Cannot find module '../../services/firmwareSafety.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// server/src/services/firmwareSafety.ts
/**
 * Firmware safety gate — guarantees a fresh map backup before a BETA
 * (custom/opennova) mower firmware flash. See
 * docs/superpowers/specs/2026-06-12-beta-firmware-install-gate-design.md
 */
import { listBackups, createBackup, type BackupEntry } from './portableBackup.js';
import { mapRepo } from '../db/repositories/index.js';

/** Reuse a backup younger than this; otherwise make a fresh one. */
export const BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Canonical BETA warning copy. Clients mirror this text per-package. */
export const BETA_FIRMWARE_WARNING =
  '⚠️ BETA — Custom firmware. Dit is experimentele software. Het kan je maaier ' +
  'onbruikbaar maken (bricken) en AL je kaarten wissen. Er wordt automatisch een ' +
  'backup gemaakt, maar installeer alleen als je de risico’s accepteert.';

/** True for custom/opennova builds (the BETA firmware we gate). */
export function isBetaFirmware(version: string | null | undefined): boolean {
  if (!version) return false;
  const v = version.toLowerCase();
  return v.includes('custom') || v.includes('opennova');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/services/firmwareSafety.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/firmwareSafety.ts server/src/__tests__/services/firmwareSafety.test.ts
git commit -m "feat(server): beta firmware detection + recency constants"
```

---

## Task 2: Server gate `ensureBetaFlashSafe()`

**Files:**
- Modify: `server/src/services/firmwareSafety.ts`
- Test: `server/src/__tests__/services/firmwareSafety.test.ts`

The gate returns a discriminated result. `hasMapsToProtect()` decides whether a
failed backup is a hard block (maps exist) or a safe pass (nothing to lose).

- [ ] **Step 1: Write the failing test**

Append to `server/src/__tests__/services/firmwareSafety.test.ts`:

```typescript
import { describe as describe2, it as it2, expect as expect2, vi, beforeEach } from 'vitest';
import * as backup from '../../services/portableBackup.js';
import { mapRepo } from '../../db/repositories/index.js';
import { ensureBetaFlashSafe } from '../../services/firmwareSafety.js';

describe2('ensureBetaFlashSafe', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it2('passes through stock firmware without touching backups', async () => {
    const spy = vi.spyOn(backup, 'createBackup');
    const r = await ensureBetaFlashSafe('LFIN2230700238', 'v6.0.2');
    expect2(r).toEqual({ allowed: true, backup: null, reason: 'not-beta' });
    expect2(spy).not.toHaveBeenCalled();
  });

  it2('reuses a backup younger than 24h', async () => {
    vi.spyOn(backup, 'listBackups').mockReturnValue([
      { filename: 'x.novabotmap', bytes: 10, createdAt: Date.now() - 1000, reason: 'manual' },
    ]);
    const create = vi.spyOn(backup, 'createBackup');
    const r = await ensureBetaFlashSafe('LFIN2230700238', 'v6.0.2-custom-36');
    expect2(r.allowed).toBe(true);
    expect2(create).not.toHaveBeenCalled();
  });

  it2('creates a fresh backup when none is recent', async () => {
    vi.spyOn(backup, 'listBackups').mockReturnValue([]);
    const entry = { filename: 'new.novabotmap', bytes: 20, createdAt: Date.now(), reason: 'pre-beta-flash' };
    vi.spyOn(backup, 'createBackup').mockResolvedValue(entry);
    const r = await ensureBetaFlashSafe('LFIN2230700238', 'v6.0.2-custom-36');
    expect2(r).toEqual({ allowed: true, backup: entry, reason: 'backup-created' });
  });

  it2('blocks when maps exist but the backup fails', async () => {
    vi.spyOn(backup, 'listBackups').mockReturnValue([]);
    vi.spyOn(backup, 'createBackup').mockResolvedValue(null);
    vi.spyOn(mapRepo, 'findAllByMowerSnAndType').mockReturnValue([{ map_area: '[[0,0]]' } as any]);
    const r = await ensureBetaFlashSafe('LFIN2230700238', 'v6.0.2-custom-36');
    expect2(r).toEqual({ allowed: false, error: 'BACKUP_FAILED', detail: expect2.any(String) });
  });

  it2('allows beta flash when there are no maps to lose', async () => {
    vi.spyOn(backup, 'listBackups').mockReturnValue([]);
    vi.spyOn(backup, 'createBackup').mockResolvedValue(null);
    vi.spyOn(mapRepo, 'findAllByMowerSnAndType').mockReturnValue([]);
    const r = await ensureBetaFlashSafe('LFIN2230700238', 'v6.0.2-custom-36');
    expect2(r).toEqual({ allowed: true, backup: null, reason: 'no-maps' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/services/firmwareSafety.test.ts`
Expected: FAIL — `ensureBetaFlashSafe is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `server/src/services/firmwareSafety.ts`:

```typescript
export type BetaFlashGate =
  | { allowed: true; backup: BackupEntry | null; reason: 'not-beta' | 'recent-backup' | 'backup-created' | 'no-maps' }
  | { allowed: false; error: 'BACKUP_FAILED'; detail: string };

/** True when the mower has at least one work polygon worth protecting. */
export function hasMapsToProtect(sn: string): boolean {
  try {
    return mapRepo.findAllByMowerSnAndType(sn, 'work').some((w: any) => w.map_area);
  } catch {
    return false;
  }
}

/** Newest backup for `sn` whose age is within BACKUP_MAX_AGE_MS, else null. */
function recentBackup(sn: string): BackupEntry | null {
  const newest = listBackups(sn).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!newest) return null;
  return (Date.now() - newest.createdAt) <= BACKUP_MAX_AGE_MS ? newest : null;
}

/**
 * Guarantee a fresh backup before a BETA mower flash. Stock firmware and
 * chargers should never reach here (callers gate on device type), but stock
 * versions are passed through defensively.
 */
export async function ensureBetaFlashSafe(sn: string, version: string | null | undefined): Promise<BetaFlashGate> {
  if (!isBetaFirmware(version)) return { allowed: true, backup: null, reason: 'not-beta' };

  const recent = recentBackup(sn);
  if (recent) return { allowed: true, backup: recent, reason: 'recent-backup' };

  const created = await createBackup(sn, 'pre-beta-flash');
  if (created) return { allowed: true, backup: created, reason: 'backup-created' };

  if (hasMapsToProtect(sn)) {
    return { allowed: false, error: 'BACKUP_FAILED', detail: `Kon geen backup maken voor ${sn} terwijl er kaarten zijn — flash geblokkeerd.` };
  }
  return { allowed: true, backup: null, reason: 'no-maps' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/services/firmwareSafety.test.ts`
Expected: PASS (all tests). If the `vi.spyOn(backup, 'createBackup')` mock fails because the module exports are read-only under ESM, change the import in the test to `import * as backup from ...` is already used; if still read-only, add `vi.mock('../../services/portableBackup.js')` at top of the new describe block and provide factory stubs. Verify pass before continuing.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/firmwareSafety.ts server/src/__tests__/services/firmwareSafety.test.ts
git commit -m "feat(server): ensureBetaFlashSafe gate auto-backs-up before beta flash"
```

---

## Task 3: Wire gate into dashboard/Expo OTA trigger route

**Files:**
- Modify: `server/src/routes/dashboard.ts` (route at `dashboardRouter.post('/ota/trigger/:sn', ...)`, ~line 4211)
- Test: `server/src/__tests__/routes/otaTriggerBetaGate.test.ts` (create)

The route is currently a synchronous handler. Convert it to `async` and insert
the gate in the **mower** branch only, just before building `mowerOtaCommand`.

- [ ] **Step 1: Add the import**

At the top of `server/src/routes/dashboard.ts`, with the other imports:

```typescript
import { ensureBetaFlashSafe } from '../services/firmwareSafety.js';
```

- [ ] **Step 2: Make the handler async**

Change the handler signature:

```typescript
dashboardRouter.post('/ota/trigger/:sn', async (req: Request, res: Response) => {
```

- [ ] **Step 3: Insert the gate in the mower branch**

In the `else` (mower) branch, immediately **before** the line
`const mowerOtaCommand = {`, insert:

```typescript
    // ── BETA gate: custom/opennova firmware must have a fresh backup first ──
    const gate = await ensureBetaFlashSafe(sn, otaVersion.version);
    if (!gate.allowed) {
      console.warn(`\x1b[31m[OTA] BETA flash geblokkeerd voor ${sn}: ${gate.detail}\x1b[0m`);
      res.status(409).json({ error: gate.error, detail: gate.detail });
      return;
    }
    if (gate.backup) {
      console.log(`\x1b[38;5;208m[OTA] BETA backup ok (${gate.reason}): ${gate.backup.filename}\x1b[0m`);
    }
```

- [ ] **Step 4: Return backup info to the client**

Change the final mower-path success response so clients can show the ✓. Replace:

```typescript
  res.json({ ok: true, command: 'ota_upgrade_cmd', version: otaVersion.version, target: sn });
```

with:

```typescript
  res.json({
    ok: true,
    command: 'ota_upgrade_cmd',
    version: otaVersion.version,
    target: sn,
    backup: !isCharger && typeof gate !== 'undefined' && gate.allowed ? gate.backup : null,
  });
```

Note: `gate` is only defined in the mower branch. To keep the final `res.json`
valid for the charger branch too, declare `let gate: Awaited<ReturnType<typeof ensureBetaFlashSafe>> | undefined;`
near the top of the handler (right after `const { sn } = req.params;`) and change
the in-branch line from `const gate =` to `gate =`.

- [ ] **Step 5: Write the route test**

```typescript
// server/src/__tests__/routes/otaTriggerBetaGate.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the gate so we test wiring, not backup internals.
vi.mock('../../services/firmwareSafety.js', () => ({
  ensureBetaFlashSafe: vi.fn(),
  isBetaFirmware: (v: string) => /custom|opennova/i.test(v ?? ''),
}));

import { ensureBetaFlashSafe } from '../../services/firmwareSafety.js';
import { dashboardRouter } from '../../routes/dashboard.js';
import { otaVersionRepo } from '../../db/repositories/index.js';

const app = express();
app.use(express.json());
app.use('/api/dashboard', dashboardRouter);

describe('POST /ota/trigger/:sn beta gate', () => {
  beforeEach(() => {
    vi.spyOn(otaVersionRepo, 'findById').mockReturnValue({
      id: 1, version: 'v6.0.2-custom-36', device_type: 'mower',
      download_url: 'http://localhost/api/dashboard/firmware/fw.deb', md5: 'abc',
    } as any);
  });

  it('returns 409 BACKUP_FAILED when the gate blocks', async () => {
    (ensureBetaFlashSafe as any).mockResolvedValue({ allowed: false, error: 'BACKUP_FAILED', detail: 'no backup' });
    const res = await request(app).post('/api/dashboard/ota/trigger/LFIN2230700238').send({ version_id: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('BACKUP_FAILED');
  });

  it('dispatches and returns backup info when allowed', async () => {
    (ensureBetaFlashSafe as any).mockResolvedValue({ allowed: true, reason: 'backup-created', backup: { filename: 'b.novabotmap', bytes: 1, createdAt: 1, reason: 'pre-beta-flash' } });
    const res = await request(app).post('/api/dashboard/ota/trigger/LFIN2230700238').send({ version_id: 1 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.backup.filename).toBe('b.novabotmap');
  });
});
```

- [ ] **Step 6: Run the test**

Run: `cd server && npx vitest run src/__tests__/routes/otaTriggerBetaGate.test.ts`
Expected: PASS (2 tests). If `dashboardRouter` import pulls heavy side-effect modules that fail under test, follow the pattern in `server/src/__tests__/routes/adminMdnsRestart.test.ts` for stubbing; keep mocking the gate. Verify pass.

- [ ] **Step 7: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add server/src/routes/dashboard.ts server/src/__tests__/routes/otaTriggerBetaGate.test.ts
git commit -m "feat(server): gate beta OTA on /ota/trigger with mandatory backup"
```

---

## Task 4: Wire gate into broker intercept (stock-app MQTT path)

**Files:**
- Modify: `server/src/mqtt/broker.ts` (the `parsed.ota_upgrade_cmd` block, ~line 522)

The stock Flutter app publishes `ota_upgrade_cmd` to `Dart/Send_mqtt/<SN>`; the
broker already intercepts it to strip `tz`. After re-encrypting, gate on the
firmware version: for BETA, ensure a backup exists before forwarding. Because
`authorizePublish` is callback-based, defer the `callback` until the async gate
resolves; deny (block forwarding) on `BACKUP_FAILED`.

- [ ] **Step 1: Add the import**

At the top of `server/src/mqtt/broker.ts`, with the other imports:

```typescript
import { ensureBetaFlashSafe } from '../services/firmwareSafety.js';
```

- [ ] **Step 2: Gate after re-encryption**

Inside the `if (parsed.ota_upgrade_cmd) {` block, **after** the
`packet.payload = encrypted;` line and its log, insert:

```typescript
              // ── BETA gate: stock app flashing custom firmware must back up first ──
              const betaVersion = parsed.ota_upgrade_cmd.version as string | undefined;
              if (ensureBetaFlashSafe && betaVersion && /custom|opennova/i.test(betaVersion)) {
                void ensureBetaFlashSafe(sn, betaVersion).then((gate) => {
                  if (!gate.allowed) {
                    console.warn(`\x1b[31m[OTA-FIX] BETA flash geblokkeerd (stock app) voor ${sn}: ${gate.detail}\x1b[0m`);
                    callback(new Error('beta flash blocked: backup failed'));
                  } else {
                    if (gate.backup) console.log(`\x1b[38;5;208m[OTA-FIX] BETA backup ok (${gate.reason}): ${gate.backup.filename}\x1b[0m`);
                    callback(null);
                  }
                }).catch((e) => {
                  console.error(`[OTA-FIX] beta gate error for ${sn}:`, e);
                  callback(new Error('beta gate error'));
                });
                return; // async path owns the callback
              }
```

**Important:** this `return` must short-circuit only the OTA-beta case. Confirm
the surrounding function still calls `callback(null)` (or `packet`) for every
other branch. Read the function end (~line 660+) and ensure the normal
`callback(null)` at the bottom is reached when the beta branch does not `return`.

- [ ] **Step 3: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification note**

This path needs a live stock-app flash to fully verify; it is covered indirectly
by the Task 2 unit tests of `ensureBetaFlashSafe`. Add a code comment referencing
the spec so future readers know the broker path is intentionally gated. No new
automated test (broker harness is integration-heavy); rely on `tsc` + unit gate tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/mqtt/broker.ts
git commit -m "feat(server): gate stock-app beta OTA in broker intercept"
```

---

## Task 5: Dashboard client API — portable backup helpers

**Files:**
- Modify: `dashboard/src/api/client.ts`

- [ ] **Step 1: Add the helpers**

After the existing `triggerOta` export (~line 519), add:

```typescript
export interface PortableBackupEntry {
  filename: string;
  bytes: number;
  createdAt: number;
  reason: string;
}

/** List portable backups for a mower (newest-first not guaranteed). */
export async function fetchPortableBackups(sn: string): Promise<PortableBackupEntry[]> {
  const res = await fetch(`${API_BASE}/api/admin-status/maps/${encodeURIComponent(sn)}/portable-backups`, {
    credentials: 'include',
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.backups ?? [];
}

/** Create a portable backup now. Returns the new entry, or null on failure. */
export async function createPortableBackup(sn: string): Promise<PortableBackupEntry | null> {
  const res = await fetch(`${API_BASE}/api/admin-status/maps/${encodeURIComponent(sn)}/portable-backups`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.entry ?? json.backup ?? null;
}
```

Note: confirm the base-URL constant name used elsewhere in `client.ts` (search
for how `fetchOtaVersions` builds its URL) and match it — replace `API_BASE` and
`credentials: 'include'` with the file's existing convention if different. Also
confirm the POST response shape by reading the route at
`server/src/routes/adminStatus.ts` (~line 1512); adjust `json.entry ?? json.backup`.

- [ ] **Step 2: Typecheck**

Run: `cd dashboard && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/api/client.ts
git commit -m "feat(dashboard): portable backup API helpers"
```

---

## Task 6: Dashboard BETA confirm dialog

**Files:**
- Create: `dashboard/src/utils/betaFirmware.ts`
- Modify: `dashboard/src/components/ota/OtaManager.tsx`

This is UI; per project rule, wait for user test before final commit. Use the
existing `ConfirmDialog` machinery; add a `beta` variant and a backup pre-create.

- [ ] **Step 1: Create the shared copy constant**

```typescript
// dashboard/src/utils/betaFirmware.ts
// Mirrors server BETA_FIRMWARE_WARNING (firmwareSafety.ts). Keep in sync.
export const BETA_FIRMWARE_WARNING_LINES = [
  'Dit is BETA / experimentele custom firmware.',
  'De installatie kan de maaier onbruikbaar maken (bricken).',
  'Je kunt AL je kaarten verliezen.',
];
```

- [ ] **Step 2: Extend the dialog type and imports**

In `OtaManager.tsx`, import the predicate and copy + backup API:

```typescript
import { isOpenNovaFirmware } from '../../utils/firmwareCapability';
import { BETA_FIRMWARE_WARNING_LINES } from '../../utils/betaFirmware';
import { createPortableBackup, fetchPortableBackups } from '../../api/client';
```

Change the `ConfirmDialog.variant` union to include `'beta'`:

```typescript
  variant: 'danger' | 'warning' | 'info' | 'beta';
```

Add state for the pre-create backup result, near the other `useState` calls:

```typescript
  const [betaBackup, setBetaBackup] = useState<{ sn: string; ts: number | null; status: 'idle' | 'creating' | 'done' | 'failed' }>({ sn: '', ts: null, status: 'idle' });
```

- [ ] **Step 3: Branch the trigger click to the beta dialog**

In `handleTriggerClick`, at the very top (before the downgrade/same/upgrade
branching), add:

```typescript
    if (isMower && isOpenNovaFirmware(targetVersion)) {
      // Kick off a backup immediately so the user sees the ✓ before confirming.
      setBetaBackup({ sn, ts: null, status: 'creating' });
      void (async () => {
        const existing = await fetchPortableBackups(sn);
        const newest = existing.sort((a, b) => b.createdAt - a.createdAt)[0];
        const fresh = newest && (Date.now() - newest.createdAt) <= 24 * 60 * 60 * 1000 ? newest : null;
        const entry = fresh ?? await createPortableBackup(sn);
        setBetaBackup({ sn, ts: entry ? entry.createdAt : null, status: entry ? 'done' : 'failed' });
      })();
      setConfirmDialog({
        title: '⚠️ BETA CUSTOM FIRMWARE',
        message: BETA_FIRMWARE_WARNING_LINES.join('\n'),
        detail: `${deviceVersion ?? 'onbekend'}  →  ${targetVersion}${chargeNote}`,
        variant: 'beta',
        confirmLabel: 'Ik begrijp het, flash toch',
        onConfirm: () => { setConfirmDialog(null); handleTrigger(sn, versionId); },
      });
      return;
    }
```

- [ ] **Step 4: Render the beta styling + backup status**

In the dialog header style ternary, add the `beta` case (deep red), e.g. extend
the header `className` and icon logic so `variant === 'beta'` uses
`bg-red-950/60` and the `AlertTriangle` icon. In the dialog body, when
`confirmDialog.variant === 'beta'`, render the backup status line:

```tsx
{confirmDialog.variant === 'beta' && (
  <div className="mt-3 text-xs">
    {betaBackup.status === 'creating' && <span className="text-amber-300">Verse backup wordt gemaakt…</span>}
    {betaBackup.status === 'done' && <span className="text-emerald-400">Backup gemaakt ✓</span>}
    {betaBackup.status === 'failed' && <span className="text-red-400">Backup mislukt — flashen geblokkeerd</span>}
  </div>
)}
```

Disable the confirm button for the beta variant until the backup is done:

```tsx
disabled={confirmDialog.variant === 'beta' && betaBackup.status !== 'done'}
```

and give the beta confirm button a red style branch (`bg-red-700 hover:bg-red-600`).

- [ ] **Step 5: Build the dashboard**

Run: `cd dashboard && npm run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 6: Manual verification (user)**

Ask the user to test in the dashboard: flashing a `*-custom-*` version shows the
red BETA dialog, the backup ✓ appears, the button stays disabled until ✓, and a
stock version still shows the normal dialog.

- [ ] **Step 7: Commit (after user OK)**

```bash
git add dashboard/src/utils/betaFirmware.ts dashboard/src/components/ota/OtaManager.tsx
git commit -m "feat(dashboard): red BETA confirm dialog with mandatory backup"
```

---

## Task 7: Expo app BETA warning modal

**Files:**
- Create: `app/src/utils/betaFirmware.ts`
- Modify: `app/src/services/api.ts`
- Modify: `app/src/screens/OtaScreen.tsx`

UI; wait for user test before final commit.

- [ ] **Step 1: Create the shared copy constant**

```typescript
// app/src/utils/betaFirmware.ts
// Mirrors server BETA_FIRMWARE_WARNING (firmwareSafety.ts). Keep in sync.
export const BETA_FIRMWARE_WARNING_LINES = [
  'Dit is BETA / experimentele custom firmware.',
  'De installatie kan de maaier onbruikbaar maken (bricken).',
  'Je kunt AL je kaarten verliezen.',
];
```

- [ ] **Step 2: Add the backup API method**

In `app/src/services/api.ts`, alongside `triggerOta` (~line 894), add:

```typescript
  async createPortableBackup(
    sn: string,
  ): Promise<{ filename: string; createdAt: number } | null> {
    try {
      const r = await this.request<{ entry?: any; backup?: any }>(
        'POST',
        `/api/admin-status/maps/${enc(sn)}/portable-backups`,
      );
      return r.entry ?? r.backup ?? null;
    } catch {
      return null;
    }
  }
```

Confirm the POST response shape against `server/src/routes/adminStatus.ts`
(~line 1512) and adjust `r.entry ?? r.backup` accordingly.

- [ ] **Step 3: Gate the flash action with a BETA modal**

In `OtaScreen.tsx`, import the predicate + copy:

```typescript
import { isOpenNovaFirmware } from '../utils/firmwareCapability';
import { BETA_FIRMWARE_WARNING_LINES } from '../utils/betaFirmware';
```

The flash currently runs inside an action button `onPress` that calls
`api.triggerOta(sn, version.id)`. Wrap the dispatch so that when
`isOpenNovaFirmware(version.version)` is true, a BETA confirmation `Modal` is
shown first; the modal pre-creates the backup (`api.createPortableBackup(sn)`),
shows `Backup gemaakt ✓`, and only enables the red **"Ik begrijp het, flash toch"**
button once the backup succeeds. On confirm, run the existing dispatch body
(the `setOtaProgress` seed + `api.triggerOta`). For stock versions, keep the
current flow unchanged.

Add modal state near the other `useState` hooks:

```typescript
const [betaModal, setBetaModal] = useState<null | { sn: string; version: { id: number; version: string }; deviceLabel: string }>(null);
const [betaBackupState, setBetaBackupState] = useState<'idle' | 'creating' | 'done' | 'failed'>('idle');
```

Extract the existing dispatch body into a `doFlash(sn, version, deviceLabel)`
function and call it either directly (stock) or from the modal's confirm (beta).
When opening the modal, kick off the backup:

```typescript
const openBetaModal = async (sn: string, version: { id: number; version: string }, deviceLabel: string) => {
  setBetaModal({ sn, version, deviceLabel });
  setBetaBackupState('creating');
  const url = await getServerUrl();
  const api = url ? new ApiClient(url) : null;
  const entry = api ? await api.createPortableBackup(sn) : null;
  setBetaBackupState(entry ? 'done' : 'failed');
};
```

Render a `Modal` with the red warning (`BETA_FIRMWARE_WARNING_LINES`), the backup
status, an `Annuleren` button, and a `flash toch` button
`disabled={betaBackupState !== 'done'}` whose `onPress` closes the modal and
calls `doFlash(betaModal.sn, betaModal.version, betaModal.deviceLabel)`.

- [ ] **Step 4: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification (user)**

Ask the user to test via Expo hot reload: a `*-custom-*` version shows the BETA
modal with backup ✓ gating the button; stock versions flash as before.

- [ ] **Step 6: Commit (after user OK)**

```bash
git add app/src/utils/betaFirmware.ts app/src/services/api.ts app/src/screens/OtaScreen.tsx
git commit -m "feat(app): BETA warning modal with mandatory backup before flash"
```

---

## Task 8: Messaging-only surfaces (docs, build script, installer/wizard)

**Files:**
- Modify: `docs/reference/OTA.md`
- Modify: `README.md`
- Modify: `research/build_custom_firmware.sh`
- Modify: the installer/wizard custom-firmware screen (locate in Step 4)

- [ ] **Step 1: Add a BETA block to `docs/reference/OTA.md`**

At the very top of the file, directly under the H1, add:

```markdown
> ## ⚠️ BETA — Custom firmware
> Custom firmware (`*-custom-*` / `*-opennova-*`) is **experimentele BETA software**.
> Het kan je maaier onbruikbaar maken (**bricken**) en **AL je kaarten wissen**.
> OpenNova maakt automatisch een verse backup vóór elke beta-flash (server-side gate,
> max. 24u oud), maar installeer alleen als je de risico's accepteert.
```

- [ ] **Step 2: Add the same block to `README.md`**

Add an equivalent BETA callout in the firmware/OTA section of `README.md`
(search for an existing firmware heading; if none, add it under a new
`## Custom firmware (BETA)` section).

- [ ] **Step 3: Echo a banner in `research/build_custom_firmware.sh`**

Near the top of the script (after the shebang / initial `set` lines), add:

```bash
echo -e "\033[1;31m=============================================================\033[0m"
echo -e "\033[1;31m  ⚠  BETA CUSTOM FIRMWARE — kan de maaier bricken en ALLE\033[0m"
echo -e "\033[1;31m     kaarten wissen. Maak eerst een backup. Gebruik op eigen risico.\033[0m"
echo -e "\033[1;31m=============================================================\033[0m"
```

- [ ] **Step 4: Add a banner to the installer/wizard custom-firmware screen**

Run: `grep -rln "custom\|firmware\|opennova" installer/ bootstrap/ 2>/dev/null | grep -iE "\.(tsx|ts|html|vue)$"`
Locate the screen/component that offers or links custom firmware. Add a visible
red BETA warning banner using that surface's existing component conventions, with
the same wording as Step 1. If neither surface references custom firmware, note
that in the commit message and skip (nothing to warn on there).

- [ ] **Step 5: Commit**

```bash
git add docs/reference/OTA.md README.md research/build_custom_firmware.sh
git commit -m "docs: prominent BETA warnings for custom firmware install"
```

---

## Final verification

- [ ] **Server tests + typecheck:**

Run: `cd server && npx vitest run src/__tests__/services/firmwareSafety.test.ts src/__tests__/routes/otaTriggerBetaGate.test.ts && npx tsc --noEmit`
Expected: all PASS, no TS errors.

- [ ] **Dashboard + app typecheck:**

Run: `cd dashboard && npx tsc --noEmit && cd ../app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Spec coverage self-check:** confirm every spec section maps to a task —
  §2 detection→T1, §3 server gate→T2+T3+T4, §4 paths→T3(dashboard/app)+T4(stock app),
  §5 client UI→T6+T7, §6 messaging→T8, §7 shared copy→T1(server)+T6/T7(clients)+T8(docs), §8 tests→T1/T2/T3.
