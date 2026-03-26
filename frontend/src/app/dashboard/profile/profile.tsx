'use client'

import { useEffect, useState } from 'react'
import { User, Mail, MessageCircle, Shield, Calendar,
         Edit3, Save, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '@/lib/api'
import type { User as UserType } from '@/types'
import { Card, Badge, Input } from '@/components/ui'
import { formatDate, formatRelative, daysUntil } from '@/lib/utils'

export default function ProfilePage() {
  const [user,    setUser]    = useState<UserType | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [email,   setEmail]   = useState('')
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    authApi.me()
      .then(u => { setUser(u); setEmail(u.email || ''); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const saveEmail = async () => {
    if (!email.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Ошибка') }
      setUser(await res.json())
      setEditing(false)
      toast.success('Email обновлён')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto space-y-6">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-32 bg-gray-800 rounded-2xl animate-pulse" />
      ))}
    </div>
  )

  if (!user) return null

  const daysLeft = daysUntil(user.subExpireAt)

  const statusColor = (s: string): 'green' | 'red' | 'gray' | 'blue' => {
    if (s === 'ACTIVE')  return 'green'
    if (s === 'EXPIRED') return 'red'
    if (s === 'TRIAL')   return 'blue'
    return 'gray'
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Профиль</h1>
        <p className="text-gray-400 text-sm mt-0.5">Настройки аккаунта</p>
      </div>

      <Card className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-brand-600/20 border border-brand-500/30
                          flex items-center justify-center text-2xl font-bold text-brand-300 flex-shrink-0">
            {(user.telegramName || user.email || 'U')[0].toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-lg">
              {user.telegramName || user.email?.split('@')[0] || 'Пользователь'}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge color={statusColor(user.subStatus)}>
                {user.subStatus === 'ACTIVE' ? 'Подписка активна' : 'Нет подписки'}
              </Badge>
              {user.role === 'ADMIN' && <Badge color="purple">Admin</Badge>}
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t border-gray-800 pt-4">
          {user.telegramId && (
            <div className="flex items-center gap-3 py-2">
              <MessageCircle className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-gray-500">Telegram</p>
                <p className="font-medium">@{user.telegramName || user.telegramId}</p>
              </div>
              <Badge color="green">Привязан</Badge>
            </div>
          )}

          <div className="flex items-start gap-3 py-2">
            <Mail className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 mb-1">Email</p>
              {editing ? (
                <div className="flex gap-2">
                  <Input type="email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" className="py-2 text-sm" autoFocus />
                  <button onClick={saveEmail} disabled={saving}
                    className="p-2 bg-brand-600/20 hover:bg-brand-600/30 border border-brand-500/30
                               text-brand-400 rounded-xl transition-colors flex-shrink-0">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  </button>
                  <button onClick={() => { setEditing(false); setEmail(user.email || '') }}
                    className="p-2 text-gray-500 hover:text-white hover:bg-gray-700 rounded-xl transition-colors flex-shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className={user.email ? 'font-medium' : 'text-gray-500 italic'}>
                    {user.email || 'Не указан'}
                  </p>
                  <button onClick={() => setEditing(true)}
                    className="p-1 text-gray-500 hover:text-white transition-colors">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 py-2">
            <Calendar className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500">Дата регистрации</p>
              <p className="font-medium">{formatDate(user.createdAt)}</p>
            </div>
          </div>

          {user.lastLoginAt && (
            <div className="flex items-center gap-3 py-2 border-t border-gray-800">
              <Shield className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Последний вход</p>
                <p className="font-medium">{formatRelative(user.lastLoginAt)}</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Shield className="w-4 h-4 text-brand-400" />
          Подписка
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-gray-800 rounded-xl">
            <p className="text-xs text-gray-500">Статус</p>
            <div className="mt-1">
              <Badge color={statusColor(user.subStatus)}>{user.subStatus}</Badge>
            </div>
          </div>
          <div className="p-3 bg-gray-800 rounded-xl">
            <p className="text-xs text-gray-500">Осталось дней</p>
            <p className="font-bold text-lg mt-0.5">{daysLeft !== null ? daysLeft : '—'}</p>
          </div>
          {user.subExpireAt && (
            <div className="p-3 bg-gray-800 rounded-xl col-span-2">
              <p className="text-xs text-gray-500">Истекает</p>
              <p className="font-medium mt-0.5">{formatDate(user.subExpireAt)}</p>
            </div>
          )}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <User className="w-4 h-4 text-brand-400" />
          Реферальный код
        </h2>
        <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl">
          <code className="flex-1 text-brand-300 font-mono font-bold tracking-widest">
            {user.referralCode}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}?ref=${user.referralCode}`)
              toast.success('Ссылка скопирована')
            }}
            className="text-xs px-3 py-1.5 bg-brand-600/20 hover:bg-brand-600/30
                       border border-brand-500/30 text-brand-400 rounded-lg transition-colors">
            Копировать
          </button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold text-red-400 text-sm">Удаление аккаунта</h2>
        <p className="text-gray-500 text-sm">
          Для удаления обратитесь в поддержку.
        </p>
        <a href="https://t.me/hideyou_support" target="_blank" rel="noopener"
           className="inline-flex text-sm text-gray-500 hover:text-white transition-colors">
          Написать в поддержку →
        </a>
      </Card>
    </div>
  )
}
