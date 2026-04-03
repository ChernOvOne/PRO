'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Users, DollarSign, TrendingUp, TrendingDown, Activity,
  ArrowUpRight, Clock, Shield, Package, Wallet,
  CreditCard, BookOpen, Calendar, Star, AlertTriangle,
  Target, ArrowUp, ArrowDown, Minus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '@/lib/api'

// ── Types ────────────────────────────────────────────────────────

interface VpnStats {
  totalUsers:      number
  activeUsers:     number
  totalRevenue:    number
  todayRevenue:    number
  pendingPayments: number
  remnawave:       any
  revenueChart:    Array<{ date: string; amount: number }>
}

interface BuhDashboard {
  period: {
    income:       number
    expense:      number
    profit:       number
    avgPerDay:    number
    daysInPeriod: number
    bestDay?:     { date: string; amount: number }
  }
  balance:          number
  recentTransactions: Array<{
    id:          string
    type:        'income' | 'expense'
    amount:      number
    description: string
    date:        string
    category?:   string
  }>
  expenseByCategory: Array<{
    category:   string
    amount:     number
    color?:     string
    percentage: number
  }>
  incomeChart: Array<{
    date:   string
    amount: number
  }>
  partners: Array<{
    id:             string
    name:           string
    avatarColor?:   string
    remainingDebt:  number
    totalDividends: number
  }>
  serverWarnings: Array<{
    id:      string
    name:    string
    message: string
    level:   'warning' | 'critical'
  }>
  milestones: Array<{
    id:       string
    title:    string
    current:  number
    target:   number
    unit?:    string
  }>
}

type PeriodType = 'today' | 'month' | 'year' | 'custom'

// ── Helpers ──────────────────────────────────────────────────────

function fmt(amount: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(amount)) + ' \u20BD'
}

function fmtShort(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    return (amount / 1_000_000).toFixed(1).replace('.0', '') + 'M \u20BD'
  }
  if (Math.abs(amount) >= 1_000) {
    return (amount / 1_000).toFixed(1).replace('.0', '') + 'K \u20BD'
  }
  return fmt(amount)
}

