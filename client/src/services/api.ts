// ============================================
// API SERVICE — HTTP client with Bearer token
// ============================================

const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('trondex_token');
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Auth
  walletConnect: (walletAddress: string, referralCode?: string) =>
    request<any>('/auth/wallet-connect', {
      method: 'POST',
      body: JSON.stringify({ walletAddress, referralCode }),
    }),

  disconnect: () =>
    request<any>('/auth/disconnect', { method: 'POST' }),

  getMe: () =>
    request<any>('/auth/me'),

  // Trade
  placeTrade: (side: 'up' | 'down', amount: number) =>
    request<any>('/trade/place', {
      method: 'POST',
      body: JSON.stringify({ side, amount }),
    }),

  getTradeStatus: () =>
    request<any>('/trade/status'),

  getTradeHistory: (page = 1, limit = 20) =>
    request<any>(`/trade/history?page=${page}&limit=${limit}`),

  getDailyResults: (limit = 10) =>
    request<any>(`/trade/results?limit=${limit}`),

  // Deposit
  submitDeposit: (txHash: string, amount: number) =>
    request<any>('/deposit/submit', {
      method: 'POST',
      body: JSON.stringify({ txHash, amount }),
    }),

  getDepositHistory: (page = 1, limit = 20) =>
    request<any>(`/deposit/history?page=${page}&limit=${limit}`),

  // Withdrawal
  submitWithdrawal: (amount: number, walletAddress: string) =>
    request<any>('/withdrawal/submit', {
      method: 'POST',
      body: JSON.stringify({ amount, walletAddress }),
    }),

  getWithdrawalHistory: (page = 1, limit = 20) =>
    request<any>(`/withdrawal/history?page=${page}&limit=${limit}`),

  // Referral
  getReferralStats: () =>
    request<any>('/referral/stats'),

  getReferralActivity: (page = 1, limit = 20) =>
    request<any>(`/referral/activity?page=${page}&limit=${limit}`),

  transferBonus: (amount: number) =>
    request<any>('/referral/transfer-bonus', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),

  getReferralTransfers: (page = 1) =>
    request<any>(`/referral/transfers?page=${page}`),

  // Portfolio
  getPortfolioStats: () =>
    request<any>('/portfolio/stats'),

  // Insurance
  getInsuranceStatus: () =>
    request<any>('/insurance/status'),

  claimFreeInsurance: () =>
    request<any>('/insurance/claim-free', { method: 'POST' }),

  claimReferralInsurance: () =>
    request<any>('/insurance/claim-referral', { method: 'POST' }),

  cancelTrade: (tradeId: number) =>
    request<any>(`/trades/${tradeId}/cancel`, { method: 'POST' }),
};

// Admin API (uses sessionStorage)
function getAdminToken(): string | null {
  return sessionStorage.getItem('adminToken');
}

async function adminRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const adminApi = {
  login: (key: string) =>
    request<any>('/admin/login', { method: 'POST', body: JSON.stringify({ key }) }),

  verify: () =>
    adminRequest<any>('/admin/verify'),

  getDashboard: () =>
    adminRequest<any>('/admin/dashboard'),

  getUsers: (page = 1, search = '') =>
    adminRequest<any>(`/admin/users?page=${page}&search=${encodeURIComponent(search)}`),

  getDeposits: (page = 1, status = '') =>
    adminRequest<any>(`/admin/deposits?page=${page}&status=${status}`),

  getWithdrawals: (page = 1, status = '') =>
    adminRequest<any>(`/admin/withdrawals?page=${page}&status=${status}`),

  approveWithdrawal: (id: string) =>
    adminRequest<any>(`/admin/withdrawals/${id}/approve`, { method: 'POST' }),

  rejectWithdrawal: (id: string, note: string) =>
    adminRequest<any>(`/admin/withdrawals/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),

  completeWithdrawal: (id: string, txHash: string) =>
    adminRequest<any>(`/admin/withdrawals/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ txHash }),
    }),

  adjustBalance: (userId: number, amount: number) =>
    adminRequest<any>(`/admin/users/${userId}/adjust-balance`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),
};
