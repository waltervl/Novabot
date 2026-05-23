/**
 * Walker firmware OTA endpoints — public version-check + admin-auth binary
 * download.
 *
 * Tests cover the public LAN endpoint `/api/walker-firmware/latest` which the
 * RTK walker polls on boot / via the Settings tab. The walker has no admin
 * credentials at check-time; only the binary download (admin-auth, separate
 * router) requires the token it stored in NVS during initial provisioning.
 */
import { describe, it, expect } from 'vitest';

import { otaVersionRepo } from '../../db/repositories/otaVersions.js';
import { buildWalkerFirmwareLatestResponse } from '../../routes/walkerFirmware.js';

const signedFields = {
  md5: '0123456789abcdef0123456789abcdef',
  sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  size: 123456,
  signature: 'MEUCIQDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx=',
  signing_key_id: 'walker-p256-2026-01',
};

describe('GET /api/walker-firmware/latest', () => {
  it('returns updateAvailable=true when DB has a newer walker version', async () => {
    otaVersionRepo.create({
      version: '2026.0601.1200',
      device_type: 'walker',
      download_url: 'http://nas/api/dashboard/firmware/walker_firmware_2026.0601.1200.bin',
      release_notes: 'Test release',
      ...signedFields,
    });

    const body = buildWalkerFirmwareLatestResponse('2026.0522.1500', 'http://test-server:3000');

    expect(body.ok).toBe(true);
    expect(body.updateAvailable).toBe(true);
    expect(body.version).toBe('2026.0601.1200');
    expect(body.url).toContain('walker-firmware/binary/walker_firmware_2026.0601.1200.bin');
    expect(body.md5).toBe(signedFields.md5);
    expect(body.sha256).toBe(signedFields.sha256);
    expect(body.size).toBe(signedFields.size);
    expect(body.signature).toBe(signedFields.signature);
    expect(body.keyId).toBe(signedFields.signing_key_id);
    expect(body.releaseNotes).toBe('Test release');
  });

  it('does not offer a newer unsigned walker firmware update', async () => {
    otaVersionRepo.create({
      version: '2026.0601.1200',
      device_type: 'walker',
      download_url: 'http://nas/api/dashboard/firmware/walker_unsigned.bin',
      md5: signedFields.md5,
      release_notes: 'Unsigned release',
    });

    const body = buildWalkerFirmwareLatestResponse('2026.0522.1500', 'http://test-server:3000');

    expect(body.ok).toBe(true);
    expect(body.updateAvailable).toBe(false);
    expect(body.version).toBe('2026.0601.1200');
    expect(body.url).toBe('');
    expect(body.reason).toContain('unsigned');
  });

  it('returns updateAvailable=false when walker is already on the latest version', async () => {
    otaVersionRepo.create({
      version: '2026.0601.1200',
      device_type: 'walker',
      download_url: 'http://nas/api/dashboard/firmware/walker_firmware_2026.0601.1200.bin',
      ...signedFields,
    });

    const body = buildWalkerFirmwareLatestResponse('2026.0601.1200', 'http://test-server:3000');

    expect(body.ok).toBe(true);
    expect(body.updateAvailable).toBe(false);
    expect(body.version).toBe('2026.0601.1200');
  });

  it('returns updateAvailable=false when no walker firmware is registered', async () => {
    // Seed a mower entry so the table is not entirely empty — proves the
    // device_type filter is effective.
    otaVersionRepo.create({
      version: 'v6.0.2-custom-30',
      device_type: 'mower',
      download_url: 'http://nas/api/dashboard/firmware/mower.deb',
    });

    const body = buildWalkerFirmwareLatestResponse('2026.0522.1500', 'http://test-server:3000');

    expect(body.ok).toBe(true);
    expect(body.updateAvailable).toBe(false);
    expect(body.version).toBe('');
    expect(body.url).toBe('');
    expect(body.md5).toBe('');
  });

  it('picks the highest-version walker row when multiple are registered', async () => {
    otaVersionRepo.create({
      version: '2026.0501.1000',
      device_type: 'walker',
      download_url: 'http://nas/api/dashboard/firmware/walker_old.bin',
      ...signedFields,
    });
    otaVersionRepo.create({
      version: '2026.0601.1200',
      device_type: 'walker',
      download_url: 'http://nas/api/dashboard/firmware/walker_new.bin',
      ...signedFields,
    });

    const body = buildWalkerFirmwareLatestResponse('2026.0522.1500', 'http://test-server:3000');

    expect(body.version).toBe('2026.0601.1200');
    expect(body.url).toContain('walker_new.bin');
  });
});
