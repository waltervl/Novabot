import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub the heavy modules so no etcher-sdk / network / disk is touched.
vi.mock('../src/main/drives.js', () => ({
  scanDrives: vi.fn(),
}));
vi.mock('../src/main/imageSource.js', () => ({
  downloadImage: vi.fn(),
  verifySha256: vi.fn(),
}));
vi.mock('../src/main/flasher.js', () => ({
  flash: vi.fn(),
}));
vi.mock('../src/main/bootInject.js', () => ({
  writeBootFiles: vi.fn(),
  findBootPartition: vi.fn(),
}));
vi.mock('../src/main/discovery.js', () => ({
  waitForPi: vi.fn(),
}));

import { registerIpcHandlers } from '../src/main/ipc.js';
import type { IpcMainLike } from '../src/main/ipc.js';
import { scanDrives } from '../src/main/drives.js';
import { writeBootFiles, findBootPartition } from '../src/main/bootInject.js';
import type { InstallerConfig } from '../src/shared/types.js';

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

const sampleConfig: InstallerConfig = {
  hostname: 'opennova',
  network: { type: 'ethernet' },
  timezone: 'Europe/Amsterdam',
  connectionPath: 'opennova-app',
};

const EXPECTED_CHANNELS = [
  'drives:scan',
  'image:ensure',
  'flash:start',
  'flash:cancel',
  'boot:inject',
  'config:generate',
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

  it('drives:scan returns { ok:true, value } when scanDrives resolves', async () => {
    const { ipcMain, handlers } = makeFakeIpcMain();
    registerIpcHandlers(ipcMain);
    const candidates = [
      {
        device: '/dev/disk4',
        description: 'SD',
        size: 64e9,
        isSystem: false,
        isRemovable: true,
        isReadOnly: false,
      },
    ];
    vi.mocked(scanDrives).mockResolvedValue(candidates);

    const result = await handlers.get('drives:scan')!({});
    expect(result).toEqual({ ok: true, value: candidates });
  });

  it('returns { ok:false, error } (does not reject) when the module throws', async () => {
    const { ipcMain, handlers } = makeFakeIpcMain();
    registerIpcHandlers(ipcMain);
    vi.mocked(scanDrives).mockRejectedValue(new Error('drivelist exploded'));

    const result = (await handlers.get('drives:scan')!({})) as {
      ok: boolean;
      error?: string;
    };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('drivelist exploded');
  });

  it('boot:inject returns { ok:false } when findBootPartition resolves null', async () => {
    const { ipcMain, handlers } = makeFakeIpcMain();
    registerIpcHandlers(ipcMain);
    vi.mocked(findBootPartition).mockResolvedValue(null);

    const result = (await handlers.get('boot:inject')!(
      {},
      { device: '/dev/disk4', config: sampleConfig },
    )) as { ok: boolean; error?: string };

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/partition/i);
    expect(writeBootFiles).not.toHaveBeenCalled();
  });

  it('boot:inject returns { ok:true } and writes files when partition is found', async () => {
    const { ipcMain, handlers } = makeFakeIpcMain();
    registerIpcHandlers(ipcMain);
    vi.mocked(findBootPartition).mockResolvedValue('/Volumes/bootfs');

    const result = (await handlers.get('boot:inject')!(
      {},
      { device: '/dev/disk4', config: sampleConfig },
    )) as { ok: boolean; value?: { bootDir: string; generated: unknown } };

    expect(result.ok).toBe(true);
    expect(result.value?.bootDir).toBe('/Volumes/bootfs');
    expect(result.value?.generated).toBeDefined();
    expect(writeBootFiles).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeBootFiles).mock.calls[0][0]).toBe('/Volumes/bootfs');
  });

  it('flash:cancel with no in-flight flash resolves { ok:true, value:null } (no throw)', async () => {
    const { ipcMain, handlers } = makeFakeIpcMain();
    registerIpcHandlers(ipcMain);

    const result = await handlers.get('flash:cancel')!({});
    expect(result).toEqual({ ok: true, value: null });
  });
});
