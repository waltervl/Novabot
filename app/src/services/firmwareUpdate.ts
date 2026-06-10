/**
 * Detects whether a newer MOWER firmware than what's on the mower is available
 * on the server's OTA list, and persists a per-version "dismissed" flag so the
 * Home banner doesn't keep nagging after the user has seen it.
 *
 * Mirrors appUpdate.ts (server poll + expo-secure-store skip persistence) but
 * for mower firmware instead of the app APK. Unlike the app-update flow this is
 * surfaced PASSIVELY (banner + badge), never a modal, so it doesn't pile onto
 * the Android app-update popup. Firmware OTA runs over MQTT (server → mower),
 * so this works on both iOS and Android — no platform gate here.
 */
import * as SecureStore from 'expo-secure-store';
import { ApiClient, type OtaVersion } from './api';
import { getServerUrl } from './auth';

const DISMISS_KEY = 'novabot.firmwareUpdate.dismissedVersion';

// Numeric-aware compare, ignoring a leading "v". Matches OtaScreen's own
// version collation so the banner agrees with what the OTA picker surfaces.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const stripV = (v: string): string => v.replace(/^v/i, '').trim();

/** >0 when `a` is newer than `b`, 0 equal, <0 older. */
export function compareFirmwareVersion(a: string, b: string): number {
  return collator.compare(stripV(a), stripV(b));
}

export interface MowerFirmwareUpdate {
  /** Newest mower firmware version available on the server. */
  version: string;
  /** Version currently installed on the mower. */
  currentVersion: string;
}

/** Newest mower OTA entry's version string, or null when the list has none. */
export function newestMowerVersion(versions: OtaVersion[]): string | null {
  const newest = versions
    .filter((v) => v.device_type === 'mower')
    .sort((a, b) => collator.compare(stripV(b.version), stripV(a.version)))[0];
  return newest?.version ?? null;
}

/**
 * Returns the available update (newest server version strictly newer than the
 * mower's current version), or null. Pure — no I/O — so it's unit-testable.
 * Returns null when the current version is unknown: we can't compare, and a
 * false "update available" nag is worse than staying silent.
 */
export function findMowerFirmwareUpdate(
  versions: OtaVersion[],
  currentVersion: string | null | undefined,
): MowerFirmwareUpdate | null {
  if (!currentVersion) return null;
  const newest = newestMowerVersion(versions);
  if (!newest) return null;
  if (compareFirmwareVersion(newest, String(currentVersion)) <= 0) return null;
  return { version: newest, currentVersion: String(currentVersion) };
}

/** Fetch the server's OTA versions and compute the available mower update. */
export async function checkMowerFirmwareUpdate(
  currentVersion: string | null | undefined,
): Promise<MowerFirmwareUpdate | null> {
  if (!currentVersion) return null;
  const url = await getServerUrl();
  if (!url) return null;
  const api = new ApiClient(url);
  const versions = await api.getOtaVersions();
  return findMowerFirmwareUpdate(versions, currentVersion);
}

export async function getDismissedFirmwareVersion(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(DISMISS_KEY);
  } catch {
    return null;
  }
}

export async function setDismissedFirmwareVersion(version: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(DISMISS_KEY, version);
  } catch {
    /* ignore — a failed dismiss just means the banner reappears, not a crash */
  }
}
