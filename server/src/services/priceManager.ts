// ============================================
// PRICE MANAGER — Binance WebSocket stream
// TRON/USDT real-time price feed
// LEADER-ONLY for sourcing, all instances relay via Redis
// Endpoints: binance.vision (public, globally accessible)
// ============================================

import { type PriceTick } from '@trondex/shared';
import * as pubSub from './redisPubSub.js';

let ws: WebSocket | null = null;
let wsEndpointIndex = 0;
let lastTickTime = 0;
let latestPrice: PriceTick | null = null;
let isRunning = false;

const STALE_THRESHOLD_MS = 20_000;

// --- Use binance.vision endpoints with multiplex streams ---
const WS_ENDPOINTS = [
  'wss://data-stream.binance.vision/stream?streams=trxusdt@ticker/trxusdt@depth20@100ms',
  'wss://stream.binance.vision:9443/stream?streams=trxusdt@ticker/trxusdt@depth20@100ms',
  'wss://stream.binance.vision:443/stream?streams=trxusdt@ticker/trxusdt@depth20@100ms',
];

const REST_TICKER = 'https://api.binance.vision/api/v3/ticker/24hr?symbol=TRXUSDT';
const REST_KLINES = 'https://api.binance.vision/api/v3/klines';

export function getLatestPrice(): PriceTick | null {
  return latestPrice;
}

export function startPriceManager(): void {
  if (isRunning) return;
  isRunning = true;
  console.log('[Price] Starting price manager (LEADER)');
  // Fetch REST immediately so we have a price before WS connects
  fetchRestFallback();
  connectBinanceWs();
  startStalenessCheck();
}

export function stopPriceManager(): void {
  isRunning = false;
  ws?.close();
  ws = null;
  console.log('[Price] Stopped price manager');
}

function connectBinanceWs(): void {
  if (!isRunning) return;
  const url = WS_ENDPOINTS[wsEndpointIndex % WS_ENDPOINTS.length];
  console.log(`[Price] Connecting to Binance WS: ${url}`);

  try {
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[Price] Binance WS connected ✓');
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data as string);
        // Multiplex streams return { stream, data }
        if (payload.stream === 'trxusdt@ticker') {
          handleBinanceTick(payload.data);
        } else if (payload.stream === 'trxusdt@depth20@100ms') {
          handleBinanceDepth(payload.data);
        } else if (payload.c || payload.lastPrice) {
          // Fallback if not multiplex
          handleBinanceTick(payload);
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => {
      console.warn('[Price] WS error, switching endpoint');
    };

    ws.onclose = () => {
      if (!isRunning) return;
      wsEndpointIndex++;
      const nextEndpoint = WS_ENDPOINTS[wsEndpointIndex % WS_ENDPOINTS.length];
      console.warn(`[Price] WS closed, reconnecting to ${nextEndpoint} in 5s...`);
      setTimeout(connectBinanceWs, 5000);
    };
  } catch (err) {
    console.error('[Price] Failed to create WS:', err);
    wsEndpointIndex++;
    setTimeout(connectBinanceWs, 5000);
  }
}

function handleBinanceDepth(data: any): void {
  if (!data || !data.bids || !data.asks) return;
  
  // Publish orderbook depth to Redis
  pubSub.publish(pubSub.orderbookChannel(), {
    type: 'orderbook_update',
    bids: data.bids,
    asks: data.asks
  });
}

function handleBinanceTick(data: any): void {
  if (!data || (!data.c && !data.lastPrice)) return;

  const price = parseFloat(data.c || data.lastPrice);
  const change24h = parseFloat(data.P || data.priceChangePercent || '0');
  const high24h = parseFloat(data.h || data.highPrice || '0');
  const low24h = parseFloat(data.l || data.lowPrice || '0');
  const volume24h = parseFloat(data.v || data.volume || '0');

  if (isNaN(price) || price <= 0) return;

  latestPrice = {
    symbol: 'TRXUSDT',
    price,
    change24h,
    high24h,
    low24h,
    volume24h,
    timestamp: Date.now(),
  };

  lastTickTime = Date.now();

  // Publish to Redis → all instances → WS clients
  pubSub.publish(pubSub.priceChannel(), { type: 'price_update', data: latestPrice });
  pubSub.setLatestPrice(latestPrice);
}

