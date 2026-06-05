import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../services/lfiCloud.js', () => ({
  callLfiCloud: vi.fn(),
  encryptCloudPassword: vi.fn(() => 'encrypted-password'),
  makeLfiHeaders: vi.fn(() => ({})),
  LFI_CLOUD_HOST: 'app.lfibot.com',
  LFI_CLOUD_SERVERNAME: 'app.lfibot.com',
}));

vi.mock('../../services/cloudWorkRecordsImport.js', () => ({
  importCloudWorkRecords: vi.fn().mockResolvedValue({ inserted: 0, skipped: 0 }),
}));

vi.mock('../../services/portableBackup.js', () => ({
  createBundleFromDb: vi.fn().mockResolvedValue(null),
}));

import { setupRouter } from '../../routes/setup.js';
import { mapRepo } from '../../db/repositories/index.js';
import { callLfiCloud } from '../../services/lfiCloud.js';

const app = express();
app.use(express.json());
app.use('/api/setup', setupRouter);

describe('POST /cloud-apply map import', () => {
  beforeEach(() => {
    vi.mocked(callLfiCloud).mockImplementation(async (_method: string, route: string) => {
      if (route.includes('/api/nova-user/appUser/login')) {
        return {
          success: true,
          value: { accessToken: 'cloud-token', appUserId: 123 },
        };
      }
      if (route.includes('/api/nova-file-server/map/queryEquipmentMap')) {
        return {
          success: true,
          value: {
            data: {
              work: [],
              unicom: [{
                fileName: 'map0tomap1_0_unicom.csv',
                alias: 'map0tomap1_0_unicom',
                type: 'unicom',
              }],
            },
            md5: '0123456789ABCDEF0123456789ABCDEF',
            machineExtendedField: null,
          },
        };
      }
      return { success: true, value: {} };
    });
  });

  it('preserves no-URL inter-map unicom rows from the LFI cloud response', async () => {
    const res = await request(app)
      .post('/api/setup/cloud-apply')
      .send({
        email: 'setup@example.com',
        password: 'secret',
        deviceName: 'Test mower',
        mower: { sn: 'LFIN_SETUP_UNICOM', version: '5.7.1' },
        charger: { sn: 'LFIC_SETUP_UNICOM', address: 718, channel: 16 },
      });

    expect(res.status).toBe(200);
    expect(res.body.mapsImported).toBe(1);
    const rows = mapRepo.findAllByMowerSnAndType('LFIN_SETUP_UNICOM', 'unicom');
    expect(rows).toHaveLength(1);
    expect(rows[0].file_name).toBe('map0tomap1_0_unicom.csv');
    expect(rows[0].canonical_name).toBe('map0tomap1_0_unicom');
    expect(rows[0].map_area).toBeNull();
  });
});
