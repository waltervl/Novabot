import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const releaseScriptPath = resolve(repoRoot, 'release.sh');

describe('release script Docker build cache', () => {
  it('keeps buildx cache enabled by default with an explicit no-cache opt-in', () => {
    const script = readFileSync(releaseScriptPath, 'utf8');

    expect(script).toContain('RELEASE_NO_CACHE');
    expect(script).toContain('CACHE_ARGS');
    expect(script).not.toMatch(/--push\s+--no-cache\s+\./);
  });
});
