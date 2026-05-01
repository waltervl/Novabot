// server/src/routes/appUpdate.ts
import { Router, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { readAppReleaseManifest } from '../services/appReleaseManifest.js';

let manifestDir = process.env.APP_MANIFEST_DIR ?? path.resolve(__dirname, '../firmware/app');

export function setManifestDir(dir: string): void {
  manifestDir = dir;
}

export const appUpdateRouter = Router();

appUpdateRouter.get('/latest', (req: Request, res: Response) => {
  const manifestFile = path.join(manifestDir, 'manifest.json');
  // If the file doesn't exist at all → 404
  if (!fs.existsSync(manifestFile)) {
    res.status(404).json({ error: 'manifest missing' });
    return;
  }
  // File exists — try to read a well-formed manifest with a release
  const m = readAppReleaseManifest(manifestDir);
  // If reader returns null (malformed JSON, missing fields, or empty apkFileName)
  // but the file exists, check if apkFileName is specifically empty → 204
  if (!m) {
    try {
      const raw = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as Record<string, unknown>;
      if (raw.apkFileName === '' || raw.apkFileName === undefined || raw.apkFileName === null) {
        res.status(204).end();
        return;
      }
    } catch { /* fall through to 404 for malformed JSON */ }
    res.status(404).json({ error: 'manifest missing' });
    return;
  }
  const baseUrl = process.env.OTA_BASE_URL
    ?? `http://${req.headers.host ?? 'localhost'}`;
  res.json({
    version: m.version,
    platform: m.platform,
    apkUrl: `${baseUrl}/firmware/app/${m.apkFileName}`,
    sha256: m.sha256,
    sizeBytes: m.sizeBytes,
    releaseNotes: m.releaseNotes,
    minSupportedServerVersion: m.minSupportedServerVersion,
    releasedAt: m.releasedAt,
  });
});
