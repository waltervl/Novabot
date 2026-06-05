#!/usr/bin/env bash
# Regenerate OpenNova-Admin-Manual.pdf from the HTML using headless Chrome.
# Usage:  ./build-pdf.sh
set -euo pipefail
cd "$(dirname "$0")"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Google Chrome not found at $CHROME"; exit 1; }

"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --user-data-dir="$(mktemp -d)" \
  --virtual-time-budget=20000 \
  --print-to-pdf="$PWD/OpenNova-Admin-Manual.pdf" \
  "file://$PWD/OpenNova-Admin-Manual.html"

echo "✓ wrote $PWD/OpenNova-Admin-Manual.pdf"
