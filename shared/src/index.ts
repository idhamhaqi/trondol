// ============================================
// TRONDEX — Shared Types & Constants
// ============================================

// ---- Types ----

export interface User {
  id: number;
  wallet_address: string;
  referral_code: string;
  referred_by: number | null;
  balance: number;
  ref_bonus: number;
  insurance_days_remaining: number;
  created_at: string;
}

export interface Trade {
  id: string;
  user_id: number;
  trade_date: string;       // DATE string 'YYYY-MM-DD' UTC
  side: 'up' | 'down';
  amount: number;
  entry_price: number;      // TRX price at trade submission (UTC)
  open_next_day: number | null;  // Next day open price (result basis)
  result: 'win' | 'loss' | 'pending';
  reward: number | null;
  insurance_used: boolean;
  created_at: string;
}

export interface DailyResult {
  id: number;
  trade_date: string;       // Date this result applies to (UTC)
  open_price: number;       // Open of this day's candle
  prev_close: number;       // Previous day close
  direction: 'up' | 'down';
  settled_at: string;
}

export interface Deposit {
  id: string;
  user_id: number;
  tx_hash: string;
  wallet_address: string;
  amount: number;           // TRX amount
  status: 'pending' | 'confirmed' | 'failed';
  fail_reason: string | null;
  created_at: string;
  confirmed_at: string | null;
}

export interface Withdrawal {
  id: string;
  user_id: number;
  wallet_address: string;
  amount: number;           // TRX amount
  tx_hash: string | null;
  status: 'pending' | 'approved' | 'processing' | 'completed' | 'rejected';
  admin_note: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface Referral {
  referrer_id: number;
  referred_id: number;
  created_at: string;
}

export interface InsuranceClaim {
  id: number;
  user_id: number;
  claimed_at: string;
  days_granted: number;
  source: 'free' | 'referral';
}

// ---- WebSocket Message Types ----

export type ServerMessage =
  | { type: 'connection_ack'; clientId: string }
  | { type: 'price_update'; data: PriceTick }
  | { type: 'balance_update'; balance: number }
  | { type: 'trade_result'; data: Trade }
  | { type: 'daily_result'; data: DailyResult }
  | { type: 'maintenance'; active: boolean }
  | { type: 'error'; message: string };

export type ClientMessage =
  | { type: 'subscribe' }
  | { type: 'sync_request' }
  | { type: 'ping' };

export interface PriceTick {
  symbol: string;
  price: number;
  change24h: number;      // % change
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;      // Unix ms UTC
}

// ---- Constants ----

export const TRON_CONFIG = {
  SYMBOL: 'TRXUSDT',
  CHAIN_ID: 728126428,          // TRON mainnet
  MIN_DEPOSIT_TRX: 10,
  MIN_WITHDRAWAL_TRX: 10,

  // TRON public RPCs
  TRON_RPCS: [
    'https://api.trongrid.io',
    'https://tron-rpc.publicnode.com',
  ],

  // Binance price stream
  BINANCE_WS_ENDPOINTS: [
    'wss://stream.binance.com:9443/ws/trxusdt@ticker',
    'wss://stream.binance.com:443/ws/trxusdt@ticker',
  ],
  BINANCE_REST_TICKER: 'https://api.binance.com/api/v3/ticker/24hr?symbol=TRXUSDT',
  BINANCE_REST_KLINES: 'https://api.binance.com/api/v3/klines',

  // Reward / loss rate
  REWARD_RATE: 0.03,    // 3%

  // Insurance
  INSURANCE_DAYS_PER_CLAIM: 10,
  MIN_DEPOSIT_FOR_ACTIVE_REFERRAL: 10, // 10 TRX to count as active referral

  // Trade window in WIB (UTC+7)
  // 07:00 WIB → result released + window opens
  // 12:00 WIB → window closes
  TRADE_WINDOW_START_WIB: 7,
  TRADE_WINDOW_END_WIB: 12,
} as const;

export const APP_NAME = 'TRONDEX';
export const REDIS_PREFIX = 'trondex';
