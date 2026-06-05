import { describe, expect, it } from 'vitest';
import { equipmentRepo } from '../../db/repositories/index.js';
import { getMowerFileCapability, supportsMowerFileWrites } from '../../services/mowerFileCapability.js';

describe('mower file capability', () => {
  it('blocks stock firmware from mower file writes', () => {
    equipmentRepo.create({
      equipment_id: 'eq-stock-capability',
      mower_sn: 'LFIN_STOCK_CAPABILITY',
      charger_sn: 'LFIC_STOCK_CAPABILITY',
      mower_version: '5.7.1',
    });

    const capability = getMowerFileCapability('LFIN_STOCK_CAPABILITY');

    expect(capability.mowerFileApplySupported).toBe(false);
    expect(capability.isOpenNova).toBe(false);
    expect(capability.reason).toMatch(/OpenNova\/custom firmware/);
    expect(supportsMowerFileWrites('LFIN_STOCK_CAPABILITY')).toBe(false);
  });

  it('allows custom firmware by version string or OpenNova flag', () => {
    equipmentRepo.create({
      equipment_id: 'eq-custom-capability',
      mower_sn: 'LFIN_CUSTOM_CAPABILITY',
      charger_sn: 'LFIC_CUSTOM_CAPABILITY',
      mower_version: 'v6.0.2-custom-16',
    });
    equipmentRepo.create({
      equipment_id: 'eq-flag-capability',
      mower_sn: 'LFIN_FLAG_CAPABILITY',
      charger_sn: 'LFIC_FLAG_CAPABILITY',
      mower_version: '5.7.1',
    });
    equipmentRepo.setOpenNova('LFIN_FLAG_CAPABILITY');

    expect(getMowerFileCapability('LFIN_CUSTOM_CAPABILITY').mowerFileApplySupported).toBe(true);
    expect(getMowerFileCapability('LFIN_FLAG_CAPABILITY').mowerFileApplySupported).toBe(true);
  });
});
