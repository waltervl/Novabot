/**
 * End-to-end integration test — agent ↔ relay ↔ operator round-trip.
 *
 * Spins up Express + Relay + remoteSupport router + WS upgrade on an
 * ephemeral port, dials an agent socket (token-auth) and an operator
 * socket (operator-of-SN path), exercises the request/approve handshake
 * documented in routes/remoteSupport.ts (see comment near line 143), and
 * asserts that raw bytes from the operator land on the agent after
 * approve.
 *
 * Notes vs. the original plan draft:
 *   - The route's agent message handler does NOT itself call
 *     `relay.approveSession(sn)` — it only opens an AuditLog when it
 *     sees an `approve` JSON frame. The flip to ACTIVE is the operator
 *     side's responsibility (or, here, the test's). So we send the
 *     `approve` JSON for parity with the wire protocol AND call
 *     `relay.approveSession(sn)` afterwards to wire the byte pipe.
 *   - `ws` emits `message` as a Buffer regardless of whether the sender
 *     sent a string, so we normalize to utf8 string for the equality
 *     assertion.
 */
import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket, type RawData } from 'ws';
import { Relay } from '../../services/remoteSupport/relay.js';
import {
  createRemoteSupportRouter,
  attachRemoteSupportWebSocket,
} from '../../routes/remoteSupport.js';
import { signAgentToken } from '../../services/remoteSupport/tokens.js';

const SECRET = 'e2e-secret';
const SN = 'LFIN2231000656';

function toUtf8(m: RawData): string {
  if (Buffer.isBuffer(m)) return m.toString('utf8');
  if (Array.isArray(m)) return Buffer.concat(m).toString('utf8');
  if (m instanceof ArrayBuffer) return Buffer.from(m).toString('utf8');
  return String(m);
}

describe('remote-support e2e', () => {
  it('agent → relay → operator round-trip', async () => {
    const auditLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-e2e-'));
    const app = express();
    app.use(express.json());
    const relay = new Relay();
    const opts = {
      relay,
      secret: SECRET,
      auditLogDir,
      isOperator: () => true,
    };
    const router = createRemoteSupportRouter(opts);
    app.use('/api/remote-support', router);
    const server = createServer(app);
    attachRemoteSupportWebSocket(server, router, opts);

    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const { port } = address;

    const token = signAgentToken(SN, SECRET);

    // 1. Agent connects.
    const agent = new WebSocket(
      `ws://127.0.0.1:${port}/api/remote-support/agent?token=${encodeURIComponent(token)}`,
    );
    await new Promise<void>((resolve, reject) => {
      agent.once('open', () => resolve());
      agent.once('error', reject);
    });

    // The route's agentWss handler runs `_registerAgent` + `attachAgent`
    // synchronously on 'connection', but the WS upgrade itself fires
    // before `open` resolves on the client — by the time we get here
    // the server-side agent socket is attached to the Relay.
    expect(relay.getState(SN)).toBe('IDLE');

    // 2. Operator connects → server calls requestSession + pushes
    //    `request` frame to the agent.
    const operator = new WebSocket(
      `ws://127.0.0.1:${port}/api/remote-support/operator/${SN}`,
    );
    await new Promise<void>((resolve, reject) => {
      operator.once('open', () => resolve());
      operator.once('error', reject);
    });

    // 3. Agent receives `request` frame.
    const requestFrame = await new Promise<{ type: string; requestId: string }>(
      (resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('request timeout')), 5000);
        agent.once('message', (m) => {
          clearTimeout(timer);
          try {
            resolve(JSON.parse(toUtf8(m)));
          } catch (e) {
            reject(e as Error);
          }
        });
      },
    );
    expect(requestFrame.type).toBe('request');
    expect(typeof requestFrame.requestId).toBe('string');
    expect(relay.getState(SN)).toBe('REQUESTED');

    // 4. Agent approves on the wire (opens auditLog server-side) AND we
    //    flip the relay to ACTIVE so the byte pipe wires up. In production
    //    the operator UI calls a separate approve endpoint; in-process
    //    we drive the relay directly.
    agent.send(JSON.stringify({ type: 'approve', requestId: requestFrame.requestId }));
    relay.approveSession(SN);
    expect(relay.getState(SN)).toBe('ACTIVE');

    // 5. Operator sends raw bytes → agent should see them verbatim.
    const heard = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('pipe timeout')), 5000);
      agent.once('message', (m) => {
        clearTimeout(timer);
        resolve(toUtf8(m));
      });
    });
    operator.send('ls\n');
    expect(await heard).toBe('ls\n');

    // Clean teardown — close sockets, drain server, drop audit dir.
    agent.close();
    operator.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(auditLogDir, { recursive: true, force: true });
  }, 10000);
});
