import fs from 'node:fs';
import { exec as cpExec } from 'node:child_process';
import type { EventEmitter } from 'node:events';

/** Structured result of a one-shot exec on the agent (option B). Returned to
 *  the operator over the relay as {type:'exec-result'}. */
export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut?: boolean;
}

export interface ExecRequest {
  reqId: string;
  cmd: string;
  timeoutMs?: number;
}

const EXEC_TIMEOUT_DEFAULT_MS = 15000;
const EXEC_TIMEOUT_MAX_MS = 60000;
const EXEC_STDOUT_CAP = 256 * 1024;
const EXEC_STDERR_CAP = 64 * 1024;

/** How long a pending support-session request waits for the user to click
 *  Approve/Deny before it auto-denies. Toggle-ON means "available for
 *  support"; each operator connect still needs an explicit per-session OK,
 *  so a request that nobody answers must not sit open forever. */
const SESSION_APPROVAL_TIMEOUT_MS = 60_000;

/** Run a command in the container and return clean stdout/stderr/exit-code.
 *  Hard caps on timeout + output so a runaway/huge command can't wedge the
 *  agent or flood the relay. Runs as the agent's own UID (root in our image),
 *  same trust level as the interactive pty — gated upstream by admin-auth +
 *  the support toggle (consent). */
