/**
 * POST /api/push/register — OpenNova app uploads its Expo push token.
 *
 * Body: { token, sn, platform }
 * Auth: Bearer JWT (the app's own login token).
 *
 * The token is upserted on (token, sn) — the app registers ONCE per
 * bound mower so a multi-mower account ends up with multiple rows
 * sharing the same token. Server iterates rows when fanning out push.
 */
import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { AuthRequest, ok } from '../types/index.js';
import { pushTokensRepo } from '../db/repositories/pushTokens.js';

export const pushRegisterRouter = Router();

pushRegisterRouter.post('/register', authMiddleware, (req: AuthRequest, res: Response) => {
  const { token, sn, platform } = req.body as {
    token?: string;
    sn?: string;
    platform?: string;
  };
  if (!token || !sn) {
    res.status(400).json({ error: 'token and sn are required' });
    return;
  }
  const plat = platform === 'ios' || platform === 'android' ? platform : 'unknown';
  pushTokensRepo.upsert(token, sn, req.userId!, plat);
  console.log(`[NOTIFY:EXPO] registered token for ${sn} (user ${req.userId}, platform ${plat})`);
  res.json(ok());
});
