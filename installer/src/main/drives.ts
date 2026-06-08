import { scanner as etcherScanner } from 'etcher-sdk';

/**
 * SAFETY-CRITICAL MODULE.
 *
 * Flashing writes raw bytes to a block device, destroying everything on it. If
 * the drive list ever offers the user's system disk or an external hard drive,
 * accepting it would irrecoverably destroy their data. `isSafeTarget` is the
 * single guard that decides what may be flashed; it is exhaustively
 * unit-tested. It is DEFAULT-DENY: a drive is unsafe unless every condition is
 * positively, explicitly satisfied. Any missing/undefined flag means unsafe.
 */

/** Minimal shape of the per-drive safety flags `isSafeTarget` reasons about. */
export interface SafeTargetInput {
  isSystem?: boolean;
  isRemovable?: boolean;
  isReadOnly?: boolean;
  size?: number;
}

/**
 * Smallest SD card we are willing to flash an OS image onto. Anything smaller
 * cannot be a usable target and is far more likely to be something unexpected.
 */
const MIN_SIZE_BYTES = 4e9; // 4 GB
/**
 * Largest device we treat as a (micro)SD card. This is the most important
 * safety bound: external HDD/SSDs are typically far larger, so capping the size
 * keeps multi-terabyte data drives out of the candidate list entirely.
 */
const MAX_SIZE_BYTES = 512e9; // 512 GB

/**
 * Return `true` ONLY when the drive is, by every available signal, a safe
 * removable flash target. This is a pure predicate with NO side effects.
 *
 * Default-deny: the function returns `true` only if ALL of the following hold,
 * each checked with strict equality / typeof so that `undefined` or any
 * unexpected value falls through to `false`:
 *   - not a system disk (`isSystem === false`),
 *   - removable (`isRemovable === true`),
 *   - writable (`isReadOnly === false`),
 *   - a known, plausible SD-card size (`4GB <= size <= 512GB`).
 *
 * There is intentionally no branch that can return `true` for a system,
 * non-removable, read-only, unknown-size, too-small, or too-large device.
 */
export function isSafeTarget(d: SafeTargetInput): boolean {
  return (
    d.isSystem === false &&
    d.isRemovable === true &&
    d.isReadOnly === false &&
    typeof d.size === 'number' &&
    Number.isFinite(d.size) &&
    d.size >= MIN_SIZE_BYTES &&
    d.size <= MAX_SIZE_BYTES
  );
}

/** A drive that passed `isSafeTarget` and may be presented to the user. */
export interface DriveCandidate {
  device: string;
  description: string;
  size: number;
}

/**
 * Superset of the etcher-sdk drive shape we read. etcher-sdk's public
 * `AdapterSourceDestination` exposes `isSystem`, `device`, `description` and
 * `size`, but the removable / read-only flags come from the underlying
 * `drivelist` drive (`isRemovable`, `isReadOnly`). We read them structurally
 * and defensively — anything we cannot positively confirm stays `undefined`
 * and is therefore rejected by `isSafeTarget`.
 */
interface ScannedDrive {
  device?: string | null;
  description?: string;
  size?: number | null;
  isSystem?: boolean;
  isRemovable?: boolean;
  isReadOnly?: boolean;
  isReadonly?: boolean;
}

/**
 * Enumerate attached block devices via etcher-sdk and return ONLY the ones that
 * pass `isSafeTarget`. The scanner is ALWAYS stopped (try/finally) so we never
 * leak its background polling. Verified on hardware; the safety guard
 * (`isSafeTarget`) is the unit-tested piece.
 */
export async function scanDrives(): Promise<DriveCandidate[]> {
  const adapter = new etcherScanner.adapters.BlockDeviceAdapter({
    includeSystemDrives: () => false,
  });
  const sc = new etcherScanner.Scanner([adapter]);

  await sc.start();
  try {
    const candidates: DriveCandidate[] = [];
    for (const raw of sc.drives) {
      const drive = raw as unknown as ScannedDrive;
      // Normalise to the strict shape `isSafeTarget` expects. `isReadonly` is an
      // alternate spelling some adapters use; treat either as read-only.
      const isReadOnly =
        drive.isReadOnly === true || drive.isReadonly === true
          ? true
          : drive.isReadOnly === false || drive.isReadonly === false
            ? false
            : undefined;
      const input: SafeTargetInput = {
        isSystem: drive.isSystem,
        isRemovable: drive.isRemovable,
        isReadOnly,
        size: typeof drive.size === 'number' ? drive.size : undefined,
      };
      if (!isSafeTarget(input)) {
        continue;
      }
      // Past the guard: size is a finite number and device is present in
      // practice. Re-narrow defensively rather than asserting.
      if (typeof drive.device !== 'string' || typeof drive.size !== 'number') {
        continue;
      }
      candidates.push({
        device: drive.device,
        description: drive.description ?? drive.device,
        size: drive.size,
      });
    }
    return candidates;
  } finally {
    sc.stop();
  }
}
