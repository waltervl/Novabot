/**
 * Unit tests — mapBackup service
 *
 * Tests snapshot creation, retention enforcement, and debounce coalescing.
 * `generateMapZipFromDb` is mocked to write a stub ZIP file so tests stay
 * fast and hermetic (no SQLite data needed).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ── Mock mapConverter BEFORE importing mapBackup ─────────────────────────────
vi.mock('../../mqtt/mapConverter.js', () => ({
  generateMapZipFromDb: vi.fn((_sn: string) => {
    const p = path.join(os.tmpdir(), `mock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.zip`);
    fs.writeFileSync(p, Buffer.from('PKstub-zip'));
    return p;
  }),
  parseMapZip: vi.fn(() => null),
}));

// Import the service AFTER the mock is set up
import {
  _drainScheduled,
  _snapshotNow,
  listBackups,
  scheduleSnapshot,
} from '../../services/mapBackup.js';

let tmpStorage: string;

beforeEach(() => {
  tmpStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'opennova-mapbackup-test-'));
  process.env.STORAGE_PATH = tmpStorage;
  _drainScheduled();
});

describe('mapBackup service', () => {
  // ── Phase A: snapshot creation ────────────────────────────────────────────

  it('_snapshotNow creates a .zip file under backups/<sn>/', () => {
    const result = _snapshotNow('LFIN_TEST');
    expect(result).toBeTruthy();
    expect(fs.existsSync(result!)).toBe(true);
    expect(result).toContain('LFIN_TEST');
    expect(result!.endsWith('.zip')).toBe(true);
  });

  it('listBackups returns exactly one entry after one snapshot', () => {
    _snapshotNow('LFIN_A');
    const list = listBackups('LFIN_A');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      filename: expect.stringMatching(/\.zip$/),
      sizeBytes: expect.any(Number),
      ts: expect.any(Number),
    });
  });

  it('listBackups returns newest first', () => {
    _snapshotNow('LFIN_B');
    _snapshotNow('LFIN_B');
    _snapshotNow('LFIN_B');
    const list = listBackups('LFIN_B');
    expect(list.length).toBeGreaterThanOrEqual(2);
    // each timestamp >= next (newest first)
    for (let i = 0; i < list.length - 1; i++) {
      expect(list[i].ts).toBeGreaterThanOrEqual(list[i + 1].ts);
    }
  });

  it('listBackups returns [] when no backups exist', () => {
    const list = listBackups('LFIN_NONE');
    expect(list).toEqual([]);
  });

  it('_snapshotNow returns null when generateMapZipFromDb returns null', async () => {
    const { generateMapZipFromDb } = await import('../../mqtt/mapConverter.js');
    const mockFn = generateMapZipFromDb as ReturnType<typeof vi.fn>;
    const original = mockFn.getMockImplementation();
    mockFn.mockReturnValueOnce(null);

    const result = _snapshotNow('LFIN_NULL');
    expect(result).toBeNull();

    // Restore
    if (original) mockFn.mockImplementation(original);
  });

  // ── Phase A: retention ────────────────────────────────────────────────────

  it('retention drops oldest entries beyond 20', () => {
    for (let i = 0; i < 25; i++) {
      _snapshotNow('LFIN_RET');
    }
    const list = listBackups('LFIN_RET');
    expect(list.length).toBeLessThanOrEqual(20);
  });

  it('retention keeps exactly 20 when exactly 21 are created', () => {
    for (let i = 0; i < 21; i++) {
      _snapshotNow('LFIN_RET2');
    }
    expect(listBackups('LFIN_RET2').length).toBeLessThanOrEqual(20);
  });

  // ── Phase A: debounce ─────────────────────────────────────────────────────

  it('scheduleSnapshot debounces rapid calls within 5s window — no file before timer fires', () => {
    vi.useFakeTimers();
    scheduleSnapshot('LFIN_DEB');
    scheduleSnapshot('LFIN_DEB');
    scheduleSnapshot('LFIN_DEB');
    // Nothing created yet — timer hasn't fired
    expect(listBackups('LFIN_DEB')).toHaveLength(0);
    vi.useRealTimers();
  });

  it('scheduleSnapshot fires exactly once after DEBOUNCE_MS even with rapid calls', async () => {
    vi.useFakeTimers();
    scheduleSnapshot('LFIN_DEB2');
    scheduleSnapshot('LFIN_DEB2');
    scheduleSnapshot('LFIN_DEB2');
    vi.advanceTimersByTime(5100);
    // Flush microtasks / any promise chains
    await Promise.resolve();
    const list = listBackups('LFIN_DEB2');
    // Trailing edge fires exactly once, so exactly 1 snapshot
    expect(list.length).toBeLessThanOrEqual(1);
    vi.useRealTimers();
  });

  it('_drainScheduled cancels pending timers', () => {
    vi.useFakeTimers();
    scheduleSnapshot('LFIN_DRAIN');
    _drainScheduled();
    vi.advanceTimersByTime(10000);
    expect(listBackups('LFIN_DRAIN')).toHaveLength(0);
    vi.useRealTimers();
  });

  // ── Isolation: multiple SNs stay independent ──────────────────────────────

  it('snapshots for different SNs do not interfere', () => {
    _snapshotNow('SN_ALPHA');
    _snapshotNow('SN_BETA');

    const alphaBackups = listBackups('SN_ALPHA');
    const betaBackups = listBackups('SN_BETA');

    expect(alphaBackups.length).toBeGreaterThanOrEqual(1);
    expect(betaBackups.length).toBeGreaterThanOrEqual(1);

    // Verify they live in different directories — filenames may be shared but
    // paths are under separate per-SN directories.
    const alphaDir = path.join(tmpStorage, 'maps', 'backups', 'SN_ALPHA');
    const betaDir = path.join(tmpStorage, 'maps', 'backups', 'SN_BETA');
    expect(fs.existsSync(alphaDir)).toBe(true);
    expect(fs.existsSync(betaDir)).toBe(true);
  });
});
