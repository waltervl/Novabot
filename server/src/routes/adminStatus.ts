/**
 * Admin Status API — server health, users, devices, errors
 * Protected by authMiddleware + adminMiddleware
 */

import { Router, Response } from 'express';
import os from 'os';
import dns from 'dns';
import crypto from 'crypto';
import path from 'path';
import { execSync } from 'child_process';
import { db } from '../db/database.js';
import { isDeviceOnline, banishSn, unbanSn, listBannedSns } from '../mqtt/broker.js';
import { awaitCommand, publishToDevice, publishToExtended, onExtendedResponse, offExtendedResponse } from '../mqtt/mapSync.js';
import { userRepo, equipmentRepo, deviceRepo, mapRepo, otaVersionRepo } from '../db/repositories/index.js';
import { AuthRequest } from '../types/index.js';
import { invalidateSetupCache } from '../middleware/setupGuard.js';
import { parseMapZip, MapArea } from '../mqtt/mapConverter.js';
import { startMdnsAdvertiser, stopMdnsAdvertiser, getActiveAdvertisement } from '../services/mdnsAdvertiser.js';
import { listBackups, backupPath, regenerateLatestZipFromBackup } from '../services/mapBackup.js';
import { getPolygonAnchor } from '../services/anchor.js';
import { exportBundle, parseBundle, BundleValidationError, computeAnchorRebase } from '../services/portableMap.js';
import { ImportStagingStore } from '../services/importStaging.js';
import { getDeviceHealth } from '../services/deviceHealth.js';
import { classifyBundle, type ClassifyResult } from '../services/bundleClassifier.js';
import { importAuditRepo } from '../db/repositories/importAudit.js';
import { deriveHeading } from '../services/driveCalibration.js';
import {
  deviceCache,
  getValidationTrail,
  clearValidationTrail,
  getLocalTrail,
} from '../mqtt/sensorData.js';
import { gpsToLocal, metersPerDegLat, metersPerDegLng } from '../mqtt/mapConverter.js';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import https from 'https';

export const MANIFEST_URL = 'https://downloads.ramonvanbruggen.nl/opennova-manifest.json';

/**
 * Issue #26: the published manifest still references the legacy host
 * `download.ramonvanbruggen.nl/file/...` — both wrong:
 *   - `download.` (singular) host doesn't resolve DNS — must be plural
 *     `downloads.ramonvanbruggen.nl`.
 *   - The `/file/` path segment was a Backblaze public-bucket artifact;
 *     the live host serves files at the root (`/<filename>.deb`).
 *
 * Rewrite both at the server boundary so the URL works regardless of when
 * the manifest is regenerated.
 */
export function normaliseFirmwareDownloadUrl(url: string): string {
  return url
    .replace(
      /https?:\/\/download\.ramonvanbruggen\.nl/gi,
      'https://downloads.ramonvanbruggen.nl',
    )
    .replace(
      /https:\/\/downloads\.ramonvanbruggen\.nl\/file\//gi,
      'https://downloads.ramonvanbruggen.nl/',
    );
}

export const adminStatusRouter = Router();

const importStaging = new ImportStagingStore(
  path.resolve(process.env.STORAGE_PATH ?? './storage', 'imports'),
);
const bundleUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });


// Read version once at startup
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname_admin = dirname(fileURLToPath(import.meta.url));
let SERVER_VERSION = '?';
try { SERVER_VERSION = JSON.parse(fs.readFileSync(join(__dirname_admin, '../../package.json'), 'utf8')).version; } catch { /* ignore */ }

