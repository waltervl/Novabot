#!/usr/bin/env bash
#
# Fetch mtools (mcopy/mtype) binaries for each target platform into
# vendor/mtools/<platform>-<arch>/, where the installer's imagePatcher.ts looks
# for them. mcopy and mtype are the same multi-call mtools binary (it dispatches
# on argv[0]), so each platform gets two copies of one binary.
#
#   ./vendor/mtools/fetch.sh
#
# Sources:
#   - macOS (current arch) : the Homebrew `mcopy` already on PATH.
#   - Linux x64 / arm64    : Debian package inside Docker (glibc — runs on the
#                            common desktop distros + Raspberry Pi OS).
#   - Windows x64          : ezwinports prebuilt (best effort; verify on Windows).
#
# Each binary is tiny (~200 KB). Re-run any time; it overwrites in place.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log() { printf '%s\n' "$*" >&2; }

# Install one source binary as both mcopy and mtype in vendor/mtools/<dir>/.
place() { # <dir> <src> [.exe]
  local dir="$1" src="$2" ext="${3:-}"
  mkdir -p "$HERE/$dir"
  cp "$src" "$HERE/$dir/mcopy$ext"
  cp "$src" "$HERE/$dir/mtype$ext"
  chmod +x "$HERE/$dir/mcopy$ext" "$HERE/$dir/mtype$ext" 2>/dev/null || true
  log "  wrote $dir/{mcopy$ext,mtype$ext}"
}

fetch_macos() {
  command -v mcopy >/dev/null 2>&1 || { log "SKIP macOS: no mcopy on PATH (brew install mtools)"; return; }
  local bin dir desc
  bin="$(realpath "$(command -v mcopy)" 2>/dev/null)" || return
  # Label by the binary's REAL architecture (file/lipo), NOT the shell's uname:
  # an arm64 Mac can only produce a darwin-arm64 binary. Build the Intel copy on
  # an Intel Mac (or `arch -x86_64 brew install mtools`).
  desc="$(file -b "$bin")"
  case "$desc" in
    *arm64*) dir="darwin-arm64" ;;
    *x86_64*) dir="darwin-x64" ;;
    *) log "SKIP macOS: unknown arch for $bin"; return ;;
  esac
  log "fetch $dir from local mtools ($bin)..."
  place "$dir" "$bin"
}

fetch_linux() { # <docker-platform> <vendor-dir>
  local plat="$1" dir="$2" out
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 || {
    log "SKIP $dir: docker not available"; return; }
  out="$(mktemp)"
  log "fetch $dir via docker ($plat)..."
  if docker run --rm --platform "$plat" debian:bookworm-slim bash -c \
      'apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq mtools >/dev/null 2>&1 && cat "$(readlink -f "$(command -v mcopy)")"' \
      > "$out" 2>/dev/null && [ -s "$out" ]; then
    place "$dir" "$out"
    file "$HERE/$dir/mcopy" 2>/dev/null | sed 's/^/    /' >&2
  else
    log "  FAILED $dir (docker run / apt failed)"
  fi
  rm -f "$out"
}

fetch_windows() {
  local url="https://downloads.sourceforge.net/project/ezwinports/mtools-4.0.18-w32-bin.zip"
  local tmp; tmp="$(mktemp -d)"
  log "fetch win32-x64 from ezwinports (best effort)..."
  if curl -fsSL "$url" -o "$tmp/m.zip" 2>/dev/null && unzip -oq "$tmp/m.zip" -d "$tmp/x" 2>/dev/null; then
    local mc mt
    mc="$(find "$tmp/x" -iname 'mcopy.exe' | head -1)"
    mt="$(find "$tmp/x" -iname 'mtype.exe' | head -1)"
    if [ -n "$mc" ]; then
      mkdir -p "$HERE/win32-x64"
      cp "$mc" "$HERE/win32-x64/mcopy.exe"
      [ -n "$mt" ] && cp "$mt" "$HERE/win32-x64/mtype.exe" || cp "$mc" "$HERE/win32-x64/mtype.exe"
      # Co-locate any DLLs the build needs (Windows resolves them next to the exe).
      find "$tmp/x" -iname '*.dll' -exec cp {} "$HERE/win32-x64/" \; 2>/dev/null || true
      log "  wrote win32-x64 (VERIFY on Windows; DLLs, if any, co-located)"
    else
      log "  FAILED win32-x64: mcopy.exe not found in archive"
    fi
  else
    log "  FAILED win32-x64 download."
    log "  -> On Windows, install mtools (MSYS2: 'pacman -S mtools') — the app's"
    log "     PATH fallback finds it, which is enough for testing."
  fi
  rm -rf "$tmp"
}

log "== fetching mtools into vendor/mtools =="
fetch_macos
fetch_linux linux/amd64 linux-x64
fetch_linux linux/arm64 linux-arm64
fetch_windows
log "== done =="
