# React Dashboard Map Editor Integration Plan

> **For agentic workers:** subagent-driven execution. TDD where a test harness exists; dashboard has no vitest, so UI verification is `npm run build` + tsc + user hot-reload test (commit UI only after user sign-off).

**Goal:** Bring the safe map-edit flow (drafts → validation → apply-to-mower with pending-sync → revert) plus a push/pull brush and obstacle expand/reduce into the existing satellite-backed React dashboard editor (`dashboard/src`), reusing the server endpoints already built on this branch (`/api/dashboard/maps/:sn/edit/*`).

**Why here:** `/` serves the React dashboard (`dashboard/dist`) which already has Esri satellite imagery + GPS-georeferenced polygons + vertex drag/insert/remove (PolygonEditor). The earlier `/admin` Canvas editor lacked a reference basemap. This integration gives the user a visual reference (satellite) AND the robust apply path (per-slot pgm masking fixes "mows too far / leaves grass").

**Surface-agnostic backend already done (reuse, do NOT change):**
- `GET /api/dashboard/maps/:sn/edit/geometry` → `{maps:[{mapId,canonical,mapType,alias,parentMap,points:XY[],draft:{points,deleted,isNew}|null}],pendingSync,hasVersions}`
- `PUT /edit/draft` body `{canonical?,mapType?,parentMap?,points?,deleted?}` → `{ok,canonical}`/400
- `DELETE /edit/drafts` → `{ok}`
- `POST /edit/apply` → `{ok,reason?,validation?{ok,errors[],warnings[]},applied?}` (422/409/400/502)
- `POST /edit/revert` → same
- Points are LOCAL METERS (charger=0,0). Dashboard works in GPS via `gpsToLocal/localToGps` (dashboard/src/utils/coords.ts) using `chargerGps` from `GET /maps/:sn`.

## Existing dashboard facts (verified)
- `dashboard/src/components/map/MowerMap.tsx` (~2082 lines): edit state `editMode 'none'|'edit'|'draw'`, `editVertices [lat,lng][]`, `editingMapId`, `drawType`. Save: `handleSavePolygon()` (line ~892) converts GPS→local via `gpsToLocal(p, chargerGps)` then calls `updateMapArea(sn, mapId, localArea)` (edit) or `createMap(sn, name, localArea, type)` (draw) — the OLD direct endpoints that auto-push (sync_map). PolygonEditor handles vertex drag/insert(midpoint)/remove(right-click).
- `dashboard/src/api/client.ts`: simple `fetch` wrappers, no auth. `fetchMaps`, `createMap`, `updateMapArea`, `deleteMap`. Add new methods here.
- `dashboard/src/utils/coords.ts`: `gpsToLocal`, `localToGps`, `isUsableChargerGps`. `MapData` has `canonicalName`.
- i18n: i18next, `useTranslation()`, `t('map.xxx')`, locales `dashboard/src/i18n/locales/{en,nl,fr,de}.json`.
- Build: `cd dashboard && npm run build` (tsc + vite → dist). Dev: `npm run dev` (5173, proxy /api→:3000). NO vitest.

## File structure
```
dashboard/src/utils/editGeometry.ts        NIEUW  mirror of server editGeometry (brush, hit-test, densify, simplify, types)
dashboard/src/api/client.ts                WIJZIG +5 edit methods + types
dashboard/src/components/map/MapEditBar.tsx NIEUW  floating apply/revert/discard + pending + validation report
dashboard/src/components/map/MowerMap.tsx  WIJZIG save→draft, edit session, brush tool, obstacle offset, mount MapEditBar
dashboard/src/i18n/locales/{en,nl,fr,de}.json  WIJZIG map.edit.* keys
```

---

## Task R1: editGeometry mirror + API client methods

**Files:** Create `dashboard/src/utils/editGeometry.ts`; Modify `dashboard/src/api/client.ts`.

- [ ] **Step 1: Mirror geometry**

Copy `server/src/maps/editGeometry.ts` VERBATIM to `dashboard/src/utils/editGeometry.ts`, changing only the header comment to note it's a mirror (source of truth = server). Zero imports. (We need `applyBrush`, `densifyPolygon`, `hitTestVertex`, `hitTestEdge`, `simplifyPolygon`, `polygonArea`, `XY`, plus an offset for obstacle expand/reduce — see Step 2.)

- [ ] **Step 2: Add polygon offset (expand/reduce)**

Append to `dashboard/src/utils/editGeometry.ts` an `offsetPolygon(pts: XY[], dist: number): XY[]` (positive = expand outward, negative = shrink). Use the miter-join algorithm from `app/src/utils/polygonOffset.ts` `offsetLocalPolygon` (read it; it handles winding + clamps miter spikes). Keep it dependency-free.

