import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PlatformFlashArgs } from './flashDisk.js';

/**
 * Windows writer. Raw access to `\\.\PhysicalDriveN` requires Administrator AND
 * the volume(s) on the disk must be locked + dismounted first or Windows blocks
 * or corrupts the write. We elevate with PowerShell `Start-Process -Verb RunAs`
 * (the UAC prompt) and run a generated script whose inline C# does the
 * FSCTL_LOCK_VOLUME / FSCTL_DISMOUNT_VOLUME dance and writes 1 MiB sector-aligned
 * blocks via WriteFile. No bundled binary (the script is plain text run by the
 * system PowerShell). Progress + result are exchanged through temp files the
 * unprivileged parent polls; CANCEL is a flag file the writer checks.
 *
 * !!! UNVERIFIED: this path has not been run on real Windows hardware yet. Test
 * with a throwaway SD card before trusting it. The target is still gated by the
 * shared isSafeTarget check (removable, non-system, SD-sized), but the write
 * mechanics need a real-world check.
 */

function extractDiskNumber(device: string): number {
  const m = /(\d+)\s*$/.exec(device);
  if (!m) throw new Error(`could not parse physical drive number from "${device}"`);
  return Number(m[1]);
}

/** Escape a string for a single-quoted PowerShell literal ('' escapes a quote). */
function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** The elevated PowerShell script (inline C# does the privileged raw write). */
function buildScript(): string {
  return `param(
  [Parameter(Mandatory=$true)][string]$ImagePath,
  [Parameter(Mandatory=$true)][int]$DiskNumber,
  [Parameter(Mandatory=$true)][string]$ProgressFile,
  [Parameter(Mandatory=$true)][string]$CancelFile,
  [Parameter(Mandatory=$true)][string]$ResultFile
)
$ErrorActionPreference = 'Stop'
try {
  Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class OpenNovaRawWriter {
  const uint GENERIC_READ = 0x80000000;
  const uint GENERIC_WRITE = 0x40000000;
  const uint FILE_SHARE_READ = 0x1;
  const uint FILE_SHARE_WRITE = 0x2;
  const uint OPEN_EXISTING = 3;
  const uint FSCTL_LOCK_VOLUME = 0x00090018;
  const uint FSCTL_DISMOUNT_VOLUME = 0x00090020;

  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern SafeFileHandle CreateFile(string name, uint access, uint share,
    IntPtr sec, uint disp, uint flags, IntPtr tmpl);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool DeviceIoControl(SafeFileHandle h, uint code, IntPtr inBuf,
    uint inSz, IntPtr outBuf, uint outSz, out uint ret, IntPtr ov);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool WriteFile(SafeFileHandle h, byte[] buf, uint toWrite,
    out uint written, IntPtr ov);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool FlushFileBuffers(SafeFileHandle h);

  static SafeFileHandle Open(string path) {
    var h = CreateFile(path, GENERIC_READ | GENERIC_WRITE,
      FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
    if (h.IsInvalid) throw new Exception("open " + path + " failed (err " + Marshal.GetLastWin32Error() + ")");
    return h;
  }

  public static void Write(string imagePath, int diskNumber, string[] volumes,
                           string progressFile, string cancelFile) {
    var locked = new System.Collections.Generic.List<SafeFileHandle>();
    try {
      foreach (var v in volumes) {
        var vh = Open(v);
        uint r;
        DeviceIoControl(vh, FSCTL_LOCK_VOLUME, IntPtr.Zero, 0, IntPtr.Zero, 0, out r, IntPtr.Zero);
        DeviceIoControl(vh, FSCTL_DISMOUNT_VOLUME, IntPtr.Zero, 0, IntPtr.Zero, 0, out r, IntPtr.Zero);
        locked.Add(vh);
      }
      using (var disk = Open("\\\\.\\PhysicalDrive" + diskNumber))
      using (var img = new FileStream(imagePath, FileMode.Open, FileAccess.Read)) {
        int BS = 1024 * 1024;
        byte[] buf = new byte[BS];
        long total = 0;
        int blocks = 0;
        int n;
        while ((n = img.Read(buf, 0, BS)) > 0) {
          if (File.Exists(cancelFile)) throw new Exception("cancelled");
          uint wrote;
          // WriteFile wants the exact byte count; image is a 512-byte multiple.
          byte[] chunk = buf;
          if (n != BS) { chunk = new byte[n]; Array.Copy(buf, chunk, n); }
          if (!WriteFile(disk, chunk, (uint)n, out wrote, IntPtr.Zero) || wrote != (uint)n)
            throw new Exception("write failed (err " + Marshal.GetLastWin32Error() + ")");
          total += n;
          if (++blocks % 8 == 0) File.WriteAllText(progressFile, total.ToString());
        }
        FlushFileBuffers(disk);
        File.WriteAllText(progressFile, total.ToString());
      }
    } finally {
      foreach (var h in locked) h.Dispose();
    }
  }
}
"@
  $vols = @()
  try {
    $vols = Get-Partition -DiskNumber $DiskNumber -ErrorAction SilentlyContinue |
      Where-Object { $_.DriveLetter } | ForEach-Object { "\\.\$($_.DriveLetter):" }
  } catch {}
  [OpenNovaRawWriter]::Write($ImagePath, $DiskNumber, [string[]]$vols, $ProgressFile, $CancelFile)
  Set-Content -Path $ResultFile -Value 'DONE' -NoNewline
} catch {
  Set-Content -Path $ResultFile -Value ('ERR ' + $_.Exception.Message) -NoNewline
  exit 1
}
`;
}

export async function flashWindows(args: PlatformFlashArgs): Promise<void> {
  const { imagePath, device, total, onProgress, signal } = args;
  const diskNumber = extractDiskNumber(device);

  const workDir = await mkdtemp(join(tmpdir(), 'opennova-flash-'));
  const progFile = join(workDir, 'progress');
  const cancelFile = join(workDir, 'cancel');
  const resultFile = join(workDir, 'result');
  const scriptFile = join(workDir, 'flash.ps1');
  await writeFile(progFile, '');
  await writeFile(scriptFile, buildScript(), 'utf8');

  let written = 0;
  let bytesPerSec = 0;
  let lastSampleTime = Date.now();
  let lastSampleBytes = 0;
  const poll = setInterval(() => {
    void readFile(progFile, 'utf8')
      .then((text) => {
        const n = Number(text.trim());
        if (!Number.isFinite(n) || n <= 0) return;
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

  // Elevate the script via UAC and wait for it to finish.
  const inner = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    psQuote(scriptFile),
    '-ImagePath',
    psQuote(imagePath),
    '-DiskNumber',
    String(diskNumber),
    '-ProgressFile',
    psQuote(progFile),
    '-CancelFile',
    psQuote(cancelFile),
    '-ResultFile',
    psQuote(resultFile),
  ].join(',');
  const outerCmd = `Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList ${inner}`;

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', outerCmd],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );
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
      child.on('error', (e: Error) => finish(new Error(`could not launch PowerShell: ${e.message}`)));
      child.on('close', async (code: number | null) => {
        const result = await readFile(resultFile, 'utf8').catch(() => '');
        if (result.startsWith('DONE')) {
          onProgress(total, total, bytesPerSec);
          finish();
        } else if (signal?.aborted || /cancel/i.test(result)) {
          finish(new Error('flash cancelled'));
        } else if (result.startsWith('ERR')) {
          finish(new Error(`flash failed: ${result.slice(3).trim()}`));
        } else {
          // No result written usually means the UAC prompt was declined.
          finish(
            new Error(
              code !== 0
                ? 'Authorization cancelled or PowerShell failed. The card was not written.'
                : `flash failed${stderr.trim() ? ': ' + stderr.trim() : ''}`,
            ),
          );
        }
      });
    });
  } finally {
    clearInterval(poll);
    signal?.removeEventListener('abort', onAbort);
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
