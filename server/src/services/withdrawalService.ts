// ============================================
// WITHDRAWAL SERVICE — Manual admin flow
// User submits → admin approves → admin sends manually
// Admin inputs tx hash → completed
// NO private key needed on server
// ============================================

import db from '../config/database.js';
import * as pubSub from './redisPubSub.js';
import { getTronTransaction, fallbackToTronScan } from './depositService.js';
import { randomUUID } from 'crypto';

const ADMIN_TRON_ADDRESS = process.env.ADMIN_TRON_ADDRESS || '';

// Normalize TRON address helper
function normalizeTronAddress(address: string): string {
  if (!address) return '';
  const stripped = address.startsWith('0x') ? address.slice(2) : address;
  return stripped.toLowerCase();
}

const MIN_WITHDRAWAL = parseFloat(process.env.MIN_WITHDRAWAL_TRX || '10');

// ---- Submit Withdrawal ----

export async function submitWithdrawal(
  userId: number,
  walletAddress: string,
  amount: number
): Promise<string> {
  if (amount < MIN_WITHDRAWAL) {
    throw new Error(`Minimum withdrawal is ${MIN_WITHDRAWAL} TRX`);
  }

  // Validate TRON address format (T + 33 chars Base58 = 34 total)
  if (!/^T[a-zA-Z0-9]{33}$/.test(walletAddress)) {
    throw new Error('Invalid TRON wallet address (must start with T, 34 chars)');
  }

  let withdrawalId = '';

  await db.transaction(async (tx: any) => {
    const [user] = await tx`SELECT id, balance FROM users WHERE id = ${userId} FOR UPDATE`;
    if (!user) throw new Error('User not found');

    const balance = parseFloat(user.balance as string);
    if (balance < amount) throw new Error('Insufficient balance');

    // Max 3 pending withdrawals per 24h
    const [{ cnt }] = await tx`
      SELECT COUNT(*) AS cnt FROM withdrawals
      WHERE user_id = ${userId} AND status IN ('pending', 'approved')
      AND created_at >= NOW() - INTERVAL 24 HOUR
    `;
    if (parseInt(cnt as string) >= 3) {
      throw new Error('Maximum 3 withdrawal requests per 24 hours');
    }

    const newBalance = Math.round((balance - amount) * 1_000_000) / 1_000_000;
    await tx`UPDATE users SET balance = ${newBalance} WHERE id = ${userId}`;

    withdrawalId = randomUUID();
    await tx`
      INSERT INTO withdrawals (id, user_id, wallet_address, amount, status)
      VALUES (${withdrawalId}, ${userId}, ${walletAddress}, ${amount}, 'pending')
    `;
  });

  const [updated] = await db`SELECT balance FROM users WHERE id = ${userId}`;
  pubSub.publish(pubSub.userChannel(userId), {
    type: 'balance_update',
    balance: parseFloat(updated.balance as string),
  });

  console.log(`[Withdrawal] Submitted ${amount} TRX for user ${userId} — waiting admin approval`);
  return withdrawalId;
}

// ---- Admin: Approve (mark as approved, admin sends TRX manually) ----

export async function approveWithdrawal(withdrawalId: string): Promise<void> {
  const [wd] = await db`SELECT * FROM withdrawals WHERE id = ${withdrawalId}`;
  if (!wd) throw new Error('Withdrawal not found');
  if (wd.status !== 'pending') throw new Error(`Cannot approve withdrawal with status: ${wd.status}`);

  await db`
    UPDATE withdrawals SET status = 'approved', processed_at = NOW()
    WHERE id = ${withdrawalId}
  `;

  // Notify user in real-time
  pubSub.publish(pubSub.userChannel(wd.user_id), {
    type: 'withdrawal_update',
    data: { id: withdrawalId, status: 'approved' },
  });

  console.log(`[Withdrawal] Approved ${withdrawalId} — admin should send ${wd.amount} TRX to ${wd.wallet_address}`);
}

// ---- Admin: Complete (after manually sending, input tx hash) ----

