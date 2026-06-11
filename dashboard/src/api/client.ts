import type { DeviceState, SensorDef, MapData, MapsResponse, TrailPoint, MapCalibration, Schedule, WorkRecord, SignalHistoryPoint, LocalPoint } from '../types';

const BASE = '/api/dashboard';

async function get(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res;
}

async function post(url: string, body?: unknown): Promise<Response> {
  const res = await fetch(url, {
    method: 'POST',
    headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res;
}

export interface MdnsConflict {
  self: string | null;
  hostnames: string[];
  competitors: { ip: string; hostnames: string[]; lastSeen: number }[];
}

/** Second OpenNova server advertising the same opennovabot.local on the LAN. */
export async function fetchMdnsConflict(): Promise<MdnsConflict> {
  const res = await get(`${BASE}/mdns-conflict`);
  return res.json();
}

export async function fetchDevices(): Promise<DeviceState[]> {
  const data = await (await get(`${BASE}/devices`)).json();
  return (data.devices ?? []).map((d: DeviceState) => ({
    ...d,
    lastUpdate: Date.now(),
  }));
}

export async function deleteDevice(sn: string): Promise<void> {
  await fetch(`${BASE}/devices/${encodeURIComponent(sn)}`, { method: 'DELETE' });
}

export async function fetchSensors(): Promise<SensorDef[]> {
  const data = await (await get(`${BASE}/sensors`)).json();
  return data.sensors ?? [];
}

export async function fetchMaps(sn: string): Promise<MapsResponse> {
  const data = await (await get(`${BASE}/maps/${encodeURIComponent(sn)}`)).json();
  return {
    maps: data.maps ?? [],
    chargerGps: data.chargerGps ?? null,
    chargerOrientation: data.chargerOrientation ?? 0,
    chargingPose: data.chargingPose ?? null,
  };
}

export async function fetchAllMaps(): Promise<MapData[]> {
  const data = await (await get(`${BASE}/maps`)).json();
  return data.maps ?? [];
}

export async function fetchTrail(sn: string): Promise<TrailPoint[]> {
  const data = await (await get(`${BASE}/trail/${encodeURIComponent(sn)}`)).json();
  return data.trail ?? [];
}

export async function clearTrail(sn: string): Promise<void> {
  await fetch(`${BASE}/trail/${encodeURIComponent(sn)}`, { method: 'DELETE' });
}

export async function fetchCalibration(sn: string): Promise<MapCalibration> {
  const data = await (await get(`${BASE}/calibration/${encodeURIComponent(sn)}`)).json();
  return data.calibration;
}

export async function saveCalibration(
  sn: string, cal: MapCalibration, opts?: { relocateCharger?: boolean },
): Promise<{ mapsRecalculated?: number }> {
  const res = await fetch(`${BASE}/calibration/${encodeURIComponent(sn)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...cal, ...(opts?.relocateCharger ? { relocateCharger: true } : {}) }),
  });
  return res.json();
}

export async function renameMap(sn: string, mapId: string, mapName: string): Promise<void> {
  await fetch(`${BASE}/maps/${encodeURIComponent(sn)}/${encodeURIComponent(mapId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapName }),
  });
}

export async function updateMapArea(sn: string, mapId: string, mapArea: LocalPoint[]): Promise<void> {
  await fetch(`${BASE}/maps/${encodeURIComponent(sn)}/${encodeURIComponent(mapId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapArea }),
  });
}

export async function createMap(sn: string, mapName: string, mapArea: LocalPoint[], mapType?: string): Promise<MapData> {
  const data = await (await post(`${BASE}/maps/${encodeURIComponent(sn)}`, { mapName, mapArea, mapType })).json();
  return data.map;
}

export async function deleteMap(sn: string, mapId: string): Promise<void> {
  await fetch(`${BASE}/maps/${encodeURIComponent(sn)}/${encodeURIComponent(mapId)}`, {
    method: 'DELETE',
  });
}

// ── MQTT Commands ──────────────────────────────────────────────

export interface CommandResult {
  ok: boolean;
  command: string;
  encrypted?: boolean;
  size?: number;
  error?: string;
}

export async function sendCommand(sn: string, command: Record<string, unknown>): Promise<CommandResult> {
  const res = await post(`${BASE}/command/${encodeURIComponent(sn)}`, { command });
  return res.json();
}

// ── Demo/simulatie modus ────────────────────────────────────────

export interface DemoStatus {
  demoMode: boolean;
  state: string;
  progress: number;
}

export async function setDemoMode(sn: string, enabled: boolean): Promise<DemoStatus & { ok: boolean }> {
  const res = await post(`${BASE}/demo/${encodeURIComponent(sn)}`, { enabled });
  return res.json();
}

export async function getDemoMode(sn: string): Promise<{ sn: string } & DemoStatus> {
  const res = await get(`${BASE}/demo/${encodeURIComponent(sn)}`);
  return res.json();
}

// ── PIN Code Management ─────────────────────────────────────────

export interface PinResult {
  ok: boolean;
  action: string;
  cfg_value: number;
  error?: string;
}

export async function pinQuery(sn: string): Promise<PinResult> {
  return (await post(`${BASE}/pin/${encodeURIComponent(sn)}/query`)).json();
}

export async function pinSet(sn: string, code: string): Promise<PinResult> {
  return (await post(`${BASE}/pin/${encodeURIComponent(sn)}/set`, { code })).json();
}

export async function pinVerify(sn: string, code: string): Promise<PinResult> {
  return (await post(`${BASE}/pin/${encodeURIComponent(sn)}/verify`, { code })).json();
}

export async function pinRaw(sn: string, cfg_value: number, code: string): Promise<PinResult> {
  return (await post(`${BASE}/pin/${encodeURIComponent(sn)}/raw`, { cfg_value, code })).json();
}

// ── Map Export ──────────────────────────────────────────────────

export async function exportMaps(sn: string, chargingStation: { lat: number; lng: number }, chargingOrientation?: number): Promise<string> {
  const data = await (await post(`${BASE}/maps/${encodeURIComponent(sn)}/export-zip`, {
    chargingStation, chargingOrientation: chargingOrientation ?? 0,
  })).json();
  return data.downloadUrl;
}

// ── Charger Calibration ──────────────────────────────────────────

/** Na autonomous mapping: stuur maaier terug naar station via go_to_charge + ArUco scan.
 *  Wacht tot de maaier gedockt is (battery_state = CHARGING), dan save_recharge_pos. */
export async function dockAndSave(sn: string): Promise<{ ok: boolean; waited?: number; error?: string }> {
  const data = await (await post(`${BASE}/maps/${encodeURIComponent(sn)}/dock-and-save`, {})).json();
  return data;
}

/** Kalibreer laadstation: maaier rijdt ~1m naar voren en parkeert automatisch terug via go_to_charge + ArUco. */
export async function calibrateCharger(sn: string): Promise<{ ok: boolean }> {
  const data = await (await post(`${BASE}/maps/${encodeURIComponent(sn)}/calibrate-charger`, {})).json();
  return data;
}

// ── Work Records (Mowing History) ────────────────────────────────

export async function fetchWorkRecords(sn: string, limit = 50, offset = 0): Promise<{ records: WorkRecord[]; total: number }> {
  const data = await (await get(`${BASE}/work-records/${encodeURIComponent(sn)}?limit=${limit}&offset=${offset}`)).json();
  return { records: data.records ?? [], total: data.total ?? 0 };
}

// ── Signal History ──────────────────────────────────────────────

export async function fetchSignalHistory(sn: string, hours = 24): Promise<SignalHistoryPoint[]> {
  const data = await (await get(`${BASE}/signal-history/${encodeURIComponent(sn)}?hours=${hours}`)).json();
  return data.history ?? [];
}

// ── Schedules ──────────────────────────────────────────────────

export async function fetchSchedules(sn: string): Promise<Schedule[]> {
  const data = await (await get(`${BASE}/schedules/${encodeURIComponent(sn)}`)).json();
  return data.schedules ?? [];
}

export async function createSchedule(sn: string, schedule: Omit<Schedule, 'scheduleId' | 'mowerSn' | 'createdAt' | 'updatedAt' | 'lastTriggeredAt'>): Promise<Schedule> {
  const data = await (await post(`${BASE}/schedules/${encodeURIComponent(sn)}`, schedule)).json();
  return data.schedule;
}

export async function updateSchedule(sn: string, scheduleId: string, updates: Partial<Schedule>): Promise<Schedule> {
  const res = await fetch(`${BASE}/schedules/${encodeURIComponent(sn)}/${encodeURIComponent(scheduleId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.schedule;
}

export async function deleteSchedule(sn: string, scheduleId: string): Promise<void> {
  await fetch(`${BASE}/schedules/${encodeURIComponent(sn)}/${encodeURIComponent(scheduleId)}`, {
    method: 'DELETE',
  });
}

export async function sendSchedule(sn: string, scheduleId: string): Promise<void> {
  await post(`${BASE}/schedules/${encodeURIComponent(sn)}/${encodeURIComponent(scheduleId)}/send`);
}

// ── Rain Sessions ───────────────────────────────────────────────

export interface RainSession {
  session_id: string;
  schedule_id: string;
  mower_sn: string;
  state: 'paused' | 'resuming' | 'completed' | 'cancelled';
  map_id: string | null;
  map_name: string | null;
  cutting_height: number;
  path_direction: number;
  paused_at: string;
  resumed_at: string | null;
}

export async function fetchRainSessions(sn: string): Promise<RainSession[]> {
  const data = await (await get(`${BASE}/rain-sessions/${encodeURIComponent(sn)}`)).json();
  return data.sessions ?? [];
}

export interface RainForecast {
  available: boolean;
  clearAt: string | null;
  upcoming: Array<{ time: string; mm: number; prob: number }>;
}

export async function fetchRainForecast(sn: string): Promise<RainForecast> {
  const data = await (await get(`${BASE}/rain-forecast/${encodeURIComponent(sn)}`)).json();
  return data;
}

// ── Extended Mower Commands ────────────────────────────────────

export async function navigateToPosition(sn: string, latitude: number, longitude: number, angle = 0): Promise<CommandResult> {
  return (await post(`${BASE}/navigate-to/${encodeURIComponent(sn)}`, { latitude, longitude, angle })).json();
}

export async function stopNavigation(sn: string): Promise<CommandResult> {
  return (await post(`${BASE}/stop-navigation/${encodeURIComponent(sn)}`)).json();
}

export async function startPatrol(sn: string): Promise<CommandResult> {
  return (await post(`${BASE}/patrol/${encodeURIComponent(sn)}`)).json();
}

export async function stopPatrol(sn: string): Promise<CommandResult> {
  return (await post(`${BASE}/stop-patrol/${encodeURIComponent(sn)}`)).json();
}

export async function setChargeThreshold(sn: string, threshold: number): Promise<CommandResult> {
  return (await post(`${BASE}/charge-threshold/${encodeURIComponent(sn)}`, { threshold })).json();
}

export async function setMaxSpeed(sn: string, speed: number): Promise<CommandResult> {
  return (await post(`${BASE}/max-speed/${encodeURIComponent(sn)}`, { speed })).json();
}

export async function previewPath(sn: string, polygonArea: Array<{ latitude: number; longitude: number }>, covDirection = 0): Promise<CommandResult> {
  return (await post(`${BASE}/preview-path/${encodeURIComponent(sn)}`, { polygonArea, covDirection })).json();
}

// ── Virtual Walls ──────────────────────────────────────────────

export interface VirtualWall {
  wall_id: string;
  mower_sn: string;
  wall_name: string | null;
  lat1: number;
  lng1: number;
  lat2: number;
  lng2: number;
  enabled: number;
  created_at: string;
}

export async function fetchVirtualWalls(sn: string): Promise<VirtualWall[]> {
  const data = await (await get(`${BASE}/virtual-walls/${encodeURIComponent(sn)}`)).json();
  return data.walls ?? [];
}

export async function createVirtualWall(sn: string, wall: { wallName?: string; lat1: number; lng1: number; lat2: number; lng2: number }): Promise<{ ok: boolean; wallId: string }> {
  return (await post(`${BASE}/virtual-walls/${encodeURIComponent(sn)}`, wall)).json();
}

export async function deleteVirtualWall(sn: string, wallId: string): Promise<void> {
  await fetch(`${BASE}/virtual-walls/${encodeURIComponent(sn)}/${encodeURIComponent(wallId)}`, { method: 'DELETE' });
}

// ── Extended Commands (firmware Python node) ───────────────────

export async function sendExtendedCommand(sn: string, command: Record<string, unknown>): Promise<CommandResult> {
  return (await post(`${BASE}/extended/${encodeURIComponent(sn)}`, command)).json();
}

export async function rebootMower(sn: string): Promise<CommandResult> {
  return sendExtendedCommand(sn, { set_robot_reboot: {} });
}

export async function setPerceptionMode(sn: string, mode: number): Promise<CommandResult> {
  return sendExtendedCommand(sn, { set_perception_mode: { mode } });
}

export async function setSemanticMode(sn: string, mode: number): Promise<CommandResult> {
  return sendExtendedCommand(sn, { set_semantic_mode: { mode } });
}

export async function getPerceptionStatus(sn: string): Promise<CommandResult> {
  return sendExtendedCommand(sn, { get_perception_status: {} });
}

// ── OTA Firmware ────────────────────────────────────────────────

export interface OtaVersion {
  id: number;
  version: string;
  device_type: string;
  release_notes: string | null;
  download_url: string | null;
  md5: string | null;
  created_at: string;
}

export interface FirmwareFile {
  name: string;
  md5: string;
  size: number;
}

export async function fetchOtaVersions(): Promise<OtaVersion[]> {
  const data = await (await get(`${BASE}/ota/versions`)).json();
  return data.versions ?? [];
}

export async function updateOtaVersion(id: number, params: {
  version?: string;
  device_type?: string;
  download_url?: string;
  release_notes?: string;
}): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/ota/versions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function deleteOtaVersion(id: number): Promise<void> {
  await fetch(`${BASE}/ota/versions/${id}`, { method: 'DELETE' });
}

export async function triggerOta(sn: string, versionId: number, force = false): Promise<{ ok: boolean; version: string }> {
  return (await post(`${BASE}/ota/trigger/${encodeURIComponent(sn)}`, { version_id: versionId, force })).json();
}

export async function fetchFirmwareFiles(): Promise<FirmwareFile[]> {
  const data = await (await get(`${BASE}/firmware-list`)).json();
  return data.files ?? [];
}

// ── Device Registration ─────────────────────────────────────────

export interface BleDevice {
  name: string;
  mac: string;
  rssi: number;
}

export async function scanBleDevices(duration = 5): Promise<BleDevice[]> {
  const res = await get(`/api/admin/ble-scan?duration=${duration}`);
  const data = await res.json();
  return data.devices ?? [];
}

export async function registerDeviceMac(sn: string, macAddress: string): Promise<void> {
  await post(`/api/admin/devices/${encodeURIComponent(sn)}/mac`, { macAddress });
}

// ── Setup / DNS ──────────────────────────────────────────────────────────────

export interface SetupInfo {
  targetIp: string | null;
  dnsEnabled: boolean;
  port: number;
  mqttPort: number;
}

export async function fetchSetupInfo(): Promise<SetupInfo> {
  const res = await get(`${BASE}/setup/info`);
  return res.json();
}

export async function checkSetupStatus(): Promise<{ hasUsers: boolean }> {
  const res = await fetch(`${BASE}/setup/status`);
  return res.json();
}

export async function createFirstUser(email: string, password: string, username?: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${BASE}/setup/create-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, username }),
  });
  return res.json();
}

