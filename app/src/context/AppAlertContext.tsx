/**
 * AppAlertContext — provides an in-app modal that replaces React Native's
 * native `Alert.alert`. The styling matches the rain-warning sheet, so all
 * confirmation/info dialogs share one consistent look.
 *
 * Two ways to call:
 *   1. Anywhere outside React: `import { appAlert } from '../context/AppAlertContext'`
 *      then `appAlert({title, message, buttons})`. Requires the provider to
 *      be mounted somewhere above (App.tsx does this).
 *   2. Inside a component: `const { alert } = useAppAlert()`.
 *
 * The button API mirrors the RN Alert.alert signature so call-site changes
 * are mechanical: each button is `{text, style?, onPress?}`.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppAlertModal, type AppAlertOptions, type AppAlertButton } from '../components/AppAlertModal';

interface ContextValue {
  alert: (opts: AppAlertOptions) => void;
}

const AppAlertContext = createContext<ContextValue>({
  alert: () => { /* no-op until provider mounts */ },
});

// Module-level fallback so callers outside the React tree (helpers, services,
// hot paths in async handlers) can fire alerts without prop-drilling. Set by
// the provider on mount, cleared on unmount.
let _moduleAlert: ((opts: AppAlertOptions) => void) | null = null;

export function appAlert(opts: AppAlertOptions): void {
  if (_moduleAlert) {
    _moduleAlert(opts);
  } else if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn('[appAlert] Provider not mounted — falling back to console:', opts);
  }
}

/**
 * Drop-in shim for React Native's `Alert.alert(title, message?, buttons?)`
 * signature so call sites can be converted with a single search/replace
 * (`Alert.alert` → `appAlertCompat.alert`). Auto-derives the accent color
 * from the button styles: any destructive button → red accent, otherwise
 * info-blue.
 */
export const appAlertCompat = {
  alert(title: string, message?: string, buttons?: AppAlertButton[]): void {
    const accent: AppAlertOptions['accent'] = buttons?.some(b => b.style === 'destructive')
      ? 'destructive'
      : 'info';
    appAlert({ title, message, buttons, accent });
  },
};

export function AppAlertProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<AppAlertOptions[]>([]);
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const alert = useCallback((opts: AppAlertOptions) => {
    setQueue(prev => [...prev, opts]);
  }, []);

  // Mirror to module-level so non-React callers work.
  useEffect(() => {
    _moduleAlert = alert;
    return () => { _moduleAlert = null; };
  }, [alert]);

  const dismissTop = useCallback(() => {
    setQueue(prev => prev.slice(1));
  }, []);

  const value = useMemo(() => ({ alert }), [alert]);
  const top = queue[0] ?? null;

  return (
    <AppAlertContext.Provider value={value}>
      {children}
      <AppAlertModal visible={!!top} options={top} onDismiss={dismissTop} />
    </AppAlertContext.Provider>
  );
}

export function useAppAlert(): ContextValue {
  return useContext(AppAlertContext);
}
