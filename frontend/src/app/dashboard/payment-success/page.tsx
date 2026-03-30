'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, ArrowRight, Shield, XCircle, Gift, Copy } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'

function PaymentSuccessContent() {
  const params  = useSearchParams()
  const router  = useRouter()
  const orderId = params.get('orderId')
  const [status, setStatus] = useState<'loading' | 'success' | 'pending' | 'error'>('loading')
  const [retries, setRetries] = useState(0)
  const [giftUrl, setGiftUrl] = useState<string | null>(null)
  const [giftCopied, setGiftCopied] = useState(false)

  useEffect(() => {
    if (!orderId) { setStatus('error'); return }

    const check = async () => {
      try {
        const res = await fetch(`/api/payments/verify/${orderId}`, {
          method: 'POST', credentials: 'include',
        })
        const data = await res.json()

        if (data.confirmed || data.status === 'PAID') {
          setStatus('success')
          // Check if this was a gift payment
          try {
            const giftsRes = await fetch('/api/gifts/my', { credentials: 'include' })
            const gifts = await giftsRes.json()
            if (Array.isArray(gifts) && gifts.length > 0) {
              const latest = gifts[0] // sorted by createdAt desc
              if (latest.status === 'PENDING') {
                setGiftUrl(`${window.location.origin}/present/${latest.giftCode}`)
              }
            }
          } catch {}
        } else if (data.status === 'FAILED' || data.status === 'EXPIRED') {
          setStatus('error')
        } else if (retries < 20) {
          // Poll every 3 seconds, max 20 times (60s total)
          setTimeout(() => setRetries(r => r + 1), 3000)
        } else {
          setStatus('pending')
        }
      } catch {
        if (retries < 20) {
          setTimeout(() => setRetries(r => r + 1), 3000)
        } else {
          setStatus('pending')
        }
      }
    }
    check()
  }, [orderId, retries])

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--surface-0)' }}>
      <div className="aurora-bg" aria-hidden />

      <div className="relative w-full max-w-md animate-fade-in">
        <div className="glass-card text-center space-y-6 p-10">
          {status === 'loading' && (
            <>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                   style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)' }}>
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-1)' }} />
              </div>
              <div>
                <h1 className="text-xl font-bold">Проверяем платёж</h1>
                <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Подождите, проверяем оплату...
                </p>
                {/* Progress indicator */}
                <div className="mt-4 w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg)' }}>
                  <div className="h-full rounded-full transition-all duration-1000"
                       style={{
                         width: `${Math.min(95, (retries / 20) * 100)}%`,
                         background: 'var(--accent-gradient)',
                       }} />
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                  Попытка {retries + 1} из 20
                </p>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              {giftUrl ? (
                <>
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                       style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
                    <Gift className="w-8 h-8" style={{ color: '#34d399' }} />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold">Подарок создан!</h1>
                    <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Отправьте эту ссылку другу — при переходе подписка активируется автоматически
                    </p>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-xl"
                       style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                    <p className="flex-1 text-xs font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>{giftUrl}</p>
                    <button onClick={() => {
                      navigator.clipboard.writeText(giftUrl)
                      setGiftCopied(true)
                      toast.success('Ссылка скопирована!')
                      setTimeout(() => setGiftCopied(false), 2500)
                    }} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
                      {giftCopied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />}
                    </button>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Отправьте эту ссылку другу</p>
                  <Link href="/dashboard" className="btn-primary w-full justify-center">
                    В личный кабинет <ArrowRight className="w-4 h-4" />
                  </Link>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30
                                  flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold">Оплата прошла!</h1>
                    <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Подписка активирована. QR-код и ссылка доступны в личном кабинете.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <Link href="/dashboard" className="btn-primary w-full justify-center">
                      Перейти к подписке <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link href="/dashboard/instructions" className="btn-secondary w-full justify-center">
                      Инструкции по подключению
                    </Link>
                  </div>
                </>
              )}
            </>
          )}

          {status === 'pending' && (
            <>
              <div className="w-16 h-16 rounded-2xl bg-yellow-500/15 border border-yellow-500/30
                              flex items-center justify-center mx-auto">
                <Shield className="w-8 h-8 text-yellow-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Платёж обрабатывается</h1>
                <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Платёж получен и обрабатывается. Подписка активируется автоматически.
                  Вы получите уведомление в Telegram.
                </p>
              </div>
              <Link href="/dashboard" className="btn-primary w-full justify-center">
                В личный кабинет
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/30
                              flex items-center justify-center mx-auto">
                <XCircle className="w-8 h-8 text-red-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Платёж не прошёл</h1>
                <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Оплата была отменена или отклонена. Попробуйте снова или обратитесь в поддержку.
                </p>
              </div>
              <div className="space-y-3">
                <Link href="/dashboard/plans" className="btn-primary w-full justify-center">
                  Попробовать снова
                </Link>
                <a href="https://t.me/hideyou_support" target="_blank" rel="noopener"
                   className="btn-secondary w-full justify-center">
                  Написать в поддержку
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return <Suspense><PaymentSuccessContent /></Suspense>
}