/**
 * Test DNS by trying to reach the server via app.lfibot.com.
 * Returns true if DNS correctly resolves to this server.
 */
export async function testDns(serverPort: number): Promise<{ ok: boolean; resolvedTo?: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`http://app.lfibot.com:${serverPort}/api/dashboard/setup/info`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json() as SetupInfo;
    return { ok: true, resolvedTo: data.targetIp ?? undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'DNS lookup failed' };
  }
}

/**
 * Check of het CA-certificaat vertrouwd is door een HTTPS-fetch te proberen.
 * Als de fetch slaagt → cert is geïnstalleerd en vertrouwd.
 * Als de fetch faalt (SSL error / network error) → cert niet vertrouwd.
 */
export async function checkCertTrusted(): Promise<boolean> {
  // Als de dashboard al via HTTP geopend wordt, is er geen TLS cert nodig
  if (window.location.protocol === 'http:') return true;
  try {
    const httpsUrl = `https://${window.location.hostname}/api/dashboard/setup/status`;
    // AbortSignal.timeout is niet beschikbaar in Safari < 16 — gebruik een fallback
    let signal: AbortSignal | undefined;
    try {
      signal = AbortSignal.timeout(5000);
    } catch {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);
      signal = controller.signal;
    }
    const res = await fetch(httpsUrl, { signal });
    return res.ok;
  } catch {
    return false;
  }
}

