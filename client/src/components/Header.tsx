// ============================================
// HEADER COMPONENT — Asterdex-style dark header
// ============================================

import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { useWsContext } from '../context/WebSocketContext.tsx';
import { connectWallet } from '../services/wallet.ts';
import { useToast } from '../context/ToastContext.tsx';
import { Icons } from './Icons.tsx';

export default function Header() {
  const { user, login, logout } = useAuth();
  const { connected } = useWsContext();
  const { showToast } = useToast();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [addrCopied, setAddrCopied] = useState(false);

  const copyAddress = () => {
    if (!user) return;
    navigator.clipboard.writeText(user.walletAddress).catch(() => {});
    setAddrCopied(true);
    setTimeout(() => setAddrCopied(false), 2000);
  };

  const navLinks = [
    { to: '/trade', label: 'Trade' },
    { to: '/portfolio', label: 'Portfolio' },
    { to: '/referral', label: 'Referral' },
  ];

  const isActive = (path: string) => location.pathname === path;

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      const address = await connectWallet();
      
      // Look for referral code in local storage (set by App.tsx from ?ref= URL param)
      const refCode = localStorage.getItem('trondex_ref') || undefined;
      await login(address, refCode);

      // Clean up ref code after successful login — only used once on registration
      if (refCode) {
        localStorage.removeItem('trondex_ref');
      }
    } catch (err: any) {
      showToast(err.message || 'Connection failed', 'error');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <>
      <header className="app-header">
        {/* Logo */}
        <Link to="/" className="logo">
          <img src="/assets/logo.png" alt="TRONDEX Logo" style={{ height: 48, width: 'auto' }} />
        </Link>

        {/* Desktop Nav */}
        <nav className="header-nav">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={isActive(link.to) ? 'active' : ''}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="header-actions">
          {/* WS indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '0.68rem',
            color: connected ? 'var(--green)' : 'var(--text-muted)',
          }}>
            <div className={`status-dot ${connected ? 'open' : 'closed'}`} style={{ width: 6, height: 6 }} />
            <span className="hide-mobile">{connected ? 'Live' : 'Offline'}</span>
          </div>

          {user ? (
            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowUserMenu((v) => !v)}
                style={{ gap: 6, minWidth: 120 }}
              >
                <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                  {user.balance.toFixed(4)} <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>TRX</span>
                </span>
                <span style={{ fontSize: '0.7rem' }}>▼</span>
              </button>

              {showUserMenu && (
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 8px)',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 0',
                  minWidth: 180,
                  zIndex: 200,
                  boxShadow: 'var(--shadow-deep)',
                }}>
                  <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>Wallet</div>
                    <button
                      onClick={copyAddress}
                      title="Click to copy full address"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '4px 6px', borderRadius: 'var(--radius-sm)',
                        color: addrCopied ? 'var(--green)' : 'var(--text-primary)',
                        fontSize: '0.78rem', fontFamily: 'monospace',
                        width: '100%', transition: 'background 0.15s',
                      }}
                    >
                      <span style={{ flex: 1, textAlign: 'left' }}>
                        {addrCopied ? '✓ Copied!' : formatAddress(user.walletAddress)}
                      </span>
                      {!addrCopied && <Icons.copy size={12} color="var(--text-muted)" />}
                    </button>
                  </div>
                  {user.insuranceDaysRemaining > 0 && (
                    <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>🛡️</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--green)' }}>
                        {user.insuranceDaysRemaining} days insurance
                      </span>
                    </div>
                  )}
                  <button
                    style={{ width: '100%', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, background: 'none', color: 'var(--red)', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer', border: 'none', marginTop: 4 }}
                    onClick={handleLogout}
                  >
                    <span>↩</span> Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </header>

      {/* Close user menu on outside click */}
      {showUserMenu && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 90 }}
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </>
  );
}