function formatDateRu(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function formatMb(bytes: number): string {
  return Math.round(bytes / 1024 / 1024).toLocaleString('ru')
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}\u0434 ${h}\u0447`
  if (h > 0) return `${h}\u0447 ${m}\u043C`
  return `${m}\u043C`
}

function formatTb(bytes: string | number): string {
  const num = typeof bytes === 'string' ? parseFloat(bytes) : bytes
  if (!num || isNaN(num)) return '\u2014'
  const tb = num / (1024 * 1024 * 1024 * 1024)
  if (tb >= 1) return `${tb.toFixed(1)} \u0422\u0411`
  const gb = num / (1024 * 1024 * 1024)
  return `${gb.toFixed(0)} \u0413\u0411`
}

const INCOME_COLOR  = '#1D9E75'
const EXPENSE_COLOR = '#E24B4A'

const CATEGORY_COLORS = [
  '#6366f1', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#a855f7',
]

// ── Main Component ───────────────────────────────────────────────

export default function AdminDashboard() {
  const [vpnStats, setVpnStats]   = useState<VpnStats | null>(null)
  const [buhData, setBuhData]     = useState<BuhDashboard | null>(null)
  const [loading, setLoading]     = useState(true)
  const [period, setPeriod]       = useState<PeriodType>('month')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')

  // Grant all days modal state (preserved from original)
  const [showGrantAll, setShowGrantAll]       = useState(false)
  const [grantAllDays, setGrantAllDays]       = useState(7)
  const [grantAllDesc, setGrantAllDesc]       = useState('')
  const [grantAllLoading, setGrantAllLoading] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [vpn, buh] = await Promise.allSettled([
          adminApi.stats(),
          adminApi.buhDashboard(),
        ])
        if (vpn.status === 'fulfilled')  setVpnStats(vpn.value as VpnStats)
        if (buh.status === 'fulfilled')  setBuhData(buh.value as BuhDashboard)
      } catch (e: any) {
        toast.error('Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <AdminSkeleton />

  const convRate = vpnStats && vpnStats.totalUsers > 0
    ? Math.round((vpnStats.activeUsers / vpnStats.totalUsers) * 100)
    : 0

  const maxRev = vpnStats
    ? Math.max(...vpnStats.revenueChart.map(d => Number(d.amount)), 1)
    : 1

  // Financial KPIs
  const income     = buhData?.period?.income ?? 0
  const expense    = buhData?.period?.expense ?? 0
  const profit     = buhData?.period?.profit ?? (income - expense)
  const balance    = buhData?.balance ?? 0
  const avgPerDay  = buhData?.period?.avgPerDay ?? 0
  const daysInPeriod = buhData?.period?.daysInPeriod ?? 1
  const expensePct = income > 0 ? Math.round((expense / income) * 100) : 0
  const bestDay    = buhData?.period?.bestDay
  const serverWarnings = buhData?.serverWarnings ?? []

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ── Header + Period Selector ────────────────────────── */}
      <div className="animate-slide-up flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            <span className="text-gradient">Панель управления</span>
          </h1>
          <p className="mt-1" style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            {new Date().toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(['today', 'month', 'year'] as PeriodType[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
              style={{
                background: period === p ? 'var(--accent-gradient)' : 'var(--glass-bg)',
                border: `1px solid ${period === p ? 'transparent' : 'var(--glass-border)'}`,
                color: period === p ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {p === 'today' ? 'Сегодня' : p === 'month' ? 'Месяц' : 'Год'}
            </button>
          ))}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPeriod('custom') }}
              className="px-2 py-1.5 rounded-lg text-xs"
              style={{
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-secondary)',
              }}
            />
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>&mdash;</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPeriod('custom') }}
              className="px-2 py-1.5 rounded-lg text-xs"
              style={{
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-secondary)',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Financial KPI Cards ─────────────────────────────── */}
      {buhData && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 stagger">
          {/* Income */}
          <KpiCard
            icon={<TrendingUp className="w-[18px] h-[18px]" />}
            label="Выручка"
            value={fmtShort(income)}
            sub={`~${fmt(avgPerDay)}/день`}
            iconColor={INCOME_COLOR}
            accentColor={INCOME_COLOR}
          />
          {/* Expense */}
          <KpiCard
            icon={<TrendingDown className="w-[18px] h-[18px]" />}
            label="Расходы"
            value={fmtShort(expense)}
            sub={`${expensePct}% от выручки`}
            iconColor={EXPENSE_COLOR}
            accentColor={EXPENSE_COLOR}
          />
          {/* Profit */}
          <KpiCard
            icon={profit >= 0
              ? <ArrowUp className="w-[18px] h-[18px]" />
              : <ArrowDown className="w-[18px] h-[18px]" />}
            label="Прибыль"
            value={fmtShort(profit)}
            sub={profit >= 0 ? 'положительная' : 'убыток'}
            iconColor={profit >= 0 ? INCOME_COLOR : EXPENSE_COLOR}
            accentColor={profit >= 0 ? INCOME_COLOR : EXPENSE_COLOR}
            valueColor={profit >= 0 ? INCOME_COLOR : EXPENSE_COLOR}
          />
          {/* Balance */}
          <KpiCard
            icon={<Wallet className="w-[18px] h-[18px]" />}
            label="Баланс"
            value={fmtShort(balance)}
            sub={serverWarnings.length > 0 ? `${serverWarnings.length} предупр.` : 'OK'}
            iconColor="#8b5cf6"
            accentColor="#8b5cf6"
            subColor={serverWarnings.length > 0 ? '#f59e0b' : undefined}
          />
          {/* Best Day */}
          <KpiCard
            icon={<Star className="w-[18px] h-[18px]" />}
            label="Лучший день"
            value={bestDay ? fmtShort(bestDay.amount) : '\u2014'}
            sub={bestDay ? formatDateRu(bestDay.date) : 'нет данных'}
            iconColor="#f59e0b"
            accentColor="#f59e0b"
          />
        </div>
      )}

      {/* ── Charts Row ──────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left: 30-day income chart */}
        <div className="lg:col-span-2 rounded-2xl p-5 animate-slide-up"
             style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', animationDelay: '100ms' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              Доходы за 30 дней
            </h2>
            <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
              {buhData ? fmt(income) + ' всего' : ''}
            </span>
          </div>
          <IncomeBarChart data={buhData?.incomeChart ?? vpnStats?.revenueChart ?? []} />
        </div>

        {/* Right: Expense by category */}
        <div className="rounded-2xl p-5 animate-slide-up"
             style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', animationDelay: '200ms' }}>
          <h2 className="font-semibold text-sm mb-5" style={{ color: 'var(--text-primary)' }}>
            Расходы по категориям
          </h2>
          <ExpenseByCategoryChart categories={buhData?.expenseByCategory ?? []} />
        </div>
      </div>

      {/* ── VPN Stats Row (preserved) ───────────────────────── */}
      {vpnStats && (
        <div className="animate-slide-up" style={{ animationDelay: '150ms' }}>
          <h2 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>
            VPN &amp; Сервис
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <AdminStatCard
              icon={<Users className="w-[18px] h-[18px]" />}
              label="Пользователи"
              value={vpnStats.totalUsers.toLocaleString('ru')}
              sub={`${vpnStats.activeUsers} активных`}
              gradient="linear-gradient(135deg, rgba(6,182,212,0.12), rgba(6,182,212,0.04))"
              borderColor="rgba(6,182,212,0.2)"
              iconColor="#22d3ee"
            />
            <AdminStatCard
              icon={<Activity className="w-[18px] h-[18px]" />}
              label="Конверсия"
              value={`${convRate}%`}
              sub={`${vpnStats.activeUsers} подписчиков`}
              gradient="linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))"
              borderColor="rgba(16,185,129,0.2)"
              iconColor="#34d399"
            />
            <AdminStatCard
              icon={<DollarSign className="w-[18px] h-[18px]" />}
              label="Выручка сегодня"
              value={`${vpnStats.todayRevenue.toLocaleString('ru')} \u20BD`}
              gradient="linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04))"
              borderColor="rgba(245,158,11,0.2)"
              iconColor="#fbbf24"
            />
            <AdminStatCard
              icon={<TrendingUp className="w-[18px] h-[18px]" />}
              label="Всего выручка"
              value={`${vpnStats.totalRevenue.toLocaleString('ru')} \u20BD`}
              sub={vpnStats.pendingPayments ? `${vpnStats.pendingPayments} ожидают` : undefined}
              gradient="linear-gradient(135deg, rgba(139,92,246,0.12), rgba(139,92,246,0.04))"
              borderColor="rgba(139,92,246,0.2)"
              iconColor="#a78bfa"
            />
          </div>

          {/* VPN Revenue Chart */}
          {vpnStats.revenueChart.length > 0 && !buhData && (
            <div className="mt-4 rounded-2xl p-5"
                 style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Выручка за 30 дней
                </h3>
                <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                  {vpnStats.totalRevenue.toLocaleString('ru')} \u20BD всего
                </span>
              </div>
              <IncomeBarChart data={vpnStats.revenueChart} />
            </div>
          )}

          {/* REMNAWAVE status */}
          {vpnStats.remnawave && (
            <div className="mt-4 rounded-2xl p-5"
                 style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>REMNAWAVE</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                     style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}>
                  <span className="glow-dot text-emerald-400" />
                  <span className="text-xs font-medium text-emerald-400">Онлайн</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {vpnStats.remnawave.cpu && (
                    <RmStatBox label="CPU" value={`${vpnStats.remnawave.cpu.cores} ядер`} />
                  )}
                  {vpnStats.remnawave.memory && (
                    <div className="px-3 py-2 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                      <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>RAM</p>
                      <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>
                        {formatMb(vpnStats.remnawave.memory.used)} / {formatMb(vpnStats.remnawave.memory.total)} МБ
                      </p>
                      <div className="w-full h-1.5 rounded-full overflow-hidden mt-1" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div className="h-full rounded-full" style={{
                          width: `${Math.round((vpnStats.remnawave.memory.used / vpnStats.remnawave.memory.total) * 100)}%`,
                          background: 'var(--accent-gradient)',
                        }} />
                      </div>
                    </div>
                  )}
                  {vpnStats.remnawave.uptime != null && (
                    <RmStatBox label="Uptime" value={formatUptime(vpnStats.remnawave.uptime)} />
                  )}
                  {vpnStats.remnawave.nodes && (
                    <>
                      <RmStatBox label="Ноды онлайн" value={vpnStats.remnawave.nodes.totalOnline} color="#34d399" />
                      <RmStatBox label="Трафик всего" value={formatTb(vpnStats.remnawave.nodes.totalBytesLifetime)} />
                    </>
                  )}
                </div>

                {vpnStats.remnawave.users && (
                  <div className="grid grid-cols-4 gap-2">
                    <RmStatBox label="Всего" value={vpnStats.remnawave.users.totalUsers} />
                    <RmStatBox label="Активных" value={vpnStats.remnawave.users.statusCounts?.ACTIVE} color="#34d399" />
                    <RmStatBox label="Истёкших" value={vpnStats.remnawave.users.statusCounts?.EXPIRED} color="#f87171" />
                    <RmStatBox label="Откл." value={vpnStats.remnawave.users.statusCounts?.DISABLED} color="#fbbf24" />
                  </div>
                )}

                {vpnStats.remnawave.onlineStats && (
                  <div className="grid grid-cols-4 gap-2">
                    <RmStatBox label="Сейчас" value={vpnStats.remnawave.onlineStats.onlineNow} color="#22d3ee" />
                    <RmStatBox label="За день" value={vpnStats.remnawave.onlineStats.lastDay} />
                    <RmStatBox label="За неделю" value={vpnStats.remnawave.onlineStats.lastWeek} />
                    <RmStatBox label="Никогда" value={vpnStats.remnawave.onlineStats.neverOnline} color="var(--text-tertiary)" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Bottom Grid: Transactions / Partners / Warnings ── */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Recent Transactions */}
        <div className="rounded-2xl p-5 animate-slide-up"
             style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', animationDelay: '250ms' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              Последние операции
            </h2>
            <Link href="/admin/buh/transactions" className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Все &rarr;
            </Link>
          </div>
          <div className="space-y-2">
            {(buhData?.recentTransactions ?? []).length === 0 && (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
                Нет операций
              </p>
            )}
            {(buhData?.recentTransactions ?? []).slice(0, 10).map(tx => (
              <div key={tx.id} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                   style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0"
                     style={{ background: tx.type === 'income' ? INCOME_COLOR : EXPENSE_COLOR }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {tx.description || (tx.type === 'income' ? 'Доход' : 'Расход')}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                    {formatDateRu(tx.date)}
                    {tx.category && ` \u00B7 ${tx.category}`}
                  </p>
                </div>
                <span className="text-xs font-bold flex-shrink-0"
                      style={{ color: tx.type === 'income' ? INCOME_COLOR : EXPENSE_COLOR }}>
                  {tx.type === 'income' ? '+' : '-'}{fmt(Math.abs(tx.amount))}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Partners */}
        <div className="rounded-2xl p-5 animate-slide-up"
             style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', animationDelay: '300ms' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              Партнёры
            </h2>
            <Link href="/admin/buh/partners" className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Все &rarr;
            </Link>
          </div>
          <div className="space-y-3">
            {(buhData?.partners ?? []).length === 0 && (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
                Нет партнёров
              </p>
            )}
            {(buhData?.partners ?? []).map(p => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                   style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                     style={{ background: p.avatarColor || '#6366f1' }}>
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {p.name}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                    Дивиденды: {fmt(p.totalDividends)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold" style={{ color: p.remainingDebt > 0 ? '#f59e0b' : INCOME_COLOR }}>
                    {p.remainingDebt > 0 ? `Долг: ${fmtShort(p.remainingDebt)}` : 'Оплачено'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Server Warnings + Milestones */}
        <div className="rounded-2xl p-5 animate-slide-up"
             style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', animationDelay: '350ms' }}>
          {/* Warnings */}
          <h2 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>
            Предупреждения
          </h2>
          {serverWarnings.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-5"
                 style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}>
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs text-emerald-400">Всё в порядке</span>
            </div>
          ) : (
            <div className="space-y-2 mb-5">
              {serverWarnings.map(w => (
                <div key={w.id} className="flex items-start gap-2 px-3 py-2 rounded-xl"
                     style={{
                       background: w.level === 'critical' ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)',
                       border: `1px solid ${w.level === 'critical' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)'}`,
                     }}>
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                                 style={{ color: w.level === 'critical' ? '#ef4444' : '#f59e0b' }} />
                  <div>
                    <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{w.name}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{w.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Milestones */}
          <h2 className="font-semibold text-sm mb-3 mt-4" style={{ color: 'var(--text-primary)' }}>
            Цели
          </h2>
          <div className="space-y-3">
            {(buhData?.milestones ?? []).length === 0 && (
              <p className="text-xs py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>
                Нет целей
              </p>
            )}
            {(buhData?.milestones ?? []).map(ms => {
              const pct = ms.target > 0 ? Math.min(Math.round((ms.current / ms.target) * 100), 100) : 0
              return (
                <div key={ms.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {ms.title}
                    </span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                      {new Intl.NumberFormat('ru-RU').format(ms.current)}{ms.unit ? ` ${ms.unit}` : ''} / {new Intl.NumberFormat('ru-RU').format(ms.target)}{ms.unit ? ` ${ms.unit}` : ''}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="h-full rounded-full transition-all duration-500"
                         style={{
                           width: `${pct}%`,
                           background: pct >= 100
                             ? INCOME_COLOR
                             : pct >= 60
                               ? 'linear-gradient(90deg, #06b6d4, #8b5cf6)'
                               : '#6366f1',
                         }} />
                  </div>
                  <p className="text-[10px] text-right mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{pct}%</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Quick Actions ───────────────────────────────────── */}
      <div className="rounded-2xl p-5 animate-slide-up"
           style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', animationDelay: '400ms' }}>
        <h2 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>
          Быстрые действия
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { href: '/admin/users',        icon: Users,       label: 'Пользователи' },
            { href: '/admin/tariffs',       icon: Package,     label: 'Тарифы' },
            { href: '/admin/instructions',  icon: BookOpen,    label: 'Инструкции' },
            { href: '/admin/payments',      icon: CreditCard,  label: 'Платежи' },
          ].map(({ href, icon: Icon, label }: { href: string; icon: any; label: string }) => (
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
          <button onClick={() => setShowGrantAll(true)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all duration-200 group"
                  style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
            <Calendar className="w-4 h-4" style={{ color: '#fbbf24' }} />
            <span style={{ color: 'var(--text-secondary)' }}
                  className="group-hover:text-[var(--text-primary)] transition-colors">
              Выдать всем дни
            </span>
          </button>
        </div>
      </div>

      {/* ── Grant Days Modal (preserved) ────────────────────── */}
      {showGrantAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowGrantAll(false)} />
          <div className="relative glass-card w-full max-w-md space-y-4 animate-scale-in"
               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
            <h3 className="font-semibold text-lg">Выдать бонусные дни всем</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Бонусные дни будут начислены всем активным пользователям.
            </p>
            <input type="number" className="glass-input" placeholder="Количество дней"
                   value={grantAllDays} onChange={e => setGrantAllDays(+e.target.value)} min={1} />
            <input className="glass-input" placeholder="Описание (необязательно)"
                   value={grantAllDesc} onChange={e => setGrantAllDesc(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={() => setShowGrantAll(false)} className="btn-secondary flex-1">Отмена</button>
              <button disabled={grantAllLoading || grantAllDays < 1}
                      onClick={async () => {
                        setGrantAllLoading(true)
                        try {
                          const res = await adminApi.grantDaysAll(grantAllDays, grantAllDesc)
                          toast.success(`+${grantAllDays} дней начислено ${res.updatedCount} пользователям`)
                          setShowGrantAll(false); setGrantAllDays(7); setGrantAllDesc('')
                        } catch (e: any) { toast.error(e.message || 'Ошибка') }
                        finally { setGrantAllLoading(false) }
                      }}
                      className="btn-primary flex-1 justify-center">
                {grantAllLoading ? 'Начисляю...' : `+${grantAllDays} дней всем`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, iconColor, accentColor, valueColor, subColor }: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  iconColor: string
  accentColor: string
  valueColor?: string
  subColor?: string
}) {
  return (
    <div className="rounded-2xl p-5 transition-all duration-300 animate-scale-in hover:-translate-y-0.5"
         style={{
           background: `linear-gradient(135deg, ${accentColor}18, ${accentColor}08)`,
           border: `1px solid ${accentColor}30`,
         }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
             style={{ background: 'rgba(255,255,255,0.06)', color: iconColor }}>
          {icon}
        </div>
      </div>
      <p className="text-[11px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </p>
      <p className="text-xl font-bold" style={{ color: valueColor || 'var(--text-primary)' }}>{value}</p>
      {sub && (
        <p className="text-[11px] mt-0.5" style={{ color: subColor || 'var(--text-tertiary)' }}>{sub}</p>
      )}
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

function IncomeBarChart({ data }: { data: Array<{ date: string; amount: number }> }) {
  const maxAmount = useMemo(() => Math.max(...data.map(d => Number(d.amount)), 1), [data])

  if (data.length === 0) {
    return (
      <div className="h-44 flex items-center justify-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
        Нет данных за этот период
      </div>
    )
  }

  return (
    <div className="flex items-end gap-[3px] h-44">
      {data.map((d, i) => {
        const h = (Number(d.amount) / maxAmount) * 100
        return (
          <div key={i} className="group flex-1 flex flex-col items-center justify-end cursor-pointer relative">
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-2 py-1.5 rounded-lg text-[10px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10"
                 style={{ background: 'var(--surface-3)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>
              <span className="font-bold">{fmt(Number(d.amount))}</span>
              <br />
              <span style={{ color: 'var(--text-tertiary)' }}>{formatDateRu(d.date)}</span>
            </div>
            <div className="w-full rounded-t-sm transition-all duration-200 group-hover:opacity-100"
                 style={{
                   height: `${Math.max(h, 2)}%`,
                   background: h > 60
                     ? `linear-gradient(to top, ${INCOME_COLOR}, ${INCOME_COLOR}cc)`
                     : h > 30
                       ? `linear-gradient(to top, ${INCOME_COLOR}99, ${INCOME_COLOR}66)`
                       : `${INCOME_COLOR}44`,
                   opacity: 0.8,
                 }} />
          </div>
        )
      })}
    </div>
  )
}

function ExpenseByCategoryChart({ categories }: { categories: Array<{ category: string; amount: number; color?: string; percentage: number }> }) {
  if (categories.length === 0) {
    return (
      <div className="h-44 flex items-center justify-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
        Нет данных о расходах
      </div>
    )
  }

  const maxPct = Math.max(...categories.map(c => c.percentage), 1)

  return (
    <div className="space-y-3">
      {categories.map((cat, i) => {
        const color = cat.color || CATEGORY_COLORS[i % CATEGORY_COLORS.length]
        const barWidth = Math.max((cat.percentage / maxPct) * 100, 4)
        return (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
                <span className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)', maxWidth: '120px' }}>
                  {cat.category}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                  {cat.percentage}%
                </span>
                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                  {fmtShort(cat.amount)}
                </span>
              </div>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="h-full rounded-full transition-all duration-500"
                   style={{ width: `${barWidth}%`, background: color }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RmStatBox({ label, value, color }: { label: string; value: any; color?: string }) {
  return (
    <div className="px-3 py-2 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      <p className="text-lg font-bold mt-0.5" style={{ color: color || 'var(--text-primary)' }}>
        {value ?? '\u2014'}
      </p>
    </div>
  )
}

function AdminSkeleton() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-8 skeleton w-48" />
          <div className="h-4 skeleton w-36" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 skeleton w-20 rounded-lg" />
          <div className="h-8 skeleton w-20 rounded-lg" />
          <div className="h-8 skeleton w-20 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-32 skeleton rounded-2xl" />)}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-64 skeleton rounded-2xl" />
        <div className="h-64 skeleton rounded-2xl" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-32 skeleton rounded-2xl" />)}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-72 skeleton rounded-2xl" />)}
      </div>
    </div>
  )
}
