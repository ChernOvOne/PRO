'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Shield, Zap, Users, Clock, Copy, CheckCircle2, Wifi, ChevronDown,
  Smartphone, Globe, Gift, Newspaper, CreditCard, Send,
  Trash2, RefreshCw, ExternalLink, Wallet, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import toast from 'react-hot-toast'

export default function DashboardPage() {
  const [data, setData]       = useState<any>(null)
  const [sub, setSub]         = useState<any>(null)
  const [tariffs, setTariffs] = useState<any[]>([])
  const [referral, setRef]    = useState<any>(null)
  const [balance, setBal]     = useState<any>(null)
  const [devices, setDevices] = useState<any[]>([])
  const [news, setNews]       = useState<any[]>([])
  const [proxies, setProxies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState<string | null>(null)

  // Collapsible only for secondary sections
  const [showDevices, setShowDevices] = useState(false)
  const [showNews, setShowNews]       = useState(false)
  const [showProxies, setShowProxies] = useState(false)

  // Payment modal
  const [payTariff, setPayTariff] = useState<any>(null)
  const [provider, setProvider]   = useState<'YUKASSA' | 'CRYPTOPAY'>('YUKASSA')
  const [paying, setPaying]       = useState(false)

  // Revoke confirmation
  const [showRevoke, setShowRevoke] = useState(false)
  const [revoking, setRevoking]     = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/user/dashboard', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/user/subscription', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/public/tariffs', { credentials: 'include' }).then(r => r.json()).catch(() => []),
      fetch('/api/user/referral', { credentials: 'include' }).then(r => r.json()).catch(() => null),
      fetch('/api/user/balance', { credentials: 'include' }).then(r => r.json()).catch(() => null),
    ]).then(([d, s, t, r, b]) => {
      setData(d); setSub(s); setTariffs(t); setRef(r); setBal(b)
    }).finally(() => setLoading(false))
  }, [])

  // Lazy load devices
  useEffect(() => {
    if (showDevices && devices.length === 0) {
      fetch('/api/user/devices', { credentials: 'include' })
        .then(r => r.json())
        .then(d => setDevices(d.devices || []))
        .catch(() => {})
    }
  }, [showDevices])

  // Lazy load news
  useEffect(() => {
    if (showNews && news.length === 0) {
      fetch('/api/news?limit=3', { credentials: 'include' })
        .then(r => r.json())
        .then(d => setNews(d.news || d || []))
        .catch(() => {})
    }
  }, [showNews])

  // Lazy load proxies
  useEffect(() => {
    if (showProxies && proxies.length === 0) {
      fetch('/api/proxies', { credentials: 'include' })
        .then(r => r.json())
        .then(setProxies)
        .catch(() => {})
    }
  }, [showProxies])

  const copyText = useCallback(async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(id)
    toast.success('Скопировано!')
    setTimeout(() => setCopied(null), 2500)
  }, [])

  const handleRevoke = async () => {
    setRevoking(true)
    try {
      const res = await fetch('/api/user/revoke-subscription', { method: 'POST', credentials: 'include' })
      if (!res.ok) throw new Error()
      const d = await res.json()
      setSub((p: any) => p ? { ...p, subUrl: d.newSubUrl } : p)
      toast.success('Ссылка обновлена')
      setShowRevoke(false)
    } catch { toast.error('Ошибка') }
    finally { setRevoking(false) }
  }

  const handleDeleteDevice = async (hwid: string) => {
    try {
      await fetch(`/api/user/devices/${hwid}`, { method: 'DELETE', credentials: 'include' })
      setDevices(prev => prev.filter(d => d.hwid !== hwid))
      toast.success('Устройство удалено')
    } catch { toast.error('Ошибка') }
  }

  const handleBuy = async () => {
    if (!payTariff) return
    setPaying(true)
    try {
      const res = await fetch('/api/payments/create', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tariffId: payTariff.id, provider }),
      })
      const d = await res.json()
      if (d.paymentUrl) window.location.href = d.paymentUrl
      else throw new Error(d.error || 'Ошибка')
    } catch (e: any) { toast.error(e.message) }
    finally { setPaying(false) }
  }

  if (loading) return <DashboardSkeleton />
  if (!data) return null

  const { user, rmStats, referralUrl, referralCount, bonusDaysEarned } = data
  const isActive = user.subStatus === 'ACTIVE'
  const daysLeft = user.subExpireAt
    ? Math.max(0, Math.ceil((new Date(user.subExpireAt).getTime() - Date.now()) / 86400_000))
    : null
  const usedGb  = rmStats ? (rmStats.usedTrafficBytes / 1e9) : null
  const limitGb = rmStats?.trafficLimitBytes ? (rmStats.trafficLimitBytes / 1e9) : null
  const trafficPct = usedGb !== null && limitGb ? Math.min(100, (usedGb / limitGb) * 100) : 0

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="animate-slide-up">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          {user.telegramName
            ? <>Привет, <span className="text-gradient">{user.telegramName}</span></>
            : <span className="text-gradient">Добро пожаловать</span>}
        </h1>
      </div>

      {/* ═══════ ПОДПИСКА (всегда видна) ═══════ */}
      <div className="glass-card gradient-border animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-lg">Подписка</h2>
          <span className={isActive ? 'badge-green' : 'badge-gray'}>
            {isActive && <span className="glow-dot text-emerald-400 mr-1.5" />}
            {isActive ? 'Активна' : 'Неактивна'}
          </span>
        </div>

        {sub?.subUrl ? (
          <div className="space-y-5">
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <MiniStat label="Дней осталось" value={daysLeft ?? '—'} />
              <MiniStat label="Истекает" value={user.subExpireAt ? new Date(user.subExpireAt).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) : '—'} />
              {usedGb !== null && (
                <MiniStat label="Трафик" value={`${usedGb.toFixed(1)} ГБ`} sub={limitGb ? `из ${limitGb.toFixed(0)}` : 'безлимит'} />
              )}
            </div>

            {/* Traffic bar */}
            {usedGb !== null && limitGb && (
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg)' }}>
                <div className="h-full rounded-full" style={{ width: `${trafficPct}%`, background: 'var(--accent-gradient)' }} />
              </div>
            )}

            {/* QR + Link */}
            <div className="flex flex-col sm:flex-row items-center gap-5">
              <div className="p-3 rounded-2xl flex-shrink-0" style={{ background: 'rgba(255,255,255,0.95)' }}>
                <QRCodeSVG value={sub.subUrl} size={120} bgColor="transparent" fgColor="#1a1a2e" />
              </div>
              <div className="flex-1 w-full space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-xl"
                     style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <p className="flex-1 text-xs font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>{sub.subUrl}</p>
                  <button onClick={() => copyText(sub.subUrl, 'sub')} className="p-2 rounded-lg hover:bg-white/5">
                    {copied === 'sub' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setShowRevoke(true)}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all"
                          style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                    <RefreshCw className="w-3.5 h-3.5" /> Обновить ссылку
                  </button>
                  <Link href="/dashboard/instructions"
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all"
                        style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', color: 'var(--accent-1)' }}>
                    <Smartphone className="w-3.5 h-3.5" /> Настроить устройство
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center gradient-border"
                 style={{ background: 'rgba(6,182,212,0.05)' }}>
              <Shield className="w-8 h-8" style={{ color: 'var(--text-tertiary)' }} />
            </div>
            <p style={{ color: 'var(--text-tertiary)' }}>Нет активной подписки</p>
          </div>
        )}
      </div>

      {/* ═══════ ТАРИФЫ (всегда видны) ═══════ */}
      <div className="glass-card animate-slide-up" style={{ animationDelay: '50ms' }}>
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <CreditCard className="w-5 h-5" style={{ color: 'var(--accent-1)' }} /> Тарифы
        </h2>
        {tariffs.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tariffs.map((t: any) => (
              <div key={t.id} className="rounded-xl p-4 flex flex-col"
                   style={{ background: 'var(--glass-bg)', border: t.isFeatured ? '1px solid rgba(6,182,212,0.3)' : '1px solid var(--glass-border)' }}>
                {t.isFeatured && <span className="badge-blue text-[10px] w-fit mb-2"><Zap className="w-3 h-3" /> Популярный</span>}
                <p className="font-semibold">{t.name}</p>
                <p className="text-xl font-bold mt-1">{t.priceRub.toLocaleString('ru')} ₽</p>
                {t.priceUsdt && <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>≈ ${t.priceUsdt} USDT</p>}
                <div className="text-xs mt-2 space-y-1 flex-1" style={{ color: 'var(--text-secondary)' }}>
                  <p>{t.durationDays} дней · {t.deviceLimit === 0 ? 'безлимит' : t.deviceLimit} устр. · {t.trafficGb ? `${t.trafficGb} ГБ` : 'безлимит'}</p>
                </div>
                <button onClick={() => { setPayTariff(t); setProvider('YUKASSA') }}
                        className="btn-primary text-xs py-2 w-full justify-center mt-3">Оплатить</button>
              </div>
            ))}
          </div>
        ) : <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Загрузка...</p>}
      </div>

      {/* ═══════ РЕФЕРАЛЫ И БАЛАНС (всегда видны) ═══════ */}
      <div className="grid sm:grid-cols-2 gap-4 animate-slide-up" style={{ animationDelay: '100ms' }}>
        {/* Referral */}
        <div className="glass-card">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Users className="w-5 h-5" style={{ color: 'var(--accent-1)' }} /> Рефералы
          </h2>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <MiniStat label="Всего" value={referral?.referrals?.length ?? referralCount} />
            <MiniStat label="Оплатили" value={referral?.referrals?.filter((r: any) => r.hasPaid).length ?? 0} />
            <MiniStat label="Бонус дн." value={referral?.bonusDaysEarned ?? bonusDaysEarned} color="#34d399" />
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
            <p className="flex-1 text-[10px] font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>{referralUrl}</p>
            <button onClick={() => copyText(referralUrl, 'ref')} className="p-1.5 rounded-lg hover:bg-white/5">
              {copied === 'ref' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />}
            </button>
          </div>
          {referral?.referrals?.length > 0 && (
            <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
              {referral.referrals.slice(0, 5).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between text-xs py-1" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <span>{r.displayName}</span>
                  <span className={r.hasPaid ? 'text-emerald-400' : ''} style={!r.hasPaid ? { color: 'var(--text-tertiary)' } : undefined}>{r.hasPaid ? 'Оплатил' : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Balance */}
        <div className="glass-card">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Wallet className="w-5 h-5" style={{ color: 'var(--accent-1)' }} /> Баланс
          </h2>
          <p className="text-3xl font-extrabold">{(balance?.balance ?? 0).toFixed(2)} <span className="text-sm font-normal" style={{ color: 'var(--text-tertiary)' }}>₽</span></p>
          {balance?.history?.length > 0 && (
            <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
              {balance.history.slice(0, 5).map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between text-xs py-1" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <div className="flex items-center gap-1.5">
                    {tx.amount >= 0 ? <ArrowDownLeft className="w-3 h-3 text-emerald-400" /> : <ArrowUpRight className="w-3 h-3 text-red-400" />}
                    <span style={{ color: 'var(--text-secondary)' }}>{tx.description || tx.type}</span>
                  </div>
                  <span className={tx.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}>{tx.amount >= 0 ? '+' : ''}{tx.amount} ₽</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══════ УСТРОЙСТВА (сворачиваемый) ═══════ */}
      <Collapsible title="Устройства" icon={<Smartphone className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />}
                   count={devices.length || undefined} open={showDevices} toggle={() => setShowDevices(!showDevices)}>
        {devices.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>Нет подключённых устройств</p>
        ) : (
          <div className="space-y-2">
            {devices.map((d: any) => (
              <div key={d.hwid} className="flex items-center gap-3 p-3 rounded-xl"
                   style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                     style={{ background: 'rgba(6,182,212,0.08)' }}>
                  <Smartphone className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{d.deviceModel || d.platform || 'Устройство'}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {[d.platform, d.osVersion ? `v${d.osVersion}` : null].filter(Boolean).join(' ')}
                    {d.userAgent && (() => { const p = d.userAgent.split('/'); return <span style={{ color: 'var(--text-tertiary)' }}> · {p[0]} {p[1] || ''}</span> })()}
                  </p>
                </div>
                <button onClick={() => handleDeleteDevice(d.hwid)} className="p-2 rounded-lg hover:bg-red-500/10" title="Удалить">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Collapsible>

      {/* ═══════ НОВОСТИ (сворачиваемый) ═══════ */}
      <Collapsible title="Новости и акции" icon={<Newspaper className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />}
                   count={news.length || undefined} open={showNews} toggle={() => setShowNews(!showNews)}>
        {news.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>Нет новостей</p>
        ) : (
          <div className="space-y-3">
            {news.map((n: any) => (
              <div key={n.id} className="p-3 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={n.type === 'PROMOTION' ? 'badge-violet' : 'badge-blue'}>{n.type === 'PROMOTION' ? 'Акция' : 'Новость'}</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{new Date(n.publishedAt).toLocaleDateString('ru')}</span>
                </div>
                <p className="text-sm font-semibold">{n.title}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{n.content?.slice(0, 100)}{n.content?.length > 100 ? '...' : ''}</p>
                {n.buttons?.length > 0 && (
                  <a href={n.buttons[0].url} target="_blank" rel="noopener"
                     className="inline-flex items-center gap-1 text-xs mt-2 transition-opacity hover:opacity-80" style={{ color: 'var(--accent-1)' }}>
                    Подробнее <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Collapsible>

      {/* ═══════ ПРОКСИ (сворачиваемый) ═══════ */}
      <Collapsible title="Бесплатные прокси TG" icon={<Wifi className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />}
                   count={proxies.length || undefined} open={showProxies} toggle={() => setShowProxies(!showProxies)}>
        {proxies.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>Прокси не добавлены</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {proxies.map((p: any) => (
              <div key={p.id} className="p-3 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <p className="text-sm font-semibold">{p.name}</p>
                {p.description && <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{p.description}</p>}
                {p.tgLink && (
                  <a href={p.tgLink} target="_blank" rel="noopener" className="btn-primary text-xs py-1.5 px-3 mt-2 inline-flex">
                    <Send className="w-3 h-3" /> Открыть в TG
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Collapsible>

      {/* ═══════ PAYMENT MODAL ═══════ */}
      {payTariff && (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPayTariff(null)} />
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto rounded-2xl p-6 space-y-4 animate-scale-in"
               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
            <h3 className="font-semibold text-lg">Оплата</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {payTariff.name} — <strong>{payTariff.priceRub} ₽</strong>
            </p>
            <div className="flex gap-2">
              {['YUKASSA', 'CRYPTOPAY'].map(p => (
                <button key={p} onClick={() => setProvider(p as any)}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                        style={{
                          background: provider === p ? 'rgba(6,182,212,0.1)' : 'var(--glass-bg)',
                          border: `1px solid ${provider === p ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                          color: provider === p ? 'var(--accent-1)' : 'var(--text-secondary)',
                        }}>
                  {p === 'YUKASSA' ? 'Карта / СБП' : 'Крипто'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPayTariff(null)} className="btn-secondary flex-1 justify-center text-sm">Отмена</button>
              <button onClick={handleBuy} disabled={paying} className="btn-primary flex-1 justify-center text-sm">
                {paying ? 'Переход...' : 'Оплатить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ REVOKE CONFIRMATION ═══════ */}
      {showRevoke && (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowRevoke(false)} />
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto rounded-2xl p-6 space-y-4 animate-scale-in"
               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
            <h3 className="font-semibold">Обновить ссылку подписки?</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Старая ссылка перестанет работать. Подписку нужно будет добавить заново в приложение.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowRevoke(false)} className="btn-secondary flex-1 justify-center text-sm">Отмена</button>
              <button onClick={handleRevoke} disabled={revoking} className="btn-danger flex-1 justify-center text-sm">
                {revoking ? 'Обновляю...' : 'Обновить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Helper components ── */

function MiniStat({ label, value, sub, color }: { label: string; value: any; sub?: string; color?: string }) {
  return (
    <div className="p-3 rounded-xl text-center" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      <p className="text-lg font-bold mt-0.5" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>}
    </div>
  )
}

function Collapsible({ title, icon, count, open, toggle, children }: {
  title: string; icon: React.ReactNode; count?: number
  open: boolean; toggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="glass-card">
      <button onClick={toggle} className="w-full flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2">
          {icon} {title}
          {count !== undefined && count > 0 && (
            <span className="text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: 'var(--glass-bg)', color: 'var(--text-tertiary)' }}>{count}</span>
          )}
        </h2>
        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--text-tertiary)' }} />
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="h-8 skeleton w-64 rounded-xl" />
      <div className="h-80 skeleton rounded-2xl" />
      <div className="h-48 skeleton rounded-2xl" />
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="h-40 skeleton rounded-2xl" />
        <div className="h-40 skeleton rounded-2xl" />
      </div>
    </div>
  )
}
