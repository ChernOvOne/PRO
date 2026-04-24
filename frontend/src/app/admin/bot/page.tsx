'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Search, Send, ArrowLeft, User, MessageCircle,
  ExternalLink, X, Calendar, Wallet, Gift, Star, Workflow,
} from 'lucide-react'
import toast from 'react-hot-toast'

/* ---------- types ---------- */

interface ChatUser {
  id: string
  telegramId?: string
  telegramName?: string
  email?: string
  subStatus: string
  balance?: number
  bonusDays?: number
  createdAt: string
  role?: string
}

interface ChatListItem {
  user: ChatUser
  lastMessage: string
  lastDate: string
  messageCount: number
}

interface Message {
  id: string
  direction: 'IN' | 'OUT'       // IN = user->bot, OUT = bot->user
  text: string
  buttonsJson?: string | null
  createdAt: string
}

/* ---------- helpers ---------- */

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  }
  if (diff < 604800000) {
    return d.toLocaleDateString('ru', { weekday: 'short' })
  }
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const fmtFull = (iso: string) =>
  new Date(iso).toLocaleString('ru', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:   'badge-green',
  INACTIVE: 'badge-gray',
  EXPIRED:  'badge-red',
  TRIAL:    'badge-blue',
}

const initial = (u: ChatUser) =>
  (u.telegramName || u.email || 'U')[0].toUpperCase()

const displayName = (u: ChatUser) =>
  u.telegramName || u.email?.split('@')[0] || `ID:${u.id.slice(0, 8)}`

// Fully hidden (technical junk)
const isHiddenMessage = (text: string) =>
  text.startsWith('Действие: blk:') ||
  text.startsWith('Действие: engine:') ||
  text.startsWith('engine:') ||
  text.startsWith('blk:') ||
  text.startsWith('callback:') ||
  text === '⠀'

// User action (button click) — show as compact action bubble
const isUserAction = (text: string) =>
  text.startsWith('Действие:') && !isHiddenMessage(text)

// Clean action label: "Действие: 📱 Устройства" → "📱 Устройства"
const cleanActionLabel = (text: string) =>
  text.replace(/^Действие:\s*/, '')

// Whitelist URL schemes — bot users can send arbitrary text including
// `[click](javascript:...)`, which would execute in the admin's session
// (account takeover). Only http/https/mailto/tg are rendered as links;
// everything else is shown as plain text.
function isSafeLinkUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase()
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tg://') ||
    trimmed.startsWith('/')        // relative same-origin links
  )
}
function escapeHtmlAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function parseMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<i>$1</i>')
    .replace(/_(.+?)_/g, '<i>$1</i>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, (_m, label: string, url: string) => {
      if (!isSafeLinkUrl(url)) return label
      return `<a href="${escapeHtmlAttr(url)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-1); text-decoration: underline;">${label}</a>`
    })
}

/* ---------- component ---------- */

