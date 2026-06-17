import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Relay } from '../../../services/remoteSupport/relay.js';
import { EventEmitter } from 'node:events';

const SN = 'LFIN2231000656';

describe('relay state machine', () => {
  let relay: Relay;
  let agent: FakeWS;
  let operator: FakeWS;

  beforeEach(() => {
    relay = new Relay();
    agent = new FakeWS();
    operator = new FakeWS();
  });

  it('starts in IDLE with no session', () => {
    expect(relay.getState(SN)).toBe('IDLE');
  });

  it('IDLE → REQUESTED when an operator requests a session', () => {
    relay.attachAgent(SN, agent as any);
    relay.requestSession(SN);
    expect(relay.getState(SN)).toBe('REQUESTED');
  });

  it('REQUESTED → ACTIVE when the agent approves', () => {
    relay.attachAgent(SN, agent as any);
    relay.requestSession(SN);
    relay.attachOperator(SN, operator as any);
    relay.approveSession(SN);
    expect(relay.getState(SN)).toBe('ACTIVE');
  });

  it('REQUESTED → CLOSED when the agent denies', () => {
    relay.attachAgent(SN, agent as any);
    relay.requestSession(SN);
    relay.denySession(SN);
    expect(relay.getState(SN)).toBe('CLOSED');
  });

  it('refuses a request when no agent is registered', () => {
    expect(() => relay.requestSession(SN)).toThrow(/no agent/i);
  });

  it('refuses approve when not REQUESTED', () => {
    relay.attachAgent(SN, agent as any);
    expect(() => relay.approveSession(SN)).toThrow(/not requested/i);
  });

  it('closeSession from any state moves to CLOSED', () => {
    relay.attachAgent(SN, agent as any);
    relay.requestSession(SN);
    relay.attachOperator(SN, operator as any);
    relay.approveSession(SN);
    relay.closeSession(SN, 'timeout');
    expect(relay.getState(SN)).toBe('CLOSED');
  });

  it('keeps a session ACTIVE indefinitely — no hard-timeout auto-close', () => {
    vi.useFakeTimers();
    try {
      relay.attachAgent(SN, agent as any);
      relay.requestSession(SN);
      relay.attachOperator(SN, operator as any);
      relay.approveSession(SN);
      expect(relay.getState(SN)).toBe('ACTIVE');
      // An hour in — well past the old 30-minute hard timeout. A live session
      // must stay open as long as the user keeps the toggle ON; nothing may
      // force-close it out from under the operator.
      vi.advanceTimersByTime(60 * 60 * 1000);
      expect(relay.getState(SN)).toBe('ACTIVE');
    } finally {
      vi.useRealTimers();
    }
  });
});

class FakeWS extends EventEmitter {
  sent: Array<Buffer | string> = [];
  closed = false;
  send(data: Buffer | string) { this.sent.push(data); }
  close() { this.closed = true; this.emit('close'); }
}

