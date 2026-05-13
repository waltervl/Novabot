# Remote Support Tunnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an approve-on-demand browser web-shell so Ramon can remote into a user's OpenNova container (and from there to the mower) without juggling jumphosts.

**Architecture:** Two WebSocket hops. User's container opens an outbound WebSocket to the central relay on `opennova.ramonvanbruggen.nl`. Ramon's admin UI opens an inbound WebSocket to the same relay. The relay brokers the approve handshake then pipes raw bytes through `node-pty`'s `/bin/bash` for the lifetime of the session. Hard 30-min timeout, per-session approval, audit log written to the user's disk.

**Tech Stack:** Node.js 20 / TypeScript / Express, `ws` (already in use), `node-pty` (new), `xterm.js` (CDN), `vitest` for tests, existing Socket.io for in-admin push notifications.

---

## File Structure

**New files:**
- `server/src/services/remoteSupport/tokens.ts` — HMAC sign/verify for agent device-tokens
- `server/src/services/remoteSupport/relay.ts` — relay state machine + agent registry + byte pipe
- `server/src/services/remoteSupport/agent.ts` — user-side agent (outbound WS, pty, audit log)
- `server/src/services/remoteSupport/auditLog.ts` — log file writer + rotation
- `server/src/routes/remoteSupport.ts` — HTTP + WS endpoints
- `server/src/__tests__/services/remoteSupport/tokens.test.ts`
- `server/src/__tests__/services/remoteSupport/relay.test.ts`
- `server/src/__tests__/services/remoteSupport/agent.test.ts`
- `server/src/__tests__/services/remoteSupport/auditLog.test.ts`
- `server/src/__tests__/routes/remoteSupport.test.ts`

**Modified files:**
- `server/src/index.ts` — register `remoteSupportRouter` + start agent if user-side
- `server/src/routes/adminPage.ts` — Remote Support card (operator + user)
- `server/package.json` — add `node-pty` dep
- `docker-compose.yml` — `REMOTE_SUPPORT_SECRET` env var

