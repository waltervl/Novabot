# Dashboard Catch-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the OpenNova dashboard to feature parity with the current OpenNova app + cloud-API server, in 6 incremental phases on `feat/dashboard-catchup`. Every phase produces a mergeable, shippable PR.

**Architecture:** Replace `DashboardPage.tsx` with a tab-based `DashboardShell` (Header + Tabs + Drawer). Split monolithic `MowerMap.tsx` (2000+ lines) into focused layer components. Add 5 new server endpoints under safe namespaces (`/api/dashboard/system/*`, `/api/admin/*`) — cloud-API frozen tree untouched. Drawer is read-only diagnostics; mutations go to `/admin`.

**Tech Stack:** React 18 + TypeScript + Vite + Leaflet + Tailwind + socket.io-client (frontend); Node + Express + better-sqlite3 + aedes + vitest (backend).

**Spec:** `docs/superpowers/specs/2026-04-29-dashboard-catchup-design.md`.

**Branch:** `feat/dashboard-catchup` (already created and pushed). Spec already committed to it. All implementation work lands here.

---

## Cross-cutting rules (apply to every task)

- **Server safety:** never touch `server/src/cloud-api/`. New endpoints only under `/api/dashboard/system/*` or `/api/admin/*`. Database changes only as idempotent `ALTER TABLE ADD COLUMN` with try/catch.
- **No-NaN discipline:** every new map layer must use `Number.isFinite()` guards on coordinates before passing to Leaflet — match the pattern in `dashboard/src/utils/coords.ts:isUsableChargerGps()`. The white-screen bug from issue #15 must not regress.
- **Type-checking gate per task:** run `cd dashboard && npx tsc --noEmit -p tsconfig.app.json` after every edit. Must be clean before commit.
- **Build gate per task:** run `cd dashboard && npm run build` before merging a phase. Must succeed.
- **Server tests gate (phases 4 + 5 only):** run `cd server && npm test`. All 18 vitest files plus the new tests must be green.
- **Smoke test (manual) per merge to `feat/dashboard-catchup`:**
  1. Login on dashboard, mower appears
  2. Map tab renders — no white screen
  3. Schedule tab shows existing plans
  4. Phase-specific feature works
  5. Novabot stock app: login + map + start mowing — works
  6. OpenNova app: login + map + start mowing — works
  7. `docker logs --since 5m opennova` clean
- **Commit cadence:** commit after every passing task (small, revertable commits). Use Conventional Commits format (`feat(dashboard): ...`, `fix(dashboard): ...`, `refactor(dashboard): ...`).
- **i18n discipline:** every new visible string ships with NL + EN keys in `dashboard/src/i18n/locales/`. Existing keys are never renamed.

---

## Phase 0 — Foundation

Goal: shell skeleton (header, tabs, drawer placeholder, multi-mower context) replacing the current single-page `DashboardPage`. After Phase 0, the dashboard renders the existing Map view inside the new shell, with a tab bar and an empty drawer reachable via gear icon. Nothing else has changed visually.

### Task 0.1: ActiveMowerContext

**Files:**
- Create: `dashboard/src/contexts/ActiveMowerContext.tsx`

- [ ] **Step 1: Create ActiveMowerContext file**

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'opennova.dashboard.activeMowerSn';

interface ActiveMowerContextShape {
  activeMowerSn: string | null;
  setActiveMowerSn: (sn: string | null) => void;
  hydrated: boolean;
}

const ActiveMowerContext = createContext<ActiveMowerContextShape | null>(null);

