/**
 * SSH access baked into the image. The flashed Pi runs `sshd`, but modern
 * Raspberry Pi OS ships with NO default `pi`/`raspberry` account — so without
 * this an enabled daemon has no one to log in as. When `enabled`, the first-boot
 * script creates `username` and either sets `password` (password login) and/or
 * installs `publicKey` into `authorized_keys` (key login). A key WITHOUT a
 * password locks the account password so password auth can't use an empty secret.
 */
export interface SshConfig {
  enabled: boolean;
  username: string;
  /** Login password; may be empty when `publicKey` is provided (key-only). */
  password: string;
  /** Optional single-line OpenSSH public key added to authorized_keys. */
  publicKey?: string;
}

export interface InstallerConfig {
  hostname: string;
  network:
    | { type: 'ethernet' }
    | { type: 'wifi'; ssid: string; password: string; country: string };
  timezone: string;
  connectionPath: 'opennova-app' | 'novabot-app';
  /** SSH access. Omitted by legacy callers → daemon enabled, no account created. */
  ssh?: SshConfig;
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
export type { PiDiscovery } from '../main/discovery.js';
export type { DriveCandidate } from '../main/drives.js';

import type { PiDiscovery } from '../main/discovery.js';
import type { DriveCandidate } from '../main/drives.js';

/**
 * Discriminated result envelope. IPC handlers NEVER reject across the boundary;
 * a failure is reported as a value (`{ ok:false, error }`), so the renderer can
 * always handle it without try/catch around `invoke`.
 */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Progress for the image build (main -> renderer). The build runs through
 * distinct phases; `download` carries byte counts, the others are coarse since
 * decompression/patching are single native/IO operations.
 */
export interface BuildProgress {
  phase: 'download' | 'decompress' | 'patch' | 'finalize';
  /** Bytes received so far (download phase only). */
  received?: number;
  /** Total bytes if known (download phase only). */
  total?: number | null;
}

/** Result of a completed image build. */
export interface BuildResult {
  /** Absolute path to the ready-to-flash `.img` written for the user. */
  outputPath: string;
}

/** Progress for the SD write (main -> renderer). */
export interface FlashProgress {
  /** Bytes written to the card so far. */
  written: number;
  /** Total image bytes. */
  total: number;
  /** Current write speed in bytes/second (windowed). */
  bytesPerSec: number;
}

/**
 * The typed surface exposed on `window.installer` by the preload bridge.
 *
 * Request/response methods resolve an {@link IpcResult}. The `on*` methods
 * subscribe to a progress channel and return an unsubscribe function.
 */
/** A previously-built OpenNova image found in the downloads folder. */
export interface ExistingImage {
  /** Absolute path to the `.img` file. */
  path: string;
  /** File name only, for display. */
  name: string;
  /** Size in bytes. */
  size: number;
  /** Last-modified time (ms since epoch), for "built X ago" + newest-first sort. */
  mtimeMs: number;
}

export interface InstallerApi {
  /** Download the latest Pi OS image, decompress it, and patch in the config. */
  buildImage(config: InstallerConfig): Promise<IpcResult<BuildResult>>;
  onBuildProgress(cb: (p: BuildProgress) => void): () => void;
  /** List previously-built OpenNova images in the downloads folder (newest first). */
  listExistingImages(): Promise<IpcResult<ExistingImage[]>>;
  /** Enumerate currently-attached SAFE removable cards (never the system disk). */
  scanDrives(): Promise<IpcResult<DriveCandidate[]>>;
  /** Write the built image to the chosen card (admin prompt; no FDA on macOS). */
  startFlash(args: { imagePath: string; device: string }): Promise<IpcResult<null>>;
  /** Cancel an in-flight flash (best effort). */
  cancelFlash(): Promise<IpcResult<null>>;
  onFlashProgress(cb: (p: FlashProgress) => void): () => void;
  /** Reveal a file in the OS file manager (Finder/Explorer). */
  revealFile(path: string): Promise<IpcResult<null>>;
  /** Open a URL (or app) in the default handler. */
  openExternal(target: string): Promise<IpcResult<null>>;
  /** Check whether `<hostname>.local` is already claimed on the network (mDNS). */
  checkHostname(hostname: string): Promise<IpcResult<{ taken: boolean; address?: string }>>;
  findPi(args: { hosts: string[]; timeoutMs?: number }): Promise<IpcResult<PiDiscovery>>;
}