// GET /api/admin-status/overview
adminStatusRouter.get('/overview', (_req: AuthRequest, res: Response) => {
  const uptime = process.uptime();
  const mem = process.memoryUsage();

  // DB stats
  const userCount = userRepo.count();
  const equipmentCount = equipmentRepo.count();
  const deviceCount = deviceRepo.countAll();
  const mapCount = mapRepo.count();

  // DB file size
  let dbSize = 0;
  try {
    const dbPath = process.env.DB_PATH || 'novabot.db';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const stat = fs.statSync(dbPath);
    dbSize = stat.size;
  } catch {}

  // Current user info from JWT
  const currentUser = _req.userId ? userRepo.findById(_req.userId) : undefined;

  res.json({
    server: {
      version: SERVER_VERSION,
      uptime: Math.round(uptime),
      uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.arch()}`,
      memoryMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      dbSizeMB: Math.round(dbSize / 1024 / 1024 * 10) / 10,
    },
    counts: {
      users: userCount,
      equipment: equipmentCount,
      devices: deviceCount,
      maps: mapCount,
    },
    currentUser: currentUser ? {
      email: currentUser.email,
      is_admin: currentUser.is_admin === 1,
      dashboard_access: currentUser.dashboard_access === 1,
    } : null,
  });
});

// GET /api/admin-status/users — all users with their equipment
adminStatusRouter.get('/users', (_req: AuthRequest, res: Response) => {
  const users = userRepo.listWithEquipmentSummary();

  // Also get all equipment (including unbound)
  const allEquipment = equipmentRepo.listAll();

  // Count unbound equipment
  const unboundCount = allEquipment.filter((e) => !e.user_id).length;

  res.json({ users, allEquipment, unboundCount });
});

// GET /api/admin-status/devices — known Novabot devices with online status
adminStatusRouter.get('/devices', (_req: AuthRequest, res: Response) => {
  const rows = deviceRepo.listAdminDevices();

  // Override is_online met de runtime broker state. De SQL threshold
  // (`julianday('now') - last_seen < 0.003` = 259s) is te traag voor een
  // fijne UX — na een abrupt power-off / WiFi drop blijft de UI tot
  // ~4 minuten "Online" tonen. De MQTT broker weet binnen 45s (stale
  // sweeper, zie broker.ts) dat het device stil is. Gebruik die als
  // waarheid zodat de admin UI in sync is met /device-sets.
  const devices = rows.map(r => ({
    ...r,
    is_online: r.sn && isDeviceOnline(r.sn) ? 1 : 0,
    health: r.sn ? getDeviceHealth(r.sn) : null,
  }));

  res.json({ devices });
});

// GET /api/admin-status/health/:sn — explicit single-device health probe
// (LoRa pair mismatch + mower_error). Same shape as `health` field on
// /devices, exposed separately for clients that only need one device.
adminStatusRouter.get('/health/:sn', (req: AuthRequest, res: Response) => {
  const { sn } = req.params;
  if (!sn) {
    res.status(400).json({ ok: false, error: 'sn required' });
    return;
  }
  res.json({ ok: true, health: getDeviceHealth(sn) });
});

// POST /api/admin-status/bind-device — bind unbound device to current user
adminStatusRouter.post('/bind-device', (_req: AuthRequest, res: Response) => {
  const { sn } = _req.body as { sn?: string };
  if (!sn || !_req.userId) {
    res.status(400).json({ error: 'sn required' });
    return;
  }

  // Check if equipment exists
  const existing = equipmentRepo.findBySn(sn);

  if (existing) {
    // Update existing — set user_id
    equipmentRepo.setUserId(existing.equipment_id, _req.userId);
  } else {
    // Create new equipment record
    const equipmentId = crypto.randomUUID();
    const isCharger = sn.startsWith('LFIC');
    equipmentRepo.create({
      equipment_id: equipmentId,
      user_id: _req.userId,
      mower_sn: sn,
      charger_sn: isCharger ? sn : null,
    });
  }

  console.log(`[Admin] Device ${sn} bound to user ${_req.userId}`);
  res.json({ ok: true });
});

// POST /api/admin-status/send-command — generic MQTT command sender
//
// Stuurt een Dart/Send_mqtt/<SN> command naar een device en (optioneel) wacht
// op het bijbehorende *_respond. Antwoord bevat ofwel de response-data, ofwel
// { sent: true } als noWait=true.
//
// Body: {
//   sn: string,                 // Doelapparaat (LFIN* of LFIC*)
//   command: string,            // bijv. "get_signal_info", "get_lora_info"
//   payload?: unknown,          // JSON payload, default null
//   timeoutMs?: number,         // max wachttijd voor respond, default 5000
//   noWait?: boolean            // true = fire-and-forget
// }
adminStatusRouter.post('/send-command', async (req: AuthRequest, res: Response) => {
  const { sn, command, payload, timeoutMs, noWait } = req.body as {
    sn?: string;
    command?: string;
    payload?: unknown;
    timeoutMs?: number;
    noWait?: boolean;
  };

  if (!sn || !command) {
    res.status(400).json({ error: 'sn and command required' });
    return;
  }
  if (!isDeviceOnline(sn)) {
    res.status(409).json({ error: 'device not online', sn });
    return;
  }

  try {
    if (noWait) {
      publishToDevice(sn, { [command]: payload ?? null });
      console.log(`[Admin] send-command (noWait) ${command} → ${sn}`);
      res.json({ ok: true, sent: true, sn, command });
      return;
    }

    console.log(`[Admin] send-command ${command} → ${sn} (await respond)`);
    const data = await awaitCommand(sn, command, payload ?? null, timeoutMs ?? 5000);
    res.json({ ok: true, sn, command, respond: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'send-command failed';
    console.warn(`[Admin] send-command ${command} → ${sn} failed: ${msg}`);
    res.status(504).json({ error: msg, sn, command });
  }
});

// POST /api/admin-status/banish-device — delete device fully + block MQTT
// reconnects for N minutes. Gebruikt door de "Delete + Banish" flow wanneer
// user een device wil re-provisionen via de officiële Novabot app. Zonder
// deze ban zou ons broker de device binnen 30s weer accepteren (DNS van
// mqtt.lfibot.com → onze server). Ban voorkomt dat + wist DB rijen zodat
// user een clean-slate kan bouwen. Na ban-expiry connect device normaal
// opnieuw.
adminStatusRouter.post('/banish-device', (_req: AuthRequest, res: Response) => {
  const { sn, minutes } = _req.body as { sn?: string; minutes?: number };
  if (!sn) { res.status(400).json({ error: 'sn required' }); return; }
  const durationMs = Math.max(1, Math.min(minutes ?? 120, 1440)) * 60 * 1000;

  // Full cascade delete — MAPS BLIJVEN (user-spec 2026-04-22). Zelfde
  // cleanup als /api/nova-user/equipment/unboundEquipment: wist equipment
  // + alle per-SN / per-equipment_id tabellen, maar laat maps/map_uploads/
  // map_calibration/virtual_walls staan.
  try {
    const equip = equipmentRepo.findBySn(sn);
    const mowerSn = equip?.mower_sn;
    const chargerSn = equip?.charger_sn;
    const equipmentIdStr = equip?.equipment_id;
    const snsToClean: string[] = [sn];
    if (mowerSn && !snsToClean.includes(mowerSn)) snsToClean.push(mowerSn);
    if (chargerSn && !snsToClean.includes(chargerSn)) snsToClean.push(chargerSn);

    const tx = db.transaction(() => {
      if (equipmentIdStr) {
        db.prepare('DELETE FROM equipment WHERE equipment_id = ?').run(equipmentIdStr);
        db.prepare('DELETE FROM cut_grass_plans WHERE equipment_id = ?').run(equipmentIdStr);
        try { db.prepare('DELETE FROM work_records WHERE equipment_id = ?').run(equipmentIdStr); } catch { /* ignore */ }
        try { db.prepare('DELETE FROM robot_messages WHERE equipment_id = ?').run(equipmentIdStr); } catch { /* ignore */ }
      }
      for (const s of snsToClean) {
        db.prepare('DELETE FROM equipment_lora_cache WHERE sn = ?').run(s);
        db.prepare('DELETE FROM device_registry WHERE sn = ?').run(s);
        try { db.prepare('DELETE FROM signal_history WHERE sn = ?').run(s); } catch { /* ignore */ }
        try { db.prepare('DELETE FROM device_settings WHERE sn = ?').run(s); } catch { /* ignore */ }
        try { db.prepare('DELETE FROM rain_sessions WHERE mower_sn = ?').run(s); } catch { /* ignore */ }
      }
      if (mowerSn) {
        try { db.prepare('DELETE FROM dashboard_schedules WHERE mower_sn = ?').run(mowerSn); } catch { /* ignore */ }
      }
      // MAPS/map_uploads/map_calibration/virtual_walls BLIJVEN INTACT.
    });
    tx();
    console.log(`[BAN] Full cascade delete voor ${sn} (equip=${equipmentIdStr}, SNs=[${snsToClean.join(',')}]) — maps preserved`);
  } catch (e) {
    console.log(`[BAN] Cascade error for ${sn}: ${e}`);
  }

  // 2. Voeg toe aan in-memory ban list + force-disconnect eventuele actieve sessie
  banishSn(sn, durationMs);

  res.json({ ok: true, sn, banExpiresInMs: durationMs });
});

// POST /api/admin-status/unbanish-device — release a banned SN early so het
// device weer normaal mag connecten. Zonder call expired de ban automatisch
// na de durationMs van banish-device.
adminStatusRouter.post('/unbanish-device', (_req: AuthRequest, res: Response) => {
  const { sn } = _req.body as { sn?: string };
  if (!sn) { res.status(400).json({ error: 'sn required' }); return; }
  unbanSn(sn);
  res.json({ ok: true, sn });
});

// GET /api/admin-status/banned-devices — lijst van actieve bans voor UI.
adminStatusRouter.get('/banned-devices', (_req: AuthRequest, res: Response) => {
  res.json({ banned: listBannedSns() });
});

// POST /api/admin-status/unbind-device — remove user_id from equipment (keep device)
adminStatusRouter.post('/unbind-device', (_req: AuthRequest, res: Response) => {
  const { sn } = _req.body as { sn?: string };
  if (!sn) { res.status(400).json({ error: 'sn required' }); return; }

  equipmentRepo.clearUserIdBySn(sn);
  console.log('[Admin] Device ' + sn + ' unbound');
  res.json({ ok: true });
});

// POST /api/admin-status/set-active-device — set which mower is active (shown in Novabot app)
adminStatusRouter.post('/set-active-device', (_req: AuthRequest, res: Response) => {
  const { sn } = _req.body as { sn?: string };
  if (!sn) { res.status(400).json({ error: 'sn required' }); return; }

  // Clear all is_active flags first, then set the selected one
  db.exec('UPDATE equipment SET is_active = 0');
  const eq = equipmentRepo.findBySn(sn);
  if (eq) {
    db.prepare('UPDATE equipment SET is_active = 1 WHERE equipment_id = ?').run(eq.equipment_id);
    // Also set the paired charger as active
    if (eq.charger_sn) {
      db.prepare('UPDATE equipment SET is_active = 1 WHERE charger_sn = ? AND equipment_id = ?').run(eq.charger_sn, eq.equipment_id);
    }
  }
  console.log('[Admin] Active device set to ' + sn);
  res.json({ ok: true });
});

// POST /api/admin-status/mdns-restart — restart the mDNS advertiser
adminStatusRouter.post('/mdns-restart', (_req: AuthRequest, res: Response) => {
  try {
    stopMdnsAdvertiser();
    startMdnsAdvertiser();
    const advertisement = getActiveAdvertisement();
    console.log('[Admin] mDNS advertiser restarted');
    res.json({
      ok: true,
      restartedAt: new Date().toISOString(),
      advertisement,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[Admin] mDNS restart failed:', message);
    res.status(500).json({ ok: false, error: message });
  }
});

// POST /api/admin-status/deactivate-device — clear is_active for a specific
// mower (of alle als geen sn wordt meegegeven). Gebruikt door de dashboard
// "Deactivate" knop naast een active mower zodat de user een actieve
// mower expliciet kan uitzetten zonder direct een andere te activeren.
adminStatusRouter.post('/deactivate-device', (_req: AuthRequest, res: Response) => {
  const { sn } = _req.body as { sn?: string };
  if (sn) {
    const eq = equipmentRepo.findBySn(sn);
    if (eq) {
      db.prepare('UPDATE equipment SET is_active = 0 WHERE equipment_id = ?').run(eq.equipment_id);
      console.log('[Admin] Deactivated device ' + sn + ' (equipment ' + eq.equipment_id + ')');
    }
  } else {
    db.exec('UPDATE equipment SET is_active = 0');
    console.log('[Admin] Deactivated ALL devices');
  }
  res.json({ ok: true });
});

// POST /api/admin-status/pair-devices — pair mower with charger in equipment table
adminStatusRouter.post('/pair-devices', (_req: AuthRequest, res: Response) => {
  const { mowerSn, chargerSn } = _req.body as { mowerSn?: string; chargerSn?: string };
  if (!mowerSn || !chargerSn) { res.status(400).json({ error: 'mowerSn and chargerSn required' }); return; }

  try {
    const pairTx = db.transaction(() => {
      // Find existing records
      const chargerEquip = equipmentRepo.findByChargerSn(chargerSn);

      if (chargerEquip) {
        // DELETE standalone mower record FIRST (before UPDATE to avoid UNIQUE violation)
        equipmentRepo.deleteStandaloneMower(mowerSn, chargerEquip.equipment_id);
        // Now safe to set mower_sn on the charger record
        equipmentRepo.updateMowerSn(chargerEquip.equipment_id, mowerSn);
        console.log(`[Admin] Paired mower ${mowerSn} with charger ${chargerSn} (into charger record)`);
      } else {
        const mowerEquip = equipmentRepo.findByMowerSn(mowerSn);
        if (mowerEquip) {
          // DELETE standalone charger record FIRST
          equipmentRepo.deleteStandaloneCharger(chargerSn, mowerEquip.equipment_id);
          equipmentRepo.updateChargerSn(mowerEquip.equipment_id, chargerSn);
        } else {
          // Neither has a record — create one
          const equipmentId = crypto.randomUUID();
          equipmentRepo.create({
            equipment_id: equipmentId,
            user_id: _req.userId,
            mower_sn: mowerSn,
            charger_sn: chargerSn,
          });
        }
        console.log(`[Admin] Paired mower ${mowerSn} with charger ${chargerSn}`);
      }
    });
    pairTx();

    // Sync LoRa cache — both devices should share the same LoRa address
    // Use the charger's address as source of truth (charger reports its own LoRa)
    const chargerLora = equipmentRepo.getLoraCache(chargerSn);
    const mowerLora = equipmentRepo.getLoraCache(mowerSn);

    if (chargerLora?.charger_address && !mowerLora) {
      // Copy charger LoRa to mower
      equipmentRepo.setLoraCache(mowerSn, chargerLora.charger_address, chargerLora.charger_channel ?? '16');
    } else if (mowerLora?.charger_address && !chargerLora) {
      // Copy mower LoRa to charger
      equipmentRepo.setLoraCache(chargerSn, mowerLora.charger_address, mowerLora.charger_channel ?? '16');
    } else if (chargerLora?.charger_address && mowerLora?.charger_address && chargerLora.charger_address !== mowerLora.charger_address) {
      // Different addresses — use equipment table's charger_address as truth
      const equip = equipmentRepo.findBySn(mowerSn);
      if (equip?.charger_address) {
        equipmentRepo.syncLoraPair(mowerSn, chargerSn, equip.charger_address, equip.charger_channel ?? '16');
        console.log(`[Admin] Synced LoRa cache to address ${equip.charger_address} for pair`);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Pair failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Pair failed' });
  }
});

// POST /api/admin-status/remove-device — delete device from device_registry + equipment
adminStatusRouter.post('/remove-device', (_req: AuthRequest, res: Response) => {
  const { sn } = _req.body as { sn?: string };
  if (!sn) { res.status(400).json({ error: 'sn required' }); return; }

  deviceRepo.deleteBySn(sn);
  equipmentRepo.deleteBySn(sn);
  equipmentRepo.deleteLoraCache(sn);
  console.log('[Admin] Device ' + sn + ' removed');
  res.json({ ok: true });
});

// GET /api/admin-status/equipment — all equipment pairings
adminStatusRouter.get('/equipment', (_req: AuthRequest, res: Response) => {
  const raw = equipmentRepo.listWithUserEmail();

  // Fix display: if mower_sn starts with LFIC, it's actually a charger
  const equipment = raw.map((e) => {
    const mowerSn = e.mower_sn;
    const chargerSn = e.charger_sn;
    const actualMowerSn = mowerSn?.startsWith('LFIN') ? mowerSn : null;
    const actualChargerSn = chargerSn?.startsWith('LFIC') ? chargerSn
      : mowerSn?.startsWith('LFIC') ? mowerSn : null;
    const deviceType = actualMowerSn ? 'Novabot' : 'Charging station';
    return { ...e, display_mower_sn: actualMowerSn, display_charger_sn: actualChargerSn, device_type: deviceType };
  });

  res.json({ equipment });
});

// POST /api/admin-status/set-role — update user roles
adminStatusRouter.post('/set-role', (req: AuthRequest, res: Response) => {
  const { userId, role, enabled } = req.body as { userId: string; role: string; enabled: boolean };
  if (!userId || !role) { res.status(400).json({ error: 'userId and role required' }); return; }

  const validRoles = ['is_admin', 'dashboard_access'];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: `Invalid role. Valid: ${validRoles.join(', ')}` });
    return;
  }

  userRepo.setRole(userId, role as 'is_admin' | 'dashboard_access', enabled);

  console.log(`[ADMIN] Set ${role}=${enabled ? 1 : 0} for user ${userId}`);
  res.json({ ok: true });
});

// POST /api/admin-status/delete-user — admin can delete a user
adminStatusRouter.post('/delete-user', (req: AuthRequest, res: Response) => {
  const { userId } = req.body as { userId: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  if (userId === req.userId) { res.status(400).json({ error: 'Cannot delete yourself' }); return; }

  userRepo.deleteById(userId);
  equipmentRepo.clearUserIdByUserId(userId);

  console.log(`[ADMIN] Deleted user ${userId}`);
  res.json({ ok: true });
});

// POST /api/admin-status/reset-password — admin can reset a user's password
adminStatusRouter.post('/reset-password', (req: AuthRequest, res: Response) => {
  const { userId, newPassword } = req.body as { userId: string; newPassword: string };
  if (!userId || !newPassword) { res.status(400).json({ error: 'userId and newPassword required' }); return; }
  if (newPassword.length < 6) { res.status(400).json({ error: 'Password must be at least 6 characters' }); return; }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bcrypt = require('bcrypt');
  const hash = bcrypt.hashSync(newPassword, 10);
  userRepo.updatePassword(userId, hash);

  console.log(`[ADMIN] Password reset for user ${userId}`);
  res.json({ ok: true });
});

// GET /api/admin-status/dns-check — verify DNS configuration
// Checks if *.lfibot.com resolves to a private/local IP (= redirected, good)
// vs the Novabot cloud IPs (= not redirected, bad)
adminStatusRouter.get('/dns-check', async (_req: AuthRequest, res: Response) => {
  const serverIp = process.env.TARGET_IP ?? getLocalIp();
  const domains = ['mqtt.lfibot.com', 'app.lfibot.com'];

  const results = await Promise.all(domains.map(domain =>
    new Promise<{ domain: string; resolvedIp: string | null; ok: boolean; isLocal: boolean; error?: string }>(resolve => {
      dns.resolve4(domain, (err, addresses) => {
        if (err) {
          resolve({ domain, resolvedIp: null, ok: false, isLocal: false, error: err.code ?? err.message });
        } else {
          const ip = addresses[0] ?? null;
          // RFC1918 private ranges: 10.x, 172.16-31.x, 192.168.x
          const isLocal = ip ? /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip) : false;
          resolve({ domain, resolvedIp: ip, ok: isLocal, isLocal });
        }
      });
    })
  ));

  res.json({ serverIp, domains: results });
});

// GET /api/admin-status/dnsmasq — get dnsmasq status
adminStatusRouter.get('/dnsmasq', (_req: AuthRequest, res: Response) => {
  try {
    execSync('pgrep -x dnsmasq', { stdio: 'ignore' });
    res.json({ running: true });
  } catch {
    res.json({ running: false });
  }
});

// POST /api/admin-status/dnsmasq — start or stop dnsmasq
adminStatusRouter.post('/dnsmasq', (req: AuthRequest, res: Response) => {
  const { enable } = req.body as { enable?: boolean };
  const serverIp = process.env.TARGET_IP ?? getLocalIp();
  const upstreamDns = process.env.UPSTREAM_DNS ?? '8.8.8.8';

  if (enable) {
    try {
      // Write dnsmasq config
      const config = `no-resolv\nserver=${upstreamDns}\naddress=/lfibot.com/${serverIp}\nlisten-address=0.0.0.0\nbind-interfaces\nno-hosts\n`;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('fs').writeFileSync('/etc/dnsmasq.conf', config);
      // Kill existing if running, then start
      try { execSync('pkill -x dnsmasq', { stdio: 'ignore' }); } catch { /* not running */ }
      execSync('dnsmasq', { stdio: 'ignore' });
      console.log(`[DNS] dnsmasq started: *.lfibot.com → ${serverIp}`);
      res.json({ ok: true, running: true, serverIp });
    } catch (err) {
      console.error(`[DNS] Failed to start dnsmasq:`, err);
      res.json({ ok: false, error: 'Failed to start dnsmasq. Is it installed?' });
    }
  } else {
    try {
      execSync('pkill -x dnsmasq', { stdio: 'ignore' });
      console.log('[DNS] dnsmasq stopped');
      res.json({ ok: true, running: false });
    } catch {
      res.json({ ok: true, running: false });
    }
  }
});

function getLocalIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

// GET /api/admin-status/check-firmware-updates — compare remote manifest with local versions
adminStatusRouter.get('/check-firmware-updates', async (_req: AuthRequest, res: Response) => {
  try {
    const manifest = await fetchJson(MANIFEST_URL) as { firmwares?: Array<{ version: string; device_type: string; url: string; md5: string; description: string; filename?: string }> };
    const remoteFirmwares = manifest.firmwares || [];

    // Get locally installed versions
    const localVersions = otaVersionRepo.listAll();
    const localVersionSet = new Set(localVersions.map(v => v.version));

    // Per-device highest installed version. The Available Firmware panel
    // should only surface remote entries that are STRICTLY newer than
    // whatever is already on disk for that device — otherwise every
    // refresh listed every legacy entry (v6.0.2-custom-23, -24, -25, ...)
    // even after the operator had only kept the newest one locally.
    // Natural-sort comparator handles both `vX.Y.Z` semver (charger) and
    // `vX.Y.Z-custom-N` suffixes (mower).
    const cmp = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    const maxInstalledByType = new Map<string, string>();
    for (const v of localVersions) {
      const cur = maxInstalledByType.get(v.device_type);
      if (!cur || cmp.compare(v.version, cur) > 0) {
        maxInstalledByType.set(v.device_type, v.version);
      }
    }

    const available = remoteFirmwares
      .filter(fw => {
        const localMax = maxInstalledByType.get(fw.device_type);
        if (!localMax) return true; // no local copy at all → show everything
        return cmp.compare(fw.version, localMax) > 0;
      })
      .map(fw => ({
        ...fw,
        // Issue #26: the published manifest still references the old
        // `download.ramonvanbruggen.nl` host (singular) which fails DNS
        // resolution; the live host is `downloads.ramonvanbruggen.nl`.
        // Defensive rewrite here so the Download button works regardless of
        // when the manifest is fixed.
        url: normaliseFirmwareDownloadUrl(fw.url),
        filename: fw.filename || fw.url.split('/').pop() || `firmware_${fw.version}`,
        installed: localVersionSet.has(fw.version),
      }))
      // Newest first — Intl.Collator numeric handles `custom-29` < `custom-30`
      // and `v6.0.2` < `v6.0.3` correctly. Without this the admin
      // "Firmware Updates" panel showed entries in manifest order so a
      // freshly built custom-30 landed under custom-29.
      .sort((a, b) => cmp.compare(b.version, a.version));

    res.json({
      available,
      installed: localVersions.map(v => ({ version: v.version, device_type: v.device_type, md5: v.md5 })),
    });
  } catch (err) {
    console.error('[Admin] Failed to check firmware updates:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch manifest' });
  }
});

// POST /api/admin-status/download-firmware — download firmware from remote URL and register locally
adminStatusRouter.post('/download-firmware', async (req: AuthRequest, res: Response) => {
  const { url: rawUrl, filename, version, device_type, md5, description } = req.body as {
    url?: string; filename?: string; version?: string; device_type?: string; md5?: string; description?: string;
  };

  if (!rawUrl || !filename || !version || !device_type) {
    res.status(400).json({ error: 'url, filename, version, and device_type are required' });
    return;
  }
  // Defensive rewrite (issue #26) — see normaliseFirmwareDownloadUrl.
  const url = normaliseFirmwareDownloadUrl(rawUrl);

  // Resolve firmware directory (same as dashboard.ts)
  const firmwareDir = process.env.FIRMWARE_PATH ?? path.resolve(process.cwd(), 'firmware');
  fs.mkdirSync(firmwareDir, { recursive: true });

  const filePath = path.join(firmwareDir, filename);

  try {
    console.log(`[Admin] Downloading firmware ${version} from ${url}...`);

    // Download the file
    await downloadFile(url, filePath);

    // Verify MD5
    const fileBuffer = fs.readFileSync(filePath);
    const fileMd5 = crypto.createHash('md5').update(fileBuffer).digest('hex');

    if (md5 && fileMd5 !== md5) {
      // Clean up failed download
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      res.status(400).json({ error: `MD5 mismatch: expected ${md5}, got ${fileMd5}` });
      return;
    }

    // Build local download URL for OTA
    const targetIp = process.env.TARGET_IP ?? getLocalIp();
    const port = process.env.PORT ?? '3000';
    const localUrl = `http://${targetIp}:${port}/api/dashboard/firmware/${encodeURIComponent(filename)}`;

    // Write companion JSON metadata
    const metaPath = filePath.replace(/\.(deb|bin)$/, '.json');
    fs.writeFileSync(metaPath, JSON.stringify({
      version,
      device_type,
      filename,
      md5: fileMd5,
      description: description || '',
    }, null, 2));

    // syncFirmwareVersions() will pick it up via file watcher, but also create/update directly
    const existing = otaVersionRepo.listAll().find(v => v.version === version && v.device_type === device_type);
    if (existing) {
      otaVersionRepo.updateById(existing.id, {
        download_url: localUrl,
        md5: fileMd5,
        release_notes: description || existing.release_notes,
      });
    } else {
      otaVersionRepo.create({
        version,
        device_type,
        download_url: localUrl,
        md5: fileMd5,
        release_notes: description || null,
      });
    }

    console.log(`[Admin] Firmware ${version} downloaded and registered (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB)`);
    res.json({ ok: true, version, localPath: filePath, md5: fileMd5, size: fileBuffer.length });
  } catch (err) {
    // Clean up on error
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    console.error('[Admin] Firmware download failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Download failed' });
  }
});

