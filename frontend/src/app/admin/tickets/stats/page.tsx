'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BarChart2, Clock, CheckCircle, MessageCircle, AlertCircle,
  TrendingUp, Users, Star, ArrowLeft, Loader2,
} from 'lucide-react'

interface Analytics {
  statuses: { open: number; pending: number; resolved: number; closed: number }
  urgent: number
  unassigned: number
  periodCounts: { today: number; week: number; month: number }
  resolvedCounts: { week: number; month: number }
  avgFirstResponseMins: number
  avgResolutionHours: number
  avgRating: number | null
  byCategory: Array<{ category: string; count: number }>
  adminLoad: Array<{ adminId: string; name: string; avatarColor: string; resolvedCount: number }>
  dailySeries: Array<{ date: string; created: number; resolved: number }>
}

const CATEGORY_LABELS: Record<string, string> = {
  BILLING: '💰 Платежи',
  TECH: '🔧 Техника',
  REFUND: '↩️ Возврат',
  SUBSCRIPTION: '📱 Подписка',
  OTHER: '❓ Другое',
}

function formatMins(min: number) {
  if (min < 1) return '< 1 мин'
  if (min < 60) return `${min} мин`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}ч ${m}м`
}

function formatShortDate(s: string) {
  return new Date(s).toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })
}

export default function TicketsStatsPage() {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/tickets/analytics/overview', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-20" style={{ color: 'var(--text-tertiary)' }}>
        Нет данных
      </div>
    )
  }

  const totalByDays = data.dailySeries.reduce((s, r) => s + r.created, 0)
  const maxDaily = Math.max(1, ...data.dailySeries.map(r => Math.max(r.created, r.resolved)))
  const totalByCat = data.byCategory.reduce((s, r) => s + r.count, 0)

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/admin/tickets"
          className="p-2 rounded-lg transition hover:bg-white/[0.05]"
          style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <BarChart2 className="w-6 h-6" />
            Аналитика поддержки
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            За последние 30 дней
          </p>
        </div>
      </div>

      {/* Top KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={<Clock className="w-4 h-4" />} label="Открыто сейчас" value={data.statuses.open + data.statuses.pending} color="#60a5fa" sub={`Срочных: ${data.urgent}`} />
        <KpiCard icon={<MessageCircle className="w-4 h-4" />} label="Создано за месяц" value={data.periodCounts.month} color="#a78bfa" sub={`Сегодня: ${data.periodCounts.today}`} />
        <KpiCard icon={<CheckCircle className="w-4 h-4" />} label="Решено за месяц" value={data.resolvedCounts.month} color="#34d399" sub={`За неделю: ${data.resolvedCounts.week}`} />
        <KpiCard
          icon={<Star className="w-4 h-4" />}
          label="Средняя оценка"
          value={data.avgRating ? `${data.avgRating}/5` : '—'}
          color="#fbbf24"
          sub={data.avgRating ? '⭐'.repeat(Math.round(data.avgRating)) : 'Нет оценок'}
        />
      </div>

      {/* SLA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="glass-card rounded-2xl p-5">
          <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-tertiary)' }}>
            Время первого ответа
          </h3>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold" style={{ color: data.avgFirstResponseMins <= 15 ? '#34d399' : data.avgFirstResponseMins <= 60 ? '#fbbf24' : '#f87171' }}>
              {formatMins(data.avgFirstResponseMins)}
            </span>
            <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              SLA: 15 мин
            </span>
          </div>
          <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, (15 / Math.max(data.avgFirstResponseMins, 1)) * 100)}%`,
                background: data.avgFirstResponseMins <= 15 ? '#34d399' : '#fbbf24',
              }}
            />
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5">
          <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-tertiary)' }}>
            Среднее время решения
          </h3>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {data.avgResolutionHours} ч
            </span>
            <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              SLA: 4 часа
            </span>
          </div>
          <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, (4 / Math.max(data.avgResolutionHours, 0.1)) * 100)}%`,
                background: data.avgResolutionHours <= 4 ? '#34d399' : '#fbbf24',
              }}
            />
          </div>
        </div>
      </div>

      {/* Status breakdown */}
      <div className="glass-card rounded-2xl p-5">
        <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-tertiary)' }}>
          Статусы
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatusCard label="Открытых" count={data.statuses.open} color="#60a5fa" />
          <StatusCard label="В работе" count={data.statuses.pending} color="#fbbf24" />
          <StatusCard label="Решённых" count={data.statuses.resolved} color="#34d399" />
          <StatusCard label="Закрытых" count={data.statuses.closed} color="#9ca3af" />
        </div>
        {data.unassigned > 0 && (
          <div className="mt-3 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
            ⚠️ Без назначенного админа: {data.unassigned}
          </div>
        )}
      </div>

      {/* Daily chart */}
      {data.dailySeries.length > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-tertiary)' }}>
            Динамика за 30 дней
          </h3>
          <div className="flex items-end gap-1 h-32">
            {data.dailySeries.map(r => (
              <div key={r.date} className="flex-1 flex flex-col justify-end gap-px group relative" title={`${formatShortDate(r.date)}: создано ${r.created}, решено ${r.resolved}`}>
                <div
                  className="rounded-t transition-all"
                  style={{
                    height: `${(r.created / maxDaily) * 100}%`,
                    background: '#60a5fa',
                    minHeight: r.created > 0 ? '2px' : '0',
                  }}
                />
                <div
                  className="rounded-b transition-all"
                  style={{
                    height: `${(r.resolved / maxDaily) * 100}%`,
                    background: '#34d399',
                    minHeight: r.resolved > 0 ? '2px' : '0',
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            <span><span className="inline-block w-3 h-3 rounded mr-1" style={{ background: '#60a5fa' }}></span>Создано: {totalByDays}</span>
            <span><span className="inline-block w-3 h-3 rounded mr-1" style={{ background: '#34d399' }}></span>Решено: {data.dailySeries.reduce((s, r) => s + r.resolved, 0)}</span>
          </div>
        </div>
      )}

      {/* Categories + Admins */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="glass-card rounded-2xl p-5">
          <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-tertiary)' }}>
            По категориям
          </h3>
          {data.byCategory.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Нет данных</p>
          )}
          <div className="space-y-2">
            {data.byCategory.map(c => {
              const pct = totalByCat > 0 ? (c.count / totalByCat) * 100 : 0
              return (
                <div key={c.category}>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {CATEGORY_LABELS[c.category] || c.category}
                    </span>
                    <span style={{ color: 'var(--text-primary)' }}>{c.count} ({Math.round(pct)}%)</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: 'var(--accent-1)' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-tertiary)' }}>
            Нагрузка админов (решено)
          </h3>
          {data.adminLoad.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Нет данных</p>
          )}
          <div className="space-y-2">
            {data.adminLoad.map(a => {
              const topCount = data.adminLoad[0]?.resolvedCount || 1
              return (
                <div key={a.adminId} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                    style={{ background: a.avatarColor, color: '#fff' }}
                  >
                    {a.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{a.name}</div>
                    <div className="h-1.5 rounded-full overflow-hidden mt-0.5" style={{ background: 'var(--surface-2)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(a.resolvedCount / topCount) * 100}%`, background: '#34d399' }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {a.resolvedCount}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value, color, sub }: { icon: React.ReactNode; label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}20`, color }}
        >
          {icon}
        </div>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      </div>
      <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>}
    </div>
  )
}

function StatusCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="text-center p-3 rounded-xl" style={{ background: `${color}10`, border: `1px solid ${color}30` }}>
      <p className="text-2xl font-bold" style={{ color }}>{count}</p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
    </div>
  )
}
