/**
 * Map & obstacle bewerking: drafts, validatie, apply naar maaier, revert.
 * Spec: docs/superpowers/specs/2026-06-10-map-obstacle-editing-design.md
 */
import { mapRepo, mapEditsRepo, deviceSettingsRepo } from '../db/repositories/index.js';
import type { MapRow } from '../db/repositories/maps.js';
import {
  simplifyPolygon, validateMapSet, type XY, type ValidationResult,
} from '../maps/editGeometry.js';
import { deviceCache } from '../mqtt/sensorData.js';
import { isDeviceOnline } from '../mqtt/broker.js';
import { db } from '../db/database.js';

const TAG = '[MAP-EDIT]';
const SIMPLIFY_TOL_M = 0.05;
const PENDING_KEY = 'map_edit_pending_sync';
const VERSIONS_KEEP = 10;

export interface EditMapEntry {
  mapId: string;
  canonical: string;
  mapType: 'work' | 'obstacle' | 'unicom';
  alias: string | null;
  parentMap: string | null;
  points: XY[];                                   // vereenvoudigd, lokale meters
  draft: { points: XY[]; deleted: boolean; isNew: boolean } | null;
}
export interface EditGeometry {
  maps: EditMapEntry[];
  pendingSync: boolean;
  hasVersions: boolean;
}

function parentMapOf(canonical: string): string | null {
  const m = canonical.match(/^(map\d+)_\d+_obstacle$/);
  return m ? m[1] : null;
}

function parseArea(row: Pick<MapRow, 'map_area'>): XY[] {
  if (!row.map_area) return [];
  try { return JSON.parse(row.map_area) as XY[]; } catch { return []; }
}

function isPendingSync(sn: string): boolean {
  return deviceSettingsRepo.findBySn(sn).some(r => r.key === PENDING_KEY && r.value === '1');
}

export function getEditGeometry(sn: string): EditGeometry {
  const rows = mapRepo.findByMowerSn(sn);
  const drafts = new Map(mapEditsRepo.listDrafts(sn).map(d => [d.canonical_name, d]));
  const maps: EditMapEntry[] = [];

  for (const row of rows) {
    const canonical = row.canonical_name;
    if (!canonical) continue;                      // niet-canonieke rijen (zips e.d.) niet editbaar
    const pts = parseArea(row);
    if (row.map_type !== 'unicom' && pts.length < 3) continue;
    const d = drafts.get(canonical);
    drafts.delete(canonical);
    maps.push({
      mapId: row.map_id,
      canonical,
      mapType: (row.map_type as EditMapEntry['mapType']) ?? 'work',
      alias: row.map_name,
      parentMap: parentMapOf(canonical),
      points: row.map_type === 'unicom' ? pts : simplifyPolygon(pts, SIMPLIFY_TOL_M),
      draft: d ? { points: d.draft_area ? (JSON.parse(d.draft_area) as XY[]) : [], deleted: d.deleted === 1, isNew: !d.map_id } : null,
    });
  }
  // Overgebleven drafts = nieuw getekende obstacles (geen maps-rij)
  for (const d of drafts.values()) {
    maps.push({
      mapId: d.map_id ?? '',
      canonical: d.canonical_name,
      mapType: 'obstacle',
      alias: null,
      parentMap: d.parent_map,
      points: [],
      draft: { points: d.draft_area ? (JSON.parse(d.draft_area) as XY[]) : [], deleted: d.deleted === 1, isNew: true },
    });
  }
  return { maps, pendingSync: isPendingSync(sn), hasVersions: !!mapEditsRepo.latestVersion(sn) };
}

export interface SaveDraftInput {
  canonical?: string;
  mapType?: 'work' | 'obstacle';
  parentMap?: string;          // verplicht bij nieuw obstacle
  points?: XY[];
  deleted?: boolean;
}
export interface SaveDraftResult { ok: boolean; canonical?: string; error?: string }

