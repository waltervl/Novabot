# Bundled mtools binaries

The installer writes the OpenNova first-boot files into the FAT boot partition of
the Raspberry Pi OS image using **mtools** (`mcopy` / `mtype`). mtools edits a
FAT filesystem inside a file at a byte offset (`image.img@@<offset>`) **without
mounting it** — no root, no Full Disk Access, no per-OS mount API. The exact same
invocation works on macOS, Linux and Windows, so there is one code path
([`src/main/imagePatcher.ts`](../../src/main/imagePatcher.ts)).

`mcopy` and `mtype` are the same multi-call `mtools` binary; it dispatches on
`argv[0]`, so each is just a copy of the binary renamed.

## Layout

```
vendor/mtools/<platform>-<arch>/{mcopy,mtype}      # mcopy.exe / mtype.exe on Windows
```

`<platform>-<arch>` is `${process.platform}-${process.arch}`:

| Target            | Directory          | Status        |
|-------------------|--------------------|---------------|
| macOS Apple Silicon | `darwin-arm64`   | ✅ bundled     |
| macOS Intel       | `darwin-x64`       | ⬜ run `fetch.sh` on an Intel Mac |
| Linux x86-64      | `linux-x64`        | ✅ bundled (via `fetch.sh` + Docker) |
| Linux ARM64       | `linux-arm64`      | ✅ bundled (via `fetch.sh` + Docker) |
| Windows x86-64    | `win32-x64`        | ⬜ install mtools on Windows (MSYS2) — PATH fallback covers testing |

Run [`fetch.sh`](fetch.sh) to (re)populate these. It pulls macOS from the local
Homebrew `mcopy`, Linux x64/arm64 from the Debian package inside Docker, and
attempts Windows from ezwinports (best effort). `darwin-x64` requires an Intel
Mac (or `arch -x86_64 brew install mtools`); `win32-x64` can be sourced on a
Windows box — until then the app's PATH fallback uses a system-installed mtools.

At runtime [`imagePatcher.ts`](../../src/main/imagePatcher.ts) resolves the tool
in this order: `OPENNOVA_MTOOLS_DIR` env → packaged `resources/mtools/<dir>/` →
this `vendor/mtools/<dir>/` (dev) → system `PATH` (e.g. a Homebrew `mcopy`).
`electron-builder.yml` ships `vendor/mtools` into the app's resources.

## How to add a platform's binaries

mtools is GPL and tiny (~200 KB). Use a build that links only against the system
C library + libiconv (verify with `otool -L` / `ldd` / `dumpbin /dependents`).

- **macOS** (`darwin-arm64` / `darwin-x64`): `brew install mtools`, then
  `cp "$(realpath "$(brew --prefix)/bin/mcopy")" vendor/mtools/darwin-arm64/mcopy`
  and copy the same binary to `mtype`. Build the Intel copy on / for an Intel Mac
  (or `brew` under `arch -x86_64`).
- **Linux** (`linux-x64` / `linux-arm64`): use a static (musl) build so it runs
  across distros — e.g. from Alpine (`apk add mtools`) inside a container for the
  target arch, or build mtools `--enable-static`. Copy `mtools` to `mcopy` and
  `mtype`, `chmod +x`.
- **Windows** (`win32-x64`): a native (MSYS2/MinGW) `mtools.exe` with no extra
  DLLs; copy to `mcopy.exe` and `mtype.exe`.

After adding binaries, verify the patch path on that OS (build an image, then
`fsck`/`fsck.vfat` the boot partition — it must be clean) before shipping.
