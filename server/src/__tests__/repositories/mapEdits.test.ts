import { describe, it, expect } from 'vitest';
import { db } from '../../db/database.js';
import { mapEditsRepo } from '../../db/repositories/index.js';

describe('map edit tables', () => {
  it('map_edit_drafts and map_versions exist', () => {
    const names = (db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('map_edit_drafts','map_versions')"
    ).all() as { name: string }[]).map(r => r.name).sort();
    expect(names).toEqual(['map_edit_drafts', 'map_versions']);
  });
});

describe('MapEditsRepository', () => {
  const sn = 'LFIN0001';
  const pts = JSON.stringify([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }]);

  it('upserts and lists drafts', () => {
    mapEditsRepo.upsertDraft({ mower_sn: sn, canonical_name: 'map0', map_id: 'm0', map_type: 'work', parent_map: null, draft_area: pts, deleted: 0 });
    mapEditsRepo.upsertDraft({ mower_sn: sn, canonical_name: 'map0', map_id: 'm0', map_type: 'work', parent_map: null, draft_area: pts, deleted: 0 });
    const drafts = mapEditsRepo.listDrafts(sn);
    expect(drafts.length).toBe(1);
    expect(drafts[0].canonical_name).toBe('map0');
  });

  it('deleteDraft removes one, clearDrafts removes all', () => {
    mapEditsRepo.upsertDraft({ mower_sn: sn, canonical_name: 'map0', map_id: 'm0', map_type: 'work', parent_map: null, draft_area: pts, deleted: 0 });
    mapEditsRepo.upsertDraft({ mower_sn: sn, canonical_name: 'map0_0_obstacle', map_id: null, map_type: 'obstacle', parent_map: 'map0', draft_area: pts, deleted: 0 });
    mapEditsRepo.deleteDraft(sn, 'map0');
    expect(mapEditsRepo.listDrafts(sn).length).toBe(1);
    mapEditsRepo.clearDrafts(sn);
    expect(mapEditsRepo.listDrafts(sn).length).toBe(0);
  });

  it('saves and reads back latest version snapshot', () => {
    mapEditsRepo.saveVersion(sn, '[{"map_id":"a"}]', 'voor-edit');
    mapEditsRepo.saveVersion(sn, '[{"map_id":"b"}]', 'voor-edit-2');
    const latest = mapEditsRepo.latestVersion(sn);
    expect(latest?.snapshot).toBe('[{"map_id":"b"}]');
    mapEditsRepo.deleteVersion(latest!.id);
    expect(mapEditsRepo.latestVersion(sn)?.snapshot).toBe('[{"map_id":"a"}]');
  });

  it('prunes versions beyond keep-count', () => {
    for (let i = 0; i < 12; i++) mapEditsRepo.saveVersion(sn, `[${i}]`, `v${i}`);
    mapEditsRepo.pruneVersions(sn, 10);
    expect(mapEditsRepo.countVersions(sn)).toBe(10);
    expect(mapEditsRepo.latestVersion(sn)?.snapshot).toBe('[11]');
  });

  it('upsert UPDATE path: replaces draft_area on second upsert same key', () => {
    const oldArea = JSON.stringify([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }]);
    const newArea = JSON.stringify([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }]);
    mapEditsRepo.upsertDraft({ mower_sn: sn, canonical_name: 'map0', map_id: 'm0', map_type: 'work', parent_map: null, draft_area: oldArea, deleted: 0 });
    mapEditsRepo.upsertDraft({ mower_sn: sn, canonical_name: 'map0', map_id: 'm0', map_type: 'work', parent_map: null, draft_area: newArea, deleted: 0 });
    const drafts = mapEditsRepo.listDrafts(sn);
    expect(drafts.length).toBe(1);
    expect(drafts[0].draft_area).toBe(newArea);
  });

  it('tombstone: upsert with deleted=1 and draft_area=null', () => {
    mapEditsRepo.upsertDraft({ mower_sn: sn, canonical_name: 'map0', map_id: 'm0', map_type: 'work', parent_map: null, draft_area: null, deleted: 1 });
    const drafts = mapEditsRepo.listDrafts(sn);
    const tombstone = drafts.find(d => d.canonical_name === 'map0');
    expect(tombstone).toBeDefined();
    expect(tombstone!.deleted).toBe(1);
    expect(tombstone!.draft_area).toBeNull();
  });

  it('pruneVersions cross-SN isolation: prune one SN leaves other untouched', () => {
    const sn1 = 'LFIN0001';
    const sn2 = 'LFINOTHER';
    for (let i = 0; i < 3; i++) mapEditsRepo.saveVersion(sn1, `[${i}]`, `v${i}`);
    for (let i = 0; i < 2; i++) mapEditsRepo.saveVersion(sn2, `[${i}]`, `v${i}`);
    mapEditsRepo.pruneVersions(sn1, 1);
    expect(mapEditsRepo.countVersions(sn1)).toBe(1);
    expect(mapEditsRepo.countVersions(sn2)).toBe(2);
  });
});
