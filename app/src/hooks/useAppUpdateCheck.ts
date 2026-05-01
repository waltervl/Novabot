/**
 * Hook that polls the server for app updates:
 *   - Immediately on mount (once the server URL is resolved)
 *   - Every time the app comes to the foreground
 *   - Every 12 hours via setInterval
 *
 * Returns `{ latest, dismiss }` where `latest` is non-null when an update is
 * available and `dismiss` clears it so the modal closes.
 */
import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { getServerUrl } from '../services/auth';
import { checkForUpdate, type AppLatest } from '../services/appUpdate';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export function useAppUpdateCheck(): { latest: AppLatest | null; dismiss: () => void } {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [latest, setLatest] = useState<AppLatest | null>(null);

  // Resolve the server URL once on mount
  useEffect(() => {
    let cancelled = false;
    getServerUrl().then((url) => {
      if (!cancelled) setServerUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Trigger checks whenever the URL is available
  useEffect(() => {
    if (!serverUrl) return;

    let cancelled = false;

    async function runCheck() {
      if (cancelled || !serverUrl) return;
      try {
        const result = await checkForUpdate(serverUrl);
        if (!cancelled) setLatest(result);
      } catch {
        // Network failures are silent — never crash the app
      }
    }

    // Immediate check on mount / URL becoming available
    runCheck();

    // Re-check when app comes to the foreground
    function handleAppStateChange(nextState: AppStateStatus) {
      if (nextState === 'active') runCheck();
    }
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Re-check every 12 hours
    const interval = setInterval(runCheck, TWELVE_HOURS_MS);

    return () => {
      cancelled = true;
      subscription.remove();
      clearInterval(interval);
    };
  }, [serverUrl]);

  function dismiss() {
    setLatest(null);
  }

  return { latest, dismiss };
}
