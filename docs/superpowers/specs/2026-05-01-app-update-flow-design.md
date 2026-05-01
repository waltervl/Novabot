# OpenNova App In-App Update Flow — Design

**Date:** 2026-05-01
**Status:** Approved by Ramon (caveman session)
**Scope:** Android only (iOS routes through App Store)

---

## Goal

Notify OpenNova app users when a newer APK is available on their OpenNova
server, let them download + install it from inside the app without visiting a
browser or distributing per-device APKs.

## Why

Current distribution: post APK on GitHub Releases or hand it out manually.
Users don't auto-discover updates and end up on stale versions where
server features don't match (e.g. the `start_navigation` protocol fix in
release `v2026.0501.2158`). Also: the OpenNova ethos is self-hosted —
each user already runs their own server, so the server is the natural
place to host their own APK.

iOS is out of scope for this flow because Apple's TestFlight/App Store
requires their distribution infrastructure. iOS users still see the
update banner but tapped action opens the GitHub Releases URL.

## Architecture

### Server side

**Endpoint:** `GET /api/app/latest`

Response:
```json
{
  "version": "1.2.0",
  "platform": "android",
  "apkUrl": "http://<server>:3000/firmware/app/opennova-v1.2.0.apk",
  "sha256": "ab12cd34...",
  "sizeBytes": 24567890,
  "releaseNotes": "Fixes #13 #17 #19 #20 #23",
  "minSupportedServerVersion": "2026.0501.2158",
  "releasedAt": "2026-05-01T20:00:00Z"
}
```

**APK storage:** `server/firmware/app/` (mirrors existing
`server/firmware/` mower OTA pattern). Static-served at
`/firmware/app/<filename>` via existing express static middleware.

**Index source:** `server/firmware/app/manifest.json` — single source of
truth, bumped manually or by a script when a new APK is uploaded.
Keeping it as a JSON file (not a DB row) lets users manage releases via
git or scp without touching the DB.

**No auth** — endpoint and APK are read-only and the APK is signed, so
serving them publicly is safe.

### App side

**Check trigger:** on app foreground + every 12 hours via background
timer. The check is a single `fetch` against the user's configured
server, gated on network availability. No notifications when the app is
fully closed (pull-style only — push would need FCM and a server-side
broadcast list, both out of scope).

**Version comparison:** semver via existing `compare` helper in the app
(or a small helper if none exists). `nativeApplicationVersion` from
`expo-application` is the source of truth for the installed version.

**User flow:**
1. Server returns version newer than installed → show modal with version,
   release notes, and "Update now" / "Later" / "Skip this version".
2. "Update now" → download APK to cache via `expo-file-system`, show
   progress bar, verify SHA256, then launch installer via
   `expo-intent-launcher` with `android.intent.action.VIEW` + mime
   `application/vnd.android.package-archive` + a FileProvider URI.
3. Android shows the system installer, user confirms, app reinstalls.
4. If SHA256 mismatch → abort, surface error, log to bd as a security
   event.
5. "Skip this version" → store the version in AsyncStorage so we don't
   nag on the same release again.

**iOS path:** modal still shows but the button label is "Open release
page" and the press just `Linking.openURL(githubReleaseUrl)`.

### Manifest changes

`app.json` Android permissions add:
- `REQUEST_INSTALL_PACKAGES` — required to launch the installer Intent.

A `FileProvider` config block is needed via an `expo-build-properties`
plugin entry (or a config plugin) so the cached APK URI is resolvable
across processes:

```xml
<provider
  android:name="androidx.core.content.FileProvider"
  android:authorities="${applicationId}.fileprovider"
  android:exported="false"
  android:grantUriPermissions="true">
  <meta-data
    android:name="android.support.FILE_PROVIDER_PATHS"
    android:resource="@xml/file_provider_paths" />
</provider>
```

`file_provider_paths.xml` exposes the cache dir where downloads land.

### Build / release flow

**APK production:** EAS build (existing) produces the universal APK.
After build:
1. Copy APK into `server/firmware/app/opennova-v<version>.apk`.
2. Compute SHA256, file size.
3. Update `server/firmware/app/manifest.json`.
4. `git commit && release.sh` (or a dedicated `release-app.sh` that just
   ships the APK without cutting a server release).

**Naming convention:** `opennova-v<expo-app-version>.apk` (matches the
`expo.version` field in `app.json`).

## Components

| Layer | New file | Responsibility |
|-------|----------|----------------|
| Server | `server/src/routes/appUpdate.ts` | `GET /api/app/latest` reads manifest.json, returns DTO |
| Server | `server/firmware/app/manifest.json` | Manual/script-edited release index |
| Server | `server/src/__tests__/routes/appUpdate.test.ts` | Endpoint contract test |
| App | `app/src/services/appUpdate.ts` | Check, download, verify, install orchestration |
| App | `app/src/hooks/useAppUpdateCheck.ts` | Foreground + 12h timer trigger |
| App | `app/src/components/UpdatePromptModal.tsx` | UI modal with progress bar |
| App | `app/android/app/src/main/res/xml/file_provider_paths.xml` | FileProvider path config (if managed via prebuild) |
| App | `app/app.json` | Permission + FileProvider plugin entry |
| Docs | `docs/guide/app-updates.md` | User-facing "how do I publish a new APK" |

## Error / edge handling

- Server endpoint 404 (no manifest yet) → app silently skips.
- Manifest version invalid semver → log + skip.
- Network failure → skip silently, retry on next trigger.
- SHA256 mismatch → modal error with "Retry / Cancel" buttons.
- User has install permission denied → modal shows step-by-step "How to
  enable installs from this app" deep-link to system settings via
  `IntentLauncher.startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES')`.
- Server downgrade scenario (manifest version < installed) → no modal,
  log only.
- `minSupportedServerVersion` newer than user's server → modal phrasing
  changes to "Update your server first".

## Out of scope

- iOS native install (App Store / TestFlight required, manual flow only).
- Server-push notifications (would need FCM + per-user device tokens).
- Forced updates without user consent.
- Delta patches (full APK download every time).
- Rollback flow (uninstall → reinstall older APK is manual).

## Open decisions

None — design is final. Implementation starts immediately.
