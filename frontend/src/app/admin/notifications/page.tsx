'use client'

import { useState } from 'react'
import { Bell, Send, Users, User } from 'lucide-react'
import { adminApi } from '@/lib/api'

export default function AdminNotificationsPage() {
  const [mode, setMode]       = useState<'broadcast' | 'user'>('broadcast')
  const [title, setTitle]     = useState('')
  const [message, setMessage] = useState('')
  const [userId, setUserId]   = useState('')
  const [type, setType]       = useState<'INFO' | 'WARNING' | 'SUCCESS' | 'PROMO'>('INFO')
  const [sending, setSending] = useState(false)
  const [result, setResult]   = useState<string | null>(null)

  const send = async () => {
    if (!title || !message) return
    setSending(true)
    setResult(null)
    try {
      if (mode === 'broadcast') {
        await adminApi.sendNotification({ title, message, type })
        setResult('Уведомление отправлено всем пользователям')
      } else {
        if (!userId) { setResult('Укажите ID пользователя'); return }
        await adminApi.sendNotificationToUser(userId, title, message)
        setResult(`Уведомление отправлено пользователю ${userId}`)
      }
      setTitle('')
      setMessage('')
    } catch (err: any) {
      setResult(`Ошибка: ${err.message}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Уведомления</h1>

      <div className="glass-card">
        {/* Mode selector */}
        <div className="flex gap-2 mb-6">
          <button onClick={() => setMode('broadcast')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all ${
                    mode === 'broadcast' ? 'text-white' : ''
                  }`}
                  style={{
                    background: mode === 'broadcast' ? 'var(--accent-gradient)' : 'var(--glass-bg)',
                    border: `1px solid ${mode === 'broadcast' ? 'transparent' : 'var(--glass-border)'}`,
                  }}>
            <Users className="w-4 h-4" /> Всем пользователям
          </button>
          <button onClick={() => setMode('user')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all"
                  style={{
                    background: mode === 'user' ? 'var(--accent-gradient)' : 'var(--glass-bg)',
                    border: `1px solid ${mode === 'user' ? 'transparent' : 'var(--glass-border)'}`,
                    color: mode === 'user' ? 'white' : 'var(--text-secondary)',
                  }}>
            <User className="w-4 h-4" /> Конкретному
          </button>
        </div>

        <div className="space-y-4">
          {mode === 'user' && (
            <input className="glass-input" placeholder="UUID пользователя"
                   value={userId} onChange={e => setUserId(e.target.value)} />
          )}

          {/* Type */}
          <div className="flex gap-2">
            {(['INFO', 'WARNING', 'SUCCESS', 'PROMO'] as const).map(t => (
              <button key={t}
                      onClick={() => setType(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        type === t ? 'ring-1 ring-offset-1' : ''
                      }`}
                      style={{
                        background: type === t ? 'rgba(6,182,212,0.15)' : 'var(--glass-bg)',
                        color: type === t ? 'var(--accent-1)' : 'var(--text-tertiary)',
                      }}>
                {t}
              </button>
            ))}
          </div>

          <input className="glass-input" placeholder="Заголовок"
                 value={title} onChange={e => setTitle(e.target.value)} />

          <textarea className="glass-input min-h-[100px] resize-y" placeholder="Текст уведомления"
                    value={message} onChange={e => setMessage(e.target.value)} />

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
    </div>
  )
}
