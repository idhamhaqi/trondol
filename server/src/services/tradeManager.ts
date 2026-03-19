// ============================================
// TRADE MANAGER — Daily candle settle logic
// LEADER-ONLY: runs timers & settlement
// ============================================
// Timing (WIB):
//   07:00 WIB → Settle yesterday's trades, fetch daily candle
//   07:00–15:00 WIB → Trading window OPEN   (= UTC 00:00–08:00)
//   15:00 WIB → Trading window CLOSED
// ============================================

import db from '../config/database.js';
import * as pubSub from './redisPubSub.js';
import { getDailyCandles } from './priceManager.js';
import { TRON_CONFIG } from '@trondex/shared';
import { redis } from '../config/redis.js';

const REWARD_RATE = parseFloat(process.env.TRADE_REWARD_RATE || '0.03');
const TRADE_WINDOW_START = parseInt(process.env.TRADE_WINDOW_START_WIB || '7');
const TRADE_WINDOW_END = parseInt(process.env.TRADE_WINDOW_END_WIB || '15');

// Helper to reliably get WIB time (+7 hours from UTC) regardless of server OS timezone
function getWibDate(): Date {
  return new Date(Date.now() + 7 * 3600 * 1000);
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let lastSettledDate = '';
let isRunning = false;

// ---- Public API ----

export function startTradeManager(): void {
  if (isRunning) return;
  isRunning = true;
  console.log('[TradeManager] Started (LEADER)');
  checkAndSettle();
  schedulerTimer = setInterval(checkAndSettle, 60_000);
}

export function stopTradeManager(): void {
  isRunning = false;
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  console.log('[TradeManager] Stopped');
}

export function isTradeWindowOpen(): boolean {
  const wib = getWibDate();
  const decimalHour = wib.getUTCHours() + wib.getUTCMinutes() / 60;
  return decimalHour >= TRADE_WINDOW_START && decimalHour < TRADE_WINDOW_END;
}

export function getTodayWIB(): string {
  return getWibDate().toISOString().slice(0, 10);
}

function getYesterdayWIB(): string {
  const d = getWibDate();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ---- Scheduler & Live Price Caching ----

async function checkAndSettle(): Promise<void> {
  if (!isRunning) return;
  const wib = getWibDate();
  const hourWIB = wib.getUTCHours();
  const minuteWIB = wib.getUTCMinutes();

  // 1. Snapshot Live Price exactly between 07:00 and 07:02 WIB
  if (hourWIB === TRADE_WINDOW_START && minuteWIB >= 0 && minuteWIB <= 2) {
    const yesterday = getYesterdayWIB();
    if (lastSettledDate !== yesterday) {
      await cacheLivePrice(yesterday);
    }
  }

  // 2. Continually retry and execute settlements for ALL pending dates directly
  await retryPendingSettlement();
}

async function getLivePriceFallback(): Promise<number> {
  const sources = [
    'https://api.binance.vision/api/v3/ticker/price?symbol=TRXUSDT',
    'https://api.bybit.com/v5/market/tickers?category=spot&symbol=TRXUSDT',
    'https://api.gateio.ws/api/v4/spot/tickers?currency_pair=TRX_USDT'
  ];
  for (const url of sources) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (url.includes('binance')) return parseFloat(data.price);
      if (url.includes('bybit')) return parseFloat(data.result.list[0].lastPrice);
      if (url.includes('gate')) return parseFloat(data[0].last);
    } catch { continue; }
  }
  return 0;
}

async function cacheLivePrice(tradeDate: string): Promise<void> {
  const lockKey = `trondex:cache_price_lock:${tradeDate}`;
  const locked = await redis.set(lockKey, '1', 'EX', 1800, 'NX');
  if (locked !== 'OK') return;

  console.log(`[TradeManager] Capturing live stream price for ${tradeDate} exactly at 07:00 WIB...`);
  try {
    const { getLatestPrice } = await import('./priceManager.js');
    let liveVal = getLatestPrice()?.price || 0;
    if (liveVal <= 0) {
       liveVal = await getLivePriceFallback();
    }
    
    if (liveVal <= 0) {
      console.error(`[TradeManager] Failed to fetch live price at 07:00 WIB for ${tradeDate}`);
      await redis.del(lockKey); // release to retry
      return;
    }

    const candles = await getDailyCandles(5); 
    if (candles.length < 2) {
      console.error(`[TradeManager] Not enough historical candles to determine prevClose`);
      await redis.del(lockKey);
      return;
    }
    
    const targetTime = new Date(tradeDate + 'T00:00:00Z').getTime();
    const prevCandle = candles.find(c => c.openTime === targetTime);
    if (!prevCandle) {
       console.error(`[TradeManager] Prev candle not found for date ${tradeDate} in recent candles`);
       await redis.del(lockKey);
       return;
    }

    const prevClose = prevCandle.close;
    const direction = liveVal >= prevClose ? 'up' : 'down';

    await db.unsafe(`
      INSERT IGNORE INTO daily_results (trade_date, open_price, prev_close, direction)
      VALUES ('${tradeDate}', ${liveVal}, ${prevClose}, '${direction}')
    `);
    
    lastSettledDate = tradeDate;
    console.log(`[TradeManager] Cached 07:00 WIB live price for ${tradeDate} -> ${liveVal} (${direction})`);
  } catch (err: any) {
    console.error(`[TradeManager] cacheLivePrice error:`, err.message);
    await redis.del(lockKey);
  }
}

