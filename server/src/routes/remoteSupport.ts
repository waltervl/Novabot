import { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { Relay } from '../services/remoteSupport/relay.js';
import { writeEnabledFlag, readEnabledFlag } from '../services/remoteSupport/agent.js';

/** Two-mode router:
 *  - `relay`  → runs on Ramon's central instance; mounts /active-agents and
 *               the WS-upgrade plumbing for operator + agent sockets.
 *  - `agent`  → runs inside each user container; mounts /toggle, /status,
 *               /kill, /audit-logs, /approve and /deny so the admin UI on
 *               that container can drive the local support state.
 *  Both can be active simultaneously on the same node (Ramon's dev box).
 */
export interface RouterOpts {
  mode?: 'relay' | 'agent';
  // shared (legacy callers without `mode` are treated as relay for backward compat)
  auditLogDir: string;
  enabledFlagPath?: string;
  isOperator?: (req: Request) => boolean;
  // relay-only
  relay?: Relay;
  secret?: string;
  // agent-only
  approveRequest?: (requestId: string) => void;
  denyRequest?: (requestId: string) => void;
  getPendingRequest?: () => { requestId: string; since: number } | null;
  killSession?: () => void;
  isSessionActive?: () => boolean;
}

interface AgentEntry { sn: string; registeredAt: number; }

export function createRemoteSupportRouter(opts: RouterOpts): Router {
  const router = Router();
  const mode: 'relay' | 'agent' = opts.mode ?? 'relay';
  const enabledFlagPath = opts.enabledFlagPath
    ?? path.resolve(process.env.STORAGE_PATH ?? '/data', '.remote_support_enabled');

  if (mode === 'relay') {
    const agentRegistry = new Map<string, AgentEntry>();
    (router as any)._registerAgent = (sn: string) => {
      agentRegistry.set(sn, { sn, registeredAt: Date.now() });
      opts.relay?.registerAgent(sn);
    };
    (router as any)._unregisterAgent = (sn: string) => {
      agentRegistry.delete(sn);
      opts.relay?.unregisterAgent(sn);
    };

    router.get('/active-agents', (req: Request, res: Response) => {
      if (opts.isOperator && !opts.isOperator(req)) {
        res.status(403).json({ error: 'forbidden' }); return;
      }
      res.json({ agents: Array.from(agentRegistry.values()) });
    });

    router.get('/sessions', (req: Request, res: Response) => {
      if (opts.isOperator && !opts.isOperator(req)) {
        res.status(403).json({ error: 'forbidden' }); return;
      }
      res.json({ sessions: opts.relay?.listActiveSessions() ?? [] });
    });

    router.get('/sessions/:sn/buffer', (req: Request, res: Response) => {
      if (opts.isOperator && !opts.isOperator(req)) {
        res.status(403).json({ error: 'forbidden' }); return;
      }
      const sn = req.params.sn;
      const since = parseInt(String(req.query.since ?? '0'), 10) || 0;
      const result = opts.relay?.getSessionBuffer(sn, since);
      if (!result) { res.status(404).json({ error: 'no relay' }); return; }
      res.json({ sn, ...result });
    });
  }

  if (mode === 'agent') {
    router.post('/toggle', (req: Request, res: Response) => {
      const enabled = !!(req.body as { enabled?: boolean }).enabled;
      writeEnabledFlag(enabledFlagPath, enabled);
      res.json({ enabled: readEnabledFlag(enabledFlagPath) });
    });

    router.get('/status', (_req: Request, res: Response) => {
      res.json({
        enabled: readEnabledFlag(enabledFlagPath),
        pendingRequest: opts.getPendingRequest?.() ?? null,
        sessionActive: opts.isSessionActive?.() ?? false,
      });
    });

    router.post('/kill', (_req: Request, res: Response) => {
      opts.killSession?.();
      // Flipping the flag off also stops the bootstrap polling loop from
      // re-dialing the relay until the user toggles support back on.
      writeEnabledFlag(enabledFlagPath, false);
      res.json({ ok: true });
    });

    router.post('/approve', (req: Request, res: Response) => {
      const requestId = (req.body as { requestId?: string }).requestId;
      if (!requestId) { res.status(400).json({ error: 'requestId required' }); return; }
      try {
        opts.approveRequest?.(requestId);
        res.json({ ok: true });
      } catch (e) {
        res.status(409).json({ error: (e as Error).message });
      }
    });

    router.post('/deny', (req: Request, res: Response) => {
      const requestId = (req.body as { requestId?: string }).requestId;
      if (!requestId) { res.status(400).json({ error: 'requestId required' }); return; }
      try {
        opts.denyRequest?.(requestId);
        res.json({ ok: true });
      } catch (e) {
        res.status(409).json({ error: (e as Error).message });
      }
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
  }

  // Legacy compat: tests still call /toggle and /kill on a router created
  // WITHOUT explicit `mode`, treating it as a merged unit. Keep the old
  // endpoints mounted in that case so we don't break the existing suite.
  if (opts.mode === undefined) {
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
      if (sn && opts.relay) {
        opts.relay.closeSession(sn, 'user-kill');
      }
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
  }

  return router;
}

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
  if (!opts.relay) throw new Error('attachRemoteSupportWebSocket requires opts.relay');
  const relay = opts.relay;
  const secret = opts.secret ?? '';
  const agentWss = new WebSocketServer({ noServer: true });
  const operatorWss = new WebSocketServer({ noServer: true });
  const reg = router as unknown as {
    _registerAgent: (sn: string) => void;
    _unregisterAgent: (sn: string) => void;
  };

  agentWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const token = new URL(req.url!, 'http://localhost').searchParams.get('token') ?? '';
    const verdict = verifyAgentToken(token, secret);
    if (!verdict.ok) { ws.close(1008, 'bad token'); return; }
    const sn = verdict.sn;
    reg._registerAgent(sn);

    // Wire the WS into the Relay so byte pipes can take over post-approve.
    (relay as any).attachAgent?.(sn, ws);

    let auditLog: AuditLog | null = null;
    ws.on('message', (data) => {
      // Try to parse as a JSON control frame first. If it parses and matches
      // a known control type, drive the Relay state machine. Otherwise treat
      // the bytes as session payload — the Relay's wirePipe (with audit
      // hooks set below) is what actually forwards them to the operator.
      let parsed: { type?: string; requestId?: string } | null = null;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        parsed = null;
      }

      if (parsed && typeof parsed.type === 'string') {
        if (parsed.type === 'approve') {
          if (!auditLog) {
            pruneAuditLogs(opts.auditLogDir, sn, 50);
            auditLog = new AuditLog(opts.auditLogDir, sn);
            // Bind BOTH directions: operator→agent (onByteIn) and
            // agent→operator (onByteOut). Without this hook only one side
            // would land in the log, breaking the "every keystroke logged"
            // promise to the user.
            const al = auditLog;
            relay.setSessionHooks(sn, {
              onByteIn: (d) => al.appendIn(d),
              onByteOut: (d) => al.appendOut(d),
            });
          }
          try {
            relay.approveSession(sn);
          } catch (e) {
            // State-machine guard threw (e.g. not in REQUESTED, or operator
            // not yet attached). Log + ignore — the WS connection stays up
            // and the operator can retry the request.
            // eslint-disable-next-line no-console
            console.warn('[remote-support] approveSession failed:', (e as Error).message);
          }
          return;
        }
        if (parsed.type === 'deny') {
          try {
            relay.denySession(sn);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[remote-support] denySession failed:', (e as Error).message);
          }
          return;
        }
        // Unknown control type — ignore.
        return;
      }

      // Non-JSON payload. The audit hook bound above already recorded this
      // before forwarding, so we don't need to append here.
    });
    ws.on('close', () => {
      reg._unregisterAgent(sn);
      relay.clearSessionHooks(sn);
      auditLog?.close();
    });
  });

  operatorWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url!, 'http://localhost');
    const match = url.pathname.match(/\/operator\/(LFI[NC]\d+)$/);
    if (!match) { ws.close(1008, 'bad path'); return; }
    const sn = match[1];
    if (opts.isOperator && !opts.isOperator(req as unknown as Request)) {
      ws.close(1008, 'not operator'); return;
    }
    (relay as any).attachOperator?.(sn, ws);
    try { relay.requestSession(sn); }
    catch (e) { ws.close(1011, (e as Error).message); return; }
    // Push the request frame to the agent so its admin UI shows the
    // approve banner. The agent replies with {type:'approve',requestId}
    // (or {type:'deny',requestId}); the agent ws.on('message') handler
    // above drives Relay.approveSession / Relay.denySession, which in
    // turn wires the byte pipe (or closes the session).
    const session = (relay as any).sessions?.get(sn);
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
