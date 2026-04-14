'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  LifeBuoy, Plus, Send, ArrowLeft, MessageCircle, Clock,
  CheckCircle, X, Loader2, Paperclip, Image as ImageIcon,
  Smile, Star, Download, FileText,
} from 'lucide-react'
import toast from 'react-hot-toast'

// Authenticated fetch — adds Bearer token from localStorage for Telegram WebView
function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let headers: Record<string, string> = { ...(options.headers as any) }
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    if (token) headers.Authorization = `Bearer ${token}`
  } catch {}
  return fetch(url, { ...options, credentials: 'include', headers })
}

type TicketStatus = 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED'
type TicketCategory = 'BILLING' | 'TECH' | 'REFUND' | 'SUBSCRIPTION' | 'OTHER'

interface Attachment {
  name: string
  url: string
  size?: number
  type?: string
}

interface TicketListItem {
  id: string
  subject: string
  category: TicketCategory
  status: TicketStatus
  lastMessageAt: string
  unreadCount: number
  lastMessage: {
    body: string
    authorType: 'USER' | 'ADMIN' | 'SYSTEM'
    createdAt: string
  } | null
  createdAt: string
}

interface TicketMessage {
  id: string
  authorType: 'USER' | 'ADMIN' | 'SYSTEM'
  body: string
  attachments?: Attachment[]
  createdAt: string
  readByAdminAt?: string | null
  author?: { id: string; telegramName?: string; email?: string; role: string }
}

interface TicketDetail {
  id: string
  subject: string
  category: TicketCategory
  status: TicketStatus
  rating?: number | null
  createdAt: string
  messages: TicketMessage[]
}

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  BILLING: '💰 Платежи',
  TECH: '🔧 Технические',
  REFUND: '↩️ Возврат',
  SUBSCRIPTION: '📱 Подписка',
  OTHER: '❓ Другое',
}

const STATUS_LABELS: Record<TicketStatus, { text: string; color: string; icon: typeof Clock }> = {
  OPEN: { text: 'Открыт', color: '#60a5fa', icon: Clock },
  PENDING: { text: 'В работе', color: '#fbbf24', icon: MessageCircle },
  RESOLVED: { text: 'Решён', color: '#34d399', icon: CheckCircle },
  CLOSED: { text: 'Закрыт', color: '#9ca3af', icon: X },
}

const EMOJI_LIST = [
  '😊', '😂', '🤣', '❤️', '👍', '👎', '🙏', '😢', '😡', '😎',
  '🔥', '✨', '⭐', '💯', '✅', '❌', '⚠️', '💰', '💸', '📱',
  '💻', '🔧', '🌐', '🚀', '🎉', '🙈', '🤔', '😅', '😭', '🥰',
]

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

