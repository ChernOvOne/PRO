'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  X, ChevronLeft, ChevronRight, Users, MessageCircle, Edit3, Clock, Check, Save, Send,
  Mail, Bell, AlertCircle, Bold, Italic, Code, Link2, Quote, Smile, Plus, Trash2, ArrowUp,
} from 'lucide-react'
import toast from 'react-hot-toast'

/* ── Constants for the TG editor ───────────────────────────── */
const EMOJI_CATEGORIES: Record<string, string[]> = {
  'Смайлики': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','😘','😗','😋','😛','😜','🤪','😝','🤗','🤭','🤔','🤐','😐','😑','😶','😏','😒','🙄','😬','😮','😯','😲','😳','🥺','😢','😭','😤','😠','😡','🤯','😱','😨','😰','😥','😓','🤠','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','😴','💤','😈','👿','👹','👺','💀','👻','👽','🤖','💩','😺','😸','😹','😻','😼','😽','🙀','😿','😾'],
  'Люди': ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🦷','🦴','👀','👁','👅','👄'],
  'Природа': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🪲','🐢','🐍','🦎','🦂','🦀','🐙','🦑','🦐','🦞'],
  'Еда': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🧀','🥚','🍳','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🌮'],
  'Символы': ['❤','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣','💕','💞','💓','💗','💖','💘','💝','💟','✅','❌','⭕','❗','❓','💯','🔥','⭐','🌟','✨','💫','💥','💢','💤','🎉','🎊','🎁','🎂','🏆','🥇','🥈','🥉','🏅','🎖'],
}

const MESSAGE_EFFECTS = [
  { id: '', emoji: '—', label: 'Нет' },
  { id: '5104841245755180586', emoji: '🔥', label: 'Огонь' },
  { id: '5046509860389126442', emoji: '🎉', label: 'Конфетти' },
  { id: '5159385139981059251', emoji: '❤️', label: 'Сердце' },
  { id: '5107584321108051014', emoji: '👍', label: 'Лайк' },
  { id: '5104858069142078462', emoji: '👎', label: 'Дизлайк' },
  { id: '5046589136895476101', emoji: '💩', label: 'Какашка' },
]

const BROADCAST_VARIABLES: Array<{ var: string; desc: string }> = [
  { var: '{name}', desc: 'Имя пользователя' },
  { var: '{firstName}', desc: 'Имя (Telegram)' },
  { var: '{lastName}', desc: 'Фамилия (Telegram)' },
  { var: '{username}', desc: 'Username (Telegram)' },
  { var: '{email}', desc: 'Email' },
  { var: '{daysLeft}', desc: 'Дней до окончания подписки' },
  { var: '{subExpireDate}', desc: 'Дата окончания подписки' },
  { var: '{subStatus}', desc: 'Статус подписки' },
  { var: '{tariffName}', desc: 'Название тарифа' },
  { var: '{appUrl}', desc: 'URL приложения' },
  { var: '{subscriptionUrl}', desc: 'Ссылка на подписку' },
  { var: '{referralCode}', desc: 'Реферальный код' },
  { var: '{totalPaid}', desc: 'Всего оплачено' },
  { var: '{balance}', desc: 'Баланс' },
]

interface BroadcastWizardProps {
  open: boolean
  onClose: () => void
  initialData?: any
  onSaved: () => void
}

interface Segment {
  id: string
  name: string
  description?: string | null
  color?: string | null
}

const STEPS = [
  { id: 1, title: 'Аудитория', icon: Users },
  { id: 2, title: 'Каналы', icon: MessageCircle },
  { id: 3, title: 'Сообщение', icon: Edit3 },
  { id: 4, title: 'Расписание', icon: Clock },
  { id: 5, title: 'Проверка', icon: Check },
]

const SYSTEM_AUDIENCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Все пользователи' },
  { value: 'active_subscription', label: 'С активной подпиской' },
  { value: 'no_subscription', label: 'Без подписки' },
  { value: 'expiring_subscription', label: 'С истекающей подпиской (1-7 дней)' },
  { value: 'email_only', label: 'Только с email' },
  { value: 'telegram_only', label: 'Только с Telegram' },
]

