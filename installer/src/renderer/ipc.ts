import type { InstallerApi } from '../shared/types';

/**
 * Single accessor for the IPC surface exposed by the preload bridge. Components
 * import `installer` from here rather than touching `window.installer`
 * directly, which keeps the global reference in one place and makes the API
 * trivial to mock in tests.
 */
export const installer: InstallerApi = window.installer;
