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
