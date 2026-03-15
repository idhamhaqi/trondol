// ============================================
// TRADE ROUTES — /api/trade/*
// ============================================

import { Hono } from 'hono';
import mysql from 'mysql2';
import type { DB } from '../config/database.js';
import { placeTrade, isTradeWindowOpen, getTodayWIB } from '../services/tradeManager.js';
import { getLatestPrice } from '../services/priceManager.js';

export function createTradeRoutes(db: DB): Hono {
  const app = new Hono();

  // POST /api/trade/place
  app.post('/place', async (c) => {
    try {
      const userId = c.get('userId') as number;
      const walletAddress = c.get('walletAddress') as string;
      const { side, amount } = await c.req.json<{ side?: string; amount?: number }>();

      if (!side || !['up', 'down'].includes(side)) {
        return c.json({ error: 'side must be "up" or "down"' }, 400);
      }
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return c.json({ error: 'Invalid amount' }, 400);
      }

      const priceData = await getLatestPrice();
      let entryPrice = 0;
      if (priceData) {
        entryPrice = (priceData as any).price || 0;
      }
      if (!entryPrice) {
        // Fallback: fetch REST from alternative sources (since Binance might be blocked)
        const sources = [
          'https://api.bybit.com/v5/market/tickers?category=spot&symbol=TRXUSDT',
          'https://api.gateio.ws/api/v4/spot/tickers?currency_pair=TRX_USDT'
        ];

        for (const url of sources) {
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
            if (!res.ok) continue;
            const data = await res.json();
            
            if (url.includes('bybit')) {
              entryPrice = parseFloat(data.result.list[0].lastPrice);
            } else if (url.includes('gate')) {
              entryPrice = parseFloat(data[0].last);
            }
            
            if (entryPrice > 0) break;
          } catch {
            continue;
          }
        }

        if (!entryPrice) {
          return c.json({ error: 'Price feed unavailable globally. Please try again in a moment.' }, 503);
        }
      }

      const tradeId = await placeTrade(userId, side as 'up' | 'down', amount, entryPrice);

      return c.json({ success: true, tradeId, entryPrice });
    } catch (err: any) {
      console.error('[Trade] place error:', err);
      return c.json({ error: err.message || 'Internal server error' }, 400);
    }
  });

  // GET /api/trade/status — today's trade status
  app.get('/status', async (c) => {
    try {
      const userId = c.get('userId') as number;
      const today = getTodayWIB();

      const [trade] = await db`
        SELECT t.id, t.trade_date, t.side, t.amount, t.entry_price, t.open_next_day,
               t.result, t.reward, t.insurance_used, t.created_at
        FROM trades t
        WHERE t.user_id = ${userId} AND t.trade_date = ${today}
      `;

      const windowOpen = isTradeWindowOpen();
      const now = new Date();

      // Get yesterday's result
      const yesterday = new Date(now);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      const [dailyResult] = await db`
        SELECT * FROM daily_results WHERE trade_date = ${yesterdayStr}
      `;

      return c.json({
        todayTrade: trade || null,
        windowOpen,
        currentUTCHour: now.getUTCHours(),
        latestResult: dailyResult || null,
      });
    } catch (err: any) {
      console.error('[Trade] status error:', err);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // GET /api/trade/history?page=&limit=
  app.get('/history', async (c) => {
    try {
      const userId = c.get('userId') as number;
      const page = Math.max(1, parseInt(c.req.query('page') || '1'));
      const limit = Math.min(50, parseInt(c.req.query('limit') || '20'));
      const offset = (page - 1) * limit;

      const [{ total }] = await db`SELECT COUNT(*) AS total FROM trades WHERE user_id = ${userId}`;
      const trades = await db.unsafe(`
        SELECT t.id, t.trade_date, t.side, t.amount, t.entry_price, t.open_next_day,
               t.result, t.reward, t.insurance_used, t.created_at, t.settled_at,
               dr.direction AS daily_direction
        FROM trades t
        LEFT JOIN daily_results dr ON dr.trade_date = t.trade_date
        WHERE t.user_id = ${mysql.escape(userId)}
        ORDER BY t.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);

      return c.json({ data: trades, total: parseInt(total as string), page, limit });
    } catch (err: any) {
      console.error('[Trade] history error:', err);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // GET /api/trade/results?limit=
  app.get('/results', async (c) => {
    try {
      const limit = Math.min(30, parseInt(c.req.query('limit') || '10'));
      const results = await db.unsafe(`
        SELECT * FROM daily_results ORDER BY trade_date DESC LIMIT ${limit}
      `);
      return c.json({ data: results });
    } catch (err: any) {
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  return app;
}
