// Server-side multi-zone mow queue.
//
// The stock firmware's `start_navigation` mows ONE map then docks (the `area`
// param is a single value 1/10/200 per Flutter decomp — no multi-map command).
// To mow several zones we re-issue start_navigation per zone. This MUST live on
// the server, not the app: a coverage mow runs for hours with the app usually
// backgrounded, so a client-side watcher misses the Work:FINISHED edge and the
// next zone never starts (the reported bug).
//
// Mirrors softRestart.ts: a tick reads deviceCache (populated by the report_state
// ingest) and drives the per-SN state machine in multiZoneMowPolicy.ts. No new
// MQTT hook. ponytail: in-memory only — a server restart mid-queue drops it
// (mower docks after the current zone, user re-triggers). Persist to DB if it bites.
import { deviceCache } from '../mqtt/sensorData.js';
import { publishToDevice, getNextCmdNum } from '../mqtt/mapSync.js';
import { type MZQueue, areaFromIdx, isMowingMsg, step, MZ_STALE_MS } from './multiZoneMowPolicy.js';

const TICK_MS = 3000;
const queues = new Map<string, MZQueue>();

function dispatch(sn: string, mapIdx: number, cutterhigh: number): void {
  publishToDevice(sn, {
    start_navigation: { mapName: 'test', cutterhigh, area: areaFromIdx(mapIdx), cmd_num: getNextCmdNum(sn) },
  });
}

/** Start a multi-zone run. `cuttingHeightCm` = user cm; wire = cm − 2. Returns
 *  false (no-op) for fewer than 2 zones — a single zone needs no queue. */
export function startMultiZone(sn: string, mapIdxs: number[], cuttingHeightCm: number): boolean {
  const idxs = mapIdxs.filter(n => Number.isInteger(n) && n >= 0);
  if (idxs.length < 2) return false;
  const cutterhigh = Math.max(0, Math.round(cuttingHeightCm) - 2);
  queues.set(sn, { remaining: [...idxs], cutterhigh, phase: 'running', sawMowing: false, startedAt: Date.now() });
  dispatch(sn, idxs[0], cutterhigh);
  return true;
}

export function clearMultiZone(sn: string): void { queues.delete(sn); }

/** Surfaced to the app via the device snapshot so the banner shows real progress. */
export function multiZoneStatus(sn: string): { remaining: number[] } | null {
  const q = queues.get(sn);
  return q ? { remaining: [...q.remaining] } : null;
}

function tickOnce(now: number): void {
  for (const [sn, q] of queues) {
    const c = deviceCache.get(sn);
    if (!c) { if (now - q.startedAt > MZ_STALE_MS) queues.delete(sn); continue; }
    const msg = c.get('msg') ?? '';
    const err = parseInt(String(c.get('error_status') ?? '0').match(/\d+/)?.[0] ?? '0', 10);
    const battery = String(c.get('battery_state') ?? '').toUpperCase();
    const taskMode = parseInt(String(c.get('task_mode') ?? '0'), 10);
    const idleOnDock = (battery === 'CHARGING' || battery === 'FINISHED') && taskMode === 0 && !isMowingMsg(msg);
    const action = step(q, { msg, err, idleOnDock }, now);
    if (action.kind === 'dispatch') dispatch(sn, action.mapIdx, q.cutterhigh);
    else if (action.kind === 'done' || action.kind === 'abort') queues.delete(sn);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startMultiZoneMonitor(): void {
  if (timer) return;
  timer = setInterval(() => { try { tickOnce(Date.now()); } catch (e) { console.error('[multi-zone] tick error', e); } }, TICK_MS);
  console.log('[multi-zone] monitor started');
}

/** Test-only reset. */
export function _resetMultiZone(): void { queues.clear(); }
