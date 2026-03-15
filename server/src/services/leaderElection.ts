// ============================================
// LEADER ELECTION — Redis atomic lock
// Multi-instance: only 1 leader manages timers
// ============================================

import { redis } from '../config/redis.js';
import { REDIS_PREFIX } from '@trondex/shared';

const LOCK_KEY = `${REDIS_PREFIX}:leader`;
const LOCK_TTL = 10;       // seconds
const HEARTBEAT_MS = 3000; // every 3s

let isLeader = false;
let instanceId = '';
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let onBecomeLeaderCb: (() => void) | null = null;
let onLoseLeaderCb: (() => void) | null = null;

export function isCurrentLeader(): boolean {
  return isLeader;
}

export function getInstanceId(): string {
  return instanceId;
}

export function onBecomeLeader(cb: () => void) {
  onBecomeLeaderCb = cb;
}

export function onLoseLeader(cb: () => void) {
  onLoseLeaderCb = cb;
}

export async function startLeaderElection(): Promise<void> {
  // Generate unique instance ID (UUID-like)
  instanceId = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  console.log(`[Leader] Instance ID: ${instanceId}`);

  await tryBecomeLeader();

  // Attempt every 3 seconds
  setInterval(tryBecomeLeader, HEARTBEAT_MS);
}

async function tryBecomeLeader(): Promise<void> {
  try {
    if (isLeader) {
      // Extend lock (heartbeat)
      const extended = await redis.expire(LOCK_KEY, LOCK_TTL);
      if (!extended) {
        // Lock expired — lost leadership
        isLeader = false;
        console.warn('[Leader] Lost leadership (lock expired)');
        stopHeartbeat();
        onLoseLeaderCb?.();
        // Try to re-acquire
        await acquireLock();
      }
    } else {
      await acquireLock();
    }
  } catch (err: any) {
    console.error('[Leader] Error in leader election:', err.message);
  }
}

async function acquireLock(): Promise<void> {
  const result = await redis.set(LOCK_KEY, instanceId, 'NX', 'EX', LOCK_TTL);
  if (result === 'OK') {
    isLeader = true;
    console.log('[Leader] Became LEADER');
    onBecomeLeaderCb?.();
  }
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
