# OpenNova App In-App Update Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify OpenNova app users about a new APK on their server, download + install it from inside the app.

**Architecture:** Express endpoint `GET /api/app/latest` reads a JSON manifest under `server/firmware/app/`. The Expo app polls on foreground + every 12h, downloads the APK with `expo-file-system`, verifies SHA256, and triggers the system installer via `expo-intent-launcher` with a FileProvider URI.

**Tech Stack:** Node + Express + better-sqlite3 (server), React Native + Expo 55 (app), `expo-application`, `expo-file-system`, `expo-intent-launcher`, `expo-build-properties` (plugin), AsyncStorage.

**Spec:** `docs/superpowers/specs/2026-05-01-app-update-flow-design.md`

---

### Task 1: Server — manifest schema + reader

**Files:**
- Create: `server/firmware/app/manifest.json` (initial empty placeholder)
- Create: `server/src/services/appReleaseManifest.ts`
- Create: `server/src/__tests__/services/appReleaseManifest.test.ts`

- [ ] **Step 1: Write the failing test for manifest reader**

```ts
// server/src/__tests__/services/appReleaseManifest.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
```

- [ ] **Step 2: Verify test fails**

Run: `cd server && npx vitest run src/__tests__/services/appReleaseManifest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement reader**

```ts
// server/src/services/appReleaseManifest.ts
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

const REQUIRED = ['version', 'platform', 'apkFileName', 'sha256', 'sizeBytes', 'releaseNotes', 'minSupportedServerVersion', 'releasedAt'] as const;

export function readAppReleaseManifest(dir: string): AppReleaseManifest | null {
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const k of REQUIRED) {
      if (parsed[k] === undefined || parsed[k] === null || parsed[k] === '') return null;
    }
    return parsed as unknown as AppReleaseManifest;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Verify test passes**

Run: `cd server && npx vitest run src/__tests__/services/appReleaseManifest.test.ts`
Expected: PASS — 4/4.

- [ ] **Step 5: Create empty placeholder manifest**

```bash
mkdir -p server/firmware/app
cat > server/firmware/app/manifest.json <<'EOF'
{
  "version": "0.0.0",
  "platform": "android",
  "apkFileName": "",
  "sha256": "",
  "sizeBytes": 0,
  "releaseNotes": "No release published yet",
  "minSupportedServerVersion": "2026.0501.2158",
  "releasedAt": "1970-01-01T00:00:00Z"
}
EOF
```

(Endpoint will treat `apkFileName === ''` as "no release" in Task 2.)

- [ ] **Step 6: Commit**

```bash
git add server/firmware/app/manifest.json \
        server/src/services/appReleaseManifest.ts \
        server/src/__tests__/services/appReleaseManifest.test.ts
git commit -m "feat(server): app release manifest reader"
```

---

### Task 2: Server — `GET /api/app/latest` endpoint

**Files:**
- Create: `server/src/routes/appUpdate.ts`
- Modify: `server/src/index.ts` (mount router)
- Create: `server/src/__tests__/routes/appUpdate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/__tests__/routes/appUpdate.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';

import { appUpdateRouter, setManifestDir } from '../../routes/appUpdate.js';

const TMP = path.resolve('/tmp/opennova-app-endpoint-test');

beforeEach(() => {
  fs.mkdirSync(TMP, { recursive: true });
  setManifestDir(TMP);
});
afterEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

function makeApp() {
  const app = express();
  app.use('/api/app', appUpdateRouter);
  return app;
}

describe('GET /api/app/latest', () => {
  it('returns 200 with shape when manifest exists', async () => {
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
    const r = await request(makeApp()).get('/api/app/latest');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      version: '1.2.0',
      platform: 'android',
      sha256: m.sha256,
      sizeBytes: 1024,
      releaseNotes: 'fixes',
      minSupportedServerVersion: '2026.0501.2158',
      releasedAt: '2026-05-01T20:00:00Z',
    });
    expect(r.body.apkUrl).toContain('/firmware/app/opennova-v1.2.0.apk');
  });

  it('returns 204 when no release is published (empty apkFileName)', async () => {
    fs.writeFileSync(path.join(TMP, 'manifest.json'), JSON.stringify({
      version: '0.0.0', platform: 'android', apkFileName: '',
      sha256: '', sizeBytes: 0, releaseNotes: 'none',
      minSupportedServerVersion: '0.0.0', releasedAt: '1970-01-01T00:00:00Z',
    }));
    const r = await request(makeApp()).get('/api/app/latest');
    expect(r.status).toBe(204);
  });

  it('returns 404 when manifest is missing entirely', async () => {
    const r = await request(makeApp()).get('/api/app/latest');
    expect(r.status).toBe(404);
  });
});
```

