import { describe, it, expect, vi } from 'vitest';

// Break the broker chain that fires when sensorData.ts is imported.
vi.mock('../../mqtt/broker.js', () => ({
  isDeviceOnline: vi.fn().mockReturnValue(false),
  writeRawPublish: vi.fn(),
  getBrokerDiagnostics: vi.fn().mockReturnValue({}),
  startMqttBroker: vi.fn(),
  banishSn: vi.fn(),
  forceDisconnectDevice: vi.fn(),
  lookupMac: vi.fn(),
}));

import { translateValue, updateDeviceData } from '../../mqtt/sensorData.js';
import {
  markFrameUnvalidated, clearFrameUnvalidated, isFrameUnvalidated, noteAutoRecharge,
} from '../../services/frameValidation.js';

describe('translateValue rtk_fix_quality', () => {
  it('maps GGA quality codes to labels', () => {
    expect(translateValue('rtk_fix_quality', '4')).toBe('RTK Fixed');
    expect(translateValue('rtk_fix_quality', '5')).toBe('RTK Float');
    expect(translateValue('rtk_fix_quality', '2')).toBe('DGPS');
    expect(translateValue('rtk_fix_quality', '1')).toBe('GPS');
    expect(translateValue('rtk_fix_quality', '0')).toBe('No fix');
  });
  it('passes through unknown codes unchanged', () => {
    expect(translateValue('rtk_fix_quality', '7')).toBe('7');
  });
});

describe('frame_unvalidated lifecycle in updateDeviceData', () => {
  const docked = (sn: string) =>
    updateDeviceData(sn, Buffer.from(JSON.stringify({ report_state_robot: { recharge_status: 9 } })));
  const undocked = (sn: string) =>
    updateDeviceData(sn, Buffer.from(JSON.stringify({ report_state_robot: { recharge_status: 0 } })));

  it('does NOT clear while still docked at import time (regression: imported while parked)', () => {
    const SN = 'LFIN_DOCK_A';
    clearFrameUnvalidated(SN);
    markFrameUnvalidated(SN);
    // Mower was already on the dock when the bundle was imported.
    docked(SN);
    docked(SN);
    expect(isFrameUnvalidated(SN)).toBe(true); // must stay locked
  });

  it('does NOT clear on a stray bounce-redock with no auto_recharge', () => {
    const SN = 'LFIN_DOCK_D';
    clearFrameUnvalidated(SN);
    markFrameUnvalidated(SN);
    docked(SN);    // parked
    undocked(SN);  // 1cm bounce off the dock during backward drive
    docked(SN);    // rolled back on - but NO auto_recharge was issued
    expect(isFrameUnvalidated(SN)).toBe(true); // must stay locked
  });

  it('clears only after an auto_recharge command followed by a docked report', () => {
    const SN = 'LFIN_DOCK_C';
    clearFrameUnvalidated(SN);
    markFrameUnvalidated(SN);
    docked(SN);                       // still parked -> stays set
    expect(isFrameUnvalidated(SN)).toBe(true);
    noteAutoRecharge(SN);             // wizard issued the deliberate dock
    expect(isFrameUnvalidated(SN)).toBe(true); // command alone does not clear
    docked(SN);                       // dock confirmed after auto_recharge -> cleared
    expect(isFrameUnvalidated(SN)).toBe(false);
  });

  it('surfaces frame_unvalidated as a device field while set (not docked)', () => {
    const SN = 'LFIN_DOCK_B';
    clearFrameUnvalidated(SN);
    markFrameUnvalidated(SN);
    const changes = updateDeviceData(SN, Buffer.from(JSON.stringify({ report_state_robot: { battery_power: 80 } })));
    expect(changes?.get('frame_unvalidated')).toBe('1');
  });
});
