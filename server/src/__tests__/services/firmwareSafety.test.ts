import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isBetaFirmware, BACKUP_MAX_AGE_MS, BETA_FIRMWARE_WARNING } from '../../services/firmwareSafety.js';

// ── Module-level mocks for ensureBetaFlashSafe tests ─────────────────────────
// ESM named exports are read-only — vi.spyOn cannot redefine them without a
// factory mock. Declare the factories before imports (hoisted by Vitest).
vi.mock('../../services/portableBackup.js', () => ({
  listBackups: vi.fn().mockReturnValue([]),
  createBackup: vi.fn().mockResolvedValue(null),
  ensureInitialBackup: vi.fn().mockResolvedValue(null),
  readBackup: vi.fn().mockReturnValue(null),
  deleteBackup: vi.fn().mockReturnValue(false),
  createBundleFromDb: vi.fn().mockResolvedValue(null),
  createBundleFromCsvFiles: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../db/repositories/maps.js', () => ({
  mapRepo: {
    findAllByMowerSnAndType: vi.fn().mockReturnValue([]),
    create: vi.fn(),
    findById: vi.fn().mockReturnValue(null),
    findAllByMowerSn: vi.fn().mockReturnValue([]),
    delete: vi.fn(),
    setPolygonOffset: vi.fn(),
    getPolygonOffset: vi.fn().mockReturnValue(null),
    getPolygonChargingOrientation: vi.fn().mockReturnValue(null),
    setPolygonChargingOrientation: vi.fn(),
    updateMapArea: vi.fn(),
  },
}));

import * as backup from '../../services/portableBackup.js';
import { mapRepo } from '../../db/repositories/maps.js';
import { ensureBetaFlashSafe, allowBetaFlashOrSnapshot } from '../../services/firmwareSafety.js';

