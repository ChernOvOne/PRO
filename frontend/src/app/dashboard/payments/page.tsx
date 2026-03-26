'use client'

import { useEffect, useState } from 'react'
import { CreditCard, Bitcoin, CheckCircle2,
         Clock, XCircle, RefreshCw } from 'lucide-react'
import { userApi } from '@/lib/api'
import type { Payment } from '@/types'
import { Card, Badge, Skeleton, Empty } from '@/components/ui'
import Link from 'next/link'

const STATUS_CONFIG: Record<string, { label: string; color: 'green'|'yellow'|'red'|'gray'; icon: any }> = {
  PAID:     { label: 'Оплачен',   color: 'green',  icon: CheckCircle2 },
  PENDING:  { label: 'Ожидание', color: 'yellow', icon: Clock },
  FAILED:   { label: 'Ошибка',   color: 'red',    icon: XCircle },
  REFUNDED: { label: 'Возврат',  color: 'gray',   icon: RefreshCw },
  EXPIRED:  { label: 'Истёк',    color: 'red',    icon: XCircle },
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
          <p className="text-gray-400 text-sm mt-0.5">
            {payments.length} транзакций
            {totalSpent > 0 && ` · ${totalSpent.toLocaleString('ru')} ₽ итого`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : payments.length === 0 ? (
        <Card>
          <Empty
            icon={<CreditCard className="w-7 h-7" />}
            title="Нет платежей"
            description="Здесь появятся твои покупки подписок"
            action={
              <Link href="/dashboard/plans" className="btn-primary">
                Выбрать тариф
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {payments.map(p => {
            const st          = STATUS_CONFIG[p.status] || STATUS_CONFIG.FAILED
            const StatusIcon  = st.icon
            const ProviderIcon = PROVIDER_ICON[p.provider] || CreditCard

            return (
              <Card key={p.id} padding={false}>
                <div className="flex items-center gap-4 p-5">
                  {/* Provider icon */}
                  <div className="w-11 h-11 rounded-xl bg-gray-800 border border-gray-700
                                  flex items-center justify-center flex-shrink-0">
                    <ProviderIcon className="w-5 h-5 text-gray-400" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{p.tariff?.name || 'Подписка'}</p>
                      <Badge color={st.color}>
                        <StatusIcon className="w-3 h-3 mr-1 inline" />
                        {st.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
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
                    <p className={`font-semibold ${p.status === 'PAID' ? 'text-white' : 'text-gray-500'}`}>
                      {p.currency === 'RUB'
                        ? `${p.amount.toLocaleString('ru')} ₽`
                        : `${p.amount} ${p.currency}`}
                    </p>
                    {p.tariff?.durationDays && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {p.tariff.durationDays} дней
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Summary */}
      {payments.length > 0 && totalSpent > 0 && (
        <Card className="flex items-center justify-between py-4">
          <p className="text-gray-400 text-sm">Итого потрачено</p>
          <p className="font-bold text-lg">{totalSpent.toLocaleString('ru')} ₽</p>
        </Card>
      )}
    </div>
  )
}