export default function AdminBotChats() {
  /* --- chats list state --- */
  const [chats, setChats]           = useState<ChatListItem[]>([])
  const [chatsTotal, setChatsTotal] = useState(0)
  const [chatsPage, setChatsPage]   = useState(1)
  const [search, setSearch]         = useState('')
  const [chatsLoading, setChatsLoading] = useState(true)

  /* --- active chat state --- */
  const [activeUserId, setActiveUserId] = useState<string | null>(null)
  const [activeUser, setActiveUser]     = useState<ChatUser | null>(null)
  const [messages, setMessages]         = useState<Message[]>([])
  const [msgsTotal, setMsgsTotal]       = useState(0)
  const [msgsPage, setMsgsPage]         = useState(1)
  const [msgsLoading, setMsgsLoading]   = useState(false)

  /* --- send state --- */
  const [draft, setDraft]     = useState('')
  const [sending, setSending] = useState(false)

  /* --- system messages toggle --- */
  const [showSystem, setShowSystem] = useState(false)

  /* --- block picker --- */
  const [showBlockPicker, setShowBlockPicker] = useState(false)
  const [botBlocks, setBotBlocks] = useState<any[]>([])
  const [blockSearch, setBlockSearch] = useState('')
  const [sendingBlock, setSendingBlock] = useState(false)

  /* --- mobile drawers --- */
  const [mobileListOpen, setMobileListOpen]     = useState(true)
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const searchTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ---------- load chats ---------- */

  const loadChats = useCallback(async (pg = chatsPage, q = search) => {
    setChatsLoading(true)
    try {
      const params = new URLSearchParams({ page: String(pg), limit: '30', search: q })
      const res = await fetch(`/api/admin/bot/chats?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setChats(data.chats)
      setChatsTotal(data.total)
    } catch {
      toast.error('Не удалось загрузить чаты')
    } finally {
      setChatsLoading(false)
    }
  }, [chatsPage, search])

  useEffect(() => { loadChats() }, [loadChats])

  const onSearchChange = (v: string) => {
    setSearch(v)
    setChatsPage(1)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadChats(1, v), 300)
  }

  /* ---------- load messages ---------- */

  const loadMessages = useCallback(async (userId: string, pg = 1, append = false) => {
    setMsgsLoading(true)
    try {
      const params = new URLSearchParams({ page: String(pg), limit: '100' })
      const res = await fetch(`/api/admin/bot/chats/${userId}/messages?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setMessages(prev => append ? [...data.messages.reverse(), ...prev] : data.messages)
      setMsgsTotal(data.total)
      setMsgsPage(pg)
    } catch {
      toast.error('Не удалось загрузить сообщения')
    } finally {
      setMsgsLoading(false)
    }
  }, [])

  // Auto-refresh messages every 5 seconds
  useEffect(() => {
    if (!activeUserId) return
    const interval = setInterval(() => {
      loadMessages(activeUserId, 1)
    }, 5000)
    return () => clearInterval(interval)
  }, [activeUserId])

  const selectChat = (item: ChatListItem) => {
    setActiveUserId(item.user.id)
    setActiveUser(item.user)
    setMessages([])
    setMsgsPage(1)
    loadMessages(item.user.id, 1)
    setMobileListOpen(false)
    setMobileProfileOpen(false)
  }

  /* auto-scroll */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* ---------- send message ---------- */

  const sendMessage = async () => {
    if (!draft.trim() || !activeUserId) return
    setSending(true)
    try {
      const res = await fetch(`/api/admin/bot/chats/${activeUserId}/send`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft.trim() }),
      })
      if (!res.ok) throw new Error()
      setDraft('')
      await loadMessages(activeUserId, 1)
      loadChats()
    } catch {
      toast.error('Ошибка отправки')
    } finally {
      setSending(false)
    }
  }

  /* ---------- block picker ---------- */

  const loadBotBlocks = async () => {
    try {
      const res = await fetch('/api/admin/bot/blocks-for-picker', { credentials: 'include' })
      if (res.ok) setBotBlocks(await res.json())
    } catch {}
  }

  const sendBlock = async (blockId: string) => {
    if (!activeUserId) return
    setSendingBlock(true)
    try {
      const res = await fetch(`/api/admin/bot/chats/${activeUserId}/send-block`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId }),
      })
      if (!res.ok) throw new Error()
      toast.success('Блок отправлен')
      setShowBlockPicker(false)
      await loadMessages(activeUserId, 1)
      loadChats()
    } catch {
      toast.error('Ошибка отправки блока')
    } finally {
      setSendingBlock(false)
    }
  }

  /* ---------- render helpers ---------- */

  const renderButtons = (json: string | null | undefined) => {
    if (!json) return null
    try {
      const rows: { text: string; url?: string }[][] = JSON.parse(json)
      return (
        <div className="mt-1.5 flex flex-col gap-1">
          {rows.map((row, ri) => (
            <div key={ri} className="flex gap-1 flex-wrap">
              {row.map((btn, bi) => (
                <button
                  key={bi}
                  disabled
                  className="text-xs px-2.5 py-1 rounded-lg cursor-default opacity-70 font-medium"
                  style={{
                    background: 'rgba(6,182,212,0.12)',
                    color: 'var(--accent-1)',
                    border: '1px solid rgba(6,182,212,0.2)',
                  }}
                >
                  {btn.text}
                </button>
              ))}
            </div>
          ))}
        </div>
      )
    } catch {
      return null
    }
  }

  /* ============================== JSX ============================== */

  return (
    <div
      className="flex h-[calc(100vh-60px)] md:h-[calc(100vh-52px)] overflow-hidden rounded-2xl"
      style={{
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
      }}
    >
      {/* ===================== LEFT PANEL: chats list ===================== */}
      <div
        className={`
          flex-shrink-0 flex flex-col
          ${mobileListOpen ? 'flex' : 'hidden md:flex'}
          w-full md:w-[250px]
        `}
        style={{ borderRight: '1px solid var(--glass-border)' }}
      >
        {/* search */}
        <div className="p-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-1)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Чаты бота
            </span>
            <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>
              {chatsTotal}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
            <input
              className="glass-input pl-8 py-1.5 text-xs w-full"
              placeholder="Поиск..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
            />
          </div>
        </div>

        {/* chats list */}
        <div className="flex-1 overflow-y-auto">
          {chatsLoading ? (
            <div className="p-3 space-y-2">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="flex items-center gap-2.5 p-2">
                  <div className="w-9 h-9 rounded-full skeleton flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 skeleton rounded w-24" />
                    <div className="h-2.5 skeleton rounded w-36" />
                  </div>
                </div>
              ))}
            </div>
          ) : chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <MessageCircle className="w-8 h-8" style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Нет чатов</p>
            </div>
          ) : (
            chats.map(item => {
              const active = activeUserId === item.user.id
              return (
                <button
                  key={item.user.id}
                  onClick={() => selectChat(item)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-150"
                  style={{
                    background: active ? 'rgba(6,182,212,0.08)' : 'transparent',
                    borderBottom: '1px solid var(--glass-border)',
                  }}
                  onMouseEnter={e => {
                    if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                  }}
                  onMouseLeave={e => {
                    if (!active) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {/* avatar */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                    style={{
                      background: active ? 'rgba(6,182,212,0.2)' : 'rgba(6,182,212,0.1)',
                      border: `1px solid ${active ? 'rgba(6,182,212,0.3)' : 'rgba(6,182,212,0.15)'}`,
                      color: active ? 'var(--accent-1)' : 'var(--accent-1)',
                    }}
                  >
                    {initial(item.user)}
                  </div>

                  {/* text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className="text-[13px] font-medium truncate"
                        style={{ color: active ? 'var(--accent-1)' : 'var(--text-primary)' }}
                      >
                        {displayName(item.user)}
                      </span>
                      <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                        {fmtDate(item.lastDate)}
                      </span>
                    </div>
                    <p
                      className="text-[11px] truncate mt-0.5"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {item.lastMessage}
                    </p>
                  </div>
                </button>
              )
            })
          )}

          {/* load more */}
          {chats.length < chatsTotal && (
            <button
              onClick={() => {
                const next = chatsPage + 1
                setChatsPage(next)
                loadChats(next, search)
              }}
              className="w-full text-center py-2 text-xs transition-colors"
              style={{ color: 'var(--accent-1)' }}
            >
              Загрузить ещё...
            </button>
          )}
        </div>
      </div>

      {/* ===================== MIDDLE PANEL: messages ===================== */}
      <div
        className={`
          flex-1 flex flex-col min-w-0
          ${!mobileListOpen ? 'flex' : 'hidden md:flex'}
        `}
      >
        {activeUser ? (
          <>
            {/* header */}
            <div
              className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--glass-border)' }}
            >
              {/* back button (mobile) */}
              <button
                className="md:hidden p-1 rounded-lg"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => { setMobileListOpen(true); setMobileProfileOpen(false) }}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              {/* avatar */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 cursor-pointer md:cursor-default"
                style={{
                  background: 'rgba(6,182,212,0.1)',
                  border: '1px solid rgba(6,182,212,0.15)',
                  color: 'var(--accent-1)',
                }}
                onClick={() => setMobileProfileOpen(true)}
              >
                {initial(activeUser)}
              </div>

              <div className="flex-1 min-w-0">
                <h2
                  className="text-sm font-semibold truncate cursor-pointer md:cursor-default"
                  style={{ color: 'var(--text-primary)' }}
                  onClick={() => setMobileProfileOpen(true)}
                >
                  {displayName(activeUser)}
                </h2>
                <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {msgsTotal} сообщений
                </p>
              </div>

              {/* system messages toggle */}
              <label className="hidden md:flex items-center gap-1.5 cursor-pointer ml-auto">
                <input type="checkbox" checked={showSystem} onChange={e => setShowSystem(e.target.checked)} className="rounded" />
                <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>Системные</span>
              </label>

              {/* profile toggle on mobile */}
              <button
                className="md:hidden p-1.5 rounded-lg"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => setMobileProfileOpen(o => !o)}
              >
                <User className="w-4 h-4" />
              </button>
            </div>

            {/* messages area */}
            <div
              className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
              style={{ background: 'rgba(0,0,0,0.05)' }}
            >
              {/* load older */}
              {messages.length < msgsTotal && (
                <div className="text-center py-2">
                  <button
                    onClick={() => loadMessages(activeUserId!, msgsPage + 1, true)}
                    disabled={msgsLoading}
                    className="text-xs px-3 py-1 rounded-lg transition-colors"
                    style={{
                      color: 'var(--accent-1)',
                      background: 'rgba(6,182,212,0.08)',
                    }}
                  >
                    {msgsLoading ? 'Загрузка...' : 'Загрузить ранее'}
                  </button>
                </div>
              )}

              {msgsLoading && messages.length === 0 ? (
                <div className="space-y-3 py-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                      <div className="skeleton rounded-2xl h-10 w-48" />
                    </div>
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <MessageCircle className="w-10 h-10" style={{ color: 'var(--text-tertiary)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Нет сообщений</p>
                </div>
              ) : (
                messages.map(msg => {
                  const isUser = msg.direction === 'IN'

                  // Fully hide technical messages
                  if (isHiddenMessage(msg.text)) {
                    if (!showSystem) return null
                    return (
                      <div key={msg.id} className="flex justify-center">
                        <p className="text-[10px] italic px-2 py-0.5" style={{ color: 'var(--text-tertiary)' }}>{msg.text}</p>
                      </div>
                    )
                  }

                  // User action (button click) — compact bubble
                  if (isUserAction(msg.text)) {
                    return (
                      <div key={msg.id} className="flex justify-start">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                          style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)' }}>
                          <span className="text-[12px]" style={{ color: 'var(--accent-1)' }}>
                            {cleanActionLabel(msg.text)}
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                            {new Date(msg.createdAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}
                    >
                      {false ? (
                        <div />
                      ) : (
                        <div
                          className="max-w-[75%] rounded-2xl px-3.5 py-2"
                          style={{
                            background: isUser
                              ? 'rgba(255,255,255,0.07)'
                              : 'rgba(6,182,212,0.12)',
                            border: `1px solid ${isUser
                              ? 'rgba(255,255,255,0.08)'
                              : 'rgba(6,182,212,0.2)'}`,
                            borderBottomLeftRadius: isUser ? '6px' : undefined,
                            borderBottomRightRadius: !isUser ? '6px' : undefined,
                          }}
                        >
                          <p
                            className="text-[13px] whitespace-pre-wrap break-words"
                            style={{ color: 'var(--text-primary)' }}
                            dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.text) }}
                          />
                          {renderButtons(msg.buttonsJson)}
                          <p
                            className="text-[10px] mt-1"
                            style={{
                              color: 'var(--text-tertiary)',
                              textAlign: isUser ? 'left' : 'right',
                            }}
                          >
                            {new Date(msg.createdAt).toLocaleTimeString('ru', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* input */}
            <div
              className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
              style={{ borderTop: '1px solid var(--glass-border)' }}
            >
              <input
                className="glass-input flex-1 py-2 text-sm"
                placeholder="Написать сообщение..."
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                disabled={sending}
              />
              {/* Send block button */}
              <div className="relative">
                <button
                  onClick={() => { if (!showBlockPicker) loadBotBlocks(); setShowBlockPicker(!showBlockPicker) }}
                  className="p-2.5 rounded-xl transition-all duration-200"
                  style={{ background: showBlockPicker ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.05)', color: showBlockPicker ? 'var(--accent-1)' : 'var(--text-tertiary)' }}
                  title="Отправить блок"
                >
                  <Workflow className="w-4 h-4" />
                </button>

                {showBlockPicker && (
                  <div className="absolute bottom-full right-0 mb-2 w-80 max-h-96 overflow-y-auto rounded-2xl p-3 space-y-2"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 50 }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Отправить блок</span>
                      <button onClick={() => setShowBlockPicker(false)} className="p-1 rounded hover:bg-white/10">
                        <X className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                      </button>
                    </div>
                    <input
                      className="glass-input w-full py-1.5 text-xs mb-2"
                      placeholder="Поиск блока..."
                      value={blockSearch}
                      onChange={e => setBlockSearch(e.target.value)}
                    />
                    {botBlocks.map(group => {
                      const filtered = group.blocks?.filter((b: any) =>
                        !blockSearch || b.name?.toLowerCase().includes(blockSearch.toLowerCase())
                      ) || []
                      if (filtered.length === 0) return null
                      return (
                        <div key={group.id}>
                          <div className="text-[11px] font-bold uppercase tracking-wider px-1 py-1" style={{ color: 'var(--accent-1)' }}>
                            {group.name}
                          </div>
                          {filtered.map((block: any) => (
                            <button
                              key={block.id}
                              onClick={() => sendBlock(block.id)}
                              disabled={sendingBlock}
                              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm hover:bg-white/[0.06] transition-colors"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              <Workflow className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-1)' }} />
                              <div className="flex-1 min-w-0">
                                <div className="truncate font-medium">{block.name}</div>
                                {block.text && (
                                  <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                                    {block.text.slice(0, 50)}
                                  </div>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )
                    })}
                    {botBlocks.length === 0 && (
                      <div className="text-xs text-center py-4" style={{ color: 'var(--text-tertiary)' }}>
                        Нет блоков в конструкторе
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={sendMessage}
                disabled={!draft.trim() || sending}
                className="p-2.5 rounded-xl transition-all duration-200 disabled:opacity-30"
                style={{
                  background: draft.trim() ? 'var(--accent-1)' : 'rgba(255,255,255,0.05)',
                  color: '#fff',
                }}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          /* empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background: 'rgba(6,182,212,0.08)',
                border: '1px solid rgba(6,182,212,0.15)',
              }}
            >
              <MessageCircle className="w-7 h-7" style={{ color: 'var(--accent-1)' }} />
            </div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Выберите чат
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Выберите пользователя слева для просмотра истории
            </p>
          </div>
        )}
      </div>

      {/* ===================== RIGHT PANEL: user profile ===================== */}
      {activeUser && (
        <>
          {/* Desktop: always visible */}
          <div
            className="hidden md:flex flex-col w-[300px] flex-shrink-0 overflow-y-auto"
            style={{ borderLeft: '1px solid var(--glass-border)' }}
          >
            <ProfilePanel user={activeUser} />
          </div>

          {/* Mobile: overlay drawer */}
          {mobileProfileOpen && (
            <div className="fixed inset-0 z-50 md:hidden">
              <div
                className="absolute inset-0 bg-black/60 "
                onClick={() => setMobileProfileOpen(false)}
              />
              <div
                className="absolute right-0 top-0 h-full w-[300px] max-w-[85vw] overflow-y-auto"
                style={{
                  background: 'var(--surface-2)',
                  borderLeft: '1px solid var(--glass-border)',
                }}
              >
                <div className="flex items-center justify-between p-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Профиль
                  </span>
                  <button onClick={() => setMobileProfileOpen(false)} className="p-1" style={{ color: 'var(--text-tertiary)' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <ProfilePanel user={activeUser} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ===================== Profile Panel (reused desktop / mobile) ===================== */

function ProfilePanel({ user }: { user: ChatUser }) {
  return (
    <div className="p-4 space-y-5">
      {/* avatar + name */}
      <div className="flex flex-col items-center gap-2 pt-2">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
          style={{
            background: 'rgba(6,182,212,0.1)',
            border: '1px solid rgba(6,182,212,0.2)',
            color: 'var(--accent-1)',
          }}
        >
          {(user.telegramName || user.email || 'U')[0].toUpperCase()}
        </div>
        <h3 className="text-sm font-semibold text-center" style={{ color: 'var(--text-primary)' }}>
          {user.telegramName || user.email?.split('@')[0] || `ID:${user.id.slice(0, 8)}`}
        </h3>
        <span className={STATUS_COLORS[user.subStatus] || 'badge-gray'}>
          {user.subStatus}
        </span>
      </div>

      {/* details */}
      <div className="space-y-3">
        <ProfileRow icon={<User className="w-3.5 h-3.5" />} label="Telegram ID" value={user.telegramId || '---'} />
        {user.email && (
          <ProfileRow icon={<MessageCircle className="w-3.5 h-3.5" />} label="Email" value={user.email} />
        )}
        <ProfileRow
          icon={<Wallet className="w-3.5 h-3.5" />}
          label="Баланс"
          value={user.balance != null ? `${user.balance} \u20BD` : '---'}
        />
        <ProfileRow
          icon={<Gift className="w-3.5 h-3.5" />}
          label="Бонусные дни"
          value={user.bonusDays != null ? `${user.bonusDays}` : '---'}
        />
        <ProfileRow
          icon={<Calendar className="w-3.5 h-3.5" />}
          label="Регистрация"
          value={fmtFull(user.createdAt)}
        />
      </div>

      {/* link to full profile */}
      <Link
        href={`/admin/users/${user.id}`}
        className="flex items-center justify-center gap-2 w-full py-2 rounded-xl text-sm font-medium transition-all duration-200"
        style={{
          background: 'rgba(6,182,212,0.08)',
          color: 'var(--accent-1)',
          border: '1px solid rgba(6,182,212,0.15)',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(6,182,212,0.15)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(6,182,212,0.08)' }}
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Полный профиль
      </Link>
    </div>
  )
}

function ProfileRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          background: 'rgba(6,182,212,0.06)',
          color: 'var(--text-tertiary)',
        }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
        <p className="text-[13px] break-all" style={{ color: 'var(--text-primary)' }}>{value}</p>
      </div>
    </div>
  )
}
