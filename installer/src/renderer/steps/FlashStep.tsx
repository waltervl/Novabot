import { useEffect, useRef, useState } from 'react';
import { installer } from '../ipc';
import type { DriveCandidate, FlashProgress } from '../../shared/types';
import { ProgressBar, CheckBadge, ErrorCard } from './BuildStep';

interface FlashStepProps {
  /** The built image to write (from the Build step). */
  imagePath?: string;
  flashed: boolean;
  selectedDevice?: string;
  onSelectDevice: (device: string) => void;
  onFlashed: () => void;
}

type Phase = 'idle' | 'flashing' | 'done' | 'error';

function formatGb(bytes: number): string {
  return (bytes / 1e9).toFixed(1) + ' GB';
}

function formatSpeed(bytesPerSec: number): string {
  return bytesPerSec > 0 ? ` · ${(bytesPerSec / 1e6).toFixed(1)} MB/s` : '';
}

export function FlashStep({
  imagePath,
  flashed,
  selectedDevice,
  onSelectDevice,
  onFlashed,
}: FlashStepProps) {
  const [drives, setDrives] = useState<DriveCandidate[]>([]);
  const [scanning, setScanning] = useState(false);
  const [eraseConfirmed, setEraseConfirmed] = useState(false);
  const [phase, setPhase] = useState<Phase>(flashed ? 'done' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<FlashProgress | null>(null);

  const progressRef = useRef(setProgress);
  progressRef.current = setProgress;

  const scan = async () => {
    setScanning(true);
    const result = await installer.scanDrives();
    setScanning(false);
    if (result.ok) {
      setDrives(result.value);
      if (selectedDevice && !result.value.some((d) => d.device === selectedDevice)) {
        onSelectDevice('');
      }
    }
  };

  useEffect(() => {
    void scan();
    const off = installer.onFlashProgress((p) => progressRef.current(p));
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    if (!imagePath) {
      setError('No image built yet. Go back a step.');
      setPhase('error');
      return;
    }
    if (!selectedDevice) {
      setError('Please choose your SD card first.');
      setPhase('error');
      return;
    }
    setError(null);
    setProgress(null);
    setPhase('flashing');
    const result = await installer.startFlash({ imagePath, device: selectedDevice });
    if (!result.ok) {
      setError(result.error);
      setPhase('error');
      return;
    }
    setPhase('done');
    onFlashed();
  };

  const cancel = async () => {
    await installer.cancelFlash();
  };

  const percent =
    progress && progress.total > 0 ? Math.round((progress.written / progress.total) * 100) : null;

  return (
    <div className="space-y-6">
      {phase !== 'flashing' && phase !== 'done' && (
        <>
          <div>
            <h2 className="display text-3xl text-ink">Write the SD card</h2>
            <p className="mt-2 text-[0.95rem] text-ink-dim font-medium leading-relaxed">
              Only removable cards show up, to keep you safe. You&apos;ll be asked to approve writing
              the card (an admin prompt), nothing else is needed.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="eyebrow">Choose your card</span>
              <button
                type="button"
                onClick={() => void scan()}
                disabled={scanning}
                className="text-sm font-bold text-ink-faint hover:text-green transition-colors disabled:opacity-50"
              >
                {scanning ? 'Looking…' : '↻ Rescan'}
              </button>
            </div>

            {drives.length === 0 ? (
              <p className="tile p-4 text-sm text-ink-faint font-semibold">
                No card found yet. Pop one in and tap Rescan.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {drives.map((d) => {
                  const sel = selectedDevice === d.device;
                  return (
                    <li key={d.device}>
                      <label
                        className={['tile tile-selectable flex items-center gap-3 p-3', sel ? 'tile-on' : ''].join(' ')}
                      >
                        <input
                          type="radio"
                          name="sd"
                          checked={sel}
                          onChange={() => onSelectDevice(d.device)}
                          className="sr-only"
                        />
                        <span
                          className={[
                            'grid place-items-center w-[18px] h-[18px] rounded-full border-2 transition-colors flex-none',
                            sel ? 'border-green' : 'border-line-strong',
                          ].join(' ')}
                          aria-hidden="true"
                        >
                          <span className={['w-2 h-2 rounded-full', sel ? 'bg-green' : 'bg-transparent'].join(' ')} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[0.95rem] font-bold text-ink truncate">
                            {d.description}
                          </span>
                          <span className="block text-sm text-ink-dim font-semibold">{d.device}</span>
                        </span>
                        <span className="text-sm font-bold text-green tabular-nums">{formatGb(d.size)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <label className="flex items-center gap-3 rounded-tile p-3.5 cursor-pointer border border-coral/40 bg-coral/[0.07]">
            <input
              type="checkbox"
              checked={eraseConfirmed}
              onChange={(e) => setEraseConfirmed(e.target.checked)}
              className="sr-only"
            />
            <span
              className={[
                'grid place-items-center w-[18px] h-[18px] rounded-md border-2 transition-colors flex-none',
                eraseConfirmed ? 'border-coral bg-coral/25' : 'border-coral/60',
              ].join(' ')}
              aria-hidden="true"
            >
              {eraseConfirmed && (
                <svg viewBox="0 0 20 20" className="w-3 h-3 text-coral" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                  />
                </svg>
              )}
            </span>
            <span className="text-sm font-bold text-coral">
              I understand this erases everything on the card I picked.
            </span>
          </label>

          <button
            type="button"
            onClick={() => void start()}
            disabled={!selectedDevice || !eraseConfirmed || !imagePath}
            className="btn-go"
          >
            {phase === 'error' ? 'Try again' : 'Write card'}
          </button>

          {phase === 'error' && error && <ErrorCard message={error} />}
        </>
      )}

      {phase === 'flashing' && (
        <div className="space-y-4">
          <h2 className="display text-3xl text-ink">Writing your card</h2>
          <div className="flex items-center gap-2 font-bold text-coral">
            <span
              className="block w-2.5 h-2.5 rounded-full bg-coral"
              style={{ animation: 'soft-pulse 1.1s ease-in-out infinite' }}
            />
            Please leave the card in until it&apos;s done.
          </div>
          <div>
            <div className="flex justify-between text-sm font-bold text-ink-dim mb-1.5">
              <span className="truncate">{selectedDevice}</span>
              {percent !== null && <span className="text-green">{percent}%</span>}
            </div>
            <ProgressBar percent={percent} />
            <p className="mt-1.5 text-sm text-ink-faint font-semibold">
              {progress
                ? `${formatGb(progress.written)} of ${formatGb(progress.total)}${formatSpeed(progress.bytesPerSec)}`
                : 'Waiting for your password…'}
            </p>
          </div>
          <button type="button" onClick={() => void cancel()} className="btn-ghost">
            Cancel
          </button>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-5">
          <h2 className="display text-3xl text-ink">Card written!</h2>
          <div className="tile tile-on p-4">
            <div className="flex items-center gap-2 font-bold text-green">
              <CheckBadge /> All done writing.
            </div>
            <p className="mt-2.5 text-sm text-ink-dim font-semibold">
              Pop the card into your Pi and power it on. Tap Continue for the last step.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