// ── Server self-update check ─────────────────────────────────────────────────

const HUB_TAGS_URL = 'https://hub.docker.com/v2/repositories/rvbcrs/opennova/tags?page_size=25&ordering=last_updated';
let _serverUpdateCache: { ts: number; payload: { current: string; latest: string | null; updateAvailable: boolean; lastUpdatedAt: string | null } } | null = null;

// GET /api/admin-status/check-server-update — compare running version with newest Docker Hub tag.
// Cached for 5 minutes so the admin panel polling doesn't hammer Docker Hub.
adminStatusRouter.get('/check-server-update', async (_req: AuthRequest, res: Response) => {
  const cmp = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  if (_serverUpdateCache && Date.now() - _serverUpdateCache.ts < 5 * 60 * 1000) {
    res.json(_serverUpdateCache.payload);
    return;
  }

  try {
    const data = await fetchJson(HUB_TAGS_URL) as { results?: Array<{ name: string; last_updated: string }> };
    const tags = data.results ?? [];
    // Server release.sh writes timestamps like "2026.0505.0821" as the
    // version tag, plus the rolling "latest" alias. Skip "latest" so we
    // compare against the actual version tags only.
    const versionTags = tags.filter(t => t.name && t.name !== 'latest');
    let latest: string | null = null;
    let lastUpdatedAt: string | null = null;
    for (const t of versionTags) {
      if (!latest || cmp.compare(t.name, latest) > 0) {
        latest = t.name;
        lastUpdatedAt = t.last_updated ?? null;
      }
    }
    const updateAvailable = !!(latest && cmp.compare(latest, SERVER_VERSION) > 0);
    const payload = { current: SERVER_VERSION, latest, updateAvailable, lastUpdatedAt };
    _serverUpdateCache = { ts: Date.now(), payload };
    res.json(payload);
  } catch (err) {
    console.error('[Admin] Failed to check server update:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to check update' });
  }
});

/** Fetch JSON from an HTTPS URL */
export function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    https.get(url, { rejectUnauthorized: true }, (resp) => {
      if (resp.statusCode && resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        // Follow redirect
        fetchJson(resp.headers.location).then(resolve, reject);
        return;
      }
      if (resp.statusCode !== 200) {
        reject(new Error(`HTTP ${resp.statusCode} from ${url}`));
        resp.resume();
        return;
      }
      let data = '';
      resp.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      resp.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
      resp.on('error', reject);
    }).on('error', reject);
  });
}

/** Download a file from HTTPS URL to local path */
export function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : require('http');
    mod.get(url, { rejectUnauthorized: true }, (resp: any) => {
      if (resp.statusCode && resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        downloadFile(resp.headers.location, destPath).then(resolve, reject);
        return;
      }
      if (resp.statusCode !== 200) {
        reject(new Error(`HTTP ${resp.statusCode} downloading firmware`));
        resp.resume();
        return;
      }
      const fileStream = fs.createWriteStream(destPath);
      resp.pipe(fileStream);
      fileStream.on('finish', () => { fileStream.close(); resolve(); });
      fileStream.on('error', (err: Error) => {
        try { fs.unlinkSync(destPath); } catch { /* ignore */ }
        reject(err);
      });
      resp.on('error', (err: Error) => {
        try { fs.unlinkSync(destPath); } catch { /* ignore */ }
        reject(err);
      });
    }).on('error', reject);
  });
}

// ── Map backup endpoints ──────────────────────────────────────────────────────

/** Derive the firmware-canonical slot name from a parsed MapArea. */
function areaCanonicalName(area: MapArea): string {
  switch (area.type) {
    case 'work':
      return `map${area.mapIndex}`;
    case 'obstacle':
      return `map${area.mapIndex}_${area.subIndex ?? 0}_obstacle`;
    case 'unicom':
      return `map${area.mapIndex}to${area.target ?? 'charge'}_unicom`;
  }
}

/** Derive the CSV filename for a MapArea. */
function areaCsvFile(area: MapArea): string {
  switch (area.type) {
    case 'work':
      return `map${area.mapIndex}_work.csv`;
    case 'obstacle':
      return `map${area.mapIndex}_${area.subIndex ?? 0}_obstacle.csv`;
    case 'unicom':
      return `map${area.mapIndex}to${area.target ?? 'charge'}_unicom.csv`;
  }
}

// GET /api/admin-status/map-backups/:sn — list available snapshots
adminStatusRouter.get('/map-backups/:sn', (req: AuthRequest, res: Response) => {
  const { sn } = req.params;
  res.json({ backups: listBackups(sn) });
});

// GET /api/admin-status/map-backups/:sn/:filename — download ZIP
adminStatusRouter.get('/map-backups/:sn/:filename', (req: AuthRequest, res: Response) => {
  const { sn, filename } = req.params;
  try {
    const p = backupPath(sn, filename);
    if (!fs.existsSync(p)) {
      res.status(404).json({ error: 'backup not found' });
      return;
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(p).pipe(res);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'invalid filename' });
  }
});

// GET /api/admin-status/map-backups/:sn/:filename/contents — inspect backup
adminStatusRouter.get('/map-backups/:sn/:filename/contents', (req: AuthRequest, res: Response) => {
  const { sn, filename } = req.params;
  try {
    const p = backupPath(sn, filename);
    if (!fs.existsSync(p)) {
      res.status(404).json({ error: 'backup not found' });
      return;
    }
    const parsed = parseMapZip(p);
    if (!parsed) {
      res.status(400).json({ error: 'failed to parse backup ZIP' });
      return;
    }

    type AreaEntry = { canonicalName: string; csvFile: string; pointCount: number; existsInDb: boolean };
    const work: AreaEntry[] = [];
    const obstacles: AreaEntry[] = [];
    const unicoms: AreaEntry[] = [];

    for (const area of parsed.areas) {
      const canonicalName = areaCanonicalName(area);
      const entry: AreaEntry = {
        canonicalName,
        csvFile: areaCsvFile(area),
        pointCount: area.points.length,
        existsInDb: !!mapRepo.findBySnAndCanonical(sn, canonicalName),
      };
      if (area.type === 'work') work.push(entry);
      else if (area.type === 'obstacle') obstacles.push(entry);
      else if (area.type === 'unicom') unicoms.push(entry);
    }

    res.json({
      work,
      obstacles,
      unicoms,
      chargingPose: parsed.chargingPose ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'unknown error' });
  }
});

// GET /api/admin-status/map-backups/:sn/:filename/polygons — full polygon geometry
//
// Same source data as /contents but returns the full {x, y} arrays so the
// admin map canvas can render the backup as a ghost overlay BEFORE the
// operator commits to a restore. /contents intentionally only returns
// metadata (point counts) so the dropdown UX stays cheap; this endpoint
// is hit on demand when a snapshot is selected for preview.
adminStatusRouter.get('/map-backups/:sn/:filename/polygons', (req: AuthRequest, res: Response) => {
  const { sn, filename } = req.params;
  try {
    const p = backupPath(sn, filename);
    if (!fs.existsSync(p)) {
      res.status(404).json({ error: 'backup not found' });
      return;
    }
    const parsed = parseMapZip(p);
    if (!parsed) {
      res.status(400).json({ error: 'failed to parse backup ZIP' });
      return;
    }

    const maps = parsed.areas
      .filter(a => Array.isArray(a.points) && a.points.length >= 2)
      .map(a => ({
        mapName: areaCanonicalName(a),
        canonicalName: areaCanonicalName(a),
        mapType: a.type,
        mapArea: a.points.map(pt => ({ x: pt.x, y: pt.y })),
      }));

    res.json({
      maps,
      chargingPose: parsed.chargingPose ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'unknown error' });
  }
});

// POST /api/admin-status/map-backups/:sn/:filename/restore — selective DB restore
//
// Each item may carry an optional `overwrite` flag:
//   { canonicalName, type, overwrite?: boolean }
//
// Behaviour per item:
//   - Not in ZIP           → skippedNotInBackup++
//   - In ZIP, < 2 pts      → skippedNotInBackup++
//   - In ZIP, no DB row    → INSERT                   → restored++
//   - In ZIP, has DB row, overwrite=true  → DELETE + INSERT → overwritten++
//   - In ZIP, has DB row, overwrite falsy → skip            → skippedExisting++
adminStatusRouter.post('/map-backups/:sn/:filename/restore', (req: AuthRequest, res: Response) => {
  const { sn, filename } = req.params;
  const items = (req.body?.items ?? []) as Array<{ canonicalName: string; type: string; overwrite?: boolean }>;

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'items array required' });
    return;
  }

  try {
    const p = backupPath(sn, filename);
    if (!fs.existsSync(p)) {
      res.status(404).json({ error: 'backup not found' });
      return;
    }
    const parsed = parseMapZip(p);
    if (!parsed) {
      res.status(400).json({ error: 'failed to parse backup ZIP' });
      return;
    }

    let restored = 0;
    let overwritten = 0;
    let skippedExisting = 0;
    let skippedNotInBackup = 0;

    for (const want of items) {
      // Find matching area in parsed ZIP
      const area = parsed.areas.find(a =>
        a.type === want.type && areaCanonicalName(a) === want.canonicalName,
      );
      if (!area || area.points.length < 2) { skippedNotInBackup++; continue; }

      // Check if a row with same (mower_sn, canonical_name) already exists
      const existing = mapRepo.findBySnAndCanonical(sn, want.canonicalName);

      if (existing) {
        if (want.overwrite === true) {
          // Delete the existing row then fall through to INSERT
          mapRepo.deleteByIdAndMower(existing.map_id, sn);
          overwritten++;
        } else {
          skippedExisting++;
          continue;
        }
      } else {
        restored++;
      }

      const mapId = uuidv4();
      const xs = area.points.map(pt => pt.x);
      const ys = area.points.map(pt => pt.y);

      mapRepo.create({
        map_id: mapId,
        mower_sn: sn,
        map_name: want.canonicalName,
        file_name: areaCsvFile(area),
        map_area: JSON.stringify(area.points),
        map_max_min: JSON.stringify({
          minX: Math.min(...xs), maxX: Math.max(...xs),
          minY: Math.min(...ys), maxY: Math.max(...ys),
        }),
        map_type: want.type,
        canonical_name: want.canonicalName,
      });
    }

    console.log(`[Admin] Map restore for ${sn}: ${restored} restored, ${overwritten} overwritten, ${skippedExisting} skippedExisting, ${skippedNotInBackup} skippedNotInBackup`);
    res.json({ ok: true, restored, overwritten, skippedExisting, skippedNotInBackup });
  } catch (err) {
    console.error('[Admin] Map restore failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'restore failed' });
  }
});

// POST /api/admin-status/map-backups/:sn/:filename/restore-and-realign
//
// One-click recovery (Novabot-uvf): orchestrates everything documented in
// docs/runbooks/charger-anchor-restore-runbook.md and the manual flow from
// 2026-05-02:
//   1. Full DB restore from selected backup ZIP (overwrites all rows).
//   2. Look up polygon anchor (first point of mapNtocharge_unicom).
//   3. Update map_calibration.charger_lat/lng with mower's live RTK GPS.
//   4. regenerateLatestZipFromBackup → enriched <SN>_latest.zip.
//   5. publishToExtended(sn, { sync_map: {} }) → mower pulls + applies.
//   6. Wait sync_map_respond ≤ 8 s.
//
// Spec: docs/superpowers/specs/2026-05-03-restore-and-realign-mower-from-zip.md
adminStatusRouter.post('/map-backups/:sn/:filename/restore-and-realign', async (req: AuthRequest, res: Response) => {
  const { sn, filename } = req.params;

  // ── 1. Validate backup + parse ──────────────────────────────────────────
  let backupAbsPath: string;
  try {
    backupAbsPath = backupPath(sn, filename);
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'bad filename' });
    return;
  }
  if (!fs.existsSync(backupAbsPath)) {
    res.status(404).json({ ok: false, error: 'backup not found' });
    return;
  }
  const parsed = parseMapZip(backupAbsPath);
  if (!parsed) {
    res.status(400).json({ ok: false, error: 'failed to parse backup ZIP' });
    return;
  }

  // ── 2. Full DB restore — overwrite all rows ─────────────────────────────
  let restored = 0;
  for (const area of parsed.areas) {
    if (area.points.length < 2) continue;
    const canonical = areaCanonicalName(area);
    if (!canonical) continue;

    const existing = mapRepo.findBySnAndCanonical(sn, canonical);
    if (existing) mapRepo.deleteByIdAndMower(existing.map_id, sn);

    const xs = area.points.map(pt => pt.x);
    const ys = area.points.map(pt => pt.y);
    mapRepo.create({
      map_id: uuidv4(),
      mower_sn: sn,
      map_name: canonical,
      file_name: areaCsvFile(area),
      map_area: JSON.stringify(area.points),
      map_max_min: JSON.stringify({
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
      }),
      map_type: area.type,
      canonical_name: canonical,
    });
    restored++;
  }

  // ── 3. Resolve polygon anchor (must succeed for realign to be coherent) ─
  const sensors = deviceCache.get(sn);
  const anchor = getPolygonAnchor(sn, sensors);
  if (!anchor) {
    res.status(400).json({
      ok: false,
      error: 'Backup has no mapNtocharge_unicom — cannot anchor charger pose',
      restoredItems: restored,
    });
    return;
  }

  // ── 4. Read mower live GPS (mandatory) ──────────────────────────────────
  const lat = parseFloat(sensors?.get('gps_latitude') ?? '');
  const lng = parseFloat(sensors?.get('gps_longitude') ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    res.status(400).json({
      ok: false,
      error: 'Mower GPS not reported — wait for mower to be online + on dock + RTK FIX',
      restoredItems: restored,
    });
    return;
  }

  // ── 5. Update DB chargerGps to live reading ─────────────────────────────
  mapRepo.setChargerGps(sn, lat, lng);

  // ── 6. Regenerate enriched _latest.zip ──────────────────────────────────
  const regenPath = regenerateLatestZipFromBackup(sn);
  if (!regenPath) {
    res.status(500).json({
      ok: false,
      error: 'Failed to regenerate <SN>_latest.zip',
      restoredItems: restored,
      anchor,
    });
    return;
  }

  // ── 7. Trigger sync_map MQTT (must be online) ───────────────────────────
  if (!isDeviceOnline(sn)) {
    res.status(404).json({
      ok: false,
      error: 'Mower offline — sync_map cannot run',
      restoredItems: restored,
      anchor,
      gps: { lat, lng },
      note: 'Server-side state already restored; mower will pick up on next sync_map trigger',
    });
    return;
  }

  const syncResult = await new Promise<{ ok: boolean; respond?: Record<string, unknown>; timeout?: boolean }>((resolve) => {
    let settled = false;
    const handler = (data: Record<string, unknown>) => {
      const respond = data.sync_map_respond as Record<string, unknown> | undefined;
      if (!respond) return;
      if (settled) return;
      settled = true;
      offExtendedResponse(sn, handler);
      resolve({ ok: respond.result === 0, respond });
    };
    onExtendedResponse(sn, handler);
    publishToExtended(sn, { sync_map: {} });
    setTimeout(() => {
      if (settled) return;
      settled = true;
      offExtendedResponse(sn, handler);
      resolve({ ok: false, timeout: true });
    }, 8000);
  });

  if (syncResult.timeout) {
    res.status(504).json({
      ok: false,
      error: 'Mower did not respond within 8s',
      restoredItems: restored,
      anchor,
      gps: { lat, lng },
      partial: true,
    });
    return;
  }

  // After sync_map writes the CSVs (and map.yaml/pgm/png from the ZIP if
  // those were included), trigger save_map type:1 as a safety net so the
  // mower re-renders the map artifacts from the freshly applied CSVs.
  // Stale restored ZIPs can carry mismatched yaml/pgm; this re-render
  // guarantees Errors 107/118 don't surface immediately after a restore.
  // Fire-and-forget — caller doesn't need the respond.
  if (syncResult.ok) {
    publishToDevice(sn, { save_map: { type: 1, mapName: 'map', totalArea: 0 } });
    console.log(`[Admin] restore-and-realign ${sn}: post-sync save_map type:1 dispatched to render map.yaml/pgm`);
    // Per-map slot files (map<N>.yaml/.pgm/.png) — mapping-node only
    // emits these inside a real edge-recording session; recovery callers
    // never go through that path. Mirror map.yaml/pgm/png into each
    // map<N> slot via the custom extended_commands handler so Nav2 can
    // resolve `start_navigation` lookups for any work-map without
    // hitting Error 107. Small delay so save_map type:1 finishes
    // writing map.yaml before we copy from it.
    setTimeout(() => {
      publishToExtended(sn, { regenerate_per_map_files: {} });
      console.log(`[Admin] restore-and-realign ${sn}: regenerate_per_map_files dispatched`);
    }, 3000);
  }

  console.log(
    `[Admin] restore-and-realign ${sn} from ${filename}: restored=${restored} anchor=(${anchor.x}, ${anchor.y}, ${anchor.orientation}) gps=(${lat}, ${lng}) syncOk=${syncResult.ok}`,
  );
  res.json({
    ok: syncResult.ok,
    restoredItems: restored,
    anchor,
    gps: { lat, lng },
    syncResult: syncResult.respond ?? null,
  });
});

