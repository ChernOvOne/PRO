'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import {
  Send, Mail, MessageCircle, Users, Clock, Plus, Trash2,
  Eye, Calendar, ChevronDown, AlertCircle, CheckCircle2,
  X, Bold, Italic, Code, Link2, Quote, Image, Upload,
  GripVertical, Bell, Smile, Sparkles, MapPin, BarChart3,
  FileText, Palette, Variable,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────
type Channel = 'telegram' | 'email' | 'lk' | 'all'
type Audience =
  | 'all'
  | 'active_subscription'
  | 'no_subscription'
  | 'expiring_subscription'
  | 'email_only'
  | 'telegram_only'

type BroadcastStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'COMPLETED' | 'CANCELLED'

type TgButtonType = 'url' | 'callback'
type TgButtonStyle = 'default' | 'success' | 'danger' | 'primary'

interface InlineButton {
  label: string
  url: string
  type: TgButtonType
  style: TgButtonStyle
  iconEmojiId?: string
  row: number
  col: number
}

type LkNotificationType = 'INFO' | 'WARNING' | 'SUCCESS' | 'PROMO'

interface Broadcast {
  id: string
  createdAt: string
  channel: string
  audience: Audience
  recipientCount: number
  sentCount: number
  errorCount: number
  status: BroadcastStatus
  telegramText?: string
  telegramButtons?: InlineButton[]
  emailSubject?: string
  emailBody?: string
  emailCtaText?: string
  emailCtaUrl?: string
  scheduledAt?: string
}

// ── Helpers ──────────────────────────────────────────────────
const API = (path: string, opts?: RequestInit) =>
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
  { value: 'active_subscription', label: 'С активной подпиской' },
  { value: 'no_subscription', label: 'Без подписки' },
  { value: 'expiring_subscription', label: 'С истекающей подпиской (1-7 дней)' },
  { value: 'email_only', label: 'Только с email' },
  { value: 'telegram_only', label: 'Только с Telegram' },
]

const STATUS_MAP: Record<BroadcastStatus, { label: string; cls: string; animate?: boolean }> = {
  DRAFT:     { label: 'Черновик',    cls: 'badge-gray' },
  SCHEDULED: { label: 'Запланировано', cls: 'badge-yellow' },
  SENDING:   { label: 'Отправляется', cls: 'badge-blue', animate: true },
  COMPLETED: { label: 'Завершено',   cls: 'badge-green' },
  CANCELLED: { label: 'Отменено',    cls: 'badge-red' },
}

const CHANNEL_LABELS: Record<Channel, string> = {
  telegram: 'Telegram',
  email: 'Email',
  lk: 'ЛК',
  all: 'Все каналы',
}

const AUDIENCE_LABELS: Record<Audience, string> = {
  all: 'Все',
  active_subscription: 'С подпиской',
  no_subscription: 'Без подписки',
  expiring_subscription: 'Истекающие',
  email_only: 'Email',
  telegram_only: 'Telegram',
}

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

const MESSAGE_EFFECTS = [
  { id: '', emoji: '\u2014', label: 'Нет' },
  { id: '5104841245755180586', emoji: '\uD83D\uDD25', label: 'Огонь' },
  { id: '5046509860389126442', emoji: '\uD83C\uDF89', label: 'Конфетти' },
  { id: '5159385139981059251', emoji: '\u2764\uFE0F', label: 'Сердце' },
  { id: '5107584321108051014', emoji: '\uD83D\uDC4D', label: 'Лайк' },
  { id: '5104858069142078462', emoji: '\uD83D\uDC4E', label: 'Дизлайк' },
  { id: '5046589136895476101', emoji: '\uD83D\uDCA9', label: 'Какашка' },
]

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  { label: 'Смайлики', emojis: ['\uD83D\uDE00','\uD83D\uDE01','\uD83D\uDE02','\uD83E\uDD23','\uD83D\uDE03','\uD83D\uDE04','\uD83D\uDE05','\uD83D\uDE06','\uD83D\uDE09','\uD83D\uDE0A','\uD83D\uDE0B','\uD83D\uDE0E','\uD83D\uDE0D','\uD83E\uDD29','\uD83D\uDE18','\uD83D\uDE17','\uD83D\uDE1A','\uD83D\uDE19','\uD83E\uDD72','\uD83D\uDE1C','\uD83E\uDD2A','\uD83D\uDE1D','\uD83E\uDD11','\uD83E\uDD17','\uD83E\uDD2D','\uD83E\uDD2B','\uD83E\uDD14','\uD83E\uDD10','\uD83E\uDD28','\uD83D\uDE10','\uD83D\uDE11','\uD83D\uDE36','\uD83D\uDE0F','\uD83D\uDE12','\uD83D\uDE44','\uD83D\uDE2C','\uD83E\uDD25','\uD83D\uDE0C','\uD83D\uDE14','\uD83D\uDE2A','\uD83E\uDD24','\uD83D\uDE34','\uD83D\uDE37','\uD83E\uDD12','\uD83E\uDD15','\uD83E\uDD22'] },
  { label: 'Люди', emojis: ['\uD83D\uDC4B','\uD83E\uDD1A','\uD83D\uDD90\uFE0F','\u270B','\uD83D\uDD96','\uD83D\uDC4C','\uD83E\uDD0F','\u270C\uFE0F','\uD83E\uDD1E','\uD83E\uDD1F','\uD83E\uDD18','\uD83D\uDC4D','\uD83D\uDC4E','\u270A','\uD83D\uDC4A','\uD83E\uDD1B','\uD83E\uDD1C','\uD83D\uDC4F','\uD83D\uDE4C','\uD83D\uDC50','\uD83E\uDD32','\uD83E\uDD1D','\uD83D\uDE4F','\u270D\uFE0F','\uD83D\uDC85','\uD83E\uDD33'] },
  { label: 'Природа', emojis: ['\uD83D\uDC36','\uD83D\uDC31','\uD83D\uDC2D','\uD83D\uDC39','\uD83D\uDC30','\uD83E\uDD8A','\uD83D\uDC3B','\uD83D\uDC3C','\uD83D\uDC28','\uD83D\uDC2F','\uD83E\uDD81','\uD83D\uDC2E','\uD83D\uDC37','\uD83D\uDC38','\uD83D\uDC12','\uD83D\uDC14','\uD83D\uDC27','\uD83D\uDC26','\uD83E\uDD85','\uD83E\uDD86','\uD83E\uDD89','\uD83D\uDC1D','\uD83D\uDC1B','\uD83E\uDD8B','\uD83D\uDC0C','\uD83D\uDC1E','\uD83C\uDF3B','\uD83C\uDF39','\uD83C\uDF3A','\uD83C\uDF37','\uD83C\uDF3C','\uD83C\uDF3E'] },
  { label: 'Еда', emojis: ['\uD83C\uDF4E','\uD83C\uDF4F','\uD83C\uDF4A','\uD83C\uDF4B','\uD83C\uDF4C','\uD83C\uDF49','\uD83C\uDF47','\uD83C\uDF53','\uD83C\uDF48','\uD83C\uDF50','\uD83C\uDF51','\uD83C\uDF52','\uD83C\uDF55','\uD83C\uDF54','\uD83C\uDF5F','\uD83C\uDF2D','\uD83C\uDF2E','\uD83C\uDF2F','\uD83C\uDF73','\uD83C\uDF70','\uD83C\uDF82','\uD83C\uDF66','\uD83C\uDF67','\u2615','\uD83C\uDF7A','\uD83C\uDF77'] },
  { label: 'Символы', emojis: ['\u2764\uFE0F','\uD83E\uDDE1','\uD83D\uDC9B','\uD83D\uDC9A','\uD83D\uDC99','\uD83D\uDC9C','\uD83D\uDDA4','\uD83D\uDC94','\u2763\uFE0F','\uD83D\uDC95','\uD83D\uDC9E','\uD83D\uDC93','\uD83D\uDC97','\uD83D\uDC96','\uD83D\uDC98','\uD83D\uDC9D','\u2B50','\uD83C\uDF1F','\uD83D\uDCAB','\u26A1','\uD83D\uDD25','\uD83D\uDCA5','\u2728','\uD83C\uDF08','\u2705','\u274C','\u2757','\u2753','\uD83D\uDCA4','\uD83D\uDCAF','\uD83C\uDFC6','\uD83C\uDF96\uFE0F'] },
]

