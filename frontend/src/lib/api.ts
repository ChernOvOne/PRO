import type {
  User, DashboardData, SubscriptionData, Tariff,
  ReferralInfo, Instruction, CreatePaymentResponse,
  AdminStats, AdminUser, AdminPayment, Payment,
} from '@/types'

// ── Base fetch wrapper ────────────────────────────────────────
async function apiFetch<T>(
  path:    string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }

  return res.json()
}

// ── Auth ──────────────────────────────────────────────────────
export const authApi = {
  me:       ()           => apiFetch<User>('/auth/me'),
  telegram: (data: any)  => apiFetch<{ token: string; user: User }>('/auth/telegram', {
    method: 'POST', body: JSON.stringify(data),
  }),
  login: (email: string, password: string) =>
    apiFetch<{ token: string; user: User }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),
  logout: () => apiFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
}

// ── User ──────────────────────────────────────────────────────
export const userApi = {
  dashboard:    () => apiFetch<DashboardData>('/user/dashboard'),
  subscription: () => apiFetch<SubscriptionData>('/user/subscription'),
  instructions: () => apiFetch<Instruction[]>('/user/instructions'),
  payments:     () => apiFetch<Payment[]>('/user/payments'),
  referral:     () => apiFetch<ReferralInfo>('/user/referral'),
  sync:         () => apiFetch<{ ok: boolean; linked?: boolean }>('/user/sync', { method: 'POST' }),
}

// ── Public ────────────────────────────────────────────────────
export const publicApi = {
  tariffs: () => apiFetch<Tariff[]>('/public/tariffs'),
  config:  () => apiFetch<Record<string, unknown>>('/public/config'),
  checkReferral: (code: string) =>
    apiFetch<{ valid: boolean; referrerName?: string }>(`/public/referral/${code}`),
}

// ── Payments ──────────────────────────────────────────────────
export const paymentsApi = {
  create: (params: {
    tariffId: string
    provider: 'YUKASSA' | 'CRYPTOPAY'
    currency?: 'USDT' | 'TON' | 'BTC'
  }) => apiFetch<CreatePaymentResponse>('/payments/create', {
    method: 'POST', body: JSON.stringify(params),
  }),
  status: (orderId: string) =>
    apiFetch<Payment>(`/payments/status/${orderId}`),
  verify: (orderId: string) =>
    apiFetch<{ confirmed: boolean }>(`/payments/verify/${orderId}`, { method: 'POST' }),
}

// ── Admin ─────────────────────────────────────────────────────
export const adminApi = {
  stats:    () => apiFetch<AdminStats>('/admin/stats'),

  // Users
  users: (params: { page?: number; limit?: number; search?: string; status?: string } = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([,v]) => v).map(([k,v]) => [k, String(v)]))
    return apiFetch<{ users: AdminUser[]; total: number }>(`/admin/users?${q}`)
  },
  userById:   (id: string) => apiFetch<AdminUser>(`/admin/users/${id}`),
  extendUser: (id: string, days: number, note?: string) =>
    apiFetch<{ ok: boolean; newExpireAt: string }>(`/admin/users/${id}/extend`, {
      method: 'POST', body: JSON.stringify({ days, note }),
    }),
  toggleUser: (id: string) =>
    apiFetch<{ ok: boolean; isActive: boolean }>(`/admin/users/${id}/toggle`, { method: 'POST' }),

  // Tariffs
  tariffs:      () => apiFetch<Tariff[]>('/admin/tariffs'),
  createTariff: (data: Partial<Tariff>) =>
    apiFetch<Tariff>('/admin/tariffs', { method: 'POST', body: JSON.stringify(data) }),
  updateTariff: (id: string, data: Partial<Tariff>) =>
    apiFetch<Tariff>(`/admin/tariffs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTariff: (id: string) =>
    apiFetch<void>(`/admin/tariffs/${id}`, { method: 'DELETE' }),

  // Instructions
  instructions:      () => apiFetch<Instruction[]>('/admin/instructions'),
  createInstruction: (data: Partial<Instruction>) =>
    apiFetch<Instruction>('/admin/instructions', { method: 'POST', body: JSON.stringify(data) }),
  updateInstruction: (id: string, data: Partial<Instruction>) =>
    apiFetch<Instruction>(`/admin/instructions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteInstruction: (id: string) =>
    apiFetch<void>(`/admin/instructions/${id}`, { method: 'DELETE' }),

  // Payments
  payments: (params: { page?: number; status?: string; provider?: string } = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([,v]) => v).map(([k,v]) => [k, String(v)]))
    return apiFetch<{ payments: AdminPayment[]; total: number }>(`/admin/payments?${q}`)
  },

  // Settings
  settings:       () => apiFetch<Record<string, string>>('/admin/settings'),
  updateSettings: (data: Record<string, string>) =>
    apiFetch<{ ok: boolean }>('/admin/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // Import
  importStatus: () => apiFetch<{ total: number; matched: number; pending: number; unmatched: number }>('/admin/import'),
}
