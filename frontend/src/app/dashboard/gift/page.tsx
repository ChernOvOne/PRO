'use client'

import { useEffect, useState } from 'react'
import { Gift, Send, Copy, CheckCircle2, Clock, ExternalLink } from 'lucide-react'
import type { GiftSubscription, Tariff } from '@/types'

export default function GiftPage() {
  const [tariffs, setTariffs]   = useState<Tariff[]>([])
  const [gifts, setGifts]       = useState<GiftSubscription[]>([])
  const [loading, setLoading]   = useState(true)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied]     = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [selectedTariff, setSelectedTariff] = useState('')
  const [provider, setProvider]             = useState<'YUKASSA' | 'BALANCE'>('YUKASSA')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [message, setMessage]               = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/public/tariffs', { credentials: 'include' }).then(r => r.json()).catch(() => []),
      fetch('/api/gifts/my', { credentials: 'include' }).then(r => r.json()).catch(() => []),
    ]).then(([t, g]) => {
      setTariffs(t)
      setGifts(g)
    }).finally(() => setLoading(false))
  }, [])

  const copyLink = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const createGift = async () => {
    if (!selectedTariff) return
    setCreating(true)
    try {
      const res = await fetch('/api/gifts/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tariffId: selectedTariff,
          provider,
          recipientEmail: recipientEmail || undefined,
          message: message || undefined,
        }),
      })
      const data = await res.json()

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl
      } else if (data.giftCode) {
        // Refresh gifts list
        const g = await fetch('/api/gifts/my', { credentials: 'include' }).then(r => r.json())
        setGifts(g)
        setShowForm(false)
        setSelectedTariff('')
        setRecipientEmail('')
        setMessage('')
      }
    } catch (err) {
      alert('Ошибка при создании подарка')
    } finally {
      setCreating(false)
    }
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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Подарить подписку</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Купите VPN в подарок другу
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
          <Gift className="w-4 h-4" /> Создать подарок
        </button>
      </div>

      {/* Create gift form */}
      {showForm && (
        <div className="glass-card gradient-border animate-scale-in">
          <h2 className="font-semibold mb-4">Новый подарок</h2>

          <div className="space-y-4">
            {/* Select tariff */}
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

            {/* Provider */}
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
                Способ оплаты
              </label>
              <div className="flex gap-2">
                {[
                  { key: 'YUKASSA' as const, label: 'Карта / СБП' },
                  { key: 'BALANCE' as const, label: 'С баланса' },
                ].map(({ key, label }) => (
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
            </div>

            {/* Recipient email */}
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
                Email получателя (необязательно)
              </label>
              <input type="email" value={recipientEmail}
                     onChange={e => setRecipientEmail(e.target.value)}
                     placeholder="friend@email.com"
                     className="glass-input" />
            </div>

            {/* Message */}
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

            <button onClick={createGift}
                    disabled={!selectedTariff || creating}
                    className="btn-primary w-full justify-center">
              {creating ? 'Создаём...' : 'Оплатить и создать подарок'}
            </button>
          </div>
        </div>
      )}

      {/* My gifts */}
      <div>
        <h2 className="font-semibold mb-4">Мои подарки</h2>
        {gifts.length === 0 ? (
          <div className="glass-card text-center py-12">
            <Gift className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
            <p className="font-medium">У вас пока нет подарков</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Создайте подарок и поделитесь с другом
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {gifts.map(gift => (
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
                  <div className="flex items-center gap-2 p-3 rounded-xl mt-2"
                       style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                    <p className="flex-1 text-xs font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {giftUrl(gift.giftCode)}
                    </p>
                    <button onClick={() => copyLink(giftUrl(gift.giftCode), gift.id)}
                            className="p-2 rounded-lg hover:bg-white/5 transition-all">
                      {copied === gift.id
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        : <Copy className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />}
                    </button>
                  </div>
                )}

                {gift.recipientUser && (
                  <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                    Получатель: {gift.recipientUser.telegramName || gift.recipientUser.email}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
