'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  Search, ChevronLeft, ChevronRight, X, DollarSign, Clock,
  TrendingUp, AlertCircle, Calendar, ChevronDown, ExternalLink,
  Gift, Star, Users, CreditCard, Zap, Tag, Percent, Wallet, Receipt,
  ArrowDownCircle, Filter, UserX, UserCheck, RefreshCw, Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '@/lib/api'

/* ── Types ─────────────────────────────────────────────────── */

interface PaymentUser {
  id?: string
  email?: string
  telegramName?: string
  telegramId?: string
  customerSource?: string
}

interface Payment {
  id: string
  amount: number
  commission?: number
  refundAmount?: number
  refundedAt?: string
  currency: string
  status: string
  provider: string
  purpose?: string
  createdAt: string
  confirmedAt?: string
  yukassaStatus?: string
  user: PaymentUser | null
  tariff: { name: string }
}

interface ParsedMeta {
  _type?: string
  _mode?: string
  promoCode?: string
  promoDiscount?: number
  [key: string]: unknown
}

interface Totals {
  oborot: number; revenue: number; commission: number; commissionPct: number
  totalRefunds: number; credited: number
  refundedCount: number; partialRefundCount: number
  paidCount: number; totalCount: number
}

/* ── Constants ─────────────────────────────────────────────── */

const LIMIT = 30

const STATUS_CLASS: Record<string, string> = {
  PAID: 'badge-green',
  PENDING: 'badge-yellow',
  FAILED: 'badge-red',
  REFUNDED: 'badge-gray',
  PARTIAL_REFUND: 'badge-gray',
  EXPIRED: 'badge-red',
}

const STATUS_LABEL: Record<string, string> = {
  PAID: 'Оплачен',
  PENDING: 'Ожидание',
  FAILED: 'Отклонён',
  REFUNDED: 'Полный возврат',
  PARTIAL_REFUND: 'Частичный возврат',
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
  } catch { return null }
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
  return new Date(iso).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

function formatAmount(amount: number, currency = 'RUB') {
  if (currency === 'RUB') return `${amount.toLocaleString('ru')} ₽`
  if (currency === 'USD') return `$${amount.toLocaleString('en')}`
  return `${amount} ${currency}`
}

function fmtNum(n: number): string {
  return n.toLocaleString('ru', { maximumFractionDigits: 0 })
}

/* ── Badge components ────────────────────────────────────── */

function TypeBadge({ type }: { type: PaymentType }) {
  const cfg = TYPE_CONFIG[type]
  const Icon = cfg.icon
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
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
        } : {}),
      }}
    >
      <Icon className="w-3 h-3" style={{ display: 'inline', verticalAlign: '-1px' }} />
      {' '}{cfg.label}
    </span>
  )
}

/* ── Page ─────────────────────────────────────────────────── */

