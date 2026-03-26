'use client'

import { useEffect, useState } from 'react'
import { Users, DollarSign, TrendingUp, Activity,
         ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react'

interface Stats {
  totalUsers:     number
  activeUsers:    number
  totalRevenue:   number
  todayRevenue:   number
  pendingPayments: number
  remnawave:      any
  revenueChart:   Array<{ date: string; amount: number }>
}

export default function AdminDashboard() {
  const [stats, setStats]   = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/stats', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false) })
  }, [])

  if (loading) return <AdminSkeleton />
  if (!stats)  return null

  const maxRev = Math.max(...stats.revenueChart.map(d => Number(d.amount)), 1)

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Дашборд</h1>
        <p className="text-gray-400 mt-1 text-sm">
          {new Date().toLocaleDateString('ru', { weekday:'long', day:'numeric', month:'long' })}
        </p>
      </div>

      {/* Main stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users}       label="Всего пользователей" value={stats.totalUsers}
                  sub={`${stats.activeUsers} активных`}         color="blue" />
        <StatCard icon={Activity}    label="Активные подписки"   value={stats.activeUsers}
                  sub={`${Math.round(stats.activeUsers/Math.max(stats.totalUsers,1)*100)}% от всех`}
                  color="emerald" />
        <StatCard icon={DollarSign}  label="Выручка сегодня"     value={`${stats.todayRevenue.toLocaleString('ru')} ₽`}
                  color="amber" />
        <StatCard icon={TrendingUp}  label="Всего выручка"       value={`${stats.totalRevenue.toLocaleString('ru')} ₽`}
                  sub={stats.pendingPayments ? `${stats.pendingPayments} ожидают` : undefined}
                  color="purple" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Revenue chart */}
        <div className="lg:col-span-2 card space-y-4">
          <h2 className="font-semibold">Выручка за 30 дней</h2>
          {stats.revenueChart.length > 0 ? (
            <div className="flex items-end gap-1 h-40">
              {stats.revenueChart.map((d, i) => (
                <div key={i} className="group flex-1 flex flex-col items-center gap-1"
                     title={`${d.date}: ${Number(d.amount).toLocaleString('ru')} ₽`}>
                  <div
                    className="w-full bg-brand-600/60 hover:bg-brand-500 rounded-t transition-colors"
                    style={{ height: `${(Number(d.amount) / maxRev) * 100}%`, minHeight: 2 }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-gray-600 text-sm">
              Нет данных за этот период
            </div>
          )}
          <p className="text-xs text-gray-500">Наведи на столбец для просмотра суммы</p>
        </div>

        {/* REMNAWAVE status */}
        <div className="card space-y-4">
          <h2 className="font-semibold">REMNAWAVE</h2>
          {stats.remnawave ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-400 text-sm font-medium">Онлайн</span>
              </div>
              {Object.entries(stats.remnawave).slice(0, 6).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-gray-500 capitalize">{k.replace(/_/g,' ')}</span>
                  <span className="text-gray-300 font-mono text-xs">{String(v)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-red-400 text-sm">Недоступен</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Быстрые действия</h2>
        <div className="flex flex-wrap gap-3">
          {[
            { href:'/admin/users',        label:'Управление пользователями' },
            { href:'/admin/tariffs',       label:'Редактировать тарифы' },
            { href:'/admin/instructions',  label:'Добавить инструкцию' },
            { href:'/admin/payments',      label:'История платежей' },
          ].map(({ href, label }) => (
            <a key={href} href={href}
               className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700
                          border border-gray-700 rounded-xl text-sm transition-colors">
              {label} <ArrowUpRight className="w-3.5 h-3.5 text-gray-500" />
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string
}) {
  const cl: Record<string, string> = {
    blue:    'bg-blue-500/15 text-blue-400',
    emerald: 'bg-emerald-500/15 text-emerald-400',
    amber:   'bg-amber-500/15 text-amber-400',
    purple:  'bg-purple-500/15 text-purple-400',
  }
  return (
    <div className="card p-5 space-y-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cl[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-2xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function AdminSkeleton() {
  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-pulse">
      <div className="h-8 skeleton w-32" />
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
