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
