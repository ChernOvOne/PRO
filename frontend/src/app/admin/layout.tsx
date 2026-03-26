'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Shield, LayoutDashboard, Users, CreditCard,
  Settings, BookOpen, LogOut, Menu, X,
  Package, TrendingUp, ChevronRight, Upload,
} from 'lucide-react'

const NAV = [
  { href: '/admin',              icon: LayoutDashboard, label: 'Дашборд' },
  { href: '/admin/users',        icon: Users,           label: 'Пользователи' },
  { href: '/admin/payments',     icon: CreditCard,      label: 'Платежи' },
  { href: '/admin/tariffs',      icon: Package,         label: 'Тарифы' },
  { href: '/admin/instructions', icon: BookOpen,        label: 'Инструкции' },
  { href: '/admin/analytics',    icon: TrendingUp,      label: 'Аналитика' },
  { href: '/admin/import',       icon: Upload,          label: 'Импорт базы' },
  { href: '/admin/settings',     icon: Settings,        label: 'Настройки' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [loading, setLoading]   = useState(true)
  const [sideOpen, setSideOpen] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(user => {
        if (user.role !== 'ADMIN') router.push('/dashboard')
        else setLoading(false)
      })
      .catch(() => router.push('/login'))
  }, [router])

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    router.push('/')
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-brand-400" />
          <span className="font-bold">HIDEYOU</span>
          <span className="badge bg-red-500/20 text-red-400 text-[10px]">ADMIN</span>
        </div>
        <button className="md:hidden text-gray-500" onClick={() => setSideOpen(false)}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = href === '/admin' ? pathname === href : pathname.startsWith(href)
          return (
            <Link key={href} href={href} onClick={() => setSideOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
                              transition-all
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

      <div className="px-3 py-4 border-t border-gray-800">
        <button onClick={logout}
                className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm
                           text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <LogOut className="w-4 h-4" />
          Выйти
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 flex">
      <aside className="hidden md:flex flex-col w-60 bg-gray-900 border-r border-gray-800 flex-shrink-0">
        <Sidebar />
      </aside>

      {sideOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSideOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-gray-900 border-r border-gray-800">
            <Sidebar />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="md:hidden flex items-center gap-3 px-4 py-3
                        bg-gray-900 border-b border-gray-800">
          <button onClick={() => setSideOpen(true)} className="p-1.5 text-gray-400 hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-sm">Admin Panel</span>
        </div>
        <main className="flex-1 overflow-y-auto p-4 md:p-8 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
