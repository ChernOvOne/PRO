'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, CreditCard, Bitcoin, Loader2,
         Star, X, ExternalLink, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

interface PaidSquad {
  squadUuid: string; title: string; pricePerMonth: number
  description?: string | null; country?: string | null; icon?: string | null
}
interface Tariff {
  id: string; name: string; description?: string
  durationDays: number; priceRub: number; priceUsdt?: number
  deviceLimit: number; trafficGb?: number; isFeatured: boolean
  paidSquads?: PaidSquad[]
}

interface ProviderOption {
  id: string
  label: string
  icon: string
  meta?: { paymentMethod?: number }
}

export default function PlansPage() {
  const [tariffs, setTariffs]       = useState<Tariff[]>([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<Tariff | null>(null)
  const [paying, setPaying]         = useState(false)
  const [providers, setProviders]   = useState<ProviderOption[]>([])
  const [provider, setProvider]     = useState<string>('YUKASSA')
  const [currency, setCurrency]     = useState<'USDT' | 'TON' | 'BTC'>('USDT')
  const [selectedAddonUuids, setSelectedAddonUuids] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/tariffs')
      .then(r => r.json())
      .then(data => { setTariffs(data); setLoading(false) })

    fetch('/api/public/payment-methods')
      .then(r => r.json())
      .then(data => {
        const list: ProviderOption[] = data.providers || []
        setProviders(list)
        if (list.length > 0 && !list.find(p => p.id === provider)) {
          setProvider(list[0].id)
        }
      })
      .catch(() => {})

  }, [])

  // Reset selection when tariff changes
  useEffect(() => { setSelectedAddonUuids([]) }, [selected?.id])

  const addons = selected?.paidSquads ?? []
  const tariffMonths = selected ? Math.max(1, Math.round(selected.durationDays / 30)) : 0
  const bundledAddons = addons.filter(a => selectedAddonUuids.includes(a.squadUuid))
  const bundledTotal  = bundledAddons.reduce((s, a) => s + Math.ceil(a.pricePerMonth * tariffMonths), 0)
  const grandTotalRub = (selected?.priceRub || 0) + bundledTotal

  const toggleAddon = (uuid: string) => {
    setSelectedAddonUuids(ids => ids.includes(uuid) ? ids.filter(x => x !== uuid) : [...ids, uuid])
  }

  const currentProviderOpt = providers.find(p => p.id === provider)

  const handleBuy = async () => {
    if (!selected) return
    setPaying(true)
    try {
      const body: any = { tariffId: selected.id, provider }
      if (provider === 'CRYPTOPAY') body.currency = currency
      if (provider === 'PLATEGA' && currentProviderOpt?.meta?.paymentMethod) {
        body.paymentMethod = currentProviderOpt.meta.paymentMethod
      }
      if (selectedAddonUuids.length > 0) body.addonSquadUuids = selectedAddonUuids

      const res = await fetch('/api/payments/create', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка создания платежа')

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
        <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Подключение работает сразу после оплаты</p>
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
                          : ''}`}
            style={selected?.id !== t.id ? { borderColor: 'var(--glass-border)' } : undefined}>
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
              {t.description && <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{t.description}</p>}
            </div>

            <div className="mb-5">
              <p className="text-3xl font-bold">{t.priceRub.toLocaleString('ru')} ₽</p>
              {t.priceUsdt && <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>≈ ${t.priceUsdt} USDT</p>}
            </div>

            <ul className="space-y-1.5 flex-1">
              {[
                `${t.deviceLimit} устройства`,
                t.trafficGb ? `${t.trafficGb} ГБ` : 'Безлимит',
                'Все протоколы',
              ].map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            {selected?.id === t.id && (
              <div className="mt-4 flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--accent-1)' }}>
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
            <button onClick={() => setSelected(null)} className="hover:opacity-80 transition-opacity" style={{ color: 'var(--text-tertiary)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Provider tabs — dynamic from backend */}
          {providers.length === 0 ? (
            <div className="p-4 rounded-xl text-sm"
                 style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
              ⚠️ Нет активных способов оплаты. Обратись в поддержку.
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {providers.map(p => (
                <ProviderTab
                  key={p.id}
                  id={p.id}
                  label={p.label}
                  icon={p.icon === 'bitcoin'
                    ? <Bitcoin className="w-4 h-4" />
                    : <CreditCard className="w-4 h-4" />}
                  active={provider === p.id}
                  onClick={() => setProvider(p.id)}
                />
              ))}
            </div>
          )}

          {provider === 'YUKASSA' && (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Оплата через ЮKassa — Visa, МИР, СБП, ЮMoney
            </p>
          )}

          {provider === 'PLATEGA' && (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Оплата через Platega — {currentProviderOpt?.label.replace('Platega · ', '')}
            </p>
          )}

          {provider === 'CRYPTOPAY' && (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Выбери криптовалюту для оплаты</p>
              <div className="flex gap-2">
                {(['USDT','TON','BTC'] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => setCurrency(c)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors
                                ${currency === c
                                  ? 'bg-brand-600 text-white'
                                  : ''}`}
                    style={currency !== c ? { background: 'var(--surface-2)', color: 'var(--text-secondary)' } : undefined}>
                    {c}
                  </button>
                ))}
              </div>
              {selected.priceUsdt && (
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  К оплате: ~{selected.priceUsdt} {currency}
                </p>
              )}
            </div>
          )}

          {/* Paid squad addons configured on this tariff */}
          {addons.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Дополнительные серверы</h3>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Добавь платные сервера к тарифу. Цена = цена за месяц × {tariffMonths} мес.
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {addons.map(a => {
                  const active = selectedAddonUuids.includes(a.squadUuid)
                  const cost = Math.ceil(a.pricePerMonth * tariffMonths)
                  return (
                    <button
                      key={a.squadUuid}
                      type="button"
                      onClick={() => toggleAddon(a.squadUuid)}
                      className="text-left p-3 rounded-xl transition-colors"
                      style={active
                        ? { background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.4)' }
                        : { background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm flex items-center gap-2">
                          {a.icon && <span>{a.icon}</span>}
                          {a.title}
                        </span>
                        {active ? <CheckCircle2 className="w-4 h-4 text-brand-500" /> : null}
                      </div>
                      {a.country && (
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{a.country}</div>
                      )}
                      <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                        <b>{cost.toLocaleString('ru')} ₽</b>
                        <span className="opacity-60"> · {a.pricePerMonth} ₽/мес</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="p-4 rounded-xl space-y-2" style={{ background: 'var(--surface-2)' }}>
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Тариф</span>
              <span>{selected.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Период</span>
              <span>{selected.durationDays} дней</span>
            </div>
            {bundledAddons.length > 0 && (
              <>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>Тариф (база)</span>
                  <span>{selected.priceRub.toLocaleString('ru')} ₽</span>
                </div>
                {bundledAddons.map(a => (
                  <div key={a.squadUuid} className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>+ {a.title}</span>
                    <span>{Math.ceil(a.pricePerMonth * tariffMonths).toLocaleString('ru')} ₽</span>
                  </div>
                ))}
              </>
            )}
            <div className="flex justify-between font-semibold pt-2 mt-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
              <span>Итого</span>
              <span>
                {provider === 'CRYPTOPAY'
                  ? `~${((selected.priceUsdt || 0) + bundledTotal / 90).toFixed(2)} ${currency}`
                  : `${grandTotalRub.toLocaleString('ru')} ₽`}
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

          <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
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
                  transition-all duration-150`}
      style={active
        ? { background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', color: 'var(--accent-1)' }
        : { background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }
      }>
      {icon}
      {label}
    </button>
  )
}
