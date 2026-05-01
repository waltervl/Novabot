import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'opennova.dashboard.activeMowerSn';

export interface ActiveMowerContextShape {
  activeMowerSn: string | null;
  setActiveMowerSn: (sn: string | null) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const ActiveMowerContext = createContext<ActiveMowerContextShape | null>(null);

function readPersisted(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function ActiveMowerProvider({ children }: { children: ReactNode }) {
  // Lazy initializer reads localStorage synchronously on first render so the
  // selected mower is correct from frame 1 — matches the ThemeProvider pattern
  // and avoids the cascading-render warning from react-hooks/set-state-in-effect.
  const [activeMowerSn, setActiveMowerSnState] = useState<string | null>(() => readPersisted());

  const setActiveMowerSn = useCallback((sn: string | null) => {
    setActiveMowerSnState(sn);
    try {
      if (sn) localStorage.setItem(STORAGE_KEY, sn);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }, []);

  const value = useMemo(
    () => ({ activeMowerSn, setActiveMowerSn }),
    [activeMowerSn, setActiveMowerSn],
  );

  return <ActiveMowerContext.Provider value={value}>{children}</ActiveMowerContext.Provider>;
}