// ── Portable map export ──────────────────────────────────────────────────────

// ── Portable backup vault (auto + manual snapshots) ────────────────────────
// GET    /maps/:sn/portable-backups                  — list
// POST   /maps/:sn/portable-backups                  — manual snapshot now
// GET    /maps/:sn/portable-backups/:filename        — download
// DELETE /maps/:sn/portable-backups/:filename        — remove
// POST   /maps/:sn/portable-backups/:filename/restore — apply via wizard
adminStatusRouter.get('/maps/:sn/portable-backups', async (req: AuthRequest, res: Response) => {
  const { listBackups } = await import('../services/portableBackup.js');
  res.json({ backups: listBackups(req.params.sn) });
});

adminStatusRouter.post('/maps/:sn/portable-backups', async (req: AuthRequest, res: Response) => {
  const { createBackup } = await import('../services/portableBackup.js');
  try {
    const entry = await createBackup(req.params.sn, 'manual');
    if (!entry) {
      res.status(409).json({ ok: false, error: 'backup creation failed (mower offline or no map data)' });
      return;
    }
    res.json({ ok: true, backup: entry });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

adminStatusRouter.get('/maps/:sn/portable-backups/:filename', async (req: AuthRequest, res: Response) => {
  const { readBackup } = await import('../services/portableBackup.js');
  const buf = readBackup(req.params.sn, req.params.filename);
  if (!buf) { res.status(404).json({ ok: false, error: 'not found' }); return; }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
  res.send(buf);
});

adminStatusRouter.delete('/maps/:sn/portable-backups/:filename', async (req: AuthRequest, res: Response) => {
  const { deleteBackup } = await import('../services/portableBackup.js');
  const ok = deleteBackup(req.params.sn, req.params.filename);
  res.json({ ok });
});

// Restore by piping the saved bundle through the existing import-portable
// + apply-exact endpoints. Server-side fan-out keeps the wizard logic single-
// sourced.
adminStatusRouter.post('/maps/:sn/portable-backups/:filename/restore', async (req: AuthRequest, res: Response) => {
  const { sn, filename } = req.params;
  const { readBackup } = await import('../services/portableBackup.js');
  const buf = readBackup(sn, filename);
  if (!buf) { res.status(404).json({ ok: false, error: 'backup not found' }); return; }

  // Use parseBundle directly + spin up a staging session so /apply-exact
  // can run unchanged. Avoids duplicating the transform pipeline.
  let parsed;
  try { parsed = await parseBundle(buf); }
  catch (e) {
    if (e instanceof BundleValidationError) { res.status(400).json({ ok: false, error: e.message }); return; }
    throw e;
  }
  const existing = importStaging.getActive(sn);
  if (existing) {
    res.status(409).json({ ok: false, error: `active import already in progress (${existing.stagingId})` });
    return;
  }
  const session = importStaging.create(sn, {
    sourceSn: parsed.metadata.sourceSn,
    polygonAreaM2: parsed.polygon.areaM2,
  });
  const dir = path.join(process.env.STORAGE_PATH ?? './storage', 'imports', sn, session.stagingId);
  fs.writeFileSync(path.join(dir, 'bundle.json'), JSON.stringify(parsed));
  res.json({
    ok: true,
    stagingId: session.stagingId,
    state: session.state,
    exactRestore: !!(parsed.mowerFiles && parsed.metadata?.originalChargingPose),
    note: 'staging created — POST /apply-exact next',
  });
});

// GET /api/admin-status/maps/:sn/export-portable
adminStatusRouter.get('/maps/:sn/export-portable', async (req: AuthRequest, res: Response) => {
  const sn = req.params.sn;
  const cal = mapRepo.getCalibration(sn);
  if (!cal?.charger_lat || !cal?.charger_lng) {
    res.status(409).json({ ok: false, error: 'no charger anchor in DB — sync_map first' });
    return;
  }
  const workRows = mapRepo.findAllByMowerSnAndType(sn, 'work').filter((w) => w.map_area);
  if (workRows.length === 0) { res.status(404).json({ ok: false, error: 'no work polygon' }); return; }
  const obstacles = mapRepo.findAllByMowerSnAndType(sn, 'obstacle');
  const unicom = mapRepo.findAllByMowerSnAndType(sn, 'unicom');

  // Fetch verbatim mower files (CSVs + charging_station.yaml + map_info.json
  // with REAL charging_pose) live via MQTT extended `read_map_files`. Falls
  // back gracefully when the mower is offline or doesn't have the handler:
  // bundle still ships with DB-derived polygons, just without the
  // exact-restore mower payload. Requires custom firmware (extended_commands.py).
  const mowerData = await new Promise<{
    csvFiles?: Record<string, string>;
    chargingStationYaml?: string;
    chargingPose?: { x: number; y: number; orientation: number };
  }>((resolve) => {
    let settled = false;
    const handler = (data: Record<string, unknown>) => {
      const r = data.read_map_files_respond as {
        result?: number;
        csv_files?: Record<string, string>;
        charging_station_yaml?: string;
      } | undefined;
      if (!r) return;
      if (settled) return;
      settled = true;
      offExtendedResponse(sn, handler);
      if (r.result !== 0) {
        resolve({});
        return;
      }
      // Pull charging_pose out of the shipped map_info.json so the bundle
      // metadata records what the mower actually had on disk at export
      // time — not what the DB calibration field claims (which has drifted
      // historically per polygon-rotation-bug.md).
      let chargingPose: { x: number; y: number; orientation: number } | undefined;
      const mapInfoStr = r.csv_files?.['map_info.json'];
      if (mapInfoStr) {
        try {
          const mi = JSON.parse(mapInfoStr) as { charging_pose?: { x: number; y: number; orientation: number } };
          if (mi.charging_pose
            && Number.isFinite(mi.charging_pose.x)
            && Number.isFinite(mi.charging_pose.y)
            && Number.isFinite(mi.charging_pose.orientation)) {
            chargingPose = mi.charging_pose;
          }
        } catch { /* malformed map_info.json — skip */ }
      }
      resolve({
        csvFiles: r.csv_files,
        chargingStationYaml: r.charging_station_yaml,
        chargingPose,
      });
    };
    onExtendedResponse(sn, handler);
    publishToExtended(sn, { read_map_files: {} });
    setTimeout(() => {
      if (settled) return;
      settled = true;
      offExtendedResponse(sn, handler);
      resolve({});
    }, 8000);
  });

  // Prefer the LIVE charging_pose (from map_info.json on disk) over the DB
  // field — DB has dual-meaning drift history (see polygon-rotation-bug.md).
  const fallbackOrient = mapRepo.getPolygonChargingOrientation(sn);
  const chargingPose = mowerData.chargingPose ?? {
    x: 0, y: 0, orientation: fallbackOrient ?? 0,
  };

  const zip = await exportBundle({
    sn,
    chargerLat: cal.charger_lat,
    chargerLng: cal.charger_lng,
    rtkQuality: null,
    chargingPose,
    workMaps: workRows.map((w, i) => ({
      canonical: w.canonical_name ?? `map${i}`,
      alias: w.map_name ?? `work${i}`,
      points: JSON.parse(w.map_area as string),
    })),
    obstacles: obstacles.filter((o) => o.map_area).map((o) => ({
      canonical: o.canonical_name ?? '',
      alias: o.map_name ?? '',
      points: JSON.parse(o.map_area as string),
    })),
    unicom: unicom.filter((u) => u.map_area).map((u) => {
      const m = (u.canonical_name ?? '').match(/^map\d+to(.+?)_?unicom$/);
      return {
        canonical: u.canonical_name ?? '',
        targetMapName: m?.[1] ?? 'charge',
        points: JSON.parse(u.map_area as string),
      };
    }),
    csvFilesRaw: mowerData.csvFiles,
    chargingStationYaml: mowerData.chargingStationYaml,
  });

  const fname = `${sn}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}-portable.novabotmap`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.send(zip);
});

// POST /api/admin-status/maps/:sn/import-portable
adminStatusRouter.post(
  '/maps/:sn/import-portable',
  bundleUpload.single('bundle'),
  async (req: AuthRequest, res: Response) => {
    const sn = req.params.sn;
    if (!req.file) { res.status(400).json({ ok: false, error: 'bundle file required' }); return; }
    const active = importStaging.getActive(sn);
    if (active) {
      res.status(409).json({ ok: false, error: 'active import already in progress', stagingId: active.stagingId });
      return;
    }
    let parsed;
    try { parsed = await parseBundle(req.file.buffer); }
    catch (e) {
      if (e instanceof BundleValidationError) { res.status(400).json({ ok: false, error: e.message }); return; }
      throw e;
    }
    const session = importStaging.create(sn, {
      sourceSn: parsed.metadata.sourceSn,
      polygonAreaM2: parsed.polygon.areaM2,
    });
    // Persist the parsed bundle alongside state.json for later steps
    const dir = path.join(process.env.STORAGE_PATH ?? './storage', 'imports', sn, session.stagingId);
    fs.writeFileSync(path.join(dir, 'bundle.json'), JSON.stringify(parsed));
    importAuditRepo.append({ sn, staging_id: session.stagingId, from_state: '_NONE_', to_state: 'UPLOADED', reason: null });
    // Exact-restore = bundle ships verbatim mower files + valid charging_pose.
    // Wizard can skip the RTK drive-back step and snapshot the dock pose
    // directly because Δ rotation is computed from the stored vs current
    // charging_pose (no need to derive heading from a GPS drive vector).
    const exactRestore = !!(parsed.mowerFiles && parsed.metadata?.originalChargingPose
      && Number.isFinite(parsed.metadata.originalChargingPose.orientation));
    res.json({
      ok: true,
      stagingId: session.stagingId,
      state: session.state,
      exactRestore,
    });
  },
);

// ── Portable map import — staged endpoints (Tasks 11-15) ────────────────────

// GET /api/admin-status/maps/:sn/import-portable/active
// NOTE: must be registered BEFORE /:stagingId/... routes to avoid Express
// matching "active" as a stagingId.
adminStatusRouter.get('/maps/:sn/import-portable/active', (req: AuthRequest, res: Response) => {
  const sn = req.params.sn;
  const active = importStaging.getActive(sn);
  if (!active) { res.json({ stagingId: null, state: null }); return; }
  // Surface exactRestore so the wizard can hide the drive-back step.
  let exactRestore = false;
  try {
    const dir = path.join(process.env.STORAGE_PATH ?? './storage', 'imports', sn, active.stagingId);
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'bundle.json'), 'utf8'));
    exactRestore = !!(parsed?.mowerFiles && parsed?.metadata?.originalChargingPose
      && Number.isFinite(parsed.metadata.originalChargingPose.orientation));
  } catch { /* bundle missing — leave exactRestore false */ }
  res.json({ stagingId: active.stagingId, state: active.state, exactRestore });
});

// GET /api/admin-status/maps/:sn/import-portable/:stagingId/inventory
//
// Lists every file in the staged bundle classified into work / obstacle /
// unicom / meta / dock categories, plus the same classification of files
// currently on the mower (via MQTT extended `read_map_files`). The import
// wizard's selective-apply step uses this to render checkboxes per
// category and detect collisions for add-only mode.
adminStatusRouter.get(
  '/maps/:sn/import-portable/:stagingId/inventory',
  async (req: AuthRequest, res: Response) => {
    const { sn, stagingId } = req.params;
    const session = importStaging.get(stagingId);
    if (!session || session.sn !== sn) {
      res.status(404).json({ ok: false, error: 'unknown staging session' });
      return;
    }

    const dir = path.join(process.env.STORAGE_PATH ?? './storage', 'imports', sn, stagingId);
    let bundle: { csvFiles: Record<string, string>; chargingStationYaml: string | null };
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'bundle.json'), 'utf8'));
      bundle = {
        csvFiles: (parsed.mowerFiles?.csvFiles as Record<string, string> | undefined) ?? {},
        chargingStationYaml: (parsed.mowerFiles?.chargingStationYaml as string | null | undefined) ?? null,
      };
    } catch (err) {
      res.status(500).json({ ok: false, error: `failed to read staging bundle: ${(err as Error).message}` });
      return;
    }

    const bundleClass = classifyBundle(bundle);

    // Mower-side enumeration is best-effort. Offline mower → empty list,
    // operator can still proceed in "replace" mode (overwrites whatever
    // is there). For "add-only" the UI should refuse to apply when the
    // mower list is empty (server-side enforcement happens at apply time
    // via a fresh read_map_files call against the live state).
    let mowerSide: ClassifyResult | null = null;
    if (isDeviceOnline(sn)) {
      const mowerData = await new Promise<{ csvFiles?: Record<string, string>; chargingStationYaml?: string | null }>(resolve => {
        let settled = false;
        const handler = (data: Record<string, unknown>) => {
          const r = data.read_map_files_respond as
            | { result?: number; csv_files?: Record<string, string>; charging_station_yaml?: string }
            | undefined;
          if (!r || settled) return;
          settled = true;
          offExtendedResponse(sn, handler);
          if (r.result !== 0) { resolve({}); return; }
          resolve({ csvFiles: r.csv_files, chargingStationYaml: r.charging_station_yaml ?? null });
        };
        onExtendedResponse(sn, handler);
        publishToExtended(sn, { read_map_files: {} });
        setTimeout(() => {
          if (settled) return;
          settled = true;
          offExtendedResponse(sn, handler);
          resolve({});
        }, 8000);
      });
      if (mowerData.csvFiles) {
        mowerSide = classifyBundle({
          csvFiles: mowerData.csvFiles,
          chargingStationYaml: mowerData.chargingStationYaml ?? null,
        });
      }
    }

    res.json({
      ok: true,
      stagingId,
      bundle: bundleClass,
      mower: mowerSide,
    });
  },
);

