// ============================================
// REFERRAL ROUTES — /api/referral/*
// ============================================

import { Hono } from 'hono';
import mysql from 'mysql2';
import type { DB } from '../config/database.js';
import * as pubSub from '../services/redisPubSub.js';
import { randomUUID } from 'crypto';
import { getClaimableReferralInsurance } from '../services/insuranceService.js';

export function createReferralRoutes(db: DB): Hono {
  const app = new Hono();

  // GET /api/referral/stats
  app.get('/stats', async (c) => {
    try {
      const userId = c.get('userId') as number;

      const [user] = await db`
        SELECT referral_code, balance, ref_bonus FROM users WHERE id = ${userId}
      `;
      const [{ refCount }] = await db`
        SELECT COUNT(*) AS refCount FROM referrals WHERE referrer_id = ${userId}
      `;
      const [{ activeCount }] = await db`
        SELECT COUNT(*) AS activeCount
        FROM (
          SELECT r.referred_id
          FROM referrals r
          JOIN deposits d ON d.user_id = r.referred_id AND d.status = 'confirmed'
          WHERE r.referrer_id = ${userId}
          GROUP BY r.referred_id
          HAVING SUM(d.amount) >= 10
        ) AS active_refs
      `;

      const { claimable: unclaimedReferrals } = await getClaimableReferralInsurance(userId);

      return c.json({
        referralCode: user.referral_code,
        referralCount: parseInt(refCount as string),
        activeReferrals: parseInt(activeCount as string || '0'),
        unclaimedReferrals,
        refBonus: parseFloat(user.ref_bonus as string),
        canTransferBonus: parseFloat(user.ref_bonus as string) >= 10,
      });
    } catch (err: any) {
      console.error('[Referral] stats error:', err);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // GET /api/referral/activity?page=&limit=
  app.get('/activity', async (c) => {
    try {
      const userId = c.get('userId') as number;
      const page = Math.max(1, parseInt(c.req.query('page') || '1'));
      const limit = Math.min(50, parseInt(c.req.query('limit') || '20'));
      const offset = (page - 1) * limit;

      const [{ total }] = await db`SELECT COUNT(*) AS total FROM referrals WHERE referrer_id = ${userId}`;
      const rows = await db.unsafe(`
        SELECT
          u.wallet_address,
          r.created_at AS joined_at,
          COALESCE(SUM(d.amount), 0) AS total_deposit,
          COUNT(t.id) AS trade_count,
          COALESCE(SUM(t.amount), 0) AS trade_volume,
          COALESCE(SUM(t.amount), 0) * 0.003 AS bonus_earned
        FROM referrals r
        JOIN users u ON u.id = r.referred_id
        LEFT JOIN deposits d ON d.user_id = r.referred_id AND d.status = 'confirmed'
        LEFT JOIN trades t ON t.user_id = r.referred_id
        WHERE r.referrer_id = ${mysql.escape(userId)}
        GROUP BY r.referred_id, u.wallet_address, r.created_at
        ORDER BY r.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);

      return c.json({ data: rows, total: parseInt(total as string), page, limit });
    } catch (err: any) {
      console.error('[Referral] activity error:', err);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // POST /api/referral/transfer-bonus — transfer ref_bonus to balance
  app.post('/transfer-bonus', async (c) => {
    try {
      const userId = c.get('userId') as number;
      const { amount } = await c.req.json<{ amount?: number }>();
      if (!amount || amount < 10) return c.json({ error: 'Minimum transfer is 10 TRX' }, 400);

      await db.transaction(async (tx: any) => {
        const [user] = await tx`SELECT ref_bonus, balance FROM users WHERE id = ${userId} FOR UPDATE`;
        const refBonus = parseFloat(user.ref_bonus as string);
        if (refBonus < amount) throw new Error('Insufficient referral bonus');

        const newBonus = Math.round((refBonus - amount) * 1_000_000) / 1_000_000;
        const newBalance = Math.round((parseFloat(user.balance as string) + amount) * 1_000_000) / 1_000_000;

        await tx`UPDATE users SET ref_bonus = ${newBonus}, balance = ${newBalance} WHERE id = ${userId}`;
        await tx`INSERT INTO bonus_transfers (id, user_id, amount) VALUES (${randomUUID()}, ${userId}, ${amount})`;
      });

      const [updated] = await db`SELECT balance, ref_bonus FROM users WHERE id = ${userId}`;
      const newBalance = parseFloat(updated.balance as string);

      // Broadcast real-time balance update
      pubSub.publish(pubSub.userChannel(userId), {
        type: 'balance_update',
        balance: newBalance,
      });

      return c.json({
        success: true,
        balance: newBalance,
        refBonus: parseFloat(updated.ref_bonus as string),
      });
    } catch (err: any) {
      return c.json({ error: err.message || 'Internal server error' }, 400);
    }
  });

  // GET /api/referral/transfers?page=&limit=
  app.get('/transfers', async (c) => {
    try {
      const userId = c.get('userId') as number;
      const page = Math.max(1, parseInt(c.req.query('page') || '1'));
      const limit = Math.min(50, parseInt(c.req.query('limit') || '20'));
      const offset = (page - 1) * limit;

      const [{ total }] = await db`SELECT COUNT(*) AS total FROM bonus_transfers WHERE user_id = ${userId}`;
      const rows = await db.unsafe(`
        SELECT id, amount, created_at FROM bonus_transfers
        WHERE user_id = ${mysql.escape(userId)}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `);
      return c.json({ data: rows, total: parseInt(total as string), page, limit });
    } catch (err: any) {
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  return app;
}
