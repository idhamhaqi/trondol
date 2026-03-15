// ============================================
// BANNER SLIDER — Promo banners auto-cycling
// ============================================

import React, { useState, useEffect } from 'react';
import { Icons } from './Icons.tsx';

const BANNERS: { icon: React.ReactNode; text: string; cta: string | null }[] = [
  {
    icon: <Icons.shield size={16} color="var(--green)" />,
    text: 'Claim your <strong>FREE 10-day Insurance</strong> for risk-free trading',
    cta: 'Claim Now',
  },
  {
    icon: <Icons.zap size={16} color="var(--gold)" />,
    text: 'Predict TRX daily direction. Win <strong>+3% reward</strong> on every correct trade',
    cta: null,
  },
  {
    icon: <Icons.users size={16} color="var(--accent)" />,
    text: 'Invite friends &amp; earn <strong>0.3% bonus</strong> from their trade volume forever',
    cta: 'Invite',
  },
  {
    icon: <Icons.clock size={16} color="var(--text-muted)" />,
    text: 'Trading window: <strong>00:00–08:00 UTC</strong> daily',
    cta: null,
  },
  {
    icon: <Icons.lock size={16} color="var(--accent)" />,
    text: 'Loss insurance: activate and <strong>trade risk-free</strong> for 10 trading days',
    cta: 'Learn More',
  },
];

export default function BannerSlider() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((p) => (p + 1) % BANNERS.length);
    }, 7000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="banner-slider">
      <div
        className="banner-track"
        style={{ transform: `translateX(-${active * 100}%)` }}
      >
        {BANNERS.map((b, i) => (
          <div className="banner-slide" key={i}>
            <span className="icon" style={{ display: 'flex', alignItems: 'center' }}>{b.icon}</span>
            <span dangerouslySetInnerHTML={{ __html: b.text }} />
            {b.cta && (
              <button style={{
                padding: '2px 10px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--accent-dim)',
                border: '1px solid var(--border-accent)',
                color: 'var(--accent)',
                fontSize: '0.68rem',
                fontWeight: 600,
                cursor: 'pointer',
                marginLeft: 6,
              }}>
                {b.cta} →
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="banner-dots">
        {BANNERS.map((_, i) => (
          <button
            key={i}
            className={`banner-dot ${i === active ? 'active' : ''}`}
            onClick={() => setActive(i)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          />
        ))}
      </div>
    </div>
  );
}
