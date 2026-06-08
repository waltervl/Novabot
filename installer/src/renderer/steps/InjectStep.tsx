import { useState } from 'react';
import { installer } from '../ipc';
import type { GeneratedFiles, InstallerConfig } from '../../shared/types';

interface InjectStepProps {
  device?: string;
  config?: InstallerConfig;
  injected: boolean;
  onInjected: () => void;
}

type Phase = 'idle' | 'working' | 'done' | 'fallback';

export function InjectStep({ device, config, injected, onInjected }: InjectStepProps) {
  const [phase, setPhase] = useState<Phase>(injected ? 'done' : 'idle');
  const [bootDir, setBootDir] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedFiles | null>(null);

  const run = async () => {
    if (!device || !config) {
      setError('Missing card or settings. Go back and complete the earlier steps.');
      return;
    }
    setError(null);
    setPhase('working');
    const result = await installer.injectBoot({ device, config });
    if (result.ok) {
      setBootDir(result.value.bootDir);
      setPhase('done');
      onInjected();
      return;
    }

    // Could not write to the boot partition automatically. Offer the manual
    // fallback by generating the same files for the user to copy by hand.
    setError(result.error);
    const gen = await installer.generateConfig(config);
    if (gen.ok) {
      setGenerated(gen.value);
    }
    setPhase('fallback');
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Configure the card</h2>
        <p className="text-sm text-slate-600">
          This writes your settings to the card so the Pi sets itself up on first
          boot.
        </p>
      </div>

      {phase === 'idle' && (
        <button
          type="button"
          onClick={() => void run()}
          className="px-5 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
        >
          Write settings to card
        </button>
      )}

      {phase === 'working' && (
        <p className="text-sm text-slate-600">Writing settings...</p>
      )}

      {phase === 'done' && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          Settings written to the card.
          {bootDir && (
            <span className="block mt-1 text-emerald-700 break-all">
              Boot drive: {bootDir}
            </span>
          )}
        </div>
      )}

      {phase === 'fallback' && (
        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              Could not write the settings automatically: {error}
            </div>
          )}
          {generated ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-700">
                Copy firstrun.sh onto the SD card&apos;s boot drive, append the line
                below to cmdline.txt, then continue.
              </p>
              <CodeBlock title="firstrun.sh" content={generated.firstrunSh} />
              <CodeBlock
                title="Append to cmdline.txt (one line)"
                content={generated.cmdlineAppend}
              />
              <CodeBlock title="docker-compose.yml" content={generated.composeYml} />
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              Could not generate the fallback files either. You can still continue
              and configure the Pi from its admin page after it boots.
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              onInjected();
              setPhase('done');
            }}
            className="px-5 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Continue anyway
          </button>
        </div>
      )}
    </div>
  );
}

function CodeBlock({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700 mb-1">{title}</p>
      <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 text-xs overflow-x-auto whitespace-pre-wrap break-all select-all">
        {content}
      </pre>
    </div>
  );
}
