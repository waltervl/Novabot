import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';

import { scanDrives } from './drives.js';
import { downloadImage, verifySha256 } from './imageSource.js';
import { flash } from './flasher.js';
import type { FlashTarget, FlashProgress } from './flasher.js';
import { writeBootFiles, findBootPartition } from './bootInject.js';
import { waitForPi } from './discovery.js';
import { generateFiles } from './configModel.js';
import { PI_OS_RELEASE } from '../shared/piOsRelease.js';
import type { InstallerConfig, IpcResult, ImageProgress } from '../shared/types.js';

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

/** Injectable dependencies so progress targeting stays testable. */
export interface IpcDeps {
  /** Resolves the renderer to push progress events to (the first window). */
  getWebContents?: () => WebContentsLike | undefined;
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
 * Register every IPC request/response handler on `ipcMain` and wire the
 * progress event forwarding. Pure registration with no side effects beyond the
 * `handle` calls; safe to call once on app ready.
 */
export function registerIpcHandlers(ipcMain: IpcMainLike, deps: IpcDeps = {}): void {
  // Module-local state: the controller for the single in-flight flash, if any.
  let flashController: AbortController | undefined;

  const send = (channel: string, payload: unknown): void => {
    deps.getWebContents?.()?.send(channel, payload);
  };

  // drives:scan -> IpcResult<DriveCandidate[]>
  ipcMain.handle('drives:scan', () => wrap(() => scanDrives()));

  // image:ensure -> IpcResult<{ imagePath }>
  // Download the pinned Pi OS image to a temp file, then verify its sha256.
  // Idempotent: if the temp file already exists and verifies, skip download.
  ipcMain.handle('image:ensure', () =>
    wrap(async () => {
      const destPath = join(tmpdir(), basename(new URL(PI_OS_RELEASE.url).pathname));

      if (existsSync(destPath) && (await verifySha256(destPath, PI_OS_RELEASE.sha256))) {
        return { imagePath: destPath };
      }

      await downloadImage(PI_OS_RELEASE.url, destPath, (received, total) => {
        const payload: ImageProgress = { received, total };
        send('image:progress', payload);
      });

      const verified = await verifySha256(destPath, PI_OS_RELEASE.sha256);
      if (!verified) {
        // Never hand back a path to an image whose hash did not match.
        throw new Error(
          `Downloaded image failed sha256 verification (expected ${PI_OS_RELEASE.sha256})`,
        );
      }
      return { imagePath: destPath };
    }),
  );

  // flash:start { imagePath, target } -> IpcResult<null>
  ipcMain.handle('flash:start', (_event, args: { imagePath: string; target: FlashTarget }) =>
    wrap<null>(async () => {
      const controller = new AbortController();
      flashController = controller;
      try {
        await flash({
          imagePath: args.imagePath,
          target: args.target,
          signal: controller.signal,
          onProgress: (p: FlashProgress) => {
            send('flash:progress', p);
          },
        });
        return null;
      } finally {
        // Only clear if we are still the active controller (a later flash could
        // have replaced us, though the UI flow is one-at-a-time).
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

  // boot:inject { device, config } -> IpcResult<{ bootDir, generated }>
  // On partition-not-found we return ok:false so the renderer shows the manual
  // copy fallback (and can re-fetch the files via config:generate).
  ipcMain.handle('boot:inject', (_event, args: { device: string; config: InstallerConfig }) =>
    wrap(async () => {
      const generated = generateFiles(args.config);
      const bootDir = await findBootPartition(args.device);
      if (bootDir === null) {
        throw new Error(
          `Boot partition not found for ${args.device}. ` +
            `Copy the generated files onto the boot partition manually.`,
        );
      }
      writeBootFiles(bootDir, generated);
      return { bootDir, generated };
    }),
  );

  // config:generate config -> IpcResult<GeneratedFiles> (pure; no disk writes)
  ipcMain.handle('config:generate', (_event, config: InstallerConfig) =>
    wrap(() => generateFiles(config)),
  );

  // pi:find { hosts, timeoutMs? } -> IpcResult<PiDiscovery>
  ipcMain.handle('pi:find', (_event, args: { hosts: string[]; timeoutMs?: number }) =>
    wrap(() => waitForPi({ hosts: args.hosts, timeoutMs: args.timeoutMs })),
  );
}
