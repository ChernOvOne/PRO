'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Send, Mail, MessageCircle, Users, Clock, Plus, Trash2,
  Eye, Calendar, ChevronDown, AlertCircle, CheckCircle2,
  X, Bell, User, Search, ArrowLeft, ExternalLink,
  Wallet, Gift, Star, Zap, ToggleLeft, Save, RefreshCw,
  Loader2, MessageSquare, Mouse, Link2, ChevronLeft,
  ChevronRight, Settings, Filter,
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
interface FunnelConfig {
  id: string; name: string; enabled: boolean; delay: number
  channels: ('telegram' | 'email' | 'lk')[]
  tgText?: string; emailSubject?: string; emailHtml?: string
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
      ...(channel !== 'email' && { tgText, tgButtons: tgButtons.filter(b => b.label && b.url) }),
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
  }

  // TG buttons
  const addTgButton = () => { if (tgButtons.length < 5) setTgButtons([...tgButtons, { label: '', url: '' }]) }
  const updateTgButton = (i: number, field: keyof InlineButton, val: string) => {
    const copy = [...tgButtons]; copy[i] = { ...copy[i], [field]: val }; setTgButtons(copy)
  }
  const removeTgButton = (i: number) => setTgButtons(tgButtons.filter((_, idx) => idx !== i))

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
              {/* TG fields */}
              {showTg && (
                <div className="space-y-3">
                  <label className="text-xs font-medium flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <MessageCircle className="w-3.5 h-3.5" /> Telegram
                  </label>
                  <textarea value={tgText} onChange={e => setTgText(e.target.value)}
                    placeholder="Текст сообщения (Markdown)"
                    rows={5} className="glass-input w-full resize-y text-sm" />
                  <div className="space-y-2">
                    {tgButtons.map((btn, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input value={btn.label} onChange={e => updateTgButton(i, 'label', e.target.value)}
                          placeholder="Текст кнопки" className="glass-input flex-1 text-sm" />
                        <input value={btn.url} onChange={e => updateTgButton(i, 'url', e.target.value)}
                          placeholder="URL" className="glass-input flex-1 text-sm" />
                        <button onClick={() => removeTgButton(i)} className="p-2 rounded-lg transition-colors hover:bg-red-500/10"
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
                          <span className="text-[10px] font-medium" style={{
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
                          <span className={`${cfg.badgeClass} text-[10px]`}>{cfg.label}</span>
                        </div>
                        <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{n.message}</p>
                        <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{new Date(n.createdAt).toLocaleString('ru')}</span>
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
                </p>
                <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
                  <pre className="whitespace-pre-wrap font-sans">{tgText || '(пусто)'}</pre>
                  {tgButtons.filter(b => b.label).length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {tgButtons.filter(b => b.label).map((btn, i) => (
                        <div key={i} className="text-center text-xs py-2 rounded-lg"
                          style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--accent-1)' }}>{btn.label}</div>
                      ))}
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
   TAB 2: AUTO-FUNNELS
   ============================================================ */

function FunnelsTab() {
  const [funnels, setFunnels] = useState<FunnelConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadFunnels = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/communications/funnels', { credentials: 'include' })
      if (!res.ok) throw new Error()
      setFunnels(await res.json())
    } catch { toast.error('Не удалось загрузить воронки') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadFunnels() }, [loadFunnels])

  const updateFunnel = (id: string, patch: Partial<FunnelConfig>) => {
    setFunnels(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f))
  }

  const toggleChannel = (id: string, ch: 'telegram' | 'email' | 'lk') => {
    setFunnels(prev => prev.map(f => {
      if (f.id !== id) return f
      const channels = f.channels.includes(ch) ? f.channels.filter(c => c !== ch) : [...f.channels, ch]
      return { ...f, channels }
    }))
  }

  const saveFunnel = async (id: string) => {
    setSavingId(id)
    try {
      const res = await fetch('/api/admin/communications/funnels', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(funnels),
      })
      if (!res.ok) throw new Error()
      toast.success('Сохранено')
    } catch { toast.error('Ошибка сохранения') }
    finally { setSavingId(null) }
  }

  const formatDelay = (seconds: number) => {
    if (seconds === 0) return 'сразу'
    const h = Math.floor(seconds / 3600)
    if (h < 24) return `через ${h} ч.`
    const d = Math.floor(h / 24)
    return `через ${d} д.`
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
        Автоматические сообщения по триггерам. Каждую воронку можно включить/выключить и настроить отдельно.
      </p>

      {funnels.map(funnel => (
        <div key={funnel.id} className="glass-card gradient-border">
          {/* Header row */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Toggle */}
            <button onClick={() => updateFunnel(funnel.id, { enabled: !funnel.enabled })}
              className="relative w-11 h-6 rounded-full transition-all duration-300 flex-shrink-0"
              style={{ background: funnel.enabled ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.08)' }}>
              <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300"
                style={{ transform: funnel.enabled ? 'translateX(20px)' : 'translateX(0)' }} />
            </button>

            {/* Name & delay */}
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold" style={{ color: funnel.enabled ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                {funnel.name}
              </h4>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                <Clock className="w-3 h-3 inline mr-1" />
                {formatDelay(funnel.delay)}
              </p>
            </div>

            {/* Channel checkboxes */}
            <div className="flex gap-2">
              {(['telegram', 'email', 'lk'] as const).map(ch => (
                <label key={ch} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={funnel.channels.includes(ch)}
                    onChange={() => toggleChannel(funnel.id, ch)}
                    className="w-3.5 h-3.5 rounded accent-purple-500" />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {ch === 'telegram' ? 'TG' : ch === 'email' ? 'Email' : 'ЛК'}
                  </span>
                </label>
              ))}
            </div>

            {/* Expand/collapse */}
            <button onClick={() => setExpandedId(expandedId === funnel.id ? null : funnel.id)}
              className="p-1.5 rounded-lg transition-all" style={{ color: 'var(--text-tertiary)' }}>
              <ChevronDown className="w-4 h-4 transition-transform"
                style={{ transform: expandedId === funnel.id ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </button>
          </div>

          {/* Expanded: editable fields */}
          {expandedId === funnel.id && (
            <div className="mt-4 space-y-4 pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
              {/* Delay */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                  Задержка (секунды)
                </label>
                <input type="number" min={0} value={funnel.delay}
                  onChange={e => updateFunnel(funnel.id, { delay: parseInt(e.target.value) || 0 })}
                  className="glass-input w-full text-sm" />
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  0 = сразу, 3600 = 1 час, 86400 = 1 день
                </p>
              </div>

              {/* TG text */}
              {funnel.channels.includes('telegram') && (
                <div>
                  <label className="block text-xs font-medium mb-1.5 flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
                    <MessageCircle className="w-3.5 h-3.5" /> Telegram текст
                  </label>
                  <textarea value={funnel.tgText || ''} rows={3}
                    onChange={e => updateFunnel(funnel.id, { tgText: e.target.value })}
                    className="glass-input w-full text-sm resize-y" placeholder="Текст сообщения для Telegram..." />
                </div>
              )}

              {/* Email fields */}
              {funnel.channels.includes('email') && (
                <div className="space-y-3">
                  <label className="block text-xs font-medium flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
                    <Mail className="w-3.5 h-3.5" /> Email
                  </label>
                  <input value={funnel.emailSubject || ''}
                    onChange={e => updateFunnel(funnel.id, { emailSubject: e.target.value })}
                    placeholder="Тема письма" className="glass-input w-full text-sm" />
                  <textarea value={funnel.emailHtml || ''} rows={4}
                    onChange={e => updateFunnel(funnel.id, { emailHtml: e.target.value })}
                    placeholder="HTML-тело письма" className="glass-input w-full text-sm resize-y" />
                </div>
              )}

              {/* Save */}
              <button onClick={() => saveFunnel(funnel.id)} disabled={savingId === funnel.id}
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
                {savingId === funnel.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Сохранить
              </button>
            </div>
          )}
        </div>
      ))}
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
                      <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>{fmtChatDate(item.lastDate)}</span>
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
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)', textAlign: isUser ? 'left' : 'right' }}>
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
