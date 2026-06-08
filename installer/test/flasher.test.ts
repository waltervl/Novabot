import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MultiDestinationProgress } from 'etcher-sdk/build/multi-write.js';

/**
 * Mock etcher-sdk at the module boundary so no real device is ever touched.
 *
 * We only depend on a tiny slice of the SDK:
 *   - sourceDestination.File   — wraps the image path (source) and the device (dest)
 *   - sourceDestination.BlockDevice — block device destination
 *   - multiWrite.pipeSourceToDestinations({ source, destinations, onProgress, onFail, verify })
 *
 * The mocked writer records the options it was called with (so the test can
 * assert `verify: true`) and drives the supplied `onProgress` callback so we can
 * assert progress forwarding.
 */
const pipeSourceToDestinations =
  vi.fn<(opts: PipeOpts) => Promise<unknown>>();

interface PipeOpts {
  source: unknown;
  destinations: unknown[];
  onProgress: (p: MultiDestinationProgress) => void;
  onFail: (d: unknown, e: Error) => void;
  verify?: boolean;
}

class FakeFile {
  constructor(public readonly args: { path: string; write?: boolean }) {}
  async close(): Promise<void> {}
}
class FakeBlockDevice {
  constructor(public readonly args: Record<string, unknown>) {}
  async close(): Promise<void> {}
}

vi.mock('etcher-sdk', () => {
  return {
    sourceDestination: {
      File: FakeFile,
      BlockDevice: FakeBlockDevice,
    },
    multiWrite: {
      pipeSourceToDestinations: (opts: PipeOpts) => pipeSourceToDestinations(opts),
    },
  };
});

// Import AFTER the mock is registered.
const { flash } = await import('../src/main/flasher.js');

const safeTarget = {
  device: '/dev/disk4',
  size: 32e9,
  isSystem: false,
  isRemovable: true,
  isReadOnly: false,
};

/**
 * A live-scan stub that reports the target device as currently attached and
 * safe. Tests that exercise the write path inject this so the new live re-scan
 * membership guard passes without touching real hardware.
 */
const scanForSafetyWithTarget = () =>
  Promise.resolve([
    {
      device: safeTarget.device,
      description: 'SD card',
      size: safeTarget.size,
      isSystem: false,
      isRemovable: true,
      isReadOnly: false,
    },
  ]);

const unsafeSystemTarget = {
  device: '/dev/disk0',
  size: 500e9,
  isSystem: true, // system disk → must be refused
  isRemovable: false,
  isReadOnly: false,
};

beforeEach(() => {
  pipeSourceToDestinations.mockReset();
});

describe('flash', () => {
  it('REJECTS an unsafe target and NEVER calls the writer', async () => {
    await expect(
      flash({
        imagePath: '/tmp/raspios.img',
        target: unsafeSystemTarget,
        onProgress: () => {},
      }),
    ).rejects.toThrow(/safety check/i);
    expect(pipeSourceToDestinations).not.toHaveBeenCalled();
  });

  it('writes with verification enabled on a safe target', async () => {
    pipeSourceToDestinations.mockResolvedValue({ failures: new Map(), bytesWritten: 1 });

    await flash({
      imagePath: '/tmp/raspios.img',
      target: safeTarget,
      onProgress: () => {},
      scanForSafety: scanForSafetyWithTarget,
    });

    expect(pipeSourceToDestinations).toHaveBeenCalledTimes(1);
    const opts = pipeSourceToDestinations.mock.calls[0]![0];
    expect(opts.verify).toBe(true);
  });

  it('REFUSES when the live re-scan does NOT list the target device, even if flags pass', async () => {
    // scanForSafety returns a different attached device — target is no longer present.
    const scanForSafety = vi
      .fn<() => Promise<{ device: string; description: string; size: number; isSystem: boolean; isRemovable: boolean; isReadOnly: boolean }[]>>()
      .mockResolvedValue([
        {
          device: '/dev/disk9',
          description: 'Some other card',
          size: 64e9,
          isSystem: false,
          isRemovable: true,
          isReadOnly: false,
        },
      ]);

    await expect(
      flash({
        imagePath: '/tmp/raspios.img',
        target: safeTarget, // flags pass isSafeTarget, but device not in live scan
        onProgress: () => {},
        scanForSafety,
      }),
    ).rejects.toThrow(/not a currently-attached safe.*device/i);
    expect(pipeSourceToDestinations).not.toHaveBeenCalled();
  });

  it('PROCEEDS to the write when the live re-scan lists the target device', async () => {
    pipeSourceToDestinations.mockResolvedValue({ failures: new Map(), bytesWritten: 1 });
    const scanForSafety = vi
      .fn<() => Promise<{ device: string; description: string; size: number; isSystem: boolean; isRemovable: boolean; isReadOnly: boolean }[]>>()
      .mockResolvedValue([
        {
          device: safeTarget.device,
          description: 'SD card',
          size: safeTarget.size,
          isSystem: false,
          isRemovable: true,
          isReadOnly: false,
        },
      ]);

    await flash({
      imagePath: '/tmp/raspios.img',
      target: safeTarget,
      onProgress: () => {},
      scanForSafety,
    });

    expect(pipeSourceToDestinations).toHaveBeenCalledTimes(1);
    const opts = pipeSourceToDestinations.mock.calls[0]![0];
    expect(opts.verify).toBe(true);
  });

  it('forwards progress from the writer to onProgress', async () => {
    const events: MultiDestinationProgress[] = [];
    pipeSourceToDestinations.mockImplementation(async (opts: PipeOpts) => {
      opts.onProgress({
        active: 1,
        failed: 0,
        type: 'flashing',
        bytes: 50,
        position: 50,
        speed: 10,
        averageSpeed: 10,
        percentage: 50,
        eta: 5,
      } as MultiDestinationProgress);
      return { failures: new Map(), bytesWritten: 50 };
    });

    await flash({
      imagePath: '/tmp/raspios.img',
      target: safeTarget,
      onProgress: (p) => events.push(p),
      scanForSafety: scanForSafetyWithTarget,
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.percentage).toBe(50);
    expect(events[0]!.bytes).toBe(50);
    expect(events[0]!.eta).toBe(5);
  });
});
