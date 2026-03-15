// ============================================
// ADMIN AUTH MIDDLEWARE
// Returns 404 (not 401) to hide endpoint existence
// ============================================

import type { Context, Next } from 'hono';
import { getAdminSession } from '../config/redis.js';

export async function adminMw(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Not found' }, 404);
  }

  const token = authHeader.slice(7);
  const valid = await getAdminSession(token);
  if (!valid) {
    return c.json({ error: 'Not found' }, 404);
  }

  await next();
}
