'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, ArrowRight, Shield, XCircle } from 'lucide-react'
import Link from 'next/link'

function PaymentSuccessContent() {
  const params  = useSearchParams()
  const router  = useRouter()
  const orderId = params.get('orderId')
  const [status, setStatus] = useState<'loading' | 'success' | 'pending' | 'error'>('loading')
  const [retries, setRetries] = useState(0)

  useEffect(() => {
    if (!orderId) { setStatus('error'); return }

    const check = async () => {
      try {
        // Try to verify the payment with provider
        const res = await fetch(`/api/payments/verify/${orderId}`, {
          method: 'POST', credentials: 'include',
        })
        const data = await res.json()

        if (data.confirmed) {
          setStatus('success')
        } else if (retries < 6) {
          // Poll every 3 seconds, max 6 times (18s total)
          setTimeout(() => setRetries(r => r + 1), 3000)
        } else {
          setStatus('pending')
        }
      } catch {
        setStatus('pending')
      }
    }
    check()
  }, [orderId, retries])

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[300px]
                        bg-brand-600/15 rounded-full blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        <div className="card text-center space-y-6 p-10">
          {status === 'loading' && (
            <>
              <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto">
                <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Проверяем платёж</h1>
                <p className="text-gray-400 mt-2 text-sm">Подождите несколько секунд...</p>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30
                              flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Оплата прошла!</h1>
                <p className="text-gray-400 mt-2 text-sm">
                  Подписка активирована. QR-код и ссылка доступны в личном кабинете.
                </p>
              </div>
              <div className="space-y-3">
                <Link href="/dashboard/subscription" className="btn-primary w-full justify-center">
                  Перейти к подписке <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/dashboard/instructions" className="btn-secondary w-full justify-center">
                  Инструкции по подключению
                </Link>
              </div>
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
                <p className="text-gray-400 mt-2 text-sm">
                  Платёж получен и обрабатывается. Подписка активируется в течение нескольких минут.
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
                <h1 className="text-xl font-bold">Что-то пошло не так</h1>
                <p className="text-gray-400 mt-2 text-sm">
                  Не удалось найти заказ. Если вы оплатили — обратитесь в поддержку.
                </p>
              </div>
              <div className="space-y-3">
                <Link href="/dashboard/plans" className="btn-primary w-full justify-center">
                  Попробовать снова
                </Link>
                <a href="https://t.me/hideyouvpn_support" target="_blank" rel="noopener"
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
