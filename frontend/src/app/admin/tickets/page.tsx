'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  LifeBuoy, Search, ArrowLeft, Send, Info, FileText,
  Clock, CheckCircle, X, Loader2, MessageCircle,
  Zap, Undo2, Crown, Paperclip, BarChart2, MoreVertical, ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'

/* ── Types ──────────────────────────────────────────────── */

type TicketStatus = 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED'
type TicketCategory = 'BILLING' | 'TECH' | 'REFUND' | 'SUBSCRIPTION' | 'OTHER'
type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

interface TicketListItem {
  id: string
  subject: string
  category: TicketCategory
  status: TicketStatus
  priority: TicketPriority
  lastMessageAt: string
  unreadByAdmin: number
  user: {
    id: string
    email?: string
    telegramName?: string
    telegramId?: string
    avatarColor?: string
    initials?: string
    subStatus: string
    subExpireAt?: string
  }
  assignedTo?: { id: string; email?: string; telegramName?: string } | null
  lastMessage?: {
    body: string
    authorType: string
    createdAt: string
  } | null
}

interface Attachment {
  name: string
  url: string
  size?: number
  type?: string
}

interface TicketMessage {
  id: string
  authorType: 'USER' | 'ADMIN' | 'SYSTEM'
  authorId?: string
  body: string
  attachments?: Attachment[]
  isInternal: boolean
  createdAt: string
  author?: { id: string; telegramName?: string; email?: string; role: string; avatarColor?: string }
}

interface TicketDetail {
  id: string
  subject: string
  category: TicketCategory
  status: TicketStatus
  priority: TicketPriority
  createdAt: string
  assignedToId?: string | null
  assignedTo?: any
  user: {
    id: string
    email?: string
    telegramId?: string
    telegramName?: string
    createdAt: string
    subStatus: string
    subExpireAt?: string
    subLink?: string
    remnawaveUuid?: string
    balance: number
    bonusDays: number
    totalPaid: number
    paymentsCount: number
    customerSource?: string
    customerNotes?: string
    currentPlan?: string
  }
  messages: TicketMessage[]
  context: {
    recentPayments: Array<{
      id: string
      amount: number
      status: string
      createdAt: string
      tariff?: { name: string } | null
    }>
  }
}

interface Template {
  id: string
  name: string
  shortcut?: string | null
  body: string
  category?: TicketCategory | null
}

/* ── Constants ───────────────────────────────────────────── */

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  BILLING: '💰 Платежи',
  TECH: '🔧 Техника',
  REFUND: '↩️ Возврат',
  SUBSCRIPTION: '📱 Подписка',
  OTHER: '❓ Другое',
}

const STATUS_COLORS: Record<TicketStatus, string> = {
  OPEN: '#60a5fa',
  PENDING: '#fbbf24',
  RESOLVED: '#34d399',
  CLOSED: '#9ca3af',
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Открыт',
  PENDING: 'В работе',
  RESOLVED: 'Решён',
  CLOSED: 'Закрыт',
}

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  LOW: '#9ca3af',
  NORMAL: '#60a5fa',
  HIGH: '#fbbf24',
  URGENT: '#ef4444',
}

/* ── Helpers ─────────────────────────────────────────────── */

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 1) return 'вчера'
  if (diffDays < 7) return d.toLocaleDateString('ru', { weekday: 'short' })
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })
}

function formatFullTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

function formatMoney(n: number) {
  return new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽'
}

function groupByDay(msgs: TicketMessage[]) {
  const groups: Array<{ date: string; messages: TicketMessage[] }> = []
  for (const m of msgs) {
    const day = new Date(m.createdAt).toDateString()
    const last = groups[groups.length - 1]
    if (last && last.date === day) last.messages.push(m)
    else groups.push({ date: day, messages: [m] })
  }
  return groups
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === now.toDateString()) return 'Сегодня'
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера'
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long' })
}

function isImageUrl(url: string, type?: string) {
  if (type?.startsWith('image/')) return true
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(url)
}

/* ── Main Page ───────────────────────────────────────────── */

