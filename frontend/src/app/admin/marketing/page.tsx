'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Plus, Trash2, X, TrendingUp, Users, DollarSign,
  AlertCircle, Copy, Check, ExternalLink,
  Target, FileText, FileSpreadsheet,
} from 'lucide-react'
import { adminApi } from '@/lib/api'
import toast from 'react-hot-toast'

/* ── Types ─────────────────────────────────────────────────── */

interface AdCampaign {
  id: string
  date: string
  channelName: string
  channelUrl?: string
  format?: string
  amount: number | string
  subscribersGained: number
  utmCode?: string
  budgetSource?: 'COMPANY' | 'INVESTMENT'
  investorPartnerId?: string
  targetUrl?: string
  targetType?: string
  createdAt?: string
  clicks?: number
  leads?: number
  conversions?: number
  revenue?: number
  roi?: number
  ltv?: number
  cac?: number | null
  ltvCacRatio?: number | null
}

interface Partner {
  id: string
  name: string
}

interface StatsPoint {
  date: string
  clicks: number
  leads: number
  conversions: number
  revenue: number
}

interface CampaignStats {
  timeSeries?: StatsPoint[]
  summary?: {
    clicks?: number
    leads?: number
    conversions?: number
    revenue?: number | string
    spend?: number | string
    roi?: number | null
    cpa?: number | null
    ltv?: number | null
    profit?: number | string
    conversionRate?: number
    users?: number
  }
}

/* ── Constants ─────────────────────────────────────────────── */

const BUDGET_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  COMPANY:    { bg: 'rgba(96,165,250,0.12)', text: '#60a5fa', label: 'Компания' },
  INVESTMENT: { bg: 'rgba(167,139,250,0.12)', text: '#a78bfa', label: 'Инвестиция' },
}

/* ── Helpers ───────────────────────────────────────────────── */

function fmtMoney(amount: number) {
  return new Intl.NumberFormat('ru-RU').format(Math.round(amount)) + ' ₽'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtDateShort(iso: string, groupBy: 'day' | 'week' | 'month') {
  const d = new Date(iso)
  if (groupBy === 'month') {
    return d.toLocaleDateString('ru', { month: 'short', year: '2-digit' })
  }
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })
}

/* ── Component ─────────────────────────────────────────────── */

