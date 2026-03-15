// ============================================
// AUTH MIDDLEWARE — User session (Bearer token)
// ============================================

import type { Context, Next } from 'hono';
import { getSession } from '../config/redis.js';

export async function authMw(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  if (!token || token.length < 32) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const session = await getSession(token);
  if (!session) {
    return c.json({ error: 'Session expired or not found' }, 401);
  }

  c.set('userId', session.userId);
  c.set('walletAddress', session.walletAddress);
  await next();
}