export default function AdminPayments() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Totals
  const [totals, setTotals] = useState<Totals | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [provider, setProvider] = useState('')
  const [userFilter, setUserFilter] = useState('') // '' | 'with' | 'without'
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [activePeriod, setActivePeriod] = useState<number | null>(null)

  // Sync
  const [syncing, setSyncing] = useState(false)
  const [syncJob, setSyncJob] = useState<any>(null)

  // Detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Ad campaigns
  const [campaignsByUtm, setCampaignsByUtm] = useState<Record<string, any>>({})

  // Load totals with current filters
  const loadTotals = useCallback(() => {
    const params: Record<string, string> = {}
    if (status) params.status = status
    if (provider) params.provider = provider
    if (userFilter) params.userFilter = userFilter
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    adminApi.paymentTotals(params).then(setTotals).catch(() => {})
  }, [status, provider, userFilter, dateFrom, dateTo])

  useEffect(() => { loadTotals() }, [loadTotals])

  useEffect(() => {
    fetch('/api/admin/ads', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((ads: any[]) => {
        const map: Record<string, any> = {}
        ads.forEach(a => { if (a.utmCode) map[a.utmCode] = a })
        setCampaignsByUtm(map)
      }).catch(() => {})
  }, [])

  /* ── Fetch ─────────────────────────────────── */

  const load = useCallback(() => {
    setLoading(true)
    const params: Record<string, string> = {
      page: String(page),
      limit: String(LIMIT),
      sortBy,
      sortDir,
    }
    if (status) params.status = status
    if (provider) params.provider = provider
    if (search) params.search = search
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    if (userFilter) params.userFilter = userFilter

    const q = new URLSearchParams(params)
    fetch(`/api/admin/payments?${q}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setPayments(d.payments ?? [])
        setTotal(d.total ?? 0)
      })
      .catch(() => { setPayments([]); setTotal(0) })
      .finally(() => setLoading(false))
  }, [page, status, provider, search, dateFrom, dateTo, userFilter, sortBy, sortDir])

  useEffect(() => { load() }, [load])

  /* ── Derived ──────────────────────────────── */

  const enriched = useMemo(() =>
    payments.map(p => {
      const meta = parseMeta(p.yukassaStatus)
      const type = detectType(p, meta)
      return { ...p, meta, type }
    }), [payments])

  const totalPages = Math.ceil(total / LIMIT)

  const selectedPayment = useMemo(
    () => enriched.find(p => p.id === selectedId) ?? null,
    [enriched, selectedId]
  )

  function resetPage() { setPage(1) }

  // Quick period buttons
  function setPeriod(days: number) {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - days + 1)
    setDateFrom(from.toISOString().slice(0, 10))
    setDateTo(to.toISOString().slice(0, 10))
    setActivePeriod(days)
    resetPage()
  }

  function clearPeriod() {
    setDateFrom('')
    setDateTo('')
    setActivePeriod(null)
    resetPage()
  }

  /* ── Render ────────────────────────────────── */

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Платежи</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {total.toLocaleString('ru')} записей
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              if (syncing) return
              // Ask: sync all or last 7 days?
              const choice = prompt('Синхронизация с ЮKassa:\n\n1 — За последние 7 дней\n2 — За последний месяц\n3 — Все платежи (с 2025-08-01)\n\nВведите 1, 2 или 3:', '1')
              if (!choice) return

              let syncFrom: string | undefined
              let syncTo: string | undefined
              const now = new Date()
              if (choice === '2') {
                const d = new Date(now); d.setDate(d.getDate() - 30)
                syncFrom = d.toISOString()
                syncTo = now.toISOString()
              } else if (choice === '3') {
                syncFrom = '2025-08-01T00:00:00.000Z'
                syncTo = now.toISOString()
              } else {
                // default: 7 days
                const d = new Date(now); d.setDate(d.getDate() - 7)
                syncFrom = d.toISOString()
                syncTo = now.toISOString()
              }

              setSyncing(true)
              setSyncJob(null)
              try {
                const { jobId } = await adminApi.yukassaSync(syncFrom, syncTo)
                const es = new EventSource(`/api/admin/import/jobs/${jobId}`, { withCredentials: true } as any)
                es.onmessage = (e) => {
                  try {
                    const j = JSON.parse(e.data)
                    setSyncJob(j)
                    if (j.status === 'done' || j.status === 'error') {
                      es.close()
                      setSyncing(false)
                      if (j.status === 'done') {
                        toast.success(`Синхронизация: +${j.created} новых, ${j.updated} обновлено`)
                        loadTotals()
                        load()
                      } else {
                        toast.error(`Ошибка: ${j.errorMessages?.[0] || 'Синхронизация не удалась'}`)
                      }
                    }
                  } catch {}
                }
                es.onerror = () => { es.close(); setSyncing(false) }
              } catch (err: any) {
                toast.error(err?.message || 'Не удалось запустить синхронизацию')
                setSyncing(false)
              }
            }}
            disabled={syncing}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: 'var(--accent-1)', color: '#fff' }}
          >
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {syncing ? `Синхронизация${syncJob ? ` (${syncJob.processed}/${syncJob.total} | +${syncJob.created})` : '...'}` : 'Синхронизация ЮKassa'}
          </button>
          <button
            onClick={() => { loadTotals(); load() }}
            className="px-3 py-1.5 rounded-lg text-sm transition"
            style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}
          >
            Обновить
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={<Receipt className="w-4 h-4" />}
          label="Оборот"
          value={totals ? `${fmtNum(totals.oborot)} ₽` : '—'}
          sub={totals ? `${fmtNum(totals.paidCount)} оплат` : undefined}
          color="#a78bfa"
        />
        <SummaryCard
          icon={<ArrowDownCircle className="w-4 h-4" />}
          label={`Возвраты (${totals ? totals.refundedCount + totals.partialRefundCount : 0})`}
          value={totals ? `${fmtNum(totals.totalRefunds)} ₽` : '—'}
          sub={totals ? `${totals.refundedCount} полн + ${totals.partialRefundCount} частичн` : undefined}
          color="#f87171"
        />
        <SummaryCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Выручка"
          value={totals ? `${fmtNum(totals.revenue)} ₽` : '—'}
          sub="оборот − возвраты"
          color="#34d399"
        />
        <SummaryCard
          icon={<Wallet className="w-4 h-4" />}
          label="К зачислению"
          value={totals ? `${fmtNum(totals.credited)} ₽` : '—'}
          sub={totals ? `комиссия ${totals.commissionPct}% (${fmtNum(totals.commission)} ₽)` : undefined}
          color="#60a5fa"
        />
      </div>

      {/* Period label */}
      {(dateFrom || dateTo) && (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Показано за: <b style={{ color: 'var(--text-secondary)' }}>{dateFrom || '...'} — {dateTo || '...'}</b>
        </p>
      )}

      {/* Filters */}
      <div className="glass-card p-4 space-y-3">
        {/* Row 1: Search + Status + Provider + User filter */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <input
              className="glass-input pl-9 py-2 text-sm w-full"
              placeholder="Поиск: email, TG, ID платежа..."
              value={search}
              onChange={e => { setSearch(e.target.value); resetPage() }}
            />
          </div>

          <select
            className="glass-input w-auto py-2 text-sm"
            value={status}
            onChange={e => { setStatus(e.target.value); resetPage() }}
          >
            <option value="">Все статусы</option>
            <option value="PAID">Оплачен</option>
            <option value="REFUNDED">Полный возврат</option>
            <option value="PARTIAL_REFUND">Частичный возврат</option>
            <option value="PENDING">Ожидание</option>
            <option value="FAILED">Отклонён</option>
          </select>

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

          <select
            className="glass-input w-auto py-2 text-sm"
            value={userFilter}
            onChange={e => { setUserFilter(e.target.value); resetPage() }}
          >
            <option value="">Все платежи</option>
            <option value="with">С пользователем</option>
            <option value="without">Без пользователя</option>
          </select>
        </div>

        {/* Row 2: Period + Sort */}
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex gap-1">
            {[
              { label: 'Сегодня', days: 1 },
              { label: 'Неделя', days: 7 },
              { label: 'Месяц', days: 30 },
              { label: '3 мес', days: 90 },
            ].map(({ label, days }) => (
              <button
                key={days}
                onClick={() => setPeriod(days)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition"
                style={{
                  background: activePeriod === days ? 'var(--accent-1)' : 'var(--glass-bg)',
                  color: activePeriod === days ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${activePeriod === days ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                }}
              >
                {label}
              </button>
            ))}
            {(dateFrom || dateTo) && (
              <button
                onClick={clearPeriod}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                Сбросить
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setActivePeriod(null); resetPage() }}
              className="px-2 py-1 rounded-lg text-xs"
              style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', colorScheme: 'dark' }}
            />
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>—</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setActivePeriod(null); resetPage() }}
              className="px-2 py-1 rounded-lg text-xs"
              style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', colorScheme: 'dark' }}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <select
              className="glass-input py-1 text-xs w-auto"
              value={`${sortBy}_${sortDir}`}
              onChange={e => {
                const [b, d] = e.target.value.split('_')
                setSortBy(b as any)
                setSortDir(d as any)
                resetPage()
              }}
            >
              <option value="date_desc">Дата ↓</option>
              <option value="date_asc">Дата ↑</option>
              <option value="amount_desc">Сумма ↓</option>
              <option value="amount_asc">Сумма ↑</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex gap-5 items-start">
        {/* Table */}
        <div className="glass-card flex-1 overflow-hidden min-w-0">
          {loading && (
            <div className="p-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Загрузка...</div>
          )}

          {!loading && enriched.length === 0 && (
            <div className="p-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Нет платежей</div>
          )}

          {!loading && enriched.length > 0 && (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Пользователь</th>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Сумма</th>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Статус</th>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Тип</th>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Дата</th>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Провайдер</th>
                  </tr>
                </thead>
                <tbody>
                  {enriched.map((p) => {
                    const isSelected = selectedId === p.id
                    const isRefund = p.status === 'REFUNDED' || p.status === 'PARTIAL_REFUND'
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedId(isSelected ? null : p.id)}
                        className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                        style={{
                          borderBottom: '1px solid var(--glass-border)',
                          ...(isSelected ? { background: 'var(--surface-2)' } : {}),
                          ...(isRefund ? { opacity: 0.7 } : {}),
                        }}
                      >
                        {/* User */}
                        <td className="px-4 py-3">
                          {p.user?.id ? (
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
                            <p className="font-medium truncate max-w-[140px]" style={{ color: 'var(--text-tertiary)' }}>
                              <UserX className="w-3 h-3 inline -mt-0.5 mr-1" />Без пользователя
                            </p>
                          )}
                          <p className="text-xs truncate max-w-[140px]" style={{ color: 'var(--text-tertiary)' }}>
                            {p.user?.email || p.user?.telegramId || '—'}
                          </p>
                        </td>

                        {/* Amount */}
                        <td className="px-4 py-3">
                          <p className={`font-semibold ${isRefund ? 'line-through' : ''}`} style={{ color: isRefund ? '#f87171' : 'var(--text-primary)' }}>
                            {formatAmount(p.amount + (Number(p.commission) || 0), p.currency)}
                          </p>
                          {Number(p.commission) > 0 && (
                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              к зачислению: {formatAmount(p.amount, p.currency)}
                            </p>
                          )}
                          {isRefund && p.refundAmount && (
                            <p className="text-xs" style={{ color: '#f87171' }}>
                              возврат: {formatAmount(Number(p.refundAmount), p.currency)}
                            </p>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={STATUS_CLASS[p.status] || 'badge-gray'}>
                            {STATUS_LABEL[p.status] || p.status}
                          </span>
                        </td>

                        {/* Type */}
                        <td className="px-4 py-3">
                          <TypeBadge type={p.type} />
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{formatDate(p.createdAt)}</p>
                          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{formatTime(p.createdAt)}</p>
                        </td>

                        {/* Provider */}
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {PROVIDER_LABEL[p.provider] || p.provider}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: '1px solid var(--glass-border)' }}
            >
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} из {total}
              </span>
              <div className="flex gap-1 items-center">
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
          <DetailPanel
            payment={selectedPayment}
            adCampaign={selectedPayment.user?.customerSource ? campaignsByUtm[selectedPayment.user.customerSource] ?? null : null}
            onClose={() => setSelectedId(null)}
            onRefresh={() => { load(); loadTotals() }}
          />
        )}
      </div>
    </div>
  )
}

/* ── Summary Card ──────────────────────────────────────────── */

function SummaryCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="glass-card p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}15`, color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
        <p className="text-lg font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
        {sub && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>}
      </div>
    </div>
  )
}

/* ── Detail Panel ──────────────────────────────────────────── */

function DetailPanel({
  payment: p,
  adCampaign,
  onClose,
  onRefresh,
}: {
  payment: Payment & { meta: ParsedMeta | null; type: PaymentType }
  adCampaign?: any
  onClose: () => void
  onRefresh?: () => void
}) {
  const [refunding, setRefunding] = useState(false)
  const isRefund = p.status === 'REFUNDED' || p.status === 'PARTIAL_REFUND'
  const gross = p.amount + (Number(p.commission) || 0)

  return (
    <div className="glass-card p-0 w-[360px] shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Детали платежа</h3>
        <button onClick={onClose} className="p-1 hover:bg-white/[0.05] rounded-md transition-colors" style={{ color: 'var(--text-tertiary)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
        <DetailRow label="ID" value={p.id} mono />

        {/* User */}
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Пользователь</p>
          {p.user?.id ? (
            <Link href={`/admin/users/${p.user.id}`} className="text-sm font-medium inline-flex items-center gap-1 hover:underline" style={{ color: 'var(--accent-1)' }}>
              {p.user.telegramName || p.user.email?.split('@')[0] || '—'}
              <ExternalLink className="w-3 h-3" />
            </Link>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Без пользователя</p>
          )}
          {p.user?.email && <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{p.user.email}</p>}
          {p.user?.telegramId && <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>TG: {p.user.telegramId}</p>}
        </div>

        {/* Ad Campaign */}
        {adCampaign && (
          <div className="rounded-lg p-3 space-y-1.5" style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#60a5fa' }}>Рекламная кампания</p>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{adCampaign.channelName}</p>
          </div>
        )}

        {/* Status + Type */}
        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Статус</p>
            <span className={STATUS_CLASS[p.status] || 'badge-gray'}>{STATUS_LABEL[p.status] || p.status}</span>
          </div>
          <div className="flex-1">
            <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Тип</p>
            <TypeBadge type={p.type} />
          </div>
        </div>

        {/* Amounts */}
        <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-tertiary)' }}>Сумма платежа</span>
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{formatAmount(gross, p.currency)}</span>
          </div>
          {Number(p.commission) > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-tertiary)' }}>Комиссия</span>
              <span style={{ color: '#fbbf24' }}>−{formatAmount(Number(p.commission), p.currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-tertiary)' }}>К зачислению</span>
            <span className="font-semibold" style={{ color: '#34d399' }}>{formatAmount(p.amount, p.currency)}</span>
          </div>
          {isRefund && p.refundAmount && (
            <div className="flex justify-between text-sm" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '8px', marginTop: '4px' }}>
              <span style={{ color: '#f87171' }}>Возврат</span>
              <span className="font-semibold" style={{ color: '#f87171' }}>−{formatAmount(Number(p.refundAmount), p.currency)}</span>
            </div>
          )}
        </div>

        <DetailRow label="Тариф" value={p.tariff?.name || '—'} />
        <DetailRow label="Провайдер" value={PROVIDER_LABEL[p.provider] || p.provider} />
        <DetailRow label="Создан" value={`${formatDate(p.createdAt)} ${formatTime(p.createdAt)}`} />
        {p.confirmedAt && <DetailRow label="Подтверждён" value={`${formatDate(p.confirmedAt)} ${formatTime(p.confirmedAt)}`} />}
        {p.refundedAt && <DetailRow label="Дата возврата" value={`${formatDate(p.refundedAt)} ${formatTime(p.refundedAt)}`} />}

        {/* Promo */}
        {p.meta?.promoCode && (
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Промокод</p>
            <span className="badge-violet" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              <Tag className="w-3 h-3" /> {p.meta.promoCode}
              {(p.meta.discountPct || p.meta.promoDiscount) ? ` (-${p.meta.discountPct || p.meta.promoDiscount}%)` : ''}
            </span>
          </div>
        )}

        {/* Refund buttons */}
        {p.status === 'PAID' && (
          <div className="pt-2 space-y-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Возврат средств</p>
              {p.provider === 'PLATEGA' && (
                <a href="https://app.platega.io" target="_blank" rel="noreferrer"
                   className="text-[10px] inline-flex items-center gap-1"
                   style={{ color: 'var(--accent-1)' }}>
                  Открыть ЛК Platega ↗
                </a>
              )}
            </div>
            {p.provider === 'PLATEGA' && (
              <div className="text-[11px] p-2 rounded"
                   style={{ background: 'rgba(245,158,11,0.08)', color: '#f59e0b' }}>
                ⚠ У Platega нет API возврата. Сначала сделай возврат вручную в их ЛК,
                затем нажми ниже — платёж в БД пометится как возвращённый и подписка откатится.
              </div>
            )}
            {p.provider === 'CRYPTOPAY' && (
              <div className="text-[11px] p-2 rounded"
                   style={{ background: 'rgba(245,158,11,0.08)', color: '#f59e0b' }}>
                ⚠ CryptoPay не поддерживает возврат через API. Переведи сумму клиенту вручную,
                затем нажми ниже.
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const label = p.provider === 'YUKASSA'
                    ? `Полный возврат ${formatAmount(gross, p.currency)} через ЮKassa API?`
                    : p.provider === 'BALANCE'
                    ? `Вернуть ${formatAmount(gross, p.currency)} на баланс клиента?`
                    : `Пометить платёж как возвращённый (${formatAmount(gross, p.currency)})? Убедись что деньги уже переведены клиенту.`
                  if (!confirm(label)) return
                  setRefunding(true)
                  try {
                    const res = await adminApi.refundPayment(p.id)
                    const msg = (res as any).message || `Возврат ${formatAmount(res.amount, 'RUB')} выполнен`
                    toast.success(msg)
                    onRefresh?.()
                  } catch (err: any) {
                    toast.error(err?.message || 'Ошибка возврата')
                  } finally {
                    setRefunding(false)
                  }
                }}
                disabled={refunding}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                {refunding ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowDownCircle className="w-3 h-3" />}
                Полный возврат
              </button>
              <button
                onClick={async () => {
                  // Calculate unused days refund suggestion
                  let suggestion = ''
                  if (p.confirmedAt) {
                    const activated = new Date(p.confirmedAt)
                    const now = new Date()
                    const usedDays = Math.floor((now.getTime() - activated.getTime()) / 86400000)
                    const totalDays = p.meta?.days ? Number(p.meta.days) : (p.tariff?.name?.includes('365') || p.tariff?.name?.includes('год') ? 365 : p.tariff?.name?.includes('90') ? 90 : 30)
                    const remainingDays = Math.max(0, totalDays - usedDays)
                    const dailyRate = gross / totalDays
                    const suggestedAmount = +(dailyRate * remainingDays).toFixed(2)
                    suggestion = `\n\nРасчёт по дням:\n  Тариф: ${totalDays} дней\n  Использовано: ${usedDays} дней\n  Осталось: ${remainingDays} дней\n  Рекомендуемый возврат: ${suggestedAmount} ₽`
                  }
                  const amtStr = prompt(`Сумма частичного возврата (макс ${gross} ₽):${suggestion}`)
                  if (!amtStr) return
                  const amt = parseFloat(amtStr.replace(',', '.'))
                  if (!amt || amt <= 0 || amt > gross) { toast.error('Некорректная сумма'); return }
                  const label = p.provider === 'YUKASSA'
                    ? `Частичный возврат ${amt} ₽ через ЮKassa API?`
                    : `Пометить частичный возврат ${amt} ₽ (провайдер: ${p.provider})? Убедись что деньги переведены вручную.`
                  if (!confirm(label)) return
                  setRefunding(true)
                  try {
                    const res = await adminApi.refundPayment(p.id, amt)
                    const msg = (res as any).message || `Возврат ${formatAmount(res.amount, 'RUB')} выполнен`
                    toast.success(msg)
                    onRefresh?.()
                  } catch (err: any) {
                    toast.error(err?.message || 'Ошибка возврата')
                  } finally {
                    setRefunding(false)
                  }
                }}
                disabled={refunding}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}
              >
                Частичный
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Detail Row ────────────────────────────────────────────── */

function DetailRow({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div>
      <p className="text-xs mb-0.5" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      <p className={`text-sm ${mono ? 'font-mono text-xs break-all' : ''} ${bold ? 'font-semibold' : ''}`} style={{ color: 'var(--text-primary)' }}>
        {value}
      </p>
    </div>
  )
}