// POST /api/admin-status/maps/:sn/import-portable/:stagingId/start-drive
// Drive the mower 1 m backward off the dock and derive heading from RTK delta.
// No pre-RTK requirement: the act of driving away from the dock typically
// upgrades loc_quality from FLOAT to FIX once the mower clears the charger
// metal and gets clean sky. We snapshot start pose immediately (whatever
// quality is available), drive, then poll for RTK FIX up to 30 s before
// snapshotting end pose. If RTK never reaches 100, abort with reason.
adminStatusRouter.post(
  '/maps/:sn/import-portable/:stagingId/start-drive',
  async (req: AuthRequest, res: Response) => {
    const { sn, stagingId } = req.params;
    const session = importStaging.get(stagingId);
    if (!session || session.sn !== sn) {
      res.status(404).json({ ok: false, error: 'unknown staging session' });
      return;
    }
    if (session.state !== 'UPLOADED') {
      res.status(409).json({ ok: false, error: `wrong state ${session.state}` });
      return;
    }

    const sensors = deviceCache.get(sn);
    const startLat = parseFloat(sensors?.get('latitude') ?? '');
    const startLng = parseFloat(sensors?.get('longitude') ?? '');
    if (!Number.isFinite(startLat) || !Number.isFinite(startLng)) {
      res.status(409).json({ ok: false, error: 'no GPS for start_pose' });
      return;
    }

    // Don't transition yet — keep state in UPLOADED until we know the
    // drive + RTK lock actually succeeded. On failure we leave the staging
    // session intact so the operator can retry "Start drive" without
    // re-uploading the bundle.
    importAuditRepo.append({ sn, staging_id: stagingId, from_state: 'UPLOADED', to_state: 'UPLOADED', reason: 'drive started' });

    // Stock MQTT joystick wire format (matches socketHandler.ts):
    //   start_move:4 = backward direction enum
    //   mst array [x_w*100, y_v*100, 8] every 150ms (signed; -y = backward)
    //   start_move keepalive every 5 ticks
    //   stop_move:null on stop
    publishToDevice(sn, { start_move: 4 });
    await new Promise((r) => setTimeout(r, 200));
    const TICK_MS = 150;
    const TOTAL_TICKS = 20;
    const Y_V_BACKWARD = -50;
    for (let i = 0; i < TOTAL_TICKS; i++) {
      publishToDevice(sn, { mst: [0, Y_V_BACKWARD, 8] });
      if (i > 0 && i % 5 === 0) {
        publishToDevice(sn, { start_move: 4 });
      }
      await new Promise((r) => setTimeout(r, TICK_MS));
    }
    publishToDevice(sn, { stop_move: null });
    await new Promise((r) => setTimeout(r, 500));

    // Wait for RTK FIX before reading end pose. Polls the sensor cache every
    // 1 s for up to 30 s. If RTK never reaches 100 → bail out with the best
    // available quality so the operator can decide whether to retry.
    let waitedMs = 0;
    let endLocQ = parseInt(sensors?.get('loc_quality') ?? '', 10);
    while (endLocQ !== 100 && waitedMs < 30_000) {
      await new Promise((r) => setTimeout(r, 1000));
      waitedMs += 1000;
      endLocQ = parseInt(sensors?.get('loc_quality') ?? '', 10);
    }

    const endLat = parseFloat(sensors?.get('latitude') ?? '');
    const endLng = parseFloat(sensors?.get('longitude') ?? '');
    const heading = deriveHeading({ lat: startLat, lng: startLng }, { lat: endLat, lng: endLng });
    if (heading.shortDistance || endLocQ !== 100) {
      // Drive failed but recoverable: stay in UPLOADED, operator can retry.
      const reason = heading.shortDistance
        ? `drive distance ${heading.distanceM.toFixed(2)}m below 0.3m threshold`
        : `RTK FIX never reached after ${waitedMs / 1000}s wait (loc_quality=${endLocQ})`;
      importAuditRepo.append({ sn, staging_id: stagingId, from_state: 'UPLOADED', to_state: 'UPLOADED', reason });
      res.status(409).json({ ok: false, error: reason, recoverable: true });
      return;
    }

    // Mower drove backward → flip GPS heading by π to recover forward heading.
    const TWO_PI = Math.PI * 2;
    const forwardHeadingRad = ((heading.headingRad + Math.PI + Math.PI) % TWO_PI) - Math.PI;

    // Drive + RTK both OK: transition UPLOADED → AUTO_DOCK in one go.
    const updated = importStaging.transition(stagingId, 'AUTO_DOCK', {
      driveStart: { lat: startLat, lng: startLng },
      driveEnd: { lat: endLat, lng: endLng },
      derivedHeadingRad: forwardHeadingRad,
    });
    importAuditRepo.append({ sn, staging_id: stagingId, from_state: 'UPLOADED', to_state: 'AUTO_DOCK', reason: null });
    res.json({
      ok: true, state: updated.state,
      derivedHeadingRad: forwardHeadingRad,
      distanceM: heading.distanceM,
      rtkWaitMs: waitedMs,
    });
  },
);

// POST /api/admin-status/maps/:sn/import-portable/:stagingId/auto-dock
// Operator manually returns the mower to the dock (push or Control-tab
// joystick). Server verifies battery_state CHARGING + RTK FIX, snapshots
// the dock GPS as new charger anchor.
//
// We tried save_recharge_pos for ArUco-only auto-dock — firmware rejects
// it outside an active scan_map session (returns result:1 dis:0 immediately).
// go_to_charge requires a loaded polygon (Error 107 if csv_file/ wiped).
// Manual return is the only path that works in any state, so that's what
// the import flow uses today. ArUco automation can be revisited later if
// we find a firmware command that triggers it without scan-state.
adminStatusRouter.post(
  '/maps/:sn/import-portable/:stagingId/auto-dock',
  async (req: AuthRequest, res: Response) => {
    const { sn, stagingId } = req.params;
    const session = importStaging.get(stagingId);
    if (!session || session.sn !== sn) {
      res.status(404).json({ ok: false, error: 'unknown staging session' });
      return;
    }
    // Allow direct UPLOADED→ANCHOR_SET for exact-restore bundles (Δ rotation
    // from stored vs current charging_pose makes the drive-back step
    // unnecessary). Legacy bundles still go UPLOADED→AUTO_DOCK→ANCHOR_SET.
    if (session.state !== 'AUTO_DOCK' && session.state !== 'UPLOADED') {
      res.status(409).json({ ok: false, error: `wrong state ${session.state}` });
      return;
    }

    const sensors = deviceCache.get(sn);
    const batt = (sensors?.get('battery_state') ?? '').toUpperCase();
    const locQ = parseInt(sensors?.get('loc_quality') ?? '', 10);
    const lat = parseFloat(sensors?.get('latitude') ?? '');
    const lng = parseFloat(sensors?.get('longitude') ?? '');

    if (!batt.includes('CHARGING') && !batt.includes('FINISHED')) {
      res.status(409).json({
        ok: false, recoverable: true,
        error: `mower not on dock — battery_state=${batt || 'unknown'} (need CHARGING)`,
      });
      return;
    }
    if (locQ !== 100) {
      res.status(409).json({
        ok: false, recoverable: true,
        error: `RTK FIX required at dock — loc_quality=${locQ}`,
      });
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(409).json({ ok: false, recoverable: true, error: 'no GPS in sensor cache' });
      return;
    }

    // Capture the mower's CURRENT map_position too — /confirm uses it to
    // translate the rebased polygon so the unicom anchor lines up with
    // where firmware reports the dock. Without this the polygon ends up
    // rotated correctly but shifted by whatever offset the original map
    // had between its (0,0) origin and the dock.
    const mx = parseFloat(sensors?.get('map_position_x') ?? '');
    const my = parseFloat(sensors?.get('map_position_y') ?? '');
    const mo = parseFloat(sensors?.get('map_position_orientation') ?? '');
    if (!Number.isFinite(mx) || !Number.isFinite(my)) {
      res.status(409).json({ ok: false, recoverable: true, error: 'no map_position in sensor cache' });
      return;
    }

    const updated = importStaging.transition(stagingId, 'ANCHOR_SET', {
      newCharger: { lat, lng },
      newDockMapPosition: { x: mx, y: my, orientation: Number.isFinite(mo) ? mo : 0 },
    });
    importAuditRepo.append({ sn, staging_id: stagingId, from_state: 'AUTO_DOCK', to_state: 'ANCHOR_SET', reason: null });
    res.json({
      ok: true, state: updated.state,
      newCharger: updated.context.newCharger,
    });
  },
);

// GET /api/admin-status/maps/:sn/import-portable/:stagingId/preview
// Returns a GeoJSON FeatureCollection of the rebased polygon for Leaflet overlay.
adminStatusRouter.get(
  '/maps/:sn/import-portable/:stagingId/preview',
  (req: AuthRequest, res: Response) => {
    const { sn, stagingId } = req.params;
    const session = importStaging.get(stagingId);
    if (!session || session.sn !== sn) {
      res.status(404).json({ ok: false, error: 'unknown' });
      return;
    }
    if (session.state !== 'ANCHOR_SET' && session.state !== 'PREVIEW_SHOWN') {
      res.status(409).json({ ok: false, error: `wrong state ${session.state}` });
      return;
    }
    const dir = path.join(process.env.STORAGE_PATH ?? './storage', 'imports', sn, stagingId);
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'bundle.json'), 'utf8'));
    // Rotation is the DELTA between the new dock heading we just measured
    // and the old dock heading captured in the bundle metadata. Re-importing
    // on the same mower (same orientation as export) → delta ~0, polygon
    // stays put. Importing on a different machine where dock is rotated
    // 90° → delta = π/2. Using the full derivedHeadingRad would over-rotate
    // by `originalChargingPose.orientation`, which is what produced the
    // 85°/quarter-turn drift observed live on LFIN1231000211 2026-05-07.
    const origOrient = parsed.metadata?.originalChargingPose?.orientation ?? 0;
    // Live rotation override: ?rotateDeg=<deg> lets the operator preview
    // alternate orientations when the bundle's stored frame is mis-aligned
    // with real-world ENU. Without override falls back to delta math.
    const rotateOverrideDeg = req.query.rotateDeg !== undefined
      ? parseFloat(String(req.query.rotateDeg))
      : null;
    const theta = rotateOverrideDeg !== null && Number.isFinite(rotateOverrideDeg)
      ? (rotateOverrideDeg * Math.PI) / 180
      : (session.context.derivedHeadingRad ?? 0) - origOrient;
    // Live offset override: shifts polygon AFTER rotation+anchor-translate.
    // Use to nudge into place when bundle's polygon sits off real world by
    // a known displacement (e.g. mower remapped from a different start point).
    const offsetXm = req.query.offsetX !== undefined ? parseFloat(String(req.query.offsetX)) : 0;
    const offsetYm = req.query.offsetY !== undefined ? parseFloat(String(req.query.offsetY)) : 0;
    const anchor = session.context.newCharger!;
    // WGS84-aware m/deg — replaces flat 111320 constant (issue #53).
    const mLat = metersPerDegLat(anchor.lat);
    const mLng = metersPerDegLng(anchor.lat);
    // Rotate + translate so the unicom anchor lines up with the new charger
    // GPS — same math as /confirm, kept in lockstep so the on-screen
    // overlay matches what gets written to the DB.
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const firstUnicomRaw = (parsed.unicom[0]?.points?.[0] ?? { x: 0, y: 0 }) as { x: number; y: number };
    const rotatedAnchor = {
      x: firstUnicomRaw.x * cosT + firstUnicomRaw.y * sinT,
      y: -firstUnicomRaw.x * sinT + firstUnicomRaw.y * cosT,
    };
    const project = (pts: { x: number; y: number }[]): [number, number][] => {
      return pts.map((p) => {
        const rx = p.x * cosT + p.y * sinT - rotatedAnchor.x + offsetXm;
        const ry = -p.x * sinT + p.y * cosT - rotatedAnchor.y + offsetYm;
        return [anchor.lng + rx / mLng, anchor.lat + ry / mLat];
      });
    };
    const features: unknown[] = [];
    // Multi-map bundles (>= schema with polygons.json) expose every work
    // polygon in `parsed.polygons`. Older single-map bundles fall back to
    // the legacy `polygon` field — wrap into an array so the renderer
    // treats them uniformly.
    const workPolygons: Array<{ name: string; alias: string; points: { x: number; y: number }[] }> =
      Array.isArray(parsed.polygons) && parsed.polygons.length > 0 ? parsed.polygons : [parsed.polygon];
    for (const wp of workPolygons) {
      const workRing = project(wp.points);
      workRing.push(workRing[0]);
      features.push({ type: 'Feature', properties: { name: wp.alias, kind: 'work' }, geometry: { type: 'Polygon', coordinates: [workRing] } });
    }
    for (const o of parsed.obstacles) {
      const ring = project(o.points);
      ring.push(ring[0]);
      features.push({ type: 'Feature', properties: { name: o.alias, kind: 'obstacle' }, geometry: { type: 'Polygon', coordinates: [ring] } });
    }
    for (const u of parsed.unicom) {
      features.push({ type: 'Feature', properties: { name: u.targetMapName, kind: 'unicom' }, geometry: { type: 'LineString', coordinates: project(u.points) } });
    }
    importStaging.transition(stagingId, 'PREVIEW_SHOWN', {});
    importAuditRepo.append({ sn, staging_id: stagingId, from_state: session.state, to_state: 'PREVIEW_SHOWN', reason: null });
    res.json({ type: 'FeatureCollection', features });
  },
);