export default function BroadcastWizard({ open, onClose, initialData, onSaved }: BroadcastWizardProps) {
  const [step, setStep] = useState(1)
  const [isDirty, setIsDirty] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)

  // Audience
  const [audienceType, setAudienceType] = useState<'segment' | 'system'>('system')
  const [segmentId, setSegmentId] = useState<string>('')
  const [systemAudience, setSystemAudience] = useState<string>('all')
  const [segments, setSegments] = useState<Segment[]>([])

  // Channels
  const [channelTg, setChannelTg] = useState(true)
  const [channelEmail, setChannelEmail] = useState(false)
  const [channelLk, setChannelLk] = useState(false)

  // TG — full editor state
  const [tgText, setTgText] = useState('')
  const [tgParseMode, setTgParseMode] = useState<'Markdown' | 'HTML'>('Markdown')
  const [tgMediaUrl, setTgMediaUrl] = useState('')
  const [tgMediaType, setTgMediaType] = useState<string>('')
  const [tgButtons, setTgButtons] = useState<any[]>([])
  const [tgPin, setTgPin] = useState(false)
  const [tgDeletePrev, setTgDeletePrev] = useState(false)
  const [tgEffectId, setTgEffectId] = useState<string>('')
  const [tgPollEnabled, setTgPollEnabled] = useState(false)
  const [tgPollQuestion, setTgPollQuestion] = useState('')
  const [tgPollOptions, setTgPollOptions] = useState<string[]>(['', ''])
  const [tgPollAnonymous, setTgPollAnonymous] = useState(true)
  const [tgPollMultiple, setTgPollMultiple] = useState(false)

  // TG — editor UI state
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [emojiCategory, setEmojiCategory] = useState('Смайлики')
  const [premiumEmojiOpen, setPremiumEmojiOpen] = useState(false)
  const [variablePopupOpen, setVariablePopupOpen] = useState(false)
  const [savedEmojis, setSavedEmojis] = useState<Array<{ id: string; fallback: string; name: string }>>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('bot_premium_emojis') || '[]') } catch { return [] }
  })
  const [editingBtnIdx, setEditingBtnIdx] = useState<number | null>(null)
  const [botBlocks, setBotBlocks] = useState<any[]>([])

  // Email — extended
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailCtaText, setEmailCtaText] = useState('')
  const [emailCtaUrl, setEmailCtaUrl] = useState('')
  const [emailTemplate, setEmailTemplate] = useState<'dark' | 'gradient' | 'minimal' | 'neon'>('dark')

  // LK
  const [lkTitle, setLkTitle] = useState('')
  const [lkMessage, setLkMessage] = useState('')
  const [lkType, setLkType] = useState<'INFO' | 'SUCCESS' | 'WARNING' | 'PROMO'>('INFO')

  // Schedule
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now')
  const [scheduledAt, setScheduledAt] = useState('')

  // Meta
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // Reset state when opened fresh
  useEffect(() => {
    if (!open) return
    setStep(1)
    setIsDirty(false)
    setShowCloseConfirm(false)
    if (!initialData) {
      setAudienceType('system')
      setSegmentId('')
      setSystemAudience('all')
      setChannelTg(true)
      setChannelEmail(false)
      setChannelLk(false)
      setTgText('')
      setTgParseMode('Markdown')
      setTgMediaUrl('')
      setTgMediaType('')
      setTgButtons([])
      setTgPin(false)
      setTgDeletePrev(false)
      setTgEffectId('')
      setTgPollEnabled(false)
      setTgPollQuestion('')
      setTgPollOptions(['', ''])
      setTgPollAnonymous(true)
      setTgPollMultiple(false)
      setEmailSubject('')
      setEmailBody('')
      setEmailCtaText('')
      setEmailCtaUrl('')
      setEmailTemplate('dark')
      setLkTitle('')
      setLkMessage('')
      setLkType('INFO')
      setScheduleMode('now')
      setScheduledAt('')
    }
  }, [open, initialData])

  // Load segments
  useEffect(() => {
    if (!open) return
    fetch('/api/admin/segments', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: any) => setSegments(Array.isArray(data) ? data : []))
      .catch(() => setSegments([]))
  }, [open])

  // Load bot blocks (groups with blocks) for button picker
  useEffect(() => {
    if (!open) return
    fetch('/api/admin/bot/blocks-for-picker', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: any) => setBotBlocks(Array.isArray(data) ? data : (data?.groups || [])))
      .catch(() => setBotBlocks([]))
  }, [open])

  // Hydrate from initialData
  useEffect(() => {
    if (!open || !initialData) return
    const ch = initialData.channel || 'telegram'
    setChannelTg(ch === 'telegram' || ch === 'all')
    setChannelEmail(ch === 'email' || ch === 'all')
    setChannelLk(ch === 'lk' || ch === 'all')

    if (initialData.audience === 'segment' && initialData.segmentId) {
      setAudienceType('segment')
      setSegmentId(initialData.segmentId)
    } else {
      setAudienceType('system')
      setSystemAudience(initialData.audience || 'all')
    }

    setTgText(initialData.telegramText || initialData.tgText || '')
    setTgParseMode(initialData.tgParseMode || 'Markdown')
    setTgMediaUrl(initialData.tgMediaUrl || '')
    setTgMediaType(initialData.tgMediaType || '')
    // Split effect from button array
    const rawBtns = Array.isArray(initialData.tgButtons) ? initialData.tgButtons : []
    const effectEntry = rawBtns.find((b: any) => b && b._type === 'effect')
    setTgEffectId(effectEntry?.effectId || initialData.tgEffectId || '')
    setTgButtons(rawBtns.filter((b: any) => !b || b._type !== 'effect'))
    setTgPin(!!initialData.tgPin)
    setTgDeletePrev(!!initialData.tgDeletePrev)
    if (initialData.tgPollQuestion) {
      setTgPollEnabled(true)
      setTgPollQuestion(initialData.tgPollQuestion)
      setTgPollOptions(Array.isArray(initialData.tgPollOptions) && initialData.tgPollOptions.length >= 2 ? initialData.tgPollOptions : ['', ''])
      setTgPollAnonymous(initialData.tgPollAnonymous !== false)
      setTgPollMultiple(!!initialData.tgPollMultiple)
    } else {
      setTgPollEnabled(false)
      setTgPollQuestion('')
      setTgPollOptions(['', ''])
    }
    setEmailSubject(initialData.emailSubject || '')
    setEmailBody(initialData.emailBody || initialData.emailHtml || '')
    setEmailCtaText(initialData.emailCtaText || initialData.emailBtnText || '')
    setEmailCtaUrl(initialData.emailCtaUrl || initialData.emailBtnUrl || '')
    setEmailTemplate(initialData.emailTemplate || 'dark')
    setLkTitle(initialData.lkTitle || '')
    setLkMessage(initialData.lkMessage || '')
    setLkType(initialData.lkType || 'INFO')

    if (initialData.scheduledAt) {
      setScheduleMode('later')
      // Convert ISO to datetime-local format
      try {
        const d = new Date(initialData.scheduledAt)
        const pad = (n: number) => String(n).padStart(2, '0')
        setScheduledAt(
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
        )
      } catch {
        setScheduledAt('')
      }
    } else {
      setScheduleMode('now')
      setScheduledAt('')
    }
  }, [open, initialData])

  // Load recipient count — re-run on any audience change
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const fetchCount = async () => {
      try {
        if (audienceType === 'segment' && segmentId) {
          const res = await fetch(`/api/admin/segments/${segmentId}/count`, { credentials: 'include' })
          if (cancelled) return
          const d = res.ok ? await res.json() : { count: 0 }
          setRecipientCount(d.count ?? 0)
        } else if (audienceType === 'system') {
          const res = await fetch(`/api/admin/broadcast/preview?audience=${encodeURIComponent(systemAudience)}`, { credentials: 'include' })
          if (cancelled) return
          const d = res.ok ? await res.json() : { count: 0 }
          setRecipientCount(d.count ?? d.recipientCount ?? 0)
        } else {
          setRecipientCount(0)
        }
      } catch {
        if (!cancelled) setRecipientCount(0)
      }
    }
    fetchCount()
    return () => { cancelled = true }
  }, [open, audienceType, segmentId, systemAudience])

  const markDirty = useCallback(() => setIsDirty(true), [])

  /* ── TG editor helpers ─────────────────────────────────── */
  const insertAtCursor = (before: string, after: string = '') => {
    const ta = document.getElementById('wizard-tg-text') as HTMLTextAreaElement | null
    if (!ta) { setTgText(t => t + before + after); markDirty(); return }
    const start = ta.selectionStart; const end = ta.selectionEnd
    const txt = tgText || ''
    const selected = txt.slice(start, end)
    const newText = txt.slice(0, start) + before + selected + after + txt.slice(end)
    setTgText(newText)
    markDirty()
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + before.length, start + before.length + selected.length) }, 0)
  }

  const savePremiumEmoji = (id: string, fallback: string, name: string) => {
    const updated = [{ id, fallback, name }, ...savedEmojis.filter(e => e.id !== id)].slice(0, 30)
    setSavedEmojis(updated)
    localStorage.setItem('bot_premium_emojis', JSON.stringify(updated))
  }
  const removeSavedEmoji = (id: string) => {
    const updated = savedEmojis.filter(e => e.id !== id)
    setSavedEmojis(updated)
    localStorage.setItem('bot_premium_emojis', JSON.stringify(updated))
  }

  const uploadTgFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) { toast.error('Макс 20 МБ'); return }
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await fetch('/api/admin/upload', { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data.url) {
        setTgMediaUrl(data.url)
        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        if (['jpg','jpeg','png','webp','svg'].includes(ext)) setTgMediaType('photo')
        else if (['mp4','webm'].includes(ext)) setTgMediaType('video')
        else if (['gif'].includes(ext)) setTgMediaType('animation')
        else setTgMediaType('document')
        markDirty()
        toast.success('Файл загружен')
      }
    } catch { toast.error('Ошибка загрузки') }
  }

  const handleClose = () => {
    if (isDirty) {
      setShowCloseConfirm(true)
    } else {
      onClose()
    }
  }

  const resolveChannel = (): string => {
    const arr: string[] = []
    if (channelTg) arr.push('telegram')
    if (channelEmail) arr.push('email')
    if (channelLk) arr.push('lk')
    if (arr.length === 1) return arr[0]
    if (arr.length > 1) return 'all'
    return 'telegram'
  }

  const canGoNext = (): boolean => {
    if (step === 1) {
      if (audienceType === 'segment') return !!segmentId
      return true
    }
    if (step === 2) return channelTg || channelEmail || channelLk
    if (step === 3) {
      if (channelTg && !tgText.trim()) return false
      if (channelEmail && (!emailSubject.trim() || !emailBody.trim())) return false
      if (channelLk && (!lkTitle.trim() || !lkMessage.trim())) return false
      return true
    }
    if (step === 4) {
      if (scheduleMode === 'later' && !scheduledAt) return false
      return true
    }
    return true
  }

  const buildPayload = () => {
    const audience = audienceType === 'segment' ? 'segment' : systemAudience
    const payload: any = {
      channel: resolveChannel(),
      audience,
    }
    if (audienceType === 'segment' && segmentId) payload.segmentId = segmentId
    if (channelTg) {
      payload.tgText = tgText
      payload.tgParseMode = tgParseMode
      if (tgMediaUrl) {
        payload.tgMediaUrl = tgMediaUrl
        if (tgMediaType) payload.tgMediaType = tgMediaType
      }
      // Serialize buttons + effect into single tgButtons array (back-compat with funnel)
      const serializedBtns: any[] = [...tgButtons]
      if (tgEffectId) serializedBtns.push({ _type: 'effect', effectId: tgEffectId })
      if (serializedBtns.length > 0) payload.tgButtons = serializedBtns
      payload.tgPin = tgPin
      payload.tgDeletePrev = tgDeletePrev
      if (tgEffectId) payload.tgEffectId = tgEffectId
      if (tgPollEnabled && tgPollQuestion.trim() && tgPollOptions.filter(o => o.trim()).length >= 2) {
        payload.tgPollQuestion = tgPollQuestion
        payload.tgPollOptions = tgPollOptions.filter(o => o.trim())
        payload.tgPollAnonymous = tgPollAnonymous
        payload.tgPollMultiple = tgPollMultiple
      }
    }
    if (channelEmail) {
      payload.emailSubject = emailSubject
      payload.emailHtml = emailBody
      payload.emailTemplate = emailTemplate
      if (emailCtaText) payload.emailBtnText = emailCtaText
      if (emailCtaUrl) payload.emailBtnUrl = emailCtaUrl
    }
    if (channelLk) {
      payload.lkTitle = lkTitle
      payload.lkMessage = lkMessage
      payload.lkType = lkType
    }
    if (scheduleMode === 'later' && scheduledAt) {
      payload.scheduledAt = new Date(scheduledAt).toISOString()
    }
    return payload
  }

  const apiFetch = async (path: string, method: string, body?: any) => {
    const res = await fetch(`/api/admin/broadcast${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    return res.json()
  }

  const saveDraft = async () => {
    setSaving(true)
    try {
      const payload = { ...buildPayload(), status: 'DRAFT' }
      if (initialData?.id) {
        await apiFetch(`/${initialData.id}`, 'PUT', payload)
      } else {
        await apiFetch('', 'POST', payload)
      }
      toast.success('Черновик сохранён')
      setIsDirty(false)
      onSaved()
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const send = async () => {
    setSaving(true)
    try {
      const payload = buildPayload()
      let id = initialData?.id as string | undefined
      if (!id) {
        const created = await apiFetch('', 'POST', payload)
        id = created.id
      } else {
        await apiFetch(`/${id}`, 'PUT', payload)
      }
      if (scheduleMode === 'now') {
        await apiFetch(`/${id}/send`, 'POST')
        toast.success('Рассылка отправлена')
      } else {
        toast.success('Рассылка запланирована')
      }
      setIsDirty(false)
      onSaved()
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'Ошибка отправки')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const selectedSegment = segments.find(s => s.id === segmentId)

  return (
    <div className="fixed inset-0 z-[200] flex items-stretch" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="flex-1 flex flex-col w-full" style={{ background: 'var(--surface-0, #0b1121)' }}>
        {/* Header: title + close */}
        <div
          className="px-6 py-3 flex items-center justify-between gap-4"
          style={{ borderBottom: '1px solid var(--glass-border)', background: 'var(--surface-1)' }}
        >
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            {initialData?.id ? 'Редактирование рассылки' : 'Новая рассылка'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-white/5 flex-shrink-0"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
          </button>
        </div>

        {/* Steps progress — centered below header */}
        <div
          className="px-6 py-3 flex items-center justify-center"
          style={{ borderBottom: '1px solid var(--glass-border)', background: 'var(--surface-1)' }}
        >
          <div className="flex items-center gap-1 max-w-full overflow-x-auto">
            {STEPS.map((s, i) => {
              const Icon = s.icon
              const isActive = step === s.id
              const isDone = step > s.id
              return (
                <div key={s.id} className="flex items-center flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => { if (isDone) setStep(s.id) }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap"
                    style={{
                      background: isActive ? 'var(--accent-1, #06b6d4)' : isDone ? 'rgba(6,182,212,0.12)' : 'transparent',
                      color: isActive ? '#fff' : isDone ? 'var(--accent-1, #06b6d4)' : 'var(--text-tertiary)',
                      cursor: isDone ? 'pointer' : 'default',
                    }}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{s.title}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <ChevronRight className="w-4 h-4 mx-1 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Кому отправить?</h3>

                <div className="grid grid-cols-2 gap-3">
                  {([
                    { value: 'segment', label: '📋 Сохранённый список', desc: 'Списки из раздела Пользователи' },
                    { value: 'system', label: '⚡ Системная группа', desc: 'Все / По статусу / По наличию email или TG' },
                  ] as const).map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => { setAudienceType(t.value); markDirty() }}
                      className="p-4 rounded-xl text-left transition-all"
                      style={{
                        background: audienceType === t.value ? 'var(--surface-2)' : 'var(--surface-1)',
                        border: `2px solid ${audienceType === t.value ? 'var(--accent-1, #06b6d4)' : 'var(--glass-border)'}`,
                      }}
                    >
                      <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.label}</div>
                      <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{t.desc}</div>
                    </button>
                  ))}
                </div>

                {audienceType === 'segment' && (
                  <div className="space-y-2">
                    {segments.length === 0 ? (
                      <div
                        className="rounded-xl p-6 text-center text-sm"
                        style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}
                      >
                        Нет сохранённых списков. Создайте их в разделе Пользователи → Списки.
                      </div>
                    ) : (
                      segments.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => { setSegmentId(s.id); markDirty() }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                          style={{
                            background: segmentId === s.id ? 'rgba(6,182,212,0.1)' : 'var(--surface-2)',
                            border: `1.5px solid ${segmentId === s.id ? 'var(--accent-1, #06b6d4)' : 'var(--glass-border)'}`,
                          }}
                        >
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center"
                            style={{ background: (s.color || '#06b6d4') + '22' }}
                          >
                            <Users className="w-5 h-5" style={{ color: s.color || '#06b6d4' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</div>
                            {s.description && (
                              <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{s.description}</div>
                            )}
                          </div>
                          {segmentId === s.id && <Check className="w-5 h-5" style={{ color: 'var(--accent-1, #06b6d4)' }} />}
                        </button>
                      ))
                    )}
                  </div>
                )}

                {audienceType === 'system' && (
                  <select
                    value={systemAudience}
                    onChange={e => { setSystemAudience(e.target.value); markDirty() }}
                    className="glass-input w-full text-sm"
                  >
                    {SYSTEM_AUDIENCE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                )}

                {recipientCount !== null && (
                  <div
                    className="rounded-xl p-3 text-sm"
                    style={{
                      background: 'rgba(6,182,212,0.08)',
                      border: '1px solid rgba(6,182,212,0.2)',
                      color: 'var(--accent-1, #06b6d4)',
                    }}
                  >
                    Получателей: <b>{recipientCount}</b>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Выберите каналы доставки</h3>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  Сообщение будет отправлено во все выбранные каналы одновременно
                </p>

                <div className="space-y-2">
                  {([
                    { key: 'tg', label: 'Telegram', desc: 'Быстрая доставка, inline-кнопки, медиа', state: channelTg, setter: setChannelTg, color: '#0088cc', Icon: MessageCircle },
                    { key: 'email', label: 'Email', desc: 'HTML-шаблоны, CTA кнопки', state: channelEmail, setter: setChannelEmail, color: '#f59e0b', Icon: Mail },
                    { key: 'lk', label: 'Личный кабинет (колокольчик)', desc: 'Уведомления в браузере и приложении', state: channelLk, setter: setChannelLk, color: '#a78bfa', Icon: Bell },
                  ]).map(ch => (
                    <label
                      key={ch.key}
                      className="flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all"
                      style={{
                        background: ch.state ? 'var(--surface-2)' : 'var(--surface-1)',
                        border: `2px solid ${ch.state ? ch.color : 'var(--glass-border)'}`,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={ch.state}
                        onChange={e => { ch.setter(e.target.checked); markDirty() }}
                        className="w-5 h-5 flex-shrink-0"
                      />
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: ch.color + '22' }}
                      >
                        <ch.Icon className="w-5 h-5" style={{ color: ch.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{ch.label}</div>
                        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{ch.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Содержание сообщения</h3>
                {!channelTg && !channelEmail && !channelLk && (
                  <div
                    className="rounded-xl p-4 text-sm flex items-center gap-2"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}
                  >
                    <AlertCircle className="w-4 h-4" />
                    Вернитесь на шаг 2 и выберите хотя бы один канал
                  </div>
                )}

                {channelTg && (
                  <div className="space-y-3 p-4 rounded-xl" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
                    <label className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                      <MessageCircle className="w-4 h-4" style={{ color: '#0088cc' }} /> Telegram
                    </label>

                    {/* Toolbar */}
                    <div className="flex items-center gap-0.5 p-1 rounded-lg flex-wrap" style={{ background: 'var(--surface-2)' }}>
                      <button type="button" onClick={() => insertAtCursor('**', '**')} className="p-1.5 rounded hover:bg-white/10" title="Жирный" style={{ color: 'var(--text-tertiary)' }}>
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => insertAtCursor('_', '_')} className="p-1.5 rounded hover:bg-white/10" title="Курсив" style={{ color: 'var(--text-tertiary)' }}>
                        <Italic className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => insertAtCursor('`', '`')} className="p-1.5 rounded hover:bg-white/10" title="Код" style={{ color: 'var(--text-tertiary)' }}>
                        <Code className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => insertAtCursor('[текст](', ')')} className="p-1.5 rounded hover:bg-white/10" title="Ссылка" style={{ color: 'var(--text-tertiary)' }}>
                        <Link2 className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => insertAtCursor('> ', '')} className="p-1.5 rounded hover:bg-white/10" title="Цитата" style={{ color: 'var(--text-tertiary)' }}>
                        <Quote className="w-3.5 h-3.5" />
                      </button>
                      <div className="w-px h-4 mx-1" style={{ background: 'var(--glass-border)' }} />
                      {/* Emoji picker */}
                      <div className="relative">
                        <button type="button" onClick={() => { setEmojiPickerOpen(v => !v); setPremiumEmojiOpen(false); setVariablePopupOpen(false) }} className="p-1.5 rounded hover:bg-white/10" title="Эмодзи" style={{ color: 'var(--text-tertiary)' }}>
                          <Smile className="w-3.5 h-3.5" />
                        </button>
                        {emojiPickerOpen && (
                          <div className="absolute z-[100] w-[300px] rounded-xl shadow-2xl p-3 mt-1"
                               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', top: '100%', left: 0, maxHeight: '350px' }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>Эмодзи</span>
                              <button type="button" onClick={() => setEmojiPickerOpen(false)} className="p-0.5 rounded hover:bg-white/10">
                                <X className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                              </button>
                            </div>
                            <div className="flex gap-1 mb-2 flex-wrap">
                              {Object.keys(EMOJI_CATEGORIES).map(cat => (
                                <button type="button" key={cat} onClick={() => setEmojiCategory(cat)}
                                        className="px-2 py-1 rounded text-[12px] transition-colors"
                                        style={{ background: emojiCategory === cat ? 'rgba(6,182,212,0.13)' : 'transparent', color: emojiCategory === cat ? '#a78bfa' : 'var(--text-tertiary)' }}>
                                  {cat}
                                </button>
                              ))}
                            </div>
                            <div className="grid grid-cols-8 gap-0.5 max-h-[200px] overflow-y-auto">
                              {EMOJI_CATEGORIES[emojiCategory]?.map((emoji, i) => (
                                <button type="button" key={i} onClick={() => { insertAtCursor(emoji, ''); setEmojiPickerOpen(false) }}
                                        className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 text-[18px]">
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Premium emoji */}
                      <div className="relative">
                        <button type="button" onClick={() => { setPremiumEmojiOpen(v => !v); setEmojiPickerOpen(false); setVariablePopupOpen(false) }}
                                className="p-1.5 rounded hover:bg-white/10" style={{ color: premiumEmojiOpen ? '#a78bfa' : 'var(--text-tertiary)' }} title="Premium Emoji">
                          <span className="text-[14px]">💎</span>
                        </button>
                        {premiumEmojiOpen && (
                          <div className="absolute z-[100] w-[320px] rounded-xl shadow-2xl p-3 mt-1"
                               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', top: '100%', left: 0, maxHeight: '400px', overflowY: 'auto' }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>💎 Premium Emoji</span>
                              <button type="button" onClick={() => setPremiumEmojiOpen(false)} className="p-0.5 rounded hover:bg-white/10">
                                <X className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                              </button>
                            </div>
                            <div className="space-y-1.5 mb-3 p-2 rounded-lg" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
                              <div className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>Добавить новый</div>
                              <input id="wiz-new-emoji-id" type="text" placeholder="Emoji ID (число)"
                                     className="w-full px-2 py-1.5 rounded text-[13px]"
                                     style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                              <div className="flex gap-1.5">
                                <input id="wiz-new-emoji-fallback" type="text" placeholder="Иконка" maxLength={4}
                                       className="w-20 px-2 py-1.5 rounded text-[13px]"
                                       style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                                <input id="wiz-new-emoji-name" type="text" placeholder="Название"
                                       className="flex-1 px-2 py-1.5 rounded text-[13px]"
                                       style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                              </div>
                              <button type="button" onClick={() => {
                                const idEl = document.getElementById('wiz-new-emoji-id') as HTMLInputElement
                                const fbEl = document.getElementById('wiz-new-emoji-fallback') as HTMLInputElement
                                const nmEl = document.getElementById('wiz-new-emoji-name') as HTMLInputElement
                                if (idEl?.value.trim()) {
                                  savePremiumEmoji(idEl.value.trim(), fbEl?.value || '?', nmEl?.value || 'Emoji')
                                  idEl.value = ''; if (fbEl) fbEl.value = ''; if (nmEl) nmEl.value = ''
                                  toast.success('Emoji сохранён')
                                } else { toast.error('Введите Emoji ID') }
                              }} className="w-full py-1.5 rounded text-[12px] font-medium" style={{ background: 'var(--accent-1)', color: '#fff' }}>
                                Сохранить emoji
                              </button>
                            </div>
                            <div className="text-[11px] mb-3 p-2 rounded-lg" style={{ background: 'var(--surface-1)', color: 'var(--text-tertiary)' }}>
                              Как узнать ID: перешлите сообщение с emoji в @JsonDumpBot
                            </div>
                            {savedEmojis.length > 0 ? (
                              <div className="space-y-1">
                                <div className="text-[12px] font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Сохранённые ({savedEmojis.length})</div>
                                {savedEmojis.map(em => (
                                  <div key={em.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all"
                                       style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
                                    <span className="text-[15px] flex-shrink-0">{em.fallback}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[12px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{em.name}</div>
                                      <div className="text-[9px] font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>{em.id}</div>
                                    </div>
                                    <button type="button" onClick={() => {
                                      const tag = `<tg-emoji emoji-id="${em.id}">${em.fallback}</tg-emoji>`
                                      insertAtCursor(tag, '')
                                      if (tgParseMode !== 'HTML') { setTgParseMode('HTML'); toast.success('Режим → HTML') }
                                      setPremiumEmojiOpen(false)
                                    }} className="px-2 py-1 rounded text-[11px] font-medium flex-shrink-0"
                                           style={{ background: 'rgba(6,182,212,0.13)', color: '#a78bfa' }}>В текст</button>
                                    <button type="button" onClick={() => removeSavedEmoji(em.id)} className="p-0.5 rounded hover:bg-red-500/20 flex-shrink-0">
                                      <Trash2 className="w-3 h-3 text-red-400" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[12px] text-center py-4" style={{ color: 'var(--text-tertiary)' }}>Нет сохранённых emoji</div>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Variables */}
                      <div className="relative">
                        <button type="button" onClick={() => { setVariablePopupOpen(v => !v); setEmojiPickerOpen(false); setPremiumEmojiOpen(false) }} className="p-1.5 rounded hover:bg-white/10" title="Переменные" style={{ color: '#a78bfa' }}>
                          <span className="text-[13px] font-mono font-bold">{'{x}'}</span>
                        </button>
                        {variablePopupOpen && (
                          <div className="absolute z-[100] w-[330px] rounded-lg shadow-2xl py-1 max-h-[320px] overflow-y-auto mt-1"
                               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', top: '100%', left: 0 }}>
                            <div className="px-3 py-2 text-[12px] font-medium" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--glass-border)' }}>
                              Переменные
                            </div>
                            {BROADCAST_VARIABLES.map((v, i) => (
                              <button type="button" key={i} onClick={() => { insertAtCursor(v.var); setVariablePopupOpen(false) }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-white/5 flex items-center gap-2"
                                      style={{ color: 'var(--text-secondary)' }}>
                                <span className="text-[12px] font-mono flex-shrink-0" style={{ color: '#a78bfa' }}>{v.var}</span>
                                <span className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>{v.desc}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex-1" />
                      {/* Parse mode inline */}
                      <div className="flex items-center gap-1">
                        {(['Markdown', 'HTML'] as const).map(mode => (
                          <button type="button" key={mode} onClick={() => { setTgParseMode(mode); markDirty() }}
                                  className="px-2 py-0.5 rounded text-[11px] font-medium"
                                  style={{
                                    background: tgParseMode === mode ? 'rgba(6,182,212,0.15)' : 'transparent',
                                    color: tgParseMode === mode ? '#a78bfa' : 'var(--text-tertiary)',
                                  }}>
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Textarea */}
                    <textarea
                      id="wizard-tg-text"
                      value={tgText}
                      onChange={e => { setTgText(e.target.value); markDirty() }}
                      placeholder={`Текст сообщения (${tgParseMode}). Поддерживает переменные: {name} {email} {daysLeft}`}
                      rows={6}
                      className="glass-input w-full text-sm resize-y font-mono"
                    />

                    {/* Media */}
                    <div className="space-y-2">
                      <label className="text-[12px] font-medium block" style={{ color: 'var(--text-tertiary)' }}>Медиа</label>
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={tgMediaUrl}
                          onChange={e => { setTgMediaUrl(e.target.value); markDirty() }}
                          className="glass-input flex-1 text-sm"
                          placeholder="URL или загрузите файл"
                        />
                        <label className="px-3 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer flex items-center gap-1 flex-shrink-0"
                               style={{ background: 'rgba(6,182,212,0.13)', color: '#a78bfa', border: '1px solid rgba(6,182,212,0.2)' }}>
                          <ArrowUp className="w-3 h-3" /> Файл
                          <input type="file" className="hidden" accept="image/*,video/*,.gif,.mp4,.webm"
                                 onChange={e => {
                                   const f = e.target.files?.[0]; if (!f) return
                                   uploadTgFile(f)
                                   e.target.value = ''
                                 }} />
                        </label>
                      </div>
                      {tgMediaUrl && (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] truncate flex-1" style={{ color: 'var(--text-tertiary)' }}>{tgMediaUrl}</span>
                          <button type="button" onClick={() => { setTgMediaUrl(''); setTgMediaType(''); markDirty() }}
                                  className="text-[12px] px-1.5 rounded" style={{ color: '#f87171' }}>✕</button>
                        </div>
                      )}
                      <select value={tgMediaType} onChange={e => { setTgMediaType(e.target.value); markDirty() }}
                              className="glass-input w-full text-sm">
                        <option value="">Нет медиа</option>
                        <option value="photo">Фото</option>
                        <option value="video">Видео</option>
                        <option value="animation">Анимация (GIF)</option>
                        <option value="document">Документ</option>
                      </select>
                    </div>

                    {/* Buttons — drag-and-drop grid + inline editor */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[12px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>Кнопки ({tgButtons.length})</label>
                        <button
                          type="button"
                          onClick={() => {
                            const maxRow = tgButtons.reduce((m: number, b: any) => Math.max(m, b.row ?? 0), -1)
                            const newBtn = {
                              label: 'Новая кнопка',
                              type: 'url' as const,
                              url: '',
                              style: 'default' as const,
                              row: maxRow + 1,
                              col: 0,
                            }
                            setTgButtons([...tgButtons, newBtn])
                            setEditingBtnIdx(tgButtons.length)
                            markDirty()
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--accent-1)', border: '1px solid rgba(6,182,212,0.2)' }}
                        >
                          <Plus className="w-3.5 h-3.5" /> Добавить кнопку
                        </button>
                      </div>

                      {tgButtons.length > 0 && (() => {
                        const rows: Record<number, { btn: any; idx: number }[]> = {}
                        tgButtons.forEach((btn: any, idx) => {
                          const r = btn.row ?? 0
                          if (!rows[r]) rows[r] = []
                          rows[r].push({ btn, idx })
                        })
                        Object.values(rows).forEach(r => r.sort((a, b) => (a.btn.col ?? 0) - (b.btn.col ?? 0)))
                        const rowNums = Object.keys(rows).map(Number).sort((a, b) => a - b)
                        const STYLE_COLORS: Record<string, { bg: string; text: string }> = {
                          default: { bg: 'rgba(107,114,128,0.15)', text: '#9ca3af' },
                          success: { bg: 'rgba(34,197,94,0.15)',  text: '#22c55e' },
                          danger:  { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444' },
                          primary: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6' },
                        }
                        return (
                          <div className="space-y-1 rounded-xl p-2.5" style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--glass-border)' }}>
                            <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Перетащите кнопки между рядами:</p>
                            {rowNums.map(rowNum => (
                              <div
                                key={rowNum}
                                className="flex gap-1"
                                onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLDivElement).style.background = 'rgba(6,182,212,0.1)' }}
                                onDragLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '' }}
                                onDrop={e => {
                                  (e.currentTarget as HTMLDivElement).style.background = ''
                                  const dragIdx = parseInt(e.dataTransfer.getData('btnIdx'))
                                  if (isNaN(dragIdx)) return
                                  const copy = [...tgButtons]
                                  copy[dragIdx] = { ...copy[dragIdx], row: rowNum, col: rows[rowNum]?.length ?? 0 }
                                  setTgButtons(copy)
                                  markDirty()
                                }}
                              >
                                {rows[rowNum]?.map(({ btn, idx }) => {
                                  const colors = STYLE_COLORS[btn.style || 'default'] || STYLE_COLORS.default
                                  return (
                                    <div
                                      key={idx}
                                      draggable
                                      onDragStart={e => e.dataTransfer.setData('btnIdx', String(idx))}
                                      onClick={() => setEditingBtnIdx(editingBtnIdx === idx ? null : idx)}
                                      className="flex-1 py-2 px-2 rounded-lg text-center text-[12px] font-medium cursor-grab active:cursor-grabbing transition-all hover:brightness-110 truncate"
                                      style={{
                                        background: colors.bg,
                                        border: `2px solid ${editingBtnIdx === idx ? 'var(--accent-1)' : colors.text}`,
                                        color: colors.text,
                                      }}
                                    >
                                      {btn.iconEmojiId && <span className="mr-1">⭐</span>}
                                      {btn.label || '...'}
                                    </div>
                                  )
                                })}
                              </div>
                            ))}
                            {/* Drop zone for new row */}
                            <div
                              className="flex items-center justify-center py-2 rounded-lg text-[10px] border-2 border-dashed transition-colors"
                              style={{ borderColor: 'var(--glass-border)', color: 'var(--text-tertiary)' }}
                              onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent-1)' }}
                              onDragLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--glass-border)' }}
                              onDrop={e => {
                                (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--glass-border)'
                                const dragIdx = parseInt(e.dataTransfer.getData('btnIdx'))
                                if (isNaN(dragIdx)) return
                                const newRow = Math.max(...tgButtons.map((b: any) => b.row ?? 0), -1) + 1
                                const copy = [...tgButtons]
                                copy[dragIdx] = { ...copy[dragIdx], row: newRow, col: 0 }
                                setTgButtons(copy)
                                markDirty()
                              }}
                            >
                              + Новый ряд
                            </div>
                          </div>
                        )
                      })()}

                      {/* Inline editor for the selected button */}
                      {editingBtnIdx !== null && tgButtons[editingBtnIdx] && (() => {
                        const i = editingBtnIdx
                        const btn = tgButtons[i] as any
                        const update = (field: string, value: any) => {
                          const copy = [...tgButtons]
                          copy[i] = { ...copy[i], [field]: value }
                          setTgButtons(copy)
                          markDirty()
                        }
                        return (
                          <div className="rounded-xl p-3 space-y-2.5" style={{ background: 'var(--glass-bg, var(--surface-2))', border: '2px solid var(--accent-1)' }}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium" style={{ color: 'var(--accent-1)' }}>Редактирование кнопки</span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const copy = tgButtons.filter((_, idx) => idx !== i)
                                    setTgButtons(copy)
                                    setEditingBtnIdx(null)
                                    markDirty()
                                  }}
                                  className="p-1 rounded hover:bg-red-500/20"
                                  title="Удалить"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingBtnIdx(null)}
                                  className="p-1 rounded hover:bg-white/10"
                                  title="Закрыть"
                                >
                                  <X className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                                </button>
                              </div>
                            </div>

                            {/* Label */}
                            <input
                              value={btn.label || ''}
                              onChange={e => update('label', e.target.value)}
                              placeholder="Текст кнопки"
                              className="glass-input w-full text-sm"
                            />

                            {/* Type */}
                            <div className="flex gap-1">
                              {(['url', 'bot_block'] as const).map(t => (
                                <button
                                  type="button"
                                  key={t}
                                  onClick={() => update('type', t)}
                                  className="flex-1 px-3 py-1.5 rounded text-xs"
                                  style={{
                                    background: btn.type === t ? 'rgba(6,182,212,0.15)' : 'transparent',
                                    color: btn.type === t ? 'var(--accent-1)' : 'var(--text-tertiary)',
                                    border: `1px solid ${btn.type === t ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                                  }}
                                >
                                  {t === 'url' ? '🔗 URL' : '📦 Блок бота'}
                                </button>
                              ))}
                            </div>

                            {/* URL field */}
                            {btn.type === 'url' && (
                              <input
                                value={btn.url || ''}
                                onChange={e => update('url', e.target.value)}
                                placeholder="https://example.com"
                                className="glass-input w-full text-sm"
                              />
                            )}

                            {/* Bot block selector */}
                            {btn.type === 'bot_block' && (
                              <select
                                value={btn.botBlockId || ''}
                                onChange={e => update('botBlockId', e.target.value)}
                                className="glass-input w-full text-sm"
                              >
                                <option value="">— Выберите блок —</option>
                                {botBlocks.map((group: any) => (
                                  <optgroup key={group.id} label={group.name}>
                                    {(group.blocks || []).map((b: any) => (
                                      <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            )}

                            {/* Style */}
                            <div>
                              <label className="text-[11px] block mb-1" style={{ color: 'var(--text-tertiary)' }}>Стиль</label>
                              <div className="flex gap-1">
                                {(['default', 'success', 'danger', 'primary'] as const).map(s => {
                                  const colors: Record<string, string> = {
                                    default: '#9ca3af', success: '#22c55e', danger: '#ef4444', primary: '#3b82f6',
                                  }
                                  return (
                                    <button
                                      type="button"
                                      key={s}
                                      onClick={() => update('style', s)}
                                      className="flex-1 px-2 py-1 rounded text-[11px]"
                                      style={{
                                        background: btn.style === s ? (colors[s] + '22') : 'var(--surface-2)',
                                        color: btn.style === s ? colors[s] : 'var(--text-tertiary)',
                                        border: `1px solid ${btn.style === s ? colors[s] : 'var(--glass-border)'}`,
                                      }}
                                    >
                                      {s}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>

                            {/* Emoji ID or pick from saved premium emojis */}
                            <div>
                              <label className="text-[11px] block mb-1" style={{ color: 'var(--text-tertiary)' }}>Premium Emoji ID (необязательно)</label>
                              <input
                                value={btn.iconEmojiId || ''}
                                onChange={e => update('iconEmojiId', e.target.value)}
                                placeholder="Emoji ID"
                                className="glass-input w-full text-sm"
                              />
                              {savedEmojis.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {savedEmojis.map(em => (
                                    <button
                                      type="button"
                                      key={em.id}
                                      onClick={() => update('iconEmojiId', em.id)}
                                      className="px-2 py-1 rounded text-[11px] flex items-center gap-1"
                                      style={{
                                        background: btn.iconEmojiId === em.id ? 'rgba(6,182,212,0.15)' : 'var(--surface-2)',
                                        border: `1px solid ${btn.iconEmojiId === em.id ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                                        color: btn.iconEmojiId === em.id ? 'var(--accent-1)' : 'var(--text-secondary)',
                                      }}
                                      title={em.name}
                                    >
                                      <span>{em.fallback}</span>
                                      <span className="truncate max-w-[80px]">{em.name}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })()}
                    </div>

                    {/* Pin / delete prev */}
                    <div className="flex flex-wrap gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={tgPin} onChange={e => { setTgPin(e.target.checked); markDirty() }} className="w-3.5 h-3.5 rounded" />
                        <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>Закрепить сообщение</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={tgDeletePrev} onChange={e => { setTgDeletePrev(e.target.checked); markDirty() }} className="w-3.5 h-3.5 rounded" />
                        <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>Удалить предыдущее</span>
                      </label>
                    </div>

                    {/* Message effects */}
                    <div>
                      <label className="text-[12px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Эффект при отправке</label>
                      <div className="grid grid-cols-7 gap-1.5">
                        {MESSAGE_EFFECTS.map(eff => (
                          <button type="button" key={eff.id || '_none'}
                                  onClick={() => { setTgEffectId(eff.id); markDirty() }}
                                  className="flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg text-center transition-all"
                                  style={{
                                    background: tgEffectId === eff.id ? 'rgba(6,182,212,0.13)' : 'var(--surface-2)',
                                    border: `1.5px solid ${tgEffectId === eff.id ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                                    color: 'var(--text-primary)',
                                  }}>
                            <span className="text-[16px]">{eff.emoji}</span>
                            <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>{eff.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Poll */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer mb-2">
                        <input type="checkbox" checked={tgPollEnabled} onChange={e => { setTgPollEnabled(e.target.checked); markDirty() }} className="w-3.5 h-3.5 rounded" />
                        <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>Добавить опрос</span>
                      </label>
                      {tgPollEnabled && (
                        <div className="space-y-2 p-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                          <input type="text" value={tgPollQuestion}
                                 onChange={e => { setTgPollQuestion(e.target.value); markDirty() }}
                                 placeholder="Вопрос опроса"
                                 className="glass-input w-full text-sm" />
                          <div className="space-y-1">
                            {tgPollOptions.map((opt, idx) => (
                              <div key={idx} className="flex gap-1">
                                <input type="text" value={opt}
                                       onChange={e => {
                                         const next = [...tgPollOptions]; next[idx] = e.target.value; setTgPollOptions(next); markDirty()
                                       }}
                                       placeholder={`Вариант ${idx + 1}`}
                                       className="glass-input flex-1 text-sm" />
                                {tgPollOptions.length > 2 && (
                                  <button type="button" onClick={() => {
                                    setTgPollOptions(tgPollOptions.filter((_, i) => i !== idx)); markDirty()
                                  }} className="px-2 rounded" style={{ color: '#f87171' }}>✕</button>
                                )}
                              </div>
                            ))}
                            {tgPollOptions.length < 10 && (
                              <button type="button" onClick={() => { setTgPollOptions([...tgPollOptions, '']); markDirty() }}
                                      className="text-[11px] px-2 py-1 rounded" style={{ color: '#a78bfa' }}>
                                + Добавить вариант
                              </button>
                            )}
                          </div>
                          <div className="flex gap-3 flex-wrap">
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input type="checkbox" checked={tgPollAnonymous} onChange={e => { setTgPollAnonymous(e.target.checked); markDirty() }} className="w-3.5 h-3.5 rounded" />
                              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Анонимный</span>
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input type="checkbox" checked={tgPollMultiple} onChange={e => { setTgPollMultiple(e.target.checked); markDirty() }} className="w-3.5 h-3.5 rounded" />
                              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Много вариантов</span>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {channelEmail && (
                  <div className="space-y-2 p-4 rounded-xl" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
                    <label className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                      <Mail className="w-4 h-4" style={{ color: '#f59e0b' }} /> Email
                    </label>
                    <input
                      value={emailSubject}
                      onChange={e => { setEmailSubject(e.target.value); markDirty() }}
                      placeholder="Тема письма"
                      className="glass-input w-full text-sm"
                    />
                    <div>
                      <label className="text-[12px] block mb-1" style={{ color: 'var(--text-tertiary)' }}>HTML-содержимое</label>
                      <textarea
                        value={emailBody}
                        onChange={e => { setEmailBody(e.target.value); markDirty() }}
                        placeholder="<p>Ваш HTML-шаблон...</p>"
                        rows={8}
                        className="glass-input w-full text-sm resize-y font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[12px] block mb-1" style={{ color: 'var(--text-tertiary)' }}>Шаблон оформления</label>
                      <select
                        value={emailTemplate}
                        onChange={e => { setEmailTemplate(e.target.value as any); markDirty() }}
                        className="glass-input w-full text-sm"
                      >
                        <option value="dark">Тёмный</option>
                        <option value="gradient">Градиент</option>
                        <option value="minimal">Минимальный</option>
                        <option value="neon">Неон</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={emailCtaText}
                        onChange={e => { setEmailCtaText(e.target.value); markDirty() }}
                        placeholder="Текст кнопки CTA (необязательно)"
                        className="glass-input text-sm"
                      />
                      <input
                        value={emailCtaUrl}
                        onChange={e => { setEmailCtaUrl(e.target.value); markDirty() }}
                        placeholder="URL кнопки CTA"
                        className="glass-input text-sm"
                      />
                    </div>
                  </div>
                )}

                {channelLk && (
                  <div className="space-y-2 p-4 rounded-xl" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
                    <label className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                      <Bell className="w-4 h-4" style={{ color: '#a78bfa' }} /> Личный кабинет
                    </label>
                    <input
                      value={lkTitle}
                      onChange={e => { setLkTitle(e.target.value); markDirty() }}
                      placeholder="Заголовок"
                      className="glass-input w-full text-sm"
                    />
                    <textarea
                      value={lkMessage}
                      onChange={e => { setLkMessage(e.target.value); markDirty() }}
                      placeholder="Текст уведомления"
                      rows={3}
                      className="glass-input w-full text-sm resize-y"
                    />
                    <select
                      value={lkType}
                      onChange={e => { setLkType(e.target.value as any); markDirty() }}
                      className="glass-input w-full text-sm"
                    >
                      <option value="INFO">ℹ️ Информация</option>
                      <option value="SUCCESS">✅ Успех</option>
                      <option value="WARNING">⚠️ Предупреждение</option>
                      <option value="PROMO">🎁 Акция</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Когда отправить?</h3>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => { setScheduleMode('now'); markDirty() }}
                    className="p-5 rounded-xl text-left transition-all"
                    style={{
                      background: scheduleMode === 'now' ? 'rgba(52,211,153,0.1)' : 'var(--surface-2)',
                      border: `2px solid ${scheduleMode === 'now' ? '#34d399' : 'var(--glass-border)'}`,
                    }}
                  >
                    <div className="text-2xl mb-1">⚡</div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Сейчас</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Отправить сразу после подтверждения</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setScheduleMode('later'); markDirty() }}
                    className="p-5 rounded-xl text-left transition-all"
                    style={{
                      background: scheduleMode === 'later' ? 'rgba(251,191,36,0.1)' : 'var(--surface-2)',
                      border: `2px solid ${scheduleMode === 'later' ? '#fbbf24' : 'var(--glass-border)'}`,
                    }}
                  >
                    <div className="text-2xl mb-1">⏰</div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Запланировать</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Выбрать дату и время</div>
                  </button>
                </div>

                {scheduleMode === 'later' && (
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                      Дата и время отправки
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={e => { setScheduledAt(e.target.value); markDirty() }}
                      className="glass-input w-full text-sm"
                    />
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Проверьте и отправьте</h3>

                <div
                  className="rounded-xl p-4 space-y-3"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Аудитория</span>
                    <span className="text-sm font-medium text-right" style={{ color: 'var(--text-primary)' }}>
                      {audienceType === 'segment'
                        ? (selectedSegment?.name || '—')
                        : (SYSTEM_AUDIENCE_OPTIONS.find(o => o.value === systemAudience)?.label || systemAudience)}
                      {' · '}
                      {recipientCount ?? '?'} получателей
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Каналы</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {[channelTg && 'Telegram', channelEmail && 'Email', channelLk && 'ЛК'].filter(Boolean).join(', ') || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Время отправки</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {scheduleMode === 'now' ? 'Сейчас' : (scheduledAt ? new Date(scheduledAt).toLocaleString('ru-RU') : '—')}
                    </span>
                  </div>
                </div>

                {channelTg && tgText && (
                  <div className="rounded-xl p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                    <div className="text-xs mb-2 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      <MessageCircle className="w-3 h-3" /> Telegram
                    </div>
                    <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{tgText}</div>
                  </div>
                )}
                {channelEmail && (emailSubject || emailBody) && (
                  <div className="rounded-xl p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                    <div className="text-xs mb-2 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      <Mail className="w-3 h-3" /> Email
                    </div>
                    <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{emailSubject || '(без темы)'}</div>
                    <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{emailBody}</div>
                    {emailCtaText && (
                      <div className="mt-3">
                        <span
                          className="inline-block px-4 py-2 rounded-lg text-xs font-medium text-white"
                          style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }}
                        >
                          {emailCtaText}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {channelLk && (lkTitle || lkMessage) && (
                  <div className="rounded-xl p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                    <div className="text-xs mb-2 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      <Bell className="w-3 h-3" /> Личный кабинет
                    </div>
                    <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{lkTitle}</div>
                    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{lkMessage}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer with nav */}
        <div
          className="px-6 py-4 flex items-center justify-between gap-3"
          style={{ borderTop: '1px solid var(--glass-border)', background: 'var(--surface-1)' }}
        >
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="px-4 py-2 rounded-xl text-sm inline-flex items-center gap-1.5"
                style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}
              >
                <ChevronLeft className="w-4 h-4" /> Назад
              </button>
            )}
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={saveDraft}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm inline-flex items-center gap-1.5 disabled:opacity-40"
              style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}
            >
              <Save className="w-4 h-4" /> Сохранить как черновик
            </button>
            {step < 5 ? (
              <button
                type="button"
                onClick={() => { if (canGoNext()) setStep(s => s + 1) }}
                disabled={!canGoNext()}
                className="px-6 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-1.5 disabled:cursor-not-allowed"
                style={{
                  background: canGoNext() ? 'var(--accent-1, #06b6d4)' : 'var(--surface-3, #1f2937)',
                  color: '#fff',
                  opacity: canGoNext() ? 1 : 0.5,
                }}
              >
                Далее <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={send}
                disabled={saving}
                className="px-6 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-40"
                style={{ background: '#34d399', color: '#0b1121' }}
              >
                <Send className="w-4 h-4" /> {scheduleMode === 'now' ? 'Отправить' : 'Запланировать'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Close confirmation */}
      {showCloseConfirm && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5 space-y-4"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}
          >
            <h4 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Закрыть рассылку?</h4>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Несохранённые изменения будут потеряны. Хотите сохранить как черновик?
            </p>
            <div className="flex gap-2 pt-2 flex-wrap">
              <button
                type="button"
                onClick={() => setShowCloseConfirm(false)}
                className="flex-1 py-2 rounded-xl text-sm"
                style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)' }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => { setShowCloseConfirm(false); saveDraft() }}
                className="flex-1 py-2 rounded-xl text-sm"
                style={{ background: 'var(--accent-1, #06b6d4)', color: '#fff' }}
              >
                Сохранить
              </button>
              <button
                type="button"
                onClick={() => { setShowCloseConfirm(false); onClose() }}
                className="flex-1 py-2 rounded-xl text-sm"
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  color: '#f87171',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
