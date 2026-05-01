# Dashboard Catch-up — Design Spec

**Date:** 2026-04-29
**Status:** Approved (brainstorming session 2026-04-29)
**Branch:** `feat/dashboard-catchup`
**Related:** Beads `Novabot-08d` (this work), `Novabot-yp3` (NaN guard already shipped on master)

## Goal

Bring the OpenNova dashboard (`dashboard/`) to feature parity with the current state of the OpenNova app and cloud-API server. The dashboard has 4 commits in its lifetime; the app has 97 commits since 2026-04-13 and the cloud-API tree has ~25. Issue #15 (NaN white-screen on stock v5.7.1 firmware) is a symptom of that lag.

Implementation is **incremental** — every phase produces a mergeable, shippable PR. All PRs land on `feat/dashboard-catchup`; master is untouched until the final bundle merge.

## Scope (18 features)

### From Beads `Novabot-08d` (13 items)

1. Coverage progress visualization
2. Manual mowing
3. Long-pause safety
4. Schedule status display
5. Rain warning
6. Mower nickname
7. mDNS discovery surface
8. Polygon edit-in-app
9. Obstacle fix
10. Cutting-height picker
11. Recalibrate charging pose button
12. Cloud-import merge mode + historic work records (UI surface)
13. Schedule fixes: alias resolve, week-day, cutGrassHeight/area/timezone display

### Additional in-scope (5 items, picked during brainstorming)

14. Map polygon canonical-name match (server fix landed, dashboard render path needs the equivalent change)
15. Edge-cut button
16. Server log tail
17. Schedule timeline view
18. Map import wizard
19. Multi-mower switcher

### Out of scope

- Mobile UI rewrite — `mobile/` stays as-is (gets the same NaN-guard hardening, nothing else)
- Visual / theme refresh — current dark Tailwind look stays
- Authentication / RBAC model — drawer is read-only by convention, no role enforcement
- Adding test infrastructure to dashboard — no vitest / playwright in `dashboard/`; rely on TypeScript strict mode + manual smoke tests

## Architecture / IA

### Routes

- `/` — Dashboard shell (rebuilt)
- `/admin` — Admin panel (existing, extended)
- `/login` — unchanged

### Dashboard shell layout

```
┌─────────────────────────────────────────────────────────────┐
│ Header                                                       │
│  [Mower picker ▾] [Nickname] [Rain ☂]    [⚙ drawer]         │
├─────────────────────────────────────────────────────────────┤
│ Tabs: [ Map ] [ Schedule ] [ Records ] [ Settings ]         │
├─────────────────────────────────────────────────────────────┤
│  Tab content (full-width)                                    │
└─────────────────────────────────────────────────────────────┘

Drawer (slide-in from the right, opened by gear icon — read-only):
┌──────────────────────┐
│ Network health       │
│  mDNS / MQTT / node  │
│ Live status          │
│  LoRa / is_active    │
│ Server logs          │
│  Tail + filter       │
└──────────────────────┘
```

### State

- `useDevices` socket hook stays the canonical source (devices, sensors, OTA, BLE/MQTT logs, liveOutlines, coveredLanes)
- New `ActiveMowerContext` wraps `useDevices` and filters by selected SN. Persists choice in `localStorage` so refresh keeps state. Mirrors `app/src/hooks/useActiveMower.ts`.
- Drawer open/close = local `useState<boolean>` on shell.

### Drawer / `/admin` split

- Drawer = **read-only** end-user diagnostics. No mutation buttons.
- `/admin` = power-user mutations (recalibrate, OTA trigger, equipment is_active toggle, mDNS soft-restart, equipment management, DB inspect).

## Components affected

### New — shell

- `src/shell/DashboardShell.tsx` — replaces `DashboardPage.tsx` as root
- `src/shell/Header.tsx` — mower picker + nickname + rain badge + gear button
- `src/shell/MowerPicker.tsx` — multi-mower dropdown
- `src/shell/RainBadge.tsx`
- `src/shell/Drawer.tsx` — slide-in container
- `src/contexts/ActiveMowerContext.tsx` — selected SN, persistent in localStorage

### New — tab pages

- `src/pages/MapTab.tsx`
- `src/pages/SchedulePage.tsx`
- `src/pages/WorkRecordsPage.tsx`
- `src/pages/SettingsPage.tsx`

### Map split — refactor `MowerMap.tsx` (2000+ lines) into focused components

