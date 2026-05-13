import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AuditLog, pruneAuditLogs } from '../../../services/remoteSupport/auditLog.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'audit-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('AuditLog', () => {
  it('appends inbound + outbound bytes with direction markers', () => {
    const log = new AuditLog(dir, 'LFIN2231000656');
    log.appendIn('ls -la\n');
    log.appendOut('total 0\n');
    log.close();
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    const content = readFileSync(path.join(dir, files[0]), 'utf8');
    expect(content).toContain('<< ls -la');
    expect(content).toContain('>> total 0');
  });

  it('rotates when over 10 MB', () => {
    const log = new AuditLog(dir, 'LFIN2231000656', { maxBytes: 1024 });
    log.appendIn('x'.repeat(2048));
    log.close();
    const files = readdirSync(dir);
    expect(files.length).toBeGreaterThanOrEqual(2);
  });
});

describe('pruneAuditLogs', () => {
  it('keeps the 50 newest per SN', () => {
    const sn = 'LFIN2231000656';
    for (let i = 0; i < 60; i++) {
      const f = path.join(dir, `${sn}-2026-05-13T${String(i).padStart(2, '0')}-00-00.log`);
      writeFileSync(f, 'x');
    }
    pruneAuditLogs(dir, sn, 50);
    const remaining = readdirSync(dir).filter((f) => f.startsWith(sn));
    expect(remaining).toHaveLength(50);
  });
});
