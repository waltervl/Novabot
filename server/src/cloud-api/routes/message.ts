import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { equipmentRepo, mapRepo, messageRepo } from '../../db/repositories/index.js';
import { authMiddleware } from '../../middleware/auth.js';
import { AuthRequest, ok } from '../../types/index.js';

/**
 * Issue #17 (waltervl): the work-records list rendered the raw stringified
 * area like `298.9381103515625 m²`. Round to 2 decimals so the Novabot app
 * shows e.g. `298.94 m²` (matches the stock cloud's display precision).
 */
function formatWorkArea(m2: number | null | undefined): string {
  if (m2 == null || !Number.isFinite(m2)) return '';
  return (Math.round(m2 * 100) / 100).toFixed(2);
}

/**
 * Issue #17 (waltervl): selectMap was sent verbatim as the JSON-encoded
 * canonical-name array (`["map10"]`), so the app rendered the literal
 * brackets and the firmware-internal `mapN` slot id. Resolve each
 * canonical to its user alias when one exists, comma-join, and collapse
 * to "All maps" when the selection covers every work-map for this mower
 * (the same label the stock cloud uses).
 */
function formatSelectMap(rawMapNames: string | null | undefined, sn: string | null): string {
  if (!rawMapNames) return '';
  let canonicals: string[];
  try {
    const parsed = JSON.parse(rawMapNames);
    canonicals = Array.isArray(parsed)
      ? parsed.map(String).filter(s => s.trim() !== '')
      : [String(parsed)];
  } catch {
    // Not JSON — old rows may have stored a plain comma-separated string.
    canonicals = rawMapNames.split(',').map(s => s.trim()).filter(s => s !== '');
  }
  if (canonicals.length === 0) return '';

  const totalWorkMaps = sn ? mapRepo.findWorkMaps(sn).length : 0;
  if (totalWorkMaps > 0 && canonicals.length >= totalWorkMaps) return 'All maps';

  const labels = canonicals.map(canon => {
    if (!sn) return canon;
    const row = mapRepo.findBySnAndCanonical(sn, canon);
    const alias = row?.map_name?.trim();
    return alias && alias !== canon ? alias : canon;
  });
  return labels.join(', ');
}

export const messageRouter = Router();

// ── Robot messages ────────────────────────────────────────────────────────────

// POST /api/novabot-message/message/queryRobotMsgPageByUserId
//
// Novabot v2.4.0 sends:
//   { appUserId, pageNo, pageSize, timezone }   (POST + JSON body)
// (We previously exposed this as GET, which produced a 404 in the app.
// `appUserId` here is the cloud's numeric user id and isn't used — we always
// scope by the JWT's `req.userId` so users only see their own messages.)
//
// Response shape expected by `RobotMessageEntity.fromJson` + the working/robot
// records pages: `{ pageList: [...], pageNo, pageSize, totalCount }`. Field
// names on each row mirror the Novabot model — `contentEn`, `createrTime`,
// `level` (verified via blutter `pages/user/message_page/model/`).
function readPagination(req: AuthRequest): { pageNo: number; pageSize: number; offset: number } {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const pageNo = Math.max(1, parseInt(String(body.pageNo ?? req.query.pageNo ?? '1'), 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(String(body.pageSize ?? req.query.pageSize ?? '20'), 10) || 20));
  return { pageNo, pageSize, offset: (pageNo - 1) * pageSize };
}

messageRouter.post('/queryRobotMsgPageByUserId', authMiddleware, (req: AuthRequest, res: Response) => {
  const { pageNo, pageSize, offset } = readPagination(req);
  const totalCount = messageRepo.countMessages(req.userId!);
  const rows = messageRepo.findMessagesByUserId(req.userId!, pageSize, offset);

  const pageList = rows.map(r => ({
    id: r.id,
    messageId: r.message_id,
    equipmentId: r.equipment_id,
    contentEn: r.robot_msg,
    createrTime: r.robot_msg_date,
    level: 0,
    unread: r.robot_msg_unread === 1,
  }));

  res.json(ok({ pageList, pageNo, pageSize, totalCount }));
});

