import { describe, it, expect, beforeEach, vi } from 'vitest';

// Break the broker → demoSimulator → socketHandler init chain that fires
// when sensorData.ts is imported. The mowing-session helpers are pure
// (no broker / socket dependencies) so stubbing the heavy imports is safe.
vi.mock('../../mqtt/broker.js', () => ({
  isDeviceOnline: vi.fn().mockReturnValue(false),
  writeRawPublish: vi.fn(),
  getBrokerDiagnostics: vi.fn().mockReturnValue({}),
  startMqttBroker: vi.fn(),
  banishSn: vi.fn(),
  forceDisconnectDevice: vi.fn(),
  lookupMac: vi.fn(),
}));

import {
  _updateMowingSession,
  getMowingSession,
  clearMowingSession,
} from '../../mqtt/sensorData.js';

const SN = 'LFIN1231000211';

beforeEach(() => {
  clearMowingSession(SN);
});

describe('mowing session timer (issue #17)', () => {
  it('does nothing for non-mowing work_status values', () => {
    _updateMowingSession(SN, '0');   // Idle
    _updateMowingSession(SN, '9');   // Ready
    _updateMowingSession(SN, '10');  // Leaving dock
    _updateMowingSession(SN, '50');  // Returning to dock
    expect(getMowingSession(SN)).toBeUndefined();
  });

  it.each([
    ['100', 'Mowing'],
    ['101', 'Edge cutting'],
    ['102', 'Re-covering missed'],
    ['103', 'Driving'],
    ['150', 'Edge cutting alt'],
  ])('starts session on active mowing status %s (%s)', (status) => {
    _updateMowingSession(SN, status, 1_000_000);
    const s = getMowingSession(SN);
    expect(s).toBeDefined();
    expect(s!.startedAt).toBe(1_000_000);
    expect(s!.lastActiveAt).toBe(1_000_000);
  });

  it('refreshes lastActiveAt on subsequent mowing pings, keeps startedAt', () => {
    _updateMowingSession(SN, '100', 1_000_000);
    _updateMowingSession(SN, '100', 1_000_000 + 30_000);
    _updateMowingSession(SN, '101', 1_000_000 + 60_000);
    const s = getMowingSession(SN)!;
    expect(s.startedAt).toBe(1_000_000);
    expect(s.lastActiveAt).toBe(1_000_000 + 60_000);
  });

  it('keeps the session intact when the mower transitions to non-mowing (so saveCutGrassRecord can read it)', () => {
    _updateMowingSession(SN, '100', 1_000_000);
    _updateMowingSession(SN, '50', 1_000_000 + 90_000);   // returning to dock — no-op
    _updateMowingSession(SN, '0', 1_000_000 + 120_000);   // idle — no-op
    const s = getMowingSession(SN)!;
    expect(s).toBeDefined();
    expect(s.startedAt).toBe(1_000_000);
    expect(s.lastActiveAt).toBe(1_000_000); // unchanged
  });

  it('clearMowingSession removes the entry', () => {
    _updateMowingSession(SN, '100', 1_000_000);
    expect(getMowingSession(SN)).toBeDefined();
    clearMowingSession(SN);
    expect(getMowingSession(SN)).toBeUndefined();
  });

  it('rejects garbage status values', () => {
    _updateMowingSession(SN, 'mowing');
    _updateMowingSession(SN, '');
    _updateMowingSession(SN, 'NaN');
    expect(getMowingSession(SN)).toBeUndefined();
  });

  it('rejects non-active task statuses near the active range', () => {
    _updateMowingSession(SN, '99');
    _updateMowingSession(SN, '110');  // Patrolling — not part of cov task duration
    _updateMowingSession(SN, '120');  // Avoiding obstacle — could log but skipped to keep boundary clean
    _updateMowingSession(SN, '200');  // Deleting child map
    expect(getMowingSession(SN)).toBeUndefined();
  });
});
