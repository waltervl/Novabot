#!/bin/bash
# release-app.sh — Build the OpenNova Android APK and write a release
# manifest. Both files end up in dist/app-release/. You upload them
# manually to the central NAS host (https://downloads.ramonvanbruggen.nl/app/).
#
# The app polls https://downloads.ramonvanbruggen.nl/app/manifest.json directly,
# so there is no per-server endpoint and no Docker image bloat.
#
# Usage:
#   1. Bump app/app.json expo.version (semver).
#   2. ./release-app.sh
#   3. Drag dist/app-release/{manifest.json, opennova-vX.Y.Z.apk} to the NAS.
#
# Prerequisites:
#   - eas-cli installed (npm install -g eas-cli) — used in --local mode, no credits.
#   - JDK 17+ and Android SDK on PATH.
set -e

cd "$(dirname "$0")"

VERSION=$(node -p "require('./app/app.json').expo.version")
echo "Building APK for v${VERSION}..."

OUT_DIR="dist/app-release"
mkdir -p "${OUT_DIR}"

APK_NAME="opennova-v${VERSION}.apk"
APK_OUT="${OUT_DIR}/${APK_NAME}"

# ── Build APK locally via EAS (no cloud queue, no credits) ───────────────────
(
  cd app
  npx eas build \
    --platform android \
    --profile apk-release \
    --local \
    --non-interactive \
    --output "../${APK_OUT}"
)

# ── Integrity metadata ───────────────────────────────────────────────────────
SHA=$(shasum -a 256 "${APK_OUT}" | awk '{print $1}')
SIZE=$(stat -f '%z' "${APK_OUT}" 2>/dev/null || stat -c '%s' "${APK_OUT}")

# ── Manifest ─────────────────────────────────────────────────────────────────
# apkUrl is the absolute URL on the central NAS host. Cache-busted on the
# client side; the static path here matches what the upload step expects.
APK_URL="https://downloads.ramonvanbruggen.nl/app/${APK_NAME}"
RELEASED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RELEASE_NOTES=$(git log --oneline -10 | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))')
SERVER_VERSION=$(node -p "require('./server/package.json').version")

cat > "${OUT_DIR}/manifest.json" <<EOF
{
  "version": "${VERSION}",
  "platform": "android",
  "apkUrl": "${APK_URL}",
  "sha256": "${SHA}",
  "sizeBytes": ${SIZE},
  "releaseNotes": ${RELEASE_NOTES},
  "minSupportedServerVersion": "${SERVER_VERSION}",
  "releasedAt": "${RELEASED_AT}"
}
EOF

echo ""
echo "Built v${VERSION}:"
echo "  APK:      ${APK_OUT} ($(du -h "${APK_OUT}" | awk '{print $1}'))"
echo "  Manifest: ${OUT_DIR}/manifest.json"
echo "  SHA256:   ${SHA}"
echo ""
echo "Next: upload both files to the NAS folder behind"
echo "      https://downloads.ramonvanbruggen.nl/app/"