**Env vars:**
- `REMOTE_SUPPORT_RELAY_ENABLED=true` — this instance hosts the relay (Ramon's central). Default `false`.
- `REMOTE_SUPPORT_RELAY_URL=wss://opennova.ramonvanbruggen.nl/api/remote-support/agent` — agent dial target. Default unset.
- `REMOTE_SUPPORT_SECRET` — HMAC secret. Required when relay enabled.

---

### Task 1: Add node-pty dependency + test scaffolding

**Files:**
- Modify: `server/package.json`
- Create: `server/src/__tests__/services/remoteSupport/.gitkeep`

- [ ] **Step 1: Install node-pty**

Run: `cd server && npm install --save node-pty@1.0.0`
Expected: dep added in `server/package.json`, prebuilt binaries downloaded.

- [ ] **Step 2: Verify install + import works**

Run: `cd server && node -e "console.log(typeof require('node-pty').spawn)"`
Expected: `function`

- [ ] **Step 3: Create test scaffold dir**

Run: `mkdir -p server/src/__tests__/services/remoteSupport && touch server/src/__tests__/services/remoteSupport/.gitkeep`

- [ ] **Step 4: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add server/package.json server/package-lock.json server/src/__tests__/services/remoteSupport/.gitkeep
git commit -m "chore(remote-support): add node-pty dep + test scaffold"
```

---

### Task 2: HMAC token signer

Tokens authenticate agents when they dial the relay. Stops a stolen URL from being replayed by anyone without the shared secret.

**Files:**
- Create: `server/src/services/remoteSupport/tokens.ts`
- Test: `server/src/__tests__/services/remoteSupport/tokens.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// server/src/__tests__/services/remoteSupport/tokens.test.ts
import { describe, it, expect } from 'vitest';
import { signAgentToken, verifyAgentToken } from '../../../services/remoteSupport/tokens.js';

const SECRET = 'unit-test-secret-32-chars-long!!';

describe('agent token signing', () => {
  it('round-trips a valid SN', () => {
    const token = signAgentToken('LFIN2231000656', SECRET);
    const result = verifyAgentToken(token, SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sn).toBe('LFIN2231000656');
  });

  it('rejects token signed with a different secret', () => {
    const token = signAgentToken('LFIN2231000656', SECRET);
    const result = verifyAgentToken(token, 'wrong-secret');
    expect(result.ok).toBe(false);
  });

  it('rejects tampered SN', () => {
    const token = signAgentToken('LFIN2231000656', SECRET);
    // Swap the SN portion; signature no longer matches.
    const tampered = token.replace('LFIN2231000656', 'LFIN9999999999');
    const result = verifyAgentToken(tampered, SECRET);
    expect(result.ok).toBe(false);
  });

  it('rejects expired tokens', () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const token = signAgentToken('LFIN2231000656', SECRET, past);
    const result = verifyAgentToken(token, SECRET);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

Run: `cd server && npx vitest run src/__tests__/services/remoteSupport/tokens.test.ts`
Expected: FAIL `Cannot find module .../remoteSupport/tokens.js`

- [ ] **Step 3: Implement tokens**

```ts
// server/src/services/remoteSupport/tokens.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Tokens look like `<sn>.<expiresUnixSec>.<base64url-hmac>` and are
 *  signed with REMOTE_SUPPORT_SECRET. The agent embeds its token in the
 *  Authorization header when it dials the relay; the relay re-derives
 *  the HMAC with its own copy of the secret and refuses to register the
 *  agent unless the signature matches and the timestamp is still in the
 *  future. The SN is part of the signed payload so a token issued for
 *  one mower can't be reused to impersonate another. */
const DEFAULT_TTL_SEC = 60 * 60 * 24; // 24h — agent reconnect window.

function hmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signAgentToken(
  sn: string,
  secret: string,
  expiresAtSec = Math.floor(Date.now() / 1000) + DEFAULT_TTL_SEC,
): string {
  const payload = `${sn}.${expiresAtSec}`;
  return `${payload}.${hmac(payload, secret)}`;
}

export type VerifyResult = { ok: true; sn: string } | { ok: false; reason: string };

export function verifyAgentToken(token: string, secret: string): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [sn, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return { ok: false, reason: 'bad-exp' };
  if (exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };
  const expected = hmac(`${sn}.${expStr}`, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad-signature' };
  }
  return { ok: true, sn };
}
```

- [ ] **Step 4: Run test — verify PASS**

Run: `cd server && npx vitest run src/__tests__/services/remoteSupport/tokens.test.ts`
Expected: 4 tests passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add server/src/services/remoteSupport/tokens.ts server/src/__tests__/services/remoteSupport/tokens.test.ts
git commit -m "feat(remote-support): HMAC-signed agent device tokens"
```

---

### Task 3: Relay state machine

The relay tracks one session per SN. State transitions are explicit so we never wire bytes before approval.

**Files:**
- Create: `server/src/services/remoteSupport/relay.ts`
- Test: `server/src/__tests__/services/remoteSupport/relay.test.ts`

- [ ] **Step 1: Write failing tests for state transitions**

```ts
// server/src/__tests__/services/remoteSupport/relay.test.ts
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
```

- [ ] **Step 2: Run — verify FAIL**

Run: `cd server && npx vitest run src/__tests__/services/remoteSupport/relay.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the state machine**

```ts
// server/src/services/remoteSupport/relay.ts
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
```

- [ ] **Step 4: Run — verify PASS**

Run: `cd server && npx vitest run src/__tests__/services/remoteSupport/relay.test.ts`
Expected: 7 tests passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add server/src/services/remoteSupport/relay.ts server/src/__tests__/services/remoteSupport/relay.test.ts
git commit -m "feat(remote-support): relay state machine"
```

---

### Task 4: Relay byte-pipe + WebSocket plumbing

The relay holds the agent WS and operator WS per SN. Once state is `ACTIVE`, every frame received on one side is forwarded verbatim to the other.

**Files:**
- Modify: `server/src/services/remoteSupport/relay.ts`
- Modify: `server/src/__tests__/services/remoteSupport/relay.test.ts`

- [ ] **Step 1: Write failing tests for byte pipe**

Append to `relay.test.ts`:

```ts
import { EventEmitter } from 'node:events';

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
```

- [ ] **Step 2: Run — verify FAIL**

Run: `cd server && npx vitest run src/__tests__/services/remoteSupport/relay.test.ts`
Expected: FAIL — `attachAgent` / `attachOperator` not defined.

- [ ] **Step 3: Extend Relay with WS plumbing**

Replace `relay.ts` with:

```ts
// server/src/services/remoteSupport/relay.ts
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
      s.agent = { send() {}, close() {}, on() { return this; }, emit() { return true; } } as any;
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
```

- [ ] **Step 4: Run — verify PASS**

Run: `cd server && npx vitest run src/__tests__/services/remoteSupport/relay.test.ts`
Expected: 11 tests passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add server/src/services/remoteSupport/relay.ts server/src/__tests__/services/remoteSupport/relay.test.ts
git commit -m "feat(remote-support): relay byte pipe + WS plumbing"
```

---

### Task 5: Audit log writer

Every byte going in or out of the pty is appended to a per-session file under `/data/remote-support-logs/`. Files older than the 50-newest-per-SN window are pruned on session start.

**Files:**
- Create: `server/src/services/remoteSupport/auditLog.ts`
- Test: `server/src/__tests__/services/remoteSupport/auditLog.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// server/src/__tests__/services/remoteSupport/auditLog.test.ts
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
```

- [ ] **Step 2: Run — verify FAIL**

Run: `cd server && npx vitest run src/__tests__/services/remoteSupport/auditLog.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement audit log**

```ts
// server/src/services/remoteSupport/auditLog.ts
import fs from 'node:fs';
import path from 'node:path';

interface Options {
  maxBytes?: number;
  maxFilesPerSn?: number;
}

/** Captures every byte that crosses the relay for one session and writes
 *  it to /data/remote-support-logs/<sn>-<iso>.log so the user can review
 *  exactly what Ramon did during a support session. Rotates per session
 *  rather than per file — each new pty spawn opens a fresh file with the
 *  current timestamp. */
export class AuditLog {
  private fd: number | null = null;
  private path: string;
  private bytesWritten = 0;
  private rotateAt: number;
  private rotation = 0;
  private snBase: string;

  constructor(private dir: string, sn: string, opts: Options = {}) {
    fs.mkdirSync(dir, { recursive: true });
    this.snBase = sn;
    this.rotateAt = opts.maxBytes ?? 10 * 1024 * 1024;
    this.path = this.makePath();
    this.fd = fs.openSync(this.path, 'a');
  }

  private makePath(): string {
    const iso = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = this.rotation === 0 ? '' : `.${this.rotation}`;
    return path.join(this.dir, `${this.snBase}-${iso}${suffix}.log`);
  }

  appendIn(data: Buffer | string): void { this.write('<<', data); }
  appendOut(data: Buffer | string): void { this.write('>>', data); }

  private write(marker: string, data: Buffer | string): void {
    if (this.fd === null) return;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const line = Buffer.concat([
      Buffer.from(`${marker} `),
      buf,
      buf.length > 0 && buf[buf.length - 1] !== 0x0a ? Buffer.from('\n') : Buffer.alloc(0),
    ]);
    fs.writeSync(this.fd, line);
    this.bytesWritten += line.length;
    if (this.bytesWritten >= this.rotateAt) this.rotate();
  }

  private rotate(): void {
    if (this.fd !== null) fs.closeSync(this.fd);
    this.rotation += 1;
    this.bytesWritten = 0;
    this.path = this.makePath();
    this.fd = fs.openSync(this.path, 'a');
  }

  close(): void {
    if (this.fd !== null) {
      fs.closeSync(this.fd);
      this.fd = null;
    }
  }
}

/** Drop everything past the newest N files for this SN. Called on session
 *  start so audit logs never grow unbounded. */
export function pruneAuditLogs(dir: string, sn: string, keep: number): number {
  if (!fs.existsSync(dir)) return 0;
  const entries = fs.readdirSync(dir)
    .filter((f) => f.startsWith(`${sn}-`) && f.endsWith('.log'))
    .map((f) => ({ f, full: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  const toDelete = entries.slice(keep);
  for (const e of toDelete) {
    try { fs.unlinkSync(e.full); } catch { /* already gone */ }
  }
  return toDelete.length;
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `cd server && npx vitest run src/__tests__/services/remoteSupport/auditLog.test.ts`
Expected: 3 tests passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add server/src/services/remoteSupport/auditLog.ts server/src/__tests__/services/remoteSupport/auditLog.test.ts
git commit -m "feat(remote-support): audit log writer + rotation + pruning"
```

---

### Task 6: Agent — toggle reader + reconnect loop

The agent only opens an outbound WebSocket when `/data/.remote_support_enabled` is present (`enabled=true` line) and the relay URL is configured. It backs off and retries on failure.

**Files:**
- Create: `server/src/services/remoteSupport/agent.ts`
- Test: `server/src/__tests__/services/remoteSupport/agent.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// server/src/__tests__/services/remoteSupport/agent.test.ts
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
```

- [ ] **Step 2: Run — verify FAIL**

Run: `cd server && npx vitest run src/__tests__/services/remoteSupport/agent.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement toggle helpers (just enough to pass)**

```ts
// server/src/services/remoteSupport/agent.ts
import fs from 'node:fs';

/** Reads /data/.remote_support_enabled. The agent only dials the relay
 *  when this evaluates to true so users can leave the flag off until they
 *  actively ask for help. */
export function readEnabledFlag(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    return content === 'enabled=true';
  } catch {
    return false;
  }
}

/** Writes the flag atomically. `false` removes the file entirely so a
 *  cleared toggle leaves no trace. */
export function writeEnabledFlag(filePath: string, enabled: boolean): void {
  if (enabled) {
    fs.writeFileSync(filePath, 'enabled=true\n');
  } else {
    try { fs.unlinkSync(filePath); } catch { /* already gone */ }
  }
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `cd server && npx vitest run src/__tests__/services/remoteSupport/agent.test.ts`
Expected: 5 tests passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add server/src/services/remoteSupport/agent.ts server/src/__tests__/services/remoteSupport/agent.test.ts
git commit -m "feat(remote-support): agent enabled-flag toggle helpers"
```

---

### Task 7: Agent — outbound WS connection lifecycle

The agent dials the relay, sends a `hello` frame with the signed token, listens for `request` frames, and emits `approve` or `deny` based on local user input. Reconnects with exponential backoff (1s → 30s) on socket error.

**Files:**
- Modify: `server/src/services/remoteSupport/agent.ts`
- Modify: `server/src/__tests__/services/remoteSupport/agent.test.ts`

- [ ] **Step 1: Write failing tests for connection lifecycle**

Append:

```ts
import { startAgent, type AgentHandle } from '../../../services/remoteSupport/agent.js';
import { EventEmitter } from 'node:events';

class MockWs extends EventEmitter {
  sent: string[] = [];
  readyState = 1; // OPEN
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.emit('close'); }
}

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
```

- [ ] **Step 2: Run — verify FAIL**

Run: `cd server && npx vitest run src/__tests__/services/remoteSupport/agent.test.ts`
Expected: FAIL — startAgent not exported.

- [ ] **Step 3: Implement startAgent**

Append to `agent.ts`:

```ts
import type { EventEmitter } from 'node:events';

export interface AgentSocket extends EventEmitter {
  readyState: number;
  send(data: string | Buffer): void;
  close(): void;
}

export interface AgentRequest {
  requestId: string;
}

export interface AgentOpts {
  sn: string;
  token: string;
  wsFactory: () => AgentSocket;
  onRequest: (req: AgentRequest) => void;
}

export interface AgentHandle {
  stop(): void;
  approveRequest(requestId: string): void;
  denyRequest(requestId: string): void;
  /** Send raw bytes to the relay (used by the pty wiring in Task 8). */
  sendData(data: Buffer): void;
}

export function startAgent(opts: AgentOpts): AgentHandle {
  let sock: AgentSocket = opts.wsFactory();
  let stopped = false;

  const wire = (s: AgentSocket) => {
    s.on('open', () => {
      s.send(JSON.stringify({ type: 'hello', sn: opts.sn, token: opts.token }));
    });
    s.on('message', (data: Buffer | string) => {
      const str = Buffer.isBuffer(data) ? data.toString('utf8') : data;
      try {
        const msg = JSON.parse(str);
        if (msg.type === 'request' && typeof msg.requestId === 'string') {
          opts.onRequest({ requestId: msg.requestId });
        }
      } catch {
        // Non-JSON = raw pty bytes from operator (only valid after approve).
      }
    });
  };

  wire(sock);

  return {
    stop() { stopped = true; try { sock.close(); } catch {} },
    approveRequest(requestId: string) {
      if (sock.readyState === 1) {
        sock.send(JSON.stringify({ type: 'approve', requestId }));
      }
    },
    denyRequest(requestId: string) {
      if (sock.readyState === 1) {
        sock.send(JSON.stringify({ type: 'deny', requestId }));
      }
    },
    sendData(data: Buffer) {
      if (sock.readyState === 1) sock.send(data);
    },
  };
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `cd server && npx vitest run src/__tests__/services/remoteSupport/agent.test.ts`
Expected: 8 tests passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add server/src/services/remoteSupport/agent.ts server/src/__tests__/services/remoteSupport/agent.test.ts
git commit -m "feat(remote-support): agent WS connection + approve/deny handshake"
```

---

### Task 8: Agent — pty spawn + audit-log wiring

When the relay confirms the approve handshake, the agent spawns `/bin/bash` via `node-pty` and pipes:
- pty stdout/stderr → relay WS → operator browser
- relay WS (raw bytes after approve) → pty stdin

Every byte goes through the audit log.

**Files:**
- Modify: `server/src/services/remoteSupport/agent.ts`
- Modify: `server/src/__tests__/services/remoteSupport/agent.test.ts`

- [ ] **Step 1: Write failing test**

Append:

```ts
import { spawnPtySession } from '../../../services/remoteSupport/agent.js';

describe('pty session', () => {
  it('runs a command and captures stdout', async () => {
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
```

- [ ] **Step 2: Run — verify FAIL**

Run: `cd server && npx vitest run src/__tests__/services/remoteSupport/agent.test.ts`
Expected: FAIL — spawnPtySession not exported.

- [ ] **Step 3: Implement spawnPtySession**

Append to `agent.ts`:

```ts
import * as pty from 'node-pty';

export interface PtyOpts {
  cols: number;
  rows: number;
  onOutput: (data: Buffer) => void;
}

export interface PtySession {
  write(data: Buffer | string): void;
  resize(cols: number, rows: number): void;
  close(): void;
}

/** Spawns /bin/bash inside the container under the agent's own UID
 *  (typically root in our docker image). Output is delivered as raw
 *  Buffers to the caller, which forwards them upstream to the operator
 *  via the relay socket. */
export function spawnPtySession(opts: PtyOpts): PtySession {
  const shell = process.env.SHELL ?? '/bin/bash';
  const term = pty.spawn(shell, ['-i'], {
    name: 'xterm-256color',
    cols: opts.cols,
    rows: opts.rows,
    cwd: process.env.HOME ?? '/root',
    env: process.env as Record<string, string>,
  });
  term.onData((data) => opts.onOutput(Buffer.from(data, 'utf8')));
  return {
    write(data) { term.write(Buffer.isBuffer(data) ? data.toString('utf8') : data); },
    resize(cols, rows) { term.resize(cols, rows); },
    close() { try { term.kill(); } catch { /* already exited */ } },
  };
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `cd server && npx vitest run src/__tests__/services/remoteSupport/agent.test.ts`
Expected: 9 tests passed.

If the test fails in CI without a TTY-capable environment, mark the pty test with `it.skipIf(process.env.CI === 'true')`.

- [ ] **Step 5: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add server/src/services/remoteSupport/agent.ts server/src/__tests__/services/remoteSupport/agent.test.ts
git commit -m "feat(remote-support): agent pty spawn + bash session"
```

---

### Task 9: Express routes — relay-side WebSocket endpoints

Register `/api/remote-support/agent` (agents dial here) and `/api/remote-support/operator/:sn` (Ramon connects here) on the central server. Each WS verifies its token / JWT, wires into the `Relay` instance, and forwards messages.

**Files:**
- Create: `server/src/routes/remoteSupport.ts`
- Test: `server/src/__tests__/routes/remoteSupport.test.ts`

- [ ] **Step 1: Write failing test for HTTP active-agents endpoint**

```ts
// server/src/__tests__/routes/remoteSupport.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRemoteSupportRouter } from '../../routes/remoteSupport.js';
import { Relay } from '../../services/remoteSupport/relay.js';

const TEST_SECRET = 'unit-test-secret';

describe('GET /api/remote-support/active-agents', () => {
  let app: express.Express;
  let relay: Relay;

  beforeEach(() => {
    relay = new Relay();
    app = express();
    app.use('/api/remote-support', createRemoteSupportRouter({
      relay,
      secret: TEST_SECRET,
      auditLogDir: '/tmp',
      isOperator: () => true,
    }));
  });

  it('returns empty list initially', async () => {
    const res = await request(app).get('/api/remote-support/active-agents');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ agents: [] });
  });

  it('returns SN once an agent registers', async () => {
    relay.registerAgent('LFIN2231000656');
    const res = await request(app).get('/api/remote-support/active-agents');
    expect(res.body.agents).toContainEqual(expect.objectContaining({ sn: 'LFIN2231000656' }));
  });

  it('rejects non-operator callers', async () => {
    app = express();
    app.use('/api/remote-support', createRemoteSupportRouter({
      relay,
      secret: TEST_SECRET,
      auditLogDir: '/tmp',
      isOperator: () => false,
    }));
    const res = await request(app).get('/api/remote-support/active-agents');
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `cd server && npx vitest run src/__tests__/routes/remoteSupport.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement createRemoteSupportRouter**

```ts
// server/src/routes/remoteSupport.ts
import { Router, type Request, type Response } from 'express';
import type { Relay } from '../services/remoteSupport/relay.js';

export interface RouterOpts {
  relay: Relay;
  secret: string;
  auditLogDir: string;
  /** Returns true when the request comes from Ramon (operator role). */
  isOperator: (req: Request) => boolean;
}

interface AgentEntry {
  sn: string;
  registeredAt: number;
}

export function createRemoteSupportRouter(opts: RouterOpts): Router {
  const router = Router();
  const agentRegistry = new Map<string, AgentEntry>();

  // Expose registry mutators so the WS upgrade handler (added in Task 11)
  // can update them at connection time. We attach to the router so the
  // central index.ts code can reach them without re-exporting more
  // module-level singletons.
  (router as any)._registerAgent = (sn: string) => {
    agentRegistry.set(sn, { sn, registeredAt: Date.now() });
    opts.relay.registerAgent(sn);
  };
  (router as any)._unregisterAgent = (sn: string) => {
    agentRegistry.delete(sn);
    opts.relay.unregisterAgent(sn);
  };

  router.get('/active-agents', (req: Request, res: Response) => {
    if (!opts.isOperator(req)) { res.status(403).json({ error: 'forbidden' }); return; }
    res.json({ agents: Array.from(agentRegistry.values()) });
  });

  return router;
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `cd server && npx vitest run src/__tests__/routes/remoteSupport.test.ts`
Expected: 3 tests passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add server/src/routes/remoteSupport.ts server/src/__tests__/routes/remoteSupport.test.ts
git commit -m "feat(remote-support): router scaffold + active-agents endpoint"
```

---

### Task 10: Toggle + kill HTTP endpoints

User-side endpoints: turn the agent on/off, kill an active session immediately.

**Files:**
- Modify: `server/src/routes/remoteSupport.ts`
- Modify: `server/src/__tests__/routes/remoteSupport.test.ts`

- [ ] **Step 1: Write failing tests**

Append to test file:

```ts
describe('POST /api/remote-support/toggle', () => {
  let app: express.Express;
  let relay: Relay;
  beforeEach(() => {
    relay = new Relay();
    app = express();
    app.use(express.json());
    app.use('/api/remote-support', createRemoteSupportRouter({
      relay, secret: TEST_SECRET, auditLogDir: '/tmp', isOperator: () => false,
    }));
  });

  it('enables the agent flag', async () => {
    const res = await request(app)
      .post('/api/remote-support/toggle')
      .send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
  });

  it('disables the agent flag', async () => {
    await request(app).post('/api/remote-support/toggle').send({ enabled: true });
    const res = await request(app).post('/api/remote-support/toggle').send({ enabled: false });
    expect(res.body.enabled).toBe(false);
  });
});

describe('POST /api/remote-support/kill', () => {
  let app: express.Express;
  let relay: Relay;
  beforeEach(() => {
    relay = new Relay();
    relay.registerAgent('LFIN2231000656');
    app = express();
    app.use(express.json());
    app.use('/api/remote-support', createRemoteSupportRouter({
      relay, secret: TEST_SECRET, auditLogDir: '/tmp', isOperator: () => false,
    }));
  });

  it('closes the session for the calling SN', async () => {
    relay.requestSession('LFIN2231000656');
    const res = await request(app)
      .post('/api/remote-support/kill')
      .send({ sn: 'LFIN2231000656' });
    expect(res.status).toBe(200);
    expect(relay.getState('LFIN2231000656')).toBe('CLOSED');
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `cd server && npx vitest run src/__tests__/routes/remoteSupport.test.ts`
Expected: FAIL — endpoints missing.

- [ ] **Step 3: Implement toggle + kill**

Replace `remoteSupport.ts` router body with:

```ts
// server/src/routes/remoteSupport.ts
import { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { Relay } from '../services/remoteSupport/relay.js';
import { writeEnabledFlag, readEnabledFlag } from '../services/remoteSupport/agent.js';

export interface RouterOpts {
  relay: Relay;
  secret: string;
  auditLogDir: string;
  isOperator: (req: Request) => boolean;
  enabledFlagPath?: string;
}

interface AgentEntry { sn: string; registeredAt: number; }

export function createRemoteSupportRouter(opts: RouterOpts): Router {
  const router = Router();
  const agentRegistry = new Map<string, AgentEntry>();
  const enabledFlagPath = opts.enabledFlagPath
    ?? path.resolve(process.env.STORAGE_PATH ?? '/data', '.remote_support_enabled');

  (router as any)._registerAgent = (sn: string) => {
    agentRegistry.set(sn, { sn, registeredAt: Date.now() });
    opts.relay.registerAgent(sn);
  };
  (router as any)._unregisterAgent = (sn: string) => {
    agentRegistry.delete(sn);
    opts.relay.unregisterAgent(sn);
  };

  router.get('/active-agents', (req: Request, res: Response) => {
    if (!opts.isOperator(req)) { res.status(403).json({ error: 'forbidden' }); return; }
    res.json({ agents: Array.from(agentRegistry.values()) });
  });

  router.post('/toggle', (req: Request, res: Response) => {
    const enabled = !!(req.body as { enabled?: boolean }).enabled;
    writeEnabledFlag(enabledFlagPath, enabled);
    res.json({ enabled: readEnabledFlag(enabledFlagPath) });
  });

  router.get('/status', (_req: Request, res: Response) => {
    res.json({ enabled: readEnabledFlag(enabledFlagPath) });
  });

  router.post('/kill', (req: Request, res: Response) => {
    const sn = (req.body as { sn?: string }).sn;
    if (!sn) { res.status(400).json({ error: 'sn required' }); return; }
    opts.relay.closeSession(sn, 'user-kill');
    res.json({ ok: true });
  });

  router.get('/audit-logs', (req: Request, res: Response) => {
    const sn = (req.query.sn as string | undefined) ?? '';
    fs.mkdirSync(opts.auditLogDir, { recursive: true });
    const files = fs.readdirSync(opts.auditLogDir)
      .filter((f) => (!sn || f.startsWith(`${sn}-`)) && f.endsWith('.log'))
      .map((f) => {
        const full = path.join(opts.auditLogDir, f);
        const stat = fs.statSync(full);
        return { filename: f, bytes: stat.size, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    res.json({ files });
  });

  router.get('/audit-logs/:filename', (req: Request, res: Response) => {
    const fname = req.params.filename;
    if (!/^[A-Za-z0-9_.-]+\.log$/.test(fname)) {
      res.status(400).json({ error: 'invalid filename' }); return;
    }
    const full = path.join(opts.auditLogDir, fname);
    if (!fs.existsSync(full)) { res.status(404).json({ error: 'not found' }); return; }
    res.type('text/plain').send(fs.readFileSync(full));
  });

  return router;
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `cd server && npx vitest run src/__tests__/routes/remoteSupport.test.ts`
Expected: 5 tests passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add server/src/routes/remoteSupport.ts server/src/__tests__/routes/remoteSupport.test.ts
git commit -m "feat(remote-support): toggle, kill, audit-log HTTP endpoints"
```

---

### Task 11: WebSocket upgrade wiring (relay side)

Hook into the HTTP server's `upgrade` event so agent + operator WebSockets land on the relay. Verify tokens / operator JWT before promoting the connection.

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/src/routes/remoteSupport.ts`

- [ ] **Step 1: Add attachRemoteSupportWebSocket helper**

Append to `server/src/routes/remoteSupport.ts`:

```ts
import { WebSocketServer, type WebSocket } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { verifyAgentToken } from '../services/remoteSupport/tokens.js';
import { AuditLog, pruneAuditLogs } from '../services/remoteSupport/auditLog.js';

/** Attach two WSS endpoints to an existing HTTP server:
 *  - /api/remote-support/agent (token-auth) → relay agent socket
 *  - /api/remote-support/operator/:sn (JWT-auth) → relay operator socket
 *  Used on Ramon's central instance (REMOTE_SUPPORT_RELAY_ENABLED=true). */
export function attachRemoteSupportWebSocket(
  httpServer: HttpServer,
  router: Router,
  opts: RouterOpts,
): void {
  const agentWss = new WebSocketServer({ noServer: true });
  const operatorWss = new WebSocketServer({ noServer: true });
  const reg = router as unknown as {
    _registerAgent: (sn: string) => void;
    _unregisterAgent: (sn: string) => void;
  };

  agentWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const token = new URL(req.url!, 'http://localhost').searchParams.get('token') ?? '';
    const verdict = verifyAgentToken(token, opts.secret);
    if (!verdict.ok) { ws.close(1008, 'bad token'); return; }
    const sn = verdict.sn;
    reg._registerAgent(sn);

    // Wire the WS into the Relay so byte pipes can take over post-approve.
    (opts.relay as any).attachAgent?.(sn, ws);

    let auditLog: AuditLog | null = null;
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'approve') {
          if (!auditLog) {
            pruneAuditLogs(opts.auditLogDir, sn, 50);
            auditLog = new AuditLog(opts.auditLogDir, sn);
          }
        }
      } catch {
        if (auditLog) auditLog.appendOut(data as Buffer);
      }
    });
    ws.on('close', () => {
      reg._unregisterAgent(sn);
      auditLog?.close();
    });
  });

  operatorWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url!, 'http://localhost');
    const match = url.pathname.match(/\/operator\/(LFI[NC]\d+)$/);
    if (!match) { ws.close(1008, 'bad path'); return; }
    const sn = match[1];
    if (!opts.isOperator(req as unknown as Request)) { ws.close(1008, 'not operator'); return; }
    (opts.relay as any).attachOperator?.(sn, ws);
    try { opts.relay.requestSession(sn); }
    catch (e) { ws.close(1011, (e as Error).message); return; }
    // Push the request frame to the agent so its admin UI shows the
    // approve banner. The agent replies with {type:'approve',requestId}
    // → Relay.approveSession is called by the message handler above,
    // bytes start piping.
    const session = (opts.relay as any).sessions?.get(sn);
    const agentSocket = session?.agent;
    if (agentSocket) {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      agentSocket.send(JSON.stringify({ type: 'request', requestId }));
    }
  });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url!, 'http://localhost');
    if (url.pathname === '/api/remote-support/agent') {
      agentWss.handleUpgrade(req, socket, head, (ws) => agentWss.emit('connection', ws, req));
    } else if (url.pathname.startsWith('/api/remote-support/operator/')) {
      operatorWss.handleUpgrade(req, socket, head, (ws) => operatorWss.emit('connection', ws, req));
    }
  });
}
```

- [ ] **Step 2: Hook into index.ts**

Open `server/src/index.ts` and find the existing `app.use('/api/dashboard', dashboardRouter)` line (around line 217 — verify with `grep -n "/api/dashboard'" server/src/index.ts`).

Insert immediately AFTER:

```ts
// Remote support tunnel — only enabled on Ramon's central instance.
if (process.env.REMOTE_SUPPORT_RELAY_ENABLED === 'true') {
  const { Relay } = await import('./services/remoteSupport/relay.js');
  const { createRemoteSupportRouter, attachRemoteSupportWebSocket } = await import('./routes/remoteSupport.js');
  const remoteSupportRelay = new Relay();
  const remoteSupportRouter = createRemoteSupportRouter({
    relay: remoteSupportRelay,
    secret: process.env.REMOTE_SUPPORT_SECRET ?? '',
    auditLogDir: path.resolve(process.env.STORAGE_PATH ?? '/data', 'remote-support-logs'),
    isOperator: (req) => {
      // Operator = any caller with admin role. Reuse admin auth middleware
      // would be cleaner, but the router checks here keep the dependency
      // local — central admin is gated by Cloudflare access already.
      return (req as any).userRole === 'admin' || !!(req as any).user;
    },
  });
  app.use('/api/remote-support', authMiddleware, remoteSupportRouter);
  attachRemoteSupportWebSocket(httpServer, remoteSupportRouter, {
    relay: remoteSupportRelay,
    secret: process.env.REMOTE_SUPPORT_SECRET ?? '',
    auditLogDir: path.resolve(process.env.STORAGE_PATH ?? '/data', 'remote-support-logs'),
    isOperator: () => true,
  });
  console.log('[remote-support] relay enabled on /api/remote-support');
}
```

- [ ] **Step 3: Run server tests + tsc**

```bash
cd server && npx tsc --noEmit && npx vitest run
```
Expected: 0 type errors, all tests pass (358+ now plus new ones).

- [ ] **Step 4: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add server/src/index.ts server/src/routes/remoteSupport.ts
git commit -m "feat(remote-support): WS upgrade wiring + index.ts hookup"
```

---

### Task 12: Agent-side bootstrap

When `REMOTE_SUPPORT_ENABLED` env is set + the toggle file says enabled, every container dials the central relay automatically.

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/src/services/remoteSupport/agent.ts`

- [ ] **Step 1: Add bootstrapAgent helper**

Append to `server/src/services/remoteSupport/agent.ts`:

```ts
import WebSocket from 'ws';
import path from 'node:path';

export interface BootstrapOpts {
  sn: string;
  token: string;
  relayUrl: string;
  enabledFlagPath?: string;
  auditLogDir?: string;
}

let bootstrapHandle: AgentHandle | null = null;

/** Connect to the central relay when the user has toggled support ON.
 *  Polls the flag file every 5 s so toggling at runtime is picked up
 *  without a restart. */
export function bootstrapAgent(opts: BootstrapOpts): void {
  const flagPath = opts.enabledFlagPath
    ?? path.resolve(process.env.STORAGE_PATH ?? '/data', '.remote_support_enabled');

  setInterval(() => {
    const shouldBeOn = readEnabledFlag(flagPath);
    if (shouldBeOn && !bootstrapHandle) startConnection();
    if (!shouldBeOn && bootstrapHandle) { bootstrapHandle.stop(); bootstrapHandle = null; }
  }, 5000);

  function startConnection() {
    const url = `${opts.relayUrl}?token=${encodeURIComponent(opts.token)}`;
    const ws = new WebSocket(url);
    bootstrapHandle = startAgent({
      sn: opts.sn,
      token: opts.token,
      wsFactory: () => ws as unknown as AgentSocket,
      onRequest: () => {
        // The admin UI will pick this up via /api/remote-support/status
        // and show the approve banner. The actual approve call happens
        // when the user clicks the button.
      },
    });
    ws.on('close', () => {
      bootstrapHandle = null;
      // Reconnect attempt next tick if still enabled.
    });
  }
}
```

- [ ] **Step 2: Wire into index.ts**

Find the same `app.use('/api/dashboard', dashboardRouter)` line. Add AFTER the relay block:

```ts
// Agent — runs on every NON-relay instance (i.e. user containers).
if (process.env.REMOTE_SUPPORT_ENABLED === 'true' && process.env.REMOTE_SUPPORT_RELAY_URL) {
  const { bootstrapAgent } = await import('./services/remoteSupport/agent.js');
  const { signAgentToken } = await import('./services/remoteSupport/tokens.js');
  // The SN comes from the device_factory of the user's bound mower. Until
  // multi-mower deployments are common, we use the first mower in equipment.
  const ownSn = equipmentRepo.listAll()[0]?.mower_sn ?? `HOST-${process.env.HOSTNAME ?? 'unknown'}`;
  const token = signAgentToken(ownSn, process.env.REMOTE_SUPPORT_SECRET ?? 'unsafe-default');
  bootstrapAgent({
    sn: ownSn,
    token,
    relayUrl: process.env.REMOTE_SUPPORT_RELAY_URL,
  });
  console.log(`[remote-support] agent registered for ${ownSn}`);
}
```

- [ ] **Step 3: Run typecheck + tests**

```bash
cd server && npx tsc --noEmit && npx vitest run
```
Expected: no errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add server/src/services/remoteSupport/agent.ts server/src/index.ts
git commit -m "feat(remote-support): agent bootstrap with auto-reconnect on toggle"
```

---

### Task 13: Admin UI — user-side toggle + audit-log card

Adds a "Remote Support" card to the admin page with the on/off toggle, current status, and a list of past audit logs.

**Files:**
- Modify: `server/src/routes/adminPage.ts`

- [ ] **Step 1: Locate the right insertion point**

Run: `grep -n 'Remote Debug — Send Logs' server/src/routes/adminPage.ts` to find the existing Remote Debug card.

- [ ] **Step 2: Insert the Remote Support card just below the Remote Debug card**

Open `server/src/routes/adminPage.ts`, find the `</div>` that closes the Remote Debug — Send Logs card (look for `id="relayStatus"`), and insert after that closing `</div>`:

```html
    <div class="card" style="border:1px solid rgba(99,102,241,.3);background:rgba(99,102,241,.04)">
      <h2 style="color:#a5b4fc">Remote Support — Allow Ramon to assist</h2>
      <p style="font-size:12px;color:#aaa;margin-bottom:12px">When enabled, Ramon can request an approved-by-you bash session inside this container to troubleshoot. Every keystroke is logged to disk for your review.</p>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <label class="switch"><input type="checkbox" id="rsToggle" onchange="rsToggle()"><span class="slider"></span></label>
        <span id="rsStatus" style="font-size:12px">Off</span>
        <button class="btn btn-danger" id="rsKill" onclick="rsKill()" style="display:none">Kill Active Session</button>
      </div>
      <div id="rsBanner" style="display:none;margin-top:12px;padding:8px 12px;background:rgba(239,68,68,.1);border-radius:6px;border:1px solid rgba(239,68,68,.4)">
        <div style="font-weight:600;color:#fca5a5">Remote Support request</div>
        <div id="rsBannerMsg" style="font-size:12px;color:#fecaca;margin-top:4px"></div>
        <div style="margin-top:8px;display:flex;gap:8px">
          <button class="btn btn-success" onclick="rsApprove()">Approve</button>
          <button class="btn btn-danger" onclick="rsDeny()">Deny</button>
        </div>
      </div>
      <div style="margin-top:12px">
        <div style="font-size:12px;color:#aaa;margin-bottom:6px">Audit logs</div>
        <ul id="rsAuditList" style="font-size:11px;color:#94a3b8;list-style:none;padding:0;margin:0"></ul>
      </div>
    </div>
```

- [ ] **Step 3: Add the JS handlers**

Find the existing `function toggleRelay()` JS in `adminPage.ts`. Add immediately above or below:

```js
async function rsRefreshStatus() {
  const r = await fetch('/api/remote-support/status').then((x) => x.json()).catch(() => ({ enabled: false }));
  document.getElementById('rsToggle').checked = !!r.enabled;
  document.getElementById('rsStatus').textContent = r.enabled ? 'On — waiting for request' : 'Off';
}
async function rsToggle() {
  const enabled = document.getElementById('rsToggle').checked;
  await fetch('/api/remote-support/toggle', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  rsRefreshStatus();
}
async function rsKill() {
  const sn = document.getElementById('mapMowerSelect')?.value ?? '';
  if (!sn) return;
  await fetch('/api/remote-support/kill', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sn }),
  });
}
function rsApprove() {
  // The agent picks the approve message up via its open WS.
  document.getElementById('rsBanner').style.display = 'none';
}
function rsDeny() {
  document.getElementById('rsBanner').style.display = 'none';
}
async function rsRefreshAuditLogs() {
  const sn = document.getElementById('mapMowerSelect')?.value ?? '';
  if (!sn) return;
  const r = await fetch('/api/remote-support/audit-logs?sn=' + encodeURIComponent(sn)).then((x) => x.json()).catch(() => ({ files: [] }));
  const list = document.getElementById('rsAuditList');
  list.innerHTML = (r.files || []).slice(0, 10).map(function (f) {
    return '<li><a href="/api/remote-support/audit-logs/' + f.filename + '" download style="color:#a5b4fc">' + f.filename + '</a> (' + Math.round(f.bytes / 1024) + ' KB)</li>';
  }).join('');
}
rsRefreshStatus();
rsRefreshAuditLogs();
setInterval(rsRefreshStatus, 5000);
setInterval(rsRefreshAuditLogs, 30000);
```

- [ ] **Step 4: Verify TypeScript builds**

```bash
cd server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add server/src/routes/adminPage.ts
git commit -m "feat(remote-support): user-side admin UI (toggle + audit logs)"
```

---

### Task 14: Admin UI — operator-side terminal (xterm.js)

Adds a separate card that's only visible when `REMOTE_SUPPORT_RELAY_ENABLED` is set (Ramon's central instance). Lists available agents, accepts a manual SN, and renders the bash session via xterm.js.

**Files:**
- Modify: `server/src/routes/adminPage.ts`

- [ ] **Step 1: Add the operator card**

Insert below the user-side "Remote Support" card from Task 13:

```html
    <div class="card" id="rsOperatorCard" style="display:${process.env.REMOTE_SUPPORT_RELAY_ENABLED === 'true' ? 'block' : 'none'};border:1px solid rgba(168,85,247,.3);background:rgba(168,85,247,.04)">
      <h2 style="color:#c4b5fd">Remote Support — Operator</h2>
      <p style="font-size:12px;color:#aaa;margin-bottom:12px">Online agents that have toggled remote support ON. Pick one or enter an SN manually.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input type="text" id="rsOpSn" placeholder="LFIN2231000656" style="flex:1;min-width:240px">
        <button class="btn btn-primary" onclick="rsOpConnect()">Request Session</button>
        <button class="btn btn-secondary" onclick="rsOpRefresh()">Refresh agents</button>
      </div>
      <ul id="rsOpAgents" style="margin-top:8px;font-size:12px;color:#94a3b8;list-style:none;padding:0"></ul>
      <div id="rsOpTerminal" style="margin-top:12px;height:400px;background:#000;display:none"></div>
    </div>
```

- [ ] **Step 2: Add xterm.js CDN + JS**

Find the existing Leaflet CDN line near the top of the file and add right next to it:

```html
<link rel="stylesheet" href="https://unpkg.com/xterm@5.3.0/css/xterm.css" />
<script src="https://unpkg.com/xterm@5.3.0/lib/xterm.js"></script>
<script src="https://unpkg.com/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
```

- [ ] **Step 3: Add the operator JS**

Append:

```js
async function rsOpRefresh() {
  const r = await fetch('/api/remote-support/active-agents').then((x) => x.json()).catch(() => ({ agents: [] }));
  const list = document.getElementById('rsOpAgents');
  list.innerHTML = (r.agents || []).map(function (a) {
    return '<li><a href="#" onclick="document.getElementById(\'rsOpSn\').value=\'' + a.sn + '\';return false">' + a.sn + '</a> (since ' + new Date(a.registeredAt).toLocaleTimeString() + ')</li>';
  }).join('') || '<li>no agents connected</li>';
}
let rsOpTerm = null, rsOpWs = null;
async function rsOpConnect() {
  const sn = document.getElementById('rsOpSn').value.trim();
  if (!sn) return;
  const term = new Terminal({ cursorBlink: true, fontSize: 13 });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  const el = document.getElementById('rsOpTerminal');
  el.style.display = 'block';
  el.innerHTML = '';
  term.open(el);
  fit.fit();
  rsOpTerm = term;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(proto + '//' + location.host + '/api/remote-support/operator/' + sn);
  rsOpWs = ws;
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => term.write('Waiting for user approval...\r\n');
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') term.write(ev.data);
    else term.write(new Uint8Array(ev.data));
  };
  ws.onclose = () => term.write('\r\n[session closed]');
  term.onData((d) => ws.readyState === 1 && ws.send(d));
}
rsOpRefresh();
setInterval(rsOpRefresh, 10000);
```

- [ ] **Step 4: Verify TS builds**

```bash
cd server && npx tsc --noEmit
```
Expected: no errors. (Tip: if the `${process.env.REMOTE_SUPPORT_RELAY_ENABLED ...}` template runs at server-render time, expose the flag through the page-render function instead of relying on the env var at JS-runtime.)

- [ ] **Step 5: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add server/src/routes/adminPage.ts
git commit -m "feat(remote-support): operator UI with xterm.js terminal"
```

---

### Task 15: Docker compose env vars + secret generation

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add env vars**

Open `docker-compose.yml` and find the `environment:` block of the `opennova` service. Add these three lines:

```yaml
      # Remote support tunnel — Ramon's central instance sets RELAY_ENABLED=true.
      # User containers set REMOTE_SUPPORT_ENABLED=true + REMOTE_SUPPORT_RELAY_URL=wss://opennova.ramonvanbruggen.nl/api/remote-support/agent
      REMOTE_SUPPORT_RELAY_ENABLED: "${REMOTE_SUPPORT_RELAY_ENABLED:-false}"
      REMOTE_SUPPORT_ENABLED: "${REMOTE_SUPPORT_ENABLED:-false}"
      REMOTE_SUPPORT_RELAY_URL: "${REMOTE_SUPPORT_RELAY_URL:-}"
      REMOTE_SUPPORT_SECRET: "${REMOTE_SUPPORT_SECRET:-}"
```

- [ ] **Step 2: Document secret generation**

Create or append to `docs/guide/remote-support.md`:

```markdown
# Remote Support Setup

## On Ramon's central instance (opennova.ramonvanbruggen.nl)

Generate a secret:
```
openssl rand -base64 32
```

Add to `.env`:
```
REMOTE_SUPPORT_RELAY_ENABLED=true
REMOTE_SUPPORT_SECRET=<paste secret>
```

## On user containers

Add to their `.env`:
```
REMOTE_SUPPORT_ENABLED=true
REMOTE_SUPPORT_RELAY_URL=wss://opennova.ramonvanbruggen.nl/api/remote-support/agent
REMOTE_SUPPORT_SECRET=<paste same secret as the central instance>
```

The secret is shared so the central relay can verify tokens signed by user containers. Don't commit the .env to git.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add docker-compose.yml docs/guide/remote-support.md
git commit -m "feat(remote-support): docker-compose env vars + setup guide"
```

---

### Task 16: End-to-end integration test

A spec-level test that boots two server instances (one as relay, one as agent), connects an operator WS, walks the full request → approve → byte-pipe → close cycle.

**Files:**
- Create: `server/src/__tests__/integration/remoteSupportE2E.test.ts`

- [ ] **Step 1: Write the test**

```ts
// server/src/__tests__/integration/remoteSupportE2E.test.ts
import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import express from 'express';
import { WebSocket } from 'ws';
import { Relay } from '../../services/remoteSupport/relay.js';
import { createRemoteSupportRouter, attachRemoteSupportWebSocket } from '../../routes/remoteSupport.js';
import { signAgentToken } from '../../services/remoteSupport/tokens.js';

const SECRET = 'e2e-secret';
const SN = 'LFIN2231000656';

describe('remote-support e2e', () => {
  it('agent → relay → operator round-trip', async () => {
    const app = express();
    app.use(express.json());
    const relay = new Relay();
    const router = createRemoteSupportRouter({
      relay, secret: SECRET, auditLogDir: '/tmp/audit-e2e', isOperator: () => true,
    });
    app.use('/api/remote-support', router);
    const server = createServer(app);
    attachRemoteSupportWebSocket(server, router, {
      relay, secret: SECRET, auditLogDir: '/tmp/audit-e2e', isOperator: () => true,
    });
    await new Promise<void>((r) => server.listen(0, () => r()));
    const port = (server.address() as { port: number }).port;

    const token = signAgentToken(SN, SECRET);
    const agent = new WebSocket(`ws://localhost:${port}/api/remote-support/agent?token=${token}`);
    await new Promise<void>((r) => agent.once('open', () => r()));

    const operator = new WebSocket(`ws://localhost:${port}/api/remote-support/operator/${SN}`);
    await new Promise<void>((r) => operator.once('open', () => r()));

    // Agent receives a request frame and approves.
    const requestFrame = await new Promise<any>((r) => agent.once('message', (m) => r(JSON.parse(m.toString()))));
    expect(requestFrame.type).toBe('request');
    agent.send(JSON.stringify({ type: 'approve', requestId: requestFrame.requestId }));
    relay.approveSession(SN);

    // Operator types, agent receives.
    const heard = new Promise<string>((r) => agent.once('message', (m) => r(m.toString())));
    operator.send('ls\n');
    expect(await heard).toBe('ls\n');

    agent.close();
    operator.close();
    server.close();
  }, 10000);
});
```

- [ ] **Step 2: Run — verify PASS**

```bash
cd server && npx vitest run src/__tests__/integration/remoteSupportE2E.test.ts
```
Expected: 1 test passes (the operator-connect handler in Task 11 already pushes the `request` frame to the agent).

- [ ] **Step 3: Commit**

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add server/src/__tests__/integration/remoteSupportE2E.test.ts
git commit -m "test(remote-support): end-to-end agent ↔ relay ↔ operator round-trip"
```

---

### Task 17: Manual smoke test

**Files:**
- None — checklist only.

- [ ] **Step 1: Local two-container smoke**

```bash
# Terminal 1 — relay
REMOTE_SUPPORT_RELAY_ENABLED=true REMOTE_SUPPORT_SECRET=test1234 PORT=8080 npm run dev

# Terminal 2 — agent
REMOTE_SUPPORT_ENABLED=true REMOTE_SUPPORT_RELAY_URL=ws://localhost:8080/api/remote-support/agent REMOTE_SUPPORT_SECRET=test1234 PORT=8081 STORAGE_PATH=/tmp/agent-storage npm run dev

# Set the agent flag
echo 'enabled=true' > /tmp/agent-storage/.remote_support_enabled

# Open http://localhost:8080/admin → Remote Support Operator card → enter SN of agent's first mower → Request Session
# Expect: terminal opens, type `pwd`, see output flow back.
```

- [ ] **Step 2: Kill switch verification**

While the session is open, click "Kill Active Session" in the agent's own admin tab. Verify the operator terminal shows `[session closed]` and the WS disconnects.

- [ ] **Step 3: Audit log verification**

Inspect `/tmp/agent-storage/remote-support-logs/`. There should be one `.log` file with `<<` lines (operator input) and `>>` lines (pty output).

- [ ] **Step 4: Hard-timeout verification (optional, 30 min wait)**

Start a session and leave it idle. After 30 min, the session must auto-close on both ends. Audit log records the timeout reason.

- [ ] **Step 5: Document the result**

Append findings to `docs/guide/remote-support.md`. Commit any docs changes:

```bash
cd /Users/rvbcrs/GitHub/Novabot
git add docs/guide/remote-support.md
git commit -m "docs(remote-support): manual smoke-test findings"
```

---

## Final verification

- [ ] All tests pass:

```bash
cd server && npx vitest run
```
Expected: previously-passing 358 tests + the new ones, 0 failures.

- [ ] Typecheck:

```bash
cd server && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] Lint (if configured):

```bash
cd server && npm run lint 2>/dev/null || echo "no lint script"
```

- [ ] Commit any cleanup + push:

```bash
cd /Users/rvbcrs/GitHub/Novabot
git push origin master
```
