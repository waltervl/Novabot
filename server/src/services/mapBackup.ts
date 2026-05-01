/**
 * Map Backup Service — auto-snapshot + retention for mower map state.
 *
 * After every map mutation a snapshot is scheduled (trailing-edge debounce:
 * 5 s). On fire a full ZIP is generated via generateMapZipFromDb() and stored
 * durably under:
 *
 *   <STORAGE_PATH>/maps/backups/<sn>/<ISO-timestamp>.zip
 *
 * Retention: at most 20 snapshots per mower are kept; older ones are deleted.
 */

import path from 'path';
import fs from 'fs';
import { generateMapZipFromDb } from '../mqtt/mapConverter.js';

const TAG = '[MAP-BACKUP]';

/** Maximum number of snapshots kept per mower (oldest are pruned). */
const RETENTION = 20;

/** Debounce window in ms — rapid back-to-back mutations coalesce into one snapshot. */
const DEBOUNCE_MS = 5000;

/** In-flight debounce timers keyed by mower SN. */
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ── Paths ────────────────────────────────────────────────────────────────────

/**
 * Return (and create if necessary) the backup directory for a given SN.
 */
function backupDir(sn: string): string {
  const root = path.resolve(
    process.env.STORAGE_PATH ?? './storage',
    'maps',
    'backups',
    sn,
  );
  fs.mkdirSync(root, { recursive: true });
  return root;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * List all backup snapshots for a mower, ordered newest first.
 */
export function listBackups(sn: string): Array<{ filename: string; ts: number; sizeBytes: number }> {
  const dir = path.resolve(
    process.env.STORAGE_PATH ?? './storage',
    'maps',
    'backups',
    sn,
  );
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.zip'));
  return files
    .map(f => {
      try {
        const stat = fs.statSync(path.join(dir, f));
        return { filename: f, ts: stat.mtimeMs, sizeBytes: stat.size };
      } catch {
        return null;
      }
    })
    .filter((x): x is { filename: string; ts: number; sizeBytes: number } => x !== null)
    .sort((a, b) => b.ts - a.ts);
}

/**
 * Resolve the absolute path for a backup file.
 * Throws if the filename does not match the expected pattern (path-traversal guard).
 */
export function backupPath(sn: string, filename: string): string {
  // Allow only safe filenames: ISO timestamps with colons replaced by dashes,
  // e.g. "2026-04-29T10-15-30.000Z.zip"
  if (!/^[\w.\-T:Z]+\.zip$/.test(filename)) {
    throw new Error('Invalid backup filename');
  }
  return path.join(backupDir(sn), filename);
}

/**
 * Schedule a snapshot for the given mower.
 *
 * Uses trailing-edge debounce: if called multiple times within DEBOUNCE_MS,
 * only the last call's snapshot fires. This ensures that a burst of related
 * mutations (e.g. delete-cascade removing work + obstacles + unicom) results
 * in a single snapshot rather than three consecutive ones.
 */
export function scheduleSnapshot(sn: string): void {
  const existing = pendingTimers.get(sn);
  if (existing) clearTimeout(existing);

  const t = setTimeout(() => {
    pendingTimers.delete(sn);
    _fireSnapshot(sn);
  }, DEBOUNCE_MS);

  pendingTimers.set(sn, t);
}

// ── Internal ─────────────────────────────────────────────────────────────────

/**
 * Build and persist a snapshot immediately (no debounce).
 * Returns the absolute path of the saved ZIP, or null on failure.
 */
function _fireSnapshot(sn: string): string | null {
  try {
    // ISO timestamp with colons replaced so the filename is FS-safe everywhere
    const filename = `${new Date().toISOString().replace(/:/g, '-')}.zip`;
    const target = path.join(backupDir(sn), filename);

    const tmp = generateMapZipFromDb(sn, 0);
    if (!tmp) {
      console.log(`${TAG} No maps for ${sn} — snapshot skipped`);
      return null;
    }

    fs.copyFileSync(tmp, target);
    console.log(`${TAG} snapshot saved → ${target}`);

    _enforceRetention(sn);
    return target;
  } catch (err) {
    console.error(`${TAG} snapshot failed for ${sn}:`, err);
    return null;
  }
}

/**
 * Prune oldest snapshots so at most RETENTION files remain per mower.
 */
function _enforceRetention(sn: string): void {
  const all = listBackups(sn); // newest first
  const toDelete = all.slice(RETENTION);
  for (const b of toDelete) {
    try {
      fs.unlinkSync(path.join(backupDir(sn), b.filename));
    } catch { /* ignore ENOENT races */ }
  }
}

// ── Test helpers (exported for vitest only) ───────────────────────────────────

/**
 * Cancel all pending debounce timers. Call from vitest `beforeEach` cleanup.
 */
export function _drainScheduled(): void {
  for (const t of pendingTimers.values()) clearTimeout(t);
  pendingTimers.clear();
}

/**
 * Fire a snapshot immediately (bypassing the debounce timer).
 * Returns the absolute path of the written ZIP, or null on failure.
 */
export function _snapshotNow(sn: string): string | null {
  return _fireSnapshot(sn);
}
