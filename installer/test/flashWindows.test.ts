import { describe, it, expect, vi, beforeEach } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());
const writtenFiles = vi.hoisted(() => new Map<string, string>());

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    writeFile: vi.fn(async (path: string, data: string | Buffer, options?: unknown) => {
      writtenFiles.set(String(path), Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
      return actual.writeFile(path, data, options as Parameters<typeof actual.writeFile>[2]);
    }),
  };
});

import { flashWindows } from '../src/main/flashWindows.js';

function mockPowerShellExitWithoutResult(): void {
  spawnMock.mockImplementation(() => {
    const child: {
      stderr: { on: ReturnType<typeof vi.fn> };
      on: ReturnType<typeof vi.fn>;
    } = {
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, callback: (code?: number) => void) => {
        if (event === 'close') {
          setImmediate(() => callback(1));
        }
        return child;
      }),
    };
    return child;
  });
}

describe('flashWindows', () => {
  beforeEach(() => {
    writtenFiles.clear();
    spawnMock.mockReset();
    mockPowerShellExitWithoutResult();
  });

  it('generates raw Windows device paths that PowerShell and Add-Type can use', async () => {
    await expect(
      flashWindows({
        imagePath: 'C:\\Users\\tester\\Downloads\\opennova.img',
        device: '\\\\.\\PhysicalDrive2',
        safe: {} as never,
        total: 1024,
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow(/PowerShell failed/);

    const script = [...writtenFiles.entries()].find(([path]) => path.endsWith('flash.ps1'))?.[1];
    expect(script).toBeDefined();
    expect(script).toContain(String.raw`Open(@"\\.\PhysicalDrive" + diskNumber)`);
    expect(script).toContain(String.raw`ForEach-Object { "\\.\$($_.DriveLetter):" }`);
  });

  it('passes elevated PowerShell arguments as one quoted command line', async () => {
    await expect(
      flashWindows({
        imagePath: String.raw`C:\Users\tester\My Images\opennova.img`,
        device: '\\\\.\\PhysicalDrive2',
        safe: {} as never,
        total: 1024,
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow(/PowerShell failed/);

    const outerCmd = (spawnMock.mock.calls[0]?.[1] as string[] | undefined)?.[4];
    expect(outerCmd).toBeDefined();
    expect(outerCmd).toContain(`-ArgumentList '`);
    expect(outerCmd).toContain(String.raw`"C:\Users\tester\My Images\opennova.img"`);
    expect(outerCmd).not.toContain(String.raw`,'C:\Users\tester\My Images\opennova.img'`);
  });
});
