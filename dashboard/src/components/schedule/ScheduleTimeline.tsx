import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Schedule } from '../../types';
import { fetchSchedules } from '../../api/client';

interface Props {
  sn: string;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Custom convention: 0=Mon, 1=Tue, ..., 6=Sun (matches Scheduler.tsx weekday indexing)
const DAY_INDEX = [0, 1, 2, 3, 4, 5, 6];

const HOUR_PX = 24; // 24px per hour → 576px total height for 24h grid

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 60% 45%)`;
}

export function ScheduleTimeline({ sn }: Props) {
  const { t } = useTranslation();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Poll every 5s so the timeline picks up Scheduler edits without prop wiring.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await fetchSchedules(sn);
        if (!cancelled) {
          setSchedules(list);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load schedules');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [sn]);

  if (loading) {
    return <div className="p-4 text-zinc-500 text-sm">{t('schedule.timeline.loading')}</div>;
  }
  if (error) {
    return <div className="p-4 text-red-400 text-sm">{t('schedule.timeline.error')}: {error}</div>;
  }

  const enabled = schedules.filter(s => s.enabled);

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
      <h3 className="text-sm font-semibold text-zinc-100 mb-3">{t('schedule.timeline.title')}</h3>

      {/* Hour grid reference + schedule blocks overlay */}
      <div className="relative overflow-x-auto">
        <div className="grid grid-cols-[64px_1fr] gap-1 text-xs">
          {/* Header row */}
          <div />
          <div className="grid grid-cols-7 gap-1 text-center text-zinc-400 px-1">
            {DAYS.map(d => <div key={d} className="py-1">{d}</div>)}
          </div>

          {/* Hour rows */}
          {Array.from({ length: 24 }).map((_, hour) => (
            <ScheduleTimeline.Row key={hour} hour={hour} />
          ))}
        </div>
      </div>

      {/* Schedule blocks overlay (absolute positioned) */}
      <div className="relative mt-2 rounded border border-gray-700" style={{ height: 24 * HOUR_PX }}>
        <div className="absolute inset-0 grid grid-cols-7 gap-1 p-1">
          {DAYS.map((_, dayIdx) => (
            <div key={dayIdx} className="relative border-l border-gray-700 first:border-l-0">
              {enabled.flatMap(s => {
                if (!s.weekdays.some(w => DAY_INDEX[w] === dayIdx)) return [];
                const start = timeToMinutes(s.startTime);
                const end = s.endTime ? timeToMinutes(s.endTime) : Math.min(start + 60, 24 * 60);
                if (end <= start) return [];
                const top = (start / 60) * HOUR_PX;
                const height = ((end - start) / 60) * HOUR_PX;
                return [
                  <div
                    key={s.scheduleId}
                    title={`${s.scheduleName ?? 'Schedule'} ${s.startTime}–${s.endTime ?? ''}`}
                    className="absolute left-1 right-1 rounded text-[10px] text-white px-1 py-0.5 overflow-hidden"
                    style={{ top, height, backgroundColor: colorForId(s.scheduleId) }}
                  >
                    {s.scheduleName ?? `${s.startTime}`}
                  </div>,
                ];
              })}
            </div>
          ))}
        </div>
      </div>

      {enabled.length === 0 && (
        <div className="mt-3 text-zinc-500 text-xs">{t('schedule.timeline.empty')}</div>
      )}
    </div>
  );
}

ScheduleTimeline.Row = function Row({ hour }: { hour: number }) {
  return (
    <>
      <div className="text-zinc-500 text-right pr-2 leading-none" style={{ height: HOUR_PX }}>
        {String(hour).padStart(2, '0')}:00
      </div>
      <div className="grid grid-cols-7 gap-1" style={{ height: HOUR_PX }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="border-t border-gray-800" />
        ))}
      </div>
    </>
  );
};
