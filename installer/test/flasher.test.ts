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
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.percentage).toBe(50);
    expect(events[0]!.bytes).toBe(50);
    expect(events[0]!.eta).toBe(5);
  });
});