- [ ] **Step 3: API client methods + types**

In `dashboard/src/api/client.ts` add (matching the existing `fetch`-wrapper style):

```typescript
export interface EditDraftDto { points: { x: number; y: number }[]; deleted: boolean; isNew: boolean }
export interface EditMapEntry {
  mapId: string; canonical: string; mapType: 'work' | 'obstacle' | 'unicom';
  alias: string | null; parentMap: string | null;
  points: { x: number; y: number }[]; draft: EditDraftDto | null;
}
export interface EditGeometryDto { maps: EditMapEntry[]; pendingSync: boolean; hasVersions: boolean }
export interface EditValidationIssue { canonical: string; code: string; message: string }
export interface EditApplyDto {
  ok: boolean; reason?: string;
  validation?: { ok: boolean; errors: EditValidationIssue[]; warnings: EditValidationIssue[] };
  applied?: { canonical: string; action: string }[];
}

export async function fetchEditGeometry(sn: string): Promise<EditGeometryDto> {
  return (await get(`${BASE}/maps/${encodeURIComponent(sn)}/edit/geometry`)).json();
}
export async function saveEditDraft(sn: string, body: {
  canonical?: string; mapType?: 'work' | 'obstacle'; parentMap?: string;
  points?: { x: number; y: number }[]; deleted?: boolean;
}): Promise<{ ok: boolean; canonical?: string; error?: string }> {
  const res = await fetch(`${BASE}/maps/${encodeURIComponent(sn)}/edit/draft`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return res.json();
}
export async function discardEditDrafts(sn: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/maps/${encodeURIComponent(sn)}/edit/drafts`, { method: 'DELETE' });
  return res.json();
}
async function postEdit(sn: string, action: 'apply' | 'revert'): Promise<EditApplyDto> {
  const res = await fetch(`${BASE}/maps/${encodeURIComponent(sn)}/edit/${action}`, { method: 'POST' });
  try { return await res.json(); } catch { return { ok: false, reason: `http_${res.status}` }; }
}
export async function applyEdits(sn: string): Promise<EditApplyDto> { return postEdit(sn, 'apply'); }
export async function revertEdits(sn: string): Promise<EditApplyDto> { return postEdit(sn, 'revert'); }
```

(Verify `get`/`BASE` names in the file; saveEditDraft/discard/apply use raw fetch because the helpers throw on non-2xx and we need the JSON body. Match whatever the existing `deleteMap` does for non-throwing reads if it differs.)

- [ ] **Step 4: Verify** `cd dashboard && npx tsc --noEmit` clean; mirror diff (only header differs) vs server.
- [ ] **Step 5: Commit** `git add dashboard/src/utils/editGeometry.ts dashboard/src/api/client.ts && git commit -m "feat(dashboard): editGeometry mirror + map-edit API client methods"`

---

## Task R2: Draft-based save + apply/revert bar in MowerMap

**Files:** Create `dashboard/src/components/map/MapEditBar.tsx`; Modify `dashboard/src/components/map/MowerMap.tsx` + i18n.

The existing per-polygon edit/draw UI stays. We change what "Save" does: instead of direct `updateMapArea`/`createMap`, it writes a DRAFT keyed by `canonicalName` (existing maps) or `{mapType,parentMap}` (new obstacle), marks the session dirty, and surfaces a floating bar to apply/revert/discard. Unicom stays read-only.

- [ ] **Step 1: MapEditBar component**

Create `dashboard/src/components/map/MapEditBar.tsx`: a floating panel showing:
- pending change count + (if pendingSync) a "needs re-sync" badge
- "Apply to mower" button (→ onApply), disabled while applying
- "Revert last apply" button (only if hasVersions, → onRevert)
- "Discard changes" button (→ onDiscard, with confirm)
- a validation/status line (errors red, warnings amber, success green)

Props: `{ pendingCount, pendingSync, hasVersions, status, statusKind: 'info'|'error'|'warn'|'ok', busy, onApply, onRevert, onDiscard }`. Use the dashboard's existing styling conventions (Tailwind classes as used in MowerMap panels) + `useTranslation()`.

- [ ] **Step 2: Wire draft save in MowerMap**

In `MowerMap.tsx`:
- Add state: `editGeometry: EditGeometryDto | null`, `editStatus`, `editStatusKind`, `applying`. On mower/map load (and after apply/revert/discard) call `fetchEditGeometry(sn)` to populate it (drives the bar's pendingCount = `maps.filter(m=>m.draft).length`, pendingSync, hasVersions).
- Change `handleSavePolygon`: convert edited GPS verts → local (existing `gpsToLocal`), then:
  - edit existing: find the map's `canonicalName`; `await saveEditDraft(sn, { canonical, points: localArea })`.
  - draw obstacle: `await saveEditDraft(sn, { mapType: 'obstacle', parentMap: <selected work map canonical, default first work map>, points: localArea })`.
  - draw work: work-map creation is NOT part of the edit flow (server saveDraft rejects new work) — keep the OLD `createMap` path for drawing a brand-new WORK area (that's a separate, existing feature), but route obstacle draws + all edits through drafts. Document this split in a comment.
  - After a successful draft save, refresh `fetchEditGeometry(sn)` and re-fetch maps so the polygon shows its draft state; do NOT exit into a pushed state.
- Mount `<MapEditBar>` when `editGeometry` has any draft OR pendingSync, wired to:
  - `onApply`: `const r = await applyEdits(sn)` → on `!ok` map reason→localized status (busy/offline/validation→list errors/locked/no_changes/push_failed+bundle_failed→pending), on ok show warnings + reload maps + geometry.
  - `onRevert`: confirm → `revertEdits(sn)` → reload.
  - `onDiscard`: confirm → `discardEditDrafts(sn)` → reload.

- [ ] **Step 3: i18n keys** add under `map.edit` in en/nl/fr/de: `pending` ("{{count}} pending changes"), `needsResync`, `apply`, `resync`, `revert`, `discard`, `confirmDiscard`, `confirmRevert`, `applied`, `busy`, `offline`, `validationFailed`, `pushFailed`, `noChanges`, `nothingToRevert`. Provide real translations in all four.

- [ ] **Step 4: Verify** `cd dashboard && npx tsc --noEmit` + `npm run build` succeed.
- [ ] **Step 5: DO NOT COMMIT** — dashboard UI; await user hot-reload/build test. Report a test script.

---

## Task R3: Brush (push/pull) + obstacle expand/reduce

**Files:** Modify `dashboard/src/components/map/MowerMap.tsx` (+ PolygonEditor or a sibling) + i18n.

- [ ] **Step 1: Obstacle expand/reduce (simpler, do first)**

When a single obstacle map is selected (not in draw mode), show ± stepper buttons ("Expand"/"Shrink" by 5 cm) in the selected-map info panel. On click: take the obstacle's local points, `offsetPolygon(local, ±0.05)`, write via `saveEditDraft(sn, { canonical, points })`, refresh geometry. Clamp so area stays > 0.5 m². This directly serves "obstacle te ruim / laat gras staan".

- [ ] **Step 2: Brush (push/pull) tool**

Add an edit sub-mode `brush`. UI: a "Push/pull" toggle + radius slider (0.3–2.0 m) shown while editing a selected polygon. Implementation in the Leaflet map:
- On pointer-down near a polygon edge (convert the Leaflet latlng → local via `gpsToLocal`; hit-test with `hitTestEdge` on the local points within radius*2), capture the anchor + a densified copy (`densifyPolygon(localPts, radius/4)`).
- On pointer-move, compute local delta and `applyBrush(base, anchor, delta, radius)`; update the live editVertices (converted back to GPS via `localToGps` for rendering).
- On pointer-up, write the draft (`saveEditDraft(sn,{canonical,points})`) + refresh.
- Use Leaflet map events (`mousedown`/`mousemove`/`mouseup`) gated to brush mode; disable map drag-pan while brushing (`map.dragging.disable()/enable()`), like the existing draw handler does.

(If wiring raw Leaflet pointer math proves fragile, a acceptable fallback is a simpler "drag the nearest single vertex with neighbors easing" — but prefer the brush. Report any deviation.)

- [ ] **Step 3: i18n** keys `map.edit.brush`, `map.edit.radius`, `map.edit.expand`, `map.edit.shrink` in 4 locales.
- [ ] **Step 4: Verify** tsc + build.
- [ ] **Step 5: DO NOT COMMIT** — await user test; report test script.

---

## Task R4: Final verification + acceptance

- [ ] tsc + `npm run build` green for dashboard; server suite still green.
- [ ] User hot-reload test (dev) of the full flow on satellite; then commit R2/R3 after sign-off.
- [ ] Live acceptance: on the real mower, expand an obstacle 5 cm on a problem spot → Apply → mow → confirm closer cut → Revert works. `md5sum mapN.pgm` differ per slot.
- [ ] Build dashboard dist if needed for the user's container flow; push.

## Notes / guardrails
- Reuse server endpoints verbatim; no server changes expected. If a gap appears (e.g. need work-map canonical for obstacle parent), prefer a dashboard-side fix.
- Do NOT touch the unrelated MowerMap features (calibration, charger placement, heatmap, trail, export).
- The `/admin` Canvas editor stays as a no-satellite fallback (committed already); not modified here.
- App (MapEditScreen) work is independent and already uses the same endpoints.
