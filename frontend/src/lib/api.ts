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
  // Fallback: use Bearer token from localStorage for Telegram WebView
  // (cookies may be blocked in iframe)
  let bearerHeader: Record<string, string> = {}
  if (typeof window !== 'undefined') {
    try {
      const token = localStorage.getItem('auth_token')
      if (token) bearerHeader.Authorization = `Bearer ${token}`
    } catch {}
  }

  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...bearerHeader,
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
  login: (email: string, password: string, utmSource?: string) =>
    apiFetch<{ token: string; user: User }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password, ...(utmSource ? { utmSource } : {}) }),
    }),
  register: (params: { email: string; password: string; code: string; referralCode?: string; utmSource?: string }) =>
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
  landingBlocks: (page = 'main') => apiFetch<any[]>(`/public/landing/blocks?page=${page}`),
  brand:   () => apiFetch<Record<string, string>>('/public/brand'),
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

  dashboardOverview: (days: 1 | 7 | 30 | 365 = 30, dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams({ days: String(days) })
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    return apiFetch<any>(`/admin/dashboard/overview?${params}`)
  },
  dashboardEvents: (limit = 20) =>
    apiFetch<any>(`/admin/dashboard/events?limit=${limit}`),

  // File upload (multipart/form-data)
  uploadFile: async (formData: FormData): Promise<{ ok: boolean; url: string; filename: string }> => {
    const res = await fetch('/api/admin/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    return res.json()
  },

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
  updateUserProfile: (id: string, data: { email?: string | null; telegramId?: string | null }) =>
    apiFetch<{ ok: boolean; user: { id: string; email: string | null; telegramId: string | null } }>(`/admin/users/${id}/profile`, {
      method: 'PATCH', body: JSON.stringify(data),
    }),
  resetUserPassword: (id: string) =>
    apiFetch<{ ok: boolean; password: string; sentTo: string }>(`/admin/users/${id}/reset-password`, { method: 'POST' }),

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

  paymentTotals: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v).map(([k, v]) => [k, v]))
    return apiFetch<{
      oborot: number; revenue: number; commission: number; commissionPct: number
      totalRefunds: number; credited: number
      refundedCount: number; partialRefundCount: number
      paidCount: number; totalCount: number
    }>(`/admin/payments/totals?${q}`)
  },

  // Settings
  settings:       () => apiFetch<Record<string, string>>('/admin/settings'),
  updateSettings: (data: Record<string, string>) =>
    apiFetch<{ ok: boolean }>('/admin/settings', { method: 'PUT', body: JSON.stringify(data) }),
  getSettings:    () => apiFetch<Record<string, string>>('/admin/settings'),
  saveSettings:   (settings: { key: string; value: string }[]) =>
    apiFetch<{ ok: boolean }>('/admin/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),
  testEmail:      () => apiFetch<any>('/admin/settings/test-email', { method: 'POST' }),
  testRemnawave:  () => apiFetch<any>('/admin/settings/test-remnawave', { method: 'POST' }),
  restartServices: () => apiFetch<{ ok: boolean }>('/admin/settings/restart', { method: 'POST' }),
  envStatus:      () => apiFetch<Record<string, string>>('/admin/settings/env-status'),

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

  // Landing Builder (block-based)
  landingBlocks:       (page = 'main') => apiFetch<any[]>(`/admin/landing/blocks?page=${page}`),
  createLandingBlock:  (data: { pageKey?: string; type: string; data?: any; visible?: boolean }) =>
    apiFetch<any>('/admin/landing/blocks', { method: 'POST', body: JSON.stringify(data) }),
  updateLandingBlock:  (id: string, patch: { type?: string; data?: any; visible?: boolean }) =>
    apiFetch<any>(`/admin/landing/blocks/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteLandingBlock:  (id: string) =>
    apiFetch<{ ok: boolean }>(`/admin/landing/blocks/${id}`, { method: 'DELETE' }),
  reorderLandingBlocks: (items: { id: string; sortOrder: number }[]) =>
    apiFetch<{ ok: boolean }>('/admin/landing/blocks/reorder', { method: 'POST', body: JSON.stringify({ items }) }),

  // Email templates
  listEmailTemplates: () => apiFetch<Array<{
    key: string; name: string; description: string; vars: string[];
    customized: boolean; value: string; defaultValue: string
  }>>('/admin/settings/email-templates'),
  saveEmailTemplate: (key: string, value: string) =>
    apiFetch<{ ok: boolean }>(`/admin/settings/email-templates/${key}`, {
      method: 'PUT', body: JSON.stringify({ value }),
    }),
  resetEmailTemplate: (key: string) =>
    apiFetch<{ ok: boolean }>(`/admin/settings/email-templates/${key}`, { method: 'DELETE' }),
  testEmailTemplate: (key: string, to: string) =>
    apiFetch<{ ok: boolean }>(`/admin/settings/email-templates/${key}/test`, {
      method: 'POST', body: JSON.stringify({ to }),
    }),

  // Analytics
  analyticsHealth: () => apiFetch<{ remnawave: any }>('/admin/analytics/health'),
  analyticsNodes:  () => apiFetch<{ nodes: any[] }>('/admin/analytics/nodes'),

  // Import / Export
  importStatus: () => apiFetch<{ total: number; matched: number; pending: number; unmatched: number }>('/admin/import'),
  exportUsers:  (format = 'json') => apiFetch<{ users: any[]; total: number }>(`/admin/export/users?format=${format}`),

  // Universal import (new)
  uploadImport: async (file: File): Promise<any> => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/admin/import/upload', {
      method: 'POST',
      credentials: 'include',
      body: fd,
    })
    if (!res.ok) throw new Error('Upload failed')
    return res.json()
  },
  startUserImport: (fileId: string, mapping: any) =>
    apiFetch<{ jobId: string }>('/admin/import/users/import', {
      method: 'POST',
      body: JSON.stringify({ fileId, mapping }),
    }),
  startPaymentImport: (fileId: string, mapping: any) =>
    apiFetch<{ jobId: string }>('/admin/import/payments/import', {
      method: 'POST',
      body: JSON.stringify({ fileId, mapping }),
    }),
  importStats: () => apiFetch<{ usersWithLeadtehId: number; paymentsWithCommission: number; totalCommission: number }>('/admin/import/stats'),
  accountingPreview: async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/admin/import/accounting/preview', {
      method: 'POST',
      body: fd,
      credentials: 'include',
    })
    if (!res.ok) throw new Error('Preview failed')
    return res.json()
  },
  startAccountingImport: (fileId: string, options: Record<string, boolean>) =>
    apiFetch<{ jobId: string }>('/admin/import/accounting/import', {
      method: 'POST',
      body: JSON.stringify({ fileId, options }),
    }),
  clearBuhData: () =>
    apiFetch<{ ok: boolean }>('/admin/import/clear-buh', { method: 'POST' }),
  clearUsers: () =>
    apiFetch<{ ok: boolean; deleted: number }>('/admin/import/clear-users', { method: 'POST' }),
  clearPayments: () =>
    apiFetch<{ ok: boolean; deleted: number }>('/admin/import/clear-payments', { method: 'POST' }),
  refundPayment: (id: string, amount?: number) =>
    apiFetch<{ ok: boolean; refundId: string; amount: number; status: string }>(`/admin/payments/${id}/refund`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),
  exportDbJson: async () => {
    const res = await fetch('/api/admin/import/db/export/json', { credentials: 'include' })
    if (!res.ok) throw new Error('Export failed')
    return res.blob()
  },
  restoreDbJson: async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/admin/import/db/restore', {
      method: 'POST',
      body: fd,
      credentials: 'include',
    })
    if (!res.ok) throw new Error('Restore failed')
    return res.json() as Promise<{ jobId: string }>
  },
  yukassaSync: (dateFrom?: string, dateTo?: string) =>
    apiFetch<{ jobId: string }>('/admin/import/yukassa-sync', {
      method: 'POST',
      body: JSON.stringify({ dateFrom, dateTo }),
    }),

  squads: () => apiFetch<{ squads: InternalSquad[]; total: number }>('/admin/squads'),

  // Promos
  promos: () => apiFetch<any[]>('/admin/promos'),
  createPromo: (data: any) => apiFetch<any>('/admin/promos', { method: 'POST', body: JSON.stringify(data) }),
  updatePromo: (id: string, data: any) => apiFetch<any>(`/admin/promos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePromo: (id: string) => apiFetch<void>(`/admin/promos/${id}`, { method: 'DELETE' }),
  promoStats: (id: string) => apiFetch<any>(`/admin/promos/${id}/stats`),

  // ── Buhgalteria: Dashboard ──────────────────────────────
  buhDashboard: () => apiFetch<any>('/admin/buh-dashboard'),

  // ── Buhgalteria: Transactions ───────────────────────────
  buhTransactions: (params: { type?: string; category_id?: string; date_from?: string; date_to?: string; search?: string; skip?: number; limit?: number } = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([,v]) => v != null).map(([k,v]) => [k, String(v)]))
    return apiFetch<{ items: any[]; total: number }>(`/admin/transactions?${q}`)
  },
  getBuhTransaction: (id: string) =>
    apiFetch<any>(`/admin/transactions/${id}`),
  createBuhTransaction: (data: any) =>
    apiFetch<any>('/admin/transactions', { method: 'POST', body: JSON.stringify(data) }),
  updateBuhTransaction: (id: string, data: any) =>
    apiFetch<any>(`/admin/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBuhTransaction: (id: string) =>
    apiFetch<void>(`/admin/transactions/${id}`, { method: 'DELETE' }),
  buhTransactionSummary: (year?: number) =>
    apiFetch<any[]>(`/admin/transactions/summary/by-month${year ? `?year=${year}` : ''}`),

  // ── Buhgalteria: Categories ─────────────────────────────
  buhCategories: () => apiFetch<any[]>('/admin/categories'),
  createBuhCategory: (data: any) =>
    apiFetch<any>('/admin/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateBuhCategory: (id: string, data: any) =>
    apiFetch<any>(`/admin/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBuhCategory: (id: string) =>
    apiFetch<void>(`/admin/categories/${id}`, { method: 'DELETE' }),
  buhAutoRules: () => apiFetch<any[]>('/admin/categories/auto-rules'),
  createBuhAutoRule: (data: any) =>
    apiFetch<any>('/admin/categories/auto-rules', { method: 'POST', body: JSON.stringify(data) }),
  deleteBuhAutoRule: (id: string) =>
    apiFetch<void>(`/admin/categories/auto-rules/${id}`, { method: 'DELETE' }),

  // ── Buhgalteria: Partners ───────────────────────────────
  buhPartners: () => apiFetch<any[]>('/admin/partners'),
  buhPartnerById: (id: string) => apiFetch<any>(`/admin/partners/${id}`),
  createBuhPartner: (data: any) =>
    apiFetch<any>('/admin/partners', { method: 'POST', body: JSON.stringify(data) }),
  updateBuhPartner: (id: string, data: any) =>
    apiFetch<any>(`/admin/partners/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBuhPartner: (id: string) =>
    apiFetch<void>(`/admin/partners/${id}`, { method: 'DELETE' }),

  // ── Buhgalteria: Inkas ──────────────────────────────────
  buhInkas: (partnerId?: string) => {
    const q = partnerId ? `?partner_id=${partnerId}` : ''
    return apiFetch<any[]>(`/admin/inkas${q}`)
  },
  createBuhInkas: (data: any) =>
    apiFetch<any>('/admin/inkas', { method: 'POST', body: JSON.stringify(data) }),
  deleteBuhInkas: (id: string) =>
    apiFetch<void>(`/admin/inkas/${id}`, { method: 'DELETE' }),

  // ── Buhgalteria: Infrastructure ─────────────────────────
  buhServers: () => apiFetch<any[]>('/admin/infrastructure'),
  createBuhServer: (data: any) =>
    apiFetch<any>('/admin/infrastructure', { method: 'POST', body: JSON.stringify(data) }),
  updateBuhServer: (id: string, data: any) =>
    apiFetch<any>(`/admin/infrastructure/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBuhServer: (id: string) =>
    apiFetch<void>(`/admin/infrastructure/${id}`, { method: 'DELETE' }),

  // ── Buhgalteria: Ads/Marketing ──────────────────────────
  buhAds: (params: { date_from?: string; date_to?: string } = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([,v]) => v).map(([k,v]) => [k, String(v)]))
    return apiFetch<any[]>(`/admin/ads?${q}`)
  },
  createBuhAd: (data: any) =>
    apiFetch<any>('/admin/ads', { method: 'POST', body: JSON.stringify(data) }),
  updateBuhAd: (id: string, data: any) =>
    apiFetch<any>(`/admin/ads/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBuhAd: (id: string) =>
    apiFetch<void>(`/admin/ads/${id}`, { method: 'DELETE' }),
  buhAdsSummary: (params: { date_from?: string; date_to?: string } = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([,v]) => v).map(([k,v]) => [k, String(v)]))
    return apiFetch<any>(`/admin/ads/summary?${q}`)
  },
  buhAdsFunnel: (params: { date_from?: string; date_to?: string } = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([,v]) => v).map(([k,v]) => [k, String(v)]))
    return apiFetch<any>(`/admin/ads/funnel?${q}`)
  },
  createUtmBuilder: (data: { baseUrl: string; utmSource: string; utmMedium?: string; utmCampaign?: string }) =>
    apiFetch<any>('/admin/ads/utm-builder', { method: 'POST', body: JSON.stringify(data) }),
  buhAdStats: (id: string, groupBy: 'day' | 'week' | 'month' = 'day') =>
    apiFetch<any>(`/admin/ads/${id}/stats?groupBy=${groupBy}`),

  // ── Buhgalteria: Recurring ──────────────────────────────
  buhRecurring: () => apiFetch<any[]>('/admin/recurring'),
  createBuhRecurring: (data: any) =>
    apiFetch<any>('/admin/recurring', { method: 'POST', body: JSON.stringify(data) }),
  deleteBuhRecurring: (id: string) =>
    apiFetch<void>(`/admin/recurring/${id}`, { method: 'DELETE' }),

  // ── Buhgalteria: Milestones ─────────────────────────────
  buhMilestones: () => apiFetch<any[]>('/admin/milestones'),
  createBuhMilestone: (data: any) =>
    apiFetch<any>('/admin/milestones', { method: 'POST', body: JSON.stringify(data) }),
  deleteBuhMilestone: (id: string) =>
    apiFetch<void>(`/admin/milestones/${id}`, { method: 'DELETE' }),

  // ── Buhgalteria: Monthly Stats ──────────────────────────
  buhMonthlyStats: (year?: number) =>
    apiFetch<any[]>(`/admin/monthly-stats${year ? `?year=${year}` : ''}`),
  upsertBuhMonthlyStats: (year: number, month: number, data: any) =>
    apiFetch<any>(`/admin/monthly-stats/${year}/${month}`, { method: 'PUT', body: JSON.stringify(data) }),

  // ── Buhgalteria: UTM ────────────────────────────────────
  buhUtmStats: (code: string) => apiFetch<any>(`/admin/utm/stats/${code}`),
  buhUtmSummary: () => apiFetch<any>('/admin/utm/summary'),

  // ── Buhgalteria: Audit ──────────────────────────────────
  buhAuditLog: (params: { skip?: number; limit?: number; entity?: string; action?: string } = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([,v]) => v != null).map(([k,v]) => [k, String(v)]))
    return apiFetch<{ items: any[]; total: number }>(`/admin/audit?${q}`)
  },

  // ── Buhgalteria: Notification Channels ──────────────────
  buhChannels: () => apiFetch<any[]>('/admin/channels'),
  createBuhChannel: (data: any) =>
    apiFetch<any>('/admin/channels', { method: 'POST', body: JSON.stringify(data) }),
  updateBuhChannel: (id: string, data: any) =>
    apiFetch<any>(`/admin/channels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBuhChannel: (id: string) =>
    apiFetch<void>(`/admin/channels/${id}`, { method: 'DELETE' }),
  testBuhChannel: (id: string) =>
    apiFetch<{ ok: boolean }>(`/admin/channels/test/${id}`, { method: 'POST' }),

  // ── Buhgalteria: Webhook API Keys ───────────────────────
  buhWebhookKeys: () => apiFetch<any[]>('/admin/webhook-keys'),
  createBuhWebhookKey: (data: { name: string }) =>
    apiFetch<any>('/admin/webhook-keys', { method: 'POST', body: JSON.stringify(data) }),
  deleteBuhWebhookKey: (id: string) =>
    apiFetch<void>(`/admin/webhook-keys/${id}`, { method: 'DELETE' }),

  // ── Funnel Builder (visual node constructor) ────────────
  funnelGroups: () => apiFetch<any[]>('/admin/funnel-builder/groups'),
  funnelGroup: (id: string) => apiFetch<any>(`/admin/funnel-builder/groups/${id}`),
  createFunnelGroup: (data: any) => apiFetch<any>('/admin/funnel-builder/groups', { method: 'POST', body: JSON.stringify(data) }),
  updateFunnelGroup: (id: string, data: any) => apiFetch<any>(`/admin/funnel-builder/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFunnelGroup: (id: string) => apiFetch<void>(`/admin/funnel-builder/groups/${id}`, { method: 'DELETE' }),
  toggleFunnelGroup: (id: string) => apiFetch<any>(`/admin/funnel-builder/groups/${id}/toggle`, { method: 'POST' }),
  duplicateFunnelGroup: (id: string) => apiFetch<any>(`/admin/funnel-builder/groups/${id}/duplicate`, { method: 'POST' }),
  createFunnelNode: (groupId: string, data: any) => apiFetch<any>(`/admin/funnel-builder/groups/${groupId}/nodes`, { method: 'POST', body: JSON.stringify(data) }),
  updateFunnelNode: (nodeId: string, data: any) => apiFetch<any>(`/admin/funnel-builder/nodes/${nodeId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFunnelNode: (nodeId: string) => apiFetch<void>(`/admin/funnel-builder/nodes/${nodeId}`, { method: 'DELETE' }),
  updateNodePosition: (nodeId: string, posX: number, posY: number) => apiFetch<any>(`/admin/funnel-builder/nodes/${nodeId}/position`, { method: 'PUT', body: JSON.stringify({ posX, posY }) }),
  connectNodes: (nodeId: string, data: any) => apiFetch<any>(`/admin/funnel-builder/nodes/${nodeId}/connect`, { method: 'PUT', body: JSON.stringify(data) }),
  funnelNodeTypes: () => apiFetch<any[]>('/admin/funnel-builder/node-types'),
  funnelVariables: () => apiFetch<any>('/admin/funnel-builder/variables'),
  funnelBotBlocks: () => apiFetch<any>('/admin/funnel-builder/bot-blocks'),
  funnelLogs: (groupId: string, skip = 0) => apiFetch<any>(`/admin/funnel-builder/groups/${groupId}/logs?skip=${skip}`),
  funnelTemplates: () => apiFetch<any[]>('/admin/funnel-builder/templates'),
  installFunnelTemplate: (id: string) => apiFetch<any>(`/admin/funnel-builder/templates/${id}/install`, { method: 'POST' }),
  installAllFunnelTemplates: () => apiFetch<any>('/admin/funnel-builder/templates/install-all', { method: 'POST' }),
  funnelAnalytics: (groupId: string, days = 30) => apiFetch<any>(`/admin/funnel-builder/groups/${groupId}/analytics?days=${days}`),
  validateFunnel: (groupId: string) => apiFetch<any>(`/admin/funnel-builder/groups/${groupId}/validate`, { method: 'POST' }),
  simulateFunnel: (groupId: string, userId: string) => apiFetch<any>(`/admin/funnel-builder/groups/${groupId}/simulate`, { method: 'POST', body: JSON.stringify({ userId }) }),

  // ── Bot Constructor ─────────────────────────────────────
  botBlockGroups: () => apiFetch<any[]>('/admin/bot-blocks/groups'),
  botBlocks: (params: { groupId?: string; type?: string; search?: string } = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([,v]) => v).map(([k,v]) => [k, String(v)]))
    return apiFetch<{ blocks: any[]; total: number }>(`/admin/bot-blocks/blocks?${q}`)
  },
  botBlockById: (id: string) => apiFetch<any>(`/admin/bot-blocks/blocks/${id}`),
  botBlocksList: () => apiFetch<any[]>('/admin/bot-blocks/blocks-list'),
  createBotBlock: (data: any) =>
    apiFetch<any>('/admin/bot-blocks/blocks', { method: 'POST', body: JSON.stringify(data) }),
  updateBotBlock: (id: string, data: any) =>
    apiFetch<any>(`/admin/bot-blocks/blocks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  publishBotBlock: (id: string) =>
    apiFetch<any>(`/admin/bot-blocks/blocks/${id}/publish`, { method: 'PUT' }),
  deleteBotBlock: (id: string) =>
    apiFetch<void>(`/admin/bot-blocks/blocks/${id}`, { method: 'DELETE' }),
  createBotGroup: (data: any) =>
    apiFetch<any>('/admin/bot-blocks/groups', { method: 'POST', body: JSON.stringify(data) }),
  updateBotGroup: (id: string, data: any) =>
    apiFetch<any>(`/admin/bot-blocks/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBotGroup: (id: string) =>
    apiFetch<void>(`/admin/bot-blocks/groups/${id}`, { method: 'DELETE' }),
  createBotButton: (blockId: string, data: any) =>
    apiFetch<any>(`/admin/bot-blocks/blocks/${blockId}/buttons`, { method: 'POST', body: JSON.stringify(data) }),
  updateBotButton: (id: string, data: any) =>
    apiFetch<any>(`/admin/bot-blocks/buttons/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBotButton: (id: string) =>
    apiFetch<void>(`/admin/bot-blocks/buttons/${id}`, { method: 'DELETE' }),
  botTriggers: () => apiFetch<any[]>('/admin/bot-blocks/triggers'),
  createBotTrigger: (data: any) =>
    apiFetch<any>('/admin/bot-blocks/triggers', { method: 'POST', body: JSON.stringify(data) }),
  updateBotTrigger: (id: string, data: any) =>
    apiFetch<any>(`/admin/bot-blocks/triggers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBotTrigger: (id: string) =>
    apiFetch<void>(`/admin/bot-blocks/triggers/${id}`, { method: 'DELETE' }),
  botBlockStats: () => apiFetch<any>('/admin/bot-blocks/stats'),
}
