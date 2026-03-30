'use client'

import { useEffect, useState } from 'react'
import { Copy, CheckCircle2, Users, Gift, TrendingUp, Share2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface ReferralData {
  referralCode: string
  referralUrl:  string
  referrals:    Array<{ id: string; joinedAt: string; displayName: string; hasPaid: boolean }>
  bonusDaysEarned:  number
  bonusHistory:     Array<{ id: string; bonusDays: number; appliedAt: string }>
  bonusPerReferral: number
}

export default function ReferralPage() {
  const [data, setData]     = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    fetch('/api/user/referral', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [])

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Скопировано!')
    setTimeout(() => setCopied(false), 2500)
  }

  if (loading) return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="h-8 skeleton w-56" />
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-28 skeleton rounded-2xl" />)}
      </div>
      <div className="h-48 skeleton rounded-2xl" />
    </div>
  )

  if (!data) return null

  const paid = data.referrals.filter(r => r.hasPaid).length

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Реферальная программа</h1>
        <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
          Приводи друзей — получай <span className="text-amber-400 font-medium">
          {data.bonusPerReferral} дней бесплатно</span> за каждого
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Users,    label: 'Рефералов',      value: data.referrals.length,   color: 'blue' },
          { icon: CheckCircle2, label: 'Оплатили',   value: paid,                    color: 'emerald' },
          { icon: Gift,     label: 'Бонус дней',     value: data.bonusDaysEarned,    color: 'amber' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="card text-center p-5">
            <div className={`w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center
                            ${color === 'blue'    ? 'bg-blue-500/15 text-blue-400' :
                              color === 'emerald' ? 'bg-emerald-500/15 text-emerald-400' :
                                                   'bg-amber-500/15 text-amber-400'}`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Referral link */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Share2 className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />
          <h2 className="font-semibold">Твоя реферальная ссылка</h2>
        </div>

        <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
          <p className="flex-1 font-mono text-sm truncate" style={{ color: 'var(--text-primary)' }}>{data.referralUrl}</p>
          <button onClick={() => copy(data.referralUrl)}
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5
                             border text-sm rounded-lg transition-colors"
                  style={{ background: 'rgba(6,182,212,0.1)', borderColor: 'rgba(6,182,212,0.3)', color: 'var(--accent-1)' }}>
            {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Скопировано' : 'Копировать'}
          </button>
        </div>

        <div className="flex gap-3">
          <a href={`https://t.me/share/url?url=${encodeURIComponent(data.referralUrl)}&text=${encodeURIComponent('Попробуй HIDEYOU VPN — быстрый и надёжный!')}`}
             target="_blank" rel="noopener"
             className="btn-secondary text-sm flex-1 justify-center">
            Поделиться в Telegram
          </a>
        </div>
      </div>

      {/* How it works */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />
          <h2 className="font-semibold">Как работает</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { step: '1', title: 'Поделись ссылкой', desc: 'Отправь реферальную ссылку другу' },
            { step: '2', title: 'Друг покупает', desc: 'Он регистрируется и оформляет подписку' },
            { step: '3', title: 'Ты получаешь', desc: `+${data.bonusPerReferral} дней к своей подписке автоматически` },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
                   style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', color: 'var(--accent-1)' }}>
                {step}
              </div>
              <div>
                <p className="font-medium text-sm">{title}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Referral list */}
      {data.referrals.length > 0 && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Твои рефералы ({data.referrals.length})</h2>
          <div className="space-y-2">
            {data.referrals.map(r => (
              <div key={r.id} className="flex items-center justify-between py-2.5 last:border-0"
                   style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
                       style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)' }}>
                    {r.displayName[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{r.displayName}</p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(r.joinedAt).toLocaleDateString('ru', { day:'numeric', month:'short', year:'numeric' })}
                    </p>
                  </div>
                </div>
                <span className={`badge ${r.hasPaid ? 'badge-green' : 'badge-gray'}`}>
                  {r.hasPaid ? `+${data.bonusPerReferral} дн.` : 'Не оплатил'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bonus history */}
      {data.bonusHistory.length > 0 && (
        <div className="card space-y-4">
          <h2 className="font-semibold">История бонусов</h2>
          <div className="space-y-2">
            {data.bonusHistory.map(b => (
              <div key={b.id} className="flex items-center justify-between py-2 last:border-0 text-sm"
                   style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {new Date(b.appliedAt).toLocaleDateString('ru', { day:'numeric', month:'short', year:'numeric' })}
                </span>
                <span className="text-emerald-400 font-medium">+{b.bonusDays} дней</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 font-semibold text-sm"
               style={{ borderTop: '1px solid var(--glass-border)' }}>
            <span>Итого</span>
            <span className="text-emerald-400">+{data.bonusDaysEarned} дней</span>
          </div>
        </div>
      )}
    </div>
  )
}
