// ============================================
// REDIS PUB/SUB — Cross-instance messaging
// ============================================

import { redis, redisSub } from '../config/redis.js';
import { REDIS_PREFIX } from '@trondex/shared';

type MessageHandler = (data: any) => void;
const handlers = new Map<string, MessageHandler[]>();

let subscribed = false;

export async function startPubSub(): Promise<void> {
  if (subscribed) return;
  subscribed = true;

  redisSub.on('message', (channel: string, raw: string) => {
    try {
      const data = JSON.parse(raw);
      const list = handlers.get(channel) || [];
      list.forEach((h) => h(data));
    } catch {
      // ignore bad JSON
    }
  });
}

export async function subscribe(channel: string, handler: MessageHandler): Promise<() => void> {
  if (!handlers.has(channel)) {
    handlers.set(channel, []);
    await redisSub.subscribe(channel);
  }
  handlers.get(channel)!.push(handler);

  // Return unsubscribe fn
  return () => {
    const list = handlers.get(channel) || [];
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  };
}

export async function publish(channel: string, data: any): Promise<void> {
  await redis.publish(channel, JSON.stringify(data));
}

// ---- Typed helper channels ----

export function priceChannel() {
  return `${REDIS_PREFIX}:price`;
}

export function userChannel(userId: number) {
  return `${REDIS_PREFIX}:user:${userId}`;
}

export function broadcastChannel() {
  return `${REDIS_PREFIX}:broadcast`;
}

export function orderbookChannel() {
  return `${REDIS_PREFIX}:orderbook`;
}

// ---- Round state in Redis ----

const PRICE_KEY = `${REDIS_PREFIX}:price:latest`;

export async function setLatestPrice(data: any): Promise<void> {
  await redis.set(PRICE_KEY, JSON.stringify(data));
}

export async function getLatestPrice(): Promise<any | null> {
  const raw = await redis.get(PRICE_KEY);
  return raw ? JSON.parse(raw) : null;
}