function startStalenessCheck(): void {
  setInterval(() => {
    if (!isRunning) return;
    const age = Date.now() - lastTickTime;
    if (lastTickTime > 0 && age > STALE_THRESHOLD_MS) {
      console.warn(`[Price] WS stale (${Math.round(age / 1000)}s), fetching from REST`);
      fetchRestFallback();
    }
  }, 5000);
}

async function fetchRestFallback(): Promise<void> {
  try {
    const res = await fetch(REST_TICKER, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return;
    const data = await res.json();
    handleBinanceTick(data);
  } catch (err: any) {
    console.warn('[Price] REST fallback failed:', err.message);
  }
}

// ---- Get historical daily candle — multi-source fallback ----
// Tries Binance first, falls back to Bybit → KuCoin → Gate.io
// Used for trade settlement (daily open/close)

export interface DailyCandle {
  openTime: number;   // UTC unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  closeTime: number;  // UTC unix ms
}

async function fetchBinanceCandles(limit: number): Promise<DailyCandle[]> {
  const url = `${REST_KLINES}?symbol=TRXUSDT&interval=1d&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
  const raw: any[][] = await res.json();
  return raw.map((k) => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    closeTime: k[6],
  }));
}

async function fetchBybitCandles(limit: number): Promise<DailyCandle[]> {
  const url = `https://api.bybit.com/v5/market/kline?symbol=TRXUSDT&interval=D&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Bybit HTTP ${res.status}`);
  const json = await res.json();
  // Bybit returns newest first — reverse to get oldest first
  const list: any[][] = (json?.result?.list || []).reverse();
  return list.map((k) => {
    const openTime = parseInt(k[0]);
    return {
      openTime,
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      closeTime: openTime + 86400_000 - 1,
    };
  });
}

async function fetchKuCoinCandles(limit: number): Promise<DailyCandle[]> {
  const endTime = Math.floor(Date.now() / 1000);
  const startTime = endTime - limit * 86400;
  const url = `https://api.kucoin.com/api/v1/market/candles?type=1day&symbol=TRX-USDT&startAt=${startTime}&endAt=${endTime}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`KuCoin HTTP ${res.status}`);
  const json = await res.json();
  // KuCoin returns newest first — reverse
  const list: any[][] = (json?.data || []).reverse();
  return list.map((k) => {
    const openTime = parseInt(k[0]) * 1000;
    return {
      openTime,
      open: parseFloat(k[1]),
      close: parseFloat(k[2]),
      high: parseFloat(k[3]),
      low: parseFloat(k[4]),
      closeTime: openTime + 86400_000 - 1,
    };
  });
}

async function fetchGateCandles(limit: number): Promise<DailyCandle[]> {
  const url = `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=TRX_USDT&interval=1d&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Gate.io HTTP ${res.status}`);
  const raw: any[] = await res.json();
  return raw.map((k) => {
    const openTime = parseInt(k[0]) * 1000;
    return {
      openTime,
      open: parseFloat(k[5]),
      high: parseFloat(k[3]),
      low: parseFloat(k[4]),
      close: parseFloat(k[2]),
      closeTime: openTime + 86400_000 - 1,
    };
  });
}

const CANDLE_SOURCES: Array<{ name: string; fn: (limit: number) => Promise<DailyCandle[]> }> = [
  { name: 'Binance', fn: fetchBinanceCandles },
  { name: 'Bybit',   fn: fetchBybitCandles   },
  { name: 'KuCoin',  fn: fetchKuCoinCandles  },
  { name: 'Gate.io', fn: fetchGateCandles    },
];

export async function getDailyCandles(limit = 3): Promise<DailyCandle[]> {
  const errors: string[] = [];
  for (const source of CANDLE_SOURCES) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const candles = await source.fn(limit);
        if (candles.length >= 2) {
          if (source.name !== 'Binance') {
            console.log(`[Price] getDailyCandles: using ${source.name} (Binance unavailable)`);
          }
          return candles;
        }
      } catch (err: any) {
        errors.push(`${source.name}: ${err.message}`);
        if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  throw new Error(`Failed to fetch daily candles from all sources: ${errors.join(' | ')}`);
}