export function saveDraft(sn: string, input: SaveDraftInput): SaveDraftResult {
  if (input.canonical) {
    const row = mapRepo.findBySnAndCanonical(sn, input.canonical);
    if (!row) return { ok: false, error: `Onbekende kaart ${input.canonical}` };
    if (row.map_type === 'unicom') return { ok: false, error: 'Unicom-paden zijn niet bewerkbaar' };
    if (input.deleted) {
      if (row.map_type !== 'obstacle') return { ok: false, error: 'Alleen obstacles kunnen verwijderd worden' };
      mapEditsRepo.upsertDraft({ mower_sn: sn, canonical_name: input.canonical, map_id: row.map_id,
        map_type: 'obstacle', parent_map: parentMapOf(input.canonical), draft_area: null, deleted: 1 });
      return { ok: true, canonical: input.canonical };
    }
    if (!input.points || input.points.length < 3) return { ok: false, error: 'Minimaal 3 punten nodig' };
    mapEditsRepo.upsertDraft({ mower_sn: sn, canonical_name: input.canonical, map_id: row.map_id,
      map_type: row.map_type as 'work' | 'obstacle', parent_map: parentMapOf(input.canonical),
      draft_area: JSON.stringify(input.points), deleted: 0 });
    return { ok: true, canonical: input.canonical };
  }

  if (input.mapType !== 'obstacle' || !input.parentMap) {
    return { ok: false, error: 'Nieuw tekenen kan alleen als obstacle met parentMap' };
  }
  if (!input.points || input.points.length < 3) return { ok: false, error: 'Minimaal 3 punten nodig' };
  const taken = new Set<string>([
    ...mapRepo.findByMowerSn(sn).map(r => r.canonical_name ?? ''),
    ...mapEditsRepo.listDrafts(sn).map(d => d.canonical_name),
  ]);
  let idx = 0;
  while (taken.has(`${input.parentMap}_${idx}_obstacle`)) idx++;
  const canonical = `${input.parentMap}_${idx}_obstacle`;
  mapEditsRepo.upsertDraft({ mower_sn: sn, canonical_name: canonical, map_id: null,
    map_type: 'obstacle', parent_map: input.parentMap,
    draft_area: JSON.stringify(input.points), deleted: 0 });
  return { ok: true, canonical };
}

export function discardDrafts(sn: string): void {
  mapEditsRepo.clearDrafts(sn);
}

// ── Task 7: apply / revert ──────────────────────────────────────────────────

// Zelfde logica als isCoverageActive in dashboard.ts (daar private; hier
// gedupliceerd om een route↔service import-cyclus te vermijden).
function isMowerBusy(sn: string): boolean {
  const sensors = deviceCache.get(sn);
  if (!sensors) return false;
  const msg = sensors.get('msg') ?? '';
  if (msg.includes('Work:RUNNING') || msg.includes('Work:COVERING')
      || msg.includes('Work:NAVIGATING') || msg.includes('Work:MOVING')) return true;
  if (msg.includes('Mode:COVERAGE') && !msg.includes('Work:STANDBY') && !msg.includes('Work:IDLE')) return true;
  return false;
}

export interface ApplyResult {
  ok: boolean;
  reason?: 'offline' | 'busy' | 'locked' | 'no_changes' | 'validation' | 'bundle_failed' | 'push_failed' | 'no_version';
  validation?: ValidationResult;
  applied?: { canonical: string; action: 'updated' | 'created' | 'deleted' }[];
}

const applyLocks = new Set<string>();

interface SnapshotRow {
  map_id: string; canonical_name: string | null; map_type: string;
  map_name: string | null; map_area: string | null; map_max_min: string | null; file_name: string | null;
}

function snapshotMaps(sn: string): string {
  const rows = mapRepo.findByMowerSn(sn).map((r): SnapshotRow => ({
    map_id: r.map_id, canonical_name: r.canonical_name, map_type: r.map_type,
    map_name: r.map_name, map_area: r.map_area, map_max_min: r.map_max_min, file_name: r.file_name,
  }));
  return JSON.stringify(rows);
}

function boundsOf(pts: XY[]): string {
  return JSON.stringify({
    minX: Math.min(...pts.map(p => p.x)), maxX: Math.max(...pts.map(p => p.x)),
    minY: Math.min(...pts.map(p => p.y)), maxY: Math.max(...pts.map(p => p.y)),
  });
}

async function bundleAndPush(sn: string): Promise<ApplyResult> {
  const { createBundleFromDb } = await import('./portableBackup.js');
  const { pushMapToMowerVerbatim } = await import('../mqtt/mapSync.js');
  const bundle = await createBundleFromDb(sn, 'map_edit');
  if (!bundle) {
    deviceSettingsRepo.upsert(sn, PENDING_KEY, '1');
    return { ok: false, reason: 'bundle_failed' };
  }
  const push = await pushMapToMowerVerbatim(sn, bundle.filename);
  if (!push.ok) {
    deviceSettingsRepo.upsert(sn, PENDING_KEY, '1');
    console.warn(`${TAG} ${sn}: push mislukt (${JSON.stringify(push)}) — pending sync gezet`);
    return { ok: false, reason: 'push_failed' };
  }
  deviceSettingsRepo.upsert(sn, PENDING_KEY, '0');
  return { ok: true };
}

