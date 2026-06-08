/**
 * Pure, framework-free wizard state machine.
 *
 * This module contains NO React or DOM imports so it can run in the node test
 * environment. It drives step routing (order, next/prev, index) and the
 * per-step advance guard. The React layer reads from here and never duplicates
 * the routing rules.
 */
import type { InstallerConfig } from '../shared/types';

/** The wizard screens, in the order the user walks through them. */
export type Step =
  | 'welcome'
  | 'config'
  | 'chooseSd'
  | 'flash'
  | 'inject'
  | 'finish';

/** All steps, in order. */
export const STEPS: readonly Step[] = [
  'welcome',
  'config',
  'chooseSd',
  'flash',
  'inject',
  'finish',
] as const;

/**
 * Data gathered as the user progresses. Every field is optional because it is
 * filled in step by step; the {@link canAdvance} guard checks what each step
 * requires before the user may move on.
 */
export interface WizardContext {
  config?: InstallerConfig;
  selectedDevice?: string;
  selectedSize?: number;
  imagePath?: string;
  eraseConfirmed?: boolean;
  flashed?: boolean;
  injected?: boolean;
}

/** Zero-based position of a step in {@link STEPS}. */
export function stepIndex(s: Step): number {
  return STEPS.indexOf(s);
}

/** The next step, clamped at `finish`. */
export function nextStep(s: Step): Step {
  const i = stepIndex(s);
  return STEPS[Math.min(i + 1, STEPS.length - 1)];
}

/** The previous step, clamped at `welcome`. */
export function prevStep(s: Step): Step {
  const i = stepIndex(s);
  return STEPS[Math.max(i - 1, 0)];
}

/**
 * Is `config` a complete, usable {@link InstallerConfig}? Hostname must be
 * non-empty; a Wi-Fi network additionally needs a non-empty SSID.
 */
function isValidConfig(config: InstallerConfig | undefined): boolean {
  if (!config) {
    return false;
  }
  if (config.hostname.trim().length === 0) {
    return false;
  }
  if (config.network.type === 'wifi' && config.network.ssid.trim().length === 0) {
    return false;
  }
  return true;
}

/**
 * Whether the user may advance FROM `step`, given the data gathered so far.
 *
 * - welcome: always.
 * - config: a valid config is present.
 * - chooseSd: a device is selected AND the erase warning is confirmed.
 * - flash: the card was flashed.
 * - inject: the boot config was injected.
 * - finish: never (last step).
 */
export function canAdvance(step: Step, ctx: WizardContext): boolean {
  switch (step) {
    case 'welcome':
      return true;
    case 'config':
      return isValidConfig(ctx.config);
    case 'chooseSd':
      return (
        typeof ctx.selectedDevice === 'string' &&
        ctx.selectedDevice.length > 0 &&
        ctx.eraseConfirmed === true
      );
    case 'flash':
      return ctx.flashed === true;
    case 'inject':
      return ctx.injected === true;
    case 'finish':
      return false;
  }
}
