import fs from 'node:fs';
import type { EventEmitter } from 'node:events';

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
  /** Called for every non-JSON frame the agent receives from the relay
   *  (i.e. operator keystrokes once a session is ACTIVE). Without this
   *  hook the bytes were silently dropped — no shell ever saw the input. */
  onRawBytes?: (data: Buffer) => void;
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
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const str = buf.toString('utf8');
      // Only treat as control frame if it looks like an object literal.
      // JSON.parse("5") succeeds (valid number) so a parse-success guard
      // swallows digits typed by the operator.
      if (str.length > 0 && str.charCodeAt(0) === 0x7b /* '{' */) {
        try {
          const msg = JSON.parse(str);
          if (msg && typeof msg === 'object' && typeof msg.type === 'string') {
            if (msg.type === 'request' && typeof msg.requestId === 'string') {
              opts.onRequest({ requestId: msg.requestId });
            }
            return;
          }
        } catch { /* fall through to raw bytes */ }
      }
      opts.onRawBytes?.(buf);
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

/** Pending approve-request the user must respond to. Populated when the
 *  relay sends `{type:'request'}` and cleared once the user clicks
 *  Approve / Deny in the admin UI (or the connection drops). */
let pendingRequest: { requestId: string; since: number } | null = null;

/** Active pty for the current approved session. Null between sessions.
 *  Operator keystrokes go through this; killing it ends the shell. */
let activePty: PtySession | null = null;

export function getPendingRequest(): { requestId: string; since: number } | null {
  return pendingRequest;
}

export function getActivePty(): PtySession | null {
  return activePty;
}

/** Visible to tests so they can drive the approve flow without spawning
 *  a real pty. Production code should call approvePending instead. */
export function _setActivePtyForTest(p: PtySession | null): void { activePty = p; }
export function _setPendingForTest(r: { requestId: string; since: number } | null): void { pendingRequest = r; }
export function _getBootstrapHandleForTest(): AgentHandle | null { return bootstrapHandle; }
export function _setBootstrapHandleForTest(h: AgentHandle | null): void { bootstrapHandle = h; }

/** Approve the currently pending request: spawns a pty inside the
 *  container, wires its stdout → relay socket, signals the relay so
 *  byte-pipe activation completes, and clears the pending state. */
export function approvePending(requestId: string): { ok: true } {
  if (!pendingRequest || pendingRequest.requestId !== requestId) {
    throw new Error('no matching pending request');
  }
  if (!bootstrapHandle) {
    throw new Error('agent not connected');
  }
  const handle = bootstrapHandle;
  // Spawn the pty BEFORE telling the relay to approve, so the very first
  // operator keystroke (which the relay may flush immediately) has a
  // shell to land in.
  if (!activePty) {
    activePty = spawnPtySession({
      cols: 80,
      rows: 24,
      onOutput: (data) => handle.sendData(data),
    });
  }
  handle.approveRequest(requestId);
  pendingRequest = null;
  return { ok: true };
}

/** Deny the currently pending request and tell the relay so it tears
 *  down the operator-side socket immediately. */
export function denyPending(requestId: string): { ok: true } {
  if (!pendingRequest || pendingRequest.requestId !== requestId) {
    throw new Error('no matching pending request');
  }
  bootstrapHandle?.denyRequest(requestId);
  pendingRequest = null;
  return { ok: true };
}

/** Close the active pty (if any). Used by `/kill` from the user-side
 *  router so the user can pull the plug on Ramon mid-session. */
export function killActiveSession(): void {
  if (activePty) {
    try { activePty.close(); } catch { /* already exited */ }
    activePty = null;
  }
}

/** Connect to the central relay when the user has toggled support ON.
 *  Polls the flag file every 5 s so toggling at runtime is picked up
 *  without a restart. */
export function bootstrapAgent(opts: BootstrapOpts): void {
  const flagPath = opts.enabledFlagPath
    ?? path.resolve(process.env.STORAGE_PATH ?? '/data', '.remote_support_enabled');

  setInterval(() => {
    const shouldBeOn = readEnabledFlag(flagPath);
    if (shouldBeOn && !bootstrapHandle) startConnection();
    if (!shouldBeOn && bootstrapHandle) {
      // Tear down pty + handle so we leave no orphaned shells behind.
      killActiveSession();
      pendingRequest = null;
      bootstrapHandle.stop();
      bootstrapHandle = null;
    }
  }, 5000);

  function startConnection() {
    const url = `${opts.relayUrl}?token=${encodeURIComponent(opts.token)}`;
    const ws = new WebSocket(url);
    bootstrapHandle = startAgent({
      sn: opts.sn,
      token: opts.token,
      wsFactory: () => ws as unknown as AgentSocket,
      onRequest: ({ requestId }) => {
        // Toggle ON is the consent — auto-approve. User can pull plug
        // via kill button or by flipping the toggle OFF.
        pendingRequest = { requestId, since: Date.now() };
        try { approvePending(requestId); } catch { /* race with stop */ }
      },
      onRawBytes: (data) => {
        // Operator keystrokes — pipe them into the pty if one is active.
        // If we're somehow receiving bytes without an active pty, drop:
        // the relay state machine guarantees no bytes flow pre-approve.
        if (activePty) activePty.write(data);
      },
    });
    ws.on('close', () => {
      killActiveSession();
      pendingRequest = null;
      bootstrapHandle = null;
      // Reconnect attempt next tick if still enabled.
    });
  }
}
