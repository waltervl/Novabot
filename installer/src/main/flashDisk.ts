import { statSync } from 'node:fs';
import { findSafeDriveForFlash } from './drives.js';
import type { Drive as DrivelistDrive } from 'drivelist';
import { flashMac } from './flashMac.js';
import { flashLinux } from './flashLinux.js';
import { flashWindows } from './flashWindows.js';

/**
 * Cross-platform SD writer. This module is the safety gate + per-OS dispatcher;
 * the actual raw write lives in a platform module:
 *   - macOS  : flashMac.ts    — bundled `fdwrite` helper + `authopen` (no FDA).
 *   - Linux  : flashLinux.ts  — `pkexec` + `dd status=progress`.
 *   - Windows: flashWindows.ts — elevated PowerShell raw write (UNVERIFIED yet).
 *
 * SAFETY (all platforms): before writing we RE-ENUMERATE the attached safe
 * removable drives and refuse unless `device` is genuinely one right now
 * (`findSafeDriveForFlash` → `isSafeTarget`: removable, non-system, writable,
 * SD-sized). A buggy or compromised renderer cannot make us write the system
 * disk, on any OS.
 */
export interface FlashDiskOptions {
  /** The patched, decompressed image to write. */
  imagePath: string;
  /** Whole-disk device, e.g. `/dev/disk4`, `/dev/sdb`, `\\.\PhysicalDrive2`. */
  device: string;
  /** Progress callback: bytes written so far, total image bytes, current B/s. */
  onProgress: (written: number, total: number, bytesPerSec: number) => void;
  /** Optional cancel signal; kills the writer (leaving a partial card). */
  signal?: AbortSignal;
  /** Injectable safe-drive resolver (defaults to the real one). For tests. */
  findSafeDrive?: (device: string) => Promise<DrivelistDrive | null>;
}

/** What each platform writer receives once the target has been validated. */
export interface PlatformFlashArgs {
  imagePath: string;
  /** The validated whole-disk device node. */
  device: string;
  /** The live drivelist drive (source of the raw node / extra fields). */
  safe: DrivelistDrive;
  /** Total image size in bytes. */
  total: number;
  onProgress: (written: number, total: number, bytesPerSec: number) => void;
  signal?: AbortSignal;
}

export async function flashDisk(options: FlashDiskOptions): Promise<void> {
  const { imagePath, device, onProgress, signal } = options;
  const findSafe = options.findSafeDrive ?? findSafeDriveForFlash;

  // Un-spoofable guard: the device must be a safe removable disk right now.
  const safe = await findSafe(device);
  if (safe === null) {
    throw new Error(
      'refusing to flash: target is not a currently-attached safe removable device',
    );
  }
  if (signal?.aborted) {
    throw new Error('flash cancelled');
  }

  const total = statSync(imagePath).size;
  const args: PlatformFlashArgs = { imagePath, device, safe, total, onProgress, signal };

  switch (process.platform) {
    case 'darwin':
      return flashMac(args);
    case 'linux':
      return flashLinux(args);
    case 'win32':
      return flashWindows(args);
    default:
      throw new Error(`In-app flashing is not supported on ${process.platform}.`);
  }
}
