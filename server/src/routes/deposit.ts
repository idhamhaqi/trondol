// ============================================
// DEPOSIT ROUTES — /api/deposit/*
// ============================================

import { Hono } from 'hono';
import mysql from 'mysql2';
import type { DB } from '../config/database.js';
import { submitDeposit } from '../services/depositService.js';

export function createDepositRoutes(db: DB): Hono {
  const app = new Hono();

  // POST /api/deposit/submit
  app.post('/submit', async (c) => {
    try {
      const userId = c.get('userId') as number;
      const walletAddress = c.get('walletAddress') as string;
      const { txHash, amount } = await c.req.json<{ txHash?: string; amount?: number }>();

      if (!txHash) return c.json({ error: 'txHash required' }, 400);

      const result = await submitDeposit(userId, txHash.trim(), walletAddress, amount || 0);
      return c.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[Deposit] submit error:', err);
      return c.json({ error: err.message || 'Internal server error' }, 400);
    }
  });

  // GET /api/deposit/history?page=&limit=
  app.get('/history', async (c) => {
    try {
      const userId = c.get('userId') as number;
      const page = Math.max(1, parseInt(c.req.query('page') || '1'));
      const limit = Math.min(50, parseInt(c.req.query('limit') || '20'));
      const offset = (page - 1) * limit;

      const [{ total }] = await db`SELECT COUNT(*) AS total FROM deposits WHERE user_id = ${userId}`;
      const rows = await db.unsafe(`
        SELECT id, tx_hash, amount, status, fail_reason, created_at, confirmed_at
        FROM deposits WHERE user_id = ${mysql.escape(userId)}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `);

      return c.json({ data: rows, total: parseInt(total as string), page, limit });
    } catch (err: any) {
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  return app;
}
