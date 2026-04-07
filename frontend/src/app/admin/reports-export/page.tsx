'use client'

import { useState, useCallback } from 'react'
import {
  FileText, Download, Calendar, Clock, Table2,
  DollarSign, Megaphone, Users, Wifi, Activity,
  TrendingUp, Check, ArrowUpRight, ArrowDownRight,
  BarChart3, RefreshCw, AlertCircle, Minus,
} from 'lucide-react'
import { adminApi } from '@/lib/api'
import toast from 'react-hot-toast'

/* ── Types ─────────────────────────────────────────────────── */

interface Section {
  key: string; label: string; desc: string; icon: any; color: string
}

interface Transaction {
  id: string; type: 'INCOME' | 'EXPENSE'; amount: number
  category?: { id: string; name: string; color: string } | null
}

interface PeriodStats {
  income: number; expense: number; profit: number; count: number
  byCategory: Record<string, { name: string; color: string; amount: number }>
}

interface Preset {
  label: string; aFrom: () => string; aTo: () => string; bFrom: () => string; bTo: () => string
}

/* ── Helpers ───────────────────────────────────────────────── */

function fmtMoney(n: number) {
  return new Intl.NumberFormat('ru-RU').format(n) + ' ₽'
}

function todayISO() { return new Date().toISOString().slice(0, 10) }
function dateISO(d: Date) { return d.toISOString().slice(0, 10) }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }
function startOfQuarter(d: Date) {
  const q = Math.floor(d.getMonth() / 3) * 3
  return new Date(d.getFullYear(), q, 1)
}
function endOfQuarter(d: Date) {
  const q = Math.floor(d.getMonth() / 3) * 3
  return new Date(d.getFullYear(), q + 3, 0)
}

function computeStats(items: Transaction[]): PeriodStats {
  let income = 0, expense = 0
  const byCategory: PeriodStats['byCategory'] = {}
  for (const t of items) {
    if (t.type === 'INCOME') income += t.amount; else expense += t.amount
    if (t.type === 'EXPENSE' && t.category) {
      const key = t.category.id
      if (!byCategory[key]) byCategory[key] = { name: t.category.name, color: t.category.color, amount: 0 }
      byCategory[key].amount += t.amount
    }
  }
  return { income, expense, profit: income - expense, count: items.length, byCategory }
}

/* ── Constants ─────────────────────────────────────────────── */

const SECTIONS: Section[] = [
  { key: 'kpi', label: 'KPI и финансы', desc: 'Выручка, прибыль, новые клиенты, LTV/CAC', icon: DollarSign, color: '#34d399' },
  { key: 'marketing', label: 'Маркетинг', desc: 'Кампании, клики, лиды, конверсии, ROI, воронка', icon: Megaphone, color: '#60a5fa' },
  { key: 'customers', label: 'Клиенты', desc: 'Активные/истекшие, топ по LTV, конверсия, динамика', icon: Users, color: '#a78bfa' },
  { key: 'vpn', label: 'VPN инфраструктура', desc: 'Ноды онлайн, пользователи, трафик', icon: Wifi, color: '#fbbf24' },
  { key: 'events', label: 'Лента событий', desc: 'Последние оплаты, регистрации, расходы', icon: Activity, color: '#06b6d4' },
]

const PERIODS = [
  { label: 'Сегодня', days: 1 }, { label: '7 дней', days: 7 },
  { label: '30 дней', days: 30 }, { label: '90 дней', days: 90 }, { label: 'Год', days: 365 },
] as const

const PRESETS: Preset[] = [
  {
    label: 'Этот месяц vs Прошлый',
    aFrom: () => dateISO(startOfMonth(new Date())), aTo: () => todayISO(),
    bFrom: () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return dateISO(startOfMonth(d)) },
    bTo: () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return dateISO(endOfMonth(d)) },
  },
  {
    label: 'Этот квартал vs Прошлый',
    aFrom: () => dateISO(startOfQuarter(new Date())), aTo: () => todayISO(),
    bFrom: () => { const d = new Date(); d.setMonth(d.getMonth() - 3); return dateISO(startOfQuarter(d)) },
    bTo: () => { const d = new Date(); d.setMonth(d.getMonth() - 3); return dateISO(endOfQuarter(d)) },
  },
  {
    label: 'Этот год vs Прошлый',
    aFrom: () => `${new Date().getFullYear()}-01-01`, aTo: () => todayISO(),
    bFrom: () => `${new Date().getFullYear() - 1}-01-01`, bTo: () => `${new Date().getFullYear() - 1}-12-31`,
  },
]

/* ── Component ─────────────────────────────────────────────── */

