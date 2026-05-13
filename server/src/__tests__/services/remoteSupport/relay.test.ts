import { describe, it, expect, beforeEach } from 'vitest';
import { Relay } from '../../../services/remoteSupport/relay.js';

const SN = 'LFIN2231000656';

describe('relay state machine', () => {
  let relay: Relay;
  beforeEach(() => { relay = new Relay(); });

  it('starts in IDLE with no session', () => {
    expect(relay.getState(SN)).toBe('IDLE');
  });

  it('IDLE → REQUESTED when an operator requests a session', () => {
    relay.registerAgent(SN);
    relay.requestSession(SN);
    expect(relay.getState(SN)).toBe('REQUESTED');
  });

  it('REQUESTED → ACTIVE when the agent approves', () => {
    relay.registerAgent(SN);
    relay.requestSession(SN);
    relay.approveSession(SN);
    expect(relay.getState(SN)).toBe('ACTIVE');
  });

  it('REQUESTED → CLOSED when the agent denies', () => {
    relay.registerAgent(SN);
    relay.requestSession(SN);
    relay.denySession(SN);
    expect(relay.getState(SN)).toBe('CLOSED');
  });

  it('refuses a request when no agent is registered', () => {
    expect(() => relay.requestSession(SN)).toThrow(/no agent/i);
  });

  it('refuses approve when not REQUESTED', () => {
    relay.registerAgent(SN);
    expect(() => relay.approveSession(SN)).toThrow(/not requested/i);
  });

  it('closeSession from any state moves to CLOSED', () => {
    relay.registerAgent(SN);
    relay.requestSession(SN);
    relay.approveSession(SN);
    relay.closeSession(SN, 'timeout');
    expect(relay.getState(SN)).toBe('CLOSED');
  });
});
