import { basename, join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { rename, unlink, mkdir, readdir, stat } from 'node:fs/promises';

import {
  downloadImage,
  verifySha256,
  resolveLatestImageUrl,
  fetchExpectedSha256,
  decompressXz,
} from './imageSource.js';
import { patchImageBootPartition } from './imagePatcher.js';
import { scanDrives } from './drives.js';
import { flashDisk } from './flashDisk.js';
import { waitForPi, isHostnameTaken } from './discovery.js';
import { PI_OS_RELEASE } from '../shared/piOsRelease.js';
import type {
  InstallerConfig,
  IpcResult,
  BuildProgress,
  BuildResult,
  ExistingImage,
  FlashProgress,
} from '../shared/types.js';

/**
 * Minimal slice of Electron's `ipcMain` we depend on. Taking this as a
 * parameter (instead of importing `ipcMain` at module top) keeps the handlers
 * unit-testable: the test passes a fake that records registered listeners.
 */
export interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: any[]) => unknown): void;
}

/** A WebContents-like sink for forwarding progress events to the renderer. */
export interface WebContentsLike {
  send(channel: string, payload: unknown): void;
}

/** The slice of Electron's `shell` we use (injected so handlers stay testable). */
export interface ShellLike {
  showItemInFolder(fullPath: string): void;
  openExternal(url: string): Promise<unknown>;
}

/** Injectable dependencies so progress targeting + OS integration stay testable. */
export interface IpcDeps {
  /** Resolves the renderer to push progress events to (the first window). */
  getWebContents?: () => WebContentsLike | undefined;
  /** OS integration (Finder reveal, open URL). Wired from electron in index.ts. */
  shell?: ShellLike;
  /** Directory the finished image is written to (defaults to ~/Downloads). */
  downloadsDir?: string;
}

/**
 * Run a handler body and convert it into the {@link IpcResult} envelope. This is
 * the single place try/catch lives: every channel funnels through here so no
 * handler can ever reject across the IPC boundary.
 */
async function wrap<T>(fn: () => Promise<T> | T): Promise<IpcResult<T>> {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}

/**
 * Download (cached + verified) the LATEST Raspberry Pi OS Lite image and return
 * the path to the `.img.xz`. The `_latest` endpoint 302-redirects to the current
 * dated build; integrity comes from the published `.sha256` sidecar, so there is
 * no pinned hash to maintain. The download goes to a process-unique `.partial`
 * file that is verified before being atomically renamed into the cache path, so
 * an interrupted/concurrent download can never leave a corrupt file behind.
 */
async function ensureLatestImageXz(
  onProgress: (received: number, total: number | null) => void,
): Promise<string> {
  const imageUrl = await resolveLatestImageUrl(PI_OS_RELEASE.latestUrl);
  const expectedSha = await fetchExpectedSha256(imageUrl);
  const destPath = join(tmpdir(), basename(new URL(imageUrl).pathname));

  if (existsSync(destPath) && (await verifySha256(destPath, expectedSha))) {
    return destPath;
  }

  const partialPath = `${destPath}.${process.pid}.partial`;
  try {
    await downloadImage(imageUrl, partialPath, onProgress);
    if (!(await verifySha256(partialPath, expectedSha))) {
      throw new Error(`Downloaded image failed sha256 verification (expected ${expectedSha})`);
    }
    await rename(partialPath, destPath);
    return destPath;
  } finally {
    await unlink(partialPath).catch(() => {});
  }
}

/** Filesystem-safe `opennova-<hostname>-<timestamp>.img` for the output image. */
function outputFileName(config: InstallerConfig): string {
  const host = config.hostname.replace(/[^A-Za-z0-9._-]/g, '-') || 'opennova';
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '').replace('-', '').replace('-', '');
  return `opennova-${host}-${stamp}.img`;
}

/**
 * Build a ready-to-flash OpenNova image: download the latest Pi OS Lite,
 * decompress it, patch the boot partition with the user's config, and write the
 * result to the downloads directory. NO raw-disk access — the user flashes the
 * resulting file with Raspberry Pi Imager, which handles all the OS-level disk
 * permission machinery. Reports progress per phase.
 */
async function buildImage(
  config: InstallerConfig,
  send: (channel: string, payload: unknown) => void,
  downloadsDir: string,
): Promise<BuildResult> {
  const emit = (p: BuildProgress): void => send('build:progress', p);

  const xzPath = await ensureLatestImageXz((received, total) =>
    emit({ phase: 'download', received, total }),
  );

  emit({ phase: 'decompress' });
  const tmpImg = join(tmpdir(), `opennova-build-${process.pid}.img`);
  await decompressXz(xzPath, tmpImg);

  try {
    emit({ phase: 'patch' });
    await patchImageBootPartition(tmpImg, config);

    emit({ phase: 'finalize' });
    await mkdir(downloadsDir, { recursive: true });
    const outputPath = join(downloadsDir, outputFileName(config));
    await rename(tmpImg, outputPath);
    return { outputPath };
  } finally {
    // If rename already moved the file this is a no-op; on failure it cleans up.
    await unlink(tmpImg).catch(() => {});
  }
}

