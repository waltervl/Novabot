import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const releaseScriptPath = resolve(repoRoot, 'release.sh');
const coverageNativeBuildScriptPath = resolve(repoRoot, 'scripts/build-coverage-native-image.sh');

describe('release script Docker build cache', () => {
  it('keeps buildx cache enabled by default with an explicit no-cache opt-in', () => {
    const script = readFileSync(releaseScriptPath, 'utf8');

    expect(script).toContain('RELEASE_NO_CACHE');
    expect(script).toContain('CACHE_ARGS');
    expect(script).not.toMatch(/--push\s+--no-cache\s+\./);
  });

  it('keeps native coverage planner compilation in an explicit artifact build script', () => {
    const script = readFileSync(coverageNativeBuildScriptPath, 'utf8');

    expect(script).toContain('research/coverage-native/Dockerfile.build');
    expect(script).toContain('rvbcrs/opennova-coverage-native');
    expect(script).toContain('--platform linux/amd64,linux/arm64');
    expect(script).toContain('--push');

    const dockerfile = readFileSync(resolve(repoRoot, 'research/coverage-native/Dockerfile.build'), 'utf8');
    expect(dockerfile).toContain('FROM scratch AS artifact');
    expect(dockerfile).toContain('COPY --from=builder /opt/opennova /opt/opennova');

    const dockerignore = readFileSync(resolve(repoRoot, 'research/coverage-native/.dockerignore'), 'utf8');
    expect(dockerignore).toContain('Dockerfile.build');
  });

  it('runs the native artifact build script with cache enabled', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'coverage-native-build-script-'));
    const logPath = join(tmp, 'docker-args.txt');
    const dockerPath = join(tmp, 'docker');

    writeFileSync(dockerPath, `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(logPath)}\n`);
    chmodSync(dockerPath, 0o755);

    const result = spawnSync(coverageNativeBuildScriptPath, ['testtag'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${tmp}:${process.env.PATH ?? ''}`,
        BUILDER: 'test-builder',
        COVERAGE_NATIVE_IMAGE: 'example/native',
      },
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const args = readFileSync(logPath, 'utf8');
    expect(args).toContain('buildx\n');
    expect(args).toContain('build\n');
    expect(args).toContain('test-builder\n');
    expect(args).toContain('example/native:testtag\n');
    expect(args).toContain('research/coverage-native\n');
    expect(args).not.toContain('--no-cache\n');
  });
});
