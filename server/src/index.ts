// ============================================
// SERVER ENTRY POINT — Bun.serve + Hono + WS
// Supports multi-instance via Redis leader election
// ============================================

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import db from './config/database.js';
import { redis } from './config/redis.js';
import { initDatabase } from './services/dbInit.js';
import { startPubSub, subscribe, priceChannel, broadcastChannel, userChannel, orderbookChannel } from './services/redisPubSub.js';
import { startLeaderElection, onBecomeLeader, onLoseLeader } from './services/leaderElection.js';
import { startPriceManager, stopPriceManager } from './services/priceManager.js';
import { startTradeManager, stopTradeManager, retryPendingSettlement } from './services/tradeManager.js';
import { retryPendingDeposits } from './services/depositService.js';
import { requeueApprovedWithdrawals } from './services/withdrawalService.js';
import { authMw } from './middleware/auth.js';
import { adminMw } from './middleware/adminAuth.js';
import { createAuthRoutes } from './routes/auth.js';
import { createTradeRoutes } from './routes/trade.js';
import { createDepositRoutes } from './routes/deposit.js';
import { createWithdrawalRoutes } from './routes/withdrawal.js';
import { createReferralRoutes } from './routes/referral.js';
import { createPortfolioRoutes } from './routes/portfolio.js';
import { createInsuranceRoutes } from './routes/insurance.js';
import { createAdminRoutes } from './routes/admin.js';
import {
  handleWsOpen,
  handleWsClose,
  handleWsMessage,
  broadcastToAll,
  broadcastToUser,
  broadcastPrice,
  broadcastOrderBook,
  upgradeToWebSocket,
  type WsData,
} from './websocket/handlers.js';

const PORT = parseInt(process.env.PORT || '3001');
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3003').split(',').map(s => s.trim());

// ─── Hono App ────────────────────────────────

const app = new Hono();

app.use('*', cors({ origin: CORS_ORIGINS, credentials: true }));
app.use('*', logger());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

// ─── Auth routes (public) ────────────────────
app.route('/api/auth', createAuthRoutes(db));

// ─── Admin routes ─────────────────────────────
// /login is public (no adminMw), all other /api/admin/* require adminMw
const adminApp = createAdminRoutes(db);

// ⚠️ Login must be handled BEFORE adminMw, inline here:
app.post('/api/admin/login', async (c) => {
  try {
    const { key } = await c.req.json<{ key?: string }>();
    const ADMIN_KEY = process.env.ADMIN_KEY || 'change_this_admin_key';
    const { randomBytes, timingSafeEqual } = await import('crypto');
    const { setAdminSession } = await import('./config/redis.js');
    if (!key) return c.json({ error: 'Not found' }, 404);
    const a = Buffer.from(key.padEnd(64).slice(0, 64));
    const b = Buffer.from(ADMIN_KEY.padEnd(64).slice(0, 64));
    if (!timingSafeEqual(a, b) || key !== ADMIN_KEY) return c.json({ error: 'Not found' }, 404);
    const token = randomBytes(32).toString('hex');
    await setAdminSession(token);
    return c.json({ token });
  } catch {
    return c.json({ error: 'Not found' }, 404);
  }
});

app.use('/api/admin/verify', adminMw);
app.use('/api/admin/logout', adminMw);
app.use('/api/admin/dashboard', adminMw);
app.use('/api/admin/users/*', adminMw);
app.use('/api/admin/deposits*', adminMw);
app.use('/api/admin/withdrawals/*', adminMw);
app.route('/api/admin', adminApp);

// ─── Protected user routes ────────────────────
app.use('/api/trade/*', authMw);
app.route('/api/trade', createTradeRoutes(db));

app.use('/api/deposit/*', authMw);
app.route('/api/deposit', createDepositRoutes(db));

app.use('/api/withdrawal/*', authMw);
app.route('/api/withdrawal', createWithdrawalRoutes(db));

app.use('/api/referral/*', authMw);
app.route('/api/referral', createReferralRoutes(db));

app.use('/api/portfolio/*', authMw);
app.route('/api/portfolio', createPortfolioRoutes(db));

