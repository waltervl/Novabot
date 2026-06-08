import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeBootFiles } from '../src/main/bootInject.js';

const gen = { firstrunSh: '#!/bin/bash\necho hi\n', envFile: 'TZ=x\n', composeYml: 'services: {}\n', cmdlineAppend: ' systemd.run=/boot/firstrun.sh' };

describe('writeBootFiles', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'bootfs-')); writeFileSync(join(dir, 'cmdline.txt'), 'console=serial0 root=PARTUUID=xx rootwait'); });

  it('writes firstrun.sh executable + ssh + appends cmdline once', () => {
    writeBootFiles(dir, gen);
    expect(existsSync(join(dir, 'firstrun.sh'))).toBe(true);
    expect(statSync(join(dir, 'firstrun.sh')).mode & 0o111).toBeTruthy();
    expect(existsSync(join(dir, 'ssh'))).toBe(true);
    const c1 = readFileSync(join(dir, 'cmdline.txt'), 'utf8');
    writeBootFiles(dir, gen); // idempotent
    expect(readFileSync(join(dir, 'cmdline.txt'), 'utf8')).toBe(c1);
    expect((c1.match(/systemd.run=\/boot\/firstrun.sh/g) || []).length).toBe(1);
  });

  it('throws a clear error if cmdline.txt is missing (wrong directory picked)', () => {
    const empty = mkdtempSync(join(tmpdir(), 'notboot-'));
    expect(() => writeBootFiles(empty, gen)).toThrow(/cmdline\.txt/i);
  });
});
