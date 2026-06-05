/**
 * Snapshot mode — compile-time flag used only when generating App Store /
 * manual screenshots with fastlane snapshot.
 *
 * Enabled by building the JS bundle with `EXPO_PUBLIC_SNAPSHOT=1`
 * (Expo inlines `EXPO_PUBLIC_*` env vars at bundle time). The fastlane
 * Snapfile passes this via `xcargs("EXPO_PUBLIC_SNAPSHOT=1")`, so it has
 * ZERO effect on normal dev/EAS/production builds — there the env var is
 * absent and `SNAPSHOT_MODE` is `false`.
 *
 * When true the app:
 *   1. Skips the login/auth gate (renders the main tabs directly).
 *   2. Boots straight into demo mode (fake mower + charger, schedules,
 *      history) so every screen is populated without a live server.
 */
export const SNAPSHOT_MODE = process.env.EXPO_PUBLIC_SNAPSHOT === '1';