async function settleHistoricalDay(tradeDate: string): Promise<void> {
  const lockKey = `trondex:settle_lock:${tradeDate}`;
  const locked = await redis.set(lockKey, '1', 'EX', 1800, 'NX');
  if (locked !== 'OK') return;

  try {
    let [resultRow] = await db`SELECT open_price, direction, prev_close FROM daily_results WHERE trade_date = ${tradeDate}`;
    
    let openNextDay = 0;
    let direction: 'up' | 'down' = 'up';
    let prevClose = 0;

    if (resultRow) {
       openNextDay = parseFloat(resultRow.open_price as string);
       direction = resultRow.direction as 'up' | 'down';
       prevClose = parseFloat(resultRow.prev_close as string);
    } else {
       // fallback to historical candles if we completely missed caching it at 07:00 WIB
       const limit = 30;
       const candles = await getDailyCandles(limit);
       
       const targetTime = new Date(tradeDate + 'T00:00:00Z').getTime();
       const nextDayTime = targetTime + 86400_000;
       
       const prevCandle = candles.find(c => c.openTime === targetTime);
       const nextCandle = candles.find(c => c.openTime === nextDayTime);
       
       if (!prevCandle || !nextCandle) {
         console.warn(`[TradeManager] Historical candles missing for ${tradeDate}. Cannot settle yet.`);
         await redis.del(lockKey);
         return;
       }
       openNextDay = nextCandle.open;
       prevClose = prevCandle.close;
       direction = openNextDay >= prevClose ? 'up' : 'down';
       
       await db.unsafe(`
         INSERT IGNORE INTO daily_results (trade_date, open_price, prev_close, direction)
         VALUES ('${tradeDate}', ${openNextDay}, ${prevClose}, '${direction}')
       `);
       console.log(`[TradeManager] Saved BACKUP historical price for ${tradeDate} -> ${openNextDay} (${direction})`);
    }

    const pendingTrades = await db`
      SELECT t.id, t.user_id, t.side, t.amount, t.entry_price, u.insurance_days_remaining
      FROM trades t
      JOIN users u ON u.id = t.user_id
      WHERE t.trade_date = ${tradeDate} AND t.result = 'pending'
    `;

    if (pendingTrades.length > 0) {
      console.log(`[TradeManager] Settling ${pendingTrades.length} trades for ${tradeDate}`);
      for (const trade of pendingTrades) {
        await settleTrade(trade, direction, openNextDay);
      }

      pubSub.publish(pubSub.broadcastChannel(), {
        type: 'daily_result',
        data: { trade_date: tradeDate, open_price: openNextDay, prev_close: prevClose, direction },
      });
    }

  } catch (err: any) {
    console.error(`[TradeManager] Historical settle error for ${tradeDate}:`, err.message);
    await redis.del(lockKey);
  }
}

async function settleTrade(trade: any, globalDirection: 'up' | 'down', openNextDay: number): Promise<void> {
  const entryPrice = parseFloat(trade.entry_price as string);
  const side = trade.side as 'up' | 'down';
  
  // Real logic: compare individual entry price to exit price
  let won = false;
  if (side === 'up') {
    won = openNextDay >= entryPrice;
  } else {
    won = openNextDay < entryPrice;
  }

  const amount = parseFloat(trade.amount as string);
  const insuranceDays = parseInt(trade.insurance_days_remaining as string);

  try {
    await db.transaction(async (tx: any) => {
      const [user] = await tx`SELECT id, balance, insurance_days_remaining FROM users WHERE id = ${trade.user_id} FOR UPDATE`;
      const balance = parseFloat(user.balance as string);
      const currentInsurance = parseInt(user.insurance_days_remaining as string);

      let newBalance = balance;
      let reward = 0;
      let insuranceUsed = 0;
      let resultStr = won ? 'win' : 'loss';

      // REWARD_RATE is 0.03 (3%) for both profit and loss margin
      const margin = Math.round(amount * REWARD_RATE * 1_000_000) / 1_000_000;

      if (won) {
        // WIN: Profit +3%. Return collateral (amount) + profit (margin)
        reward = margin;
        newBalance = Math.round((balance + amount + reward) * 1_000_000) / 1_000_000;
        await tx`UPDATE users SET balance = ${newBalance} WHERE id = ${trade.user_id}`;
      } else {
        // LOSS
        if (currentInsurance > 0) {
          // Insurance Covers the 3% loss.
          // Return full collateral (amount), consume 1 insurance day
          reward = 0; // Net 0 loss
          insuranceUsed = 1;
          newBalance = Math.round((balance + amount) * 1_000_000) / 1_000_000;
          await tx`UPDATE users SET balance = ${newBalance}, insurance_days_remaining = insurance_days_remaining - 1 WHERE id = ${trade.user_id}`;
          // To tell frontend it's a refunded loss, we can use a custom result string
          resultStr = 'refunded';
        } else {
          // Pure Loss: Lose 3% margin.
          // Return collateral MINUS margin (e.g. 1000 - 30 = 970)
          // We represent this in DB with a negative reward
          reward = -margin;
          newBalance = Math.round((balance + amount + reward) * 1_000_000) / 1_000_000;
          await tx`UPDATE users SET balance = ${newBalance} WHERE id = ${trade.user_id}`;
        }
      }

      await tx`
        UPDATE trades SET
          result = ${resultStr},
          open_next_day = ${openNextDay},
          reward = ${reward},
          insurance_used = ${insuranceUsed},
          settled_at = NOW()
        WHERE id = ${trade.id}
      `;
    });

    const [updated] = await db`SELECT balance FROM users WHERE id = ${trade.user_id}`;
    pubSub.publish(pubSub.userChannel(trade.user_id), {
      type: 'balance_update',
      balance: parseFloat(updated.balance as string),
    });
    pubSub.publish(pubSub.userChannel(trade.user_id), {
      type: 'trade_result',
      data: { id: trade.id, result: won ? 'win' : 'loss', reward: won ? amount * REWARD_RATE : 0 },
    });

    // Referrer gets 0.3% bonus — inside try/catch, non-blocking
    // Note: runs outside main TX intentionally (non-critical, best-effort)
    await creditReferrerBonus(trade.user_id, amount);
  } catch (err: any) {
    console.error(`[TradeManager] Error settling trade ${trade.id}:`, err.message);
  }
}