/**
 * List previously-built OpenNova images (`opennova-*.img`) in the downloads
 * folder, newest first, so the Build step can offer to reuse one instead of
 * downloading + patching all over again. Best-effort: a missing/unreadable dir
 * yields an empty list rather than an error.
 */
export async function listExistingImages(downloadsDir: string): Promise<ExistingImage[]> {
  const names = await readdir(downloadsDir).catch(() => [] as string[]);
  const candidates = names.filter((n) => /^opennova-.*\.img$/.test(n));
  const found: ExistingImage[] = [];
  for (const name of candidates) {
    const path = join(downloadsDir, name);
    try {
      const st = await stat(path);
      if (st.isFile()) {
        found.push({ path, name, size: st.size, mtimeMs: st.mtimeMs });
      }
    } catch {
      /* skip a file that vanished or can't be stat'd */
    }
  }
  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return found;
}

/**
 * Register every IPC request/response handler on `ipcMain` and wire the
 * progress event forwarding. Pure registration with no side effects beyond the
 * `handle` calls; safe to call once on app ready.
 */
export function registerIpcHandlers(ipcMain: IpcMainLike, deps: IpcDeps = {}): void {
  // Single-flight guard: a second build request while one is running (double
  // click, etc.) shares the in-flight promise instead of racing.
  let buildInFlight: Promise<BuildResult> | undefined;
  // The controller for the single in-flight flash, if any.
  let flashController: AbortController | undefined;

  const send = (channel: string, payload: unknown): void => {
    deps.getWebContents?.()?.send(channel, payload);
  };
  const downloadsDir = deps.downloadsDir ?? join(homedir(), 'Downloads');

  // image:build config -> IpcResult<BuildResult>
  ipcMain.handle('image:build', (_event, config: InstallerConfig) =>
    wrap(() => {
      if (!buildInFlight) {
        buildInFlight = buildImage(config, send, downloadsDir).finally(() => {
          buildInFlight = undefined;
        });
      }
      return buildInFlight;
    }),
  );

  // image:list-existing -> IpcResult<ExistingImage[]> (reuse a prior build)
  ipcMain.handle('image:list-existing', () => wrap(() => listExistingImages(downloadsDir)));

  // drives:scan -> IpcResult<DriveCandidate[]> (safe removable cards only)
  ipcMain.handle('drives:scan', () => wrap(() => scanDrives()));

  // flash:start { imagePath, device } -> IpcResult<null>
  // Writes the built image to the chosen SD via authopen (admin prompt, no FDA).
  ipcMain.handle('flash:start', (_event, args: { imagePath: string; device: string }) =>
    wrap<null>(async () => {
      const controller = new AbortController();
      flashController = controller;
      try {
        await flashDisk({
          imagePath: args.imagePath,
          device: args.device,
          signal: controller.signal,
          onProgress: (written, total, bytesPerSec) => {
            const payload: FlashProgress = { written, total, bytesPerSec };
            send('flash:progress', payload);
          },
        });
        return null;
      } finally {
        if (flashController === controller) {
          flashController = undefined;
        }
      }
    }),
  );

  // flash:cancel -> IpcResult<null> (always ok; no-op when nothing is running)
  ipcMain.handle('flash:cancel', () =>
    wrap<null>(() => {
      flashController?.abort();
      return null;
    }),
  );

  // shell:reveal path -> IpcResult<null> (reveal the file in Finder/Explorer)
  ipcMain.handle('shell:reveal', (_event, path: string) =>
    wrap<null>(() => {
      deps.shell?.showItemInFolder(path);
      return null;
    }),
  );

  // shell:openExternal target -> IpcResult<null> (open a URL in the browser)
  ipcMain.handle('shell:openExternal', (_event, target: string) =>
    wrap<null>(async () => {
      await deps.shell?.openExternal(target);
      return null;
    }),
  );

  // hostname:check hostname -> IpcResult<{ taken, address? }>
  ipcMain.handle('hostname:check', (_event, hostname: string) =>
    wrap(() => isHostnameTaken(hostname)),
  );

  // pi:find { hosts, timeoutMs? } -> IpcResult<PiDiscovery>
  ipcMain.handle('pi:find', (_event, args: { hosts: string[]; timeoutMs?: number }) =>
    wrap(() => waitForPi({ hosts: args.hosts, timeoutMs: args.timeoutMs })),
  );
}