export default function AdminTicketsPage() {
  const [list, setList] = useState<TicketListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [showContext, setShowContext] = useState(false)
  const [filter, setFilter] = useState<'all' | 'mine' | 'unassigned' | 'urgent'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [search, setSearch] = useState('')

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') params.set('filter', filter)
      if (statusFilter) params.set('status', statusFilter)
      if (search) params.set('search', search)
      const res = await fetch(`/api/admin/tickets?${params}`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setList(data.items || [])
      }
    } catch {
      toast.error('Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [filter, statusFilter, search])

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/admin/tickets/${id}`, { credentials: 'include' })
      if (res.ok) setDetail(await res.json())
    } catch {
      toast.error('Ошибка загрузки тикета')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => { loadList() }, [loadList])
  useEffect(() => { if (selectedId) loadDetail(selectedId); else setDetail(null) }, [selectedId, loadDetail])

  useEffect(() => {
    fetch('/api/admin/tickets/templates', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setTemplates)
      .catch(() => {})
  }, [])

  useEffect(() => {
    const interval = setInterval(loadList, 15000)
    return () => clearInterval(interval)
  }, [loadList])

  useEffect(() => {
    if (!selectedId) return
    const interval = setInterval(() => loadDetail(selectedId), 8000)
    return () => clearInterval(interval)
  }, [selectedId, loadDetail])

  const updateTicket = async (updates: any) => {
    if (!detail) return
    try {
      const res = await fetch(`/api/admin/tickets/${detail.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        loadDetail(detail.id)
        loadList()
      }
    } catch {
      toast.error('Ошибка')
    }
  }

  // Full-screen layout: negative margins to break out of admin padding
  return (
    <div
      className="-m-4 md:-m-8 md:mt-0 flex"
      style={{
        height: 'calc(100vh - 60px)',
        background: 'var(--surface-1)',
      }}
    >
      {/* ── List column ── */}
      <aside
        className={`${selectedId ? 'hidden md:flex' : 'flex'} flex-col border-r`}
        style={{
          width: '100%',
          maxWidth: '360px',
          borderColor: 'var(--glass-border)',
          background: 'var(--surface-2)',
        }}
      >
        {/* Header */}
        <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <div className="flex items-center justify-between mb-2">
            <h1 className="font-bold text-lg flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <LifeBuoy className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />
              Тикеты
            </h1>
            <div className="flex gap-1">
              <Link
                href="/admin/tickets/templates"
                className="p-2 rounded-full transition hover:bg-white/[0.05]"
                style={{ color: 'var(--text-secondary)' }}
                title="Шаблоны"
              >
                <Zap className="w-4 h-4" />
              </Link>
              <Link
                href="/admin/tickets/stats"
                className="p-2 rounded-full transition hover:bg-white/[0.05]"
                style={{ color: 'var(--text-secondary)' }}
                title="Статистика"
              >
                <BarChart2 className="w-4 h-4" />
              </Link>
            </div>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <input
              className="w-full pl-9 pr-3 py-2 text-sm rounded-full outline-none"
              style={{ background: 'var(--surface-1)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
              placeholder="Поиск..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'thin' }}>
            {([
              { key: 'all', label: 'Все' },
              { key: 'mine', label: 'Мои' },
              { key: 'unassigned', label: 'Свободные' },
              { key: 'urgent', label: 'Срочные' },
            ] as const).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="px-3 py-1 rounded-full text-xs font-medium transition whitespace-nowrap shrink-0"
                style={{
                  background: filter === f.key ? 'var(--accent-1)' : 'var(--surface-1)',
                  color: filter === f.key ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>Загрузка...</div>}
          {!loading && list.length === 0 && (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Нет тикетов
            </div>
          )}
          {!loading && list.map(t => {
            const initials = t.user.initials || (t.user.telegramName || t.user.email || '?').slice(0, 2).toUpperCase()
            const isActive = selectedId === t.id
            return (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className="w-full text-left px-4 py-3 transition hover:bg-white/[0.03] relative"
                style={{
                  background: isActive ? 'var(--surface-1)' : 'transparent',
                }}
              >
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: 'var(--accent-1)' }} />
                )}
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold"
                      style={{ background: t.user.avatarColor || '#534AB7', color: '#fff' }}
                    >
                      {initials.slice(0, 2)}
                    </div>
                    <div
                      className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                      style={{
                        background: STATUS_COLORS[t.status],
                        borderColor: 'var(--surface-2)',
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {t.user.telegramName || t.user.email || 'Без имени'}
                      </span>
                      <span className="text-[10px] shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                        {formatTime(t.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {CATEGORY_LABELS[t.category]}
                      </span>
                      {t.priority !== 'NORMAL' && (
                        <span
                          className="text-[9px] px-1 rounded font-semibold"
                          style={{ background: `${PRIORITY_COLORS[t.priority]}20`, color: PRIORITY_COLORS[t.priority] }}
                        >
                          {t.priority}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                        {t.subject}
                      </p>
                      {t.unreadByAdmin > 0 && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0"
                          style={{ background: '#ef4444', color: '#fff', minWidth: '18px', textAlign: 'center' }}
                        >
                          {t.unreadByAdmin}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* ── Chat column ── */}
      <main className={`${selectedId ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-w-0`}>
        {!detail && !detailLoading && (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
            <div className="text-center">
              <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>Выберите тикет из списка</p>
            </div>
          </div>
        )}
        {detailLoading && !detail && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
          </div>
        )}
        {detail && (
          <TicketChat
            ticket={detail}
            templates={templates}
            onBack={() => setSelectedId(null)}
            onUpdate={() => loadDetail(detail.id)}
            onRefreshList={loadList}
            onUpdateTicket={updateTicket}
            onToggleContext={() => setShowContext(s => !s)}
          />
        )}
      </main>

      {/* ── Context panel (desktop) ── */}
      {detail && (
        <aside
          className="hidden xl:flex flex-col border-l overflow-y-auto"
          style={{
            width: '340px',
            borderColor: 'var(--glass-border)',
            background: 'var(--surface-2)',
          }}
        >
          <ContextPanel ticket={detail} onClose={() => setShowContext(false)} onUpdate={() => loadDetail(detail.id)} />
        </aside>
      )}

      {/* ── Context panel (mobile overlay) ── */}
      {detail && showContext && (
        <div className="xl:hidden fixed inset-0 z-50 flex items-end md:items-center md:justify-center" onClick={() => setShowContext(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)' }} />
          <div
            className="relative w-full md:max-w-md md:rounded-2xl rounded-t-2xl overflow-y-auto flex flex-col"
            style={{
              maxHeight: '90vh',
              background: 'var(--surface-2)',
              border: '1px solid var(--glass-border)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between p-3" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--glass-border)' }}>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Клиент</h3>
              <button onClick={() => setShowContext(false)} className="p-1" style={{ color: 'var(--text-tertiary)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <ContextPanel ticket={detail} onClose={() => setShowContext(false)} onUpdate={() => loadDetail(detail.id)} hideHeader />
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Chat Component ─────────────────────────────────────── */

function TicketChat({
  ticket, templates, onBack, onUpdate, onRefreshList, onUpdateTicket, onToggleContext,
}: {
  ticket: TicketDetail
  templates: Template[]
  onBack: () => void
  onUpdate: () => void
  onRefreshList: () => void
  onUpdateTicket: (u: any) => void
  onToggleContext: () => void
}) {
  const [text, setText] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [sending, setSending] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(0)
  const [aiLoading, setAiLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [ticket.messages.length])

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Можно загружать только изображения')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Файл больше 10 МБ')
      return
    }
    const fd = new FormData()
    fd.append('file', file)
    setUploading(c => c + 1)
    try {
      const res = await fetch('/api/tickets/upload', { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Upload failed')
      }
      const data = await res.json()
      setAttachments(prev => [...prev, { name: data.name, url: data.url, size: data.size, type: data.type }])
    } catch (e: any) {
      toast.error(e?.message || 'Ошибка загрузки')
    } finally {
      setUploading(c => c - 1)
    }
  }

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    for (let i = 0; i < Math.min(files.length, 5); i++) uploadFile(files[i])
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) uploadFile(file)
      }
    }
  }

  const aiSuggest = async () => {
    setAiLoading(true)
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}/ai-suggest`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (!data.configured) {
        toast.error(data.message || 'AI не настроен')
        return
      }
      setText(prev => prev + (prev ? '\n\n' : '') + data.suggestion)
    } catch {
      toast.error('Ошибка AI')
    } finally {
      setAiLoading(false)
    }
  }

  const send = async () => {
    if (!text.trim() && attachments.length === 0) return
    setSending(true)
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: text.trim() || '[вложение]',
          isInternal,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      })
      if (!res.ok) throw new Error()
      setText('')
      setAttachments([])
      onUpdate()
      onRefreshList()
    } catch {
      toast.error('Ошибка отправки')
    } finally {
      setSending(false)
    }
  }

  const applyTemplate = (t: Template) => {
    let body = t.body
    body = body.replace(/\{\{user\.name\}\}/g, ticket.user.telegramName || ticket.user.email || '')
    body = body.replace(/\{\{user\.email\}\}/g, ticket.user.email || '')
    body = body.replace(/\{\{tariff\.name\}\}/g, ticket.user.currentPlan || '')
    body = body.replace(/\{\{subscription\.expireAt\}\}/g, ticket.user.subExpireAt ? new Date(ticket.user.subExpireAt).toLocaleDateString('ru') : '')
    setText(body)
    setShowTemplates(false)
  }

  const grouped = groupByDay(ticket.messages.filter(m => !m.isInternal || true)) // show all for admin

  return (
    <>
      {/* ── Chat Header (Telegram-style) ── */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 shrink-0"
        style={{
          borderBottom: '1px solid var(--glass-border)',
          background: 'var(--surface-2)',
          minHeight: '56px',
        }}
      >
        <button
          onClick={onBack}
          className="md:hidden p-1.5 rounded-full transition hover:bg-white/[0.05]"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <button
          onClick={onToggleContext}
          className="flex items-center gap-3 flex-1 min-w-0 text-left transition hover:opacity-80"
        >
          <div className="relative shrink-0">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold"
              style={{ background: '#534AB7', color: '#fff' }}
            >
              {(ticket.user.telegramName || ticket.user.email || '?').slice(0, 2).toUpperCase()}
            </div>
            <div
              className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
              style={{
                background: STATUS_COLORS[ticket.status],
                borderColor: 'var(--surface-2)',
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {ticket.user.telegramName || ticket.user.email || 'Без имени'}
            </h3>
            <p className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
              {CATEGORY_LABELS[ticket.category]} · {ticket.subject}
            </p>
          </div>
        </button>

        <div className="flex gap-1 shrink-0">
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu(s => !s)}
              className="px-2.5 py-1 rounded-full text-xs font-semibold transition"
              style={{
                background: `${STATUS_COLORS[ticket.status]}20`,
                color: STATUS_COLORS[ticket.status],
              }}
            >
              {STATUS_LABELS[ticket.status]}
            </button>
            {showStatusMenu && (
              <div
                className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden z-20"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--glass-border)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                  minWidth: '140px',
                }}
              >
                {(['OPEN','PENDING','RESOLVED','CLOSED'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      onUpdateTicket({ status: s })
                      setShowStatusMenu(false)
                    }}
                    className="w-full px-3 py-2 text-xs text-left transition hover:bg-white/[0.05]"
                    style={{ color: STATUS_COLORS[s] }}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onToggleContext}
            className="xl:hidden p-2 rounded-full transition hover:bg-white/[0.05]"
            style={{ color: 'var(--text-secondary)' }}
            title="Контекст клиента"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3"
        style={{
          background: 'var(--surface-1)',
          backgroundImage: 'radial-gradient(circle at 15% 15%, rgba(96,165,250,0.05), transparent 40%), radial-gradient(circle at 85% 85%, rgba(167,139,250,0.05), transparent 40%)',
        }}
      >
        {grouped.map((group, gi) => (
          <div key={gi}>
            <div className="flex justify-center my-3">
              <span
                className="px-3 py-1 rounded-full text-[11px] font-medium"
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  color: '#fff',
                  backdropFilter: 'blur(8px)',
                }}
              >
                {dayLabel(group.date)}
              </span>
            </div>
            {group.messages.map((m, mi) => {
              const isAdmin = m.authorType === 'ADMIN'
              const isSystem = m.authorType === 'SYSTEM'
              const prev = group.messages[mi - 1]
              const next = group.messages[mi + 1]
              const sameAuthorPrev = prev && prev.authorType === m.authorType && prev.isInternal === m.isInternal
              const sameAuthorNext = next && next.authorType === m.authorType && next.isInternal === m.isInternal

              if (isSystem) {
                return (
                  <div key={m.id} className="flex justify-center my-2">
                    <div
                      className="px-3 py-1.5 rounded-full text-xs max-w-[85%] text-center"
                      style={{
                        background: 'rgba(52,211,153,0.15)',
                        color: '#34d399',
                        border: '1px solid rgba(52,211,153,0.3)',
                      }}
                    >
                      ⚙️ {m.body}
                    </div>
                  </div>
                )
              }

              const showTail = !sameAuthorNext

              return (
                <div
                  key={m.id}
                  className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}
                  style={{ marginTop: sameAuthorPrev ? '3px' : '10px' }}
                >
                  <div
                    className="max-w-[85%] md:max-w-[70%]"
                    style={{
                      background: m.isInternal
                        ? 'rgba(251,191,36,0.15)'
                        : isAdmin
                          ? 'var(--accent-1)'
                          : 'var(--surface-2)',
                      color: m.isInternal ? '#fbbf24' : isAdmin ? '#fff' : 'var(--text-primary)',
                      border: m.isInternal ? '1px solid rgba(251,191,36,0.3)' : 'none',
                      borderRadius: isAdmin
                        ? `18px 18px ${showTail ? '4px' : '18px'} 18px`
                        : `18px 18px 18px ${showTail ? '4px' : '18px'}`,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      padding: '7px 11px',
                    }}
                  >
                    {m.isInternal && (
                      <div className="text-[10px] uppercase font-bold mb-0.5">📝 ВНУТРЕННЯЯ ЗАМЕТКА</div>
                    )}
                    {/* Attachments */}
                    {m.attachments && Array.isArray(m.attachments) && m.attachments.length > 0 && (
                      <div className="space-y-1 mb-1 -mx-0.5">
                        {m.attachments.map((a, ai) => {
                          const isImg = isImageUrl(a.url, a.type)
                          return isImg ? (
                            <a key={ai} href={a.url} target="_blank" rel="noreferrer" className="block">
                              <img
                                src={a.url}
                                alt={a.name}
                                className="rounded-xl max-w-full max-h-72 object-cover"
                                style={{ minWidth: '140px' }}
                              />
                            </a>
                          ) : (
                            <a
                              key={ai}
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 rounded-lg p-2 text-xs"
                              style={{ background: isAdmin ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)' }}
                            >
                              <FileText className="w-4 h-4" />
                              <span className="truncate flex-1">{a.name}</span>
                            </a>
                          )
                        })}
                      </div>
                    )}
                    {m.body && m.body !== '[вложение]' && (
                      <div className="whitespace-pre-wrap break-words text-sm leading-snug">{m.body}</div>
                    )}
                    <div
                      className="text-[10px] mt-0.5 text-right"
                      style={{
                        color: m.isInternal ? 'rgba(251,191,36,0.7)' : isAdmin ? 'rgba(255,255,255,0.7)' : 'var(--text-tertiary)',
                      }}
                    >
                      {formatFullTime(m.createdAt)}
                      {isAdmin && m.author && ' · ' + (m.author.telegramName || m.author.email || 'admin').slice(0, 12)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* ── Input area ── */}
      {ticket.status !== 'CLOSED' && (
        <div
          className="shrink-0"
          style={{
            borderTop: '1px solid var(--glass-border)',
            background: 'var(--surface-2)',
          }}
        >
          {/* Templates popover */}
          {showTemplates && (
            <div
              className="mx-2 mt-2 rounded-xl overflow-hidden max-h-40 overflow-y-auto"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}
            >
              {templates.length === 0 && (
                <p className="text-xs p-3 text-center" style={{ color: 'var(--text-tertiary)' }}>
                  Нет шаблонов. <Link href="/admin/tickets/templates" className="underline" style={{ color: 'var(--accent-1)' }}>Создать</Link>
                </p>
              )}
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  className="w-full text-left p-2.5 text-xs transition hover:bg-white/[0.05]"
                  style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--glass-border)' }}
                >
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{t.name}</div>
                  <div className="truncate mt-0.5 opacity-70">{t.body.slice(0, 80)}</div>
                </button>
              ))}
            </div>
          )}

          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="px-3 pt-2 flex gap-2 flex-wrap">
              {attachments.map((a, i) => {
                const isImg = isImageUrl(a.url, a.type)
                return (
                  <div
                    key={i}
                    className="relative rounded-lg overflow-hidden"
                    style={{ border: '1px solid var(--glass-border)' }}
                  >
                    {isImg ? (
                      <img src={a.url} alt="" className="w-14 h-14 object-cover" />
                    ) : (
                      <div className="w-14 h-14 flex items-center justify-center" style={{ background: 'var(--surface-1)' }}>
                        <FileText className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                      </div>
                    )}
                    <button
                      onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1 -right-1 p-0.5 rounded-full"
                      style={{ background: '#ef4444', color: '#fff' }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
              {uploading > 0 && (
                <div className="w-14 h-14 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-1)' }}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />

          {/* Textarea — full width, own row */}
          <div className="px-2 pt-2">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
              }}
              placeholder={isInternal ? '📝 Внутренняя заметка (не видна клиенту)...' : 'Ответ клиенту...'}
              rows={2}
              className="w-full px-4 py-2.5 text-sm rounded-2xl resize-none outline-none"
              style={{
                minHeight: '48px',
                maxHeight: '140px',
                background: isInternal ? 'rgba(251,191,36,0.1)' : 'var(--surface-1)',
                color: 'var(--text-primary)',
                border: `1px solid ${isInternal ? 'rgba(251,191,36,0.3)' : 'var(--glass-border)'}`,
              }}
              disabled={sending}
            />
          </div>

          {/* Toolbar — own row */}
          <div className="px-2 py-2 flex items-center gap-0.5">
            <IconButton onClick={() => fileInputRef.current?.click()} title="Фото">
              <Paperclip className="w-5 h-5" />
            </IconButton>
            <IconButton onClick={() => setShowTemplates(s => !s)} active={showTemplates} title="Шаблоны">
              <Zap className="w-5 h-5" />
            </IconButton>
            <IconButton onClick={aiSuggest} disabled={aiLoading} title="AI">
              {aiLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span className="text-base">🤖</span>}
            </IconButton>
            <IconButton
              onClick={() => setIsInternal(s => !s)}
              active={isInternal}
              activeColor="#fbbf24"
              title="Внутренняя заметка"
            >
              <span className="text-base">📝</span>
            </IconButton>
            <div className="flex-1" />
            <button
              onClick={send}
              disabled={sending || (!text.trim() && attachments.length === 0)}
              className="px-5 py-2 rounded-full disabled:opacity-50 transition inline-flex items-center gap-1.5 text-sm font-semibold"
              style={{ background: 'var(--accent-1)', color: '#fff' }}
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Отправить</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {ticket.status === 'CLOSED' && (
        <div className="p-4 text-center text-sm shrink-0" style={{ color: 'var(--text-tertiary)', borderTop: '1px solid var(--glass-border)', background: 'var(--surface-2)' }}>
          🔒 Тикет закрыт
        </div>
      )}
    </>
  )
}

/* ── Icon Button ─────────────────────────────────────────── */

function IconButton({
  children, onClick, active, activeColor, title, disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  activeColor?: string
  title?: string
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-2 rounded-full transition hover:bg-white/[0.08] disabled:opacity-50"
      style={{
        color: active ? (activeColor || 'var(--accent-1)') : 'var(--text-secondary)',
        background: active ? `${activeColor || 'var(--accent-1)'}15` : 'transparent',
      }}
    >
      {children}
    </button>
  )
}

/* ── Context Panel ──────────────────────────────────────── */

function ContextPanel({
  ticket, onClose, onUpdate, hideHeader,
}: {
  ticket: TicketDetail
  onClose: () => void
  onUpdate: () => void
  hideHeader?: boolean
}) {
  const u = ticket.user
  const initials = (u.telegramName || u.email || '?').slice(0, 2).toUpperCase()

  return (
    <div className="p-4 space-y-4">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
            Клиент
          </h3>
        </div>
      )}

      {/* User info card */}
      <div
        className="rounded-2xl p-4"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-base font-bold shrink-0"
            style={{ background: '#534AB7', color: '#fff' }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              {u.telegramName || u.email || 'Без имени'}
            </p>
            {u.email && <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{u.email}</p>}
            {u.telegramId && <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>TG: {u.telegramId}</p>}
          </div>
        </div>

        <Link
          href={`/admin/users/${u.id}`}
          className="block text-center py-2 rounded-xl text-xs font-medium transition"
          style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}
        >
          Открыть профиль →
        </Link>
      </div>

      {/* Subscription */}
      <div
        className="rounded-2xl p-3 space-y-2"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}
      >
        <h4 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          Подписка
        </h4>
        <Row label="Статус" value={u.subStatus} valueColor={u.subStatus === 'ACTIVE' ? '#34d399' : '#f87171'} />
        {u.subExpireAt && <Row label="До" value={new Date(u.subExpireAt).toLocaleDateString('ru')} />}
        <Row label="Оплачено" value={formatMoney(Number(u.totalPaid) || 0)} />
        <Row label="Платежей" value={String(u.paymentsCount || 0)} />
        <Row label="Баланс" value={formatMoney(Number(u.balance) || 0)} />
        {u.bonusDays > 0 && <Row label="Бонусы" value={`${u.bonusDays} дн.`} />}
      </div>

      {/* Recent payments */}
      {ticket.context.recentPayments.length > 0 && (
        <div
          className="rounded-2xl p-3 space-y-2"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}
        >
          <h4 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
            Последние платежи
          </h4>
          {ticket.context.recentPayments.map(p => (
            <div key={p.id} className="flex justify-between items-center text-xs">
              <div className="min-w-0">
                <div className="truncate" style={{ color: 'var(--text-primary)' }}>
                  {p.tariff?.name || '—'}
                </div>
                <div style={{ color: 'var(--text-tertiary)' }}>
                  {new Date(p.createdAt).toLocaleDateString('ru')}
                </div>
              </div>
              <span style={{ color: p.status === 'PAID' ? '#34d399' : '#f87171' }}>
                {formatMoney(Number(p.amount))}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <QuickActions ticket={ticket} onUpdate={onUpdate} />
    </div>
  )
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ color: valueColor || 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

/* ── Quick Actions ──────────────────────────────────────── */

function QuickActions({ ticket, onUpdate }: { ticket: TicketDetail; onUpdate: () => void }) {
  const [loading, setLoading] = useState(false)

  const action = async (endpoint: string, body?: any, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}/actions/${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Ошибка')
        return
      }
      toast.success('Выполнено')
      onUpdate()
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  const extend = async (days: number) => {
    await action('extend', { days }, `Продлить подписку на ${days} дн?`)
  }

  const grantBonus = async () => {
    const days = prompt('Сколько бонусных дней начислить?', '3')
    if (!days) return
    const n = parseInt(days, 10)
    if (!n || n < 1) return
    await action('grant-bonus', { days: n })
  }

  const addBalance = async () => {
    const amt = prompt('Сколько рублей на баланс?', '100')
    if (!amt) return
    const n = parseFloat(amt)
    if (!n || n <= 0) return
    const reason = prompt('Причина') || undefined
    await action('add-balance', { amount: n, reason })
  }

  const refund = async () => {
    if (!confirm('Вернуть последний платёж через ЮKassa?')) return
    await action('refund', {})
  }

  const resetTraffic = async () => {
    if (!confirm('Сбросить счётчик трафика?')) return
    await action('reset-traffic', {})
  }

  return (
    <div
      className="rounded-2xl p-3 space-y-2"
      style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}
    >
      <h4 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
        Быстрые действия
      </h4>

      <div>
        <p className="text-[10px] mb-1" style={{ color: 'var(--text-tertiary)' }}>Продлить</p>
        <div className="grid grid-cols-4 gap-1">
          {[1, 3, 7, 30].map(d => (
            <button
              key={d}
              onClick={() => extend(d)}
              disabled={loading}
              className="py-2 rounded-lg text-xs font-bold transition disabled:opacity-50"
              style={{
                background: 'rgba(52,211,153,0.1)',
                color: '#34d399',
                border: '1px solid rgba(52,211,153,0.3)',
              }}
            >
              +{d}д
            </button>
          ))}
        </div>
      </div>

      <ActionButton icon="🎁" onClick={grantBonus} disabled={loading}>
        Бонусные дни...
      </ActionButton>
      <ActionButton icon="💰" onClick={addBalance} disabled={loading}>
        Начислить на баланс...
      </ActionButton>
      <ActionButton icon="♻️" onClick={resetTraffic} disabled={loading}>
        Сбросить трафик
      </ActionButton>
      <ActionButton icon="↩️" onClick={refund} disabled={loading} danger>
        Вернуть последний платёж
      </ActionButton>
    </div>
  )
}

function ActionButton({
  icon, children, onClick, disabled, danger,
}: {
  icon: string
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition hover:brightness-110 disabled:opacity-50 flex items-center gap-2"
      style={{
        background: danger ? 'rgba(239,68,68,0.1)' : 'var(--surface-2)',
        color: danger ? '#f87171' : 'var(--text-secondary)',
        border: `1px solid ${danger ? 'rgba(239,68,68,0.2)' : 'var(--glass-border)'}`,
      }}
    >
      <span className="text-sm">{icon}</span>
      {children}
    </button>
  )
}