export function ActiveMowerProvider({ children }: { children: ReactNode }) {
  const [activeMowerSn, setActiveMowerSnState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setActiveMowerSnState(raw);
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  const setActiveMowerSn = useCallback((sn: string | null) => {
    setActiveMowerSnState(sn);
    try {
      if (sn) localStorage.setItem(STORAGE_KEY, sn);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }, []);

  const value = useMemo(
    () => ({ activeMowerSn, setActiveMowerSn, hydrated }),
    [activeMowerSn, setActiveMowerSn, hydrated],
  );

  return <ActiveMowerContext.Provider value={value}>{children}</ActiveMowerContext.Provider>;
}

export function useActiveMowerContext(): ActiveMowerContextShape {
  const ctx = useContext(ActiveMowerContext);
  if (!ctx) throw new Error('useActiveMowerContext must be used inside <ActiveMowerProvider>');
  return ctx;
}
```

- [ ] **Step 2: TypeScript check**

Run: `cd dashboard && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/contexts/ActiveMowerContext.tsx
git commit -m "feat(dashboard): ActiveMowerContext with localStorage persistence"
```

---

### Task 0.2: useActiveMower hook

**Files:**
- Create: `dashboard/src/hooks/useActiveMower.ts`

- [ ] **Step 1: Create the hook**

```ts
import { useEffect, useMemo } from 'react';
import { useActiveMowerContext } from '../contexts/ActiveMowerContext';
import type { DeviceState } from '../types';

export interface UseActiveMowerResult {
  activeMower: DeviceState | null;
  activeMowerSn: string | null;
  setActiveMowerSn: (sn: string | null) => void;
  hydrated: boolean;
  knownMowers: DeviceState[];
}

export function useActiveMower(devices: Map<string, DeviceState>): UseActiveMowerResult {
  const { activeMowerSn, setActiveMowerSn, hydrated } = useActiveMowerContext();

  const knownMowers = useMemo(() => {
    return Array.from(devices.values()).filter(d => d.kind === 'mower');
  }, [devices]);

  // Auto-select the first known mower when none is selected and we just hydrated.
  useEffect(() => {
    if (!hydrated) return;
    if (activeMowerSn) return;
    if (knownMowers.length === 0) return;
    setActiveMowerSn(knownMowers[0].sn);
  }, [hydrated, activeMowerSn, knownMowers, setActiveMowerSn]);

  // If the previously-selected SN disappears, fall back to the first remaining mower.
  useEffect(() => {
    if (!activeMowerSn) return;
    if (knownMowers.length === 0) return;
    if (!knownMowers.some(m => m.sn === activeMowerSn)) {
      setActiveMowerSn(knownMowers[0].sn);
    }
  }, [activeMowerSn, knownMowers, setActiveMowerSn]);

  const activeMower = useMemo(() => {
    if (!activeMowerSn) return null;
    return devices.get(activeMowerSn) ?? null;
  }, [activeMowerSn, devices]);

  return { activeMower, activeMowerSn, setActiveMowerSn, hydrated, knownMowers };
}
```

> Note: `DeviceState.kind` may not exist in `dashboard/src/types/index.ts`. If grep shows no `kind` field on `DeviceState`, replace the filter with `d.sn.startsWith('LFIN')` for now (mowers all have LFIN serials per `CLAUDE.md`). Either way, do not invent fields the type does not declare.

- [ ] **Step 2: Verify the type is consistent with `DeviceState`**

Run: `cd dashboard && grep -nE 'export (interface|type) DeviceState' src/types/index.ts`

If `kind` is missing, edit the hook to use the SN-prefix fallback.

- [ ] **Step 3: TypeScript check**

Run: `cd dashboard && npx tsc --noEmit -p tsconfig.app.json`

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/hooks/useActiveMower.ts
git commit -m "feat(dashboard): useActiveMower hook on top of context"
```

---

### Task 0.3: MowerPicker component

**Files:**
- Create: `dashboard/src/shell/MowerPicker.tsx`

- [ ] **Step 1: Create component**

```tsx
import type { DeviceState } from '../types';

interface Props {
  mowers: DeviceState[];
  activeMowerSn: string | null;
  onChange: (sn: string) => void;
}

export function MowerPicker({ mowers, activeMowerSn, onChange }: Props) {
  if (mowers.length === 0) {
    return <div className="text-sm text-zinc-500">No mowers</div>;
  }
  if (mowers.length === 1) {
    const m = mowers[0];
    return (
      <div className="text-sm font-medium text-zinc-100">
        {m.nickname ?? m.sn}
      </div>
    );
  }
  return (
    <select
      value={activeMowerSn ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100"
    >
      {mowers.map(m => (
        <option key={m.sn} value={m.sn}>
          {m.nickname ?? m.sn}
        </option>
      ))}
    </select>
  );
}
```

> Note: if `DeviceState.nickname` does not exist, drop the `??` fallbacks and use `m.sn` directly; revisit during Phase 2 (nickname surface).

- [ ] **Step 2: TypeScript check**

Run: `cd dashboard && npx tsc --noEmit -p tsconfig.app.json`

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/shell/MowerPicker.tsx
git commit -m "feat(dashboard): MowerPicker dropdown for multi-mower switch"
```

---

### Task 0.4: RainBadge component

**Files:**
- Create: `dashboard/src/shell/RainBadge.tsx`

- [ ] **Step 1: Create component**

```tsx
import { CloudRain } from 'lucide-react';

interface Props {
  rainState: 'dry' | 'rain' | 'paused-by-rain' | null;
}

export function RainBadge({ rainState }: Props) {
  if (!rainState || rainState === 'dry') return null;
  const label = rainState === 'paused-by-rain' ? 'Paused (rain)' : 'Rain';
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-900/40 text-blue-200 rounded text-xs">
      <CloudRain className="w-3 h-3" />
      {label}
    </span>
  );
}
```

- [ ] **Step 2: TypeScript + commit**

```bash
cd dashboard && npx tsc --noEmit -p tsconfig.app.json
git add dashboard/src/shell/RainBadge.tsx
git commit -m "feat(dashboard): RainBadge header pill"
```

---

### Task 0.5: Drawer skeleton

**Files:**
- Create: `dashboard/src/shell/Drawer.tsx`

- [ ] **Step 1: Create component**

```tsx
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Drawer({ open, onClose, children }: Props) {
  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 transition-opacity z-40 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed top-0 right-0 h-full w-[360px] max-w-full bg-zinc-950 border-l border-zinc-800 shadow-xl transition-transform z-50 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-100">Diagnostics</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto h-[calc(100%-49px)]">
          {open ? children : null}
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 2: TypeScript + commit**

```bash
cd dashboard && npx tsc --noEmit -p tsconfig.app.json
git add dashboard/src/shell/Drawer.tsx
git commit -m "feat(dashboard): Drawer slide-in skeleton"
```

---

### Task 0.6: Header

**Files:**
- Create: `dashboard/src/shell/Header.tsx`

- [ ] **Step 1: Create component**

```tsx
import { Settings } from 'lucide-react';
import { MowerPicker } from './MowerPicker';
import { RainBadge } from './RainBadge';
import type { DeviceState } from '../types';

interface Props {
  knownMowers: DeviceState[];
  activeMowerSn: string | null;
  onSelectMower: (sn: string) => void;
  rainState: 'dry' | 'rain' | 'paused-by-rain' | null;
  onOpenDrawer: () => void;
}

export function Header({ knownMowers, activeMowerSn, onSelectMower, rainState, onOpenDrawer }: Props) {
  return (
    <header className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800">
      <div className="flex items-center gap-3">
        <MowerPicker mowers={knownMowers} activeMowerSn={activeMowerSn} onChange={onSelectMower} />
        <RainBadge rainState={rainState} />
      </div>
      <button
        onClick={onOpenDrawer}
        className="text-zinc-400 hover:text-zinc-100"
        aria-label="Open diagnostics drawer"
      >
        <Settings className="w-5 h-5" />
      </button>
    </header>
  );
}
```

- [ ] **Step 2: TypeScript + commit**

```bash
cd dashboard && npx tsc --noEmit -p tsconfig.app.json
git add dashboard/src/shell/Header.tsx
git commit -m "feat(dashboard): Header with MowerPicker + RainBadge + gear button"
```

---

### Task 0.7: DashboardShell with tab routing

**Files:**
- Create: `dashboard/src/shell/DashboardShell.tsx`
- Modify: `dashboard/src/App.tsx`

- [ ] **Step 1: Create DashboardShell**

```tsx
import { useState } from 'react';
import { Header } from './Header';
import { Drawer } from './Drawer';
import { useDevices } from '../hooks/useDevices';
import { useActiveMower } from '../hooks/useActiveMower';
import { ActiveMowerProvider } from '../contexts/ActiveMowerContext';
import { MapTab } from '../pages/MapTab';
import { SchedulePage } from '../pages/SchedulePage';
import { WorkRecordsPage } from '../pages/WorkRecordsPage';
import { SettingsPage } from '../pages/SettingsPage';

type Tab = 'map' | 'schedule' | 'records' | 'settings';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'map', label: 'Map' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'records', label: 'Records' },
  { id: 'settings', label: 'Settings' },
];

function ShellInner() {
  const { devices, loading, connected, logs, bleLogs, otaProgress, liveOutlines, coveredLanes } = useDevices();
  const { activeMower, activeMowerSn, setActiveMowerSn, knownMowers } = useActiveMower(devices);
  const [tab, setTab] = useState<Tab>('map');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Rain state derivation will be filled in during Phase 2 — for now: null.
  const rainState = null;

  if (loading) {
    return <div className="p-8 text-zinc-500">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Header
        knownMowers={knownMowers}
        activeMowerSn={activeMowerSn}
        onSelectMower={setActiveMowerSn}
        rainState={rainState}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      <nav className="flex gap-1 px-4 bg-zinc-900 border-b border-zinc-800">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id ? 'border-emerald-500 text-zinc-100' : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="p-4">
        {tab === 'map' && (
          <MapTab
            mower={activeMower}
            connected={connected}
            liveOutlines={liveOutlines}
            coveredLanes={coveredLanes}
            otaProgress={otaProgress}
          />
        )}
        {tab === 'schedule' && <SchedulePage mower={activeMower} />}
        {tab === 'records' && <WorkRecordsPage mower={activeMower} />}
        {tab === 'settings' && <SettingsPage mower={activeMower} />}
      </main>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <p className="text-sm text-zinc-500">Drawer cards land in Phase 4.</p>
      </Drawer>

      {/* Bottom-of-page debug strip kept temporarily so existing log/BLE views remain reachable until Phase 4 lands their drawer cards. */}
      <details className="mt-8 mx-4 mb-4 text-xs text-zinc-500">
        <summary className="cursor-pointer">Legacy debug (temporary)</summary>
        <pre className="overflow-auto max-h-64">{JSON.stringify({ logs: logs.slice(-5), bleLogs: bleLogs.slice(-5) }, null, 2)}</pre>
      </details>
    </div>
  );
}

export function DashboardShell() {
  return (
    <ActiveMowerProvider>
      <ShellInner />
    </ActiveMowerProvider>
  );
}
```

> The page imports (`MapTab`, `SchedulePage`, `WorkRecordsPage`, `SettingsPage`) come from Tasks 0.8–0.11 immediately below. Order them so each task is shippable.

- [ ] **Step 2: Skip TS check until pages land** — proceed to Tasks 0.8–0.11; they create the imported files. After 0.11, run TS check and commit the shell.

---

### Task 0.8: MapTab page wrapper (round-trip via existing MowerMap)

**Files:**
- Create: `dashboard/src/pages/MapTab.tsx`

- [ ] **Step 1: Create the wrapper that delegates to existing `MowerMap`**

```tsx
import type { DeviceState, OtaProgressEntry } from '../types';
import { MowerMap } from '../components/map/MowerMap';

interface Props {
  mower: DeviceState | null;
  connected: boolean;
  liveOutlines: Map<string, Array<{ lat: number; lng: number }>>;
  coveredLanes: Map<string, Array<{ lat1: number; lng1: number; lat2: number; lng2: number }>>;
  otaProgress: Map<string, OtaProgressEntry>;
}

export function MapTab({ mower, liveOutlines, coveredLanes }: Props) {
  if (!mower) {
    return <div className="p-8 text-zinc-500">Select a mower to view its map.</div>;
  }

  return (
    <MowerMap
      sn={mower.sn}
      lat={mower.sensors.latitude}
      lng={mower.sensors.longitude}
      heading={mower.sensors.z ?? mower.sensors.mower_z}
      signals={{
        wifiRssi: mower.sensors.wifi_rssi,
        rtkSat: mower.sensors.rtk_sat,
        locQuality: mower.sensors.loc_quality,
        batteryPower: mower.sensors.battery_power ?? mower.sensors.battery_capacity,
        batteryState: mower.sensors.battery_state,
      }}
      mowing={{
        mowingProgress: mower.sensors.mowing_progress,
        coveringArea: mower.sensors.covering_area,
        finishedArea: mower.sensors.finished_area,
        workStatus: mower.sensors.work_status,
        mowSpeed: mower.sensors.mow_speed,
        covDirection: mower.sensors.cov_direction,
      }}
      liveOutline={liveOutlines.get(mower.sn) ?? null}
      coveredLanes={coveredLanes.get(mower.sn) ?? null}
    />
  );
}
```

> Type imports may need adjustment. Inspect `dashboard/src/types/index.ts` for the exported names. If `OtaProgressEntry` is not exported, drop the prop or define it inline as `Map<string, { status: string; percentage: number | null; timestamp: number }>`.

- [ ] **Step 2: TypeScript check**

Run: `cd dashboard && npx tsc --noEmit -p tsconfig.app.json`

- [ ] **Step 3: Commit (after Tasks 0.9–0.11 also exist; otherwise the shell will not type-check yet — finish those first, then commit all four tab pages together)**

---

### Task 0.9: SchedulePage placeholder

**Files:**
- Create: `dashboard/src/pages/SchedulePage.tsx`

- [ ] **Step 1: Create placeholder that renders the existing schedule UI if any, otherwise a stub**

```tsx
import type { DeviceState } from '../types';

interface Props {
  mower: DeviceState | null;
}

export function SchedulePage({ mower }: Props) {
  if (!mower) {
    return <div className="p-8 text-zinc-500">Select a mower.</div>;
  }
  return (
    <div className="p-8 text-zinc-500">
      Schedule view ports to this tab in Phase 2.
    </div>
  );
}
```

- [ ] **Step 2: Commit deferred — combined with Task 0.11**

---

### Task 0.10: WorkRecordsPage placeholder

**Files:**
- Create: `dashboard/src/pages/WorkRecordsPage.tsx`

- [ ] **Step 1: Create placeholder**

```tsx
import type { DeviceState } from '../types';

interface Props {
  mower: DeviceState | null;
}

export function WorkRecordsPage({ mower }: Props) {
  if (!mower) {
    return <div className="p-8 text-zinc-500">Select a mower.</div>;
  }
  return (
    <div className="p-8 text-zinc-500">
      Work records port to this tab in Phase 3.
    </div>
  );
}
```

---

### Task 0.11: SettingsPage placeholder

**Files:**
- Create: `dashboard/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Create placeholder**

```tsx
import type { DeviceState } from '../types';

interface Props {
  mower: DeviceState | null;
}

export function SettingsPage({ mower }: Props) {
  if (!mower) {
    return <div className="p-8 text-zinc-500">Select a mower.</div>;
  }
  return (
    <div className="p-8 text-zinc-500">
      Settings page lands in Phase 3.
    </div>
  );
}
```

- [ ] **Step 2: Now run TypeScript check across the shell + all four pages**

```bash
cd dashboard && npx tsc --noEmit -p tsconfig.app.json
```

Expected: clean.

- [ ] **Step 3: Commit shell + tab pages together**

```bash
git add dashboard/src/shell/DashboardShell.tsx dashboard/src/pages/MapTab.tsx dashboard/src/pages/SchedulePage.tsx dashboard/src/pages/WorkRecordsPage.tsx dashboard/src/pages/SettingsPage.tsx
git commit -m "feat(dashboard): tab-based DashboardShell wrapping current Map view + page placeholders"
```

---

### Task 0.12: Wire DashboardShell into App.tsx

**Files:**
- Modify: `dashboard/src/App.tsx`

- [ ] **Step 1: Read current App.tsx to confirm router structure**

```bash
cat dashboard/src/App.tsx
```

- [ ] **Step 2: Replace the rendered `DashboardPage` with `DashboardShell`**

In `dashboard/src/App.tsx`, the route that currently renders `<DashboardPage devices={devices} ... />` must now render `<DashboardShell />`. Remove the prop pass-through — `DashboardShell` calls `useDevices` itself. The mobile route (`<MobilePage ... />`) stays untouched. The admin route stays untouched.

Replace:

```tsx
<DashboardPage devices={devices} loading={loading} logs={logs} bleLogs={bleLogs} otaProgress={otaProgress} liveOutlines={liveOutlines} coveredLanes={coveredLanes} />
```

With:

```tsx
<DashboardShell />
```

And remove the now-unused `useDevices()` call in `App.tsx` if `DashboardShell` is the only consumer.

- [ ] **Step 3: TypeScript + build**

```bash
cd dashboard && npx tsc --noEmit -p tsconfig.app.json
cd dashboard && npm run build
```

- [ ] **Step 4: Manual smoke test**

```bash
cd dashboard && npm run dev
```

Open `http://localhost:5173`. Verify: login works, dashboard loads, header visible with mower picker (or single name), gear icon opens drawer, four tabs work, Map tab renders existing map without regression.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/App.tsx
git commit -m "feat(dashboard): mount DashboardShell as the dashboard root"
```

---

### Task 0.13: Remove DashboardPage when nothing imports it

**Files:**
- Delete: `dashboard/src/components/dashboard/DashboardPage.tsx` (only if no remaining imports)

- [ ] **Step 1: Find remaining imports**

```bash
grep -rn "DashboardPage" dashboard/src
```

If results are 0 lines (other than the file itself), proceed. Otherwise: stop and resolve dependencies in their respective tasks first.

- [ ] **Step 2: Delete the file**

```bash
git rm dashboard/src/components/dashboard/DashboardPage.tsx
```

- [ ] **Step 3: TypeScript + build + commit**

```bash
cd dashboard && npx tsc --noEmit -p tsconfig.app.json
cd dashboard && npm run build
git commit -m "refactor(dashboard): remove DashboardPage replaced by DashboardShell"
```

---

### Task 0.14: Phase 0 phase-merge gate

- [ ] **Step 1: Run all gates**

```bash
cd dashboard && npx tsc --noEmit -p tsconfig.app.json
cd dashboard && npm run lint
cd dashboard && npm run build
```

- [ ] **Step 2: Smoke test on the live mower**

Login on dashboard pointing at production server (or laptop docker). Confirm Novabot stock app and OpenNova app both still log in and see the mower (sanity check that nothing inadvertently changed server-side). Server changes in Phase 0 = none, so this should be trivially green.

- [ ] **Step 3: Open the Phase 0 PR**

```bash
git push
gh pr create --base feat/dashboard-catchup --head feat/dashboard-catchup-phase-0 \
  --title "feat(dashboard): Phase 0 — shell, tabs, drawer skeleton" \
  --body "$(cat <<'EOF'
## Summary
- DashboardShell with Header + Tabs + Drawer
- ActiveMowerContext + useActiveMower hook
- MowerPicker, RainBadge skeletons
- Tab page placeholders (Map delegates to existing MowerMap)
- DashboardPage removed

## Test plan
- [ ] Manual: login + tab switching + drawer open/close on dev build
- [ ] Manual: Novabot stock + OpenNova app login + map view + start mowing — works
- [ ] `npm run build` clean
- [ ] `npx tsc --noEmit -p tsconfig.app.json` clean
EOF
)"
```

> If the team prefers single-branch incremental (no per-phase PR), skip the PR open and continue to Phase 1 directly on `feat/dashboard-catchup`. The eventual end-bundle PR captures everything.

---

## Phase 1 — Map

Goal: split `MowerMap.tsx` (2000+ lines) into focused layer components, port the canonical-name polygon match fix, expand `PolygonEditor` for obstacle/canonical handling, and add new map features (CuttingHeightPicker, EdgeCutButton, MapImportWizard, coverage progress, manual mowing, long-pause safety).

> Refactor discipline: each layer extraction is a behavior-preserving move. Smoke test after every extraction. The map MUST keep rendering identically (polygons, trail, coverage stripes, mower icon, charger icon) until the final integration task swaps in new behavior.

### Task 1.1: Read and inventory MowerMap.tsx

- [ ] **Step 1: Read the file end-to-end**

```bash
wc -l dashboard/src/components/map/MowerMap.tsx
```

- [ ] **Step 2: Map sections to target files**

Document in scratch notes (do not commit): which line ranges become `MapCanvas.tsx`, `MapPolygonLayer.tsx`, `MapTrailLayer.tsx`, `CoverageLayer.tsx`, `PathDirectionPreview.tsx`, `MowerMarker.tsx`, `MapToolbar.tsx`. The existing `CoverageStripes`, `clipLineToPolygon`, `calibratePoints`, `getAreaStyle` helpers stay in their own utility module(s) — extract them into `dashboard/src/components/map/_shared.ts` first if reused across new files.

### Task 1.2: Extract shared map helpers

**Files:**
- Create: `dashboard/src/components/map/_shared.ts`
- Modify: `dashboard/src/components/map/MowerMap.tsx`

- [ ] **Step 1: Move pure helpers (`clipLineToPolygon`, `calibratePoints`, `pointInPolygon`, `getAreaStyle`, `AREA_STYLES`, `DEFAULT_CAL`, `makeMowerIcon`, `makeChargerIcon`) into `_shared.ts`**

Cut from `MowerMap.tsx`, paste into `_shared.ts`, add appropriate exports. Update `MowerMap.tsx` to import from `./_shared`.

- [ ] **Step 2: TypeScript + build + manual smoke test**

```bash
cd dashboard && npx tsc --noEmit -p tsconfig.app.json
cd dashboard && npm run build
cd dashboard && npm run dev
```

Open the map in browser; verify polygons + trail + mower icon + charger icon render exactly as before.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/map/_shared.ts dashboard/src/components/map/MowerMap.tsx
git commit -m "refactor(dashboard): extract map helper utilities into _shared.ts"
```

### Task 1.3: Extract `MapPolygonLayer`

**Files:**
- Create: `dashboard/src/components/map/MapPolygonLayer.tsx`
- Modify: `dashboard/src/components/map/MowerMap.tsx`

- [ ] **Step 1: Create the layer component**

The component receives `gpsMaps`, `activeCal`, `polyCenter`, `selectedMapId`, `editingMapId`, `onClickMap` and renders the polygon `<Polygon>` JSX block currently in `MowerMap.tsx`. Apply NaN guards on positions before passing to Leaflet (`Number.isFinite()` per `dashboard/src/utils/coords.ts:isUsableChargerGps()`). Do not change behavior.

- [ ] **Step 2: Replace the inline JSX in `MowerMap.tsx` with `<MapPolygonLayer ... />`**

- [ ] **Step 3: TypeScript + build + smoke test (polygons render identically) + commit**

```bash
cd dashboard && npx tsc --noEmit -p tsconfig.app.json
cd dashboard && npm run build
git add dashboard/src/components/map/MapPolygonLayer.tsx dashboard/src/components/map/MowerMap.tsx
git commit -m "refactor(dashboard): extract MapPolygonLayer from MowerMap"
```

### Task 1.4: Extract `MapTrailLayer`

**Files:**
- Create: `dashboard/src/components/map/MapTrailLayer.tsx`
- Modify: `dashboard/src/components/map/MowerMap.tsx`

- [ ] **Step 1: Move the trail Polyline + heatmap chunks block into the new file**

Inputs: `trailPositions`, `showTrail`, `showHeatmap`, `mowing`. NaN-guard each position before render.

- [ ] **Step 2: Substitute, TypeScript, build, smoke test, commit**

```bash
git add dashboard/src/components/map/MapTrailLayer.tsx dashboard/src/components/map/MowerMap.tsx
git commit -m "refactor(dashboard): extract MapTrailLayer from MowerMap"
```

### Task 1.5: Extract `CoverageLayer`

**Files:**
- Create: `dashboard/src/components/map/CoverageLayer.tsx`
- Modify: `dashboard/src/components/map/MowerMap.tsx`, `dashboard/src/mobile/components/MiniMap.tsx`

- [ ] **Step 1: Move the existing `CoverageStripes` export into `CoverageLayer.tsx`** (it currently lives in `MowerMap.tsx` and is also imported by `MiniMap.tsx`).

- [ ] **Step 2: Update both consumers' import paths**

Replace `import { CoverageStripes } from '../components/map/MowerMap'` (or `'../../components/map/MowerMap'` from MiniMap) with the new module path.

- [ ] **Step 3: TypeScript + build + smoke test (coverage stripes still render during mowing) + commit**

```bash
git add dashboard/src/components/map/CoverageLayer.tsx dashboard/src/components/map/MowerMap.tsx dashboard/src/mobile/components/MiniMap.tsx
git commit -m "refactor(dashboard): extract CoverageLayer (used by MowerMap + MiniMap)"
```

### Task 1.6: Extract `PathDirectionPreview`

**Files:**
- Create: `dashboard/src/components/map/PathDirectionPreview.tsx`
- Modify: `dashboard/src/components/map/MowerMap.tsx`

- [ ] **Step 1: Move the `pathDirectionPreview` block** (currently at `MowerMap.tsx:1441-1500`). Keep the `Number.isFinite(polyCenter.lat) && Number.isFinite(polyCenter.lng)` gate that landed today as the issue #15 fix.

- [ ] **Step 2: Substitute, TypeScript, build, smoke test, commit**

```bash
git add dashboard/src/components/map/PathDirectionPreview.tsx dashboard/src/components/map/MowerMap.tsx
git commit -m "refactor(dashboard): extract PathDirectionPreview"
```

### Task 1.7: Extract `MowerMarker`

**Files:**
- Create: `dashboard/src/components/map/MowerMarker.tsx`
- Modify: `dashboard/src/components/map/MowerMap.tsx`

- [ ] **Step 1: Move the mower icon Marker + heading rotation logic into the new file**.

- [ ] **Step 2: Smoke test (mower icon still rotates with heading), commit**

```bash
git add dashboard/src/components/map/MowerMarker.tsx dashboard/src/components/map/MowerMap.tsx
git commit -m "refactor(dashboard): extract MowerMarker"
```

### Task 1.8: Extract `MapCanvas` (final shell of MowerMap)

**Files:**
- Create: `dashboard/src/components/map/MapCanvas.tsx`
- Modify: `dashboard/src/components/map/MowerMap.tsx`

- [ ] **Step 1: Move the `<MapContainer>` + `<TileLayer>` + auto-fit-bounds logic into `MapCanvas.tsx`**. The component accepts children for layer composition.

- [ ] **Step 2: `MowerMap.tsx` becomes a feature container** that composes `MapCanvas` + the extracted layers + the toolbar + state management. Aim for ≤ 400 lines.

- [ ] **Step 3: Smoke test (full map still works end-to-end), commit**

```bash
git add dashboard/src/components/map/MapCanvas.tsx dashboard/src/components/map/MowerMap.tsx
git commit -m "refactor(dashboard): extract MapCanvas; MowerMap becomes a thin composer"
```

### Task 1.9: Polygon canonical-name match render

**Files:**
- Modify: `dashboard/src/components/map/MapPolygonLayer.tsx`

- [ ] **Step 1: Match polygon-to-CSV by `canonical_name` before falling back to array index** — port the equivalent of server commit `7b68b6a3`. The polygon's `mapId` plus `canonical_name` (e.g. `map1`, `map2_obstacle`) must determine which trail / coverage / overlay belongs to it; today the dashboard pairs by array index which silently swaps polygons after deletes.

The fix: when consuming `gpsMaps`, key everything (style, alias, coverage layer, trail layer) on `m.canonical_name ?? m.mapId` rather than array position.

- [ ] **Step 2: Manual smoke test — delete a map in the middle of the list**

In dashboard: rename / delete one of three maps. Verify the remaining two keep their polygons + obstacles correctly paired (not swapped).

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/map/MapPolygonLayer.tsx
git commit -m "fix(dashboard): match polygons by canonical_name not array index"
```

### Task 1.10: PolygonEditor — obstacle + canonical fix

**Files:**
- Modify: `dashboard/src/components/map/PolygonEditor.tsx`

- [ ] **Step 1: Surface obstacle polygons with a separate edit mode**

The editor currently only supports `work` and `unicom` types per `dashboard/src/components/map/MowerMap.tsx:670 (drawType state)`. Add an `obstacle` mode wired through to `createMap(type='obstacle')` and the existing server obstacle endpoint.

- [ ] **Step 2: Fix the obstacle delete bug**

Locate the obstacle delete path (grep for `deleteMap` callers). Confirm a deleted obstacle does not leave its polygon visible until refresh. If it does, invalidate the `gpsMaps` memo on delete.

- [ ] **Step 3: Smoke test**

Add an obstacle, drag vertices, save, delete. The polygon disappears immediately; a refresh keeps it gone. The mower respects the obstacle on the next mow start (verified server-side via cloud-import map sync — already working in app).

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/map/PolygonEditor.tsx
git commit -m "feat(dashboard): obstacle polygon edit + delete invalidation"
```

### Task 1.11: CuttingHeightPicker

**Files:**
- Create: `dashboard/src/components/map/CuttingHeightPicker.tsx`

- [ ] **Step 1: Component renders the user-facing cm value (3..9 cm), wires the wire enum (`cm − 2`) onto a "Save" click**

The mapping is documented in `CLAUDE.md` (cutterhigh = user_cm − 2). The picker stores user-cm in state, sends `cutterhigh: cm-2` via the existing MQTT publish endpoint (grep dashboard for `publishToDevice` or similar wrapper).

```tsx
import { useState } from 'react';

const HEIGHTS_CM = [3, 4, 5, 6, 7, 8, 9];

interface Props {
  current: number | null;
  onSave: (cutterhigh: number) => Promise<void>;
}

export function CuttingHeightPicker({ current, onSave }: Props) {
  const [cm, setCm] = useState<number>(current ?? 4);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave(cm - 2); // wire value: cm minus 2
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-zinc-300">Height</label>
      <select value={cm} onChange={(e) => setCm(parseInt(e.target.value, 10))} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
        {HEIGHTS_CM.map(h => <option key={h} value={h}>{h} cm</option>)}
      </select>
      <button onClick={handleSave} disabled={busy} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm rounded">
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `MapToolbar` (existing component or extracted in Task 1.8)**

Pass `current = parseInt(mower.sensors.target_height ?? '0', 10) + 2` when target_height arrives, else null. The save callback calls the existing dashboard publish path; if no such helper exists, hit `/api/dashboard/publish/:sn` (verify endpoint name in `server/src/routes/dashboard.ts`).

- [ ] **Step 3: Smoke test on live mower**

Set 4 cm. Confirm the mower's `target_height` sensor settles to 2 (echoes `cutterhigh: 2`) within 6–8 s. Per `CLAUDE.md`, BLADE_HEIGHT_GET should equal 40 mm in mower logs.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/map/CuttingHeightPicker.tsx
git commit -m "feat(dashboard): cutting-height picker (cm UI, cm-2 wire enum)"
```

### Task 1.12: EdgeCutButton

**Files:**
- Create: `dashboard/src/components/map/EdgeCutButton.tsx`

- [ ] **Step 1: Component**

The server endpoint already exists per `CLAUDE.md` ("edge-cut working path: `start_edge_cut` extended command, blade height in mm, clamped 20..90 server-side"). Send to `/api/dashboard/publish/:sn` with `{ start_edge_cut: { mapName: 'map0', bladeHeight: heightCm * 10 } }`. Use the same height the user selected via `CuttingHeightPicker`.

```tsx
import { Slice } from 'lucide-react';
import { useState } from 'react';

interface Props {
  sn: string;
  mapName: string;
  bladeHeightCm: number;
  onTrigger: (payload: { mapName: string; bladeHeight: number }) => Promise<void>;
}

export function EdgeCutButton({ sn: _sn, mapName, bladeHeightCm, onTrigger }: Props) {
  const [busy, setBusy] = useState(false);
  const handleClick = async () => {
    if (!confirm(`Start edge cut on ${mapName} at ${bladeHeightCm} cm?`)) return;
    setBusy(true);
    try {
      await onTrigger({ mapName, bladeHeight: bladeHeightCm * 10 });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={handleClick}
      disabled={busy || !mapName}
      className="inline-flex items-center gap-2 px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm rounded"
    >
      <Slice className="w-4 h-4" />
      {busy ? 'Starting…' : 'Edge cut'}
    </button>
  );
}
```

- [ ] **Step 2: Wire into the map toolbar + handle stop via existing `stop_boundary_follow` path**

- [ ] **Step 3: Smoke test on live mower** — confirm coverage_planner_server logs `Only edge mode, only covering boundary path !!!!` per `CLAUDE.md` edge-cut memory.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/map/EdgeCutButton.tsx
git commit -m "feat(dashboard): edge-cut button (NTCP only_edge_mode action)"
```

### Task 1.13: MapImportWizard

**Files:**
- Create: `dashboard/src/components/map/MapImportWizard.tsx`

- [ ] **Step 1: Two-step modal — file upload → preview → confirm**

Step 1 takes a `.zip` or `.csv`. Step 2 shows a preview polygon (parse local x,y from CSV, render on a small Leaflet preview). Step 3 POSTs to the existing import endpoint (verify path; if missing, use the cloud-import flow's POST under `/api/dashboard/maps/:sn/import` — define on server side as part of this task only if absent).

> Server-side endpoint check: grep `/api/dashboard/maps/.*/import` in `server/src/routes/dashboard.ts`. If absent, add a tiny new endpoint scoped strictly to dashboard namespace — do NOT touch cloud-api.

- [ ] **Step 2: Smoke test** — import a sample CSV. The new map appears in the list with the mower's existing maps.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/map/MapImportWizard.tsx
git commit -m "feat(dashboard): map import wizard (CSV/ZIP upload + preview)"
```

### Task 1.14: Coverage progress visualization

**Files:**
- Modify: `dashboard/src/components/map/MowerMap.tsx`, possibly `dashboard/src/components/map/CoverageLayer.tsx`

- [ ] **Step 1: Surface `mowing.mowingProgress` (0..100) as a progress overlay on the map**

The percentage already arrives via the `mowing` prop. Render in the corner of the map as a small badge: `<span className="absolute top-3 left-3 px-2 py-1 bg-zinc-900/85 text-white text-xs rounded">{progress}%</span>`. Hide when `workStatus !== '1'`.

- [ ] **Step 2: Smoke test during a live mowing session** — percentage updates live as the mower covers area.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/map/MowerMap.tsx
git commit -m "feat(dashboard): live coverage progress badge during mowing"
```

### Task 1.15: Manual mowing controls

**Files:**
- Create: `dashboard/src/components/map/ManualMowControls.tsx`

- [ ] **Step 1: Render Start / Pause / Resume / Stop / Go-to-charge buttons that map to existing MQTT publish payloads documented in `docs/reference/MOWING-FLOW.md`**

Use the existing dashboard publish endpoint. Each button has a `confirm()` modal (per memory `feedback_safety.md`: never send movement commands without explicit confirmation).

- [ ] **Step 2: Smoke test on live mower** — start a manual mow on a single work map, pause, resume, stop, go-to-charge. Each transition reflects within 1–2 s on the dashboard's mower icon and `workStatus` sensor.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/map/ManualMowControls.tsx
git commit -m "feat(dashboard): manual mowing start/pause/resume/stop/dock controls"
```

### Task 1.16: Long-pause safety

**Files:**
- Modify: `dashboard/src/components/map/ManualMowControls.tsx`
- Modify: `dashboard/src/shell/DashboardShell.tsx`

- [ ] **Step 1: Track `pause` duration in state**

When the mower transitions to `workStatus === '2'` (paused) at time T, start a timer. After 30 minutes still paused, raise a banner above the Map tab: "Mower paused for 30 minutes. Resume or stop?".

- [ ] **Step 2: Banner offers Resume / Stop / Dock**

These reuse `ManualMowControls` callbacks.

- [ ] **Step 3: Smoke test** — manually pause for 30 min (or temporarily lower the threshold to 30 s for the test). Banner appears.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/map/ManualMowControls.tsx dashboard/src/shell/DashboardShell.tsx
git commit -m "feat(dashboard): long-pause safety banner"
```

### Task 1.17: i18n keys for Phase 1

**Files:**
- Modify: `dashboard/src/i18n/locales/*.ts`

- [ ] **Step 1: Add NL + EN keys**

For every visible string introduced in Tasks 1.10–1.16: `map.cuttingHeight`, `map.cuttingHeight.save`, `map.edgeCut`, `map.edgeCut.confirm`, `map.import`, `map.import.upload`, `map.import.preview`, `map.import.confirm`, `map.coverage.progress`, `map.manual.start`, `map.manual.pause`, `map.manual.resume`, `map.manual.stop`, `map.manual.dock`, `map.manual.confirm.start`, `map.manual.confirm.stop`, `map.longPause.title`, `map.longPause.resume`, `map.longPause.stop`, `map.longPause.dock`, `map.obstacle.title`, `map.obstacle.add`.

- [ ] **Step 2: TypeScript + commit**

```bash
git add dashboard/src/i18n/locales/
git commit -m "i18n(dashboard): keys for Phase 1 map features"
```

### Task 1.18: Phase 1 phase-merge gate

- [ ] **Step 1: Gates** (TS, lint, build, smoke test on live mower)
- [ ] **Step 2: Verify issue #14 (multi-polygon home screen) does not regress.** Map tab now renders all 3 work polygons with the active one highlighted (the same fix landed in app earlier under `feat/open-mqtt-node`).
- [ ] **Step 3: Push branch.** No PR yet — single bundle PR at the end.

---

## Phase 2 — Schedule

Goal: surface schedule status, rain warning, mower nickname; resolve schedule fields the server now persists (cutGrassHeight, area, timezone, alias, next-occurring weekday); add a timeline view.

### Task 2.1: ScheduleTable refactor

**Files:**
- Create: `dashboard/src/components/schedule/ScheduleTable.tsx`
- Modify: `dashboard/src/pages/SchedulePage.tsx`

- [ ] **Step 1: Move the existing schedule rendering (currently inside `DashboardPage` or a sibling) into the new `ScheduleTable` component**

Columns: Map alias, Days, Start–End, Cutting height, Area, Repeat, Next run.

- [ ] **Step 2: Wire from `SchedulePage` via `fetchCutGrassPlans(sn)` (existing API client method)**

- [ ] **Step 3: Smoke test + commit**

```bash
git add dashboard/src/components/schedule/ScheduleTable.tsx dashboard/src/pages/SchedulePage.tsx
git commit -m "feat(dashboard): ScheduleTable component"
```

### Task 2.2: Surface alias + week + cutGrassHeight + timezone fields

**Files:**
- Modify: `dashboard/src/components/schedule/ScheduleTable.tsx`

- [ ] **Step 1: Read the new fields from server DTO**

The DTO returned by `/queryCutGrassPlan` now includes `cutGrassHeight`, `area`, `timezone`, `areaFileAlias` (alias-resolved name), `week` (next-occurring weekday). Confirm by reading `server/src/cloud-api/routes/cutGrassPlan.ts:rowToDto`.

- [ ] **Step 2: Render each field in its column**

Map column: `entry.areaFileAlias ?? entry.workArea?.[0]`. Cutting height column: `entry.cutGrassHeight + 2 cm` (display in user-cm: wire enum + 2). Area column: badge "Whole map" if `entry.area === 1` else m². Timezone column: small pill.

- [ ] **Step 3: Smoke test + commit**

```bash
git commit -am "feat(dashboard): surface cutGrassHeight/area/timezone/alias/week fields in ScheduleTable"
```

### Task 2.3: ScheduleStatusBadge

**Files:**
- Create: `dashboard/src/components/schedule/ScheduleStatusBadge.tsx`

- [ ] **Step 1: Component renders one of three states**

| State | Trigger | Color |
|-------|---------|-------|
| Idle | `mowing.workStatus` not 1 and no plan-driven start within 5 min | zinc |
| Active | `mowing.workStatus === '1'` and current plan time matches | emerald |
| Skipped | Plan time passed but workStatus stayed 0 (and not paused-by-rain) | amber |

- [ ] **Step 2: Wire into `ScheduleTable` row**

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/schedule/ScheduleStatusBadge.tsx
git commit -m "feat(dashboard): per-plan status badge (idle/active/skipped)"
```

### Task 2.4: Rain warning surface

**Files:**
- Modify: `dashboard/src/shell/DashboardShell.tsx`

- [ ] **Step 1: Derive `rainState` from sensors**

`mower.sensors.rain_paused === '1'` → `paused-by-rain`. `mower.sensors.rain_detected === '1'` → `rain`. Else `dry`.

- [ ] **Step 2: Pass to `Header` so `RainBadge` reflects live state. Smoke test + commit**

```bash
git commit -am "feat(dashboard): live rain state from sensors"
```

### Task 2.5: Mower nickname surface (read)

**Files:**
- Modify: `dashboard/src/types/index.ts`, `dashboard/src/shell/MowerPicker.tsx`

- [ ] **Step 1: Confirm `DeviceState.nickname` exists or add it from the server response**

Inspect `dashboard/src/api/client.ts` and the snapshot socket event payload. The nickname is stored in `equipment.nickname` server-side (added in app commit `8ff753bd`). If the dashboard does not yet include this field on `DeviceState`, add it: `nickname: string | null`.

- [ ] **Step 2: MowerPicker now displays nickname when present**

(Already coded in Task 0.3 with `m.nickname ?? m.sn`. Confirm.)

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(dashboard): surface mower nickname in header picker"
```

### Task 2.6: ScheduleTimeline view

**Files:**
- Create: `dashboard/src/components/schedule/ScheduleTimeline.tsx`
- Modify: `dashboard/src/pages/SchedulePage.tsx`

- [ ] **Step 1: Render a 7-day grid (Mon..Sun rows × hours columns)**

Each plan paints a horizontal block on its weekday rows from `startTime` to `endTime`. Use the same DTO already fetched for `ScheduleTable`.

- [ ] **Step 2: SchedulePage shows `ScheduleTable` and `ScheduleTimeline` side by side (table top, timeline bottom)**

- [ ] **Step 3: Smoke test on production** — three plans Mon/Wed/Fri 09:00–11:00 render as three blocks on three rows.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/schedule/ScheduleTimeline.tsx dashboard/src/pages/SchedulePage.tsx
git commit -m "feat(dashboard): ScheduleTimeline week-grid view"
```

### Task 2.7: i18n keys for Phase 2

- [ ] **Step 1: Add keys**

`schedule.column.map`, `schedule.column.days`, `schedule.column.time`, `schedule.column.height`, `schedule.column.area`, `schedule.column.repeat`, `schedule.column.next`, `schedule.status.idle`, `schedule.status.active`, `schedule.status.skipped`, `schedule.timeline.title`, `header.rain`, `header.rainPaused`.

- [ ] **Step 2: Commit**

```bash
git commit -am "i18n(dashboard): keys for Phase 2 schedule features"
```

### Task 2.8: Phase 2 gate

- [ ] **Step 1: Gates (TS, lint, build, smoke).**

---

## Phase 3 — Records + Settings

Goal: WorkRecordsPage shows the multipart-parsed records with sensor-cache enrichment surfacing; SettingsPage handles notifications channel preference and nickname edit.

### Task 3.1: WorkRecordsPage table

**Files:**
- Modify: `dashboard/src/pages/WorkRecordsPage.tsx`
- Possibly create: `dashboard/src/components/records/WorkRecordTable.tsx`

- [ ] **Step 1: Fetch records via existing API**

Inspect `dashboard/src/api/client.ts` for the `fetchWorkRecords` method (or equivalent). The DTO since commit `5d10add0` parses the mower's multipart POST and the enrichment in `d8bc7b8a` falls back to live `deviceCache` when fields are missing — the dashboard simply renders whichever fields are present.

- [ ] **Step 2: Columns**

Date, Map name(s), Duration, Area, Cutting height (`target_height + 2` cm), Trigger (manual/scheduled/edge), Status (completed/interrupted).

- [ ] **Step 3: Smoke test + commit**

```bash
git add dashboard/src/pages/WorkRecordsPage.tsx
git commit -m "feat(dashboard): WorkRecordsPage with full enriched DTO"
```

### Task 3.2: Settings — notifications channel UI

**Files:**
- Modify: `dashboard/src/pages/SettingsPage.tsx`
- Possibly create: `dashboard/src/components/settings/NotificationsCard.tsx`

- [ ] **Step 1: Render the notification preference form**

Channels: Push (Expo, mobile only), ntfy (URL config), Home Assistant webhook (URL config), Email (SMTP — server already supports it). Persist via existing endpoint `POST /api/admin/notifications/config` if it exists; otherwise mark as Phase-future and only show the form fields. Verify endpoint location.

- [ ] **Step 2: Smoke test + commit**

```bash
git commit -am "feat(dashboard): notifications channel preference UI"
```

### Task 3.3: Settings — mower nickname edit

**Files:**
- Modify: `dashboard/src/pages/SettingsPage.tsx`
- Possibly create: `dashboard/src/components/settings/NicknameField.tsx`

- [ ] **Step 1: Inline edit with save → POST `/api/dashboard/equipment/:id/nickname` (verify endpoint)**

If endpoint missing, add a tiny dashboard-namespace handler in `server/src/routes/dashboard.ts` that updates `equipment.nickname`. Cloud-API frozen tree untouched.

- [ ] **Step 2: Smoke test** — change nickname, refresh, header reflects.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(dashboard): mower nickname inline edit"
```

### Task 3.4: i18n keys for Phase 3

- [ ] **Step 1: Add keys**

`records.column.date`, `records.column.maps`, `records.column.duration`, `records.column.area`, `records.column.height`, `records.column.trigger`, `records.column.status`, `settings.notifications.title`, `settings.notifications.push`, `settings.notifications.ntfy`, `settings.notifications.ha`, `settings.notifications.email`, `settings.nickname.title`, `settings.nickname.save`.

- [ ] **Step 2: Commit**

```bash
git commit -am "i18n(dashboard): keys for Phase 3 records + settings"
```

### Task 3.5: Phase 3 gate

- [ ] **Step 1: Gates (TS, lint, build, smoke).**

---

## Phase 4 — Drawer (server changes — TDD)

Goal: live read-only diagnostics in the drawer. Three new server endpoints under `/api/dashboard/system/*` plus three drawer cards. Tests first.

### Task 4.1: Server — `/api/dashboard/system/health` (TDD)

**Files:**
- Create: `server/src/__tests__/routes/dashboardSystemHealth.test.ts`
- Modify: `server/src/routes/dashboard.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';

describe('GET /api/dashboard/system/health', () => {
  it('returns mDNS, MQTT broker uptime, and per-mower mqtt_node ping', async () => {
    const res = await request(app).get('/api/dashboard/system/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('mdns');
    expect(res.body.mdns).toHaveProperty('running');
    expect(res.body).toHaveProperty('mqttBroker');
    expect(res.body.mqttBroker).toHaveProperty('uptimeSec');
    expect(res.body).toHaveProperty('mowers');
    expect(Array.isArray(res.body.mowers)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
cd server && npx vitest run __tests__/routes/dashboardSystemHealth.test.ts
```

Expected: FAIL ("404" or shape mismatch).

- [ ] **Step 3: Implement the handler**

In `server/src/routes/dashboard.ts`, add:

```ts
import { isMdnsAdvertiserRunning } from '../services/mdnsAdvertiser.js';
import { brokerStartedAt } from '../mqtt/broker.js'; // export this if missing
import { equipmentRepo } from '../db/repositories/index.js';
import { deviceCache } from '../mqtt/sensorData.js';

dashboardRouter.get('/system/health', (_req: Request, res: Response) => {
  const mowers = equipmentRepo.listAll().map(eq => {
    const cached = deviceCache.get(eq.mower_sn);
    const lastSeen = cached?.lastSeen ?? null;
    return {
      sn: eq.mower_sn,
      online: !!lastSeen && Date.now() - lastSeen < 30_000,
      lastSeenMs: lastSeen,
    };
  });

  res.json({
    mdns: { running: isMdnsAdvertiserRunning() },
    mqttBroker: {
      uptimeSec: brokerStartedAt ? Math.floor((Date.now() - brokerStartedAt) / 1000) : null,
    },
    mowers,
  });
});
```

> If the helpers `isMdnsAdvertiserRunning`, `brokerStartedAt`, `equipmentRepo.listAll`, or `deviceCache.lastSeen` do not exist exactly as written, add the minimum shim. Do not invent: read the file, name truthfully.

- [ ] **Step 4: Run test, verify PASS**

```bash
cd server && npx vitest run __tests__/routes/dashboardSystemHealth.test.ts
```

- [ ] **Step 5: Run full server test suite**

```bash
cd server && npm test
```

Must be green (all 18 + new test).

- [ ] **Step 6: CHANGELOG entry (cloud-api hook does not enforce here, but be a good citizen)**

Add a dated entry in any nearby CHANGELOG (no cloud-api change, so the husky hook is silent — no entry strictly required, but a brief note in `server/CHANGELOG.md` if it exists).

- [ ] **Step 7: Commit**

```bash
git add server/src/__tests__/routes/dashboardSystemHealth.test.ts server/src/routes/dashboard.ts
git commit -m "feat(server): /api/dashboard/system/health endpoint"
```

### Task 4.2: Server — `/api/dashboard/system/lora-status/:sn` (TDD)

**Files:**
- Create: `server/src/__tests__/routes/dashboardSystemLoraStatus.test.ts`
- Modify: `server/src/routes/dashboard.ts`

- [ ] **Step 1: Failing test**

Asserts the endpoint returns `{ pair: { addr, channel }, drift: boolean, lastReport }` when the mower has cached LoRa info, and `404` when no cache row.

- [ ] **Step 2: Implement** — read from `equipment_lora_cache` repository.

- [ ] **Step 3: Test passes + commit**

```bash
git commit -am "feat(server): /api/dashboard/system/lora-status/:sn endpoint"
```

### Task 4.3: Server — log tail filter

**Files:**
- Modify: `server/src/routes/dashboard.ts` (extend existing logs endpoint)
- Modify or create: `server/src/__tests__/routes/dashboardLogsFilter.test.ts`

- [ ] **Step 1: Add `?channel=MAP|BLE|OTA|MQTT|PLAN&tail=N` query support to the existing logs endpoint**

If no existing endpoint, add `GET /api/dashboard/system/logs?channel=&tail=` returning the last N entries from the in-memory log ring. Channel filter matches the `[CHANNEL]` prefix in the log line.

- [ ] **Step 2: Test + commit**

```bash
git commit -am "feat(server): log tail filter (channel + N)"
```

### Task 4.4: NetworkHealthCard

**Files:**
- Create: `dashboard/src/components/drawer/NetworkHealthCard.tsx`

- [ ] **Step 1: Component polls `/api/dashboard/system/health` every 30 s**

Renders three pills: mDNS (green/red), MQTT broker (green + uptime), mqtt_node ping per mower (green/red + last-seen relative time).

- [ ] **Step 2: Wire into `Drawer`** (replace the placeholder paragraph).

- [ ] **Step 3: Smoke test** — toggle mDNS off in env, confirm pill turns red within 30 s.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/drawer/NetworkHealthCard.tsx dashboard/src/shell/DashboardShell.tsx
git commit -m "feat(dashboard): NetworkHealthCard in drawer"
```

### Task 4.5: LiveStatusCard

**Files:**
- Create: `dashboard/src/components/drawer/LiveStatusCard.tsx`

- [ ] **Step 1: Polls `/api/dashboard/system/lora-status/:sn` every 30 s; subscribes to socket for `is_active` flag**

Renders two pills: LoRa pair (addr + channel + drift indicator), is_active (yes/no — read-only here, mutation lives in `/admin`).

- [ ] **Step 2: Wire + smoke test + commit**

```bash
git commit -am "feat(dashboard): LiveStatusCard (LoRa + is_active read-only)"
```

### Task 4.6: ServerLogTail

**Files:**
- Create: `dashboard/src/components/drawer/ServerLogTail.tsx`

- [ ] **Step 1: Component fetches `/api/dashboard/system/logs?tail=200&channel=...` on open**

Channel filter dropdown: ALL / MAP / BLE / OTA / MQTT / PLAN. Auto-refresh every 5 s while drawer is open. Throttle: max 200 lines, fixed-height scroll panel with mono font.

- [ ] **Step 2: Wire + smoke test + commit**

```bash
git commit -am "feat(dashboard): ServerLogTail in drawer (filtered + throttled)"
```

### Task 4.7: i18n keys for Phase 4

- [ ] **Step 1: Add keys**

`drawer.networkHealth.title`, `drawer.networkHealth.mdns`, `drawer.networkHealth.broker`, `drawer.networkHealth.mowerPing`, `drawer.live.title`, `drawer.live.lora`, `drawer.live.isActive`, `drawer.logs.title`, `drawer.logs.channel`, `drawer.logs.all`.

- [ ] **Step 2: Commit**

```bash
git commit -am "i18n(dashboard): keys for Phase 4 drawer"
```

### Task 4.8: Phase 4 gate

- [ ] **Step 1: Server tests + dashboard TS + build green**
- [ ] **Step 2: Smoke test on live mower:** Novabot stock app + OpenNova app login + map + start mowing — all unchanged.
- [ ] **Step 3: Smoke test on dashboard:** open drawer, three cards populate, log tail filter works.
- [ ] **Step 4: `docker compose build --no-cache && docker compose up -d`** — confirm new endpoints survive restart.

---

## Phase 5 — `/admin` extras (server changes — TDD)

Goal: surface mutations that today require SSH or DB editing.

### Task 5.1: Server — POST `/api/admin/equipment/:id/active` (TDD)

**Files:**
- Create: `server/src/__tests__/routes/adminEquipmentActive.test.ts`
- Modify: `server/src/routes/adminPage.ts`

- [ ] **Step 1: Failing test**

POST with `{ active: true }` updates `equipment.is_active = 1` for the row. POST with `{ active: false }` flips to 0. Sets are atomic — only one equipment with the same `(mower_sn, charger_sn)` pair can be active per user (existing constraint per `CLAUDE.md` device pairing rules).

- [ ] **Step 2: Implement**

```ts
adminRouter.post('/equipment/:id/active', requireAdmin, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const active = !!req.body?.active;
  equipmentRepo.setActive(id, active);
  res.json({ ok: true });
});
```

If `equipmentRepo.setActive` is missing, add it as a one-line wrapper around an UPDATE prepared statement (idempotent).

- [ ] **Step 3: Test passes + commit**

```bash
git commit -am "feat(server): POST /api/admin/equipment/:id/active toggle"
```

### Task 5.2: Server — POST `/api/admin/system/mdns/restart` (TDD)

**Files:**
- Create: `server/src/__tests__/routes/adminMdnsRestart.test.ts`
- Modify: `server/src/routes/adminPage.ts`

- [ ] **Step 1: Failing test**

POST returns `{ ok: true, restartedAt: <ms> }`. Calls `restartMdnsAdvertiser()` (existing service function or shim).

- [ ] **Step 2: Implement** — wraps `stopMdnsAdvertiser` + `startMdnsAdvertiser` from `services/mdnsAdvertiser.ts`.

- [ ] **Step 3: Test passes + commit**

```bash
git commit -am "feat(server): POST /api/admin/system/mdns/restart"
```

### Task 5.3: Recalibrate-charging-pose UI button

**Files:**
- Modify: `server/src/routes/adminPage.ts` (HTML body) OR create a small client-side React surface — choose by inspecting current admin panel render path.

- [ ] **Step 1: Surface a button per mower row in admin panel that POSTs to existing `/api/admin/system/recalibrate-charging-pose/:sn`**

Add a confirm modal: "Recalibrate charging pose? This will reboot the mower."

- [ ] **Step 2: Smoke test on live mower** — confirm pose updates in DB and the mower reboots cleanly. Per memory `recalibrate-charging-pose.md`, the auto_recharge_server reads the YAML at boot, so the reboot is required.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(admin): recalibrate-charging-pose button + confirm modal"
```

### Task 5.4: is_active toggle UI

**Files:**
- Modify: `server/src/routes/adminPage.ts`

- [ ] **Step 1: Add a per-equipment-row toggle that POSTs to `/api/admin/equipment/:id/active`**

- [ ] **Step 2: Smoke test** — toggle off; verify Novabot app stops listing that pair (per memory `feedback_decentralized.md` and commit `e27c7107` "Novabot app sees one pair at a time").

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(admin): is_active equipment toggle"
```

### Task 5.5: mDNS soft-restart UI

**Files:**
- Modify: `server/src/routes/adminPage.ts`

- [ ] **Step 1: Single button under "System" section, POSTs to `/api/admin/system/mdns/restart`**

- [ ] **Step 2: Smoke test** — click; confirm "mDNS restarted" toast; mower's `set_server_urls.sh` resolves `opennovabot.local` again on next reboot.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(admin): mDNS soft-restart button"
```

### Task 5.6: Phase 5 gate

- [ ] **Step 1: Server tests + dashboard build green**
- [ ] **Step 2: Live smoke test on Novabot stock app + OpenNova app — both still log in, see equipment, mow.**
- [ ] **Step 3: `docker compose build --no-cache && docker compose up -d`**

---

## End: bundle merge to master

### Task E.1: Final smoke test pass

- [ ] **Step 1: Run the full smoke checklist** (see "Cross-cutting rules" above) on `feat/dashboard-catchup`.
- [ ] **Step 2: Verify regression-pass of issue #14 and #15** — multi-polygon home screen, NaN-guard.
- [ ] **Step 3: `cd server && npm test`** — green.
- [ ] **Step 4: `cd dashboard && npm run build`** — green.

### Task E.2: Squash-bundle PR to master

- [ ] **Step 1: Push the integration branch**

```bash
git push origin feat/dashboard-catchup
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --base master --head feat/dashboard-catchup \
  --title "feat(dashboard): catch-up rebuild — 18 features across 6 phases" \
  --body "$(cat <<'EOF'
## Summary

Brings the dashboard to feature parity with the current OpenNova app + cloud-API server.

- 6 phases (Foundation, Map, Schedule, Records+Settings, Drawer, /admin extras)
- New tab-based shell (Header / Tabs / Drawer)
- `MowerMap.tsx` split into focused layer components
- 5 new server endpoints, all under `/api/dashboard/system/*` and `/api/admin/*`
- Cloud-API frozen tree untouched
- Issue #14 (multi-polygon home screen) and #15 (NaN white-screen) regression-tested

## Test plan

- [ ] Server vitest suite green (18 + new tests)
- [ ] `npm run build` green for dashboard
- [ ] Manual: Novabot stock app login + map + mow on `LFIN1231000211`
- [ ] Manual: OpenNova app login + map + mow on same mower
- [ ] Dashboard: each tab renders, drawer cards populate, /admin extras work
- [ ] `docker compose build --no-cache && docker compose up -d` clean
EOF
)"
```

### Task E.3: Tag release after merge

- [ ] **Step 1: After merge, run `./release.sh`** to bump version, push tag, build + push docker buildx multi-arch image.

---

## Self-review

**Spec coverage:**
- 18 features all mapped to tasks (Tasks 1.9–1.16, 2.1–2.6, 3.1–3.3, 4.4–4.6, 5.3–5.5)
- Server safety constraints enforced via cross-cutting rules + TDD in Phases 4 & 5
- DB additive-only — no DROP / RENAME tasks
- Branch / phasing / smoke-test discipline reflected in every phase gate

**Placeholders scan:** scanned. None found beyond explicit "verify endpoint location" / "if missing, add" callouts that name the exact file to inspect — those are not placeholders, they are conditional implementation steps.

**Type consistency:** `DeviceState`, `MapData`, `MapCalibration` referenced consistently. `ActiveMowerProvider` / `useActiveMowerContext` / `useActiveMower` follow the same naming pattern across Tasks 0.1, 0.2, 0.7. `MowerPicker` / `RainBadge` / `Header` props match call sites in `DashboardShell`.

**Open follow-ups (not in this plan):**
- Mobile UI (`mobile/`) only inherits the NaN-guard already merged; future phase if mobile users adopt the new shell.
- Visual / theme refresh out of scope.
- Adding test infra to dashboard out of scope.
