/**
 * Cloud work-records import — pulls historic mowing sessions from the
 * LFI cloud's `queryCutGrassRecordPageByUserId` endpoint into our
 * local `work_records` table.
 *
 * Used by the first-time setup wizard (`/api/setup/cloud-apply`) and
 * the dashboard admin import (`/api/dashboard/admin/import`) so users
 * see their full mowing history in the OpenNova app immediately
 * instead of starting from an empty Records tab.
 *
 * Cloud response shape (verified via `__tests__/contract/regression`
 * fixtures): each pageList row carries `recordId, equipmentId, workTime,
 * dateTime, workArea, workStatus, selectMap, startWay, cutGrassHeight,
 * week, scheduleId`. We forward all of them to messageRepo.
 */
import { v4 as uuidv4 } from 'uuid';
import { callLfiCloud } from './lfiCloud.js';
import { messageRepo } from '../db/repositories/index.js';

interface CloudRecord {
  recordId?: string;
  equipmentId?: string;
  workTime?: number | string;
  dateTime?: string;
  workArea?: number | string;
  workStatus?: string;
  selectMap?: string;
  startWay?: string;
  cutGrassHeight?: number | string;
  week?: string;
  scheduleId?: string;
}

interface ImportResult {
  inserted: number;
  duplicates: number;       // rows skipped because record_id already existed
  pagesFetched: number;
  totalCloud: number;
}

const PAGE_SIZE = 50;
const MAX_PAGES = 40;   // safety cap — stops at 2000 records max

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function toJsonField(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return null; }
}

/**
 * Pull every page of work records for the cloud user and persist them
 * locally. Idempotent in practice — re-running won't dedupe (each
 * insert gets a fresh record_id), but the OpenNova flow only triggers
 * this on first-time setup so duplicates are rare.
 */
export async function importCloudWorkRecords(
  cloudToken: string,
  cloudAppUserId: number | string,
  localUserId: string,
  localEquipmentId: string,
  timezone: string = 'Europe/Amsterdam',
): Promise<ImportResult> {
  let pageNo = 1;
  let inserted = 0;
  let duplicates = 0;
  let pagesFetched = 0;
  let totalCloud = 0;

  while (pageNo <= MAX_PAGES) {
    const resp = await callLfiCloud(
      'POST',
      '/api/novabot-message/message/queryCutGrassRecordPageByUserId',
      { appUserId: cloudAppUserId, pageNo, pageSize: PAGE_SIZE, timezone },
      cloudToken,
    );
    pagesFetched++;
    const value = (resp as Record<string, unknown>).value as
      | { pageList?: CloudRecord[]; totalCount?: number }
      | undefined;
    if (!value) break;

    if (totalCloud === 0 && typeof value.totalCount === 'number') {
      totalCloud = value.totalCount;
    }
    const rows = value.pageList ?? [];
    if (rows.length === 0) break;

    for (const r of rows) {
      // Reuse the cloud-supplied recordId so re-imports dedup against
      // the work_records.record_id UNIQUE constraint. Without one we
      // generate a fresh UUID — risk is duplicates on re-run, but a
      // missing recordId is rare in practice.
      const id = r.recordId ?? uuidv4();
      try {
        messageRepo.createWorkRecordFull(
          id,
          localUserId,
          r.equipmentId ?? localEquipmentId,
          typeof r.dateTime === 'string' ? r.dateTime : null,
          toNum(r.workTime),
          toNum(r.workArea),
          toNum(r.cutGrassHeight),
          toJsonField(r.selectMap),
          typeof r.startWay === 'string' ? r.startWay : null,
          typeof r.workStatus === 'string' ? r.workStatus : null,
          typeof r.scheduleId === 'string' ? r.scheduleId : null,
          toJsonField(r.week),
        );
        inserted++;
      } catch (err) {
        // SQLite UNIQUE-violation on record_id → already imported.
        // Surface as duplicates count so callers can show "X new, Y
        // already had". Anything else is a real failure — log it.
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('UNIQUE') || msg.includes('SQLITE_CONSTRAINT')) {
          duplicates++;
        } else {
          console.warn('[cloud-import:work-records] insert failed:', err);
        }
      }
    }

    // Stop early if we've already pulled everything the cloud claims
    // it has, even if pageList came up short.
    if (totalCloud > 0 && inserted >= totalCloud) break;
    if (rows.length < PAGE_SIZE) break;
    pageNo++;
  }

  console.log(
    `[cloud-import:work-records] imported ${inserted} new records ` +
    `(${duplicates} duplicates skipped, cloud claimed ${totalCloud}, ` +
    `${pagesFetched} pages)`,
  );
  return { inserted, duplicates, pagesFetched, totalCloud };
}
