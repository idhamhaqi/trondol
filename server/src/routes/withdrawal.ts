// ============================================
// WITHDRAWAL ROUTES — /api/withdrawal/*
// ============================================

import { Hono } from 'hono';
import mysql from 'mysql2';
import type { DB } from '../config/database.js';
import { submitWithdrawal } from '../services/withdrawalService.js';

export function createWithdrawalRoutes(db: DB): Hono {
  const app = new Hono();

  // POST /api/withdrawal/submit
  app.post('/submit', async (c) => {
    try {
      const userId = c.get('userId') as number;
      const { amount, walletAddress } = await c.req.json<{ amount?: number; walletAddress?: string }>();

      if (!amount || typeof amount !== 'number') return c.json({ error: 'Invalid amount' }, 400);
      if (!walletAddress) return c.json({ error: 'walletAddress required' }, 400);

      const withdrawalId = await submitWithdrawal(userId, walletAddress, amount);
      return c.json({ success: true, withdrawalId });
    } catch (err: any) {
      console.error('[Withdrawal] submit error:', err);
      return c.json({ error: err.message || 'Internal server error' }, 400);
    }
  });

  // GET /api/withdrawal/history?page=&limit=
  app.get('/history', async (c) => {
    try {
      const userId = c.get('userId') as number;
      const page = Math.max(1, parseInt(c.req.query('page') || '1'));
      const limit = Math.min(50, parseInt(c.req.query('limit') || '20'));
      const offset = (page - 1) * limit;

      const [{ total }] = await db`SELECT COUNT(*) AS total FROM withdrawals WHERE user_id = ${userId}`;
      const rows = await db.unsafe(`
        SELECT id, wallet_address, amount, tx_hash, status, admin_note, created_at, processed_at
        FROM withdrawals WHERE user_id = ${mysql.escape(userId)}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `);

      return c.json({ data: rows, total: parseInt(total as string), page, limit });
    } catch (err: any) {
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  return app;
}