- `src/components/map/MapCanvas.tsx` — Leaflet container shell
- `src/components/map/MapPolygonLayer.tsx`
- `src/components/map/MapTrailLayer.tsx`
- `src/components/map/CoverageLayer.tsx`
- `src/components/map/PathDirectionPreview.tsx`
- `src/components/map/MowerMarker.tsx`
- `src/components/map/MapToolbar.tsx`
- `src/components/map/CuttingHeightPicker.tsx` *(new feature)*
- `src/components/map/EdgeCutButton.tsx` *(new feature)*
- `src/components/map/MapImportWizard.tsx` *(new feature)*
- `src/components/map/PolygonEditor.tsx` (existing, expanded for obstacle/canonical-name match)

### Schedule

- `src/components/schedule/ScheduleTable.tsx`
- `src/components/schedule/ScheduleTimeline.tsx` *(new — week grid view)*
- `src/components/schedule/ScheduleStatusBadge.tsx`

### Drawer cards

- `src/components/drawer/NetworkHealthCard.tsx`
- `src/components/drawer/LiveStatusCard.tsx`
- `src/components/drawer/ServerLogTail.tsx`

### Modified

- `src/App.tsx` — router config
- `src/hooks/useDevices.ts` — minimal, may add `log:server` socket event
- `src/i18n/*.ts` — new keys per phase (NL + EN)
- `server/src/routes/adminPage.ts` — new sections for recalibrate, is_active toggle, mDNS restart
- `server/src/routes/dashboard.ts` — new `/system/health`, `/system/lora-status/:sn`, log tail filter param

### Server endpoints — new (under safe namespaces only)

| Endpoint | Verb | Purpose |
|----------|------|---------|
| `/api/dashboard/system/health` | GET | mDNS state, MQTT broker uptime, mqtt_node alive ping per device |
| `/api/dashboard/system/lora-status/:sn` | GET | LoRa pair drift status (reads `equipment_lora_cache`) |
| `/api/dashboard/system/logs?tail=N&channel=X` | GET | Server log tail (extends existing logs endpoint, read-only) |
| `/api/admin/equipment/:id/active` | POST | Toggle `equipment.is_active` (existing column) |
| `/api/admin/system/mdns/restart` | POST | Trigger mDNS advertiser soft-restart |

### Server endpoints — already exist, only need a UI hook

- `/api/admin/system/recalibrate-charging-pose/:sn` (commit `9640363f`)
- `/api/dashboard/maps/:sn/import` or equivalent (cloud-import flow)

## Data flow

```
socket.io ──► useDevices hook ──► ActiveMowerContext ──► tab pages
                                                       └─► drawer cards
REST   ───► ApiClient ──► tab pages / drawer
```

- Drawer cards poll REST every 30s for `/system/health` and `/system/lora-status/:sn`
- ServerLogTail subscribes to a (possibly new) `log:server` socket event extending the existing logs channel
- Map import wizard does multipart POST to the existing import endpoint

## Server safety constraints (HARD RULES)

1. **Cloud-API frozen tree untouched.** `server/src/cloud-api/` (CODEOWNERS-protected, contract-tested via commits `4b71f78b/b03a3bdf/42ebc9ef/...`) gets **zero changes**. All `/api/nova-*` endpoints used by the Novabot and OpenNova apps stay byte-for-byte identical.
2. **New endpoints only under `/api/dashboard/system/*` and `/api/admin/*`** — namespaces no app touches.
3. **DB schema additive only.** Idempotent `ALTER TABLE ADD COLUMN` with try/catch. No DROP, no rename, no type change on existing columns.
4. **Existing sensor / state shapes unchanged.** `mower.sensors.*` field names, MQTT topics, decryption keys — no rename, no type change.
5. **Pre-merge gates per server-touching PR:**
   - `cd server && npm test` (vitest, all 18 files) green
   - `npx tsc --noEmit` clean (server + dashboard)
   - Husky pre-commit cloud-api CHANGELOG hook satisfied
   - **Manual smoke test on live mower (`LFIN1231000211`):** Novabot stock app login + map view + start mowing flow. OpenNova app idem. Both must work before PR is mergeable.
6. **Rollback strategy:** every server commit is independently revertable. No multi-commit chains that only function together.

## Strategy & phasing

