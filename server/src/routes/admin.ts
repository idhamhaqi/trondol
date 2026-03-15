// ============================================
// ADMIN ROUTES — /api/admin/*
// Protected by adminMw (returns 404 if invalid)
// ============================================

import { Hono } from 'hono';
import mysql from 'mysql2';
import type { DB } from '../config/database.js';
import { setAdminSession, deleteAdminSession } from '../config/redis.js';
import { approveWithdrawal, rejectWithdrawal, completeWithdrawal } from '../services/withdrawalService.js';
import * as pubSub from '../services/redisPubSub.js';
import { randomBytes, timingSafeEqual } from 'crypto';

const ADMIN_KEY = process.env.ADMIN_KEY || 'change_this_admin_key';

export function createAdminRoutes(db: DB): Hono {
  const app = new Hono();

  // POST /api/admin/login
  app.post('/login', async (c) => {
    try {
      const { key } = await c.req.json<{ key?: string }>();
      if (!key) return c.json({ error: 'Not found' }, 404);

      // Timing-safe comparison
      const a = Buffer.from(key.padEnd(64).slice(0, 64));
      const b = Buffer.from(ADMIN_KEY.padEnd(64).slice(0, 64));
      if (!timingSafeEqual(a, b) || key !== ADMIN_KEY) {
        return c.json({ error: 'Not found' }, 404);
      }

      const token = randomBytes(32).toString('hex');
      await setAdminSession(token);
      return c.json({ token });
    } catch {
      return c.json({ error: 'Not found' }, 404);
    }
  });

  // POST /api/admin/logout (requires auth — handled at mount level)
  app.post('/logout', async (c) => {
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      await deleteAdminSession(authHeader.slice(7));
    }
    return c.json({ success: true });
  });

  // GET /api/admin/verify
  app.get('/verify', async (c) => {
    return c.json({ valid: true });
  });

  // GET /api/admin/dashboard
  app.get('/dashboard', async (c) => {
    try {
      const [stats] = await db`
        SELECT
          (SELECT COUNT(*) FROM users) AS total_users,
          (SELECT COUNT(*) FROM trades) AS total_trades,
          (SELECT COUNT(*) FROM trades WHERE result = 'win') AS total_wins,
          (SELECT COUNT(*) FROM trades WHERE result = 'loss') AS total_losses,
          (SELECT COALESCE(SUM(amount), 0) FROM deposits WHERE status = 'confirmed') AS total_deposited,
          (SELECT COALESCE(SUM(amount), 0) FROM withdrawals WHERE status = 'completed') AS total_withdrawn,
          (SELECT COUNT(*) FROM withdrawals WHERE status = 'pending') AS pending_withdrawals,
          (SELECT COUNT(*) FROM deposits WHERE status = 'pending') AS pending_deposits
      `;

      // Platform P&L: rewards paid out vs losses collected
      const [pnl] = await db`
        SELECT
          COALESCE(SUM(CASE WHEN result = 'win' AND insurance_used = 0 THEN reward ELSE 0 END), 0) AS total_paid_rewards,
          COALESCE(SUM(CASE WHEN result = 'loss' AND insurance_used = 0 THEN amount ELSE 0 END), 0) AS total_collected_losses,
          COALESCE(SUM(CASE WHEN result = 'win' AND insurance_used = 1 THEN reward ELSE 0 END), 0) AS insurance_win_rewards,
          COALESCE(SUM(CASE WHEN result = 'loss' AND insurance_used = 1 THEN amount ELSE 0 END), 0) AS insurance_refunds
        FROM trades
        WHERE result != 'pending'
      `;

      const collected = parseFloat(pnl.total_collected_losses as string);
      const paid = parseFloat(pnl.total_paid_rewards as string);
      const platformPnl = collected - paid;

      return c.json({ stats, pnl: { ...pnl, platformPnl } });
    } catch (err: any) {
      console.error('[Admin] dashboard error:', err);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // GET /api/admin/users?page=&limit=&search=
  app.get('/users', async (c) => {
    try {
      const page = Math.max(1, parseInt(c.req.query('page') || '1'));
      const limit = Math.min(100, parseInt(c.req.query('limit') || '20'));
      const offset = (page - 1) * limit;
      const search = c.req.query('search') || '';

      let total, rows;
      if (search) {
        const like = `%${search}%`;
        [{ total }] = await db`SELECT COUNT(*) AS total FROM users WHERE wallet_address LIKE ${like}`;
        rows = await db.unsafe(`
          SELECT id, wallet_address, referral_code, balance, ref_bonus, insurance_days_remaining, created_at
          FROM users WHERE wallet_address LIKE ${mysql.escape(like)}
          ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
        `);
      } else {
        [{ total }] = await db`SELECT COUNT(*) AS total FROM users`;
        rows = await db.unsafe(`
          SELECT id, wallet_address, referral_code, balance, ref_bonus, insurance_days_remaining, created_at
          FROM users ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
        `);
      }

      return c.json({ data: rows, total: parseInt(total as string), page, limit });
    } catch (err: any) {
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // GET /api/admin/deposits?page=&status=
  app.get('/deposits', async (c) => {
    try {
      const page = Math.max(1, parseInt(c.req.query('page') || '1'));
      const limit = Math.min(100, parseInt(c.req.query('limit') || '20'));
      const offset = (page - 1) * limit;
      const status = c.req.query('status');

      let total, rows;
      if (status && ['pending','confirmed','failed'].includes(status)) {
        [{ total }] = await db`SELECT COUNT(*) AS total FROM deposits WHERE status = ${status}`;
        rows = await db.unsafe(`
          SELECT d.*, u.wallet_address AS user_wallet
          FROM deposits d JOIN users u ON u.id = d.user_id
          WHERE d.status = ${mysql.escape(status)}
          ORDER BY d.created_at DESC LIMIT ${limit} OFFSET ${offset}
        `);
      } else {
        [{ total }] = await db`SELECT COUNT(*) AS total FROM deposits`;
        rows = await db.unsafe(`
          SELECT d.*, u.wallet_address AS user_wallet
          FROM deposits d JOIN users u ON u.id = d.user_id
          ORDER BY d.created_at DESC LIMIT ${limit} OFFSET ${offset}
        `);
      }
      return c.json({ data: rows, total: parseInt(total as string), page, limit });
    } catch (err: any) {
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // GET /api/admin/withdrawals?page=&status=
  app.get('/withdrawals', async (c) => {
    try {
      const page = Math.max(1, parseInt(c.req.query('page') || '1'));
      const limit = Math.min(100, parseInt(c.req.query('limit') || '20'));
      const offset = (page - 1) * limit;
      const status = c.req.query('status');

      let total, rows;
      if (status) {
        [{ total }] = await db`SELECT COUNT(*) AS total FROM withdrawals WHERE status = ${status}`;
        rows = await db.unsafe(`
          SELECT w.*, u.wallet_address AS user_wallet
          FROM withdrawals w JOIN users u ON u.id = w.user_id
          WHERE w.status = ${mysql.escape(status)}
          ORDER BY w.created_at DESC LIMIT ${limit} OFFSET ${offset}
        `);
      } else {
        [{ total }] = await db`SELECT COUNT(*) AS total FROM withdrawals`;
        rows = await db.unsafe(`
          SELECT w.*, u.wallet_address AS user_wallet
          FROM withdrawals w JOIN users u ON u.id = w.user_id
          ORDER BY w.created_at DESC LIMIT ${limit} OFFSET ${offset}
        `);
      }
      return c.json({ data: rows, total: parseInt(total as string), page, limit });
    } catch (err: any) {
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // POST /api/admin/withdrawals/:id/approve
  app.post('/withdrawals/:id/approve', async (c) => {
    try {
      const id = c.req.param('id');
      await approveWithdrawal(id);
      return c.json({ success: true });
    } catch (err: any) {
      return c.json({ error: err.message || 'Internal server error' }, 400);
    }
  });

  // POST /api/admin/withdrawals/:id/reject
  app.post('/withdrawals/:id/reject', async (c) => {
    try {
      const id = c.req.param('id');
      const { note } = await c.req.json<{ note?: string }>();
      await rejectWithdrawal(id, note || 'Rejected by admin');
      return c.json({ success: true });
    } catch (err: any) {
      return c.json({ error: err.message || 'Internal server error' }, 400);
    }
  });

  // POST /api/admin/withdrawals/:id/complete
  // Admin sends TRX manually, then inputs tx hash here to mark as completed
  app.post('/withdrawals/:id/complete', async (c) => {
    try {
      const id = c.req.param('id');
      const { txHash } = await c.req.json<{ txHash?: string }>();
      if (!txHash || txHash.trim().length < 10) {
        return c.json({ error: 'Valid TRON transaction hash required' }, 400);
      }
      await completeWithdrawal(id, txHash.trim());
      return c.json({ success: true });
    } catch (err: any) {
      return c.json({ error: err.message || 'Internal server error' }, 400);
    }
  });

  // POST /api/admin/users/:id/adjust-balance
  app.post('/users/:id/adjust-balance', async (c) => {
    try {
      const userId = parseInt(c.req.param('id'));
      const { amount, note } = await c.req.json<{ amount?: number; note?: string }>();
      if (typeof amount !== 'number') return c.json({ error: 'amount required' }, 400);

      await db.transaction(async (tx: any) => {
        const [user] = await tx`SELECT balance FROM users WHERE id = ${userId} FOR UPDATE`;
        if (!user) throw new Error('User not found');
        const newBalance = Math.max(0, Math.round((parseFloat(user.balance as string) + amount) * 1_000_000) / 1_000_000);
        await tx`UPDATE users SET balance = ${newBalance} WHERE id = ${userId}`;
      });

      const [updated] = await db`SELECT balance FROM users WHERE id = ${userId}`;
      const newBalance = parseFloat(updated.balance as string);

      // Broadcast real-time balance update to the user
      pubSub.publish(pubSub.userChannel(userId), {
        type: 'balance_update',
        balance: newBalance,
      });

      return c.json({ success: true, newBalance });
    } catch (err: any) {
      return c.json({ error: err.message || 'Internal server error' }, 400);
    }
  });

  return app;
}
