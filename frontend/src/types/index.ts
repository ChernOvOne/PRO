// ── User ─────────────────────────────────────────────────────
export interface User {
  id:           string
  email?:       string
  telegramId?:  string
  telegramName?: string
  subStatus:    SubStatus
  subExpireAt?: string
  subLink?:     string
  role:         'USER' | 'ADMIN'
  isActive:     boolean
  referralCode: string
  createdAt:    string
  lastLoginAt?: string
  remnawaveUuid?: string
}

export type SubStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'TRIAL'

// ── Tariff ───────────────────────────────────────────────────
export interface Tariff {
  id:           string
  name:         string
  description?: string
  durationDays: number
  priceRub:     number
  priceUsdt?:   number
  deviceLimit:  number
  trafficGb?:   number
  isFeatured:   boolean
  sortOrder:    number
  isActive:     boolean
}

// ── Payment ──────────────────────────────────────────────────
export interface Payment {
  id:          string
  amount:      number
  currency:    string
  status:      PaymentStatus
  provider:    PaymentProvider
  createdAt:   string
  confirmedAt?: string
  tariff:      Pick<Tariff, 'name' | 'durationDays'>
}

export type PaymentStatus    = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'EXPIRED'
export type PaymentProvider  = 'YUKASSA' | 'CRYPTOPAY' | 'MANUAL'

// ── Instruction ───────────────────────────────────────────────
export interface Instruction {
  id:         string
  title:      string
  deviceType: DeviceType
  content:    string
  sortOrder:  number
  isActive:   boolean
}

export type DeviceType = 'WINDOWS' | 'MACOS' | 'LINUX' | 'IOS' | 'ANDROID' | 'ROUTER' | 'OTHER'

// ── Referral ─────────────────────────────────────────────────
export interface ReferralInfo {
  referralCode:     string
  referralUrl:      string
  referrals:        ReferralEntry[]
  bonusDaysEarned:  number
  bonusPerReferral: number
  bonusHistory:     BonusEntry[]
}

export interface ReferralEntry {
  id:          string
  joinedAt:    string
  displayName: string
  hasPaid:     boolean
}

export interface BonusEntry {
  id:        string
  bonusDays: number
  appliedAt: string
}

// ── Dashboard ─────────────────────────────────────────────────
export interface DashboardData {
  user:            User
  rmStats:         RMStats | null
  referralUrl:     string
  referralCount:   number
  bonusDaysEarned: number
}

export interface RMStats {
  status:             string
  expireAt:           string | null
  usedTrafficBytes:   number
  trafficLimitBytes:  number | null
}

// ── Subscription ──────────────────────────────────────────────
// ── HWID Devices ─────────────────────────────────────────────
export interface HwidDevice {
  hwid:        string
  userUuid:    string
  platform:    string
  osVersion:   string
  deviceModel: string
  userAgent:   string
  createdAt:   string
  updatedAt:   string
}

export interface DevicesData {
  devices: HwidDevice[]
  total:   number
}

export interface InternalSquad {
  uuid:         string
  viewPosition: number
  name:         string
  info: { membersCount: number; inboundsCount: number }
}

export interface SubscriptionData {
  subUrl:              string
  qrCode:              string
  expireAt:            string | null
  status:              SubStatus
  usedTrafficBytes?:   number
  trafficLimitBytes?:  number | null
  daysLeft?:           number | null
  trafficUsedPercent?: number | null
  onlineAt?:           string | null
  subLastOpenedAt?:    string | null
  subLastUserAgent?:   string | null
  activeSquads?:       Array<{ uuid: string; name: string }>
}

// ── Admin ─────────────────────────────────────────────────────
export interface AdminStats {
  totalUsers:      number
  activeUsers:     number
  totalRevenue:    number
  todayRevenue:    number
  pendingPayments: number
  remnawave:       Record<string, unknown> | null
  revenueChart:    Array<{ date: string; amount: number }>
}

export interface AdminUser extends User {
  _count: { referrals: number; payments: number }
}

export interface AdminPayment extends Payment {
  user:   Pick<User, 'email' | 'telegramName' | 'telegramId'>
  tariff: Pick<Tariff, 'name' | 'durationDays'>
}

// ── API responses ─────────────────────────────────────────────
export interface ApiError {
  error: string
  hint?: string
}

export interface PaginatedResponse<T> {
  data:  T[]
  total: number
  page:  number
  limit: number
}

export interface CreatePaymentResponse {
  orderId:    string
  paymentUrl: string
  provider:   PaymentProvider
}
