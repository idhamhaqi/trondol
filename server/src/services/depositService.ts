// ============================================
// DEPOSIT SERVICE — TRON native TRX on-chain
// ============================================

import db from '../config/database.js';
import * as pubSub from './redisPubSub.js';
import { TRON_CONFIG } from '@trondex/shared';
import { randomUUID } from 'crypto';

const ADMIN_TRON_ADDRESS = process.env.ADMIN_TRON_ADDRESS || '';
const MIN_DEPOSIT = parseFloat(process.env.MIN_DEPOSIT_TRX || '10');

// Bypass strict SSL certificates for local Windows environments
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// TRON RPC endpoints — mainnet only, multiple fallbacks
// getTronTransaction tries ALL of these in random order before giving up
const TRON_RPCS = [
  'https://api.trongrid.io',          // TronGrid official (rate limited without API key)
  'https://tron-rpc.publicnode.com',  // PublicNode
];

// ---- Submit Deposit ----

export async function submitDeposit(userId: number, txHash: string, walletAddress: string, expectedAmount: number = 0) {
  if (!/^[0-9a-fA-F]{64}$/.test(txHash) && !/^[0-9a-fA-F]{66}$/.test(txHash)) {
    throw new Error('Invalid transaction hash format');
  }

  // Normalize txHash (TRON tx IDs are 64 hex chars, no 0x prefix)
  const normalizedHash = txHash.replace(/^0x/i, '').toLowerCase();
  const normalizedWallet = walletAddress.toLowerCase();

  // Race-safe: INSERT IGNORE — using parameterized to prevent SQL injection
  const depositId = randomUUID();
  await db`
    INSERT IGNORE INTO deposits (id, user_id, tx_hash, wallet_address, amount, raw_amount, status)
    VALUES (${depositId}, ${userId}, ${normalizedHash}, ${normalizedWallet}, ${expectedAmount}, '0', 'pending')
  `;

  const [deposit] = await db`SELECT id, status FROM deposits WHERE tx_hash = ${normalizedHash} AND user_id = ${userId}`;
  if (!deposit) throw new Error('Failed to record deposit');
  if (deposit.status === 'confirmed') throw new Error('This transaction is already confirmed');
  if (deposit.status === 'failed') throw new Error('This transaction was previously marked as failed. Contact support.');

  // Async verify — fire and forget with 5min total timeout
  const timeoutMs = 5 * 60 * 1000;
  const timer = setTimeout(() => {
    console.warn(`[Deposit] verifyAndConfirm timed out for ${deposit.id}`);
    failDeposit(deposit.id, userId, 'Verification timed out after 5 minutes').catch(console.error);
  }, timeoutMs);

  verifyAndConfirm(deposit.id, normalizedHash, userId, walletAddress)
    .catch(console.error)
    .finally(() => clearTimeout(timer));

  return { depositId: deposit.id };
}

// ---- Verify On-Chain ----

async function verifyAndConfirm(depositId: string, txHash: string, userId: number, expectedSender: string): Promise<void> {
  let receipt = null;

  // Retry with exponential backoff — TRON tx can take 3-30s to confirm
  for (let attempt = 0; attempt < 8; attempt++) {
    receipt = await getTronTransaction(txHash);
    if (receipt) break;
    const delay = Math.min(3000 + attempt * 2000, 15_000);
    console.log(`[Deposit] TX ${txHash} not yet found on-chain. Retrying in ${delay}ms... (Attempt ${attempt + 1})`);
    await new Promise((r) => setTimeout(r, delay));
  }

  if (!receipt) {
    console.warn(`[Deposit] All RPCs failed for ${txHash}. Attempting TronScan REST API fallback...`);
    receipt = await fallbackToTronScan(txHash);
    if (!receipt) {
      return failDeposit(depositId, userId, 'Transaction not found after retries or fallback');
    }
  }

  // Check on-chain success
  if (!receipt.ret || receipt.ret[0]?.contractRet !== 'SUCCESS') {
    return failDeposit(depositId, userId, 'Transaction failed on-chain');
  }

  // Validate it's a TRX transfer (not TRC20)
  const contract = receipt.raw_data?.contract?.[0];
  if (!contract || contract.type !== 'TransferContract') {
    return failDeposit(depositId, userId, 'Not a TRX transfer transaction (use native TRX, not TRC20)');
  }

  const value = contract.parameter?.value;
  if (!value) return failDeposit(depositId, userId, 'No transfer value found');

  // Validate recipient — TRON address can come as hex or base58
  const toAddressRaw: string = value.to_address || '';
  const toNorm = normalizeTronAddress(toAddressRaw);
  const adminNorm = normalizeTronAddress(ADMIN_TRON_ADDRESS);

  if (!toNorm || toNorm !== adminNorm) {
    return failDeposit(depositId, userId, `Wrong recipient: ${toAddressRaw}. Expected ${ADMIN_TRON_ADDRESS}`);
  }

  // Validate sender matches the user's wallet address (prevents one user submitting another's TX)
  const fromAddressRaw: string = value.owner_address || '';
  const fromNorm = normalizeTronAddress(fromAddressRaw);
  const expectedNorm = normalizeTronAddress(expectedSender);
  if (fromNorm && expectedNorm && fromNorm !== expectedNorm) {
    return failDeposit(depositId, userId, `Sender mismatch: TX from ${fromAddressRaw}, expected ${expectedSender}`);
  }

  // Amount in SUN (1 TRX = 1,000,000 SUN)
  const sunAmount = BigInt(value.amount || 0);
  const trxAmount = Number(sunAmount) / 1_000_000;

  if (trxAmount < MIN_DEPOSIT) {
    return failDeposit(depositId, userId, `Amount ${trxAmount} TRX below minimum ${MIN_DEPOSIT} TRX`);
  }

  await confirmDeposit(depositId, userId, sunAmount.toString(), trxAmount);
}

