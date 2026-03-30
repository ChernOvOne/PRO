'use client'

import { useEffect, useState } from 'react'
import { User, Mail, MessageCircle, Shield, Calendar,
         Edit3, Save, X, Loader2, Wallet, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi, userApi } from '@/lib/api'
import type { User as UserType, BalanceTransaction } from '@/types'

export default function ProfilePage() {
  const [user,    setUser]    = useState<UserType | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [email,   setEmail]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [balanceData, setBalanceData] = useState<{ balance: number; history: BalanceTransaction[] } | null>(null)

  useEffect(() => {
    authApi.me()
      .then(u => { setUser(u); setEmail(u.email || ''); setLoading(false) })
      .catch(() => setLoading(false))
    userApi.balance()
      .then(setBalanceData)
      .catch(() => {})
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

  const daysUntil = (date: string | null | undefined): number | null => {
    if (!date) return null
    const diff = new Date(date).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto space-y-6">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-32 rounded-2xl animate-pulse" style={{ background: 'var(--surface-2)' }} />
      ))}
    </div>
  )

  if (!user) return null

  const daysLeft = daysUntil(user.subExpireAt)

  const statusBadgeClass = (s: string): string => {
    if (s === 'ACTIVE')  return 'badge-green'
    if (s === 'EXPIRED') return 'badge-red'
    if (s === 'TRIAL')   return 'badge-blue'
    return 'badge-gray'
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Профиль</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Настройки аккаунта</p>
      </div>

      <div className="glass-card space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0"
               style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', color: 'var(--accent-1)' }}>
            {(user.telegramName || user.email || 'U')[0].toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-lg">
              {user.telegramName || user.email?.split('@')[0] || 'Пользователь'}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={statusBadgeClass(user.subStatus)}>
                {user.subStatus === 'ACTIVE' ? 'Подписка активна' : 'Нет подписки'}
              </span>
              {user.role === 'ADMIN' && <span className="badge-purple">Admin</span>}
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
          {user.telegramId && (
            <div className="flex items-center gap-3 py-2">
              <MessageCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              <div className="flex-1">
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Telegram</p>
                <p className="font-medium">@{user.telegramName || user.telegramId}</p>
              </div>
              <span className="badge-green">Привязан</span>
            </div>
          )}

          <div className="flex items-start gap-3 py-2">
            <Mail className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--text-tertiary)' }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Email</p>
              {editing ? (
                <div className="flex gap-2">
                  <input type="email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" className="glass-input py-2 text-sm" autoFocus />
                  <button onClick={saveEmail} disabled={saving}
                    className="p-2 rounded-xl transition-colors flex-shrink-0"
                    style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', color: 'var(--accent-1)' }}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  </button>
                  <button onClick={() => { setEditing(false); setEmail(user.email || '') }}
                    className="p-2 rounded-xl transition-colors flex-shrink-0 hover:opacity-80"
                    style={{ color: 'var(--text-tertiary)' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className={user.email ? 'font-medium' : 'italic'} style={!user.email ? { color: 'var(--text-tertiary)' } : undefined}>
                    {user.email || 'Не указан'}
                  </p>
                  <button onClick={() => setEditing(true)}
                    className="p-1 transition-colors hover:opacity-80" style={{ color: 'var(--text-tertiary)' }}>
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 py-2">
            <Calendar className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            <div>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Дата регистрации</p>
              <p className="font-medium">{new Date(user.createdAt).toLocaleDateString('ru')}</p>
            </div>
          </div>

          {user.lastLoginAt && (
            <div className="flex items-center gap-3 py-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
              <Shield className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Последний вход</p>
                <p className="font-medium">{new Date(user.lastLoginAt).toLocaleDateString('ru')}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="glass-card space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Shield className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />
          Подписка
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl" style={{ background: 'var(--surface-2)' }}>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Статус</p>
            <div className="mt-1">
              <span className={statusBadgeClass(user.subStatus)}>{user.subStatus}</span>
            </div>
          </div>
          <div className="p-3 rounded-xl" style={{ background: 'var(--surface-2)' }}>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Осталось дней</p>
            <p className="font-bold text-lg mt-0.5">{daysLeft !== null ? daysLeft : '—'}</p>
          </div>
          {user.subExpireAt && (
            <div className="p-3 rounded-xl col-span-2" style={{ background: 'var(--surface-2)' }}>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Истекает</p>
              <p className="font-medium mt-0.5">{new Date(user.subExpireAt).toLocaleDateString('ru')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Balance */}
      <div className="glass-card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Wallet className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />
            Баланс
          </h2>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold">
            {(balanceData?.balance ?? 0).toFixed(2)}
          </span>
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>₽</span>
        </div>

        {balanceData && balanceData.history.length > 0 && (
          <div className="pt-3 space-y-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Последние операции
            </p>
            {balanceData.history.slice(0, 10).map(tx => (
              <div key={tx.id} className="flex items-center gap-3 py-1.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                     style={{
                       background: tx.amount >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                       color: tx.amount >= 0 ? '#34d399' : '#f87171',
                     }}>
                  {tx.amount >= 0
                    ? <ArrowDownLeft className="w-3.5 h-3.5" />
                    : <ArrowUpRight className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">
                    {tx.description || txTypeLabel(tx.type)}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                    {new Date(tx.createdAt).toLocaleString('ru')}
                  </p>
                </div>
                <span className="text-sm font-semibold flex-shrink-0"
                      style={{ color: tx.amount >= 0 ? '#34d399' : '#f87171' }}>
                  {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)} ₽
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <User className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />
          Реферальный код
        </h2>
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--surface-2)' }}>
          <code className="flex-1 font-mono font-bold tracking-widest" style={{ color: 'var(--accent-1)' }}>
            {user.referralCode}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}?ref=${user.referralCode}`)
              toast.success('Ссылка скопирована')
            }}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', color: 'var(--accent-1)' }}>
            Копировать
          </button>
        </div>
      </div>

      <div className="glass-card space-y-3">
        <h2 className="font-semibold text-red-400 text-sm">Удаление аккаунта</h2>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Для удаления обратитесь в поддержку.
        </p>
        <a href="https://t.me/hideyou_support" target="_blank" rel="noopener"
           className="inline-flex text-sm transition-colors hover:opacity-80" style={{ color: 'var(--text-tertiary)' }}>
          Написать в поддержку →
        </a>
      </div>
    </div>
  )
}

function txTypeLabel(type: string): string {
  const map: Record<string, string> = {
    TOPUP: 'Пополнение',
    REFERRAL_REWARD: 'Реферальный бонус',
    PURCHASE: 'Покупка',
    GIFT: 'Подарок',
    REFUND: 'Возврат',
  }
  return map[type] || type
}
