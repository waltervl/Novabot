/**
 * Route test — GET /api/admin-status/maps/:sn/export-portable
 *
 * Verifies that the endpoint:
 *   - returns HTTP 200
 *   - sets Content-Type: application/zip
 *   - streams a non-trivial ZIP body (> 200 bytes)
 */
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import request from 'supertest';
import express from 'express';

// ── Mock heavy deps BEFORE any import of adminStatus.ts ─────────────────────

vi.mock('../../mqtt/broker.js', () => ({
  isDeviceOnline: vi.fn().mockReturnValue(false),
  writeRawPublish: vi.fn().mockReturnValue(false),
  getBrokerDiagnostics: vi.fn().mockReturnValue({}),
  startMqttBroker: vi.fn(),
  banishSn: vi.fn(),
  unbanSn: vi.fn(),
  listBannedSns: vi.fn().mockReturnValue([]),
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

vi.mock('../../services/mdnsAdvertiser.js', () => ({
  startMdnsAdvertiser: vi.fn(),
  stopMdnsAdvertiser: vi.fn(),
  getActiveAdvertisement: vi.fn().mockReturnValue(null),
}));

vi.mock('../../services/mapBackup.js', () => ({
  listBackups: vi.fn().mockReturnValue([]),
  backupPath: vi.fn().mockReturnValue('/fake/backup.zip'),
  scheduleSnapshot: vi.fn(),
  regenerateLatestZipFromBackup: vi.fn().mockReturnValue('/fake/_latest.zip'),
}));

vi.mock('../../services/anchor.js', () => ({
  getPolygonAnchor: vi.fn().mockReturnValue(null),
}));

vi.mock('../../mqtt/sensorData.js', () => ({
  deviceCache: new Map<string, Map<string, string>>(),
  getValidationTrail: vi.fn().mockReturnValue([]),
  clearValidationTrail: vi.fn(),
  getLocalTrail: vi.fn().mockReturnValue([]),
}));

vi.mock('../../mqtt/mapConverter.js', () => ({
  generateMapZipFromDb: vi.fn(),
  gpsToLocal: vi.fn(),
  localToGps: vi.fn(),
  parseMapZip: vi.fn(),
  polygonArea: vi.fn().mockReturnValue(10),
}));

// ── Now import the router + deps ─────────────────────────────────────────────
import { adminStatusRouter } from '../../routes/adminStatus.js';
import { db } from '../../db/database.js';
import { mapRepo } from '../../db/repositories/index.js';
import * as mapSyncMock from '../../mqtt/mapSync.js';
import * as sensorDataMock from '../../mqtt/sensorData.js';

// Inject fake userId to bypass auth middleware
const app = express();
app.use(express.json());
app.use('/api/admin-status', (req, _res, next) => {
  (req as any).userId = 'u';
  next();
}, adminStatusRouter);

const SN = 'LFIN_TEST_EXP';

// ── Seed test data ─────────────────────────────────────────────────────────────
// NOTE: vitest's global setup.ts runs `DELETE FROM` all tables in beforeEach,
// so we must re-seed in beforeEach (not beforeAll) to survive that wipe.

beforeEach(() => {
  db.prepare(
    `INSERT INTO map_calibration (mower_sn, charger_lat, charger_lng) VALUES (?, ?, ?)`,
  ).run(SN, 52.14, 6.23);
  const ins = db.prepare(
    `INSERT INTO maps (mower_sn, map_id, map_name, map_type, file_name, map_area, canonical_name) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  ins.run(
    SN, 'm1', 'Tuin', 'work', 'map0_work.csv',
    JSON.stringify([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]),
    'map0',
  );
  ins.run(
    SN, 'u1', 'to charge', 'unicom', 'map0tocharge_unicom.csv',
    JSON.stringify([{ x: -1.21, y: 0.48 }, { x: -0.5, y: 0.0 }]),
    'map0tocharge_unicom',
  );
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /export-portable', () => {
  it('streams a ZIP buffer', async () => {
    const res = await request(app)
      .get(`/api/admin-status/maps/${SN}/export-portable`)
      .buffer()
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/zip/);
    expect((res.body as Buffer).length).toBeGreaterThan(200);
  });
});

describe('POST /import-portable', () => {
  it('accepts a valid bundle and returns staging_id', async () => {
    const expRes = await request(app)
      .get(`/api/admin-status/maps/${SN}/export-portable`)
      .buffer()
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    const zip = expRes.body as Buffer;
    const res = await request(app)
      .post(`/api/admin-status/maps/${SN}/import-portable`)
      .attach('bundle', zip, 'fixture.novabotmap');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.stagingId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.state).toBe('UPLOADED');
  });

  it('rejects garbage bundle with 400', async () => {
    // Use a different SN so there is no active session from the previous test
    const res = await request(app)
      .post(`/api/admin-status/maps/LFIN_TEST_GARBAGE/import-portable`)
      .attach('bundle', Buffer.from('not a zip'), 'bad.novabotmap');
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Export a bundle from SN_ANCHOR then upload it to targetSn; returns stagingId. */
async function uploadBundle(targetSn: string): Promise<string> {
  const expRes = await request(app)
    .get(`/api/admin-status/maps/${SN}/export-portable`)
    .buffer()
    .parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  const res = await request(app)
    .post(`/api/admin-status/maps/${targetSn}/import-portable`)
    .attach('bundle', expRes.body as Buffer, 'b.novabotmap');
  expect(res.status).toBe(200);
  return res.body.stagingId as string;
}

/** Seed deviceCache with GPS + RTK + CHARGING values for SN. */
function seedSensorCache(sn: string, lat: string, lng: string): void {
  const m = new Map<string, string>();
  m.set('latitude', lat);
  m.set('longitude', lng);
  m.set('loc_quality', '100');
  m.set('battery_state', 'CHARGING');
  (sensorDataMock.deviceCache as Map<string, Map<string, string>>).set(sn, m);
}

/** Get the shared deviceCache map for a given SN (for mutation in drive tests). */
function getSensorMap(sn: string): Map<string, string> {
  return (sensorDataMock.deviceCache as Map<string, Map<string, string>>).get(sn)!;
}

// ── Task 11: POST /set-anchor ──────────────────────────────────────────────

describe('POST /set-anchor', () => {
  it('snapshots RTK pose when mower at dock', async () => {
    const sn = 'LFIN_T11A';
    db.prepare(`INSERT OR IGNORE INTO map_calibration (mower_sn, charger_lat, charger_lng) VALUES (?, ?, ?)`)
      .run(sn, 52.14, 6.23);
    const stagingId = await uploadBundle(sn);
    seedSensorCache(sn, '52.140888', '6.231036');

    const res = await request(app)
      .post(`/api/admin-status/maps/${sn}/import-portable/${stagingId}/set-anchor`);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('ANCHOR_SET');
    expect(res.body.newCharger.lat).toBeCloseTo(52.140888, 6);
  });

  it('returns 409 when no GPS in sensor cache', async () => {
    const sn = 'LFIN_T11B';
    db.prepare(`INSERT OR IGNORE INTO map_calibration (mower_sn, charger_lat, charger_lng) VALUES (?, ?, ?)`)
      .run(sn, 52.14, 6.23);
    const stagingId = await uploadBundle(sn);
    // No cache entry for this SN
    (sensorDataMock.deviceCache as Map<string, Map<string, string>>).delete(sn);

    const res = await request(app)
      .post(`/api/admin-status/maps/${sn}/import-portable/${stagingId}/set-anchor`);
    expect(res.status).toBe(409);
  });

  it('returns 404 for unknown stagingId', async () => {
    const res = await request(app)
      .post(`/api/admin-status/maps/LFIN_T11C/import-portable/nonexistent-id/set-anchor`);
    expect(res.status).toBe(404);
  });
});
