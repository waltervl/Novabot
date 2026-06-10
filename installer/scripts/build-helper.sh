#!/bin/sh
# Compile the `fdwrite` SD-write helper (macOS only) into vendor/fdwrite as a
# universal (arm64 + x86_64) binary, so the packaged .app runs on either Mac.
# No-op on other platforms (in-app fast flashing is macOS-only).
set -e

if [ "$(uname)" != "Darwin" ]; then
  echo "build:helper: skipping (macOS only)"
  exit 0
fi

cd "$(dirname "$0")/.."
mkdir -p vendor
clang -O2 -arch arm64 -arch x86_64 -Wall -o vendor/fdwrite native/fdwrite.c
echo "build:helper: built vendor/fdwrite ($(lipo -archs vendor/fdwrite 2>/dev/null || echo native))"
