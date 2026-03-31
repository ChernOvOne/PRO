'use client'

import { useEffect, useState, useCallback } from 'react'
import { Bell, Send, Users, User, Trash2, ChevronLeft, ChevronRight, AlertCircle, Info, CheckCircle2, Gift } from 'lucide-react'
import toast from 'react-hot-toast'

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string; badgeClass: string }> = {
  INFO:    { label: 'Инфо',        color: '#06b6d4', icon: 'ℹ️', badgeClass: 'badge-blue' },
  WARNING: { label: 'Внимание',    color: '#f59e0b', icon: '⚠️', badgeClass: 'badge-yellow' },
  SUCCESS: { label: 'Успех',       color: '#10b981', icon: '✅', badgeClass: 'badge-green' },
  PROMO:   { label: 'Промо',       color: '#8b5cf6', icon: '🎁', badgeClass: 'badge-violet' },
}

export default function AdminNotificationsPage() {
  const [tab, setTab] = useState<'send' | 'list'>('send')

  // Send form
  const [mode, setMode]       = useState<'broadcast' | 'user'>('broadcast')
  const [title, setTitle]     = useState('')
  const [message, setMessage] = useState('')
  const [userId, setUserId]   = useState('')
  const [type, setType]       = useState<'INFO' | 'WARNING' | 'SUCCESS' | 'PROMO'>('INFO')
  const [sending, setSending] = useState(false)
  const [result, setResult]   = useState<string | null>(null)

  // List
  const [notifications, setNotifications] = useState<any[]>([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [listLoading, setListLoading] = useState(false)

  const loadList = useCallback(async () => {
    setListLoading(true)
    try {
      const res = await fetch(`/api/admin/notifications/list?page=${page}&limit=30`, { credentials: 'include' })
      const d = await res.json()
      setNotifications(d.notifications || [])
      setTotal(d.total || 0)
    } catch {} finally { setListLoading(false) }
  }, [page])

  useEffect(() => { if (tab === 'list') loadList() }, [tab, loadList])

  const send = async () => {
    if (!title || !message) return
    setSending(true)
    setResult(null)
    try {
      if (mode === 'broadcast') {
        await fetch('/api/admin/notifications/send', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, message, type }),
        })
        setResult('Уведомление отправлено всем')
      } else {
        if (!userId) { setResult('Укажите ID пользователя'); setSending(false); return }
        await fetch(`/api/admin/notifications/send/${userId}`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, message, type }),
        })
        setResult(`Отправлено пользователю`)
      }
      setTitle(''); setMessage('')
    } catch (err: any) { setResult(`Ошибка: ${err.message}`) }
    finally { setSending(false) }
  }

  const deleteOne = async (id: string) => {
    await fetch(`/api/admin/notifications/${id}`, { method: 'DELETE', credentials: 'include' })
    toast.success('Удалено')
    loadList()
  }

  const deleteAll = async () => {
    if (!confirm('Удалить все уведомления?')) return
    await fetch('/api/admin/notifications/all', { method: 'DELETE', credentials: 'include' })
    toast.success('Все уведомления удалены')
    loadList()
  }

  const totalPages = Math.ceil(total / 30)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Уведомления</h1>

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'send' as const, label: 'Отправить', icon: <Send className="w-4 h-4" /> },
          { key: 'list' as const, label: `Список (${total})`, icon: <Bell className="w-4 h-4" /> },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all"
            style={{
              background: tab === t.key ? 'var(--accent-gradient)' : 'var(--glass-bg)',
              border: `1px solid ${tab === t.key ? 'transparent' : 'var(--glass-border)'}`,
              color: tab === t.key ? '#fff' : 'var(--text-secondary)',
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'send' && (
        <div className="glass-card">
          {/* Mode */}
          <div className="flex gap-2 mb-6">
            <button onClick={() => setMode('broadcast')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all"
              style={{
                background: mode === 'broadcast' ? 'var(--accent-gradient)' : 'var(--glass-bg)',
                border: `1px solid ${mode === 'broadcast' ? 'transparent' : 'var(--glass-border)'}`,
                color: mode === 'broadcast' ? '#fff' : 'var(--text-secondary)',
              }}>
              <Users className="w-4 h-4" /> Всем
            </button>
            <button onClick={() => setMode('user')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all"
              style={{
                background: mode === 'user' ? 'var(--accent-gradient)' : 'var(--glass-bg)',
                border: `1px solid ${mode === 'user' ? 'transparent' : 'var(--glass-border)'}`,
                color: mode === 'user' ? '#fff' : 'var(--text-secondary)',
              }}>
              <User className="w-4 h-4" /> Конкретному
            </button>
          </div>

          <div className="space-y-4">
            {mode === 'user' && (
              <input className="glass-input" placeholder="UUID пользователя"
                     value={userId} onChange={e => setUserId(e.target.value)} />
            )}

            {/* Type selector with colors */}
            <div className="flex gap-2 flex-wrap">
              {(['INFO', 'WARNING', 'SUCCESS', 'PROMO'] as const).map(t => {
                const cfg = TYPE_CONFIG[t]
                const active = type === t
                return (
                  <button key={t} onClick={() => setType(t)}
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

            <input className="glass-input" placeholder="Заголовок"
                   value={title} onChange={e => setTitle(e.target.value)} />

            <textarea className="glass-input min-h-[100px] resize-y" placeholder="Текст уведомления"
                      value={message} onChange={e => setMessage(e.target.value)} />

            {/* Preview */}
            {title && (
              <div className="p-3 rounded-xl" style={{
                background: `${TYPE_CONFIG[type].color}08`,
                borderLeft: `3px solid ${TYPE_CONFIG[type].color}`,
                border: `1px solid ${TYPE_CONFIG[type].color}20`,
              }}>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Предпросмотр</p>
                <div className="flex items-start gap-2">
                  <span className="text-sm">{TYPE_CONFIG[type].icon}</span>
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{message}</p>
                  </div>
                </div>
              </div>
            )}

            <button onClick={send} disabled={sending || !title || !message}
                    className="btn-primary w-full justify-center">
              <Send className="w-4 h-4" />
              {sending ? 'Отправляю...' : 'Отправить'}
            </button>

            {result && (
              <p className="text-sm text-center" style={{ color: result.startsWith('Ошибка') ? 'var(--danger)' : '#34d399' }}>
                {result}
              </p>
            )}
          </div>
        </div>
      )}

      {tab === 'list' && (
        <div className="glass-card p-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
            <p className="text-sm font-medium">{total} уведомлений</p>
            {total > 0 && (
              <button onClick={deleteAll} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg hover:bg-red-500/10 transition-all"
                      style={{ color: '#f87171' }}>
                <Trash2 className="w-3 h-3" /> Удалить все
              </button>
            )}
          </div>

          {listLoading ? (
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
                const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.INFO
                return (
                  <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-all"
                       style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <span className="text-sm mt-0.5 flex-shrink-0">{cfg.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{n.title}</p>
                        <span className={`${cfg.badgeClass} text-[10px]`}>{cfg.label}</span>
                        {!n.userId && <span className="badge-gray text-[10px]">Массовое</span>}
                      </div>
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{n.message}</p>
                      <div className="flex items-center gap-3 mt-1 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                        <span>{new Date(n.createdAt).toLocaleString('ru')}</span>
                        {n.user && <span>{n.user.telegramName || n.user.email || ''}</span>}
                      </div>
                    </div>
                    <button onClick={() => deleteOne(n.id)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 transition-all flex-shrink-0"
                            title="Удалить">
                      <Trash2 className="w-3.5 h-3.5" style={{ color: '#f87171' }} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--glass-border)' }}>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{page}/{totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                        className="p-1 disabled:opacity-30" style={{ color: 'var(--text-secondary)' }}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                        className="p-1 disabled:opacity-30" style={{ color: 'var(--text-secondary)' }}>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
