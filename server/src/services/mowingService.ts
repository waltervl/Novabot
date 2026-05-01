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

import crypto from 'crypto';
import { publishRawToDevice } from '../mqtt/mapSync.js';
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
  area?: number;            // 1=map0, 10=map1, 200=map2
}

export interface MowingResult {
  ok: boolean;
  error?: string;
}

/** Encrypt and publish a command — same as dashboard command handler */
function sendEncryptedCommand(sn: string, command: Record<string, unknown>): void {
  const KEY_PREFIX = 'abcdabcd1234';
  const IV = Buffer.from('abcd1234abcd1234', 'utf8');
  const key = Buffer.from(KEY_PREFIX + sn.slice(-4), 'utf8');
  const json = JSON.stringify(command);
  const plaintext = Buffer.from(json, 'utf8');
  const padded = Buffer.alloc(Math.ceil(plaintext.length / 16) * 16, 0);
  plaintext.copy(padded);
  const cipher = crypto.createCipheriv('aes-128-cbc', key, IV);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  publishRawToDevice(sn, encrypted);
  console.log(`[MowingService] Sent ${Object.keys(command)[0]} to ${sn} (${encrypted.length}B encrypted)`);
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

  // Normalise input to user cm (2-9), then compute wire value (cm-2).
  // Accept multiple encodings because older callers used different scales:
  //   2..9   → user cm (new preferred)
  //   20..90 → legacy mm → divide by 10
  //   3..11  → legacy `cm + 2` wire from previous bug → subtract 2
  //   0..7   → already correct wire value → add 2 to get cm
  let displayCm: number;
  if (cuttingHeight >= 20) displayCm = Math.round(cuttingHeight / 10);
  else if (cuttingHeight >= 3 && cuttingHeight <= 11) displayCm = cuttingHeight - 2;
  else if (cuttingHeight >= 0 && cuttingHeight <= 2) displayCm = cuttingHeight + 2;
  else displayCm = cuttingHeight;
  displayCm = Math.max(2, Math.min(9, displayCm));
  const cutterhigh = Math.max(0, displayCm - 2);

  const cmdNum = Date.now() % 100000;
  sendEncryptedCommand(sn, {
    start_navigation: {
      mapName: 'test',
      cutterhigh,
      area,
      cmd_num: cmdNum,
    },
  });

  console.log(`[MowingService] Started: sn=${sn} cutterhigh=${cutterhigh} (=${cutterhigh - 2}cm) dir=${pathDirection}° area=${area}`);
  return { ok: true };
}

/**
 * Stop een actieve maaisessie.
 */
export function stopMowing(sn: string): MowingResult {
  if (!sn) return { ok: false, error: 'sn required' };

  const cmdNum = Date.now() % 100000;
  sendEncryptedCommand(sn, {
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
  sendEncryptedCommand(sn, { go_pile: {} });
  setTimeout(() => {
    sendEncryptedCommand(sn, {
      go_to_charge: {
        cmd_num: cmdNum,
        chargerpile: { latitude: 200, longitude: 200 },
      },
    });
  }, 500);

  console.log(`[MowingService] Go home: sn=${sn}`);
  return { ok: true };
}
