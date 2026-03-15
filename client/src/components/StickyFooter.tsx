// ============================================
// STICKY FOOTER — Mobile-only bottom navigation
// Includes CryptoTicker above the nav
// ============================================

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import CryptoTicker from './CryptoTicker.tsx';

const NAV_ITEMS = [
  {
    to: '/trade',
    label: 'Trade',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  {
    to: '/portfolio',
    label: 'Portfolio',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        <line x1="12" y1="12" x2="12" y2="16" />
        <line x1="10" y1="14" x2="14" y2="14" />
      </svg>
    ),
  },
  {
    to: '/referral',
    label: 'Referral',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

export default function StickyFooter() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <footer className="sticky-footer">
      {/* Crypto ticker — above the nav, mobile only */}
      <CryptoTicker />
      <nav className="footer-nav">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`footer-nav-item ${isActive(item.to) ? 'active' : ''}`}
            id={`footer-nav-${item.label.toLowerCase()}`}
          >
            <span className="footer-nav-icon">{item.icon}</span>
            <span className="footer-nav-label">{item.label}</span>
          </Link>
        ))}
      </nav>
    </footer>
  );
}
