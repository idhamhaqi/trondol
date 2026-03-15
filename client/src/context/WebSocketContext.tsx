// ============================================
// WEBSOCKET CONTEXT — Real-time connection
// Auto-reconnect every 3s
// ============================================

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

interface WsContextValue {
  connected: boolean;
  send: (data: any) => void;
  subscribe: (handler: (msg: any) => void) => () => void;
  latestPrice: any | null;
  latestOrderBook: any | null;
}

const WsContext = createContext<WsContextValue>({
  connected: false,
  send: () => {},
  subscribe: () => () => {},
  latestPrice: null,
  latestOrderBook: null,
});

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlers = useRef(new Set<(msg: any) => void>());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [latestPrice, setLatestPrice] = useState<any | null>(null);
  const [latestOrderBook, setLatestOrderBook] = useState<any | null>(null);

  const getToken = () => localStorage.getItem('trondex_token');

  const connect = useCallback(() => {
    try {
      const token = getToken();
      const url = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws${token ? `?token=${token}` : ''}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        console.log('[WS] Connected');
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          // Update price context
          if (data.type === 'price_update') {
            setLatestPrice(data.data);
          } else if (data.type === 'orderbook_update') {
            setLatestOrderBook(data);
          }
          // Dispatch to all subscribers
          handlers.current.forEach((h) => {
            try { h(data); } catch { /* ignore */ }
          });
        } catch { /* ignore bad JSON */ }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        // Reconnect after 3s
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (err) {
      setTimeout(connect, 5000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      reconnectTimer.current && clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Keep-alive ping every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const subscribe = useCallback((handler: (msg: any) => void) => {
    handlers.current.add(handler);
    return () => handlers.current.delete(handler);
  }, []);

  return (
    <WsContext.Provider value={{ connected, send, subscribe, latestPrice, latestOrderBook }}>
      {children}
    </WsContext.Provider>
  );
}

export function useWsContext() {
  return useContext(WsContext);
}
