'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Shield, Zap, Users, Clock, ArrowRight, ArrowUpRight,
         Copy, CheckCircle2, Wifi, Globe2, BookOpen } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

interface DashboardData {
  user:            any
  rmStats:         any
  referralUrl:     string
  referralCount:   number
  bonusDaysEarned: number
}

export default function DashboardPage() {
  const [data, setData]       = useState<DashboardData | null>(null)
  const [sub, setSub]         = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/user/dashboard', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/user/subscription', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([d, s]) => { setData(d); setSub(s) })
      .finally(() => setLoading(false))
  }, [])

  const copyText = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2500)
  }

  if (loading) return <DashboardSkeleton />
  if (!data) return null

  const { user, rmStats, referralUrl, referralCount, bonusDaysEarned } = data
  const isActive = user.subStatus === 'ACTIVE'
  const daysLeft = user.subExpireAt
    ? Math.max(0, Math.ceil((new Date(user.subExpireAt).getTime() - Date.now()) / 86400_000))
    : null

  const usedGb  = rmStats ? (rmStats.usedTrafficBytes  / 1e9) : null
  const limitGb = rmStats?.trafficLimitBytes ? (rmStats.trafficLimitBytes / 1e9) : null
  const trafficPct = usedGb && limitGb ? Math.min(100, (usedGb / limitGb) * 100) : 0

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="animate-slide-up">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          {user.telegramName ? (
            <>Привет, <span className="text-gradient">{user.telegramName}</span></>
          ) : (
            <span className="text-gradient">Добро пожаловать</span>
          )}
        </h1>
        <p className="mt-1.5" style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          Управляй своим VPN-подключением
        </p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 stagger">
        <GlassStatCard
          icon={<Wifi className="w-4 h-4" />}
          label="Статус"
          value={isActive ? 'Активен' : 'Офлайн'}
          iconBg={isActive ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)'}
          iconColor={isActive ? '#34d399' : 'var(--text-tertiary)'}
          valueColor={isActive ? '#34d399' : 'var(--text-tertiary)'}
          dot={isActive}
        />
        <GlassStatCard
          icon={<Clock className="w-4 h-4" />}
          label="Осталось"
          value={daysLeft !== null ? `${daysLeft} дн.` : '—'}
          iconBg="rgba(6,182,212,0.12)"
          iconColor="#22d3ee"
        />
        <GlassStatCard
          icon={<Zap className="w-4 h-4" />}
          label="Трафик"
          value={usedGb !== null ? `${usedGb.toFixed(1)} ГБ` : '—'}
          sub={limitGb ? `из ${limitGb.toFixed(0)} ГБ` : 'безлимит'}
          iconBg="rgba(139,92,246,0.12)"
          iconColor="#a78bfa"
        />
        <GlassStatCard
          icon={<Users className="w-4 h-4" />}
          label="Рефералы"
          value={String(referralCount)}
          sub={bonusDaysEarned ? `+${bonusDaysEarned} дн.` : undefined}
          iconBg="rgba(245,158,11,0.12)"
          iconColor="#fbbf24"
        />
      </div>

      <div className="grid md:grid-cols-5 gap-4 md:gap-6">
        {/* Subscription card — left 3 cols */}
        <div className="md:col-span-3 glass-card gradient-border animate-slide-up" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
              Моя подписка
            </h2>
            {isActive && <span className="badge-green"><span className="glow-dot text-emerald-400 mr-1.5" /> Активна</span>}
          </div>

          {sub?.subUrl ? (
            <div className="space-y-5">
              {/* QR Code with gradient border */}
              <div className="flex justify-center">
                <div className="p-4 rounded-2xl gradient-border" style={{ background: 'rgba(255,255,255,0.95)' }}>
                  <QRCodeSVG value={sub.subUrl} size={140} bgColor="transparent" fgColor="#1a1a2e" />
                </div>
              </div>

              {/* Subscription link */}
              <div className="flex items-center gap-2 p-3 rounded-xl" style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--glass-border)',
              }}>
                <p className="flex-1 text-xs font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>
                  {sub.subUrl}
                </p>
                <button onClick={() => copyText(sub.subUrl, 'sub')}
                        className="flex-shrink-0 p-2 rounded-lg transition-all hover:bg-white/5">
                  {copied === 'sub'
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    : <Copy className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />}
                </button>
              </div>

              {sub.expireAt && (
                <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
                  Действует до{' '}
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {new Date(sub.expireAt).toLocaleDateString('ru', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </span>
                </p>
              )}

              <Link href="/dashboard/instructions" className="btn-secondary w-full justify-center text-sm">
                <BookOpen className="w-4 h-4" /> Инструкции по подключению
              </Link>
            </div>
          ) : (
            <div className="flex flex-col items-center py-10 text-center space-y-5">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center gradient-border"
                   style={{ background: 'rgba(6,182,212,0.05)' }}>
                <Shield className="w-9 h-9" style={{ color: 'var(--text-tertiary)' }} />
              </div>
              <div>
                <p className="font-medium text-[15px]" style={{ color: 'var(--text-primary)' }}>
                  Нет активной подписки
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Подключись за 2 минуты и получи безопасный VPN
                </p>
              </div>
              <Link href="/dashboard/subscription" className="btn-primary">
                <Zap className="w-4 h-4" /> Подключить VPN
              </Link>
            </div>
          )}
        </div>

        {/* Right column — 2 cols */}
        <div className="md:col-span-2 space-y-4 md:space-y-6">
          {/* Traffic ring */}
          {usedGb !== null && (
            <div className="glass-card animate-slide-up" style={{ animationDelay: '200ms' }}>
              <h3 className="font-medium text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Использование трафика</h3>
              <div className="flex items-center gap-5">
                <TrafficRing percent={trafficPct} used={usedGb} limit={limitGb} />
                <div className="space-y-1.5">
                  <p className="text-xl font-semibold">{usedGb.toFixed(2)} <span className="text-sm font-normal" style={{ color: 'var(--text-tertiary)' }}>ГБ</span></p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {limitGb ? `из ${limitGb.toFixed(0)} ГБ` : 'Безлимит'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Referral */}
          <div className="glass-card animate-slide-up" style={{ animationDelay: '300ms' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm" style={{ color: 'var(--text-secondary)' }}>Реферальная программа</h3>
              <span className="text-gradient text-xs font-semibold">+30 дней</span>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
              Приведи друга — получи 30 дней бесплатно
            </p>
            <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--glass-border)',
            }}>
              <p className="flex-1 text-[11px] font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>
                {referralUrl}
              </p>
              <button onClick={() => copyText(referralUrl, 'ref')}
                      className="flex-shrink-0 p-1.5 rounded-lg transition-all hover:bg-white/5">
                {copied === 'ref'
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  : <Copy className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />}
              </button>
            </div>
            {referralCount > 0 && (
              <p className="text-xs mt-2.5 text-emerald-400">
                {referralCount} чел. по ссылке · +{bonusDaysEarned} дней бонуса
              </p>
            )}
          </div>

          {/* Quick links */}
          <div className="glass-card animate-slide-up" style={{ animationDelay: '400ms' }}>
            <h3 className="font-medium text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>Быстрые действия</h3>
            <div className="space-y-1">
              {[
                { href: '/dashboard/subscription', icon: Shield, label: 'Управление подпиской' },
                { href: '/dashboard/instructions', icon: BookOpen, label: 'Как подключиться' },
                { href: '/dashboard/referral', icon: Users, label: 'Пригласить друга' },
              ].map(({ href, icon: Icon, label }) => (
                <Link key={href} href={href}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all hover:bg-white/[0.03] group">
                  <Icon className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{ color: 'var(--text-secondary)' }} className="group-hover:text-[var(--text-primary)] transition-colors">
                    {label}
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ color: 'var(--text-tertiary)' }} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ── */

function GlassStatCard({ icon, label, value, sub, iconBg, iconColor, valueColor, dot }: {
  icon: React.ReactNode; label: string; value: string; sub?: string
  iconBg: string; iconColor: string; valueColor?: string; dot?: boolean
}) {
  return (
    <div className="glass-card p-4 animate-scale-in">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
             style={{ background: iconBg, color: iconColor }}>
          {icon}
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        {dot && <span className="glow-dot text-emerald-400 mr-1" />}
        <span className="text-lg font-semibold" style={{ color: valueColor || 'var(--text-primary)' }}>
          {value}
        </span>
      </div>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>}
    </div>
  )
}

function TrafficRing({ percent, used, limit }: { percent: number; used: number; limit: number | null }) {
  const size = 80
  const stroke = 6
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (percent / 100) * circ

  return (
    <svg width={size} height={size} className="progress-ring -rotate-90">
      <circle cx={size/2} cy={size/2} r={r}
              fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r}
              fill="none"
              stroke="url(#traffic-grad)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset} />
      <defs>
        <linearGradient id="traffic-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function DashboardSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="space-y-2">
        <div className="h-8 skeleton w-64" />
        <div className="h-4 skeleton w-48" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 skeleton rounded-2xl" />)}
      </div>
      <div className="grid md:grid-cols-5 gap-6">
        <div className="md:col-span-3 h-80 skeleton rounded-2xl" />
        <div className="md:col-span-2 space-y-6">
          <div className="h-32 skeleton rounded-2xl" />
          <div className="h-40 skeleton rounded-2xl" />
        </div>
      </div>
    </div>
  )
}
