export interface InstallerConfig {
  hostname: string;
  network:
    | { type: 'ethernet' }
    | { type: 'wifi'; ssid: string; password: string; country: string };
  timezone: string;
  connectionPath: 'opennova-app' | 'novabot-app';
}

export interface GeneratedFiles {
  firstrunSh: string;
  envFile: string;
  composeYml: string;
  cmdlineAppend: string;
}

// ---------------------------------------------------------------------------
// IPC contract (shared between the main process and the renderer)
// ---------------------------------------------------------------------------

// Types that physically live in main-process modules are re-exported here so
// both the preload bridge and the renderer import the whole IPC contract from a
// single place (`shared/types.ts`) without reaching into `main/`.
export type { DriveCandidate } from '../main/drives.js';
export type { FlashTarget, FlashProgress } from '../main/flasher.js';
export type { PiDiscovery } from '../main/discovery.js';

import type { DriveCandidate } from '../main/drives.js';
import type { FlashTarget, FlashProgress } from '../main/flasher.js';
import type { PiDiscovery } from '../main/discovery.js';

/**
 * Discriminated result envelope. IPC handlers NEVER reject across the boundary;
 * a failure is reported as a value (`{ ok:false, error }`), so the renderer can
 * always handle it without try/catch around `invoke`.
 */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Progress payload for the image download (main -> renderer). */
export interface ImageProgress {
  received: number;
  total: number | null;
}

/**
 * The typed surface exposed on `window.installer` by the preload bridge.
 *
 * Request/response methods resolve an {@link IpcResult}. The `on*` methods
 * subscribe to a progress channel and return an unsubscribe function.
 */
export interface InstallerApi {
  scanDrives(): Promise<IpcResult<DriveCandidate[]>>;
  ensureImage(): Promise<IpcResult<{ imagePath: string }>>;
  onImageProgress(cb: (p: ImageProgress) => void): () => void;
  startFlash(args: { imagePath: string; target: FlashTarget }): Promise<IpcResult<null>>;
  cancelFlash(): Promise<IpcResult<null>>;
  onFlashProgress(cb: (p: FlashProgress) => void): () => void;
  generateConfig(config: InstallerConfig): Promise<IpcResult<GeneratedFiles>>;
  injectBoot(args: {
    device: string;
    config: InstallerConfig;
  }): Promise<IpcResult<{ bootDir: string; generated: GeneratedFiles }>>;
  findPi(args: { hosts: string[]; timeoutMs?: number }): Promise<IpcResult<PiDiscovery>>;
}
