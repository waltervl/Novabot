import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub the heavy modules so no network / disk / decompression is touched.
vi.mock('../src/main/imageSource.js', () => ({
  downloadImage: vi.fn(),
  verifySha256: vi.fn(),
  sha256File: vi.fn(),
  resolveLatestImageUrl: vi.fn(),
  fetchExpectedSha256: vi.fn(),
  decompressXz: vi.fn(),
}));
vi.mock('../src/main/imagePatcher.js', () => ({
  patchImageBootPartition: vi.fn(),
}));
vi.mock('../src/main/drives.js', () => ({
  scanDrives: vi.fn(),
}));
vi.mock('../src/main/flashDisk.js', () => ({
  flashDisk: vi.fn(),
}));
vi.mock('../src/main/discovery.js', () => ({
  waitForPi: vi.fn(),
  isHostnameTaken: vi.fn(),
}));

import { registerIpcHandlers } from '../src/main/ipc.js';
import type { IpcMainLike, ShellLike } from '../src/main/ipc.js';
import { waitForPi } from '../src/main/discovery.js';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

/** A fake ipcMain that records every registered handler by channel. */
function makeFakeIpcMain(): { ipcMain: IpcMainLike; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  const ipcMain: IpcMainLike = {
    handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) {
      handlers.set(channel, listener as Handler);
    },
  };
  return { ipcMain, handlers };
}

const EXPECTED_CHANNELS = [
  'image:build',
  'drives:scan',
  'flash:start',
  'flash:cancel',
  'shell:reveal',
  'shell:openExternal',
  'hostname:check',
  'pi:find',
];

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all expected channels', () => {
    const { ipcMain, handlers } = makeFakeIpcMain();
    registerIpcHandlers(ipcMain);
    for (const channel of EXPECTED_CHANNELS) {
      expect(handlers.has(channel)).toBe(true);
    }
  });

  it('pi:find returns { ok:true, value } when waitForPi resolves', async () => {
    const { ipcMain, handlers } = makeFakeIpcMain();
    registerIpcHandlers(ipcMain);
    vi.mocked(waitForPi).mockResolvedValue({ host: 'opennova.local' });

    const result = await handlers.get('pi:find')!({}, { hosts: ['opennova.local'] });
    expect(result).toEqual({ ok: true, value: { host: 'opennova.local' } });
  });

  it('returns { ok:false, error } (does not reject) when a handler throws', async () => {
    const { ipcMain, handlers } = makeFakeIpcMain();
    registerIpcHandlers(ipcMain);
    vi.mocked(waitForPi).mockRejectedValue(new Error('no pi found'));

    const result = (await handlers.get('pi:find')!({}, { hosts: [] })) as {
      ok: boolean;
      error?: string;
    };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no pi found');
  });

  it('shell:reveal calls shell.showItemInFolder and resolves ok', async () => {
    const showItemInFolder = vi.fn();
    const shell: ShellLike = { showItemInFolder, openExternal: vi.fn().mockResolvedValue(undefined) };
    const { ipcMain, handlers } = makeFakeIpcMain();
    registerIpcHandlers(ipcMain, { shell });

    const result = await handlers.get('shell:reveal')!({}, '/path/to/image.img');
    expect(result).toEqual({ ok: true, value: null });
    expect(showItemInFolder).toHaveBeenCalledWith('/path/to/image.img');
  });

  it('shell:openExternal calls shell.openExternal and resolves ok', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const shell: ShellLike = { showItemInFolder: vi.fn(), openExternal };
    const { ipcMain, handlers } = makeFakeIpcMain();
    registerIpcHandlers(ipcMain, { shell });

    const result = await handlers.get('shell:openExternal')!({}, 'https://example.com');
    expect(result).toEqual({ ok: true, value: null });
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
  });
});
