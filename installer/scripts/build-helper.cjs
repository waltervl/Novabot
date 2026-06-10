#!/usr/bin/env node
/*
 * Compile the `fdwrite` SD-write helper (macOS only) into vendor/fdwrite as a
 * universal (arm64 + x86_64) binary. No-op on other platforms (in-app fast
 * flashing is macOS-only). Written in Node (not sh) so `npm run build` is safe
 * on Windows/Linux CI where a POSIX shell may not be on PATH.
 */
const { execFileSync } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');

if (process.platform !== 'darwin') {
  console.log('build:helper: skipping (macOS only)');
  process.exit(0);
}

const root = join(__dirname, '..');
mkdirSync(join(root, 'vendor'), { recursive: true });
execFileSync(
  'clang',
  ['-O2', '-arch', 'arm64', '-arch', 'x86_64', '-Wall', '-o', 'vendor/fdwrite', 'native/fdwrite.c'],
  { cwd: root, stdio: 'inherit' },
);
console.log('build:helper: built vendor/fdwrite');
