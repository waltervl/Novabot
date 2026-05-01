#!/bin/bash
# release-app.sh — Build APK via EAS local build, publish to server/firmware/app/,
# write manifest.json, commit + tag + push.
#
# NOTE: APKs are tracked in git (~25 MB per release). This is intentional for
# self-hosted simplicity — each server instance serves the APK directly from
# the repository. Expect git repo growth of ~25 MB per release.
#
# Usage: ./release-app.sh
# Prerequisites:
#   - EAS CLI installed: npm install -g eas-cli
#   - Android SDK / build toolchain available locally (EAS local build)
#   - Bump app/app.json expo.version before running
set -e

cd "$(dirname "$0")"

# ── Resolve version from app/app.json ─────────────────────────────────────────
VERSION=$(node -p "require('./app/app.json').expo.version")
echo "Building APK for v${VERSION}..."

APK_NAME="opennova-v${VERSION}.apk"
APK_OUT="server/firmware/app/${APK_NAME}"

# ── Build APK via EAS local build (apk-release profile) ───────────────────────
# --profile apk-release: buildType=apk, appVersionSource=local, distribution=internal
# --local: run the build on this machine (no EAS cloud queue)
# --non-interactive: no prompts
# --output: drop the finished APK directly into server/firmware/app/
(
  cd app
  npx eas build \
    --platform android \
    --profile apk-release \
    --local \
    --non-interactive \
    --output "../${APK_OUT}"
)

# ── Integrity metadata ─────────────────────────────────────────────────────────
SHA=$(shasum -a 256 "${APK_OUT}" | awk '{print $1}')
# macOS: stat -f '%z'; Linux: stat -c '%s'
SIZE=$(stat -f '%z' "${APK_OUT}" 2>/dev/null || stat -c '%s' "${APK_OUT}")

# ── Server version (minSupportedServerVersion) ────────────────────────────────
SERVER_VERSION=$(node -p "require('./server/package.json').version")

# ── Release notes: last 10 commits, single line ───────────────────────────────
RELEASE_NOTES=$(git log --oneline -10 | tr '\n' ';' | sed 's/;$//')

# ── Timestamp ─────────────────────────────────────────────────────────────────
RELEASED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# ── Write manifest.json ───────────────────────────────────────────────────────
cat > server/firmware/app/manifest.json <<EOF
{
  "version": "${VERSION}",
  "platform": "android",
  "apkFileName": "${APK_NAME}",
  "sha256": "${SHA}",
  "sizeBytes": ${SIZE},
  "releaseNotes": "${RELEASE_NOTES}",
  "minSupportedServerVersion": "${SERVER_VERSION}",
  "releasedAt": "${RELEASED_AT}"
}
EOF

echo "Manifest written."

# ── Commit, tag, push ─────────────────────────────────────────────────────────
git add "${APK_OUT}" server/firmware/app/manifest.json
git commit -m "release(app): v${VERSION}"
git tag "app-v${VERSION}"
git push && git push --tags

echo ""
echo "Released app v${VERSION}"
echo "  APK: ${APK_OUT}"
echo "  SHA256: ${SHA}"
echo "  Size: ${SIZE} bytes"
echo "  Tag: app-v${VERSION}"
