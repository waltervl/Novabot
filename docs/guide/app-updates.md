# In-App Updates (Android)

The OpenNova Android app polls your server every time it foregrounds (and
every 12 hours in the background) for a newer APK. When one is published
the app shows an "Update available" modal with release notes and a
one-tap install button. iOS users see the same modal but the action
opens the GitHub Releases page — Apple's distribution rules require
TestFlight or the App Store.

## How users update

1. Modal shows on next app foreground.
2. Tap **Update** → APK downloads → SHA256 verified → system installer launches.
3. Install permission prompt (first install only): tap **Settings** → toggle "Allow from this source" for OpenNova → return → confirm install.

## How to publish a new APK

1. Bump `expo.version` in `app/app.json` (semver — patch / minor / major).
2. From the repo root run:
   ```bash
   ./release-app.sh
   ```
3. The script:
   - Builds the APK locally via `npx eas build --profile apk-release --local`.
   - Drops it at `server/firmware/app/opennova-v<version>.apk`.
   - Computes SHA256 + file size.
   - Writes `server/firmware/app/manifest.json` with `version`, `apkUrl`, `sha256`, `sizeBytes`, recent commit summary as release notes, and the current server version as `minSupportedServerVersion`.
   - Commits the APK + manifest, tags `app-v<version>`, pushes branch + tag.

After the push, every running OpenNova app pointed at any server that has pulled the latest commit will offer the update on next foreground.

## Server endpoint

`GET /api/app/latest` — returns the manifest (200) or 204 (no release published) or 404 (manifest missing). The APK is served at `/firmware/app/<file>` (only the `app/` subtree of `server/firmware/` is exposed — other firmware files stay private).

Override the base URL in the response (useful behind a reverse proxy):
```bash
export OTA_BASE_URL=https://nova.example.com
```

## Rolling back a release

Bump `expo.version` to the older number you want users to land on, then run `./release-app.sh` again. Users get prompted normally — the app compares semver, not "newer than skipped".

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Modal never shows | `GET /api/app/latest` returns 204 / 404, or `version` ≤ installed, or user tapped "Skip this version" earlier. |
| "SHA256 mismatch" error | Manifest hash is stale — rebuild the APK or re-write the manifest. Possibly corrupted download — retry. |
| "App not installed" at the system installer | Signing certificate changed between releases (e.g. switched signing keys). Users must uninstall first, then install the new APK. |
| Modal shows on iOS but Update button does nothing useful | Expected — iOS opens the GitHub Releases page, no in-app install. |

## Skipped versions

Tapping "Skip this version" persists the version in `expo-secure-store` and suppresses the modal for that exact version. The next release (any newer semver) shows the modal again.

## Storage cost

APKs are tracked in git so the server can self-host them without external storage. Each release adds ~20-30 MB to the repo. Consider a periodic prune of older `server/firmware/app/opennova-v*.apk` files if disk pressure becomes a concern — the manifest only references the latest.
