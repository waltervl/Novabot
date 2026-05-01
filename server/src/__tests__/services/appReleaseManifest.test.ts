import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { readAppReleaseManifest } from '../../services/appReleaseManifest.js';

const TMP = path.resolve('/tmp/opennova-app-manifest-test');

beforeEach(() => {
  fs.mkdirSync(TMP, { recursive: true });
});
afterEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe('readAppReleaseManifest', () => {
  it('returns null when manifest is missing', () => {
    expect(readAppReleaseManifest(TMP)).toBeNull();
  });

  it('parses a valid manifest', () => {
    const m = {
      version: '1.2.0',
      platform: 'android',
      apkFileName: 'opennova-v1.2.0.apk',
      sha256: 'a'.repeat(64),
      sizeBytes: 1024,
      releaseNotes: 'fixes',
      minSupportedServerVersion: '2026.0501.2158',
      releasedAt: '2026-05-01T20:00:00Z',
    };
    fs.writeFileSync(path.join(TMP, 'manifest.json'), JSON.stringify(m));
    expect(readAppReleaseManifest(TMP)).toEqual(m);
  });

  it('returns null on malformed JSON', () => {
    fs.writeFileSync(path.join(TMP, 'manifest.json'), '{ not valid');
    expect(readAppReleaseManifest(TMP)).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    fs.writeFileSync(path.join(TMP, 'manifest.json'), JSON.stringify({ version: '1.2.0' }));
    expect(readAppReleaseManifest(TMP)).toBeNull();
  });
});
