/**
 * Map Edits Repository — drafts + version snapshots for map polygon editing.
 */
import { db } from '../database.js';

export interface MapEditDraftRow {
  mower_sn: string;
  canonical_name: string;
  map_id: string | null;
  map_type: string;            // 'work' | 'obstacle'
  parent_map: string | null;
  draft_area: string | null;   // JSON [{x,y}]; null als deleted
  deleted: number;             // 0 | 1
  updated_at: string;
}

export interface MapVersionRow {
  id: number;
  mower_sn: string;
  snapshot: string;            // JSON array van map-rows
  label: string | null;
  created_at: string;
}

export class MapEditsRepository {
  private _upsert = db.prepare(`
    INSERT INTO map_edit_drafts (mower_sn, canonical_name, map_id, map_type, parent_map, draft_area, deleted, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(mower_sn, canonical_name) DO UPDATE SET
      map_id = excluded.map_id, map_type = excluded.map_type, parent_map = excluded.parent_map,
      draft_area = excluded.draft_area, deleted = excluded.deleted, updated_at = datetime('now')
  `);
  private _list = db.prepare('SELECT * FROM map_edit_drafts WHERE mower_sn = ? ORDER BY canonical_name');
  private _delete = db.prepare('DELETE FROM map_edit_drafts WHERE mower_sn = ? AND canonical_name = ?');
  private _clear = db.prepare('DELETE FROM map_edit_drafts WHERE mower_sn = ?');
  private _saveVersion = db.prepare('INSERT INTO map_versions (mower_sn, snapshot, label) VALUES (?, ?, ?)');
  private _latest = db.prepare('SELECT * FROM map_versions WHERE mower_sn = ? ORDER BY id DESC LIMIT 1');
  private _deleteVersion = db.prepare('DELETE FROM map_versions WHERE id = ?');
  private _count = db.prepare('SELECT COUNT(*) AS n FROM map_versions WHERE mower_sn = ?');
  private _prune = db.prepare(`
    DELETE FROM map_versions WHERE mower_sn = ? AND id NOT IN (
      SELECT id FROM map_versions WHERE mower_sn = ? ORDER BY id DESC LIMIT ?
    )
  `);

  upsertDraft(d: Omit<MapEditDraftRow, 'updated_at'>): void {
    this._upsert.run(d.mower_sn, d.canonical_name, d.map_id, d.map_type, d.parent_map, d.draft_area, d.deleted);
  }
  listDrafts(sn: string): MapEditDraftRow[] { return this._list.all(sn) as MapEditDraftRow[]; }
  deleteDraft(sn: string, canonical: string): void { this._delete.run(sn, canonical); }
  clearDrafts(sn: string): void { this._clear.run(sn); }

  saveVersion(sn: string, snapshot: string, label: string | null): void { this._saveVersion.run(sn, snapshot, label); }
  latestVersion(sn: string): MapVersionRow | undefined { return this._latest.get(sn) as MapVersionRow | undefined; }
  deleteVersion(id: number): void { this._deleteVersion.run(id); }
  countVersions(sn: string): number { return (this._count.get(sn) as { n: number }).n; }
  pruneVersions(sn: string, keep: number): void { this._prune.run(sn, sn, keep); }
}

export const mapEditsRepo = new MapEditsRepository();
