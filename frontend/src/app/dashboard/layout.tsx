'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Shield, LayoutDashboard, CreditCard, BookOpen,
  Users, LogOut, Menu, X, Zap, Bell,
  Wifi, Newspaper, Settings, Wallet, CheckCheck,
} from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'

interface User {
  id: string; email?: string; telegramName?: string
  subStatus: string; subExpireAt?: string; role: string; balance?: number
}

interface Notification {
  id: string; title: string; message: string; type: string
  isRead: boolean; createdAt: string
}

const NAV = [
  { href: '/dashboard',              icon: LayoutDashboard, label: 'Личный кабинет' },
  { href: '/dashboard/instructions', icon: BookOpen,        label: 'Подключить VPN' },
  { href: '/dashboard/payments',     icon: Wallet,          label: 'Платежи' },
  { href: '/dashboard/profile',      icon: Settings,        label: 'Профиль' },
]

const MOBILE_NAV = [
  { href: '/dashboard',              icon: LayoutDashboard, label: 'Главная' },
  { href: '/dashboard/instructions', icon: BookOpen,        label: 'Подключить' },
  { href: '/dashboard/payments',     icon: Wallet,          label: 'Платежи' },
  { href: '/dashboard/profile',      icon: Settings,        label: 'Профиль' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [user, setUser]           = useState<User | null>(null)
  const [loading, setLoading]     = useState(true)
  const [sideOpen, setSideOpen]   = useState(false)
  const [unread, setUnread]       = useState(0)
  const [bellOpen, setBellOpen]   = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notiLoading, setNotiLoading] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setUser)
      .catch(async () => {
        // Try Telegram MiniApp auto-login before redirecting to /login
        const tg = (window as any).Telegram?.WebApp
        if (tg?.initData) {
          try {
            const res = await fetch('/api/auth/telegram-mini-app', {
              method: 'POST', credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ initData: tg.initData }),
            })
            if (res.ok) {
              const data = await res.json()
              tg.expand?.()
              setUser(data.user)
              return
            }
          } catch {}
        }
        router.push('/login')
      })
      .finally(() => setLoading(false))

    fetch('/api/notifications/unread-count', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { count: 0 })
      .then(d => setUnread(d.count))
      .catch(() => {})
  }, [router])

  // Close bell dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openBell = async () => {
    if (bellOpen) { setBellOpen(false); return }
    setBellOpen(true)
    setNotiLoading(true)
    try {
      const res = await fetch('/api/notifications?limit=3', { credentials: 'include' })
      const data = await res.json()
      setNotifications(data.notifications || [])
    } catch {}
    setNotiLoading(false)
  }

  const markAllRead = async () => {
    await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'include' }).catch(() => {})
    setUnread(0)
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
  }

  const markOneRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: 'POST', credentials: 'include' }).catch(() => {})
    setUnread(prev => Math.max(0, prev - 1))
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
  }

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

  // Bell button + notification panel
  const bellButton = (
    <button onClick={openBell}
            className="p-2 rounded-xl relative transition-all hover:bg-white/[0.05]"
            style={{ color: 'var(--text-secondary)' }}>
      <Bell className="w-5 h-5" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold text-white flex items-center justify-center px-1"
              style={{ background: '#ef4444' }}>
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )

  const bellPanel = bellOpen ? (
    <div className="fixed inset-0 z-[100]" ref={bellRef}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setBellOpen(false)} />

      {/* Panel */}
      <div className="absolute right-3 top-14 md:right-8 md:top-14 w-[calc(100vw-24px)] max-w-sm rounded-2xl overflow-hidden animate-scale-in"
           style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3"
             style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <p className="text-sm font-semibold">Уведомления</p>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button onClick={markAllRead}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all hover:bg-white/[0.05]"
                      style={{ color: 'var(--accent-1)' }}>
                <CheckCheck className="w-3.5 h-3.5" /> Все прочитаны
              </button>
            )}
            <button onClick={() => setBellOpen(false)} className="p-1 rounded-lg hover:bg-white/[0.05]"
                    style={{ color: 'var(--text-tertiary)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* List — max 3 */}
        <div className="overflow-y-auto">
          {notiLoading ? (
            <div className="p-6 text-center">
              <div className="w-6 h-6 mx-auto rounded-full border-2 border-transparent"
                   style={{ borderTopColor: 'var(--accent-1)', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Нет уведомлений</p>
            </div>
          ) : (
            notifications.slice(0, 3).map(n => {
              const typeColors: Record<string, { bg: string; border: string; dot: string; icon: string }> = {
                INFO:    { bg: 'rgba(6,182,212,0.04)',   border: 'rgba(6,182,212,0.1)',   dot: '#06b6d4', icon: 'ℹ️' },
                WARNING: { bg: 'rgba(245,158,11,0.04)',  border: 'rgba(245,158,11,0.1)',  dot: '#f59e0b', icon: '⚠️' },
                SUCCESS: { bg: 'rgba(16,185,129,0.04)',  border: 'rgba(16,185,129,0.1)',  dot: '#10b981', icon: '✅' },
                PROMO:   { bg: 'rgba(139,92,246,0.04)',  border: 'rgba(139,92,246,0.1)',  dot: '#8b5cf6', icon: '🎁' },
              }
              const tc = typeColors[n.type] || typeColors.INFO
              return (
              <div key={n.id}
                   onClick={() => { if (!n.isRead) markOneRead(n.id) }}
                   className="flex gap-3 px-4 py-3 transition-all cursor-pointer hover:bg-white/[0.03]"
                   style={{
                     borderBottom: '1px solid var(--glass-border)',
                     background: n.isRead ? 'transparent' : tc.bg,
                     borderLeft: n.isRead ? 'none' : `3px solid ${tc.dot}`,
                   }}>
                <div className="mt-0.5 flex-shrink-0 text-sm">{tc.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{n.title}</p>
                  <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                    {n.message}
                  </p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    {formatTimeAgo(n.createdAt)}
                  </p>
                </div>
              </div>
              )
            })
          )}
        </div>

        {/* Footer — link to all */}
        {notifications.length > 3 && (
          <Link href="/dashboard/news" onClick={() => setBellOpen(false)}
                className="block text-center text-xs py-2.5 transition-all hover:bg-white/[0.03]"
                style={{ color: 'var(--accent-1)', borderTop: '1px solid var(--glass-border)' }}>
            Все уведомления
          </Link>
        )}
      </div>
    </div>
  ) : null

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-3 px-6 py-5 transition-opacity hover:opacity-80"
            style={{ borderBottom: '1px solid var(--glass-border)' }} onClick={() => setSideOpen(false)}>
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
      </Link>

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
          <Link href="/dashboard/plans"
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
      <div className="aurora-bg" />

      {/* Desktop sidebar */}
      <aside className="sidebar-desktop hidden md:flex flex-col w-[260px] flex-shrink-0 glass-sidebar fixed left-0 top-0 h-screen z-30">
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
        {/* Desktop top bar */}
        <div className="hidden md:flex items-center justify-end px-8 py-3 gap-2">
          <ThemeToggle compact />
          {bellButton}
        </div>

        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 glass-sidebar">
          <button onClick={() => setSideOpen(true)} className="p-2 rounded-lg"
                  style={{ color: 'var(--text-secondary)' }}>
            <Menu className="w-5 h-5" />
          </button>
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                 style={{ background: 'var(--accent-gradient)' }}>
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm">HIDEYOU</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle compact />
            {bellButton}
          </div>
        </div>

        {/* Bell notification panel (portal-like, fixed overlay) */}
        {bellPanel}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 md:pt-0 relative z-10 animate-fade-in pb-20 md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <div className="mobile-bottom-nav">
        <div className="flex items-center justify-around py-2 px-2">
          {MOBILE_NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href
            return (
              <Link key={href} href={href}
                    className="flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-xl transition-all"
                    style={{
                      color: active ? 'var(--accent-1)' : 'var(--text-tertiary)',
                      background: active ? 'rgba(6,182,212,0.08)' : 'transparent',
                    }}>
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин назад`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} дн назад`
  return new Date(dateStr).toLocaleDateString('ru')
}
