import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { readEnabledFlag, writeEnabledFlag } from '../../../services/remoteSupport/agent.js';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(tmpdir(), 'rs-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('enabled flag', () => {
  it('returns false when file is missing', () => {
    expect(readEnabledFlag(path.join(dir, '.remote_support_enabled'))).toBe(false);
  });

  it('returns true when file contains enabled=true', () => {
    const f = path.join(dir, '.remote_support_enabled');
    fs.writeFileSync(f, 'enabled=true\n');
    expect(readEnabledFlag(f)).toBe(true);
  });

  it('returns false for any other content', () => {
    const f = path.join(dir, '.remote_support_enabled');
    fs.writeFileSync(f, 'enabled=false');
    expect(readEnabledFlag(f)).toBe(false);
  });

  it('writeEnabledFlag(true) makes readEnabledFlag return true', () => {
    const f = path.join(dir, '.remote_support_enabled');
    writeEnabledFlag(f, true);
    expect(readEnabledFlag(f)).toBe(true);
  });

  it('writeEnabledFlag(false) deletes the file', () => {
    const f = path.join(dir, '.remote_support_enabled');
    fs.writeFileSync(f, 'enabled=true');
    writeEnabledFlag(f, false);
    expect(fs.existsSync(f)).toBe(false);
  });
});
