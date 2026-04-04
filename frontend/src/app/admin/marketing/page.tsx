'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Plus, Trash2, X, TrendingUp, Users, DollarSign,
  Calendar, AlertCircle, Copy, Check, Megaphone,
  BarChart3, ArrowRight, Target, ExternalLink,
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
  amount: number
  subscribersGained: number
  utmCode?: string
  budgetSource?: 'COMPANY' | 'INVESTMENT'
  investorPartnerId?: string
  targetUrl?: string
  targetType?: string
  createdAt?: string
}

interface FunnelRow {
  utmCode: string
  campaignId?: string
  channelName?: string
  clicks: number
  leads: number
  conversions: number
  cpa: number
  roi: number
  amount?: number
}

interface Partner {
  id: string
  name: string
}

/* ── Constants ─────────────────────────────────────────────── */

const BUDGET_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  COMPANY:    { bg: 'rgba(96,165,250,0.12)', text: '#60a5fa', label: 'Компания' },
  INVESTMENT: { bg: 'rgba(167,139,250,0.12)', text: '#a78bfa', label: 'Инвестиция' },
}

/* ── Helpers ───────────────────────────────────────────────── */

function fmtMoney(amount: number) {
  return new Intl.NumberFormat('ru-RU').format(amount) + ' ₽'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/* ── Component ─────────────────────────────────────────────── */

export default function AdminMarketingPage() {
  const [tab, setTab] = useState<'campaigns' | 'funnel'>('campaigns')

  // Data
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([])
  const [funnel, setFunnel]       = useState<FunnelRow[]>([])
  const [partners, setPartners]   = useState<Partner[]>([])
  const [summary, setSummary]     = useState<any>(null)
  const [loading, setLoading]     = useState(true)

  // Filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  // Modal
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
  })

  // Copy state
  const [copiedUtm, setCopiedUtm] = useState<string | null>(null)

  /* ── Load ─────────────────────────────────── */

  const loadCampaigns = () => {
    setLoading(true)
    const params: { date_from?: string; date_to?: string } = {}
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo

    Promise.all([
      adminApi.buhAds(params),
      adminApi.buhAdsSummary(params),
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

  const loadFunnel = () => {
    setLoading(true)
    const params: { date_from?: string; date_to?: string } = {}
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo

    adminApi.buhAdsFunnel(params)
      .then(setFunnel)
      .catch(() => setFunnel([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (tab === 'campaigns') loadCampaigns()
    else loadFunnel()
  }, [tab, dateFrom, dateTo])

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
        targetUrl: form.targetUrl || undefined,
        targetType: form.targetType || undefined,
      })
      toast.success('Кампания создана')
      setShowModal(false)
      setForm({
        date: new Date().toISOString().slice(0, 10),
        channelName: '', channelUrl: '', format: '', amount: '',
        subscribersGained: '', budgetSource: 'COMPANY',
        investorPartnerId: '', targetUrl: '', targetType: '',
      })
      loadCampaigns()
    } catch {
      toast.error('Ошибка создания')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Удалить кампанию?')) return
    try {
      await adminApi.deleteBuhAd(id)
      toast.success('Удалено')
      loadCampaigns()
    } catch {
      toast.error('Ошибка удаления')
    }
  }

  const copyUtm = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedUtm(code)
    toast.success('UTM скопирован')
    setTimeout(() => setCopiedUtm(null), 2000)
  }

  /* ── Derived stats ────────────────────────── */

  const stats = useMemo(() => {
    if (summary) {
      return {
        totalSpent: summary.totalSpent ?? 0,
        totalSubs: summary.totalSubscribers ?? 0,
        avgCostPerSub: summary.avgCostPerSub ?? 0,
        bestChannel: summary.bestChannel ?? '—',
      }
    }
    const totalSpent = campaigns.reduce((s, c) => s + c.amount, 0)
    const totalSubs = campaigns.reduce((s, c) => s + c.subscribersGained, 0)
    const avgCostPerSub = totalSubs > 0 ? totalSpent / totalSubs : 0

    const channelMap: Record<string, { spent: number; subs: number }> = {}
    campaigns.forEach(c => {
      if (!channelMap[c.channelName]) channelMap[c.channelName] = { spent: 0, subs: 0 }
      channelMap[c.channelName].spent += c.amount
      channelMap[c.channelName].subs += c.subscribersGained
    })
    let bestChannel = '—'
    let bestCps = Infinity
    Object.entries(channelMap).forEach(([name, d]) => {
      const cps = d.subs > 0 ? d.spent / d.subs : Infinity
      if (cps < bestCps) { bestCps = cps; bestChannel = name }
    })

    return { totalSpent, totalSubs, avgCostPerSub, bestChannel }
  }, [campaigns, summary])

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
        {tab === 'campaigns' && (
          <button
            onClick={() => setShowModal(true)}
            className="btn-primary text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Новая кампания
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--surface-1)' }}>
        <button
          onClick={() => setTab('campaigns')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'campaigns' ? 'bg-white/10' : 'hover:bg-white/[0.05]'
          }`}
          style={{ color: tab === 'campaigns' ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
        >
          <span className="flex items-center gap-2">
            <Megaphone className="w-4 h-4" /> Кампании
          </span>
        </button>
        <button
          onClick={() => setTab('funnel')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'funnel' ? 'bg-white/10' : 'hover:bg-white/[0.05]'
          }`}
          style={{ color: tab === 'funnel' ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
        >
          <span className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> UTM Воронка
          </span>
        </button>
      </div>

      {/* Date Filters */}
      <div
        className="rounded-2xl p-4 flex items-center gap-3 flex-wrap"
        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
      >
        <Calendar className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        <input
          type="date"
          className="glass-input py-1.5 px-3 text-sm w-auto"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
        />
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>--</span>
        <input
          type="date"
          className="glass-input py-1.5 px-3 text-sm w-auto"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
        />
        {(dateFrom || dateTo) && (
          <button
            className="text-xs hover:underline"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => { setDateFrom(''); setDateTo('') }}
          >
            Сбросить
          </button>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: Campaigns                                         */}
      {/* ═══════════════════════════════════════════════════════ */}
      {tab === 'campaigns' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              icon={<DollarSign className="w-4 h-4" />}
              label="Всего потрачено"
              value={fmtMoney(stats.totalSpent)}
              color="#f87171"
            />
            <SummaryCard
              icon={<Users className="w-4 h-4" />}
              label="Подписчиков"
              value={String(stats.totalSubs)}
              color="#34d399"
            />
            <SummaryCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Ср. стоимость/подп."
              value={stats.avgCostPerSub > 0 ? fmtMoney(Math.round(stats.avgCostPerSub)) : '—'}
              color="#60a5fa"
            />
            <SummaryCard
              icon={<Target className="w-4 h-4" />}
              label="Лучший канал"
              value={stats.bestChannel}
              color="#a78bfa"
            />
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
                    {['Дата', 'Канал', 'Формат', 'Сумма', 'Подп.', 'Стоим./подп.', 'UTM', 'Бюджет', ''].map(h => (
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
                        {[...Array(9)].map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 skeleton rounded w-16" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : campaigns.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center" style={{ color: 'var(--text-tertiary)' }}>
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p>Кампаний не найдено</p>
                      </td>
                    </tr>
                  ) : (
                    campaigns.map(c => {
                      const cps = c.subscribersGained > 0 ? c.amount / c.subscribersGained : 0
                      const budgetCfg = BUDGET_STYLES[c.budgetSource || 'COMPANY']

                      return (
                        <tr
                          key={c.id}
                          className="hover:bg-white/[0.03] transition-colors"
                          style={{ borderBottom: '1px solid var(--glass-border)' }}
                        >
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
                            {fmtMoney(c.amount)}
                          </td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>
                            {c.subscribersGained}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap" style={{ color: cps > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                            {cps > 0 ? fmtMoney(Math.round(cps)) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {c.utmCode ? (
                              <button
                                onClick={() => copyUtm(c.utmCode!)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono hover:bg-white/[0.05] transition-colors"
                                style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}
                              >
                                {copiedUtm === c.utmCode ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                                {c.utmCode.length > 16 ? c.utmCode.slice(0, 16) + '...' : c.utmCode}
                              </button>
                            ) : (
                              <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                            )}
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
                              onClick={() => remove(c.id)}
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
        </>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: UTM Funnel                                        */}
      {/* ═══════════════════════════════════════════════════════ */}
      {tab === 'funnel' && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  {['UTM Code', 'Канал', 'Клики', 'Лиды', 'Конверсии', 'CPA', 'ROI'].map(h => (
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
                      {[...Array(7)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 skeleton rounded w-16" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : funnel.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center" style={{ color: 'var(--text-tertiary)' }}>
                      <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p>Данных воронки пока нет</p>
                    </td>
                  </tr>
                ) : (
                  funnel.map((row, idx) => (
                    <tr
                      key={row.utmCode + idx}
                      className="hover:bg-white/[0.03] transition-colors"
                      style={{ borderBottom: '1px solid var(--glass-border)' }}
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => copyUtm(row.utmCode)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono hover:bg-white/[0.05] transition-colors"
                          style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}
                        >
                          {copiedUtm === row.utmCode ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          {row.utmCode}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                        {row.channelName || '—'}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>
                        {row.clicks.toLocaleString('ru')}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>
                        {row.leads.toLocaleString('ru')}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {row.conversions.toLocaleString('ru')}
                        </span>
                        {row.clicks > 0 && (
                          <span className="text-xs ml-1.5" style={{ color: 'var(--text-tertiary)' }}>
                            ({((row.conversions / row.clicks) * 100).toFixed(1)}%)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                        {row.cpa > 0 ? fmtMoney(Math.round(row.cpa)) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="font-semibold"
                          style={{ color: row.roi > 0 ? '#34d399' : row.roi < 0 ? '#f87171' : 'var(--text-tertiary)' }}
                        >
                          {row.roi !== 0 ? `${row.roi > 0 ? '+' : ''}${row.roi.toFixed(1)}%` : '—'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Campaign Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-lg mx-4 rounded-2xl p-6 space-y-4 animate-scale-in max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
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
                placeholder="Подписчиков"
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
                        : { background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-tertiary)' }
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

            <div className="grid grid-cols-2 gap-3">
              <input
                className="glass-input"
                placeholder="Целевой URL"
                value={form.targetUrl}
                onChange={e => setForm({ ...form, targetUrl: e.target.value })}
              />
              <input
                className="glass-input"
                placeholder="Тип цели (landing, bot...)"
                value={form.targetType}
                onChange={e => setForm({ ...form, targetType: e.target.value })}
              />
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
