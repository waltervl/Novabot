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
    const router = createRemoteSupportRouter({
      relay,
      secret: TEST_SECRET,
      auditLogDir: '/tmp',
      isOperator: () => true,
    });
    (router as any)._registerAgent('LFIN2231000656');
    const localApp = express();
    localApp.use('/api/remote-support', router);
    const res = await request(localApp).get('/api/remote-support/active-agents');
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
