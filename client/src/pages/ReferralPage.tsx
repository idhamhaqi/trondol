// ============================================
// REFERRAL PAGE — Stats, activity, bonus transfer
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { api } from '../services/api.ts';
import { Icons } from '../components/Icons.tsx';

export default function ReferralPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [stats, setStats] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [actPage, setActPage] = useState(1);
  const [totalAct, setTotalAct] = useState(0);
  const [transferAmt, setTransferAmt] = useState('');
  const [transferMsg, setTransferMsg] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [copying, setCopying] = useState(false);
  const [insuranceClaimed, setInsuranceClaimed] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [statsData, actData] = await Promise.all([
      api.getReferralStats().catch(() => null),
      api.getReferralActivity(actPage, 10).catch(() => ({ data: [], total: 0 })),
    ]);
    if (statsData) setStats(statsData);
    setActivity(actData.data || []);
    setTotalAct(actData.total || 0);
  }, [user, actPage]);

  useEffect(() => { load(); }, [load]);

  const copyLink = () => {
    if (!user) return;
    const link = `${window.location.origin}/?ref=${user.referralCode}`;
    navigator.clipboard.writeText(link).catch(() => {});
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  const handleTransfer = async () => {
    const amt = parseFloat(transferAmt);
    if (isNaN(amt) || amt < 10) { setTransferMsg('Minimum transfer: 10 TRX'); return; }
    setTransferring(true);
    try {
      const res = await api.transferBonus(amt);
      setTransferMsg(`✅ Transferred ${amt} TRX to balance`);
      setStats((prev: any) => prev ? { ...prev, refBonus: res.refBonus } : prev);
      setTransferAmt('');
      load();
    } catch (err: any) {
      setTransferMsg(`❌ ${err.message}`);
    } finally {
      setTransferring(false);
    }
  };

  const handleClaimInsurance = async () => {
    try {
      await api.claimReferralInsurance();
      setInsuranceClaimed(true);
      showToast('Referral milestone insurance successfully claimed!', 'success');
      load();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  if (!user) {
    return (
      <div className="empty-state" style={{ paddingTop: 80 }}>
        <div className="empty-icon">👥</div>
        <div className="empty-title">Connect wallet to access Referral</div>
      </div>
    );
  }

  const refLink = `${window.location.origin}/?ref=${user.referralCode}`;
  const totalPages = Math.ceil(totalAct / 10);

  const statCards = [
    {
      icon: <Icons.users size={22} />,
      label: 'Total Referrals',
      value: String(stats?.referralCount || 0),
      unit: 'people',
      color: 'var(--accent)',
      bg: 'rgba(0,194,255,0.06)',
    },
    {
      icon: <Icons.userCheck size={22} />,
      label: 'Active',
      value: String(stats?.activeReferrals || 0),
      unit: '≥10 TRX deposit',
      color: 'var(--green)',
      bg: 'rgba(0,229,160,0.06)',
    },
    {
      icon: <Icons.wallet size={22} />,
      label: 'Bonus Earned',
      value: (stats?.refBonus || 0).toFixed(4),
      unit: 'TRX',
      color: 'var(--gold)',
      bg: 'rgba(255,185,0,0.06)',
    },
    {
      icon: <Icons.key size={22} />,
      label: 'Ref Code',
      value: user.referralCode,
      unit: 'your code',
      color: 'var(--text-primary)',
      bg: 'rgba(255,255,255,0.03)',
      mono: true,
    },
  ];

  return (
    <div className="portfolio-page">
      <div className="page-header">
        <div className="page-title">Referral Program</div>
        <div className="page-subtitle">Earn 1% bonus from your referrals' trade volume + 10 insurance days per active referral</div>
      </div>

      <div className="portfolio-layout">
        {/* ─── Left / Main column ─── */}
        <div className="portfolio-main">

          {/* Stat Cards */}
          <div className="portfolio-stats-grid" style={{ padding: '16px 0 4px' }}>
            {statCards.map((card, i) => (
              <div key={i} className="portfolio-stat-card" style={{ background: card.bg }}>
                <div style={{ color: card.color, opacity: 0.85 }}>{card.icon}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>{card.label}</div>
                <div style={{
                  fontSize: (card as any).mono ? '0.95rem' : '1.3rem',
                  fontWeight: 700,
                  color: card.color,
                  fontFamily: (card as any).mono ? 'monospace' : 'var(--font-display)',
                  lineHeight: 1.1,
                  letterSpacing: (card as any).mono ? '0.06em' : undefined,
                }}>{card.value}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{card.unit}</div>
              </div>
            ))}
          </div>

          <div className="section">
            {/* Referral link */}
            <div className="referral-card">
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icons.link size={14} color="var(--accent)" /> Your Referral Link
              </div>
              <div className="referral-link-box">
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{refLink}</span>
                <button className="copy-btn" onClick={copyLink} id="copy-referral-btn" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {copying ? <><Icons.checkCircle size={12} /> Copied!</> : <><Icons.copy size={12} /> Copy</>}
              </button>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8 }}>
                Share this link. When friends deposit ≥10 TRX, you get:<br />
                <strong style={{ color: 'var(--accent)' }}>0.3% of trade volume</strong> + <strong style={{ color: 'var(--green)' }}>10 insurance days</strong>
              </div>
            </div>

            {/* Transfer bonus — shown when refBonus > 0, button disabled if < 10 */}
            {(stats?.refBonus || 0) > 0 && (
              <div className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.85rem' }}>
                  💰 Transfer Bonus to Balance
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div className="amount-input-wrapper" style={{ flex: 1 }}>
                    <input
                      className="amount-input"
                      type="number"
                      min="10"
                      max={(stats?.refBonus || 0).toFixed(4)}
                      value={transferAmt}
                      onChange={(e) => setTransferAmt(e.target.value)}
                      placeholder="Min 10 TRX"
                      id="transfer-bonus-input"
                    />
                    <span className="amount-input-unit">TRX</span>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleTransfer}
                    disabled={transferring || (stats?.refBonus || 0) < 10}
                    title={(stats?.refBonus || 0) < 10 ? 'Need at least 10 TRX to transfer' : ''}
                    id="transfer-bonus-btn"
                  >
                    {transferring ? '...' : 'Transfer'}
                  </button>
                </div>
                {transferMsg && (
                  <div style={{ marginTop: 8, fontSize: '0.78rem', color: transferMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>
                    {transferMsg}
                  </div>
                )}
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Available: <span style={{ color: 'var(--gold)' }}>{(stats?.refBonus || 0).toFixed(4)} TRX</span></span>
                  {(stats?.refBonus || 0) < 10 && (
                    <span style={{ color: 'var(--red)', fontSize: '0.68rem' }}>⚠ Min 10 TRX to transfer</span>
                  )}
                </div>
              </div>
            )}

            {/* Claim referral insurance */}
            {(stats?.unclaimedReferrals || 0) > 0 && !insuranceClaimed && (
              <div className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icons.shield size={15} color="var(--green)" /> Claim Insurance Days
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {(stats?.unclaimedReferrals || 0) * 10} days available from {stats?.unclaimedReferrals} active referral(s)
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={handleClaimInsurance} style={{ color: 'var(--green)', borderColor: 'rgba(0,229,160,0.3)' }} id="claim-referral-insurance-btn">
                    Claim
                  </button>
                </div>
              </div>
            )}

            {/* Activity table */}
            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icons.activity size={15} color="var(--text-secondary)" /> Referral Activity
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Wallet</th>
                    <th>Joined</th>
                    <th>Deposited</th>
                    <th>Trades</th>
                    <th>Volume</th>
                    <th>Bonus</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.length === 0 && (
                    <tr><td colSpan={6}><div className="empty-state"><div className="empty-icon">👥</div><div className="empty-title">No referrals yet</div><div className="empty-sub">Share your link to earn bonuses</div></div></td></tr>
                  )}
                  {activity.map((a: any, i: number) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>
                        {a.wallet_address?.slice(0, 8)}...{a.wallet_address?.slice(-4)}
                      </td>
                      <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {new Date(a.joined_at).toLocaleDateString()}
                      </td>
                      <td style={{ color: parseFloat(a.total_deposit) >= 10 ? 'var(--green)' : 'var(--text-muted)' }}>
                        {parseFloat(a.total_deposit || 0).toFixed(2)} TRX
                      </td>
                      <td>{a.trade_count || 0}</td>
                      <td>{parseFloat(a.trade_volume || 0).toFixed(2)} TRX</td>
                      <td style={{ color: 'var(--gold)' }}>+{parseFloat(a.bonus_earned || 0).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <button className="page-btn" disabled={actPage <= 1} onClick={() => setActPage(p => p - 1)}>←</button>
                <span style={{ padding: '0 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{actPage} / {totalPages}</span>
                <button className="page-btn" disabled={actPage >= totalPages} onClick={() => setActPage(p => p + 1)}>→</button>
              </div>
            )}
          </div>
        </div>

        {/* ─── Right sidebar (PC only) ─── */}
        <aside className="portfolio-sidebar">
          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 16 }}>How It Works</div>
            {[
              { step: '1', text: 'Share your referral link with friends' },
              { step: '2', text: 'Friend deposits ≥10 TRX to activate' },
              { step: '3', text: 'You earn 0.3% of their trade volume' },
              { step: '4', text: 'Claim 10 insurance days per active referral' },
            ].map((item) => (
              <div key={item.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'var(--accent-dim)', border: '1px solid var(--border-accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
                }}>{item.step}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, paddingTop: 3 }}>{item.text}</div>
              </div>
            ))}
          </div>

          {stats && (
            <div className="glass-card" style={{ padding: 20, marginTop: 12 }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 16 }}>Your Stats</div>
              {[
                { label: 'Total Referrals', value: stats.referralCount || 0 },
                { label: 'Active Referrals', value: stats.activeReferrals || 0, color: 'var(--green)' },
                { label: 'Ref Bonus', value: `${(stats.refBonus || 0).toFixed(4)} TRX`, color: 'var(--gold)' },
                { label: 'Can Transfer', value: stats.canTransferBonus ? '✅ Yes' : '❌ Min 10 TRX' },
              ].map((item: any, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{item.label}</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: item.color || 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
