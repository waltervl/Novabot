import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock isDeviceOnline + publishRawToDevice so we can hit startMowing
// without an actual aedes broker.
vi.mock('../../mqtt/broker.js', () => ({
  isDeviceOnline: vi.fn(() => true),
}));
vi.mock('../../mqtt/mapSync.js', () => ({
  publishRawToDevice: vi.fn(),
}));

import { isMowerBusy, startMowing } from '../../services/mowingService.js';
import { deviceCache } from '../../mqtt/sensorData.js';
import { publishRawToDevice } from '../../mqtt/mapSync.js';

const sn = 'LFIN1234567890';

function setSensors(values: Record<string, string>) {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(values)) map.set(k, v);
  deviceCache.set(sn, map);
}

describe('isMowerBusy', () => {
  beforeEach(() => {
    deviceCache.delete(sn);
    vi.clearAllMocks();
  });

  it('returns false when no cache exists', () => {
    expect(isMowerBusy(sn)).toBe(false);
  });

  it('returns false for idle work_status (0)', () => {
    setSensors({ work_status: '0', msg: 'Mode:COVERAGE Work:WAIT Recharge: WAIT' });
    expect(isMowerBusy(sn)).toBe(false);
  });

  it('returns false on dock (work_status 9)', () => {
    setSensors({ work_status: '9', msg: 'Mode:DOCK Work:WAIT Recharge: FINISHED' });
    expect(isMowerBusy(sn)).toBe(false);
  });

  it('returns false for cancelled/done (work_status 2)', () => {
    setSensors({ work_status: '2', msg: 'Mode:COVERAGE Work:CANCELLED Recharge: WAIT' });
    expect(isMowerBusy(sn)).toBe(false);
  });

  it('returns true while mowing (work_status 1)', () => {
    setSensors({ work_status: '1', msg: 'Mode:COVERAGE Work:MOVING Recharge: WAIT' });
    expect(isMowerBusy(sn)).toBe(true);
  });

  it('returns true while covering (work_status 92)', () => {
    setSensors({ work_status: '92', msg: 'Mode:COVERAGE Work:COVERING Recharge: WAIT' });
    expect(isMowerBusy(sn)).toBe(true);
  });

  it('returns true when msg shows REQUEST_START even if work_status missing', () => {
    setSensors({ work_status: '', msg: 'Mode:COVERAGE Work:REQUEST_START Recharge: CANCELLED' });
    expect(isMowerBusy(sn)).toBe(true);
  });

  it('returns true while mapping', () => {
    setSensors({ work_status: '5', msg: 'Mode:MAPPING Work:USER_MAP_BUILD' });
    expect(isMowerBusy(sn)).toBe(true);
  });
});

describe('startMowing busy guard', () => {
  beforeEach(() => {
    deviceCache.delete(sn);
    vi.clearAllMocks();
  });

  it('rejects when mower is already mowing', () => {
    setSensors({ work_status: '92', msg: 'Mode:COVERAGE Work:COVERING' });
    const result = startMowing({ sn });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/busy/i);
    expect(publishRawToDevice).not.toHaveBeenCalled();
  });

  it('publishes when mower is idle', () => {
    setSensors({ work_status: '9', msg: 'Mode:DOCK Work:WAIT' });
    const result = startMowing({ sn });
    expect(result.ok).toBe(true);
    expect(publishRawToDevice).toHaveBeenCalledOnce();
  });

  it('publishes when no cache exists yet (first start after boot)', () => {
    const result = startMowing({ sn });
    expect(result.ok).toBe(true);
    expect(publishRawToDevice).toHaveBeenCalledOnce();
  });
});
