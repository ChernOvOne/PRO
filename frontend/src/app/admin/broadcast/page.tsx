'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Send, Mail, MessageCircle, Users, Clock, Plus, Trash2,
  Eye, Calendar, ChevronDown, AlertCircle, CheckCircle2,
  X,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────
type Channel = 'telegram' | 'email' | 'both'
type Audience =
  | 'all'
  | 'active_subscription'
  | 'no_subscription'
  | 'expiring_subscription'
  | 'email_only'
  | 'telegram_only'

type BroadcastStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'COMPLETED' | 'CANCELLED'

interface InlineButton {
  label: string
  url: string
}

interface Broadcast {
  id: string
  createdAt: string
  channel: Channel
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
  both: 'Оба',
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

// ── Component ────────────────────────────────────────────────
export default function AdminBroadcastPage() {
  const [tab, setTab] = useState<'create' | 'history'>('create')

  // Create form state
  const [channel, setChannel]       = useState<Channel>('telegram')
  const [audience, setAudience]     = useState<Audience>('all')
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(false)

  const [tgText, setTgText]               = useState('')
  const [tgButtons, setTgButtons]         = useState<InlineButton[]>([])
  const [emailSubject, setEmailSubject]   = useState('')
  const [emailBody, setEmailBody]         = useState('')
  const [emailCtaText, setEmailCtaText]   = useState('')
  const [emailCtaUrl, setEmailCtaUrl]     = useState('')

  const [showPreview, setShowPreview] = useState(false)
  const [showScheduler, setShowScheduler] = useState(false)
  const [scheduledAt, setScheduledAt]     = useState('')
  const [confirmSend, setConfirmSend]     = useState(false)
  const [sending, setSending]             = useState(false)

  // History state
  const [history, setHistory]       = useState<Broadcast[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
  const buildPayload = (extra: Record<string, unknown> = {}) => ({
    channel,
    audience,
    ...(channel !== 'email' && {
      telegramText: tgText,
      telegramButtons: tgButtons.filter(b => b.label && b.url),
    }),
    ...(channel !== 'telegram' && {
      emailSubject,
      emailBody,
      ...(emailCtaText && { emailCtaText }),
      ...(emailCtaUrl && { emailCtaUrl }),
    }),
    ...extra,
  })

  const sendNow = async () => {
    setSending(true)
    try {
      const created = await API('', { method: 'POST', body: JSON.stringify(buildPayload()) })
      await API(`/${created.id}/send`, { method: 'POST' })
      setConfirmSend(false)
      resetForm()
      setTab('history')
      loadHistory()
    } catch (e: any) {
      alert(e.message || 'Ошибка отправки')
    } finally { setSending(false) }
  }

  const schedule = async () => {
    if (!scheduledAt) return
    setSending(true)
    try {
      await API('', { method: 'POST', body: JSON.stringify(buildPayload({ scheduledAt })) })
      setShowScheduler(false)
      resetForm()
      setTab('history')
      loadHistory()
    } catch (e: any) {
      alert(e.message || 'Ошибка планирования')
    } finally { setSending(false) }
  }

  const cancelBroadcast = async (id: string) => {
    try {
      await API(`/${id}/cancel`, { method: 'POST' })
      loadHistory()
    } catch (e: any) { alert(e.message) }
  }

  const deleteBroadcast = async (id: string) => {
    if (!confirm('Удалить рассылку?')) return
    try {
      await API(`/${id}`, { method: 'DELETE' })
      loadHistory()
    } catch (e: any) { alert(e.message) }
  }

  const resetForm = () => {
    setChannel('telegram')
    setAudience('all')
    setTgText('')
    setTgButtons([])
    setEmailSubject('')
    setEmailBody('')
    setEmailCtaText('')
    setEmailCtaUrl('')
    setScheduledAt('')
  }

  // ── Telegram button management ───────────────────────────
  const addTgButton = () => {
    if (tgButtons.length >= 5) return
    setTgButtons([...tgButtons, { label: '', url: '' }])
  }

  const updateTgButton = (i: number, field: keyof InlineButton, val: string) => {
    const copy = [...tgButtons]
    copy[i] = { ...copy[i], [field]: val }
    setTgButtons(copy)
  }

  const removeTgButton = (i: number) => {
    setTgButtons(tgButtons.filter((_, idx) => idx !== i))
  }

  // ── Validation ───────────────────────────────────────────
  const canSend =
    (channel !== 'email'    ? tgText.trim().length > 0 : true) &&
    (channel !== 'telegram' ? emailSubject.trim().length > 0 && emailBody.trim().length > 0 : true)

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
            <div className="flex gap-2">
              {([
                ['telegram', 'Telegram', MessageCircle],
                ['email', 'Email', Mail],
                ['both', 'Оба', Send],
              ] as const).map(([ch, label, Icon]) => (
                <button
                  key={ch}
                  onClick={() => setChannel(ch)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all"
                  style={{
                    background: channel === ch ? 'rgba(139,92,246,0.12)' : 'var(--glass-bg)',
                    border: `1px solid ${channel === ch ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                    color: channel === ch ? 'var(--accent-1)' : 'var(--text-secondary)',
                  }}
                >
                  <Icon className="w-4 h-4" />
                  {label}
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
            <div className="space-y-5">
              {/* Telegram fields */}
              {(channel === 'telegram' || channel === 'both') && (
                <div className="space-y-3">
                  <label className="text-xs font-medium flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <MessageCircle className="w-3.5 h-3.5" /> Telegram
                  </label>
                  <textarea
                    value={tgText}
                    onChange={e => setTgText(e.target.value)}
                    placeholder="Текст сообщения (поддерживается Markdown)"
                    rows={5}
                    className="glass-input w-full resize-y text-sm"
                  />
                  {/* Inline buttons */}
                  <div className="space-y-2">
                    {tgButtons.map((btn, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input
                          value={btn.label}
                          onChange={e => updateTgButton(i, 'label', e.target.value)}
                          placeholder="Текст кнопки"
                          className="glass-input flex-1 text-sm"
                        />
                        <input
                          value={btn.url}
                          onChange={e => updateTgButton(i, 'url', e.target.value)}
                          placeholder="URL"
                          className="glass-input flex-1 text-sm"
                        />
                        <button
                          onClick={() => removeTgButton(i)}
                          className="p-2 rounded-lg transition-colors hover:bg-red-500/10"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {tgButtons.length < 5 && (
                      <button
                        onClick={addTgButton}
                        className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg transition-all"
                        style={{ color: 'var(--accent-1)', background: 'rgba(139,92,246,0.06)' }}
                      >
                        <Plus className="w-3.5 h-3.5" /> Добавить кнопку
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Divider when both */}
              {channel === 'both' && (
                <div style={{ borderTop: '1px solid var(--glass-border)' }} />
              )}

              {/* Email fields */}
              {(channel === 'email' || channel === 'both') && (
                <div className="space-y-3">
                  <label className="text-xs font-medium flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <Mail className="w-3.5 h-3.5" /> Email
                  </label>
                  <input
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                    placeholder="Тема письма"
                    className="glass-input w-full text-sm"
                  />
                  <textarea
                    value={emailBody}
                    onChange={e => setEmailBody(e.target.value)}
                    placeholder="Текст письма (поддерживается HTML)"
                    rows={6}
                    className="glass-input w-full resize-y text-sm"
                  />
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
                          {CHANNEL_LABELS[item.channel] ?? item.channel}
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

            {(channel === 'telegram' || channel === 'both') && (
              <div className="mb-4">
                <p className="text-xs font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
                  <MessageCircle className="w-3.5 h-3.5" /> Telegram
                </p>
                <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
                  <pre className="whitespace-pre-wrap font-sans">{tgText || '(пусто)'}</pre>
                  {tgButtons.filter(b => b.label).length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {tgButtons.filter(b => b.label).map((btn, i) => (
                        <div
                          key={i}
                          className="text-center text-xs py-2 rounded-lg"
                          style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--accent-1)' }}
                        >
                          {btn.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {(channel === 'email' || channel === 'both') && (
              <div>
                <p className="text-xs font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
                  <Mail className="w-3.5 h-3.5" /> Email
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
