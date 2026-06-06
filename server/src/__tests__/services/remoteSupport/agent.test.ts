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

  it('routes non-JSON frames into onRawBytes (not onRequest)', () => {
    const sock = new MockWs();
    let request: { requestId: string } | null = null;
    const raw: Buffer[] = [];
    const handle = startAgent({
      sn: 'LFIN2231000656',
      token: 't',
      wsFactory: () => sock as any,
      onRequest: (r) => { request = r; },
      onRawBytes: (b) => { raw.push(b); },
    });
    sock.emit('open');
    sock.emit('message', Buffer.from('ls\n'));
    expect(request).toBeNull();
    expect(raw.length).toBe(1);
    expect(raw[0].toString('utf8')).toBe('ls\n');
    handle.stop();
  });

  it('runs onExec for an exec frame and replies with exec-result', async () => {
    const sock = new MockWs();
    let seenCmd = '';
    const handle = startAgent({
      sn: 'LFIN2231000656',
      token: 't',
      wsFactory: () => sock as any,
      onRequest: () => {},
      onExec: async (req) => { seenCmd = req.cmd; return { stdout: 'hi\n', stderr: '', code: 0 }; },
    });
    sock.emit('open');
    sock.emit('message', JSON.stringify({ type: 'exec', reqId: 'e-1', cmd: 'echo hi' }));
    await new Promise((r) => setTimeout(r, 10)); // let the async onExec + reply settle
    expect(seenCmd).toBe('echo hi');
    const reply = sock.sent.find((m) => m.includes('"type":"exec-result"'));
    expect(reply).toBeTruthy();
    expect(JSON.parse(reply!)).toMatchObject({ type: 'exec-result', reqId: 'e-1', stdout: 'hi\n', code: 0 });
    handle.stop();
  });
});

describe('approve/deny pending wiring', () => {
  it('approvePending throws without a matching pending request', async () => {
    const mod = await import('../../../services/remoteSupport/agent.js');
    mod._setPendingForTest(null);
    expect(() => mod.approvePending('whatever')).toThrow(/no matching/i);
  });

  it('denyPending throws without a matching pending request', async () => {
    const mod = await import('../../../services/remoteSupport/agent.js');
    mod._setPendingForTest(null);
    expect(() => mod.denyPending('whatever')).toThrow(/no matching/i);
  });

  it('approvePending wires pty + sends approve frame', async () => {
    const mod = await import('../../../services/remoteSupport/agent.js');
    const sock = new MockWs();
    // Re-use startAgent to build a real handle so the approve frame goes
    // out on the wire we observe.
    const handle = mod.startAgent({
      sn: 'LFIN2231000656',
      token: 't',
      wsFactory: () => sock as any,
      onRequest: () => {},
    });
    mod._setBootstrapHandleForTest(handle);
    mod._setPendingForTest({ requestId: 'r-x', since: Date.now() });
    // Stub the pty so we don't fork bash in CI.
    let ptyWritten: (Buffer | string)[] = [];
    let ptyClosed = false;
    mod._setActivePtyForTest({
      write(d) { ptyWritten.push(d); },
      resize() {},
      close() { ptyClosed = true; },
    });

    mod.approvePending('r-x');
    expect(sock.sent.some((m) => m.includes('"type":"approve"') && m.includes('r-x'))).toBe(true);
    expect(mod.getPendingRequest()).toBeNull();

    // killActiveSession should close the pty.
    mod.killActiveSession();
    expect(ptyClosed).toBe(true);
    handle.stop();
    mod._setBootstrapHandleForTest(null);
  });
});

describe('pty session', () => {
  it.skipIf(process.env.CI === 'true')('runs a command and captures stdout', async () => {
    const { spawnPtySession } = await import('../../../services/remoteSupport/agent.js');
    const chunks: string[] = [];
    const session = spawnPtySession({
      cols: 80,
      rows: 24,
      onOutput: (data) => chunks.push(data.toString('utf8')),
    });
    session.write('echo hello-pty\n');
    await new Promise((r) => setTimeout(r, 250));
    session.close();
    expect(chunks.join('')).toContain('hello-pty');
  });
});
