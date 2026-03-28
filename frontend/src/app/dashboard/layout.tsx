'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Shield, LayoutDashboard, CreditCard, BookOpen,
  Users, LogOut, Menu, X, ChevronRight, Zap,
} from 'lucide-react'

interface User {
  id: string; email?: string; telegramName?: string
  subStatus: string; subExpireAt?: string; role: string
}

const NAV = [
  { href: '/dashboard',              icon: LayoutDashboard, label: 'Обзор' },
  { href: '/dashboard/subscription', icon: Shield,          label: 'Подписка' },
  { href: '/dashboard/instructions', icon: BookOpen,        label: 'Подключение' },
  { href: '/dashboard/referral',     icon: Users,           label: 'Рефералы' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [user, setUser]         = useState<User | null>(null)
  const [loading, setLoading]   = useState(true)
  const [sideOpen, setSideOpen] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setUser)
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false))
  }, [router])

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface-1)' }}>
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-transparent"
               style={{ borderTopColor: 'var(--accent-1)', borderRightColor: 'var(--accent-2)', animation: 'spin 0.8s linear infinite' }} />
        </div>
        <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!user) return null

  const isActive = user.subStatus === 'ACTIVE'
  const daysLeft = user.subExpireAt
    ? Math.max(0, Math.ceil((new Date(user.subExpireAt).getTime() - Date.now()) / 86400_000))
    : null

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5" style={{ borderBottom: '1px solid var(--glass-border)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
             style={{ background: 'var(--accent-gradient)' }}>
          <Shield className="w-[18px] h-[18px] text-white" />
        </div>
        <div>
          <span className="font-semibold text-[15px] tracking-tight" style={{ color: 'var(--text-primary)' }}>
            HIDEYOU
          </span>
          <span className="text-[10px] font-medium ml-1.5 px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(6,182,212,0.12)', color: '#22d3ee' }}>VPN</span>
        </div>
      </div>

      {/* Status card */}
      <div className="mx-3 mt-4 mb-2 p-3 rounded-xl" style={{
        background: isActive
          ? 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(6,182,212,0.08))'
          : 'rgba(255,255,255,0.02)',
        border: isActive ? '1px solid rgba(16,185,129,0.15)' : '1px solid var(--glass-border)',
      }}>
        <div className="flex items-center gap-2">
          <div className={`glow-dot ${isActive ? 'text-emerald-400' : 'text-gray-600'}`} />
          <span className="text-xs font-medium" style={{ color: isActive ? '#34d399' : 'var(--text-tertiary)' }}>
            {isActive ? 'VPN активен' : 'Не подключён'}
          </span>
        </div>
        {isActive && daysLeft !== null && (
          <p className="text-[11px] mt-1.5 ml-4" style={{ color: 'var(--text-tertiary)' }}>
            {daysLeft} {daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней'} до продления
          </p>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href}
                  onClick={() => setSideOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-all duration-200 group"
                  style={{
                    background: active ? 'rgba(6,182,212,0.08)' : 'transparent',
                    color: active ? '#22d3ee' : 'var(--text-secondary)',
                  }}>
              <Icon className="w-[18px] h-[18px] flex-shrink-0" style={{
                color: active ? '#22d3ee' : 'var(--text-tertiary)',
              }} />
              <span className={active ? 'font-medium' : 'group-hover:text-[var(--text-primary)]'}>{label}</span>
              {active && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-gradient)' }} />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Upgrade CTA (if inactive) */}
      {!isActive && (
        <div className="mx-3 mb-3">
          <Link href="/dashboard/subscription"
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
                style={{ background: 'var(--accent-gradient)' }}
                onClick={() => setSideOpen(false)}>
            <Zap className="w-4 h-4" />
            Подключить VPN
          </Link>
        </div>
      )}

      {/* User card */}
      <div className="px-3 py-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
        <div className="flex items-center gap-3 px-2">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold gradient-border"
               style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}>
            {(user.telegramName || user.email || 'U')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {user.telegramName || user.email?.split('@')[0] || 'Пользователь'}
            </p>
            <p className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
              {user.email || (user.telegramName ? `@${user.telegramName}` : '')}
            </p>
          </div>
          <button onClick={logout}
                  className="p-2 rounded-lg transition-all duration-200 hover:bg-red-500/10 group"
                  title="Выйти">
            <LogOut className="w-4 h-4 text-[var(--text-tertiary)] group-hover:text-red-400 transition-colors" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--surface-1)', color: 'var(--text-primary)' }}>
      {/* Aurora background */}
      <div className="aurora-bg" />

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-[260px] flex-shrink-0 glass-sidebar fixed left-0 top-0 h-screen z-30">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {sideOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
               onClick={() => setSideOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[280px] glass-sidebar animate-slide-right">
            <Sidebar />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-[260px]">
        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 glass-sidebar">
          <button onClick={() => setSideOpen(true)} className="p-2 rounded-lg"
                  style={{ color: 'var(--text-secondary)' }}>
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                 style={{ background: 'var(--accent-gradient)' }}>
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm">HIDEYOU</span>
          </div>
          <div className="w-9" /> {/* spacer */}
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative z-10 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
