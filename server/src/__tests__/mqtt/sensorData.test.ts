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

import { translateValue } from '../../mqtt/sensorData.js';

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
