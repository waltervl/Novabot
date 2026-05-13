import { Router, type Request, type Response } from 'express';
import type { Relay } from '../services/remoteSupport/relay.js';

export interface RouterOpts {
  relay: Relay;
  secret: string;
  auditLogDir: string;
  isOperator: (req: Request) => boolean;
}

interface AgentEntry {
  sn: string;
  registeredAt: number;
}

export function createRemoteSupportRouter(opts: RouterOpts): Router {
  const router = Router();
  const agentRegistry = new Map<string, AgentEntry>();

  // Hooks for the WS upgrade handler (Task 11) — let it keep the registry
  // in sync with live agent sockets. Tests can call these directly.
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