export async function applyEdits(sn: string): Promise<ApplyResult> {
  if (applyLocks.has(sn)) return { ok: false, reason: 'locked' };
  applyLocks.add(sn);
  try {
    if (!isDeviceOnline(sn)) return { ok: false, reason: 'offline' };
    if (isMowerBusy(sn)) return { ok: false, reason: 'busy' };

    const drafts = mapEditsRepo.listDrafts(sn);
    if (drafts.length === 0) {
      // Geen edits — maar een eerdere apply kan zijn blijven hangen: retry de push.
      if (isPendingSync(sn)) return bundleAndPush(sn);
      return { ok: false, reason: 'no_changes' };
    }

    // Merged state opbouwen: huidige maps + drafts erover
    const rows = mapRepo.findByMowerSn(sn);
    const byCanonical = new Map(rows.filter(r => r.canonical_name).map(r => [r.canonical_name as string, r]));
    const originals = new Map<string, XY[]>();
    const work: { canonical: string; points: XY[] }[] = [];
    const obstacles: { canonical: string; parentMap: string; points: XY[] }[] = [];
    for (const row of rows) {
      if (!row.canonical_name || !row.map_area) continue;
      originals.set(row.canonical_name, parseArea(row));
    }
    const draftMap = new Map(drafts.map(d => [d.canonical_name, d]));
    const allCanonicals = new Set([...byCanonical.keys(), ...draftMap.keys()]);
    for (const canonical of allCanonicals) {
      const d = draftMap.get(canonical);
      const row = byCanonical.get(canonical);
      if (d?.deleted) continue;                          // verwijderd → niet valideren
      const pts: XY[] = d?.draft_area ? JSON.parse(d.draft_area) : (row ? parseArea(row) : []);
      const type = d?.map_type ?? row?.map_type;
      if (type === 'work' && pts.length >= 3) work.push({ canonical, points: pts });
      else if (type === 'obstacle' && pts.length >= 3) {
        obstacles.push({ canonical, parentMap: d?.parent_map ?? parentMapOf(canonical) ?? 'map0', points: pts });
      }
    }
    const validation = validateMapSet({ work, obstacles }, originals);
    if (!validation.ok) return { ok: false, reason: 'validation', validation };

    // Snapshot + mutaties in één transactie
    const applied: NonNullable<ApplyResult['applied']> = [];
    db.transaction(() => {
      mapEditsRepo.saveVersion(sn, snapshotMaps(sn), `voor apply ${new Date().toISOString()}`);
      mapEditsRepo.pruneVersions(sn, VERSIONS_KEEP);
      for (const d of drafts) {
        const row = byCanonical.get(d.canonical_name);
        if (d.deleted) {
          if (row) { mapRepo.deleteByIdAndMower(row.map_id, sn); applied.push({ canonical: d.canonical_name, action: 'deleted' }); }
        } else if (row) {
          const pts = JSON.parse(d.draft_area as string) as XY[];
          mapRepo.updateAreaAndBoundsByIdAndMower(row.map_id, sn, JSON.stringify(pts), boundsOf(pts));
          applied.push({ canonical: d.canonical_name, action: 'updated' });
        } else {
          const pts = JSON.parse(d.draft_area as string) as XY[];
          mapRepo.create({
            map_id: `edit_${d.canonical_name}_${Date.now()}`, mower_sn: sn,
            map_type: 'obstacle', file_name: `${d.canonical_name}.csv`,
            map_area: JSON.stringify(pts), map_max_min: boundsOf(pts),
          });
          applied.push({ canonical: d.canonical_name, action: 'created' });
        }
      }
      mapEditsRepo.clearDrafts(sn);
    })();

    const pushRes = await bundleAndPush(sn);
    return { ...pushRes, validation, applied };
  } finally {
    applyLocks.delete(sn);
  }
}

export async function revertEdits(sn: string): Promise<ApplyResult> {
  if (applyLocks.has(sn)) return { ok: false, reason: 'locked' };
  applyLocks.add(sn);
  try {
    if (!isDeviceOnline(sn)) return { ok: false, reason: 'offline' };
    if (isMowerBusy(sn)) return { ok: false, reason: 'busy' };
    const version = mapEditsRepo.latestVersion(sn);
    if (!version) return { ok: false, reason: 'no_version' };
    const snapshot = JSON.parse(version.snapshot) as SnapshotRow[];

    db.transaction(() => {
      const current = mapRepo.findByMowerSn(sn);
      const snapIds = new Set(snapshot.map(r => r.map_id));
      for (const row of current) {
        if (!snapIds.has(row.map_id)) mapRepo.deleteByIdAndMower(row.map_id, sn);
      }
      const currentIds = new Set(current.map(r => r.map_id));
      for (const r of snapshot) {
        if (currentIds.has(r.map_id)) {
          // Restore area + bounds. When the snapshot has no bounds (row was
          // created without map_max_min), recompute them from the area so the
          // UPDATE condition doesn't silently skip the restore.
          if (r.map_area) {
            let bounds = r.map_max_min;
            if (!bounds) {
              try { bounds = boundsOf(JSON.parse(r.map_area) as XY[]); } catch { bounds = '{}'; }
            }
            mapRepo.updateAreaAndBoundsByIdAndMower(r.map_id, sn, r.map_area, bounds);
          }
        } else {
          mapRepo.create({ map_id: r.map_id, mower_sn: sn, map_name: r.map_name,
            map_type: r.map_type, file_name: r.file_name, map_area: r.map_area, map_max_min: r.map_max_min });
        }
      }
      mapEditsRepo.deleteVersion(version.id);
      mapEditsRepo.clearDrafts(sn);
    })();

    return bundleAndPush(sn);
  } finally {
    applyLocks.delete(sn);
  }
}
