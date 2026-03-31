import type {
  User, DashboardData, SubscriptionData, Tariff,
  ReferralInfo, Instruction, CreatePaymentResponse,
  AdminStats, AdminUser, AdminPayment, Payment,
  DevicesData, InternalSquad, News, Notification,
  TelegramProxy, GiftSubscription, BalanceTransaction, AdminNote,
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
  register: (params: { email: string; password: string; code: string; referralCode?: string }) =>
    apiFetch<{ token: string; user: User }>('/auth/register', {
      method: 'POST', body: JSON.stringify(params),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ ok: boolean }>('/auth/change-password', {
      method: 'POST', body: JSON.stringify({ currentPassword, newPassword }),
    }),
  changeEmail: (newEmail: string, code: string) =>
    apiFetch<{ ok: boolean; email: string }>('/auth/change-email', {
      method: 'POST', body: JSON.stringify({ newEmail, code }),
    }),
  resetPassword: (email: string, code: string, newPassword: string) =>
    apiFetch<{ ok: boolean }>('/auth/reset-password', {
      method: 'POST', body: JSON.stringify({ email, code, newPassword }),
    }),
  logout: () => apiFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
}

// ── Verification ─────────────────────────────────────────────
export const verificationApi = {
  sendCode: (email: string, purpose: 'REGISTRATION' | 'EMAIL_CHANGE' | 'PASSWORD_RESET') =>
    apiFetch<{ ok: boolean; expiresIn: number }>('/verification/send-code', {
      method: 'POST', body: JSON.stringify({ email, purpose }),
    }),
  verifyCode: (email: string, code: string, purpose: string) =>
    apiFetch<{ ok: boolean; verified: boolean }>('/verification/verify-code', {
      method: 'POST', body: JSON.stringify({ email, code, purpose }),
    }),
}

// ── User ──────────────────────────────────────────────────────
export const userApi = {
  dashboard:    () => apiFetch<DashboardData>('/user/dashboard'),
  subscription: () => apiFetch<SubscriptionData>('/user/subscription'),
  instructions: () => apiFetch<Instruction[]>('/user/instructions'),
  payments:     () => apiFetch<Payment[]>('/user/payments'),
  referral:     () => apiFetch<ReferralInfo>('/user/referral'),
  sync:         () => apiFetch<{ ok: boolean; linked?: boolean }>('/user/sync', { method: 'POST', body: '{}' }),
  devices:      () => apiFetch<DevicesData>('/user/devices'),
  deleteDevice: (hwid: string) => apiFetch<{ ok: boolean }>(`/user/devices/${hwid}`, { method: 'DELETE' }),

  // Balance
  balance: () => apiFetch<{ balance: number; history: BalanceTransaction[] }>('/user/balance'),
  topupBalance: (amount: number, provider: string, currency?: string) =>
    apiFetch<CreatePaymentResponse>('/user/balance/topup', {
      method: 'POST', body: JSON.stringify({ amount, provider, currency }),
    }),
  purchaseWithBalance: (tariffId: string) =>
    apiFetch<{ ok: boolean }>('/user/balance/purchase', {
      method: 'POST', body: JSON.stringify({ tariffId }),
    }),

  // Revoke subscription
  revokeSubscription: () =>
    apiFetch<{ ok: boolean; newSubUrl: string }>('/user/revoke-subscription', { method: 'POST' }),
}

// ── Notifications ────────────────────────────────────────────
export const notificationApi = {
  list: (page = 1, limit = 20, unreadOnly = false) =>
    apiFetch<{ notifications: Notification[]; total: number }>(
      `/notifications?page=${page}&limit=${limit}&unreadOnly=${unreadOnly}`
    ),
  unreadCount: () => apiFetch<{ count: number }>('/notifications/unread-count'),
  markAsRead:  (id: string) => apiFetch<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllAsRead: () => apiFetch<{ ok: boolean }>('/notifications/read-all', { method: 'POST' }),
}

// ── News ─────────────────────────────────────────────────────
export const newsApi = {
  list: (page = 1, type?: string) => {
    const params = new URLSearchParams({ page: String(page) })
    if (type) params.set('type', type)
    return apiFetch<{ news: News[]; total: number }>(`/news?${params}`)
  },
  get: (id: string) => apiFetch<News>(`/news/${id}`),
}

// ── Gifts ────────────────────────────────────────────────────
export const giftApi = {
  create: (params: {
    tariffId: string; provider: string; currency?: string;
    recipientEmail?: string; message?: string;
  }) => apiFetch<{ ok?: boolean; giftCode?: string; giftUrl?: string; orderId?: string; paymentUrl?: string }>(
    '/gifts/create', { method: 'POST', body: JSON.stringify(params) }
  ),
  my: () => apiFetch<GiftSubscription[]>('/gifts/my'),
  status: (code: string) => apiFetch<{
    status: string; tariffName: string; message?: string;
    expiresAt: string; senderName?: string;
  }>(`/gifts/status/${code}`),
  claim: (code: string) => apiFetch<{ ok: boolean; tariffName: string; durationDays: number }>(
    `/gifts/claim/${code}`, { method: 'POST' }
  ),
}

// ── Proxies ──────────────────────────────────────────────────
export const proxyApi = {
  list: () => apiFetch<TelegramProxy[]>('/proxies'),
}

// ── Public ────────────────────────────────────────────────────
export const publicApi = {
  tariffs: () => apiFetch<Tariff[]>('/public/tariffs'),
  config:  () => apiFetch<Record<string, unknown>>('/public/config'),
  landing: () => apiFetch<Record<string, any>>('/public/landing'),
  proxies: () => apiFetch<TelegramProxy[]>('/public/proxies'),
  news:    (limit = 5) => apiFetch<News[]>(`/public/news?limit=${limit}`),
  checkReferral: (code: string) =>
    apiFetch<{ valid: boolean; referrerName?: string }>(`/public/referral/${code}`),
}

// ── Promo ────────────────────────────────────────────────────
export const promoApi = {
  check: (code: string) => apiFetch<any>('/user/promo/check', { method: 'POST', body: JSON.stringify({ code }) }),
  activate: (code: string) => apiFetch<any>('/user/promo/activate', { method: 'POST', body: JSON.stringify({ code }) }),
  activeDiscount: () => apiFetch<any>('/user/promo/active-discount'),
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

  // User actions
  revokeUser:      (id: string) => apiFetch<{ ok: boolean }>(`/admin/users/${id}/revoke`, { method: 'POST' }),
  disableUser:     (id: string) => apiFetch<{ ok: boolean }>(`/admin/users/${id}/disable`, { method: 'POST' }),
  enableUser:      (id: string) => apiFetch<{ ok: boolean }>(`/admin/users/${id}/enable`, { method: 'POST' }),
  resetTraffic:    (id: string) => apiFetch<{ ok: boolean }>(`/admin/users/${id}/reset-traffic`, { method: 'POST' }),
  deleteUser:      (id: string) => apiFetch<{ ok: boolean }>(`/admin/users/${id}`, { method: 'DELETE' }),
  notifyUser:      (id: string, title: string, message: string) =>
    apiFetch<{ ok: boolean }>(`/admin/users/${id}/notify`, {
      method: 'POST', body: JSON.stringify({ title, message }),
    }),
  addDays:         (id: string, days: number, note?: string) =>
    apiFetch<{ ok: boolean; newExpireAt: string }>(`/admin/users/${id}/add-days`, {
      method: 'POST', body: JSON.stringify({ days, note }),
    }),
  adjustBalance:   (id: string, amount: number, description?: string) =>
    apiFetch<{ ok: boolean; newBalance: number }>(`/admin/users/${id}/adjust-balance`, {
      method: 'POST', body: JSON.stringify({ amount, description }),
    }),
  grantDays: (id: string, days: number, description?: string) =>
    apiFetch<{ ok: boolean; newBonusDays: number }>(`/admin/users/${id}/grant-days`, {
      method: 'POST', body: JSON.stringify({ days, description }),
    }),
  grantDaysAll: (days: number, description?: string) =>
    apiFetch<{ ok: boolean; updatedCount: number }>('/admin/grant-days-all', {
      method: 'POST', body: JSON.stringify({ days, description }),
    }),

  // User devices (HWID)
  userDevices:    (id: string) => apiFetch<{ devices: any[]; total: number }>(`/admin/users/${id}/devices`),
  deleteUserDevice: (id: string, hwid: string) =>
    apiFetch<{ ok: boolean }>(`/admin/users/${id}/devices/delete`, {
      method: 'POST', body: JSON.stringify({ hwid }),
    }),

  // Admin notes
  userNotes:     (id: string) => apiFetch<AdminNote[]>(`/admin/users/${id}/notes`),
  addUserNote:   (id: string, text: string) =>
    apiFetch<AdminNote>(`/admin/users/${id}/notes`, { method: 'POST', body: JSON.stringify({ text }) }),
  deleteUserNote: (userId: string, noteId: string) =>
    apiFetch<{ ok: boolean }>(`/admin/users/${userId}/notes/${noteId}`, { method: 'DELETE' }),

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
  payments: (params: {
    page?: number; status?: string; provider?: string;
    search?: string; userId?: string; dateFrom?: string; dateTo?: string;
  } = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([,v]) => v).map(([k,v]) => [k, String(v)]))
    return apiFetch<{ payments: AdminPayment[]; total: number }>(`/admin/payments?${q}`)
  },

  // Settings
  settings:       () => apiFetch<Record<string, string>>('/admin/settings'),
  updateSettings: (data: Record<string, string>) =>
    apiFetch<{ ok: boolean }>('/admin/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // News
  news:         (page = 1) => apiFetch<{ news: News[]; total: number }>(`/admin/news?page=${page}`),
  createNews:   (data: Partial<News>) => apiFetch<News>('/admin/news', { method: 'POST', body: JSON.stringify(data) }),
  updateNews:   (id: string, data: Partial<News>) => apiFetch<News>(`/admin/news/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteNews:   (id: string) => apiFetch<void>(`/admin/news/${id}`, { method: 'DELETE' }),
  publishNews:  (id: string) => apiFetch<News>(`/admin/news/${id}/publish`, { method: 'POST' }),

  // Notifications
  sendNotification: (data: { title: string; message: string; type?: string }) =>
    apiFetch<{ ok: boolean }>('/admin/notifications/send', { method: 'POST', body: JSON.stringify(data) }),
  sendNotificationToUser: (userId: string, title: string, message: string) =>
    apiFetch<{ ok: boolean }>(`/admin/notifications/send/${userId}`, {
      method: 'POST', body: JSON.stringify({ title, message }),
    }),

  // Proxies
  proxies:       () => apiFetch<TelegramProxy[]>('/admin/proxies'),
  createProxy:   (data: Partial<TelegramProxy>) => apiFetch<TelegramProxy>('/admin/proxies', { method: 'POST', body: JSON.stringify(data) }),
  updateProxy:   (id: string, data: Partial<TelegramProxy>) => apiFetch<TelegramProxy>(`/admin/proxies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProxy:   (id: string) => apiFetch<void>(`/admin/proxies/${id}`, { method: 'DELETE' }),

  // Landing
  landingSections:     () => apiFetch<Array<{ key: string; value: string }>>('/admin/landing/sections'),
  landingSection:      (key: string) => apiFetch<{ key: string; value: any }>(`/admin/landing/sections/${key}`),
  updateLandingSection: (key: string, value: any) =>
    apiFetch<{ ok: boolean }>(`/admin/landing/sections/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),
  deleteLandingSection: (key: string) =>
    apiFetch<{ ok: boolean }>(`/admin/landing/sections/${key}`, { method: 'DELETE' }),

  // Analytics
  analyticsHealth: () => apiFetch<{ remnawave: any }>('/admin/analytics/health'),
  analyticsNodes:  () => apiFetch<{ nodes: any[] }>('/admin/analytics/nodes'),

  // Import / Export
  importStatus: () => apiFetch<{ total: number; matched: number; pending: number; unmatched: number }>('/admin/import'),
  exportUsers:  (format = 'json') => apiFetch<{ users: any[]; total: number }>(`/admin/export/users?format=${format}`),

  squads: () => apiFetch<{ squads: InternalSquad[]; total: number }>('/admin/squads'),

  // Promos
  promos: () => apiFetch<any[]>('/admin/promos'),
  createPromo: (data: any) => apiFetch<any>('/admin/promos', { method: 'POST', body: JSON.stringify(data) }),
  updatePromo: (id: string, data: any) => apiFetch<any>(`/admin/promos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePromo: (id: string) => apiFetch<void>(`/admin/promos/${id}`, { method: 'DELETE' }),
  promoStats: (id: string) => apiFetch<any>(`/admin/promos/${id}/stats`),
}
