import { contextBridge, ipcRenderer } from 'electron';
import type {
  InstallerApi,
  InstallerConfig,
  IpcResult,
  BuildProgress,
  BuildResult,
  DriveCandidate,
  FlashProgress,
  PiDiscovery,
} from '../shared/types.js';

/**
 * Subscribe to a main->renderer progress channel and return an unsubscribe
 * function. The listener unwraps the IPC event so callers only see the payload.
 */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

/**
 * The concrete bridge exposed as `window.installer`. Each request/response
 * method forwards to `ipcRenderer.invoke`; the main-process handlers always
 * resolve an {@link IpcResult}, so these never reject for application errors.
 */
const api: InstallerApi = {
  buildImage: (config: InstallerConfig) =>
    ipcRenderer.invoke('image:build', config) as Promise<IpcResult<BuildResult>>,

  onBuildProgress: (cb: (p: BuildProgress) => void) =>
    subscribe<BuildProgress>('build:progress', cb),

  scanDrives: () =>
    ipcRenderer.invoke('drives:scan') as Promise<IpcResult<DriveCandidate[]>>,

  startFlash: (args: { imagePath: string; device: string }) =>
    ipcRenderer.invoke('flash:start', args) as Promise<IpcResult<null>>,

  cancelFlash: () => ipcRenderer.invoke('flash:cancel') as Promise<IpcResult<null>>,

  onFlashProgress: (cb: (p: FlashProgress) => void) =>
    subscribe<FlashProgress>('flash:progress', cb),

  revealFile: (path: string) =>
    ipcRenderer.invoke('shell:reveal', path) as Promise<IpcResult<null>>,

  openExternal: (target: string) =>
    ipcRenderer.invoke('shell:openExternal', target) as Promise<IpcResult<null>>,

  checkHostname: (hostname: string) =>
    ipcRenderer.invoke('hostname:check', hostname) as Promise<
      IpcResult<{ taken: boolean; address?: string }>
    >,

  findPi: (args: { hosts: string[]; timeoutMs?: number }) =>
    ipcRenderer.invoke('pi:find', args) as Promise<IpcResult<PiDiscovery>>,
};

contextBridge.exposeInMainWorld('installer', api);
