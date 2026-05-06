import { db } from '../database.js';

export interface AuditRow {
  id: number;
  sn: string;
  staging_id: string;
  from_state: string;
  to_state: string;
  reason: string | null;
  ts: number;
}

class ImportAuditRepo {
  private _insert = db.prepare(
    `INSERT INTO import_audit (sn, staging_id, from_state, to_state, reason) VALUES (?, ?, ?, ?, ?)`,
  );
  private _list = db.prepare(
    `SELECT * FROM import_audit WHERE sn = ? ORDER BY ts DESC, id DESC`,
  );

  append(input: { sn: string; staging_id: string; from_state: string; to_state: string; reason: string | null }): void {
    this._insert.run(input.sn, input.staging_id, input.from_state, input.to_state, input.reason);
  }

  listForSn(sn: string): AuditRow[] {
    return this._list.all(sn) as AuditRow[];
  }
}

export const importAuditRepo = new ImportAuditRepo();
