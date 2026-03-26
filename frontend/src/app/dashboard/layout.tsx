'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Shield, LayoutDashboard, CreditCard, BookOpen,
  Users, User, LogOut, Menu, X, ChevronRight, Bell, History,
} from 'lucide-react'

interface User {
  id: string; email?: string; telegramName?: string
  subStatus: string; subExpireAt?: string; role: string
}

const NAV = [
  { href: '/dashboard',              icon: LayoutDashboard, label: 'Главная' },
  { href: '/dashboard/subscription', icon: Shield,          label: 'Подписка' },
  { href: '/dashboard/plans',        icon: CreditCard,      label: 'Тарифы' },
  { href: '/dashboard/instructions', icon: BookOpen,        label: 'Инструкции' },
  { href: '/dashboard/referral',     icon: Users,           label: 'Рефералы' },
  { href: '/dashboard/payments',     icon: History,         label: 'Платежи' },
  { href: '/dashboard/profile',      icon: User,            label: 'Профиль' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [user, setUser]       = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return null

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-6 py-5 border-b border-gray-800">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-lg">HIDEYOU</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href}
                  onClick={() => setSideOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
                              transition-all duration-150
                              ${active
                                ? 'bg-brand-600/20 text-brand-300 font-medium'
                                : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
              {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-brand-400" />}
            </Link>
          )
        })}
      </nav>

      {/* User + logout */}
      <div className="px-3 py-4 border-t border-gray-800 space-y-2">
        <SubBadge status={user.subStatus} expireAt={user.subExpireAt} />
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-brand-600/20 border border-brand-500/30
                          flex items-center justify-center text-sm font-semibold text-brand-300">
            {(user.telegramName || user.email || 'U')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {user.telegramName || user.email?.split('@')[0] || 'Пользователь'}
            </p>
            <p className="text-xs text-gray-500 truncate">{user.email || '@' + user.telegramName}</p>
          </div>
          <button onClick={logout} className="p-1.5 text-gray-500 hover:text-red-400
                                               hover:bg-red-500/10 rounded-lg transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-gray-900 border-r border-gray-800 flex-shrink-0">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {sideOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
               onClick={() => setSideOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-gray-900 border-r border-gray-800">
            <Sidebar />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <div className="md:hidden flex items-center justify-between
                        px-4 py-3 bg-gray-900 border-b border-gray-800">
          <button onClick={() => setSideOpen(true)} className="p-2 text-gray-400 hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand-400" />
            <span className="font-bold">HIDEYOU</span>
          </div>
          <button className="p-2 text-gray-400 hover:text-white">
            <Bell className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}

function SubBadge({ status, expireAt }: { status: string; expireAt?: string }) {
  const isActive = status === 'ACTIVE'
  const days = expireAt
    ? Math.max(0, Math.ceil((new Date(expireAt).getTime() - Date.now()) / 86400_000))
    : null

  return (
    <div className={`px-3 py-2 rounded-xl border text-xs
                     ${isActive
                       ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                       : 'bg-gray-800 border-gray-700 text-gray-500'}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium">{isActive ? 'Подписка активна' : 'Нет подписки'}</span>
        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
      </div>
      {isActive && days !== null && (
        <p className="text-emerald-600 mt-0.5">Осталось {days} дн.</p>
      )}
    </div>
  )
}