export async function completeWithdrawal(withdrawalId: string, txHash: string): Promise<void> {
  if (!txHash || txHash.trim().length < 10) {
    throw new Error('Valid TRON transaction hash required');
  }

  const [wd] = await db`SELECT * FROM withdrawals WHERE id = ${withdrawalId}`;
  if (!wd) throw new Error('Withdrawal not found');
  if (!['pending', 'approved'].includes(wd.status as string)) {
    throw new Error(`Cannot complete withdrawal with status: ${wd.status}`);
  }

  // Actively verify the hash on-chain
  let receipt = null;
  // Short retry loop for UI responsiveness (since the UI is waiting for this to finish)
  for (let attempt = 0; attempt < 5; attempt++) {
    receipt = await getTronTransaction(txHash.trim());
    if (receipt) break;
    const delay = Math.min(2000 + attempt * 1000, 8000); // 2s, 3s, 4s...
    await new Promise((r) => setTimeout(r, delay));
  }

  if (!receipt) {
    console.warn(`[Withdrawal] RPCs failed for ${txHash.trim()}, trying TronScan...`);
    receipt = await fallbackToTronScan(txHash.trim());
  }

  if (!receipt) {
    throw new Error('Transaction not found on TRON network. Please wait a moment and try again.');
  }

  // Check on-chain success
  if (!receipt.ret || receipt.ret[0]?.contractRet !== 'SUCCESS') {
    throw new Error('Transaction failed on-chain');
  }

  // Validate it's a TRX transfer
  const contract = receipt.raw_data?.contract?.[0];
  if (!contract || contract.type !== 'TransferContract') {
    throw new Error('Transaction is not a native TRX transfer');
  }

  const value = contract.parameter?.value;
  if (!value) throw new Error('No transfer value found in transaction');

  // Verify Receiver (should be User)
  const toNorm = normalizeTronAddress(value.to_address || '');
  const expectedToNorm = normalizeTronAddress(wd.wallet_address as string);
  if (!toNorm || toNorm !== expectedToNorm) {
    throw new Error(`Recipient mismatch! On-chain sent to ${value.to_address}. Expected ${wd.wallet_address}`);
  }

  // Log Sender (We no longer strictly enforce it must be ADMIN_TRON_ADDRESS, 
  // as the admin might use a different operational wallet to send funds)
  const fromNorm = normalizeTronAddress(value.owner_address || '');
  console.log(`[Withdrawal] On-chain sent from ${value.owner_address} to ${value.to_address}`);

  // Verify Amount (allow minor gas fee jitter, but generally should be exact)
  const trxAmount = Number(BigInt(value.amount || 0)) / 1_000_000;
  if (trxAmount < Number(wd.amount)) {
    throw new Error(`Amount mismatch! On-chain sent ${trxAmount} TRX, but withdrawal requires ${wd.amount} TRX`);
  }

  await db`
    UPDATE withdrawals SET status = 'completed', tx_hash = ${txHash.trim()}, processed_at = NOW()
    WHERE id = ${withdrawalId}
  `;

  // Notify user: withdrawal completed
  pubSub.publish(pubSub.userChannel(wd.user_id), {
    type: 'withdrawal_update',
    data: { id: withdrawalId, status: 'completed', txHash: txHash.trim() },
  });

  console.log(`[Withdrawal] Completed ${withdrawalId}, txHash: ${txHash.trim()}`);
}

// ---- Admin: Reject (refund balance to user) ----

export async function rejectWithdrawal(withdrawalId: string, adminNote: string): Promise<void> {
  const [wd] = await db`SELECT * FROM withdrawals WHERE id = ${withdrawalId}`;
  if (!wd) throw new Error('Withdrawal not found');
  if (!['pending', 'approved'].includes(wd.status as string)) {
    throw new Error(`Cannot reject withdrawal with status: ${wd.status}`);
  }

  await db.transaction(async (tx: any) => {
    await tx`
      UPDATE withdrawals
      SET status = 'rejected', admin_note = ${adminNote || 'Rejected by admin'}, processed_at = NOW()
      WHERE id = ${withdrawalId}
    `;
    // Refund balance
    const [user] = await tx`SELECT balance FROM users WHERE id = ${wd.user_id} FOR UPDATE`;
    const refunded = Math.round((parseFloat(user.balance as string) + parseFloat(wd.amount as string)) * 1_000_000) / 1_000_000;
    await tx`UPDATE users SET balance = ${refunded} WHERE id = ${wd.user_id}`;
  });

  const [updated] = await db`SELECT balance FROM users WHERE id = ${wd.user_id}`;
  // Notify user: balance refunded + withdrawal rejected
  pubSub.publish(pubSub.userChannel(wd.user_id), {
    type: 'balance_update',
    balance: parseFloat(updated.balance as string),
  });
  pubSub.publish(pubSub.userChannel(wd.user_id), {
    type: 'withdrawal_update',
    data: { id: withdrawalId, status: 'rejected' },
  });
  console.log(`[Withdrawal] Rejected ${withdrawalId}, refunded ${wd.amount} TRX to user ${wd.user_id}`);
}

// ---- Startup: Reset any stuck processing → approved ----
export async function requeueApprovedWithdrawals(): Promise<void> {
  // Reset 'processing' status that may have been stuck (legacy cleanup)
  await db`UPDATE withdrawals SET status = 'approved' WHERE status = 'processing'`;
  console.log('[Withdrawal] Service initialized (manual admin flow, no private key)');
}