function formatFileSize(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isImageUrl(url: string, type?: string) {
  if (type?.startsWith('image/')) return true
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(url)
}

// Group messages by day for date separators
function groupByDay(msgs: TicketMessage[]) {
  const groups: Array<{ date: string; messages: TicketMessage[] }> = []
  for (const m of msgs) {
    const day = new Date(m.createdAt).toDateString()
    const last = groups[groups.length - 1]
    if (last && last.date === day) {
      last.messages.push(m)
    } else {
      groups.push({ date: day, messages: [m] })
    }
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

export default function SupportPage() {
  const [list, setList] = useState<TicketListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/tickets')
      if (res.ok) setList(await res.json())
    } catch {
      toast.error('Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const res = await authFetch(`/api/tickets/${id}`)
      if (res.ok) setDetail(await res.json())
    } catch {
      toast.error('Ошибка загрузки тикета')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => { loadList() }, [loadList])

  // Auto-open create wizard when launched from bot with start_param
  // Examples: startapp=support, startapp=support_tech, startapp=ticket_<id>
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp
    const startParam: string | undefined = tg?.initDataUnsafe?.start_param
    if (!startParam) return

    // Deep link to specific ticket: ticket_<id>
    if (startParam.startsWith('ticket_')) {
      const id = startParam.slice(7)
      if (id) setSelectedId(id)
      return
    }

    // Open creation wizard with preselected category
    if (startParam === 'support' || startParam.startsWith('support_')) {
      const cat = startParam.slice('support_'.length).toUpperCase()
      const validCats = ['BILLING', 'TECH', 'REFUND', 'SUBSCRIPTION', 'OTHER']
      setShowCreate(true)
      if (validCats.includes(cat)) {
        // Store category hint to be picked up by modal
        ;(window as any).__supportPrefillCategory = cat
      }
    }
  }, [])

  useEffect(() => {
    if (selectedId) loadDetail(selectedId)
    else setDetail(null)
  }, [selectedId, loadDetail])

  useEffect(() => {
    if (!selectedId) return
    const interval = setInterval(() => loadDetail(selectedId), 8000)
    return () => clearInterval(interval)
  }, [selectedId, loadDetail])

  // When ticket is selected, render full-screen chat (break out of dashboard layout)
  if (selectedId && detail) {
    return (
      <div
        className="-m-4 md:-m-6 lg:-m-8 flex flex-col"
        style={{
          height: 'calc(100vh - 60px)',
          background: 'var(--surface-1)',
        }}
      >
        <TicketChat
          ticket={detail}
          onBack={() => setSelectedId(null)}
          onUpdate={() => loadDetail(selectedId)}
          onRefreshList={loadList}
        />
      </div>
    )
  }

  if (selectedId && detailLoading && !detail) {
    return (
      <div className="text-center py-20" style={{ color: 'var(--text-tertiary)' }}>
        <Loader2 className="w-8 h-8 animate-spin mx-auto" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {!selectedId && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <LifeBuoy className="w-6 h-6" />
                Поддержка
              </h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Мы отвечаем в течение 15 минут
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition"
              style={{ background: 'var(--accent-1)', color: '#fff' }}
            >
              <Plus className="w-4 h-4" />
              Новое обращение
            </button>
          </div>

          {loading && <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>Загрузка...</div>}

          {!loading && list.length === 0 && !showCreate && (
            <div className="glass-card rounded-2xl p-8 text-center">
              <LifeBuoy className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
              <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                У вас пока нет обращений
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Создайте первое обращение, если возникли вопросы
              </p>
            </div>
          )}

          {!loading && list.length > 0 && (
            <div className="space-y-2">
              {list.map(t => {
                const s = STATUS_LABELS[t.status]
                const StatusIcon = s.icon
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className="w-full glass-card rounded-2xl p-4 text-left transition hover:brightness-110"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {CATEGORY_LABELS[t.category]}
                          </span>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: `${s.color}20`, color: s.color }}
                          >
                            <StatusIcon className="w-3 h-3 inline -mt-0.5 mr-0.5" />
                            {s.text}
                          </span>
                          {t.unreadCount > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#ef4444', color: '#fff' }}>
                              {t.unreadCount}
                            </span>
                          )}
                        </div>
                        <h3 className="font-medium mt-1 truncate" style={{ color: 'var(--text-primary)' }}>
                          {t.subject}
                        </h3>
                        {t.lastMessage && (
                          <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-tertiary)' }}>
                            {t.lastMessage.authorType === 'ADMIN' ? '👨‍💼 ' : t.lastMessage.authorType === 'SYSTEM' ? '⚙️ ' : '👤 '}
                            {t.lastMessage.body.slice(0, 100)}
                          </p>
                        )}
                      </div>
                      <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
                        {formatTime(t.lastMessageAt)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {showCreate && (
        <CreateTicketModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false)
            loadList()
            setSelectedId(id)
          }}
        />
      )}
    </div>
  )
}

/* ── Ticket Chat — Telegram style ───────────────────────── */

function TicketChat({
  ticket, onBack, onUpdate, onRefreshList,
}: {
  ticket: TicketDetail
  onBack: () => void
  onUpdate: () => void
  onRefreshList: () => void
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploadingCount, setUploadingCount] = useState(0)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showRating, setShowRating] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const s = STATUS_LABELS[ticket.status]

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [ticket.messages.length])

  useEffect(() => {
    // Auto-show rating prompt when ticket becomes RESOLVED
    if (ticket.status === 'RESOLVED' && !ticket.rating) {
      setShowRating(true)
    }
  }, [ticket.status, ticket.rating])

  const uploadFile = async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    setUploadingCount(c => c + 1)
    try {
      const res = await authFetch('/api/tickets/upload', {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Upload failed')
      }
      const data = await res.json()
      setAttachments(prev => [...prev, { name: data.name, url: data.url, size: data.size, type: data.type }])
    } catch (e: any) {
      toast.error(e?.message || 'Не удалось загрузить файл')
    } finally {
      setUploadingCount(c => c - 1)
    }
  }

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    for (let i = 0; i < Math.min(files.length, 5); i++) {
      const f = files[i]
      if (!f.type.startsWith('image/')) {
        toast.error(`${f.name}: можно загружать только изображения`)
        continue
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name}: файл больше 10 МБ`)
        continue
      }
      uploadFile(f)
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) uploadFile(file)
      }
    }
  }

  const send = async () => {
    if (!text.trim() && attachments.length === 0) return
    setSending(true)
    try {
      const tgWebApp = (window as any).Telegram?.WebApp
      const source = tgWebApp?.initData ? 'MINIAPP' : 'WEB'
      const res = await authFetch(`/api/tickets/${ticket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: text.trim() || '[вложение]',
          attachments: attachments.length > 0 ? attachments : undefined,
          source,
        }),
      })
      if (!res.ok) throw new Error()
      setText('')
      setAttachments([])
      setShowEmoji(false)
      onUpdate()
      onRefreshList()
    } catch {
      toast.error('Не удалось отправить')
    } finally {
      setSending(false)
    }
  }

  const insertEmoji = (emoji: string) => {
    const ta = textareaRef.current
    if (!ta) {
      setText(t => t + emoji)
      return
    }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    setText(t => t.slice(0, start) + emoji + t.slice(end))
    setTimeout(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = start + emoji.length
    }, 0)
  }

  const closeTicket = async () => {
    if (!confirm('Закрыть тикет?')) return
    try {
      await authFetch(`/api/tickets/${ticket.id}/close`, {
        method: 'POST',
      })
      onUpdate()
      onRefreshList()
      toast.success('Тикет закрыт')
    } catch {}
  }

  const submitRating = async (rating: number, comment: string) => {
    try {
      await authFetch(`/api/tickets/${ticket.id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      })
      toast.success('Спасибо за оценку!')
      setShowRating(false)
      onUpdate()
    } catch {
      toast.error('Не удалось сохранить оценку')
    }
  }

  const grouped = groupByDay(ticket.messages)

  return (
    <>
      {/* Header — Telegram style */}
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
          className="p-1.5 rounded-full transition hover:bg-white/[0.05]"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent-1)', color: '#fff' }}
        >
          <LifeBuoy className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            Поддержка HIDEYOU
          </h3>
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }}></span>
            <span>{s.text}</span>
            <span>·</span>
            <span className="truncate">{CATEGORY_LABELS[ticket.category]}</span>
          </div>
        </div>
      </div>

      {/* Subject banner */}
      <div className="px-4 py-2 text-xs shrink-0" style={{
        background: 'var(--surface-1)',
        color: 'var(--text-tertiary)',
        borderBottom: '1px solid var(--glass-border)',
      }}>
        <b style={{ color: 'var(--text-secondary)' }}>Тема:</b> {ticket.subject}
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-1"
        style={{
          background: 'var(--surface-1)',
          backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(96,165,250,0.04) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(167,139,250,0.04) 0%, transparent 50%)',
        }}
      >
        {grouped.map((group, gi) => (
          <div key={gi}>
            <div className="flex justify-center my-3">
              <span
                className="px-3 py-1 rounded-full text-xs"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-tertiary)', backdropFilter: 'blur(4px)' }}
              >
                {dayLabel(group.date)}
              </span>
            </div>
            {group.messages.map((m, mi) => {
              const isUser = m.authorType === 'USER'
              const isSystem = m.authorType === 'SYSTEM'
              const prev = group.messages[mi - 1]
              const next = group.messages[mi + 1]
              const sameAuthorPrev = prev && prev.authorType === m.authorType
              const sameAuthorNext = next && next.authorType === m.authorType

              if (isSystem) {
                return (
                  <div key={m.id} className="flex justify-center my-2">
                    <div
                      className="px-3 py-1.5 rounded-full text-xs"
                      style={{
                        background: 'rgba(52,211,153,0.1)',
                        color: '#34d399',
                        border: '1px solid rgba(52,211,153,0.2)',
                      }}
                    >
                      {m.body}
                    </div>
                  </div>
                )
              }

              // Tail on last in bubble group
              const showTail = !sameAuthorNext

              return (
                <div
                  key={m.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  style={{ marginTop: sameAuthorPrev ? '2px' : '8px' }}
                >
                  <div
                    className="max-w-[80%] px-3 py-2"
                    style={{
                      background: isUser ? 'var(--accent-1)' : 'var(--surface-2)',
                      color: isUser ? '#fff' : 'var(--text-primary)',
                      borderRadius: isUser
                        ? `18px 18px ${showTail ? '4px' : '18px'} 18px`
                        : `18px 18px 18px ${showTail ? '4px' : '18px'}`,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    }}
                  >
                    {/* Attachments */}
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="space-y-1 mb-1">
                        {m.attachments.map((a, ai) => (
                          <AttachmentView key={ai} att={a} isUser={isUser} />
                        ))}
                      </div>
                    )}

                    {/* Text */}
                    {m.body !== '[вложение]' && (
                      <div className="whitespace-pre-wrap break-words text-sm">{m.body}</div>
                    )}

                    {/* Time + read indicator */}
                    <div
                      className="text-[10px] mt-0.5 flex items-center justify-end gap-0.5"
                      style={{ color: isUser ? 'rgba(255,255,255,0.7)' : 'var(--text-tertiary)' }}
                    >
                      {formatFullTime(m.createdAt)}
                      {isUser && m.readByAdminAt && (
                        <span title="Прочитано">✓✓</span>
                      )}
                      {isUser && !m.readByAdminAt && (
                        <span title="Доставлено">✓</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Rating card */}
      {showRating && (
        <RatingBanner
          currentRating={ticket.rating}
          onSubmit={submitRating}
          onDismiss={() => setShowRating(false)}
        />
      )}

      {/* Input */}
      {ticket.status !== 'CLOSED' && (
        <div className="shrink-0" style={{ borderTop: '1px solid var(--glass-border)', background: 'var(--surface-2)' }}>
          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="px-3 pt-2 flex gap-2 flex-wrap">
              {attachments.map((a, i) => (
                <div
                  key={i}
                  className="relative rounded-lg p-2 flex items-center gap-2 text-xs max-w-[200px]"
                  style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}
                >
                  {isImageUrl(a.url, a.type) ? (
                    <img src={a.url} alt="" className="w-8 h-8 rounded object-cover" />
                  ) : (
                    <FileText className="w-8 h-8 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate" style={{ color: 'var(--text-primary)' }}>{a.name}</div>
                    <div style={{ color: 'var(--text-tertiary)' }}>{formatFileSize(a.size)}</div>
                  </div>
                  <button
                    onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                    className="p-0.5 rounded-full"
                    style={{ background: '#ef4444', color: '#fff' }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {uploadingCount > 0 && (
                <div className="px-2 py-1.5 rounded-lg text-xs flex items-center gap-1" style={{ background: 'var(--surface-1)' }}>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Загрузка...
                </div>
              )}
            </div>
          )}

          {/* Emoji picker */}
          {showEmoji && (
            <div
              className="px-3 pt-2 grid grid-cols-10 gap-1"
              style={{ maxHeight: '120px', overflowY: 'auto' }}
            >
              {EMOJI_LIST.map(e => (
                <button
                  key={e}
                  onClick={() => insertEmoji(e)}
                  className="text-xl p-1 rounded hover:bg-white/[0.1] transition"
                >
                  {e}
                </button>
              ))}
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

          {/* Textarea row */}
          <div className="px-2 pt-2">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 768) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Сообщение..."
              rows={2}
              className="w-full px-4 py-2.5 text-sm rounded-2xl resize-none outline-none"
              style={{
                background: 'var(--surface-1)',
                color: 'var(--text-primary)',
                border: '1px solid var(--glass-border)',
                minHeight: '48px',
                maxHeight: '140px',
              }}
              disabled={sending}
            />
          </div>

          {/* Toolbar row */}
          <div className="px-2 py-2 flex items-center gap-0.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-full transition hover:bg-white/[0.05]"
              style={{ color: 'var(--text-secondary)' }}
              title="Фото"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowEmoji(s => !s)}
              className="p-2 rounded-full transition hover:bg-white/[0.05]"
              style={{
                color: showEmoji ? 'var(--accent-1)' : 'var(--text-secondary)',
                background: showEmoji ? 'rgba(var(--accent-1-rgb, 96,165,250),0.15)' : 'transparent',
              }}
              title="Эмодзи"
            >
              <Smile className="w-5 h-5" />
            </button>
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
                  <span>Отправить</span>
                </>
              )}
            </button>
          </div>

          {ticket.status !== 'RESOLVED' && (
            <div className="px-3 pb-2">
              <button
                onClick={closeTicket}
                className="text-xs underline"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Закрыть тикет
              </button>
            </div>
          )}
        </div>
      )}
      {ticket.status === 'CLOSED' && (
        <div className="p-4 text-center text-sm shrink-0" style={{ color: 'var(--text-tertiary)', borderTop: '1px solid var(--glass-border)', background: 'var(--surface-2)' }}>
          🔒 Тикет закрыт
          {ticket.rating && (
            <div className="mt-1">
              Ваша оценка: {'⭐'.repeat(ticket.rating)}
            </div>
          )}
        </div>
      )}
    </>
  )
}

/* ── Rating banner ───────────────────────────────────────── */

function RatingBanner({
  currentRating, onSubmit, onDismiss,
}: {
  currentRating?: number | null
  onSubmit: (r: number, comment: string) => void
  onDismiss: () => void
}) {
  const [rating, setRating] = useState(currentRating || 0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (currentRating) {
    return (
      <div className="px-4 py-3 text-center text-sm shrink-0" style={{
        background: 'rgba(52,211,153,0.1)',
        color: '#34d399',
        borderTop: '1px solid rgba(52,211,153,0.2)',
      }}>
        Ваша оценка: {'⭐'.repeat(currentRating)}
      </div>
    )
  }

  return (
    <div className="p-4 shrink-0 relative" style={{
      background: 'linear-gradient(135deg, rgba(52,211,153,0.1), rgba(96,165,250,0.1))',
      borderTop: '1px solid var(--glass-border)',
    }}>
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 p-1"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <X className="w-4 h-4" />
      </button>
      <p className="text-sm text-center mb-3" style={{ color: 'var(--text-primary)' }}>
        Как вам ответ поддержки? 😊
      </p>
      <div className="flex justify-center gap-1 mb-3">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(n)}
            className="transition-transform hover:scale-125"
          >
            <Star
              className="w-8 h-8"
              fill={(hover || rating) >= n ? '#fbbf24' : 'none'}
              strokeWidth={1.5}
              style={{ color: '#fbbf24' }}
            />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Комментарий (необязательно)"
            rows={2}
            className="w-full px-3 py-2 text-sm rounded-xl mb-2 resize-none"
            style={{
              background: 'var(--surface-1)',
              color: 'var(--text-primary)',
              border: '1px solid var(--glass-border)',
            }}
            maxLength={500}
          />
          <button
            onClick={async () => {
              setSubmitting(true)
              await onSubmit(rating, comment)
              setSubmitting(false)
            }}
            disabled={submitting}
            className="w-full py-2 rounded-xl text-sm font-medium transition disabled:opacity-50"
            style={{ background: 'var(--accent-1)', color: '#fff' }}
          >
            {submitting ? 'Отправка...' : 'Отправить оценку'}
          </button>
        </>
      )}
    </div>
  )
}

/* ── Attachment View ─────────────────────────────────────── */

function AttachmentView({ att, isUser }: { att: Attachment; isUser: boolean }) {
  if (isImageUrl(att.url, att.type)) {
    return (
      <a href={att.url} target="_blank" rel="noreferrer" className="block">
        <img
          src={att.url}
          alt={att.name}
          className="rounded-lg max-w-full max-h-60 object-cover"
          style={{ minWidth: '150px' }}
        />
      </a>
    )
  }
  return (
    <a
      href={att.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-lg p-2 transition"
      style={{
        background: isUser ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
      }}
    >
      <FileText className="w-6 h-6 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium truncate">{att.name}</div>
        <div className="text-[10px] opacity-70">{formatFileSize(att.size)}</div>
      </div>
      <Download className="w-4 h-4 opacity-70" />
    </a>
  )
}

/* ── Create Ticket Wizard ──────────────────────────────── */

interface WizardStep {
  id: string
  question: string
  hint?: string
  type: 'choice' | 'text' | 'textarea'
  options?: Array<{ value: string; label: string; icon?: string }>
  placeholder?: string
  optional?: boolean
}

// Flows for each category — step-by-step questions
const WIZARD_FLOWS: Record<string, { steps: WizardStep[]; buildSubject: (answers: Record<string, string>) => string; buildBody: (answers: Record<string, string>) => string }> = {
  TECH: {
    steps: [
      {
        id: 'device',
        question: 'На каком устройстве проблема?',
        type: 'choice',
        options: [
          { value: 'iphone', label: 'iPhone / iPad', icon: '📱' },
          { value: 'android', label: 'Android', icon: '🤖' },
          { value: 'windows', label: 'Windows', icon: '🪟' },
          { value: 'mac', label: 'macOS', icon: '💻' },
          { value: 'linux', label: 'Linux', icon: '🐧' },
          { value: 'other', label: 'Другое', icon: '❓' },
        ],
      },
      {
        id: 'issue',
        question: 'Что именно не работает?',
        type: 'choice',
        options: [
          { value: 'connect', label: 'Не подключается', icon: '🚫' },
          { value: 'slow', label: 'Медленная скорость', icon: '🐢' },
          { value: 'disconnects', label: 'Отключается сам', icon: '⚡' },
          { value: 'sites', label: 'Не открываются сайты', icon: '🌐' },
          { value: 'app', label: 'Проблема с приложением', icon: '📲' },
          { value: 'other', label: 'Другое', icon: '❓' },
        ],
      },
      {
        id: 'app',
        question: 'Каким приложением пользуетесь?',
        type: 'choice',
        options: [
          { value: 'happ', label: 'Happ', icon: '😊' },
          { value: 'v2raytun', label: 'V2rayTun', icon: '🔷' },
          { value: 'hiddify', label: 'Hiddify', icon: '🔒' },
          { value: 'other', label: 'Другое', icon: '❓' },
        ],
      },
      {
        id: 'details',
        question: 'Опишите проблему подробнее',
        hint: 'Что именно происходит, когда началось, какие ошибки видите',
        type: 'textarea',
        placeholder: 'Например: при подключении выдаёт ошибку "connection timeout"...',
      },
    ],
    buildSubject: (a) => {
      const issues: Record<string, string> = {
        connect: 'Не подключается', slow: 'Медленная скорость',
        disconnects: 'Отключается сам', sites: 'Не открываются сайты',
        app: 'Проблема с приложением', other: 'Технический вопрос',
      }
      return issues[a.issue] || 'Технический вопрос'
    },
    buildBody: (a) => {
      const devices: Record<string, string> = {
        iphone: 'iPhone / iPad', android: 'Android', windows: 'Windows',
        mac: 'macOS', linux: 'Linux', other: 'Другое',
      }
      return `📱 Устройство: ${devices[a.device] || a.device}
🔧 Приложение: ${a.app}
📝 Описание: ${a.details || ''}`
    },
  },
  BILLING: {
    steps: [
      {
        id: 'issue',
        question: 'С чем связан вопрос?',
        type: 'choice',
        options: [
          { value: 'not-paid', label: 'Оплатил, но подписка не активирована', icon: '💳' },
          { value: 'double-charge', label: 'Списали дважды', icon: '⚠️' },
          { value: 'wrong-amount', label: 'Списана неправильная сумма', icon: '💸' },
          { value: 'no-receipt', label: 'Не пришёл чек', icon: '🧾' },
          { value: 'other', label: 'Другое', icon: '❓' },
        ],
      },
      {
        id: 'amount',
        question: 'Сумма платежа (если помните)?',
        type: 'text',
        placeholder: 'Например: 179 ₽',
        optional: true,
      },
      {
        id: 'details',
        question: 'Дополнительные детали',
        hint: 'Дата платежа, номер заказа если есть',
        type: 'textarea',
        placeholder: 'Платил 12.04, картой...',
      },
    ],
    buildSubject: (a) => {
      const issues: Record<string, string> = {
        'not-paid': 'Подписка не активирована после оплаты',
        'double-charge': 'Двойное списание',
        'wrong-amount': 'Неверная сумма платежа',
        'no-receipt': 'Не пришёл чек',
        other: 'Вопрос по платежу',
      }
      return issues[a.issue] || 'Вопрос по платежу'
    },
    buildBody: (a) => `💰 Проблема: ${a.issue}${a.amount ? `\n💵 Сумма: ${a.amount}` : ''}\n📝 Детали: ${a.details || ''}`,
  },
  REFUND: {
    steps: [
      {
        id: 'reason',
        question: 'Почему хотите вернуть оплату?',
        type: 'choice',
        options: [
          { value: 'not-working', label: 'Сервис не работает', icon: '🚫' },
          { value: 'slow', label: 'Медленная скорость', icon: '🐢' },
          { value: 'found-better', label: 'Нашёл другой сервис', icon: '🔄' },
          { value: 'changed-mind', label: 'Передумал', icon: '🤔' },
          { value: 'other', label: 'Другое', icon: '❓' },
        ],
      },
      {
        id: 'full-or-partial',
        question: 'Полный или частичный возврат?',
        type: 'choice',
        options: [
          { value: 'full', label: 'Полный', icon: '💯' },
          { value: 'partial', label: 'За неиспользованный период', icon: '📅' },
        ],
      },
      {
        id: 'details',
        question: 'Комментарий',
        hint: 'Любая дополнительная информация',
        type: 'textarea',
        optional: true,
        placeholder: 'Необязательно...',
      },
    ],
    buildSubject: (a) => {
      return a['full-or-partial'] === 'full' ? 'Полный возврат средств' : 'Частичный возврат'
    },
    buildBody: (a) => {
      const reasons: Record<string, string> = {
        'not-working': 'Сервис не работает',
        'slow': 'Медленная скорость',
        'found-better': 'Нашёл другой сервис',
        'changed-mind': 'Передумал',
        other: 'Другое',
      }
      const types: Record<string, string> = {
        full: 'Полный возврат',
        partial: 'За неиспользованный период',
      }
      return `↩️ Тип: ${types[a['full-or-partial']]}\n📋 Причина: ${reasons[a.reason] || a.reason}${a.details ? `\n📝 Комментарий: ${a.details}` : ''}`
    },
  },
  SUBSCRIPTION: {
    steps: [
      {
        id: 'issue',
        question: 'Какой вопрос?',
        type: 'choice',
        options: [
          { value: 'extend', label: 'Продлить подписку', icon: '🔄' },
          { value: 'change-tariff', label: 'Изменить тариф', icon: '📊' },
          { value: 'extra-device', label: 'Добавить устройство', icon: '📱' },
          { value: 'reset-traffic', label: 'Сбросить трафик', icon: '♻️' },
          { value: 'locations', label: 'Сменить локацию', icon: '🌍' },
          { value: 'other', label: 'Другое', icon: '❓' },
        ],
      },
      {
        id: 'details',
        question: 'Детали',
        hint: 'Опишите что нужно сделать',
        type: 'textarea',
        placeholder: 'Например: хочу продлить на месяц',
      },
    ],
    buildSubject: (a) => {
      const issues: Record<string, string> = {
        'extend': 'Продление подписки',
        'change-tariff': 'Смена тарифа',
        'extra-device': 'Добавить устройство',
        'reset-traffic': 'Сброс трафика',
        'locations': 'Смена локации',
        other: 'Вопрос по подписке',
      }
      return issues[a.issue] || 'Вопрос по подписке'
    },
    buildBody: (a) => `📱 Запрос: ${a.issue}\n📝 Детали: ${a.details || ''}`,
  },
  OTHER: {
    steps: [
      {
        id: 'subject',
        question: 'Кратко опишите тему',
        type: 'text',
        placeholder: 'Например: Вопрос по работе сервиса',
      },
      {
        id: 'details',
        question: 'Опишите подробнее',
        type: 'textarea',
        placeholder: 'Расскажите что случилось...',
      },
    ],
    buildSubject: (a) => a.subject || 'Общий вопрос',
    buildBody: (a) => a.details || '',
  },
}

function CreateTicketModal({
  onClose, onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  // Pick up category from window (set via start_param)
  const prefillCat = typeof window !== 'undefined' ? (window as any).__supportPrefillCategory : null
  const validCats: TicketCategory[] = ['BILLING', 'TECH', 'REFUND', 'SUBSCRIPTION', 'OTHER']
  const initialCategory = validCats.includes(prefillCat) ? (prefillCat as TicketCategory) : null

  const [category, setCategory] = useState<TicketCategory | null>(initialCategory)
  const [stepIndex, setStepIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    // Clear the one-time prefill
    if (typeof window !== 'undefined') {
      delete (window as any).__supportPrefillCategory
    }
  }, [])

  const flow = category ? WIZARD_FLOWS[category] : null
  const currentStep = flow?.steps[stepIndex]
  const totalSteps = flow?.steps.length || 0

  const selectCategory = (cat: TicketCategory) => {
    setCategory(cat)
    setStepIndex(0)
    setAnswers({})
  }

  const setAnswer = (id: string, value: string) => {
    setAnswers(prev => ({ ...prev, [id]: value }))
  }

  const next = () => {
    if (!currentStep) return
    const val = answers[currentStep.id]
    if (!currentStep.optional && !val?.trim()) {
      toast.error('Выберите вариант или введите текст')
      return
    }
    if (stepIndex < totalSteps - 1) {
      setStepIndex(i => i + 1)
    } else {
      submit()
    }
  }

  const back = () => {
    if (stepIndex > 0) setStepIndex(i => i - 1)
    else setCategory(null)
  }

  const submit = async () => {
    if (!category || !flow) return
    const subject = flow.buildSubject(answers)
    const message = flow.buildBody(answers)
    if (!subject.trim() || !message.trim()) {
      toast.error('Недостаточно данных')
      return
    }
    setCreating(true)
    try {
      const tgWebApp = (window as any).Telegram?.WebApp
      const source = tgWebApp?.initData ? 'MINIAPP' : 'WEB'
      const res = await authFetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          message: message.trim(),
          source,
        }),
      })
      if (!res.ok) throw new Error()
      const { id } = await res.json()
      toast.success('Обращение создано 🎉')
      onCreated(id)
    } catch {
      toast.error('Не удалось создать обращение')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="glass-card rounded-2xl p-5 space-y-4 w-full max-w-lg my-8"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
              {!category ? 'Новое обращение' : 'Расскажите подробнее'}
            </h3>
            {category && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Шаг {stepIndex + 1} из {totalSteps}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1" style={{ color: 'var(--text-tertiary)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar */}
        {category && (
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${((stepIndex + 1) / totalSteps) * 100}%`,
                background: 'var(--accent-1)',
              }}
            />
          </div>
        )}

        {/* Step 0: category */}
        {!category && (
          <div className="space-y-2">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              С каким вопросом обращаетесь?
            </p>
            {(Object.keys(CATEGORY_LABELS) as TicketCategory[]).map(cat => (
              <button
                key={cat}
                onClick={() => selectCategory(cat)}
                className="w-full px-4 py-3 rounded-xl text-left transition hover:brightness-110"
                style={{
                  background: 'var(--surface-2)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--glass-border)',
                }}
              >
                <span className="font-medium">{CATEGORY_LABELS[cat]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Wizard step */}
        {category && currentStep && (
          <div className="space-y-3">
            <div>
              <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {currentStep.question}
              </h4>
              {currentStep.hint && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {currentStep.hint}
                </p>
              )}
            </div>

            {currentStep.type === 'choice' && currentStep.options && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {currentStep.options.map(opt => {
                  const selected = answers[currentStep.id] === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setAnswer(currentStep.id, opt.value)
                        // Auto-advance on choice
                        setTimeout(() => {
                          if (stepIndex < totalSteps - 1) {
                            setStepIndex(i => i + 1)
                          }
                        }, 200)
                      }}
                      className="px-3 py-2.5 rounded-xl text-sm font-medium transition text-left flex items-center gap-2"
                      style={{
                        background: selected ? 'var(--accent-1)' : 'var(--surface-2)',
                        color: selected ? '#fff' : 'var(--text-primary)',
                        border: `1px solid ${selected ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                      }}
                    >
                      {opt.icon && <span className="text-lg">{opt.icon}</span>}
                      <span>{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {currentStep.type === 'text' && (
              <input
                value={answers[currentStep.id] || ''}
                onChange={e => setAnswer(currentStep.id, e.target.value)}
                placeholder={currentStep.placeholder}
                className="glass-input w-full px-3 py-2 text-sm rounded-xl"
                maxLength={200}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && next()}
              />
            )}

            {currentStep.type === 'textarea' && (
              <textarea
                value={answers[currentStep.id] || ''}
                onChange={e => setAnswer(currentStep.id, e.target.value)}
                placeholder={currentStep.placeholder}
                rows={5}
                className="glass-input w-full px-3 py-2 text-sm rounded-xl resize-none"
                maxLength={2000}
                autoFocus
              />
            )}

            {currentStep.optional && (
              <button
                onClick={() => {
                  setAnswer(currentStep.id, '')
                  next()
                }}
                className="text-xs"
                style={{ color: 'var(--text-tertiary)', textDecoration: 'underline' }}
              >
                Пропустить
              </button>
            )}
          </div>
        )}

        {/* Navigation */}
        {category && (
          <div className="flex gap-2">
            <button
              onClick={back}
              className="px-4 py-2 rounded-xl text-sm font-medium transition"
              style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}
            >
              ← Назад
            </button>
            {currentStep?.type !== 'choice' && (
              <button
                onClick={next}
                disabled={creating}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50"
                style={{ background: 'var(--accent-1)', color: '#fff' }}
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                ) : stepIndex < totalSteps - 1 ? (
                  'Далее →'
                ) : (
                  'Создать обращение 🚀'
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
