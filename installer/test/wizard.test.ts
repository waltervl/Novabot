import { describe, it, expect } from 'vitest';
import {
  STEPS,
  nextStep,
  prevStep,
  stepIndex,
  canAdvance,
  type Step,
  type WizardContext,
} from '../src/renderer/wizard.js';
import type { InstallerConfig } from '../src/shared/types.js';

const validConfig: InstallerConfig = {
  hostname: 'opennova',
  network: { type: 'ethernet' },
  timezone: 'Europe/Amsterdam',
  connectionPath: 'opennova-app',
};

describe('STEPS', () => {
  it('is in the documented order', () => {
    expect(STEPS).toEqual([
      'welcome',
      'config',
      'chooseSd',
      'flash',
      'inject',
      'finish',
    ]);
  });
});

describe('stepIndex', () => {
  it('returns the position of each step', () => {
    expect(stepIndex('welcome')).toBe(0);
    expect(stepIndex('config')).toBe(1);
    expect(stepIndex('chooseSd')).toBe(2);
    expect(stepIndex('flash')).toBe(3);
    expect(stepIndex('inject')).toBe(4);
    expect(stepIndex('finish')).toBe(5);
  });
});

describe('nextStep', () => {
  it('advances one step', () => {
    expect(nextStep('welcome')).toBe('config');
    expect(nextStep('config')).toBe('chooseSd');
    expect(nextStep('chooseSd')).toBe('flash');
    expect(nextStep('flash')).toBe('inject');
    expect(nextStep('inject')).toBe('finish');
  });
  it('clamps at finish', () => {
    expect(nextStep('finish')).toBe('finish');
  });
});

describe('prevStep', () => {
  it('goes back one step', () => {
    expect(prevStep('finish')).toBe('inject');
    expect(prevStep('inject')).toBe('flash');
    expect(prevStep('flash')).toBe('chooseSd');
    expect(prevStep('chooseSd')).toBe('config');
    expect(prevStep('config')).toBe('welcome');
  });
  it('clamps at welcome', () => {
    expect(prevStep('welcome')).toBe('welcome');
  });
});

describe('canAdvance', () => {
  it('welcome always advances', () => {
    expect(canAdvance('welcome', {})).toBe(true);
  });

  it('config blocked without a valid config', () => {
    expect(canAdvance('config', {})).toBe(false);
  });
  it('config advances with a valid config', () => {
    expect(canAdvance('config', { config: validConfig })).toBe(true);
  });

  it('chooseSd blocked without a selected device', () => {
    expect(canAdvance('chooseSd', { eraseConfirmed: true })).toBe(false);
  });
  it('chooseSd blocked without erase confirmation', () => {
    expect(canAdvance('chooseSd', { selectedDevice: '/dev/disk4' })).toBe(false);
  });
  it('chooseSd advances when device selected AND erase confirmed', () => {
    expect(
      canAdvance('chooseSd', {
        selectedDevice: '/dev/disk4',
        eraseConfirmed: true,
      }),
    ).toBe(true);
  });

  it('flash blocked until flashed', () => {
    expect(canAdvance('flash', {})).toBe(false);
    expect(canAdvance('flash', { flashed: true })).toBe(true);
  });

  it('inject blocked until injected', () => {
    expect(canAdvance('inject', {})).toBe(false);
    expect(canAdvance('inject', { injected: true })).toBe(true);
  });

  it('finish does not advance further', () => {
    const ctx: WizardContext = {
      config: validConfig,
      selectedDevice: '/dev/disk4',
      eraseConfirmed: true,
      flashed: true,
      injected: true,
    };
    expect(canAdvance('finish', ctx)).toBe(false);
  });
});
