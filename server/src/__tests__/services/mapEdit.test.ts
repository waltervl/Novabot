/**
 * Tests for mapEdit service — geometry, drafts, apply, revert.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de maaier-kant VOOR de service-import (apply/revert gebruiken dit in Task 7)
vi.mock('../../services/portableBackup.js', () => ({
  createBundleFromDb: vi.fn(async () => ({ filename: 'test.novabotmap', bytes: 1, createdAt: 0, reason: 'map_edit' })),
}));
vi.mock('../../mqtt/mapSync.js', () => ({
  pushMapToMowerVerbatim: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../mqtt/broker.js', () => ({
  isDeviceOnline: vi.fn(() => true),
}));

import { mapRepo, mapEditsRepo } from '../../db/repositories/index.js';
import { getEditGeometry, saveDraft, discardDrafts, applyEdits, revertEdits } from '../../services/mapEdit.js';
import { createBundleFromDb } from '../../services/portableBackup.js';
import { pushMapToMowerVerbatim } from '../../mqtt/mapSync.js';
import { isDeviceOnline } from '../../mqtt/broker.js';
import { deviceCache } from '../../mqtt/sensorData.js';

const sn = 'LFIN0001';
const square = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];
const obst = [{ x: 5, y: 5 }, { x: 8, y: 5 }, { x: 8, y: 8 }, { x: 5, y: 8 }];

function seedMaps() {
  mapRepo.create({ map_id: 'w0', mower_sn: sn, map_name: 'Voortuin', map_type: 'work',
    file_name: 'map0_work.csv', map_area: JSON.stringify(square) });
  mapRepo.create({ map_id: 'o0', mower_sn: sn, map_type: 'obstacle',
    file_name: 'map0_0_obstacle.csv', map_area: JSON.stringify(obst) });
}

describe('mapEdit service: geometry + drafts', () => {
  beforeEach(seedMaps);

  it('getEditGeometry: levert maps met canonical, type en punten', () => {
    const g = getEditGeometry(sn);
    expect(g.maps.length).toBe(2);
    const work = g.maps.find(m => m.canonical === 'map0')!;
    expect(work.mapType).toBe('work');
    expect(work.points.length).toBeGreaterThanOrEqual(3);
    expect(work.draft).toBeNull();
    expect(g.hasVersions).toBe(false);
    expect(g.pendingSync).toBe(false);
  });

  it('saveDraft: bestaande polygon → draft opgeslagen en zichtbaar in geometry', () => {
    const moved = square.map(p => (p.x === 20 ? { x: 20.5, y: p.y } : p));
    const res = saveDraft(sn, { canonical: 'map0', points: moved });
    expect(res.ok).toBe(true);
    const g = getEditGeometry(sn);
    expect(g.maps.find(m => m.canonical === 'map0')!.draft?.points[1].x).toBeCloseTo(20.5, 6);
  });

  it('saveDraft: nieuw obstacle krijgt volgend vrij slot', () => {
    const res = saveDraft(sn, { mapType: 'obstacle', parentMap: 'map0',
      points: [{ x: 10, y: 10 }, { x: 12, y: 10 }, { x: 12, y: 12 }, { x: 10, y: 12 }] });
    expect(res.ok).toBe(true);
    expect(res.canonical).toBe('map0_1_obstacle');     // map0_0_obstacle bestaat al
  });

  it('saveDraft: delete-markering voor obstacle', () => {
    const res = saveDraft(sn, { canonical: 'map0_0_obstacle', deleted: true });
    expect(res.ok).toBe(true);
    const g = getEditGeometry(sn);
    expect(g.maps.find(m => m.canonical === 'map0_0_obstacle')!.draft?.deleted).toBe(true);
  });

  it('saveDraft: weigert delete van work-map en kapotte polygon', () => {
    expect(saveDraft(sn, { canonical: 'map0', deleted: true }).ok).toBe(false);
    expect(saveDraft(sn, { canonical: 'map0', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }).ok).toBe(false);
  });

  it('discardDrafts: alles weg', () => {
    saveDraft(sn, { canonical: 'map0_0_obstacle', deleted: true });
    discardDrafts(sn);
    expect(mapEditsRepo.listDrafts(sn).length).toBe(0);
  });
});

describe('mapEdit service: apply + revert', () => {
  beforeEach(() => {
    seedMaps();
    vi.mocked(isDeviceOnline).mockReturnValue(true);
    vi.mocked(pushMapToMowerVerbatim).mockResolvedValue({ ok: true });
    vi.mocked(pushMapToMowerVerbatim).mockClear();
    vi.mocked(createBundleFromDb).mockClear();
    deviceCache.delete(sn);
    // device_settings table is wiped by global setup beforeEach — no cleanup needed here
  });

  it('apply: happy path — DB bijgewerkt, snapshot gemaakt, push gedaan, drafts weg', async () => {
    const moved = square.map(p => (p.x === 20 ? { x: 20.5, y: p.y } : p));
    saveDraft(sn, { canonical: 'map0', points: moved });
    const res = await applyEdits(sn);
    expect(res.ok).toBe(true);
    expect(JSON.parse(mapRepo.findBySnAndCanonical(sn, 'map0')!.map_area!)[1].x).toBeCloseTo(20.5, 6);
    expect(mapEditsRepo.latestVersion(sn)).toBeTruthy();
    expect(mapEditsRepo.listDrafts(sn).length).toBe(0);
    expect(vi.mocked(createBundleFromDb)).toHaveBeenCalledWith(sn, 'map_edit');
    expect(vi.mocked(pushMapToMowerVerbatim)).toHaveBeenCalledWith(sn, 'test.novabotmap');
  });

  it('apply: nieuw obstacle → maps-rij aangemaakt; delete → rij weg', async () => {
    saveDraft(sn, { mapType: 'obstacle', parentMap: 'map0',
      points: [{ x: 10, y: 10 }, { x: 12, y: 10 }, { x: 12, y: 12 }, { x: 10, y: 12 }] });
    saveDraft(sn, { canonical: 'map0_0_obstacle', deleted: true });
    const res = await applyEdits(sn);
    expect(res.ok).toBe(true);
    expect(mapRepo.findBySnAndCanonical(sn, 'map0_1_obstacle')).toBeTruthy();
    expect(mapRepo.findBySnAndCanonical(sn, 'map0_0_obstacle')).toBeUndefined();
  });

  it('apply: validatiefout → niets gemuteerd', async () => {
    saveDraft(sn, { canonical: 'map0_0_obstacle',
      points: [{ x: 18, y: 18 }, { x: 25, y: 18 }, { x: 25, y: 25 }, { x: 18, y: 25 }] }); // buiten work
    const res = await applyEdits(sn);
    expect(res.ok).toBe(false);
    expect(res.validation?.errors.some(e => e.code === 'outside_work')).toBe(true);
    expect(mapEditsRepo.listDrafts(sn).length).toBe(1);          // drafts blijven
    expect(vi.mocked(pushMapToMowerVerbatim)).not.toHaveBeenCalled();
  });

  it('apply: maaier offline → geweigerd zonder mutatie', async () => {
    vi.mocked(isDeviceOnline).mockReturnValue(false);
    saveDraft(sn, { canonical: 'map0_0_obstacle', deleted: true });
    const res = await applyEdits(sn);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('offline');
  });

  it('apply: maaier maait → geweigerd', async () => {
    deviceCache.set(sn, new Map([['msg', 'Mode:COVERAGE Work:RUNNING']]));
    saveDraft(sn, { canonical: 'map0_0_obstacle', deleted: true });
    const res = await applyEdits(sn);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('busy');
  });

  it('apply: push faalt → pendingSync gezet; retry zonder drafts pusht opnieuw', async () => {
    vi.mocked(pushMapToMowerVerbatim).mockResolvedValueOnce({ ok: false, offline: true });
    saveDraft(sn, { canonical: 'map0_0_obstacle', deleted: true });
    const r1 = await applyEdits(sn);
    expect(r1.ok).toBe(false);
    expect(r1.reason).toBe('push_failed');
    expect(getEditGeometry(sn).pendingSync).toBe(true);
    const r2 = await applyEdits(sn);
    expect(r2.ok).toBe(true);
    expect(getEditGeometry(sn).pendingSync).toBe(false);
  });

  it('revert: zet snapshot terug en pusht', async () => {
    const orig = mapRepo.findBySnAndCanonical(sn, 'map0')!.map_area;
    saveDraft(sn, { canonical: 'map0', points: square.map(p => (p.x === 20 ? { x: 22, y: p.y } : p)) });
    await applyEdits(sn);
    const res = await revertEdits(sn);
    expect(res.ok).toBe(true);
    expect(mapRepo.findBySnAndCanonical(sn, 'map0')!.map_area).toBe(orig);
    expect(mapEditsRepo.latestVersion(sn)).toBeUndefined();      // versie verbruikt
  });
});
