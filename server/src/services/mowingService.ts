/**
 * Mowing Service — centrale module voor het starten/stoppen van maaisessies.
 *
 * Gebruikt EXACT dezelfde code path als de dashboard command handler
 * (encrypt + publishRawToDevice) — bewezen werkend vanuit het HomeScreen.
 *
 * Gebruikt door:
 * - Schedule runner (automatisch op schema)
 * - Dashboard API (handmatige start via browser)
 * - App API (start via OpenNova/Novabot app)
 */

import { publishToDevice } from '../mqtt/mapSync.js';
import { isDeviceOnline } from '../mqtt/broker.js';
import { deviceCache } from '../mqtt/sensorData.js';

/**
 * Returns true when the mower is already executing a task (mowing, edge,
 * mapping, returning, init/startup transitions). Idle states are
 * work_status 0 (WAIT), 2 (CANCELLED/DONE), 9 (on dock). Anything else
 * indicates an active task and accepting another start_navigation will
 * trigger Error 2 "Already in running task" on the firmware side
 * (issue #13).
 */
export function isMowerBusy(sn: string): boolean {
  const raw = deviceCache.get(sn);
  if (!raw) return false;
  const ws = raw.get('work_status') ?? '';
  if (ws !== '' && ws !== '0' && ws !== '2' && ws !== '9') return true;
  const msg = raw.get('msg') ?? '';
  return /Work:(MOVING|COVERING|REQUEST_START|INIT_|RUNNING|MAPPING)/.test(msg)
    || /Recharge:(MOVING|RUNNING|GOING)/.test(msg);
}

export interface MowingParams {
  sn: string;
  /**
   * User-facing cutting height in cm (2-9). Wire value sent to mqtt_node is `cm - 2`.
   * Verified 2026-04-19 via live Novabot-app capture on LFIN1231000211
   * (mqtt_node_20260419_163617_821948.log @ 18:18:09):
   *   user picks 4cm → MQTT cutterhigh:2 → physical blade 40mm ✓
   *   user picks 6cm → MQTT cutterhigh:4 → physical blade 60mm
   * Firmware formula: physical_mm = (cutterhigh + 2) * 10.
   *
   * Auto-normalisation accepts multiple encodings from legacy callers.
   */
  cuttingHeight?: number;
  pathDirection?: number;   // degrees (0-359), default 120
  // Decimal positional bitmask: map0=1, map1=10, map2=100; sum for multi-map
  // (11=map0+map1, 111=all three). The firmware mows every set map in one task.
  // Passed verbatim to start_navigation. See research/documents/multi-map-area-bitmask-decode.md.
  area?: number;
}

export interface MowingResult {
  ok: boolean;
  error?: string;
}

/**
 * Normalise a schedule's stored cutting height to the firmware wire enum
 * (`cutterhigh = cm − 2`, range 0..7). `dashboard_schedules.cutting_height` is
 * stored in DIFFERENT units by the two schedule editors, but in DISJOINT
 * ranges, so we can tell them apart unambiguously:
 *   - app ScheduleScreen  → user cm  (2..9)
 *   - dashboard Scheduler → mm       (20..90)
 * So: ≥ 20 is mm (÷10), anything below is already user cm. Clamp to 2..9 cm.
 *
 * This replaces an older value-range heuristic whose "3..11 → legacy cm+2 wire,
 * subtract 2" branch mis-read app cm values: a 9 cm schedule became 7 cm
 * (9 − 2). The wire (0..2) and legacy-cm+2 branches are dropped — the only
 * caller (scheduleRunner) always passes cm or mm, never a wire value.
 */
export function cuttingHeightToWire(input: number): number {
  const displayCm = input >= 20 ? Math.round(input / 10) : input;
  const clampedCm = Math.max(2, Math.min(9, Math.round(displayCm)));
  return Math.max(0, clampedCm - 2);
}

/** Publish a command to the mower. Delegates to publishToDevice which
 *  checks isAesCapable() and falls back to plain JSON for stock v5.x
 *  mowers and charger v0.3.x — both silently drop AES payloads, so
 *  the schedule runner + start_navigation flow previously failed
 *  invisibly on those firmwares (issues #45 / #49). */
function sendCommand(sn: string, command: Record<string, unknown>): void {
  publishToDevice(sn, command);
  console.log(`[MowingService] Sent ${Object.keys(command)[0]} to ${sn}`);
}

/**
 * Start een maaisessie op de maaier.
 * Stuurt start_navigation, exact als de Novabot app en het HomeScreen.
 */
export function startMowing(params: MowingParams): MowingResult {
  const { sn, cuttingHeight = 5, pathDirection = 120, area = 1 } = params;

  if (!sn) return { ok: false, error: 'sn required' };
  if (!isDeviceOnline(sn)) return { ok: false, error: 'mower offline' };
  if (isMowerBusy(sn)) {
    console.log(`[MowingService] Reject start: ${sn} already busy (work_status/msg active)`);
    return { ok: false, error: 'mower busy — already in a task' };
  }

  // Normalise the stored cutting height (cm from the app, mm from the dashboard)
  // to the firmware wire enum. See cuttingHeightToWire.
  const cutterhigh = cuttingHeightToWire(cuttingHeight);

  const cmdNum = Date.now() % 100000;
  sendCommand(sn, {
    start_navigation: {
      mapName: 'test',
      cutterhigh,
      area,
      cmd_num: cmdNum,
    },
  });

  console.log(`[MowingService] Started: sn=${sn} cutterhigh=${cutterhigh} (=${cutterhigh + 2}cm) dir=${pathDirection}° area=${area}`);
  return { ok: true };
}

/**
 * Stop een actieve maaisessie.
 */
export function stopMowing(sn: string): MowingResult {
  if (!sn) return { ok: false, error: 'sn required' };

  const cmdNum = Date.now() % 100000;
  sendCommand(sn, {
    stop_navigation: { cmd_num: cmdNum },
  });

  console.log(`[MowingService] Stopped: sn=${sn}`);
  return { ok: true };
}

/**
 * Stuur de maaier naar het laadstation.
 */
export function goHome(sn: string): MowingResult {
  if (!sn) return { ok: false, error: 'sn required' };

  const cmdNum = Date.now() % 100000;
  sendCommand(sn, { go_pile: {} });
  setTimeout(() => {
    sendCommand(sn, {
      go_to_charge: {
        cmd_num: cmdNum,
        chargerpile: { latitude: 200, longitude: 200 },
      },
    });
  }, 500);

  console.log(`[MowingService] Go home: sn=${sn}`);
  return { ok: true };
}
