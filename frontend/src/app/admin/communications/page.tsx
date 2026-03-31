'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Send, Mail, MessageCircle, Users, Clock, Plus, Trash2,
  Eye, Calendar, ChevronDown, AlertCircle, CheckCircle2,
  X, Bell, User, Search, ArrowLeft, ExternalLink,
  Wallet, Gift, Star, Zap, ToggleLeft, Save, RefreshCw,
  Loader2, MessageSquare, Mouse, Link2, ChevronLeft,
  ChevronRight, Settings, Filter, Upload, GripVertical,
} from 'lucide-react'
import toast from 'react-hot-toast'

/* ============================================================
   SHARED TYPES & HELPERS
   ============================================================ */

type TabKey = 'broadcasts' | 'funnels' | 'bot_settings' | 'chat_history'

// ---- Broadcast types ----
type Channel = 'telegram' | 'email' | 'both'
type Audience =
  | 'all'
  | 'active'
  | 'inactive'
  | 'expiring'
  | 'with_email'
  | 'with_telegram'

type BroadcastStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'COMPLETED' | 'CANCELLED'

interface InlineButton { label: string; url: string }

interface Broadcast {
  id: string; createdAt: string; channel: Channel; audience: Audience
  recipientCount: number; sentCount: number; errorCount: number
  status: BroadcastStatus; telegramText?: string; telegramButtons?: InlineButton[]
  emailSubject?: string; emailBody?: string; emailCtaText?: string
  emailCtaUrl?: string; scheduledAt?: string
}

// ---- Funnel types ----
interface FunnelStep {
  id: string; stepOrder: number
  delayType: string; delayValue: number; delayTime?: string
  condition: string
  channelTg: boolean; channelEmail: boolean; channelLk: boolean
  tgText?: string; tgButtons?: any[]; tgParseMode: string
  emailSubject?: string; emailHtml?: string; emailBtnText?: string; emailBtnUrl?: string; emailTemplate: string
  lkTitle?: string; lkMessage?: string; lkType: string
  actionType: string; actionValue: number; actionPromoExpiry: number
}
interface FunnelConfig {
  id: string; triggerId: string; name: string; description?: string; enabled: boolean; isCustom: boolean
  sortOrder: number; steps: FunnelStep[]; _count?: { logs: number }
}

// ---- Chat types ----
interface ChatUser {
  id: string; telegramId?: string; telegramName?: string; email?: string
  subStatus: string; balance?: number; bonusDays?: number; createdAt: string; role?: string
}
interface ChatListItem { user: ChatUser; lastMessage: string; lastDate: string; messageCount: number }
interface Message {
  id: string; direction: 'IN' | 'OUT'; text: string; buttonsJson?: string | null; createdAt: string
}

// ---- Bot settings types ----
interface BotSettings {
  bot_start_text: string; bot_subscription_active: string; bot_subscription_inactive: string
  bot_tariff_header: string; bot_promo_prompt: string; bot_promo_success: string
  bot_btn_subscription: string; bot_btn_tariffs: string; bot_btn_referral: string
  bot_btn_balance: string; bot_btn_promo: string; bot_btn_devices: string
  bot_btn_instructions: string; bot_btn_open_lk: string
  bot_support_url: string; bot_channel_url: string
  bot_feature_promo: string; bot_feature_devices: string
  bot_feature_instructions: string; bot_feature_balance: string
  [key: string]: string
}

// ---- Helpers ----
const broadcastAPI = (path: string, opts?: RequestInit) =>
  fetch(`/api/admin/broadcast${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  }).then(async r => {
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
    return r.json()
  })

const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: 'all', label: 'Все пользователи' },
  { value: 'active', label: 'С активной подпиской' },
  { value: 'inactive', label: 'Без подписки' },
  { value: 'expiring', label: 'С истекающей подпиской (1-7 дней)' },
  { value: 'with_email', label: 'Только с email' },
  { value: 'with_telegram', label: 'Только с Telegram' },
]

const STATUS_MAP: Record<BroadcastStatus, { label: string; cls: string; animate?: boolean }> = {
  DRAFT: { label: 'Черновик', cls: 'badge-gray' },
  SCHEDULED: { label: 'Запланировано', cls: 'badge-yellow' },
  SENDING: { label: 'Отправляется', cls: 'badge-blue', animate: true },
  COMPLETED: { label: 'Завершено', cls: 'badge-green' },
  CANCELLED: { label: 'Отменено', cls: 'badge-red' },
}

const CHANNEL_LABELS: Record<Channel, string> = { telegram: 'Telegram', email: 'Email', both: 'Оба' }
const AUDIENCE_LABELS: Record<Audience, string> = {
  all: 'Все', active: 'С подпиской', inactive: 'Без подписки',
  expiring: 'Истекающие', with_email: 'Email', with_telegram: 'Telegram',
}

const NOTIF_TYPE_CONFIG: Record<string, { label: string; color: string; icon: string; badgeClass: string }> = {
  INFO: { label: 'Инфо', color: '#06b6d4', icon: 'ℹ️', badgeClass: 'badge-blue' },
  WARNING: { label: 'Внимание', color: '#f59e0b', icon: '⚠️', badgeClass: 'badge-yellow' },
  SUCCESS: { label: 'Успех', color: '#10b981', icon: '✅', badgeClass: 'badge-green' },
  PROMO: { label: 'Промо', color: '#8b5cf6', icon: '🎁', badgeClass: 'badge-violet' },
}

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

const fmtChatDate = (iso: string) => {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000 && d.getDate() === now.getDate())
    return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  if (diff < 604800000)
    return d.toLocaleDateString('ru', { weekday: 'short' })
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const CHAT_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'badge-green', INACTIVE: 'badge-gray', EXPIRED: 'badge-red', TRIAL: 'badge-blue',
}

const chatInitial = (u: ChatUser) => (u.telegramName || u.email || 'U')[0].toUpperCase()
const chatDisplayName = (u: ChatUser) => u.telegramName || u.email?.split('@')[0] || `ID:${u.id.slice(0, 8)}`

const BOT_DEFAULTS: BotSettings = {
  bot_start_text: '👋 Привет! Я бот сервиса HIDEYOU VPN.',
  bot_subscription_active: '✅ Подписка активна',
  bot_subscription_inactive: '❌ У вас нет активной подписки',
  bot_tariff_header: '💳 Выберите тариф:',
  bot_promo_prompt: '🎟 Введите промокод:',
  bot_promo_success: '✅ Промокод активирован!',
  bot_btn_subscription: '🔑 Подписка',
  bot_btn_tariffs: '💳 Тарифы',
  bot_btn_referral: '👥 Рефералы',
  bot_btn_balance: '💰 Баланс',
  bot_btn_promo: '🎟 Промокод',
  bot_btn_devices: '📱 Устройства',
  bot_btn_instructions: '📖 Инструкции',
  bot_btn_open_lk: '🌐 Открыть ЛК',
  bot_support_url: '', bot_channel_url: '',
  bot_feature_promo: 'true', bot_feature_devices: 'true',
  bot_feature_instructions: 'true', bot_feature_balance: 'true',
}

type FieldDef =
  | { key: string; label: string; type: 'textarea'; placeholder?: string }
  | { key: string; label: string; type: 'text'; placeholder?: string }
  | { key: string; label: string; type: 'url'; placeholder?: string }
  | { key: string; label: string; type: 'toggle' }

interface BotSection { id: string; icon: any; title: string; fields: FieldDef[] }

const BOT_SECTIONS: BotSection[] = [
  {
    id: 'messages', icon: MessageSquare, title: 'Тексты сообщений',
    fields: [
      { key: 'bot_start_text', label: 'Приветствие', type: 'textarea', placeholder: 'Текст приветствия бота...' },
      { key: 'bot_subscription_active', label: 'Подписка активна', type: 'textarea', placeholder: 'Текст активной подписки...' },
      { key: 'bot_subscription_inactive', label: 'Подписка неактивна', type: 'textarea', placeholder: 'Текст неактивной подписки...' },
      { key: 'bot_tariff_header', label: 'Заголовок тарифов', type: 'textarea', placeholder: 'Заголовок списка тарифов...' },
      { key: 'bot_promo_prompt', label: 'Запрос промокода', type: 'textarea', placeholder: 'Текст запроса промокода...' },
      { key: 'bot_promo_success', label: 'Промокод применён', type: 'textarea', placeholder: 'Текст успеха промокода...' },
    ],
  },
  {
    id: 'buttons', icon: Mouse, title: 'Кнопки главного меню',
    fields: [
      { key: 'bot_btn_subscription', label: 'Подписка', type: 'text', placeholder: '🔑 Подписка' },
      { key: 'bot_btn_tariffs', label: 'Тарифы', type: 'text', placeholder: '💳 Тарифы' },
      { key: 'bot_btn_referral', label: 'Рефералы', type: 'text', placeholder: '👥 Рефералы' },
      { key: 'bot_btn_balance', label: 'Баланс', type: 'text', placeholder: '💰 Баланс' },
      { key: 'bot_btn_promo', label: 'Промокод', type: 'text', placeholder: '🎟 Промокод' },
      { key: 'bot_btn_devices', label: 'Устройства', type: 'text', placeholder: '📱 Устройства' },
      { key: 'bot_btn_instructions', label: 'Инструкции', type: 'text', placeholder: '📖 Инструкции' },
      { key: 'bot_btn_open_lk', label: 'Открыть ЛК', type: 'text', placeholder: '🌐 Открыть ЛК' },
    ],
  },
  {
    id: 'links', icon: Link2, title: 'Ссылки',
    fields: [
      { key: 'bot_support_url', label: 'Ссылка на поддержку', type: 'url', placeholder: 'https://t.me/support' },
      { key: 'bot_channel_url', label: 'Канал Telegram', type: 'url', placeholder: 'https://t.me/channel' },
    ],
  },
  {
    id: 'toggles', icon: ToggleLeft, title: 'Переключатели',
    fields: [
      { key: 'bot_feature_promo', label: 'Промокоды в боте', type: 'toggle' },
      { key: 'bot_feature_devices', label: 'Устройства в боте', type: 'toggle' },
      { key: 'bot_feature_instructions', label: 'Инструкции в боте', type: 'toggle' },
      { key: 'bot_feature_balance', label: 'Баланс в боте', type: 'toggle' },
    ],
  },
]

/* ============================================================
   MAIN COMPONENT
   ============================================================ */

export default function CommunicationsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('broadcasts')

  const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'broadcasts', label: 'Рассылки', icon: <Send className="w-4 h-4" /> },
    { key: 'funnels', label: 'Автоворонки', icon: <Zap className="w-4 h-4" /> },
    { key: 'bot_settings', label: 'Настройки бота', icon: <Settings className="w-4 h-4" /> },
    { key: 'chat_history', label: 'Чат-история', icon: <MessageCircle className="w-4 h-4" /> },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Коммуникации
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Рассылки, автоворонки, настройки бота и чат-история
        </p>
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 p-1 rounded-xl overflow-x-auto"
        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
      >
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
            style={{
              background: activeTab === t.key ? 'rgba(139,92,246,0.12)' : 'transparent',
              color: activeTab === t.key ? 'var(--accent-1)' : 'var(--text-secondary)',
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'broadcasts' && <BroadcastsTab />}
      {activeTab === 'funnels' && <FunnelsTab />}
      {activeTab === 'bot_settings' && <BotSettingsTab />}
      {activeTab === 'chat_history' && <ChatHistoryTab />}

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
      `}</style>
    </div>
  )
}

/* ============================================================
   TAB 1: BROADCASTS (Merge of broadcast + notifications)
   ============================================================ */

