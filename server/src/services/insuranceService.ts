// ============================================
// INSURANCE SERVICE
// ============================================

import db from '../config/database.js';
import { TRON_CONFIG } from '@trondex/shared';

const MIN_DEPOSIT_FOR_ACTIVE = TRON_CONFIG.MIN_DEPOSIT_FOR_ACTIVE_REFERRAL; // 10 TRX
const DAYS_PER_CLAIM = TRON_CONFIG.INSURANCE_DAYS_PER_CLAIM; // 10 days

// ---- Claim free insurance (first time only) ----
export async function claimFreeInsurance(userId: number): Promise<void> {
  // TOCTOU fix: do the check AND insert inside the same transaction with FOR UPDATE lock
  await db.transaction(async (tx: any) => {
    // Lock user row first to prevent concurrent claims
    const [user] = await tx`SELECT id, insurance_days_remaining FROM users WHERE id = ${userId} FOR UPDATE`;
    if (!user) throw new Error('User not found');

    // Check inside transaction (prevents race condition)
    const [existing] = await tx`SELECT id FROM insurance_claims WHERE user_id = ${userId} AND source = 'free'`;
    if (existing) throw new Error('Free insurance already claimed');

    const newDays = parseInt(user.insurance_days_remaining as string) + DAYS_PER_CLAIM;
    await tx`UPDATE users SET insurance_days_remaining = ${newDays} WHERE id = ${userId}`;
    await tx`INSERT INTO insurance_claims (user_id, days_granted, source) VALUES (${userId}, ${DAYS_PER_CLAIM}, 'free')`;
  });
}

// ---- Claim referral insurance ----
// User can claim 10 days for each NEW active referral (accumulated)
// Active = referred user has confirmed deposit >= MIN_DEPOSIT_FOR_ACTIVE
export async function getClaimableReferralInsurance(userId: number): Promise<{ claimable: number; referrals: any[] }> {
  // Get all referred users (active = has deposit >= min)
  const referredUsers = await db`
    SELECT r.referred_id, r.id AS referral_id,
           COALESCE(SUM(d.amount), 0) AS total_deposit
    FROM referrals r
    LEFT JOIN deposits d ON d.user_id = r.referred_id AND d.status = 'confirmed'
    WHERE r.referrer_id = ${userId}
    GROUP BY r.referred_id, r.id
    HAVING total_deposit >= ${MIN_DEPOSIT_FOR_ACTIVE}
  `;

  // How many times user already claimed referral insurance
  const claimedRows = await db`
    SELECT referral_user_id FROM insurance_claims
    WHERE user_id = ${userId} AND source = 'referral'
  `;
  const alreadyClaimed = new Set(claimedRows.map((r: any) => r.referral_user_id));

  const unclaimed = referredUsers.filter((r: any) => !alreadyClaimed.has(r.referred_id));
  return { claimable: unclaimed.length, referrals: unclaimed };
}

export async function claimReferralInsurance(userId: number): Promise<{ daysAdded: number }> {
  // TOCTOU fix: re-compute claimable INSIDE the transaction with locked user row
  let daysAdded = 0;

  await db.transaction(async (tx: any) => {
    // Lock user first
    const [user] = await tx`SELECT id, insurance_days_remaining FROM users WHERE id = ${userId} FOR UPDATE`;
    if (!user) throw new Error('User not found');

    // Re-compute claimable referrals INSIDE transaction (prevents double-claim race)
    const referredUsers = await tx`
      SELECT r.referred_id, r.id AS referral_id,
             COALESCE(SUM(d.amount), 0) AS total_deposit
      FROM referrals r
      LEFT JOIN deposits d ON d.user_id = r.referred_id AND d.status = 'confirmed'
      WHERE r.referrer_id = ${userId}
      GROUP BY r.referred_id, r.id
      HAVING total_deposit >= ${MIN_DEPOSIT_FOR_ACTIVE}
    `;

    const claimedRows = await tx`
      SELECT referral_user_id FROM insurance_claims
      WHERE user_id = ${userId} AND source = 'referral'
    `;
    const alreadyClaimed = new Set(claimedRows.map((r: any) => r.referral_user_id));
    const unclaimed = referredUsers.filter((r: any) => !alreadyClaimed.has(r.referred_id));

    if (unclaimed.length === 0) throw new Error('No claimable referral insurance');

    daysAdded = unclaimed.length * DAYS_PER_CLAIM;
    const newDays = parseInt(user.insurance_days_remaining as string) + daysAdded;
    await tx`UPDATE users SET insurance_days_remaining = ${newDays} WHERE id = ${userId}`;

    // Record each claim
    for (const ref of unclaimed) {
      await tx`
        INSERT INTO insurance_claims (user_id, days_granted, source, referral_user_id)
        VALUES (${userId}, ${DAYS_PER_CLAIM}, 'referral', ${ref.referred_id})
      `;
    }
  });

  return { daysAdded };
}

export async function getInsuranceStatus(userId: number): Promise<{
  daysRemaining: number;
  hasInsurance: boolean;
  freeClaimAvailable: boolean;
  claimableReferrals: number;
}> {
  const [user] = await db`SELECT insurance_days_remaining FROM users WHERE id = ${userId}`;
  const daysRemaining = parseInt(user?.insurance_days_remaining as string || '0');

  const [freeClaim] = await db`SELECT id FROM insurance_claims WHERE user_id = ${userId} AND source = 'free'`;
  const { claimable } = await getClaimableReferralInsurance(userId);

  return {
    daysRemaining,
    hasInsurance: daysRemaining > 0,
    freeClaimAvailable: !freeClaim,
    claimableReferrals: claimable,
  };
}