export interface UnboundDevice {
  sn: string;
  deviceType: 'mower' | 'charger';
  online: boolean;
  lastSeen: string | null;
}

export async function fetchUnboundDevices(): Promise<UnboundDevice[]> {
  const res = await get(`${BASE}/unbound-devices`);
  const data = await res.json();
  return data.devices ?? [];
}

export async function bindDevice(sn: string, name?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await post(`${BASE}/bind-device`, { sn, name });
    return res.json();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout' };
  }
}

// ── Equipment Settings ──────────────────────────────────────────

export async function updateMowerNickname(sn: string, nickname: string | null): Promise<void> {
  const res = await fetch(`${BASE}/equipment/${encodeURIComponent(sn)}/nickname`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });
  if (!res.ok) throw new Error(`updateMowerNickname failed: ${res.status}`);
}

// ── System diagnostics (drawer cards) ───────────────────────────────

export interface SystemHealth {
  mdns: { running: boolean; advertisement: unknown };
  server: { uptimeSec: number; startedAt: string };
  mowers: Array<{ sn: string; online: boolean; sensorKeys: number }>;
}
export async function fetchSystemHealth(): Promise<SystemHealth> {
  const res = await get(`${BASE}/system/health`);
  return res.json() as Promise<SystemHealth>;
}

