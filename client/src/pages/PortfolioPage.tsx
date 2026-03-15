// ============================================
// PORTFOLIO PAGE — Stats, trade history, tx history
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWsContext } from '../context/WebSocketContext.tsx';
import { api } from '../services/api.ts';
import { Icons } from '../components/Icons.tsx';

type PortfolioTab = 'overview' | 'trades' | 'deposits' | 'withdrawals';

export default function PortfolioPage() {
  const { user } = useAuth();
  const { subscribe } = useWsContext();
  const [tab, setTab] = useState<PortfolioTab>('overview');
  const [addrCopied, setAddrCopied] = useState(false);

  const copyAddress = () => {
    if (!user) return;
    navigator.clipboard.writeText(user.walletAddress).catch(() => {});
    setAddrCopied(true);
    setTimeout(() => setAddrCopied(false), 2000);
  };
  const [stats, setStats] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [tradePage, setTradePage] = useState(1);
  const [depositPage, setDepositPage] = useState(1);
  const [withdrawalPage, setWithdrawalPage] = useState(1);
  const [totalTrades, setTotalTrades] = useState(0);
  const [totalDeposits, setTotalDeposits] = useState(0);
  const [totalWithdrawals, setTotalWithdrawals] = useState(0);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddr, setWithdrawAddr] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    const [statsData, tradesData, depositsData, withdrawalData] = await Promise.all([
      api.getPortfolioStats().catch(() => null),
      api.getTradeHistory(tradePage, 10).catch(() => ({ data: [], total: 0 })),
      api.getDepositHistory(depositPage, 10).catch(() => ({ data: [], total: 0 })),
      api.getWithdrawalHistory(withdrawalPage, 10).catch(() => ({ data: [], total: 0 })),
    ]);
    if (statsData) setStats(statsData);
    setTrades(tradesData.data || []);
    setTotalTrades(tradesData.total || 0);
    setDeposits(depositsData.data || []);
    setTotalDeposits(depositsData.total || 0);
    setWithdrawals(withdrawalData.data || []);
    setTotalWithdrawals(withdrawalData.total || 0);
  }, [user, tradePage, depositPage, withdrawalPage]);

  useEffect(() => { load(); }, [load]);

  // Real-time WS updates
  useEffect(() => {
    const unsub = subscribe((msg) => {
      const refreshEvents = ['withdrawal_update', 'deposit_update', 'trade_result', 'daily_result'];
      if (refreshEvents.includes(msg.type)) {
        load();
      }
    });
    return unsub;
  }, [subscribe, load]);

  const handleWithdrawal = async () => {
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt < 10) { setWithdrawMsg('Minimum withdrawal: 10 TRX'); return; }
    if (!withdrawAddr) { setWithdrawMsg('Wallet address required'); return; }
    setWithdrawing(true);
    setWithdrawMsg('');
    try {
      await api.submitWithdrawal(amt, withdrawAddr);
      setWithdrawMsg('✅ Withdrawal submitted! Awaiting admin approval.');
      setShowWithdraw(false);
      load();
    } catch (err: any) {
      setWithdrawMsg(`❌ ${err.message}`);
    } finally {
      setWithdrawing(false);
    }
  };

  if (!user) {
    return (
      <div className="empty-state" style={{ paddingTop: 80 }}>
        <div className="empty-icon">🔒</div>
        <div className="empty-title">Connect your wallet to view Portfolio</div>
      </div>
    );
  }

  const LIMIT = 10;
  const tradePages = Math.ceil(totalTrades / LIMIT);
  const depositPages = Math.ceil(totalDeposits / LIMIT);
  const withdrawalPages = Math.ceil(totalWithdrawals / LIMIT);

  const statCards = [
    {
      icon: <Icons.wallet size={22} />,
      label: 'Balance',
      value: user.balance.toFixed(4),
      unit: 'TRX',
      color: 'var(--accent)',
      bg: 'rgba(0,194,255,0.06)',
    },
    {
      icon: <Icons.gift size={22} />,
      label: 'Ref Bonus',
      value: (user.refBonus?.toFixed(4) || '0.0000'),
      unit: 'TRX',
      color: 'var(--gold)',
      bg: 'rgba(255,185,0,0.06)',
    },
    {
      icon: <Icons.shield size={22} />,
      label: 'Insurance',
      value: user.insuranceDaysRemaining > 0 ? `${user.insuranceDaysRemaining}d` : 'None',
      unit: user.insuranceDaysRemaining > 0 ? 'Active' : 'No cover',
      color: user.insuranceDaysRemaining > 0 ? 'var(--green)' : 'var(--text-muted)',
      bg: 'rgba(0,229,160,0.06)',
    },
    {
      icon: <Icons.trophy size={22} />,
      label: 'Win Rate',
      value: `${stats?.trading?.winRate?.toFixed(1) || '0'}%`,
      unit: `${stats?.trading?.winCount || 0}W / ${stats?.trading?.lossCount || 0}L`,
      color: 'var(--text-primary)',
      bg: 'rgba(255,255,255,0.03)',
    },
  ];

  const TABS: { key: PortfolioTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'trades', label: 'Trades' },
    { key: 'deposits', label: 'Deposits' },
    { key: 'withdrawals', label: 'Withdrawals' },
  ];

  return (
    <div className="portfolio-page">
      {/* Page Header */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="page-title">Portfolio</div>
            <button
              onClick={copyAddress}
              title="Click to copy full address"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
                color: addrCopied ? 'var(--green)' : 'var(--text-muted)',
                fontSize: '0.78rem', fontFamily: 'monospace',
                transition: 'color 0.2s',
              }}
              id="copy-wallet-btn"
            >
              {addrCopied
                ? <><Icons.checkCircle size={12} color="var(--green)" /> Copied!</>
                : <>{user.walletAddress.slice(0, 10)}...{user.walletAddress.slice(-6)} <Icons.copy size={12} color="var(--text-muted)" /></>}
            </button>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowWithdraw(true)} id="withdraw-btn">
            ↑ Withdraw
          </button>
        </div>
      </div>

      <div className="portfolio-layout">
        {/* ─── Left / Main column ─── */}
        <div className="portfolio-main">

          {/* Stat Cards — 4-column grid on PC, 2-column on mobile */}
          <div className="portfolio-stats-grid">
            {statCards.map((card, i) => (
              <div key={i} className="portfolio-stat-card" style={{ background: card.bg }}>
                <div style={{ color: card.color, opacity: 0.85 }}>{card.icon}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>{card.label}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: card.color, fontFamily: 'var(--font-display)', lineHeight: 1.1 }}>{card.value}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{card.unit}</div>
              </div>
            ))}
          </div>

          {/* Tabs — always visible on all screens */}
          <div className="portfolio-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`portfolio-tab${tab === t.key ? ' active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Overview */}
          {tab === 'overview' && stats && (
            <div className="section">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'Total Volume', value: `${stats.trading?.totalVolume?.toFixed(2) || 0} TRX`, icon: <Icons.barChart size={15} color="var(--text-muted)" /> },
                  { label: 'Total Rewards', value: `${stats.trading?.totalReward?.toFixed(4) || 0} TRX`, icon: <Icons.trophy size={15} color="var(--green)" />, green: true },
                  { label: 'Total Losses', value: `${stats.trading?.totalLoss?.toFixed(4) || 0} TRX`, icon: <Icons.trendingDown size={15} color="var(--red)" />, red: true },
                  { label: 'Net Profit', value: `${stats.trading?.netProfit?.toFixed(4) || 0} TRX`, icon: <Icons.dollarSign size={15} color="var(--accent)" />, green: (stats.trading?.netProfit || 0) >= 0 },
                  { label: 'Total Deposited', value: `${stats.financial?.totalDeposited?.toFixed(2) || 0} TRX`, icon: <Icons.arrowDownCircle size={15} color="var(--text-muted)" /> },
                  { label: 'Total Withdrawn', value: `${stats.financial?.totalWithdrawn?.toFixed(2) || 0} TRX`, icon: <Icons.arrowUpCircle size={15} color="var(--text-muted)" /> },
                ].map((item, i) => (
                  <div key={i} className="stat-card">
                    <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{item.icon} {item.label}</div>
                    <div className={`stat-value ${item.green ? 'green' : item.red ? 'red' : ''}`} style={{ fontSize: '0.95rem' }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trades */}
          {tab === 'trades' && (
            <div className="section">
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Side</th>
                      <th>Amount</th>
                      <th>Entry / Exit</th>
                      <th>Result</th>
                      <th>Reward</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.length === 0 && (
                      <tr><td colSpan={6}><div className="empty-state"><div className="empty-icon">📋</div><div className="empty-title">No trades yet</div></div></td></tr>
                    )}
                    {trades.map((t) => (
                      <tr key={t.id}>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.trade_date}</td>
                        <td><span className={`badge ${t.side === 'up' ? 'badge-up' : 'badge-down'}`}>{t.side?.toUpperCase()}</span></td>
                        <td>{parseFloat(t.amount).toFixed(4)} TRX</td>
                        <td style={{ fontSize: '0.75rem' }}>
                          <div style={{ fontFamily: 'monospace' }}>${parseFloat(t.entry_price).toFixed(6)}</div>
                          <div style={{ color: t.result === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                            {t.result === 'pending' ? 'Pending' : `$${parseFloat(t.open_next_day || 0).toFixed(6)}`}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span className={`status-badge status-${t.result}`}>
                              {t.result === 'refunded' ? (
                                <>
                                  <span style={{ color: 'var(--red)' }}>LOSS</span> <span style={{ opacity: 0.8 }}>(Refunded)</span>
                                </>
                              ) : (
                                t.result.toUpperCase()
                              )}
                            </span>
                          </div>
                        </td>
                        <td style={{ color: parseFloat(t.reward || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {t.reward != null ? (parseFloat(t.reward) >= 0 ? '+' : '') + parseFloat(t.reward).toFixed(4) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={tradePage} total={tradePages} onChange={setTradePage} />
            </div>
          )}

          {/* Deposits */}
          {tab === 'deposits' && (
            <div className="section">
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>TX Hash</th></tr></thead>
                  <tbody>
                    {deposits.length === 0 && (
                      <tr><td colSpan={4}><div className="empty-state"><div className="empty-icon">💳</div><div className="empty-title">No deposits</div></div></td></tr>
                    )}
                    {deposits.map((d) => (
                      <tr key={d.id}>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(d.created_at).toLocaleString()}</td>
                        <td>{d.amount > 0 ? parseFloat(d.amount).toFixed(4) + ' TRX' : '—'}</td>
                        <td><span className={`status-badge status-${d.status}`}>{d.status}</span></td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.68rem' }}>
                          {d.tx_hash ? (
                            <a href={`https://tronscan.org/#/transaction/${d.tx_hash}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                              {d.tx_hash.slice(0, 8)}...
                            </a>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={depositPage} total={depositPages} onChange={setDepositPage} />
            </div>
          )}

          {/* Withdrawals */}
          {tab === 'withdrawals' && (
            <div className="section">
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>TX Hash</th></tr></thead>
                  <tbody>
                    {withdrawals.length === 0 && (
                      <tr><td colSpan={4}><div className="empty-state"><div className="empty-icon">💸</div><div className="empty-title">No withdrawals</div></div></td></tr>
                    )}
                    {withdrawals.map((w) => (
                      <tr key={w.id}>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(w.created_at).toLocaleString()}</td>
                        <td>{parseFloat(w.amount).toFixed(4)} TRX</td>
                        <td><span className={`status-badge status-${w.status}`}>{w.status}</span></td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.68rem' }}>
                          {w.tx_hash ? (
                            <a href={`https://tronscan.org/#/transaction/${w.tx_hash}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                              {w.tx_hash.slice(0, 8)}...
                            </a>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={withdrawalPage} total={withdrawalPages} onChange={setWithdrawalPage} />
            </div>
          )}
        </div>

        {/* ─── Right sidebar (PC only) ─── */}
        <aside className="portfolio-sidebar">
          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 16 }}>Quick Actions</div>
            <button className="btn btn-ghost btn-full" style={{ marginBottom: 10, justifyContent: 'flex-start', gap: 8 }} onClick={() => setShowWithdraw(true)} id="withdraw-sidebar-btn">
              ↑ Withdraw TRX
            </button>
            <a href="/" className="btn btn-primary btn-full" style={{ textDecoration: 'none', justifyContent: 'center' }}>
              📈 Go to Trade
            </a>
          </div>

          {stats && (
            <div className="glass-card" style={{ padding: 20, marginTop: 12 }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 16 }}>Trading Summary</div>
              {[
                { label: 'Total Trades', value: stats.trading?.totalTrades || 0 },
                { label: 'Win Rate', value: `${stats.trading?.winRate?.toFixed(1) || 0}%` },
                { label: 'Total Volume', value: `${(stats.trading?.totalVolume || 0).toFixed(2)} TRX` },
                { label: 'Net Profit', value: `${(stats.trading?.netProfit || 0).toFixed(4)} TRX`, color: (stats.trading?.netProfit || 0) >= 0 ? 'var(--green)' : 'var(--red)' },
                { label: 'Deposited', value: `${(stats.financial?.totalDeposited || 0).toFixed(2)} TRX` },
                { label: 'Withdrawn', value: `${(stats.financial?.totalWithdrawn || 0).toFixed(2)} TRX` },
              ].map((item: any, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < 5 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{item.label}</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: item.color || 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* Withdraw Modal */}
      {showWithdraw && (
        <div className="modal-overlay" onClick={() => setShowWithdraw(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">↑ Withdraw TRX</div>
            <div className="modal-subtitle">Withdrawals require admin approval before on-chain execution.</div>
            {withdrawMsg && (
              <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', marginBottom: 14, fontSize: '0.8rem',
                background: withdrawMsg.startsWith('✅') ? 'var(--green-dim)' : 'var(--red-dim)',
                color: withdrawMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)',
                border: withdrawMsg.startsWith('✅') ? '1px solid rgba(0,229,160,0.3)' : '1px solid rgba(255,77,106,0.3)',
              }}>{withdrawMsg}</div>
            )}
            <div className="form-group">
              <label className="form-label">Amount (TRX)</label>
              <div className="amount-input-wrapper">
                <input className="amount-input" type="number" min="10" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="Minimum 10 TRX" id="withdraw-amount-input" />
                <span className="amount-input-unit">TRX</span>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">TRON Wallet Address</label>
              <input className="form-input" type="text" value={withdrawAddr} onChange={(e) => setWithdrawAddr(e.target.value)} placeholder="T..." id="withdraw-address-input" />
            </div>
            <button className="btn btn-primary btn-full" onClick={handleWithdrawal} disabled={withdrawing} id="submit-withdraw-btn">
              {withdrawing ? 'Submitting...' : 'Submit Withdrawal Request'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null;
  return (
    <div className="pagination">
      <button className="page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>←</button>
      <span style={{ padding: '0 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{page} / {total}</span>
      <button className="page-btn" disabled={page >= total} onClick={() => onChange(page + 1)}>→</button>
    </div>
  );
}
