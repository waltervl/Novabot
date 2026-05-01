/**
 * Polls the central release host for app updates:
 *   - Immediately on mount
 *   - Every time the app comes to the foreground
 *   - Every 12 hours via setInterval
 *
 * Returns `{ latest, dismiss }` where `latest` is non-null when an update is
 * available and `dismiss` clears it so the modal closes.
 */
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { checkForUpdate, type AppLatest } from '../services/appUpdate';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export function useAppUpdateCheck(): { latest: AppLatest | null; dismiss: () => void } {
  const [latest, setLatest] = useState<AppLatest | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function runCheck() {
      if (cancelled) return;
      try {
        const result = await checkForUpdate();
        if (!cancelled) setLatest(result);
      } catch {
        // Network failures are silent — never crash the app
      }
    }

    runCheck();

    function handleAppStateChange(nextState: AppStateStatus) {
      if (nextState === 'active') runCheck();
    }
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    const interval = setInterval(runCheck, TWELVE_HOURS_MS);

    return () => {
      cancelled = true;
      subscription.remove();
      clearInterval(interval);
    };
  }, []);

  function dismiss() {
    setLatest(null);
  }

  return { latest, dismiss };
}
