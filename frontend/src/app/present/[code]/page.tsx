'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Gift, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import Link from 'next/link'

interface GiftInfo {
  status: string
  tariffName: string
  message?: string
  senderName?: string
  expiresAt?: string
}

export default function PresentPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'checking' | 'success' | 'error' | 'login'>('loading')
  const [giftInfo, setGiftInfo] = useState<GiftInfo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!code) return

    fetch(`/api/gifts/status/${code}`)
      .then(r => r.json())
      .then(info => {
        if (info.error || info.status !== 'PENDING') {
          setError(info.status === 'CLAIMED' ? 'Подарок уже активирован' : info.error || 'Подарок недоступен')
          setStatus('error')
          return
        }
        setGiftInfo(info)
        setStatus('checking')

        return fetch(`/api/gifts/claim/${code}`, { method: 'POST', credentials: 'include' })
          .then(r => {
            if (r.status === 401) {
              setStatus('login')
              return null
            }
            return r.json()
          })
          .then(d => {
            if (!d) return
            if (d?.ok) {
              setStatus('success')
            } else {
              setError(d?.error || 'Ошибка активации')
              setStatus('error')
            }
          })
      })
      .catch(() => {
        setError('Подарок не найден')
        setStatus('error')
      })
  }, [code])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
         style={{ background: 'var(--surface-1)' }}>
      <div className="aurora-bg" />

      <div className="relative w-full max-w-md z-10 animate-slide-up">
        {/* Loading */}
        {(status === 'loading' || status === 'checking') && (
          <div className="glass-card gradient-border text-center space-y-6 py-12">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                 style={{ background: 'rgba(6,182,212,0.1)' }}>
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-1)' }} />
            </div>
            <div>
              <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {status === 'loading' ? 'Загрузка подарка...' : 'Активация...'}
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Подождите, пожалуйста
              </p>
            </div>
          </div>
        )}

        {/* Success */}
        {status === 'success' && (
          <div className="glass-card gradient-border text-center space-y-6 py-12">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto"
                 style={{ background: 'rgba(16,185,129,0.1)', boxShadow: '0 0 40px rgba(16,185,129,0.15)' }}>
              <CheckCircle2 className="w-10 h-10" style={{ color: '#34d399' }} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Подарок активирован!
              </p>
              {giftInfo && (
                <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                  Тариф <span className="font-semibold" style={{ color: 'var(--accent-1)' }}>{giftInfo.tariffName}</span> подключён
                </p>
              )}
              {giftInfo?.senderName && (
                <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  От {giftInfo.senderName}
                </p>
              )}
              {giftInfo?.message && (
                <div className="mt-4 p-3 rounded-xl text-sm italic"
                     style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                  &laquo;{giftInfo.message}&raquo;
                </div>
              )}
            </div>
            <Link href="/dashboard" className="btn-primary inline-flex items-center gap-2 px-8 py-3">
              Перейти в кабинет
            </Link>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="glass-card gradient-border text-center space-y-6 py-12">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                 style={{ background: 'rgba(239,68,68,0.1)' }}>
              <XCircle className="w-8 h-8" style={{ color: '#ef4444' }} />
            </div>
            <div>
              <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {error}
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Возможно, подарок уже был использован или срок действия истёк
              </p>
            </div>
            <Link href="/" className="btn-secondary inline-flex items-center gap-2 px-6 py-2.5 text-sm">
              На главную
            </Link>
          </div>
        )}

        {/* Login needed */}
        {status === 'login' && (
          <div className="glass-card gradient-border text-center space-y-6 py-10">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto animate-float"
                 style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.1), rgba(139,92,246,0.1))', boxShadow: '0 0 40px rgba(6,182,212,0.1)' }}>
              <Gift className="w-10 h-10" style={{ color: 'var(--accent-1)' }} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Вам подарок!
              </p>
              {giftInfo && (
                <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                  Тариф <span className="font-semibold" style={{ color: 'var(--accent-1)' }}>{giftInfo.tariffName}</span>
                </p>
              )}
              {giftInfo?.senderName && (
                <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  От {giftInfo.senderName}
                </p>
              )}
              {giftInfo?.message && (
                <div className="mt-4 p-3 rounded-xl text-sm italic"
                     style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                  &laquo;{giftInfo.message}&raquo;
                </div>
              )}
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Войдите или зарегистрируйтесь, чтобы получить подарок
            </p>
            <div className="flex gap-3">
              <Link href={`/login?gift=${code}`}
                    className="btn-primary flex-1 justify-center py-3 text-sm">
                Войти
              </Link>
              <Link href={`/login?gift=${code}`}
                    className="btn-secondary flex-1 justify-center py-3 text-sm">
                Регистрация
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
