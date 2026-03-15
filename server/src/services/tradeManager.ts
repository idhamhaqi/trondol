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

// ---- Scheduler ----

async function checkAndSettle(): Promise<void> {
  if (!isRunning) return;
  const wib = getWibDate();
  const hourWIB = wib.getUTCHours();
  const minuteWIB = wib.getUTCMinutes();

  // Bug fix: expanded window from 2min to 59min.
  // Delaying settlement to 07:05 WIB to ensure Binance candle is fully published.
  if (hourWIB === TRADE_WINDOW_START && minuteWIB >= 5) {
    const yesterday = getYesterdayWIB();
    if (lastSettledDate === yesterday) return; // already settled this session
    await settleDay(yesterday);
  }
}

async function settleDay(tradeDate: string): Promise<void> {
  const lockKey = `trondex:settle_lock:${tradeDate}`;
  // Extended lock TTL to 30min to cover large settlement batches
  const locked = await redis.set(lockKey, '1', 'EX', 1800, 'NX');
  if (locked !== 'OK') {
    console.log(`[TradeManager] Settlement for ${tradeDate} already running or locked`);
    return;
  }

  console.log(`[TradeManager] Settling trades for ${tradeDate}...`);
  try {
    // Get last 3 daily candles to handle partial-candle edge case
    const candles = await getDailyCandles(3);
    if (candles.length < 2) {
      console.error('[TradeManager] Not enough candles from Binance — aborting settlement');
      return;
    }

    const prevCandle = candles[candles.length - 2];
    const todayCandle = candles[candles.length - 1];

    // todayCandle.open is the 00:00 UTC opening price — valid from the very first second.
    // Even if todayCandle is still "forming" (closeTime in the future), the open price
    // is already locked in and is the correct settlement reference.
    // Only log a warning if open is 0 (rare API glitch).
    if (!todayCandle.open || todayCandle.open <= 0) {
      console.error('[TradeManager] todayCandle.open is 0 or missing — aborting settlement');
      return;
    }

    const openNextDay = todayCandle.open;
    const prevClose = prevCandle.close;
    const direction: 'up' | 'down' = openNextDay >= prevClose ? 'up' : 'down';

    console.log(`[TradeManager] Candle data — prev close: ${prevClose}, today open: ${openNextDay}, direction: ${direction}`);

    // Record daily result
    await db.unsafe(`
      INSERT IGNORE INTO daily_results (trade_date, open_price, prev_close, direction)
      VALUES ('${tradeDate}', ${openNextDay}, ${prevClose}, '${direction}')
    `);

    const pendingTrades = await db`
      SELECT t.id, t.user_id, t.side, t.amount, t.entry_price,
             u.insurance_days_remaining
      FROM trades t
      JOIN users u ON u.id = t.user_id
      WHERE t.trade_date = ${tradeDate} AND t.result = 'pending'
    `;

    for (const trade of pendingTrades) {
      await settleTrade(trade, direction, openNextDay);
    }

    // Broadcast result
    pubSub.publish(pubSub.broadcastChannel(), {
      type: 'daily_result',
      data: { trade_date: tradeDate, open_price: openNextDay, prev_close: prevClose, direction },
    });

    lastSettledDate = tradeDate;
    console.log(`[TradeManager] Settlement done for ${tradeDate} — direction: ${direction}`);
  } catch (err: any) {
    console.error('[TradeManager] Settlement error:', err.message);
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
  const yesterday = getYesterdayWIB();
  const wib = getWibDate();
  const hourWIB = wib.getUTCHours();

  const [{ cnt }] = await db`
    SELECT COUNT(*) AS cnt FROM trades WHERE trade_date = ${yesterday} AND result = 'pending'
  `;
  const pendingCount = parseInt(cnt as string);

  // Always clean up stale lock on startup so server restart can retry
  // A lock from a previous crashed run would otherwise block for 30min
  const lockKey = `trondex:settle_lock:${yesterday}`;
  const lockExists = await redis.exists(lockKey);
  if (lockExists) {
    if (pendingCount === 0) {
      // All trades already settled — lock is orphaned, clean it up
      await redis.del(lockKey);
      console.log(`[TradeManager] Cleaned up orphaned lock for ${yesterday} (no pending trades)`);
      return;
    }
    // Pending trades exist but lock is held — delete it so we can retry
    // (previous server run likely crashed mid-settlement)
    await redis.del(lockKey);
    console.log(`[TradeManager] Cleared stale lock for ${yesterday}, will retry settlement`);
  }

  if (pendingCount === 0) return;

  const minuteWIB = wib.getUTCMinutes();
  if (hourWIB < TRADE_WINDOW_START || (hourWIB === TRADE_WINDOW_START && minuteWIB < 5)) {
    console.log(`[TradeManager] ${cnt} pending trades for ${yesterday}, but before 07:05 WIB — will settle at 07:05`);
    return;
  }

  console.log(`[TradeManager] Re-settling ${pendingCount} missed trades for ${yesterday}`);
  await settleDay(yesterday);
}
