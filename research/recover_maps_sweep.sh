#!/bin/bash
# recover_maps_sweep.sh
#
# Generate N portable-bundle recovery files at evenly-spaced orientation
# values so the operator can click Restore + Apply Exact on each from the
# dashboard until one lines up with reality. Useful when the bundle's
# stored charging_pose.orientation is in a different reference frame than
# the mower's current localization, and a single guess (--set-orientation-deg)
# doesn't land it.
#
# Usage on the RPi:
#   bash recover_maps_sweep.sh LFIN2231000633
#
# Output: 8 bundles `<iso>_recovery_set<deg>.novabotmap`, one per 45° step.

set -euo pipefail

SN="${1:-}"
if [ -z "$SN" ]; then
  echo "Usage: $0 <MOWER_SN>" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RECOVER="${SCRIPT_DIR}/recover_maps_from_zip.sh"
if [ ! -f "$RECOVER" ]; then
  # Fall back to current directory
  RECOVER="./recover_maps_from_zip.sh"
fi
if [ ! -f "$RECOVER" ]; then
  echo "ERROR: recover_maps_from_zip.sh not found next to this script" >&2
  exit 1
fi

# 8 evenly-spaced bundles across the full 360° circle.
for deg in 0 45 90 135 180 225 270 315; do
  echo "=== Generating bundle with orientation = ${deg}° ==="
  bash "$RECOVER" --set-orientation-deg "$deg" "$SN"
  echo
done

echo "Done. Open the dashboard's Portable Map Bundle section → Refresh →"
echo "Restore each *_set<deg>.novabotmap → Apply Exact → eyeball alignment."
echo "Stop at the one that lines up with satellite/reality."
