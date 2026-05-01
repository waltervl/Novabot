// server/src/__tests__/routes/appUpdate.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';

import { appUpdateRouter, setManifestDir } from '../../routes/appUpdate.js';

const TMP = path.resolve('/tmp/opennova-app-endpoint-test');

beforeEach(() => {
  fs.mkdirSync(TMP, { recursive: true });
  setManifestDir(TMP);
});
afterEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

function makeApp() {
  const app = express();
  app.use('/api/app', appUpdateRouter);
  return app;
}

describe('GET /api/app/latest', () => {
  it('returns 200 with shape when manifest exists', async () => {
    const m = {
      version: '1.2.0',
      platform: 'android',
      apkFileName: 'opennova-v1.2.0.apk',
      sha256: 'a'.repeat(64),
      sizeBytes: 1024,
      releaseNotes: 'fixes',
      minSupportedServerVersion: '2026.0501.2158',
      releasedAt: '2026-05-01T20:00:00Z',
    };
    fs.writeFileSync(path.join(TMP, 'manifest.json'), JSON.stringify(m));
    const r = await request(makeApp()).get('/api/app/latest');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      version: '1.2.0',
      platform: 'android',
      sha256: m.sha256,
      sizeBytes: 1024,
      releaseNotes: 'fixes',
      minSupportedServerVersion: '2026.0501.2158',
      releasedAt: '2026-05-01T20:00:00Z',
    });
    expect(r.body.apkUrl).toContain('/firmware/app/opennova-v1.2.0.apk');
  });

  it('returns 204 when no release is published (empty apkFileName)', async () => {
    fs.writeFileSync(path.join(TMP, 'manifest.json'), JSON.stringify({
      version: '0.0.0', platform: 'android', apkFileName: '',
      sha256: '', sizeBytes: 0, releaseNotes: 'none',
      minSupportedServerVersion: '0.0.0', releasedAt: '1970-01-01T00:00:00Z',
    }));
    const r = await request(makeApp()).get('/api/app/latest');
    expect(r.status).toBe(204);
  });

  it('returns 404 when manifest is missing entirely', async () => {
    const r = await request(makeApp()).get('/api/app/latest');
    expect(r.status).toBe(404);
  });
});
