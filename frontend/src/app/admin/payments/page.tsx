'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  Search, ChevronLeft, ChevronRight, X, DollarSign, Clock,
  TrendingUp, AlertCircle, Calendar, ChevronDown, ExternalLink,
  Gift, Star, Users, CreditCard, Zap, Tag
} from 'lucide-react'

/* ── Types ─────────────────────────────────────────────────── */

interface PaymentUser {
  id?: string
  email?: string
  telegramName?: string
  telegramId?: string
}

interface Payment {
  id: string
  amount: number
  currency: string
  status: string
  provider: string
  purpose?: string
  createdAt: string
  confirmedAt?: string
  yukassaStatus?: string
  user: PaymentUser
  tariff: { name: string }
}

interface ParsedMeta {
  _type?: string
  _mode?: string
  promoCode?: string
  promoDiscount?: number
  [key: string]: unknown
}

/* ── Constants ─────────────────────────────────────────────── */

const LIMIT = 30

const STATUS_CLASS: Record<string, string> = {
  PAID: 'badge-green',
  PENDING: 'badge-yellow',
  FAILED: 'badge-red',
  REFUNDED: 'badge-gray',
  EXPIRED: 'badge-red',
}

const STATUS_LABEL: Record<string, string> = {
  PAID: 'Оплачен',
  PENDING: 'Ожидание',
  FAILED: 'Отклонён',
  REFUNDED: 'Возврат',
  EXPIRED: 'Истёк',
}

const PROVIDER_LABEL: Record<string, string> = {
  YUKASSA: 'ЮKassa',
  CRYPTOPAY: 'CryptoPay',
  BALANCE: 'Баланс',
  MANUAL: 'Вручную',
}

const PURPOSE_LABEL: Record<string, string> = {
  SUBSCRIPTION: 'Подписка',
  TOPUP: 'Пополнение',
  GIFT: 'Подарок',
}

/* ── Helpers ───────────────────────────────────────────────── */

function parseMeta(raw?: string): ParsedMeta | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

type PaymentType = 'payment' | 'bonus' | 'referral' | 'topup' | 'gift' | 'manual'

function detectType(p: Payment, meta: ParsedMeta | null): PaymentType {
  if (p.provider === 'MANUAL') return 'manual'
  if (meta?._type === 'bonus_redeem') return 'bonus'
  if (meta?._type === 'referral_redeem') return 'referral'
  if (p.purpose === 'GIFT') return 'gift'
  if (p.purpose === 'TOPUP') return 'topup'
  return 'payment'
}

