import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const entrypointPath = resolve(__dirname, '../../..', 'docker-entrypoint.sh');

function readTrapLines(): string[] {
  return readFileSync(entrypointPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('trap '));
}

describe('Docker entrypoint', () => {
  it('uses POSIX signal names in shell traps', () => {
    const traps = readTrapLines();

    expect(traps.length).toBeGreaterThan(0);
    for (const trap of traps) {
      expect(trap).not.toMatch(/\bSIG(?:TERM|INT)\b/);
    }
    expect(traps.some((trap) => /\bTERM\b/.test(trap) && /\bINT\b/.test(trap))).toBe(true);
  });
});