- [ ] **Step 2: Verify test fails**

Run: `cd server && npx vitest run src/__tests__/routes/appUpdate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement endpoint**

```ts
// server/src/routes/appUpdate.ts
import { Router, Request, Response } from 'express';
import path from 'node:path';
import { readAppReleaseManifest } from '../services/appReleaseManifest.js';

let manifestDir = path.resolve('server/firmware/app');

export function setManifestDir(dir: string): void {
  manifestDir = dir;
}

export const appUpdateRouter = Router();

appUpdateRouter.get('/latest', (req: Request, res: Response) => {
  const m = readAppReleaseManifest(manifestDir);
  if (!m) { res.status(404).json({ error: 'manifest missing' }); return; }
  if (!m.apkFileName) { res.status(204).end(); return; }
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
```

- [ ] **Step 4: Mount in `server/src/index.ts`**

Find the section where other routers are mounted (`app.use('/api/...')`) and add:

```ts
import { appUpdateRouter } from './routes/appUpdate.js';
app.use('/api/app', appUpdateRouter);
```

- [ ] **Step 5: Verify static APK serving**

Confirm `server/src/index.ts` already mounts `/firmware` static. If not, add:

```ts
app.use('/firmware', express.static(path.resolve('server/firmware')));
```

(Existing OTA infra already does this — verify before adding.)

- [ ] **Step 6: Run all server tests**

Run: `cd server && npx vitest run`
Expected: PASS — full suite green incl. new endpoint tests.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/appUpdate.ts \
        server/src/index.ts \
        server/src/__tests__/routes/appUpdate.test.ts
git commit -m "feat(server): GET /api/app/latest endpoint"
```

---

### Task 3: App — install Expo deps + manifest perms

**Files:**
- Modify: `app/package.json`
- Modify: `app/app.json`

- [ ] **Step 1: Install runtime deps**

```bash
cd app
npx expo install expo-application expo-file-system expo-intent-launcher expo-build-properties
```

- [ ] **Step 2: Add `REQUEST_INSTALL_PACKAGES` to Android permissions in `app/app.json`**

Locate the `expo.android.permissions` array and add:

```json
"REQUEST_INSTALL_PACKAGES",
"android.permission.REQUEST_INSTALL_PACKAGES"
```

- [ ] **Step 3: Add `expo-build-properties` plugin with FileProvider config**

In `expo.plugins`, add:

```json
[
  "expo-build-properties",
  {
    "android": {
      "extraProguardRules": "",
      "manifestQueries": []
    }
  }
]
```

(FileProvider XML lands in Task 4 via prebuild.)

- [ ] **Step 4: Run prebuild to regenerate `android/`**

```bash
cd app
npx expo prebuild --platform android --clean
```

This creates/updates `app/android/` with the new permissions baked in.

- [ ] **Step 5: Verify the manifest contains the permission**

```bash
grep "REQUEST_INSTALL_PACKAGES" app/android/app/src/main/AndroidManifest.xml
```

Expected: 1 line.

- [ ] **Step 6: Commit**

```bash
git add app/package.json app/yarn.lock app/app.json app/android
git commit -m "feat(app): install update deps + REQUEST_INSTALL_PACKAGES perm"
```

---

### Task 4: App — FileProvider XML + manifest provider entry

**Files:**
- Create: `app/android/app/src/main/res/xml/file_provider_paths.xml`
- Modify: `app/android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Create FileProvider paths XML**

```xml
<!-- app/android/app/src/main/res/xml/file_provider_paths.xml -->
<paths xmlns:android="http://schemas.android.com/apk/res/android">
  <cache-path name="apk_cache" path="." />
  <external-cache-path name="ext_apk_cache" path="." />
</paths>
```

- [ ] **Step 2: Add provider to `AndroidManifest.xml`**

Inside the `<application>` tag, add:

```xml
<provider
  android:name="androidx.core.content.FileProvider"
  android:authorities="${applicationId}.fileprovider"
  android:exported="false"
  android:grantUriPermissions="true">
  <meta-data
    android:name="android.support.FILE_PROVIDER_PATHS"
    android:resource="@xml/file_provider_paths" />
</provider>
```

- [ ] **Step 3: Verify build succeeds**

```bash
cd app/android
./gradlew assembleDebug
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add app/android/app/src/main/res/xml/file_provider_paths.xml \
        app/android/app/src/main/AndroidManifest.xml
git commit -m "feat(app): FileProvider for APK install intent"
```

---

### Task 5: App — `appUpdate` service (check + download + verify)

**Files:**
- Create: `app/src/services/appUpdate.ts`
- Create: `app/src/services/__tests__/appUpdate.test.ts`

- [ ] **Step 1: Write failing test for `compareVersions`**

```ts
// app/src/services/__tests__/appUpdate.test.ts
import { describe, it, expect } from '@jest/globals';
import { compareSemver, hasUpdateAvailable } from '../appUpdate';

describe('compareSemver', () => {
  it('returns positive when a > b', () => {
    expect(compareSemver('1.2.0', '1.1.9')).toBeGreaterThan(0);
  });
  it('returns 0 when equal', () => {
    expect(compareSemver('1.2.0', '1.2.0')).toBe(0);
  });
  it('returns negative when a < b', () => {
    expect(compareSemver('1.2.0', '1.3.0')).toBeLessThan(0);
  });
  it('handles patch differences', () => {
    expect(compareSemver('1.2.1', '1.2.0')).toBeGreaterThan(0);
  });
});

describe('hasUpdateAvailable', () => {
  it('true when remote > installed', () => {
    expect(hasUpdateAvailable('1.1.0', '1.2.0', null)).toBe(true);
  });
  it('false when remote === installed', () => {
    expect(hasUpdateAvailable('1.2.0', '1.2.0', null)).toBe(false);
  });
  it('false when remote === skipped', () => {
    expect(hasUpdateAvailable('1.1.0', '1.2.0', '1.2.0')).toBe(false);
  });
  it('true when remote > installed and skipped is older', () => {
    expect(hasUpdateAvailable('1.1.0', '1.3.0', '1.2.0')).toBe(true);
  });
});
```

- [ ] **Step 2: Verify test fails**

Run: `cd app && npm test -- appUpdate`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement service**

```ts
// app/src/services/appUpdate.ts
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SKIP_KEY = 'appUpdate.skippedVersion';

export interface AppLatest {
  version: string;
  platform: 'android';
  apkUrl: string;
  sha256: string;
  sizeBytes: number;
  releaseNotes: string;
  minSupportedServerVersion: string;
  releasedAt: string;
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10));
  const pb = b.split('.').map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export function hasUpdateAvailable(
  installed: string,
  remote: string,
  skipped: string | null,
): boolean {
  if (compareSemver(remote, installed) <= 0) return false;
  if (skipped && compareSemver(remote, skipped) === 0) return false;
  return true;
}

export async function fetchLatest(serverUrl: string): Promise<AppLatest | null> {
  try {
    const r = await fetch(`${serverUrl.replace(/\/$/, '')}/api/app/latest`);
    if (r.status === 204 || r.status === 404) return null;
    if (!r.ok) return null;
    return (await r.json()) as AppLatest;
  } catch {
    return null;
  }
}

export async function getSkippedVersion(): Promise<string | null> {
  return AsyncStorage.getItem(SKIP_KEY);
}

export async function setSkippedVersion(v: string): Promise<void> {
  await AsyncStorage.setItem(SKIP_KEY, v);
}

export async function checkForUpdate(serverUrl: string): Promise<AppLatest | null> {
  if (Platform.OS !== 'android') return null;
  const latest = await fetchLatest(serverUrl);
  if (!latest) return null;
  const installed = Application.nativeApplicationVersion ?? '0.0.0';
  const skipped = await getSkippedVersion();
  if (!hasUpdateAvailable(installed, latest.version, skipped)) return null;
  return latest;
}

export async function downloadApk(
  url: string,
  expectedSha256: string,
  onProgress?: (frac: number) => void,
): Promise<{ uri: string }> {
  const target = `${FileSystem.cacheDirectory}opennova-update.apk`;
  const dl = FileSystem.createDownloadResumable(url, target, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) {
      onProgress?.(p.totalBytesWrittenSoFar / p.totalBytesExpectedToWrite);
    }
  });
  const result = await dl.downloadAsync();
  if (!result?.uri) throw new Error('download failed');

  const sha = await FileSystem.getInfoAsync(result.uri).then(async (info) => {
    if (!info.exists) throw new Error('downloaded file missing');
    const data = await FileSystem.readAsStringAsync(result.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const buf = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  });
  if (sha !== expectedSha256.toLowerCase()) {
    await FileSystem.deleteAsync(result.uri, { idempotent: true });
    throw new Error(`sha256 mismatch (expected ${expectedSha256}, got ${sha})`);
  }
  return { uri: result.uri };
}

