// Time-format display preference (24-hour vs 12-hour AM/PM). Display-only:
// schedule times are always STORED as 24h "HH:MM" (db start_time/end_time,
// TimeWheel value/onChange contract). This preference only changes how times
// are rendered — wheels, the schedule list, and the timeline.

import { useEffect, useState } from 'react';

export type TimeFormat = '12h' | '24h';

/** Default to 24h (current behaviour); Americans flip it to 12h in Settings. */
export const DEFAULT_TIME_FORMAT: TimeFormat = '24h';

const KEY = 'novabot.timeFormat';
const EVENT = 'novabot:timeformat';

export function readTimeFormat(): TimeFormat {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === '12h' || raw === '24h') return raw;
  } catch { /* ignore */ }
  return DEFAULT_TIME_FORMAT;
}

export function writeTimeFormat(tf: TimeFormat): void {
  try {
    localStorage.setItem(KEY, tf);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: tf }));
  } catch { /* ignore */ }
}

/** 0..23 → 1..12 display hour (0→12, 13→1, 23→11). */
export function to12Hour(h24: number): number {
  return ((h24 + 11) % 12) + 1;
}

/** Convert a 12h display hour + period back to a 0..23 hour. */
export function to24Hour(h12: number, period: 'AM' | 'PM'): number {
  const base = h12 % 12; // 12 → 0
  return period === 'PM' ? base + 12 : base;
}

/** Format a stored 24h "HH:MM" for display. 24h → "09:00", 12h → "9:00 AM". */
export function formatTime(hhmm: string, tf: TimeFormat): string {
  const [hs = '0', ms = '0'] = (hhmm || '').split(':');
  const h = Math.max(0, Math.min(23, parseInt(hs, 10) || 0));
  const m = Math.max(0, Math.min(59, parseInt(ms, 10) || 0));
  const mm = String(m).padStart(2, '0');
  if (tf === '24h') return `${String(h).padStart(2, '0')}:${mm}`;
  return `${to12Hour(h)}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Compact hour-axis label. 24h → "06:00", 12h → "6 AM". */
export function formatHour(h: number, tf: TimeFormat): string {
  if (tf === '24h') return `${String(h).padStart(2, '0')}:00`;
  return `${to12Hour(h)} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Reactive read — updates when the preference changes in this or another tab. */
export function useTimeFormat(): TimeFormat {
  const [tf, setTf] = useState<TimeFormat>(readTimeFormat);
  useEffect(() => {
    const sync = () => setTf(readTimeFormat());
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setTf(detail === '12h' || detail === '24h' ? detail : readTimeFormat());
    };
    window.addEventListener(EVENT, onCustom);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, onCustom);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return tf;
}
