import { useEffect, useRef, useState } from 'react';
import { installer } from '../ipc';
import type { FlashTarget, ImageProgress, FlashProgress } from '../../shared/types';

interface FlashStepProps {
  device?: string;
  size?: number;
  flashed: boolean;
  onFlashed: (imagePath: string) => void;
}

type Phase = 'idle' | 'downloading' | 'flashing' | 'done' | 'error';

function formatMb(bytes: number): string {
  return (bytes / 1e6).toFixed(0) + ' MB';
}

export function FlashStep({ device, size, flashed, onFlashed }: FlashStepProps) {
  const [phase, setPhase] = useState<Phase>(flashed ? 'done' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [imageProgress, setImageProgress] = useState<ImageProgress | null>(null);
  const [flashPercent, setFlashPercent] = useState(0);

  // Keep the latest progress in refs so the IPC subscriptions can stay stable.
  const imageProgressRef = useRef(setImageProgress);
  const flashProgressRef = useRef(setFlashPercent);
  imageProgressRef.current = setImageProgress;
  flashProgressRef.current = setFlashPercent;

  useEffect(() => {
    const offImage = installer.onImageProgress((p: ImageProgress) =>
      imageProgressRef.current(p),
    );
    const offFlash = installer.onFlashProgress((p: FlashProgress) =>
      flashProgressRef.current(Math.round((p.percentage ?? 0))),
    );
    return () => {
      offImage();
      offFlash();
    };
  }, []);

  const start = async () => {
    if (!device || typeof size !== 'number') {
      setError('No SD card selected. Go back and choose a card.');
      setPhase('error');
      return;
    }
    setError(null);
    setImageProgress(null);
    setFlashPercent(0);

    setPhase('downloading');
    const imageResult = await installer.ensureImage();
    if (!imageResult.ok) {
      setError(imageResult.error);
      setPhase('error');
      return;
    }

    setPhase('flashing');
    const target: FlashTarget = {
      device,
      isSystem: false,
      isRemovable: true,
      isReadOnly: false,
      size,
    };
    const flashResult = await installer.startFlash({
      imagePath: imageResult.value.imagePath,
      target,
    });
    if (!flashResult.ok) {
      setError(flashResult.error);
      setPhase('error');
      return;
    }

    setPhase('done');
    onFlashed(imageResult.value.imagePath);
  };

  const cancel = async () => {
    await installer.cancelFlash();
    setError('Flashing was cancelled.');
    setPhase('error');
  };

  const busy = phase === 'downloading' || phase === 'flashing';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Write OpenNova to the card</h2>
        <p className="text-sm text-slate-600">
          This downloads the operating system image and writes it to the card.
        </p>
      </div>

      {phase === 'downloading' && (
        <ProgressBlock
          label="Downloading image"
          percent={
            imageProgress && imageProgress.total
              ? Math.round((imageProgress.received / imageProgress.total) * 100)
              : null
          }
          detail={
            imageProgress
              ? imageProgress.total
                ? `${formatMb(imageProgress.received)} of ${formatMb(imageProgress.total)}`
                : `${formatMb(imageProgress.received)} downloaded`
              : 'Starting download...'
          }
        />
      )}

      {phase === 'flashing' && (
        <ProgressBlock
          label="Writing to card"
          percent={flashPercent}
          detail={`${flashPercent}% complete`}
        />
      )}

      {phase === 'done' && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          The card was written successfully. Press Next to configure it.
        </div>
      )}

      {phase === 'error' && error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        {(phase === 'idle' || phase === 'error') && (
          <button
            type="button"
            onClick={() => void start()}
            className="px-5 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
          >
            {phase === 'error' ? 'Retry' : 'Start'}
          </button>
        )}
        {busy && (
          <button
            type="button"
            onClick={() => void cancel()}
            className="px-5 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function ProgressBlock({
  label,
  percent,
  detail,
}: {
  label: string;
  percent: number | null;
  detail: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm text-slate-600">
        <span>{label}</span>
        {percent !== null && <span>{percent}%</span>}
      </div>
      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: percent !== null ? `${percent}%` : '100%' }}
        />
      </div>
      <p className="text-xs text-slate-500">{detail}</p>
    </div>
  );
}
