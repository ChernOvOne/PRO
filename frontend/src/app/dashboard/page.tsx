'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Shield, Zap, Users, Clock, ArrowRight,
         TrendingUp, Copy, CheckCircle2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

interface DashboardData {
  user:         any
  rmStats:      any
  referralUrl:  string
  referralCount: number
  bonusDaysEarned: number
}

export default function DashboardPage() {
  const [data, setData]     = useState<DashboardData | null>(null)
  const [sub,  setSub]      = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/user/dashboard', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/user/subscription', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
    ]).then(([d, s]) => {
      setData(d)
      setSub(s)
    }).finally(() => setLoading(false))
  }, [])

  const copySubLink = async () => {
    if (!sub?.subUrl) return
    await navigator.clipboard.writeText(sub.subUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (loading) return <DashboardSkeleton />
  if (!data)   return null

  const { user, rmStats, referralUrl, referralCount, bonusDaysEarned } = data
  const isActive = user.subStatus === 'ACTIVE'
  const daysLeft = user.subExpireAt
    ? Math.max(0, Math.ceil((new Date(user.subExpireAt).getTime() - Date.now()) / 86400_000))
    : null

  const usedGb  = rmStats ? (rmStats.usedTrafficBytes  / 1e9).toFixed(2) : null
  const limitGb = rmStats?.trafficLimitBytes ? (rmStats.trafficLimitBytes / 1e9).toFixed(0) : null

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          Добро пожаловать{user.telegramName ? `, ${user.telegramName}` : ''} 👋
        </h1>
        <p className="text-gray-400 mt-1">Управляй своей VPN-подпиской</p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Shield}
          label="Статус"
          value={isActive ? 'Активна' : 'Нет подписки'}
          color={isActive ? 'emerald' : 'gray'}
        />
        <StatCard
          icon={Clock}
          label="Осталось"
          value={daysLeft !== null ? `${daysLeft} дней` : '—'}
          color="blue"
        />
        <StatCard
          icon={Zap}
          label="Трафик"
          value={usedGb ? `${usedGb} ГБ` : '—'}
          sub={limitGb ? `из ${limitGb} ГБ` : 'безлимит'}
          color="purple"
        />
        <StatCard
          icon={Users}
          label="Рефералы"
          value={String(referralCount)}
          sub={bonusDaysEarned ? `+${bonusDaysEarned} дней бонус` : undefined}
          color="amber"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Subscription card */}
        <div className="card space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Моя подписка</h2>
            {isActive && (
              <span className="badge-green">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse inline-block" />
                Активна
              </span>
            )}
          </div>

          {sub?.subUrl ? (
            <div className="space-y-4">
              {/* QR Code */}
              <div className="flex justify-center p-4 bg-white rounded-2xl">
                <QRCodeSVG value={sub.subUrl} size={160} />
              </div>

              {/* Sub URL */}
              <div className="flex items-center gap-2 p-3 bg-gray-800 rounded-xl">
                <p className="flex-1 text-xs text-gray-400 font-mono truncate">
                  {sub.subUrl}
                </p>
                <button onClick={copySubLink}
                        className="flex-shrink-0 p-1.5 text-gray-400 hover:text-white
                                   hover:bg-gray-700 rounded-lg transition-colors">
                  {copied
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    : <Copy className="w-4 h-4" />
                  }
                </button>
              </div>

              {sub.expireAt && (
                <p className="text-sm text-gray-400 text-center">
                  Действует до{' '}
                  <span className="text-white font-medium">
                    {new Date(sub.expireAt).toLocaleDateString('ru', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </span>
                </p>
              )}

              <Link href="/dashboard/instructions"
                    className="btn-secondary w-full justify-center text-sm">
                Инструкции по подключению <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center">
                <Shield className="w-8 h-8 text-gray-600" />
              </div>
              <div>
                <p className="font-medium text-gray-300">Нет активной подписки</p>
                <p className="text-sm text-gray-500 mt-1">Выбери тариф и подключись за 2 минуты</p>
              </div>
              <Link href="/dashboard/plans" className="btn-primary">
                Выбрать тариф <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>

        {/* Traffic + Referral */}
        <div className="space-y-6">
          {/* Traffic */}
          {usedGb && (
            <div className="card space-y-3">
              <h2 className="font-semibold">Использование трафика</h2>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Использовано</span>
                  <span>{usedGb} ГБ {limitGb ? `/ ${limitGb} ГБ` : ''}</span>
                </div>
                {limitGb && (
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (Number(usedGb) / Number(limitGb)) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Referral */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Реферальная программа</h2>
              <TrendingUp className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-sm text-gray-400">
              Приведи друга — получи{' '}
              <span className="text-amber-400 font-semibold">30 дней бесплатно</span>
            </p>
            <div className="flex items-center gap-2 p-3 bg-gray-800 rounded-xl">
              <p className="flex-1 text-xs text-gray-300 font-mono truncate">{referralUrl}</p>
              <button
                onClick={() => navigator.clipboard.writeText(referralUrl)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            {referralCount > 0 && (
              <p className="text-sm text-emerald-400">
                ✓ {referralCount} чел. по твоей ссылке · +{bonusDaysEarned} дней бонуса
              </p>
            )}
            <Link href="/dashboard/referral" className="btn-ghost text-sm w-full justify-center">
              Подробнее о реферальной программе <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }: {
  icon: any; label: string; value: string; sub?: string; color?: string
}) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/10',
    blue:    'text-blue-400 bg-blue-500/10',
    purple:  'text-purple-400 bg-purple-500/10',
    amber:   'text-amber-400 bg-amber-500/10',
    gray:    'text-gray-400 bg-gray-700/50',
  }
  return (
    <div className="card p-4 space-y-2">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-gray-500 text-xs">{label}</p>
        <p className="font-semibold text-sm">{value}</p>
        {sub && <p className="text-xs text-gray-500">{sub}</p>}
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-pulse">
      <div className="h-8 skeleton w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 skeleton" />)}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="h-80 skeleton rounded-2xl" />
        <div className="h-80 skeleton rounded-2xl" />
      </div>
    </div>
  )
}