// POST /api/admin-status/maps/:sn/import-portable/:stagingId/confirm
// Final commit: write polygon to DB, push set_pos_origin + sync_map to mower.
adminStatusRouter.post(
  '/maps/:sn/import-portable/:stagingId/confirm',
  async (req: AuthRequest, res: Response) => {
    const { sn, stagingId } = req.params;
    const session = importStaging.get(stagingId);
    if (!session || session.sn !== sn) {
      res.status(404).json({ ok: false, error: 'unknown' });
      return;
    }
    if (session.state !== 'PREVIEW_SHOWN') {
      res.status(409).json({ ok: false, error: `wrong state ${session.state}` });
      return;
    }

    importStaging.transition(stagingId, 'USER_CONFIRMED', {});
    importAuditRepo.append({ sn, staging_id: stagingId, from_state: 'PREVIEW_SHOWN', to_state: 'USER_CONFIRMED', reason: null });

    const dir = path.join(process.env.STORAGE_PATH ?? './storage', 'imports', sn, stagingId);
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'bundle.json'), 'utf8'));
    // See /preview for theta-delta rationale. Same formula here so the
    // committed polygon matches what the operator approved. /preview can
    // override rotation via ?rotateDeg, so accept the same in /confirm body
    // (or query) — the operator commits whatever they previewed.
    const origOrient = parsed.metadata?.originalChargingPose?.orientation ?? 0;
    const rotateOverrideDegRaw = (req.body?.rotateDeg ?? req.query?.rotateDeg);
    const rotateOverrideDeg = rotateOverrideDegRaw !== undefined && rotateOverrideDegRaw !== null && rotateOverrideDegRaw !== ''
      ? parseFloat(String(rotateOverrideDegRaw))
      : null;
    const theta = rotateOverrideDeg !== null && Number.isFinite(rotateOverrideDeg)
      ? (rotateOverrideDeg * Math.PI) / 180
      : (session.context.derivedHeadingRad ?? 0) - origOrient;
    const offsetXmRaw = (req.body?.offsetX ?? req.query?.offsetX);
    const offsetYmRaw = (req.body?.offsetY ?? req.query?.offsetY);
    const offsetXm = offsetXmRaw !== undefined && offsetXmRaw !== null && offsetXmRaw !== '' ? parseFloat(String(offsetXmRaw)) : 0;
    const offsetYm = offsetYmRaw !== undefined && offsetYmRaw !== null && offsetYmRaw !== '' ? parseFloat(String(offsetYmRaw)) : 0;
    const anchor = session.context.newCharger!;
    const dockMP = session.context.newDockMapPosition;

    // Update charger anchor + orientation in DB. polygon_charging_orientation
    // holds the absolute new dock heading (not the rebase delta) — this is
    // what gets exported next time as `originalChargingPose.orientation`.
    mapRepo.setChargerGps(sn, anchor.lat, anchor.lng);
    mapRepo.setPolygonChargingOrientation(sn, session.context.derivedHeadingRad ?? 0);
    mapRepo.setPolygonOffset(sn, 0, 0);

    // Polygon rebase = rotation by derived θ + translation so the unicom
    // anchor lands exactly at the mower's current map_position at the dock.
    // Without the translation, the bundle's original "charger in old map
    // frame" coords (e.g. (-1.21, 0.48)) end up wherever the rotation moves
    // them to — typically NOT where the firmware's localization places
    // the dock — and mowing then drives off-target by the unmatched offset.
    const firstUnicomRaw = (parsed.unicom[0]?.points?.[0] ?? { x: 0, y: 0 }) as { x: number; y: number };
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const rotatedAnchor = {
      x: firstUnicomRaw.x * cos + firstUnicomRaw.y * sin,
      y: -firstUnicomRaw.x * sin + firstUnicomRaw.y * cos,
    };
    const tx = (dockMP?.x ?? 0) - rotatedAnchor.x + offsetXm;
    const ty = (dockMP?.y ?? 0) - rotatedAnchor.y + offsetYm;
    const rebase = (pts: { x: number; y: number }[]) =>
      computeAnchorRebase(pts, theta).map((p) => ({ x: p.x + tx, y: p.y + ty }));

    // Replace all polygon rows for this SN
    db.prepare(`DELETE FROM maps WHERE mower_sn = ?`).run(sn);
    const ins = db.prepare(
      `INSERT INTO maps (mower_sn, map_id, map_name, map_type, file_name, map_area, canonical_name) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const workPolygons: Array<{ name: string; alias: string; points: { x: number; y: number }[] }> =
      Array.isArray(parsed.polygons) && parsed.polygons.length > 0 ? parsed.polygons : [parsed.polygon];
    for (let wi = 0; wi < workPolygons.length; wi++) {
      const wp = workPolygons[wi];
      ins.run(sn, `imp_work_${wi}`, wp.alias, 'work', wp.name + '.csv', JSON.stringify(rebase(wp.points)), wp.name);
    }
    for (let i = 0; i < parsed.obstacles.length; i++) {
      const o = parsed.obstacles[i];
      ins.run(sn, `imp_obs_${i}`, o.alias, 'obstacle', o.name + '.csv', JSON.stringify(rebase(o.points)), o.name);
    }
    for (let i = 0; i < parsed.unicom.length; i++) {
      const u = parsed.unicom[i];
      ins.run(sn, `imp_uni_${i}`, u.targetMapName, 'unicom', u.name + '.csv', JSON.stringify(rebase(u.points)), u.name);
    }

    // Push new origin to mower then trigger sync_map
    publishToExtended(sn, { set_pos_origin: { lat: anchor.lat, lng: anchor.lng } });
    publishToExtended(sn, { sync_map: {} });

    // Synthesize map.png + map.yaml on the mower so start_navigation has a
    // raster to load. Portable import skips save_map type:1 (no real scan
    // session), and without these files coverage_planner aborts Error 107.
    // We pick the smallest empty raster that covers the rebased polygon
    // bbox + 2m margin and shift its origin so the polygon sits inside.
    const allPoints: { x: number; y: number }[] = [];
    for (const wp of workPolygons) allPoints.push(...rebase(wp.points));
    for (const o of parsed.obstacles) allPoints.push(...rebase(o.points));
    for (const u of parsed.unicom) allPoints.push(...rebase(u.points));
    if (allPoints.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of allPoints) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const margin = 2.0;
      const spanX = maxX - minX + 2 * margin;
      const spanY = maxY - minY + 2 * margin;
      const size = Math.max(spanX, spanY) > 30 ? 60 : 30;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const originX = cx - size / 2;
      const originY = cy - size / 2;
      publishToExtended(sn, {
        generate_empty_map: { origin_x: originX, origin_y: originY, size, index: 0 },
      });
    }

    // Exact-restore path: if the bundle ships with verbatim mower CSVs +
    // charging_station.yaml, push the transformed copies straight to disk
    // via the new MQTT extended write_map_files handler. This bypasses the
    // sync_map roundtrip and gives an identical-to-export firmware state
    // (modulo Δ rotation + translation aligning the polygon to the current
    // dock pose). Older bundles without these fields skip this block; the
    // legacy DB+sync_map path above remains the source of truth for them.
    const mowerFiles = parsed.mowerFiles as
      | { csvFiles: Record<string, string>; chargingStationYaml: string | null }
      | undefined;
    const origPose = parsed.metadata?.originalChargingPose as
      | { x: number; y: number; orientation: number }
      | undefined;
    if (mowerFiles && origPose && dockMP) {
      const dt = (dockMP.orientation ?? 0) - origPose.orientation;
      const cosDt = Math.cos(dt);
      const sinDt = Math.sin(dt);
      const transformPoint = (px: number, py: number): [number, number] => {
        const relX = px - origPose.x;
        const relY = py - origPose.y;
        const rx = relX * cosDt - relY * sinDt;
        const ry = relX * sinDt + relY * cosDt;
        return [rx + dockMP.x, ry + dockMP.y];
      };
      const transformedCsvs: Record<string, string> = {};
      for (const [fname, content] of Object.entries(mowerFiles.csvFiles)) {
        if (fname === 'map_info.json') {
          // Re-emit map_info with the NEW charging_pose so firmware sees
          // dock at its current frame position. Preserve other fields
          // (e.g. map<name>.csv map_size entries) verbatim.
          try {
            const mi = JSON.parse(content) as Record<string, unknown>;
            mi.charging_pose = {
              x: dockMP.x,
              y: dockMP.y,
              orientation: dockMP.orientation ?? 0,
            };
            transformedCsvs[fname] = JSON.stringify(mi, null, 3);
          } catch {
            transformedCsvs[fname] = content;
          }
          continue;
        }
        if (!fname.endsWith('.csv')) {
          transformedCsvs[fname] = content;
          continue;
        }
        // Point-data CSV — each line is "x,y" in OLD mower frame.
        const lines = content.split('\n');
        const out: string[] = [];
        for (const raw of lines) {
          const line = raw.trim();
          if (!line) { out.push(''); continue; }
          const parts = line.split(',');
          if (parts.length < 2) { out.push(line); continue; }
          const px = parseFloat(parts[0]);
          const py = parseFloat(parts[1]);
          if (!Number.isFinite(px) || !Number.isFinite(py)) {
            out.push(line);
            continue;
          }
          const [nx, ny] = transformPoint(px, py);
          out.push(`${nx.toFixed(2)},${ny.toFixed(2)}`);
        }
        transformedCsvs[fname] = out.join('\n');
      }
      const newYaml = `charging_pose: [${dockMP.x}, ${dockMP.y}, ${dockMP.orientation ?? 0}]\n`;
      publishToExtended(sn, {
        write_map_files: {
          csv_files: transformedCsvs,
          charging_station_yaml: newYaml,
          restart_mapping: false,
        },
      });
    }

    importStaging.transition(stagingId, 'APPLIED', { applyResult: {} });
    importAuditRepo.append({ sn, staging_id: stagingId, from_state: 'USER_CONFIRMED', to_state: 'APPLIED', reason: null });
    res.json({
      ok: true,
      state: 'APPLIED',
      exactRestore: !!(mowerFiles && origPose && dockMP),
    });
  },
);

// POST /api/admin-status/maps/:sn/import-portable/:stagingId/apply-exact
// One-click exact-restore: read mower's live charging_pose from sensor
// cache, compute Δ rotation+translation against bundle's stored
// originalChargingPose, transform every point in every CSV file, push
// the result to the mower via write_map_files. No drive, no manual
// snapshot, no preview/confirm — bundle ships everything we need.
adminStatusRouter.post(
  '/maps/:sn/import-portable/:stagingId/apply-exact',
  async (req: AuthRequest, res: Response) => {
    const { sn, stagingId } = req.params;
    const session = importStaging.get(stagingId);
    if (!session || session.sn !== sn) {
      res.status(404).json({ ok: false, error: 'unknown staging session' });
      return;
    }
    if (session.state !== 'UPLOADED') {
      res.status(409).json({ ok: false, error: `wrong state ${session.state}` });
      return;
    }

    const dir = path.join(process.env.STORAGE_PATH ?? './storage', 'imports', sn, stagingId);
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'bundle.json'), 'utf8'));
    const mowerFiles = parsed.mowerFiles as
      | { csvFiles: Record<string, string>; chargingStationYaml: string | null }
      | undefined;
    const origPose = parsed.metadata?.originalChargingPose as
      | { x: number; y: number; orientation: number }
      | undefined;
    if (!mowerFiles || !origPose) {
      res.status(400).json({ ok: false, error: 'bundle missing exact-restore data (mowerFiles + originalChargingPose)' });
      return;
    }

    // Live dock pose from MQTT sensor cache (updated every ~1s while mower
    // is online). No need for drive — Δ is derived purely from stored vs
    // current charging_pose.
    const sensors = deviceCache.get(sn);
    const mx = parseFloat(sensors?.get('map_position_x') ?? '');
    const my = parseFloat(sensors?.get('map_position_y') ?? '');
    const mo = parseFloat(sensors?.get('map_position_orientation') ?? '');
    const lat = parseFloat(sensors?.get('latitude') ?? '');
    const lng = parseFloat(sensors?.get('longitude') ?? '');
    if (!Number.isFinite(mx) || !Number.isFinite(my) || !Number.isFinite(mo)) {
      res.status(409).json({
        ok: false,
        error: 'no live map_position in sensor cache — is mower online?',
      });
      return;
    }
    const dockMP = { x: mx, y: my, orientation: mo };

    // Δ rotation + translation
    const dt = dockMP.orientation - origPose.orientation;
    const cosDt = Math.cos(dt);
    const sinDt = Math.sin(dt);
    const transformPoint = (px: number, py: number): [number, number] => {
      const relX = px - origPose.x;
      const relY = py - origPose.y;
      const rx = relX * cosDt - relY * sinDt;
      const ry = relX * sinDt + relY * cosDt;
      return [rx + dockMP.x, ry + dockMP.y];
    };
    const transformedCsvs: Record<string, string> = {};
    for (const [fname, content] of Object.entries(mowerFiles.csvFiles)) {
      if (fname === 'map_info.json') {
        try {
          const mi = JSON.parse(content) as Record<string, unknown>;
          mi.charging_pose = { x: dockMP.x, y: dockMP.y, orientation: dockMP.orientation };
          transformedCsvs[fname] = JSON.stringify(mi, null, 3);
        } catch {
          transformedCsvs[fname] = content;
        }
        continue;
      }
      if (!fname.endsWith('.csv')) {
        transformedCsvs[fname] = content;
        continue;
      }
      const out: string[] = [];
      for (const raw of content.split('\n')) {
        const line = raw.trim();
        if (!line) { out.push(''); continue; }
        const parts = line.split(',');
        if (parts.length < 2) { out.push(line); continue; }
        const px = parseFloat(parts[0]);
        const py = parseFloat(parts[1]);
        if (!Number.isFinite(px) || !Number.isFinite(py)) { out.push(line); continue; }
        const [nx, ny] = transformPoint(px, py);
        out.push(`${nx.toFixed(2)},${ny.toFixed(2)}`);
      }
      transformedCsvs[fname] = out.join('\n');
    }
    const newYaml = `charging_pose: [${dockMP.x}, ${dockMP.y}, ${dockMP.orientation}]\n`;

    // Update DB calibration so dashboard live-position projection lines up
    // with the new dock pose. Also store the absolute new dock heading as
    // polygon_charging_orientation — that's what next export will pick up.
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      mapRepo.setChargerGps(sn, lat, lng);
    }
    mapRepo.setPolygonChargingOrientation(sn, dockMP.orientation);
    mapRepo.setPolygonOffset(sn, 0, 0);

    // Replace DB polygons so the dashboard map view reflects the new state.
    db.prepare(`DELETE FROM maps WHERE mower_sn = ?`).run(sn);
    const ins = db.prepare(
      `INSERT INTO maps (mower_sn, map_id, map_name, map_type, file_name, map_area, canonical_name) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const transformPolygonPts = (pts: { x: number; y: number }[]) =>
      pts.map((p) => {
        const [nx, ny] = transformPoint(p.x, p.y);
        return { x: nx, y: ny };
      });
    const workPolygons: Array<{ name: string; alias: string; points: { x: number; y: number }[] }> =
      Array.isArray(parsed.polygons) && parsed.polygons.length > 0 ? parsed.polygons : [parsed.polygon];
    for (let wi = 0; wi < workPolygons.length; wi++) {
      const wp = workPolygons[wi];
      ins.run(sn, `imp_work_${wi}`, wp.alias, 'work', wp.name + '.csv',
        JSON.stringify(transformPolygonPts(wp.points)), wp.name);
    }
    for (let i = 0; i < parsed.obstacles.length; i++) {
      const o = parsed.obstacles[i];
      ins.run(sn, `imp_obs_${i}`, o.alias, 'obstacle', o.name + '.csv',
        JSON.stringify(transformPolygonPts(o.points)), o.name);
    }
    for (let i = 0; i < parsed.unicom.length; i++) {
      const u = parsed.unicom[i];
      ins.run(sn, `imp_uni_${i}`, u.targetMapName, 'unicom', u.name + '.csv',
        JSON.stringify(transformPolygonPts(u.points)), u.name);
    }

    // Push to mower. Skip the auto-restart of novabot_mapping — coverage_planner
    // reads CSVs from disk on each new coverage task, so the new polygon
    // takes effect without needing to bounce the mapping node. Restarting
    // it briefly + having it exit (per stock save-flow design) made
    // robot_decision health-checks raise false-positive Error 140 that
    // aborted the in-progress coverage. Verified live LFIN1231000211
    // 2026-05-08.
    publishToExtended(sn, {
      write_map_files: {
        csv_files: transformedCsvs,
        charging_station_yaml: newYaml,
        restart_mapping: false,
      },
    });

    // Generate raster from the new (transformed) polygons. Compute bbox
    // from the transformed work polygon since coverage_planner rasterizes
    // around the mower's current frame.
    const allPoints: { x: number; y: number }[] = [];
    for (const wp of workPolygons) allPoints.push(...transformPolygonPts(wp.points));
    for (const o of parsed.obstacles) allPoints.push(...transformPolygonPts(o.points));
    if (allPoints.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of allPoints) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const margin = 2.0;
      const spanX = maxX - minX + 2 * margin;
      const spanY = maxY - minY + 2 * margin;
      const size = Math.max(spanX, spanY) > 30 ? 60 : 30;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      publishToExtended(sn, {
        generate_empty_map: {
          origin_x: cx - size / 2,
          origin_y: cy - size / 2,
          size,
          index: 0,
        },
      });
    }

    importStaging.transition(stagingId, 'APPLIED', { applyResult: {} });
    importAuditRepo.append({ sn, staging_id: stagingId, from_state: 'UPLOADED', to_state: 'APPLIED', reason: 'exact-restore one-click' });
    res.json({
      ok: true,
      state: 'APPLIED',
      delta: { dx: dockMP.x - origPose.x, dy: dockMP.y - origPose.y, dtheta: dt },
      transformedFiles: Object.keys(transformedCsvs),
    });
  },
);

