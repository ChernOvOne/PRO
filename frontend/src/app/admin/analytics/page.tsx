'use client'

import { useEffect, useState } from 'react'
import {
  TrendingUp, Users, DollarSign, Activity,
  ArrowUpRight, ArrowDownRight, Calendar,
} from 'lucide-react'
import { adminApi } from '@/lib/api'
import { Card, Skeleton, Badge } from '@/components/ui'

interface AnalyticsData {
  totalUsers:      number
  activeUsers:     number
  totalRevenue:    number
  todayRevenue:    number
  pendingPayments: number
  revenueChart:    Array<{ date: string; amount: number }>
  remnawave:       Record<string, unknown> | null
}

export default function AdminAnalytics() {
  const [data,    setData]    = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminApi.stats()
      .then(d => { setData(d); setLoading(false) })
  }, [])

  if (loading) return <AnalyticsSkeleton />
  if (!data)   return null

  const maxRev  = Math.max(...data.revenueChart.map(d => Number(d.amount)), 1)
  const totalRevChart = data.revenueChart.reduce((s, d) => s + Number(d.amount), 0)
  const avgDaily = data.revenueChart.length > 0
    ? totalRevChart / data.revenueChart.length
    : 0

  // Group revenue by week for week-over-week
  const weeks = data.revenueChart.reduce<number[]>((acc, _, i) => {
    const wk = Math.floor(i / 7)
    acc[wk] = (acc[wk] || 0) + Number(data.revenueChart[i].amount)
    return acc
  }, [])
  const weekChange = weeks.length >= 2
    ? ((weeks[weeks.length - 1] - weeks[weeks.length - 2]) / Math.max(weeks[weeks.length - 2], 1)) * 100
    : 0

  const activePct = data.totalUsers
    ? Math.round((data.activeUsers / data.totalUsers) * 100)
    : 0

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Аналитика</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Последние 30 дней</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Users}
          label="Всего пользователей"
          value={data.totalUsers.toLocaleString('ru')}
          sub={`${data.activeUsers} активных · ${activePct}%`}
          color="blue"
        />
        <KpiCard
          icon={Activity}
          label="Активных сейчас"
          value={data.activeUsers.toLocaleString('ru')}
          sub={`${100 - activePct}% без подписки`}
          color="emerald"
          trend={activePct}
        />
        <KpiCard
          icon={DollarSign}
          label="Сегодня"
          value={`${data.todayRevenue.toLocaleString('ru')} ₽`}
          sub={`Среднее: ${Math.round(avgDaily).toLocaleString('ru')} ₽/день`}
          color="amber"
        />
        <KpiCard
          icon={TrendingUp}
          label="За 30 дней"
          value={`${Math.round(totalRevChart).toLocaleString('ru')} ₽`}
          sub={weekChange !== 0
            ? `${weekChange >= 0 ? '+' : ''}${weekChange.toFixed(1)}% vs прошлая неделя`
            : undefined}
          color="purple"
          trend={weekChange}
        />
      </div>

      {/* Revenue chart */}
      <Card className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Выручка по дням (₽)</h2>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            <Calendar className="w-3.5 h-3.5" />
            30 дней
          </div>
        </div>

        {data.revenueChart.length > 0 ? (
          <div className="space-y-3">
            {/* Chart bars */}
            <div className="flex items-end gap-1 h-48 pt-4">
              {data.revenueChart.map((d, i) => {
                const pct = (Number(d.amount) / maxRev) * 100
                const date = new Date(d.date)
                const isWeekend = date.getDay() === 0 || date.getDay() === 6
                return (
                  <div key={i} className="group flex-1 flex flex-col items-center gap-1 relative">
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2
                                    opacity-0 group-hover:opacity-100 transition-opacity z-10
                                    rounded-lg px-2 py-1.5
                                    pointer-events-none whitespace-nowrap text-center"
                         style={{ background: 'var(--surface-2)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--glass-border)' }}>
                      <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                        {Number(d.amount).toLocaleString('ru')} ₽
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {date.toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <div
                      className={`w-full rounded-t-sm transition-colors
                                  ${isWeekend ? 'bg-cyan-600/40 hover:bg-cyan-500/60' : 'bg-cyan-600/70 hover:bg-cyan-500'}`}
                      style={{ height: `${Math.max(pct, 1)}%`, minHeight: pct > 0 ? 3 : 1 }}
                    />
                  </div>
                )
              })}
            </div>

            {/* X axis labels — show every 5th */}
            <div className="flex gap-1">
              {data.revenueChart.map((d, i) => (
                <div key={i} className="flex-1 text-center">
                  {i % 5 === 0 && (
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(d.date).toLocaleDateString('ru', { day: 'numeric', month: 'numeric' })}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Нет данных за период
          </div>
        )}

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-4 pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
          {[
            { label: 'Итого за период', value: `${Math.round(totalRevChart).toLocaleString('ru')} ₽` },
            { label: 'Среднее в день',  value: `${Math.round(avgDaily).toLocaleString('ru')} ₽` },
            { label: 'Лучший день',     value: `${Math.round(maxRev).toLocaleString('ru')} ₽` },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
              <p className="font-semibold mt-0.5" style={{ color: 'var(--text-primary)' }}>{value}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Conversion + REMNAWAVE */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Conversion funnel */}
        <Card className="space-y-4">
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Воронка конверсии</h2>
          <div className="space-y-3">
            {[
              { label: 'Зарегистрировались', value: data.totalUsers,  pct: 100 },
              { label: 'Имеют подписку',      value: data.activeUsers, pct: activePct },
              {
                label: 'Оплатили сегодня',
                value: data.todayRevenue > 0 ? '≥1' : 0,
                pct:   data.todayRevenue > 0 ? Math.min(activePct, 15) : 0,
              },
            ].map(({ label, value, pct }) => (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{value}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: 'linear-gradient(90deg, rgba(6,182,212,0.8), rgba(6,182,212,0.5))' }}
                  />
                </div>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{pct}%</p>
              </div>
            ))}
          </div>
        </Card>

        {/* REMNAWAVE node status */}
        <Card className="space-y-4">
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Состояние REMNAWAVE</h2>
          {data.remnawave ? (
            <>
              <div className="flex items-center gap-2 p-3 bg-emerald-500/10
                              border border-emerald-500/20 rounded-xl">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                <span className="text-emerald-400 text-sm font-medium">Panel онлайн</span>
              </div>
              <div className="space-y-2">
                {Object.entries(data.remnawave).slice(0, 8).map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center py-1.5 last:border-0"
                       style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <span className="text-sm capitalize" style={{ color: 'var(--text-tertiary)' }}>
                      {k.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs font-mono max-w-[180px] truncate text-right" style={{ color: 'var(--text-primary)' }}>
                      {String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 p-4 bg-red-500/10
                            border border-red-500/20 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
              <div>
                <p className="text-red-400 text-sm font-medium">Panel недоступен</p>
                <p className="text-red-500/60 text-xs mt-0.5">
                  Проверь REMNAWAVE_URL и REMNAWAVE_TOKEN в .env
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Pending payments */}
      {data.pendingPayments > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/10 border
                        border-amber-500/20 rounded-2xl">
          <Activity className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-amber-300 text-sm">
              {data.pendingPayments} платежей ожидают подтверждения
            </p>
            <p className="text-xs text-amber-500/70 mt-0.5">
              Вебхуки могут задерживаться. Платежи подтвердятся автоматически.
            </p>
          </div>
          <a href="/admin/payments" className="btn-secondary text-sm py-1.5">
            Смотреть →
          </a>
        </div>
      )}
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, sub, color, trend }: {
  icon: any; label: string; value: string; sub?: string; color: string; trend?: number
}) {
  const colors: Record<string, string> = {
    blue:    'bg-blue-500/15 text-blue-400',
    emerald: 'bg-emerald-500/15 text-emerald-400',
    amber:   'bg-amber-500/15 text-amber-400',
    purple:  'bg-purple-500/15 text-purple-400',
  }
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend !== undefined && trend !== 0 && (
          <div className={`flex items-center gap-0.5 text-xs font-medium
                           ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend >= 0
              ? <ArrowUpRight className="w-3.5 h-3.5" />
              : <ArrowDownRight className="w-3.5 h-3.5" />}
            {Math.abs(trend).toFixed(0)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
        <p className="text-2xl font-bold mt-0.5 tracking-tight" style={{ color: 'var(--text-primary)' }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>}
      </div>
    </Card>
  )
}

function AnalyticsSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-pulse">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_,i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
      <div className="grid md:grid-cols-2 gap-6">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </div>
  )
}
