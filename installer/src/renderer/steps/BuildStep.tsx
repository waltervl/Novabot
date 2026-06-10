import { useEffect, useRef, useState } from 'react';
import { installer } from '../ipc';
import type { BuildProgress, ExistingImage, InstallerConfig } from '../../shared/types';

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

function formatGb(bytes: number): string {
  return (bytes / 1e9).toFixed(1) + ' GB';
}

function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

const PHASES: { key: BuildProgress['phase']; label: string }[] = [
  { key: 'download', label: 'Download' },
  { key: 'decompress', label: 'Unpack' },
  { key: 'patch', label: 'Add settings' },
  { key: 'finalize', label: 'Finish up' },
];

export function BuildStep({ config, built, outputPath, onBuilt }: BuildStepProps) {
  const [phase, setPhase] = useState<Phase>(built ? 'done' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  const [existing, setExisting] = useState<ExistingImage[]>([]);

  const progressRef = useRef(setProgress);
  progressRef.current = setProgress;

  useEffect(() => {
    const off = installer.onBuildProgress((p) => progressRef.current(p));
    return off;
  }, []);

  // Offer to reuse a previously-built image so testers don't rebuild every time.
  useEffect(() => {
    void installer.listExistingImages().then((res) => {
      if (res.ok) setExisting(res.value);
    });
  }, []);

  const reuse = (img: ExistingImage) => {
    setError(null);
    setPhase('done');
    onBuilt(img.path);
  };

  const start = async () => {
    if (!config) {
      setError('Some settings are missing. Go back a step and finish them.');
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

  const activeIdx = progress ? PHASES.findIndex((p) => p.key === progress.phase) : -1;
  const downloadPercent =
    progress?.phase === 'download' && progress.total
      ? Math.round((progress.received! / progress.total) * 100)
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="display text-3xl text-ink">Build your card</h2>
        <p className="mt-2 text-[0.95rem] text-ink-dim font-medium leading-relaxed">
          We&apos;ll grab the latest Raspberry Pi OS and bake your settings in. No SD card needed
          for this part, it&apos;s all on your computer.
        </p>
      </div>

      {phase === 'building' && (
        <div className="space-y-5">
          {/* phase sequence */}
          <div className="grid grid-cols-4 gap-2">
            {PHASES.map((p, i) => {
              const done = activeIdx > i;
              const active = activeIdx === i;
              return (
                <div
                  key={p.key}
                  className={['tile p-2.5', active ? 'tile-on' : ''].join(' ')}
                >
                  <Dot active={active} done={done} />
                  <span
                    className={[
                      'mt-1.5 block text-xs font-bold truncate',
                      active ? 'text-ink' : done ? 'text-ink-dim' : 'text-ink-faint',
                    ].join(' ')}
                  >
                    {p.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* progress bar */}
          <div>
            <div className="flex justify-between text-sm font-bold text-ink-dim mb-1.5">
              <span>{progress ? PHASES[Math.max(activeIdx, 0)].label : 'Starting'}…</span>
              {downloadPercent !== null && <span className="text-green">{downloadPercent}%</span>}
            </div>
            <ProgressBar percent={downloadPercent} />
            <p className="mt-1.5 text-sm text-ink-faint font-semibold">
              {progress?.phase === 'download' && progress.total
                ? `${formatMb(progress.received!)} of ${formatMb(progress.total)}`
                : progress?.phase === 'decompress'
                  ? 'Unpacking about 3 GB, this takes a minute.'
                  : 'Working…'}
            </p>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="tile tile-on p-4">
          <div className="flex items-center gap-2 font-bold text-green">
            <CheckBadge /> Your card image is ready!
          </div>
          {outputPath && <p className="mt-2.5"><span className="code break-all">{outputPath}</span></p>}
          <p className="mt-2.5 text-sm text-ink-dim font-semibold">
            Next, we&apos;ll write it onto your SD card.
          </p>
        </div>
      )}

      {phase === 'error' && error && <ErrorCard message={error} />}

      {(phase === 'idle' || phase === 'error') && (
        <div className="space-y-4">
          {existing.length > 0 && (
            <div>
              <div className="eyebrow mb-2">Reuse a previous build</div>
              <div className="tile flex items-center gap-3.5 p-3.5">
                <span className="icon-tile g">
                  <svg viewBox="0 0 24 24" className="w-[21px] h-[21px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-ink truncate">{existing[0].name}</p>
                  <p className="text-sm text-ink-dim font-medium">
                    {formatGb(existing[0].size)} · built {timeAgo(existing[0].mtimeMs)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => reuse(existing[0])}
                  className="shrink-0 text-sm font-bold text-green hover:underline"
                >
                  Use this
                </button>
              </div>
            </div>
          )}

          <button type="button" onClick={() => void start()} className="btn-go">
            {phase === 'error' ? 'Try again' : existing.length > 0 ? 'Build a fresh image' : 'Build image'}
          </button>
        </div>
      )}
    </div>
  );
}

function Dot({ active, done }: { active: boolean; done: boolean }) {
  if (done) {
    return (
      <svg viewBox="0 0 20 20" className="w-4 h-4 text-green" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
        />
      </svg>
    );
  }
  return (
    <span
      className={[
        'block w-2.5 h-2.5 rounded-full',
        active ? 'bg-green' : 'bg-line-strong',
      ].join(' ')}
      style={active ? { animation: 'soft-pulse 1.1s ease-in-out infinite' } : undefined}
    />
  );
}

export function ProgressBar({ percent }: { percent: number | null }) {
  return (
    <div className="relative h-2.5 rounded-full bg-well overflow-hidden">
      {percent !== null ? (
        <div
          className="h-full rounded-full bg-green transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      ) : (
        <div className="absolute inset-0">
          <div
            className="h-full w-1/3 bg-gradient-to-r from-transparent via-green/70 to-transparent"
            style={{ animation: 'scan 1.3s ease-in-out infinite' }}
          />
        </div>
      )}
    </div>
  );
}

export function CheckBadge() {
  return (
    <span className="grid place-items-center w-5 h-5 rounded-full bg-green text-[#08130d] flex-none">
      <svg viewBox="0 0 20 20" className="w-3 h-3" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
        />
      </svg>
    </span>
  );
}

export function ErrorCard({ message }: { message: string }) {
  return (
    <div className="tile p-4 border-danger/40 bg-danger/[0.07]">
      <div className="font-bold text-danger mb-1">Something went wrong</div>
      <p className="text-sm text-danger/90 font-semibold break-words">{message}</p>
    </div>
  );
}
