import { useEffect, useRef, useState } from 'react';
import { installer } from '../ipc';
import type { DriveCandidate, FlashProgress } from '../../shared/types';

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
      // Drop a stale selection that is no longer attached.
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
      setError('Select an SD card first.');
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
  const busy = phase === 'flashing';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Write to the SD card</h2>
        <p className="text-sm text-slate-600">
          Only removable cards are shown, for safety. macOS will ask for your password
          to write the card.
        </p>
      </div>

      {phase !== 'flashing' && phase !== 'done' && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Choose the SD card</span>
            <button
              type="button"
              onClick={() => void scan()}
              disabled={scanning}
              className="text-sm text-emerald-700 hover:underline disabled:opacity-50"
            >
              {scanning ? 'Scanning…' : 'Refresh'}
            </button>
          </div>

          {drives.length === 0 ? (
            <p className="p-3 rounded-lg border border-slate-200 text-sm text-slate-500">
              No removable SD cards found. Insert a card and refresh.
            </p>
          ) : (
            <ul className="space-y-2">
              {drives.map((d) => (
                <li key={d.device}>
                  <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="sd"
                      checked={selectedDevice === d.device}
                      onChange={() => onSelectDevice(d.device)}
                    />
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{d.description}</span>
                      <span className="block text-xs text-slate-500">
                        {d.device} · {formatGb(d.size)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <label className="flex items-center gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-800">
            <input
              type="checkbox"
              checked={eraseConfirmed}
              onChange={(e) => setEraseConfirmed(e.target.checked)}
            />
            I understand this will erase everything on the selected card.
          </label>

          <button
            type="button"
            onClick={() => void start()}
            disabled={!selectedDevice || !eraseConfirmed || !imagePath}
            className="px-5 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {phase === 'error' ? 'Try again' : 'Flash'}
          </button>

          {phase === 'error' && error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}
        </>
      )}

      {phase === 'flashing' && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-slate-600">
            <span>Writing to the card</span>
            {percent !== null && <span>{percent}%</span>}
          </div>
          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className={['h-full bg-emerald-500', percent !== null ? 'transition-all' : 'animate-pulse w-full'].join(' ')}
              style={percent !== null ? { width: `${percent}%` } : undefined}
            />
          </div>
          <p className="text-xs text-slate-500">
            {progress
              ? `${formatGb(progress.written)} of ${formatGb(progress.total)}${formatSpeed(progress.bytesPerSec)}`
              : 'Waiting for authorization…'}
          </p>
          <button
            type="button"
            onClick={() => void cancel()}
            className="mt-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {phase === 'done' && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          The card was written successfully. Put it in your Pi and power it on — press Next.
        </div>
      )}
    </div>
  );
}
