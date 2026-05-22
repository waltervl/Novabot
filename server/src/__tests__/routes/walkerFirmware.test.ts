/**
 * Walker firmware OTA endpoints — public version-check + admin-auth binary
 * download.
 *
 * Tests cover the public LAN endpoint `/api/walker-firmware/latest` which the
 * RTK walker polls on boot / via the Settings tab. The walker has no admin
 * credentials at check-time; only the binary download (admin-auth, separate
 * router) requires the token it stored in NVS during initial provisioning.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the dashboard router barrel: importing index.ts pulls in all the heavy
// MQTT / Socket.io modules. We only need `getOtaBaseUrl` for our public route
// + the otaVersionRepo wiring. The repository itself talks to the real
// :memory: SQLite from setup.ts.
vi.mock('../../routes/dashboard.js', () => ({
  dashboardRouter: express.Router(),
  initFirmwareSync: vi.fn(),
  getOtaBaseUrl: () => 'http://test-server:3000',
}));

import { otaVersionRepo } from '../../db/repositories/otaVersions.js';

// Build the minimal app that mirrors how index.ts wires the public endpoint.
async function makeApp(): Promise<express.Express> {
  const app = express();
  app.use(express.json());

  app.get('/api/walker-firmware/latest', (req, res) => {
    const currentVersion = String(req.query.currentVersion ?? '');
    const latest = otaVersionRepo.findLatestByDeviceType('walker');
    if (!latest) {
      res.json({ ok: true, updateAvailable: false, version: '', url: '', md5: '' });
      return;
    }
    const updateAvailable = latest.version > currentVersion;
    const filename = (latest.download_url ?? '').split('/').pop() ?? '';
    const baseUrl = 'http://test-server:3000';
    res.json({
      ok: true,
      updateAvailable,
      version: latest.version,
      url: `${baseUrl}/api/admin-status/walker-firmware/binary/${encodeURIComponent(filename)}`,
      md5: latest.md5 ?? '',
      releaseNotes: latest.release_notes ?? '',
    });
  });

  return app;
}

describe('GET /api/walker-firmware/latest', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = await makeApp();
  });

  it('returns updateAvailable=true when DB has a newer walker version', async () => {
    otaVersionRepo.create({
      version: '2026.0601.1200',
      device_type: 'walker',
      download_url: 'http://nas/api/dashboard/firmware/walker_firmware_2026.0601.1200.bin',
      md5: 'deadbeef',
      release_notes: 'Test release',
    });

    const r = await request(app)
      .get('/api/walker-firmware/latest')
      .query({ currentVersion: '2026.0522.1500' });

    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.updateAvailable).toBe(true);
    expect(r.body.version).toBe('2026.0601.1200');
    expect(r.body.url).toContain('walker-firmware/binary/walker_firmware_2026.0601.1200.bin');
    expect(r.body.md5).toBe('deadbeef');
    expect(r.body.releaseNotes).toBe('Test release');
  });

  it('returns updateAvailable=false when walker is already on the latest version', async () => {
    otaVersionRepo.create({
      version: '2026.0601.1200',
      device_type: 'walker',
      download_url: 'http://nas/api/dashboard/firmware/walker_firmware_2026.0601.1200.bin',
      md5: 'deadbeef',
    });

    const r = await request(app)
      .get('/api/walker-firmware/latest')
      .query({ currentVersion: '2026.0601.1200' });

    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.updateAvailable).toBe(false);
    expect(r.body.version).toBe('2026.0601.1200');
  });

  it('returns updateAvailable=false when no walker firmware is registered', async () => {
    // Seed a mower entry so the table is not entirely empty — proves the
    // device_type filter is effective.
    otaVersionRepo.create({
      version: 'v6.0.2-custom-30',
      device_type: 'mower',
      download_url: 'http://nas/api/dashboard/firmware/mower.deb',
    });

    const r = await request(app)
      .get('/api/walker-firmware/latest')
      .query({ currentVersion: '2026.0522.1500' });

    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.updateAvailable).toBe(false);
    expect(r.body.version).toBe('');
    expect(r.body.url).toBe('');
    expect(r.body.md5).toBe('');
  });

  it('picks the highest-version walker row when multiple are registered', async () => {
    otaVersionRepo.create({
      version: '2026.0501.1000',
      device_type: 'walker',
      download_url: 'http://nas/api/dashboard/firmware/walker_old.bin',
    });
    otaVersionRepo.create({
      version: '2026.0601.1200',
      device_type: 'walker',
      download_url: 'http://nas/api/dashboard/firmware/walker_new.bin',
    });

    const r = await request(app)
      .get('/api/walker-firmware/latest')
      .query({ currentVersion: '2026.0522.1500' });

    expect(r.status).toBe(200);
    expect(r.body.version).toBe('2026.0601.1200');
    expect(r.body.url).toContain('walker_new.bin');
  });
});
