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
import { parseMapZip, polygonArea, MapArea } from '../mqtt/mapConverter.js';
import { startMdnsAdvertiser, stopMdnsAdvertiser, getActiveAdvertisement } from '../services/mdnsAdvertiser.js';
import { listBackups, backupPath, regenerateLatestZipFromBackup } from '../services/mapBackup.js';
import { getPolygonAnchor } from '../services/anchor.js';
import { exportBundle, parseBundle, BundleValidationError, computeAnchorRebase } from '../services/portableMap.js';
import { ImportStagingStore } from '../services/importStaging.js';
import { importAuditRepo } from '../db/repositories/importAudit.js';
import { deriveHeading } from '../services/driveCalibration.js';
import {
  deviceCache,
  getValidationTrail,
  clearValidationTrail,
  getLocalTrail,
} from '../mqtt/sensorData.js';
import { gpsToLocal } from '../mqtt/mapConverter.js';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import https from 'https';

const MANIFEST_URL = 'https://downloads.ramonvanbruggen.nl/opennova-manifest.json';

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
function normaliseFirmwareDownloadUrl(url: string): string {
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

// Multer for ZIP upload (temp directory)
const MAPS_STORAGE = path.resolve(process.env.STORAGE_PATH ?? './storage', 'maps');
const upload = multer({ dest: os.tmpdir() });
// Dedicated uploader for /map-backups/:sn/upload — extension filter + size cap
// stop the obviously-wrong cases before parseMapZip even runs.
const uploadZip = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/\.zip$/i.test(file.originalname)) {
      cb(new Error('Only .zip files are accepted'));
      return;
    }
    cb(null, true);
  },
});

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
  }));

  res.json({ devices });
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

