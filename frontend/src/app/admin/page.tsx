'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  DollarSign, Users, TrendingUp, Target, Megaphone,
  Activity, FileText, Table2, Wifi, Handshake,
  CreditCard, UserPlus, AlertTriangle, ArrowDownCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '@/lib/api'

// ── Types ────────────────────────────────────────────────────────
type Days = 1 | 7 | 30 | 365

interface Overview {
  period: { days: number; from: string; to: string }
  kpi: {
    revenue: number; revenuePrev: number
    newCustomers: number; newCustomersPaid: number
    profit: number; profitPrev: number
    ltvCacAvg: number | null
  }
  revenueChart: Array<{ date: string; income: number; expense: number }>
  marketing: {
    totalSpend: number; totalRevenue: number
    totalClicks: number; totalLeads: number; totalConversions: number
    funnelRate: number
    topCampaigns: Array<{ id: string; channelName: string; spend: number; revenue: number; roi: number; conversions: number }>
    campaignsByDay: Array<{ date: string; spend: number; revenue: number }>
  }
  customers: {
    newByDay: Array<{ date: string; count: number }>
    topByLtv: Array<{ id: string; email: string | null; telegramName: string | null; totalPaid: number; paymentsCount: number }>
    conversionRate: number
    active: number; expired: number; trial: number
  }
  vpn: {
    nodesOnline: number; onlineNow: number; onlineToday: number; onlineWeek: number; activeSubs: number
  }
}

interface EventItem {
  type: string; icon: string; title: string; subtitle: string; time: string; amount?: number; entityId?: string
}

interface BuhDashboard {
  partnersSummary?: Array<{
    id: string; name: string; avatarColor?: string
    remainingDebt: number; totalDividends: number; roleLabel?: string; initials?: string
  }>
}

// ── Helpers ──────────────────────────────────────────────────────
function fmt(amount: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(amount)) + ' \u20BD'
}

