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

  const [tab,     setTab]     = useState<'telegram' | 'email'>('telegram')
  const [email,   setEmail]   = useState('')
  const [password,setPassword]= useState('')
  const [show,    setShow]    = useState(false)
  const [loading, setLoading] = useState(false)

  // Store referral code
  useEffect(() => {
    if (refCode) sessionStorage.setItem('ref_code', refCode)
  }, [refCode])

  // Telegram Login Widget
  useEffect(() => {
    if (tab !== 'telegram' || !tgRef.current) return

    window.onTelegramAuth = async (tgUser: any) => {
      setLoading(true)
      try {
        const res = await fetch('/api/auth/telegram', {
          method:      'POST',
          credentials: 'include',
          headers:     { 'Content-Type': 'application/json' },
          body:        JSON.stringify(tgUser),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Ошибка авторизации')

        // Apply referral if exists
        const ref = sessionStorage.getItem('ref_code')
        if (ref) {
          await fetch('/api/user/apply-referral', {
            method:      'POST',
            credentials: 'include',
            headers:     { 'Content-Type': 'application/json' },
            body:        JSON.stringify({ code: ref }),
          }).catch(() => {})
          sessionStorage.removeItem('ref_code')
        }

        toast.success('Добро пожаловать!')
        // Редиректим в зависимости от роли
        const target = data.user?.role === 'ADMIN' ? '/admin' : '/dashboard'
        router.push(target)
      } catch (err: any) {
        toast.error(err.message)
        setLoading(false)
      }
    }

    // Inject Telegram widget script
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login', process.env.NEXT_PUBLIC_TG_BOT_NAME || 'HideYouBot')
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '12')
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')
    script.setAttribute('data-request-access', 'write')
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
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Неверный email или пароль')
      toast.success('Добро пожаловать!')
      // Редиректим в зависимости от роли
      const target = data.user?.role === 'ADMIN' ? '/admin' : '/dashboard'
      router.push(target)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px]
                        bg-brand-600/15 rounded-full blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md space-y-8 animate-fade-in">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Войти в HIDEYOU</h1>
          <p className="text-gray-400 text-sm">Управляй своей VPN-подпиской</p>
        </div>

        {/* Card */}
        <div className="card space-y-6">
          {/* Tabs */}
          <div className="flex rounded-xl bg-gray-800 p-1 gap-1">
            {(['telegram', 'email'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all
                            ${tab === t
                              ? 'bg-gray-700 text-white shadow-sm'
                              : 'text-gray-500 hover:text-gray-300'}`}>
                {t === 'telegram' ? 'Telegram' : 'Email'}
              </button>
            ))}
          </div>

          {/* Telegram */}
          {tab === 'telegram' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400 text-center">
                Войди через Telegram — если у тебя была подписка через бот,
                она привяжется автоматически
              </p>
              <div ref={tgRef} className="flex justify-center min-h-[52px] items-center">
                <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
              </div>
              {loading && (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Авторизация...
                </div>
              )}
            </div>
          )}

          {/* Email */}
          {tab === 'email' && (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <p className="text-sm text-gray-400 text-center">
                Если у тебя есть email в нашей системе — войди по нему
              </p>
              <div className="space-y-1">
                <label className="text-sm text-gray-400">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="input pl-10"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-400">Пароль</label>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="input pr-10"
                  />
                  <button type="button" onClick={() => setShow(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2
                                     text-gray-500 hover:text-gray-300">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Вход...</>
                  : 'Войти'}
              </button>
            </form>
          )}
        </div>

        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500
                                     hover:text-gray-300 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            На главную
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
