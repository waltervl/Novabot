import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { existsSync, constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PlatformFlashArgs } from './flashDisk.js';

const execFileAsync = promisify(execFile);

/**
 * macOS writer. Full speed with one admin prompt and NO Full Disk Access, the
 * same technique as Raspberry Pi Imager: the bundled `fdwrite` helper runs
 * `authopen -stdoutpipe -w <device>` (authopen is the Apple-entitled opener),
 * receives the disk fd over SCM_RIGHTS, and writes 1 MiB blocks itself. See
 * native/fdwrite.c. The image is read from a TMPDIR copy-on-write clone so the
 * helper never touches the TCC-protected ~/Downloads.
 */

/** Locate the bundled `fdwrite` helper (packaged Resources, or dev vendor dir). */
function resolveHelper(): string {
  const candidates = [
    process.resourcesPath ? join(process.resourcesPath, 'fdwrite') : '',
    join(__dirname, '..', '..', 'vendor', 'fdwrite'),
  ].filter((p) => p.length > 0);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error('flash helper (fdwrite) not found. Build it with `npm run build:helper`.');
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

export async function flashMac(args: PlatformFlashArgs): Promise<void> {
  const { imagePath, device, safe, total, onProgress, signal } = args;
  const helper = resolveHelper();
  const rawDevice = (safe as { raw?: string }).raw || device.replace('/dev/disk', '/dev/rdisk');

  // Unmount all volumes so the disk can be opened for writing. Best-effort.
  await execFileAsync('/usr/sbin/diskutil', ['unmountDisk', device]).catch(() => {});

  // Clone the image into TMPDIR (not TCC-protected) for the helper to read.
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
        if (outBuf.length > 4096) outBuf = outBuf.slice(-1024);
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

  await execFileAsync('/usr/sbin/diskutil', ['eject', device]).catch(() => {});
}
