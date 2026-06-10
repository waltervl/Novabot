import { useState } from 'react';
import {
  STEPS,
  canAdvance,
  nextStep,
  prevStep,
  stepIndex,
  type Step,
  type WizardContext,
} from './wizard';
import { WelcomeStep } from './steps/WelcomeStep';
import { ConfigStep } from './steps/ConfigStep';
import { BuildStep } from './steps/BuildStep';
import { FlashStep } from './steps/FlashStep';
import { FinishStep } from './steps/FinishStep';

const STEP_LABELS: Record<Step, string> = {
  welcome: 'Welcome',
  config: 'Settings',
  build: 'Build',
  flash: 'Flash',
  finish: 'Finish',
};

export function App() {
  const [step, setStep] = useState<Step>('welcome');
  const [ctx, setCtx] = useState<WizardContext>({});

  const patchCtx = (patch: Partial<WizardContext>) =>
    setCtx((prev) => ({ ...prev, ...patch }));

  const advanceEnabled = canAdvance(step, ctx);
  const isFirst = stepIndex(step) === 0;
  const isLast = step === 'finish';

  const goNext = () => {
    if (advanceEnabled) {
      setStep((s) => nextStep(s));
    }
  };
  const goBack = () => setStep((s) => prevStep(s));

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-2xl">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-semibold">OpenNova Installer</h1>
          <p className="text-sm text-slate-500">
            Build a ready-to-flash OpenNova image for your Raspberry Pi.
          </p>
        </header>

        <Breadcrumb current={step} />

        <main className="mt-6 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          {step === 'welcome' && <WelcomeStep />}
          {step === 'config' && (
            <ConfigStep config={ctx.config} onChange={(config) => patchCtx({ config })} />
          )}
          {step === 'build' && (
            <BuildStep
              config={ctx.config}
              built={ctx.built ?? false}
              outputPath={ctx.outputPath}
              onBuilt={(outputPath) => patchCtx({ built: true, outputPath })}
            />
          )}
          {step === 'flash' && (
            <FlashStep
              imagePath={ctx.outputPath}
              flashed={ctx.flashed ?? false}
              selectedDevice={ctx.selectedDevice}
              onSelectDevice={(device) => patchCtx({ selectedDevice: device || undefined })}
              onFlashed={() => patchCtx({ flashed: true })}
            />
          )}
          {step === 'finish' && (
            <FinishStep hostname={ctx.config?.hostname} />
          )}
        </main>

        <footer className="mt-6 flex justify-between">
          <button
            type="button"
            onClick={goBack}
            disabled={isFirst}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
          >
            Back
          </button>
          {!isLast && (
            <button
              type="button"
              onClick={goNext}
              disabled={!advanceEnabled}
              className="px-5 py-2 rounded-lg bg-emerald-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-700"
            >
              {step === 'welcome' ? 'Get started' : 'Next'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function Breadcrumb({ current }: { current: Step }) {
  const currentIndex = stepIndex(current);
  return (
    <ol className="flex items-center justify-between gap-1">
      {STEPS.map((s, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={s} className="flex-1 flex flex-col items-center text-center">
            <span
              className={[
                'flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium',
                active
                  ? 'bg-emerald-600 text-white'
                  : done
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-200 text-slate-500',
              ].join(' ')}
            >
              {i + 1}
            </span>
            <span
              className={[
                'mt-1 text-xs',
                active ? 'text-slate-900 font-medium' : 'text-slate-400',
              ].join(' ')}
            >
              {STEP_LABELS[s]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
