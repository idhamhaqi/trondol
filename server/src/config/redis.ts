// ============================================
// REDIS CONFIG — ioredis
// ============================================

import Redis from 'ioredis';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3,
  lazyConnect: false,
  enableOfflineQueue: true,
};

// Main client (pub/sub needs separate connection)
export const redis = new Redis(redisConfig);
export const redisSub = new Redis(redisConfig);

redis.on('error', (err) => console.error('[Redis] Client error:', err.message));
redisSub.on('error', (err) => console.error('[Redis] Sub error:', err.message));

// ---- Session helpers ----

export async function getSession(token: string): Promise<{ userId: number; walletAddress: string } | null> {
  try {
    const raw = await redis.get(`session:${token}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setSession(token: string, data: { userId: number; walletAddress: string }): Promise<void> {
  await redis.set(`session:${token}`, JSON.stringify(data), 'EX', 7 * 24 * 3600); // 7 days
}

export async function deleteSession(token: string): Promise<void> {
  await redis.del(`session:${token}`);
}

export async function getAdminSession(token: string): Promise<boolean> {
  const val = await redis.get(`admin-session:${token}`);
  return val === '1';
}

export async function setAdminSession(token: string): Promise<void> {
  await redis.set(`admin-session:${token}`, '1', 'EX', 24 * 3600); // 24 hours
}

export async function deleteAdminSession(token: string): Promise<void> {
  await redis.del(`admin-session:${token}`);
}
