import { sourceDestination, multiWrite } from 'etcher-sdk';
import type { MultiDestinationProgress } from 'etcher-sdk/build/multi-write.js';
import { isSafeTarget, scanDrives, type SafeTargetInput, type DriveCandidate } from './drives.js';

/**
 * SAFETY-CRITICAL MODULE.
 *
 * `flash` writes a raw OS image to a block device, destroying everything on it.
 * The non-negotiable invariant is: we NEVER trust the caller. There are two
 * layered guards, run immediately before touching etcher-sdk:
 *
 *   1. `isSafeTarget` (the default-deny guard from ./drives.js) re-validates the
 *      flags on the descriptor we were handed. This is defense in depth.
 *   2. THE REAL "never trust the caller" GUARD: a LIVE re-scan of the currently
 *      attached safe devices. We refuse unless `target.device` is actually
 *      present in that freshly-enumerated list. Step 1 only checks flags that
 *      travel WITH the request — a buggy or compromised renderer could send any
 *      device string with safe-looking flags and pass it. Step 2 cannot be
 *      spoofed from the renderer: the device must really be an attached,
 *      removable, non-system, writable, SD-sized disk right now, or we throw
 *      before any device is opened.
 *
 * The final invariant is: we ALWAYS write with verification on (`verify: true`).
 * There is no code path that writes without it.
 */

/**
 * Descriptor of the device we have been asked to flash. This carries both the
 * safety flags (so we can re-validate) and the OS device path used to open the
 * block device. The flags mirror `SafeTargetInput`.
 */
export interface FlashTarget extends SafeTargetInput {
  /** OS device path, e.g. `/dev/disk4` (macOS) or `/dev/sdb` (Linux). */
  device: string;
}

/** Progress forwarded to the caller. This is etcher-sdk's progress shape. */
export type FlashProgress = MultiDestinationProgress;

export interface FlashOptions {
  /** Path to the (already downloaded + verified) OS image on disk. */
  imagePath: string;
  /** The device to flash. Re-validated with `isSafeTarget` before writing. */
  target: FlashTarget;
  /** Called with byte/eta/percentage progress as the write proceeds. */
  onProgress: (progress: FlashProgress) => void;
  /** Optional cancel signal; abort is best-effort (close destination + error). */
  signal?: AbortSignal;
  /**
   * Live enumeration of currently-attached SAFE removable devices, used for the
   * un-spoofable membership re-check. Injectable for testing; defaults to the
   * real {@link scanDrives}.
   */
  scanForSafety?: () => Promise<DriveCandidate[]>;
}

/**
 * Flash `imagePath` onto `target`, verifying the written bytes.
 *
 * Order of operations is deliberate and security-relevant:
 *   1. Re-validate the target flags with `isSafeTarget` BEFORE importing/using
 *      any etcher-sdk surface. A failed check throws and nothing is opened.
 *   2. If already aborted, throw immediately.
 *   3. LIVE re-scan the attached safe devices and refuse unless `target.device`
 *      is actually present. This is the real un-spoofable guard.
 *   4. Open source (image File) + destination (BlockDevice) and run
 *      `pipeSourceToDestinations` with `verify: true`, forwarding progress.
 *   5. Cancel via AbortSignal is best-effort: we close the destination, which
 *      tears down the in-flight write, then surface a clear "cancelled" error.
 *   6. Per-destination failures and elevation/permission errors are surfaced
 *      verbatim — never swallowed.
 */
export async function flash(options: FlashOptions): Promise<void> {
  const { imagePath, target, onProgress, signal } = options;

  // (1) NEVER trust the caller's flags. Re-check the descriptor we were given.
  if (!isSafeTarget(target)) {
    throw new Error('refusing to flash: target failed safety check');
  }

  // (2) Honour an already-aborted signal before opening anything.
  if (signal?.aborted) {
    throw new Error('flash cancelled');
  }

  // (3) The real guard: a buggy/compromised renderer can fabricate safe-looking
  // flags for ANY device string. Re-enumerate the currently-attached safe
  // devices ourselves and refuse unless the target is genuinely among them.
  const liveSafe = await (options.scanForSafety ?? scanDrives)();
  if (!liveSafe.some((d) => d.device === target.device)) {
    throw new Error(
      'refusing to flash: target is not a currently-attached safe removable device',
    );
  }

  const source = new sourceDestination.File({ path: imagePath, write: false });
  const destination = new sourceDestination.BlockDevice({
    drive: { device: target.device, raw: target.device } as never,
    write: true,
    // Match drive behaviour: unmount the SD on success so it ejects cleanly.
    unmountOnSuccess: true,
  });

  // (4) Best-effort cancel: closing the destination aborts the in-flight write.
  let aborted = false;
  const onAbort = (): void => {
    aborted = true;
    // Fire-and-forget; we still surface the cancellation error below.
    void destination.close().catch(() => {});
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  // Capture the first per-destination failure so we can surface it verbatim.
  let firstFailure: Error | undefined;

  try {
    const result = await multiWrite.pipeSourceToDestinations({
      source,
      destinations: [destination],
      onProgress: (progress: MultiDestinationProgress) => {
        onProgress(progress);
      },
      onFail: (_destination, error: Error) => {
        if (firstFailure === undefined) {
          firstFailure = error;
        }
      },
      // (3) Verification is mandatory. There is no path that disables this.
      verify: true,
    });

    if (aborted) {
      throw new Error('flash cancelled');
    }

    // (5) Surface failures verbatim (permission/elevation errors included).
    const failure = firstFailure ?? result.failures.values().next().value;
    if (failure !== undefined) {
      throw failure;
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    // Release handles regardless of outcome; ignore close errors so they don't
    // mask the real failure.
    await Promise.allSettled([source.close(), destination.close()]);
  }
}
