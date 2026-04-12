'use client'

import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  Send, Plus, Trash2, Clock, X, ChevronDown,
} from 'lucide-react'

// ── Small stat card ─────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
    </div>
  )
}
import BroadcastWizard from './BroadcastWizard'

// ── Types ────────────────────────────────────────────────────
type Channel = 'telegram' | 'email' | 'lk' | 'all'
type Audience =
  | 'all'
  | 'active_subscription'
  | 'no_subscription'
  | 'expiring_subscription'
  | 'email_only'
  | 'telegram_only'
  | 'segment'

type BroadcastStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'COMPLETED' | 'CANCELLED'

interface Broadcast {
  id: string
  createdAt: string
  channel: string
  audience: Audience
  segmentId?: string | null
  recipientCount: number
  sentCount: number
  errorCount: number
  status: BroadcastStatus
  telegramText?: string
  telegramButtons?: any[]
  emailSubject?: string
  emailBody?: string
  emailCtaText?: string
  emailCtaUrl?: string
  lkTitle?: string
  lkMessage?: string
  lkType?: string
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

const STATUS_MAP: Record<BroadcastStatus, { label: string; cls: string; animate?: boolean }> = {
  DRAFT:     { label: 'Черновик',     cls: 'badge-gray' },
  SCHEDULED: { label: 'Запланировано', cls: 'badge-yellow' },
  SENDING:   { label: 'Отправляется',  cls: 'badge-blue', animate: true },
  COMPLETED: { label: 'Завершено',     cls: 'badge-green' },
  CANCELLED: { label: 'Отменено',      cls: 'badge-red' },
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
  segment: 'Список',
}

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

// ── Component ────────────────────────────────────────────────
export default function AdminBroadcastPage() {
  const [history, setHistory]           = useState<Broadcast[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [expandedId, setExpandedId]     = useState<string | null>(null)
  const [wizardOpen, setWizardOpen]     = useState(false)
  const [editingBroadcast, setEditingBroadcast] = useState<any>(null)
  const [statsModal, setStatsModal] = useState<any | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  const openStats = async (id: string) => {
    setStatsLoading(true)
    try {
      const res = await fetch(`/api/admin/broadcast/${id}/stats`, { credentials: 'include' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setStatsModal(data)
    } catch { toast.error('Ошибка загрузки статистики') } finally { setStatsLoading(false) }
  }

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const data = await API('')
      setHistory(Array.isArray(data) ? data : data.broadcasts ?? [])
    } catch { /* ignore */ }
    finally { setLoadingHistory(false) }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  // ── Handle URL params from users page ───────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const segmentId = params.get('segmentId')
    const userIds = params.get('users')
    if (segmentId) {
      setEditingBroadcast({ audience: 'segment', segmentId })
      setWizardOpen(true)
    } else if (userIds) {
      toast.success(`Выбрано пользователей: ${userIds.split(',').length}`)
      setWizardOpen(true)
    }
  }, [])

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

  const openWizardForNew = () => {
    setEditingBroadcast(null)
    setWizardOpen(true)
  }

  const openWizardForEdit = (item: Broadcast) => {
    if (item.status !== 'DRAFT' && item.status !== 'SCHEDULED') return
    setEditingBroadcast(item)
    setWizardOpen(true)
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Рассылка</h1>
        <button
          onClick={openWizardForNew}
          className="btn-primary text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Новая рассылка
        </button>
      </div>

      {/* History table */}
      <div className="glass-card overflow-hidden">
        {loadingHistory ? (
          <div className="flex justify-center py-12">
            <div
              className="w-8 h-8 rounded-full border-2 border-transparent"
              style={{
                borderTopColor: 'var(--accent-1)',
                borderRightColor: '#06b6d4',
                animation: 'spin 0.8s linear infinite',
              }}
            />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
            <Send className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Рассылок пока нет</p>
            <button
              onClick={openWizardForNew}
              className="mt-4 btn-primary text-sm inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Создать первую рассылку
            </button>
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
                {history.map(item => {
                  const isEditable = item.status === 'DRAFT' || item.status === 'SCHEDULED'
                  return (
                    <>
                      <tr
                        key={item.id}
                        className="cursor-pointer transition-colors"
                        style={{ borderBottom: '1px solid var(--glass-border)' }}
                        onClick={() => {
                          if (isEditable) {
                            openWizardForEdit(item)
                          } else if (item.status === 'COMPLETED' || item.status === 'SENDING') {
                            openStats(item.id)
                          } else {
                            setExpandedId(expandedId === item.id ? null : item.id)
                          }
                        }}
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
                                  <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Email: </span>
                                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{item.emailSubject}</span>
                                </div>
                              )}
                              {item.lkTitle && (
                                <div>
                                  <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>ЛК: </span>
                                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{item.lkTitle}</span>
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
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BroadcastWizard
        open={wizardOpen}
        initialData={editingBroadcast}
        onClose={() => { setWizardOpen(false); setEditingBroadcast(null) }}
        onSaved={() => { loadHistory() }}
      />

      {statsLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div
            className="w-10 h-10 rounded-full border-2 border-transparent"
            style={{
              borderTopColor: 'var(--accent-1)',
              borderRightColor: '#06b6d4',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        </div>
      )}

      {statsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setStatsModal(null)}>
          <div className="w-full max-w-3xl rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}
            onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Статистика рассылки</h3>
              <button onClick={() => setStatsModal(null)}>
                <X className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>

            {/* Summary metrics */}
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="Отправлено" value={statsModal.tgStats?.sent || 0} color="#34d399" />
              <StatCard label="Ошибок" value={statsModal.tgStats?.failed || 0} color="#f87171" />
              <StatCard label="Заблокировали" value={statsModal.blocked || 0} color="#fbbf24" />
              <StatCard label="Клики" value={statsModal.clicks || 0} color="#06b6d4" />
            </div>

            {/* Conversion funnel */}
            {statsModal.recipients > 0 && (
              <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--surface-2)' }}>
                <div className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>Воронка</div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span style={{ color: 'var(--text-primary)' }}>Получили</span>
                    <span style={{ color: '#34d399' }}>{statsModal.tgStats?.sent || 0}</span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: 'var(--surface-1)' }}>
                    <div className="h-full rounded-full" style={{
                      width: `${((statsModal.tgStats?.sent || 0) / statsModal.recipients * 100)}%`,
                      background: '#34d399',
                    }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span style={{ color: 'var(--text-primary)' }}>Кликнули</span>
                    <span style={{ color: '#06b6d4' }}>{statsModal.clicks || 0}</span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: 'var(--surface-1)' }}>
                    <div className="h-full rounded-full" style={{
                      width: `${((statsModal.clicks || 0) / statsModal.recipients * 100)}%`,
                      background: '#06b6d4',
                    }} />
                  </div>
                </div>
              </div>
            )}

            {/* Poll results */}
            {statsModal.pollVotes && statsModal.pollVotes.length > 0 && (
              <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--surface-2)' }}>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Результаты опроса</div>
                {(statsModal.broadcast?.tgPollOptions || []).map((opt: string, i: number) => {
                  const vote = statsModal.pollVotes.find((v: any) => v.option === i)
                  const count = vote?.count || 0
                  const total = statsModal.pollVotes.reduce((s: number, v: any) => s + v.count, 0)
                  const pct = total > 0 ? Math.round(count / total * 100) : 0
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span style={{ color: 'var(--text-primary)' }}>{opt}</span>
                        <span style={{ color: 'var(--accent-1)' }}>{count} ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded-full" style={{ background: 'var(--surface-1)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent-1)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
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