export default function AdminReportsExportPage() {
  const [tab, setTab] = useState<'export' | 'compare'>('export')

  // Export state
  const [days, setDays] = useState(30)
  const [format, setFormat] = useState<'pdf' | 'excel'>('pdf')
  const [selected, setSelected] = useState<Record<string, boolean>>({
    kpi: true, marketing: true, customers: true, vpn: true, events: true,
  })
  const [exportLoading, setExportLoading] = useState(false)

  // Compare state
  const [aFrom, setAFrom] = useState(() => dateISO(startOfMonth(new Date())))
  const [aTo, setATo] = useState(todayISO())
  const [bFrom, setBFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return dateISO(startOfMonth(d)) })
  const [bTo, setBTo] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return dateISO(endOfMonth(d)) })
  const [statsA, setStatsA] = useState<PeriodStats | null>(null)
  const [statsB, setStatsB] = useState<PeriodStats | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)

  /* ── Export handlers ─────────────────────────── */

  const toggleSection = (key: string) => setSelected(prev => ({ ...prev, [key]: !prev[key] }))
  const selectedKeys = Object.entries(selected).filter(([, v]) => v).map(([k]) => k)

  const selectAll = () => {
    const allOn = SECTIONS.every(s => selected[s.key])
    const next: Record<string, boolean> = {}
    SECTIONS.forEach(s => { next[s.key] = !allOn })
    setSelected(next)
  }

  async function handleExport() {
    if (selectedKeys.length === 0) { toast.error('Выберите хотя бы одну секцию'); return }
    setExportLoading(true)
    const url = `/api/admin/dashboard/export?format=${format}&sections=${selectedKeys.join(',')}&days=${days}`
    try {
      if (format === 'pdf') { window.open(url, '_blank'); toast.success('PDF открыт') }
      else {
        const res = await fetch(url, { credentials: 'include' })
        if (!res.ok) throw new Error()
        const blob = await res.blob()
        const blobUrl = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = blobUrl; a.download = `report_${days}d.xlsx`
        document.body.appendChild(a); a.click(); a.remove()
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
        toast.success('Excel скачан')
      }
    } catch { toast.error('Ошибка генерации отчёта') }
    finally { setExportLoading(false) }
  }

  /* ── Compare handlers ─────────────────────────── */

  function applyPreset(p: Preset) {
    setAFrom(p.aFrom()); setATo(p.aTo()); setBFrom(p.bFrom()); setBTo(p.bTo())
    setStatsA(null); setStatsB(null)
  }

  const compare = useCallback(async () => {
    if (!aFrom || !aTo || !bFrom || !bTo) { toast.error('Укажите все 4 даты'); return }
    setCompareLoading(true)
    try {
      const [resA, resB] = await Promise.all([
        adminApi.buhTransactions({ date_from: aFrom, date_to: aTo, limit: 10000 }),
        adminApi.buhTransactions({ date_from: bFrom, date_to: bTo, limit: 10000 }),
      ])
      setStatsA(computeStats(resA.items ?? []))
      setStatsB(computeStats(resB.items ?? []))
    } catch { toast.error('Ошибка загрузки данных') }
    finally { setCompareLoading(false) }
  }, [aFrom, aTo, bFrom, bTo])

  function delta(a: number, b: number) { return a - b }
  function deltaPct(a: number, b: number) { if (b === 0) return a === 0 ? 0 : 100; return ((a - b) / Math.abs(b)) * 100 }
  function fmtDelta(n: number) { const s = fmtMoney(Math.abs(n)); return n > 0 ? `+${s}` : n < 0 ? `-${s}` : s }
  function fmtPct(n: number) { return (n > 0 ? '+' : '') + n.toFixed(1) + '%' }

  const kpiRows = statsA && statsB ? [
    { label: 'Доходы', a: statsA.income, b: statsB.income, positive: true },
    { label: 'Расходы', a: statsA.expense, b: statsB.expense, positive: false },
    { label: 'Прибыль', a: statsA.profit, b: statsB.profit, positive: true },
    { label: 'Транзакции', a: statsA.count, b: statsB.count, positive: true },
  ] : []

  const allCatKeys = statsA && statsB
    ? [...new Set([...Object.keys(statsA.byCategory), ...Object.keys(statsB.byCategory)])] : []
  const maxCatAmount = statsA && statsB
    ? Math.max(...allCatKeys.map(k => Math.max(statsA.byCategory[k]?.amount ?? 0, statsB.byCategory[k]?.amount ?? 0)), 1) : 1

  /* ── Render ──────────────────────────────────── */

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header + Tabs */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Отчёты</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Экспорт данных и сравнительный анализ периодов
        </p>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--glass-border)', background: 'var(--glass-bg)' }}>
        {([
          { key: 'export' as const, label: 'Экспорт отчётов', icon: Download },
          { key: 'compare' as const, label: 'Сравнение периодов', icon: BarChart3 },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors"
            style={{
              background: tab === t.key ? '#534AB7' : 'transparent',
              color: tab === t.key ? '#fff' : 'var(--text-secondary)',
            }}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════ EXPORT TAB ═══════════════ */}
      {tab === 'export' && (
        <div className="space-y-6">
          {/* Period */}
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Период</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {PERIODS.map(p => (
                <button key={p.days} onClick={() => setDays(p.days)}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                  style={{
                    background: days === p.days ? '#534AB7' : 'var(--glass-bg)',
                    color: days === p.days ? '#fff' : 'var(--text-secondary)',
                    border: `1px solid ${days === p.days ? '#534AB7' : 'var(--glass-border)'}`,
                  }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Format */}
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Формат</span>
            <div className="grid grid-cols-2 gap-3">
              {([
                { key: 'pdf' as const, label: 'PDF', desc: 'Открывается в браузере', icon: FileText, color: '#ef4444' },
                { key: 'excel' as const, label: 'Excel', desc: 'Скачивается как XLSX', icon: Table2, color: '#34d399' },
              ]).map(f => (
                <button key={f.key} onClick={() => setFormat(f.key)}
                  className="flex items-center gap-3 p-4 rounded-xl text-left transition-all"
                  style={{
                    background: format === f.key ? `${f.color}15` : 'var(--glass-bg)',
                    border: `2px solid ${format === f.key ? f.color : 'var(--glass-border)'}`,
                  }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${f.color}20` }}>
                    <f.icon className="w-5 h-5" style={{ color: f.color }} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{f.label}</div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{f.desc}</div>
                  </div>
                  {format === f.key && <Check className="w-5 h-5" style={{ color: f.color }} />}
                </button>
              ))}
            </div>
          </div>

          {/* Sections */}
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Секции отчёта</span>
              <button onClick={selectAll} className="text-xs px-3 py-1 rounded-lg"
                style={{ background: 'var(--glass-bg)', color: '#60a5fa', border: '1px solid var(--glass-border)' }}>
                {SECTIONS.every(s => selected[s.key]) ? 'Снять всё' : 'Выбрать всё'}
              </button>
            </div>
            <div className="space-y-2">
              {SECTIONS.map(s => {
                const isOn = !!selected[s.key]
                return (
                  <button key={s.key} onClick={() => toggleSection(s.key)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                    style={{
                      background: isOn ? `${s.color}10` : 'var(--glass-bg)',
                      border: `1.5px solid ${isOn ? s.color : 'var(--glass-border)'}`,
                    }}>
                    <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                      style={{ background: isOn ? s.color : 'transparent', border: `2px solid ${isOn ? s.color : 'var(--glass-border)'}` }}>
                      {isOn && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${s.color}15` }}>
                      <s.icon className="w-4 h-4" style={{ color: s.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.label}</div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{s.desc}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Generate */}
          <button onClick={handleExport} disabled={exportLoading || selectedKeys.length === 0}
            className="w-full py-3.5 rounded-2xl text-base font-semibold flex items-center justify-center gap-2 transition-all"
            style={{ background: exportLoading ? 'var(--glass-bg)' : '#534AB7', color: exportLoading ? 'var(--text-tertiary)' : '#fff', opacity: selectedKeys.length === 0 ? 0.5 : 1 }}>
            {exportLoading ? <><Clock className="w-5 h-5 animate-spin" /> Генерация...</> : <><Download className="w-5 h-5" /> Сформировать ({format.toUpperCase()})</>}
          </button>
        </div>
      )}

      {/* ═══════════════ COMPARE TAB ═══════════════ */}
      {tab === 'compare' && (
        <div className="space-y-6">
          {/* Quick presets */}
          <div className="flex gap-2 flex-wrap">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:scale-[1.02]"
                style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Period selectors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: '#8b5cf6' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Период A</h3>
              </div>
              <div className="flex gap-3 items-center flex-wrap">
                <Calendar className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                <input type="date" className="glass-input py-1.5 px-3 text-sm w-auto" value={aFrom} onChange={e => setAFrom(e.target.value)} />
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>—</span>
                <input type="date" className="glass-input py-1.5 px-3 text-sm w-auto" value={aTo} onChange={e => setATo(e.target.value)} />
              </div>
            </div>
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: '#f59e0b' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Период B</h3>
              </div>
              <div className="flex gap-3 items-center flex-wrap">
                <Calendar className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                <input type="date" className="glass-input py-1.5 px-3 text-sm w-auto" value={bFrom} onChange={e => setBFrom(e.target.value)} />
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>—</span>
                <input type="date" className="glass-input py-1.5 px-3 text-sm w-auto" value={bTo} onChange={e => setBTo(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Compare button */}
          <button onClick={compare} disabled={compareLoading}
            className="w-full py-3.5 rounded-2xl text-base font-semibold flex items-center justify-center gap-2 transition-all"
            style={{ background: compareLoading ? 'var(--glass-bg)' : '#534AB7', color: compareLoading ? 'var(--text-tertiary)' : '#fff' }}>
            {compareLoading ? <><Clock className="w-5 h-5 animate-spin" /> Загрузка...</> : <><RefreshCw className="w-5 h-5" /> Сравнить</>}
          </button>

          {/* Results */}
          {statsA && statsB && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {([
                  { label: 'Доходы', a: statsA.income, b: statsB.income, color: '#34d399', icon: <ArrowUpRight className="w-4 h-4" /> },
                  { label: 'Расходы', a: statsA.expense, b: statsB.expense, color: '#f87171', icon: <ArrowDownRight className="w-4 h-4" /> },
                  { label: 'Прибыль', a: statsA.profit, b: statsB.profit, color: '#8b5cf6', icon: <TrendingUp className="w-4 h-4" /> },
                ]).map(c => (
                  <div key={c.label} className="glass-card rounded-2xl p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${c.color}15`, color: c.color }}>{c.icon}</div>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{c.label}</p>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {fmtMoney(c.a)} <span style={{ color: 'var(--text-tertiary)' }}>/</span> {fmtMoney(c.b)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* KPI table */}
              <div className="glass-card rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                      {['Показатель', 'Период A', 'Период B', 'Разница', '%'].map(h => (
                        <th key={h} className="text-left px-4 py-3 font-medium text-xs" style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {kpiRows.map(row => {
                      const d = delta(row.a, row.b)
                      const dp = deltaPct(row.a, row.b)
                      const isMoney = row.label !== 'Транзакции'
                      const deltaGood = row.positive ? d >= 0 : d <= 0
                      const dColor = d === 0 ? 'var(--text-tertiary)' : deltaGood ? '#34d399' : '#f87171'
                      return (
                        <tr key={row.label} className="hover:bg-white/[0.03]" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                          <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{row.label}</td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>{isMoney ? fmtMoney(row.a) : row.a}</td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>{isMoney ? fmtMoney(row.b) : row.b}</td>
                          <td className="px-4 py-3 font-semibold" style={{ color: dColor }}>
                            {d === 0 ? <Minus className="w-4 h-4 inline" /> : <>{d > 0 ? <ArrowUpRight className="w-3.5 h-3.5 inline mr-0.5" /> : <ArrowDownRight className="w-3.5 h-3.5 inline mr-0.5" />}{isMoney ? fmtDelta(d) : (d > 0 ? '+' : '') + d}</>}
                          </td>
                          <td className="px-4 py-3 text-xs font-medium" style={{ color: dColor }}>{d === 0 ? '0%' : fmtPct(dp)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Category breakdown */}
              {allCatKeys.length > 0 && (
                <div className="glass-card rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Расходы по категориям</h3>
                  </div>
                  <div className="space-y-4">
                    {allCatKeys
                      .sort((a, b) => Math.max(statsA.byCategory[b]?.amount ?? 0, statsB.byCategory[b]?.amount ?? 0) - Math.max(statsA.byCategory[a]?.amount ?? 0, statsB.byCategory[a]?.amount ?? 0))
                      .map(key => {
                        const catA = statsA.byCategory[key], catB = statsB.byCategory[key]
                        const name = catA?.name ?? catB?.name ?? '—'
                        const color = catA?.color ?? catB?.color ?? '#6b7280'
                        const amtA = catA?.amount ?? 0, amtB = catB?.amount ?? 0
                        return (
                          <div key={key} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{name}</span>
                              </div>
                              <div className="flex gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#8b5cf6' }} />{fmtMoney(amtA)}</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#f59e0b' }} />{fmtMoney(amtB)}</span>
                              </div>
                            </div>
                            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(139,92,246,0.08)' }}>
                              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(amtA / maxCatAmount) * 100}%`, background: '#8b5cf6' }} />
                            </div>
                            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(245,158,11,0.08)' }}>
                              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(amtB / maxCatAmount) * 100}%`, background: '#f59e0b' }} />
                            </div>
                          </div>
                        )
                      })}
                  </div>
                  <div className="flex gap-6 pt-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      <span className="w-3 h-3 rounded-sm" style={{ background: '#8b5cf6' }} /> A ({aFrom} — {aTo})
                    </div>
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      <span className="w-3 h-3 rounded-sm" style={{ background: '#f59e0b' }} /> B ({bFrom} — {bTo})
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Empty state */}
          {!statsA && !statsB && !compareLoading && (
            <div className="glass-card rounded-2xl p-12 text-center">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Выберите периоды и нажмите «Сравнить»
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