// POST /api/admin-status/maps/:sn/import-portable/:stagingId/apply-selective
//
// Selective import — pushes a chosen subset of bundle categories to the
// mower. Two safety modes:
//   - mode = 'add-only' (default): skip files that already exist on the
//     mower; never overwrite. Safe combination because nothing on the
//     mower is destroyed.
//   - mode = 'replace': overwrite matching filenames. Same risk profile
//     as the existing apply-exact endpoint but scoped to the chosen
//     categories.
//
// Files in selected categories are Δ-rotated/translated against the
// bundle's originalChargingPose vs the mower's live charging_pose so the
// imported polygons land in the destination frame. obstacleRemap can
// rewrite an obstacle's parent map (e.g. rename `map3_0_obstacle.csv`
// from the bundle to `map1_0_obstacle.csv` so it attaches to the mower's
// existing `map1`).
//
// NOTE: this endpoint does NOT update DB polygon rows. The dashboard map
// view continues to reflect whatever the last full import / sync_map
// wrote; the mower's csv_file/ is the source of truth for actual mowing.
adminStatusRouter.post(
  '/maps/:sn/import-portable/:stagingId/apply-selective',
  async (req: AuthRequest, res: Response) => {
    const { sn, stagingId } = req.params;
    const session = importStaging.get(stagingId);
    if (!session || session.sn !== sn) {
      res.status(404).json({ ok: false, error: 'unknown staging session' });
      return;
    }
    if (session.state !== 'UPLOADED') {
      res.status(409).json({ ok: false, error: `wrong state ${session.state}` });
      return;
    }

    const body = (req.body ?? {}) as {
      include?: string[];
      mode?: 'add-only' | 'replace';
      obstacleRemap?: Record<string, string>;
    };
    const include = new Set(body.include ?? ['work', 'obstacle', 'unicom', 'dock']);
    const mode: 'add-only' | 'replace' = body.mode === 'replace' ? 'replace' : 'add-only';
    const obstacleRemap = body.obstacleRemap ?? {};

    // ── Read bundle from staging dir ─────────────────────────────────
    const dir = path.join(process.env.STORAGE_PATH ?? './storage', 'imports', sn, stagingId);
    let parsed: {
      mowerFiles?: { csvFiles: Record<string, string>; chargingStationYaml: string | null };
      metadata?: { originalChargingPose?: { x: number; y: number; orientation: number } };
    };
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(dir, 'bundle.json'), 'utf8'));
    } catch (err) {
      res.status(500).json({ ok: false, error: `failed to read bundle: ${(err as Error).message}` });
      return;
    }
    const mowerFiles = parsed.mowerFiles;
    const origPose = parsed.metadata?.originalChargingPose;
    if (!mowerFiles || !origPose) {
      res.status(400).json({ ok: false, error: 'bundle missing exact-restore data' });
      return;
    }

    // ── Live mower frame for Δ ───────────────────────────────────────
    const sensors = deviceCache.get(sn);
    const mx = parseFloat(sensors?.get('map_position_x') ?? '');
    const my = parseFloat(sensors?.get('map_position_y') ?? '');
    const mo = parseFloat(sensors?.get('map_position_orientation') ?? '');
    if (!Number.isFinite(mx) || !Number.isFinite(my) || !Number.isFinite(mo)) {
      res.status(409).json({ ok: false, error: 'no live map_position — is mower online?' });
      return;
    }
    const dockMP = { x: mx, y: my, orientation: mo };
    const dt = dockMP.orientation - origPose.orientation;
    const cosDt = Math.cos(dt);
    const sinDt = Math.sin(dt);
    const transformPoint = (px: number, py: number): [number, number] => {
      const relX = px - origPose.x;
      const relY = py - origPose.y;
      const rx = relX * cosDt - relY * sinDt;
      const ry = relX * sinDt + relY * cosDt;
      return [rx + dockMP.x, ry + dockMP.y];
    };

    // ── Mower current files (for collision detection in add-only mode) ──
    const mowerSide = await new Promise<{ csvFiles?: Record<string, string>; chargingStationYaml?: string | null }>(resolve => {
      let settled = false;
      const handler = (data: Record<string, unknown>) => {
        const r = data.read_map_files_respond as
          | { result?: number; csv_files?: Record<string, string>; charging_station_yaml?: string }
          | undefined;
        if (!r || settled) return;
        settled = true;
        offExtendedResponse(sn, handler);
        if (r.result !== 0) { resolve({}); return; }
        resolve({ csvFiles: r.csv_files, chargingStationYaml: r.charging_station_yaml ?? null });
      };
      onExtendedResponse(sn, handler);
      publishToExtended(sn, { read_map_files: {} });
      setTimeout(() => {
        if (settled) return;
        settled = true;
        offExtendedResponse(sn, handler);
        resolve({});
      }, 8000);
    });
    const mowerExisting = new Set(Object.keys(mowerSide.csvFiles ?? {}));

    // ── Build target file map ────────────────────────────────────────
    const toWrite: Record<string, string> = {};
    const skipped: string[] = [];

    const bundleClass = classifyBundle(mowerFiles);

    for (const e of bundleClass.entries) {
      // Skip categories the operator didn't tick.
      if (!include.has(e.category)) continue;
      // 'meta' (map_info.json etc.) follows whichever other category was
      // selected — we always include it when ANY data category is chosen
      // so the mower has a coherent metadata file. Falls into the
      // skip-existing logic below.
      if (e.category === 'meta' && !include.has('work') && !include.has('obstacle') && !include.has('unicom')) {
        continue;
      }

      const original = mowerFiles.csvFiles[e.filename];
      if (original === undefined) continue;

      // Apply obstacle remap if requested.
      let targetName = e.filename;
      if (e.category === 'obstacle' && obstacleRemap[e.filename]) {
        const newParent = obstacleRemap[e.filename];
        targetName = e.filename.replace(/^map\d+_/, `${newParent}_`);
      }

      if (mode === 'add-only' && mowerExisting.has(targetName)) {
        skipped.push(targetName);
        continue;
      }

      // Δ-transform CSV polygon points so they land in the mower's frame.
      if (e.category === 'work' || e.category === 'obstacle' || e.category === 'unicom') {
        const out: string[] = [];
        for (const raw of original.split('\n')) {
          const line = raw.trim();
          if (!line) { out.push(''); continue; }
          const parts = line.split(',');
          if (parts.length < 2) { out.push(line); continue; }
          const px = parseFloat(parts[0]);
          const py = parseFloat(parts[1]);
          if (!Number.isFinite(px) || !Number.isFinite(py)) { out.push(line); continue; }
          const [nx, ny] = transformPoint(px, py);
          out.push(`${nx.toFixed(2)},${ny.toFixed(2)}`);
        }
        toWrite[targetName] = out.join('\n');
      } else if (e.category === 'meta' && e.filename === 'map_info.json') {
        // Inject mower's live charging_pose so map_info matches the dock.
        try {
          const mi = JSON.parse(original) as Record<string, unknown>;
          mi.charging_pose = { x: dockMP.x, y: dockMP.y, orientation: dockMP.orientation };
          toWrite[targetName] = JSON.stringify(mi, null, 3);
        } catch {
          toWrite[targetName] = original;
        }
      } else {
        toWrite[targetName] = original;
      }
    }

    // Dock yaml lives alongside csv_file on the mower; treat separately.
    let chargingStationYaml: string | null = null;
    if (include.has('dock') && mowerFiles.chargingStationYaml != null) {
      // add-only never overwrites the existing dock — prevents accidental
      // pose loss when the operator just wants to add obstacles.
      const dockExists = mowerSide.chargingStationYaml != null && mowerSide.chargingStationYaml.length > 0;
      if (mode === 'add-only' && dockExists) {
        skipped.push('charging_station.yaml');
      } else {
        chargingStationYaml = `charging_pose: [${dockMP.x}, ${dockMP.y}, ${dockMP.orientation}]\n`;
      }
    }

    if (Object.keys(toWrite).length === 0 && chargingStationYaml === null) {
      res.json({ ok: true, written: [], skipped, note: 'nothing to write — selection was empty or all files skipped by add-only mode' });
      return;
    }

    publishToExtended(sn, {
      write_map_files: {
        csv_files: toWrite,
        charging_station_yaml: chargingStationYaml,
        restart_mapping: false,
      },
    });

    // Re-render map.yaml/pgm/png when polygon-bearing categories were
    // touched. Nav2's static costmap layer reads the pgm; without a
    // re-render new obstacles wouldn't be inflated and the mower could
    // drive through them. Skip for dock-only or meta-only changes —
    // those don't affect the rasterized occupancy grid.
    const polygonCategoriesTouched = include.has('work') || include.has('obstacle') || include.has('unicom');
    if (polygonCategoriesTouched && Object.keys(toWrite).length > 0) {
      publishToDevice(sn, { save_map: { type: 1, mapName: 'map', totalArea: 0 } });
      console.log(`[Admin] apply-selective ${sn}: post-write save_map type:1 dispatched to render map.yaml/pgm`);
      // See restore-and-realign for the per-map-mirror rationale.
      setTimeout(() => {
        publishToExtended(sn, { regenerate_per_map_files: {} });
        console.log(`[Admin] apply-selective ${sn}: regenerate_per_map_files dispatched`);
      }, 3000);
    }

    importStaging.transition(stagingId, 'APPLIED', {
      applyResult: {
        warning: `selective ${mode} — ${Object.keys(toWrite).length} written, ${skipped.length} skipped`,
      },
    });
    importAuditRepo.append({
      sn,
      staging_id: stagingId,
      from_state: 'UPLOADED',
      to_state: 'APPLIED',
      reason: `selective apply mode=${mode} categories=${[...include].join(',')}`,
    });
    res.json({
      ok: true,
      mode,
      written: Object.keys(toWrite),
      skipped,
      delta: { dx: dockMP.x - origPose.x, dy: dockMP.y - origPose.y, dtheta: dt },
    });
  },
);

// POST /api/admin-status/maps/:sn/import-portable/:stagingId/cancel
// Idempotent: returns 200 even if session is already gone.
adminStatusRouter.post(
  '/maps/:sn/import-portable/:stagingId/cancel',
  (req: AuthRequest, res: Response) => {
    const { sn, stagingId } = req.params;
    const session = importStaging.get(stagingId);
    if (!session || session.sn !== sn) {
      res.json({ ok: true });
      return;
    }
    importAuditRepo.append({ sn, staging_id: stagingId, from_state: session.state, to_state: 'CANCELLED', reason: 'user cancel' });
    importStaging.cancel(stagingId, 'user cancel');
    res.json({ ok: true });
  },
);

// ── Polygon-offset calibration endpoints ────────────────────────────────────
// These allow operators to nudge the mower's work polygon overlay without
// touching the underlying GPS calibration.  The offset is persisted in
// map_calibration and baked into the regenerated _latest.zip on every call.

const MAX_OFFSET_M = 1.0;

// GET /api/admin-status/maps/:sn/polygon-offset
adminStatusRouter.get('/maps/:sn/polygon-offset', (req: AuthRequest, res: Response) => {
  const off = mapRepo.getPolygonOffset(req.params.sn);
  res.json({ dx_m: off.x, dy_m: off.y });
});

/**
 * GET /api/admin-status/position-trail/:sn
 *
 * Returns paired GPS + map_position samples (RTK FIX only) for the
 * polygon-offset validation overlay on the admin map.
 *
 * Query params:
 *   duration  — window in seconds (default 600 = last 10 min)
 *
 * Response:
 *   - mowerLocal:  array of {x, y, ts} from sensors.map_position_x/y
 *   - gpsLocal:    array of {x, y, ts} — GPS samples projected into the
 *                  same local frame using the map_calibration anchor +
 *                  the saved charging-pose orientation. Empty when no
 *                  charger anchor exists.
 *   - paired:      time-aligned pairs used for the offset suggestion
 *   - suggestion:  median (mowerLocal − gpsLocal) and sample stats
 */
