import type { EventEmitter } from 'node:events';

/** Minimal WebSocket-like surface — keeps tests free of the `ws` import. */
export interface RelaySocket extends EventEmitter {
  send(data: Buffer | string): void;
  close(): void;
}

export type SessionState = 'IDLE' | 'REQUESTED' | 'ACTIVE' | 'CLOSED';

/** Hooks invoked synchronously inside wirePipe before forwarding bytes. The
 *  audit log binds onByteIn (operator → agent) and onByteOut (agent →
 *  operator) so every keystroke crossing the relay is recorded — without
 *  this hook only one direction was logged and the "every keystroke logged"
 *  promise to the user was false. */
export interface SessionHooks {
  onByteIn?: (data: Buffer | string) => void;
  onByteOut?: (data: Buffer | string) => void;
}

interface Session {
  state: SessionState;
  agent: RelaySocket | null;
  operator: RelaySocket | null;
  agentMsgListener: ((data: Buffer | string) => void) | null;
  operatorMsgListener: ((data: Buffer | string) => void) | null;
  closeTimer: NodeJS.Timeout | null;
  hooks: SessionHooks;
  /** Rolling transcript of bytes in both directions, capped at BUFFER_MAX.
   *  Exposed via getSessionBuffer for read-only observers (Claude / curl). */
  buffer: Buffer[];
  bufferBytes: number;
  /** Monotonic byte counter — never decreases. Observers poll with
   *  ?since=<lastSeen> and get only newer bytes. */
  totalBytes: number;
  startedAt: number | null;
}

const HARD_TIMEOUT_MS = 30 * 60 * 1000;
const BUFFER_MAX = 65536;

export class Relay {
  private sessions = new Map<string, Session>();

  private getOrInit(sn: string): Session {
    let s = this.sessions.get(sn);
    if (!s) {
      s = {
        state: 'IDLE', agent: null, operator: null,
        agentMsgListener: null, operatorMsgListener: null,
        closeTimer: null,
        hooks: {},
        buffer: [],
        bufferBytes: 0,
        totalBytes: 0,
        startedAt: null,
      };
      this.sessions.set(sn, s);
    }
    return s;
  }

  private appendBuffer(s: Session, data: Buffer | string): void {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    if (chunk.length === 0) return;
    s.buffer.push(chunk);
    s.bufferBytes += chunk.length;
    s.totalBytes += chunk.length;
    while (s.bufferBytes > BUFFER_MAX && s.buffer.length > 1) {
      const dropped = s.buffer.shift()!;
      s.bufferBytes -= dropped.length;
    }
  }

  listActiveSessions(): Array<{ sn: string; startedAt: number | null; totalBytes: number }> {
    const out: Array<{ sn: string; startedAt: number | null; totalBytes: number }> = [];
    for (const [sn, s] of this.sessions) {
      if (s.state === 'ACTIVE') {
        out.push({ sn, startedAt: s.startedAt, totalBytes: s.totalBytes });
      }
    }
    return out;
  }

  getSessionBuffer(sn: string, since = 0): { data: string; totalBytes: number; truncated: boolean; state: SessionState } {
    const s = this.sessions.get(sn);
    if (!s) return { data: '', totalBytes: 0, truncated: false, state: 'IDLE' };
    const full = Buffer.concat(s.buffer);
    const firstAvailable = s.totalBytes - full.length;
    let truncated = false;
    let slice: Buffer;
    if (since <= firstAvailable) {
      slice = full;
      truncated = since > 0 && since < firstAvailable;
    } else if (since >= s.totalBytes) {
      slice = Buffer.alloc(0);
    } else {
      slice = full.subarray(since - firstAvailable);
    }
    return { data: slice.toString('utf8'), totalBytes: s.totalBytes, truncated, state: s.state };
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
    s.startedAt = Date.now();
    s.buffer = [];
    s.bufferBytes = 0;
    s.totalBytes = 0;
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
    s.hooks = {};
    try { s.agent?.close(); } catch { /* already closed */ }
    try { s.operator?.close(); } catch { /* already closed */ }
  }

  /** Install audit / observability hooks for a session. Called from the
   *  agent WS message handler when {type:'approve'} arrives so byte
   *  forwarding starts logging both directions, not just agent→operator. */
  setSessionHooks(sn: string, hooks: SessionHooks): void {
    const s = this.getOrInit(sn);
    s.hooks = { ...s.hooks, ...hooks };
  }

  /** Drop any installed hooks — called on session close so a subsequent
   *  session does not inherit a stale audit log binding. */
  clearSessionHooks(sn: string): void {
    const s = this.sessions.get(sn);
    if (s) s.hooks = {};
  }

  private wirePipe(sn: string, s: Session): void {
    if (!s.agent || !s.operator) return;
    const agent = s.agent;
    const operator = s.operator;
    s.agentMsgListener = (data) => {
      try { s.hooks.onByteOut?.(data); } catch { /* hook failure must not break the pipe */ }
      try { this.appendBuffer(s, data); } catch { /* never break pipe on buffer issue */ }
      operator.send(data);
    };
    s.operatorMsgListener = (data) => {
      try { s.hooks.onByteIn?.(data); } catch { /* hook failure must not break the pipe */ }
      try { this.appendBuffer(s, data); } catch { /* never break pipe on buffer issue */ }
      agent.send(data);
    };
    agent.on('message', s.agentMsgListener);
    operator.on('message', s.operatorMsgListener);
  }
}
