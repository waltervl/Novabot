import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { statSync, existsSync, constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findSafeDriveForFlash } from './drives.js';
import type { Drive as DrivelistDrive } from 'drivelist';

const execFileAsync = promisify(execFile);

/**
 * Write a (patched, decompressed) `.img` to an SD card on macOS at full speed
 * with a single admin prompt and NO Full Disk Access — the same technique as
 * Raspberry Pi Imager.
 *
 * THE TRICK: since macOS Catalina even root cannot open `/dev/rdiskN` of a
 * removable disk without Full Disk Access OR an Apple-entitled opener. Apple's
 * `authopen` is that entitled opener — but `authopen -w` copies stdin to the
 * disk in a tiny ~8 KB loop (so ~2 MB/s). Instead our bundled `fdwrite` helper
 * runs `authopen -stdoutpipe -w <device>`: authopen shows the admin prompt, opens
 * the disk, and passes the file descriptor BACK over a socket (SCM_RIGHTS). The
 * helper then writes 1 MiB blocks to that fd itself — full card speed, still no
 * Full Disk Access. The helper runs as the normal user (the fd is what's
 * privileged), so cancel = kill the helper.
 *
 * TCC: the helper reads the image from a copy in TMPDIR (not a TCC-protected
 * folder like ~/Downloads); on APFS that copy is an instant copy-on-write clone.
 *
 * SAFETY: before writing we RE-ENUMERATE the attached safe removable drives and
 * refuse unless `device` is genuinely one right now (`findSafeDriveForFlash`), so
 * a buggy/compromised renderer cannot make us write the system disk.
 *
 * RAW node + alignment: we write the RAW node (`/dev/rdiskN`); a Pi image is a
 * whole number of 512-byte sectors and the helper writes whole blocks, so
 * raw-device alignment always holds. `diskutil eject` flushes at the end.
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

/** Locate the bundled `fdwrite` helper (packaged Resources, or dev vendor dir). */
function resolveHelper(): string {
  const candidates = [
    process.resourcesPath ? join(process.resourcesPath, 'fdwrite') : '',
    // dev: this file is dist/main/flashDisk.js → ../../vendor/fdwrite
    join(__dirname, '..', '..', 'vendor', 'fdwrite'),
  ].filter((p) => p.length > 0);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(
    'flash helper (fdwrite) not found. Build it with `npm run build:helper`.',
  );
}

/** Pull the most recent cumulative byte count from the helper's stdout buffer. */
function lastByteCount(buf: string): number | null {
  const lines = buf.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (/^\d+$/.test(t)) return Number(t);
  }
  return null;
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

  const helper = resolveHelper();
  const total = statSync(imagePath).size;
  const rawDevice = (safe as { raw?: string }).raw || device.replace('/dev/disk', '/dev/rdisk');

  // Unmount all volumes so the disk can be opened for writing. Best-effort.
  await execFileAsync('/usr/sbin/diskutil', ['unmountDisk', device]).catch(() => {});

  // Clone the image into TMPDIR (not TCC-protected) for the helper to read.
  // Instant copy-on-write on APFS; falls back to a real copy on other volumes.
  const workDir = await mkdtemp(join(tmpdir(), 'opennova-flash-'));
  const srcImg = join(workDir, 'source.img');
  await copyFile(imagePath, srcImg, fsConstants.COPYFILE_FICLONE);

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(helper, [srcImg, rawDevice], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      let outBuf = '';
      let settled = false;
      let bytesPerSec = 0;
      let lastSampleTime = Date.now();
      let lastSampleBytes = 0;

      const finish = (err?: Error): void => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        if (err) reject(err);
        else resolve();
      };
      const onAbort = (): void => {
        try {
          child.kill('SIGTERM');
        } catch {
          /* already gone */
        }
        finish(new Error('flash cancelled'));
      };

      child.stdout?.on('data', (d: Buffer) => {
        outBuf += d.toString();
        const written = lastByteCount(outBuf);
        if (written === null) return;
        const now = Date.now();
        const dt = now - lastSampleTime;
        if (dt >= 500) {
          bytesPerSec = ((written - lastSampleBytes) / dt) * 1000;
          lastSampleTime = now;
          lastSampleBytes = written;
        }
        onProgress(Math.min(written, total), total, bytesPerSec);
        if (outBuf.length > 4096) outBuf = outBuf.slice(-1024); // keep it small
      });
      child.stderr?.on('data', (d: Buffer) => {
        stderr += d.toString();
      });
      child.on('error', (e: Error) => finish(new Error(`flash helper failed to start: ${e.message}`)));
      child.on('close', (code: number | null) => {
        if (code === 0) {
          onProgress(total, total, bytesPerSec);
          finish();
          return;
        }
        const detail = stderr.trim();
        if (/authorization|denied|obtain disk/i.test(detail)) {
          finish(new Error('Authorization cancelled. The card was not written.'));
        } else {
          finish(new Error(`flash failed${detail ? ': ' + detail : ` (helper exit ${code ?? 'null'})`}`));
        }
      });

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }

  // Flush + eject so the card is safe to pull and the Pi sees a clean disk.
  await execFileAsync('/usr/sbin/diskutil', ['eject', device]).catch(() => {});
}