export interface LoraStatus {
  sn: string;
  pair: { address: string | null; channel: string | null };
  peer: { sn: string | null; address: string | null; channel: string | null };
  drift: boolean;
}
export async function fetchLoraStatus(sn: string): Promise<LoraStatus | null> {
  const res = await fetch(`${BASE}/system/lora-status/${encodeURIComponent(sn)}`);
  if (res.status === 404) return null; // no_lora_cache
  if (!res.ok) throw new Error(`fetchLoraStatus failed: ${res.status}`);
  return res.json() as Promise<LoraStatus>;
}

export interface SystemLogEntry {
  ts: number;
  type: string;
  clientId: string;
  clientType: 'APP' | 'DEV' | '?';
  sn: string | null;
  direction: string;
  topic: string;
  payload: string;
  encrypted: boolean;
}
export async function fetchSystemLogs(opts?: { tail?: number; type?: string; sn?: string }): Promise<SystemLogEntry[]> {
  const qs = new URLSearchParams();
  if (opts?.tail) qs.set('tail', String(opts.tail));
  if (opts?.type) qs.set('type', opts.type);
  if (opts?.sn) qs.set('sn', opts.sn);
  const res = await get(`${BASE}/system/logs${qs.toString() ? '?' + qs.toString() : ''}`);
  const data = await res.json() as { logs: SystemLogEntry[] };
  return data.logs;
}

