/**
 * App self-update service.
 *
 * Exports pure comparison helpers, a server-polling function, AsyncStorage-style
 * skip-version helpers (backed by expo-secure-store for consistency with the rest
 * of the app), and the download + SHA256-verify + install pipeline.
 *
 * NOTE: No tests — there is no Jest/Vitest config in app/. Tests skipped per plan
 * deviation #4.
 */

import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as SecureStore from 'expo-secure-store';

const SKIP_KEY = 'appUpdate.skippedVersion';

/**
 * Central release host. APK + manifest live here regardless of which
 * OpenNova server the user is connected to — every app instance checks
 * the same URL. Update by uploading new files to this NAS path.
 */
const RELEASE_MANIFEST_URL = 'https://downloads.ramonvanbruggen.nl/app/manifest.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Pure helpers (importable without side-effects)
// ---------------------------------------------------------------------------

/**
 * Compares two semantic version strings.
 * Returns > 0 if a > b, 0 if equal, < 0 if a < b.
 */
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

/**
 * Returns true when the remote version is newer than what's installed
 * AND the user hasn't explicitly skipped it.
 */
export function hasUpdateAvailable(
  installed: string,
  remote: string,
  skipped: string | null,
): boolean {
  if (compareSemver(remote, installed) <= 0) return false;
  if (skipped !== null && compareSemver(remote, skipped) === 0) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

/**
 * Fetches the latest release manifest from the central NAS host.
 * Returns null on 404 / network errors — never throws. Cache-busted via
 * a millisecond query string so a freshly uploaded manifest is picked up
 * even when an upstream cache is in front of the host.
 */
export async function fetchLatest(): Promise<AppLatest | null> {
  try {
    const r = await fetch(`${RELEASE_MANIFEST_URL}?t=${Date.now()}`);
    if (!r.ok) return null;
    return (await r.json()) as AppLatest;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Skip-version persistence (expo-secure-store, consistent with auth.ts)
// ---------------------------------------------------------------------------

export async function getSkippedVersion(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SKIP_KEY);
  } catch {
    return null;
  }
}

export async function setSkippedVersion(v: string): Promise<void> {
  await SecureStore.setItemAsync(SKIP_KEY, v);
}

// ---------------------------------------------------------------------------
// Top-level check
// ---------------------------------------------------------------------------

/**
 * Returns the latest release if it's newer than the installed version and not
 * skipped by the user. Platform-agnostic: iOS callers still receive the data
 * so the UI can route to GitHub Releases (UpdatePromptModal handles the
 * platform branch). Returns null when there is no update.
 */
export async function checkForUpdate(): Promise<AppLatest | null> {
  const latest = await fetchLatest();
  if (!latest) return null;
  const installed = Application.nativeApplicationVersion ?? '0.0.0';
  const skipped = await getSkippedVersion();
  if (!hasUpdateAvailable(installed, latest.version, skipped)) return null;
  return latest;
}

// ---------------------------------------------------------------------------
// Download + SHA256 verification
// ---------------------------------------------------------------------------

/**
 * Downloads the APK to the cache directory, verifies the SHA256 hash, and
 * resolves with the local URI.
 *
 * On hash mismatch the downloaded file is deleted and an error is thrown.
 */
export async function downloadApk(
  url: string,
  expectedSha256: string,
  onProgress?: (frac: number) => void,
): Promise<{ uri: string }> {
  const target = `${FileSystem.cacheDirectory}opennova-update.apk`;

  const dl = FileSystem.createDownloadResumable(
    url,
    target,
    {},
    (p) => {
      if (p.totalBytesExpectedToWrite > 0) {
        onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
      }
    },
  );

  const result = await dl.downloadAsync();
  if (!result?.uri) throw new Error('APK download failed — no URI returned');

  // Read the file as base64, decode to binary, compute SHA256
  const base64Data = await FileSystem.readAsStringAsync(result.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Decode base64 → Uint8Array for binary-accurate hashing
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Crypto.digest takes BufferSource (Uint8Array) and returns ArrayBuffer
  const hashBuffer = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const actualSha256 = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  if (actualSha256 !== expectedSha256.toLowerCase()) {
    await FileSystem.deleteAsync(result.uri, { idempotent: true });
    throw new Error(
      `SHA256 mismatch — expected ${expectedSha256.toLowerCase()}, got ${actualSha256}`,
    );
  }

  return { uri: result.uri };
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

/**
 * Triggers the Android system package installer for the given local APK URI.
 * The URI must point to a file inside the cache or document directory so that
 * FileProvider can produce a content:// URI.
 */
export async function installApk(uri: string): Promise<void> {
  const contentUri = await FileSystem.getContentUriAsync(uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
}
