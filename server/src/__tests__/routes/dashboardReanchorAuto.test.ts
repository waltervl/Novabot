/**
 * Automatic re-anchor flow (Novabot-cq3).
 *
 * POST /api/dashboard/reanchor/:sn action:'auto' is the wizard's one-button
 * path. It must gate hard on the preconditions before it touches the mower:
 *   - frame must actually be unvalidated (else 409, nothing to do)
 *   - mower must be on the dock (charging)
 *   - mower must be on a real RTK Fixed
 *
 * action:'verify' is the manual backup: after the operator joysticks the mower
 * back onto the dock, it re-checks the docked map_position against the origin
 * and only clears frame_unvalidated when it lands within tolerance. It never
 * moves the mower.
 *
 * GET /reanchor/:sn/status exposes the progress the wizard polls.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../mqtt/broker.js', () => ({
  isDeviceOnline: vi.fn().mockReturnValue(true),
  writeRawPublish: vi.fn().mockReturnValue(false),
  getBrokerDiagnostics: vi.fn().mockReturnValue({}),
  startMqttBroker: vi.fn(),
  forceDisconnectDevice: vi.fn(),
}));

vi.mock('../../dashboard/socketHandler.js', () => ({
  getRecentLogs: vi.fn().mockReturnValue([]),
  forwardToDashboard: vi.fn(),
  onLogEntry: vi.fn(),
  emitMapsChanged: vi.fn(),
  emitDeviceOnline: vi.fn(),
  emitDeviceOffline: vi.fn(),
  emitTrailClear: vi.fn(),
  emitCoveredLanes: vi.fn(),
  setDemoModeChecker: vi.fn(),
  setOutlineEmitter: vi.fn(),
  initBleLogger: vi.fn(),
  sendBleLogHistory: vi.fn(),
  pushMqttLog: vi.fn(),
  emitOtaEvent: vi.fn(),
  emitPinEvent: vi.fn(),
  emitExtendedEvent: vi.fn(),
  emitCommandRespond: vi.fn(),
}));

vi.mock('../../mqtt/mapSync.js', () => ({
  requestMapList: vi.fn(),
  requestMapOutline: vi.fn(),
  publishToDevice: vi.fn(),
  publishRawToDevice: vi.fn(),
  publishEncryptedOnTopic: vi.fn(),
  publishToTopic: vi.fn(),
  goToChargePayload: vi.fn(),
  getNextCmdNum: vi.fn().mockReturnValue(1),
  initMapSync: vi.fn(),
  handleMapMessage: vi.fn(),
  handleExtendedResponse: vi.fn(),
  handleDeviceResponse: vi.fn(),
  publishToExtended: vi.fn(),
  onExtendedResponse: vi.fn(),
  offExtendedResponse: vi.fn(),
  notifyRespond: vi.fn(),
  setDemoInterceptor: vi.fn(),
  onMowerConnected: vi.fn(),
}));

vi.mock('../../mqtt/mapConverter.js', () => ({
  generateMapZipFromDb: vi.fn(),
  gpsToLocal: vi.fn(),
  localToGps: vi.fn(),
  parseMapZip: vi.fn(),
}));

vi.mock('../../services/demoSimulator.js', () => ({
  isDemoMode: vi.fn().mockReturnValue(false),
  setDemoMode: vi.fn(),
  getDemoStatus: vi.fn().mockReturnValue({}),
  setDemoInterceptor: vi.fn(),
}));

vi.mock('../../mqtt/sensorData.js', () => ({
  deviceCache: new Map<string, Map<string, string>>(),
}));

import { dashboardRouter } from '../../routes/dashboard.js';
import { markFrameUnvalidated, clearFrameUnvalidated, isFrameUnvalidated } from '../../services/frameValidation.js';
import { deviceCache } from '../../mqtt/sensorData.js';

const app = express();
app.use(express.json());
app.use('/api/dashboard', dashboardRouter);

const SN = 'LFIN2230700238';

function setCache(fields: Record<string, string>): void {
  deviceCache.set(SN, new Map(Object.entries(fields)));
}

const DOCKED_FIXED = {
  battery_state: 'CHARGING',
  rtk_fix_quality: 'RTK Fixed',
  latitude: '52.1234567', // live RTK position is cached under 'latitude'/'longitude'
  longitude: '4.7654321',
  map_position_x: '0.05',
  map_position_y: '0.10',
  localization_state: 'RUNNING',
};

beforeEach(() => {
  vi.clearAllMocks();
  clearFrameUnvalidated(SN);
  deviceCache.clear();
});

describe('POST /reanchor/:sn action:auto — precondition gates', () => {
  it('409 when the frame is already validated (nothing to re-anchor)', async () => {
    setCache(DOCKED_FIXED);
    const r = await request(app).post(`/api/dashboard/reanchor/${SN}`).send({ action: 'auto' });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/already validated/i);
  });

  it('409 when the mower is not on the dock', async () => {
    markFrameUnvalidated(SN);
    setCache({ ...DOCKED_FIXED, battery_state: 'NORMAL', recharge_status: '0' });
    const r = await request(app).post(`/api/dashboard/reanchor/${SN}`).send({ action: 'auto' });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/on the dock/i);
  });

  it('409 when on the dock but not RTK Fixed', async () => {
    markFrameUnvalidated(SN);
    setCache({ ...DOCKED_FIXED, rtk_fix_quality: 'RTK Float' });
    const r = await request(app).post(`/api/dashboard/reanchor/${SN}`).send({ action: 'auto' });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/Fixed/i);
  });

  it('200 + starts when on the dock and RTK Fixed; status goes to check', async () => {
    // Fake timers so the fire-and-forget runAutoReanchor (which schedules a 15s
    // extended-response timeout) cannot leave a real timer dangling into later
    // test files — clearAllTimers() in finally guarantees a clean exit.
    vi.useFakeTimers();
    try {
      markFrameUnvalidated(SN);
      setCache(DOCKED_FIXED);
      const r = await request(app).post(`/api/dashboard/reanchor/${SN}`).send({ action: 'auto' });
      expect(r.status).toBe(200);
      expect(r.body.ok).toBe(true);
      expect(r.body.action).toBe('auto');

      await vi.advanceTimersByTimeAsync(50); // let the async flow start
      const s = await request(app).get(`/api/dashboard/reanchor/${SN}/status`);
      expect(s.status).toBe(200);
      expect(['check', 'anchor', 'error']).toContain(s.body.status.phase);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('falls back to the rtk bool when no quality string is published', async () => {
    vi.useFakeTimers();
    try {
      markFrameUnvalidated(SN);
      setCache({ battery_state: 'CHARGING', rtk: 'true', latitude: '52.1', longitude: '4.7', map_position_x: '0', map_position_y: '0' });
      const r = await request(app).post(`/api/dashboard/reanchor/${SN}`).send({ action: 'auto' });
      expect(r.status).toBe(200);
      await vi.advanceTimersByTimeAsync(50);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});

describe('POST /reanchor/:sn action:verify — manual backup', () => {
  it('clears frame_unvalidated when docked on the origin (within tolerance)', async () => {
    vi.useFakeTimers();
    try {
      markFrameUnvalidated(SN);
      setCache({ ...DOCKED_FIXED, map_position_x: '0.08', map_position_y: '-0.12' });
      const r = await request(app).post(`/api/dashboard/reanchor/${SN}`).send({ action: 'verify' });
      expect(r.status).toBe(200);
      await vi.advanceTimersByTimeAsync(3500); // past the settle delay
      expect(isFrameUnvalidated(SN)).toBe(false);
    } finally {
      vi.useRealTimers();
    }

    const s = await request(app).get(`/api/dashboard/reanchor/${SN}/status`);
    expect(s.body.status.phase).toBe('done');
    expect(s.body.status.ok).toBe(true);
  });

  it('keeps frame_unvalidated when the docked position is outside tolerance', async () => {
    vi.useFakeTimers();
    try {
      markFrameUnvalidated(SN);
      setCache({ ...DOCKED_FIXED, map_position_x: '2.12', map_position_y: '0.63' });
      const r = await request(app).post(`/api/dashboard/reanchor/${SN}`).send({ action: 'verify' });
      expect(r.status).toBe(200);
      await vi.advanceTimersByTimeAsync(3500);
      expect(isFrameUnvalidated(SN)).toBe(true);
    } finally {
      vi.useRealTimers();
    }

    const s = await request(app).get(`/api/dashboard/reanchor/${SN}/status`);
    expect(s.body.status.phase).toBe('error');
    expect(s.body.status.error).toBe('verify_failed');
  });

  it('errors when verify is requested but the mower is not docked', async () => {
    vi.useFakeTimers();
    try {
      markFrameUnvalidated(SN);
      setCache({ battery_state: 'NORMAL', recharge_status: '0', map_position_x: '0', map_position_y: '0' });
      await request(app).post(`/api/dashboard/reanchor/${SN}`).send({ action: 'verify' });
      await vi.advanceTimersByTimeAsync(3500);
      expect(isFrameUnvalidated(SN)).toBe(true);
    } finally {
      vi.useRealTimers();
    }

    const s = await request(app).get(`/api/dashboard/reanchor/${SN}/status`);
    expect(s.body.status.phase).toBe('error');
    expect(s.body.status.error).toBe('not_docked');
  });
});

describe('GET /reanchor/:sn/status — default', () => {
  it('returns an idle status for an unknown SN', async () => {
    const s = await request(app).get('/api/dashboard/reanchor/UNKNOWNSN/status');
    expect(s.status).toBe(200);
    expect(s.body.status.phase).toBe('idle');
  });
});
