// ============================================
// ICONS — Premium SVG icon library (Lucide-style)
// Usage: <Icon name="shield" size={18} color="var(--green)" />
// ============================================

import React from 'react';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}

const base = (content: React.ReactNode, size = 18, color = 'currentColor', sw = 1.8, style?: React.CSSProperties) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {content}
  </svg>
);

export const Icons = {
  // ── Stat / Portfolio icons ──
  wallet: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M16 13h.01" strokeWidth={2.5} />
    <path d="M2 10h20" />
  </>, size, color, strokeWidth, style),

  gift: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <polyline points="20 12 20 22 4 22 4 12" />
    <rect x="2" y="7" width="20" height="5" />
    <line x1="12" y1="22" x2="12" y2="7" />
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
  </>, size, color, strokeWidth, style),

  shield: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </>, size, color, strokeWidth, style),

  trophy: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </>, size, color, strokeWidth, style),

  // ── Trade icons ──
  trendingUp: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </>, size, color, strokeWidth, style),

  trendingDown: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
    <polyline points="16 17 22 17 22 11" />
  </>, size, color, strokeWidth, style),

  barChart: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </>, size, color, strokeWidth, style),

  activity: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </>, size, color, strokeWidth, style),

  // ── Finance icons ──
  arrowUpCircle: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <circle cx="12" cy="12" r="10" />
    <polyline points="16 12 12 8 8 12" />
    <line x1="12" y1="16" x2="12" y2="8" />
  </>, size, color, strokeWidth, style),

  arrowDownCircle: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <circle cx="12" cy="12" r="10" />
    <polyline points="8 12 12 16 16 12" />
    <line x1="12" y1="8" x2="12" y2="16" />
  </>, size, color, strokeWidth, style),

  dollarSign: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </>, size, color, strokeWidth, style),

  // ── Referral icons ──
  users: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </>, size, color, strokeWidth, style),

  userCheck: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <polyline points="16 11 18 13 22 9" />
  </>, size, color, strokeWidth, style),

  key: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <circle cx="7.5" cy="15.5" r="5.5" />
    <path d="m21 2-9.6 9.6" />
    <path d="m15.5 7.5 3 3L22 7l-3-3" />
  </>, size, color, strokeWidth, style),

  link: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </>, size, color, strokeWidth, style),

  // ── Status / Info icons ──
  clock: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </>, size, color, strokeWidth, style),

  checkCircle: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </>, size, color, strokeWidth, style),

  alertTriangle: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </>, size, color, strokeWidth, style),

  info: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </>, size, color, strokeWidth, style),

  // ── Navigation / Action icons ──
  arrowUp: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </>, size, color, strokeWidth, style),

  arrowDown: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="19 12 12 19 5 12" />
  </>, size, color, strokeWidth, style),

  copy: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>, size, color, strokeWidth, style),

  zap: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </>, size, color, strokeWidth, style),

  lock: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </>, size, color, strokeWidth, style),

  // ── AI & Tokenomics icons ──
  brain: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
    <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
    <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
    <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
    <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
    <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
    <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
    <path d="M6 18a4 4 0 0 1-1.967-.516" />
    <path d="M19.967 17.484A4 4 0 0 1 18 18" />
  </>, size, color, strokeWidth, style),

  sparkles: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
  </>, size, color, strokeWidth, style),

  coins: ({ size = 18, color = 'currentColor', strokeWidth = 1.8, style }: IconProps = {}) => base(<>
    <circle cx="8" cy="8" r="6" />
    <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
    <path d="M7 6h1v4" />
    <path d="m16.71 13.88.7.71-2.82 2.82" />
  </>, size, color, strokeWidth, style),
};

export type IconName = keyof typeof Icons;