function BroadcastsTab() {
  const [subTab, setSubTab] = useState<'create' | 'history'>('create')

  // Channel mode: tg_bot, email, lk (notifications), all
  const [channelMode, setChannelMode] = useState<'tg_bot' | 'email' | 'lk' | 'all'>('tg_bot')
  const [audience, setAudience] = useState<Audience>('all')
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(false)

  // TG fields
  const [tgText, setTgText] = useState('')
  const [tgButtons, setTgButtons] = useState<InlineButton[]>([])
  const [tgParseMode, setTgParseMode] = useState<'Markdown' | 'HTML'>('Markdown')
  const [tgMediaType, setTgMediaType] = useState<string>('')
  const [tgMediaUrl, setTgMediaUrl] = useState('')
  const [tgPollEnabled, setTgPollEnabled] = useState(false)
  const [tgPollQuestion, setTgPollQuestion] = useState('')
  const [tgPollOptions, setTgPollOptions] = useState(['', ''])
  const [tgPollAnonymous, setTgPollAnonymous] = useState(true)
  const [tgPollMultiple, setTgPollMultiple] = useState(false)
  const [uploading, setUploading] = useState(false)
  const tgTextareaRef = useRef<HTMLTextAreaElement>(null)
  // Email fields
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailCtaText, setEmailCtaText] = useState('')
  const [emailCtaUrl, setEmailCtaUrl] = useState('')
  const [emailTemplate, setEmailTemplate] = useState<'dark' | 'gradient' | 'minimal' | 'neon'>('dark')
  // LK (notification) fields
  const [notifTitle, setNotifTitle] = useState('')
  const [notifMessage, setNotifMessage] = useState('')
  const [notifType, setNotifType] = useState<'INFO' | 'WARNING' | 'SUCCESS' | 'PROMO'>('INFO')

  // Send controls
  const [showPreview, setShowPreview] = useState(false)
  const [showScheduler, setShowScheduler] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [confirmSend, setConfirmSend] = useState(false)
  const [sending, setSending] = useState(false)

  // History
  const [history, setHistory] = useState<Broadcast[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Notification history
  const [notifications, setNotifications] = useState<any[]>([])
  const [notifTotal, setNotifTotal] = useState(0)
  const [notifPage, setNotifPage] = useState(1)
  const [notifLoading, setNotifLoading] = useState(false)

  // ---- Map channelMode to backend channel ----
  const getBroadcastChannel = useCallback(() => {
    if (channelMode === 'tg_bot') return 'telegram'
    if (channelMode === 'email') return 'email'
    if (channelMode === 'all') return 'both'
    return 'telegram' // lk doesn't use broadcast API
  }, [channelMode])

  // ---- Audience options filtered by channel ----
  // When email selected → hide "only with telegram" (obvious)
  // When telegram selected → hide "only with email" (obvious)
  // Also hide redundant "only with email"/"only with telegram" for single-channel modes
  const filteredAudienceOptions = AUDIENCE_OPTIONS.filter(opt => {
    if (channelMode === 'email') return opt.value !== 'with_telegram' && opt.value !== 'with_email'
    if (channelMode === 'tg_bot') return opt.value !== 'with_email' && opt.value !== 'with_telegram'
    if (channelMode === 'lk') return opt.value !== 'with_email' && opt.value !== 'with_telegram'
    return true
  })

  // Reset audience if current selection is no longer valid
  useEffect(() => {
    if (!filteredAudienceOptions.find(o => o.value === audience)) {
      setAudience('all')
    }
  }, [channelMode])

  // ---- Fetch recipient count ----
  const fetchCount = useCallback(async (aud: Audience, chan: string) => {
    setLoadingCount(true)
    try {
      const data = await broadcastAPI(`/preview?audience=${aud}&channel=${chan}`)
      setRecipientCount(data.count ?? 0)
    } catch { setRecipientCount(null) }
    finally { setLoadingCount(false) }
  }, [])

  useEffect(() => { fetchCount(audience, getBroadcastChannel()) }, [audience, channelMode, fetchCount, getBroadcastChannel])

  // ---- Fetch histories ----
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const data = await broadcastAPI('')
      setHistory(Array.isArray(data) ? data : data.broadcasts ?? [])
    } catch { /* ignore */ }
    finally { setLoadingHistory(false) }
  }, [])

  const loadNotifHistory = useCallback(async () => {
    setNotifLoading(true)
    try {
      const res = await fetch(`/api/admin/notifications/list?page=${notifPage}&limit=30`, { credentials: 'include' })
      const d = await res.json()
      setNotifications(d.notifications || [])
      setNotifTotal(d.total || 0)
    } catch { /* ignore */ }
    finally { setNotifLoading(false) }
  }, [notifPage])

  useEffect(() => {
    if (subTab === 'history') {
      loadHistory()
      loadNotifHistory()
    }
  }, [subTab, loadHistory, loadNotifHistory])

  // ---- Actions ----
  const buildPayload = (extra: Record<string, unknown> = {}) => {
    const channel = getBroadcastChannel()
    return {
      channel, audience,
      ...(channel !== 'email' && {
        tgText, tgButtons: tgButtons.filter(b => b.label && b.url),
        tgParseMode,
        ...(tgMediaType && tgMediaUrl && { tgMediaType, tgMediaUrl }),
        ...(tgPollEnabled && tgPollQuestion && {
          tgPollQuestion,
          tgPollOptions: tgPollOptions.filter(o => o.trim()),
          tgPollAnonymous,
          tgPollMultiple,
        }),
      }),
      ...(channel !== 'telegram' && { emailSubject, emailHtml: emailBody, emailTemplate, ...(emailCtaText && { emailBtnText: emailCtaText }), ...(emailCtaUrl && { emailBtnUrl: emailCtaUrl }) }),
      ...extra,
    }
  }

  const sendBroadcast = async () => {
    setSending(true)
    try {
      const created = await broadcastAPI('', { method: 'POST', body: JSON.stringify(buildPayload()) })
      await broadcastAPI(`/${created.id}/send`, { method: 'POST' })
      toast.success('Рассылка отправлена')
      setConfirmSend(false)
      resetForm()
      setSubTab('history')
      loadHistory()
    } catch (e: any) { toast.error(e.message || 'Ошибка отправки') }
    finally { setSending(false) }
  }

  const sendNotification = async () => {
    if (!notifTitle || !notifMessage) return
    setSending(true)
    try {
      await fetch('/api/admin/notifications/send', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: notifTitle, message: notifMessage, type: notifType }),
      })
      toast.success('Уведомление отправлено')
      setNotifTitle(''); setNotifMessage('')
    } catch (e: any) { toast.error(e.message || 'Ошибка') }
    finally { setSending(false) }
  }

  const sendAll = async () => {
    setSending(true)
    try {
      // Send TG/Email broadcast
      if (channelMode === 'all' || channelMode === 'tg_bot' || channelMode === 'email') {
        const created = await broadcastAPI('', { method: 'POST', body: JSON.stringify(buildPayload()) })
        await broadcastAPI(`/${created.id}/send`, { method: 'POST' })
      }
      // Send LK notification
      if (channelMode === 'all' || channelMode === 'lk') {
        if (notifTitle && notifMessage) {
          await fetch('/api/admin/notifications/send', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: notifTitle, message: notifMessage, type: notifType }),
          })
        }
      }
      toast.success('Отправлено')
      setConfirmSend(false)
      resetForm()
      setSubTab('history')
    } catch (e: any) { toast.error(e.message || 'Ошибка') }
    finally { setSending(false) }
  }

  const scheduleBroadcast = async () => {
    if (!scheduledAt) return
    setSending(true)
    try {
      await broadcastAPI('', { method: 'POST', body: JSON.stringify(buildPayload({ scheduledAt })) })
      setShowScheduler(false)
      toast.success('Рассылка запланирована')
      resetForm()
      setSubTab('history')
      loadHistory()
    } catch (e: any) { toast.error(e.message || 'Ошибка') }
    finally { setSending(false) }
  }

  const cancelBroadcast = async (id: string) => {
    try { await broadcastAPI(`/${id}/cancel`, { method: 'POST' }); loadHistory() }
    catch (e: any) { toast.error(e.message) }
  }

  const deleteBroadcast = async (id: string) => {
    if (!confirm('Удалить рассылку?')) return
    try { await broadcastAPI(`/${id}`, { method: 'DELETE' }); loadHistory() }
    catch (e: any) { toast.error(e.message) }
  }

  const deleteNotif = async (id: string) => {
    await fetch(`/api/admin/notifications/${id}`, { method: 'DELETE', credentials: 'include' })
    toast.success('Удалено')
    loadNotifHistory()
  }

  const resetForm = () => {
    setChannelMode('tg_bot'); setAudience('all')
    setTgText(''); setTgButtons([]); setEmailSubject(''); setEmailBody('')
    setEmailCtaText(''); setEmailCtaUrl(''); setScheduledAt('')
    setNotifTitle(''); setNotifMessage(''); setNotifType('INFO')
    setTgParseMode('Markdown'); setTgMediaType(''); setTgMediaUrl('')
    setTgPollEnabled(false); setTgPollQuestion(''); setTgPollOptions(['', ''])
    setTgPollAnonymous(true); setTgPollMultiple(false)
  }

  // TG buttons
  const addTgButton = () => { if (tgButtons.length < 5) setTgButtons([...tgButtons, { label: '', url: '' }]) }
  const updateTgButton = (i: number, field: keyof InlineButton, val: string) => {
    const copy = [...tgButtons]; copy[i] = { ...copy[i], [field]: val }; setTgButtons(copy)
  }
  const removeTgButton = (i: number) => setTgButtons(tgButtons.filter((_, idx) => idx !== i))

  // TG rich editor helpers
  const insertFormatting = (before: string, after: string) => {
    const ta = tgTextareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = tgText.substring(start, end)
    const replacement = before + (selected || 'text') + after
    const newText = tgText.substring(0, start) + replacement + tgText.substring(end)
    setTgText(newText)
    setTimeout(() => {
      ta.focus()
      const cursorPos = selected ? start + replacement.length : start + before.length
      const cursorEnd = selected ? start + replacement.length : start + before.length + 4
      ta.setSelectionRange(selected ? cursorPos : cursorPos, selected ? cursorEnd : cursorEnd)
    }, 0)
  }

  const toolbarActions = [
    { label: 'B', title: 'Жирный', md: ['*', '*'], html: ['<b>', '</b>'] },
    { label: 'I', title: 'Курсив', md: ['_', '_'], html: ['<i>', '</i>'], italic: true },
    { label: 'S', title: 'Зачёркнутый', md: ['~', '~'], html: ['<s>', '</s>'], strike: true },
    { label: '</>', title: 'Код', md: ['`', '`'], html: ['<code>', '</code>'] },
    { label: 'Pre', title: 'Блок кода', md: ['```\n', '\n```'], html: ['<pre>', '</pre>'] },
  ]

  const insertLink = () => {
    const ta = tgTextareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = tgText.substring(start, end) || 'текст'
    const link = tgParseMode === 'Markdown'
      ? `[${selected}](url)`
      : `<a href="url">${selected}</a>`
    const newText = tgText.substring(0, start) + link + tgText.substring(end)
    setTgText(newText)
    setTimeout(() => { ta.focus() }, 0)
  }

  const insertCustomEmoji = () => {
    const emojiId = prompt('Введите ID премиум-эмоджи (custom_emoji_id):\n\nНайти ID можно: отправь эмоджи боту @RawDataBot')
    if (!emojiId?.trim()) return
    const ta = tgTextareaRef.current
    const pos = ta ? ta.selectionStart : tgText.length
    // Custom emoji works only in HTML parse mode
    if (tgParseMode !== 'HTML') setTgParseMode('HTML')
    const tag = `<tg-emoji emoji-id="${emojiId.trim()}">⭐</tg-emoji>`
    const newText = tgText.substring(0, pos) + tag + tgText.substring(pos)
    setTgText(newText)
    setTimeout(() => { ta?.focus() }, 0)
  }

  const insertSpoiler = () => {
    const ta = tgTextareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = tgText.substring(start, end) || 'скрытый текст'
    const tag = tgParseMode === 'Markdown'
      ? `||${selected}||`
      : `<tg-spoiler>${selected}</tg-spoiler>`
    const newText = tgText.substring(0, start) + tag + tgText.substring(end)
    setTgText(newText)
    setTimeout(() => { ta.focus() }, 0)
  }

  const uploadMedia = async (file: File) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/admin/upload', { method: 'POST', credentials: 'include', body: form })
      const data = await res.json()
      if (data.url) setTgMediaUrl(data.url)
    } catch { toast.error('Ошибка загрузки') }
    finally { setUploading(false) }
  }

  const addPollOption = () => {
    if (tgPollOptions.length < 10) setTgPollOptions([...tgPollOptions, ''])
  }
  const updatePollOption = (i: number, val: string) => {
    const copy = [...tgPollOptions]; copy[i] = val; setTgPollOptions(copy)
  }
  const removePollOption = (i: number) => {
    if (tgPollOptions.length > 2) setTgPollOptions(tgPollOptions.filter((_, idx) => idx !== i))
  }

  // Simple Markdown/HTML preview renderer
  const renderTgPreview = (text: string): string => {
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    if (tgParseMode === 'Markdown') {
      html = html
        .replace(/```\n?([\s\S]*?)\n?```/g, '<pre style="background:rgba(0,0,0,0.3);padding:8px;border-radius:6px;font-size:12px;overflow-x:auto">$1</pre>')
        .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.3);padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
        .replace(/\*([^*]+)\*/g, '<b>$1</b>')
        .replace(/_([^_]+)_/g, '<i>$1</i>')
        .replace(/~([^~]+)~/g, '<s>$1</s>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#60a5fa;text-decoration:underline" target="_blank" rel="noopener">$1</a>')
    } else {
      // HTML mode: unescape the tags we support
      html = html
        .replace(/&lt;b&gt;([\s\S]*?)&lt;\/b&gt;/g, '<b>$1</b>')
        .replace(/&lt;i&gt;([\s\S]*?)&lt;\/i&gt;/g, '<i>$1</i>')
        .replace(/&lt;s&gt;([\s\S]*?)&lt;\/s&gt;/g, '<s>$1</s>')
        .replace(/&lt;code&gt;([\s\S]*?)&lt;\/code&gt;/g, '<code style="background:rgba(0,0,0,0.3);padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
        .replace(/&lt;pre&gt;([\s\S]*?)&lt;\/pre&gt;/g, '<pre style="background:rgba(0,0,0,0.3);padding:8px;border-radius:6px;font-size:12px;overflow-x:auto">$1</pre>')
        .replace(/&lt;a href=&quot;([^&]*)&quot;&gt;([\s\S]*?)&lt;\/a&gt;/g, '<a href="$1" style="color:#60a5fa;text-decoration:underline" target="_blank" rel="noopener">$2</a>')
    }
    html = html.replace(/\n/g, '<br/>')
    return html
  }

  const MEDIA_TYPES = [
    { value: 'photo', icon: '📷', label: 'Фото' },
    { value: 'video', icon: '🎥', label: 'Видео' },
    { value: 'animation', icon: '🎬', label: 'GIF' },
    { value: 'document', icon: '📄', label: 'Файл' },
    { value: '', icon: '❌', label: 'Без медиа' },
  ]

  // Validation
  const showTg = channelMode === 'tg_bot' || channelMode === 'all'
  const showEmail = channelMode === 'email' || channelMode === 'all'
  const showLk = channelMode === 'lk' || channelMode === 'all'

  const canSend =
    (showTg ? tgText.trim().length > 0 : true) &&
    (showEmail ? emailSubject.trim().length > 0 && emailBody.trim().length > 0 : true) &&
    (showLk ? notifTitle.trim().length > 0 && notifMessage.trim().length > 0 : true)

  const notifTotalPages = Math.ceil(notifTotal / 30)

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
        {([['create', 'Создать'], ['history', 'История']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setSubTab(key)}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: subTab === key ? 'rgba(139,92,246,0.12)' : 'transparent', color: subTab === key ? 'var(--accent-1)' : 'var(--text-secondary)' }}
          >{label}</button>
        ))}
      </div>

      {subTab === 'create' && (
        <div className="space-y-6">
          {/* Step 1: Channel */}
          <div className="glass-card gradient-border">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>1</span>
              Канал
            </h3>
            <div className="flex gap-2 flex-wrap">
              {([
                ['tg_bot', 'TG бот', MessageCircle],
                ['email', 'Email', Mail],
                ['lk', 'Уведомление в ЛК', Bell],
                ['all', 'Все', Send],
              ] as const).map(([ch, label, Icon]) => (
                <button key={ch} onClick={() => setChannelMode(ch)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all"
                  style={{
                    background: channelMode === ch ? 'rgba(139,92,246,0.12)' : 'var(--glass-bg)',
                    border: `1px solid ${channelMode === ch ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                    color: channelMode === ch ? 'var(--accent-1)' : 'var(--text-secondary)',
                  }}>
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Audience */}
          <div className="glass-card gradient-border">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>2</span>
              Аудитория
              {recipientCount !== null && (
                <span className="ml-auto badge-green text-xs px-2 py-0.5 rounded-full font-medium">
                  <Users className="w-3 h-3 inline mr-1" />
                  {loadingCount ? '...' : recipientCount} получателей
                </span>
              )}
            </h3>
            <div className="space-y-1.5">
              {filteredAudienceOptions.map(opt => (
                <label key={opt.value}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all"
                  style={{ background: audience === opt.value ? 'rgba(139,92,246,0.06)' : 'transparent' }}>
                  <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                    style={{ border: `2px solid ${audience === opt.value ? 'var(--accent-1)' : 'var(--glass-border)'}` }}>
                    {audience === opt.value && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-1)' }} />}
                  </div>
                  <input type="radio" name="audience" value={opt.value} checked={audience === opt.value}
                    onChange={() => setAudience(opt.value)} className="sr-only" />
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Step 3: Message */}
          <div className="glass-card gradient-border">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>3</span>
              Сообщение
            </h3>
            <div className="space-y-5">
              {/* TG fields — Rich Editor */}
              {showTg && (
                <div className="space-y-4">
                  <label className="text-xs font-medium flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <MessageCircle className="w-3.5 h-3.5" /> Telegram
                  </label>

                  {/* Parse mode toggle */}
                  <div className="flex items-center gap-1 p-0.5 rounded-lg w-fit"
                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                    {(['Markdown', 'HTML'] as const).map(mode => (
                      <button key={mode} onClick={() => setTgParseMode(mode)}
                        className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                        style={{
                          background: tgParseMode === mode ? 'rgba(139,92,246,0.15)' : 'transparent',
                          color: tgParseMode === mode ? '#a78bfa' : 'var(--text-tertiary)',
                        }}>
                        {mode}
                      </button>
                    ))}
                  </div>

                  {/* Toolbar */}
                  <div className="flex items-center gap-1 flex-wrap p-1.5 rounded-xl"
                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                    {toolbarActions.map(action => (
                      <button key={action.label}
                        onClick={() => {
                          const [before, after] = tgParseMode === 'Markdown' ? action.md : action.html
                          insertFormatting(before, after)
                        }}
                        title={action.title}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all hover:scale-105"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid var(--glass-border)',
                          color: 'var(--text-secondary)',
                          fontWeight: action.label === 'B' ? 700 : 500,
                          fontStyle: action.italic ? 'italic' : 'normal',
                          textDecoration: action.strike ? 'line-through' : 'none',
                        }}>
                        {action.label}
                      </button>
                    ))}
                    <button onClick={insertLink} title="Ссылка"
                      className="px-2.5 py-1.5 rounded-lg text-xs transition-all hover:scale-105 flex items-center gap-1"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid var(--glass-border)',
                        color: 'var(--text-secondary)',
                      }}>
                      <Link2 className="w-3 h-3" /> Ссылка
                    </button>
                    <button onClick={insertSpoiler} title="Спойлер"
                      className="px-2.5 py-1.5 rounded-lg text-xs transition-all hover:scale-105"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid var(--glass-border)',
                        color: 'var(--text-secondary)',
                      }}>
                      ▓ Спойлер
                    </button>
                    <button onClick={insertCustomEmoji} title="Премиум эмоджи"
                      className="px-2.5 py-1.5 rounded-lg text-xs transition-all hover:scale-105"
                      style={{
                        background: 'rgba(139,92,246,0.08)',
                        border: '1px solid rgba(139,92,246,0.2)',
                        color: '#a78bfa',
                      }}>
                      ✨ Эмоджи
                    </button>
                  </div>

                  {/* Textarea */}
                  <textarea ref={tgTextareaRef} value={tgText} onChange={e => setTgText(e.target.value)}
                    placeholder={tgParseMode === 'Markdown' ? 'Текст сообщения (*жирный*, _курсив_, ~зачёркнутый~)' : 'Текст сообщения (<b>жирный</b>, <i>курсив</i>, <s>зачёркнутый</s>)'}
                    rows={6} className="glass-input w-full resize-y text-sm font-mono"
                    style={{ lineHeight: '1.6' }} />

                  {/* Media section */}
                  <div className="space-y-3">
                    <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Медиа</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {MEDIA_TYPES.map(mt => (
                        <button key={mt.value} onClick={() => { setTgMediaType(mt.value); if (!mt.value) setTgMediaUrl('') }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all"
                          style={{
                            background: tgMediaType === mt.value ? 'rgba(139,92,246,0.12)' : 'var(--glass-bg)',
                            border: `1px solid ${tgMediaType === mt.value ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                            color: tgMediaType === mt.value ? 'var(--accent-1)' : 'var(--text-tertiary)',
                          }}>
                          <span>{mt.icon}</span> {mt.label}
                        </button>
                      ))}
                    </div>
                    {tgMediaType && (
                      <div className="flex gap-2 items-center">
                        <input value={tgMediaUrl} onChange={e => setTgMediaUrl(e.target.value)}
                          placeholder="URL медиа или путь /uploads/..." className="glass-input flex-1 text-sm" />
                        <label className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all"
                          style={{
                            background: 'rgba(139,92,246,0.08)',
                            border: '1px solid rgba(139,92,246,0.2)',
                            color: '#a78bfa',
                            opacity: uploading ? 0.5 : 1,
                          }}>
                          {uploading
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Upload className="w-3.5 h-3.5" />}
                          {uploading ? 'Загрузка...' : 'Загрузить'}
                          <input type="file" className="sr-only" disabled={uploading}
                            onChange={e => { if (e.target.files?.[0]) uploadMedia(e.target.files[0]) }} />
                        </label>
                      </div>
                    )}
                    {tgMediaType === 'photo' && tgMediaUrl && (
                      <div className="rounded-xl overflow-hidden w-fit" style={{ border: '1px solid var(--glass-border)' }}>
                        <img src={tgMediaUrl} alt="preview" className="max-h-32 max-w-full object-contain"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      </div>
                    )}
                  </div>

                  {/* Inline buttons */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Inline кнопки</p>
                    {tgButtons.map((btn, i) => (
                      <div key={i} className="flex gap-2 items-center group">
                        <GripVertical className="w-4 h-4 flex-shrink-0 opacity-30 group-hover:opacity-60 transition-opacity"
                          style={{ color: 'var(--text-tertiary)' }} />
                        <input value={btn.label} onChange={e => updateTgButton(i, 'label', e.target.value)}
                          placeholder="Текст кнопки" className="glass-input flex-1 text-sm" />
                        <input value={btn.url} onChange={e => updateTgButton(i, 'url', e.target.value)}
                          placeholder="URL" className="glass-input flex-1 text-sm" />
                        <button onClick={() => removeTgButton(i)}
                          className="p-2 rounded-lg transition-colors hover:bg-red-500/10 flex-shrink-0"
                          style={{ color: 'var(--text-tertiary)' }}><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                    {tgButtons.length < 5 && (
                      <button onClick={addTgButton} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg transition-all"
                        style={{ color: 'var(--accent-1)', background: 'rgba(139,92,246,0.06)' }}>
                        <Plus className="w-3.5 h-3.5" /> Добавить кнопку
                      </button>
                    )}
                  </div>

                  {/* Poll section */}
                  <div className="space-y-3 rounded-xl p-3" style={{ background: 'rgba(139,92,246,0.03)', border: '1px solid var(--glass-border)' }}>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={tgPollEnabled} onChange={e => setTgPollEnabled(e.target.checked)}
                        className="w-4 h-4 rounded accent-purple-500" />
                      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Добавить опрос</span>
                    </label>
                    {tgPollEnabled && (
                      <div className="space-y-3 pt-1">
                        <input value={tgPollQuestion} onChange={e => setTgPollQuestion(e.target.value)}
                          placeholder="Вопрос опроса" className="glass-input w-full text-sm" />
                        <div className="space-y-2">
                          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Варианты ответа</p>
                          {tgPollOptions.map((opt, i) => (
                            <div key={i} className="flex gap-2 items-center">
                              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}>{i + 1}</span>
                              <input value={opt} onChange={e => updatePollOption(i, e.target.value)}
                                placeholder={`Вариант ${i + 1}`} className="glass-input flex-1 text-sm" />
                              {tgPollOptions.length > 2 && (
                                <button onClick={() => removePollOption(i)}
                                  className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10 flex-shrink-0"
                                  style={{ color: 'var(--text-tertiary)' }}><X className="w-3.5 h-3.5" /></button>
                              )}
                            </div>
                          ))}
                          {tgPollOptions.length < 10 && (
                            <button onClick={addPollOption} className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg transition-all"
                              style={{ color: 'var(--accent-1)', background: 'rgba(139,92,246,0.06)' }}>
                              <Plus className="w-3 h-3" /> Добавить вариант
                            </button>
                          )}
                        </div>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={tgPollAnonymous} onChange={e => setTgPollAnonymous(e.target.checked)}
                              className="w-3.5 h-3.5 rounded accent-purple-500" />
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Анонимный</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={tgPollMultiple} onChange={e => setTgPollMultiple(e.target.checked)}
                              className="w-3.5 h-3.5 rounded accent-purple-500" />
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Множественный выбор</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Preview panel */}
                  {(tgText || tgMediaUrl || tgPollEnabled) && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Предпросмотр</p>
                      <div className="rounded-2xl overflow-hidden"
                        style={{
                          background: 'linear-gradient(135deg, rgba(30,41,59,0.9), rgba(15,23,42,0.95))',
                          border: '1px solid rgba(255,255,255,0.06)',
                          maxWidth: '380px',
                        }}>
                        {/* Media preview */}
                        {tgMediaType === 'photo' && tgMediaUrl && (
                          <div className="w-full bg-black/20">
                            <img src={tgMediaUrl} alt="" className="w-full max-h-48 object-cover"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          </div>
                        )}
                        {tgMediaType && tgMediaType !== 'photo' && tgMediaUrl && (
                          <div className="px-4 pt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {tgMediaType === 'video' && <span>🎥</span>}
                            {tgMediaType === 'animation' && <span>🎬</span>}
                            {tgMediaType === 'document' && <span>📄</span>}
                            <span className="truncate">{tgMediaUrl.split('/').pop()}</span>
                          </div>
                        )}

                        {/* Message text */}
                        {tgText && (
                          <div className="px-4 py-3">
                            <div className="text-[13px] leading-relaxed" style={{ color: '#e2e8f0' }}
                              dangerouslySetInnerHTML={{ __html: renderTgPreview(tgText) }} />
                          </div>
                        )}

                        {/* Inline buttons preview */}
                        {tgButtons.filter(b => b.label).length > 0 && (
                          <div className="px-3 pb-3 space-y-1">
                            {tgButtons.filter(b => b.label).map((btn, i) => (
                              <div key={i} className="text-center text-[13px] py-2 rounded-lg font-medium cursor-default"
                                style={{
                                  background: 'rgba(58,130,240,0.12)',
                                  color: '#60a5fa',
                                }}>
                                {btn.label}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Poll preview */}
                        {tgPollEnabled && tgPollQuestion && (
                          <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <p className="text-[13px] font-semibold mb-2" style={{ color: '#e2e8f0' }}>{tgPollQuestion}</p>
                            <div className="space-y-1.5">
                              {tgPollOptions.filter(o => o.trim()).map((opt, i) => (
                                <div key={i} className="flex items-center gap-2 text-[12px] py-1.5 px-2.5 rounded-lg"
                                  style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8' }}>
                                  {tgPollMultiple
                                    ? <div className="w-3.5 h-3.5 rounded border flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.2)' }} />
                                    : <div className="w-3.5 h-3.5 rounded-full border flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.2)' }} />}
                                  {opt}
                                </div>
                              ))}
                            </div>
                            <p className="text-xs mt-2" style={{ color: '#64748b' }}>
                              {tgPollAnonymous ? 'Анонимный опрос' : 'Публичный опрос'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {showTg && showEmail && <div style={{ borderTop: '1px solid var(--glass-border)' }} />}

              {/* Email fields */}
              {showEmail && (
                <div className="space-y-3">
                  <label className="text-xs font-medium flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <Mail className="w-3.5 h-3.5" /> Email
                  </label>
                  <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                    placeholder="Тема письма" className="glass-input w-full text-sm" />
                  <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)}
                    placeholder="Текст письма (HTML)" rows={6} className="glass-input w-full resize-y text-sm" />
                  <div className="flex gap-2">
                    <input value={emailCtaText} onChange={e => setEmailCtaText(e.target.value)}
                      placeholder="CTA текст" className="glass-input flex-1 text-sm" />
                    <input value={emailCtaUrl} onChange={e => setEmailCtaUrl(e.target.value)}
                      placeholder="CTA URL" className="glass-input flex-1 text-sm" />
                  </div>

                  {/* Email template selector */}
                  <div>
                    <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>Шаблон письма</p>
                    <div className="grid grid-cols-4 gap-2">
                      {([
                        { id: 'dark' as const, name: 'Тёмный', bg: '#1e293b', accent: '#5569ff', border: '#334155' },
                        { id: 'gradient' as const, name: 'Градиент', bg: '#1e1b4b', accent: '#a78bfa', border: 'rgba(139,92,246,0.3)' },
                        { id: 'minimal' as const, name: 'Светлый', bg: '#ffffff', accent: '#3b82f6', border: '#e2e8f0' },
                        { id: 'neon' as const, name: 'Неон', bg: '#0a0a0a', accent: '#22d3ee', border: 'rgba(34,211,238,0.3)' },
                      ]).map(t => (
                        <button key={t.id} type="button" onClick={() => setEmailTemplate(t.id)}
                          className="p-2 rounded-xl transition-all text-center"
                          style={{
                            border: `2px solid ${emailTemplate === t.id ? t.accent : 'var(--glass-border)'}`,
                            background: emailTemplate === t.id ? `${t.accent}10` : 'transparent',
                          }}>
                          <div className="w-full h-8 rounded-lg mb-1.5 flex items-center justify-center"
                               style={{ background: t.bg, border: `1px solid ${t.border}` }}>
                            <div className="w-8 h-1.5 rounded-full" style={{ background: t.accent }} />
                          </div>
                          <span className="text-xs font-medium" style={{
                            color: emailTemplate === t.id ? t.accent : 'var(--text-tertiary)',
                          }}>{t.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {(showTg || showEmail) && showLk && <div style={{ borderTop: '1px solid var(--glass-border)' }} />}

              {/* LK notification fields */}
              {showLk && (
                <div className="space-y-3">
                  <label className="text-xs font-medium flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <Bell className="w-3.5 h-3.5" /> Уведомление в ЛК
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {(['INFO', 'WARNING', 'SUCCESS', 'PROMO'] as const).map(t => {
                      const cfg = NOTIF_TYPE_CONFIG[t]
                      const active = notifType === t
                      return (
                        <button key={t} onClick={() => setNotifType(t)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all"
                          style={{
                            background: active ? `${cfg.color}20` : 'var(--glass-bg)',
                            border: `1px solid ${active ? cfg.color : 'var(--glass-border)'}`,
                            color: active ? cfg.color : 'var(--text-tertiary)',
                          }}>
                          <span>{cfg.icon}</span> {cfg.label}
                        </button>
                      )
                    })}
                  </div>
                  <input value={notifTitle} onChange={e => setNotifTitle(e.target.value)}
                    placeholder="Заголовок" className="glass-input w-full text-sm" />
                  <textarea value={notifMessage} onChange={e => setNotifMessage(e.target.value)}
                    placeholder="Текст уведомления" rows={3} className="glass-input w-full resize-y text-sm" />
                </div>
              )}
            </div>
          </div>

          {/* Step 4: Send */}
          <div className="glass-card gradient-border">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>4</span>
              Отправка
            </h3>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setShowPreview(true)} disabled={!canSend}
                className="btn-secondary text-sm flex items-center gap-2 disabled:opacity-40">
                <Eye className="w-4 h-4" /> Предпросмотр
              </button>
              {channelMode !== 'lk' && (
                <button onClick={() => setShowScheduler(true)} disabled={!canSend}
                  className="btn-secondary text-sm flex items-center gap-2 disabled:opacity-40">
                  <Calendar className="w-4 h-4" /> Запланировать
                </button>
              )}
              <button onClick={() => setConfirmSend(true)} disabled={!canSend}
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40">
                <Send className="w-4 h-4" /> Отправить сейчас
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History sub-tab */}
      {subTab === 'history' && (
        <div className="space-y-6">
          {/* Broadcast history */}
          <div className="glass-card gradient-border overflow-hidden">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 px-1" style={{ color: 'var(--text-primary)' }}>
              <Send className="w-4 h-4" style={{ color: '#a78bfa' }} /> Рассылки (TG / Email)
            </h3>
            {loadingHistory ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 rounded-full border-2 border-transparent"
                  style={{ borderTopColor: '#8b5cf6', borderRightColor: '#06b6d4', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
                <Send className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Рассылок пока нет</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                      {['Дата', 'Канал', 'Аудитория', 'Получ.', 'Отпр.', 'Ошибки', 'Статус', ''].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(item => (
                      <tr key={item.id}>
                        <td colSpan={8} className="p-0">
                          <div
                            className="flex items-center cursor-pointer transition-colors px-4 py-3"
                            style={{ borderBottom: '1px solid var(--glass-border)' }}
                            onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.04)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <span className="flex-1 grid grid-cols-8 gap-0 items-center text-sm">
                              <span className="px-0 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{fmtDate(item.createdAt)}</span>
                              <span style={{ color: 'var(--text-secondary)' }}>{CHANNEL_LABELS[item.channel] ?? item.channel}</span>
                              <span style={{ color: 'var(--text-secondary)' }}>{AUDIENCE_LABELS[item.audience] ?? item.audience}</span>
                              <span style={{ color: 'var(--text-secondary)' }}>{item.recipientCount}</span>
                              <span style={{ color: 'var(--text-secondary)' }}>{item.sentCount}</span>
                              <span style={{ color: item.errorCount > 0 ? '#ef4444' : 'var(--text-secondary)' }}>{item.errorCount}</span>
                              <span>
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${STATUS_MAP[item.status]?.cls ?? 'badge-gray'}`}
                                  style={STATUS_MAP[item.status]?.animate ? { animation: 'pulse 2s infinite' } : undefined}>
                                  {STATUS_MAP[item.status]?.label ?? item.status}
                                </span>
                              </span>
                              <span className="flex justify-end">
                                <ChevronDown className="w-4 h-4 transition-transform"
                                  style={{ color: 'var(--text-tertiary)', transform: expandedId === item.id ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                              </span>
                            </span>
                          </div>
                          {expandedId === item.id && (
                            <div className="px-4 py-4 space-y-3 text-sm" style={{ background: 'rgba(139,92,246,0.02)', borderBottom: '1px solid var(--glass-border)' }}>
                              {item.telegramText && (
                                <div>
                                  <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Telegram:</span>
                                  <pre className="mt-1 whitespace-pre-wrap text-sm" style={{ color: 'var(--text-primary)' }}>{item.telegramText}</pre>
                                </div>
                              )}
                              {item.emailSubject && (
                                <div><span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Email: {item.emailSubject}</span></div>
                              )}
                              {item.scheduledAt && (
                                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                  <Clock className="w-3.5 h-3.5" /> Запланировано на {fmtDate(item.scheduledAt)}
                                </div>
                              )}
                              <div className="flex gap-2 pt-1">
                                {item.status === 'SCHEDULED' && (
                                  <button onClick={e => { e.stopPropagation(); cancelBroadcast(item.id) }}
                                    className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-all" style={{ color: '#f87171' }}>
                                    <X className="w-3.5 h-3.5" /> Отменить
                                  </button>
                                )}
                                {(['DRAFT', 'CANCELLED', 'COMPLETED'] as BroadcastStatus[]).includes(item.status) && (
                                  <button onClick={e => { e.stopPropagation(); deleteBroadcast(item.id) }}
                                    className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-all" style={{ color: '#f87171' }}>
                                    <Trash2 className="w-3.5 h-3.5" /> Удалить
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Notification history */}
          <div className="glass-card gradient-border p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Bell className="w-4 h-4" style={{ color: '#a78bfa' }} /> Уведомления в ЛК ({notifTotal})
              </h3>
            </div>
            {notifLoading ? (
              <div className="p-8 text-center">
                <div className="w-6 h-6 mx-auto rounded-full border-2 border-transparent"
                  style={{ borderTopColor: 'var(--accent-1)', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Нет уведомлений</p>
              </div>
            ) : (
              <div>
                {notifications.map(n => {
                  const cfg = NOTIF_TYPE_CONFIG[n.type] || NOTIF_TYPE_CONFIG.INFO
                  return (
                    <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-all"
                      style={{ borderBottom: '1px solid var(--glass-border)' }}>
                      <span className="text-sm mt-0.5 flex-shrink-0">{cfg.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{n.title}</p>
                          <span className={`${cfg.badgeClass} text-xs`}>{cfg.label}</span>
                        </div>
                        <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{n.message}</p>
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{new Date(n.createdAt).toLocaleString('ru')}</span>
                      </div>
                      <button onClick={() => deleteNotif(n.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 transition-all flex-shrink-0" title="Удалить">
                        <Trash2 className="w-3.5 h-3.5" style={{ color: '#f87171' }} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            {notifTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--glass-border)' }}>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{notifPage}/{notifTotalPages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setNotifPage(p => Math.max(1, p - 1))} disabled={notifPage === 1}
                    className="p-1 disabled:opacity-30" style={{ color: 'var(--text-secondary)' }}><ChevronLeft className="w-4 h-4" /></button>
                  <button onClick={() => setNotifPage(p => Math.min(notifTotalPages, p + 1))} disabled={notifPage === notifTotalPages}
                    className="p-1 disabled:opacity-30" style={{ color: 'var(--text-secondary)' }}><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- MODALS ---- */}

      {/* Preview */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPreview(false)} />
          <div className="glass-card relative z-10 w-full max-w-lg max-h-[80vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Предпросмотр</h3>
              <button onClick={() => setShowPreview(false)} className="p-1" style={{ color: 'var(--text-tertiary)' }}><X className="w-4 h-4" /></button>
            </div>
            {showTg && (
              <div className="mb-4">
                <p className="text-xs font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
                  <MessageCircle className="w-3.5 h-3.5" /> Telegram
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}>{tgParseMode}</span>
                </p>
                <div className="rounded-2xl overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, rgba(30,41,59,0.9), rgba(15,23,42,0.95))',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                  {tgMediaType === 'photo' && tgMediaUrl && (
                    <div className="w-full bg-black/20">
                      <img src={tgMediaUrl} alt="" className="w-full max-h-48 object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    </div>
                  )}
                  {tgMediaType && tgMediaType !== 'photo' && tgMediaUrl && (
                    <div className="px-4 pt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {tgMediaType === 'video' && <span>🎥</span>}
                      {tgMediaType === 'animation' && <span>🎬</span>}
                      {tgMediaType === 'document' && <span>📄</span>}
                      <span className="truncate">{tgMediaUrl.split('/').pop()}</span>
                    </div>
                  )}
                  {tgText && (
                    <div className="px-4 py-3">
                      <div className="text-[13px] leading-relaxed" style={{ color: '#e2e8f0' }}
                        dangerouslySetInnerHTML={{ __html: renderTgPreview(tgText) }} />
                    </div>
                  )}
                  {!tgText && (
                    <div className="px-4 py-3 text-sm" style={{ color: '#64748b' }}>(пусто)</div>
                  )}
                  {tgButtons.filter(b => b.label).length > 0 && (
                    <div className="px-3 pb-3 space-y-1">
                      {tgButtons.filter(b => b.label).map((btn, i) => (
                        <div key={i} className="text-center text-[13px] py-2 rounded-lg font-medium"
                          style={{ background: 'rgba(58,130,240,0.12)', color: '#60a5fa' }}>{btn.label}</div>
                      ))}
                    </div>
                  )}
                  {tgPollEnabled && tgPollQuestion && (
                    <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-[13px] font-semibold mb-2" style={{ color: '#e2e8f0' }}>{tgPollQuestion}</p>
                      <div className="space-y-1.5">
                        {tgPollOptions.filter(o => o.trim()).map((opt, i) => (
                          <div key={i} className="flex items-center gap-2 text-[12px] py-1.5 px-2.5 rounded-lg"
                            style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8' }}>
                            {tgPollMultiple
                              ? <div className="w-3.5 h-3.5 rounded border flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.2)' }} />
                              : <div className="w-3.5 h-3.5 rounded-full border flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.2)' }} />}
                            {opt}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs mt-2" style={{ color: '#64748b' }}>
                        {tgPollAnonymous ? 'Анонимный опрос' : 'Публичный опрос'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
            {showEmail && (
              <div className="mb-4">
                <p className="text-xs font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
                  <Mail className="w-3.5 h-3.5" /> Email
                </p>
                <div className="rounded-xl p-4 text-sm space-y-2" style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
                  <p className="font-medium">{emailSubject || '(без темы)'}</p>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }} dangerouslySetInnerHTML={{ __html: emailBody || '(пусто)' }} />
                  {emailCtaText && (
                    <div className="pt-2">
                      <span className="inline-block px-4 py-2 rounded-lg text-xs font-medium text-white"
                        style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }}>{emailCtaText}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {showLk && notifTitle && (
              <div>
                <p className="text-xs font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
                  <Bell className="w-3.5 h-3.5" /> Уведомление в ЛК
                </p>
                <div className="p-3 rounded-xl" style={{
                  background: `${NOTIF_TYPE_CONFIG[notifType].color}08`,
                  borderLeft: `3px solid ${NOTIF_TYPE_CONFIG[notifType].color}`,
                  border: `1px solid ${NOTIF_TYPE_CONFIG[notifType].color}20`,
                }}>
                  <div className="flex items-start gap-2">
                    <span className="text-sm">{NOTIF_TYPE_CONFIG[notifType].icon}</span>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{notifTitle}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{notifMessage}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduler && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowScheduler(false)} />
          <div className="glass-card relative z-10 w-full max-w-sm animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Calendar className="w-4 h-4" /> Запланировать
              </h3>
              <button onClick={() => setShowScheduler(false)} className="p-1" style={{ color: 'var(--text-tertiary)' }}><X className="w-4 h-4" /></button>
            </div>
            <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="glass-input w-full text-sm mb-4" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowScheduler(false)} className="btn-secondary text-sm">Отмена</button>
              <button onClick={scheduleBroadcast} disabled={!scheduledAt || sending}
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40">
                {sending ? 'Сохранение...' : 'Запланировать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Send Modal */}
      {confirmSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmSend(false)} />
          <div className="glass-card relative z-10 w-full max-w-sm animate-scale-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Подтвердите отправку</h3>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {recipientCount ?? '?'} получателей
                </p>
              </div>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Рассылка будет отправлена немедленно. Это действие нельзя отменить.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmSend(false)} className="btn-secondary text-sm">Отмена</button>
              <button onClick={channelMode === 'lk' ? sendNotification : (channelMode === 'all' ? sendAll : sendBroadcast)}
                disabled={sending} className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40">
                {sending ? 'Отправка...' : <><Send className="w-4 h-4" /> Отправить</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   TAB 2: AUTO-FUNNELS (with step chains)
   ============================================================ */

const CATEGORIES = [
  { id: 'onboarding', label: 'Онбординг', range: [100, 199] },
  { id: 'subscription', label: 'Подписка', range: [200, 299] },
  { id: 'payment', label: 'Оплата', range: [300, 399] },
  { id: 'referral', label: 'Рефералы', range: [400, 499] },
  { id: 'bonus', label: 'Бонусы', range: [500, 599] },
  { id: 'security', label: 'Безопасность', range: [600, 699] },
  { id: 'upsell', label: 'Апсейл', range: [700, 799] },
  { id: 'social', label: 'Социальное', range: [800, 899] },
  { id: 'engagement', label: 'Вовлечение', range: [900, 999] },
  { id: 'feedback', label: 'Фидбек', range: [1000, 1099] },
  { id: 'custom', label: 'Кастомные', range: [1100, 9999] },
]

const BOT_BTN_OPTIONS = [
  { label: '💳 Тарифы', value: 'menu:tariffs' },
  { label: '🔑 Подписка', value: 'menu:subscription' },
  { label: '📖 Инструкции', value: 'menu:instructions' },
  { label: '👥 Рефералы', value: 'menu:referral' },
  { label: '💰 Баланс', value: 'menu:balance' },
  { label: '🎟 Промокод', value: 'menu:promo' },
  { label: '📱 Устройства', value: 'menu:devices' },
]

const DELAY_TYPES = [
  { value: 'immediate', label: 'Сразу' },
  { value: 'minutes', label: 'Минуты' },
  { value: 'hours', label: 'Часы' },
  { value: 'days', label: 'Дни' },
  { value: 'exact_time', label: 'В точное время' },
  { value: 'next_day_time', label: 'На след. день' },
  { value: 'weekdays', label: 'По дням недели' },
]

const WEEKDAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function formatStepDelay(s: FunnelStep): string {
  switch (s.delayType) {
    case 'immediate': return 'Сразу'
    case 'minutes': return `Через ${s.delayValue} мин.`
    case 'hours': return `Через ${s.delayValue} ч.`
    case 'days': return `Через ${s.delayValue} дн.`
    case 'exact_time': return `В ${s.delayTime || '10:00'}`
    case 'next_day_time': return `На след. день в ${s.delayTime || '10:00'}`
    default: return 'Сразу'
  }
}

const CONDITIONS = [
  { value: 'none', label: 'Без условия' },
  { value: 'not_paid', label: 'Если не оплатил' },
  { value: 'not_connected', label: 'Если не подключился' },
  { value: 'no_subscription', label: 'Если нет подписки' },
  { value: 'expired', label: 'Если подписка истекла' },
]

const ACTIONS = [
  { value: 'none', label: 'Без действия' },
  { value: 'bonus_days', label: 'Выдать бонусные дни', unit: 'дней' },
  { value: 'balance', label: 'Пополнить баланс', unit: '₽' },
  { value: 'promo_discount', label: 'Промокод скидка', unit: '%' },
  { value: 'promo_balance', label: 'Промокод на баланс', unit: '₽' },
  { value: 'trial', label: 'Выдать пробный период', unit: 'дней' },
]

const funnelApi = (path: string, opts?: RequestInit) =>
  fetch(`/api/admin/communications${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...opts?.headers }, ...opts })
    .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`); return r.json() })

function FunnelsTab() {
  const [funnels, setFunnels] = useState<FunnelConfig[]>([])
  const [triggerOptions, setTriggerOptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [newTriggerId, setNewTriggerId] = useState('')
  const [newName, setNewName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [f, t] = await Promise.all([funnelApi('/funnels'), funnelApi('/triggers').catch(() => [])])
      setFunnels(f)
      setTriggerOptions(t)
    } catch { toast.error('Не удалось загрузить воронки') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const updStep = (funnelId: string, stepId: string, patch: Partial<FunnelStep>) =>
    setFunnels(prev => prev.map(f => f.id === funnelId ? { ...f, steps: f.steps.map(s => s.id === stepId ? { ...s, ...patch } : s) } : f))

  const saveStep = async (stepId: string) => {
    setSavingId(stepId)
    const step = funnels.flatMap(f => f.steps).find(s => s.id === stepId)
    if (!step) return
    try {
      await funnelApi(`/steps/${stepId}`, { method: 'PUT', body: JSON.stringify(step) })
      toast.success('Шаг сохранён')
    } catch { toast.error('Ошибка') }
    finally { setSavingId(null) }
  }

  const addStep = async (funnelId: string) => {
    try {
      await funnelApi(`/funnels/${funnelId}/steps`, { method: 'POST' })
      load()
    } catch { toast.error('Ошибка') }
  }

  const deleteStep = async (stepId: string) => {
    if (!confirm('Удалить шаг?')) return
    try { await funnelApi(`/steps/${stepId}`, { method: 'DELETE' }); load() }
    catch { toast.error('Ошибка') }
  }

  const saveFunnel = async (id: string) => {
    setSavingId(id)
    const f = funnels.find(x => x.id === id)
    if (!f) return
    try {
      await funnelApi(`/funnels/${id}`, { method: 'PUT', body: JSON.stringify({ name: f.name, description: f.description, enabled: f.enabled }) })
      toast.success('Сохранено')
    } catch { toast.error('Ошибка') }
    finally { setSavingId(null) }
  }

  const toggle = async (id: string) => {
    try {
      const res = await funnelApi(`/funnels/${id}/toggle`, { method: 'POST' })
      setFunnels(prev => prev.map(f => f.id === id ? { ...f, enabled: res.enabled } : f))
    } catch { toast.error('Ошибка') }
  }

  const test = async (id: string) => {
    setTestingId(id)
    try {
      const res = await funnelApi(`/funnels/${id}/test`, { method: 'POST' })
      toast.success(`Тест отправлен: ${res.sentTo} админам`)
    } catch (e: any) { toast.error(e.message) }
    finally { setTestingId(null) }
  }

  const del = async (id: string) => {
    if (!confirm('Удалить воронку?')) return
    try { await funnelApi(`/funnels/${id}`, { method: 'DELETE' }); load() }
    catch (e: any) { toast.error(e.message) }
  }

  const seed = async () => {
    try {
      const res = await funnelApi('/funnels/seed', { method: 'POST' })
      toast.success(`Создано ${res.created} воронок`)
      load()
    } catch { toast.error('Ошибка') }
  }

  const create = async () => {
    if (!newTriggerId || !newName) return
    try {
      await funnelApi('/funnels', { method: 'POST', body: JSON.stringify({ triggerId: newTriggerId, name: newName }) })
      toast.success('Воронка создана')
      setShowCreate(false); setNewTriggerId(''); setNewName('')
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  const filtered = catFilter === 'all' ? funnels :
    funnels.filter(f => {
      const cat = CATEGORIES.find(c => c.id === catFilter)
      return cat ? f.sortOrder >= cat.range[0] && f.sortOrder <= cat.range[1] : f.isCustom
    })

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-tertiary)' }} /></div>

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          {funnels.length} воронок · {funnels.filter(f => f.enabled).length} активных
        </p>
        <div className="flex gap-2">
          {funnels.length === 0 && (
            <button onClick={seed} className="btn-primary text-xs py-2 px-3"><Zap className="w-3.5 h-3.5" /> Загрузить стандартные</button>
          )}
          <button onClick={() => setShowCreate(true)} className="btn-secondary text-xs py-2 px-3"><Plus className="w-3.5 h-3.5" /> Создать</button>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => setCatFilter('all')}
          className="text-xs px-2.5.5 py-1 rounded-lg font-medium transition-all"
          style={{ background: catFilter === 'all' ? 'var(--accent-1)' : 'var(--glass-bg)', color: catFilter === 'all' ? '#fff' : 'var(--text-tertiary)', border: `1px solid ${catFilter === 'all' ? 'var(--accent-1)' : 'var(--glass-border)'}` }}>
          Все ({funnels.length})
        </button>
        {CATEGORIES.map(cat => {
          const count = funnels.filter(f => f.sortOrder >= cat.range[0] && f.sortOrder <= cat.range[1]).length
          if (count === 0 && cat.id !== 'custom') return null
          return (
            <button key={cat.id} onClick={() => setCatFilter(cat.id)}
              className="text-xs px-2.5.5 py-1 rounded-lg font-medium transition-all"
              style={{ background: catFilter === cat.id ? 'var(--accent-1)' : 'var(--glass-bg)', color: catFilter === cat.id ? '#fff' : 'var(--text-tertiary)', border: `1px solid ${catFilter === cat.id ? 'var(--accent-1)' : 'var(--glass-border)'}` }}>
              {cat.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Funnels list */}
      {filtered.map(f => (
        <div key={f.id} className="glass-card !p-0 overflow-hidden"
             style={{ borderLeft: `3px solid ${f.enabled ? '#34d399' : 'var(--glass-border)'}` }}>
          {/* Header */}
          <div className="flex items-center gap-3 p-4 flex-wrap">
            <button onClick={() => toggle(f.id)}
              className="relative w-11 h-6 rounded-full transition-all duration-300 flex-shrink-0"
              style={{ background: f.enabled ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.08)' }}>
              <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300"
                style={{ transform: f.enabled ? 'translateX(20px)' : 'translateX(0)' }} />
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-semibold" style={{ color: f.enabled ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{f.name}</h4>
                <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--glass-bg)', color: 'var(--text-tertiary)', border: '1px solid var(--glass-border)' }}>{f.triggerId}</span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                <span>{f.steps.length} {f.steps.length === 1 ? 'шаг' : f.steps.length < 5 ? 'шага' : 'шагов'}</span>
                {f.steps[0] && <span><Clock className="w-3 h-3 inline mr-0.5" />{formatStepDelay(f.steps[0])}</span>}
                {f.steps.some(s => s.channelTg) && <span className="text-cyan-400">TG</span>}
                {f.steps.some(s => s.channelEmail) && <span className="text-blue-400">Email</span>}
                {f.steps.some(s => s.channelLk) && <span className="text-violet-400">ЛК</span>}
                {(f._count?.logs ?? 0) > 0 && <span>📊 {f._count?.logs}</span>}
              </div>
            </div>

            <button onClick={() => test(f.id)} disabled={testingId === f.id}
              className="text-xs px-2.5 py-1 rounded-lg font-medium transition-all hover:scale-105"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24' }}>
              {testingId === f.id ? '...' : '🧪 Тест'}
            </button>

            <button onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
              className="p-1.5 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
              <ChevronDown className="w-4 h-4 transition-transform" style={{ transform: expandedId === f.id ? 'rotate(180deg)' : '' }} />
            </button>
          </div>

          {/* Expanded: step chain */}
          {expandedId === f.id && (
            <div className="px-4 pb-4 pt-3" style={{ borderTop: '1px solid var(--glass-border)' }}>
              {f.steps.map((s, si) => (
                <div key={s.id} className="mb-4 p-3 rounded-xl relative" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold" style={{ color: 'var(--accent-1)' }}>Шаг {si + 1} · {formatStepDelay(s)}</p>
                    <div className="flex gap-1">
                      {f.steps.length > 1 && <button onClick={() => deleteStep(s.id)} className="p-1 rounded hover:bg-red-500/10"><Trash2 className="w-3 h-3 text-red-400" /></button>}
                    </div>
                  </div>
                  {/* Delay */}
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {DELAY_TYPES.map(dt => (
                      <button key={dt.value} onClick={() => updStep(f.id, s.id, { delayType: dt.value })}
                        className="text-xs px-2.5 py-0.5 rounded-lg" style={{ background: s.delayType === dt.value ? 'var(--accent-1)' : 'transparent', color: s.delayType === dt.value ? '#fff' : 'var(--text-tertiary)', border: `1px solid ${s.delayType === dt.value ? 'var(--accent-1)' : 'var(--glass-border)'}` }}>{dt.label}</button>
                    ))}
                  </div>
                  {['minutes','hours','days'].includes(s.delayType) && <input type="number" min={1} value={s.delayValue||1} onChange={e => updStep(f.id,s.id,{delayValue:+e.target.value})} className="glass-input w-20 text-xs mb-2" />}
                  {['exact_time','next_day_time'].includes(s.delayType) && <input type="time" value={s.delayTime||'10:00'} onChange={e => updStep(f.id,s.id,{delayTime:e.target.value})} className="glass-input w-28 text-xs mb-2" />}
                  {/* Condition */}
                  {si > 0 && <div className="mb-2">
                    <select value={s.condition} onChange={e => updStep(f.id,s.id,{condition:e.target.value})} className="glass-input text-xs w-auto py-1">
                      {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>}
                  {/* Channels */}
                  <div className="flex gap-3 mb-2">
                    {[{k:'channelTg' as const,l:'TG'},{k:'channelEmail' as const,l:'Email'},{k:'channelLk' as const,l:'ЛК'}].map(ch => (
                      <label key={ch.k} className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={s[ch.k]} onChange={() => updStep(f.id,s.id,{[ch.k]:!s[ch.k]})} className="w-3 h-3 rounded accent-purple-500" />
                        <span className="text-xs" style={{color:'var(--text-secondary)'}}>{ch.l}</span>
                      </label>
                    ))}
                  </div>
                  {/* TG */}
                  {s.channelTg && <div className="mb-2">
                    <textarea value={s.tgText||''} rows={2} onChange={e => updStep(f.id,s.id,{tgText:e.target.value})} className="glass-input w-full text-xs resize-y font-mono" placeholder="Текст TG ({name}, {daysLeft}...)" />
                    <details className="mt-1"><summary className="text-xs cursor-pointer font-medium" style={{color:'var(--accent-1)'}}>📖 Доступные переменные</summary>
                      <div className="mt-2 p-3 rounded-xl text-xs space-y-1" style={{background:'var(--surface-1)',border:'1px solid var(--glass-border)'}}>
                        <p className="text-xs mb-3" style={{color:'var(--text-tertiary)'}}>Используйте в тексте — автоматически подставятся данные пользователя:</p>
                        {[
                          { title: '👤 Пользователь', vars: [
                            ['{name}', 'Имя (TG или email)'], ['{email}', 'Email'], ['{telegramName}', 'TG username'],
                            ['{telegramId}', 'TG ID'], ['{registrationDate}', 'Дата регистрации'], ['{lastLogin}', 'Последний вход'],
                          ]},
                          { title: '🔑 Подписка', vars: [
                            ['{subStatus}', 'Статус (ACTIVE/INACTIVE/EXPIRED)'], ['{subExpireDate}', 'Дата окончания'],
                            ['{daysLeft}', 'Дней осталось'], ['{trafficUsed}', 'Трафик использован (ГБ)'],
                            ['{trafficLimit}', 'Лимит трафика'], ['{trafficPercent}', '% трафика'],
                            ['{deviceCount}', 'Устройств подключено'], ['{deviceLimit}', 'Лимит устройств'],
                          ]},
                          { title: '💰 Финансы', vars: [
                            ['{balance}', 'Баланс (₽)'], ['{bonusDays}', 'Бонусные дни'],
                            ['{tariffName}', 'Тариф (при оплате)'], ['{amount}', 'Сумма платежа'],
                            ['{topupAmount}', 'Сумма пополнения'],
                          ]},
                          { title: '👥 Рефералы', vars: [
                            ['{referralUrl}', 'Реф. ссылка'], ['{referralCount}', 'Приглашено'],
                            ['{referralPaidCount}', 'Оплатили'], ['{refName}', 'Имя реферала'],
                            ['{refBonusDays}', 'Начислено дней'],
                          ]},
                          { title: '🎟 Промо и система', vars: [
                            ['{promoCode}', 'Промокод'], ['{generatedPromo}', 'Автопромокод (действие шага)'],
                            ['{trialDays}', 'Дней триала'], ['{appUrl}', 'URL сервиса'],
                            ['{supportUrl}', 'Ссылка поддержки'], ['{channelUrl}', 'TG канал'],
                          ]},
                        ].map(section => (
                          <div key={section.title} className="mb-2">
                            <p className="text-xs font-medium mb-1" style={{color:'var(--text-secondary)'}}>{section.title}</p>
                            <div className="grid gap-y-0.5" style={{gridTemplateColumns:'auto 1fr'}}>
                              {section.vars.map(([v, desc]) => (
                                <><code key={v} className="font-mono px-1.5 py-0.5 rounded mr-3 text-xs" style={{background:'rgba(139,92,246,0.08)',color:'#a78bfa'}}>{v}</code>
                                <span className="text-xs" style={{color:'var(--text-tertiary)'}}>{desc}</span></>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                    {/* Buttons */}
                    <div className="mt-2 space-y-1.5">
                      {(s.tgButtons||[]).map((btn:any,bi:number) => (
                        <div key={bi} className="flex gap-2 items-center">
                          <select value={btn.type||'callback'} onChange={e=>{const b=[...(s.tgButtons||[])];b[bi]={...btn,type:e.target.value};updStep(f.id,s.id,{tgButtons:b})}} className="glass-input text-xs py-1.5 px-2 min-w-[100px] w-auto"><option value="callback">Меню</option><option value="url">URL</option><option value="webapp">WebApp</option></select>
                          {btn.type==='callback'?<select value={btn.data||''} onChange={e=>{const b=[...(s.tgButtons||[])];const o=BOT_BTN_OPTIONS.find(x=>x.value===e.target.value);b[bi]={...btn,data:e.target.value,label:o?.label||btn.label};updStep(f.id,s.id,{tgButtons:b})}} className="glass-input flex-1 text-xs py-1.5 px-2"><option value="">Выберите кнопку...</option>{BOT_BTN_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
                          :<><input value={btn.label||''} onChange={e=>{const b=[...(s.tgButtons||[])];b[bi]={...btn,label:e.target.value};updStep(f.id,s.id,{tgButtons:b})}} placeholder="Текст кнопки" className="glass-input w-36 text-xs py-1.5 px-2" /><input value={btn.data||''} onChange={e=>{const b=[...(s.tgButtons||[])];b[bi]={...btn,data:e.target.value};updStep(f.id,s.id,{tgButtons:b})}} placeholder="https://..." className="glass-input flex-1 text-xs py-1.5 px-2" /></>}
                          <button onClick={()=>{updStep(f.id,s.id,{tgButtons:(s.tgButtons||[]).filter((_:any,j:number)=>j!==bi)})}} className="p-1 rounded hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5 text-red-400"/></button>
                        </div>
                      ))}
                      <button onClick={()=>updStep(f.id,s.id,{tgButtons:[...(s.tgButtons||[]),{type:'callback',label:'',data:''}]})} className="text-xs px-2 py-1 rounded" style={{color:'var(--accent-1)',background:'rgba(6,182,212,0.06)'}}>+ Кнопка</button>
                    </div>
                  </div>}
                  {/* Email */}
                  {s.channelEmail && <div className="mb-2 space-y-1">
                    <input value={s.emailSubject||''} onChange={e=>updStep(f.id,s.id,{emailSubject:e.target.value})} placeholder="Тема" className="glass-input w-full text-xs" />
                    <textarea value={s.emailHtml||''} rows={2} onChange={e=>updStep(f.id,s.id,{emailHtml:e.target.value})} placeholder="HTML" className="glass-input w-full text-xs resize-y" />
                    <div className="flex gap-1"><input value={s.emailBtnText||''} onChange={e=>updStep(f.id,s.id,{emailBtnText:e.target.value})} placeholder="CTA" className="glass-input flex-1 text-xs" /><input value={s.emailBtnUrl||''} onChange={e=>updStep(f.id,s.id,{emailBtnUrl:e.target.value})} placeholder="URL" className="glass-input flex-1 text-xs" /></div>
                  </div>}
                  {/* LK */}
                  {s.channelLk && <div className="mb-2 space-y-1">
                    <input value={s.lkTitle||''} onChange={e=>updStep(f.id,s.id,{lkTitle:e.target.value})} placeholder="Заголовок" className="glass-input w-full text-xs" />
                    <input value={s.lkMessage||''} onChange={e=>updStep(f.id,s.id,{lkMessage:e.target.value})} placeholder="Текст" className="glass-input w-full text-xs" />
                  </div>}
                  {/* Action */}
                  <div className="flex gap-2 items-center flex-wrap">
                    <select value={s.actionType} onChange={e=>updStep(f.id,s.id,{actionType:e.target.value})} className="glass-input text-xs py-1.5 px-2 min-w-[180px] w-auto">
                      {ACTIONS.map(a=><option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                    {s.actionType!=='none' && <>
                      <input type="number" min={1} value={s.actionValue||0} onChange={e=>updStep(f.id,s.id,{actionValue:+e.target.value})} className="glass-input w-20 text-xs py-1.5 px-2" />
                      <span className="text-xs" style={{color:'var(--text-tertiary)'}}>{ACTIONS.find(a=>a.value===s.actionType)?.unit}</span>
                    </>}
                    {['promo_discount','promo_balance'].includes(s.actionType) && <>
                      <span className="text-xs" style={{color:'var(--text-tertiary)'}}>действует</span>
                      <input type="number" min={1} value={s.actionPromoExpiry||7} onChange={e=>updStep(f.id,s.id,{actionPromoExpiry:+e.target.value})} className="glass-input w-20 text-xs py-1.5 px-2" />
                      <span className="text-xs" style={{color:'var(--text-tertiary)'}}>дн.</span>
                    </>}
                  </div>
                  {/* Save step */}
                  <div className="flex gap-2 mt-2">
                    <button onClick={()=>saveStep(s.id)} disabled={savingId===s.id} className="btn-primary text-xs py-1.5 px-3">
                      {savingId===s.id?<Loader2 className="w-3 h-3 animate-spin"/>:<Save className="w-3 h-3"/>} Сохранить
                    </button>
                  </div>
                </div>
              ))}
              {/* Add step + funnel actions */}
              <div className="flex gap-2 flex-wrap">
                <button onClick={()=>addStep(f.id)} className="text-xs px-3 py-1.5 rounded-lg" style={{color:'var(--accent-1)',background:'rgba(6,182,212,0.06)',border:'1px solid rgba(6,182,212,0.15)'}}>+ Добавить шаг</button>
                <button onClick={()=>test(f.id)} disabled={testingId===f.id} className="text-xs px-3 py-1.5 rounded-lg" style={{color:'#fbbf24',background:'rgba(245,158,11,0.06)',border:'1px solid rgba(245,158,11,0.15)'}}>🧪 {testingId===f.id?'...':'Тест'}</button>
                <button onClick={()=>del(f.id)} className="text-xs px-3 py-1.5 rounded-lg" style={{color:'#f87171',background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.15)'}}><Trash2 className="w-3 h-3 inline mr-1"/>Удалить</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Zap className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Нет воронок</p>
          <button onClick={seed} className="btn-primary mt-3 text-sm"><Zap className="w-4 h-4" /> Загрузить стандартные</button>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative glass-card w-full max-w-md space-y-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
            <h3 className="font-semibold">Создать воронку</h3>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Триггер</p>
              <select value={newTriggerId} onChange={e => {
                setNewTriggerId(e.target.value)
                const opt = triggerOptions.flatMap((g: any) => g.triggers).find((t: any) => t.id === e.target.value)
                if (opt && !newName) setNewName(opt.name)
              }} className="glass-input w-full text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
                <option value="">Выберите триггер...</option>
                {triggerOptions.map((g: any) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.triggers.map((t: any) => {
                      const used = funnels.some(f => f.triggerId === t.id)
                      return <option key={t.id} value={t.id} disabled={used}>{t.name}{used ? ' (уже есть)' : ''}</option>
                    })}
                  </optgroup>
                ))}
                <optgroup label="Кастомный">
                  <option value="__custom">Свой триггер...</option>
                </optgroup>
              </select>
              {newTriggerId === '__custom' && (
                <input value="" onChange={e => setNewTriggerId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="trigger_id (латиница, _, цифры)" className="glass-input w-full text-sm mt-2" />
              )}
            </div>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Название" className="glass-input w-full text-sm" />
            <div className="flex gap-2">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Отмена</button>
              <button onClick={create} disabled={!newTriggerId || !newName} className="btn-primary flex-1">Создать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   TAB 3: BOT SETTINGS
   ============================================================ */

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)}
      className="relative w-11 h-6 rounded-full transition-all duration-300"
      style={{ background: checked ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.08)' }}>
      <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300"
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }} />
    </button>
  )
}

function BotSettingsTab() {
  const [settings, setSettings] = useState<BotSettings>(BOT_DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    fetch('/api/admin/bot/settings', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => { setSettings({ ...BOT_DEFAULTS, ...d }); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const update = (key: string, value: string) => {
    setSettings(s => ({ ...s, [key]: value }))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/bot/settings', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error()
      toast.success('Настройки бота сохранены')
      setDirty(false)
    } catch { toast.error('Ошибка сохранения') }
    finally { setSaving(false) }
  }

  const reset = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/bot/settings', { credentials: 'include' })
      if (!res.ok) throw new Error()
      const d = await res.json()
      setSettings({ ...BOT_DEFAULTS, ...d })
    } catch { /* keep defaults */ }
    setLoading(false)
    setDirty(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2">
        <button onClick={reset}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all glass-card"
          style={{ color: 'var(--text-secondary)' }}>
          <RefreshCw className="w-4 h-4" /> Сбросить
        </button>
        <button onClick={save} disabled={!dirty || saving}
          className="btn-primary flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Сохранить
        </button>
      </div>

      {BOT_SECTIONS.map(section => {
        const Icon = section.icon
        return (
          <div key={section.id} className="glass-card rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(139,92,246,0.12)' }}>
                <Icon className="w-[18px] h-[18px]" style={{ color: '#a78bfa' }} />
              </div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{section.title}</h2>
            </div>
            <div className="space-y-4">
              {section.fields.map(field => {
                if (field.type === 'toggle') {
                  return (
                    <div key={field.key} className="flex items-center justify-between py-2">
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{field.label}</span>
                      <ToggleSwitch checked={settings[field.key] === 'true'} onChange={v => update(field.key, v ? 'true' : 'false')} />
                    </div>
                  )
                }
                if (field.type === 'textarea') {
                  return (
                    <div key={field.key}>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>{field.label}</label>
                      <textarea rows={3} value={settings[field.key] || ''} onChange={e => update(field.key, e.target.value)}
                        placeholder={field.placeholder} className="glass-input w-full rounded-xl px-4 py-3 text-sm resize-y"
                        style={{ color: 'var(--text-primary)', minHeight: '72px' }} />
                    </div>
                  )
                }
                return (
                  <div key={field.key}>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>{field.label}</label>
                    <input type={field.type === 'url' ? 'url' : 'text'} value={settings[field.key] || ''}
                      onChange={e => update(field.key, e.target.value)} placeholder={field.placeholder}
                      className="glass-input w-full rounded-xl px-4 py-2.5 text-sm" style={{ color: 'var(--text-primary)' }} />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ============================================================
   TAB 4: CHAT HISTORY
   ============================================================ */

function ChatHistoryTab() {
  const [chats, setChats] = useState<ChatListItem[]>([])
  const [chatsTotal, setChatsTotal] = useState(0)
  const [chatsPage, setChatsPage] = useState(1)
  const [search, setSearch] = useState('')
  const [chatsLoading, setChatsLoading] = useState(true)

  const [activeUserId, setActiveUserId] = useState<string | null>(null)
  const [activeUser, setActiveUser] = useState<ChatUser | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [msgsTotal, setMsgsTotal] = useState(0)
  const [msgsPage, setMsgsPage] = useState(1)
  const [msgsLoading, setMsgsLoading] = useState(false)

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const [mobileListOpen, setMobileListOpen] = useState(true)
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadChats = useCallback(async (pg = chatsPage, q = search) => {
    setChatsLoading(true)
    try {
      const params = new URLSearchParams({ page: String(pg), limit: '30', search: q })
      const res = await fetch(`/api/admin/bot/chats?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setChats(data.chats)
      setChatsTotal(data.total)
    } catch { toast.error('Не удалось загрузить чаты') }
    finally { setChatsLoading(false) }
  }, [chatsPage, search])

  useEffect(() => { loadChats() }, [loadChats])

  const onSearchChange = (v: string) => {
    setSearch(v); setChatsPage(1)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadChats(1, v), 300)
  }

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
    } catch { toast.error('Не удалось загрузить сообщения') }
    finally { setMsgsLoading(false) }
  }, [])

  const selectChat = (item: ChatListItem) => {
    setActiveUserId(item.user.id); setActiveUser(item.user)
    setMessages([]); setMsgsPage(1)
    loadMessages(item.user.id, 1)
    setMobileListOpen(false); setMobileProfileOpen(false)
  }

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMessage = async () => {
    if (!draft.trim() || !activeUserId) return
    setSending(true)
    try {
      const res = await fetch(`/api/admin/bot/chats/${activeUserId}/send`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft.trim() }),
      })
      if (!res.ok) throw new Error()
      setDraft('')
      await loadMessages(activeUserId, 1)
      loadChats()
    } catch { toast.error('Ошибка отправки') }
    finally { setSending(false) }
  }

  const renderButtons = (json: string | null | undefined) => {
    if (!json) return null
    try {
      const rows: { text: string; url?: string }[][] = JSON.parse(json)
      return (
        <div className="mt-1.5 flex flex-col gap-1">
          {rows.map((row, ri) => (
            <div key={ri} className="flex gap-1 flex-wrap">
              {row.map((btn, bi) => (
                <button key={bi} disabled
                  className="text-xs px-2.5 py-1 rounded-lg cursor-default opacity-70 font-medium"
                  style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                  {btn.text}
                </button>
              ))}
            </div>
          ))}
        </div>
      )
    } catch { return null }
  }

  return (
    <div className="flex rounded-2xl overflow-hidden" style={{
      background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
      height: 'calc(100vh - 280px)', minHeight: '500px',
    }}>
      {/* LEFT: chats list */}
      <div className={`flex-shrink-0 flex flex-col ${mobileListOpen ? 'flex' : 'hidden md:flex'} w-full md:w-[250px]`}
        style={{ borderRight: '1px solid var(--glass-border)' }}>
        <div className="p-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-1)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Чаты бота</span>
            <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>{chatsTotal}</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
            <input className="glass-input pl-8 py-1.5 text-xs w-full" placeholder="Поиск..."
              value={search} onChange={e => onSearchChange(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chatsLoading ? (
            <div className="p-3 space-y-2">
              {[...Array(8)].map((_, i) => (
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
                <button key={item.user.id} onClick={() => selectChat(item)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-150"
                  style={{ background: active ? 'rgba(139,92,246,0.08)' : 'transparent', borderBottom: '1px solid var(--glass-border)' }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                    style={{ background: active ? 'rgba(139,92,246,0.2)' : 'rgba(6,182,212,0.1)',
                      border: `1px solid ${active ? 'rgba(139,92,246,0.3)' : 'rgba(6,182,212,0.15)'}`,
                      color: active ? '#a78bfa' : 'var(--accent-1)' }}>
                    {chatInitial(item.user)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[13px] font-medium truncate"
                        style={{ color: active ? '#a78bfa' : 'var(--text-primary)' }}>{chatDisplayName(item.user)}</span>
                      <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>{fmtChatDate(item.lastDate)}</span>
                    </div>
                    <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{item.lastMessage}</p>
                  </div>
                </button>
              )
            })
          )}
          {chats.length < chatsTotal && (
            <button onClick={() => { const next = chatsPage + 1; setChatsPage(next); loadChats(next, search) }}
              className="w-full text-center py-2 text-xs transition-colors" style={{ color: 'var(--accent-1)' }}>
              Загрузить ещё...
            </button>
          )}
        </div>
      </div>

      {/* MIDDLE: messages */}
      <div className={`flex-1 flex flex-col min-w-0 ${!mobileListOpen ? 'flex' : 'hidden md:flex'}`}>
        {activeUser ? (
          <>
            <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <button className="md:hidden p-1 rounded-lg" style={{ color: 'var(--text-secondary)' }}
                onClick={() => { setMobileListOpen(true); setMobileProfileOpen(false) }}>
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--accent-1)' }}
                onClick={() => setMobileProfileOpen(true)}>
                {chatInitial(activeUser)}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}
                  onClick={() => setMobileProfileOpen(true)}>{chatDisplayName(activeUser)}</h2>
                <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{msgsTotal} сообщений</p>
              </div>
              <button className="md:hidden p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)' }}
                onClick={() => setMobileProfileOpen(o => !o)}>
                <User className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ background: 'rgba(0,0,0,0.05)' }}>
              {messages.length < msgsTotal && (
                <div className="text-center py-2">
                  <button onClick={() => loadMessages(activeUserId!, msgsPage + 1, true)} disabled={msgsLoading}
                    className="text-xs px-3 py-1 rounded-lg transition-colors"
                    style={{ color: 'var(--accent-1)', background: 'rgba(139,92,246,0.08)' }}>
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
                  return (
                    <div key={msg.id} className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
                      <div className="max-w-[75%] rounded-2xl px-3.5 py-2"
                        style={{
                          background: isUser ? 'rgba(255,255,255,0.07)' : 'rgba(139,92,246,0.12)',
                          border: `1px solid ${isUser ? 'rgba(255,255,255,0.08)' : 'rgba(139,92,246,0.2)'}`,
                          borderBottomLeftRadius: isUser ? '6px' : undefined,
                          borderBottomRightRadius: !isUser ? '6px' : undefined,
                        }}>
                        <p className="text-[13px] whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>{msg.text}</p>
                        {renderButtons(msg.buttonsJson)}
                        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)', textAlign: isUser ? 'left' : 'right' }}>
                          {new Date(msg.createdAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--glass-border)' }}>
              <input className="glass-input flex-1 py-2 text-sm" placeholder="Написать сообщение..."
                value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                disabled={sending} />
              <button onClick={sendMessage} disabled={!draft.trim() || sending}
                className="p-2.5 rounded-xl transition-all duration-200 disabled:opacity-30"
                style={{ background: draft.trim() ? 'linear-gradient(135deg, #8b5cf6, #06b6d4)' : 'rgba(255,255,255,0.05)', color: '#fff' }}>
                <Send className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
              <MessageCircle className="w-7 h-7" style={{ color: '#a78bfa' }} />
            </div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Выберите чат</h3>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Выберите пользователя слева для просмотра истории</p>
          </div>
        )}
      </div>

      {/* RIGHT: user profile */}
      {activeUser && (
        <>
          <div className="hidden md:flex flex-col w-[280px] flex-shrink-0 overflow-y-auto"
            style={{ borderLeft: '1px solid var(--glass-border)' }}>
            <ChatProfilePanel user={activeUser} />
          </div>
          {mobileProfileOpen && (
            <div className="fixed inset-0 z-50 md:hidden">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileProfileOpen(false)} />
              <div className="absolute right-0 top-0 h-full w-[300px] max-w-[85vw] overflow-y-auto"
                style={{ background: 'var(--surface-2)', borderLeft: '1px solid var(--glass-border)' }}>
                <div className="flex items-center justify-between p-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Профиль</span>
                  <button onClick={() => setMobileProfileOpen(false)} className="p-1" style={{ color: 'var(--text-tertiary)' }}><X className="w-4 h-4" /></button>
                </div>
                <ChatProfilePanel user={activeUser} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ChatProfilePanel({ user }: { user: ChatUser }) {
  return (
    <div className="p-4 space-y-5">
      <div className="flex flex-col items-center gap-2 pt-2">
        <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
          style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', color: 'var(--accent-1)' }}>
          {chatInitial(user)}
        </div>
        <h3 className="text-sm font-semibold text-center" style={{ color: 'var(--text-primary)' }}>{chatDisplayName(user)}</h3>
        <span className={CHAT_STATUS_COLORS[user.subStatus] || 'badge-gray'}>{user.subStatus}</span>
      </div>
      <div className="space-y-3">
        <ChatProfileRow icon={<User className="w-3.5 h-3.5" />} label="Telegram ID" value={user.telegramId || '---'} />
        {user.email && <ChatProfileRow icon={<MessageCircle className="w-3.5 h-3.5" />} label="Email" value={user.email} />}
        <ChatProfileRow icon={<Wallet className="w-3.5 h-3.5" />} label="Баланс"
          value={user.balance != null ? `${user.balance} ₽` : '---'} />
        <ChatProfileRow icon={<Gift className="w-3.5 h-3.5" />} label="Бонусные дни"
          value={user.bonusDays != null ? `${user.bonusDays}` : '---'} />
        <ChatProfileRow icon={<Calendar className="w-3.5 h-3.5" />} label="Регистрация"
          value={fmtDate(user.createdAt)} />
      </div>
      <Link href={`/admin/users/${user.id}`}
        className="flex items-center justify-center gap-2 w-full py-2 rounded-xl text-sm font-medium transition-all duration-200"
        style={{ background: 'rgba(139,92,246,0.08)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.15)' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.15)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.08)' }}>
        <ExternalLink className="w-3.5 h-3.5" /> Полный профиль
      </Link>
    </div>
  )
}

function ChatProfileRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: 'rgba(139,92,246,0.06)', color: 'var(--text-tertiary)' }}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
        <p className="text-[13px] break-all" style={{ color: 'var(--text-primary)' }}>{value}</p>
      </div>
    </div>
  )
}
