import { contextBridge, ipcRenderer } from 'electron';
import type {
  InstallerApi,
  InstallerConfig,
  GeneratedFiles,
  IpcResult,
  ImageProgress,
  DriveCandidate,
  FlashTarget,
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
  scanDrives: () =>
    ipcRenderer.invoke('drives:scan') as Promise<IpcResult<DriveCandidate[]>>,

  ensureImage: () =>
    ipcRenderer.invoke('image:ensure') as Promise<IpcResult<{ imagePath: string }>>,

  onImageProgress: (cb: (p: ImageProgress) => void) =>
    subscribe<ImageProgress>('image:progress', cb),

  startFlash: (args: { imagePath: string; target: FlashTarget }) =>
    ipcRenderer.invoke('flash:start', args) as Promise<IpcResult<null>>,

  cancelFlash: () => ipcRenderer.invoke('flash:cancel') as Promise<IpcResult<null>>,

  onFlashProgress: (cb: (p: FlashProgress) => void) =>
    subscribe<FlashProgress>('flash:progress', cb),

  generateConfig: (config: InstallerConfig) =>
    ipcRenderer.invoke('config:generate', config) as Promise<IpcResult<GeneratedFiles>>,

  injectBoot: (args: { device: string; config: InstallerConfig }) =>
    ipcRenderer.invoke('boot:inject', args) as Promise<
      IpcResult<{ bootDir: string; generated: GeneratedFiles }>
    >,

  findPi: (args: { hosts: string[]; timeoutMs?: number }) =>
    ipcRenderer.invoke('pi:find', args) as Promise<IpcResult<PiDiscovery>>,
};

contextBridge.exposeInMainWorld('installer', api);