const TYPE_CONFIG: Record<PaymentType, { label: string; badge: string; icon: typeof CreditCard }> = {
  payment:  { label: 'Оплата',     badge: 'badge-green',  icon: CreditCard },
  bonus:    { label: 'Бонус дни',  badge: 'badge-violet', icon: Star },
  referral: { label: 'Реф. дни',   badge: 'badge-cyan',   icon: Users },
  topup:    { label: 'Пополнение', badge: 'badge-blue',   icon: Zap },
  gift:     { label: 'Подарок',    badge: 'badge-pink',   icon: Gift },
  manual:   { label: 'Ручной',     badge: 'badge-gray',   icon: Tag },
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

function formatAmount(amount: number, currency: string) {
  if (currency === 'RUB') return `${amount.toLocaleString('ru')} ₽`
  if (currency === 'USD') return `$${amount.toLocaleString('en')}`
  if (currency === 'USDT') return `${amount} USDT`
  return `${amount} ${currency}`
}

function isToday(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  return d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
}

/* ── Badge components for custom colors ────────────────────── */

function TypeBadge({ type }: { type: PaymentType }) {
  const cfg = TYPE_CONFIG[type]
  const Icon = cfg.icon

  // For types that don't have native CSS badge classes, use inline styles
  const customStyles: Record<string, React.CSSProperties> = {
    'badge-cyan': { background: 'rgba(34,211,238,0.12)', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.2)' },
    'badge-blue': { background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' },
    'badge-pink': { background: 'rgba(244,114,182,0.12)', color: '#f472b6', border: '1px solid rgba(244,114,182,0.2)' },
  }

  const isCustom = ['badge-cyan', 'badge-blue', 'badge-pink'].includes(cfg.badge)

  return (
    <span
      className={isCustom ? '' : cfg.badge}
      style={{
        ...(isCustom ? {
          ...customStyles[cfg.badge],
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 500,
          whiteSpace: 'nowrap' as const,
        } : {}),
        ...(!isCustom ? { display: 'inline-flex', alignItems: 'center', gap: '4px' } : {}),
      }}
    >
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

/* ── Component ─────────────────────────────────────────────── */

export default function AdminPayments() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [provider, setProvider] = useState('')
  const [purpose, setPurpose] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null)

  /* ── Fetch ─────────────────────────────────── */

  const load = useCallback(() => {
    setLoading(true)
    const params: Record<string, string> = {
      page: String(page),
      limit: String(LIMIT),
    }
    if (status) params.status = status
    if (provider) params.provider = provider
    if (search) params.search = search
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo

    const q = new URLSearchParams(params)
    fetch(`/api/admin/payments?${q}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setPayments(d.payments ?? [])
        setTotal(d.total ?? 0)
      })
      .catch(() => {
        setPayments([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [page, status, provider, search, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  /* ── Derived data ──────────────────────────── */

  const enriched = useMemo(() =>
    payments.map(p => {
      const meta = parseMeta(p.yukassaStatus)
      const type = detectType(p, meta)
      return { ...p, meta, type }
    }), [payments])

  // Client-side filters for purpose and type (not supported server-side for type)
  const filtered = useMemo(() => {
    let list = enriched
    if (purpose) {
      list = list.filter(p => (p.purpose ?? '').toUpperCase() === purpose)
    }
    if (typeFilter) {
      list = list.filter(p => p.type === typeFilter)
    }
    return list
  }, [enriched, purpose, typeFilter])

  const totalPages = Math.ceil(total / LIMIT)

  // Summary stats (computed from current page + filters for display)
  const stats = useMemo(() => {
    const paid = filtered.filter(p => p.status === 'PAID')
    const totalRevenue = paid.reduce((s, p) => s + (p.currency === 'RUB' ? p.amount : 0), 0)
    const todayRevenue = paid
      .filter(p => isToday(p.createdAt))
      .reduce((s, p) => s + (p.currency === 'RUB' ? p.amount : 0), 0)
    const pendingCount = filtered.filter(p => p.status === 'PENDING').length
    return { totalRevenue, todayRevenue, totalTransactions: total, pendingCount }
  }, [filtered, total])

  const selectedPayment = useMemo(
    () => enriched.find(p => p.id === selectedId) ?? null,
    [enriched, selectedId]
  )

  /* ── Reset page on filter change ───────────── */

  function resetPage() { setPage(1) }

  /* ── Render ────────────────────────────────── */

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Платежи</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          {total} записей
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Выручка (стр.)"
          value={`${stats.totalRevenue.toLocaleString('ru')} ₽`}
          color="#34d399"
        />
        <SummaryCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Сегодня"
          value={`${stats.todayRevenue.toLocaleString('ru')} ₽`}
          color="#60a5fa"
        />
        <SummaryCard
          icon={<CreditCard className="w-4 h-4" />}
          label="Всего транзакций"
          value={String(stats.totalTransactions)}
          color="var(--accent-1)"
        />
        <SummaryCard
          icon={<Clock className="w-4 h-4" />}
          label="Ожидают"
          value={String(stats.pendingCount)}
          color="#fbbf24"
        />
      </div>

      {/* Filters */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: 'var(--text-tertiary)' }}
            />
            <input
              className="glass-input pl-9 py-2 text-sm w-full"
              placeholder="Поиск по email, Telegram, ID..."
              value={search}
              onChange={e => { setSearch(e.target.value); resetPage() }}
            />
          </div>

          {/* Status */}
          <select
            className="glass-input w-auto py-2 text-sm"
            value={status}
            onChange={e => { setStatus(e.target.value); resetPage() }}
          >
            <option value="">Все статусы</option>
            <option value="PAID">Оплачен</option>
            <option value="PENDING">Ожидание</option>
            <option value="FAILED">Отклонён</option>
          </select>

          {/* Provider */}
          <select
            className="glass-input w-auto py-2 text-sm"
            value={provider}
            onChange={e => { setProvider(e.target.value); resetPage() }}
          >
            <option value="">Все провайдеры</option>
            <option value="YUKASSA">ЮKassa</option>
            <option value="CRYPTOPAY">CryptoPay</option>
            <option value="BALANCE">Баланс</option>
            <option value="MANUAL">Вручную</option>
          </select>

          {/* Purpose */}
          <select
            className="glass-input w-auto py-2 text-sm"
            value={purpose}
            onChange={e => { setPurpose(e.target.value); resetPage() }}
          >
            <option value="">Все цели</option>
            <option value="SUBSCRIPTION">Подписка</option>
            <option value="TOPUP">Пополнение</option>
            <option value="GIFT">Подарок</option>
          </select>

          {/* Type */}
          <select
            className="glass-input w-auto py-2 text-sm"
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); resetPage() }}
          >
            <option value="">Все типы</option>
            <option value="payment">Оплата</option>
            <option value="bonus">Бонус дни</option>
            <option value="referral">Реф. дни</option>
            <option value="topup">Пополнение</option>
            <option value="gift">Подарок</option>
            <option value="manual">Ручной</option>
          </select>
        </div>

        {/* Date range */}
        <div className="flex gap-3 flex-wrap items-center">
          <Calendar className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="date"
            className="glass-input py-1.5 px-3 text-sm w-auto"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); resetPage() }}
            placeholder="С"
          />
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>—</span>
          <input
            type="date"
            className="glass-input py-1.5 px-3 text-sm w-auto"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); resetPage() }}
            placeholder="По"
          />
          {(dateFrom || dateTo) && (
            <button
              className="text-xs hover:underline"
              style={{ color: 'var(--text-secondary)' }}
              onClick={() => { setDateFrom(''); setDateTo(''); resetPage() }}
            >
              Сбросить даты
            </button>
          )}
        </div>
      </div>

      {/* Content: Table + Detail Panel */}
      <div className="flex gap-4">
        {/* Table */}
        <div className={`glass-card overflow-hidden p-0 ${selectedId ? 'flex-1 min-w-0' : 'w-full'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  {['Пользователь', 'Тип', 'Тариф', 'Сумма', 'Промо', 'Статус', 'Провайдер', 'Дата'].map(h => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 font-medium text-xs whitespace-nowrap"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(10)].map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                      {[...Array(8)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 skeleton rounded w-20" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center" style={{ color: 'var(--text-tertiary)' }}>
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p>Платежи не найдены</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(p => {
                    const isSelected = p.id === selectedId
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedId(isSelected ? null : p.id)}
                        className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                        style={{
                          borderBottom: '1px solid var(--glass-border)',
                          ...(isSelected ? { background: 'var(--surface-2)' } : {}),
                        }}
                      >
                        {/* User */}
                        <td className="px-4 py-3">
                          {p.user.id ? (
                            <Link
                              href={`/admin/users/${p.user.id}`}
                              className="block hover:underline"
                              style={{ color: 'var(--accent-1)' }}
                              onClick={e => e.stopPropagation()}
                            >
                              <p className="font-medium truncate max-w-[140px]">
                                {p.user.telegramName || p.user.email?.split('@')[0] || '—'}
                              </p>
                            </Link>
                          ) : (
                            <p className="font-medium truncate max-w-[140px]" style={{ color: 'var(--text-primary)' }}>
                              {p.user.telegramName || p.user.email?.split('@')[0] || '—'}
                            </p>
                          )}
                          <p className="text-xs truncate max-w-[140px]" style={{ color: 'var(--text-tertiary)' }}>
                            {p.user.email || p.user.telegramId || '—'}
                          </p>
                        </td>

                        {/* Type */}
                        <td className="px-4 py-3">
                          <TypeBadge type={p.type} />
                        </td>

                        {/* Tariff */}
                        <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>
                          {p.tariff?.name || '—'}
                        </td>

                        {/* Amount */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {formatAmount(p.amount, p.currency)}
                          </span>
                          {p.meta?.originalAmount != null && p.meta.originalAmount !== p.amount && (
                            <span className="text-xs line-through ml-1.5" style={{ color: 'var(--text-tertiary)' }}>
                              {formatAmount(p.meta.originalAmount as number, p.currency)}
                            </span>
                          )}
                        </td>

                        {/* Promo */}
                        <td className="px-4 py-3">
                          {p.meta?.promoCode ? (
                            <span
                              className="badge-violet"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            >
                              <Tag className="w-3 h-3" />
                              {p.meta.promoCode}
                              {(p.meta.discountPct || p.meta.promoDiscount) ? ` -${p.meta.discountPct || p.meta.promoDiscount}%` : ''}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={STATUS_CLASS[p.status] || 'badge-gray'}>
                            {STATUS_LABEL[p.status] || p.status}
                          </span>
                        </td>

                        {/* Provider */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                          {PROVIDER_LABEL[p.provider] || p.provider}
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
                          {formatDate(p.createdAt)}{' '}{formatTime(p.createdAt)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: '1px solid var(--glass-border)' }}
            >
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                {Math.min((page - 1) * LIMIT + 1, total)}–{Math.min(page * LIMIT, total)} из {total}
              </p>
              <div className="flex gap-2 items-center">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 disabled:opacity-30 hover:bg-white/[0.05] rounded-lg transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm px-2" style={{ color: 'var(--text-primary)' }}>
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 disabled:opacity-30 hover:bg-white/[0.05] rounded-lg transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedPayment && (
          <DetailPanel payment={selectedPayment} onClose={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  )
}

/* ── Summary Card ──────────────────────────────────────────── */

function SummaryCard({
  icon, label, value, color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div className="glass-card p-4 flex items-center gap-3">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: `${color}15`, color }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
        <p className="text-lg font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
      </div>
    </div>
  )
}

/* ── Detail Panel ──────────────────────────────────────────── */

function DetailPanel({
  payment: p,
  onClose,
}: {
  payment: Payment & { meta: ParsedMeta | null; type: PaymentType }
  onClose: () => void
}) {
  return (
    <div className="glass-card p-0 w-[360px] shrink-0 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--glass-border)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Детали платежа
        </h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/[0.05] rounded-md transition-colors"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto max-h-[600px]">
        {/* ID */}
        <DetailRow label="ID" value={p.id} mono />

        {/* User */}
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Пользователь</p>
          {p.user.id ? (
            <Link
              href={`/admin/users/${p.user.id}`}
              className="text-sm font-medium inline-flex items-center gap-1 hover:underline"
              style={{ color: 'var(--accent-1)' }}
            >
              {p.user.telegramName || p.user.email?.split('@')[0] || '—'}
              <ExternalLink className="w-3 h-3" />
            </Link>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {p.user.telegramName || p.user.email?.split('@')[0] || '—'}
            </p>
          )}
          {p.user.email && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{p.user.email}</p>
          )}
          {p.user.telegramId && (
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>TG: {p.user.telegramId}</p>
          )}
        </div>

        {/* Type + Status */}
        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Тип</p>
            <TypeBadge type={p.type} />
          </div>
          <div className="flex-1">
            <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Статус</p>
            <span className={STATUS_CLASS[p.status] || 'badge-gray'}>
              {STATUS_LABEL[p.status] || p.status}
            </span>
          </div>
        </div>

        {/* Amount */}
        <DetailRow label="Сумма" value={formatAmount(p.amount, p.currency)} bold />

        {/* Tariff */}
        <DetailRow label="Тариф" value={p.tariff?.name || '—'} />

        {/* Provider */}
        <DetailRow label="Провайдер" value={PROVIDER_LABEL[p.provider] || p.provider} />

        {/* Purpose */}
        {p.purpose && (
          <DetailRow label="Цель" value={PURPOSE_LABEL[p.purpose?.toUpperCase()] || p.purpose} />
        )}

        {/* Dates */}
        <DetailRow
          label="Создан"
          value={`${formatDate(p.createdAt)} ${formatTime(p.createdAt)}`}
        />
        {p.confirmedAt && (
          <DetailRow
            label="Подтверждён"
            value={`${formatDate(p.confirmedAt)} ${formatTime(p.confirmedAt)}`}
          />
        )}

        {/* Promo */}
        {p.meta?.promoCode && (
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Промокод</p>
            <span className="badge-violet" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              <Tag className="w-3 h-3" />
              {p.meta.promoCode}
              {(p.meta.discountPct || p.meta.promoDiscount) ? ` (-${p.meta.discountPct || p.meta.promoDiscount}%)` : ''}
            </span>
            {p.meta.originalAmount != null && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Без скидки: {formatAmount(p.meta.originalAmount as number, p.currency)}
              </p>
            )}
          </div>
        )}

        {/* Metadata */}
        {p.meta && (
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Метаданные</p>
            <div
              className="rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all"
              style={{
                background: 'var(--surface-1)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--glass-border)',
              }}
            >
              {JSON.stringify(p.meta, null, 2)}
            </div>
          </div>
        )}

        {/* Mode info */}
        {p.meta?._mode && (
          <DetailRow label="Режим" value={p.meta._mode === 'variant' ? 'Вариант' : p.meta._mode === 'configurator' ? 'Конфигуратор' : String(p.meta._mode)} />
        )}
      </div>
    </div>
  )
}

/* ── Detail Row ────────────────────────────────────────────── */

function DetailRow({
  label, value, mono, bold,
}: {
  label: string
  value: string
  mono?: boolean
  bold?: boolean
}) {
  return (
    <div>
      <p className="text-xs mb-0.5" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      <p
        className={`text-sm ${mono ? 'font-mono text-xs break-all' : ''} ${bold ? 'font-semibold' : ''}`}
        style={{ color: 'var(--text-primary)' }}
      >
        {value}
      </p>
    </div>
  )
}