describe('isBetaFirmware', () => {
  it('flags custom builds', () => {
    expect(isBetaFirmware('v6.0.2-custom-36')).toBe(true);
    expect(isBetaFirmware('v6.0.2-opennova-1')).toBe(true);
    expect(isBetaFirmware('V6.0.2-CUSTOM-2')).toBe(true);
  });
  it('does not flag stock builds', () => {
    expect(isBetaFirmware('v6.0.2')).toBe(false);
    expect(isBetaFirmware('v5.7.1')).toBe(false);
    expect(isBetaFirmware('')).toBe(false);
    expect(isBetaFirmware(null)).toBe(false);
    expect(isBetaFirmware(undefined)).toBe(false);
  });
  it('exposes a 24h recency window and the canonical warning copy', () => {
    expect(BACKUP_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
    expect(BETA_FIRMWARE_WARNING).toContain('BETA');
    expect(BETA_FIRMWARE_WARNING).toContain('bricken');
    expect(BETA_FIRMWARE_WARNING).toContain('kaarten');
    expect(BETA_FIRMWARE_WARNING).toContain("risico's");
  });
});

// ── ensureBetaFlashSafe ───────────────────────────────────────────────────────

describe('ensureBetaFlashSafe', () => {
  beforeEach(() => {
    vi.mocked(backup.listBackups).mockReset().mockReturnValue([]);
    vi.mocked(backup.createBundleFromDb).mockReset().mockResolvedValue(null);
    vi.mocked(mapRepo.findAllByMowerSnAndType).mockReset().mockReturnValue([]);
  });

  it('passes through stock firmware without touching backups', async () => {
    const r = await ensureBetaFlashSafe('LFIN2230700238', 'v6.0.2');
    expect(r).toEqual({ allowed: true, backup: null, reason: 'not-beta' });
    expect(backup.createBundleFromDb).not.toHaveBeenCalled();
    expect(backup.listBackups).not.toHaveBeenCalled();
  });

  it('reuses a backup younger than 24h', async () => {
    const recent: import('../../services/portableBackup.js').BackupEntry = {
      filename: 'x.novabotmap', bytes: 10, createdAt: Date.now() - 1000, reason: 'manual',
    };
    vi.mocked(backup.listBackups).mockReturnValue([recent]);
    const r = await ensureBetaFlashSafe('LFIN2230700238', 'v6.0.2-custom-36');
    expect(r.allowed).toBe(true);
    expect((r as any).reason).toBe('recent-backup');
    expect(backup.createBundleFromDb).not.toHaveBeenCalled();
  });

  it('creates a fresh backup when none is recent', async () => {
    vi.mocked(backup.listBackups).mockReturnValue([]);
    const entry: import('../../services/portableBackup.js').BackupEntry = {
      filename: 'new.novabotmap', bytes: 20, createdAt: Date.now(), reason: 'pre-beta-flash',
    };
    vi.mocked(backup.createBundleFromDb).mockResolvedValue(entry);
    const r = await ensureBetaFlashSafe('LFIN2230700238', 'v6.0.2-custom-36');
    expect(r).toEqual({ allowed: true, backup: entry, reason: 'backup-created' });
  });

  it('blocks when maps exist but the backup fails', async () => {
    vi.mocked(backup.listBackups).mockReturnValue([]);
    vi.mocked(backup.createBundleFromDb).mockResolvedValue(null);
    vi.mocked(mapRepo.findAllByMowerSnAndType).mockReturnValue([{ map_area: '[[0,0]]' } as any]);
    const r = await ensureBetaFlashSafe('LFIN2230700238', 'v6.0.2-custom-36');
    expect(r).toEqual({ allowed: false, error: 'BACKUP_FAILED', detail: expect.any(String) });
  });

  it('allows beta flash when there are no maps to lose', async () => {
    vi.mocked(backup.listBackups).mockReturnValue([]);
    vi.mocked(backup.createBundleFromDb).mockResolvedValue(null);
    vi.mocked(mapRepo.findAllByMowerSnAndType).mockReturnValue([]);
    const r = await ensureBetaFlashSafe('LFIN2230700238', 'v6.0.2-custom-36');
    expect(r).toEqual({ allowed: true, backup: null, reason: 'no-maps' });
  });

  it('blocks when bundle build throws and maps exist', async () => {
    vi.mocked(backup.listBackups).mockReturnValue([]);
    vi.mocked(backup.createBundleFromDb).mockRejectedValue(new Error('disk full'));
    vi.mocked(mapRepo.findAllByMowerSnAndType).mockReturnValue([{ map_area: '[[0,0]]' } as any]);
    const r = await ensureBetaFlashSafe('LFIN2230700238', 'v6.0.2-custom-36');
    expect(r).toEqual({ allowed: false, error: 'BACKUP_FAILED', detail: expect.any(String) });
  });

  it('blocks when the DB cannot confirm maps (fail closed)', async () => {
    vi.mocked(backup.listBackups).mockReturnValue([]);
    vi.mocked(backup.createBundleFromDb).mockResolvedValue(null);
    vi.mocked(mapRepo.findAllByMowerSnAndType).mockImplementation(() => { throw new Error('db locked'); });
    const r = await ensureBetaFlashSafe('LFIN2230700238', 'v6.0.2-custom-36');
    expect(r.allowed).toBe(false);
  });
});

// ── allowBetaFlashOrSnapshot ──────────────────────────────────────────────────

describe('allowBetaFlashOrSnapshot', () => {
  beforeEach(() => {
    vi.mocked(backup.listBackups).mockReset().mockReturnValue([]);
    vi.mocked(backup.createBundleFromDb).mockReset().mockResolvedValue(null);
    vi.mocked(mapRepo.findAllByMowerSnAndType).mockReset().mockReturnValue([]);
  });

  it('allows stock firmware', () => {
    expect(allowBetaFlashOrSnapshot('LFIN2230700238', 'v6.0.2')).toBe(true);
    expect(vi.mocked(backup.createBundleFromDb)).not.toHaveBeenCalled();
  });

  it('allows beta when there are no maps', () => {
    vi.mocked(mapRepo.findAllByMowerSnAndType).mockReturnValue([]);
    expect(allowBetaFlashOrSnapshot('LFIN2230700238', 'v6.0.2-custom-36')).toBe(true);
  });

  it('allows beta when a recent backup exists', () => {
    vi.mocked(mapRepo.findAllByMowerSnAndType).mockReturnValue([{ map_area: '[[0,0]]' } as any]);
    vi.mocked(backup.listBackups).mockReturnValue([{ filename: 'r.novabotmap', bytes: 1, createdAt: Date.now() - 1000, reason: 'manual' }]);
    expect(allowBetaFlashOrSnapshot('LFIN2230700238', 'v6.0.2-custom-36')).toBe(true);
  });

  it('denies + snapshots beta when maps exist and no recent backup', () => {
    vi.mocked(mapRepo.findAllByMowerSnAndType).mockReturnValue([{ map_area: '[[0,0]]' } as any]);
    vi.mocked(backup.listBackups).mockReturnValue([]);
    vi.mocked(backup.createBundleFromDb).mockResolvedValue(null);
    expect(allowBetaFlashOrSnapshot('LFIN2230700238', 'v6.0.2-custom-36')).toBe(false);
    expect(vi.mocked(backup.createBundleFromDb)).toHaveBeenCalledWith('LFIN2230700238', 'pre-beta-flash');
  });
});
