import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PlatformFlashArgs } from './flashDisk.js';

/**
 * Linux writer. Elevates with `pkexec` (the polkit GUI password prompt) and
 * writes with `dd bs=4M conv=fsync`. GNU `dd status=progress` prints the running
 * byte count to stderr ~once a second, which the elevated script redirects to a
 * temp file the (unprivileged) parent polls. No native helper and no TCC: as
 * root, writing the block device and reading the user's image both just work.
 * CANCEL: the parent touches a flag file; the elevated loop kills `dd`.
 *
 * Requires a polkit authentication agent (present on all mainstream desktops).
 */

/** Single-quote a string for safe embedding in a /bin/sh command. */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Parse the most recent byte count from accumulated `dd status=progress` output,
 * e.g. `1234567890 bytes (1.2 GB, 1.1 GiB) copied, 5 s, 240 MB/s`. Returns the
 * last value, or null if none yet. Exported for unit testing.
 */
export function parseDdBytes(text: string): number | null {
  const re = /(\d+)\s+bytes\b/g;
  let last: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    last = Number(m[1]);
  }
  return last;
}

export async function flashLinux(args: PlatformFlashArgs): Promise<void> {
  const { imagePath, device, total, onProgress, signal } = args;

  const workDir = await mkdtemp(join(tmpdir(), 'opennova-flash-'));
  const progFile = join(workDir, 'progress');
  const cancelFile = join(workDir, 'cancel');
  const scriptFile = join(workDir, 'flash.sh');
  await writeFile(progFile, '');

  // Unmount any mounted partitions of the device, then dd. dd runs in the
  // background so the loop can poll the cancel flag and SIGINFO is unnecessary
  // (status=progress self-updates). `${device}*` globs sdX/sdX1/mmcblk0/mmcblk0p1.
  const script =
    `#!/bin/sh\n` +
    `for part in ${shellQuote(device)}*; do umount "$part" 2>/dev/null; done\n` +
    `dd if=${shellQuote(imagePath)} of=${shellQuote(device)} bs=4M conv=fsync status=progress 2>${shellQuote(progFile)} &\n` +
    `p=$!\n` +
    `while kill -0 "$p" 2>/dev/null; do\n` +
    `  if [ -f ${shellQuote(cancelFile)} ]; then kill "$p" 2>/dev/null; exit 130; fi\n` +
    `  sleep 0.5\n` +
    `done\n` +
    `wait "$p"\n`;
  await writeFile(scriptFile, script, { mode: 0o700 });

  let written = 0;
  let bytesPerSec = 0;
  let lastSampleTime = Date.now();
  let lastSampleBytes = 0;
  const poll = setInterval(() => {
    void readFile(progFile, 'utf8')
      .then((text) => {
        const n = parseDdBytes(text);
        if (n === null) return;
        written = n;
        const now = Date.now();
        const dt = now - lastSampleTime;
        if (dt >= 500) {
          bytesPerSec = ((written - lastSampleBytes) / dt) * 1000;
          lastSampleTime = now;
          lastSampleBytes = written;
        }
        onProgress(Math.min(written, total), total, bytesPerSec);
      })
      .catch(() => {});
  }, 300);

  const onAbort = (): void => {
    void writeFile(cancelFile, '').catch(() => {});
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('pkexec', ['/bin/sh', scriptFile], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      let settled = false;
      const finish = (err?: Error): void => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve();
      };
      child.stderr?.on('data', (d: Buffer) => {
        stderr += d.toString();
      });
      child.on('error', (e: Error) =>
        finish(new Error(`could not run pkexec (is polkit installed?): ${e.message}`)),
      );
      child.on('close', (code: number | null) => {
        if (code === 0) {
          onProgress(total, total, bytesPerSec);
          finish();
          return;
        }
        if (signal?.aborted || code === 130) {
          finish(new Error('flash cancelled'));
          return;
        }
        // pkexec exits 126 (auth dialog dismissed) / 127 (not authorized).
        if (code === 126 || code === 127) {
          finish(new Error('Authorization cancelled. The card was not written.'));
          return;
        }
        finish(new Error(`flash failed${stderr.trim() ? ': ' + stderr.trim() : ` (exit ${code ?? 'null'})`}`));
      });
    });
  } finally {
    clearInterval(poll);
    signal?.removeEventListener('abort', onAbort);
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
