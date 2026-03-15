// ============================================
// AUTH ROUTES — /api/auth/*
// wallet-connect (login/register), disconnect, me
// ============================================

import { Hono } from 'hono';
import type { DB } from '../config/database.js';
import { setSession, deleteSession } from '../config/redis.js';
import { randomBytes } from 'crypto';

export function createAuthRoutes(db: DB): Hono {
  const app = new Hono();

  // POST /api/auth/wallet-connect
  app.post('/wallet-connect', async (c) => {
    try {
      const { walletAddress, referralCode } = await c.req.json<{
        walletAddress?: string;
        referralCode?: string;
      }>();

      // Validate TRON address (T + 33 chars) or EVM address (0x + 40 chars)
      const isTron = /^T[a-zA-Z0-9]{33}$/.test(walletAddress || '');
      const isEvm = /^0x[a-fA-F0-9]{40}$/.test(walletAddress || '');
      
      if (!walletAddress || (!isTron && !isEvm)) {
        return c.json({ error: 'Invalid TRON or EVM wallet address' }, 400);
      }

      // TRON addresses (Base58Check) are case-sensitive — preserve original case.
      // EVM addresses (0x hex) are case-insensitive — normalize to lowercase.
      const isTronAddr = /^T[a-zA-Z0-9]{33}$/.test(walletAddress || '');
      const addr = isTronAddr ? walletAddress : walletAddress.toLowerCase();

      // Check if user exists — use LOWER() for backward compatibility
      // (older records may have been stored lowercase due to previous bug)
      let [user] = await db`SELECT id, wallet_address, referral_code, balance, ref_bonus, insurance_days_remaining FROM users WHERE LOWER(wallet_address) = LOWER(${addr})`;

      if (!user) {
        // NEW USER — register
        let referrerId: number | null = null;

        if (referralCode) {
          const [referrer] = await db`SELECT id FROM users WHERE referral_code = ${referralCode}`;
          if (referrer) referrerId = parseInt(referrer.id as string);
        }

        // Generate unique referral code (8 char hex)
        let newRefCode = '';
        for (let i = 0; i < 5; i++) {
          const candidate = randomBytes(4).toString('hex').toUpperCase();
          const [existing] = await db`SELECT id FROM users WHERE referral_code = ${candidate}`;
          if (!existing) { newRefCode = candidate; break; }
        }
        if (!newRefCode) newRefCode = randomBytes(6).toString('hex').toUpperCase().slice(0, 8);

        await db.transaction(async (tx: any) => {
          await tx`
            INSERT INTO users (wallet_address, referral_code, referred_by)
            VALUES (${addr}, ${newRefCode}, ${referrerId})
          `;
          if (referrerId) {
            await tx`INSERT IGNORE INTO referrals (referrer_id, referred_id)
              SELECT ${referrerId}, id FROM users WHERE LOWER(wallet_address) = LOWER(${addr})`;
          }
        });

        [user] = await db`SELECT id, wallet_address, referral_code, balance, ref_bonus, insurance_days_remaining FROM users WHERE LOWER(wallet_address) = LOWER(${addr})`;
      }

      // Auto-fix: if stored address has wrong case (from old bug), update to correct case
      if (user && user.wallet_address !== addr) {
        await db`UPDATE users SET wallet_address = ${addr} WHERE id = ${user.id}`;
        user = { ...user, wallet_address: addr };
      }

      // Generate session token
      const token = randomBytes(32).toString('hex');
      await setSession(token, {
        userId: parseInt(user.id as string),
        walletAddress: user.wallet_address as string,
      });

      return c.json({
        token,
        user: {
          id: user.id,
          walletAddress: user.wallet_address,
          referralCode: user.referral_code,
          balance: parseFloat(user.balance as string),
          refBonus: parseFloat(user.ref_bonus as string || '0'),
          insuranceDaysRemaining: parseInt(user.insurance_days_remaining as string),
        },
      });
    } catch (err: any) {
      console.error('[Auth] wallet-connect error:', err);
      return c.json({ error: err.message || 'Internal server error' }, 500);
    }
  });

  // POST /api/auth/disconnect
  app.post('/disconnect', async (c) => {
    try {
      const authHeader = c.req.header('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        await deleteSession(authHeader.slice(7));
      }
      return c.json({ success: true });
    } catch {
      return c.json({ success: true });
    }
  });

  // GET /api/auth/me
  app.get('/me', async (c) => {
    try {
      const authHeader = c.req.header('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return c.json({ user: null });

      const { getSession } = await import('../config/redis.js');
      const session = await getSession(authHeader.slice(7));
      if (!session) return c.json({ user: null });

      const [user] = await db`
        SELECT id, wallet_address, referral_code, balance, ref_bonus, insurance_days_remaining, created_at
        FROM users WHERE id = ${session.userId}
      `;
      if (!user) return c.json({ user: null });

      return c.json({ user: {
        id: user.id,
        walletAddress: user.wallet_address,
        referralCode: user.referral_code,
        balance: parseFloat(user.balance as string),
        refBonus: parseFloat(user.ref_bonus as string),
        insuranceDaysRemaining: parseInt(user.insurance_days_remaining as string),
        createdAt: user.created_at,
      }});
    } catch (err: any) {
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  return app;
}