async function creditReferrerBonus(userId: number, tradeAmount: number): Promise<void> {
  try {
    const [ref] = await db`SELECT referrer_id FROM referrals WHERE referred_id = ${userId}`;
    if (!ref) return;
    const bonus = Math.round(tradeAmount * 0.003 * 1_000_000) / 1_000_000;
    await db`UPDATE users SET ref_bonus = ref_bonus + ${bonus} WHERE id = ${ref.referrer_id}`;
  } catch { /* non-critical */ }
}

// ---- Place Trade ----

export async function placeTrade(
  userId: number,
  side: 'up' | 'down',
  amount: number,
  entryPrice: number
): Promise<string> {
  if (!isTradeWindowOpen()) {
    throw new Error('Trading window is closed. Open 00:00–08:00 UTC (07:00–15:00 WIB).');
  }

  if (amount < 1) throw new Error('Minimum trade amount is 1 TRX');

  // Note: No longer blocking on yesterday's daily_result.
  // First-day traders and edge cases can trade freely within the window.

  const tradeDate = getTodayWIB();
  let tradeId = '';

  await db.transaction(async (tx: any) => {
    // Lock user row first — prevents concurrent place-trade race conditions
    const [user] = await tx`SELECT id, balance FROM users WHERE id = ${userId} FOR UPDATE`;
    if (!user) throw new Error('User not found');

    // Check for duplicate trade INSIDE the transaction (TOCTOU fix)
    const [existing] = await tx`SELECT id FROM trades WHERE user_id = ${userId} AND trade_date = ${tradeDate}`;
    if (existing) throw new Error('You have already placed a trade today.');

    const balance = parseFloat(user.balance as string);
    if (balance < amount) throw new Error('Insufficient balance');

    const newBalance = Math.round((balance - amount) * 1_000_000) / 1_000_000;
    await tx`UPDATE users SET balance = ${newBalance} WHERE id = ${userId}`;

    tradeId = crypto.randomUUID();
    await tx`
      INSERT INTO trades (id, user_id, trade_date, side, amount, entry_price, result)
      VALUES (${tradeId}, ${userId}, ${tradeDate}, ${side}, ${amount}, ${entryPrice}, 'pending')
    `;
  });

  const [updated] = await db`SELECT balance FROM users WHERE id = ${userId}`;
  pubSub.publish(pubSub.userChannel(userId), {
    type: 'balance_update',
    balance: parseFloat(updated.balance as string),
  });

  return tradeId;
}

// ---- On startup: re-settle missed settlements ----
export async function retryPendingSettlement(): Promise<void> {
  const wib = getWibDate();
  const today = getTodayWIB();
  const yesterday = getYesterdayWIB();
  const hourWIB = wib.getUTCHours();
  
  const pendingDates = await db`
    SELECT DISTINCT DATE_FORMAT(trade_date, '%Y-%m-%d') AS t_date 
    FROM trades 
    WHERE result = 'pending'
  `;

  for (const row of pendingDates) {
    const tDate = row.t_date as string;
    if (tDate === today) continue; // Can't settle today yet
    if (tDate === yesterday && hourWIB < TRADE_WINDOW_START) continue; // Wait until 07:00

    // Cleanup orphaned locks if they exist (helps recovery after crash)
    const lockKey = `trondex:settle_lock:${tDate}`;
    const lockExists = await redis.exists(lockKey);
    if (lockExists) {
       await redis.del(lockKey);
    }

    await settleHistoricalDay(tDate);
  }
}
