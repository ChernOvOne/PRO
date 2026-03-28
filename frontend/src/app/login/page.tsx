'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Shield, Mail, Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'

declare global {
  interface Window { onTelegramAuth?: (user: any) => void }
}

function LoginContent() {
  const router  = useRouter()
  const params  = useSearchParams()
  const refCode = params.get('ref')
  const tgRef   = useRef<HTMLDivElement>(null)

  const [tab,      setTab]      = useState<'telegram' | 'email'>('telegram')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [show,     setShow]     = useState(false)
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    if (refCode) sessionStorage.setItem('ref_code', refCode)
  }, [refCode])

  useEffect(() => {
    if (tab !== 'telegram' || !tgRef.current) return

    window.onTelegramAuth = async (tgUser: any) => {
      setLoading(true)
      try {
        const res = await fetch('/api/auth/telegram', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tgUser),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Ошибка авторизации')

        const ref = sessionStorage.getItem('ref_code')
        if (ref) {
          await fetch('/api/user/apply-referral', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: ref }),
          }).catch(() => {})
          sessionStorage.removeItem('ref_code')
        }

        toast.success('Добро пожаловать!')
        const target = data.user?.role === 'ADMIN' ? '/admin' : '/dashboard'
        window.location.href = target
      } catch (err: any) {
        toast.error(err.message)
        setLoading(false)
      }
    }

    const botName = process.env.NEXT_PUBLIC_TG_BOT_NAME
    if (!botName) { console.warn('NEXT_PUBLIC_TG_BOT_NAME не задан'); return }
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
  }, [tab, router])

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Неверный email или пароль')
      toast.success('Добро пожаловать!')
      const target = data.user?.role === 'ADMIN' ? '/admin' : '/dashboard'
      window.location.href = target
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
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
            {(['telegram', 'email'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                      className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
                      style={{
                        background: tab === t ? 'rgba(255,255,255,0.06)' : 'transparent',
                        color: tab === t ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        ...(tab === t ? { boxShadow: '0 2px 8px rgba(0,0,0,0.2)' } : {}),
                      }}>
                {t === 'telegram' ? 'Telegram' : 'Email'}
              </button>
            ))}
          </div>

          {/* Telegram tab */}
          {tab === 'telegram' && (
            <div className="space-y-4">
              <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
                Войди через Telegram — подписка из бота привяжется автоматически
              </p>
              <div ref={tgRef} className="flex justify-center min-h-[52px] items-center">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
              </div>
              {loading && (
                <div className="flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Авторизация...
                </div>
              )}
            </div>
          )}

          {/* Email tab */}
          {tab === 'email' && (
            <div className="space-y-4">
              <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
                Войди по email, если есть аккаунт
              </p>
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                        style={{ color: 'var(--text-tertiary)' }} />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                         placeholder="you@example.com" required className="glass-input pl-10" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Пароль</label>
                <div className="relative">
                  <input type={show ? 'text' : 'password'} value={password}
                         onChange={e => setPassword(e.target.value)}
                         placeholder="••••••••" required className="glass-input pr-10" />
                  <button type="button" onClick={() => setShow(v => !v)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                          style={{ color: 'var(--text-tertiary)' }}>
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button onClick={handleEmailLogin} disabled={loading} className="btn-primary w-full justify-center py-3">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Вход...</> : 'Войти'}
              </button>
            </div>
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
