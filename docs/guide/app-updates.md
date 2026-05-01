# In-App Updates (Android)

The OpenNova Android app polls a central release host every time it
foregrounds (and every 12 hours in the background). When a newer APK is
published the app shows an "Update available" modal with release notes
and a one-tap install button. iOS users see the same modal but the
action opens the GitHub Releases page — Apple's distribution rules
require TestFlight or the App Store.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  downloads.ramonvanbruggen.nl/app/                          │
│    ├── manifest.json   ← polled by every app instance       │
│    └── opennova-vX.Y.Z.apk                                  │
└──────────────┬──────────────────────────────────────────────┘
               │ HTTPS (no auth)
               ▼
        ┌──────────────┐
        │  OpenNova    │  app polls manifest, downloads APK,
        │  Android app │  verifies SHA256, launches installer.
        └──────────────┘
```

No per-server endpoint, no Docker image bloat — the app talks to the
NAS host directly.

## How users update

1. Modal shows on next app foreground.
2. Tap **Update** → APK downloads → SHA256 verified → system installer launches.
3. Install permission prompt (first install only): tap **Settings** → toggle "Allow from this source" for OpenNova → return → confirm install.

## How to publish a new APK (publisher only)

1. Bump `expo.version` in `app/app.json`.
2. From the repo root run:
   ```bash
   ./release-app.sh
   ```
   The script:
   - Builds the APK locally via `eas build --local` (no EAS cloud credits).
   - Computes SHA256 + file size.
   - Writes `dist/app-release/manifest.json` with the absolute apkUrl pointing at the NAS host.
3. Upload `dist/app-release/manifest.json` AND `dist/app-release/opennova-vX.Y.Z.apk` to the NAS folder behind `https://downloads.ramonvanbruggen.nl/app/`.

That's it. Every running OpenNova app picks up the new manifest on its next foreground.

## Manifest schema

```json
{
  "version": "1.2.0",
  "platform": "android",
  "apkUrl": "https://downloads.ramonvanbruggen.nl/app/opennova-v1.2.0.apk",
  "sha256": "ab12cd...",
  "sizeBytes": 95342107,
  "releaseNotes": "fixes #13 #17 #19 ...",
  "minSupportedServerVersion": "2026.0501.2336",
  "releasedAt": "2026-05-02T08:30:00Z"
}
```

The app cache-busts the manifest fetch via `?t=<ms>` so freshly uploaded
files appear immediately even when an upstream cache is in front.

## Rolling back a release

Upload the older APK + manifest with the older version number. Users get
prompted normally — the app compares semver, not "newer than skipped".

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Modal never shows | Manifest URL returns 404 / non-OK, or `version` ≤ installed, or user tapped "Skip this version" earlier. |
| "SHA256 mismatch" error | Manifest hash is stale — rebuild the APK or update the manifest's `sha256`. Possibly corrupted download — retry. |
| "App not installed" at the system installer | Signing certificate changed between releases (e.g. switched signing keys). Users must uninstall first, then install the new APK. |
| Modal shows on iOS | Expected — iOS opens the GitHub Releases page (Apple distribution rules). |

## Skipped versions

Tapping "Skip this version" persists the version in `expo-secure-store` and suppresses the modal for that exact version. The next release (any newer semver) shows the modal again.
