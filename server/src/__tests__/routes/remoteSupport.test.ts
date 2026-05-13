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

describe('POST /api/remote-support/toggle', () => {
  let app: express.Express;
  let relay: Relay;
  beforeEach(() => {
    relay = new Relay();
    app = express();
    app.use(express.json());
    app.use('/api/remote-support', createRemoteSupportRouter({
      relay, secret: TEST_SECRET, auditLogDir: '/tmp', isOperator: () => false,
      enabledFlagPath: '/tmp/test-remote-support-flag',
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
