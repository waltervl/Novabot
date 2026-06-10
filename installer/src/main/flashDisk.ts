import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createReadStream, statSync } from 'node:fs';
import { findSafeDriveForFlash } from './drives.js';
import type { Drive as DrivelistDrive } from 'drivelist';

const execFileAsync = promisify(execFile);

/**
 * Write a (patched, decompressed) `.img` to an SD card on macOS using Apple's
 * privileged `authopen` opener — the same mechanism Raspberry Pi Imager uses.
 *
 * WHY authopen: writing a raw disk needs more than being root — macOS requires
 * either Full Disk Access OR an Apple-entitled opener. `authopen` is that
 * entitled binary: it shows one admin-authorization prompt and then hands back a
 * writable fd to the disk. So we need NO Full Disk Access and NO app code-signing
 * for disk access; just the admin prompt. We stream the image into authopen's
 * stdin (it copies stdin to the device), which also means no etcher-sdk, no
 * O_DIRECT aligned buffers, and therefore none of the Electron V8 crashes.
 *
 * SAFETY: before writing we RE-ENUMERATE the attached safe removable drives and
 * refuse unless `device` is genuinely one right now (`findSafeDriveForFlash`). A
 * buggy/compromised renderer cannot make us write the system disk.
 *
 * DEVICE NODE: we write to the RAW node (`/dev/rdiskN`) for speed — the buffered
 * `/dev/diskN` goes through the unified buffer cache and is ~10-30x slower
 * (minutes vs an hour for a 16 GB card). The raw device requires every write to
 * be a 512-byte multiple. Two facts make that hold here: (1) a Pi OS image is
 * always a whole number of 512-byte sectors, so the final write is aligned; and
 * (2) we read the image from a local file far faster than the SD drains, so
 * authopen's pipe is kept full and it always reads full (512-aligned) buffers.
 * If a write ever did go unaligned, authopen exits non-zero and we surface the
 * error verbatim — never a silent partial write. `diskutil eject` flushes.
 */
export interface FlashDiskOptions {
  /** The patched, decompressed image to write. */
  imagePath: string;
  /** Whole-disk device, e.g. `/dev/disk4`. Re-validated before writing. */
  device: string;
  /** Progress callback: bytes written so far, total image bytes, current B/s. */
  onProgress: (written: number, total: number, bytesPerSec: number) => void;
  /** Optional cancel signal; kills the writer (leaving a partial card). */
  signal?: AbortSignal;
  /** Injectable safe-drive resolver (defaults to the real one). For tests. */
  findSafeDrive?: (device: string) => Promise<DrivelistDrive | null>;
}

export async function flashDisk(options: FlashDiskOptions): Promise<void> {
  if (process.platform !== 'darwin') {
    throw new Error('In-app flashing is currently implemented for macOS only.');
  }
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
  // Raw node for speed (see DEVICE NODE note). Prefer drivelist's `raw`; fall
  // back to deriving it from the whole-disk node.
  const rawDevice = (safe as { raw?: string }).raw || device.replace('/dev/disk', '/dev/rdisk');

  // Unmount all volumes so authopen can open the disk exclusively. Best-effort:
  // if it is already unmounted this is a no-op; a real failure surfaces below.
  await execFileAsync('/usr/sbin/diskutil', ['unmountDisk', device]).catch(() => {});

  await new Promise<void>((resolve, reject) => {
    // Raw whole-disk node (see DEVICE NODE note above) — fast; kept aligned.
    const child = spawn('/usr/libexec/authopen', ['-w', rawDevice], {
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let stderr = '';
    let settled = false;

    const finish = (err?: Error): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      if (err) reject(err);
      else resolve();
    };
    const onAbort = (): void => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      finish(new Error('flash cancelled'));
    };

    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (e: Error) => finish(new Error(`authopen failed to start: ${e.message}`)));
    child.on('close', (code: number | null) => {
      if (code === 0) finish();
      else
        finish(
          new Error(
            `flash failed (authopen exit ${code ?? 'null'})${stderr.trim() ? ': ' + stderr.trim() : ''}`,
          ),
        );
    });

    signal?.addEventListener('abort', onAbort, { once: true });

    const src = createReadStream(imagePath, { highWaterMark: 4 * 1024 * 1024 });
    let written = 0;
    // Windowed write speed: recompute the rate every ~500ms and report the most
    // recent value on every progress tick (smooth, but still responsive).
    let bytesPerSec = 0;
    let lastSampleTime = Date.now();
    let lastSampleBytes = 0;
    src.on('data', (chunk: Buffer | string) => {
      written += chunk.length;
      const now = Date.now();
      const dt = now - lastSampleTime;
      if (dt >= 500) {
        bytesPerSec = ((written - lastSampleBytes) / dt) * 1000;
        lastSampleTime = now;
        lastSampleBytes = written;
      }
      onProgress(written, total, bytesPerSec);
    });
    src.on('error', (e: Error) => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      finish(new Error(`reading image failed: ${e.message}`));
    });
    // Image → authopen stdin → raw device. Pipe applies backpressure so the read
    // never outruns the (slower) disk write.
    if (child.stdin) {
      child.stdin.on('error', () => {
        /* EPIPE if authopen exits early; the close handler reports the reason */
      });
      src.pipe(child.stdin);
    }
  });

  // Flush + eject so the card is safe to pull and the Pi sees a clean disk.
  await execFileAsync('/usr/sbin/diskutil', ['eject', device]).catch(() => {});
}
