import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../db/database.js';
import { importAuditRepo } from '../../db/repositories/importAudit.js';

describe('importAuditRepo', () => {
  beforeEach(() => {
    db.exec('DELETE FROM import_audit');
  });

  it('records and lists audit rows for an SN', () => {
    importAuditRepo.append({
      sn: 'LFIN1', staging_id: 'abc', from_state: 'UPLOADED', to_state: 'ANCHOR_SET', reason: 'rtk fix',
    });
    importAuditRepo.append({
      sn: 'LFIN1', staging_id: 'abc', from_state: 'ANCHOR_SET', to_state: 'DRIVE_REQUESTED', reason: null,
    });
    const rows = importAuditRepo.listForSn('LFIN1');
    expect(rows).toHaveLength(2);
    expect(rows[0].to_state).toBe('DRIVE_REQUESTED');
    expect(rows[1].to_state).toBe('ANCHOR_SET');
  });
});
