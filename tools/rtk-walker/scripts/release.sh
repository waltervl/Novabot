#!/usr/bin/env bash
# Builds the RTK walker firmware with today's date-based version stamped in,
# names the output file with that version, prints the scp/docker copy commands
# needed to publish to the OpenNova server.
set -e
cd "$(dirname "$0")/.."

VERSION=$(date +"%Y.%m%d.%H%M")
echo "Building walker firmware $VERSION..."
~/.platformio/penv/bin/platformio run -e jc3248w535-walker

SRC=.pio/build/jc3248w535-walker/firmware.bin
if [ ! -f "$SRC" ]; then
    echo "Build did not produce $SRC" >&2
    exit 1
fi

OUT="walker_firmware_${VERSION}.bin"
cp "$SRC" "$OUT"

# md5sum on Linux, md5 on macOS.
if command -v md5sum >/dev/null 2>&1; then
    MD5=$(md5sum "$OUT" | awk '{print $1}')
else
    MD5=$(md5 -q "$OUT")
fi

SIZE=$(wc -c < "$OUT" | tr -d ' ')

META="${OUT%.bin}.json"
cat > "$META" <<EOF
{
  "version": "$VERSION",
  "device_type": "walker",
  "filename": "$OUT",
  "md5": "$MD5",
  "description": "Walker firmware $VERSION"
}
EOF

echo
echo "================================================================"
echo "Built: $OUT"
echo "Size: $SIZE bytes ($((SIZE/1024)) KB)"
echo "MD5: $MD5"
echo "================================================================"
echo
echo "Wrote companion metadata: $META"
echo
echo "Publish BOTH files to the OpenNova server (.247):"
echo
echo "  scp $OUT $META rvbcrs@192.168.0.247:/tmp/"
echo "  ssh rvbcrs@192.168.0.247 'echo M@rleen146 | sudo -S docker cp /tmp/$OUT opennova:/data/firmware/ && echo M@rleen146 | sudo -S docker cp /tmp/$META opennova:/data/firmware/'"
echo
echo "Then in the admin page > Firmware Updates > Walker firmware:"
echo "  - Click 'Refresh from manifest' to confirm the file is detected"
echo "  - The walker will auto-pull on next boot (otaAutoCheck=true by default)"
echo "  - Or trigger immediately via TFT Settings 'Check + Update' button"
