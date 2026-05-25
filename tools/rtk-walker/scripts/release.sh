#!/usr/bin/env bash
# Builds the RTK walker firmware with today's date-based version stamped in,
# writes signed OTA metadata, and prints the scp/docker copy commands needed
# to publish to the OpenNova server.
set -euo pipefail
cd "$(dirname "$0")/.."

usage() {
    cat >&2 <<'EOF'
Usage: scripts/release.sh [--unsigned] [--from-bin PATH] [--version VERSION] [--output-dir DIR]

Environment:
  WALKER_OTA_SIGNING_KEY or SIGNING_KEY  P-256 private key PEM for release signing
  WALKER_OTA_KEY_ID or SIGNING_KEY_ID    key id stored in metadata
  WALKER_OTA_VERSION                    version override (same as --version)

Unsigned metadata is refused by default. Use --unsigned only for local dev.
EOF
}

VERSION=${WALKER_OTA_VERSION:-$(date +"%Y.%m%d.%H%M")}
SOURCE_BIN=${WALKER_OTA_BIN:-}
OUTPUT_DIR="."
ALLOW_UNSIGNED=0

while [ "$#" -gt 0 ]; do
    case "$1" in
        --unsigned)
            ALLOW_UNSIGNED=1
            shift
            ;;
        --from-bin)
            SOURCE_BIN=${2:?--from-bin requires a path}
            shift 2
            ;;
        --version)
            VERSION=${2:?--version requires a value}
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR=${2:?--output-dir requires a path}
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown argument: $1" >&2
            usage
            exit 2
            ;;
    esac
done

SIGNING_KEY=${WALKER_OTA_SIGNING_KEY:-${SIGNING_KEY:-}}
KEY_ID=${WALKER_OTA_KEY_ID:-${SIGNING_KEY_ID:-walker-p256-2026-01}}

if [ -z "$SIGNING_KEY" ] && [ "$ALLOW_UNSIGNED" -ne 1 ]; then
    echo "Refusing to write release metadata without WALKER_OTA_SIGNING_KEY or SIGNING_KEY." >&2
    echo "Use --unsigned only for local development builds that must not be offered OTA." >&2
    exit 1
fi
if [ -n "$SIGNING_KEY" ] && [ ! -f "$SIGNING_KEY" ]; then
    echo "Signing key not found: $SIGNING_KEY" >&2
    exit 1
fi

if [ -z "$SOURCE_BIN" ]; then
    echo "Building walker firmware $VERSION..."
    ~/.platformio/penv/bin/platformio run -e jc3248w535-walker
    SOURCE_BIN=.pio/build/jc3248w535-walker/firmware.bin
fi

SRC=$SOURCE_BIN
if [ ! -f "$SRC" ]; then
    echo "Build did not produce $SRC" >&2
    exit 1
fi

mkdir -p "$OUTPUT_DIR"
OUT="$OUTPUT_DIR/walker_firmware_${VERSION}.bin"
cp "$SRC" "$OUT"

# md5sum/sha256sum on Linux; md5/shasum on macOS.
if command -v md5sum >/dev/null 2>&1; then
    MD5=$(md5sum "$OUT" | awk '{print $1}')
else
    MD5=$(md5 -q "$OUT")
fi
if command -v sha256sum >/dev/null 2>&1; then
    SHA256=$(sha256sum "$OUT" | awk '{print $1}')
else
    SHA256=$(shasum -a 256 "$OUT" | awk '{print $1}')
fi

SIZE=$(wc -c < "$OUT" | tr -d ' ')
SIGNATURE=""

if [ -n "$SIGNING_KEY" ]; then
    PAYLOAD=$(mktemp)
    SIG_DER=$(mktemp)
    cat > "$PAYLOAD" <<EOF
walker-ota-v1
device_type=walker
version=$VERSION
size=$SIZE
sha256=$SHA256
EOF
    openssl dgst -sha256 -sign "$SIGNING_KEY" -out "$SIG_DER" "$PAYLOAD"
    SIGNATURE=$(openssl base64 -A -in "$SIG_DER")
    rm -f "$PAYLOAD" "$SIG_DER"
else
    echo "WARNING: writing unsigned local-dev metadata; server will not offer this as OTA." >&2
fi

META="${OUT%.bin}.json"
OUT_BASE=$(basename "$OUT")
META_BASE=$(basename "$META")
cat > "$META" <<EOF
{
  "version": "$VERSION",
  "device_type": "walker",
  "filename": "$OUT_BASE",
  "md5": "$MD5",
  "sha256": "$SHA256",
  "size": $SIZE,
  "signature": "$SIGNATURE",
  "signing_key_id": "$KEY_ID",
  "keyId": "$KEY_ID",
  "description": "Walker firmware $VERSION"
}
EOF

echo
echo "================================================================"
echo "Built: $OUT"
echo "Size: $SIZE bytes ($((SIZE/1024)) KB)"
echo "MD5: $MD5"
echo "SHA256: $SHA256"
if [ -n "$SIGNATURE" ]; then
    echo "Signature: ${SIGNATURE:0:24}..."
    echo "Key ID: $KEY_ID"
else
    echo "Signature: UNSIGNED (--unsigned)"
fi
echo "================================================================"
echo
echo "Wrote companion metadata: $META"
echo
echo "Publish BOTH files to the OpenNova server (.247):"
echo
echo "  scp $OUT $META rvbcrs@192.168.0.247:/tmp/"
echo "  ssh rvbcrs@192.168.0.247 'echo M@rleen146 | sudo -S docker cp /tmp/$OUT_BASE opennova:/data/firmware/ && echo M@rleen146 | sudo -S docker cp /tmp/$META_BASE opennova:/data/firmware/'"
echo
echo "Then in the admin page > Firmware Updates > Walker firmware:"
echo "  - Click 'Refresh from manifest' to confirm the file is detected"
echo "  - The walker will auto-pull on next boot (otaAutoCheck=true by default)"
echo "  - Or trigger immediately via TFT Settings 'Check + Update' button"