// POST /api/admin-status/import-map-zip — import a Novabot map ZIP, always creating NEW map records
adminStatusRouter.post('/import-map-zip', upload.single('file'), (req: AuthRequest, res: Response) => {
  const sn = req.body?.sn as string | undefined;
  const file = (req as any).file as Express.Multer.File | undefined;

  if (!sn) {
    res.status(400).json({ error: 'sn (mower serial) required' });
    return;
  }
  if (!file) {
    res.status(400).json({ error: 'file (ZIP) required' });
    return;
  }

  try {
    // Parse the ZIP using the existing mapConverter function
    const parsed = parseMapZip(file.path);
    if (!parsed || parsed.areas.length === 0) {
      res.status(400).json({ error: 'No valid map areas found in ZIP' });
      return;
    }

    let mapsImported = 0;

    for (const area of parsed.areas) {
      if (area.points.length < 2) continue;

      const mapId = uuidv4();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const areaM2 = area.type !== 'unicom' && area.points.length >= 3
        ? polygonArea(area.points)
        : 0;

      // Build a descriptive map name from the area metadata
      let mapName: string;
      if (area.type === 'work') {
        mapName = `map${area.mapIndex}_work`;
      } else if (area.type === 'obstacle') {
        mapName = `map${area.mapIndex}_${area.subIndex ?? 0}_obstacle`;
      } else {
        mapName = `map${area.mapIndex}to${area.target ?? 'charge'}_unicom`;
      }

      // Compute bounding box
      const xs = area.points.map(p => p.x);
      const ys = area.points.map(p => p.y);
      const mapMaxMin = JSON.stringify({
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
      });

      mapRepo.create({
        map_id: mapId,
        mower_sn: sn,
        map_name: mapName,
        map_area: JSON.stringify(area.points),
        map_max_min: mapMaxMin,
        map_type: area.type,
      });
      mapsImported++;
    }

    // Copy uploaded ZIP as _latest.zip for queryEquipmentMap
    fs.mkdirSync(MAPS_STORAGE, { recursive: true });
    const latestPath = path.join(MAPS_STORAGE, `${sn}_latest.zip`);
    fs.copyFileSync(file.path, latestPath);

    // Clean up temp file
    try { fs.unlinkSync(file.path); } catch { /* ignore */ }

    console.log(`[Admin] Imported ${mapsImported} map(s) from ZIP for ${sn}`);
    res.json({ ok: true, mapsImported });
  } catch (err) {
    // Clean up temp file on error
    try { fs.unlinkSync(file.path); } catch { /* ignore */ }
    console.error('[Admin] Map ZIP import failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Import failed' });
  }
});

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
      }));

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
function fetchJson(url: string): Promise<unknown> {
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
function downloadFile(url: string, destPath: string): Promise<void> {
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

// POST /api/admin-status/map-backups/:sn/upload — import an external ZIP
//
// Accepts a single multipart field `zip` (max 50 MB). The upload is run
// through `parseMapZip` and a small set of structural guards before being
// stored in the backup directory; on success the new entry shows up in
// the standard backup list and can be ghost-previewed + restored like any
// auto-snapshot.
//
// Guards (each rejected with a descriptive message):
//   - .zip extension on filename
//   - parseMapZip returns truthy
//   - chargingPose present AND not (0,0,0) — that's the corrupted-stub
//     pattern from the maps recovery playbook
//   - at least one work polygon with >= 3 points
adminStatusRouter.post(
  '/map-backups/:sn/upload',
  uploadZip.single('zip'),
  (req: AuthRequest, res: Response) => {
    const { sn } = req.params;
    const file = (req as unknown as { file?: Express.Multer.File }).file;

    if (!file) {
      res.status(400).json({ ok: false, error: 'No file uploaded (expected multipart field "zip")' });
      return;
    }

    const tmpPath = file.path;
    try {
      const parsed = parseMapZip(tmpPath);
      if (!parsed) {
        res.status(400).json({ ok: false, error: 'Not a valid Novabot map ZIP — parseMapZip rejected the file' });
        return;
      }

      const cp = parsed.chargingPose;
      const cpZeroed = !cp || (cp.x === 0 && cp.y === 0 && cp.orientation === 0);
      if (cpZeroed) {
        res.status(400).json({
          ok: false,
          error: 'ZIP has missing or (0,0,0) chargingPose — that is the corrupted-stub pattern, refusing to import',
        });
        return;
      }

      const workCount = parsed.areas.filter(a => a.type === 'work' && a.points.length >= 3).length;
      if (workCount === 0) {
        res.status(400).json({ ok: false, error: 'ZIP contains no work polygon with >= 3 points' });
        return;
      }

      // Stash into the backup directory under a deterministic, sortable name
      // so the existing list-backups path picks it up automatically.
      const dir = path.dirname(backupPath(sn, 'placeholder'));
      fs.mkdirSync(dir, { recursive: true });
      const ts = Date.now();
      const finalName = `imported_${ts}.zip`;
      const finalPath = path.join(dir, finalName);
      fs.copyFileSync(tmpPath, finalPath);

      console.log(`[Admin] map-backup uploaded for ${sn}: ${finalName} (${file.size}B, ${workCount} work polygons)`);

      res.json({
        ok: true,
        filename: finalName,
        sizeBytes: file.size,
        work: workCount,
        obstacles: parsed.areas.filter(a => a.type === 'obstacle').length,
        unicoms: parsed.areas.filter(a => a.type === 'unicom').length,
        chargingPose: cp,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'unknown error' });
    } finally {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  },
);

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

// GET /api/admin-status/maps/:sn/export-portable
adminStatusRouter.get('/maps/:sn/export-portable', async (req: AuthRequest, res: Response) => {
  const sn = req.params.sn;
  const cal = mapRepo.getCalibration(sn);
  if (!cal?.charger_lat || !cal?.charger_lng) {
    res.status(409).json({ ok: false, error: 'no charger anchor in DB — sync_map first' });
    return;
  }
  const work = mapRepo.findAllByMowerSnAndType(sn, 'work')[0];
  if (!work?.map_area) { res.status(404).json({ ok: false, error: 'no work polygon' }); return; }
  const obstacles = mapRepo.findAllByMowerSnAndType(sn, 'obstacle');
  const unicom = mapRepo.findAllByMowerSnAndType(sn, 'unicom');
  const cp = mapRepo.getPolygonChargingOrientation(sn);

  const zip = await exportBundle({
    sn,
    chargerLat: cal.charger_lat,
    chargerLng: cal.charger_lng,
    rtkQuality: null,
    chargingPose: { x: 0, y: 0, orientation: cp ?? 0 },
    workMap: {
      canonical: work.canonical_name ?? 'map0',
      alias: work.map_name ?? 'work',
      points: JSON.parse(work.map_area as string),
    },
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
    res.json({ ok: true, stagingId: session.stagingId, state: session.state });
  },
);

// ── Portable map import — staged endpoints (Tasks 11-15) ────────────────────

// GET /api/admin-status/maps/:sn/import-portable/active
// NOTE: must be registered BEFORE /:stagingId/... routes to avoid Express
// matching "active" as a stagingId.
adminStatusRouter.get('/maps/:sn/import-portable/active', (req: AuthRequest, res: Response) => {
  const sn = req.params.sn;
  const active = importStaging.getActive(sn);
  res.json({ stagingId: active?.stagingId ?? null, state: active?.state ?? null });
});

// POST /api/admin-status/maps/:sn/import-portable/:stagingId/set-anchor
// Snapshot RTK GPS from sensor cache. Mower must be on dock + RTK FIX (loc_quality=100).
adminStatusRouter.post(
  '/maps/:sn/import-portable/:stagingId/set-anchor',
  (req: AuthRequest, res: Response) => {
    const { sn, stagingId } = req.params;
    const session = importStaging.get(stagingId);
    if (!session || session.sn !== sn) {
      res.status(404).json({ ok: false, error: 'unknown staging session' });
      return;
    }
    const sensors = deviceCache.get(sn);
    const lat = parseFloat(sensors?.get('latitude') ?? '');
    const lng = parseFloat(sensors?.get('longitude') ?? '');
    const locQ = parseInt(sensors?.get('loc_quality') ?? '', 10);
    const batt = (sensors?.get('battery_state') ?? '').toUpperCase();
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(409).json({ ok: false, error: 'no GPS in sensor cache' });
      return;
    }
    if (locQ !== 100) {
      res.status(409).json({ ok: false, error: `loc_quality=${locQ}, RTK FIX (100) required` });
      return;
    }
    if (!batt.includes('CHARGING') && !batt.includes('FINISHED')) {
      res.status(409).json({ ok: false, error: 'mower must be on dock (battery_state CHARGING)' });
      return;
    }
    const updated = importStaging.transition(stagingId, 'ANCHOR_SET', { newCharger: { lat, lng } });
    importAuditRepo.append({ sn, staging_id: stagingId, from_state: 'UPLOADED', to_state: 'ANCHOR_SET', reason: null });
    res.json({ ok: true, state: updated.state, newCharger: updated.context.newCharger });
  },
);

// POST /api/admin-status/maps/:sn/import-portable/:stagingId/start-drive
// Snapshot start pose, fire calibration_drive on mower, await respond, derive heading.
adminStatusRouter.post(
  '/maps/:sn/import-portable/:stagingId/start-drive',
  async (req: AuthRequest, res: Response) => {
    const { sn, stagingId } = req.params;
    const session = importStaging.get(stagingId);
    if (!session || session.sn !== sn) {
      res.status(404).json({ ok: false, error: 'unknown staging session' });
      return;
    }
    if (session.state !== 'ANCHOR_SET') {
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

    importStaging.transition(stagingId, 'DRIVE_REQUESTED', { driveStart: { lat: startLat, lng: startLng } });
    importAuditRepo.append({ sn, staging_id: stagingId, from_state: 'ANCHOR_SET', to_state: 'DRIVE_REQUESTED', reason: null });

    const driveOk = await new Promise<boolean>((resolve) => {
      const listener = (data: Record<string, unknown>) => {
        const r = data.calibration_drive_respond as Record<string, unknown> | undefined;
        if (!r) return;
        clearTimeout(tmo);
        offExtendedResponse(sn, listener);
        resolve(Number(r.result) === 0);
      };
      const tmo = setTimeout(() => {
        offExtendedResponse(sn, listener);
        resolve(false);
      }, 30_000);
      onExtendedResponse(sn, listener);
      publishToExtended(sn, { calibration_drive: { distance_m: 1.0, max_speed: 0.2 } });
    });

    if (!driveOk) {
      importStaging.cancel(stagingId, 'drive failed/timeout');
      importAuditRepo.append({ sn, staging_id: stagingId, from_state: 'DRIVE_REQUESTED', to_state: 'CANCELLED', reason: 'timeout' });
      res.status(504).json({ ok: false, error: 'calibration drive failed or timed out' });
      return;
    }

    // Read end_pose from sensor cache (updated while mower was driving)
    const endLat = parseFloat(sensors?.get('latitude') ?? '');
    const endLng = parseFloat(sensors?.get('longitude') ?? '');
    const heading = deriveHeading({ lat: startLat, lng: startLng }, { lat: endLat, lng: endLng });
    if (heading.shortDistance) {
      importStaging.cancel(stagingId, 'short distance');
      importAuditRepo.append({ sn, staging_id: stagingId, from_state: 'DRIVE_REQUESTED', to_state: 'CANCELLED', reason: 'short distance' });
      res.status(409).json({ ok: false, error: `drive distance ${heading.distanceM.toFixed(2)}m below threshold` });
      return;
    }

    const updated = importStaging.transition(stagingId, 'DRIVE_COMPLETE', {
      driveEnd: { lat: endLat, lng: endLng },
      derivedHeadingRad: heading.headingRad,
    });
    importAuditRepo.append({ sn, staging_id: stagingId, from_state: 'DRIVE_REQUESTED', to_state: 'DRIVE_COMPLETE', reason: null });
    res.json({
      ok: true, state: updated.state,
      derivedHeadingRad: heading.headingRad, distanceM: heading.distanceM,
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
    if (session.state !== 'DRIVE_COMPLETE' && session.state !== 'PREVIEW_SHOWN') {
      res.status(409).json({ ok: false, error: `wrong state ${session.state}` });
      return;
    }
    const dir = path.join(process.env.STORAGE_PATH ?? './storage', 'imports', sn, stagingId);
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'bundle.json'), 'utf8'));
    const theta = session.context.derivedHeadingRad ?? 0;
    const anchor = session.context.newCharger!;
    const cosLat = Math.cos((anchor.lat * Math.PI) / 180);
    const METERS_PER_DEG = 111320;
    const project = (pts: { x: number; y: number }[]): [number, number][] => {
      return pts.map((p) => {
        const rx = p.x * Math.cos(theta) + p.y * Math.sin(theta);
        const ry = -p.x * Math.sin(theta) + p.y * Math.cos(theta);
        return [anchor.lng + rx / (cosLat * METERS_PER_DEG), anchor.lat + ry / METERS_PER_DEG];
      });
    };
    const features: unknown[] = [];
    const workRing = project(parsed.polygon.points);
    workRing.push(workRing[0]);
    features.push({ type: 'Feature', properties: { name: parsed.polygon.alias, kind: 'work' }, geometry: { type: 'Polygon', coordinates: [workRing] } });
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
    const theta = session.context.derivedHeadingRad ?? 0;
    const anchor = session.context.newCharger!;

    // Update charger anchor + orientation in DB
    mapRepo.setChargerGps(sn, anchor.lat, anchor.lng);
    mapRepo.setPolygonChargingOrientation(sn, theta);
    mapRepo.setPolygonOffset(sn, 0, 0);

    // Rebase polygon points using derived heading
    const rebase = (pts: { x: number; y: number }[]) => computeAnchorRebase(pts, theta);

    // Replace all polygon rows for this SN
    db.prepare(`DELETE FROM maps WHERE mower_sn = ?`).run(sn);
    const ins = db.prepare(
      `INSERT INTO maps (mower_sn, map_id, map_name, map_type, file_name, map_area, canonical_name) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    ins.run(sn, 'imp_work', parsed.polygon.alias, 'work', parsed.polygon.name + '.csv', JSON.stringify(rebase(parsed.polygon.points)), parsed.polygon.name);
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

    importStaging.transition(stagingId, 'APPLIED', { applyResult: {} });
    importAuditRepo.append({ sn, staging_id: stagingId, from_state: 'USER_CONFIRMED', to_state: 'APPLIED', reason: null });
    res.json({ ok: true, state: 'APPLIED' });
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
  // rotation or — when we don't have enough samples yet — falling back
  // to the saved charging-pose orientation (better than identity).
  const savedTheta = mapRepo.getPolygonChargingOrientation(sn);
  const projectionTheta = derivedTheta ?? (savedTheta ?? 0);
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
