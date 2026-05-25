/**
 * Walker Bundle Repository — `walker_bundles` operations.
 *
 * The walker bundle library is SN-agnostic: the RTK walker uploads a
 * `.novabundle` once, the operator picks a target mower later through
 * the admin UI. Storage lives on disk (WALKER_BUNDLES_PATH); the DB row
 * is metadata only — counts, bounds, walker id and the last assignment.
 */
import { db } from '../database.js';

export interface WalkerBundleRow {
  id: number;
  filename: string;
  uploaded_at: string;
  walker_id: string | null;
  size_bytes: number | null;
  polygon_count: number;
  obstacle_count: number;
  unicom_count: number;
  bounds_min_x: number | null;
  bounds_max_x: number | null;
  bounds_min_y: number | null;
  bounds_max_y: number | null;
  last_assigned_sn: string | null;
  last_assigned_at: string | null;
}

export interface CreateWalkerBundleData {
  filename: string;
  uploaded_at: string;
  walker_id?: string | null;
  size_bytes?: number | null;
  polygon_count?: number;
  obstacle_count?: number;
  unicom_count?: number;
  bounds_min_x?: number | null;
  bounds_max_x?: number | null;
  bounds_min_y?: number | null;
  bounds_max_y?: number | null;
}

export class WalkerBundleRepository {
  private _listAll = db.prepare('SELECT * FROM walker_bundles ORDER BY uploaded_at DESC, id DESC');
  private _findById = db.prepare('SELECT * FROM walker_bundles WHERE id = ?');
  private _findByFilename = db.prepare('SELECT * FROM walker_bundles WHERE filename = ?');
  private _deleteById = db.prepare('DELETE FROM walker_bundles WHERE id = ?');
  private _markAssigned = db.prepare(
    'UPDATE walker_bundles SET last_assigned_sn = ?, last_assigned_at = ? WHERE id = ?',
  );
  private _create = db.prepare(`
    INSERT INTO walker_bundles
      (filename, uploaded_at, walker_id, size_bytes,
       polygon_count, obstacle_count, unicom_count,
       bounds_min_x, bounds_max_x, bounds_min_y, bounds_max_y)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  listAll(): WalkerBundleRow[] {
    return this._listAll.all() as WalkerBundleRow[];
  }

  findById(id: number): WalkerBundleRow | undefined {
    return this._findById.get(id) as WalkerBundleRow | undefined;
  }

  findByFilename(filename: string): WalkerBundleRow | undefined {
    return this._findByFilename.get(filename) as WalkerBundleRow | undefined;
  }

  create(data: CreateWalkerBundleData): number {
    const info = this._create.run(
      data.filename,
      data.uploaded_at,
      data.walker_id ?? null,
      data.size_bytes ?? null,
      data.polygon_count ?? 0,
      data.obstacle_count ?? 0,
      data.unicom_count ?? 0,
      data.bounds_min_x ?? null,
      data.bounds_max_x ?? null,
      data.bounds_min_y ?? null,
      data.bounds_max_y ?? null,
    );
    return Number(info.lastInsertRowid);
  }

  delete(id: number): boolean {
    return this._deleteById.run(id).changes > 0;
  }

  markAssigned(id: number, sn: string, at: string): void {
    this._markAssigned.run(sn, at, id);
  }
}

export const walkerBundleRepo = new WalkerBundleRepository();