const LK_TYPE_OPTIONS: { value: LkNotificationType; label: string; color: string; bg: string }[] = [
  { value: 'INFO', label: 'Информация', color: '#60a5fa', bg: 'rgba(59,130,246,0.12)' },
  { value: 'WARNING', label: 'Предупреждение', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  { value: 'SUCCESS', label: 'Успех', color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  { value: 'PROMO', label: 'Промо', color: '#c084fc', bg: 'rgba(192,132,252,0.12)' },
]

const EMAIL_TEMPLATES: { value: string; label: string; bg: string; text: string }[] = [
  { value: 'dark', label: 'Dark', bg: '#1a1a2e', text: '#e5e5e5' },
  { value: 'gradient', label: 'Gradient', bg: 'linear-gradient(135deg,#667eea,#764ba2)', text: '#fff' },
  { value: 'minimal', label: 'Minimal', bg: '#f8fafc', text: '#1e293b' },
  { value: 'neon', label: 'Neon', bg: '#0a0a0a', text: '#39ff14' },
]

const BUTTON_STYLE_COLORS: Record<TgButtonStyle, { bg: string; text: string; label: string }> = {
  default: { bg: 'rgba(139,92,246,0.1)', text: '#a78bfa', label: 'Default' },
  success: { bg: 'rgba(52,211,153,0.15)', text: '#34d399', label: 'Success' },
  danger: { bg: 'rgba(239,68,68,0.15)', text: '#f87171', label: 'Danger' },
  primary: { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', label: 'Primary' },
}

const VARIABLE_GROUPS = [
  {
    title: 'Пользователь',
    vars: [
      { key: '{name}', desc: 'Имя (Telegram или email)' },
      { key: '{firstName}', desc: 'Имя из Telegram' },
      { key: '{email}', desc: 'Email адрес' },
      { key: '{telegramName}', desc: 'Telegram username' },
      { key: '{telegramId}', desc: 'Telegram ID' },
      { key: '{userId}', desc: 'ID в системе' },
      { key: '{registrationDate}', desc: 'Дата регистрации' },
      { key: '{daysSinceRegistration}', desc: 'Дней с регистрации' },
      { key: '{lastLogin}', desc: 'Последний визит' },
    ],
  },
  {
    title: 'Подписка',
    vars: [
      { key: '{subStatus}', desc: 'Статус: Активна / Истекла / Пробник' },
      { key: '{subExpireDate}', desc: 'Дата окончания подписки' },
      { key: '{daysLeft}', desc: 'Дней до окончания' },
      { key: '{hoursLeft}', desc: 'Часов до окончания' },
      { key: '{tariffName}', desc: 'Название тарифа' },
      { key: '{tariffPrice}', desc: 'Цена тарифа' },
      { key: '{subLink}', desc: 'Ссылка подключения VPN' },
    ],
  },
  {
    title: 'Трафик',
    vars: [
      { key: '{trafficUsed}', desc: 'Использовано (ГБ)' },
      { key: '{trafficLimit}', desc: 'Лимит (ГБ)' },
      { key: '{trafficPercent}', desc: '% использованного' },
      { key: '{trafficLeft}', desc: 'Осталось (ГБ)' },
      { key: '{deviceCount}', desc: 'Устройств подключено' },
      { key: '{deviceLimit}', desc: 'Лимит устройств' },
    ],
  },
  {
    title: 'Финансы',
    vars: [
      { key: '{balance}', desc: 'Баланс (₽)' },
      { key: '{bonusDays}', desc: 'Бонусные дни' },
      { key: '{totalPaid}', desc: 'Всего оплачено (₽)' },
      { key: '{paymentsCount}', desc: 'Количество оплат' },
      { key: '{lastPaymentDate}', desc: 'Дата последней оплаты' },
      { key: '{lastPaymentAmount}', desc: 'Сумма последней оплаты' },
    ],
  },
  {
    title: 'Рефералы',
    vars: [
      { key: '{referralCode}', desc: 'Реферальный код' },
      { key: '{referralUrl}', desc: 'Реферальная ссылка' },
      { key: '{referralCount}', desc: 'Всего рефералов' },
      { key: '{referralPaidCount}', desc: 'Рефералов с оплатой' },
    ],
  },
  {
    title: 'Система',
    vars: [
      { key: '{appUrl}', desc: 'URL личного кабинета' },
      { key: '{appName}', desc: 'Название сервиса' },
      { key: '{supportUrl}', desc: 'Ссылка на поддержку' },
      { key: '{channelUrl}', desc: 'Telegram-канал' },
      { key: '{paymentUrl}', desc: 'Страница оплаты' },
      { key: '{currentDate}', desc: 'Сегодняшняя дата' },
    ],
  },
]

// Flat list for toolbar popup
const TG_VARIABLES = VARIABLE_GROUPS.flatMap(g => g.vars.map(v => ({ key: v.key, label: v.desc })))

const detectMediaType = (url: string): 'photo' | 'video' | 'animation' | 'document' => {
  const ext = url.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext)) return 'photo'
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return 'video'
  if (['gif'].includes(ext)) return 'animation'
  return 'document'
}

// ── Component ────────────────────────────────────────────────
export default function AdminBroadcastPage() {
  const [tab, setTab] = useState<'create' | 'history'>('create')

  // Create form state
  const [channel, setChannel]       = useState<Channel>('telegram')
  const [audience, setAudience]     = useState<Audience>('all')
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(false)

  // TG state
  const [tgText, setTgText]               = useState('')
  const [tgButtons, setTgButtons]         = useState<InlineButton[]>([])
  const [tgParseMode, setTgParseMode]     = useState<'Markdown' | 'HTML'>('Markdown')
  const [tgMediaUrl, setTgMediaUrl]       = useState('')
  const [tgMediaType, setTgMediaType]     = useState<'photo' | 'video' | 'animation' | 'document'>('photo')
  const [tgMessageEffectId, setTgMessageEffectId] = useState('')
  const [tgPinMessage, setTgPinMessage]   = useState(false)
  const [tgPollEnabled, setTgPollEnabled] = useState(false)
  const [tgPollQuestion, setTgPollQuestion] = useState('')
  const [tgPollOptions, setTgPollOptions]   = useState<string[]>(['', ''])
  const [tgPollIsAnonymous, setTgPollIsAnonymous] = useState(true)
  const [tgPollAllowMultiple, setTgPollAllowMultiple] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [emojiCategory, setEmojiCategory]   = useState(0)
  const [showPremiumEmoji, setShowPremiumEmoji] = useState(false)
  const [premiumEmojiId, setPremiumEmojiId] = useState('')
  const [showTgVariables, setShowTgVariables] = useState(false)
  const [editingBtnIdx, setEditingBtnIdx] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)

  // Email state
  const [emailSubject, setEmailSubject]   = useState('')
  const [emailBody, setEmailBody]         = useState('')
  const [emailCtaText, setEmailCtaText]   = useState('')
  const [emailCtaUrl, setEmailCtaUrl]     = useState('')
  const [emailTemplate, setEmailTemplate] = useState('dark')

  // LK state
  const [lkTitle, setLkTitle]       = useState('')
  const [lkMessage, setLkMessage]   = useState('')
  const [lkType, setLkType]         = useState<LkNotificationType>('INFO')

  // Content tab for "all" channel
  const [contentTab, setContentTab] = useState<'telegram' | 'email' | 'lk'>('telegram')

  const [showPreview, setShowPreview] = useState(false)
  const [showScheduler, setShowScheduler] = useState(false)
  const [scheduledAt, setScheduledAt]     = useState('')
  const [confirmSend, setConfirmSend]     = useState(false)
  const [sending, setSending]             = useState(false)

  // History state
  const [history, setHistory]       = useState<Broadcast[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Drag state for buttons
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const tgTextRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Fetch recipient count ────────────────────────────────
  const fetchCount = useCallback(async (aud: Audience) => {
    setLoadingCount(true)
    try {
      const data = await API(`/preview?audience=${aud}`)
      setRecipientCount(data.count ?? data.recipientCount ?? 0)
    } catch {
      setRecipientCount(null)
    } finally {
      setLoadingCount(false)
    }
  }, [])

  useEffect(() => { fetchCount(audience) }, [audience, fetchCount])

  // ── Fetch history ────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const data = await API('')
      setHistory(Array.isArray(data) ? data : data.broadcasts ?? [])
    } catch { /* ignore */ }
    finally { setLoadingHistory(false) }
  }, [])

  useEffect(() => { if (tab === 'history') loadHistory() }, [tab, loadHistory])

  // ── Actions ──────────────────────────────────────────────
  const buildPayload = (extra: Record<string, unknown> = {}) => {
    const showTg = channel === 'telegram' || channel === 'all'
    const showEmail = channel === 'email' || channel === 'all'
    const showLk = channel === 'lk' || channel === 'all'

    return {
      channel,
      audience,
      ...(showTg && {
        tgText,
        tgButtons: tgButtons.filter(b => b.label && (b.url || b.type === 'callback')).map(b => ({
          label: b.label,
          url: b.url,
          type: b.type,
          style: b.style,
          iconEmojiId: b.iconEmojiId || undefined,
          row: b.row,
          col: b.col,
        })),
        tgParseMode,
        ...(tgMediaUrl && { tgMediaUrl, tgMediaType }),
        ...(tgMessageEffectId && { tgMessageEffectId }),
        tgPinMessage,
        ...(tgPollEnabled && tgPollQuestion && {
          tgPoll: {
            question: tgPollQuestion,
            options: tgPollOptions.filter(o => o.trim()),
            isAnonymous: tgPollIsAnonymous,
            allowMultiple: tgPollAllowMultiple,
          },
          tgPollQuestion,
          tgPollOptions: tgPollOptions.filter(o => o.trim()),
          tgPollAnonymous: tgPollIsAnonymous,
          tgPollMultiple: tgPollAllowMultiple,
        }),
      }),
      ...(showEmail && {
        emailSubject,
        emailHtml: emailBody,
        ...(emailCtaText && { emailBtnText: emailCtaText }),
        ...(emailCtaUrl && { emailBtnUrl: emailCtaUrl }),
        emailTemplate,
      }),
      ...(showLk && {
        lkTitle,
        lkMessage,
        lkType,
      }),
      ...extra,
    }
  }

  const sendNow = async () => {
    setSending(true)
    try {
      const created = await API('', { method: 'POST', body: JSON.stringify(buildPayload()) })
      await API(`/${created.id}/send`, { method: 'POST' })
      setConfirmSend(false)
      resetForm()
      toast.success('Рассылка отправлена!')
      setTab('history')
      loadHistory()
    } catch (e: any) {
      toast.error(e.message || 'Ошибка отправки')
    } finally { setSending(false) }
  }

  const schedule = async () => {
    if (!scheduledAt) return
    setSending(true)
    try {
      await API('', { method: 'POST', body: JSON.stringify(buildPayload({ scheduledAt })) })
      setShowScheduler(false)
      resetForm()
      toast.success('Рассылка запланирована!')
      setTab('history')
      loadHistory()
    } catch (e: any) {
      toast.error(e.message || 'Ошибка планирования')
    } finally { setSending(false) }
  }

  const cancelBroadcast = async (id: string) => {
    try {
      await API(`/${id}/cancel`, { method: 'POST' })
      toast.success('Рассылка отменена')
      loadHistory()
    } catch (e: any) { toast.error(e.message) }
  }

  const deleteBroadcast = async (id: string) => {
    if (!confirm('Удалить рассылку?')) return
    try {
      await API(`/${id}`, { method: 'DELETE' })
      toast.success('Рассылка удалена')
      loadHistory()
    } catch (e: any) { toast.error(e.message) }
  }

  const resetForm = () => {
    setChannel('telegram')
    setAudience('all')
    setTgText('')
    setTgButtons([])
    setTgParseMode('Markdown')
    setTgMediaUrl('')
    setTgMediaType('photo')
    setTgMessageEffectId('')
    setTgPinMessage(false)
    setTgPollEnabled(false)
    setTgPollQuestion('')
    setTgPollOptions(['', ''])
    setTgPollIsAnonymous(true)
    setTgPollAllowMultiple(false)
    setEmailSubject('')
    setEmailBody('')
    setEmailCtaText('')
    setEmailCtaUrl('')
    setEmailTemplate('dark')
    setLkTitle('')
    setLkMessage('')
    setLkType('INFO')
    setScheduledAt('')
    setContentTab('telegram')
  }

  // ── Telegram text toolbar ───────────────────────────────
  const insertWrap = (before: string, after: string) => {
    const el = tgTextRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const text = el.value
    const selected = text.substring(start, end)
    const newText = text.substring(0, start) + before + selected + after + text.substring(end)
    setTgText(newText)
    setTimeout(() => {
      el.focus()
      el.selectionStart = start + before.length
      el.selectionEnd = start + before.length + selected.length
    }, 0)
  }

  const insertAtCursor = (insert: string) => {
    const el = tgTextRef.current
    if (!el) return
    const start = el.selectionStart
    const text = el.value
    const newText = text.substring(0, start) + insert + text.substring(start)
    setTgText(newText)
    setTimeout(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + insert.length
    }, 0)
  }

  // ── Telegram button management ───────────────────────────
  const addTgButton = () => {
    const maxRow = tgButtons.length > 0 ? Math.max(...tgButtons.map(b => b.row)) : -1
    setTgButtons([...tgButtons, { label: '', url: '', type: 'url', style: 'default', row: maxRow + 1, col: 0 }])
  }

  const updateTgButton = (i: number, field: keyof InlineButton, val: string | number) => {
    const copy = [...tgButtons]
    copy[i] = { ...copy[i], [field]: val }
    setTgButtons(copy)
  }

  const removeTgButton = (i: number) => {
    setTgButtons(tgButtons.filter((_, idx) => idx !== i))
  }

  // ── Drag & drop buttons between rows ────────────────────
  const handleDragStart = (i: number) => setDragIdx(i)

  const handleDrop = (targetRow: number) => {
    if (dragIdx === null) return
    const copy = [...tgButtons]
    copy[dragIdx] = { ...copy[dragIdx], row: targetRow }
    setTgButtons(copy)
    setDragIdx(null)
  }

  // ── File upload ─────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/admin/upload', { method: 'POST', body: formData, credentials: 'include' })
      if (!res.ok) throw new Error('Ошибка загрузки')
      const data = await res.json()
      const url = data.url || data.path || ''
      setTgMediaUrl(url)
      setTgMediaType(detectMediaType(file.name))
      toast.success('Файл загружен')
    } catch (e: any) {
      toast.error(e.message || 'Ошибка загрузки файла')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── Premium emoji ───────────────────────────────────────
  interface SavedEmoji { id: string; fallback: string; name: string }

  const getSavedPremiumEmojis = (): SavedEmoji[] => {
    try {
      const raw = localStorage.getItem('bot_premium_emojis')
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      // Handle both formats: old string[] and new object[]
      return parsed.map((item: any) =>
        typeof item === 'string'
          ? { id: item, fallback: '⭐', name: item.slice(-6) }
          : { id: item.id || '', fallback: item.fallback || '⭐', name: item.name || '' }
      )
    } catch { return [] }
  }

  const savePremiumEmoji = (id: string) => {
    const list = getSavedPremiumEmojis()
    if (!list.find(e => e.id === id)) {
      list.push({ id, fallback: '⭐', name: id.slice(-6) })
      localStorage.setItem('bot_premium_emojis', JSON.stringify(list))
    }
  }

  // ── Poll options management ─────────────────────────────
  const addPollOption = () => {
    if (tgPollOptions.length >= 10) return
    setTgPollOptions([...tgPollOptions, ''])
  }

  const updatePollOption = (i: number, val: string) => {
    const copy = [...tgPollOptions]
    copy[i] = val
    setTgPollOptions(copy)
  }

  const removePollOption = (i: number) => {
    if (tgPollOptions.length <= 2) return
    setTgPollOptions(tgPollOptions.filter((_, idx) => idx !== i))
  }

  // ── Validation ───────────────────────────────────────────
  const showTg = channel === 'telegram' || channel === 'all'
  const showEmail = channel === 'email' || channel === 'all'
  const showLk = channel === 'lk' || channel === 'all'

  const canSend =
    (showTg ? tgText.trim().length > 0 || tgPollEnabled : true) &&
    (showEmail ? emailSubject.trim().length > 0 && emailBody.trim().length > 0 : true) &&
    (showLk ? lkTitle.trim().length > 0 && lkMessage.trim().length > 0 : true)

  // ── Which content editors to show ───────────────────────
  const shouldShowTgEditor = channel === 'telegram' || (channel === 'all' && contentTab === 'telegram')
  const shouldShowEmailEditor = channel === 'email' || (channel === 'all' && contentTab === 'email')
  const shouldShowLkEditor = channel === 'lk' || (channel === 'all' && contentTab === 'lk')

  // Button rows grouped
  const buttonRows: Record<number, InlineButton[]> = {}
  tgButtons.forEach((btn, i) => {
    if (!buttonRows[btn.row]) buttonRows[btn.row] = []
    buttonRows[btn.row].push({ ...btn, col: i })
  })
  const sortedRows = Object.keys(buttonRows).map(Number).sort((a, b) => a - b)

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Рассылка</h1>
        <button
          onClick={() => { resetForm(); setTab('create') }}
          className="btn-primary text-sm flex items-center gap-2"
        >
          <Send className="w-4 h-4" /> Создать рассылку
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
        {([['create', 'Создать'], ['history', 'История']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: tab === key ? 'rgba(139,92,246,0.12)' : 'transparent',
              color: tab === key ? 'var(--accent-1)' : 'var(--text-secondary)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ═══ CREATE TAB ═══ */}
      {tab === 'create' && (
        <div className="space-y-6">
          {/* Step 1 — Channel */}
          <div className="glass-card gradient-border">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>1</span>
              Канал
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                ['telegram', 'Telegram', MessageCircle, '#0088cc', 'rgba(0,136,204,0.12)'],
                ['email', 'Email', Mail, '#ea580c', 'rgba(234,88,12,0.12)'],
                ['lk', 'ЛК', Bell, '#8b5cf6', 'rgba(139,92,246,0.12)'],
                ['all', 'Все каналы', Send, '#06b6d4', 'rgba(6,182,212,0.12)'],
              ] as const).map(([ch, label, Icon, accentColor, accentBg]) => (
                <button
                  key={ch}
                  onClick={() => { setChannel(ch); if (ch === 'all') setContentTab('telegram') }}
                  className="flex flex-col items-center gap-2 px-4 py-4 rounded-2xl text-sm transition-all"
                  style={{
                    background: channel === ch ? accentBg : 'var(--glass-bg)',
                    border: `1.5px solid ${channel === ch ? accentColor : 'var(--glass-border)'}`,
                    color: channel === ch ? accentColor : 'var(--text-secondary)',
                  }}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium text-[13px]">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2 — Audience */}
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
              {AUDIENCE_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all"
                  style={{
                    background: audience === opt.value ? 'rgba(139,92,246,0.06)' : 'transparent',
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                    style={{
                      border: `2px solid ${audience === opt.value ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                    }}
                  >
                    {audience === opt.value && (
                      <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-1)' }} />
                    )}
                  </div>
                  <input
                    type="radio"
                    name="audience"
                    value={opt.value}
                    checked={audience === opt.value}
                    onChange={() => setAudience(opt.value)}
                    className="sr-only"
                  />
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Step 3 — Message */}
          <div className="glass-card gradient-border">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>3</span>
              Сообщение
            </h3>

            {/* Content tabs when channel = 'all' */}
            {channel === 'all' && (
              <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
                {([
                  ['telegram', 'Telegram', MessageCircle],
                  ['email', 'Email', Mail],
                  ['lk', 'ЛК', Bell],
                ] as const).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    onClick={() => setContentTab(key)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-all"
                    style={{
                      background: contentTab === key ? 'rgba(139,92,246,0.12)' : 'transparent',
                      color: contentTab === key ? 'var(--accent-1)' : 'var(--text-secondary)',
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-5">
              {/* ──── TELEGRAM EDITOR ──── */}
              {shouldShowTgEditor && (
                <div className="space-y-3">
                  <label className="text-xs font-medium flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <MessageCircle className="w-3.5 h-3.5" /> Telegram
                  </label>

                  {/* Parse mode toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>Режим:</span>
                    {(['Markdown', 'HTML'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setTgParseMode(mode)}
                        className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: tgParseMode === mode ? 'rgba(139,92,246,0.12)' : 'var(--glass-bg)',
                          border: `1px solid ${tgParseMode === mode ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                          color: tgParseMode === mode ? 'var(--accent-1)' : 'var(--text-secondary)',
                        }}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>

                  {/* Toolbar */}
                  <div className="flex flex-wrap items-center gap-1 p-2 rounded-xl" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
                    <button onClick={() => tgParseMode === 'Markdown' ? insertWrap('**', '**') : insertWrap('<b>', '</b>')}
                      className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" title="Жирный" style={{ color: 'var(--text-secondary)' }}>
                      <Bold className="w-4 h-4" />
                    </button>
                    <button onClick={() => tgParseMode === 'Markdown' ? insertWrap('_', '_') : insertWrap('<i>', '</i>')}
                      className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" title="Курсив" style={{ color: 'var(--text-secondary)' }}>
                      <Italic className="w-4 h-4" />
                    </button>
                    <button onClick={() => tgParseMode === 'Markdown' ? insertWrap('`', '`') : insertWrap('<code>', '</code>')}
                      className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" title="Код" style={{ color: 'var(--text-secondary)' }}>
                      <Code className="w-4 h-4" />
                    </button>
                    <button onClick={() => tgParseMode === 'Markdown' ? insertWrap('[', '](url)') : insertWrap('<a href="url">', '</a>')}
                      className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" title="Ссылка" style={{ color: 'var(--text-secondary)' }}>
                      <Link2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => insertWrap('>', '')}
                      className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" title="Цитата" style={{ color: 'var(--text-secondary)' }}>
                      <Quote className="w-4 h-4" />
                    </button>

                    <div className="w-px h-5 mx-1" style={{ background: 'var(--glass-border)' }} />

                    {/* Emoji picker */}
                    <div className="relative">
                      <button onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowPremiumEmoji(false) }}
                        className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" title="Эмодзи" style={{ color: 'var(--text-secondary)' }}>
                        <Smile className="w-4 h-4" />
                      </button>
                      {showEmojiPicker && (
                        <div className="absolute top-full left-0 mt-1 z-30 rounded-2xl p-3 w-[320px] max-h-[300px] overflow-hidden flex flex-col"
                          style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                          <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
                            {EMOJI_CATEGORIES.map((cat, ci) => (
                              <button key={ci} onClick={() => setEmojiCategory(ci)}
                                className="px-2 py-1 rounded-lg text-xs whitespace-nowrap transition-all"
                                style={{
                                  background: emojiCategory === ci ? 'rgba(139,92,246,0.12)' : 'transparent',
                                  color: emojiCategory === ci ? 'var(--accent-1)' : 'var(--text-tertiary)',
                                }}>
                                {cat.label}
                              </button>
                            ))}
                          </div>
                          <div className="grid grid-cols-8 gap-1 overflow-y-auto flex-1">
                            {EMOJI_CATEGORIES[emojiCategory].emojis.map((em, ei) => (
                              <button key={ei} onClick={() => { insertAtCursor(em); setShowEmojiPicker(false) }}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-lg transition-colors">
                                {em}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Premium emoji */}
                    <div className="relative">
                      <button onClick={() => { setShowPremiumEmoji(!showPremiumEmoji); setShowEmojiPicker(false) }}
                        className="p-1.5 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-1" title="Premium Emoji" style={{ color: 'var(--text-secondary)' }}>
                        <Sparkles className="w-4 h-4" />
                      </button>
                      {showPremiumEmoji && (
                        <div className="absolute top-full left-0 mt-1 z-30 rounded-2xl p-4 w-[300px]"
                          style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                          <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                            Вставка Premium Emoji по ID. Узнать ID: отправьте стикер @JsonDumpBot
                          </p>
                          <div className="flex gap-2 mb-3">
                            <input
                              value={premiumEmojiId}
                              onChange={e => setPremiumEmojiId(e.target.value)}
                              placeholder="Emoji ID"
                              className="glass-input flex-1 text-sm"
                            />
                            <button
                              onClick={() => {
                                if (!premiumEmojiId.trim()) return
                                insertAtCursor(`<tg-emoji emoji-id="${premiumEmojiId.trim()}">&#x2B50;</tg-emoji>`)
                                savePremiumEmoji(premiumEmojiId.trim())
                                setPremiumEmojiId('')
                                setShowPremiumEmoji(false)
                              }}
                              className="btn-primary text-xs px-3"
                            >
                              Вставить
                            </button>
                          </div>
                          {getSavedPremiumEmojis().length > 0 && (
                            <div>
                              <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Сохранённые:</p>
                              <div className="flex flex-wrap gap-1">
                                {getSavedPremiumEmojis().map(em => (
                                  <button key={em.id}
                                    onClick={() => { insertAtCursor(`<tg-emoji emoji-id="${em.id}">${em.fallback}</tg-emoji>`); setShowPremiumEmoji(false) }}
                                    className="px-2 py-1 rounded-lg text-xs transition-all hover:bg-white/10 flex items-center gap-1"
                                    style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--accent-1)' }}>
                                    <span>{em.fallback}</span>
                                    <span className="opacity-60">{em.name}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="w-px h-5 mx-1" style={{ background: 'var(--glass-border)' }} />

                    {/* Variables */}
                    <div className="relative">
                      <button onClick={() => setShowTgVariables(!showTgVariables)}
                        className="p-1.5 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-1 text-xs" title="Переменные"
                        style={{ color: 'var(--text-secondary)' }}>
                        <Variable className="w-4 h-4" />
                        <span className="hidden sm:inline">{'{x}'}</span>
                      </button>
                      {showTgVariables && (
                        <div className="absolute bottom-full right-0 mb-1 z-30 rounded-2xl p-3 w-[380px] max-h-[280px] overflow-y-auto"
                          style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
                          <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Переменные — клик для вставки</div>
                          <div className="grid grid-cols-2 gap-x-3">
                            {VARIABLE_GROUPS.map(group => (
                              <div key={group.title} className="mb-2">
                                <div className="text-[10px] font-bold uppercase tracking-wider py-0.5" style={{ color: '#60a5fa' }}>
                                  {group.title}
                                </div>
                                {group.vars.map(v => (
                                  <button key={v.key}
                                    onClick={() => { insertAtCursor(v.key); setShowTgVariables(false) }}
                                    className="w-full text-left px-1 py-0.5 rounded text-[11px] hover:bg-white/[0.06] transition-colors flex items-center gap-1"
                                    style={{ color: 'var(--text-primary)' }}>
                                    <code className="text-[10px] font-mono shrink-0" style={{ color: '#a78bfa' }}>{v.key}</code>
                                    <span className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>{v.desc}</span>
                                  </button>
                                ))}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Text area */}
                  <textarea
                    ref={tgTextRef}
                    id="broadcast-tg-text"
                    value={tgText}
                    onChange={e => setTgText(e.target.value)}
                    placeholder={`Текст сообщения (${tgParseMode})`}
                    rows={6}
                    className="glass-input w-full resize-y text-[14px]"
                    onClick={() => { setShowEmojiPicker(false); setShowPremiumEmoji(false); setShowTgVariables(false) }}
                  />

                  {/* Media upload */}
                  <div className="rounded-2xl p-3 space-y-2" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
                    <label className="text-xs font-medium flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
                      <Image className="w-3.5 h-3.5" /> Медиа (необязательно)
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        value={tgMediaUrl}
                        onChange={e => { setTgMediaUrl(e.target.value); if (e.target.value) setTgMediaType(detectMediaType(e.target.value)) }}
                        placeholder="URL медиа файла"
                        className="glass-input flex-1 text-sm"
                      />
                      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload}
                        accept="image/*,video/*,.gif,.pdf,.doc,.docx,.zip" />
                      <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                        className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-2 disabled:opacity-40">
                        <Upload className="w-3.5 h-3.5" /> {uploading ? 'Загрузка...' : 'Файл'}
                      </button>
                    </div>
                    {tgMediaUrl && (
                      <div className="flex gap-2 items-center">
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Тип:</span>
                        {(['photo', 'video', 'animation', 'document'] as const).map(mt => (
                          <button key={mt} onClick={() => setTgMediaType(mt)}
                            className="px-2 py-1 rounded-lg text-xs transition-all"
                            style={{
                              background: tgMediaType === mt ? 'rgba(139,92,246,0.12)' : 'transparent',
                              border: `1px solid ${tgMediaType === mt ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                              color: tgMediaType === mt ? 'var(--accent-1)' : 'var(--text-tertiary)',
                            }}>
                            {mt}
                          </button>
                        ))}
                        <button onClick={() => setTgMediaUrl('')}
                          className="ml-auto p-1 rounded-lg hover:bg-red-500/10" style={{ color: 'var(--text-tertiary)' }}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Inline buttons — drag & drop grid */}
                  <div className="rounded-2xl p-3 space-y-3" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
                        <FileText className="w-3.5 h-3.5" /> Кнопки
                      </label>
                      <button onClick={addTgButton}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium"
                        style={{ background: 'rgba(139,92,246,0.12)', color: 'var(--accent-1)' }}>
                        <Plus className="w-3 h-3" /> Добавить
                      </button>
                    </div>

                    {/* Visual grid preview — drag buttons between rows */}
                    {tgButtons.length > 0 && (() => {
                      const rows: Record<number, { btn: InlineButton; idx: number }[]> = {}
                      tgButtons.forEach((btn, idx) => {
                        const r = btn.row ?? 0
                        if (!rows[r]) rows[r] = []
                        rows[r].push({ btn, idx })
                      })
                      Object.values(rows).forEach(r => r.sort((a, b) => (a.btn.col ?? 0) - (b.btn.col ?? 0)))
                      const rowNums = Object.keys(rows).map(Number).sort((a, b) => a - b)

                      return (
                        <div className="space-y-1 rounded-xl p-2.5" style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--glass-border)' }}>
                          <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Перетащите кнопки между рядами:</p>
                          {rowNums.map(rowNum => (
                            <div key={rowNum} className="flex gap-1"
                              onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = 'rgba(139,92,246,0.1)' }}
                              onDragLeave={e => { e.currentTarget.style.background = '' }}
                              onDrop={e => {
                                e.currentTarget.style.background = ''
                                const dragIdx = parseInt(e.dataTransfer.getData('btnIdx'))
                                if (isNaN(dragIdx)) return
                                const copy = [...tgButtons]
                                copy[dragIdx] = { ...copy[dragIdx], row: rowNum, col: rows[rowNum]?.length ?? 0 }
                                setTgButtons(copy)
                              }}>
                              {rows[rowNum]?.map(({ btn, idx }) => (
                                <div key={idx}
                                  draggable
                                  onDragStart={e => e.dataTransfer.setData('btnIdx', String(idx))}
                                  onClick={() => setEditingBtnIdx(editingBtnIdx === idx ? null : idx)}
                                  className="flex-1 py-2 px-2 rounded-lg text-center text-[12px] font-medium cursor-grab active:cursor-grabbing transition-all hover:brightness-110 truncate"
                                  style={{
                                    background: BUTTON_STYLE_COLORS[btn.style]?.bg || 'var(--surface-2)',
                                    border: `2px solid ${editingBtnIdx === idx ? '#8b5cf6' : (BUTTON_STYLE_COLORS[btn.style]?.text || 'var(--glass-border)')}`,
                                    color: BUTTON_STYLE_COLORS[btn.style]?.text || 'var(--text-primary)',
                                  }}>
                                  {btn.iconEmojiId && <span className="mr-1">{btn.iconEmojiId.length > 6 ? '⭐' : btn.iconEmojiId}</span>}
                                  {btn.label || '...'}
                                </div>
                              ))}
                            </div>
                          ))}
                          {/* Drop zone for new row */}
                          <div className="flex items-center justify-center py-2 rounded-lg text-[10px] border-2 border-dashed transition-colors"
                            style={{ borderColor: 'var(--glass-border)', color: 'var(--text-tertiary)' }}
                            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#8b5cf6' }}
                            onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)' }}
                            onDrop={e => {
                              e.currentTarget.style.borderColor = 'var(--glass-border)'
                              const dragIdx = parseInt(e.dataTransfer.getData('btnIdx'))
                              if (isNaN(dragIdx)) return
                              const newRow = Math.max(...tgButtons.map(b => b.row), -1) + 1
                              const copy = [...tgButtons]
                              copy[dragIdx] = { ...copy[dragIdx], row: newRow, col: 0 }
                              setTgButtons(copy)
                            }}>
                            + Новый ряд
                          </div>
                        </div>
                      )
                    })()}

                    {/* Inline editor for selected button */}
                    {editingBtnIdx !== null && tgButtons[editingBtnIdx] && (() => {
                      const i = editingBtnIdx
                      const btn = tgButtons[i]
                      return (
                        <div className="rounded-xl p-3 space-y-2.5" style={{ background: 'var(--glass-bg)', border: '2px solid #8b5cf6' }}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium" style={{ color: '#a78bfa' }}>Редактирование кнопки</span>
                            <div className="flex gap-1">
                              <button onClick={() => { removeTgButton(i); setEditingBtnIdx(null) }}
                                className="p-1 rounded hover:bg-red-500/20">
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                              </button>
                              <button onClick={() => setEditingBtnIdx(null)}
                                className="p-1 rounded hover:bg-white/10">
                                <X className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                              </button>
                            </div>
                          </div>
                          <input value={btn.label} onChange={e => updateTgButton(i, 'label', e.target.value)}
                            placeholder="Текст кнопки" className="glass-input w-full text-sm" />
                          {btn.type === 'url' && (
                            <input value={btn.url} onChange={e => updateTgButton(i, 'url', e.target.value)}
                              placeholder="URL" className="glass-input w-full text-sm" />
                          )}
                          <div className="flex flex-wrap gap-2 items-center">
                            <div className="flex gap-1">
                              {(['url', 'callback'] as const).map(t => (
                                <button key={t} onClick={() => updateTgButton(i, 'type', t)}
                                  className="px-2.5 py-1 rounded text-[12px] transition-all"
                                  style={{
                                    background: btn.type === t ? 'rgba(139,92,246,0.15)' : 'transparent',
                                    color: btn.type === t ? '#a78bfa' : 'var(--text-tertiary)',
                                    border: `1px solid ${btn.type === t ? '#a78bfa' : 'var(--glass-border)'}`,
                                  }}>
                                  {t === 'url' ? 'URL' : 'Callback'}
                                </button>
                              ))}
                            </div>
                            <div className="flex gap-1">
                              {(Object.entries(BUTTON_STYLE_COLORS) as [TgButtonStyle, typeof BUTTON_STYLE_COLORS[TgButtonStyle]][]).map(([s, cfg]) => (
                                <button key={s} onClick={() => updateTgButton(i, 'style', s)}
                                  className="px-2.5 py-1 rounded text-[12px] transition-all"
                                  style={{
                                    background: btn.style === s ? cfg.bg : 'transparent',
                                    color: btn.style === s ? cfg.text : 'var(--text-tertiary)',
                                    border: `1px solid ${btn.style === s ? cfg.text : 'var(--glass-border)'}`,
                                  }}>
                                  {cfg.label}
                                </button>
                              ))}
                            </div>
                            <div className="w-full space-y-1.5">
                              <div className="flex items-center gap-2">
                                <input value={btn.iconEmojiId || ''} onChange={e => updateTgButton(i, 'iconEmojiId', e.target.value)}
                                  placeholder="Emoji ID (вручную)" className="glass-input flex-1 text-xs" />
                                {btn.iconEmojiId && (
                                  <button onClick={() => updateTgButton(i, 'iconEmojiId', '')}
                                    className="text-[11px] px-2 py-0.5 rounded hover:bg-red-500/10" style={{ color: '#f87171' }}>
                                    Убрать
                                  </button>
                                )}
                              </div>
                              {getSavedPremiumEmojis().length > 0 && (
                                <div className="space-y-0.5">
                                  <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Или выберите:</span>
                                  {getSavedPremiumEmojis().map(em => (
                                    <button key={em.id} onClick={() => updateTgButton(i, 'iconEmojiId', em.id)}
                                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[12px] transition-all hover:bg-white/[0.06]"
                                      style={{
                                        background: btn.iconEmojiId === em.id ? 'rgba(139,92,246,0.15)' : 'transparent',
                                        border: `1.5px solid ${btn.iconEmojiId === em.id ? '#8b5cf6' : 'transparent'}`,
                                        color: 'var(--text-primary)',
                                      }}>
                                      <span className="text-base flex-shrink-0">{em.fallback}</span>
                                      <span className="flex-1 truncate">{em.name}</span>
                                      <code className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{em.id.slice(-8)}</code>
                                      {btn.iconEmojiId === em.id && <span style={{ color: '#8b5cf6' }}>✓</span>}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                  {/* Poll */}
                  <div className="rounded-2xl p-3 space-y-3" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={tgPollEnabled} onChange={e => setTgPollEnabled(e.target.checked)}
                        className="rounded" />
                      <span className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                        <BarChart3 className="w-3.5 h-3.5" /> Добавить опрос
                      </span>
                    </label>
                    {tgPollEnabled && (
                      <div className="space-y-2 pl-1">
                        <input
                          value={tgPollQuestion}
                          onChange={e => setTgPollQuestion(e.target.value)}
                          placeholder="Вопрос опроса"
                          className="glass-input w-full text-sm"
                        />
                        {tgPollOptions.map((opt, i) => (
                          <div key={i} className="flex gap-2 items-center">
                            <input
                              value={opt}
                              onChange={e => updatePollOption(i, e.target.value)}
                              placeholder={`Вариант ${i + 1}`}
                              className="glass-input flex-1 text-sm"
                            />
                            {tgPollOptions.length > 2 && (
                              <button onClick={() => removePollOption(i)}
                                className="p-1.5 rounded-lg hover:bg-red-500/10" style={{ color: 'var(--text-tertiary)' }}>
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        {tgPollOptions.length < 10 && (
                          <button onClick={addPollOption}
                            className="text-xs px-3 py-1.5 rounded-lg transition-all flex items-center gap-1"
                            style={{ color: 'var(--accent-1)', background: 'rgba(139,92,246,0.06)' }}>
                            <Plus className="w-3 h-3" /> Добавить вариант
                          </button>
                        )}
                        <div className="flex gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={tgPollIsAnonymous} onChange={e => setTgPollIsAnonymous(e.target.checked)} className="rounded" />
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Анонимный</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={tgPollAllowMultiple} onChange={e => setTgPollAllowMultiple(e.target.checked)} className="rounded" />
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Несколько ответов</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Message effect */}
                  <div className="rounded-2xl p-3 space-y-2" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
                    <label className="text-xs font-medium flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
                      <Sparkles className="w-3.5 h-3.5" /> Эффект сообщения
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {MESSAGE_EFFECTS.map(ef => (
                        <button key={ef.id} onClick={() => setTgMessageEffectId(ef.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all"
                          style={{
                            background: tgMessageEffectId === ef.id ? 'rgba(139,92,246,0.12)' : 'var(--glass-bg)',
                            border: `1px solid ${tgMessageEffectId === ef.id ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                            color: tgMessageEffectId === ef.id ? 'var(--accent-1)' : 'var(--text-secondary)',
                          }}>
                          <span>{ef.emoji}</span>
                          <span>{ef.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pin message */}
                  <label className="flex items-center gap-2 cursor-pointer px-1">
                    <input type="checkbox" checked={tgPinMessage} onChange={e => setTgPinMessage(e.target.checked)} className="rounded" />
                    <MapPin className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Закрепить сообщение</span>
                  </label>
                </div>
              )}

              {/* Divider when showing multiple editors inline (non-all mode doesn't need) */}
              {channel !== 'all' && showTg && showEmail && (
                <div style={{ borderTop: '1px solid var(--glass-border)' }} />
              )}

              {/* ──── EMAIL EDITOR ──── */}
              {shouldShowEmailEditor && (
                <div className="space-y-3">
                  <label className="text-xs font-medium flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <Mail className="w-3.5 h-3.5" /> Email
                  </label>

                  {/* Template selection */}
                  <div className="space-y-2">
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Шаблон:</span>
                    <div className="flex gap-2">
                      {EMAIL_TEMPLATES.map(tmpl => (
                        <button key={tmpl.value} onClick={() => setEmailTemplate(tmpl.value)}
                          className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs transition-all flex-1"
                          style={{
                            border: `1.5px solid ${emailTemplate === tmpl.value ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                            background: emailTemplate === tmpl.value ? 'rgba(139,92,246,0.08)' : 'var(--glass-bg)',
                          }}>
                          <div className="w-8 h-5 rounded" style={{
                            background: tmpl.bg,
                            border: '1px solid rgba(255,255,255,0.1)',
                          }} />
                          <span style={{ color: emailTemplate === tmpl.value ? 'var(--accent-1)' : 'var(--text-secondary)' }}>
                            {tmpl.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <input
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                    placeholder="Тема письма"
                    className="glass-input w-full text-[14px]"
                  />
                  <textarea
                    value={emailBody}
                    onChange={e => setEmailBody(e.target.value)}
                    placeholder="Текст / HTML письма"
                    rows={10}
                    className="glass-input w-full resize-y text-[14px] font-mono"
                  />

                  {/* Variables for email */}
                  <details className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>
                    <summary className="px-3 py-2 cursor-pointer text-[13px] font-medium flex items-center gap-2 select-none"
                      style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)' }}>
                      <Variable className="w-4 h-4" style={{ color: '#a78bfa' }} />
                      Переменные — клик для вставки
                    </summary>
                    <div className="p-2 grid grid-cols-2 gap-x-3 gap-y-0 max-h-[200px] overflow-y-auto" style={{ background: 'var(--surface-1)' }}>
                      {VARIABLE_GROUPS.map(group => (
                        <div key={group.title} className="mb-1.5">
                          <div className="text-[10px] font-bold uppercase tracking-wider py-0.5" style={{ color: '#60a5fa' }}>{group.title}</div>
                          {group.vars.map(v => (
                            <button key={v.key}
                              onClick={() => setEmailBody(prev => prev + v.key)}
                              className="w-full text-left px-1 py-0.5 rounded text-[11px] hover:bg-white/[0.06] transition-colors flex items-center gap-1"
                              style={{ color: 'var(--text-primary)' }}>
                              <code className="text-[10px] font-mono shrink-0" style={{ color: '#a78bfa' }}>{v.key}</code>
                              <span className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>{v.desc}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </details>

                  <div className="flex gap-2">
                    <input
                      value={emailCtaText}
                      onChange={e => setEmailCtaText(e.target.value)}
                      placeholder="Текст кнопки CTA (необязательно)"
                      className="glass-input flex-1 text-sm"
                    />
                    <input
                      value={emailCtaUrl}
                      onChange={e => setEmailCtaUrl(e.target.value)}
                      placeholder="URL кнопки CTA (необязательно)"
                      className="glass-input flex-1 text-sm"
                    />
                  </div>
                </div>
              )}

              {/* ──── LK EDITOR ──── */}
              {shouldShowLkEditor && (
                <div className="space-y-3">
                  <label className="text-xs font-medium flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <Bell className="w-3.5 h-3.5" /> Уведомление в ЛК
                  </label>

                  {/* LK notification type */}
                  <div className="space-y-2">
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Тип уведомления:</span>
                    <div className="flex gap-2">
                      {LK_TYPE_OPTIONS.map(opt => (
                        <label key={opt.value}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all flex-1"
                          style={{
                            background: lkType === opt.value ? opt.bg : 'var(--glass-bg)',
                            border: `1.5px solid ${lkType === opt.value ? opt.color : 'var(--glass-border)'}`,
                          }}>
                          <input type="radio" name="lkType" value={opt.value} checked={lkType === opt.value}
                            onChange={() => setLkType(opt.value)} className="sr-only" />
                          <div className="w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ border: `2px solid ${lkType === opt.value ? opt.color : 'var(--glass-border)'}` }}>
                            {lkType === opt.value && <div className="w-1.5 h-1.5 rounded-full" style={{ background: opt.color }} />}
                          </div>
                          <span className="text-xs font-medium" style={{ color: lkType === opt.value ? opt.color : 'var(--text-secondary)' }}>
                            {opt.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <input
                    value={lkTitle}
                    onChange={e => setLkTitle(e.target.value)}
                    placeholder="Заголовок уведомления"
                    className="glass-input w-full text-[14px]"
                  />
                  <textarea
                    value={lkMessage}
                    onChange={e => setLkMessage(e.target.value)}
                    placeholder="Текст уведомления"
                    rows={4}
                    className="glass-input w-full resize-y text-[14px]"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Step 4 — Send */}
          <div className="glass-card gradient-border">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>4</span>
              Отправка
            </h3>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setShowPreview(true)}
                disabled={!canSend}
                className="btn-secondary text-sm flex items-center gap-2 disabled:opacity-40"
              >
                <Eye className="w-4 h-4" /> Предпросмотр
              </button>
              <button
                onClick={() => setShowScheduler(true)}
                disabled={!canSend}
                className="btn-secondary text-sm flex items-center gap-2 disabled:opacity-40"
              >
                <Calendar className="w-4 h-4" /> Запланировать
              </button>
              <button
                onClick={() => setConfirmSend(true)}
                disabled={!canSend}
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40"
              >
                <Send className="w-4 h-4" /> Отправить сейчас
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ HISTORY TAB ═══ */}
      {tab === 'history' && (
        <div className="glass-card gradient-border overflow-hidden">
          {loadingHistory ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 rounded-full border-2 border-transparent"
                   style={{ borderTopColor: '#8b5cf6', borderRightColor: '#06b6d4', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
              <Send className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Рассылок пока нет</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    {['Дата', 'Канал', 'Аудитория', 'Получателей', 'Отправлено', 'Ошибки', 'Статус', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map(item => (
                    <>
                      <tr
                        key={item.id}
                        className="cursor-pointer transition-colors"
                        style={{ borderBottom: '1px solid var(--glass-border)' }}
                        onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.04)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                          {fmtDate(item.createdAt)}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                          {CHANNEL_LABELS[item.channel as Channel] ?? item.channel}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                          {AUDIENCE_LABELS[item.audience] ?? item.audience}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                          {item.recipientCount}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                          {item.sentCount}
                        </td>
                        <td className="px-4 py-3">
                          <span style={{ color: item.errorCount > 0 ? '#ef4444' : 'var(--text-secondary)' }}>
                            {item.errorCount}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${STATUS_MAP[item.status]?.cls ?? 'badge-gray'}`}
                            style={STATUS_MAP[item.status]?.animate ? { animation: 'pulse 2s infinite' } : undefined}
                          >
                            {STATUS_MAP[item.status]?.label ?? item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <ChevronDown
                            className="w-4 h-4 transition-transform"
                            style={{
                              color: 'var(--text-tertiary)',
                              transform: expandedId === item.id ? 'rotate(180deg)' : 'rotate(0deg)',
                            }}
                          />
                        </td>
                      </tr>
                      {expandedId === item.id && (
                        <tr key={`${item.id}-detail`}>
                          <td colSpan={8} className="px-4 py-4" style={{ background: 'rgba(139,92,246,0.02)' }}>
                            <div className="space-y-3 text-sm">
                              {item.telegramText && (
                                <div>
                                  <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Telegram:</span>
                                  <pre className="mt-1 whitespace-pre-wrap text-sm" style={{ color: 'var(--text-primary)' }}>
                                    {item.telegramText}
                                  </pre>
                                </div>
                              )}
                              {item.emailSubject && (
                                <div>
                                  <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Email: {item.emailSubject}</span>
                                </div>
                              )}
                              {item.scheduledAt && (
                                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                  <Clock className="w-3.5 h-3.5" />
                                  Запланировано на {fmtDate(item.scheduledAt)}
                                </div>
                              )}
                              <div className="flex gap-2 pt-1">
                                {item.status === 'SCHEDULED' && (
                                  <button
                                    onClick={e => { e.stopPropagation(); cancelBroadcast(item.id) }}
                                    className="btn-danger text-xs flex items-center gap-1"
                                  >
                                    <X className="w-3.5 h-3.5" /> Отменить
                                  </button>
                                )}
                                {(item.status === 'DRAFT' || item.status === 'CANCELLED' || item.status === 'COMPLETED') && (
                                  <button
                                    onClick={e => { e.stopPropagation(); deleteBroadcast(item.id) }}
                                    className="btn-danger text-xs flex items-center gap-1"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Удалить
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPreview(false)} />
          <div className="glass-card relative z-10 w-full max-w-lg max-h-[80vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Предпросмотр</h3>
              <button onClick={() => setShowPreview(false)} className="p-1" style={{ color: 'var(--text-tertiary)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {showTg && (
              <div className="mb-4">
                <p className="text-xs font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
                  <MessageCircle className="w-3.5 h-3.5" /> Telegram
                  {tgMessageEffectId && (
                    <span className="ml-2">{MESSAGE_EFFECTS.find(e => e.id === tgMessageEffectId)?.emoji}</span>
                  )}
                  {tgPinMessage && <MapPin className="w-3 h-3 ml-1" />}
                </p>
                <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
                  {tgMediaUrl && (
                    <div className="mb-2 rounded-lg overflow-hidden" style={{ background: 'rgba(0,0,0,0.2)' }}>
                      <div className="flex items-center gap-2 p-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        <Image className="w-4 h-4" />
                        <span>{tgMediaType}: {tgMediaUrl.split('/').pop()}</span>
                      </div>
                    </div>
                  )}
                  <pre className="whitespace-pre-wrap font-sans">{tgText || '(пусто)'}</pre>
                  {tgButtons.filter(b => b.label).length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {sortedRows.map(row => (
                        <div key={row} className="flex gap-1">
                          {tgButtons.filter(b => b.row === row && b.label).map((btn, i) => (
                            <div key={i} className="flex-1 text-center text-xs py-2 rounded-lg font-medium"
                              style={{ background: BUTTON_STYLE_COLORS[btn.style].bg, color: BUTTON_STYLE_COLORS[btn.style].text }}>
                              {btn.label}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {tgPollEnabled && tgPollQuestion && (
                    <div className="mt-3 rounded-xl p-3" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid var(--glass-border)' }}>
                      <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{tgPollQuestion}</p>
                      {tgPollOptions.filter(o => o.trim()).map((opt, i) => (
                        <div key={i} className="text-xs py-1.5 px-3 mb-1 rounded-lg" style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)' }}>
                          {opt}
                        </div>
                      ))}
                      <div className="flex gap-3 mt-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                        {tgPollIsAnonymous && <span>Анонимный</span>}
                        {tgPollAllowMultiple && <span>Несколько ответов</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {showEmail && (
              <div className="mb-4">
                <p className="text-xs font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
                  <Mail className="w-3.5 h-3.5" /> Email
                  <span className="ml-auto text-[11px] px-2 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--accent-1)' }}>
                    {emailTemplate}
                  </span>
                </p>
                <div className="rounded-xl p-4 text-sm space-y-2" style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
                  <p className="font-medium">{emailSubject || '(без темы)'}</p>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}
                       dangerouslySetInnerHTML={{ __html: emailBody || '(пусто)' }} />
                  {emailCtaText && (
                    <div className="pt-2">
                      <span className="inline-block px-4 py-2 rounded-lg text-xs font-medium text-white"
                            style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }}>
                        {emailCtaText}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {showLk && (
              <div>
                <p className="text-xs font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
                  <Bell className="w-3.5 h-3.5" /> Уведомление ЛК
                </p>
                <div className="rounded-xl p-4 text-sm space-y-2"
                  style={{
                    background: LK_TYPE_OPTIONS.find(o => o.value === lkType)?.bg || 'var(--surface-2)',
                    border: `1px solid ${LK_TYPE_OPTIONS.find(o => o.value === lkType)?.color || 'var(--glass-border)'}`,
                    color: 'var(--text-primary)',
                  }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded"
                      style={{ background: LK_TYPE_OPTIONS.find(o => o.value === lkType)?.bg, color: LK_TYPE_OPTIONS.find(o => o.value === lkType)?.color }}>
                      {LK_TYPE_OPTIONS.find(o => o.value === lkType)?.label}
                    </span>
                  </div>
                  <p className="font-medium">{lkTitle || '(без заголовка)'}</p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{lkMessage || '(пусто)'}</p>
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
                <Calendar className="w-4 h-4" /> Запланировать рассылку
              </h3>
              <button onClick={() => setShowScheduler(false)} className="p-1" style={{ color: 'var(--text-tertiary)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="glass-input w-full text-sm mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowScheduler(false)} className="btn-secondary text-sm">
                Отмена
              </button>
              <button
                onClick={schedule}
                disabled={!scheduledAt || sending}
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40"
              >
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
              <div className="w-10 h-10 rounded-full flex items-center justify-center"
                   style={{ background: 'rgba(239,68,68,0.1)' }}>
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Подтвердите отправку</h3>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Канал: {CHANNEL_LABELS[channel]} | Аудитория: {recipientCount ?? '?'} получателей
                </p>
              </div>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Рассылка будет отправлена немедленно. Это действие нельзя отменить.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmSend(false)} className="btn-secondary text-sm">
                Отмена
              </button>
              <button
                onClick={sendNow}
                disabled={sending}
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40"
              >
                {sending ? (
                  <>Отправка...</>
                ) : (
                  <><Send className="w-4 h-4" /> Отправить</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        .badge-blue {
          background: rgba(59, 130, 246, 0.1);
          color: #60a5fa;
        }
      `}</style>
    </div>
  )
}
