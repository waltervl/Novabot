import { describe, it, expect } from 'vitest';
import {
  STEPS,
  nextStep,
  prevStep,
  stepIndex,
  canAdvance,
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
    expect(STEPS).toEqual(['welcome', 'config', 'build', 'flash', 'finish']);
  });
});

describe('stepIndex', () => {
  it('returns the position of each step', () => {
    expect(stepIndex('welcome')).toBe(0);
    expect(stepIndex('config')).toBe(1);
    expect(stepIndex('build')).toBe(2);
    expect(stepIndex('flash')).toBe(3);
    expect(stepIndex('finish')).toBe(4);
  });
});

describe('nextStep', () => {
  it('advances one step', () => {
    expect(nextStep('welcome')).toBe('config');
    expect(nextStep('config')).toBe('build');
    expect(nextStep('build')).toBe('flash');
    expect(nextStep('flash')).toBe('finish');
  });
  it('clamps at finish', () => {
    expect(nextStep('finish')).toBe('finish');
  });
});

describe('prevStep', () => {
  it('goes back one step', () => {
    expect(prevStep('finish')).toBe('flash');
    expect(prevStep('flash')).toBe('build');
    expect(prevStep('build')).toBe('config');
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
  it('config advances when the hostname is explicitly free', () => {
    expect(canAdvance('config', { config: validConfig, hostnameTaken: false })).toBe(true);
  });
  it('config is blocked when the hostname clashes on the network', () => {
    expect(canAdvance('config', { config: validConfig, hostnameTaken: true })).toBe(false);
  });

  it('build blocked until the image is built', () => {
    expect(canAdvance('build', {})).toBe(false);
    expect(canAdvance('build', { built: true })).toBe(true);
  });

  it('flash blocked until the card is flashed', () => {
    expect(canAdvance('flash', {})).toBe(false);
    expect(canAdvance('flash', { flashed: true })).toBe(true);
  });

  it('finish does not advance further', () => {
    const ctx: WizardContext = {
      config: validConfig,
      built: true,
      outputPath: '/Users/me/Downloads/opennova.img',
      selectedDevice: '/dev/disk4',
      flashed: true,
    };
    expect(canAdvance('finish', ctx)).toBe(false);
  });
});
