// ============================================
// HOME PAGE — Asterdex-style trading layout
// Chart + price header (left) + Trade panel (right)
// Mobile: stacked with tab navigation
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWsContext } from '../context/WebSocketContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { api } from '../services/api.ts';
import BannerSlider from '../components/BannerSlider.tsx';
import PriceChart from '../components/PriceChart.tsx';
import OrderBook from '../components/OrderBook.tsx';
import DepositModal from '../components/DepositModal.tsx';
import { connectWallet } from '../services/wallet.ts';
import { Icons } from '../components/Icons.tsx';

type MobileTab = 'chart' | 'trade';

export default function HomePage() {
  const { user } = useAuth();
  const { latestPrice, latestOrderBook, connected, subscribe } = useWsContext();
  const { showToast } = useToast();

  const [mobileTab, setMobileTab] = useState<MobileTab>('chart');
  const [tradeStatus, setTradeStatus] = useState<any>(null);
  const [amount, setAmount] = useState('10');
  const [amountPercent, setAmountPercent] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [insuranceStatus, setInsuranceStatus] = useState<any>(null);
  const [tradeHistory, setTradeHistory] = useState<any[]>([]);
  const [tradePage, setTradePage] = useState(1);
  const [totalTrades, setTotalTrades] = useState(0);

  const price = latestPrice?.price || 0;
  const change24h = latestPrice?.change24h || 0;
  const high24h = latestPrice?.high24h || 0;
  const low24h = latestPrice?.low24h || 0;
  const vol24h = latestPrice?.volume24h || 0;

  // Track realtime direction (up/down vs previous tick)
  const prevPriceRef = React.useRef<number>(0);
  const [priceDir, setPriceDir] = React.useState<'up' | 'down' | 'flat'>('flat');

  React.useEffect(() => {
    if (!price || price === prevPriceRef.current) return;
    if (prevPriceRef.current > 0) {
      setPriceDir(price > prevPriceRef.current ? 'up' : 'down');
    }
    prevPriceRef.current = price;
  }, [price]);

  // Load trade status
  const loadStatus = useCallback(async () => {
    if (!user) return;
    try {
      const [statusData, insData, historyData] = await Promise.all([
        api.getTradeStatus(),
        api.getInsuranceStatus(),
        api.getTradeHistory(tradePage, 10),
      ]);
      setTradeStatus(statusData);
      setInsuranceStatus(insData);
      setTradeHistory(historyData.data || []);
      setTotalTrades(historyData.total || 0);
    } catch { /* ignore */ }
  }, [user, tradePage]);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30_000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  // Listen for trade results via WS
  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.type === 'trade_result') {
        loadStatus();
        const result = msg.data;
        if (result.result === 'win') {
          showToast(`✅ You won! +${(result.reward * 3 / 100).toFixed(4)} TRX reward`, 'success');
        } else if (result.result === 'refunded') {
          showToast('🛡️ Result: Loss. Insurance protected you!', 'info');
        } else {
          showToast('❌ Result: Loss. Better luck next time.', 'error');
        }
      }
      if (msg.type === 'daily_result') {
        loadStatus();
      }
    });
    return unsub;
  }, [subscribe, loadStatus]);

  const handleTrade = async (side: 'up' | 'down') => {
    if (!user) { showToast('Please connect wallet first.', 'info'); return; }
    const trxAmount = parseFloat(amount);
    if (isNaN(trxAmount) || trxAmount <= 0) { showToast('Enter valid amount', 'error'); return; }
    if (trxAmount > (user.balance || 0)) { showToast('Insufficient balance', 'error'); return; }

    setSubmitting(true);
    try {
      await api.placeTrade(side, trxAmount);
      showToast(`🎯 Trade placed! ${side.toUpperCase()} ${trxAmount} TRX`, 'success');
      await loadStatus();
    } catch (err: any) {
      showToast(err.message || 'Failed to place trade', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const windowOpen = tradeStatus?.windowOpen || false;
  const todayTrade = tradeStatus?.todayTrade || null;
  const latestResult = tradeStatus?.latestResult || null;
  const hasInsurance = insuranceStatus?.hasInsurance || false;

  // Countdown to window close: 08:00 UTC
  const getCountdown = () => {
    const now = new Date();
    const close = new Date(now);
    close.setUTCHours(8, 0, 0, 0);
    // If already past 08:00 UTC today, window is closed
    if (now >= close) return null;
    const diff = close.getTime() - now.getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const [countdown, setCountdown] = useState(getCountdown());
  useEffect(() => {
    const t = setInterval(() => setCountdown(getCountdown()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      const address = await connectWallet();
      // Informing the user to proceed with the header button for consistent auth
      showToast('Wallet connected. For full login, please use the Connect button in the header.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Connection failed', 'error');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: `calc(100vh - 56px)` }}>


      {/* Mobile tabs */}
      <div className="mobile-tabs">
        <button className={`mobile-tab ${mobileTab === 'chart' ? 'active' : ''}`} onClick={() => setMobileTab('chart')}>Chart</button>
        <button className={`mobile-tab ${mobileTab === 'trade' ? 'active' : ''}`} onClick={() => setMobileTab('trade')}>Trade</button>
      </div>

      {/* Trading layout */}
      <div className="trading-layout" style={{ flex: 1, overflow: 'hidden' }}>
        {/* LEFT: Chart area */}
        <div className={`chart-area ${mobileTab === 'trade' ? 'hide-mobile' : ''}`}>
          <div className="chart-header">
            <div className="symbol-info">
              <svg width="24" height="24" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: 8, filter: 'drop-shadow(0px 2px 4px rgba(239, 0, 39, 0.3))' }}>
                <g fill="none">
                  <circle fill="#EF0027" cx="16" cy="16" r="16"/>
                  <path d="M21.932 9.913L7.5 7.257l7.595 19.112 10.583-12.894-3.746-3.562zm-.232 1.17l2.208 2.099-6.038 1.093 3.83-3.192zm-5.142 2.973l-6.364-5.278 10.402 1.914-4.038 3.364zm-.453.934l-1.038 8.58L9.472 9.487l6.633 5.502zm.96.455l6.687-1.21-7.67 9.343.983-8.133z" fill="#FFF"/>
                </g>
              </svg>
              <div>
                <div className="symbol-name">TRX/USDT</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>TRON · Daily Prediction</div>
              </div>
            </div>

            <div className="price-display" style={{ marginLeft: 12 }}>
              <div className="price-main" style={{ color: priceDir === 'down' ? 'var(--red)' : priceDir === 'up' ? 'var(--green)' : 'var(--text-primary)' }}>
                {priceDir === 'down' ? '▼' : '▲'} ${price ? price.toFixed(6) : '—'}
              </div>
              <div className="price-change" style={{ color: change24h >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {change24h >= 0 ? '+' : ''}{Math.abs(change24h).toFixed(2)}% 24h
              </div>
            </div>

            <div className="price-stats">
              <div className="price-stat-item">
                <div className="label">24h High</div>
                <div className="value" style={{ color: 'var(--green)' }}>${high24h?.toFixed(6) || '—'}</div>
              </div>
              <div className="price-stat-item">
                <div className="label">24h Low</div>
                <div className="value" style={{ color: 'var(--red)' }}>${low24h?.toFixed(6) || '—'}</div>
              </div>
              <div className="price-stat-item">
                <div className="label">Volume</div>
                <div className="value">{vol24h ? (vol24h / 1e6).toFixed(1) + 'M' : '—'}</div>
              </div>
            </div>
          </div>
          <div className="trading-split-view" style={{ flex: '1 1 0%', display: 'flex', flexDirection: 'row', minHeight: 0, overflow: 'hidden' }}>
            {/* TradingView chart (75%) */}
            <div className="chart-wrapper">
              <PriceChart />
            </div>

            {/* Order Book (25%) */}
            <div className="orderbook-wrapper">
              <OrderBook 
                orderbook={latestOrderBook} 
                currentPrice={price} 
                priceDir={priceDir} 
              />
            </div>
          </div>

          <div style={{ flexShrink: 0 }}>
            <BannerSlider />
          </div>

          {/* Active Trade History Panel */}
          <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', background: 'var(--bg-glass)', padding: '10px 14px', flex: '0 0 auto', maxHeight: '26vh', overflowY: 'auto' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent Trades</div>
            {!user ? (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Please connect wallet to view trade history</div>
            ) : tradeHistory.length === 0 ? (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No trade history yet</div>
            ) : (
              <React.Fragment>
                <table style={{ width: '100%', fontSize: '0.75rem', textAlign: 'left', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ paddingBottom: 5, fontWeight: 400 }}>Date</th>
                      <th style={{ paddingBottom: 5, fontWeight: 400 }}>Side</th>
                      <th style={{ paddingBottom: 5, fontWeight: 400 }}>Entry / Exit</th>
                      <th style={{ paddingBottom: 5, fontWeight: 400 }}>Amt</th>
                      <th style={{ paddingBottom: 5, fontWeight: 400 }}>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradeHistory.map(th => {
                      const d = new Date(th.created_at);
                      const isPending = th.result === 'pending';
                      return (
                        <tr key={th.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '5px 0', color: 'var(--text-muted)', fontSize: '0.68rem' }}>{d.toLocaleDateString()}</td>
                          <td style={{ padding: '5px 0' }}>
                            <span style={{ color: th.side === 'up' ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{th.side.toUpperCase()}</span>
                          </td>
                          <td style={{ padding: '5px 0', fontSize: '0.68rem' }}>
                            <div>${parseFloat(th.entry_price).toFixed(5)}</div>
                            <div style={{ color: isPending ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                              {isPending ? 'Pending' : `$${parseFloat(th.open_next_day || 0).toFixed(5)}`}
                            </div>
                          </td>
                          <td style={{ padding: '5px 0' }}>{parseFloat(th.amount).toFixed(0)}</td>
                          <td style={{ padding: '5px 0' }}>
                            <span className={`status-badge status-${th.result}`}>
                              {th.result === 'refunded' ? (
                                <>
                                  <span style={{ color: 'var(--red)' }}>LOSS</span> <span style={{ opacity: 0.8 }}>(Refunded)</span>
                                </>
                              ) : (
                                th.result.toUpperCase()
                              )}
                            </span>
                            {!isPending && th.result === 'win' && <span style={{ marginLeft: 5, color: 'var(--green)' }}>+{parseFloat(th.reward).toFixed(2)}</span>}
                            {!isPending && th.result === 'loss' && <span style={{ marginLeft: 5, color: 'var(--red)' }}>{parseFloat(th.reward).toFixed(2)}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {totalTrades > 10 && (
                  <div className="pagination" style={{ marginTop: 10, paddingBottom: 5 }}>
                    <button className="page-btn" disabled={tradePage <= 1} onClick={() => setTradePage(p => p - 1)}>←</button>
                    <span style={{ padding: '0 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{tradePage} / {Math.ceil(totalTrades / 10)}</span>
                    <button className="page-btn" disabled={tradePage >= Math.ceil(totalTrades / 10)} onClick={() => setTradePage(p => p + 1)}>→</button>
                  </div>
                )}
              </React.Fragment>
            )}
          </div>
        </div> {/* <-- CLOSE chart-area here */}

        {/* RIGHT: Trade Panel */}
        <div className={`trade-panel ${mobileTab === 'chart' ? 'hide-mobile' : ''}`}>

          {/* Compact info strip */}
          <div style={{
            display: 'flex',
            gap: 6,
            padding: '8px 12px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Balance</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>
                {user ? user.balance.toFixed(2) : '—'}
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: 2 }}>TRX</span>
              </div>
            </div>
            <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Insurance</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: hasInsurance ? 'var(--green)' : 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
                {hasInsurance ? `🛡️ ${insuranceStatus?.daysRemaining}d` : '—'}
              </div>
            </div>
            <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Trading Hours</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: windowOpen ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-display)' }}>
                {windowOpen ? 'OPEN' : 'CLOSED'}
              </div>
            </div>
          </div>

          {/* Today's result display */}
          {latestResult && (
            <div className="trade-panel-section" style={{ paddingBottom: 8 }}>
              <div className="panel-title">Yesterday's Result</div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background: latestResult.direction === 'up' ? 'var(--green-dim)' : 'var(--red-dim)',
                border: `1px solid ${latestResult.direction === 'up' ? 'rgba(0,229,160,0.3)' : 'rgba(255,77,106,0.3)'}`,
              }}>
                <span style={{ color: latestResult.direction === 'up' ? 'var(--green)' : 'var(--red)' }}>
                  {latestResult.direction === 'up'
                    ? <Icons.trendingUp size={20} />
                    : <Icons.trendingDown size={20} />}
                </span>
                <div>
                  <div style={{ fontWeight: 700, color: latestResult.direction === 'up' ? 'var(--green)' : 'var(--red)', fontSize: '0.85rem' }}>
                    {latestResult.direction?.toUpperCase()}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Open: ${parseFloat(latestResult.open_price).toFixed(6)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Insurance badge */}
          {hasInsurance && (
            <div className="trade-panel-section" style={{ paddingTop: 0, paddingBottom: 8 }}>
              <div className="insurance-badge">
                <span className="shield-icon"><Icons.shield size={16} color="var(--green)" /></span>
                <span className="days">{insuranceStatus?.daysRemaining} days</span>
                <span className="label">insurance active — losses refunded</span>
              </div>
            </div>
          )}


          {/* Trade form (always show, but disabled if trade exists) */}
          <div className="trade-panel-section" style={{ paddingTop: todayTrade ? 16 : 0 }}>
            <div className="panel-title">Place Daily Trade</div>



                <div className="form-group">
                  <div className="amount-input-wrapper">
                    <input
                      className="amount-input"
                      type="number"
                      min="10"
                      step="1"
                      value={amount}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAmount(val);
                        // Update slider percent based on typed amount
                        if (user && user.balance > 0) {
                          const num = parseFloat(val) || 0;
                          let pct = (num / user.balance) * 100;
                          if (pct > 100) pct = 100;
                          if (pct < 0) pct = 0;
                          setAmountPercent(pct);
                        }
                      }}
                      placeholder="Amount..."
                      id="trade-amount-input"
                    />
                    <span className="amount-input-unit">TRX</span>
                  </div>
                  
                  {/* Binance-style percentage slider */}
                  <div className="amount-slider-wrapper">
                    <input 
                      type="range" 
                      className="amount-slider" 
                      min="0" 
                      max="100" 
                      step="1"
                      value={amountPercent}
                      disabled={!user || user.balance < 10}
                      onChange={(e) => {
                        const pct = parseFloat(e.target.value);
                        setAmountPercent(pct);
                        if (user && user.balance >= 10) {
                          let calculatedAmount = (user.balance * (pct / 100));
                          if (calculatedAmount < 10 && pct > 0) calculatedAmount = 10;
                          if (calculatedAmount > user.balance) calculatedAmount = user.balance;
                          setAmount(Math.floor(calculatedAmount).toString());
                        }
                      }}
                      style={{
                        background: `linear-gradient(to right, var(--accent) ${amountPercent}%, rgba(255, 255, 255, 0.1) ${amountPercent}%)`
                      }}
                    />
                    <div className="amount-slider-marks">
                      {[0, 25, 50, 75, 100].map(mark => (
                        <span 
                          key={mark} 
                          className="amount-slider-mark"
                          onClick={() => {
                            if (!user || user.balance < 10) return;
                            setAmountPercent(mark);
                            let calculatedAmount = (user.balance * (mark / 100));
                            if (calculatedAmount < 10 && mark > 0) calculatedAmount = 10;
                            if (calculatedAmount > user.balance) calculatedAmount = user.balance;
                            setAmount(Math.floor(calculatedAmount).toString());
                          }}
                        >
                          {mark}%
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {user ? (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                    Available: <span style={{ color: 'var(--accent)' }}>{user.balance.toFixed(4)} TRX</span>
                    {!windowOpen && <span style={{ color: 'var(--red)', marginLeft: 8 }}>⚠️ Trading Hours closed</span>}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                    Connect wallet to trade
                  </div>
                )}
              </div>

              <div className="trade-buttons">
                <button
                  className="trade-btn-up"
                  disabled={submitting || !windowOpen || !!todayTrade}
                  onClick={() => handleTrade('up')}
                  id="trade-up-btn"
                >
                  <span className="trade-btn-icon">▲</span>
                  <span className="trade-btn-label">LONG / UP</span>
                  <span className="trade-btn-reward">+3% if correct</span>
                </button>
                <button
                  className="trade-btn-down"
                  disabled={submitting || !windowOpen || !!todayTrade}
                  onClick={() => handleTrade('down')}
                  id="trade-down-btn"
                >
                  <span className="trade-btn-icon">▼</span>
                  <span className="trade-btn-label">SHORT / DOWN</span>
                  <span className="trade-btn-reward">-3% if wrong</span>
                </button>
              </div>

          {/* Today's trade status */}
          {todayTrade && (
            <div className="trade-panel-section" style={{ paddingTop: 16 }}>
              <div className="panel-title">Today's Trade</div>
              <div style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-glass)',
                border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className={`badge ${todayTrade.side === 'up' ? 'badge-up' : 'badge-down'}`}>
                    {todayTrade.side?.toUpperCase()}
                  </span>
                  <span className={`status-badge status-${todayTrade.result}`}>
                    {todayTrade.result === 'refunded' ? (
                      <>
                        <span style={{ color: 'var(--red)' }}>LOSS</span> <span style={{ opacity: 0.8 }}>(Refunded)</span>
                      </>
                    ) : (
                      todayTrade.result.toUpperCase()
                    )}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Amount: <strong style={{ color: 'var(--text-primary)' }}>{parseFloat(todayTrade.amount).toFixed(4)} TRX</strong>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Entry: <strong style={{ color: 'var(--accent)' }}>${parseFloat(todayTrade.entry_price).toFixed(6)}</strong>
                </div>
                {todayTrade.insurance_used === 1 && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--green)', marginTop: 4 }}>
                    🛡️ Insurance refunded loss
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bottom actions + How It Works */}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 12px 12px' }}>
            {user && !hasInsurance && insuranceStatus?.freeClaimAvailable && (
              <button
                className="btn btn-ghost btn-full btn-sm"
                style={{ color: 'var(--green)', borderColor: 'rgba(0,229,160,0.3)' }}
                onClick={async () => {
                  try {
                    await api.claimFreeInsurance();
                    showToast('Free 10-day insurance claimed!', 'success');
                    loadStatus();
                  } catch (e: any) {
                    showToast(e.message || 'Failed to claim insurance.', 'error');
                  }
                }}
              >
                🛡️ Claim Free 10-Day Insurance
              </button>
            )}

            {user && (
              <button
                className="btn btn-ghost btn-full btn-sm"
                onClick={() => setShowDeposit(true)}
                id="deposit-btn"
              >
                + Deposit TRX
              </button>
            )}

            {!user && (
              <button
                className="btn btn-primary btn-full"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting...' : 'Connect Wallet to Trade'}
              </button>
            )}

            {/* Mini How It Works */}
            <div style={{
              marginTop: 4,
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              lineHeight: 1.7,
            }}>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5, fontSize: '0.72rem' }}>How it works</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icons.clock size={12} color="var(--text-muted)" /> Trading Hours UTC <strong style={{ color: 'var(--text-secondary)' }}>00:00 – 08:00</strong></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icons.trendingUp size={12} color="var(--text-muted)" /> Predict TRX direction: UP or DOWN</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--green)' }}><Icons.checkCircle size={12} color="var(--green)" /> Win → +3% reward on your trade amount</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--red)' }}><Icons.alertTriangle size={12} color="var(--red)" /> Loss → -3% (🛡 insured = refunded)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icons.info size={12} color="var(--text-muted)" /> 1 trade per day · result next morning</div>
            </div>
          </div>
        </div>
      </div>

      {showDeposit && <DepositModal onClose={() => setShowDeposit(false)} />}
    </div>
  );
}
