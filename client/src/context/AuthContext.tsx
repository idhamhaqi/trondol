// ============================================
// AUTH CONTEXT — User session + balance
// ============================================

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useWsContext } from './WebSocketContext.tsx';
import { api } from '../services/api.ts';

interface User {
  id: number;
  walletAddress: string;
  referralCode: string;
  balance: number;
  refBonus: number;
  insuranceDaysRemaining: number;
  createdAt: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (walletAddress: string, referralCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setBalance: (balance: number) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
  setBalance: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { subscribe } = useWsContext();

  // Listen for balance_update via WS
  useEffect(() => {
    const unsub = subscribe((msg) => {
      // Broadcast WebSocket message globally (e.g. for DepositModal)
      window.dispatchEvent(new CustomEvent('trondex_ws_message', { detail: msg }));
      
      if (msg.type === 'balance_update' && typeof msg.balance === 'number') {
        setUser((prev) => prev ? { ...prev, balance: msg.balance } : prev);
      }
    });
    return unsub;
  }, [subscribe]);


  useEffect(() => {
    const savedToken = localStorage.getItem('trondex_token');
    if (!savedToken) {
      setLoading(false);
      return;
    }
    setToken(savedToken);
    api.getMe().then((data) => {
      if (data?.user) {
        setUser(data.user);
      } else {
        localStorage.removeItem('trondex_token');
        setToken(null);
      }
    }).catch(() => {
      localStorage.removeItem('trondex_token');
      setToken(null);
    }).finally(() => setLoading(false));

    // TronLink events — always read fresh token from localStorage (stale closure fix)
    const handleMessage = (e: MessageEvent) => {
      const hasToken = !!localStorage.getItem('trondex_token');
      if (!hasToken) return; // already logged out
      if (!e.data?.message?.action) return;
      const action = e.data.message.action;
      // Wallet locked, account changed, or TronLink disconnected → force logout
      if (action === 'setAccount' || action === 'disconnect' || action === 'setNode') {
        logoutRef.current();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const login = useCallback(async (walletAddress: string, referralCode?: string) => {
    const data = await api.walletConnect(walletAddress, referralCode);
    localStorage.setItem('trondex_token', data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try { await api.disconnect(); } catch { /* ignore */ }
    localStorage.removeItem('trondex_token');
    setToken(null);
    setUser(null);
  }, []);

  // Keep logoutRef always up-to-date (avoids stale closure in TronLink event handler)
  const logoutRef = React.useRef(logout);
  React.useEffect(() => { logoutRef.current = logout; }, [logout]);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.getMe();
      if (data?.user) setUser(data.user);
    } catch { /* ignore */ }
  }, []);

  const setBalance = useCallback((balance: number) => {
    setUser((prev) => prev ? { ...prev, balance } : prev);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refreshUser, setBalance }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
