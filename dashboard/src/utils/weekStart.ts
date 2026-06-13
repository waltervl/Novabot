// Week-start display preference. The STORED weekday convention is fixed at
// 0=Sunday (JS Date.getDay(), matches server scheduleRunner + db weekdays JSON).
// This preference only changes the DISPLAY ORDER of the day columns/buttons —
// it never rewrites stored schedule data.

import { useEffect, useState } from 'react';

export type WeekStart = 'mon' | 'sun';

/** Europe-friendly default; the user can flip it in Settings. */
export const DEFAULT_WEEK_START: WeekStart = 'mon';

const KEY = 'novabot.weekStart';
const EVENT = 'novabot:weekstart';

export function readWeekStart(): WeekStart {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === 'mon' || raw === 'sun') return raw;
  } catch { /* ignore */ }
  return DEFAULT_WEEK_START;
}

export function writeWeekStart(ws: WeekStart): void {
  try {
    localStorage.setItem(KEY, ws);
    // Notify same-tab listeners (the storage event only fires cross-tab).
    window.dispatchEvent(new CustomEvent(EVENT, { detail: ws }));
  } catch { /* ignore */ }
}

/**
 * Display order of STORED weekday indices (0=Sun .. 6=Sat) for the given start.
 * 'mon' → [1,2,3,4,5,6,0]  (Mon..Sun)
 * 'sun' → [0,1,2,3,4,5,6]  (Sun..Sat)
 */
export function weekdayOrder(ws: WeekStart): number[] {
  return ws === 'mon' ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
}

/** Reactive read — updates when the preference changes in this or another tab. */
export function useWeekStart(): WeekStart {
  const [ws, setWs] = useState<WeekStart>(readWeekStart);
  useEffect(() => {
    const sync = () => setWs(readWeekStart());
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setWs(detail === 'mon' || detail === 'sun' ? detail : readWeekStart());
    };
    window.addEventListener(EVENT, onCustom);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, onCustom);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return ws;
}