| Phase | Scope | PRs | Server changes |
|-------|-------|-----|----------------|
| **0. Foundation** | DashboardShell, Header, MowerPicker, ActiveMowerContext, empty Drawer, tab routing. NaN guard already shipped on master. | ~2 | none |
| **1. Map** | `MowerMap.tsx` split → MapCanvas + 8 layer/component files. Polygon canonical-name render. Polygon edit + obstacle fix expansion. CuttingHeightPicker. EdgeCutButton. MapImportWizard. Coverage progress + manual mowing + long-pause safety. | ~6 | none (all endpoints exist) |
| **2. Schedule** | ScheduleTable refactor. Status display + rain + nickname. Alias resolve + week + cutGrassHeight/area/timezone display. Timeline view. | ~3 | none |
| **3. Records + Settings** | WorkRecordsPage with multipart + sensor-cache enrichment (server side already done, just UI hooks). SettingsPage (notifications channel + nickname edit). | ~2 | none |
| **4. Drawer** | NetworkHealthCard. LiveStatusCard (LoRa drift + is_active read-only). ServerLogTail. | ~3 | **YES** — `/api/dashboard/system/health`, `/system/lora-status/:sn`, log-tail filter param. All new under dashboard namespace. |
| **5. /admin extras** | Recalibrate-charging-pose button (endpoint exists). is_active toggle. mDNS soft-restart. | ~2 | **YES** — `/api/admin/equipment/:id/active`, `/api/admin/system/mdns/restart`. All new under admin namespace. |
| **End** | Squash-bundle PR `feat/dashboard-catchup` → `master` after all phases green + smoke test | 1 | — |

**Sequence rationale:** Phase 0 blocks everything (shell needed before tabs). Phase 1 (map) has the most user-impact and contains the issue #15 fundament. Phases 4 (drawer) and 5 (admin) come last because they hold the only server changes — later position means more stable smoke-test cycles.

## Testing

### Server-side (only phases 4 + 5)

- Vitest unit tests for new `/api/dashboard/system/*` and `/api/admin/*` handlers
- Existing contract tests (`server/src/cloud-api/__tests__/`) must stay green — regression guard for app-facing endpoints
- Pre-merge: `cd server && npm test` + `npx tsc --noEmit`

### Dashboard frontend

- No test infrastructure exists — none added during this rebuild (out of scope)
- TypeScript strict-check (`npx tsc --noEmit -p tsconfig.app.json`) green per PR
- Vite build (`npm run build`) green per PR — Docker image uses dist/ output
- Lint (`npm run lint`) green per PR

### Manual smoke test — required for every merge to `feat/dashboard-catchup`

1. Login on dashboard → mower appears
2. Map tab → polygons render, no white screen
3. Schedule tab → existing plans show
4. Per phase: the just-ported feature works end-to-end (concrete checklist per phase, defined in implementation plan)
5. **Novabot stock app:** login + map view + start mowing — must work
6. **OpenNova app:** login + map view + start mowing — must work
7. Server log via `docker logs --since 5m opennova` — no unexpected errors

### End-bundle merge to master

- Full checklist above, plus regression-pass of issue #14 (multi-polygon home screen) and issue #15 (NaN guard)

## Open questions / risks

1. **i18n** — every new UI string gets NL + EN keys in `src/i18n/`. Existing translations not renamed (current dashboard depends on them). Per-phase key list in implementation plan.
2. **Docker rebuild discipline** — dashboard `dist/` is built INSIDE the container via Dockerfile `npm run build`. Per server-touching PR `docker compose build --no-cache` is required for smoke testing (otherwise Docker uses cached layers — already documented in `CLAUDE.md`).
3. **Stock fw v5.x sensors** — Walter (issue #15) runs v5.7.1, sensor field shapes may diverge from v6.x. Map polygon render must stay robust. Today's NaN-guard covers it; every new layer component (CoverageLayer, PathDirectionPreview, etc.) must follow the same `Number.isFinite` pattern.
4. **MowerMap.tsx 2000-line split** — risk: refactor breaks subtle Leaflet timing / event ordering. Mitigation: PR per layer extraction, smoke test after each split, first move layers without behavior change.
5. **Recalibrate charging pose** — server endpoint exists (`9640363f`), but a mower reboot is required after the call (memory: `recalibrate-charging-pose.md`). UI must clearly warn + confirm modal.
6. **Server log tail bandwidth** — full firehose via socket can be heavy. Filter always default-on, max 200 lines on dashboard, server-side throttle.
7. **Unknown: how many users self-host vs use LFI cloud?** Live testing impact hard to estimate. Mitigation: smoke test only on personal mowers (`LFIN1231000211` / `LFIN2230700238`).
