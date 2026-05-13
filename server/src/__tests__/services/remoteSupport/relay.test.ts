import { describe, it, expect, beforeEach } from 'vitest';
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
});
