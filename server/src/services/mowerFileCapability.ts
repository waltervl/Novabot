import { equipmentRepo } from '../db/repositories/index.js';

export const MOWER_FILE_WRITE_UNSUPPORTED_CODE = 'MOWER_FILE_WRITE_UNSUPPORTED';
export const MOWER_FILE_WRITE_UNSUPPORTED_MESSAGE =
  'Mower file restore requires OpenNova/custom firmware. Stock firmware does not support write_map_files; use server-copy import only unless the same maps already exist on the mower.';

export interface MowerFileCapability {
  mowerFileApplySupported: boolean;
  isOpenNova: boolean;
  mowerVersion: string | null;
  reason: string | null;
}

export function getMowerFileCapability(sn: string, fallbackVersion?: string | null): MowerFileCapability {
  const row = equipmentRepo.findBySn(sn) as ({ mower_version?: string | null; is_opennova?: unknown } | undefined);
  const firmware = row?.mower_version ?? fallbackVersion ?? null;
  const fwLower = String(firmware ?? '').toLowerCase();
  const flag = row?.is_opennova;
  const isOpenNova = flag === true
    || flag === 1
    || flag === '1'
    || fwLower.includes('custom')
    || fwLower.includes('opennova');

  return {
    mowerFileApplySupported: isOpenNova,
    isOpenNova,
    mowerVersion: firmware,
    reason: isOpenNova ? null : MOWER_FILE_WRITE_UNSUPPORTED_MESSAGE,
  };
}

export function supportsMowerFileWrites(sn: string, fallbackVersion?: string | null): boolean {
  return getMowerFileCapability(sn, fallbackVersion).mowerFileApplySupported;
}
