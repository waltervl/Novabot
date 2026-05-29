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
  markFrameUnvalidated, clearFrameUnvalidated, isFrameUnvalidated,
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
  it('clears the flag when the mower reports docked (recharge_status 9)', () => {
    const SN = 'LFIN_DOCK_A';
    clearFrameUnvalidated(SN);
    markFrameUnvalidated(SN);
    expect(isFrameUnvalidated(SN)).toBe(true);
    updateDeviceData(SN, Buffer.from(JSON.stringify({ report_state_robot: { recharge_status: 9 } })));
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
