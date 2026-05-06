/**
 * Vitest global setup — runs once before any test file is loaded or any module
 * is imported.  This is the ONLY reliable place to clean on-disk state that
 * is read during module initialisation (e.g. ImportStagingStore.loadAll()).
 *
 * setupFiles run after the module graph is already resolved, so they are too
 * late to prevent a module-level singleton from loading stale disk state.
 */
import fs from 'node:fs';
import path from 'node:path';

export function setup() {
  const storagePath = process.env.STORAGE_PATH ?? '/tmp/novabot-test-storage';
  const stagingDir = path.join(storagePath, 'imports');
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}