function pctChange(cur: number, prev: number): { label: string; positive: boolean } {
  if (prev === 0) {
    if (cur > 0) return { label: '+100%', positive: true }
    if (cur < 0) return { label: '-100%', positive: false }
    return { label: '0%', positive: true }
  }
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100)
  return { label: `${pct >= 0 ? '+' : ''}${pct}%`, positive: pct >= 0 }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} ч назад`
  const d = Math.floor(h / 24)
  return `${d} дн назад`
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function ltvCacColor(v: number | null): string {
  if (v === null) return 'var(--text-tertiary)'
  if (v >= 3) return '#34d399'
  if (v >= 1) return '#fbbf24'
  return '#f87171'
}

// ── Page ─────────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const [days, setDays] = useState<Days>(30)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [events, setEvents] = useState<EventItem[]>([])
  const [buh, setBuh] = useState<BuhDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [exportModal, setExportModal] = useState<null | 'pdf' | 'excel'>(null)
  const [exportSections, setExportSections] = useState<Record<string, boolean>>({
    kpi: true, marketing: true, customers: true, vpn: true, events: true,
  })

  // Popup
  const [popup, setPopup] = useState<{ type: string; data: any; loading?: boolean } | null>(null)

  async function openPopup(type: string, id: string) {
    setPopup({ type, data: null, loading: true })
    try {
      let data: any = null
      if (type === 'user' || type === 'expiring') {
        data = await adminApi.userById(id)
      } else if (type === 'payment') {
        data = await adminApi.userById(id)
      } else if (type === 'campaign') {
        const res = await fetch(`/api/admin/ads/${id}/stats`, { credentials: 'include' })
        data = res.ok ? await res.json() : null
      } else if (type === 'partner') {
        data = await adminApi.buhPartnerById(id)
      }
      setPopup({ type, data })
    } catch {
      setPopup(null)
      toast.error('Не удалось загрузить данные')
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      adminApi.dashboardOverview(days),
      adminApi.dashboardEvents(20),
      adminApi.buhDashboard().catch(() => null),
    ])
      .then(([ov, ev, bh]) => {
        if (cancelled) return
        setOverview(ov as Overview)
        setEvents((ev as { events: EventItem[] }).events || [])
        setBuh(bh as BuhDashboard | null)
      })
      .catch((e: any) => toast.error(e?.message || 'Ошибка загрузки'))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [days])

  const periodLabel = useMemo(() => ({
    1: 'Сегодня', 7: '7 дней', 30: '30 дней', 365: 'Год',
  }[days]), [days])

  const handleExport = async (format: 'pdf' | 'excel') => {
    const sections = Object.entries(exportSections)
      .filter(([_, v]) => v).map(([k]) => k).join(',')
    if (!sections) { toast.error('Выберите хотя бы одну секцию'); return }
    const url = `/api/admin/dashboard/export?format=${format}&sections=${sections}&days=${days}`
    if (format === 'pdf') {
      window.open(url, '_blank')
    } else {
      try {
        const res = await fetch(url, { credentials: 'include' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        const href = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = href
        a.download = `dashboard_${days}d.xlsx`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(href)
        toast.success('Файл скачан')
      } catch (e: any) {
        toast.error(e?.message || 'Ошибка экспорта')
      }
    }
    setExportModal(null)
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Sticky Header */}
      <div
        className="sticky top-0 z-10 -mx-4 md:-mx-6 px-4 md:px-6 py-3 flex items-center justify-between flex-wrap gap-3"
        style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--glass-border)' }}
      >
        <div className="flex gap-2 flex-wrap">
          {([1, 7, 30, 365] as Days[]).map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition"
              style={{
                background: days === d ? 'var(--accent-1)' : 'var(--glass-bg)',
                color: days === d ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--glass-border)',
              }}
            >
              {({ 1: 'Сегодня', 7: '7 дней', 30: '30 дней', 365: 'Год' } as any)[d]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setExportModal('pdf')}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition"
            style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
          >
            <FileText className="w-4 h-4 inline -mt-0.5" /> PDF
          </button>
          <button
            onClick={() => setExportModal('excel')}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition"
            style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
          >
            <Table2 className="w-4 h-4 inline -mt-0.5" /> Excel
          </button>
        </div>
      </div>

      {/* TOP KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {loading || !overview ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-card p-4 rounded-2xl skeleton" style={{ height: 110 }} />
          ))
        ) : (
          <>
            <KpiCard
              icon={<DollarSign className="w-4 h-4" style={{ color: '#34d399' }} />}
              iconBg="rgba(52,211,153,0.15)"
              label="Выручка"
              value={fmt(overview.kpi.revenue)}
              sub={pctChange(overview.kpi.revenue, overview.kpi.revenuePrev)}
            />
            <KpiCard
              icon={<Users className="w-4 h-4" style={{ color: '#60a5fa' }} />}
              iconBg="rgba(96,165,250,0.15)"
              label="Новые клиенты"
              value={String(overview.kpi.newCustomers)}
              subLabel={`${overview.kpi.newCustomersPaid} оплатили`}
            />
            <KpiCard
              icon={<TrendingUp className="w-4 h-4" style={{ color: '#a78bfa' }} />}
              iconBg="rgba(167,139,250,0.15)"
              label="Прибыль"
              value={fmt(overview.kpi.profit)}
              subLabel={
                overview.kpi.revenue > 0
                  ? `${Math.round((overview.kpi.profit / overview.kpi.revenue) * 100)}% маржа`
                  : '—'
              }
            />
            <KpiCard
              icon={<Target className="w-4 h-4" style={{ color: '#fbbf24' }} />}
              iconBg="rgba(251,191,36,0.15)"
              label="LTV/CAC"
              value={overview.kpi.ltvCacAvg !== null ? `${overview.kpi.ltvCacAvg}×` : '—'}
              valueColor={ltvCacColor(overview.kpi.ltvCacAvg)}
            />
          </>
        )}
      </div>

      {/* Revenue chart */}
      <div className="glass-card p-4 md:p-5 rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Доходы vs Расходы · {periodLabel}
          </div>
          <div className="flex gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            <span className="flex items-center gap-1">
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#34d399', display: 'inline-block' }} />
              Доход
            </span>
            <span className="flex items-center gap-1">
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#f87171', display: 'inline-block' }} />
              Расход
            </span>
          </div>
        </div>
        {loading || !overview ? (
          <div className="skeleton rounded-lg" style={{ height: 300 }} />
        ) : (
          <AreaChart data={overview.revenueChart} />
        )}
      </div>

      {/* VPN mini-strip */}
      <div className="glass-card p-4 rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}><Wifi className="w-4 h-4" style={{ color: '#34d399' }} /> VPN</div>
        </div>
        {loading || !overview ? (
          <div className="skeleton rounded-lg" style={{ height: 50 }} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MiniStat label="Ноды онлайн" value={overview.vpn.nodesOnline} color="#60a5fa" />
            <MiniStat label="Сейчас" value={overview.vpn.onlineNow} color="#34d399" />
            <MiniStat label="За день" value={overview.vpn.onlineToday} color="#a78bfa" />
            <MiniStat label="За неделю" value={overview.vpn.onlineWeek} color="#fbbf24" />
            <MiniStat label="Активных подписок" value={overview.vpn.activeSubs} color="#f87171" />
          </div>
        )}
      </div>

      {/* Marketing block */}
      <div className="glass-card p-4 md:p-5 rounded-2xl">
        <div className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}><Megaphone className="w-5 h-5" style={{ color: '#60a5fa' }} /> Маркетинг</div>
        {loading || !overview ? (
          <div className="skeleton rounded-lg" style={{ height: 200 }} />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <MiniStat label="Потрачено" value={fmt(overview.marketing.totalSpend)} color="#f87171" asString />
              <MiniStat label="Получено" value={fmt(overview.marketing.totalRevenue)} color="#34d399" asString />
              <MiniStat
                label="Клики → Оплаты"
                value={`${overview.marketing.totalClicks} → ${overview.marketing.totalLeads} → ${overview.marketing.totalConversions}`}
                color="#60a5fa"
                asString
              />
              <MiniStat
                label="Воронка"
                value={`${overview.marketing.funnelRate}%`}
                color="#a78bfa"
                asString
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Топ-3 кампании по ROI
                </div>
                {overview.marketing.topCampaigns.length === 0 ? (
                  <div className="text-xs py-3" style={{ color: 'var(--text-tertiary)' }}>Нет данных</div>
                ) : (
                  <div className="space-y-1.5">
                    {overview.marketing.topCampaigns.map(c => (
                      <div key={c.id}
                        onClick={() => openPopup('campaign', c.id)}
                        className="flex items-center justify-between text-xs py-2 px-2 rounded cursor-pointer hover:bg-white/[0.05] transition-colors"
                        style={{ background: 'var(--glass-bg)' }}>
                        <div className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{c.channelName}</div>
                        <div className="flex gap-3 items-center">
                          <span style={{ color: 'var(--text-secondary)' }}>{fmt(c.revenue)}</span>
                          <span style={{
                            color: c.roi >= 0 ? '#34d399' : '#f87171',
                            fontWeight: 600, minWidth: 50, textAlign: 'right',
                          }}>
                            {c.roi >= 0 ? '+' : ''}{c.roi}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Расход vs Доход по дням
                </div>
                <MiniBarChart data={overview.marketing.campaignsByDay} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Customers block */}
      <div className="glass-card p-4 md:p-5 rounded-2xl">
        <div className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}><Users className="w-5 h-5" style={{ color: '#a78bfa' }} /> Клиенты</div>
        {loading || !overview ? (
          <div className="skeleton rounded-lg" style={{ height: 200 }} />
        ) : (
          <>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mb-4">
              <MiniStat label="Активных" value={overview.customers.active} color="#34d399" />
              <MiniStat label="Истекло" value={overview.customers.expired} color="#f87171" />
              <MiniStat label="Пробник" value={overview.customers.trial} color="#fbbf24" />
              <MiniStat
                label="Конверсия"
                value={`${overview.customers.conversionRate}%`}
                color="#a78bfa"
                asString
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Топ-5 по LTV</div>
                {overview.customers.topByLtv.length === 0 ? (
                  <div className="text-xs py-3" style={{ color: 'var(--text-tertiary)' }}>Нет данных</div>
                ) : (
                  <div className="space-y-1.5">
                    {overview.customers.topByLtv.map(u => (
                      <div key={u.id}
                        onClick={() => openPopup('user', u.id)}
                        className="flex items-center justify-between text-xs py-2 px-2 rounded cursor-pointer hover:bg-white/[0.05] transition-colors"
                        style={{ background: 'var(--glass-bg)' }}>
                        <div className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
                          {u.email || u.telegramName || '—'}
                        </div>
                        <div className="flex gap-2 items-center">
                          <span style={{ color: 'var(--text-tertiary)' }}>×{u.paymentsCount}</span>
                          <span style={{ color: '#34d399', fontWeight: 600 }}>{fmt(u.totalPaid)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Новые клиенты по дням
                </div>
                <MiniLineChart data={overview.customers.newByDay.map(r => ({ date: r.date, value: r.count }))} color="#60a5fa" label="Новых" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Partners block */}
      {buh?.partnersSummary && buh.partnersSummary.length > 0 && (
        <div className="glass-card p-4 md:p-5 rounded-2xl">
          <div className="text-base font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}><Handshake className="w-5 h-5" style={{ color: '#fbbf24' }} /> Партнёры</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {buh.partnersSummary.map(p => (
              <div key={p.id}
                onClick={() => openPopup('partner', p.id)}
                className="flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-white/[0.05] transition-colors"
                style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <div
                  className="flex items-center justify-center rounded-full text-white font-bold text-sm"
                  style={{ width: 40, height: 40, background: p.avatarColor || 'var(--accent-1)' }}
                >
                  {p.initials || p.name.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Долг: {fmt(p.remainingDebt)} · Дивиденды: {fmt(p.totalDividends)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Events feed */}
      <div className="glass-card p-4 md:p-5 rounded-2xl">
        <div className="text-base font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Activity className="w-5 h-5" style={{ color: '#60a5fa' }} /> Последние события
        </div>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton rounded-lg" style={{ height: 50 }} />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="text-sm py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>Нет событий</div>
        ) : (
          <div className="space-y-1.5">
            {events.map((e, i) => (
              <div key={i}
                onClick={() => e.entityId && openPopup(e.type, e.entityId)}
                className={`flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${e.entityId ? 'cursor-pointer hover:bg-white/[0.05]' : ''}`}
                style={{ background: 'var(--glass-bg)' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
                  background: e.type === 'payment' ? 'rgba(52,211,153,0.15)'
                    : e.type === 'user' ? 'rgba(96,165,250,0.15)'
                    : e.type === 'expiring' ? 'rgba(251,191,36,0.15)'
                    : 'rgba(248,113,113,0.15)',
                }}>
                  {e.type === 'payment' ? <CreditCard className="w-4 h-4" style={{ color: '#34d399' }} />
                    : e.type === 'user' ? <UserPlus className="w-4 h-4" style={{ color: '#60a5fa' }} />
                    : e.type === 'expiring' ? <AlertTriangle className="w-4 h-4" style={{ color: '#fbbf24' }} />
                    : <ArrowDownCircle className="w-4 h-4" style={{ color: '#f87171' }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{e.title}</div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{e.subtitle}</div>
                </div>
                <div className="text-xs whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
                  {timeAgo(e.time)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Popup */}
      {popup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setPopup(null)}>
          <div
            className="w-full max-w-md rounded-2xl p-5 space-y-4 animate-scale-in max-h-[80vh] overflow-y-auto"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}
            onClick={e => e.stopPropagation()}>
            {popup.loading ? (
              <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>Загрузка...</div>
            ) : !popup.data ? (
              <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>Данные не найдены</div>
            ) : popup.type === 'user' || popup.type === 'payment' || popup.type === 'expiring' ? (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Клиент</h3>
                  <button onClick={() => setPopup(null)} className="p-1 rounded hover:bg-white/[0.05]" style={{ color: 'var(--text-tertiary)' }}>✕</button>
                </div>
                <PopupRow label="Email" value={popup.data.email || '—'} />
                <PopupRow label="Telegram" value={popup.data.telegramName ? `@${popup.data.telegramName}` : popup.data.telegramId || '—'} />
                <PopupRow label="Статус" value={popup.data.subStatus || '—'} />
                <PopupRow label="Подписка до" value={popup.data.subExpireAt ? new Date(popup.data.subExpireAt).toLocaleDateString('ru-RU') : '—'} />
                <PopupRow label="Всего оплат" value={`${popup.data.paymentsCount ?? 0} шт · ${fmt(Number(popup.data.totalPaid ?? 0))}`} />
                <PopupRow label="Источник" value={popup.data.customerSource || '—'} />
                <PopupRow label="Регистрация" value={popup.data.createdAt ? new Date(popup.data.createdAt).toLocaleDateString('ru-RU') : '—'} />
                <a href={`/admin/users/${popup.data.id}`}
                  className="block text-center text-sm mt-2 py-2 rounded-lg transition-colors hover:bg-white/[0.05]"
                  style={{ color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                  Открыть карточку →
                </a>
              </>
            ) : popup.type === 'campaign' ? (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Рекламная кампания</h3>
                  <button onClick={() => setPopup(null)} className="p-1 rounded hover:bg-white/[0.05]" style={{ color: 'var(--text-tertiary)' }}>✕</button>
                </div>
                <PopupRow label="Канал" value={popup.data.campaign?.channelName || '—'} />
                <PopupRow label="UTM" value={popup.data.campaign?.utmCode || popup.data.utmCode || '—'} />
                <PopupRow label="Формат" value={popup.data.campaign?.format || '—'} />
                <PopupRow label="Затраты" value={fmt(Number(popup.data.summary?.spend ?? popup.data.campaign?.amount ?? 0))} />
                <PopupRow label="Клики" value={String(popup.data.summary?.clicks ?? 0)} />
                <PopupRow label="Лиды" value={String(popup.data.summary?.leads ?? 0)} />
                <PopupRow label="Конверсии" value={String(popup.data.summary?.conversions ?? 0)} />
                <PopupRow label="Доход" value={fmt(Number(popup.data.summary?.revenue ?? 0))} />
                <PopupRow label="ROI" value={`${popup.data.summary?.roi ?? 0}%`}
                  color={(popup.data.summary?.roi ?? 0) >= 0 ? '#34d399' : '#f87171'} />
                <PopupRow label="LTV" value={fmt(Number(popup.data.summary?.ltv ?? 0))} />
                <a href="/admin/marketing"
                  className="block text-center text-sm mt-2 py-2 rounded-lg transition-colors hover:bg-white/[0.05]"
                  style={{ color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                  Открыть маркетинг →
                </a>
              </>
            ) : popup.type === 'partner' ? (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Партнёр</h3>
                  <button onClick={() => setPopup(null)} className="p-1 rounded hover:bg-white/[0.05]" style={{ color: 'var(--text-tertiary)' }}>✕</button>
                </div>
                <PopupRow label="Имя" value={popup.data.name || '—'} />
                <PopupRow label="Роль" value={popup.data.roleLabel || '—'} />
                <PopupRow label="Инвестиции" value={fmt(Number(popup.data.initialInvestment ?? 0))} />
                <PopupRow label="Доля" value={`${popup.data.sharePercent ?? 0}%`} />
                <PopupRow label="Контакт" value={popup.data.telegramContact || popup.data.phone || '—'} />
                <a href="/admin/partners-investors"
                  className="block text-center text-sm mt-2 py-2 rounded-lg transition-colors hover:bg-white/[0.05]"
                  style={{ color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                  Открыть партнёров →
                </a>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Export Modal */}
      {exportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setExportModal(null)}
        >
          <div
            className="glass-card rounded-2xl p-5 max-w-md w-full"
            style={{ background: 'var(--surface-1)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              Экспорт отчёта ({exportModal === 'pdf' ? 'PDF' : 'Excel'})
            </div>
            <div className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
              Период: {periodLabel}
            </div>
            <div className="space-y-2 mb-4">
              {[
                { key: 'kpi', label: 'KPI' },
                { key: 'marketing', label: 'Маркетинг' },
                { key: 'customers', label: 'Клиенты' },
                { key: 'vpn', label: 'VPN' },
                { key: 'events', label: 'События' },
              ].map(s => (
                <label key={s.key} className="flex items-center gap-2 cursor-pointer text-sm"
                  style={{ color: 'var(--text-primary)' }}>
                  <input
                    type="checkbox"
                    checked={!!exportSections[s.key]}
                    onChange={e => setExportSections(prev => ({ ...prev, [s.key]: e.target.checked }))}
                  />
                  {s.label}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setExportModal(null)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
              >
                Отмена
              </button>
              <button
                onClick={() => handleExport(exportModal)}
                className="px-4 py-2 rounded-lg text-sm text-white font-medium"
                style={{ background: 'var(--accent-1)' }}
              >
                Сформировать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────
function KpiCard({
  icon, iconBg, label, value, sub, subLabel, valueColor,
}: {
  icon: React.ReactNode; iconBg?: string; label: string; value: string
  sub?: { label: string; positive: boolean }
  subLabel?: string
  valueColor?: string
}) {
  return (
    <div className="glass-card p-4 rounded-2xl">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: iconBg || 'rgba(96,165,250,0.15)' }}>
          {icon}
        </div>
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div className="text-xl md:text-2xl font-bold" style={{ color: valueColor || 'var(--text-primary)' }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1" style={{ color: sub.positive ? '#34d399' : '#f87171' }}>
          {sub.positive ? '↑' : '↓'} {sub.label} vs пред.
        </div>
      )}
      {subLabel && !sub && (
        <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{subLabel}</div>
      )}
    </div>
  )
}

function MiniStat({
  label, value, color, asString,
}: {
  label: string; value: string | number; color: string; asString?: boolean
}) {
  return (
    <div className="text-center p-2 rounded-lg" style={{ background: 'var(--glass-bg)' }}>
      <div className="text-[10px] font-medium mb-1 uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </div>
      <div className="font-bold" style={{ color, fontSize: asString ? 15 : 18 }}>
        {value}
      </div>
    </div>
  )
}

// ── Charts ──
function AreaChart({ data }: { data: Array<{ date: string; income: number; expense: number }> }) {
  const [hover, setHover] = useState<number | null>(null)
  const w = 800, h = 300, padL = 65, padR = 20, padT = 20, padB = 40

  if (data.length === 0) {
    return <div className="text-xs text-center py-10" style={{ color: 'var(--text-tertiary)' }}>Нет данных</div>
  }

  const maxV = Math.max(1, ...data.flatMap(d => [d.income, d.expense]))
  const chartW = w - padL - padR
  const chartH = h - padT - padB
  const stepX = chartW / Math.max(1, data.length - 1)
  const y = (v: number) => padT + chartH - (v / maxV) * chartH
  const x = (i: number) => padL + i * stepX

  const pathLine = (key: 'income' | 'expense') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d[key])}`).join(' ')
  const pathArea = (key: 'income' | 'expense') =>
    `${pathLine(key)} L ${x(data.length - 1)} ${padT + chartH} L ${x(0)} ${padT + chartH} Z`

  const labelStride = Math.max(1, Math.ceil(data.length / 7))

  // Y-axis scale labels
  const yTicks = [0, 0.25, 0.5, 0.75, 1]
  const fmtAxis = (v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}K` : String(Math.round(v))

  // Totals for header
  const totalIncome = data.reduce((s, d) => s + d.income, 0)
  const totalExpense = data.reduce((s, d) => s + d.expense, 0)

  return (
    <div>
      <div className="flex gap-4 mb-2 text-sm">
        <span style={{ color: '#34d399' }}>Доход: <b>{fmt(totalIncome)}</b></span>
        <span style={{ color: '#f87171' }}>Расход: <b>{fmt(totalExpense)}</b></span>
        <span style={{ color: totalIncome - totalExpense >= 0 ? '#a78bfa' : '#f87171' }}>
          Прибыль: <b>{fmt(totalIncome - totalExpense)}</b>
        </span>
      </div>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxHeight: 320 }}>
          <defs>
            <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f87171" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Y-axis grid lines + labels */}
          {yTicks.map((t, i) => {
            const yPos = padT + t * chartH
            const val = maxV * (1 - t)
            return (
              <g key={i}>
                <line x1={padL} y1={yPos} x2={w - padR} y2={yPos}
                  stroke="var(--glass-border)" strokeWidth="0.5" strokeDasharray="3 3" />
                <text x={padL - 8} y={yPos + 4} textAnchor="end" fontSize="10" fill="var(--text-tertiary)">
                  {fmtAxis(val)}
                </text>
              </g>
            )
          })}

          {/* Areas + lines */}
          <path d={pathArea('expense')} fill="url(#gradExpense)" />
          <path d={pathArea('income')} fill="url(#gradIncome)" />
          <path d={pathLine('expense')} fill="none" stroke="#f87171" strokeWidth="2" />
          <path d={pathLine('income')} fill="none" stroke="#34d399" strokeWidth="2" />

          {/* X-axis date labels */}
          {data.map((d, i) => (
            i % labelStride === 0 ? (
              <text key={`l${i}`} x={x(i)} y={padT + chartH + 18} textAnchor="middle" fontSize="10" fill="var(--text-tertiary)">
                {formatDateShort(d.date)}
              </text>
            ) : null
          ))}

          {/* Hover line + dots */}
          {hover !== null && (
            <g>
              <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + chartH} stroke="var(--text-tertiary)" strokeWidth="0.8" strokeDasharray="4 2" />
              <circle cx={x(hover)} cy={y(data[hover].income)} r="5" fill="#34d399" stroke="#fff" strokeWidth="2" />
              <circle cx={x(hover)} cy={y(data[hover].expense)} r="5" fill="#f87171" stroke="#fff" strokeWidth="2" />
            </g>
          )}

          {/* Invisible hover rects per column */}
          {data.map((_, i) => (
            <rect
              key={`h${i}`}
              x={x(i) - stepX / 2}
              y={padT}
              width={stepX}
              height={chartH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>

        {/* Tooltip */}
        {hover !== null && (
          <div
            className="absolute z-10 rounded-lg px-3 py-2 text-xs pointer-events-none"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-primary)',
              left: `${(x(hover) / w) * 100}%`,
              top: 0,
              transform: 'translateX(-50%)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              whiteSpace: 'nowrap',
            }}
          >
            <div className="font-semibold mb-1">{formatDateShort(data[hover].date)}</div>
            <div style={{ color: '#34d399' }}>Доход: {fmt(data[hover].income)}</div>
            <div style={{ color: '#f87171' }}>Расход: {fmt(data[hover].expense)}</div>
            <div style={{ color: '#a78bfa' }}>Прибыль: {fmt(data[hover].income - data[hover].expense)}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function MiniBarChart({ data }: { data: Array<{ date: string; spend: number; revenue: number }> }) {
  const [hover, setHover] = useState<number | null>(null)
  if (data.length === 0) {
    return <div className="text-xs text-center py-6" style={{ color: 'var(--text-tertiary)' }}>Нет данных</div>
  }
  const w = 400, h = 140, padB = 22
  const chartH = h - padB
  const maxV = Math.max(1, ...data.flatMap(d => [d.spend, d.revenue]))
  const barGroupW = w / data.length
  const barW = Math.max(2, Math.min(10, barGroupW / 3))
  const labelStride = Math.max(1, Math.ceil(data.length / 6))

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxHeight: 160 }}>
        {data.map((d, i) => {
          const gx = i * barGroupW + barGroupW / 2 - barW
          const spendH = (d.spend / maxV) * (chartH - 6)
          const revH = (d.revenue / maxV) * (chartH - 6)
          const isHover = hover === i
          return (
            <g key={i}>
              <rect x={gx} y={chartH - spendH} width={barW} height={spendH}
                fill="#f87171" rx="1" opacity={isHover ? 1 : 0.8} />
              <rect x={gx + barW} y={chartH - revH} width={barW} height={revH}
                fill="#34d399" rx="1" opacity={isHover ? 1 : 0.8} />
              {/* Invisible hover area */}
              <rect x={i * barGroupW} y={0} width={barGroupW} height={chartH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)} />
              {i % labelStride === 0 && (
                <text x={gx + barW} y={chartH + 14} textAnchor="middle" fontSize="9" fill="var(--text-tertiary)">
                  {formatDateShort(d.date)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div
          className="absolute z-10 rounded-lg px-2 py-1.5 text-xs pointer-events-none"
          style={{
            background: 'var(--surface-2)', border: '1px solid var(--glass-border)',
            color: 'var(--text-primary)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            left: `${((hover + 0.5) / data.length) * 100}%`, top: 0,
            transform: 'translateX(-50%)', whiteSpace: 'nowrap',
          }}
        >
          <div className="font-semibold">{formatDateShort(data[hover].date)}</div>
          <div style={{ color: '#f87171' }}>Расход: {fmt(data[hover].spend)}</div>
          <div style={{ color: '#34d399' }}>Доход: {fmt(data[hover].revenue)}</div>
        </div>
      )}
    </div>
  )
}

function MiniLineChart({ data, color, label }: { data: Array<{ date: string; value: number }>; color: string; label?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  if (data.length === 0) {
    return <div className="text-xs text-center py-6" style={{ color: 'var(--text-tertiary)' }}>Нет данных</div>
  }
  const w = 400, h = 140, padB = 22, pad = 8
  const chartH = h - padB
  const maxV = Math.max(1, ...data.map(d => d.value))
  const stepX = (w - pad * 2) / Math.max(1, data.length - 1)
  const y = (v: number) => pad + chartH - pad - (v / maxV) * (chartH - pad * 2)
  const x = (i: number) => pad + i * stepX
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.value)}`).join(' ')
  const labelStride = Math.max(1, Math.ceil(data.length / 6))

  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div style={{ position: 'relative' }}>
      <div className="flex items-center justify-between mb-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <span>Всего: <b style={{ color }}>{total}</b></span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxHeight: 160 }}>
        <path d={`${path} L ${x(data.length - 1)} ${chartH} L ${x(0)} ${chartH} Z`}
          fill={color} fillOpacity="0.12" />
        <path d={path} fill="none" stroke={color} strokeWidth="2" />

        {/* Date labels */}
        {data.map((d, i) => (
          i % labelStride === 0 ? (
            <text key={`l${i}`} x={x(i)} y={chartH + 14} textAnchor="middle" fontSize="9" fill="var(--text-tertiary)">
              {formatDateShort(d.date)}
            </text>
          ) : null
        ))}

        {/* Hover dot */}
        {hover !== null && (
          <g>
            <line x1={x(hover)} y1={pad} x2={x(hover)} y2={chartH}
              stroke="var(--text-tertiary)" strokeWidth="0.8" strokeDasharray="3 2" />
            <circle cx={x(hover)} cy={y(data[hover].value)} r="4" fill={color} stroke="#fff" strokeWidth="2" />
          </g>
        )}

        {/* Invisible hover rects */}
        {data.map((_, i) => (
          <rect key={`h${i}`} x={x(i) - stepX / 2} y={0} width={stepX} height={chartH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {hover !== null && (
        <div
          className="absolute z-10 rounded-lg px-2 py-1.5 text-xs pointer-events-none"
          style={{
            background: 'var(--surface-2)', border: '1px solid var(--glass-border)',
            color: 'var(--text-primary)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            left: `${(x(hover) / w) * 100}%`, top: 0,
            transform: 'translateX(-50%)', whiteSpace: 'nowrap',
          }}
        >
          <div className="font-semibold">{formatDateShort(data[hover].date)}</div>
          <div style={{ color }}>{label || 'Значение'}: {data[hover].value}</div>
        </div>
      )}
    </div>
  )
}

function PopupRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--glass-border)' }}>
      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: color || 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}
