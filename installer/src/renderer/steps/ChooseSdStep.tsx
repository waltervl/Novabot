import { useCallback, useEffect, useState } from 'react';
import { installer } from '../ipc';
import type { DriveCandidate } from '../../shared/types';

interface ChooseSdStepProps {
  selectedDevice?: string;
  eraseConfirmed: boolean;
  onSelect: (device: string, size: number) => void;
  onEraseConfirmedChange: (confirmed: boolean) => void;
}

function formatGb(size: number): string {
  return (size / 1e9).toFixed(0) + ' GB';
}

export function ChooseSdStep({
  selectedDevice,
  eraseConfirmed,
  onSelect,
  onEraseConfirmedChange,
}: ChooseSdStepProps) {
  const [drives, setDrives] = useState<DriveCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    const result = await installer.scanDrives();
    setScanning(false);
    if (result.ok) {
      setDrives(result.value);
    } else {
      setDrives([]);
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    void scan();
  }, [scan]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Choose the SD card</h2>
          <p className="text-sm text-slate-600">
            Only removable cards are shown for safety.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void scan()}
          disabled={scanning}
          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
        >
          {scanning ? 'Scanning...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          Could not scan drives: {error}
        </div>
      )}

      {!error && drives.length === 0 && !scanning && (
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600">
          No removable SD cards found. Insert a card and refresh.
        </div>
      )}

      {drives.length > 0 && (
        <ul className="space-y-2">
          {drives.map((d) => {
            const isSelected = d.device === selectedDevice;
            return (
              <li key={d.device}>
                <label
                  className={[
                    'flex items-center gap-3 p-3 rounded-lg border cursor-pointer',
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="sd-card"
                    checked={isSelected}
                    onChange={() => onSelect(d.device, d.size)}
                  />
                  <span className="flex-1">
                    <span className="block font-medium text-slate-800">
                      {d.description}
                    </span>
                    <span className="block text-sm text-slate-500">
                      {d.device} - {formatGb(d.size)}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <label className="flex items-start gap-3 p-3 rounded-lg border border-amber-300 bg-amber-50 cursor-pointer">
        <input
          type="checkbox"
          checked={eraseConfirmed}
          onChange={(e) => onEraseConfirmedChange(e.target.checked)}
          className="mt-1"
          required
        />
        <span className="text-sm text-amber-800">
          I understand this will erase everything on the selected card.
        </span>
      </label>
    </div>
  );
}
