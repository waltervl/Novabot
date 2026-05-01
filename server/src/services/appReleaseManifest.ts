import fs from 'node:fs';
import path from 'node:path';

export interface AppReleaseManifest {
  version: string;
  platform: 'android';
  apkFileName: string;
  sha256: string;
  sizeBytes: number;
  releaseNotes: string;
  minSupportedServerVersion: string;
  releasedAt: string;
}

const REQUIRED = [
  'version',
  'platform',
  'apkFileName',
  'sha256',
  'sizeBytes',
  'releaseNotes',
  'minSupportedServerVersion',
  'releasedAt',
] as const;

export function readAppReleaseManifest(dir: string): AppReleaseManifest | null {
  const file = path.join(dir, 'manifest.json');
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Required = present + non-empty-string. Numeric 0 / false / [] are
    // legitimate values (e.g. sizeBytes never gets the empty-string check).
    for (const k of REQUIRED) {
      if (parsed[k] === undefined || parsed[k] === null || parsed[k] === '') return null;
    }
    return parsed as unknown as AppReleaseManifest;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') {
      console.warn(`[appReleaseManifest] failed to read ${file}:`, err);
    }
    return null;
  }
}
