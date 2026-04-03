'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Shield, LayoutDashboard, Users, CreditCard,
  Settings, BookOpen, LogOut, Menu, X,
  Package, TrendingUp, ChevronRight, Upload,
  Newspaper, Wifi, Globe, Tag, MessageCircle,
  ArrowLeftRight, Megaphone, Server, FileText,
  BarChart2, Wallet, Bot, Handshake,
} from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'

// Staff roles that can access admin panel
const STAFF_ROLES = ['ADMIN', 'EDITOR', 'INVESTOR', 'PARTNER']

type NavItem = {
  href: string
  icon: any
  label: string
  roles?: string[] // if undefined, all staff can see
}

type NavGroup = {
  title: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Финансы',
    items: [
      { href: '/admin',                  icon: LayoutDashboard, label: 'Дашборд' },
      { href: '/admin/transactions',     icon: ArrowLeftRight,  label: 'Транзакции',    roles: ['ADMIN', 'EDITOR'] },
      { href: '/admin/partners-investors', icon: Handshake,     label: 'Партнёры',      roles: ['ADMIN', 'EDITOR', 'INVESTOR', 'PARTNER'] },
      { href: '/admin/inkas',            icon: Wallet,          label: 'Инкассация',    roles: ['ADMIN', 'EDITOR', 'INVESTOR', 'PARTNER'] },
      { href: '/admin/reports-export',   icon: FileText,        label: 'Отчёты',        roles: ['ADMIN', 'EDITOR'] },
      { href: '/admin/compare',          icon: BarChart2,       label: 'Сравнение',     roles: ['ADMIN', 'EDITOR'] },
    ],
  },
  {
    title: 'Маркетинг',
    items: [
      { href: '/admin/marketing',        icon: Megaphone,       label: 'Реклама',       roles: ['ADMIN', 'EDITOR'] },
      { href: '/admin/webhook-payments', icon: CreditCard,      label: 'Webhook-платежи', roles: ['ADMIN'] },
    ],
  },
  {
    title: 'VPN',
    items: [
      { href: '/admin/users',            icon: Users,           label: 'Пользователи' },
      { href: '/admin/tariffs',          icon: Package,         label: 'Тарифы',        roles: ['ADMIN', 'EDITOR'] },
      { href: '/admin/payments',         icon: CreditCard,      label: 'Платежи' },
      { href: '/admin/infrastructure',   icon: Server,          label: 'Инфраструктура', roles: ['ADMIN', 'EDITOR'] },
      { href: '/admin/instructions',     icon: BookOpen,        label: 'Инструкции',    roles: ['ADMIN', 'EDITOR'] },
    ],
  },
  {
    title: 'Коммуникации',
    items: [
      { href: '/admin/news',             icon: Newspaper,       label: 'Новости',       roles: ['ADMIN', 'EDITOR'] },
      { href: '/admin/broadcast',        icon: MessageCircle,   label: 'Рассылки',      roles: ['ADMIN', 'EDITOR'] },
      { href: '/admin/communications',   icon: MessageCircle,   label: 'Воронки',       roles: ['ADMIN', 'EDITOR'] },
      { href: '/admin/promos',           icon: Tag,             label: 'Промокоды',     roles: ['ADMIN', 'EDITOR'] },
    ],
  },
  {
    title: 'Система',
    items: [
      { href: '/admin/analytics',        icon: TrendingUp,      label: 'Аналитика',     roles: ['ADMIN', 'EDITOR'] },
      { href: '/admin/bot',              icon: Bot,             label: 'Бот',            roles: ['ADMIN'] },
      { href: '/admin/proxies',          icon: Wifi,            label: 'Прокси',        roles: ['ADMIN'] },
      { href: '/admin/landing',          icon: Globe,           label: 'Лендинг',       roles: ['ADMIN'] },
      { href: '/admin/import',           icon: Upload,          label: 'Импорт',        roles: ['ADMIN'] },
      { href: '/admin/settings',         icon: Settings,        label: 'Настройки',     roles: ['ADMIN'] },
    ],
  },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [loading, setLoading]   = useState(true)
  const [sideOpen, setSideOpen] = useState(false)
  const [userRole, setUserRole] = useState<string>('ADMIN')

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(user => {
        if (!STAFF_ROLES.includes(user.role)) router.push('/dashboard')
        else {
          setUserRole(user.role)
          setLoading(false)
        }
      })
      .catch(() => router.push('/login'))
  }, [router])

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    router.push('/')
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface-1)' }}>
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-transparent"
             style={{ borderTopColor: '#8b5cf6', borderRightColor: '#06b6d4', animation: 'spin 0.8s linear infinite' }} />
      </div>
      <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--glass-border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }}>
            <Shield className="w-[18px] h-[18px] text-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[15px]" style={{ color: 'var(--text-primary)' }}>HIDEYOU</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>ADMIN</span>
          </div>
        </div>
        <button className="md:hidden p-1" style={{ color: 'var(--text-tertiary)' }}
                onClick={() => setSideOpen(false)}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-3 overflow-y-auto">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(
            item => !item.roles || item.roles.includes(userRole)
          )
          if (visibleItems.length === 0) return null
          return (
            <div key={group.title}>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider"
                   style={{ color: 'var(--text-tertiary)' }}>
                {group.title}
              </div>
              <div className="space-y-0.5 mt-1">
                {visibleItems.map(({ href, icon: Icon, label }) => {
                  const active = href === '/admin' ? pathname === href : pathname.startsWith(href)
                  return (
                    <Link key={href} href={href} onClick={() => setSideOpen(false)}
                          className="flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] transition-all duration-200 group"
                          style={{
                            background: active ? 'rgba(139,92,246,0.08)' : 'transparent',
                            color: active ? '#a78bfa' : 'var(--text-secondary)',
                          }}>
                      <Icon className="w-[18px] h-[18px] flex-shrink-0" style={{
                        color: active ? '#a78bfa' : 'var(--text-tertiary)',
                      }} />
                      <span className={active ? 'font-medium' : 'group-hover:text-[var(--text-primary)]'}>
                        {label}
                      </span>
                      {active && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full"
                             style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }} />
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
        <button onClick={logout}
                className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-[13px] transition-all duration-200 group"
                style={{ color: 'var(--text-secondary)' }}>
          <LogOut className="w-[18px] h-[18px] group-hover:text-red-400 transition-colors" />
          <span className="group-hover:text-red-400 transition-colors">Выйти</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex admin-layout" style={{ background: 'var(--surface-1)', color: 'var(--text-primary)' }}>
      <div className="aurora-bg" />

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-[250px] flex-shrink-0 glass-sidebar fixed left-0 top-0 h-screen z-30">
        <Sidebar />
      </aside>

      {/* Mobile sidebar */}
      {sideOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSideOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[270px] glass-sidebar animate-slide-right">
            <Sidebar />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-[250px]">
        {/* Desktop top bar */}
        <div className="hidden md:flex items-center justify-end px-8 py-3 gap-2">
          <ThemeToggle compact />
        </div>
        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 glass-sidebar">
          <button onClick={() => setSideOpen(true)} className="p-1.5" style={{ color: 'var(--text-secondary)' }}>
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-sm">Admin Panel</span>
          <ThemeToggle compact />
        </div>
        <main className="flex-1 overflow-y-auto p-4 md:p-8 md:pt-0 relative z-10 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