// ── Map Edit API ────────────────────────────────────────────────

export interface EditDraftDto { points: { x: number; y: number }[]; deleted: boolean; isNew: boolean }
export interface EditMapEntry {
  mapId: string; canonical: string; mapType: 'work' | 'obstacle' | 'unicom';
  alias: string | null; parentMap: string | null;
  points: { x: number; y: number }[]; draft: EditDraftDto | null;
}
export interface EditGeometryDto { maps: EditMapEntry[]; pendingSync: boolean; hasVersions: boolean }
export interface EditValidationIssue { canonical: string; code: string; message: string }
export interface EditApplyDto {
  ok: boolean; reason?: string;
  validation?: { ok: boolean; errors: EditValidationIssue[]; warnings: EditValidationIssue[] };
  applied?: { canonical: string; action: string }[];
}

export async function fetchEditGeometry(sn: string): Promise<EditGeometryDto> {
  return (await get(`${BASE}/maps/${encodeURIComponent(sn)}/edit/geometry`)).json();
}
export async function saveEditDraft(sn: string, body: {
  canonical?: string; mapType?: 'work' | 'obstacle'; parentMap?: string;
  points?: { x: number; y: number }[]; deleted?: boolean;
}): Promise<{ ok: boolean; canonical?: string; error?: string }> {
  const res = await fetch(`${BASE}/maps/${encodeURIComponent(sn)}/edit/draft`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return res.json();
}
export async function discardEditDrafts(sn: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/maps/${encodeURIComponent(sn)}/edit/drafts`, { method: 'DELETE' });
  return res.json();
}
async function postEdit(sn: string, action: 'apply' | 'revert'): Promise<EditApplyDto> {
  const res = await fetch(`${BASE}/maps/${encodeURIComponent(sn)}/edit/${action}`, { method: 'POST' });
  try { return await res.json(); } catch { return { ok: false, reason: `http_${res.status}` }; }
}
export async function applyEdits(sn: string): Promise<EditApplyDto> { return postEdit(sn, 'apply'); }
export async function revertEdits(sn: string): Promise<EditApplyDto> { return postEdit(sn, 'revert'); }

// ── Coverage Path Preview ───────────────────────────────────────
// Mirrors the OpenNova app (api.ts getPreviewPath / refreshPreviewPath).
// Each entry is one polyline sub-path in LOCAL meters (charger = 0,0) —
// "{map_id}_{sub_id}" id format, same shape the mower's coverage planner
// returns. Project local→GPS the same way the map polygons are projected.

export interface CoveragePathEntry { id: string; points: { x: number; y: number }[] }

/** GET cached preview path. Returns [] if nothing cached. */
export async function getPreviewPath(sn: string): Promise<CoveragePathEntry[]> {
  const res = await get(`${BASE}/preview-path/${encodeURIComponent(sn)}`);
  const data = await res.json() as { paths?: CoveragePathEntry[] };
  return data.paths ?? [];
}

/** Result of a refresh: the (possibly freshly generated) paths plus a `busy`
 *  flag set when the mower is mid-coverage (server replies 409 with cached
 *  paths). We never throw on 409 — we surface it via `busy` so the caller can
 *  keep showing the cached lines and tell the user why a refresh was skipped. */
export interface RefreshPreviewResult { paths: CoveragePathEntry[]; busy: boolean }

/** POST refresh-preview-path. Triggers generate_preview_cover_path on the
 *  mower (server-side), waits ~3.5 s, fetches via the extended backchannel.
 *  Body params mirror the server contract exactly: `map_ids` (number|number[],
 *  server default 1) and `cov_direction` (number). The app passes mapIds:1. */
export async function refreshPreviewPath(
  sn: string,
  opts?: { mapIds?: number | number[]; covDirection?: number },
): Promise<RefreshPreviewResult> {
  const body: Record<string, unknown> = {};
  if (opts?.mapIds !== undefined) body.map_ids = opts.mapIds;
  if (opts?.covDirection !== undefined) body.cov_direction = opts.covDirection;
  const res = await fetch(`${BASE}/refresh-preview-path/${encodeURIComponent(sn)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // 409 = coverage task active: body still carries cached paths. Don't throw.
  if (res.status === 409) {
    const data = await res.json().catch(() => ({})) as { paths?: CoveragePathEntry[] };
    return { paths: data.paths ?? [], busy: true };
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json() as { ok?: boolean; paths?: CoveragePathEntry[]; error?: string };
  if (data.ok === false) throw new Error(data.error || 'refresh-preview-path failed');
  return { paths: data.paths ?? [], busy: false };
}

// ── Live plan path (works DURING mowing) ────────────────────────
// Mirrors the preview methods but uses the mower's get_map_plan_path, which is
// safe while a coverage task is active (no Error-128 risk). The OpenNova app
// prefers this "planned path" over the idle preview while the mower mows.
// Server routes: GET /planned-path/:sn and POST /refresh-plan-path/:sn — both
// reply with `{ paths }` (POST also `{ ok, count }`). Same CoveragePathEntry
// shape (local meters) as the preview path.

/** GET cached live plan path. Returns [] if nothing cached. */
export async function getPlanPath(sn: string): Promise<CoveragePathEntry[]> {
  const res = await get(`${BASE}/planned-path/${encodeURIComponent(sn)}`);
  const data = await res.json() as { paths?: CoveragePathEntry[] };
  return data.paths ?? [];
}

/** POST refresh-plan-path. Triggers get_map_plan_path via the extended
 *  backchannel (8s timeout), caches + returns the parsed paths. 503 if offline,
 *  504 if the mower didn't respond in time. */
export async function refreshPlanPath(sn: string): Promise<CoveragePathEntry[]> {
  const res = await fetch(`${BASE}/refresh-plan-path/${encodeURIComponent(sn)}`, { method: 'POST' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json() as { ok?: boolean; paths?: CoveragePathEntry[]; error?: string };
  if (data.ok === false) throw new Error(data.error || 'refresh-plan-path failed');
  return data.paths ?? [];
}
