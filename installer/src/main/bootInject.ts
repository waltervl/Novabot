import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import type { GeneratedFiles } from '../shared/types.js';

const execFileAsync = promisify(execFile);

/**
 * Write the OpenNova first-boot configuration onto a flashed Raspberry Pi OS
 * boot partition so the device self-installs on first power-up.
 *
 * `bootDir` MUST be the FAT boot partition of a freshly flashed card — i.e. the
 * directory that already contains `cmdline.txt`. We assert that file's presence
 * up front: it is the single signal that distinguishes a real Pi boot partition
 * from a wrong folder the user might have picked. Writing our files into an
 * arbitrary directory would silently do nothing useful at boot, so we refuse.
 *
 * Side effects, all on `bootDir`:
 *   - `firstrun.sh` — the generated install script, mode 0755 (Pi OS runs it via
 *     `systemd.run=` and it must be executable).
 *   - `ssh` — an empty file; its mere presence enables the SSH daemon on first
 *     boot (standard Raspberry Pi OS behaviour).
 *   - `cmdline.txt` — appended with `gen.cmdlineAppend` IDEMPOTENTLY. cmdline.txt
 *     must remain a single line with no trailing newline; `cmdlineAppend` already
 *     begins with a leading space. We only append when the token is not already
 *     present, so running this twice never double-appends.
 *
 * This function performs PURE filesystem writes and is fully unit-tested. It
 * does NOT locate or mount the partition — that is `findBootPartition`.
 */
export function writeBootFiles(bootDir: string, gen: GeneratedFiles): void {
  const cmdlinePath = join(bootDir, 'cmdline.txt');
  if (!existsSync(cmdlinePath)) {
    throw new Error('not a Pi boot partition: cmdline.txt not found in ' + bootDir);
  }

  // First-boot install script — must be executable for systemd.run to launch it.
  writeFileSync(join(bootDir, 'firstrun.sh'), gen.firstrunSh, { mode: 0o755 });

  // Empty `ssh` sentinel file enables sshd on first boot.
  writeFileSync(join(bootDir, 'ssh'), '');

  // Append the kernel cmdline fragment idempotently. cmdline.txt is a single
  // line: read it, and only append if our exact token is not already present.
  const current = readFileSync(cmdlinePath, 'utf8');
  const token = gen.cmdlineAppend.trim();
  if (token.length > 0 && !current.includes(token)) {
    // `cmdlineAppend` carries its own leading space; strip any trailing newline
    // from the existing line so the result stays a single, newline-free line.
    const next = current.replace(/\s+$/, '') + gen.cmdlineAppend;
    writeFileSync(cmdlinePath, next);
  }
}

/**
 * The two FAT volume labels Raspberry Pi OS uses for its boot partition. Recent
 * images label it `bootfs`; older ones used `boot`. We accept either.
 */
const BOOT_LABELS = ['bootfs', 'boot'] as const;

/** A mount point looks like a Pi boot partition if it holds a `cmdline.txt`. */
function looksLikeBootPartition(mountPoint: string): boolean {
  return existsSync(join(mountPoint, 'cmdline.txt'));
}

/**
 * Best-effort, cross-OS lookup of the mounted boot partition for a just-flashed
 * device. Returns the absolute mount path, or `null` when it cannot be found —
 * a `null` is expected and benign: it triggers the UI's manual "pick the boot
 * folder" fallback rather than being an error.
 *
 * NOTE: this is hardware-verified later. The OS auto-mounts the FAT boot
 * partition after flashing under a predictable label (`bootfs`/`boot`); we look
 * for that mount and sanity-check it actually contains `cmdline.txt`. The
 * `devicePath` argument is accepted for future per-device disambiguation but is
 * not strictly required by the current label-based heuristics.
 */
export async function findBootPartition(devicePath: string): Promise<string | null> {
  void devicePath; // reserved for future per-device matching; see note above.

  switch (process.platform) {
    case 'darwin':
      return findBootPartitionMacOS();
    case 'linux':
      return findBootPartitionLinux();
    case 'win32':
      return findBootPartitionWindows();
    default:
      return null;
  }
}

/**
 * macOS auto-mounts FAT volumes under `/Volumes/<label>`. Check the known boot
 * labels and confirm the mount really is a Pi boot partition.
 */
function findBootPartitionMacOS(): string | null {
  for (const label of BOOT_LABELS) {
    const candidate = join('/Volumes', label);
    if (existsSync(candidate) && looksLikeBootPartition(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Most desktop Linux auto-mounts removable media under `/media/<user>/<label>`
 * or `/run/media/<user>/<label>`. Try both bases for each known boot label.
 */
function findBootPartitionLinux(): string | null {
  const user = currentUserName();
  const bases = ['/media', '/run/media'];
  for (const base of bases) {
    for (const label of BOOT_LABELS) {
      const candidate = join(base, user, label);
      if (existsSync(candidate) && looksLikeBootPartition(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Windows assigns each mounted volume a drive letter. PowerShell's `Get-Volume`
 * exposes the FAT label and drive letter together, so we ask it for any volume
 * whose label matches a known boot label, then verify the resulting drive
 * (`X:\`) holds `cmdline.txt`. Any failure (no PowerShell, no match, parse
 * error) collapses to `null`.
 */
async function findBootPartitionWindows(): Promise<string | null> {
  const labelFilter = BOOT_LABELS.map((l) => `'${l}'`).join(',');
  const script =
    `Get-Volume | Where-Object { $_.FileSystemLabel -in ${labelFilter} } ` +
    `| Select-Object -ExpandProperty DriveLetter`;
  try {
    const { stdout } = await execFileAsync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true },
    );
    const letters = stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const letter of letters) {
      const candidate = `${letter}:\\`;
      if (existsSync(candidate) && looksLikeBootPartition(candidate)) {
        return candidate;
      }
    }
  } catch {
    // PowerShell unavailable or query failed — fall through to the null fallback.
  }
  return null;
}

/**
 * Resolve the current login name for building `/media/<user>/...` paths. Prefer
 * the OS-reported username; fall back to `$USER`/`$LOGNAME`, then to the home
 * directory's basename. Returns an empty string only if everything is missing,
 * in which case the candidate paths simply will not exist.
 */
function currentUserName(): string {
  try {
    const name = userInfo().username;
    if (name) {
      return name;
    }
  } catch {
    // userInfo can throw on exotic setups; fall back to env/home below.
  }
  return process.env['USER'] || process.env['LOGNAME'] || basename(homedir()) || '';
}
