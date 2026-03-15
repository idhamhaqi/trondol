import React from 'react';

interface OrderBookProps {
  orderbook: { bids: [string, string][]; asks: [string, string][] } | null;
  currentPrice: number | null;
  priceDir: 'up' | 'down' | 'flat';
}

export default function OrderBook({ orderbook, currentPrice, priceDir }: OrderBookProps) {
  if (!orderbook || !orderbook.bids || !orderbook.asks) {
    return (
      <div className="orderbook-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading Orderbook...</div>
      </div>
    );
  }

  // Take top 15 asks and bottom 15 bids for display
  const asks = orderbook.asks.slice(0, 15).reverse(); // Reverse to show lowest ask at the bottom (closest to price)
  const bids = orderbook.bids.slice(0, 15);

  // Find max volume to calculate depth bars
  let maxVol = 0;
  asks.forEach(a => { const v = parseFloat(a[1]); if (v > maxVol) maxVol = v; });
  bids.forEach(b => { const v = parseFloat(b[1]); if (v > maxVol) maxVol = v; });

  const formatVol = (vStr: string) => {
    const v = parseFloat(vStr);
    if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return v.toFixed(0);
  };

  const getPriceColor = () => {
    if (priceDir === 'up') return 'var(--green)';
    if (priceDir === 'down') return 'var(--red)';
    return 'var(--text-primary)';
  };

  return (
    <div className="orderbook-container">
      <div className="orderbook-header">
        <div className="col-price">Price(USDT)</div>
        <div className="col-amount">Amount(TRX)</div>
      </div>

      {/* Asks (Sell Orders) */}
      <div className="orderbook-list asks-list">
        {asks.map((ask, i) => {
          const price = parseFloat(ask[0]).toFixed(5);
          const vol = ask[1];
          const depthPct = Math.min(100, (parseFloat(vol) / maxVol) * 100);
          
          return (
            <div key={`ask-${i}`} className="orderbook-row">
              <div className="depth-bar ask-depth" style={{ width: `${depthPct}%` }} />
              <div className="col-price" style={{ color: 'var(--red)' }}>{price}</div>
              <div className="col-amount">{formatVol(vol)}</div>
            </div>
          );
        })}
      </div>

      {/* Current Price */}
      <div className="orderbook-current-price">
        <span style={{ color: getPriceColor(), fontSize: '1.1rem', fontWeight: 700 }}>
          {currentPrice ? currentPrice.toFixed(5) : '—'}
        </span>
        {priceDir === 'up' && <span style={{ color: 'var(--green)', fontSize: '0.8rem', marginLeft: 4 }}>▲</span>}
        {priceDir === 'down' && <span style={{ color: 'var(--red)', fontSize: '0.8rem', marginLeft: 4 }}>▼</span>}
      </div>

      {/* Bids (Buy Orders) */}
      <div className="orderbook-list bids-list">
        {bids.map((bid, i) => {
          const price = parseFloat(bid[0]).toFixed(5);
          const vol = bid[1];
          const depthPct = Math.min(100, (parseFloat(vol) / maxVol) * 100);
          
          return (
            <div key={`bid-${i}`} className="orderbook-row">
              <div className="depth-bar bid-depth" style={{ width: `${depthPct}%` }} />
              <div className="col-price" style={{ color: 'var(--green)' }}>{price}</div>
              <div className="col-amount">{formatVol(vol)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
