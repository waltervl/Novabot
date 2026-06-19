import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock isDeviceOnline + publishToDevice so we can hit startMowing
// without an actual aedes broker. mowingService now delegates to
// publishToDevice (which handles AES vs plain JSON internally based
// on firmware version), so the test asserts on that call instead of
// the lower-level publishRawToDevice.
vi.mock('../../mqtt/broker.js', () => ({
  isDeviceOnline: vi.fn(() => true),
}));
vi.mock('../../mqtt/mapSync.js', () => ({
  publishToDevice: vi.fn(),
}));

import { isMowerBusy, startMowing, cuttingHeightToWire } from '../../services/mowingService.js';
import { deviceCache } from '../../mqtt/sensorData.js';
import { publishToDevice } from '../../mqtt/mapSync.js';

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

describe('cuttingHeightToWire', () => {
  // Regression: a 9 cm schedule made in the app stored cutting_height=9 (cm),
  // which the old heuristic mis-read as a "cm+2 wire value" and mowed at 7 cm.
  it('treats app user-cm (2..9) as cm', () => {
    expect(cuttingHeightToWire(9)).toBe(7); // 9cm  (was wrongly 5 = 7cm)
    expect(cuttingHeightToWire(5)).toBe(3); // 5cm
    expect(cuttingHeightToWire(2)).toBe(0); // 2cm
  });
  it('treats dashboard mm (20..90) as mm', () => {
    expect(cuttingHeightToWire(90)).toBe(7); // 90mm = 9cm
    expect(cuttingHeightToWire(50)).toBe(3); // 50mm = 5cm
    expect(cuttingHeightToWire(20)).toBe(0); // 20mm = 2cm
  });
  it('app 9cm and dashboard 90mm produce the same wire value', () => {
    expect(cuttingHeightToWire(9)).toBe(cuttingHeightToWire(90));
  });
  it('clamps out-of-range inputs to 2..9 cm', () => {
    expect(cuttingHeightToWire(1)).toBe(0);   // below min → 2cm
    expect(cuttingHeightToWire(99)).toBe(7);  // 99mm ≈ 10cm → clamp 9cm
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
    expect(publishToDevice).not.toHaveBeenCalled();
  });

  it('publishes when mower is idle', () => {
    setSensors({ work_status: '9', msg: 'Mode:DOCK Work:WAIT' });
    const result = startMowing({ sn });
    expect(result.ok).toBe(true);
    expect(publishToDevice).toHaveBeenCalledOnce();
  });

  it('publishes when no cache exists yet (first start after boot)', () => {
    const result = startMowing({ sn });
    expect(result.ok).toBe(true);
    expect(publishToDevice).toHaveBeenCalledOnce();
  });

  it('sends cutterhigh 7 for a 9cm app schedule (regression: was 5 = 7cm)', () => {
    setSensors({ work_status: '9', msg: 'Mode:DOCK Work:WAIT' });
    startMowing({ sn, cuttingHeight: 9 });
    expect(vi.mocked(publishToDevice).mock.calls[0][1]).toMatchObject({
      start_navigation: { cutterhigh: 7 },
    });
  });

  it('sends cutterhigh 7 for a 90mm dashboard schedule', () => {
    setSensors({ work_status: '9', msg: 'Mode:DOCK Work:WAIT' });
    startMowing({ sn, cuttingHeight: 90 });
    expect(vi.mocked(publishToDevice).mock.calls[0][1]).toMatchObject({
      start_navigation: { cutterhigh: 7 },
    });
  });
});