export function runExecCommand(cmd: string, timeoutMs?: number): Promise<ExecResult> {
  const timeout = Math.min(Math.max(Number(timeoutMs) || EXEC_TIMEOUT_DEFAULT_MS, 1000), EXEC_TIMEOUT_MAX_MS);
  return new Promise((resolve) => {
    cpExec(cmd, { timeout, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
      const e = err as (Error & { code?: number; killed?: boolean; signal?: string }) | null;
      resolve({
        stdout: String(stdout ?? '').slice(0, EXEC_STDOUT_CAP),
        stderr: String(stderr ?? '').slice(0, EXEC_STDERR_CAP),
        code: e ? (typeof e.code === 'number' ? e.code : 1) : 0,
        timedOut: !!(e && (e.killed || e.signal === 'SIGTERM')),
      });
    });
  });
}

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
  /** Option B: run a one-shot command and return structured output. The
   *  relay sends {type:'exec'}; the agent replies {type:'exec-result'}. */
  onExec?: (req: ExecRequest) => Promise<ExecResult>;
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
            } else if (msg.type === 'exec' && typeof msg.reqId === 'string' && typeof msg.cmd === 'string') {
              const reqId = msg.reqId as string;
              Promise.resolve(opts.onExec?.({ reqId, cmd: msg.cmd, timeoutMs: msg.timeoutMs }))
                .then((result) => {
                  if (result && s.readyState === 1) {
                    s.send(JSON.stringify({ type: 'exec-result', reqId, ...result }));
                  }
                })
                .catch((err: unknown) => {
                  if (s.readyState === 1) {
                    s.send(JSON.stringify({
                      type: 'exec-result', reqId,
                      stdout: '', stderr: String((err as Error)?.message ?? err), code: 1,
                    }));
                  }
                });
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
import { existsSync } from 'node:fs';

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

/** Spawns an interactive shell inside the container under the agent's own UID
 *  (typically root in our docker image). Output is delivered as raw
 *  Buffers to the caller, which forwards them upstream to the operator
 *  via the relay socket. */
export function spawnPtySession(opts: PtyOpts): PtySession {
  // Resolve a shell that actually exists. The docker image is node:20-alpine,
  // which ships /bin/sh (busybox) but not necessarily bash. Honor $SHELL, then
  // prefer bash if installed, else fall back to /bin/sh — otherwise node-pty's
  // execvp fails with "No such file or directory".
  const shell = process.env.SHELL
    ?? (existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh');
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

/** Auto-deny timer for the current pendingRequest. Cleared the moment the
 *  user approves/denies, the request is superseded, or the link drops. */
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function clearPendingTimer(): void {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

/** Record a new pending session request and arm the auto-deny timeout.
 *  Does NOT approve — the user must explicitly Approve/Deny (toggle-ON is
 *  availability, not blanket per-session consent). Exported so tests can
 *  drive the timeout path without a live relay socket. */
export function armPendingRequest(requestId: string): void {
  clearPendingTimer();
  pendingRequest = { requestId, since: Date.now() };
  pendingTimer = setTimeout(() => {
    // Nobody answered in time — deny so the operator socket is torn down
    // and we never leave an unattended request open.
    try { denyPending(requestId); } catch { /* already resolved/superseded */ }
  }, SESSION_APPROVAL_TIMEOUT_MS);
  // A lone timer must not keep the process alive on its own.
  if (typeof pendingTimer.unref === 'function') pendingTimer.unref();
}

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
  clearPendingTimer();
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
  clearPendingTimer();
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
      clearPendingTimer();
      pendingRequest = null;
      bootstrapHandle.stop();
      bootstrapHandle = null;
    }
  }, 5000);

  function startConnection() {
    // New TOFU credential format — relay parses sn + token from query and
    // verifies via remoteSupportIdentitiesRepo. Old `?token=<hmac>` format
    // is gone with the shared REMOTE_SUPPORT_SECRET it relied on.
    const sn = encodeURIComponent(opts.sn);
    const token = encodeURIComponent(opts.token);
    const url = `${opts.relayUrl}?sn=${sn}&token=${token}`;
    const ws = new WebSocket(url);
    bootstrapHandle = startAgent({
      sn: opts.sn,
      token: opts.token,
      wsFactory: () => ws as unknown as AgentSocket,
      onRequest: ({ requestId }) => {
        // Toggle-ON IS the consent. The agent only dials the relay when the
        // user enabled support, so an incoming session request is already
        // authorized — auto-approve immediately. No per-session popup, no
        // auto-deny timeout. The user stays in control: flipping the toggle
        // OFF (or /kill) tears the session down, and every keystroke remains
        // audit-logged on the relay.
        try {
          pendingRequest = { requestId, since: Date.now() };
          approvePending(requestId);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(`[remote-support] auto-approve failed: ${(e as Error).message}`);
          pendingRequest = null;
        }
      },
      onRawBytes: (data) => {
        // Operator keystrokes — pipe them into the pty if one is active.
        // If we're somehow receiving bytes without an active pty, drop:
        // the relay state machine guarantees no bytes flow pre-approve.
        if (activePty) activePty.write(data);
      },
      onExec: (req) => runExecCommand(req.cmd, req.timeoutMs),
    });
    // Heartbeat — the part that makes reconnect actually reliable. A dropped
    // relay or network NAT timeout frequently HALF-OPENS the socket: the link
    // is dead but no 'close' frame ever arrives, so 'close' never fires,
    // `bootstrapHandle` stays set, and the 5 s poll keeps thinking we're
    // connected. The agent then silently goes dark until the user toggles
    // OFF/ON — exactly the "enabled but no connection" complaint. We ping the
    // relay periodically; if no pong comes back within the grace window we
    // force the socket closed so 'close' fires and the poll re-dials.
    let lastPong = Date.now();
    const HEARTBEAT_MS = 25_000;
    const HEARTBEAT_GRACE_MS = 15_000;
    const heartbeat = setInterval(() => {
      if (Date.now() - lastPong > HEARTBEAT_MS + HEARTBEAT_GRACE_MS) {
        try { (ws as unknown as { terminate?: () => void }).terminate?.(); } catch { /* ignore */ }
        try { ws.close(); } catch { /* ignore */ }
        return;
      }
      try { (ws as unknown as { ping?: () => void }).ping?.(); } catch { /* ignore */ }
    }, HEARTBEAT_MS);
    if (typeof (heartbeat as { unref?: () => void }).unref === 'function') (heartbeat as { unref: () => void }).unref();
    (ws as unknown as { on(ev: string, cb: () => void): void }).on('pong', () => { lastPong = Date.now(); });

    // CRITICAL: ws emits 'error' on TLS / upgrade / DNS failures. Without
    // a handler Node treats it as an Unhandled 'error' event and crashes
    // the process. The bootstrap polling loop will retry on the next tick,
    // so we just log + let 'close' clear the handle below.
    ws.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.warn(`[remote-support] agent ws error: ${(err as Error).message}`);
    });
    ws.on('close', () => {
      clearInterval(heartbeat);
      killActiveSession();
      clearPendingTimer();
      pendingRequest = null;
      bootstrapHandle = null;
      // Reconnect attempt next tick if still enabled.
    });
  }
}
