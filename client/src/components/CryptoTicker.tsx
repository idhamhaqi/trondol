// ============================================
// CRYPTO TICKER — Reusable scrolling price bar
// Used by StickyFooter (mobile) and PCFooter (desktop)
// ============================================

import React, { useState, useEffect } from 'react';

interface CoinPrice {
  id: string;
  symbol: string;
  image: string;
  current_price: number | null;
  price_change_percentage_24h: number | null;
}

const COINS = ['tron', 'bitcoin', 'ethereum', 'binancecoin', 'solana', 'ripple', 'cardano', 'matic-network', 'dogecoin', 'litecoin'];

const COIN_SYMBOLS: Record<string, string> = {
  tron: 'TRX', bitcoin: 'BTC', ethereum: 'ETH', binancecoin: 'BNB',
  solana: 'SOL', ripple: 'XRP', cardano: 'ADA', 'matic-network': 'MATIC',
  dogecoin: 'DOGE', litecoin: 'LTC',
};

const formatPrice = (p: number | null | undefined) => {
  if (p == null || isNaN(p)) return '$—';
  if (p >= 1000) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (p >= 1) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
};

export default function CryptoTicker() {
  const [prices, setPrices] = useState<CoinPrice[]>([]);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const ids = COINS.join(',');
        const res = await fetch(
          `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) return;
        const data = await res.json();
        setPrices(data);
      } catch { /* silent fail */ }
    };

    fetchPrices();
    const iv = setInterval(fetchPrices, 600_000); // 10 minutes
    return () => clearInterval(iv);
  }, []);

  const valid = prices.filter(c => c.current_price != null);
  if (valid.length === 0) return null;

  return (
    <div className="crypto-ticker-wrap">
      <div className="crypto-ticker-label">
        <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.1em' }}>LIVE</span>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', marginLeft: 3, animation: 'pulse 2s infinite' }} />
      </div>
      <div className="crypto-ticker-track-wrap">
        <div className="crypto-ticker-track">
          {[...valid, ...valid].map((coin, i) => {
            const up = (coin.price_change_percentage_24h ?? 0) >= 0;
            return (
              <span key={i} className="crypto-ticker-item">
                <img
                  src={coin.image}
                  alt={coin.symbol}
                  width={14}
                  height={14}
                  style={{ borderRadius: '50%', flexShrink: 0 }}
                />
                <span style={{ fontWeight: 700, fontSize: '0.68rem', color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.03em' }}>
                  {COIN_SYMBOLS[coin.id] || coin.symbol.toUpperCase()}
                </span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
                  {formatPrice(coin.current_price)}
                </span>
                <span style={{ fontSize: '0.62rem', fontWeight: 600, color: up ? 'var(--green)' : 'var(--red)' }}>
                  {up ? '▲' : '▼'} {Math.abs(coin.price_change_percentage_24h ?? 0).toFixed(2)}%
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
