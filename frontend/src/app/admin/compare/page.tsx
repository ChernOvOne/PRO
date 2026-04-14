'use client'

import { useState, useCallback } from 'react'
import {
  ArrowUpRight, ArrowDownRight, TrendingUp, BarChart3,
  Calendar, RefreshCw, AlertCircle, Minus,
} from 'lucide-react'
import { adminApi } from '@/lib/api'
import toast from 'react-hot-toast'

/* ── Helpers ───────────────────────────────────────────────── */

function fmtMoney(n: number) {
  return new Intl.NumberFormat('ru-RU').format(n) + ' \u20BD'
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function dateISO(d: Date) {
  return d.toISOString().slice(0, 10)
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function startOfQuarter(d: Date) {
  const q = Math.floor(d.getMonth() / 3) * 3
  return new Date(d.getFullYear(), q, 1)
}

function endOfQuarter(d: Date) {
  const q = Math.floor(d.getMonth() / 3) * 3
  return new Date(d.getFullYear(), q + 3, 0)
}

/* ── Types ─────────────────────────────────────────────────── */

interface Transaction {
  id: string
  type: 'INCOME' | 'EXPENSE'
  amount: number
  source?: string | null
  category?: { id: string; name: string; color: string } | null
}

interface PeriodStats {
  income: number
  expense: number
  profit: number
  count: number
  byCategory: Record<string, { name: string; color: string; amount: number }>
}

interface Preset {
  label: string
  aFrom: () => string
  aTo: () => string
  bFrom: () => string
  bTo: () => string
}

/* ── Presets ───────────────────────────────────────────────── */

const PRESETS: Preset[] = [
  {
    label: 'Этот месяц vs Прошлый месяц',
    aFrom: () => dateISO(startOfMonth(new Date())),
    aTo:   () => todayISO(),
    bFrom: () => {
      const d = new Date(); d.setMonth(d.getMonth() - 1)
      return dateISO(startOfMonth(d))
    },
    bTo: () => {
      const d = new Date(); d.setMonth(d.getMonth() - 1)
      return dateISO(endOfMonth(d))
    },
  },
  {
    label: 'Этот квартал vs Прошлый квартал',
    aFrom: () => dateISO(startOfQuarter(new Date())),
    aTo:   () => todayISO(),
    bFrom: () => {
      const d = new Date(); d.setMonth(d.getMonth() - 3)
      return dateISO(startOfQuarter(d))
    },
    bTo: () => {
      const d = new Date(); d.setMonth(d.getMonth() - 3)
      return dateISO(endOfQuarter(d))
    },
  },
  {
    label: 'Этот год vs Прошлый год',
    aFrom: () => `${new Date().getFullYear()}-01-01`,
    aTo:   () => todayISO(),
    bFrom: () => `${new Date().getFullYear() - 1}-01-01`,
    bTo:   () => `${new Date().getFullYear() - 1}-12-31`,
  },
]

/* ── Compute stats from transactions ─────────────────────── */

function computeStats(items: Transaction[]): PeriodStats {
  let income = 0, expense = 0
  const byCategory: PeriodStats['byCategory'] = {}

  for (const t of items) {
    const amount = Number(t.amount) || 0
    // Exclude investment-sourced expenses — they're paid from investor money, not company
    if (t.type === 'EXPENSE' && t.source === 'investment') continue

    if (t.type === 'INCOME') income += amount
    else expense += amount

    if (t.type === 'EXPENSE' && t.category) {
      const key = t.category.id
      if (!byCategory[key]) {
        byCategory[key] = { name: t.category.name, color: t.category.color, amount: 0 }
      }
      byCategory[key].amount += amount
    }
  }

  return { income, expense, profit: income - expense, count: items.length, byCategory }
}

/* ── Component ────────────────────────────────────────────── */

export default function AdminComparePage() {
  /* Period A */
  const [aFrom, setAFrom] = useState(() => dateISO(startOfMonth(new Date())))
  const [aTo, setATo]     = useState(todayISO())

  /* Period B */
  const [bFrom, setBFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1)
    return dateISO(startOfMonth(d))
  })
  const [bTo, setBTo] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1)
    return dateISO(endOfMonth(d))
  })

  const [statsA, setStatsA] = useState<PeriodStats | null>(null)
  const [statsB, setStatsB] = useState<PeriodStats | null>(null)
  const [loading, setLoading] = useState(false)

  /* ── Apply preset ────────────────────────────── */

  function applyPreset(p: Preset) {
    setAFrom(p.aFrom()); setATo(p.aTo())
    setBFrom(p.bFrom()); setBTo(p.bTo())
    setStatsA(null); setStatsB(null)
  }

  /* ── Fetch both periods ──────────────────────── */

  const compare = useCallback(async () => {
    if (!aFrom || !aTo || !bFrom || !bTo) {
      toast.error('Укажите все 4 даты')
      return
    }
    setLoading(true)
    try {
      const [resA, resB, totalsA, totalsB] = await Promise.all([
        adminApi.buhTransactions({ date_from: aFrom, date_to: aTo, limit: 10000 }),
        adminApi.buhTransactions({ date_from: bFrom, date_to: bTo, limit: 10000 }),
        adminApi.paymentTotals({ dateFrom: aFrom, dateTo: aTo }),
        adminApi.paymentTotals({ dateFrom: bFrom, dateTo: bTo }),
      ])
      const statsA_ = computeStats(resA.items ?? [])
      const statsB_ = computeStats(resB.items ?? [])
      // Add real revenue from Payments to income
      statsA_.income += Number(totalsA.revenue) || 0
      statsA_.profit = statsA_.income - statsA_.expense
      statsB_.income += Number(totalsB.revenue) || 0
      statsB_.profit = statsB_.income - statsB_.expense
      setStatsA(statsA_)
      setStatsB(statsB_)
    } catch {
      toast.error('Ошибка загрузки данных')
    } finally {
      setLoading(false)
    }
  }, [aFrom, aTo, bFrom, bTo])

  /* ── Delta helpers ───────────────────────────── */

  function delta(a: number, b: number) { return a - b }
  function deltaPct(a: number, b: number) {
    if (b === 0) return a === 0 ? 0 : 100
    return ((a - b) / Math.abs(b)) * 100
  }
  function fmtDelta(n: number) {
    const s = new Intl.NumberFormat('ru-RU').format(Math.abs(n)) + ' \u20BD'
    return n > 0 ? `+${s}` : n < 0 ? `-${s}` : s
  }
  function fmtPct(n: number) {
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%'
  }

  /* ── KPI rows ────────────────────────────────── */

  const kpiRows = statsA && statsB ? [
    { label: 'Доходы',             a: statsA.income,  b: statsB.income,  positive: true  },
    { label: 'Расходы',            a: statsA.expense, b: statsB.expense, positive: false },
    { label: 'Прибыль',            a: statsA.profit,  b: statsB.profit,  positive: true  },
    { label: 'Кол-во транзакций',  a: statsA.count,   b: statsB.count,   positive: true  },
  ] : []

  /* ── Merged category keys ────────────────────── */

  const allCatKeys = statsA && statsB
    ? [...new Set([...Object.keys(statsA.byCategory), ...Object.keys(statsB.byCategory)])]
    : []

  const maxCatAmount = statsA && statsB
    ? Math.max(
        ...allCatKeys.map(k => Math.max(
          statsA.byCategory[k]?.amount ?? 0,
          statsB.byCategory[k]?.amount ?? 0,
        )),
        1,
      )
    : 1

  /* ── Render ──────────────────────────────────── */

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Сравнение периодов
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Сравните финансовые показатели двух временных интервалов
        </p>
      </div>

      {/* Quick presets */}
      <div className="flex gap-2 flex-wrap">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:scale-[1.02]"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Period selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Period A */}
        <div className="rounded-2xl p-5 space-y-3"
             style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: 'var(--accent-1)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Период A</h3>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            <Calendar className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <input type="date" className="glass-input py-1.5 px-3 text-sm w-auto"
                   value={aFrom} onChange={e => setAFrom(e.target.value)} />
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>&mdash;</span>
            <input type="date" className="glass-input py-1.5 px-3 text-sm w-auto"
                   value={aTo} onChange={e => setATo(e.target.value)} />
          </div>
        </div>

        {/* Period B */}
        <div className="rounded-2xl p-5 space-y-3"
             style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: '#f59e0b' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Период B</h3>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            <Calendar className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <input type="date" className="glass-input py-1.5 px-3 text-sm w-auto"
                   value={bFrom} onChange={e => setBFrom(e.target.value)} />
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>&mdash;</span>
            <input type="date" className="glass-input py-1.5 px-3 text-sm w-auto"
                   value={bTo} onChange={e => setBTo(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Compare button */}
      <button onClick={compare} disabled={loading}
              className="btn-primary inline-flex items-center gap-2 text-sm">
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Загрузка...
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4" />
            Сравнить
          </>
        )}
      </button>

      {/* Results */}
      {statsA && statsB && (
        <>
          {/* KPI comparison table */}
          <div className="rounded-2xl overflow-hidden"
               style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    {['Показатель', 'Период A', 'Период B', 'Разница', '%'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-xs whitespace-nowrap"
                          style={{ color: 'var(--text-tertiary)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {kpiRows.map(row => {
                    const d  = delta(row.a, row.b)
                    const dp = deltaPct(row.a, row.b)
                    const isMoney = row.label !== 'Кол-во транзакций'
                    /* For income/profit: positive delta = green. For expense: positive delta = red (more spend is bad). */
                    const deltaGood = row.positive ? d >= 0 : d <= 0
                    const deltaColor = d === 0 ? 'var(--text-tertiary)' : deltaGood ? '#34d399' : '#f87171'

                    return (
                      <tr key={row.label}
                          className="hover:bg-white/[0.03] transition-colors"
                          style={{ borderBottom: '1px solid var(--glass-border)' }}>
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                          {row.label}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                          {isMoney ? fmtMoney(row.a) : row.a}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                          {isMoney ? fmtMoney(row.b) : row.b}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold" style={{ color: deltaColor }}>
                          {d === 0 ? <Minus className="w-4 h-4 inline" /> : (
                            <>
                              {d > 0
                                ? <ArrowUpRight className="w-3.5 h-3.5 inline mr-0.5" />
                                : <ArrowDownRight className="w-3.5 h-3.5 inline mr-0.5" />}
                              {isMoney ? fmtDelta(d) : (d > 0 ? '+' : '') + d}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-medium" style={{ color: deltaColor }}>
                          {d === 0 ? '0%' : fmtPct(dp)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Category breakdown */}
          {allCatKeys.length > 0 && (
            <div className="rounded-2xl p-5 space-y-4"
                 style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Расходы по категориям
                </h3>
              </div>

              <div className="space-y-4">
                {allCatKeys
                  .sort((a, b) => {
                    const maxA = Math.max(statsA.byCategory[a]?.amount ?? 0, statsB.byCategory[a]?.amount ?? 0)
                    const maxB = Math.max(statsA.byCategory[b]?.amount ?? 0, statsB.byCategory[b]?.amount ?? 0)
                    return maxB - maxA
                  })
                  .map(key => {
                    const catA = statsA.byCategory[key]
                    const catB = statsB.byCategory[key]
                    const name  = catA?.name ?? catB?.name ?? 'Без категории'
                    const color = catA?.color ?? catB?.color ?? '#6b7280'
                    const amtA  = catA?.amount ?? 0
                    const amtB  = catB?.amount ?? 0
                    const pctA  = (amtA / maxCatAmount) * 100
                    const pctB  = (amtB / maxCatAmount) * 100

                    return (
                      <div key={key} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ background: color }} />
                            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{name}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-1)' }} />
                              {fmtMoney(amtA)}
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full" style={{ background: '#f59e0b' }} />
                              {fmtMoney(amtB)}
                            </span>
                          </div>
                        </div>
                        {/* Bar A (purple) */}
                        <div className="h-2 rounded-full overflow-hidden"
                             style={{ background: 'rgba(6,182,212,0.08)' }}>
                          <div className="h-full rounded-full transition-all duration-500"
                               style={{ width: `${pctA}%`, background: 'var(--accent-1)' }} />
                        </div>
                        {/* Bar B (amber) */}
                        <div className="h-2 rounded-full overflow-hidden"
                             style={{ background: 'rgba(245,158,11,0.08)' }}>
                          <div className="h-full rounded-full transition-all duration-500"
                               style={{ width: `${pctB}%`, background: '#f59e0b' }} />
                        </div>
                      </div>
                    )
                  })}
              </div>

              {/* Legend */}
              <div className="flex gap-6 pt-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <span className="w-3 h-3 rounded-sm" style={{ background: 'var(--accent-1)' }} />
                  Период A ({aFrom} — {aTo})
                </div>
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <span className="w-3 h-3 rounded-sm" style={{ background: '#f59e0b' }} />
                  Период B ({bFrom} — {bTo})
                </div>
              </div>
            </div>
          )}

          {/* Empty categories */}
          {allCatKeys.length === 0 && (
            <div className="rounded-2xl p-8 text-center"
                 style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Нет расходов по категориям для сравнения
              </p>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard
              icon={<ArrowUpRight className="w-4 h-4" />}
              label="Доходы (A / B)"
              valueA={fmtMoney(statsA.income)}
              valueB={fmtMoney(statsB.income)}
              color="#34d399"
            />
            <SummaryCard
              icon={<ArrowDownRight className="w-4 h-4" />}
              label="Расходы (A / B)"
              valueA={fmtMoney(statsA.expense)}
              valueB={fmtMoney(statsB.expense)}
              color="#f87171"
            />
            <SummaryCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Прибыль (A / B)"
              valueA={fmtMoney(statsA.profit)}
              valueB={fmtMoney(statsB.profit)}
              color="#8b5cf6"
            />
          </div>
        </>
      )}

      {/* Empty state */}
      {!statsA && !statsB && !loading && (
        <div className="rounded-2xl p-12 text-center"
             style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
          <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: 'var(--text-tertiary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Выберите периоды и нажмите &laquo;Сравнить&raquo;
          </p>
        </div>
      )}
    </div>
  )
}

/* ── Summary Card ─────────────────────────────────────────── */

function SummaryCard({ icon, label, valueA, valueB, color }: {
  icon: React.ReactNode; label: string; valueA: string; valueB: string; color: string
}) {
  return (
    <div className="rounded-2xl p-4 flex items-center gap-3"
         style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center"
           style={{ background: `${color}15`, color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {valueA}
          <span className="mx-1 font-normal" style={{ color: 'var(--text-tertiary)' }}>/</span>
          {valueB}
        </p>
      </div>
    </div>
  )
}
