// ── User ─────────────────────────────────────────────────────
export interface User {
  id:           string
  email?:       string
  emailVerified?: boolean
  telegramId?:  string
  telegramName?: string
  subStatus:    SubStatus
  subExpireAt?: string
  subLink?:     string
  role:         'USER' | 'ADMIN'
  isActive:     boolean
  referralCode: string
  balance?:     number
  createdAt:    string
  lastLoginAt?: string
  remnawaveUuid?: string
}

export type SubStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'TRIAL'

// ── Tariff ───────────────────────────────────────────────────
export interface Tariff {
  id:              string
  name:            string
  description?:    string
  countries?:      string
  protocol?:       string
  speed?:          string
  type?:           TariffType
  durationDays:    number
  priceRub:        number
  priceUsdt?:      number
  deviceLimit:     number
  trafficGb?:      number
  trafficStrategy?: string
  trafficAddonGb?: number
  isFeatured:      boolean
  sortOrder:       number
  isActive:        boolean
  remnawaveSquads?: string[]
  remnawaveTag?:   string
  mode?:           'simple' | 'variants' | 'configurator'
  variants?:       Array<{ days: number; priceRub: number; priceUsdt?: number; label: string; trafficGb?: number; deviceLimit?: number }>
  configurator?:   {
    traffic?: { pricePerUnit: number; min: number; max: number; step: number; default: number }
    days?: { pricePerUnit: number; min: number; max: number; step: number; default: number }
    devices?: { pricePerUnit: number; min: number; max: number; step: number; default: number }
  }
}

// ── Payment ──────────────────────────────────────────────────
export interface Payment {
  id:          string
  amount:      number
  currency:    string
  status:      PaymentStatus
  provider:    PaymentProvider
  purpose?:    PaymentPurpose
  createdAt:   string
  confirmedAt?: string
  tariff:      Pick<Tariff, 'name' | 'durationDays'>
  user?:       Pick<User, 'id' | 'email' | 'telegramName' | 'telegramId'>
}

export type PaymentStatus    = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'EXPIRED'
export type PaymentProvider  = 'YUKASSA' | 'CRYPTOPAY' | 'BALANCE' | 'MANUAL'
export type PaymentPurpose   = 'SUBSCRIPTION' | 'TOPUP' | 'GIFT'

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

// ── News & Promotions ────────────────────────────────────────
export interface News {
  id:           string
  type:         'NEWS' | 'PROMOTION'
  title:        string
  content:      string
  imageUrl?:    string
  buttons?:     Array<{ label: string; url: string; style?: string }>
  discountCode?: string
  discountPct?:  number
  discountAbs?:  number
  isActive:     boolean
  isPinned:     boolean
  publishedAt:  string
  expiresAt?:   string
  createdAt:    string
}

// ── Notification ─────────────────────────────────────────────
export interface Notification {
  id:        string
  title:     string
  message:   string
  type:      'INFO' | 'WARNING' | 'SUCCESS' | 'PROMO'
  linkUrl?:  string
  isRead:    boolean
  createdAt: string
}

// ── Telegram Proxy ───────────────────────────────────────────
export interface TelegramProxy {
  id:          string
  name:        string
  description?: string
  tgLink?:     string
  httpsLink?:  string
  tag?:        string
  isActive?:   boolean
  sortOrder?:  number
}

// ── Gift Subscription ────────────────────────────────────────
export interface GiftSubscription {
  id:              string
  giftCode:        string
  status:          'PENDING' | 'CLAIMED' | 'EXPIRED' | 'CANCELLED'
  message?:        string
  recipientEmail?: string
  expiresAt:       string
  claimedAt?:      string
  createdAt:       string
  tariff:          Pick<Tariff, 'name' | 'durationDays'>
  recipientUser?:  Pick<User, 'email' | 'telegramName'>
}

// ── Balance ──────────────────────────────────────────────────
export interface BalanceTransaction {
  id:          string
  amount:      number
  type:        'TOPUP' | 'REFERRAL_REWARD' | 'PURCHASE' | 'GIFT' | 'REFUND'
  description?: string
  createdAt:   string
}

// ── Admin Note ───────────────────────────────────────────────
export interface AdminNote {
  id:        string
  text:      string
  createdAt: string
  admin:     { email?: string; telegramName?: string }
}

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

export type TariffType = 'SUBSCRIPTION' | 'TRAFFIC_ADDON'

export interface TrafficAddon {
  id:           string
  name:         string
  type:         'TRAFFIC_ADDON'
  trafficAddonGb: number
  priceRub:     number
  priceUsdt?:   number
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
  user:   Pick<User, 'id' | 'email' | 'telegramName' | 'telegramId'>
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
