import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DeviceState } from '../types';

interface Props {
  mower: DeviceState | null;
}

const PAUSE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const POLL_MS = 60 * 1000;                  // re-evaluate every minute

/**
 * Surfaces a banner above the map when the active mower has been
 * `work_status === '4'` (paused) for more than 30 minutes — covers the
 * "user paused for a snack and forgot" scenario the plan flagged
 * (Task 1.16). Tracks the pause-start timestamp via ref so a
 * dashboard refresh resets the timer (acceptable; the user can act
 * once they notice).
 */
export function LongPauseBanner({ mower }: Props) {
  const { t } = useTranslation();
  const pauseStartRef = useRef<number | null>(null);
  const [pausedFor, setPausedFor] = useState<number>(0);

  const ws = mower?.sensors.work_status ?? '0';
  const isPaused = ws === '4';

  useEffect(() => {
    if (!isPaused) {
      pauseStartRef.current = null;
      setPausedFor(0);
      return;
    }
    if (pauseStartRef.current === null) {
      pauseStartRef.current = Date.now();
    }
    const tick = () => {
      const start = pauseStartRef.current;
      if (start !== null) setPausedFor(Date.now() - start);
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [isPaused]);

  if (!isPaused || pausedFor < PAUSE_THRESHOLD_MS) return null;

  const minutes = Math.floor(pausedFor / 60_000);

  return (
    <div className="px-4 py-2 bg-amber-900/30 border-b border-amber-700/50 text-amber-100 text-sm flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">
        {t('mower.longPause.banner', { minutes })}
      </span>
    </div>
  );
}
