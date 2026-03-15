// ============================================
// ADMIN PAGE — URL key auth: /admin?key=YOUR_KEY
// ============================================

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '../services/api.ts';
import { useToast } from '../context/ToastContext.tsx';

type AdminTab = 'dashboard' | 'withdrawals' | 'deposits' | 'users';

export default function AdminPage() {
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const [authed, setAuthed] = useState(false);
  const [loading404, setLoading404] = useState(true); // true = still checking key
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [dashboard, setDashboard] = useState<any>(null);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [wdFilter, setWdFilter] = useState('');
  const [depFilter, setDepFilter] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [selectedId, setSelectedId] = useState('');         // for reject modal
  const [selectedCompleteId, setSelectedCompleteId] = useState(''); // for complete modal
  const [txHash, setTxHash] = useState('');                 // tx hash for complete
  const [dataLoading, setDataLoading] = useState(false);
  const [tronWallet, setTronWallet] = useState<string | null>(null);

  // Users
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  // Selected user for detail/edit
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [editMode, setEditMode] = useState<'add' | 'subtract' | 'set'>('add');
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editMsg, setEditMsg] = useState('');

  // Auto-login with URL key on mount
  useEffect(() => {
    const urlKey = searchParams.get('key');
    if (!urlKey) { setLoading404(false); return; }

    // Try existing session first
    const existingToken = sessionStorage.getItem('adminToken');
    if (existingToken) {
      adminApi.verify()
        .then(() => { setAuthed(true); setLoading404(false); })
        .catch(async () => {
          // Session expired, try logging in with URL key
          sessionStorage.removeItem('adminToken');
          try {
            const res = await adminApi.login(urlKey);
            sessionStorage.setItem('adminToken', res.token);
            setAuthed(true);
          } catch { /* invalid key */ }
          setLoading404(false);
        });
    } else {
      adminApi.login(urlKey)
        .then((res) => {
          sessionStorage.setItem('adminToken', res.token);
          setAuthed(true);
          setLoading404(false);
        })
        .catch(() => setLoading404(false));
    }
  }, []);

  const loadData = async () => {
    setDataLoading(true);
    try {
      if (tab === 'dashboard') {
        const d = await adminApi.getDashboard();
        setDashboard(d);
      } else if (tab === 'withdrawals') {
        const d = await adminApi.getWithdrawals(1, wdFilter);
        setWithdrawals(d.data || []);
      } else if (tab === 'deposits') {
        const d = await adminApi.getDeposits(1, depFilter);
        setDeposits(d.data || []);
      } else if (tab === 'users') {
        const d = await adminApi.getUsers(userPage, userSearch);
        setUsers(d.data || []);
        setUserTotal(d.total || 0);
      }
    } catch { /* ignore */ }
    setDataLoading(false);
  };

  const detectTronWallet = async () => {
    // @ts-ignore
    if (window.tronWeb && window.tronWeb.defaultAddress && window.tronWeb.defaultAddress.base58) {
      // @ts-ignore
      setTronWallet(window.tronWeb.defaultAddress.base58);
    } else {
      setTronWallet(null);
    }
  };

  useEffect(() => {
    if (authed) {
      loadData();
      detectTronWallet();
      
      // Attempt to auto-detect if user unlocks wallet later
      const interval = setInterval(detectTronWallet, 3000);
      return () => clearInterval(interval);
    }
  }, [authed, tab, wdFilter, depFilter, userPage, userSearch]);

  const handleApprove = async (id: string) => {
    if (!confirm('Approve this withdrawal? You will need to manually send TRX to the user.')) return;
    try {
      await adminApi.approveWithdrawal(id);
      showToast('Withdrawal marked as approved.', 'success');
      loadData();
    } catch (err: any) { showToast(err.message, 'error'); }
  };

  const handleTronApprove = async (w: any) => {
    // @ts-ignore
    if (!window.tronWeb || !window.tronWeb.defaultAddress.base58) {
      showToast('TronLink not connected or unlocked! Please check your extension.', 'error');
      return;
    }
    
    // @ts-ignore
    const currentAddress = window.tronWeb.defaultAddress.base58;

    try {
      showToast(`Please sign the transaction in TronLink to send ${w.amount} TRX...`, 'info');
      
      // Convert TRX to sun (1 TRX = 1,000,000 sun)
      const amountInSun = Math.round(parseFloat(w.amount) * 1_000_000);
      
      // 1. Send TRX via TronLink (This opens the popup)
      // @ts-ignore
      const tx = await window.tronWeb.trx.sendTransaction(w.wallet_address, amountInSun);
      
      if (!tx || !tx.result) {
        throw new Error('Transaction failed or was rejected by user.');
      }
      
      const txId = tx.transaction ? tx.transaction.txID : tx.txid;
      
      if (!txId) {
        throw new Error('Transaction successful but no TX Hash was returned from TronLink.');
      }
      
      showToast('Transaction Broadcasted! Updating server...', 'success');
      
      // 2. Immediately send the TX Hash to the backend to jump from 'pending' directly to 'completed'
      await adminApi.completeWithdrawal(w.id, txId);
      
      showToast('Withdrawal perfectly completed!', 'success');
      loadData();
      
    } catch (err: any) {
      // Typically fires if user clicks 'Reject' in the TronLink Popup
      showToast(err.message || 'Transaction Canceled or Failed', 'error');
      console.error('TronLink Error:', err);
      // We do NOT update backend here. The withdrawal safely remains 'pending'.
    }
  };

  const handleReject = async (id: string) => {
    try {
      await adminApi.rejectWithdrawal(id, rejectNote || 'Rejected by admin');
      setSelectedId('');
      setRejectNote('');
      showToast('Withdrawal rejected.', 'success');
      loadData();
    } catch (err: any) { showToast(err.message, 'error'); }
  };

  const handleComplete = async (id: string) => {
    if (!txHash.trim()) { showToast('Enter the TRON transaction hash', 'error'); return; }
    try {
      await adminApi.completeWithdrawal(id, txHash.trim());
      setSelectedCompleteId('');
      setTxHash('');
      showToast('Withdrawal marked as completed!', 'success');
      loadData();
    } catch (err: any) { showToast(err.message, 'error'); }
  };

  const handleEditBalance = async () => {
    if (!selectedUser) return;
    const amt = parseFloat(editAmount);
    if (isNaN(amt) || amt <= 0) { setEditMsg('Enter a valid amount'); return; }
    // Calculate delta
    const delta = editMode === 'add' ? amt
                : editMode === 'subtract' ? -amt
                : amt - parseFloat(selectedUser.balance); // set = target - current
    setEditMsg('');
    try {
      const res = await adminApi.adjustBalance(selectedUser.id, delta);
      setEditMsg(`✅ Balance updated → ${parseFloat(res.newBalance).toFixed(4)} TRX`);
      // Update local list
      setUsers((prev) => prev.map((u) =>
        u.id === selectedUser.id ? { ...u, balance: res.newBalance } : u
      ));
      setSelectedUser((prev: any) => prev ? { ...prev, balance: res.newBalance } : prev);
      setEditAmount('');
    } catch (err: any) {
      setEditMsg(`❌ ${err.message}`);
    }
  };

  // Show loading spinner while verifying URL key
  if (loading404) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 56px)' }}>
        <div className="spinner" />
      </div>
    );
  }

  // Key absent or invalid → 404
  if (!authed) {
    return (
      <div className="empty-state" style={{ paddingTop: 80 }}>
        <div className="empty-icon">🔍</div>
        <div className="empty-title">Page Not Found</div>
        <div className="empty-subtitle" style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.85rem' }}>The page you requested does not exist.</div>
        <a href="/" className="btn btn-ghost btn-sm" style={{ marginTop: 16 }}>← Back to Trade</a>
      </div>
    );
  }

  return (
    <>
    <div className="admin-layout">
      {/* Sidebar */}
      <div className="admin-sidebar">
        <div style={{ padding: '12px 16px 8px', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Admin Panel
        </div>
        {([
          { id: 'dashboard', icon: '📊', label: 'Dashboard' },
          { id: 'withdrawals', icon: '💸', label: 'Withdrawals' },
          { id: 'deposits', icon: '💳', label: 'Deposits' },
          { id: 'users', icon: '👥', label: 'Users' },
        ] as { id: AdminTab; icon: string; label: string }[]).map((item) => (
          <button
            key={item.id}
            className={`admin-nav-item ${tab === item.id ? 'active' : ''}`}
            onClick={() => setTab(item.id)}
            id={`admin-nav-${item.id}`}
          >
            <span className="admin-nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
        <button
          className="admin-nav-item logout-btn"
          onClick={() => { sessionStorage.removeItem('adminToken'); setAuthed(false); }}
        >
          ↩ Logout
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: 16, overflowY: 'auto' }}>
        {dataLoading && <div className="loading-center"><div className="spinner" /></div>}

        {/* DASHBOARD */}
        {tab === 'dashboard' && dashboard && (
          <div>
            <div className="page-title" style={{ marginBottom: 16 }}>📊 Platform Overview</div>

            <div className="stats-row" style={{ padding: 0, marginBottom: 16 }}>
              {[
                { label: 'Total Users', value: dashboard.stats.total_users, icon: '👥' },
                { label: 'Total Trades', value: dashboard.stats.total_trades, icon: '📊' },
                { label: 'Wins / Losses', value: `${dashboard.stats.total_wins} / ${dashboard.stats.total_losses}`, icon: '🎯' },
                { label: 'Pending Withdrawals', value: dashboard.stats.pending_withdrawals, icon: '⏳', accent: true },
                { label: 'Total Deposited', value: `${parseFloat(dashboard.stats.total_deposited || 0).toFixed(2)} TRX`, icon: '⬇️' },
                { label: 'Total Withdrawn', value: `${parseFloat(dashboard.stats.total_withdrawn || 0).toFixed(2)} TRX`, icon: '⬆️' },
                { label: 'Platform P&L', value: `${parseFloat(dashboard.pnl.platformPnl || 0).toFixed(4)} TRX`, icon: '💰', green: parseFloat(dashboard.pnl.platformPnl || 0) >= 0 },
                { label: 'Insurance Refunds', value: `${parseFloat(dashboard.pnl.insurance_refunds || 0).toFixed(4)} TRX`, icon: '🛡️' },
              ].map((item: any, i) => (
                <div key={i} className="stat-card">
                  <div className="stat-label">{item.icon} {item.label}</div>
                  <div className={`stat-value ${item.green ? 'green' : item.accent ? 'accent' : ''}`} style={{ fontSize: '0.9rem' }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* WITHDRAWALS */}
        {tab === 'withdrawals' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="page-title" style={{ margin: 0 }}>💸 Withdrawals</div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* TronWallet Status Indicator */}
                <div style={{ 
                  display: 'flex', alignItems: 'center', gap: 8, 
                  padding: '6px 12px', borderRadius: '40px', 
                  background: tronWallet ? 'rgba(0,229,160,0.1)' : 'rgba(255,165,0,0.1)',
                  border: `1px solid ${tronWallet ? 'rgba(0,229,160,0.3)' : 'rgba(255,165,0,0.3)'}`,
                  fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)'
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: tronWallet ? 'var(--green)' : 'var(--gold)' }} />
                  {tronWallet ? (
                    <span>Wallet: <span style={{ fontFamily: 'monospace', color: 'var(--green)' }}>{tronWallet.slice(0, 6)}...{tronWallet.slice(-4)}</span></span>
                  ) : (
                    <span style={{ color: 'var(--gold)' }}>TronLink Not Connected</span>
                  )}
                </div>

                <select
                  className="form-input"
                  style={{ width: 'auto', padding: '6px 12px', fontSize: '0.8rem' }}
                  value={wdFilter}
                  onChange={(e) => setWdFilter(e.target.value)}
                >
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved – Awaiting Send</option>
                  <option value="completed">Completed</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>User</th><th>Amount</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
                <tbody>
                  {withdrawals.length === 0 && (
                    <tr><td colSpan={5}><div className="empty-state"><div className="empty-icon">💸</div><div className="empty-title">No withdrawals</div></div></td></tr>
                  )}
                  {withdrawals.map((w: any) => (
                    <tr key={w.id}>
                      <td style={{ maxWidth: '280px', overflow: 'hidden' }}>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600, paddingRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6 }}>
                          👤 {w.user_wallet}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>📲</span>
                          <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {w.wallet_address}
                          </div>
                          <button 
                            onClick={() => { navigator.clipboard.writeText(w.wallet_address); showToast('Address copied!', 'success'); }} 
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontSize: '0.9rem', flexShrink: 0 }} 
                            title="Copy receiving address"
                          >
                            📋
                          </button>
                        </div>
                      </td>
                      <td style={{ fontWeight: 700 }}>{parseFloat(w.amount).toFixed(4)} TRX</td>
                      <td><span className={`status-badge status-${w.status}`}>{w.status}</span></td>
                      <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{new Date(w.created_at).toLocaleString()}</td>
                      <td>
                        {/* PENDING → Approve or Reject */}
                        {w.status === 'pending' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <button 
                              className="btn btn-primary btn-sm" 
                              style={{ fontSize: '0.72rem', background: 'var(--purple)', borderColor: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }} 
                              onClick={() => handleTronApprove(w)}
                            >
                              ⚡ Process via TronLink
                            </button>
                            
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-ghost btn-sm" style={{ flex: 1, color: 'var(--text-muted)', borderColor: 'var(--border)', fontSize: '0.65rem' }} onClick={() => handleApprove(w.id)} title="Old Way (Manual)">
                                Manual Apprv
                              </button>
                              <button className="btn btn-ghost btn-sm" style={{ flex: 1, color: 'var(--red)', borderColor: 'rgba(255,77,106,0.2)', fontSize: '0.65rem' }} onClick={() => setSelectedId(w.id)}>
                                ✗ Reject
                              </button>
                            </div>
                          </div>
                        )}
                        {/* APPROVED → Admin must send TRX manually, then input tx hash */}
                        {w.status === 'approved' && (
                          <div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--gold)', marginBottom: 4, fontWeight: 600 }}>
                              ⚠️ Send {parseFloat(w.amount).toFixed(4)} TRX to:
                            </div>
                            <div style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: 'var(--accent)', marginBottom: 6 }}>
                              {w.wallet_address}
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--green)', borderColor: 'rgba(0,229,160,0.3)', fontSize: '0.72rem' }} onClick={() => { setSelectedCompleteId(w.id); setTxHash(''); }}>
                                ✓ Mark Sent
                              </button>
                              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', borderColor: 'rgba(255,77,106,0.3)', fontSize: '0.72rem' }} onClick={() => setSelectedId(w.id)}>
                                ✗ Cancel
                              </button>
                            </div>
                          </div>
                        )}
                        {/* COMPLETED → show tx hash */}
                        {w.status === 'completed' && w.tx_hash && (
                          <div style={{ fontFamily: 'monospace', fontSize: '0.65rem' }}>
                            <a href={`https://tronscan.org/#/transaction/${w.tx_hash}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)', textDecoration: 'none' }}>
                              ✓ {w.tx_hash.slice(0, 12)}...
                            </a>
                          </div>
                        )}
                        {/* REJECTED */}
                        {w.status === 'rejected' && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--red)' }}>
                            ✗ {w.admin_note || 'Rejected'}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Reject modal */}
            {selectedId && (
              <div className="modal-overlay" onClick={() => setSelectedId('')}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-title">✗ Reject Withdrawal</div>
                  <div className="modal-subtitle">Balance will be refunded to user immediately.</div>
                  <div className="form-group">
                    <label className="form-label">Reason</label>
                    <input className="form-input" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Rejection reason..." />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-full" onClick={() => setSelectedId('')}>Cancel</button>
                    <button className="btn btn-down btn-full" onClick={() => handleReject(selectedId)}>Confirm Reject</button>
                  </div>
                </div>
              </div>
            )}

            {/* Complete modal — admin inputs tx hash after manual send */}
            {selectedCompleteId && (
              <div className="modal-overlay" onClick={() => setSelectedCompleteId('')}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-title">✓ Mark as Completed</div>
                  <div className="modal-subtitle">
                    Paste the TRON transaction hash after sending TRX manually from your wallet.
                  </div>
                  <div className="form-group">
                    <label className="form-label">TRON Transaction Hash</label>
                    <input
                      className="form-input"
                      type="text"
                      value={txHash}
                      onChange={(e) => setTxHash(e.target.value)}
                      placeholder="e.g. abc123def456..."
                      id="complete-tx-hash-input"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-full" onClick={() => setSelectedCompleteId('')}>Cancel</button>
                    <button className="btn btn-primary btn-full" onClick={() => handleComplete(selectedCompleteId)} id="confirm-complete-btn">
                      ✓ Confirm Completed
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* DEPOSITS */}
        {tab === 'deposits' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="page-title">💳 Deposits</div>
              <select
                className="form-input"
                style={{ width: 'auto', padding: '6px 12px', fontSize: '0.8rem' }}
                value={depFilter}
                onChange={(e) => setDepFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>User</th><th>Amount</th><th>Status</th><th>Date</th><th>TX Hash</th></tr></thead>
                <tbody>
                  {deposits.length === 0 && <tr><td colSpan={5}><div className="empty-state"><div className="empty-icon">💳</div><div className="empty-title">No deposits</div></div></td></tr>}
                  {deposits.map((d: any) => (
                    <tr key={d.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{d.user_wallet?.slice(0, 10)}...</td>
                      <td>{d.amount > 0 ? parseFloat(d.amount).toFixed(4) + ' TRX' : '—'}</td>
                      <td><span className={`status-badge status-${d.status}`}>{d.status}</span></td>
                      <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{new Date(d.created_at).toLocaleString()}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.68rem' }}>
                        {d.tx_hash ? (
                          <a href={`https://tronscan.org/#/transaction/${d.tx_hash}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                            {d.tx_hash.slice(0, 10)}...
                          </a>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* USERS */}
        {tab === 'users' && (
          <div>
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
              <div className="page-title" style={{ margin: 0 }}>👥 Users
                <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                  ({userTotal} total)
                </span>
              </div>
              {/* Search */}
              <input
                className="form-input"
                style={{ maxWidth: 260, padding: '6px 12px', fontSize: '0.8rem' }}
                type="text"
                placeholder="Search wallet address..."
                value={userSearch}
                onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
                id="user-search-input"
              />
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Wallet</th>
                    <th>Balance</th>
                    <th>Ref Bonus</th>
                    <th>Insurance</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && (
                    <tr><td colSpan={7}>
                      <div className="empty-state">
                        <div className="empty-icon">👥</div>
                        <div className="empty-title">{userSearch ? 'No users found' : 'No users yet'}</div>
                      </div>
                    </td></tr>
                  )}
                  {users.map((u: any) => (
                    <tr key={u.id} style={{ cursor: 'pointer' }}>
                      <td style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>#{u.id}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.72rem', maxWidth: '200px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={u.wallet_address}>
                            {u.wallet_address?.slice(0, 12)}...{u.wallet_address?.slice(-4)}
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(u.wallet_address); showToast('Address copied!', 'success'); }} 
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontSize: '0.9rem', flexShrink: 0 }} 
                            title="Copy full address"
                          >
                            📋
                          </button>
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>ref: {u.referral_code}</div>
                      </td>
                      <td style={{ color: 'var(--accent)', fontWeight: 700 }}>
                        {parseFloat(u.balance).toFixed(4)}
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 2 }}>TRX</span>
                      </td>
                      <td style={{ color: 'var(--gold)' }}>
                        {parseFloat(u.ref_bonus).toFixed(4)}
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 2 }}>TRX</span>
                      </td>
                      <td style={{ color: u.insurance_days_remaining > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                        {u.insurance_days_remaining > 0 ? `🛡️ ${u.insurance_days_remaining}d` : '—'}
                      </td>
                      <td style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '0.72rem', color: 'var(--accent)', borderColor: 'var(--border-accent)' }}
                          onClick={() => {
                            setSelectedUser(u);
                            setEditMode('add');
                            setEditAmount('');
                            setEditMsg('');
                          }}
                          id={`edit-user-${u.id}-btn`}
                        >
                          ✏️ Edit Balance
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {userTotal > 20 && (
              <div className="pagination">
                <button className="page-btn" disabled={userPage <= 1} onClick={() => setUserPage(p => p - 1)}>←</button>
                <span style={{ padding: '0 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {userPage} / {Math.ceil(userTotal / 20)}
                </span>
                <button className="page-btn" disabled={userPage >= Math.ceil(userTotal / 20)} onClick={() => setUserPage(p => p + 1)}>→</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {/* ─── Balance Edit Modal ─── */}
    {selectedUser && (
      <div className="modal-overlay" onClick={() => { setSelectedUser(null); setEditMsg(''); }}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
          <div className="modal-title">✏️ Edit Balance</div>

          {/* User info card */}
          <div style={{
            padding: '10px 14px',
            background: 'var(--bg-glass)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 16,
          }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>User #{selectedUser.id}</div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-primary)', wordBreak: 'break-all', marginBottom: 8 }}>
              {selectedUser.wallet_address}
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Current Balance</div>
                <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{parseFloat(selectedUser.balance).toFixed(4)} TRX</div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Ref Bonus</div>
                <div style={{ fontWeight: 700, color: 'var(--gold)' }}>{parseFloat(selectedUser.ref_bonus || 0).toFixed(4)} TRX</div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Insurance</div>
                <div style={{ fontWeight: 700, color: 'var(--green)' }}>{selectedUser.insurance_days_remaining}d</div>
              </div>
            </div>
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {(['add', 'subtract', 'set'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setEditMode(m); setEditAmount(''); setEditMsg(''); }}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${editMode === m ? 'var(--border-accent)' : 'var(--border)'}`,
                  background: editMode === m ? 'var(--accent-dim)' : 'var(--bg-glass)',
                  color: editMode === m ? 'var(--accent)' : 'var(--text-muted)',
                  fontWeight: editMode === m ? 700 : 400,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
              >
                {m === 'add' ? '➕ Add' : m === 'subtract' ? '➖ Subtract' : '🎯 Set'}
              </button>
            ))}
          </div>

          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>
            {editMode === 'add' && `Tambah ke balance saat ini (${parseFloat(selectedUser.balance).toFixed(4)} + X)`}
            {editMode === 'subtract' && `Kurangi dari balance saat ini (${parseFloat(selectedUser.balance).toFixed(4)} − X)`}
            {editMode === 'set' && 'Set balance ke nilai persis (override balance sekarang)'}
          </div>

          <div className="form-group">
            <label className="form-label">
              {editMode === 'set' ? 'New Balance (TRX)' : 'Amount (TRX)'}
            </label>
            <div className="amount-input-wrapper">
              <input
                className="amount-input"
                type="number"
                min="0"
                step="0.0001"
                value={editAmount}
                onChange={(e) => { setEditAmount(e.target.value); setEditMsg(''); }}
                placeholder={editMode === 'set' ? parseFloat(selectedUser.balance).toFixed(4) : '0.0000'}
                id="edit-balance-amount-input"
                autoFocus
              />
              <span className="amount-input-unit">TRX</span>
            </div>
          </div>

          {editAmount && !isNaN(parseFloat(editAmount)) && (
            <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-glass)', border: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
              Preview balance baru: <strong style={{ color: 'var(--accent)' }}>
                {editMode === 'set'
                  ? `${parseFloat(editAmount).toFixed(4)} TRX`
                  : editMode === 'add'
                    ? `${(parseFloat(selectedUser.balance) + parseFloat(editAmount)).toFixed(4)} TRX`
                    : `${Math.max(0, parseFloat(selectedUser.balance) - parseFloat(editAmount)).toFixed(4)} TRX`
                }
              </strong>
            </div>
          )}

          {editMsg && (
            <div style={{
              padding: '8px 12px', borderRadius: 'var(--radius-md)', marginBottom: 14, fontSize: '0.8rem',
              background: editMsg.startsWith('✅') ? 'var(--green-dim)' : 'var(--red-dim)',
              color: editMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)',
              border: editMsg.startsWith('✅') ? '1px solid rgba(0,229,160,0.3)' : '1px solid rgba(255,77,106,0.3)',
            }}>
              {editMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-full" onClick={() => { setSelectedUser(null); setEditMsg(''); }}>
              Tutup
            </button>
            <button className="btn btn-primary btn-full" onClick={handleEditBalance} id="confirm-edit-balance-btn">
              Apply
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
