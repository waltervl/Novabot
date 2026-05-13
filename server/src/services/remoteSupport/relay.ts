export type SessionState = 'IDLE' | 'REQUESTED' | 'ACTIVE' | 'CLOSED';

interface Session {
  state: SessionState;
  agentRegistered: boolean;
}

export class Relay {
  private sessions = new Map<string, Session>();

  private getOrInit(sn: string): Session {
    let s = this.sessions.get(sn);
    if (!s) {
      s = { state: 'IDLE', agentRegistered: false };
      this.sessions.set(sn, s);
    }
    return s;
  }

  getState(sn: string): SessionState {
    return this.sessions.get(sn)?.state ?? 'IDLE';
  }

  registerAgent(sn: string): void {
    const s = this.getOrInit(sn);
    s.agentRegistered = true;
  }

  unregisterAgent(sn: string): void {
    const s = this.sessions.get(sn);
    if (!s) return;
    s.agentRegistered = false;
    // An active session without its agent is dead — collapse to CLOSED.
    if (s.state === 'REQUESTED' || s.state === 'ACTIVE') s.state = 'CLOSED';
  }

  requestSession(sn: string): void {
    const s = this.getOrInit(sn);
    if (!s.agentRegistered) throw new Error('no agent registered for sn');
    if (s.state !== 'IDLE' && s.state !== 'CLOSED') {
      throw new Error(`session already in state ${s.state}`);
    }
    s.state = 'REQUESTED';
  }

  approveSession(sn: string): void {
    const s = this.getOrInit(sn);
    if (s.state !== 'REQUESTED') throw new Error('session not requested');
    s.state = 'ACTIVE';
  }

  denySession(sn: string): void {
    const s = this.getOrInit(sn);
    if (s.state !== 'REQUESTED') throw new Error('session not requested');
    s.state = 'CLOSED';
  }

  closeSession(sn: string, _reason: string): void {
    const s = this.sessions.get(sn);
    if (!s) return;
    s.state = 'CLOSED';
  }
}
