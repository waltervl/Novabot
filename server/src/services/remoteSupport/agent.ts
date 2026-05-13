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