app.use('/api/insurance/*', authMw);
app.route('/api/insurance', createInsuranceRoutes(db));

// ─── Public chart proxy (no auth) ─────────────
// Browser can't reach api.binance.vision directly — proxy via server
const BINANCE_VISION = 'https://api.binance.vision/api/v3';

app.get('/api/chart/klines', async (c) => {
  const symbol = c.req.query('symbol') || 'TRXUSDT';
  const interval = c.req.query('interval') || '1D';
  const limit = Math.min(500, parseInt(c.req.query('limit') || '180'));
  try {
    const res = await fetch(
      `${BINANCE_VISION}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    const data = await res.json();
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message }, 502);
  }
});

app.get('/api/chart/ticker', async (c) => {
  const symbol = c.req.query('symbol') || 'TRXUSDT';
  try {
    const res = await fetch(
      `${BINANCE_VISION}/ticker/24hr?symbol=${symbol}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    const data = await res.json();
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message }, 502);
  }
});


// ─── Startup ─────────────────────────────────
async function startup(): Promise<void> {
  console.log('[Server] Starting Trondex server...');

  // Init DB tables
  await initDatabase(db);

  // Start Redis pub/sub relay
  await startPubSub();

  // Subscribe to price channel → relay to WS clients
  await subscribe(priceChannel(), (data) => {
    broadcastPrice(data);
  });

  // Subscribe to orderbook channel → relay to WS clients
  await subscribe(orderbookChannel(), (data) => {
    broadcastOrderBook(data);
  });

  // Subscribe to broadcast channel → relay to all WS
  await subscribe(broadcastChannel(), (data) => {
    broadcastToAll(data);
  });

  // Subscribe to user channels → (handled per-connection via topic subscription)
  // User channel messages come through userChannel(userId) format
  // We need a pattern subscription approach:
  // Instead, we check all user channels by intercepting userChannel publishes
  // and routing to specific WS subscribers

  // Leader election
  onBecomeLeader(() => {
    startPriceManager();
    startTradeManager();
  });

  onLoseLeader(() => {
    stopPriceManager();
    stopTradeManager();
  });

  await startLeaderElection();

  // Startup recovery tasks
  await retryPendingDeposits();
  await requeueApprovedWithdrawals();
  await retryPendingSettlement();

  console.log(`[Server] Trondex server ready on port ${PORT}`);
}

// ─── Bun.serve ───────────────────────────────

startup().then(() => {
  const server = Bun.serve<WsData>({
    port: PORT,
    hostname: '0.0.0.0',

    async fetch(req, server) {
      const url = new URL(req.url);

      // WebSocket upgrade
      if (url.pathname === '/ws') {
        return upgradeToWebSocket(req, server);
      }

      // Handle HTTP via Hono
      return app.fetch(req, { server });
    },

    websocket: {
      open: handleWsOpen,
      message: handleWsMessage,
      close: handleWsClose,
      // Anti memory-leak: auto-close idle connections
      idleTimeout: 120, // 2 minutes
      // Compression
      perMessageDeflate: false,
    },

    // Anti memory-leak settings
    maxRequestBodySize: 1024 * 1024, // 1MB max body
  });

  // Subscribe to user-specific messages from Redis
  // Pattern: trondex:user:{id} — route to specific WS client
  (async () => {
    const { redisSub } = await import('./config/redis.js');
    redisSub.on('pmessage', (_pattern: string, channel: string, raw: string) => {
      try {
        const match = channel.match(/^trondex:user:(\d+)$/);
        if (match) {
          const userId = parseInt(match[1]);
          const data = JSON.parse(raw);
          broadcastToUser(userId, data);
        }
      } catch { /* ignore */ }
    });
    await redisSub.psubscribe('trondex:user:*');
  })();

  console.log(`[Server] Listening at http://0.0.0.0:${PORT}`);
  console.log(`[Server] WebSocket at ws://0.0.0.0:${PORT}/ws`);
}).catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});

// ─── Graceful shutdown ───────────────────────
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down...');
  stopPriceManager();
  stopTradeManager();
  redis.quit();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down...');
  stopPriceManager();
  stopTradeManager();
  redis.quit();
  process.exit(0);
});