// POST /api/novabot-message/message/queryMsgMenuByUserId
// Cloud response format (ConsoleLogMower.txt):
// { workRecordMsg, workRecordUnread, workRecordDate, robotMsg, robotMsgUnread, robotMsgDate,
//   securityRecordMsg, securityRecordUnread, sharingMsg, sharingUnread, sharingDate,
//   promotionMsg, promotionUnread, promotionDate }
messageRouter.post('/queryMsgMenuByUserId', authMiddleware, (req: AuthRequest, res: Response) => {
  const unreadRobot = messageRepo.countUnreadMessages(req.userId!);
  const unreadWork  = messageRepo.countUnreadWorkRecords(req.userId!);
  const latestWork  = messageRepo.getLatestWorkRecordDate(req.userId!);
  const latestRobot = messageRepo.getLatestMessageDate(req.userId!);

  res.json(ok({
    workRecordMsg: null,
    workRecordUnread: unreadWork,
    workRecordDate: latestWork,
    securityRecordMsg: null,
    securityRecordUnread: null,
    robotMsg: null,
    robotMsgUnread: unreadRobot,
    robotMsgDate: latestRobot,
    sharingMsg: null,
    sharingUnread: null,
    sharingDate: null,
    promotionMsg: null,
    promotionUnread: null,
    promotionDate: null,
  }));
});

// POST /api/novabot-message/message/updateMsgByUserId  (mark as read)
messageRouter.post('/updateMsgByUserId', authMiddleware, (req: AuthRequest, res: Response) => {
  const { messageIds } = req.body as { messageIds?: string[] };
  if (!messageIds?.length) {
    // Mark all read
    messageRepo.markMessagesRead(req.userId!);
  } else {
    messageRepo.markMessagesReadByIds(messageIds, req.userId!);
  }
  res.json(ok());
});

// POST /api/novabot-message/message/deleteMsgByUserId
messageRouter.post('/deleteMsgByUserId', authMiddleware, (req: AuthRequest, res: Response) => {
  const { messageIds } = req.body as { messageIds?: string[] };
  if (!messageIds?.length) {
    messageRepo.deleteMessagesByUserId(req.userId!);
  } else {
    messageRepo.deleteMessagesByIds(messageIds, req.userId!);
  }
  res.json(ok());
});

// ── Work / mowing records ─────────────────────────────────────────────────────

// POST /api/novabot-message/message/queryCutGrassRecordPageByUserId
//
// Novabot v2.4.0 sends a POST with `{appUserId, pageNo, pageSize, timezone}`.
// Field names on each row come from `WorkMessageEntity.fromJson`:
//   workTime, dateTime, workArea, workStatus, selectMap, startWay, cutGrassHeight
// (verified via blutter `pages/user/message_page/model/work_message_entity.dart`).
messageRouter.post('/queryCutGrassRecordPageByUserId', authMiddleware, (req: AuthRequest, res: Response) => {
  const { pageNo, pageSize, offset } = readPagination(req);
  const totalCount = messageRepo.countWorkRecords(req.userId!);
  const rows = messageRepo.findWorkRecordsByUserId(req.userId!, pageSize, offset);

  // Resolve equipment_id → mower_sn once per row so formatSelectMap can
  // look up canonical→alias mappings. Cache per request to avoid redundant
  // lookups when rows share equipment_id.
  const snCache = new Map<string, string | null>();
  const resolveSn = (equipmentId: string | null | undefined): string | null => {
    if (!equipmentId) return null;
    if (snCache.has(equipmentId)) return snCache.get(equipmentId)!;
    const equip = equipmentRepo.findByEquipmentId(equipmentId);
    // saveCutGrassRecord falls back to equipment_id = sn when no equipment row
    // exists, so try the id verbatim before giving up.
    const sn = equip?.mower_sn ?? equipmentId;
    snCache.set(equipmentId, sn);
    return sn;
  };

  const pageList = rows.map(r => ({
    id: r.id,
    recordId: r.record_id,
    equipmentId: r.equipment_id,
    workTime: r.work_time ?? 0,
    dateTime: r.date_time ?? r.work_record_date,
    workArea: formatWorkArea(r.work_area_m2),
    workStatus: r.work_status ?? '',
    selectMap: formatSelectMap(r.map_names, resolveSn(r.equipment_id)),
    startWay: r.start_way ?? '',
    cutGrassHeight: r.cut_grass_height ?? 0,
    week: r.week ?? '',
    scheduleId: r.schedule_id ?? '',
    unread: r.work_record_unread === 1,
  }));

  res.json(ok({ pageList, pageNo, pageSize, totalCount }));
});

// ── Internal helper: insert a robot message (called from MQTT bridge) ─────────

export function insertRobotMessage(userId: string, equipmentId: string, msg: string): void {
  messageRepo.createMessage(uuidv4(), userId, equipmentId, msg);
}

export function insertWorkRecord(userId: string, equipmentId: string, status: string, workTime: number): void {
  messageRepo.createWorkRecord(uuidv4(), userId, equipmentId, status, workTime);
}
