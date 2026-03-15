// ============================================
// WEBSOCKET HANDLERS — Native Bun WebSocket
// ============================================

import type { ServerWebSocket } from 'bun';
import * as pubSub from '../services/redisPubSub.js';
import { getSession } from '../config/redis.js';
import { randomUUID } from 'crypto';

export interface WsData {
  clientId: string;
  userId: number | null;
  walletAddress: string | null;
}

// Track all connected sockets for broadcast
const allSockets = new Set<ServerWebSocket<WsData>>();

export function handleWsOpen(ws: ServerWebSocket<WsData>): void {
  allSockets.add(ws);
  ws.subscribe('broadcast');
  if (ws.data.userId) {
    ws.subscribe(`user:${ws.data.userId}`);
  }
  ws.send(JSON.stringify({ type: 'connection_ack', clientId: ws.data.clientId }));
}

export function handleWsClose(ws: ServerWebSocket<WsData>): void {
  allSockets.delete(ws);
  ws.unsubscribe('broadcast');
  if (ws.data.userId) {
    ws.unsubscribe(`user:${ws.data.userId}`);
  }
}

export function handleWsMessage(ws: ServerWebSocket<WsData>, message: string | Buffer): void {
  try {
    const data = JSON.parse(message.toString());
    if (data.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
    }
  } catch {
    // Ignore bad messages
  }
}

// Called from Redis pub/sub to relay messages to WS clients
export function broadcastToAll(message: any): void {
  const payload = JSON.stringify(message);
  for (const ws of allSockets) {
    try {
      ws.send(payload);
    } catch { /* client disconnected */ }
  }
}

export function broadcastToUser(userId: number, message: any): void {
  const payload = JSON.stringify(message);
  for (const ws of allSockets) {
    if (ws.data.userId === userId) {
      try {
        ws.send(payload);
      } catch { /* ignore */ }
    }
  }
}

export function broadcastPrice(message: any): void {
  const payload = JSON.stringify(message);
  for (const ws of allSockets) {
    try {
      ws.send(payload);
    } catch { /* ignore */ }
  }
}

export function broadcastOrderBook(message: any): void {
  const payload = JSON.stringify(message);
  for (const ws of allSockets) {
    try {
      ws.send(payload);
    } catch { /* ignore */ }
  }
}

// Upgrade HTTP → WS with session auth
export async function upgradeToWebSocket(
  req: Request,
  server: any
): Promise<Response | undefined> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  let userId: number | null = null;
  let walletAddress: string | null = null;

  if (token) {
    try {
      const session = await getSession(token);
      if (session) {
        userId = session.userId;
        walletAddress = session.walletAddress;
      }
    } catch { /* ignore */ }
  }

  const upgraded = server.upgrade(req, {
    data: {
      clientId: randomUUID(),
      userId,
      walletAddress,
    } satisfies WsData,
  });

  if (upgraded) return undefined;
  return new Response('Upgrade failed', { status: 400 });
}
