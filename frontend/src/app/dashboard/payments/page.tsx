'use client'

import { useEffect, useState } from 'react'
import { CreditCard, Bitcoin, CheckCircle2,
         Clock, XCircle, RefreshCw } from 'lucide-react'
import { userApi } from '@/lib/api'
import type { Payment } from '@/types'
import Link from 'next/link'

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string; icon: any }> = {
  PAID:     { label: 'Оплачен',   badgeClass: 'badge-green',  icon: CheckCircle2 },
  PENDING:  { label: 'Ожидание',  badgeClass: 'badge-yellow', icon: Clock },
  FAILED:   { label: 'Ошибка',    badgeClass: 'badge-red',    icon: XCircle },
  REFUNDED: { label: 'Возврат',   badgeClass: 'badge-gray',   icon: RefreshCw },
  EXPIRED:  { label: 'Истёк',     badgeClass: 'badge-red',    icon: XCircle },
}

const PROVIDER_ICON: Record<string, any> = {
  YUKASSA:   CreditCard,
  CRYPTOPAY: Bitcoin,
  MANUAL:    RefreshCw,
}

const PROVIDER_LABEL: Record<string, string> = {
  YUKASSA:   'ЮKassa',
  CRYPTOPAY: 'CryptoPay',
  MANUAL:    'Вручную',
}

export default function PaymentHistoryPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    userApi.payments()
      .then(d => { setPayments(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const totalSpent = payments
    .filter(p => p.status === 'PAID' && p.currency === 'RUB')
    .reduce((s, p) => s + p.amount, 0)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">История платежей</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {payments.length} транзакций
            {totalSpent > 0 && ` · ${totalSpent.toLocaleString('ru')} ₽ итого`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-20 skeleton rounded-2xl" />)}
        </div>
      ) : payments.length === 0 ? (
        <div className="glass-card">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CreditCard className="w-7 h-7 mb-3" style={{ color: 'var(--text-tertiary)' }} />
            <p className="font-medium">Нет платежей</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Здесь появятся твои покупки подписок
            </p>
            <Link href="/dashboard/plans" className="btn-primary mt-4">
              Выбрать тариф
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {payments.map(p => {
            const st          = STATUS_CONFIG[p.status] || STATUS_CONFIG.FAILED
            const StatusIcon  = st.icon
            const ProviderIcon = PROVIDER_ICON[p.provider] || CreditCard

            return (
              <div key={p.id} className="glass-card">
                <div className="flex items-center gap-4 p-5">
                  {/* Provider icon */}
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                       style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                    <ProviderIcon className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{p.tariff?.name || 'Подписка'}</p>
                      <span className={st.badgeClass}>
                        <StatusIcon className="w-3 h-3 mr-1 inline" />
                        {st.label}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      {PROVIDER_LABEL[p.provider]} ·{' '}
                      {new Date(p.createdAt).toLocaleDateString('ru', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })}
                      {p.confirmedAt && p.status === 'PAID' && (
                        <> · оплачено в {new Date(p.confirmedAt).toLocaleTimeString('ru', {
                          hour: '2-digit', minute: '2-digit',
                        })}</>
                      )}
                    </p>
                  </div>

                  {/* Amount */}
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold" style={{ color: p.status === 'PAID' ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                      {(() => {
                        // Parse metadata
                        let meta: any = null
                        try { meta = JSON.parse((p as any).yukassaStatus || '{}') } catch {}

                        if (meta?._type === 'referral_redeem') return `Реф. дни: +${meta.days} дн.`
                        if (meta?._type === 'bonus_redeem') return `Бонус дни: +${meta.days} дн.`
                        if (p.purpose === 'GIFT' && p.amount === 0) return 'Подарок'
                        if (p.amount === 0 && p.provider === 'MANUAL') return 'Бонус'
                        return p.currency === 'RUB'
                          ? `${p.amount.toLocaleString('ru')} ₽`
                          : `${p.amount} ${p.currency}`
                      })()}
                    </p>
                    {p.tariff?.durationDays && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        {p.tariff.durationDays} дней
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Summary */}
      {payments.length > 0 && totalSpent > 0 && (
        <div className="glass-card flex items-center justify-between py-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Итого потрачено</p>
          <p className="font-bold text-lg">{totalSpent.toLocaleString('ru')} ₽</p>
        </div>
      )}
    </div>
  )
}
