import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { equipmentRepo, messageRepo } from '../../db/repositories/index.js';
import { deviceCache, getMowingSession, clearMowingSession } from '../../mqtt/sensorData.js';
import { ok } from '../../types/index.js';

export const equipmentStateRouter = Router();

// Mower POSTs work records as multipart/form-data — Express's bodyParser
// only handles JSON / urlencoded, so the request body lands empty without
// this middleware. multer.none() parses text fields without storing files
// (mower never attaches one).
const upload = multer();

// POST /api/nova-data/equipmentState/saveCutGrassRecord
//
// De maaier stuurt werkrecords na afloop van een maaisessie.
// Geen JWT auth — maaier identificeert zichzelf via sn in body.
// Velden (uit firmware strings): dateTime, workTime, workArea, cutGrassHeight,
// mapNames, startWay, workStatus, scheduleId, week, sn
// multipart fields arrive as strings — coerce to number where the schema
// expects one, leaving null when absent or unparseable.
function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

// mapNames + week may arrive as JSON-encoded strings (multipart) or as
// arrays (JSON body). Always store the JSON representation.
function toJsonField(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return null; }
}

equipmentStateRouter.post('/saveCutGrassRecord', upload.none(), (req: Request, res: Response) => {
  const srcIp = req.ip || req.socket.remoteAddress || '?';
  const body = req.body as Record<string, unknown>;
  const sn = typeof body.sn === 'string' ? body.sn : undefined;

  // Log every incoming key so we can spot field-name mismatches
  // between what the mower posts and what our handler reads. Live
  // capture 2026-04-28 showed an inserted row with sn populated but
  // every other field NULL — implying the mower sends fields under
  // names we don't recognise. Trace gives us ground truth without
  // needing wireshark.
  const keys = Object.keys(body);
  console.log(`[STATE] saveCutGrassRecord raw body keys: ${keys.join(',') || '∅'}`);
  for (const k of keys) {
    const v = body[k];
    const preview = typeof v === 'string' ? v.slice(0, 80) : JSON.stringify(v).slice(0, 80);
    console.log(`[STATE]   ${k} (${typeof v}) = ${preview}`);
  }

  if (!sn) {
    console.log(`[STATE] saveCutGrassRecord: lege body van ${srcIp}`);
    res.json(ok(null));
    return;
  }

  // Accept multiple naming variants — different mower firmware revisions
  // (and potentially the stock app's POSTs) send the same field under
  // slightly different keys. Try camelCase first, then snake_case, then
  // a few abbreviations.
  function pickStr(...keys: string[]): string | null {
    for (const k of keys) {
      const v = body[k];
      if (typeof v === 'string' && v.trim() !== '') return v;
    }
    return null;
  }
  function pickNum(...keys: string[]): number | null {
    for (const k of keys) {
      const v = body[k];
      const n = toNum(v);
      if (n !== null) return n;
    }
    return null;
  }
  function pickJson(...keys: string[]): string | null {
    for (const k of keys) {
      const v = body[k];
      const j = toJsonField(v);
      if (j) return j;
    }
    return null;
  }

  // Convert the timestamp into the server-local wall clock (TZ env var,
  // defaulting to Europe/Amsterdam) and format as SQL-style
  // "YYYY-MM-DD HH:MM:SS". The stock Novabot app renders dateTime
  // verbatim — no Date parsing — so we have to pre-format it in the
  // operator's locale or it shows the raw UTC string.
  //
  // Round history:
  //   1. Stripped 'Z' but kept UTC value → app showed UTC verbatim, 2h
  //      early in CEST (waltervl).
  //   2. Returned ISO+Z → stock app showed "2026-05-04T21:19:19Z" verbatim
  //      which is uglier and still UTC.
  //   3. (current) Convert to TZ via Intl.DateTimeFormat → SQL form in
  //      local wall clock, both stock + dashboard render correctly. The
  //      OpenNova app uses toLocaleString itself and is timezone-agnostic.
  const SERVER_TZ = process.env.TZ || 'Europe/Amsterdam';
  function normaliseDateTime(raw: string): string {
    try {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return raw;
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: SERVER_TZ,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      }).formatToParts(d).reduce<Record<string, string>>((acc, p) => {
        if (p.type !== 'literal') acc[p.type] = p.value;
        return acc;
      }, {});
      // Intl en-CA: YYYY-MM-DD by default; hour 24h. Re-assemble manually
      // so the format is identical regardless of CLDR future tweaks.
      const hh = parts.hour === '24' ? '00' : parts.hour;
      return `${parts.year}-${parts.month}-${parts.day} ${hh}:${parts.minute}:${parts.second}`;
    } catch {
      return raw;
    }
  }

  const rawDateTime = pickStr('dateTime', 'date_time', 'startTime', 'time')
    ?? new Date().toISOString();
  const dateTime = normaliseDateTime(rawDateTime);
  let workTime = pickNum('workTime', 'work_time', 'duration');
  let workArea = pickNum('workArea', 'work_area', 'area', 'mowedArea');
  let cutGrassHeight = pickNum('cutGrassHeight', 'cut_grass_height', 'cuttingHeight', 'cutterHeight', 'cutterhigh');
  let mapNames = pickJson('mapNames', 'map_names', 'selectMap', 'selectedMap', 'mapName');
  let startWay = pickStr('startWay', 'start_way', 'source', 'sourceApp');
  let workStatus = pickStr('workStatus', 'work_status', 'status', 'finishStatus');
  const scheduleId = pickStr('scheduleId', 'schedule_id');
  const week = pickJson('week', 'weekArray', 'weekDay');

  // Fallback to live sensor cache when the mower's POST omitted the
  // detail fields (observed on interrupted sessions where the
  // firmware posts only sn + dateTime). Better an approximation
  // pulled from the last known mower state than an empty row.
  const cache = deviceCache.get(sn);
  if (cache) {
    if (cutGrassHeight === null) {
      // Store the wire enum value (cutterhigh, 0-7) — same value the mower
      // sends directly in its POST body and same value stored by LFI cloud.
      // The app and dashboard display (wire + 2) cm. Do NOT add 2 here.
      const wire = parseInt(cache.get('target_height') ?? '', 10);
      if (Number.isFinite(wire)) cutGrassHeight = wire;
    }
    if (workArea === null) {
      const a = parseFloat(cache.get('cov_area') ?? '');
      if (Number.isFinite(a)) workArea = a;
    }
    if (workTime === null || workTime === 0) {
      // valid_cov_work_time is already in minutes; cov_work_time is in seconds.
      // Try the minutes field first, fall back to seconds ÷ 60.
      const tMin = parseFloat(cache.get('valid_cov_work_time') ?? '');
      if (Number.isFinite(tMin) && tMin > 0) {
        workTime = tMin;
      } else {
        const tSec = parseFloat(cache.get('cov_work_time') ?? '');
        if (Number.isFinite(tSec) && tSec > 0) workTime = Math.round(tSec / 60);
      }
    }
    // Issue #17 round 3: stock v5.7.1 firmware ships saveCutGrassRecord
    // with workTime=0 and resets cov_work_time / valid_cov_work_time
    // before the POST is built — both fallbacks above end up at 0 even
    // though the mower actually ran for many minutes. Compute the session
    // length server-side from the work_status timer maintained by
    // sensorData.processSensors instead.
    if (workTime === null || workTime === 0) {
      const session = getMowingSession(sn);
      if (session && session.lastActiveAt > session.startedAt) {
        const elapsedMin = Math.round((session.lastActiveAt - session.startedAt) / 60000);
        if (elapsedMin > 0) workTime = elapsedMin;
      }
    }
    if (mapNames === null) {
      const id = cache.get('current_map_ids') ?? cache.get('cover_map_id');
      if (id) mapNames = JSON.stringify([`map${id}`]);
    }
    if (workStatus === null) {
      const msg = cache.get('msg') ?? '';
      const errorStatus = cache.get('error_status') ?? '0';
      const covRatio = parseFloat(cache.get('cov_ratio') ?? '0');
      const finishedNum = parseInt(cache.get('finished_num') ?? '0', 10);
      // Issue #17 (waltervl): completed sessions were tagged "interrupted
      // artificially" because the mower's `msg` after a normal end is
      // "Mode:COVERAGE Work:CANCELLED Prev work:USER_RECHARGE_STOP
      // Recharge: FINISHED" — Work:FINISHED isn't always present in the
      // current msg, the actual completion signal lives in Prev work or
      // in cov_ratio approaching 1. Order matters: check finished
      // signals BEFORE the "anything else with a msg" fallback.
      // Issue #17 round 2 (waltervl, May 2026): Walter ran a normal
      // multi-map session that finished cleanly + docked, yet was tagged
      // 'interrupted artificially'. Live mower msg after a clean end +
      // dock is e.g. "Mode:COVERAGE Work:CANCELLED Prev work:USER_RECHARGE_STOP
      // Recharge: FINISHED". Add Recharge: FINISHED / WAIT as positive
      // finished signals — both indicate the dock cycle completed without
      // an error, even when the leading Work:* tag is CANCELLED.
      const looksFinished =
        msg.includes('Work:FINISHED') ||
        msg.includes('Prev work:FINISHED') ||
        msg.includes('Prev work:USER_RECHARGE_STOP') ||
        msg.includes('Recharge: FINISHED') ||
        msg.includes('Recharge: WAIT') ||
        covRatio >= 0.95 ||
        finishedNum > 0;
      if (looksFinished && errorStatus === '0') {
        workStatus = 'finished';
      } else if (msg.includes('Work:WAIT') && errorStatus !== '0') {
        workStatus = 'interrupted abnormally';
      } else if (msg) {
        workStatus = 'interrupted artificially';
      }
    }
    if (startWay === null) {
      // We don't know which app initiated. Default to a generic
      // label — operators using the OpenNova app can override via
      // a future API hook if needed.
      startWay = 'app';
    }
  }

  console.log(`[STATE] saveCutGrassRecord: sn=${sn} status=${workStatus ?? '-'} time=${workTime ?? '-'}min area=${workArea ?? '-'}m²`);

  // Zoek user_id + equipment_id via SN
  const equip = equipmentRepo.findByMowerSn(sn);

  const recordId = uuidv4();
  messageRepo.createWorkRecordFull(
    recordId,
    equip?.user_id ?? 'system',
    equip?.equipment_id ?? sn,
    dateTime,
    workTime,
    workArea,
    cutGrassHeight,
    mapNames,
    startWay,
    workStatus,
    scheduleId,
    week,
  );

  console.log(`[STATE] Werkrecord opgeslagen: ${recordId} voor ${sn}`);

  // Issue #17: drop the in-memory mowing-session timer so the next
  // coverage task starts fresh. Without this, a follow-up task would
  // inherit the previous session's startedAt and overstate its duration.
  clearMowingSession(sn);

  res.json(ok(null));
});
