import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../mqtt/broker.js', () => ({
  isDeviceOnline: vi.fn().mockReturnValue(true),
  writeRawPublish: vi.fn().mockReturnValue(false),
  getBrokerDiagnostics: vi.fn().mockReturnValue({}),
  startMqttBroker: vi.fn(),
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

vi.mock('../../services/mowerIpDiscovery.js', () => ({
  resolveMowerIp: vi.fn().mockResolvedValue(null),
  startMowerIpDiscovery: vi.fn(),
}));

vi.mock('../../services/anchor.js', () => ({
  getPolygonAnchor: vi.fn().mockReturnValue({ x: 0, y: 0, orientation: 1.5 }),
}));

vi.mock('../../services/coveragePlanService.js', () => ({
  generateNativeCoveragePlanFromRows: vi.fn().mockResolvedValue({
    canonical: 'map1',
    areaId: 2,
    pgmMd5: 'pgm-md5',
    cacheKey: 'cache-key',
    cacheHit: false,
    metadata: { width: 320, height: 120, resolution: 0.05, originX: -1, originY: -1 },
    startGrid: { x: 240, y: 59 },
    plannedPath: { '2': { '0': '10.00 1.00,11.00 1.00' } },
    paths: [{ id: '2_0', points: [{ x: 10, y: 1 }, { x: 11, y: 1 }] }],
  }),
}));

import { mapRepo } from '../../db/repositories/index.js';
import { deviceCache } from '../../mqtt/sensorData.js';
import { dashboardRouter } from '../../routes/dashboard.js';
import * as coveragePlanService from '../../services/coveragePlanService.js';
import * as mapSync from '../../mqtt/mapSync.js';

const app = express();
app.use(express.json());
app.use('/api/dashboard', dashboardRouter);

const SN = 'LFINTEST';

function seedMapRows() {
  mapRepo.create({
    map_id: 'map0-work',
    mower_sn: SN,
    map_name: 'Front',
    map_type: 'work',
    file_name: 'map0_work.csv',
    canonical_name: 'map0',
    map_area: JSON.stringify([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ]),
  });
  mapRepo.create({
    map_id: 'map1-work',
    mower_sn: SN,
    map_name: 'Back',
    map_type: 'work',
    file_name: 'map1_work.csv',
    canonical_name: 'map1',
    map_area: JSON.stringify([
      { x: 10, y: 0 },
      { x: 14, y: 0 },
      { x: 14, y: 4 },
      { x: 10, y: 4 },
    ]),
  });
  mapRepo.create({
    map_id: 'map1-obstacle',
    mower_sn: SN,
    map_name: 'Back obstacle',
    map_type: 'obstacle',
    file_name: 'map1_0_obstacle.csv',
    canonical_name: 'map1_0_obstacle',
    map_area: JSON.stringify([
      { x: 11, y: 1 },
      { x: 12, y: 1 },
      { x: 12, y: 2 },
      { x: 11, y: 2 },
    ]),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  deviceCache.clear();
});

describe('POST /api/dashboard/native-preview-path/:sn', () => {
  it('generates a native preview from stored map rows without publishing to the mower', async () => {
    seedMapRows();

    const res = await request(app)
      .post(`/api/dashboard/native-preview-path/${SN}`)
      .send({
        canonical: 'map1',
        startLocal: { x: 11, y: 2 },
        cov_direction: 90,
        expected_pgm_md5: 'expected-md5',
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      source: 'native',
      canonical: 'map1',
      areaId: 2,
      pgmMd5: 'pgm-md5',
      cacheHit: false,
      startGrid: { x: 240, y: 59 },
      paths: [{ id: '2_0', points: [{ x: 10, y: 1 }, { x: 11, y: 1 }] }],
    });

    expect(coveragePlanService.generateNativeCoveragePlanFromRows).toHaveBeenCalledWith(
      expect.objectContaining({
        mowerSn: SN,
        canonical: 'map1',
        startLocal: { x: 11, y: 2 },
        covDirection: 90,
        expectedPgmMd5: 'expected-md5',
        chargingPose: { x: 0, y: 0, orientation: 1.5 },
      }),
    );
    const call = vi.mocked(coveragePlanService.generateNativeCoveragePlanFromRows).mock.calls[0][0];
    expect(call.rows.map((r) => r.canonical_name)).toEqual(['map0', 'map1', 'map1_0_obstacle']);

    expect(mapSync.publishToDevice).not.toHaveBeenCalled();
    expect(mapSync.publishToExtended).not.toHaveBeenCalled();
  });

  it('returns 404 when no stored map rows are available', async () => {
    const res = await request(app)
      .post(`/api/dashboard/native-preview-path/${SN}`)
      .send({ canonical: 'map0', startLocal: { x: 0, y: 0 } });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'no stored map rows for mower' });
    expect(coveragePlanService.generateNativeCoveragePlanFromRows).not.toHaveBeenCalled();
    expect(mapSync.publishToDevice).not.toHaveBeenCalled();
  });

  it('returns 409 when the synthesized PGM md5 gate rejects the request', async () => {
    seedMapRows();
    vi.mocked(coveragePlanService.generateNativeCoveragePlanFromRows).mockRejectedValueOnce(
      new Error('coverage planner: pgm md5 mismatch expected=old actual=new'),
    );

    const res = await request(app)
      .post(`/api/dashboard/native-preview-path/${SN}`)
      .send({ canonical: 'map0', startLocal: { x: 1, y: 1 }, expected_pgm_md5: 'old' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      ok: false,
      error: 'coverage planner: pgm md5 mismatch expected=old actual=new',
    });
    expect(mapSync.publishToDevice).not.toHaveBeenCalled();
    expect(mapSync.publishToExtended).not.toHaveBeenCalled();
  });
});