export async function getTronTransaction(txHash: string): Promise<any | null> {
  const shuffled = [...TRON_RPCS].sort(() => Math.random() - 0.5); // randomize order for load balancing
  
  const headers: any = { 'Content-Type': 'application/json' };
  
  for (const rpc of shuffled) {
    try {
      // Inject API keys based on the RPC domain
      if (rpc.includes('trongrid')) {
        headers['TRON-PRO-API-KEY'] = 'aace880d-2920-42e1-a25f-ffd70622532d';
      } else {
        delete headers['TRON-PRO-API-KEY'];
      }

      const res = await fetch(`${rpc}/wallet/gettransactionbyid`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ value: txHash, visible: true }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        console.warn(`[Deposit] RPC ${rpc} failed with status: ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (data && data.txID) return data; // valid receipt
    } catch (err: any) {
       console.warn(`[Deposit] RPC ${rpc} fetch error: ${err.message}`);
       continue; // try next RPC
    }
  }
  return null;
}

// ---- TronScan REST API Fallback ----
// TronScan has a completely different JSON schema from RPC nodes (it's an indexed Explorer).
// We map its response into an artificial RPC-like object so the downstream validation logic works natively.
export async function fallbackToTronScan(txHash: string): Promise<any | null> {
  try {
    const res = await fetch(`https://apilist.tronscanapi.com/api/transaction-info?hash=${txHash}`, {
      headers: {
        'TRON-PRO-API-KEY': '65760705-1c62-4ddd-ae08-7412b5e89035',
      },
      signal: AbortSignal.timeout(10_000),
    });
    
    if (!res.ok) return null;
    const data = await res.json();
    
    // TronScan returns an empty object {} if hash is not found yet
    if (!data || !data.hash) return null;

    // Map TronScan data to look like TronGrid RPC raw_data
    return {
      ret: [{ contractRet: data.contractRet }],
      raw_data: {
        contract: [
          {
            type: data.contractType === 1 ? 'TransferContract' : 'Unknown', // 1 is TRX Transfer
            parameter: {
              value: {
                amount: data.contractData?.amount,
                owner_address: data.contractData?.owner_address,
                to_address: data.contractData?.to_address,
              }
            }
          }
        ]
      }
    };
  } catch (err: any) {
    console.warn(`[Deposit] TronScan fallback error: ${err.message}`);
    return null;
  }
}

/**
 * Normalize TRON address for comparison.
 * Handles: hex (41...), base58 (T...), or 0x-prefixed hex.
 * Both sides must be normalized the same way — this works as long as
 * both sides are the same format OR both are lowercased (not mixed base58 vs hex).
 * For production, use tronweb base58ToHex for proper cross-format comparison.
 */
function normalizeTronAddress(address: string): string {
  if (!address) return '';
  const stripped = address.startsWith('0x') ? address.slice(2) : address;
  return stripped.toLowerCase();
}

async function confirmDeposit(
  depositId: string,
  userId: number,
  rawAmount: string,
  trxAmount: number
): Promise<void> {
  await db.transaction(async (tx: any) => {
    // Lock deposit row first to prevent double-confirm
    const [dep] = await tx`SELECT user_id, status FROM deposits WHERE id = ${depositId} FOR UPDATE`;
    if (!dep) return;
    if (dep.status === 'confirmed') {
      console.warn(`[Deposit] ${depositId} already confirmed, skipping`);
      return; // Idempotent — safe to exit
    }

    // Lock user row before updating balance
    await tx`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

    await tx`UPDATE deposits SET status = 'confirmed', amount = ${trxAmount}, raw_amount = ${rawAmount}, confirmed_at = NOW() WHERE id = ${depositId}`;
    await tx`UPDATE users SET balance = balance + ${trxAmount} WHERE id = ${userId}`;
  });

  const [updated] = await db`SELECT balance FROM users WHERE id = ${userId}`;
  if (updated) {
    pubSub.publish(pubSub.userChannel(userId), {
      type: 'balance_update',
      balance: parseFloat(updated.balance as string),
    });
    // Also notify portfolio page to refresh deposit list
    pubSub.publish(pubSub.userChannel(userId), {
      type: 'deposit_update',
      data: { depositId, status: 'confirmed', amount: trxAmount },
    });
  }

  console.log(`[Deposit] Confirmed ${trxAmount} TRX for user ${userId} (deposit ${depositId})`);
}

async function failDeposit(depositId: string, userId: number, reason: string): Promise<void> {
  await db`UPDATE deposits SET status = 'failed', fail_reason = ${reason} WHERE id = ${depositId} AND status = 'pending'`;
  // Notify user via real-time WebSocket
  pubSub.publish(pubSub.userChannel(userId), {
    type: 'deposit_update',
    data: { depositId, status: 'failed', reason },
  });
  console.warn(`[Deposit] Failed ${depositId}: ${reason}`);
}

// ---- Retry pending on startup ----
export async function retryPendingDeposits(): Promise<void> {
  const rows = await db`SELECT id, tx_hash, user_id, wallet_address FROM deposits WHERE status = 'pending' ORDER BY created_at ASC`;
  console.log(`[Deposit] Retrying ${rows.length} pending deposits...`);

  // Stagger retries 2s apart to avoid hammering TRON RPCs simultaneously
  for (let i = 0; i < rows.length; i++) {
    const dep = rows[i];
    await new Promise((r) => setTimeout(r, i * 2000));
    verifyAndConfirm(dep.id, dep.tx_hash, dep.user_id, dep.wallet_address as string).catch(console.error);
  }
}
