import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { readEnabledFlag, writeEnabledFlag, startAgent, type AgentHandle } from '../../../services/remoteSupport/agent.js';
import { EventEmitter } from 'node:events';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(tmpdir(), 'rs-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

class MockWs extends EventEmitter {
  sent: string[] = [];
  readyState = 1; // OPEN
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.emit('close'); }
}

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

describe('agent connection', () => {
  it('sends hello frame with token + SN on connect', () => {
    const sock = new MockWs();
    const handle: AgentHandle = startAgent({
      sn: 'LFIN2231000656',
      token: 'sig.123.abc',
      wsFactory: () => sock as any,
      onRequest: () => {},
    });
    sock.emit('open');
    expect(sock.sent[0]).toBe(JSON.stringify({ type: 'hello', sn: 'LFIN2231000656', token: 'sig.123.abc' }));
    handle.stop();
  });

  it('invokes onRequest when a request frame arrives', () => {
    const sock = new MockWs();
    let requestReceived: { requestId: string } | null = null;
    const handle = startAgent({
      sn: 'LFIN2231000656',
      token: 't',
      wsFactory: () => sock as any,
      onRequest: (req) => { requestReceived = req; },
    });
    sock.emit('open');
    sock.emit('message', JSON.stringify({ type: 'request', requestId: 'r-1' }));
    expect(requestReceived).toEqual({ requestId: 'r-1' });
    handle.stop();
  });

  it('sends approve frame when approveRequest is called', () => {
    const sock = new MockWs();
    let handle: AgentHandle | null = null;
    handle = startAgent({
      sn: 'LFIN2231000656',
      token: 't',
      wsFactory: () => sock as any,
      onRequest: (req) => handle!.approveRequest(req.requestId),
    });
    sock.emit('open');
    sock.emit('message', JSON.stringify({ type: 'request', requestId: 'r-2' }));
    expect(sock.sent.some((m) => m.includes('"type":"approve"') && m.includes('r-2'))).toBe(true);
    handle.stop();
  });
});