export default function AdminMarketingPage() {
  // Data
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([])
  const [partners, setPartners]   = useState<Partner[]>([])
  const [summary, setSummary]     = useState<any>(null)
  const [loading, setLoading]     = useState(true)

  // Create Modal
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    channelName: '',
    channelUrl: '',
    format: '',
    amount: '',
    subscribersGained: '',
    budgetSource: 'COMPANY' as string,
    investorPartnerId: '',
    targetUrl: '',
    targetType: '',
    utmSource: '',
    utmMedium: '',
    utmCampaign: '',
  })
  const BASE_URL = typeof window !== 'undefined' ? window.location.origin : ''

  // Detail Panel
  const [detailCampaign, setDetailCampaign] = useState<AdCampaign | null>(null)
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')
  const [stats, setStats] = useState<CampaignStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null)

  // Auto-build targetUrl from UTM params
  const buildTargetUrl = () => {
    const base = form.targetUrl && !form.targetUrl.includes('utm_') ? form.targetUrl : BASE_URL
    const params = new URLSearchParams()
    if (form.utmSource) params.set('utm_source', form.utmSource)
    if (form.utmMedium) params.set('utm_medium', form.utmMedium)
    if (form.utmCampaign) params.set('utm_campaign', form.utmCampaign)
    const query = params.toString()
    const sep = base.includes('?') ? '&' : '?'
    return query ? `${base}${sep}${query}` : base
  }

  // Copy state
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Comparison
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showCompare, setShowCompare] = useState(false)

  // Overall dynamics
  const [overallPeriod, setOverallPeriod] = useState<7 | 30 | 90>(30)

  /* ── Load ─────────────────────────────────── */

  const loadCampaigns = () => {
    setLoading(true)
    Promise.all([
      adminApi.buhAds({}),
      adminApi.buhAdsSummary({}),
      adminApi.buhPartners(),
    ])
      .then(([ads, sum, p]) => {
        setCampaigns(ads)
        setSummary(sum)
        setPartners(p)
      })
      .catch(() => {
        setCampaigns([])
        setSummary(null)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadCampaigns()
  }, [])

  // Load stats when detail panel opens or groupBy changes
  useEffect(() => {
    if (!detailCampaign) return
    setStatsLoading(true)
    adminApi.buhAdStats(detailCampaign.id, groupBy)
      .then((data: any) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false))
  }, [detailCampaign, groupBy])

  /* ── Actions ──────────────────────────────── */

  const create = async () => {
    if (!form.channelName || !form.amount) {
      toast.error('Заполните канал и сумму')
      return
    }
    setSaving(true)
    try {
      await adminApi.createBuhAd({
        date: form.date,
        channelName: form.channelName,
        channelUrl: form.channelUrl || undefined,
        format: form.format || undefined,
        amount: Number(form.amount),
        subscribersGained: Number(form.subscribersGained) || 0,
        budgetSource: form.budgetSource === 'COMPANY' ? 'account' : form.budgetSource === 'INVESTMENT' ? 'investment' : 'stats_only',
        investorPartnerId: form.budgetSource === 'INVESTMENT' ? form.investorPartnerId || undefined : undefined,
        targetUrl: (form.utmSource || form.utmMedium || form.utmCampaign) ? buildTargetUrl() : (form.targetUrl || undefined),
        targetType: form.targetType || undefined,
      })
      toast.success('Кампания создана')
      setShowModal(false)
      setForm({
        date: new Date().toISOString().slice(0, 10),
        channelName: '', channelUrl: '', format: '', amount: '',
        subscribersGained: '', budgetSource: 'COMPANY',
        investorPartnerId: '', targetUrl: '', targetType: '',
        utmSource: '', utmMedium: '', utmCampaign: '',
      })
      loadCampaigns()
    } catch {
      toast.error('Ошибка создания')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Удалить кампанию?')) return
    try {
      await adminApi.deleteBuhAd(id)
      toast.success('Удалено')
      loadCampaigns()
    } catch {
      toast.error('Ошибка удаления')
    }
  }

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    toast.success('Скопировано')
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const exportStats = async (format: 'pdf' | 'excel') => {
    if (!detailCampaign) return
    setExporting(format)
    try {
      const res = await fetch(`/api/admin/ads/${detailCampaign.id}/export?format=${format}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      if (format === 'pdf') {
        // Open in new tab for user to print/save as PDF via browser
        window.open(url, '_blank')
        toast.success('Откройте файл и нажмите "Сохранить в PDF"')
      } else {
        // Excel — download
        const a = document.createElement('a')
        a.href = url
        a.download = `campaign-${detailCampaign.channelName || 'export'}-${detailCampaign.id.slice(0, 8)}.xlsx`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        toast.success('Файл скачан')
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch {
      toast.error('Ошибка экспорта')
    } finally {
      setExporting(null)
    }
  }

  /* ── Derived stats ────────────────────────── */

  const aggregateStats = useMemo(() => {
    if (summary) {
      return {
        totalSpent: Number(summary.totalSpent ?? 0),
        totalSubs: Number(summary.totalSubscribers ?? 0),
        avgCostPerSub: Number(summary.costPerSub ?? summary.avgCostPerSub ?? 0),
        bestChannel: summary.bestChannel ?? '—',
      }
    }
    const totalSpent = campaigns.reduce((s, c) => s + Number(c.amount), 0)
    const totalSubs = campaigns.reduce((s, c) => s + Number(c.subscribersGained), 0)
    const avgCostPerSub = totalSubs > 0 ? totalSpent / totalSubs : 0

    const channelMap: Record<string, { spent: number; subs: number }> = {}
    campaigns.forEach(c => {
      if (!channelMap[c.channelName]) channelMap[c.channelName] = { spent: 0, subs: 0 }
      channelMap[c.channelName].spent += Number(c.amount)
      channelMap[c.channelName].subs += Number(c.subscribersGained)
    })
    let bestChannel = '—'
    let bestCps = Infinity
    Object.entries(channelMap).forEach(([name, d]) => {
      const cps = d.subs > 0 ? d.spent / d.subs : Infinity
      if (cps < bestCps) { bestCps = cps; bestChannel = name }
    })

    return { totalSpent, totalSubs, avgCostPerSub, bestChannel }
  }, [campaigns, summary])

  /* ── Detail data ─────────────────────────── */

  const detailData = useMemo(() => {
    if (!detailCampaign) return null
    const goLink = detailCampaign.utmCode ? `${BASE_URL}/go/${detailCampaign.utmCode}` : ''
    const fullUrl = detailCampaign.targetUrl || ''
    const qrUrl = goLink
      ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(goLink)}`
      : ''
    return { goLink, fullUrl, qrUrl }
  }, [detailCampaign, BASE_URL])

  const totals = stats?.summary
  const series = stats?.timeSeries ?? []

  const maxSeriesVal = useMemo(() => {
    if (!series.length) return 1
    return Math.max(
      1,
      ...series.map(p =>
        Math.max(
          Number(p.clicks) || 0,
          Number(p.leads) || 0,
          Number(p.conversions) || 0,
        )
      )
    )
  }, [series])

  const maxRevenue = useMemo(() => {
    if (!series.length) return 1
    return Math.max(1, ...series.map(p => Number(p.revenue) || 0))
  }, [series])

  /* ── Overall dynamics ─────────────────────── */

  const overallSeries = useMemo(() => {
    const now = new Date()
    const cutoff = new Date(now)
    cutoff.setDate(cutoff.getDate() - overallPeriod + 1)
    cutoff.setHours(0, 0, 0, 0)

    const map: Record<string, { spend: number; revenue: number }> = {}
    // init keys for every day in range
    for (let i = 0; i < overallPeriod; i++) {
      const d = new Date(cutoff)
      d.setDate(cutoff.getDate() + i)
      const key = d.toISOString().slice(0, 10)
      map[key] = { spend: 0, revenue: 0 }
    }
    campaigns.forEach(c => {
      if (!c.date) return
      const key = c.date.slice(0, 10)
      if (!map[key]) return
      map[key].spend += Number(c.amount) || 0
      map[key].revenue += Number(c.revenue) || 0
    })
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }))
  }, [campaigns, overallPeriod])

  const overallMax = useMemo(() => {
    return Math.max(1, ...overallSeries.map(p => Math.max(p.spend, p.revenue)))
  }, [overallSeries])

  const selectedCampaigns = useMemo(
    () => campaigns.filter(c => selectedIds.includes(c.id)),
    [campaigns, selectedIds]
  )

  /* ── Render ───────────────────────────────── */

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Маркетинг
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Рекламные кампании и UTM-аналитика
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Новая кампания
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Всего потрачено"
          value={fmtMoney(aggregateStats.totalSpent)}
          color="#f87171"
        />
        <SummaryCard
          icon={<Users className="w-4 h-4" />}
          label="Подписчиков (оплатили)"
          value={String(aggregateStats.totalSubs)}
          color="#34d399"
        />
        <SummaryCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Ср. стоимость/подп."
          value={aggregateStats.avgCostPerSub > 0 ? fmtMoney(aggregateStats.avgCostPerSub) : '—'}
          color="#60a5fa"
        />
        <SummaryCard
          icon={<Target className="w-4 h-4" />}
          label="Лучший канал"
          value={aggregateStats.bestChannel}
          color="#a78bfa"
        />
      </div>

      {/* Overall Dynamics */}
      <div
        className="rounded-2xl p-5"
        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
      >
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            📊 Общая динамика
          </h3>
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-2)' }}>
            {([7, 30, 90] as const).map(p => (
              <button
                key={p}
                onClick={() => setOverallPeriod(p)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: overallPeriod === p ? 'var(--surface-1)' : 'transparent',
                  color: overallPeriod === p ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}
              >
                {p} дней
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mb-3 text-xs">
          <LegendDot color="#f87171" label="Затраты" />
          <LegendDot color="#a78bfa" label="Доход" />
        </div>
        <div className="flex items-end gap-1 h-32 overflow-x-auto">
          {overallSeries.map((p, i) => (
            <div key={i} className="flex flex-col items-center gap-1 shrink-0" style={{ minWidth: '24px' }}>
              <div className="flex items-end gap-0.5 h-28">
                <div
                  className="w-2.5 rounded-t transition-all"
                  style={{
                    height: `${(p.spend / overallMax) * 100}%`,
                    background: '#f87171',
                    minHeight: p.spend > 0 ? '2px' : '0',
                  }}
                  title={`Затраты: ${fmtMoney(p.spend)}`}
                />
                <div
                  className="w-2.5 rounded-t transition-all"
                  style={{
                    height: `${(p.revenue / overallMax) * 100}%`,
                    background: '#a78bfa',
                    minHeight: p.revenue > 0 ? '2px' : '0',
                  }}
                  title={`Доход: ${fmtMoney(p.revenue)}`}
                />
              </div>
              {(i === 0 || i === overallSeries.length - 1 || i % Math.max(1, Math.floor(overallSeries.length / 8)) === 0) && (
                <span className="text-[9px] whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
                  {fmtDateShort(p.date, 'day')}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th className="px-3 py-3 w-8" style={{ color: 'var(--text-tertiary)' }}></th>
                {['Дата', 'Канал', 'Формат', 'Затраты', 'Клики', 'Лиды', 'Оплаты', 'Ср. цена', 'Доход', 'ROI', 'LTV/CAC', 'Бюджет', ''].map(h => (
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
                [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    {[...Array(14)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 skeleton rounded w-16" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-12 text-center" style={{ color: 'var(--text-tertiary)' }}>
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>Кампаний не найдено</p>
                  </td>
                </tr>
              ) : (
                campaigns.map(c => {
                  const amt = Number(c.amount)
                  const budgetCfg = BUDGET_STYLES[c.budgetSource || 'COMPANY']
                  const clicks = Number(c.clicks ?? 0)
                  const leads = Number(c.leads ?? 0)
                  const conv = Number(c.conversions ?? 0)
                  const revenue = Number(c.revenue ?? 0)
                  const roi = c.roi != null ? Number(c.roi) : null
                  const ratio = c.ltvCacRatio != null ? Number(c.ltvCacRatio) : null
                  const cac = c.cac != null ? Number(c.cac) : null
                  const isSelected = selectedIds.includes(c.id)

                  return (
                    <tr
                      key={c.id}
                      onClick={() => { setDetailCampaign(c); setStats(null); setGroupBy('day') }}
                      className="hover:bg-white/[0.05] transition-colors cursor-pointer"
                      style={{
                        borderBottom: '1px solid var(--glass-border)',
                        background: isSelected ? 'rgba(96,165,250,0.08)' : undefined,
                      }}
                    >
                      <td
                        className="px-3 py-3 w-8"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation()
                            setSelectedIds(prev =>
                              prev.includes(c.id)
                                ? prev.filter(x => x !== c.id)
                                : [...prev, c.id]
                            )
                          }}
                          className="cursor-pointer w-4 h-4"
                          style={{ accentColor: '#60a5fa' }}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                        {fmtDate(c.date)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                            {c.channelName}
                          </span>
                          {c.channelUrl && (
                            <a
                              href={c.channelUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3 h-3" style={{ color: 'var(--accent-1)' }} />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {c.format || '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                        {fmtMoney(amt)}
                      </td>
                      <td className="px-4 py-3" style={{ color: clicks > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                        {clicks > 0 ? clicks : '—'}
                      </td>
                      <td className="px-4 py-3" style={{ color: leads > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                        {leads > 0 ? leads : '—'}
                      </td>
                      <td className="px-4 py-3" style={{ color: conv > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                        {conv > 0 ? conv : '—'}
                      </td>
                      <td
                        className="px-4 py-3 whitespace-nowrap"
                        title="CAC — средняя стоимость одного оплатившего клиента"
                        style={{ color: cac != null && cac > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
                      >
                        {cac != null && cac > 0 ? fmtMoney(cac) : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: revenue > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                        {revenue > 0 ? fmtMoney(revenue) : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium" style={{ color: roi == null ? 'var(--text-tertiary)' : roi >= 0 ? '#34d399' : '#f87171' }}>
                        {roi != null ? `${roi > 0 ? '+' : ''}${roi.toFixed(1)}%` : '—'}
                      </td>
                      <td
                        className="px-4 py-3 whitespace-nowrap font-medium"
                        title="LTV/CAC ≥3 — здоровый канал"
                        style={{
                          color: ratio == null ? 'var(--text-tertiary)'
                            : ratio >= 3 ? '#34d399'
                            : ratio >= 1 ? '#fbbf24'
                            : '#f87171'
                        }}
                      >
                        {ratio != null ? `${ratio.toFixed(2)}×` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {budgetCfg && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
                            style={{ background: budgetCfg.bg, color: budgetCfg.text }}
                          >
                            {budgetCfg.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => remove(c.id, e)}
                          className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Detail Slide-Over Panel                                */}
      {/* ═══════════════════════════════════════════════════════ */}
      {detailCampaign && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setDetailCampaign(null)}
        >
          <div
            className="h-full overflow-y-auto"
            style={{
              width: '800px',
              maxWidth: '100vw',
              background: 'var(--surface-1)',
              borderLeft: '1px solid var(--glass-border)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {detailCampaign.channelName}
                  </h2>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {fmtDate(detailCampaign.date)} · {detailCampaign.format || 'Без формата'}
                  </p>
                </div>
                <button
                  onClick={() => setDetailCampaign(null)}
                  className="p-2 rounded-lg hover:bg-white/[0.05]"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Links section */}
              {detailCampaign.utmCode && detailData && (
                <div className="grid md:grid-cols-[1fr_auto] gap-4 items-start">
                  <div className="space-y-3">
                    {/* Short link /go/ */}
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
                        Короткая ссылка
                      </p>
                      <div className="flex gap-2 items-center">
                        <div
                          className="flex-1 p-2 rounded-lg text-sm font-mono break-all"
                          style={{ background: 'var(--surface-2)', color: '#60a5fa', border: '1px solid var(--glass-border)' }}
                        >
                          {detailData.goLink}
                        </div>
                        <button
                          onClick={() => copyText(detailData.goLink, 'go')}
                          className="p-2 rounded-lg hover:bg-white/[0.05] shrink-0"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {copiedKey === 'go' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Full UTM URL */}
                    {detailData.fullUrl && (
                      <div>
                        <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
                          Полная UTM ссылка
                        </p>
                        <div className="flex gap-2 items-start">
                          <div
                            className="flex-1 p-2 rounded-lg text-xs font-mono break-all"
                            style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
                          >
                            {detailData.fullUrl}
                          </div>
                          <button
                            onClick={() => copyText(detailData.fullUrl, 'full')}
                            className="p-2 rounded-lg hover:bg-white/[0.05] shrink-0"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {copiedKey === 'full' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* QR Code */}
                  <div
                    className="p-3 rounded-lg flex flex-col items-center gap-2"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}
                  >
                    <img
                      src={detailData.qrUrl}
                      alt="QR Code"
                      className="w-[200px] h-[200px] rounded"
                    />
                    <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                      QR-код
                    </span>
                  </div>
                </div>
              )}

              {/* Period selector */}
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Период:</span>
                <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                  {([
                    { value: 'day', label: 'День' },
                    { value: 'week', label: 'Неделя' },
                    { value: 'month', label: 'Месяц' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setGroupBy(opt.value)}
                      className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                      style={{
                        background: groupBy === opt.value ? 'var(--surface-1)' : 'transparent',
                        color: groupBy === opt.value ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard label="Клики" value={String(Number(totals?.clicks ?? 0))} color="#60a5fa" />
                <MetricCard label="Лиды" value={String(Number(totals?.leads ?? 0))} color="#fbbf24" />
                <MetricCard label="Конверсии" value={String(Number(totals?.conversions ?? 0))} color="#34d399" />
                <MetricCard label="Доход" value={fmtMoney(Number(totals?.revenue ?? 0))} color="#a78bfa" />
                <MetricCard
                  label="ROI"
                  value={totals?.roi != null ? `${Number(totals.roi) > 0 ? '+' : ''}${Number(totals.roi).toFixed(1)}%` : '—'}
                  color={totals?.roi != null && Number(totals.roi) >= 0 ? '#34d399' : '#f87171'}
                />
                <MetricCard
                  label="Ср. цена клиента"
                  value={totals?.cpa != null && Number(totals.cpa) > 0 ? fmtMoney(Number(totals.cpa)) : '—'}
                  color="#60a5fa"
                />
                <MetricCard
                  label="LTV"
                  value={totals?.ltv != null && Number(totals.ltv) > 0 ? fmtMoney(Number(totals.ltv)) : '—'}
                  color="#fbbf24"
                />
                <MetricCard
                  label="Прибыль"
                  value={fmtMoney(Number(totals?.profit ?? (Number(totals?.revenue ?? 0) - Number(totals?.spend ?? detailCampaign.amount))))}
                  color={
                    Number(totals?.profit ?? (Number(totals?.revenue ?? 0) - Number(totals?.spend ?? detailCampaign.amount))) >= 0
                      ? '#34d399'
                      : '#f87171'
                  }
                />
              </div>

              {/* Time series chart */}
              <div
                className="rounded-2xl p-4"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}
              >
                <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Динамика
                </h3>

                {statsLoading ? (
                  <div className="h-48 skeleton rounded-lg" />
                ) : series.length === 0 ? (
                  <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Нет данных за период</p>
                  </div>
                ) : (
                  <>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-3 mb-4 text-xs">
                      <LegendDot color="#60a5fa" label="Клики" />
                      <LegendDot color="#fbbf24" label="Лиды" />
                      <LegendDot color="#34d399" label="Конверсии" />
                      <LegendDot color="#a78bfa" label="Доход" />
                    </div>

                    {/* Bars */}
                    <div className="space-y-4">
                      {/* Clicks/leads/conversions grouped */}
                      <div>
                        <div className="flex items-end gap-2 h-40 overflow-x-auto">
                          {series.map((p, i) => {
                            const clicks = Number(p.clicks) || 0
                            const leads = Number(p.leads) || 0
                            const conversions = Number(p.conversions) || 0
                            return (
                              <div key={i} className="flex flex-col items-center gap-1 shrink-0" style={{ minWidth: '40px' }}>
                                <div className="flex items-end gap-0.5 h-32">
                                  <div
                                    className="w-2 rounded-t transition-all"
                                    style={{
                                      height: `${(clicks / maxSeriesVal) * 100}%`,
                                      background: '#60a5fa',
                                      minHeight: clicks > 0 ? '2px' : '0',
                                    }}
                                    title={`Клики: ${clicks}`}
                                  />
                                  <div
                                    className="w-2 rounded-t transition-all"
                                    style={{
                                      height: `${(leads / maxSeriesVal) * 100}%`,
                                      background: '#fbbf24',
                                      minHeight: leads > 0 ? '2px' : '0',
                                    }}
                                    title={`Лиды: ${leads}`}
                                  />
                                  <div
                                    className="w-2 rounded-t transition-all"
                                    style={{
                                      height: `${(conversions / maxSeriesVal) * 100}%`,
                                      background: '#34d399',
                                      minHeight: conversions > 0 ? '2px' : '0',
                                    }}
                                    title={`Конверсии: ${conversions}`}
                                  />
                                </div>
                                <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
                                  {fmtDateShort(p.date, groupBy)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Revenue bars (separate scale) */}
                      <div>
                        <p className="text-[10px] mb-1" style={{ color: 'var(--text-tertiary)' }}>Доход (₽)</p>
                        <div className="flex items-end gap-2 h-20 overflow-x-auto">
                          {series.map((p, i) => {
                            const revenue = Number(p.revenue) || 0
                            return (
                              <div key={i} className="flex flex-col items-center gap-1 shrink-0" style={{ minWidth: '40px' }}>
                                <div
                                  className="w-6 rounded-t transition-all"
                                  style={{
                                    height: `${(revenue / maxRevenue) * 100}%`,
                                    background: '#a78bfa',
                                    minHeight: revenue > 0 ? '2px' : '0',
                                  }}
                                  title={`Доход: ${fmtMoney(revenue)}`}
                                />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Export buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => exportStats('pdf')}
                  disabled={exporting !== null}
                  className="btn-secondary text-sm flex items-center gap-2 flex-1 justify-center"
                >
                  {exporting === 'pdf' ? (
                    <>Загрузка...</>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" /> Скачать PDF
                    </>
                  )}
                </button>
                <button
                  onClick={() => exportStats('excel')}
                  disabled={exporting !== null}
                  className="btn-secondary text-sm flex items-center gap-2 flex-1 justify-center"
                >
                  {exporting === 'excel' ? (
                    <>Загрузка...</>
                  ) : (
                    <>
                      <FileSpreadsheet className="w-4 h-4" /> Скачать Excel
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Create Campaign Modal                                  */}
      {/* ═══════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            className="w-full max-w-lg rounded-2xl p-6 space-y-4 animate-scale-in max-h-[90vh] overflow-y-auto"
            style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--glass-border)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Новая кампания
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg hover:bg-white/[0.05]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Дата</label>
                <input
                  className="glass-input"
                  type="date"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Формат</label>
                <input
                  className="glass-input"
                  placeholder="Пост, сторис, видео..."
                  value={form.format}
                  onChange={e => setForm({ ...form, format: e.target.value })}
                />
              </div>
            </div>

            <input
              className="glass-input"
              placeholder="Название канала"
              value={form.channelName}
              onChange={e => setForm({ ...form, channelName: e.target.value })}
            />

            <input
              className="glass-input"
              placeholder="Ссылка на канал (необязательно)"
              value={form.channelUrl}
              onChange={e => setForm({ ...form, channelUrl: e.target.value })}
            />

            <div className="grid grid-cols-2 gap-3">
              <input
                className="glass-input"
                type="number"
                placeholder="Сумма"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
              />
              <input
                className="glass-input"
                type="number"
                placeholder="Охват канала (необяз.)"
                value={form.subscribersGained}
                onChange={e => setForm({ ...form, subscribersGained: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>
                Источник бюджета
              </label>
              <div className="flex gap-2">
                {Object.entries(BUDGET_STYLES).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setForm({ ...form, budgetSource: key })}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors`}
                    style={
                      form.budgetSource === key
                        ? { background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.text}30` }
                        : { background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-tertiary)' }
                    }
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            {form.budgetSource === 'INVESTMENT' && (
              <select
                className="glass-input w-full"
                value={form.investorPartnerId}
                onChange={e => setForm({ ...form, investorPartnerId: e.target.value })}
              >
                <option value="">Выберите инвестора</option>
                {partners.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}

            <div className="p-3 rounded-lg space-y-2" style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <div className="text-xs font-medium flex items-center gap-1.5" style={{ color: '#a78bfa' }}>
                UTM Конструктор
              </div>
              <input
                className="glass-input"
                placeholder={`Целевой URL (по умолчанию ${BASE_URL})`}
                value={form.targetUrl}
                onChange={e => setForm({ ...form, targetUrl: e.target.value })}
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  className="glass-input text-xs"
                  placeholder="utm_source (tg, fb, vk)"
                  value={form.utmSource}
                  onChange={e => setForm({ ...form, utmSource: e.target.value })}
                />
                <input
                  className="glass-input text-xs"
                  placeholder="utm_medium (post, story)"
                  value={form.utmMedium}
                  onChange={e => setForm({ ...form, utmMedium: e.target.value })}
                />
                <input
                  className="glass-input text-xs"
                  placeholder="utm_campaign (name)"
                  value={form.utmCampaign}
                  onChange={e => setForm({ ...form, utmCampaign: e.target.value })}
                />
              </div>
              <select
                className="glass-input text-xs"
                value={form.targetType}
                onChange={e => setForm({ ...form, targetType: e.target.value })}
              >
                <option value="">Тип цели...</option>
                <option value="custom">Сайт</option>
                <option value="bot">Telegram бот</option>
                <option value="channel">Канал</option>
              </select>
              {(form.utmSource || form.utmMedium || form.utmCampaign) && (
                <div className="text-[10px] font-mono p-2 rounded break-all" style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
                  {buildTargetUrl()}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={create} disabled={saving} className="btn-primary text-sm flex-1">
                {saving ? 'Сохраняю...' : 'Создать'}
              </button>
              <button onClick={() => setShowModal(false)} className="btn-secondary text-sm">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Floating Compare Button                                */}
      {/* ═══════════════════════════════════════════════════════ */}
      {selectedIds.length >= 2 && !showCompare && (
        <button
          onClick={() => setShowCompare(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3 rounded-full font-medium text-sm shadow-2xl transition-all hover:scale-105"
          style={{
            background: '#60a5fa',
            color: '#fff',
            boxShadow: '0 10px 40px rgba(96,165,250,0.4)',
          }}
        >
          <TrendingUp className="w-4 h-4" />
          Сравнить ({selectedIds.length})
        </button>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Comparison Modal                                       */}
      {/* ═══════════════════════════════════════════════════════ */}
      {showCompare && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={() => setShowCompare(false)}
        >
          <div
            className="w-full max-w-5xl rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
            style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--glass-border)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Сравнение кампаний
              </h2>
              <button
                onClick={() => setShowCompare(false)}
                className="p-2 rounded-lg hover:bg-white/[0.05]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metric comparison charts */}
            {(() => {
              const metrics: { key: string; label: string; getValue: (c: AdCampaign) => number; fmt: (v: number) => string; signed?: boolean }[] = [
                { key: 'spend', label: 'Затраты', getValue: c => Number(c.amount) || 0, fmt: fmtMoney },
                { key: 'revenue', label: 'Доход', getValue: c => Number(c.revenue) || 0, fmt: fmtMoney },
                { key: 'roi', label: 'ROI', getValue: c => Number(c.roi) || 0, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`, signed: true },
                { key: 'ltvcac', label: 'LTV/CAC', getValue: c => Number(c.ltvCacRatio) || 0, fmt: v => `${v.toFixed(2)}×` },
                { key: 'clicks', label: 'Клики', getValue: c => Number(c.clicks) || 0, fmt: v => String(v) },
                { key: 'conversions', label: 'Конверсии', getValue: c => Number(c.conversions) || 0, fmt: v => String(v) },
              ]

              return metrics.map(m => {
                const values = selectedCampaigns.map(c => m.getValue(c))
                const maxAbs = Math.max(1, ...values.map(v => Math.abs(v)))
                const maxVal = Math.max(...values)
                const minVal = Math.min(...values)

                return (
                  <div
                    key={m.key}
                    className="rounded-xl p-4"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}
                  >
                    <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                      {m.label}
                    </h3>
                    <div className="space-y-2">
                      {selectedCampaigns.map(c => {
                        const v = m.getValue(c)
                        const isBest = v === maxVal && maxVal !== minVal
                        const isWorst = v === minVal && maxVal !== minVal
                        let color = '#60a5fa'
                        if (m.signed) {
                          color = isBest ? '#34d399' : isWorst ? '#f87171' : v >= 0 ? '#60a5fa' : '#f87171'
                        } else {
                          color = isBest ? '#34d399' : isWorst ? '#f87171' : '#60a5fa'
                        }
                        const widthPct = (Math.abs(v) / maxAbs) * 100
                        return (
                          <div key={c.id} className="flex items-center gap-3">
                            <div
                              className="w-32 text-xs truncate shrink-0"
                              style={{ color: 'var(--text-secondary)' }}
                              title={c.channelName}
                            >
                              {c.channelName}
                            </div>
                            <div className="flex-1 h-6 rounded-md overflow-hidden" style={{ background: 'var(--surface-1)' }}>
                              <div
                                className="h-full rounded-md transition-all flex items-center justify-end pr-2"
                                style={{
                                  width: `${Math.max(widthPct, 2)}%`,
                                  background: color,
                                  minWidth: v !== 0 ? '30px' : '2px',
                                }}
                              >
                                <span className="text-[10px] font-semibold text-white whitespace-nowrap">
                                  {m.fmt(v)}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            })()}

            {/* Footer actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setSelectedIds([]); setShowCompare(false) }}
                className="btn-secondary text-sm flex-1"
              >
                Отменить выбор
              </button>
              <button
                onClick={() => setShowCompare(false)}
                className="btn-primary text-sm flex-1"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
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
    <div
      className="rounded-2xl p-4 flex items-center gap-3"
      style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
    >
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

/* ── Metric Card (compact, for detail panel) ────────────────── */

function MetricCard({
  label, value, color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}
    >
      <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </p>
      <p className="text-base font-bold mt-1 truncate" style={{ color }}>
        {value}
      </p>
    </div>
  )
}

/* ── Legend Dot ────────────────────────────────────────────── */

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  )
}
