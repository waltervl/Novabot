import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../services/firmwareSafety.js', () => ({
  ensureBetaFlashSafe: vi.fn(),
  isBetaFirmware: (v: string) => /custom|opennova/i.test(v ?? ''),
}));

vi.mock('../../mqtt/broker.js', () => ({
  isDeviceOnline: vi.fn().mockReturnValue(false),
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
  awaitCommand: vi.fn(),
  patchLatestZipChargingPose: vi.fn(),
}));

vi.mock('../../mqtt/mapConverter.js', () => ({
  generateMapZipFromDb: vi.fn(),
  gpsToLocal: vi.fn(),
  localToGps: vi.fn(),
  parseMapZip: vi.fn(),
  polygonArea: vi.fn(),
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
  getPolygonAnchor: vi.fn().mockReturnValue(null),
}));

vi.mock('../../services/coveragePlanService.js', () => ({
  generateNativeCoveragePlanFromRows: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../mqtt/sensorData.js', () => ({
  deviceCache: new Map<string, Map<string, string>>(),
  getAllDeviceSnapshots: vi.fn().mockReturnValue({}),
  getDeviceSnapshot: vi.fn().mockReturnValue({}),
  SENSORS: [],
  getGpsTrail: vi.fn().mockReturnValue([]),
  clearGpsTrail: vi.fn(),
  getLocalTrail: vi.fn().mockReturnValue([]),
  clearLocalTrail: vi.fn(),
  translateValue: vi.fn(),
  markPinVerified: vi.fn(),
  getDockPose: vi.fn().mockReturnValue(null),
}));

import { ensureBetaFlashSafe } from '../../services/firmwareSafety.js';
import { dashboardRouter } from '../../routes/dashboard.js';
import { otaVersionRepo } from '../../db/repositories/index.js';

const app = express();
app.use(express.json());
app.use('/api/dashboard', dashboardRouter);

describe('POST /ota/trigger/:sn beta gate', () => {
  beforeEach(() => {
    vi.spyOn(otaVersionRepo, 'findById').mockReturnValue({
      id: 1, version: 'v6.0.2-custom-36', device_type: 'mower',
      download_url: 'http://localhost/api/dashboard/firmware/fw.deb', md5: 'abc',
    } as any);
  });

  it('returns 409 BACKUP_FAILED when the gate blocks', async () => {
    (ensureBetaFlashSafe as any).mockResolvedValue({ allowed: false, error: 'BACKUP_FAILED', detail: 'no backup' });
    const res = await request(app).post('/api/dashboard/ota/trigger/LFIN2230700238').send({ version_id: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('BACKUP_FAILED');
  });

  it('dispatches and returns backup info when allowed', async () => {
    (ensureBetaFlashSafe as any).mockResolvedValue({ allowed: true, reason: 'backup-created', backup: { filename: 'b.novabotmap', bytes: 1, createdAt: 1, reason: 'pre-beta-flash' } });
    const res = await request(app).post('/api/dashboard/ota/trigger/LFIN2230700238').send({ version_id: 1 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.backup.filename).toBe('b.novabotmap');
  });
});
