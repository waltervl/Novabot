/**
 * Schedule Runner — achtergrondproces dat maaischema's met rain_pause=1 beheert.
 *
 * Schema's met rain_pause worden NIET als timer_task naar de maaier gestuurd.
 * In plaats daarvan checkt deze runner periodiek of een starttijd net is bereikt,
 * controleert het weer via Open-Meteo, en stuurt start_run als het droog is.
 */

import { scheduleRepo, mapRepo, messageRepo } from '../db/repositories/index.js';
import { isDeviceOnline } from '../mqtt/broker.js';
import { publishToDevice } from '../mqtt/mapSync.js';
import { startMowing } from './mowingService.js';
import { getWeatherForecast, shouldPauseForRain } from './weatherService.js';
import { emitScheduleEvent } from '../dashboard/socketHandler.js';
import type { ScheduleRow } from '../db/repositories/schedules.js';

let intervalId: ReturnType<typeof setInterval> | null = null;
const CHECK_INTERVAL_MS = 30_000;
const TRIGGER_WINDOW_MS = 5 * 60_000; // 5 minuten window — ruim genoeg voor restarts

/** Haal charger GPS coördinaten op voor een maaier SN */
function getChargerGps(mowerSn: string): { lat: number; lng: number } | null {
  return mapRepo.getChargerGps(mowerSn);
}

function isIntervalDayMatch(row: ScheduleRow, now: Date): boolean {
  // Issue #51: "every N days" mode. Anchor + interval define which calendar
  // days trigger; weekdays array is ignored when interval_days > 0. Compare
  // local-midnight dates so DST changes / timezone offsets don't shift the
  // count by ±1 day.
  if (!row.interval_days || row.interval_days <= 0) return false;
  if (!row.interval_anchor_date) return false;
  const [anchorY, anchorM, anchorD] = row.interval_anchor_date.split('-').map(Number);
  if (!Number.isFinite(anchorY) || !Number.isFinite(anchorM) || !Number.isFinite(anchorD)) return false;
  const anchorMidnight = new Date(anchorY, anchorM - 1, anchorD).getTime();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const daysSince = Math.round((todayMidnight - anchorMidnight) / 86_400_000);
  if (daysSince < 0) return false;
  return daysSince % row.interval_days === 0;
}

function getScheduleOccurrence(row: ScheduleRow, now: Date): Date | null {
  // Match today against either the interval-days rule (preferred when set)
  // or the legacy weekdays array.
  if (row.interval_days && row.interval_days > 0) {
    if (!isIntervalDayMatch(row, now)) return null;
  } else {
    const weekdays: number[] = JSON.parse(row.weekdays);
    const currentDay = now.getDay(); // 0=Sunday
    if (!weekdays.includes(currentDay)) return null;
  }

  const [hourText = '0', minuteText = '0'] = row.start_time.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const occurrence = new Date(now);
  occurrence.setHours(hour, minute, 0, 0);
  return occurrence;
}

function checkSchedules() {
  const now = new Date();

  // Haal ALLE enabled schedules op — de runner handelt alles af
  const rows = scheduleRepo.findEnabled();
  if (rows.length > 0) {
    const day = now.getDay();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
    console.log(`[ScheduleRunner] Checking ${rows.length} schedule(s) at ${time} (day=${day})`);
  }

  for (const row of rows) {
    const scheduledAt = getScheduleOccurrence(row, now);
    if (!scheduledAt) {
      // Niet vandaag
      continue;
    }
    const sinceScheduledMs = now.getTime() - scheduledAt.getTime();
    if (sinceScheduledMs < 0 || sinceScheduledMs > TRIGGER_WINDOW_MS) {
      // Buiten trigger window
      continue;
    }

    // Voorkom dubbele trigger voor dezelfde geplande run.
    // SQLite datetime('now') produces 'YYYY-MM-DD HH:MM:SS' in UTC without
    // a timezone marker. JS new Date() parses that as LOCAL time, which made
    // lastTriggered always lag scheduledAt by the local offset (e.g. 2h in
    // CEST) — guard never matched, schedule retriggered every 30s.
    // Issue #13: dir26738 hit this and got Error 2 "Already in running task"
    // spam from the mower for 5 minutes per scheduled run.
    if (row.last_triggered_at) {
      const lastTriggered = new Date(row.last_triggered_at.replace(' ', 'T') + 'Z');
      if (!Number.isNaN(lastTriggered.getTime()) && lastTriggered.getTime() >= scheduledAt.getTime()) {
        continue;
      }
    }

    // Check of maaier online is
    if (!isDeviceOnline(row.mower_sn)) {
      console.log(`[ScheduleRunner] ${row.schedule_id}: maaier ${row.mower_sn} is offline, skip`);
      continue;
    }

    // Rain pause: check weer als ingeschakeld, anders direct starten
    if (row.rain_pause) {
      const gps = getChargerGps(row.mower_sn);
      if (!gps) {
        console.log(`[ScheduleRunner] ${row.schedule_id}: geen GPS coördinaten, start zonder weercheck`);
        triggerSchedule(row);
        continue;
      }
      checkWeatherAndTrigger(row, gps).catch(err => {
        console.error(`[ScheduleRunner] Weather check failed for ${row.schedule_id}:`, err);
        triggerSchedule(row);
      });
    } else {
      triggerSchedule(row);
    }
  }
}

