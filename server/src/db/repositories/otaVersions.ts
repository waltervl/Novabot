/**
 * OTA Versions Repository — ota_versions operations.
 */
import { db } from '../database.js';

export interface OtaVersionRow {
  id: number;
  version: string;
  device_type: string;
  release_notes: string | null;
  download_url: string | null;
  md5: string | null;
  sha256: string | null;
  signature: string | null;
  size: number | null;
  signing_key_id: string | null;
  created_at: string;
}

export interface CreateOtaVersionData {
  version: string;
  device_type: string;
  download_url?: string | null;
  release_notes?: string | null;
  md5?: string | null;
  sha256?: string | null;
  signature?: string | null;
  size?: number | null;
  signing_key_id?: string | null;
}

export interface UpdateOtaVersionData {
  version?: string | null;
  device_type?: string | null;
  download_url?: string | null;
  release_notes?: string | null;
  md5?: string | null;
  sha256?: string | null;
  signature?: string | null;
  size?: number | null;
  signing_key_id?: string | null;
}

export class OtaVersionRepository {
  private _listAll = db.prepare('SELECT * FROM ota_versions ORDER BY id DESC');
  private _findById = db.prepare('SELECT * FROM ota_versions WHERE id = ?');
  private _findByDownloadUrlLike = db.prepare('SELECT * FROM ota_versions WHERE download_url LIKE ?');
  private _findLatestByDeviceType = db.prepare(
    `SELECT * FROM ota_versions WHERE device_type = ? ORDER BY version DESC LIMIT 1`,
  );
  private _create = db.prepare(`
    INSERT INTO ota_versions (
      version, device_type, download_url, release_notes, md5,
      sha256, signature, size, signing_key_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  private _deleteById = db.prepare('DELETE FROM ota_versions WHERE id = ?');

  listAll(): OtaVersionRow[] {
    return this._listAll.all() as OtaVersionRow[];
  }

  findById(id: number): OtaVersionRow | undefined {
    return this._findById.get(id) as OtaVersionRow | undefined;
  }

  findByDownloadUrlLike(pattern: string): OtaVersionRow[] {
    return this._findByDownloadUrlLike.all(pattern) as OtaVersionRow[];
  }

  /**
   * Returns the row with the highest `version` for a given `device_type`, or
   * undefined if none exist. Uses lexicographic ordering — correct for the
   * walker's `YYYY.MMDD.HHMM` date-based version strings.
   */
  findLatestByDeviceType(deviceType: string): OtaVersionRow | undefined {
    return this._findLatestByDeviceType.get(deviceType) as OtaVersionRow | undefined;
  }

  create(data: CreateOtaVersionData): number {
    return Number(this._create.run(
      data.version,
      data.device_type,
      data.download_url ?? null,
      data.release_notes ?? null,
      data.md5 ?? null,
      data.sha256 ?? null,
      data.signature ?? null,
      data.size ?? null,
      data.signing_key_id ?? null,
    ).lastInsertRowid);
  }

  updateById(id: number, data: UpdateOtaVersionData): void {
    const fields: string[] = [];
    const values: unknown[] = [];
    const updatable: Array<[keyof UpdateOtaVersionData, unknown]> = [
      ['version', data.version],
      ['device_type', data.device_type],
      ['download_url', data.download_url],
      ['release_notes', data.release_notes],
      ['md5', data.md5],
      ['sha256', data.sha256],
      ['signature', data.signature],
      ['size', data.size],
      ['signing_key_id', data.signing_key_id],
    ];

    for (const [key, value] of updatable) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return;

    values.push(id);
    db.prepare(`UPDATE ota_versions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  deleteById(id: number): void {
    this._deleteById.run(id);
  }
}

export const otaVersionRepo = new OtaVersionRepository();
