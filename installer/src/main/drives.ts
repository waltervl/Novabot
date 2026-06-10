import { list as listDrives, type Drive as DrivelistDrive } from 'drivelist';

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

/** Smallest card we will flash. Below this is almost certainly the wrong device. */
const MIN_SIZE_BYTES = 4e9; // 4 GB
/** Largest device we treat as a (micro)SD card — keeps big HDD/SSDs out. */
const MAX_SIZE_BYTES = 512e9; // 512 GB

/**
 * Return `true` ONLY when the drive is, by every available signal, a safe
 * removable flash target. Pure predicate, default-deny: not a system disk,
 * removable, writable, and a plausible SD-card size (4GB–512GB). Anything
 * `undefined`/unexpected falls through to `false`.
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
  isSystem: boolean;
  isRemovable: boolean;
  isReadOnly: boolean;
}

/** Subset of the `drivelist` drive shape we read defensively. */
interface ScannedDrive {
  device?: string | null;
  description?: string;
  size?: number | null;
  isSystem?: boolean;
  isRemovable?: boolean;
  isReadOnly?: boolean;
  isReadonly?: boolean;
}

/** Normalise a drivelist drive's read-only flag to strict boolean|undefined. */
function normalizeReadOnly(drive: ScannedDrive): boolean | undefined {
  if (drive.isReadOnly === true || drive.isReadonly === true) return true;
  if (drive.isReadOnly === false || drive.isReadonly === false) return false;
  return undefined;
}

/**
 * Enumerate attached block devices via `drivelist` and return ONLY the ones
 * that pass `isSafeTarget`. drivelist is N-API (loads in the Electron main
 * process) and does a single snapshot enumeration (no background polling).
 */
export async function scanDrives(): Promise<DriveCandidate[]> {
  const drives = (await listDrives()) as unknown as ScannedDrive[];

  const candidates: DriveCandidate[] = [];
  for (const drive of drives) {
    const isReadOnly = normalizeReadOnly(drive);
    const input: SafeTargetInput = {
      isSystem: drive.isSystem,
      isRemovable: drive.isRemovable,
      isReadOnly,
      size: typeof drive.size === 'number' ? drive.size : undefined,
    };
    if (!isSafeTarget(input)) {
      continue;
    }
    if (typeof drive.device !== 'string' || typeof drive.size !== 'number') {
      continue;
    }
    candidates.push({
      device: drive.device,
      description: drive.description ?? drive.device,
      size: drive.size,
      isSystem: input.isSystem as boolean,
      isRemovable: input.isRemovable as boolean,
      isReadOnly: input.isReadOnly as boolean,
    });
  }
  return candidates;
}

/**
 * Return the FULL drivelist drive for `device` — but ONLY if it still passes
 * `isSafeTarget` right now; otherwise `null`. This is the un-spoofable, live
 * safety+membership gate used immediately before writing, AND the source of the
 * REAL raw device node (`/dev/rdiskN` on macOS) the writer must open. A buggy or
 * compromised renderer cannot fabricate this: the device must genuinely be an
 * attached, removable, non-system, writable, SD-sized disk at this moment.
 */
export async function findSafeDriveForFlash(device: string): Promise<DrivelistDrive | null> {
  const drives = (await listDrives()) as unknown as ScannedDrive[];
  for (const drive of drives) {
    if (drive.device !== device) {
      continue;
    }
    const input: SafeTargetInput = {
      isSystem: drive.isSystem,
      isRemovable: drive.isRemovable,
      isReadOnly: normalizeReadOnly(drive),
      size: typeof drive.size === 'number' ? drive.size : undefined,
    };
    return isSafeTarget(input) ? (drive as unknown as DrivelistDrive) : null;
  }
  return null;
}
