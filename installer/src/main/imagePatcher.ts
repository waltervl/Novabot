import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { openSync, readSync, closeSync, existsSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateFiles } from './configModel.js';
import type { InstallerConfig } from '../shared/types.js';

const execFileAsync = promisify(execFile);

/**
 * Patch the OpenNova first-boot config DIRECTLY INTO a Raspberry Pi OS image
 * FILE — no SD card, no raw-disk write, no mount, no elevation, no Full Disk
 * Access. Everything operates on a regular file.
 *
 * CROSS-PLATFORM: the FAT boot partition is edited with `mtools` (`mcopy`/
 * `mtype`), which reads/writes a FAT filesystem inside a file at a byte offset
 * (`image.img@@<offset>`) WITHOUT mounting it. The exact same invocation works
 * on macOS, Linux and Windows, so there is one code path. (A pure-JS FAT writer
 * was evaluated and rejected: it produced an fsck-dirty filesystem — leaked
 * clusters on empty files — which is unacceptable for a flashing tool. mtools'
 * output is fsck-clean.)
 *
 * The actual SD write is then done by Raspberry Pi Imager, not by this app.
 */

/** FAT partition type bytes we accept for the boot partition. */
const FAT_PARTITION_TYPES = new Set([0x01, 0x04, 0x06, 0x0b, 0x0c, 0x0e]);

/**
 * Read the MBR of `imgPath` and return the byte offset of the first FAT
 * partition (the Raspberry Pi boot partition). Pure parsing, no external tools:
 * the partition table is four 16-byte entries at offset 446; each entry's type
 * is at +4, its LBA start (little-endian u32) at +8, its sector count at +12.
 */
export function readBootPartitionOffset(imgPath: string): number {
  const mbr = Buffer.alloc(512);
  const fd = openSync(imgPath, 'r');
  try {
    readSync(fd, mbr, 0, 512, 0);
  } finally {
    closeSync(fd);
  }
  if (mbr[510] !== 0x55 || mbr[511] !== 0xaa) {
    throw new Error('not a disk image: missing MBR boot signature');
  }
  for (let entry = 0; entry < 4; entry++) {
    const base = 446 + entry * 16;
    const type = mbr[base + 4];
    const lbaStart = mbr.readUInt32LE(base + 8);
    const sectors = mbr.readUInt32LE(base + 12);
    if (FAT_PARTITION_TYPES.has(type) && sectors > 0) {
      return lbaStart * 512;
    }
  }
  throw new Error('no FAT boot partition found in image');
}

/** `mcopy`/`mtype` need the platform-specific executable name. */
function toolName(base: string): string {
  return process.platform === 'win32' ? `${base}.exe` : base;
}

/**
 * Resolve an mtools executable. Order: explicit override env, the bundled copy
 * (packaged app `resources/mtools/<platform>-<arch>/`, or `vendor/mtools/...`
 * in dev), then the system PATH (e.g. a Homebrew `mcopy` during development).
 */
function resolveTool(base: string): string {
  const name = toolName(base);
  const platformDir = `${process.platform}-${process.arch}`;
  const candidates: string[] = [];
  if (process.env.OPENNOVA_MTOOLS_DIR) {
    candidates.push(join(process.env.OPENNOVA_MTOOLS_DIR, name));
  }
  // electron `process.resourcesPath` is only set inside the packaged app.
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    candidates.push(join(resourcesPath, 'mtools', platformDir, name));
  }
  // dev: vendored binaries committed under installer/vendor (dist/main -> ../..).
  candidates.push(join(__dirname, '..', '..', 'vendor', 'mtools', platformDir, name));
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  // Fall back to PATH — execFile resolves the bare name there.
  return name;
}

/** Spawn an mtools command. `MTOOLS_SKIP_CHECK` avoids spurious geometry warnings
 * on Pi FAT volumes (writes remain fsck-clean). Throws verbatim stderr on error. */
async function mtools(base: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(resolveTool(base), args, {
      env: { ...process.env, MTOOLS_SKIP_CHECK: '1' },
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    const e = err as { stderr?: string; message?: string; code?: string };
    const detail = (e.stderr && e.stderr.trim()) || e.message || 'unknown error';
    if (e.code === 'ENOENT') {
      throw new Error(
        `mtools '${base}' not found. Install mtools or bundle it (vendor/mtools/${process.platform}-${process.arch}/).`,
      );
    }
    throw new Error(`${base} failed: ${detail}`);
  }
}

/**
 * Patch `imgPath` (a DECOMPRESSED .img) in place with the OpenNova first-boot
 * config: write `firstrun.sh`, an empty `ssh` sentinel, and idempotently append
 * the first-boot hook to `cmdline.txt` — all into the FAT boot partition via
 * mtools. The `cmdline.txt` append is idempotent so re-patching never duplicates
 * the token.
 */
export async function patchImageBootPartition(
  imgPath: string,
  config: InstallerConfig,
): Promise<void> {
  const offset = readBootPartitionOffset(imgPath);
  const image = `${imgPath}@@${offset}`;
  const gen = generateFiles(config);

  const dir = await mkdtemp(join(tmpdir(), 'opennova-patch-'));
  try {
    // firstrun.sh
    const firstrunPath = join(dir, 'firstrun.sh');
    await writeFile(firstrunPath, gen.firstrunSh);
    await mtools('mcopy', ['-o', '-i', image, firstrunPath, '::/firstrun.sh']);

    // empty `ssh` sentinel — enables sshd on first boot. Skipped only when SSH
    // is explicitly disabled (default is enabled, so legacy callers are unchanged).
    if (config.ssh?.enabled ?? true) {
      const sshPath = join(dir, 'ssh');
      await writeFile(sshPath, '');
      await mtools('mcopy', ['-o', '-i', image, sshPath, '::/ssh']);
    }

    // cmdline.txt: read current, append the hook idempotently, write back.
    const current = await mtools('mtype', ['-i', image, '::/cmdline.txt']);
    const token = gen.cmdlineAppend.trim();
    if (token.length > 0 && !current.includes(token)) {
      const next = current.replace(/\s+$/, '') + gen.cmdlineAppend;
      const cmdlinePath = join(dir, 'cmdline.txt');
      await writeFile(cmdlinePath, next);
      await mtools('mcopy', ['-o', '-i', image, cmdlinePath, '::/cmdline.txt']);
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
