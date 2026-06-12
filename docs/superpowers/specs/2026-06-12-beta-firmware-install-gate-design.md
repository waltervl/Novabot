# BETA Custom-Firmware Install Gate — Design

**Date:** 2026-06-12
**Status:** Approved design, pending implementation plan
**Goal:** Keep custom (BETA) mower firmware installable, but (a) guarantee a fresh
map backup exists before any beta flash so users can't lose their maps, and
(b) make OpenNova users unmistakably aware that custom firmware is BETA and
dangerous before they flash it.

---

## 1. Problem

Installing custom firmware (`v6.0.2-custom-NN`) on mowers is error-prone and can
brick the mower or wipe all maps. We want to keep it available to people who
opt in, but with a hard data-safety net and a loud, clear warning.

## 2. Two-layer safety model

The design splits the two concerns onto the two layers that can actually
guarantee them:

| Concern | Layer | Guarantee |
|---|---|---|
| "je kan al je kaarten verliezen" | **Server** | A backup ≤24h old always exists before a beta flash. Unbypassable. Protects every path, including the stock app. |
| "HEEL DUIDELIJK gewaarschuwd" | **Client (OpenNova only)** | A red BETA warning + single informed-consent confirmation. |

Rationale: the server can't render a warning screen inside the stock Flutter app,
and a client-side warning can always be bypassed. So each layer owns the thing
it can enforce. The stock Novabot app (which we cannot modify) gets the server
backup protection silently, without a warning.

## 3. Beta detection (shared)

A single predicate, `isBetaFirmware(version: string): boolean`, returns `true`
when the version string matches `/custom/i` — matching the `v6.0.2-custom-NN`
naming convention. Stock versions (`v6.0.2`, `v5.7.1`) return `false`.

- Server copy: new `server/src/services/firmwareSafety.ts`.
- Dashboard copy: extend `dashboard/src/utils/firmwareCapability.ts`.
- Expo app copy: extend `app/src/utils/firmwareCapability.ts`.

Charger flashes are **never** gated (no maps to lose) — the gate only applies to
`device_type === 'mower'`.

## 4. Server gate (the backbone)

Two dispatch paths exist; both get the same guard:

- **OpenNova dashboard + OpenNova Expo app** → `POST /api/dashboard/ota/trigger/:sn`
  (both `dashboard/.../OtaManager.tsx` and `app/.../OtaScreen.tsx` call
  `api.triggerOta`, which hits this endpoint).
- **Stock Flutter Novabot app** → MQTT `ota_upgrade_cmd`, already intercepted in
  `server/src/mqtt/broker.ts` `authorizePublish` (the existing tz-strip intercept).

Shared guard function (e.g. `ensureBetaFlashSafe(sn, version)`), applied for a
**beta mower** flash:

1. If a portable backup for `sn` exists that is **≤24h old**, reuse it → proceed.
2. Otherwise call `createBackup(sn, 'manual')` now (reason `pre-beta-flash`).
3. Backup written OK → dispatch the OTA, return `{ backup: { filename, ts } }`.
4. Maps exist but backup **failed** → block: HTTP `409 { error: 'BACKUP_FAILED', detail }`
   (dashboard/app shows the error; the broker holds the MQTT publish). 
5. No maps at all → nothing to lose → allow + log.

Stock firmware flashes are passed through unchanged (no backup forced, existing
behaviour preserved). This is what makes "backup verplicht" true even for the
stock app and any future path that never creates a backup itself.

The existing portable-backup machinery is reused:
- `createBackup(sn, reason)` from `server/src/services/portableBackup.ts`
  (already wired to `POST /api/admin-status/maps/:sn/portable-backups`).
- Backup listing/recency via the portable-backup vault.

## 5. Client warning UI (OpenNova only)

### 5.1 Dashboard — `dashboard/src/components/ota/OtaManager.tsx`
Reuse the existing `ConfirmDialog` system; add a `beta` variant (deep red).
Clicking **Flash** on a custom version opens the beta dialog instead of the
normal upgrade/downgrade dialog:

- On open, the dialog ensures a fresh backup exists
  (`POST /api/admin-status/maps/:sn/portable-backups`) so the user *sees*
  `Backup gemaakt: <datum tijd> ✓`. This endpoint reuses a backup ≤24h old
  rather than creating a new one on every open/cancel cycle. (The server still
  re-checks/creates at flash time as the real guarantee — the pre-create is for
  visible reassurance.)
- Warning body (red): **BETA software · kan de maaier bricken · kan AL je kaarten wissen.**
- Single confirm button **"Ik begrijp het, flash toch"** (enabled only once the
  backup shows ✓) + **Annuleren**.

### 5.2 Expo app — `app/src/screens/OtaScreen.tsx`
Before the `api.triggerOta(sn, version.id)` call (line ~185), if
`isBetaFirmware(version.version)`, show a red BETA warning modal mirroring the
dashboard copy and consent button. Pre-create the backup via the same endpoint
for the visible ✓, then trigger on confirm.

### 5.3 Stock Flutter Novabot app
No warning (we cannot modify it). Protected silently by the server gate (§4).

## 6. Messaging-only surfaces (no enforcement)

These do not flash mowers; they carry the warning copy only:

- **Wizard / Installer** (`bootstrap/`, `installer/`): a BETA warning banner
  wherever custom firmware is mentioned, linked, or downloaded.
- **Docs**: a prominent BETA block at the top of `docs/reference/OTA.md` and the
  relevant README / firmware download page.
- **Build script** `research/build_custom_firmware.sh`: echo a red BETA banner
  when run.

## 7. Single source of warning copy

One canonical warning text, `BETA_FIRMWARE_WARNING`, referenced everywhere so it
changes in one place:

- Dashboard + Expo app: i18n keys (nl/en/de/fr locale files already exist in
  `dashboard/src/i18n/locales/` and the app's equivalent).
- Server: a TypeScript constant (used in `BACKUP_FAILED` detail / logs).
- Docs: the prose embeds the same wording.
- Build script: echoes the same wording.

Canonical wording (NL, source of truth; translated for en/de/fr):
> ⚠️ BETA — Custom firmware. Dit is experimentele software. Het kan je maaier
> onbruikbaar maken (bricken) en AL je kaarten wissen. Er wordt automatisch een
> backup gemaakt, maar installeer alleen als je de risico's accepteert.

## 8. Testing

- `isBetaFirmware()`: `v6.0.2-custom-36` → true; `v6.0.2` → false; charger → not gated.
- Server gate (`POST /ota/trigger/:sn`):
  - beta mower with no recent backup → backup auto-created, OTA dispatched, `{backup}` returned.
  - beta mower with a backup ≤24h old → reuses it, no second backup, OTA dispatched.
  - beta mower, maps present, backup fails → `409 BACKUP_FAILED`, no OTA dispatched.
  - stock mower → no backup forced, existing behaviour unchanged.
  - charger (beta or not) → never gated.
- Broker intercept: stock-app beta `ota_upgrade_cmd` triggers a backup before forwarding.
- Dashboard: beta dialog shown only for custom versions; confirm disabled until backup ✓.
- Expo app: beta modal shown only for custom versions before `triggerOta`.

## 9. Out of scope

- Changing or warning inside the stock Flutter Novabot app (not modifiable).
- Restore UX changes (restore flow already exists and is unchanged).
- Per-version manual "beta" flagging (detection is purely version-string based).
