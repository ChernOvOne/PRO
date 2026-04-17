'use client'

import { useEffect, useRef, useState, Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Shield, Mail, Eye, EyeOff, Loader2, ArrowLeft, KeyRound, UserPlus, Hash } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { authApi, verificationApi } from '@/lib/api'

declare global {
  interface Window { onTelegramAuth?: (user: any) => void }
}

type Tab = 'telegram' | 'email' | 'register'

function LoginContent() {
  const router  = useRouter()
  const params  = useSearchParams()
  const refCode = params.get('ref')
  const tgRef   = useRef<HTMLDivElement>(null)

  const [tab, setTab] = useState<Tab>('telegram')

  // ── shared state ──
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw]   = useState(false)

  // ── login state ──
  const [loginEmail, setLoginEmail]       = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [resetMode, setResetMode]         = useState(false)
  const [resetStep, setResetStep]         = useState<'email' | 'code' | 'done'>('email')
  const [resetEmail, setResetEmail]       = useState('')
  const [resetCode, setResetCode]         = useState('')
  const [resetNewPw, setResetNewPw]       = useState('')
  const [resetCooldown, setResetCooldown] = useState(0)

  // ── register state ──
  const [regEmail, setRegEmail]           = useState('')
  const [regCode, setRegCode]             = useState('')
  const [regPassword, setRegPassword]     = useState('')
  const [regReferral, setRegReferral]     = useState('')
  const [regStep, setRegStep]             = useState<'email' | 'form'>('email')
  const [regCooldown, setRegCooldown]     = useState(0)

  // ── telegram bot name ──
  const botName = process.env.NEXT_PUBLIC_TG_BOT_NAME || ''

  // persist referral code
  useEffect(() => {
    if (refCode) {
      sessionStorage.setItem('ref_code', refCode)
      setRegReferral(refCode)
    }
  }, [refCode])

  // persist UTM source
  useEffect(() => {
    const utm = params.get('utm') || params.get('utm_source')
    if (utm) sessionStorage.setItem('utm_source', utm)
  }, [params])

  // ── cooldown timers ──
  useEffect(() => {
    if (regCooldown <= 0) return
    const t = setTimeout(() => setRegCooldown(v => v - 1), 1000)
    return () => clearTimeout(t)
  }, [regCooldown])

  useEffect(() => {
    if (resetCooldown <= 0) return
    const t = setTimeout(() => setResetCooldown(v => v - 1), 1000)
    return () => clearTimeout(t)
  }, [resetCooldown])

  // ── redirect helper ──
  const redirectAfterAuth = useCallback(async (user?: { role?: string }) => {
    const ref = sessionStorage.getItem('ref_code')
    if (ref) {
      fetch('/api/user/apply-referral', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: ref }),
      }).catch(() => {})
      sessionStorage.removeItem('ref_code')
    }

    // Auto-claim gift if redirected from a gift link
    const giftCode = params.get('gift')
    if (giftCode) {
      try {
        const res = await fetch(`/api/gifts/claim/${giftCode}`, { method: 'POST', credentials: 'include' })
        const d = await res.json()
        if (d?.ok) {
          toast.success('Подарок активирован!')
          window.location.href = '/dashboard'
          return
        }
      } catch {}
    }

    toast.success('Добро пожаловать!')
    const target = user?.role === 'ADMIN' ? '/admin' : '/dashboard'
    window.location.href = target
  }, [params])

  // ── Telegram MiniApp auto-login ──
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp
    if (tg?.initData) {
      setLoading(true)
      fetch('/api/auth/telegram-mini-app', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData }),
      })
        .then(r => { if (r.ok) return r.json(); throw new Error() })
        .then(d => { tg.expand?.(); redirectAfterAuth(d.user) })
        .catch(() => setLoading(false))
    }
  }, [redirectAfterAuth])

  // ── Telegram widget ──
  useEffect(() => {
    if (tab !== 'telegram' || !tgRef.current) return

    window.onTelegramAuth = async (tgUser: any) => {
      setLoading(true)
      try {
        const data = await authApi.telegram(tgUser)
        redirectAfterAuth(data.user)
      } catch (err: any) {
        toast.error(err.message)
        setLoading(false)
      }
    }

    if (!botName) return

    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login', botName)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '12')
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')
    script.setAttribute('data-request-access', 'write')
    script.setAttribute('data-auth-url', window.location.origin + '/login')
    script.async = true
    tgRef.current.innerHTML = ''
    tgRef.current.appendChild(script)

    return () => { window.onTelegramAuth = undefined }
  }, [tab, botName, redirectAfterAuth])

  // ── Email Login ──
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const utmSrc = params.get('utm') || sessionStorage.getItem('utm_source') || undefined
      const data = await authApi.login(loginEmail, loginPassword, utmSrc)
      redirectAfterAuth(data.user)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Password Reset ──
  const handleResetSendCode = async () => {
    if (!resetEmail) { toast.error('Введите email'); return }
    setLoading(true)
    try {
      const data = await verificationApi.sendCode(resetEmail, 'PASSWORD_RESET')
      toast.success('Код отправлен на почту')
      setResetStep('code')
      setResetCooldown(Math.ceil((data.expiresIn || 120000) / 1000 / 2))
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (resetCode.length !== 6) { toast.error('Код должен быть из 6 цифр'); return }
    if (resetNewPw.length < 6) { toast.error('Пароль не менее 6 символов'); return }
    setLoading(true)
    try {
      await authApi.resetPassword(resetEmail, resetCode, resetNewPw)
      toast.success('Пароль изменён — войдите с новым паролем')
      setResetMode(false)
      setResetStep('email')
      setResetEmail('')
      setResetCode('')
      setResetNewPw('')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Registration ──
  const handleRegSendCode = async () => {
    if (!regEmail) { toast.error('Введите email'); return }
    setLoading(true)
    try {
      const data = await verificationApi.sendCode(regEmail, 'REGISTRATION')
      toast.success('Код отправлен на почту')
      setRegStep('form')
      setRegCooldown(Math.ceil((data.expiresIn || 120000) / 1000 / 2))
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (regCode.length !== 6) { toast.error('Код должен быть из 6 цифр'); return }
    if (regPassword.length < 6) { toast.error('Пароль не менее 6 символов'); return }
    setLoading(true)
    try {
      // Read UTM from URL or sessionStorage
      const utmSource = params.get('utm') || sessionStorage.getItem('utm_source') || undefined
      const data = await authApi.register({
        email: regEmail,
        password: regPassword,
        code: regCode,
        ...(regReferral ? { referralCode: regReferral } : {}),
        ...(utmSource ? { utmSource } : {}),
      })
      redirectAfterAuth(data.user)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Tab labels ──
  const tabLabels: Record<Tab, string> = {
    telegram: 'Telegram',
    email: 'Вход',
    register: 'Регистрация',
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
         style={{ background: 'var(--surface-1)' }}>
      {/* Aurora */}
      <div className="aurora-bg" />

      <div className="relative w-full max-w-md space-y-8 animate-slide-up z-10">
        {/* Logo */}
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
               style={{ background: 'var(--accent-gradient)', boxShadow: '0 8px 32px rgba(6,182,212,0.3)' }}>
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Войти в <span className="text-gradient">HIDEYOU</span>
            </h1>
            <p className="mt-1" style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Безопасный VPN — всегда под рукой
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="glass-card gradient-border space-y-6">
          {/* Tabs */}
          <div className="flex rounded-xl p-1 gap-1" style={{ background: 'rgba(255,255,255,0.03)' }}>
            {(['telegram', 'email', 'register'] as Tab[]).map(t => (
              <button key={t} onClick={() => { setTab(t); setResetMode(false) }}
                      className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
                      style={{
                        background: tab === t ? 'rgba(255,255,255,0.06)' : 'transparent',
                        color: tab === t ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        ...(tab === t ? { boxShadow: '0 2px 8px rgba(0,0,0,0.2)' } : {}),
                      }}>
                {tabLabels[t]}
              </button>
            ))}
          </div>

          {/* ────────── Telegram tab ────────── */}
          {tab === 'telegram' && (
            <div className="space-y-4">
              <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
                Войди через Telegram — подписка из бота привяжется автоматически
              </p>

              {!botName ? (
                <div className="text-center py-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    Telegram-авторизация временно недоступна.
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    Используйте вход по Email или зарегистрируйтесь.
                  </p>
                </div>
              ) : (
                <div ref={tgRef} className="flex justify-center min-h-[52px] items-center">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
                </div>
              )}

              {loading && (
                <div className="flex items-center justify-center gap-2 text-sm"
                     style={{ color: 'var(--text-secondary)' }}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Авторизация...
                </div>
              )}
            </div>
          )}

          {/* ────────── Email login tab ────────── */}
          {tab === 'email' && !resetMode && (
            <div className="space-y-4">
              <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
                Войди по email, если есть аккаунт
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                        style={{ color: 'var(--text-tertiary)' }} />
                  <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                         placeholder="you@example.com" required className="glass-input pl-10" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Пароль</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={loginPassword}
                         onChange={e => setLoginPassword(e.target.value)}
                         placeholder="••••••••" required className="glass-input pr-10" />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                          style={{ color: 'var(--text-tertiary)' }}>
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button onClick={handleEmailLogin} disabled={loading}
                      className="btn-primary w-full justify-center py-3">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Вход...</> : 'Войти'}
              </button>

              <button onClick={() => { setResetMode(true); setResetStep('email'); setResetEmail(loginEmail) }}
                      className="w-full text-center text-sm transition-colors"
                      style={{ color: 'var(--text-tertiary)' }}>
                Забыли пароль?
              </button>

              <Link href="/recover"
                    className="block w-full text-center text-xs transition-colors px-3 py-2 rounded-lg"
                    style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                🆘 Не могу войти — потерял Telegram
              </Link>
            </div>
          )}

          {/* ────────── Password reset (inline) ────────── */}
          {tab === 'email' && resetMode && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setResetMode(false)}
                        className="transition-colors" style={{ color: 'var(--text-tertiary)' }}>
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Восстановление пароля
                </p>
              </div>

              {resetStep === 'email' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                            style={{ color: 'var(--text-tertiary)' }} />
                      <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                             placeholder="you@example.com" className="glass-input pl-10" />
                    </div>
                  </div>
                  <button onClick={handleResetSendCode} disabled={loading}
                          className="btn-primary w-full justify-center py-3">
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Отправка...</> : 'Получить код'}
                  </button>
                </>
              )}

              {resetStep === 'code' && (
                <>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Код отправлен на <span style={{ color: 'var(--text-primary)' }}>{resetEmail}</span>
                  </p>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Код из письма</label>
                    <div className="relative">
                      <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                            style={{ color: 'var(--text-tertiary)' }} />
                      <input type="text" inputMode="numeric" maxLength={6}
                             value={resetCode} onChange={e => setResetCode(e.target.value.replace(/\D/g, ''))}
                             placeholder="000000" className="glass-input pl-10" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Новый пароль</label>
                    <div className="relative">
                      <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                                style={{ color: 'var(--text-tertiary)' }} />
                      <input type={showPw ? 'text' : 'password'} value={resetNewPw}
                             onChange={e => setResetNewPw(e.target.value)}
                             placeholder="Минимум 6 символов" className="glass-input pl-10 pr-10" />
                      <button type="button" onClick={() => setShowPw(v => !v)}
                              className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                              style={{ color: 'var(--text-tertiary)' }}>
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button onClick={handleResetPassword} disabled={loading}
                          className="btn-primary w-full justify-center py-3">
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Сохранение...</> : 'Сменить пароль'}
                  </button>

                  <button onClick={handleResetSendCode}
                          disabled={resetCooldown > 0 || loading}
                          className="w-full text-center text-sm transition-colors"
                          style={{ color: resetCooldown > 0 ? 'var(--text-tertiary)' : 'var(--accent)' }}>
                    {resetCooldown > 0 ? `Отправить повторно (${resetCooldown}с)` : 'Отправить код повторно'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* ────────── Registration tab ────────── */}
          {tab === 'register' && regStep === 'email' && (
            <div className="space-y-4">
              <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
                Создайте аккаунт — введите email для получения кода
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                        style={{ color: 'var(--text-tertiary)' }} />
                  <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)}
                         placeholder="you@example.com" className="glass-input pl-10" />
                </div>
              </div>

              <button onClick={handleRegSendCode} disabled={loading}
                      className="btn-primary w-full justify-center py-3">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Отправка...</> : 'Получить код'}
              </button>
            </div>
          )}

          {tab === 'register' && regStep === 'form' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Код отправлен на <span style={{ color: 'var(--text-primary)' }}>{regEmail}</span>
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Код из письма</label>
                <div className="relative">
                  <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                        style={{ color: 'var(--text-tertiary)' }} />
                  <input type="text" inputMode="numeric" maxLength={6}
                         value={regCode} onChange={e => setRegCode(e.target.value.replace(/\D/g, ''))}
                         placeholder="000000" className="glass-input pl-10" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Пароль</label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                            style={{ color: 'var(--text-tertiary)' }} />
                  <input type={showPw ? 'text' : 'password'} value={regPassword}
                         onChange={e => setRegPassword(e.target.value)}
                         placeholder="Минимум 6 символов" className="glass-input pl-10 pr-10" />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                          style={{ color: 'var(--text-tertiary)' }}>
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                  Реферальный код <span style={{ color: 'var(--text-tertiary)' }}>(необязательно)</span>
                </label>
                <div className="relative">
                  <UserPlus className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                            style={{ color: 'var(--text-tertiary)' }} />
                  <input type="text" value={regReferral} onChange={e => setRegReferral(e.target.value)}
                         placeholder="ABC123" className="glass-input pl-10" />
                </div>
              </div>

              <button type="submit" disabled={loading}
                      className="btn-primary w-full justify-center py-3">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Регистрация...</> : 'Зарегистрироваться'}
              </button>

              <button type="button" onClick={handleRegSendCode}
                      disabled={regCooldown > 0 || loading}
                      className="w-full text-center text-sm transition-colors"
                      style={{ color: regCooldown > 0 ? 'var(--text-tertiary)' : 'var(--accent)' }}>
                {regCooldown > 0 ? `Отправить повторно (${regCooldown}с)` : 'Отправить код повторно'}
              </button>
            </form>
          )}
        </div>

        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm transition-colors"
                style={{ color: 'var(--text-tertiary)' }}>
            <ArrowLeft className="w-3.5 h-3.5" />
            На главную
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return <Suspense><LoginContent /></Suspense>
}
