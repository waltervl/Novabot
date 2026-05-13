import type { EventEmitter } from 'node:events';

/** Minimal WebSocket-like surface — keeps tests free of the `ws` import. */
export interface RelaySocket extends EventEmitter {
  send(data: Buffer | string): void;
  close(): void;
}

export type SessionState = 'IDLE' | 'REQUESTED' | 'ACTIVE' | 'CLOSED';

interface Session {
  state: SessionState;
  agent: RelaySocket | null;
  operator: RelaySocket | null;
  agentMsgListener: ((data: Buffer | string) => void) | null;
  operatorMsgListener: ((data: Buffer | string) => void) | null;
  closeTimer: NodeJS.Timeout | null;
}

const HARD_TIMEOUT_MS = 30 * 60 * 1000;

export class Relay {
  private sessions = new Map<string, Session>();

  private getOrInit(sn: string): Session {
    let s = this.sessions.get(sn);
    if (!s) {
      s = {
        state: 'IDLE', agent: null, operator: null,
        agentMsgListener: null, operatorMsgListener: null,
        closeTimer: null,
      };
      this.sessions.set(sn, s);
    }
    return s;
  }

  getState(sn: string): SessionState {
    return this.sessions.get(sn)?.state ?? 'IDLE';
  }

  attachAgent(sn: string, ws: RelaySocket): void {
    const s = this.getOrInit(sn);
    s.agent = ws;
  }

  attachOperator(sn: string, ws: RelaySocket): void {
    const s = this.getOrInit(sn);
    s.operator = ws;
  }

  /** Mark the agent as registered. Called both by attachAgent and the test
   *  registerAgent shorthand. */
  registerAgent(sn: string): void {
    const s = this.getOrInit(sn);
    if (!s.agent) {
      // For tests that don't attach a real WS.
      s.agent = { send() {}, close() {}, on() { return this; }, off() { return this; }, emit() { return true; } } as any;
    }
  }

  unregisterAgent(sn: string): void {
    const s = this.sessions.get(sn);
    if (!s) return;
    s.agent = null;
    if (s.state === 'REQUESTED' || s.state === 'ACTIVE') {
      this.closeSession(sn, 'agent-disconnect');
    }
  }

  requestSession(sn: string): void {
    const s = this.getOrInit(sn);
    if (!s.agent) throw new Error('no agent registered for sn');
    if (s.state !== 'IDLE' && s.state !== 'CLOSED') {
      throw new Error(`session already in state ${s.state}`);
    }
    s.state = 'REQUESTED';
  }

  approveSession(sn: string): void {
    const s = this.getOrInit(sn);
    if (s.state !== 'REQUESTED') throw new Error('session not requested');
    if (!s.agent || !s.operator) throw new Error('both sides must be attached before approve');
    s.state = 'ACTIVE';
    this.wirePipe(sn, s);
    s.closeTimer = setTimeout(() => this.closeSession(sn, 'hard-timeout'), HARD_TIMEOUT_MS);
  }

  denySession(sn: string): void {
    const s = this.getOrInit(sn);
    if (s.state !== 'REQUESTED') throw new Error('session not requested');
    this.closeSession(sn, 'denied');
  }

  closeSession(sn: string, _reason: string): void {
    const s = this.sessions.get(sn);
    if (!s) return;
    s.state = 'CLOSED';
    if (s.closeTimer) { clearTimeout(s.closeTimer); s.closeTimer = null; }
    if (s.agent && s.agentMsgListener) s.agent.off('message', s.agentMsgListener);
    if (s.operator && s.operatorMsgListener) s.operator.off('message', s.operatorMsgListener);
    s.agentMsgListener = null;
    s.operatorMsgListener = null;
    try { s.agent?.close(); } catch { /* already closed */ }
    try { s.operator?.close(); } catch { /* already closed */ }
  }

  private wirePipe(sn: string, s: Session): void {
    if (!s.agent || !s.operator) return;
    const agent = s.agent;
    const operator = s.operator;
    s.agentMsgListener = (data) => operator.send(data);
    s.operatorMsgListener = (data) => agent.send(data);
    agent.on('message', s.agentMsgListener);
    operator.on('message', s.operatorMsgListener);
  }
}
