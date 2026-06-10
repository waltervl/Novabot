import { useEffect, useRef, useState } from 'react';
import { installer } from '../ipc';
import type { BuildProgress, InstallerConfig } from '../../shared/types';

interface BuildStepProps {
  config?: InstallerConfig;
  built: boolean;
  outputPath?: string;
  onBuilt: (outputPath: string) => void;
}

type Phase = 'idle' | 'building' | 'done' | 'error';

function formatMb(bytes: number): string {
  return (bytes / 1e6).toFixed(0) + ' MB';
}

const PHASE_LABEL: Record<BuildProgress['phase'], string> = {
  download: 'Downloading Raspberry Pi OS',
  decompress: 'Unpacking the image',
  patch: 'Writing your settings into the image',
  finalize: 'Finishing up',
};

export function BuildStep({ config, built, outputPath, onBuilt }: BuildStepProps) {
  const [phase, setPhase] = useState<Phase>(built ? 'done' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<BuildProgress | null>(null);

  // Keep the progress setter in a ref so the IPC subscription stays stable.
  const progressRef = useRef(setProgress);
  progressRef.current = setProgress;

  useEffect(() => {
    const off = installer.onBuildProgress((p) => progressRef.current(p));
    return off;
  }, []);

  const start = async () => {
    if (!config) {
      setError('Missing settings. Go back and complete the earlier step.');
      setPhase('error');
      return;
    }
    setError(null);
    setProgress(null);
    setPhase('building');

    const result = await installer.buildImage(config);
    if (!result.ok) {
      setError(result.error);
      setPhase('error');
      return;
    }
    setPhase('done');
    onBuilt(result.value.outputPath);
  };

  const downloadPercent =
    progress?.phase === 'download' && progress.total
      ? Math.round((progress.received! / progress.total) * 100)
      : null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Build your OpenNova image</h2>
        <p className="text-sm text-slate-600">
          This downloads the latest Raspberry Pi OS and bakes your settings into a
          ready-to-flash image file. No SD card needed yet.
        </p>
      </div>

      {phase === 'building' && progress && (
        <div className="space-y-1">
          <div className="flex justify-between text-sm text-slate-600">
            <span>{PHASE_LABEL[progress.phase]}</span>
            {downloadPercent !== null && <span>{downloadPercent}%</span>}
          </div>
          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className={[
                'h-full bg-emerald-500',
                downloadPercent !== null ? 'transition-all' : 'animate-pulse w-full',
              ].join(' ')}
              style={downloadPercent !== null ? { width: `${downloadPercent}%` } : undefined}
            />
          </div>
          <p className="text-xs text-slate-500">
            {progress.phase === 'download' && progress.total
              ? `${formatMb(progress.received!)} of ${formatMb(progress.total)}`
              : progress.phase === 'decompress'
                ? 'Unpacking ~3 GB — this takes a minute.'
                : PHASE_LABEL[progress.phase] + '…'}
          </p>
        </div>
      )}

      {phase === 'building' && !progress && (
        <p className="text-sm text-slate-600">Starting…</p>
      )}

      {phase === 'done' && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          Your image is ready.
          {outputPath && (
            <span className="block mt-1 text-emerald-700 break-all">{outputPath}</span>
          )}
          <span className="block mt-1">Press Next to flash it onto your SD card.</span>
        </div>
      )}

      {phase === 'error' && error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {(phase === 'idle' || phase === 'error') && (
        <button
          type="button"
          onClick={() => void start()}
          className="px-5 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
        >
          {phase === 'error' ? 'Try again' : 'Build image'}
        </button>
      )}
    </div>
  );
}
