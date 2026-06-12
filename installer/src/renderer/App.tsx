import { useEffect, useState } from 'react';
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
import markUrl from './assets/opennova-mark.png';

const STEP_LABELS: Record<Step, string> = {
  welcome: 'Get started',
  config: 'Your settings',
  build: 'Build the card',
  flash: 'Write the card',
  finish: 'All done',
};

type Theme = 'light' | 'dark';
const THEME_KEY = 'opennova-installer-theme';

export function App() {
  const [step, setStep] = useState<Step>('welcome');
  const [ctx, setCtx] = useState<WizardContext>({});
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  // Apply the theme to <html data-theme> and remember the choice. Light is the
  // default; the rest of the UI themes itself off the CSS variables.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage unavailable — keep the in-memory choice */
    }
  }, [theme]);

  const patchCtx = (patch: Partial<WizardContext>) =>
    setCtx((prev) => ({ ...prev, ...patch }));

  const advanceEnabled = canAdvance(step, ctx);
  const idx = stepIndex(step);
  const isFirst = idx === 0;
  const isLast = step === 'finish';

  const goNext = () => {
    if (advanceEnabled) setStep((s) => nextStep(s));
  };
  const goBack = () => setStep((s) => prevStep(s));

  return (
    <div className="min-h-screen flex justify-center px-5 py-10">
      <div className="w-full max-w-xl card p-7 sm:p-9">
        {/* ---- Brand ---------------------------------------------------- */}
        <div className="flex items-center justify-between gap-3 mb-7">
          <div className="flex items-center gap-3">
            <Mark />
            <div className="leading-tight">
              <div className="display text-xl text-ink">OpenNova</div>
              <div className="text-sm font-semibold text-ink-dim">Your mower, your cloud</div>
            </div>
          </div>
          <ThemeToggle
            theme={theme}
            onToggle={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          />
        </div>

        <Stepper current={step} />

        {/* ---- Step content -------------------------------------------- */}
        <div key={step} className="rise mt-7">
          {step === 'welcome' && <WelcomeStep />}
          {step === 'config' && (
            <ConfigStep
              config={ctx.config}
              onChange={(config) => patchCtx({ config })}
              onHostnameTakenChange={(taken) => patchCtx({ hostnameTaken: taken })}
            />
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
            <FinishStep
              hostname={ctx.config?.hostname}
              sshUser={ctx.config?.ssh?.enabled ? ctx.config.ssh.username : undefined}
            />
          )}
        </div>

        {/* ---- Navigation ---------------------------------------------- */}
        <div className="mt-9 flex items-center justify-between gap-3">
          <button type="button" onClick={goBack} disabled={isFirst} className="btn-ghost">
            ← Back
          </button>
          {!isLast ? (
            <button type="button" onClick={goNext} disabled={!advanceEnabled} className="btn-go">
              {step === 'welcome' ? "Let's go!" : 'Continue'}
            </button>
          ) : (
            <span className="text-sm font-bold text-green">All set 🎉</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** The OpenNova mower emblem. Its built-in white outline separates it cleanly on
 *  both the light and the dark card, so it needs no background plate. */
function Mark() {
  return (
    <img
      src={markUrl}
      alt="OpenNova"
      draggable={false}
      className="h-12 w-auto flex-none select-none"
    />
  );
}

/** Sun/moon pill that flips the theme. Shows the mood you'll switch TO. */
function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const toDark = theme === 'light';
  return (
    <button
      type="button"
      onClick={onToggle}
      className="icon-btn"
      aria-label={toDark ? 'Switch to dark mode' : 'Switch to light mode'}
      title={toDark ? 'Dark mode' : 'Light mode'}
    >
      {toDark ? (
        // moon
        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      ) : (
        // sun
        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}

/** Soft progress stepper: a row of fill bars plus a friendly "Step n of N" label. */
function Stepper({ current }: { current: Step }) {
  const idx = stepIndex(current);
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={[
              'h-1.5 flex-1 rounded-full transition-colors duration-300',
              i < idx ? 'bg-green-deep' : i === idx ? 'bg-green' : 'bg-line-strong',
            ].join(' ')}
          />
        ))}
      </div>
      <p className="mt-2.5 text-sm font-bold text-ink-dim">
        Step {idx + 1} of {STEPS.length} · {STEP_LABELS[current]}
      </p>
    </div>
  );
}
