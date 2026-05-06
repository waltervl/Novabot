// server/src/services/importStaging.ts
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type ImportState =
  | 'UPLOADED'
  | 'ANCHOR_SET'
  | 'DRIVE_REQUESTED'
  | 'DRIVE_COMPLETE'
  | 'PREVIEW_SHOWN'
  | 'USER_CONFIRMED'
  | 'APPLIED'
  | 'CANCELLED';

const LEGAL: Record<ImportState, ImportState[]> = {
  UPLOADED:        ['ANCHOR_SET', 'CANCELLED'],
  ANCHOR_SET:      ['DRIVE_REQUESTED', 'CANCELLED'],
  DRIVE_REQUESTED: ['DRIVE_COMPLETE', 'CANCELLED'],
  DRIVE_COMPLETE:  ['PREVIEW_SHOWN', 'CANCELLED'],
  PREVIEW_SHOWN:   ['USER_CONFIRMED', 'CANCELLED'],
  USER_CONFIRMED:  ['APPLIED', 'CANCELLED'],
  APPLIED:         [],
  CANCELLED:       [],
};

export interface StagingContext {
  sourceSn: string;
  polygonAreaM2: number;
  newCharger?: { lat: number; lng: number };
  driveStart?: { lat: number; lng: number };
  driveEnd?: { lat: number; lng: number };
  derivedHeadingRad?: number;
  applyResult?: { driftM?: number; warning?: string };
}

export interface StagingSession {
  sn: string;
  stagingId: string;
  state: ImportState;
  createdAt: number;
  updatedAt: number;
  context: StagingContext;
}

export class IllegalStateTransitionError extends Error {
  constructor(from: ImportState, to: ImportState) {
    super(`illegal state transition ${from} -> ${to}`);
    this.name = 'IllegalStateTransitionError';
  }
}

export class ImportStagingStore {
  private cache = new Map<string, StagingSession>();
  constructor(private readonly rootDir: string) {
    fs.mkdirSync(rootDir, { recursive: true });
    this.loadAll();
  }

  private loadAll(): void {
    if (!fs.existsSync(this.rootDir)) return;
    for (const sn of fs.readdirSync(this.rootDir)) {
      const snDir = path.join(this.rootDir, sn);
      if (!fs.statSync(snDir).isDirectory()) continue;
      for (const id of fs.readdirSync(snDir)) {
        const f = path.join(snDir, id, 'state.json');
        if (fs.existsSync(f)) {
          try {
            const s = JSON.parse(fs.readFileSync(f, 'utf8')) as StagingSession;
            this.cache.set(s.stagingId, s);
          } catch { /* skip corrupt */ }
        }
      }
    }
  }

  private persist(s: StagingSession): void {
    const dir = path.join(this.rootDir, s.sn, s.stagingId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(s, null, 2));
  }

  create(sn: string, context: StagingContext): StagingSession {
    if (this.getActive(sn)) throw new Error(`active session already exists for ${sn}`);
    const s: StagingSession = {
      sn, stagingId: randomUUID(), state: 'UPLOADED',
      createdAt: Date.now(), updatedAt: Date.now(),
      context,
    };
    this.cache.set(s.stagingId, s);
    this.persist(s);
    return s;
  }

  get(stagingId: string): StagingSession | null {
    return this.cache.get(stagingId) ?? null;
  }

  getActive(sn: string): StagingSession | null {
    for (const s of this.cache.values()) {
      if (s.sn === sn && s.state !== 'APPLIED' && s.state !== 'CANCELLED') return s;
    }
    return null;
  }

  transition(stagingId: string, to: ImportState, contextPatch: Partial<StagingContext>): StagingSession {
    const s = this.cache.get(stagingId);
    if (!s) throw new Error(`unknown stagingId ${stagingId}`);
    if (!LEGAL[s.state].includes(to)) throw new IllegalStateTransitionError(s.state, to);
    s.state = to;
    s.updatedAt = Date.now();
    s.context = { ...s.context, ...contextPatch };
    this.persist(s);
    return s;
  }

  cancel(stagingId: string, _reason: string): void {
    const s = this.cache.get(stagingId);
    if (!s) return;
    const dir = path.join(this.rootDir, s.sn, s.stagingId);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    this.cache.delete(stagingId);
  }
}
