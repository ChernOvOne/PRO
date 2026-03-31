'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, MessageCircle, Calendar, Edit3, Save, X, Loader2,
         RefreshCw, AlertTriangle, Shield, Lock, Eye, EyeOff, KeyRound, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi, verificationApi } from '@/lib/api'
import type { User as UserType } from '@/types'

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser]       = useState<UserType | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [email, setEmail]     = useState('')
  const [saving, setSaving]   = useState(false)

  // Password change
  const [showPwChange, setShowPwChange] = useState(false)
  const [currentPw, setCurrentPw]       = useState('')
  const [newPw, setNewPw]               = useState('')
  const [newPw2, setNewPw2]             = useState('')
  const [showPw, setShowPw]             = useState(false)
  const [pwSaving, setPwSaving]         = useState(false)

  // Password reset (forgot)
  const [showPwReset, setShowPwReset]   = useState(false)
  const [resetEmail, setResetEmail]     = useState('')
  const [resetCode, setResetCode]       = useState('')
  const [resetNewPw, setResetNewPw]     = useState('')
  const [resetStep, setResetStep]       = useState<1 | 2>(1)
  const [resetSaving, setResetSaving]   = useState(false)

  // Revoke
  const [showRevoke, setShowRevoke] = useState(false)
  const [revoking, setRevoking]     = useState(false)
  const [newSubUrl, setNewSubUrl]   = useState<string | null>(null)

  useEffect(() => {
    authApi.me()
      .then(u => { setUser(u); setEmail(u.email || ''); setResetEmail(u.email || '') })
      .catch(() => {})
      .finally(() => setLoading(false))
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
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setUser(await res.json())
      setEditing(false)
      toast.success('Email обновлён')
    } catch (err: any) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const changePassword = async () => {
    if (newPw.length < 6) return toast.error('Пароль минимум 6 символов')
    if (newPw !== newPw2) return toast.error('Пароли не совпадают')
    setPwSaving(true)
    try {
      await authApi.changePassword(currentPw, newPw)
      toast.success('Пароль изменён')
      setShowPwChange(false)
      setCurrentPw(''); setNewPw(''); setNewPw2('')
    } catch (err: any) { toast.error(err.message) }
    finally { setPwSaving(false) }
  }

  const sendResetCode = async () => {
    if (!resetEmail) return toast.error('Введите email')
    setResetSaving(true)
    try {
      await verificationApi.sendCode(resetEmail, 'PASSWORD_RESET')
      toast.success('Код отправлен на почту')
      setResetStep(2)
    } catch (err: any) { toast.error(err.message) }
    finally { setResetSaving(false) }
  }

  const resetPassword = async () => {
    if (resetNewPw.length < 6) return toast.error('Пароль минимум 6 символов')
    setResetSaving(true)
    try {
      await authApi.resetPassword(resetEmail, resetCode, resetNewPw)
      toast.success('Пароль сброшен!')
      setShowPwReset(false)
      setResetStep(1); setResetCode(''); setResetNewPw('')
    } catch (err: any) { toast.error(err.message) }
    finally { setResetSaving(false) }
  }

  const handleRevoke = async () => {
    setRevoking(true)
    try {
      const res = await fetch('/api/user/revoke-subscription', { method: 'POST', credentials: 'include' })
      if (!res.ok) throw new Error()
      const d = await res.json()
      setNewSubUrl(d.newSubUrl)
      toast.success('Ссылка подписки обновлена')
    } catch { toast.error('Ошибка') }
    finally { setRevoking(false) }
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto space-y-6">
      {[1, 2, 3].map(i => <div key={i} className="h-32 skeleton rounded-2xl" />)}
    </div>
  )
  if (!user) return null

  const hasEmail = !!user.email
  const hasTelegram = !!user.telegramId

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Профиль</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Настройки аккаунта</p>
      </div>

      {/* ── User info ── */}
      <div className="glass-card space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold flex-shrink-0"
               style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', color: 'var(--accent-1)' }}>
            {(user.telegramName || user.email || 'U')[0].toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-lg">{user.telegramName || user.email?.split('@')[0] || 'Пользователь'}</p>
            {user.role === 'ADMIN' && <span className="badge-violet">Admin</span>}
          </div>
        </div>

        <div className="space-y-3 pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
          {hasTelegram && (
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
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                         placeholder="you@example.com" className="glass-input py-2 text-sm" autoFocus />
                  <button onClick={saveEmail} disabled={saving}
                          className="p-2 rounded-xl flex-shrink-0"
                          style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--accent-1)' }}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  </button>
                  <button onClick={() => { setEditing(false); setEmail(user.email || '') }}
                          className="p-2 rounded-xl flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className={hasEmail ? 'font-medium' : 'italic'} style={!hasEmail ? { color: 'var(--text-tertiary)' } : undefined}>
                    {user.email || 'Не указан'}
                  </p>
                  <button onClick={() => setEditing(true)} className="p-1" style={{ color: 'var(--text-tertiary)' }}>
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
        </div>
      </div>

      {/* ── Password ── */}
      <div className="glass-card space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Lock className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />
          Пароль
        </h2>

        {!showPwChange && !showPwReset ? (
          <div className="space-y-2">
            {hasEmail && (
              <button onClick={() => setShowPwChange(true)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all"
                      style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                <KeyRound className="w-4 h-4" /> Изменить пароль
              </button>
            )}
            {hasEmail && (
              <button onClick={() => { setShowPwReset(true); setResetStep(1) }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all"
                      style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-tertiary)' }}>
                <Mail className="w-4 h-4" /> Сбросить пароль через email
              </button>
            )}
            {!hasEmail && hasTelegram && (
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Вы вошли через Telegram. Добавьте email выше, чтобы установить пароль.
              </p>
            )}
          </div>
        ) : showPwChange ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Текущий пароль</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={currentPw}
                       onChange={e => setCurrentPw(e.target.value)} className="glass-input pr-10" />
                <button type="button" onClick={() => setShowPw(!showPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }}>
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Новый пароль</label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                     placeholder="Минимум 6 символов" className="glass-input" />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Повторите пароль</label>
              <input type="password" value={newPw2} onChange={e => setNewPw2(e.target.value)} className="glass-input" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setShowPwChange(false); setCurrentPw(''); setNewPw(''); setNewPw2('') }}
                      className="btn-secondary flex-1 justify-center text-sm">Отмена</button>
              <button onClick={changePassword} disabled={pwSaving}
                      className="btn-primary flex-1 justify-center text-sm">
                {pwSaving ? 'Сохраняю...' : 'Сохранить'}
              </button>
            </div>
          </div>
        ) : (
          /* Password reset via email */
          <div className="space-y-3">
            {resetStep === 1 ? (
              <>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  На вашу почту будет отправлен код для сброса пароля
                </p>
                <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                       placeholder="Email" className="glass-input" />
                <div className="flex gap-2">
                  <button onClick={() => setShowPwReset(false)}
                          className="btn-secondary flex-1 justify-center text-sm">Отмена</button>
                  <button onClick={sendResetCode} disabled={resetSaving}
                          className="btn-primary flex-1 justify-center text-sm">
                    {resetSaving ? 'Отправляю...' : 'Отправить код'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Введите код из письма и новый пароль
                </p>
                <input type="text" value={resetCode} onChange={e => setResetCode(e.target.value)}
                       placeholder="Код из письма (6 цифр)" className="glass-input text-center text-lg tracking-widest" maxLength={6} />
                <input type="password" value={resetNewPw} onChange={e => setResetNewPw(e.target.value)}
                       placeholder="Новый пароль (мин. 6 символов)" className="glass-input" />
                <div className="flex gap-2">
                  <button onClick={() => { setShowPwReset(false); setResetStep(1) }}
                          className="btn-secondary flex-1 justify-center text-sm">Отмена</button>
                  <button onClick={resetPassword} disabled={resetSaving}
                          className="btn-primary flex-1 justify-center text-sm">
                    {resetSaving ? 'Сохраняю...' : 'Сбросить пароль'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Revoke subscription ── */}
      <div className="glass-card space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <RefreshCw className="w-4 h-4" style={{ color: 'var(--warning)' }} />
          Сброс ссылки подписки
        </h2>
        <div className="p-3 rounded-xl text-xs leading-relaxed" style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.1)', color: 'var(--text-secondary)' }}>
          <p className="mb-2">Используйте если вы поделились ссылкой и хотите <strong style={{ color: 'var(--text-primary)' }}>отключить чужой доступ</strong>.</p>
          <ul className="list-disc pl-4 space-y-1" style={{ color: 'var(--text-tertiary)' }}>
            <li>Старая ссылка <strong style={{ color: 'var(--danger)' }}>перестанет работать</strong></li>
            <li>Нужно <strong style={{ color: 'var(--text-primary)' }}>заново настроить все устройства</strong></li>
          </ul>
        </div>

        {!showRevoke ? (
          <button onClick={() => setShowRevoke(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: 'var(--warning)' }}>
            <RefreshCw className="w-4 h-4" /> Сбросить ссылку
          </button>
        ) : newSubUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
              <Shield className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--success)' }} />
              <p className="text-sm" style={{ color: 'var(--success)' }}>Ссылка обновлена!</p>
            </div>
            <a href="/dashboard" className="btn-primary w-full justify-center text-sm">На главную</a>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--danger)' }} />
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Все устройства будут отключены. Вы уверены?</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowRevoke(false)} className="btn-secondary flex-1 justify-center text-sm">Отмена</button>
              <button onClick={handleRevoke} disabled={revoking}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium"
                      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)' }}>
                {revoking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {revoking ? 'Сбрасываю...' : 'Да, сбросить'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Logout ── */}
      <button
        onClick={async () => {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
          router.push('/')
        }}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium transition-all"
        style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
        <LogOut className="w-4 h-4" /> Выйти из аккаунта
      </button>

      {/* ── Delete account ── */}
      <div className="glass-card space-y-3">
        <h2 className="font-semibold text-sm" style={{ color: 'var(--danger)' }}>Удаление аккаунта</h2>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Для удаления обратитесь в поддержку.</p>
        <a href="https://t.me/hideyou_support" target="_blank" rel="noopener"
           className="inline-flex text-sm hover:opacity-80" style={{ color: 'var(--text-tertiary)' }}>
          Написать в поддержку →
        </a>
      </div>
    </div>
  )
}
