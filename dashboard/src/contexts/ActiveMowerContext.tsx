import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'opennova.dashboard.activeMowerSn';

interface ActiveMowerContextShape {
  activeMowerSn: string | null;
  setActiveMowerSn: (sn: string | null) => void;
  hydrated: boolean;
}

const ActiveMowerContext = createContext<ActiveMowerContextShape | null>(null);

export function ActiveMowerProvider({ children }: { children: ReactNode }) {
  const [activeMowerSn, setActiveMowerSnState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setActiveMowerSnState(raw);
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  const setActiveMowerSn = useCallback((sn: string | null) => {
    setActiveMowerSnState(sn);
    try {
      if (sn) localStorage.setItem(STORAGE_KEY, sn);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }, []);

  const value = useMemo(
    () => ({ activeMowerSn, setActiveMowerSn, hydrated }),
    [activeMowerSn, setActiveMowerSn, hydrated],
  );

  return <ActiveMowerContext.Provider value={value}>{children}</ActiveMowerContext.Provider>;
}

export function useActiveMowerContext(): ActiveMowerContextShape {
  const ctx = useContext(ActiveMowerContext);
  if (!ctx) throw new Error('useActiveMowerContext must be used inside <ActiveMowerProvider>');
  return ctx;
}