async function checkWeatherAndTrigger(
  row: ScheduleRow,
  gps: { lat: number; lng: number },
) {
  const forecast = await getWeatherForecast(gps.lat, gps.lng);
  const shouldPause = shouldPauseForRain(
    forecast,
    row.rain_threshold_mm,
    row.rain_threshold_probability,
    row.rain_check_hours,
  );

  if (shouldPause) {
    console.log(`[ScheduleRunner] ${row.schedule_id}: regen verwacht, pauzeer`);
    emitScheduleEvent('weather:paused', {
      scheduleId: row.schedule_id,
      mowerSn: row.mower_sn,
      reason: 'rain',
    });
    // Update last_triggered_at zodat we niet elke seconde opnieuw checken
    scheduleRepo.updateLastTriggered(row.schedule_id);
    return;
  }

  console.log(`[ScheduleRunner] ${row.schedule_id}: weer OK, start maaier`);
  triggerSchedule(row);
}

/**
 * Resolve a schedule's stored map selection to the firmware `area` value.
 *
 * `area` is a decimal positional bitmask (slot N → 10^N: map0=1, map1=10,
 * map2=100; summed for multi-map). The firmware mows every selected map in one
 * task, no dock between zones — see research/documents/multi-map-area-bitmask-decode.md.
 *
 * - `selectedMapId` set  → that one map's slot (10^slot).
 * - `selectedMapId` null → "All work areas" (the ScheduleSheet default) → the
 *   summed bitmask of EVERY work map, so a scheduled run mows the whole garden.
 *
 * Falls back to map0 (`1`) when the selection can't be resolved to a canonical
 * slot, matching the previous always-map0 behaviour rather than mowing nothing.
 * Pure (no DB) so it's unit-testable; the caller supplies the work-map list.
 */
export function computeScheduleArea(
  workMaps: Array<{ map_id: string; canonical_name: string | null }>,
  selectedMapId: string | null,
): number {
  const slotOf = (m: { canonical_name: string | null }): number | null => {
    const match = m.canonical_name?.match(/^map(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  };
  if (selectedMapId) {
    const m = workMaps.find(w => w.map_id === selectedMapId);
    const slot = m ? slotOf(m) : null;
    return slot != null ? Math.pow(10, slot) : 1;
  }
  // "All work areas": bitmask of every work map (map0+map1+map2 → 111).
  const area = workMaps.reduce((sum, m) => {
    const slot = slotOf(m);
    return slot != null ? sum + Math.pow(10, slot) : sum;
  }, 0);
  return area > 0 ? area : 1;
}

function triggerSchedule(row: ScheduleRow) {
  // Bereken effectieve richting (met alternerende rotatie)
  let effectiveDirection = row.path_direction;
  if (row.alternate_direction === 1) {
    const count = messageRepo.countWorkRecordsBySchedule(row.schedule_id);
    effectiveDirection = (row.path_direction + count * (row.alternate_step ?? 90)) % 360;
  }

  // Honour the schedule's map selection (was hardcoded area:1 → always mowed
  // map0 regardless of the chosen map). null map_id = "All work areas".
  const workMaps = mapRepo.findByMowerSnAndType(row.mower_sn, 'work');
  const area = computeScheduleArea(workMaps, row.map_id);

  // Start maaien via centrale mowingService
  const result = startMowing({
    sn: row.mower_sn,
    cuttingHeight: row.cutting_height ?? 5,
    pathDirection: effectiveDirection,
    area,
  });
  console.log(`[ScheduleRunner] ${row.schedule_id}: ${result.ok ? 'started' : 'FAILED: ' + result.error} (height=${row.cutting_height}, dir=${effectiveDirection}, area=${area})`);

  // Update last_triggered_at
  scheduleRepo.updateLastTriggered(row.schedule_id);

  emitScheduleEvent('weather:started', {
    scheduleId: row.schedule_id,
    mowerSn: row.mower_sn,
    effectiveDirection,
  });
}

export function startScheduleRunner(): void {
  if (intervalId) return;
  checkSchedules();
  intervalId = setInterval(checkSchedules, CHECK_INTERVAL_MS);
  console.log(`[ScheduleRunner] Started, checking every ${CHECK_INTERVAL_MS / 1000}s`);
}

export function stopScheduleRunner(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[ScheduleRunner] Stopped');
  }
}
