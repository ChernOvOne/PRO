'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, DollarSign, TrendingUp, Activity,
         ArrowUpRight, Clock, Shield, Package,
         CreditCard, BookOpen } from 'lucide-react'

interface Stats {
  totalUsers:      number
  activeUsers:     number
  totalRevenue:    number
  todayRevenue:    number
  pendingPayments: number
  remnawave:       any
  revenueChart:    Array<{ date: string; amount: number }>
}

export default function AdminDashboard() {
  const [stats, setStats]     = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/stats', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false) })
  }, [])

  if (loading) return <AdminSkeleton />
  if (!stats)  return null

  const maxRev = Math.max(...stats.revenueChart.map(d => Number(d.amount)), 1)
  const convRate = stats.totalUsers > 0 ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : 0

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="animate-slide-up">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          <span className="text-gradient">Панель управления</span>
        </h1>
        <p className="mt-1" style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          {new Date().toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Main stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 stagger">
        <AdminStatCard
          icon={<Users className="w-[18px] h-[18px]" />}
          label="Пользователи"
          value={stats.totalUsers.toLocaleString('ru')}
          sub={`${stats.activeUsers} активных`}
          gradient="linear-gradient(135deg, rgba(6,182,212,0.12), rgba(6,182,212,0.04))"
          borderColor="rgba(6,182,212,0.2)"
          iconColor="#22d3ee"
        />
        <AdminStatCard
          icon={<Activity className="w-[18px] h-[18px]" />}
          label="Конверсия"
          value={`${convRate}%`}
          sub={`${stats.activeUsers} подписчиков`}
          gradient="linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))"
          borderColor="rgba(16,185,129,0.2)"
          iconColor="#34d399"
        />
        <AdminStatCard
          icon={<DollarSign className="w-[18px] h-[18px]" />}
          label="Выручка сегодня"
          value={`${stats.todayRevenue.toLocaleString('ru')} ₽`}
          gradient="linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04))"
          borderColor="rgba(245,158,11,0.2)"
          iconColor="#fbbf24"
        />
        <AdminStatCard
          icon={<TrendingUp className="w-[18px] h-[18px]" />}
          label="Всего выручка"
          value={`${stats.totalRevenue.toLocaleString('ru')} ₽`}
          sub={stats.pendingPayments ? `${stats.pendingPayments} ожидают` : undefined}
          gradient="linear-gradient(135deg, rgba(139,92,246,0.12), rgba(139,92,246,0.04))"
          borderColor="rgba(139,92,246,0.2)"
          iconColor="#a78bfa"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
        {/* Revenue chart */}
        <div className="lg:col-span-2 glass-card animate-slide-up" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Выручка за 30 дней</h2>
            <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
              {stats.totalRevenue.toLocaleString('ru')} ₽ всего
            </span>
          </div>
          {stats.revenueChart.length > 0 ? (
            <div className="flex items-end gap-[3px] h-44">
              {stats.revenueChart.map((d, i) => {
                const h = (Number(d.amount) / maxRev) * 100
                return (
                  <div key={i} className="group flex-1 flex flex-col items-center justify-end cursor-pointer relative">
                    {/* Tooltip */}
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10"
                         style={{ background: 'var(--surface-3)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>
                      {Number(d.amount).toLocaleString('ru')} ₽
                    </div>
                    <div className="w-full rounded-t-sm transition-all duration-200 group-hover:opacity-100"
                         style={{
                           height: `${Math.max(h, 2)}%`,
                           background: h > 60
                             ? 'linear-gradient(to top, #06b6d4, #8b5cf6)'
                             : h > 30
                               ? 'linear-gradient(to top, rgba(6,182,212,0.6), rgba(139,92,246,0.6))'
                               : 'rgba(6,182,212,0.3)',
                           opacity: 0.7,
                         }} />
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="h-44 flex items-center justify-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Нет данных за этот период
            </div>
          )}
        </div>

        {/* REMNAWAVE status */}
        <div className="glass-card animate-slide-up" style={{ animationDelay: '200ms' }}>
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>REMNAWAVE</h2>
          {stats.remnawave ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                   style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}>
                <span className="glow-dot text-emerald-400" />
                <span className="text-xs font-medium text-emerald-400">Онлайн</span>
              </div>
              <div className="space-y-2.5 mt-3">
                {Object.entries(stats.remnawave).slice(0, 6).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="capitalize" style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
                      {k.replace(/_/g, ' ')}
                    </span>
                    <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                 style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-xs text-red-400">Недоступен</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="glass-card animate-slide-up" style={{ animationDelay: '300ms' }}>
        <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Быстрые действия</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { href: '/admin/users',        icon: Users,       label: 'Пользователи' },
            { href: '/admin/tariffs',       icon: Package,     label: 'Тарифы' },
            { href: '/admin/instructions',  icon: BookOpen,    label: 'Инструкции' },
            { href: '/admin/payments',      icon: CreditCard,  label: 'Платежи' },
          ].map(({ href, icon: Icon, label }) => (
            <Link key={href} href={href}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all duration-200 group"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)' }}>
              <Icon className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              <span style={{ color: 'var(--text-secondary)' }}
                    className="group-hover:text-[var(--text-primary)] transition-colors">
                {label}
              </span>
              <ArrowUpRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ color: 'var(--text-tertiary)' }} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function AdminStatCard({ icon, label, value, sub, gradient, borderColor, iconColor }: {
  icon: React.ReactNode; label: string; value: string; sub?: string
  gradient: string; borderColor: string; iconColor: string
}) {
  return (
    <div className="rounded-2xl p-5 transition-all duration-300 animate-scale-in hover:-translate-y-0.5"
         style={{ background: gradient, border: `1px solid ${borderColor}` }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
             style={{ background: 'rgba(255,255,255,0.06)', color: iconColor }}>
          {icon}
        </div>
      </div>
      <p className="text-[11px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </p>
      <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>}
    </div>
  )
}

function AdminSkeleton() {
  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="space-y-2">
        <div className="h-8 skeleton w-48" />
        <div className="h-4 skeleton w-36" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-32 skeleton rounded-2xl" />)}
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-64 skeleton rounded-2xl" />
        <div className="h-64 skeleton rounded-2xl" />
      </div>
    </div>
  )
}