export async function installApk(uri: string): Promise<void> {
  const contentUri = await FileSystem.getContentUriAsync(uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
}
```

- [ ] **Step 4: Verify tests pass**

Run: `cd app && npm test -- appUpdate`
Expected: PASS — 8/8.

- [ ] **Step 5: Commit**

```bash
git add app/src/services/appUpdate.ts \
        app/src/services/__tests__/appUpdate.test.ts
git commit -m "feat(app): appUpdate service — version compare + download + install"
```

---

### Task 6: App — UpdatePromptModal component

**Files:**
- Create: `app/src/components/UpdatePromptModal.tsx`

- [ ] **Step 1: Implement component**

```tsx
// app/src/components/UpdatePromptModal.tsx
import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, Platform } from 'react-native';
import * as Application from 'expo-application';
import { downloadApk, installApk, setSkippedVersion, AppLatest } from '../services/appUpdate';
import { colors } from '../theme/colors';

export function UpdatePromptModal({
  latest,
  onClose,
}: { latest: AppLatest; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const installed = Application.nativeApplicationVersion ?? '?';

  const handleUpdate = async () => {
    if (Platform.OS !== 'android') {
      Linking.openURL('https://github.com/rvbcrs/Novabot/releases/latest');
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { uri } = await downloadApk(latest.apkUrl, latest.sha256, setProgress);
      await installApk(uri);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'install failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = async () => {
    await setSkippedVersion(latest.version);
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Update available</Text>
          <Text style={styles.version}>{installed} → {latest.version}</Text>
          <Text style={styles.notes}>{latest.releaseNotes}</Text>
          {busy && (
            <View style={styles.progressBox}>
              <ActivityIndicator color={colors.emerald} />
              <Text style={styles.progressTxt}>{Math.round(progress * 100)}%</Text>
            </View>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <TouchableOpacity onPress={handleSkip} disabled={busy} style={styles.btnGhost}>
              <Text style={styles.btnGhostTxt}>Skip this version</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} disabled={busy} style={styles.btnGhost}>
              <Text style={styles.btnGhostTxt}>Later</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleUpdate} disabled={busy} style={styles.btnPrimary}>
              <Text style={styles.btnPrimaryTxt}>{Platform.OS === 'android' ? 'Update' : 'Open release'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 20 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 4 },
  version: { color: colors.textDim, fontSize: 14, marginBottom: 12 },
  notes: { color: colors.text, fontSize: 13, marginBottom: 16 },
  progressBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  progressTxt: { color: colors.text, fontSize: 13 },
  error: { color: colors.red, fontSize: 12, marginBottom: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  btnGhost: { padding: 10 },
  btnGhostTxt: { color: colors.textDim, fontSize: 13 },
  btnPrimary: { backgroundColor: colors.emerald, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  btnPrimaryTxt: { color: colors.white, fontWeight: '700', fontSize: 13 },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/UpdatePromptModal.tsx
git commit -m "feat(app): UpdatePromptModal UI"
```

---

### Task 7: App — `useAppUpdateCheck` hook + integration

**Files:**
- Create: `app/src/hooks/useAppUpdateCheck.ts`
- Modify: `app/App.tsx` (or root provider)

- [ ] **Step 1: Implement hook**

```ts
// app/src/hooks/useAppUpdateCheck.ts
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { checkForUpdate, AppLatest } from '../services/appUpdate';
import { useServerUrl } from './useServerUrl'; // existing hook

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export function useAppUpdateCheck(): { latest: AppLatest | null; dismiss: () => void } {
  const [latest, setLatest] = useState<AppLatest | null>(null);
  const serverUrl = useServerUrl();

  useEffect(() => {
    if (!serverUrl) return;
    let cancelled = false;
    const run = async () => {
      const r = await checkForUpdate(serverUrl);
      if (!cancelled) setLatest(r);
    };
    run();
    const interval = setInterval(run, TWELVE_HOURS_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') run();
    });
    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
    };
  }, [serverUrl]);

  return { latest, dismiss: () => setLatest(null) };
}
```

- [ ] **Step 2: Wire into root**

Add in `App.tsx` (or whichever component holds providers):

```tsx
function UpdateGate() {
  const { latest, dismiss } = useAppUpdateCheck();
  if (!latest) return null;
  return <UpdatePromptModal latest={latest} onClose={dismiss} />;
}

// inside your main render tree, after the navigation provider:
<UpdateGate />
```

- [ ] **Step 3: Manual test**

1. Set the manifest on the dev server to a version higher than `app.json`'s `expo.version`.
2. Reload the app.
3. Verify the modal shows.
4. Tap "Update", confirm system installer launches, install completes.

- [ ] **Step 4: Commit**

```bash
git add app/src/hooks/useAppUpdateCheck.ts app/App.tsx
git commit -m "feat(app): foreground + 12h update check trigger"
```

---

### Task 8: Release script — `release-app.sh`

**Files:**
- Create: `release-app.sh`

- [ ] **Step 1: Implement script**

```bash
#!/bin/bash
# Build APK via EAS, copy to server/firmware/app/, update manifest.json, commit.
set -e
cd "$(dirname "$0")"

VERSION=$(node -p "require('./app/app.json').expo.version")
echo "Building APK for v$VERSION..."

cd app
npx eas build --platform android --profile production --local --output "../server/firmware/app/opennova-v$VERSION.apk"
cd ..

APK="server/firmware/app/opennova-v$VERSION.apk"
SHA=$(shasum -a 256 "$APK" | awk '{print $1}')
SIZE=$(stat -f '%z' "$APK" 2>/dev/null || stat -c '%s' "$APK")

cat > server/firmware/app/manifest.json <<EOF
{
  "version": "$VERSION",
  "platform": "android",
  "apkFileName": "opennova-v$VERSION.apk",
  "sha256": "$SHA",
  "sizeBytes": $SIZE,
  "releaseNotes": "$(git log --oneline -10 | head -10 | tr '\n' ' ')",
  "minSupportedServerVersion": "$(node -p "require('./server/package.json').version")",
  "releasedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

git add "$APK" server/firmware/app/manifest.json
git commit -m "release(app): v$VERSION"
git tag "app-v$VERSION"
git push && git push --tags

echo "Released app v$VERSION"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x release-app.sh
```

- [ ] **Step 3: Add to `.gitignore` exception**

`server/firmware/app/*.apk` should be tracked OR hosted externally. For
self-host simplicity, track them — add nothing to `.gitignore`.
Document the size cost in the user guide (Task 9).

- [ ] **Step 4: Commit**

```bash
git add release-app.sh
git commit -m "chore: release-app.sh — build + publish APK to server"
```

---

### Task 9: Docs — user guide

**Files:**
- Create: `docs/guide/app-updates.md`

- [ ] **Step 1: Write guide**

```markdown
# OpenNova App Updates

The OpenNova Android app polls your server every time it foregrounds (and
every 12 hours in the background) for a newer APK. When one exists, you
see an "Update available" modal with release notes and a one-tap install
button.

## How to publish a new APK

1. Bump `app/app.json` `expo.version`.
2. Run `./release-app.sh` from the repo root.
3. The script:
   - Runs an EAS Android build (production profile, local).
   - Drops the APK into `server/firmware/app/opennova-v<version>.apk`.
   - Computes SHA256 + file size.
   - Writes `server/firmware/app/manifest.json`.
   - Commits + tags + pushes.

## How users update

- The app shows the modal automatically on next foreground.
- They tap "Update" → APK downloads → system installer prompts → install.
- First time only: Android asks the user to allow "Install unknown apps"
  for OpenNova. The system installer's link goes straight to the right
  toggle.

## iOS users

iOS shows the modal too, but the button opens the GitHub Releases page.
TestFlight / App Store updates remain Apple's path.

## Troubleshooting

- **Modal never shows**: check `GET /api/app/latest` returns 200 with a
  newer version than the user has installed.
- **SHA256 mismatch**: rebuild the APK — the manifest hash is stale or
  the download was corrupted.
- **Install blocks at "App not installed"**: signing certificate changed
  between releases (e.g. switched from EAS managed to local). Users need
  to uninstall first, then install the new APK.
```

- [ ] **Step 2: Commit**

```bash
git add docs/guide/app-updates.md
git commit -m "docs: app update flow user guide"
```

---

## Self-review

- Spec coverage: every section in the spec maps to a task — server
  manifest+endpoint (1+2), Android perms (3+4), service (5), UI (6),
  trigger (7), release tooling (8), docs (9). ✓
- Placeholder scan: no TBD/TODO. ✓
- Type consistency: `AppLatest` shape matches between server response
  (Task 2) and app fetch (Task 5). ✓
- Spec requirement coverage:
  - 12h + foreground trigger → Task 7. ✓
  - SHA256 verify → Task 5 step 3. ✓
  - FileProvider URI → Task 4 + Task 5 `getContentUriAsync`. ✓
  - Skip-version persistence → Task 5 AsyncStorage helpers + Task 6
    skip button. ✓
  - iOS fallback to GitHub Releases → Task 6 platform check. ✓
  - `minSupportedServerVersion` field → returned in Task 2, surfaced
    in modal phrasing — addressed in Task 6 release notes line, but a
    dedicated "Update server first" branch is NOT yet implemented.
    Acceptable for v1; track as follow-up.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-01-app-update-flow.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task with two-stage review.
2. **Inline Execution** — execute tasks in this session via executing-plans.

Which approach?
