// ============================================
// PC FOOTER — Desktop-only footer
// Uses shared CryptoTicker component
// ============================================

import React from 'react';
import CryptoTicker from './CryptoTicker.tsx';

export default function PCFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="pc-footer">
      {/* Ticker — shared component (also in StickyFooter for mobile) */}
      <CryptoTicker />

      {/* Bottom bar — desktop only */}
      <div className="pc-footer-bar">
        <div className="pc-footer-left">
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}>
            TRONDEX
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
            © {year} Trondex · TRX Daily Prediction Trading
          </span>
        </div>
        <div className="pc-footer-links">
          {[
            { label: 'Trade', href: '/' },
            { label: 'Portfolio', href: '/portfolio' },
            { label: 'Referral', href: '/referral' },
          ].map((l) => (
            <a key={l.label} href={l.href} style={{
              color: 'var(--text-muted)', fontSize: '0.72rem',
              textDecoration: 'none', transition: 'color 0.15s',
            }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >{l.label}</a>
          ))}
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          Prices via CoinGecko · Updates every 10m
        </div>
      </div>
    </footer>
  );
}
