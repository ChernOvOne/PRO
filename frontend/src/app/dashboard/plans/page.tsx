'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, CreditCard, Bitcoin, Loader2,
         Star, X, ExternalLink, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

interface Tariff {
  id: string; name: string; description?: string
  durationDays: number; priceRub: number; priceUsdt?: number
  deviceLimit: number; trafficGb?: number; isFeatured: boolean
}

export default function PlansPage() {
  const [tariffs, setTariffs]       = useState<Tariff[]>([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<Tariff | null>(null)
  const [paying, setPaying]         = useState(false)
  const [provider, setProvider]     = useState<'YUKASSA' | 'CRYPTOPAY'>('YUKASSA')
  const [currency, setCurrency]     = useState<'USDT' | 'TON' | 'BTC'>('USDT')

  useEffect(() => {
    fetch('/api/tariffs')
      .then(r => r.json())
      .then(data => { setTariffs(data); setLoading(false) })
  }, [])

  const handleBuy = async () => {
    if (!selected) return
    setPaying(true)
    try {
      const res = await fetch('/api/payments/create', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({
          tariffId: selected.id,
          provider,
          ...(provider === 'CRYPTOPAY' ? { currency } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка создания платежа')

      // Redirect to payment page
      window.location.href = data.paymentUrl
    } catch (err: any) {
      toast.error(err.message || 'Ошибка оплаты')
    } finally {
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="h-8 skeleton w-48" />
        <div className="grid md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => <div key={i} className="h-72 skeleton rounded-2xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Выбери тариф</h1>
        <p className="text-gray-400 mt-1">Подключение работает сразу после оплаты</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {tariffs.map(t => (
          <button
            key={t.id}
            onClick={() => setSelected(t)}
            className={`relative text-left card flex flex-col hover:-translate-y-1
                        transition-all duration-200 cursor-pointer
                        ${selected?.id === t.id
                          ? 'border-brand-500 ring-2 ring-brand-500/30'
                          : 'hover:border-gray-700'}`}>
            {t.isFeatured && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full
                                 bg-brand-600 text-white text-xs font-semibold">
                  <Star className="w-3 h-3 fill-current" /> Популярный
                </span>
              </div>
            )}

            <div className="mb-4 mt-2">
              <p className="font-semibold text-lg">{t.name}</p>
              {t.description && <p className="text-gray-400 text-sm mt-0.5">{t.description}</p>}
            </div>

            <div className="mb-5">
              <p className="text-3xl font-bold">{t.priceRub.toLocaleString('ru')} ₽</p>
              {t.priceUsdt && <p className="text-gray-500 text-sm">≈ ${t.priceUsdt} USDT</p>}
            </div>

            <ul className="space-y-1.5 flex-1">
              {[
                `${t.deviceLimit} устройства`,
                t.trafficGb ? `${t.trafficGb} ГБ` : 'Безлимит',
                'Все протоколы',
              ].map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            {selected?.id === t.id && (
              <div className="mt-4 flex items-center gap-1.5 text-brand-400 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Выбран
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Payment method + checkout */}
      {selected && (
        <div className="card space-y-6 animate-slide-up">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Способ оплаты</h2>
            <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Provider tabs */}
          <div className="flex gap-3">
            <ProviderTab
              id="YUKASSA"
              label="Картой / СБП"
              icon={<CreditCard className="w-4 h-4" />}
              active={provider === 'YUKASSA'}
              onClick={() => setProvider('YUKASSA')}
            />
            <ProviderTab
              id="CRYPTOPAY"
              label="Криптовалюта"
              icon={<Bitcoin className="w-4 h-4" />}
              active={provider === 'CRYPTOPAY'}
              onClick={() => setProvider('CRYPTOPAY')}
            />
          </div>

          {provider === 'YUKASSA' && (
            <p className="text-sm text-gray-400">
              Оплата через ЮKassa — Visa, МИР, СБП, ЮMoney
            </p>
          )}

          {provider === 'CRYPTOPAY' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">Выбери криптовалюту для оплаты</p>
              <div className="flex gap-2">
                {(['USDT','TON','BTC'] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => setCurrency(c)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors
                                ${currency === c
                                  ? 'bg-brand-600 text-white'
                                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                    {c}
                  </button>
                ))}
              </div>
              {selected.priceUsdt && (
                <p className="text-sm text-gray-500">
                  К оплате: ~{selected.priceUsdt} {currency}
                </p>
              )}
            </div>
          )}

          {/* Summary */}
          <div className="p-4 bg-gray-800 rounded-xl space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Тариф</span>
              <span>{selected.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Период</span>
              <span>{selected.durationDays} дней</span>
            </div>
            <div className="flex justify-between font-semibold border-t border-gray-700 pt-2 mt-2">
              <span>Итого</span>
              <span>
                {provider === 'YUKASSA'
                  ? `${selected.priceRub.toLocaleString('ru')} ₽`
                  : `~${selected.priceUsdt} ${currency}`}
              </span>
            </div>
          </div>

          <button
            onClick={handleBuy}
            disabled={paying}
            className="btn-primary w-full justify-center text-base py-3.5">
            {paying
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Создание платежа...</>
              : <>Оплатить <ExternalLink className="w-4 h-4" /></>
            }
          </button>

          <p className="text-xs text-gray-500 text-center">
            Подписка активируется автоматически после подтверждения платежа
          </p>
        </div>
      )}
    </div>
  )
}

function ProviderTab({ label, icon, active, onClick }: {
  id: string; label: string; icon: React.ReactNode
  active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                  border transition-all duration-150
                  ${active
                    ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}>
      {icon}
      {label}
    </button>
  )
}