describe('relay byte pipe', () => {
  let relay: Relay;
  let agent: FakeWS;
  let operator: FakeWS;

  beforeEach(() => {
    relay = new Relay();
    agent = new FakeWS();
    operator = new FakeWS();
    relay.attachAgent(SN, agent as any);
    relay.requestSession(SN);
    relay.attachOperator(SN, operator as any);
    relay.approveSession(SN);
  });

  it('forwards agent → operator', () => {
    agent.emit('message', Buffer.from('hello'));
    expect(operator.sent).toEqual([Buffer.from('hello')]);
  });

  it('forwards operator → agent', () => {
    operator.emit('message', Buffer.from('ls\n'));
    expect(agent.sent).toEqual([Buffer.from('ls\n')]);
  });

  it('does NOT forward before approval', () => {
    relay.closeSession(SN, 'reset');
    const fresh = new FakeWS();
    relay.attachAgent(SN, fresh as any);
    relay.requestSession(SN);
    // Note: state is REQUESTED, not ACTIVE — no approve yet.
    const op = new FakeWS();
    relay.attachOperator(SN, op as any);
    fresh.emit('message', Buffer.from('should-not-leak'));
    expect(op.sent).toEqual([]);
  });

  it('closes both sockets when session is closed', () => {
    relay.closeSession(SN, 'kill');
    expect(agent.closed).toBe(true);
    expect(operator.closed).toBe(true);
  });

  it('invokes onByteIn / onByteOut hooks for both directions', () => {
    const inBytes: Buffer[] = [];
    const outBytes: Buffer[] = [];
    relay.setSessionHooks(SN, {
      onByteIn: (d) => inBytes.push(Buffer.isBuffer(d) ? d : Buffer.from(d)),
      onByteOut: (d) => outBytes.push(Buffer.isBuffer(d) ? d : Buffer.from(d)),
    });
    operator.emit('message', Buffer.from('ls\n'));
    agent.emit('message', Buffer.from('hello-back'));
    expect(inBytes.map((b) => b.toString('utf8'))).toEqual(['ls\n']);
    expect(outBytes.map((b) => b.toString('utf8'))).toEqual(['hello-back']);
  });
});

describe('relay exec RPC (option B)', () => {
  let relay: Relay;
  let agent: FakeWS;

  beforeEach(() => {
    relay = new Relay();
    agent = new FakeWS();
  });

  it('sends an exec frame and resolves on the matching exec-result', async () => {
    relay.attachAgent(SN, agent as any);
    const p = relay.execOnAgent(SN, 'echo hi', 5000);
    expect(agent.sent.length).toBe(1);
    const frame = JSON.parse(String(agent.sent[0]));
    expect(frame.type).toBe('exec');
    expect(frame.cmd).toBe('echo hi');
    expect(typeof frame.reqId).toBe('string');
    relay.resolveExec(SN, frame.reqId, { stdout: 'hi\n', stderr: '', code: 0 });
    await expect(p).resolves.toEqual({ stdout: 'hi\n', stderr: '', code: 0 });
  });

  it('rejects when no agent is connected', async () => {
    await expect(relay.execOnAgent(SN, 'echo hi', 5000)).rejects.toThrow(/no agent/i);
  });

  it('clamps the timeout into the exec frame (max 60 s)', () => {
    relay.attachAgent(SN, agent as any);
    void relay.execOnAgent(SN, 'x', 999999);
    expect(JSON.parse(String(agent.sent[0])).timeoutMs).toBe(60000);
  });

  it('ignores an exec-result for an unknown reqId (no throw)', () => {
    relay.attachAgent(SN, agent as any);
    expect(() => relay.resolveExec(SN, 'bogus', { stdout: '', stderr: '', code: 0 })).not.toThrow();
  });

  it('drops an exec-result whose SN does not match the issuing SN (cross-talk guard)', async () => {
    relay.attachAgent(SN, agent as any);
    const p = relay.execOnAgent(SN, 'echo hi', 2000);
    const frame = JSON.parse(String(agent.sent[0]));
    // A DIFFERENT agent replies with the same reqId — must be ignored, not
    // allowed to satisfy the operator's exec against SN.
    relay.resolveExec('LFIN-OTHER-9999', frame.reqId, { stdout: 'forged\n', stderr: '', code: 0 });
    // The real agent then replies — this one resolves the promise.
    relay.resolveExec(SN, frame.reqId, { stdout: 'real\n', stderr: '', code: 0 });
    await expect(p).resolves.toEqual({ stdout: 'real\n', stderr: '', code: 0 });
  });

  it('rejects an in-flight exec when the agent disconnects', async () => {
    relay.attachAgent(SN, agent as any);
    const p = relay.execOnAgent(SN, 'sleep 30', 5000);
    relay.unregisterAgent(SN);
    await expect(p).rejects.toThrow(/disconnect/i);
  });
});