adminStatusRouter.get('/position-trail/:sn', (req: AuthRequest, res: Response) => {
  const sn = req.params.sn;
  const durationSec = Math.max(
    10,
    Math.min(3600, parseInt(String(req.query.duration ?? ''), 10) || 600),
  );
  const samples = getValidationTrail(sn, durationSec * 1000);

  // Anchor + map-frame charger pose. The unicom CSV's first point is the
  // charger position in MAP FRAME (e.g. (-1.21, 0.48) for Achtertuin),
  // distinct from charger_lat/lng which is the charger's GPS location.
  // Both are needed to relate the two reference frames.
  const cal = mapRepo.getCalibration(sn);
  const chargerLat = cal?.charger_lat ?? null;
  const chargerLng = cal?.charger_lng ?? null;
  const polygonAnchor = getPolygonAnchor(sn);
  const chargerInMapX = polygonAnchor?.x ?? 0;
  const chargerInMapY = polygonAnchor?.y ?? 0;

  const mowerLocal = samples.map((p) => ({ x: p.mx, y: p.my, ts: p.ts }));

  // Step 1: project every GPS sample to UNROTATED metres relative to the
  // charger anchor (east, north). At this point the lime trail still lives
  // in GPS frame — it has the right shape but is rotated relative to the
  // map frame.
  const haveAnchor =
    chargerLat != null && chargerLng != null
    && Number.isFinite(chargerLat) && Number.isFinite(chargerLng);

  type UnrotPoint = { ex: number; ny: number; ts: number };
  const gpsUnrot: UnrotPoint[] = haveAnchor
    ? samples.map((p) => {
      const local = gpsToLocal(
        { lat: p.lat, lng: p.lng },
        { lat: chargerLat as number, lng: chargerLng as number },
        0, // unrotated — rotation is derived below
      );
      return { ex: local.x, ny: local.y, ts: p.ts };
    })
    : [];

  // Step 2: derive the GPS→map rotation from the data instead of trusting
  // the saved charging-pose theta (which is the dock heading, not the
  // mapping-start heading). The two frames differ only by a rotation
  // around the charger anchor PLUS the charger's position in map frame
  // (chargerInMap*). We solve:
  //
  //   R · (gps_unrot − mean_gps) ≈ (map − chargerInMap) − mean_mapAtCharger
  //
  // via the closed-form Kabsch / Wahba 2-D solution: given paired
  // centred vectors (u_i, v_i), the optimal rotation θ satisfies
  //   tan(θ) = Σ(u.x·v.y − u.y·v.x) / Σ(u.x·v.x + u.y·v.y)
  // (sum-of-cross-products vs sum-of-dot-products).
  let derivedTheta: number | null = null;
  let derivedThetaDeg: number | null = null;
  if (haveAnchor && gpsUnrot.length >= 10) {
    // Centre both clouds at their respective means so the rotation isn't
    // contaminated by translation error.
    const mapInChargerFrame = mowerLocal.map((p) => ({
      x: p.x - chargerInMapX,
      y: p.y - chargerInMapY,
    }));
    const meanGps = gpsUnrot.reduce(
      (a, b) => ({ ex: a.ex + b.ex, ny: a.ny + b.ny }),
      { ex: 0, ny: 0 },
    );
    meanGps.ex /= gpsUnrot.length;
    meanGps.ny /= gpsUnrot.length;
    const meanMap = mapInChargerFrame.reduce(
      (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
      { x: 0, y: 0 },
    );
    meanMap.x /= mapInChargerFrame.length;
    meanMap.y /= mapInChargerFrame.length;

    let sumCross = 0;
    let sumDot = 0;
    for (let i = 0; i < gpsUnrot.length; i++) {
      const u = { x: gpsUnrot[i].ex - meanGps.ex, y: gpsUnrot[i].ny - meanGps.ny };
      const v = { x: mapInChargerFrame[i].x - meanMap.x, y: mapInChargerFrame[i].y - meanMap.y };
      sumCross += u.x * v.y - u.y * v.x;
      sumDot   += u.x * v.x + u.y * v.y;
    }
    if (Math.abs(sumDot) + Math.abs(sumCross) > 1e-9) {
      derivedTheta = Math.atan2(sumCross, sumDot);
      derivedThetaDeg = derivedTheta * 180 / Math.PI;
    }
  }

  // Step 3: project gpsUnrot into MAP FRAME using either the data-derived
  // rotation or — when we don't have enough samples yet — falling back to
  // identity (0). DO NOT fall back to polygon_charging_orientation: that
  // field is the dock-heading-in-map-frame, NOT the ENU→map rotation.
  // Using it as a rotation reproduces the live-2026-05-08 symptom where
  // a 1 m N–S drive rendered as an E–W lime trail (≈π/2 over-rotated).
  // See research/documents/polygon-rotation-bug.md for the dual-meaning
  // history of this field.
  const savedTheta = mapRepo.getPolygonChargingOrientation(sn);
  const projectionTheta = derivedTheta ?? 0;
  const cos = Math.cos(projectionTheta);
  const sin = Math.sin(projectionTheta);
  const gpsLocal = gpsUnrot.map((p) => ({
    // R(θ) · (ex, ny) + (chargerInMapX, chargerInMapY)
    x: p.ex * cos - p.ny * sin + chargerInMapX,
    y: p.ex * sin + p.ny * cos + chargerInMapY,
    ts: p.ts,
  }));

  // Step 4: residuals after rotation+translation = real polygon drift
  // suggestion. With a correct rotation the median should drop close to
  // zero; the std-dev becomes a true RTK noise estimate (cm-scale).
  const paired = samples.map((p, i) => ({
    ts: p.ts,
    map: { x: mowerLocal[i].x, y: mowerLocal[i].y },
    gps: gpsLocal[i] ?? null,
  })).filter((row) => row.gps != null) as {
    ts: number;
    map: { x: number; y: number };
    gps: { x: number; y: number; ts: number };
  }[];

  let suggestion: {
    dx: number;
    dy: number;
    samples: number;
    stdevX: number;
    stdevY: number;
  } | null = null;

  if (paired.length >= 5) {
    const dxs = paired.map((p) => p.map.x - p.gps.x).sort((a, b) => a - b);
    const dys = paired.map((p) => p.map.y - p.gps.y).sort((a, b) => a - b);
    const median = (arr: number[]) => arr[Math.floor(arr.length / 2)];
    const dx = median(dxs);
    const dy = median(dys);
    const meanX = dxs.reduce((s, v) => s + v, 0) / dxs.length;
    const meanY = dys.reduce((s, v) => s + v, 0) / dys.length;
    const stdevX = Math.sqrt(dxs.reduce((s, v) => s + (v - meanX) ** 2, 0) / dxs.length);
    const stdevY = Math.sqrt(dys.reduce((s, v) => s + (v - meanY) ** 2, 0) / dys.length);
    suggestion = { dx, dy, samples: paired.length, stdevX, stdevY };
  }

  res.json({
    sn,
    durationSec,
    haveAnchor,
    mowerLocal,
    gpsLocal,
    suggestion,
    debug: {
      chargerLat,
      chargerLng,
      chargerInMap: { x: chargerInMapX, y: chargerInMapY },
      savedTheta,
      savedThetaDeg: savedTheta != null ? (savedTheta * 180 / Math.PI) : null,
      derivedTheta,
      derivedThetaDeg,
      projectionThetaDeg: projectionTheta * 180 / Math.PI,
      thetaSource: derivedTheta != null ? 'data-fit' : (savedTheta != null ? 'saved' : 'identity'),
      totalSamples: samples.length,
      firstSampleTs: samples.length ? samples[0].ts : null,
      lastSampleTs: samples.length ? samples[samples.length - 1].ts : null,
      latestSample: samples.length ? samples[samples.length - 1] : null,
    },
  });
});

/** Wipe the in-memory validation trail for a SN (admin "Clear" button). */
adminStatusRouter.post('/position-trail/:sn/clear', (req: AuthRequest, res: Response) => {
  clearValidationTrail(req.params.sn);
  res.json({ ok: true });
});

/**
 * GET /api/admin-status/live-position/:sn
 *
 * Lightweight endpoint for the admin map's live mower-dot tick. Returns
 * the latest reported map_position from the sensor cache plus the most
 * recent localTrail tail, so a polling client can plot the dot + recent
 * track without pulling the full validation set.
 */
adminStatusRouter.get('/live-position/:sn', (req: AuthRequest, res: Response) => {
  const sn = req.params.sn;
  const sensors = deviceCache.get(sn);
  const mx = parseFloat(sensors?.get('map_position_x') ?? '');
  const my = parseFloat(sensors?.get('map_position_y') ?? '');
  const mo = parseFloat(sensors?.get('map_position_orientation') ?? '');
  const recentTrail = getLocalTrail(sn).slice(-200);
  res.json({
    sn,
    pose: (Number.isFinite(mx) && Number.isFinite(my))
      ? { x: mx, y: my, orientation: Number.isFinite(mo) ? mo : 0 }
      : null,
    workStatus: sensors?.get('work_status') ?? null,
    locQuality: sensors?.get('loc_quality') ?? null,
    recentTrail,
  });
});

// POST /api/admin-status/maps/:sn/apply-polygon-offset
adminStatusRouter.post('/maps/:sn/apply-polygon-offset', async (req: AuthRequest, res: Response) => {
  const { sn } = req.params;
  const { dx_m, dy_m } = req.body as { dx_m?: unknown; dy_m?: unknown };
  const dx = typeof dx_m === 'number' ? dx_m : NaN;
  const dy = typeof dy_m === 'number' ? dy_m : NaN;

  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    res.status(400).json({ ok: false, error: 'dx_m and dy_m must be finite numbers' });
    return;
  }
  if (Math.abs(dx) > MAX_OFFSET_M || Math.abs(dy) > MAX_OFFSET_M) {
    res.status(400).json({ ok: false, error: `Offset magnitude must be ≤ ${MAX_OFFSET_M} m per axis` });
    return;
  }

  // 1. Persist (idempotent — even when downstream fails the operator can retry).
  mapRepo.setPolygonOffset(sn, dx, dy);

  // 2. Regenerate ZIP with the new offset baked in.
  const regenPath = regenerateLatestZipFromBackup(sn);
  if (!regenPath) {
    res.status(400).json({ ok: false, error: 'No map data found for this mower — map the area first.', dx_m: dx, dy_m: dy });
    return;
  }

  // 3. Online check.
  if (!isDeviceOnline(sn)) {
    res.status(404).json({
      ok: false,
      partial: true,
      error: 'Mower offline — sync_map not pushed; mower will pick up offset on next reconnect',
      dx_m: dx, dy_m: dy,
    });
    return;
  }

  // 4. Fire sync_map and wait up to 8s for ack — same pattern as restore-and-realign.
  const syncResult = await new Promise<{ ok: boolean; respond?: Record<string, unknown>; timeout?: boolean }>((resolve) => {
    let settled = false;
    const handler = (data: Record<string, unknown>) => {
      const respond = data.sync_map_respond as Record<string, unknown> | undefined;
      if (!respond) return;
      if (settled) return;
      settled = true;
      offExtendedResponse(sn, handler);
      resolve({ ok: respond.result === 0, respond });
    };
    onExtendedResponse(sn, handler);
    publishToExtended(sn, { sync_map: {} });
    setTimeout(() => {
      if (settled) return;
      settled = true;
      offExtendedResponse(sn, handler);
      resolve({ ok: false, timeout: true });
    }, 30000);
  });

  if (syncResult.timeout) {
    res.status(504).json({
      ok: false,
      partial: true,
      error: 'Mower did not respond within 30s — sync may still complete in background',
      dx_m: dx, dy_m: dy,
    });
    return;
  }

  // 5. After sync_map applied the CSVs, ask the mower to render
  // map.yaml/.pgm/.png from those CSVs by triggering save_map type:1.
  // The DB-only recovery path was leaving these render artifacts missing,
  // so navigation/coverage planners hit Errors 107/118 even though the
  // polygons were correctly written. Fire-and-forget — the mower processes
  // it asynchronously and the response isn't needed for the caller.
  if (syncResult.ok) {
    publishToDevice(sn, { save_map: { type: 1, mapName: 'map', totalArea: 0 } });
    console.log(`[Admin] apply-polygon-offset ${sn}: post-sync save_map type:1 dispatched to render map.yaml/pgm`);
    // See restore-and-realign for the per-map-mirror rationale.
    setTimeout(() => {
      publishToExtended(sn, { regenerate_per_map_files: {} });
      console.log(`[Admin] apply-polygon-offset ${sn}: regenerate_per_map_files dispatched`);
    }, 3000);
  }

  console.log(`[Admin] apply-polygon-offset ${sn}: dx=${dx} dy=${dy} syncOk=${syncResult.ok}`);
  res.json({ ok: syncResult.ok, dx_m: dx, dy_m: dy, syncResult: syncResult.respond ?? null });
});

// POST /api/admin-status/maps/:sn/reset-polygon-offset
adminStatusRouter.post('/maps/:sn/reset-polygon-offset', async (req: AuthRequest, res: Response) => {
  const { sn } = req.params;

  mapRepo.setPolygonOffset(sn, 0, 0);
  const regenPath = regenerateLatestZipFromBackup(sn);
  if (!regenPath) {
    res.status(400).json({ ok: false, error: 'No map data found for this mower — map the area first.', dx_m: 0, dy_m: 0 });
    return;
  }
  if (!isDeviceOnline(sn)) {
    res.status(404).json({
      ok: false, partial: true,
      error: 'Mower offline — sync_map not pushed; mower will pick up offset on next reconnect',
      dx_m: 0, dy_m: 0,
    });
    return;
  }

  const syncResult = await new Promise<{ ok: boolean; respond?: Record<string, unknown>; timeout?: boolean }>((resolve) => {
    let settled = false;
    const handler = (data: Record<string, unknown>) => {
      const respond = data.sync_map_respond as Record<string, unknown> | undefined;
      if (!respond) return;
      if (settled) return;
      settled = true;
      offExtendedResponse(sn, handler);
      resolve({ ok: respond.result === 0, respond });
    };
    onExtendedResponse(sn, handler);
    publishToExtended(sn, { sync_map: {} });
    setTimeout(() => {
      if (settled) return;
      settled = true;
      offExtendedResponse(sn, handler);
      resolve({ ok: false, timeout: true });
    }, 30000);
  });

  if (syncResult.timeout) {
    res.status(504).json({
      ok: false, partial: true,
      error: 'Mower did not respond within 30s — sync may still complete in background',
      dx_m: 0, dy_m: 0,
    });
    return;
  }

  console.log(`[Admin] reset-polygon-offset ${sn}: syncOk=${syncResult.ok}`);
  res.json({ ok: syncResult.ok, dx_m: 0, dy_m: 0, syncResult: syncResult.respond ?? null });
});

// POST /api/admin-status/factory-reset — wipe all user data and return to setup
adminStatusRouter.post('/factory-reset', (_req: AuthRequest, res: Response) => {
  console.log('[Admin] FACTORY RESET initiated by', _req.userId);
  db.pragma('foreign_keys = OFF');
  const tables = ['users', 'equipment', 'maps', 'map_calibration', 'map_uploads', 'map_overlays',
    'device_settings', 'work_records', 'robot_messages', 'dashboard_schedules',
    'cut_grass_plans', 'email_codes', 'equipment_lora_cache', 'signal_history',
    'virtual_walls', 'rain_sessions', 'pin_unlock_state'];
  for (const table of tables) {
    try { db.exec(`DELETE FROM "${table}"`); } catch { /* table may not exist */ }
  }
  db.pragma('foreign_keys = ON');
  invalidateSetupCache();
  console.log('[Admin] Factory reset complete — all user data deleted');
  res.json({ ok: true });
});
