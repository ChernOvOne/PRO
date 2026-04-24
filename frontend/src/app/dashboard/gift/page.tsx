'use client'

import { useEffect, useState } from 'react'
import { Gift, Copy, CheckCircle2, Clock, X, Infinity as InfinityIcon, Ticket, Inbox, Send, BarChart3 } from 'lucide-react'
import type { GiftSubscription, Tariff } from '@/types'

interface GiftStats {
  sentTotal:     number
  sentPending:   number
  sentClaimed:   number
  sentCancelled: number
  receivedTotal: number
  receivedDays:  number
}

interface ReceivedGift extends GiftSubscription {
  fromUser?: { email: string | null; telegramName: string | null } | null
}

interface Provider {
  id:     string
  label:  string
  icon:   string
  meta?:  any
}

type Tab = 'sent' | 'received'

export default function GiftPage() {
  const [tariffs, setTariffs]       = useState<Tariff[]>([])
  const [sent, setSent]             = useState<GiftSubscription[]>([])
  const [received, setReceived]     = useState<ReceivedGift[]>([])
  const [stats, setStats]           = useState<GiftStats | null>(null)
  const [providers, setProviders]   = useState<Provider[]>([])
  const [balanceEnabled, setBE]     = useState(false)
  const [balance, setBalance]       = useState(0)
  const [loading, setLoading]       = useState(true)
  const [creating, setCreating]     = useState(false)
  const [copied, setCopied]         = useState<string | null>(null)
  const [showForm, setShowForm]     = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [tab, setTab]               = useState<Tab>('sent')

  // Form state
  const [selectedTariff, setSelectedTariff] = useState('')
  const [provider, setProvider]             = useState<string>('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [message, setMessage]               = useState('')
  const [noExpiry, setNoExpiry]             = useState(true)

  const reload = async () => {
    const g = await fetch('/api/gifts/my', { credentials: 'include' }).then(r => r.json()).catch(() => null)
    if (g && 'sent' in g) {
      setSent(g.sent)
      setReceived(g.received)
      setStats(g.stats)
    }
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/public/tariffs',        { credentials: 'include' }).then(r => r.json()).catch(() => []),
      fetch('/api/gifts/my',              { credentials: 'include' }).then(r => r.json()).catch(() => null),
      fetch('/api/public/payment-methods',                              ).then(r => r.json()).catch(() => ({ providers: [], balanceEnabled: false })),
      fetch('/api/user/balance',          { credentials: 'include' }).then(r => r.json()).catch(() => ({ balance: 0 })),
    ]).then(([t, g, pm, bal]) => {
      setTariffs(t)
      if (g && 'sent' in g) {
        setSent(g.sent)
        setReceived(g.received)
        setStats(g.stats)
      } else if (Array.isArray(g)) {
        // legacy shape
        setSent(g)
      }
      setProviders(pm?.providers || [])
      setBE(!!pm?.balanceEnabled)
      setBalance(Number(bal?.balance || 0))
      // pick a default provider so the create button is clickable
      const firstProvider = pm?.providers?.[0]?.id
      if (firstProvider) setProvider(firstProvider)
      else if (pm?.balanceEnabled) setProvider('BALANCE')
    }).finally(() => setLoading(false))
  }, [])

  const copyLink = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const createGift = async () => {
    if (!selectedTariff || !provider) return
    setCreating(true)
    try {
      const res = await fetch('/api/gifts/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tariffId:       selectedTariff,
          provider,
          recipientEmail: recipientEmail || undefined,
          message:        message || undefined,
          noExpiry,
        }),
      })
      const data = await res.json()
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl
      } else if (data.giftCode) {
        await reload()
        setShowForm(false)
        setSelectedTariff(''); setRecipientEmail(''); setMessage('')
      } else if (data.error) {
        alert(data.error)
      }
    } catch {
      alert('Ошибка при создании подарка')
    } finally { setCreating(false) }
  }

  const cancelGift = async (id: string) => {
    if (!confirm('Отменить этот подарок? Если оплачен с баланса — сумма вернётся.')) return
    setCancelling(id)
    try {
      const res  = await fetch(`/api/gifts/${id}/cancel`, { method: 'POST', credentials: 'include' })
      const data = await res.json()
      if (data.ok) await reload()
      else alert(data.error || 'Не удалось отменить подарок')
    } catch {
      alert('Ошибка при отмене подарка')
    } finally { setCancelling(null) }
  }

  const giftUrl = (code: string) => `${window.location.origin}/present/${code}`

  const statusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':   return <span className="badge-yellow"><Clock className="w-3 h-3 mr-1" /> Ожидает</span>
      case 'CLAIMED':   return <span className="badge-green"><CheckCircle2 className="w-3 h-3 mr-1" /> Активирован</span>
      case 'EXPIRED':   return <span className="badge-red">Истёк</span>
      case 'CANCELLED': return <span className="badge-gray">Отменён</span>
      default:          return <span className="badge-gray">{status}</span>
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="h-8 skeleton w-48" />
        <div className="h-64 skeleton rounded-2xl" />
      </div>
    )
  }

  const providerList: Array<{ key: string; label: string }> = [
    ...providers.map(p => ({
      key:   p.id,
      label: p.id === 'YUKASSA' ? 'Карта / СБП' : p.id === 'CRYPTOPAY' ? 'Крипта' : p.label,
    })),
    ...(balanceEnabled ? [{ key: 'BALANCE', label: `С баланса (${balance.toFixed(0)} ₽)` }] : []),
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Подарки</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Дарите VPN друзьям или активируйте полученные подарки
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
          <Gift className="w-4 h-4" /> Создать подарок
        </button>
      </div>

      {/* ── Stats row ── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard icon={<Send className="w-4 h-4" />}    label="Подарено"    value={stats.sentTotal}    hint={stats.sentPending ? `${stats.sentPending} ожидают` : undefined} />
          <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Активировано" value={stats.sentClaimed} accent="#22c55e" />
          <StatCard icon={<Inbox className="w-4 h-4" />}   label="Получено"     value={stats.receivedTotal} accent="#a78bfa" />
          <StatCard icon={<BarChart3 className="w-4 h-4" />} label="Дней в сумме" value={stats.receivedDays}  suffix="дн." accent="#f43f5e" />
        </div>
      )}

      {/* ── Create gift form ── */}
      {showForm && (
        <div className="glass-card gradient-border animate-scale-in">
          <h2 className="font-semibold mb-4">Новый подарок</h2>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
                Выберите тариф
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {tariffs.map(t => (
                  <button key={t.id}
                          onClick={() => setSelectedTariff(t.id)}
                          className="p-3 rounded-xl text-left transition-all text-sm"
                          style={{
                            background: selectedTariff === t.id ? 'rgba(6,182,212,0.1)' : 'var(--glass-bg)',
                            border: `1px solid ${selectedTariff === t.id ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                          }}>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-gradient font-bold mt-1">{t.priceRub} ₽</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
                Способ оплаты
              </label>
              {providerList.length === 0 ? (
                <div className="p-3 rounded-xl text-xs text-center"
                     style={{ background: 'rgba(239,68,68,0.08)', border: '1px dashed rgba(239,68,68,0.3)', color: '#fca5a5' }}>
                  Администратор не включил ни одного способа оплаты
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  {providerList.map(({ key, label }) => (
                    <button key={key}
                            onClick={() => setProvider(key)}
                            className="px-4 py-2.5 rounded-xl text-sm transition-all"
                            style={{
                              background: provider === key ? 'rgba(6,182,212,0.1)' : 'var(--glass-bg)',
                              border: `1px solid ${provider === key ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                              color: provider === key ? 'var(--accent-1)' : 'var(--text-secondary)',
                            }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
                Email получателя (необязательно)
              </label>
              <input type="email" value={recipientEmail}
                     onChange={e => setRecipientEmail(e.target.value)}
                     placeholder="friend@email.com"
                     className="glass-input" />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
                Сообщение (необязательно)
              </label>
              <textarea value={message}
                        onChange={e => setMessage(e.target.value)}
                        placeholder="С днём рождения! Дарю тебе VPN..."
                        className="glass-input min-h-[80px] resize-none"
                        maxLength={500} />
            </div>

            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl"
                   style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <input type="checkbox" checked={noExpiry}
                     onChange={e => setNoExpiry(e.target.checked)}
                     className="mt-0.5 w-4 h-4 accent-cyan-400" />
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <InfinityIcon className="w-4 h-4" style={{ color: '#a78bfa' }} />
                  Бессрочная ссылка
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {noExpiry
                    ? 'Ссылка действует пока получатель её не активирует или вы не отмените подарок'
                    : 'Ссылка будет действовать 30 дней — потом истечёт автоматически'}
                </p>
              </div>
            </label>

            <button onClick={createGift}
                    disabled={!selectedTariff || !provider || creating}
                    className="btn-primary w-full justify-center">
              {creating ? 'Создаём...' : 'Оплатить и создать подарок'}
            </button>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
        <TabButton active={tab === 'sent'}     onClick={() => setTab('sent')}     count={sent.length}     label="Подаренные"   icon={<Send className="w-4 h-4" />} />
        <TabButton active={tab === 'received'} onClick={() => setTab('received')} count={received.length} label="Полученные"   icon={<Inbox className="w-4 h-4" />} />
      </div>

      {/* ── Sent tab ── */}
      {tab === 'sent' && (
        sent.length === 0 ? (
          <EmptyState
            title="Вы пока никому не дарили"
            hint="Создайте подарок и поделитесь с другом — ссылкой или коротким кодом"
          />
        ) : (
          <div className="space-y-3">
            {sent.map(gift => (
              <div key={gift.id} className="glass-card">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                         style={{ background: 'rgba(139,92,246,0.1)' }}>
                      <Gift className="w-5 h-5" style={{ color: '#a78bfa' }} />
                    </div>
                    <div>
                      <p className="font-medium">{gift.tariff.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {new Date(gift.createdAt).toLocaleDateString('ru')}
                      </p>
                    </div>
                  </div>
                  {statusBadge(gift.status)}
                </div>

                {gift.status === 'PENDING' && (
                  <div className="space-y-2 mt-2">
                    <div className="flex items-center gap-2 p-3 rounded-xl"
                         style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                      <div className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(6,182,212,0.13)', color: '#06b6d4' }}>
                        ССЫЛКА
                      </div>
                      <p className="flex-1 text-xs font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>
                        {giftUrl(gift.giftCode)}
                      </p>
                      <button onClick={() => copyLink(giftUrl(gift.giftCode), `url-${gift.id}`)}
                              title="Копировать ссылку"
                              className="p-1.5 rounded-lg hover:bg-white/5 transition-all">
                        {copied === `url-${gift.id}`
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          : <Copy className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />}
                      </button>
                    </div>

                    {gift.shortCode && (
                      <div className="flex items-center gap-2 p-3 rounded-xl"
                           style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)' }}>
                        <div className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: 'rgba(139,92,246,0.18)', color: '#a78bfa' }}>
                          <Ticket className="w-3 h-3" /> КОД
                        </div>
                        <p className="flex-1 text-sm font-mono font-bold tracking-wider" style={{ color: '#a78bfa' }}>
                          {gift.shortCode}
                        </p>
                        <span className="text-[10px] hidden sm:inline" style={{ color: 'var(--text-tertiary)' }}>
                          вводится в поле «Промокод»
                        </span>
                        <button onClick={() => copyLink(gift.shortCode!, `code-${gift.id}`)}
                                title="Копировать код"
                                className="p-1.5 rounded-lg hover:bg-white/5 transition-all">
                          {copied === `code-${gift.id}`
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            : <Copy className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />}
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] flex-wrap gap-2" style={{ color: 'var(--text-tertiary)' }}>
                      <div className="flex items-center gap-1.5">
                        {gift.expiresAt ? (
                          <><Clock className="w-3 h-3" /> Действует до {new Date(gift.expiresAt).toLocaleDateString('ru-RU')}</>
                        ) : (
                          <><InfinityIcon className="w-3 h-3" /> Бессрочная ссылка</>
                        )}
                        {gift.recipientEmail && <span className="ml-2">• отправлено на {gift.recipientEmail}</span>}
                      </div>
                      <button onClick={() => cancelGift(gift.id)}
                              disabled={cancelling === gift.id}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-500/10 disabled:opacity-50"
                              style={{ color: '#f87171' }}>
                        <X className="w-3 h-3" /> {cancelling === gift.id ? 'Отмена…' : 'Отменить'}
                      </button>
                    </div>
                  </div>
                )}

                {gift.recipientUser && (
                  <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                    Получатель: {gift.recipientUser.telegramName || gift.recipientUser.email}
                    {gift.claimedAt && ` · ${new Date(gift.claimedAt).toLocaleDateString('ru')}`}
                  </p>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Received tab ── */}
      {tab === 'received' && (
        received.length === 0 ? (
          <EmptyState
            title="У вас пока нет полученных подарков"
            hint="Если вам прислали ссылку или короткий код вида G-XXXXX — активируйте его через поле «Промокод» на главной"
          />
        ) : (
          <div className="space-y-3">
            {received.map(gift => (
              <div key={gift.id} className="glass-card">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                         style={{ background: 'rgba(244,63,94,0.1)' }}>
                      <Gift className="w-5 h-5" style={{ color: '#fb7185' }} />
                    </div>
                    <div>
                      <p className="font-medium">{gift.tariff.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        +{gift.tariff.durationDays} дн. · активирован {gift.claimedAt ? new Date(gift.claimedAt).toLocaleDateString('ru') : ''}
                      </p>
                    </div>
                  </div>
                  <span className="badge-green">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Активирован
                  </span>
                </div>
                {(gift as any).fromUser && (
                  <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                    От: {(gift as any).fromUser.telegramName || (gift as any).fromUser.email || 'Аноним'}
                  </p>
                )}
                {gift.message && (
                  <p className="text-xs mt-2 italic p-2 rounded-lg"
                     style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)' }}>
                    «{gift.message}»
                  </p>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function StatCard({ icon, label, value, hint, suffix, accent }: {
  icon:   React.ReactNode
  label:  string
  value:  number
  hint?:  string
  suffix?: string
  accent?: string
}) {
  return (
    <div className="p-3 rounded-xl"
         style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: accent || 'var(--text-tertiary)' }}>
        {icon}
        {label}
      </div>
      <p className="text-xl font-bold mt-1">
        {value}{suffix ? <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>{suffix}</span> : null}
      </p>
      {hint && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{hint}</p>}
    </div>
  )
}

function TabButton({ active, onClick, label, count, icon }: {
  active:  boolean
  onClick: () => void
  label:   string
  count:   number
  icon:    React.ReactNode
}) {
  return (
    <button onClick={onClick}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: active ? 'rgba(6,182,212,0.1)' : 'transparent',
              color:      active ? 'var(--accent-1)'    : 'var(--text-secondary)',
            }}>
      {icon}
      {label}
      <span className="px-1.5 py-0.5 rounded-full text-[10px]"
            style={{ background: active ? 'rgba(6,182,212,0.2)' : 'var(--glass-bg)' }}>
        {count}
      </span>
    </button>
  )
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="glass-card text-center py-12">
      <Gift className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
      <p className="font-medium">{title}</p>
      <p className="text-sm mt-1 max-w-xs mx-auto" style={{ color: 'var(--text-tertiary)' }}>
        {hint}
      </p>
    </div>
  )
}
