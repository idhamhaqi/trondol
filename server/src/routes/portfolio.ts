// ============================================
// PORTFOLIO ROUTES — /api/portfolio/*
// ============================================

import { Hono } from 'hono';
import type { DB } from '../config/database.js';

export function createPortfolioRoutes(db: DB): Hono {
  const app = new Hono();

  // GET /api/portfolio/stats
  app.get('/stats', async (c) => {
    try {
      const userId = c.get('userId') as number;

      const [user] = await db`
        SELECT wallet_address, balance, ref_bonus, insurance_days_remaining, created_at
        FROM users WHERE id = ${userId}
      `;

      const [tradeStats] = await db`
        SELECT
          COUNT(*) AS total_trades,
          SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS win_count,
          SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS loss_count,
          SUM(CASE WHEN insurance_used = 1 THEN 1 ELSE 0 END) AS insurance_used_count,
          SUM(amount) AS total_volume,
          SUM(CASE WHEN result = 'win' THEN reward ELSE 0 END) AS total_reward,
          SUM(CASE WHEN result = 'loss' AND insurance_used = 0 THEN amount ELSE 0 END) AS total_loss
        FROM trades WHERE user_id = ${userId} AND result != 'pending'
      `;

      const [depositStats] = await db`
        SELECT COALESCE(SUM(amount), 0) AS total_deposited
        FROM deposits WHERE user_id = ${userId} AND status = 'confirmed'
      `;

      const [withdrawalStats] = await db`
        SELECT COALESCE(SUM(amount), 0) AS total_withdrawn
        FROM withdrawals WHERE user_id = ${userId} AND status = 'completed'
      `;

      const totalTrades = parseInt(tradeStats.total_trades as string || '0');
      const winCount = parseInt(tradeStats.win_count as string || '0');
      const winRate = totalTrades > 0 ? Math.round((winCount / totalTrades) * 10000) / 100 : 0;

      return c.json({
        user: {
          walletAddress: user.wallet_address,
          balance: parseFloat(user.balance as string),
          refBonus: parseFloat(user.ref_bonus as string),
          insuranceDaysRemaining: parseInt(user.insurance_days_remaining as string),
          joinedAt: user.created_at,
        },
        trading: {
          totalTrades,
          winCount,
          lossCount: parseInt(tradeStats.loss_count as string || '0'),
          winRate,
          insuranceUsedCount: parseInt(tradeStats.insurance_used_count as string || '0'),
          totalVolume: parseFloat(tradeStats.total_volume as string || '0'),
          totalReward: parseFloat(tradeStats.total_reward as string || '0'),
          totalLoss: parseFloat(tradeStats.total_loss as string || '0'),
          netProfit: parseFloat(tradeStats.total_reward as string || '0') - parseFloat(tradeStats.total_loss as string || '0'),
        },
        financial: {
          totalDeposited: parseFloat(depositStats.total_deposited as string),
          totalWithdrawn: parseFloat(withdrawalStats.total_withdrawn as string),
        },
      });
    } catch (err: any) {
      console.error('[Portfolio] stats error:', err);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  return app;
}
