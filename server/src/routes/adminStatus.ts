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
import { deviceCache } from '../mqtt/sensorData.js';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import https from 'https';

const MANIFEST_URL = 'https://downloads.ramonvanbruggen.nl/app/opennova-manifest.json';

export const adminStatusRouter = Router();

// Multer for ZIP upload (temp directory)
const MAPS_STORAGE = path.resolve(process.env.STORAGE_PATH ?? './storage', 'maps');
const upload = multer({ dest: os.tmpdir() });

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

    const available = remoteFirmwares.map(fw => ({
      ...fw,
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
  const { url, filename, version, device_type, md5, description } = req.body as {
    url?: string; filename?: string; version?: string; device_type?: string; md5?: string; description?: string;
  };

  if (!url || !filename || !version || !device_type) {
    res.status(400).json({ error: 'url, filename, version, and device_type are required' });
    return;
  }

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
