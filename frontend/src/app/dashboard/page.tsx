'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Shield, Zap, Users, Clock, Copy, CheckCircle2, Wifi, Smartphone, Globe,
  Gift, Newspaper, CreditCard, Send, Trash2, RefreshCw, ExternalLink,
  Wallet, ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, ChevronDown, X,
  Share2, QrCode, BookOpen, Tag,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import toast from 'react-hot-toast'

/* ════════════════════════════════════════════════════════════════════
   DASHBOARD PAGE
   ════════════════════════════════════════════════════════════════════ */

export default function DashboardPage() {
  /* ── state ── */
  const [data, setData]       = useState<any>(null)
  const [sub, setSub]         = useState<any>(null)
  const [tariffs, setTariffs] = useState<any[]>([])
  const [referral, setRef]    = useState<any>(null)
  const [balance, setBal]     = useState<any>(null)
  const [news, setNews]       = useState<any[]>([])
  const [proxies, setProxies] = useState<any[]>([])
  const [myGifts, setMyGifts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState<string | null>(null)

  /* ── modals ── */
  const [showShare, setShowShare]       = useState(false)
  const [showDevices, setShowDevices]   = useState(false)
  const [showRevoke, setShowRevoke]     = useState(false)
  const [showTariffs, setShowTariffs]   = useState(false)
  const [payTariff, setPayTariff]       = useState<any>(null)
  const [provider, setProvider]         = useState<'YUKASSA' | 'CRYPTOPAY' | 'BALANCE'>('YUKASSA')
  const [paying, setPaying]             = useState(false)
  const [revoking, setRevoking]         = useState(false)
  const [devices, setDevices]           = useState<any[]>([])

  /* ── variant / configurator state ── */
  const [selectedVariantIdx, setSelectedVariantIdx] = useState<number>(0)
  const [cfgValues, setCfgValues] = useState<{ trafficGb: number; days: number; devices: number }>({ trafficGb: 50, days: 30, devices: 3 })

  /* ── gift modal ── */
  const [giftTariff, setGiftTariff]           = useState<any>(null)
  const [giftProvider, setGiftProvider]       = useState<'YUKASSA' | 'CRYPTOPAY' | 'BALANCE'>('YUKASSA')
  const [giftPaying, setGiftPaying]           = useState(false)
  const [giftLink, setGiftLink]               = useState<string | null>(null)

  /* ── topup modal ── */
  const [showTopup, setShowTopup]       = useState(false)
  const [showRedeem, setShowRedeem]     = useState(false)
  const [redeemDays, setRedeemDays]     = useState(1)
  const [redeeming, setRedeeming]       = useState(false)
  const [topupAmount, setTopupAmount]   = useState(100)
  const [topupProvider, setTopupProvider] = useState<'YUKASSA' | 'CRYPTOPAY'>('YUKASSA')

  /* ── bonus days modal ── */
  const [showBonusRedeem, setShowBonusRedeem] = useState(false)
  const [bonusRedeemDays, setBonusRedeemDays] = useState(1)
  const [bonusRedeeming, setBonusRedeeming]   = useState(false)

  /* ── public config ── */
  const [config, setConfig] = useState<any>({})

  /* ── news carousel ── */
  const [newsIdx, setNewsIdx] = useState(0)
  const touchStartX = useRef(0)

  /* ── initial load ── */
  useEffect(() => {
    Promise.all([
      fetch('/api/user/dashboard', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/user/subscription', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/public/tariffs', { credentials: 'include' }).then(r => r.json()).catch(() => []),
      fetch('/api/user/referral', { credentials: 'include' }).then(r => r.json()).catch(() => null),
      fetch('/api/user/balance', { credentials: 'include' }).then(r => r.json()).catch(() => null),
      fetch('/api/news?limit=6', { credentials: 'include' }).then(r => r.json()).then(d => d.news || d || []).catch(() => []),
      fetch('/api/proxies', { credentials: 'include' }).then(r => r.json()).catch(() => []),
      fetch('/api/user/devices', { credentials: 'include' }).then(r => r.json()).then(d => d.devices || []).catch(() => []),
      fetch('/api/gifts/my', { credentials: 'include' }).then(r => r.json()).catch(() => []),
      fetch('/api/public/config').then(r => r.json()).catch(() => ({})),
    ]).then(([d, s, t, r, b, n, p, dev, gifts, cfg]) => {
      setData(d); setSub(s); setTariffs(t); setRef(r); setBal(b); setNews(n); setProxies(p); setDevices(dev); setMyGifts(Array.isArray(gifts) ? gifts : []); setConfig(cfg || {})
    }).finally(() => setLoading(false))
  }, [])

  /* devices loaded in initial Promise.all */

  /* ── helpers ── */
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
      // Build extra params for variants/configurator
      const extra: any = {}
      if (payTariff.mode === 'variants') {
        extra.variantIndex = selectedVariantIdx
      }
      if (payTariff.mode === 'configurator') {
        extra.config = { ...cfgValues }
      }

      if (provider === 'BALANCE') {
        const res = await fetch('/api/user/balance/purchase', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tariffId: payTariff.id, ...extra }),
        })
        const d = await res.json()
        if (!res.ok) {
          toast.error(d.error || 'Недостаточно средств на балансе')
        } else {
          toast.success('Оплата прошла успешно')
          window.location.reload()
        }
      } else {
        const res = await fetch('/api/payments/create', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tariffId: payTariff.id, provider, ...extra }),
        })
        const d = await res.json()
        if (d.paymentUrl) window.location.href = d.paymentUrl
        else throw new Error(d.error || 'Ошибка')
      }
    } catch (e: any) { toast.error(e.message) }
    finally { setPaying(false) }
  }

  const handleTopup = async () => {
    if (topupAmount < 50) {
      toast.error('Минимальная сумма — 50 ₽')
      return
    }
    try {
      const res = await fetch('/api/user/balance/topup', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: topupAmount, provider: topupProvider }),
      })
      const d = await res.json()
      if (d.paymentUrl) window.location.href = d.paymentUrl
      else toast.error(d.error || 'Ошибка')
    } catch { toast.error('Ошибка') }
  }

  const handleGiftBuy = async () => {
    if (!giftTariff) return
    setGiftPaying(true)
    try {
      const res = await fetch('/api/gifts/create', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tariffId: giftTariff.id, provider: giftProvider }),
      })
      const d = await res.json()
      if (giftProvider === 'BALANCE') {
        if (d.ok) {
          setGiftLink(d.giftUrl)
          toast.success('Подарок создан!')
        } else {
          toast.error(d.error || 'Ошибка')
        }
      } else {
        if (d.paymentUrl) window.location.href = d.paymentUrl
        else toast.error(d.error || 'Ошибка')
      }
    } catch (e: any) { toast.error(e.message) }
    finally { setGiftPaying(false) }
  }

  const shareProxy = (proxy: any) => {
    const link = proxy.tgLink || proxy.httpsLink || ''
    if (navigator.share) {
      navigator.share({ title: proxy.name, text: `Бесплатный прокси для Telegram: ${proxy.name}`, url: link }).catch(() => {})
    } else {
      navigator.clipboard.writeText(link)
      toast.success('Ссылка скопирована')
    }
  }

  /* ── news carousel helpers ── */
  const getPerPage = () => typeof window !== 'undefined' && window.innerWidth < 768 ? 1 : 2
  const perPage = typeof window !== 'undefined' ? getPerPage() : 2

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      if (diff > 0 && newsIdx + perPage < news.length) setNewsIdx(i => i + 1)
      if (diff < 0 && newsIdx > 0) setNewsIdx(i => i - 1)
    }
  }

  /* ── loading skeleton ── */
  if (loading) return <DashboardSkeleton />
  if (!data) return null

  /* ── derived ── */
  const { user, rmStats, referralUrl, referralCount, bonusDaysEarned } = data
  const isActive = user.subStatus === 'ACTIVE'
  const daysLeft = user.subExpireAt
    ? Math.max(0, Math.ceil((new Date(user.subExpireAt).getTime() - Date.now()) / 86400_000))
    : null
  const usedGb  = rmStats ? (rmStats.usedTrafficBytes / 1e9) : null
  const limitGb = rmStats?.trafficLimitBytes ? (rmStats.trafficLimitBytes / 1e9) : null
  const trafficPct = usedGb !== null && limitGb ? Math.min(100, (usedGb / limitGb) * 100) : 0

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">

      {/* ═══════ HEADER ═══════ */}
      <div className="animate-slide-up">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          {user.telegramName
            ? <>Привет, <span className="text-gradient">{user.telegramName}</span></>
            : <span className="text-gradient">Добро пожаловать</span>}
        </h1>
      </div>

      {/* ═══════ 1. SUBSCRIPTION BLOCK ═══════ */}
      <div className="glass-card gradient-border animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Shield className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />
            Подписка
          </h2>
          <span className={isActive ? 'badge-green' : 'badge-gray'}>
            {isActive && <span className="glow-dot text-emerald-400 mr-1.5" />}
            {isActive ? 'Активна' : 'Неактивна'}
          </span>
        </div>

        {sub?.subUrl ? (
          <div className="space-y-5">
            {/* Stats row — always 2x2 grid */}
            <div className="grid grid-cols-2 gap-2.5">
              <MiniStat icon={<Clock className="w-3.5 h-3.5" />} label="Осталось" value={daysLeft !== null ? `${daysLeft} дн.` : '—'} />
              <MiniStat icon={<Shield className="w-3.5 h-3.5" />} label="Оплачено до" value={user.subExpireAt ? new Date(user.subExpireAt).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'} />
              <MiniStat icon={<Zap className="w-3.5 h-3.5" />} label="Трафик" value={usedGb !== null ? `${usedGb.toFixed(1)} ГБ` : '∞'} sub={limitGb ? `/ ${limitGb.toFixed(0)}` : 'безлимит'} />
              <MiniStat icon={<Smartphone className="w-3.5 h-3.5" />} label="Устройств" value={devices.length || '—'} />
            </div>

            {/* Traffic bar */}
            {usedGb !== null && limitGb && (
              <div>
                <div className="flex justify-between text-[10px] mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                  <span>Использовано</span>
                  <span>{trafficPct.toFixed(0)}%</span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <div className="h-full rounded-full transition-all duration-700 ease-out"
                       style={{
                         width: `${trafficPct}%`,
                         background: trafficPct > 85 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'var(--accent-gradient)',
                       }} />
                </div>
              </div>
            )}

            {/* Action buttons moved below tariff button */}

            {/* Devices — inline expandable */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>
              <button onClick={() => setShowDevices(!showDevices)}
                      className="w-full flex items-center justify-between px-4 py-3 transition-all hover:bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />
                  <span className="text-sm font-medium">Мои устройства</span>
                  {devices.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{ background: 'var(--glass-bg)', color: 'var(--text-tertiary)' }}>{devices.length}</span>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showDevices ? 'rotate-180' : ''}`}
                             style={{ color: 'var(--text-tertiary)' }} />
              </button>
              {showDevices && (
                <div className="px-4 pb-4 space-y-2">
                  {devices.length === 0 ? (
                    <p className="text-xs py-3 text-center" style={{ color: 'var(--text-tertiary)' }}>Нет подключённых устройств</p>
                  ) : devices.map((d: any) => {
                    const uaParts = d.userAgent ? d.userAgent.split('/') : []
                    return (
                      <div key={d.hwid} className="flex items-center gap-3 p-2.5 rounded-xl"
                           style={{ background: 'var(--glass-bg)' }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                             style={{ background: 'rgba(6,182,212,0.08)' }}>
                          <Smartphone className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold">{d.deviceModel || d.platform || 'Устройство'}</p>
                          <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                            {[d.platform, d.osVersion].filter(Boolean).join(' ')}
                            {uaParts.length >= 2 && ` · ${uaParts[0]} ${uaParts[1]}`}
                          </p>
                        </div>
                        <button onClick={() => handleDeleteDevice(d.hwid)}
                                className="p-1.5 rounded-lg hover:bg-red-500/10" title="Удалить">
                          <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--danger)' }} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-10 text-center space-y-4">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center gradient-border animate-float"
                 style={{ background: 'rgba(6,182,212,0.05)' }}>
              <Shield className="w-10 h-10" style={{ color: 'var(--text-tertiary)' }} />
            </div>
            <p className="text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>Нет подписки</p>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Выберите тариф, чтобы начать</p>
            <button onClick={() => setShowTariffs(true)} className="btn-primary px-8 py-3">
              <CreditCard className="w-4 h-4" /> Выбрать тариф
            </button>
          </div>
        )}
      </div>

      {/* ═══════ 2. TARIFF BUTTON ═══════ */}
      <div className="animate-slide-up" style={{ animationDelay: '50ms' }}>
        <button onClick={() => setShowTariffs(true)}
                className="w-full py-4 rounded-2xl text-base font-semibold transition-all duration-300 flex items-center justify-center gap-3"
                style={{
                  background: 'var(--accent-gradient)',
                  boxShadow: '0 4px 20px rgba(6,182,212,0.3), 0 0 60px rgba(6,182,212,0.08)',
                  color: '#fff',
                }}>
          <CreditCard className="w-5 h-5" />
          Выбрать тариф
        </button>
        <Link href="/dashboard/instructions"
              className="w-full py-3.5 rounded-2xl text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 mt-2"
              style={{
                background: 'rgba(139,92,246,0.08)',
                border: '1px solid rgba(139,92,246,0.2)',
                color: '#a78bfa',
              }}>
          <Smartphone className="w-[18px] h-[18px]" /> Подключить VPN
        </Link>
        <button onClick={() => setShowShare(true)}
                className="w-full py-3.5 rounded-2xl text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 mt-2"
                style={{
                  background: 'rgba(6,182,212,0.06)',
                  border: '1px solid rgba(6,182,212,0.15)',
                  color: 'var(--accent-1)',
                }}>
          <Share2 className="w-[18px] h-[18px]" /> Поделиться подпиской
        </button>
      </div>

      {/* ═══════ 3. REFERRALS + BALANCE — single column ═══════ */}
      <div className="space-y-4 animate-slide-up" style={{ animationDelay: '100ms' }}>
        {/* Referral block */}
        <div className="glass-card !p-4">
          <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <Users className="w-4 h-4" style={{ color: 'var(--accent-1)' }} /> Реферальная программа
          </h3>
          <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
            Приглашайте друзей по вашей ссылке. За каждого оплатившего друга вы получите +{config.referralBonusDays || 30} дней к своей подписке. Чем больше друзей — тем больше бонусов!
          </p>
          <div className="flex items-center gap-3 mb-3">
            <div className="text-center flex-1">
              <p className="text-xl font-bold">{referral?.referrals?.length ?? referralCount ?? 0}</p>
              <p className="text-[9px] uppercase" style={{ color: 'var(--text-tertiary)' }}>приглашено</p>
            </div>
            <div className="w-px h-8" style={{ background: 'var(--glass-border)' }} />
            <div className="text-center flex-1">
              <p className="text-xl font-bold" style={{ color: 'var(--success)' }}>{referral?.referrals?.filter((r: any) => r.hasPaid).length ?? 0}</p>
              <p className="text-[9px] uppercase" style={{ color: 'var(--text-tertiary)' }}>оплатили</p>
            </div>
            <div className="w-px h-8" style={{ background: 'var(--glass-border)' }} />
            <div className="text-center flex-1">
              <p className="text-xl font-bold" style={{ color: 'var(--accent-1)' }}>+{referral?.bonusDaysEarned ?? bonusDaysEarned ?? 0}</p>
              <p className="text-[9px] uppercase" style={{ color: 'var(--text-tertiary)' }}>бонус дней</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 p-2.5 rounded-xl mb-3"
               style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
            <p className="flex-1 text-[10px] font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>{referralUrl}</p>
            <button onClick={() => {
              if (navigator.share) {
                navigator.share({ title: 'HIDEYOU VPN', text: 'Присоединяйся к HIDEYOU VPN!', url: referralUrl }).catch(() => {})
              } else {
                copyText(referralUrl, 'ref')
              }
            }} className="p-1.5 rounded-lg hover:bg-white/5 flex-shrink-0">
              {copied === 'ref' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" style={{ color: 'var(--accent-1)' }} />}
            </button>
            <button onClick={() => copyText(referralUrl, 'ref')} className="p-1.5 rounded-lg hover:bg-white/5 flex-shrink-0">
              {copied === 'ref' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />}
            </button>
          </div>

          {/* Redeem days button */}
          {(referral?.bonusDaysEarned ?? bonusDaysEarned ?? 0) > 0 && (
            <button onClick={() => { setShowRedeem(true); setRedeemDays(Math.min(referral?.bonusDaysEarned ?? bonusDaysEarned ?? 1, 30)) }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all"
                    style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--success)' }}>
              <Zap className="w-3.5 h-3.5" /> Использовать {referral?.bonusDaysEarned ?? bonusDaysEarned} дней
            </button>
          )}
        </div>

        {/* Bonus days from admin */}
        {(data.bonusDays ?? 0) > 0 && (
          <div className="glass-card !p-4">
            <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
              <Gift className="w-4 h-4" style={{ color: '#fbbf24' }} /> Бонусные дни
            </h3>
            <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
              Начислены администратором. Используйте для продления подписки.
            </p>
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl font-bold" style={{ color: '#fbbf24' }}>{data.bonusDays}</span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>дней доступно</span>
            </div>
            <button onClick={() => { setShowBonusRedeem(true); setBonusRedeemDays(Math.min(data.bonusDays, 30)) }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all"
                    style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
              <Zap className="w-3.5 h-3.5" /> Использовать дни
            </button>
          </div>
        )}

        {/* Balance block */}
        <div className="glass-card !p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Wallet className="w-4 h-4" style={{ color: 'var(--accent-1)' }} /> Баланс
          </h3>
          <div className="flex items-center gap-3 mb-3">
            <p className="text-2xl font-extrabold">
              {(balance?.balance ?? 0).toFixed(2)}
              <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>₽</span>
            </p>
            <button onClick={() => setShowTopup(true)}
                    className="btn-primary text-xs px-4 py-2">
              Пополнить
            </button>
          </div>
          {balance?.history?.length > 0 && (
            <div className="space-y-0.5 max-h-24 overflow-y-auto">
              {balance.history.slice(0, 3).map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between text-[11px] py-1">
                  <span className="truncate" style={{ color: 'var(--text-tertiary)' }}>{tx.description || tx.type}</span>
                  <span className="flex-shrink-0 font-medium ml-2"
                        style={{ color: tx.amount >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {tx.amount >= 0 ? '+' : ''}{tx.amount}₽
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══════ 3.5. MY GIFTS ═══════ */}
      {myGifts.filter((g: any) => g.status === 'PENDING' || g.status === 'CLAIMED').length > 0 && (
        <div className="glass-card !p-4 animate-slide-up">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Gift className="w-4 h-4" style={{ color: 'var(--accent-1)' }} /> Мои подарки
          </h3>
          <div className="space-y-2">
            {myGifts
              .filter((g: any) => g.status === 'PENDING' || g.status === 'CLAIMED')
              .map((g: any) => {
                const daysUntilExpiry = g.expiresAt ? Math.max(0, Math.ceil((new Date(g.expiresAt).getTime() - Date.now()) / 86400000)) : null
                return (
                  <div key={g.id} className="p-3 rounded-xl"
                       style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-medium">{g.tariff?.name || 'Подписка'}</p>
                      <span className={g.status === 'PENDING' ? 'badge-yellow' : 'badge-green'}>
                        {g.status === 'PENDING' ? 'Ожидает' : 'Активирован'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                        {g.status === 'PENDING'
                          ? `Ссылка действует до: ${new Date(g.expiresAt).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' })}${daysUntilExpiry !== null ? ` (${daysUntilExpiry} дн.)` : ''}`
                          : `Получил: ${g.recipientUser?.telegramName || g.recipientUser?.email || '—'}${g.claimedAt ? ' · ' + new Date(g.claimedAt).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}`}
                      </p>
                      {g.status === 'PENDING' && (
                        <button onClick={() => {
                          const link = `${window.location.origin}/present/${g.giftCode}`
                          if (navigator.share) {
                            navigator.share({ title: 'Подарок HIDEYOU VPN', url: link }).catch(() => {})
                          } else {
                            navigator.clipboard.writeText(link)
                            toast.success('Ссылка скопирована')
                          }
                        }} className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg transition-all hover:bg-white/5"
                           style={{ color: 'var(--accent-1)' }}>
                          <Share2 className="w-3 h-3" /> Отправить
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* ═══════ 4. NEWS & PROMOTIONS CAROUSEL ═══════ */}
      {news.length > 0 && (
        <div className="glass-card animate-slide-up" style={{ animationDelay: '150ms' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Newspaper className="w-5 h-5" style={{ color: 'var(--accent-1)' }} /> Новости и акции
            </h2>
            {news.length > perPage && (
              <div className="flex items-center gap-1">
                <button onClick={() => setNewsIdx(i => Math.max(0, i - 1))}
                        disabled={newsIdx === 0}
                        className="p-1.5 rounded-lg transition-all disabled:opacity-30"
                        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                </button>
                <button onClick={() => setNewsIdx(i => Math.min(news.length - perPage, i + 1))}
                        disabled={newsIdx + perPage >= news.length}
                        className="p-1.5 rounded-lg transition-all disabled:opacity-30"
                        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>
            )}
          </div>
          <div className="overflow-hidden"
               onTouchStart={handleTouchStart}
               onTouchEnd={handleTouchEnd}>
            <div className={`grid gap-3 ${perPage === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {news.slice(newsIdx, newsIdx + perPage).map((n: any) => (
                <div key={n.id} className="p-4 rounded-xl transition-all duration-300"
                     style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={n.type === 'PROMOTION' ? 'badge-violet' : 'badge-blue'}>
                      {n.type === 'PROMOTION' ? <><Tag className="w-3 h-3 mr-1" />Акция</> : <><Newspaper className="w-3 h-3 mr-1" />Новость</>}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(n.publishedAt).toLocaleDateString('ru')}
                    </span>
                  </div>
                  <p className="text-sm font-semibold mb-1">{n.title}</p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {n.content?.slice(0, 80)}{n.content?.length > 80 ? '...' : ''}
                  </p>
                  {n.buttons?.[0]?.url && (
                    <a href={n.buttons[0].url} target="_blank" rel="noopener"
                       className="inline-flex items-center gap-1 text-xs mt-2.5 font-medium transition-opacity hover:opacity-80"
                       style={{ color: 'var(--accent-1)' }}>
                      Подробнее <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
            {/* Dots indicator */}
            {news.length > perPage && (
              <div className="flex justify-center gap-1.5 mt-3">
                {Array.from({ length: news.length - perPage + 1 }).map((_, i) => (
                  <button key={i} onClick={() => setNewsIdx(i)}
                          className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                          style={{
                            background: i === newsIdx ? 'var(--accent-1)' : 'var(--glass-border)',
                            width: i === newsIdx ? '16px' : '6px',
                          }} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════ 5. FREE PROXIES ═══════ */}
      {proxies.length > 0 && (
        <div className="glass-card animate-slide-up" style={{ animationDelay: '200ms' }}>
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Wifi className="w-5 h-5" style={{ color: 'var(--accent-1)' }} /> Бесплатные прокси TG
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
            {proxies.map((p: any) => (
              <div key={p.id} className="flex-shrink-0 w-52 p-3.5 rounded-xl transition-all duration-300"
                   style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm font-semibold truncate">{p.name}</p>
                  {p.tag && <span className="badge-blue text-[10px] flex-shrink-0">{p.tag}</span>}
                </div>
                {p.description && (
                  <p className="text-[11px] mb-2.5 line-clamp-2" style={{ color: 'var(--text-tertiary)' }}>{p.description}</p>
                )}
                <div className="flex items-center gap-1.5">
                  {p.tgLink && (
                    <a href={p.tgLink} target="_blank" rel="noopener"
                       className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                       style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--accent-1)', border: '1px solid rgba(6,182,212,0.15)' }}>
                      <Send className="w-3 h-3" /> Открыть в TG
                    </a>
                  )}
                  <button onClick={() => shareProxy(p)}
                          className="inline-flex items-center justify-center p-1.5 rounded-lg transition-all"
                          style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
                          title="Поделиться">
                    <Share2 className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
         MODALS
         ═══════════════════════════════════════════════════════════════ */}

      {/* ── SHARE MODAL ── */}
      {showShare && sub?.subUrl && (
        <Modal close={() => setShowShare(false)}>
          <div className="space-y-5">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <QrCode className="w-5 h-5" style={{ color: 'var(--accent-1)' }} /> Поделиться подпиской
            </h3>

            {/* QR */}
            <div className="flex justify-center">
              <div className="p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.95)' }}>
                <QRCodeSVG value={sub.subUrl} size={160} bgColor="transparent" fgColor="#1a1a2e" />
              </div>
            </div>

            <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Отсканируйте QR-код на другом устройстве через приложение Happ (кнопка +) или камерой телефона
            </p>

            {/* Copy link */}
            <div>
              <p className="text-[11px] font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>
                Или отправьте эту ссылку на другое устройство
              </p>
              <div className="flex items-center gap-2 p-3 rounded-xl"
                   style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <p className="flex-1 text-[11px] font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>{sub.subUrl}</p>
                <button onClick={() => copyText(sub.subUrl, 'share-sub')} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
                  {copied === 'share-sub' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── DEVICES BOTTOM SHEET ── */}
      {/* Devices popup removed — now inline expandable in subscription block */}

      {/* ── REVOKE CONFIRMATION MODAL ── */}
      {showRevoke && (
        <Modal close={() => setShowRevoke(false)}>
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto"
                 style={{ background: 'rgba(245,158,11,0.1)' }}>
              <RefreshCw className="w-6 h-6" style={{ color: 'var(--warning)' }} />
            </div>
            <h3 className="font-semibold text-center text-lg">Обновить ссылку подписки?</h3>
            <p className="text-sm text-center leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Старая ссылка перестанет работать. Подписку нужно будет добавить заново в приложение на всех устройствах.
            </p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowRevoke(false)} className="btn-secondary flex-1 justify-center text-sm">Отмена</button>
              <button onClick={handleRevoke} disabled={revoking} className="btn-danger flex-1 justify-center text-sm">
                {revoking ? 'Обновляю...' : 'Обновить'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── REDEEM DAYS MODAL ── */}
      {showRedeem && (
        <Modal close={() => setShowRedeem(false)}>
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto"
                 style={{ background: 'rgba(16,185,129,0.1)' }}>
              <Zap className="w-6 h-6" style={{ color: 'var(--success)' }} />
            </div>
            <h3 className="font-semibold text-center text-lg">Использовать бонусные дни</h3>
            <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
              Доступно: <strong style={{ color: 'var(--success)' }}>{referral?.bonusDaysEarned ?? bonusDaysEarned ?? 0} дней</strong>
            </p>
            <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
              Дни будут добавлены к вашей подписке. Настройки возьмутся из базового тарифа.
            </p>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Сколько дней использовать?</label>
              <input type="number" className="glass-input text-center text-lg font-bold"
                     value={redeemDays}
                     onChange={e => setRedeemDays(Math.max(1, Math.min(referral?.bonusDaysEarned ?? bonusDaysEarned ?? 1, Number(e.target.value))))}
                     min={1} max={referral?.bonusDaysEarned ?? bonusDaysEarned ?? 1} />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowRedeem(false)} className="btn-secondary flex-1 justify-center text-sm">Отмена</button>
              <button disabled={redeeming || redeemDays < 1}
                      onClick={async () => {
                        setRedeeming(true)
                        try {
                          const res = await fetch('/api/user/referral/redeem', {
                            method: 'POST', credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ days: redeemDays }),
                          })
                          const d = await res.json()
                          if (!res.ok) throw new Error(d.error || 'Ошибка')
                          toast.success(`+${redeemDays} дней добавлено к подписке!`)
                          setShowRedeem(false)
                          window.location.reload()
                        } catch (e: any) { toast.error(e.message) }
                        finally { setRedeeming(false) }
                      }}
                      className="btn-primary flex-1 justify-center text-sm"
                      style={{ background: 'var(--success)' }}>
                {redeeming ? 'Списываю...' : `Списать ${redeemDays} дней`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── BONUS DAYS REDEEM MODAL ── */}
      {showBonusRedeem && (
        <Modal close={() => setShowBonusRedeem(false)}>
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto"
                 style={{ background: 'rgba(251,191,36,0.1)' }}>
              <Gift className="w-6 h-6" style={{ color: '#fbbf24' }} />
            </div>
            <h3 className="font-semibold text-center text-lg">Использовать бонусные дни</h3>
            <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
              Доступно: <strong style={{ color: '#fbbf24' }}>{data.bonusDays ?? 0} дней</strong>
            </p>
            <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
              Дни будут добавлены к вашей подписке. Настройки возьмутся из базового тарифа.
            </p>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Сколько дней использовать?</label>
              <input type="number" className="glass-input text-center text-lg font-bold"
                     value={bonusRedeemDays}
                     onChange={e => setBonusRedeemDays(Math.max(1, Math.min(data.bonusDays ?? 1, Number(e.target.value))))}
                     min={1} max={data.bonusDays ?? 1} />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowBonusRedeem(false)} className="btn-secondary flex-1 justify-center text-sm">Отмена</button>
              <button disabled={bonusRedeeming || bonusRedeemDays < 1}
                      onClick={async () => {
                        setBonusRedeeming(true)
                        try {
                          const res = await fetch('/api/user/bonus-days/redeem', {
                            method: 'POST', credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ days: bonusRedeemDays }),
                          })
                          const d = await res.json()
                          if (!res.ok) throw new Error(d.error || 'Ошибка')
                          toast.success(`+${bonusRedeemDays} дней добавлено к подписке!`)
                          setShowBonusRedeem(false)
                          window.location.reload()
                        } catch (e: any) { toast.error(e.message) }
                        finally { setBonusRedeeming(false) }
                      }}
                      className="btn-primary flex-1 justify-center text-sm"
                      style={{ background: '#fbbf24', color: '#000' }}>
                {bonusRedeeming ? 'Списываю...' : `Списать ${bonusRedeemDays} дней`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── TARIFFS MODAL ── */}
      {showTariffs && (
        <Modal close={() => { setShowTariffs(false); setPayTariff(null) }} wide>
          {!payTariff ? (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <CreditCard className="w-5 h-5" style={{ color: 'var(--accent-1)' }} /> Выберите тариф
              </h3>
              {tariffs.length > 0 ? (
                <div className="grid sm:grid-cols-2 gap-3 max-h-[65vh] overflow-y-auto">
                  {tariffs.map((t: any) => {
                    const tMode = t.mode || 'simple'
                    return (
                    <div key={t.id} className="rounded-xl p-4 flex flex-col transition-all duration-300"
                         style={{
                           background: 'var(--glass-bg)',
                           border: t.isFeatured ? '1px solid rgba(6,182,212,0.3)' : '1px solid var(--glass-border)',
                           boxShadow: t.isFeatured ? '0 0 30px rgba(6,182,212,0.06)' : 'none',
                         }}>
                      {t.isFeatured && (
                        <span className="badge-blue text-[10px] w-fit mb-2">
                          <Zap className="w-3 h-3" /> Популярный
                        </span>
                      )}
                      <p className="font-semibold text-base">{t.name}</p>

                      {/* ── SIMPLE mode ── */}
                      {tMode === 'simple' && (
                        <>
                          <p className="text-2xl font-extrabold mt-1 tracking-tight">
                            {t.priceRub.toLocaleString('ru')} <span className="text-sm font-normal" style={{ color: 'var(--text-tertiary)' }}>₽</span>
                          </p>
                          {t.priceUsdt && (
                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>~ {t.priceUsdt} USDT</p>
                          )}
                          <div className="text-xs mt-3 space-y-1.5 flex-1" style={{ color: 'var(--text-secondary)' }}>
                            <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} /> {t.durationDays} дней</div>
                            <div className="flex items-center gap-2"><Smartphone className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} /> {t.deviceLimit === 0 ? 'Безлимит' : t.deviceLimit} устр.</div>
                            <div className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} /> {t.trafficGb ? `${t.trafficGb} ГБ` : 'Безлимит'}</div>
                          </div>
                        </>
                      )}

                      {/* ── VARIANTS mode ── */}
                      {tMode === 'variants' && t.variants?.length > 0 && (() => {
                        const vi = payTariff?.id === t.id ? selectedVariantIdx : 0
                        const v = t.variants[vi] || t.variants[0]
                        return (
                          <>
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {t.variants.map((vr: any, idx: number) => (
                                <button key={idx} onClick={(e) => { e.stopPropagation(); setSelectedVariantIdx(idx) }}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all
                                    ${(payTariff?.id === t.id ? selectedVariantIdx : 0) === idx
                                      ? 'bg-[rgba(6,182,212,0.12)] border-[rgba(6,182,212,0.3)]'
                                      : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06]'}`}
                                  style={{ color: (payTariff?.id === t.id ? selectedVariantIdx : 0) === idx ? 'var(--accent-1)' : 'var(--text-tertiary)' }}>
                                  {vr.label}
                                </button>
                              ))}
                            </div>
                            <p className="text-2xl font-extrabold mt-2 tracking-tight">
                              {v.priceRub.toLocaleString('ru')} <span className="text-sm font-normal" style={{ color: 'var(--text-tertiary)' }}>₽</span>
                            </p>
                            {v.priceUsdt && (
                              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>~ {v.priceUsdt} USDT</p>
                            )}
                            <div className="text-xs mt-2 space-y-1.5 flex-1" style={{ color: 'var(--text-secondary)' }}>
                              <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} /> {v.days} дней</div>
                              <div className="flex items-center gap-2"><Smartphone className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} /> {v.deviceLimit ?? t.deviceLimit ?? 3} устр.</div>
                              <div className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} /> {(v.trafficGb ?? t.trafficGb) ? `${v.trafficGb ?? t.trafficGb} ГБ` : 'Безлимит'}</div>
                            </div>
                          </>
                        )
                      })()}

                      {/* ── CONFIGURATOR mode ── */}
                      {tMode === 'configurator' && t.configurator && (() => {
                        const cfg = t.configurator
                        const cv = payTariff?.id === t.id ? cfgValues : {
                          trafficGb: cfg.traffic?.default ?? 50,
                          days: cfg.days?.default ?? 30,
                          devices: cfg.devices?.default ?? 3,
                        }
                        let calcPrice = 0
                        if (cfg.traffic) calcPrice += cv.trafficGb * (cfg.traffic.pricePerUnit || 0)
                        if (cfg.days) calcPrice += cv.days * (cfg.days.pricePerUnit || 0)
                        if (cfg.devices) calcPrice += cv.devices * (cfg.devices.pricePerUnit || 0)
                        return (
                          <>
                            <div className="mt-3 space-y-3">
                              {cfg.traffic && (
                                <div>
                                  <div className="flex justify-between text-[11px] mb-1">
                                    <span style={{ color: 'var(--text-tertiary)' }}>Трафик</span>
                                    <span className="font-medium">{cv.trafficGb} ГБ</span>
                                  </div>
                                  <input type="range" min={cfg.traffic.min} max={cfg.traffic.max} step={cfg.traffic.step}
                                    value={cv.trafficGb}
                                    onChange={e => { setSelectedVariantIdx(0); setCfgValues(prev => ({ ...prev, trafficGb: +e.target.value })); if (payTariff?.id !== t.id) { setPayTariff(t); setProvider('YUKASSA') } }}
                                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                                    style={{ background: 'var(--glass-border)', accentColor: 'var(--accent-1, #06b6d4)' }} />
                                </div>
                              )}
                              {cfg.days && (
                                <div>
                                  <div className="flex justify-between text-[11px] mb-1">
                                    <span style={{ color: 'var(--text-tertiary)' }}>Период</span>
                                    <span className="font-medium">{cv.days} дн.</span>
                                  </div>
                                  <input type="range" min={cfg.days.min} max={cfg.days.max} step={cfg.days.step}
                                    value={cv.days}
                                    onChange={e => { setCfgValues(prev => ({ ...prev, days: +e.target.value })); if (payTariff?.id !== t.id) { setPayTariff(t); setProvider('YUKASSA') } }}
                                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                                    style={{ background: 'var(--glass-border)', accentColor: 'var(--accent-1, #06b6d4)' }} />
                                </div>
                              )}
                              {cfg.devices && (
                                <div>
                                  <div className="flex justify-between text-[11px] mb-1">
                                    <span style={{ color: 'var(--text-tertiary)' }}>Устройства</span>
                                    <span className="font-medium">{cv.devices}</span>
                                  </div>
                                  <input type="range" min={cfg.devices.min} max={cfg.devices.max} step={cfg.devices.step}
                                    value={cv.devices}
                                    onChange={e => { setCfgValues(prev => ({ ...prev, devices: +e.target.value })); if (payTariff?.id !== t.id) { setPayTariff(t); setProvider('YUKASSA') } }}
                                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                                    style={{ background: 'var(--glass-border)', accentColor: 'var(--accent-1, #06b6d4)' }} />
                                </div>
                              )}
                            </div>
                            <p className="text-2xl font-extrabold mt-3 tracking-tight">
                              {Math.round(calcPrice).toLocaleString('ru')} <span className="text-sm font-normal" style={{ color: 'var(--text-tertiary)' }}>₽</span>
                            </p>
                          </>
                        )
                      })()}

                      <div className="flex gap-2 mt-4">
                        <button onClick={() => {
                          setPayTariff(t); setProvider('YUKASSA')
                          if (tMode === 'variants') setSelectedVariantIdx(0)
                          if (tMode === 'configurator' && t.configurator) {
                            setCfgValues({
                              trafficGb: t.configurator.traffic?.default ?? 50,
                              days: t.configurator.days?.default ?? 30,
                              devices: t.configurator.devices?.default ?? 3,
                            })
                          }
                        }}
                                className={`${t.isFeatured ? 'btn-primary' : 'btn-secondary'} text-xs py-2.5 flex-1 justify-center`}>
                          Оплатить
                        </button>
                        <button onClick={() => { setGiftTariff(t); setGiftProvider('YUKASSA'); setGiftLink(null) }}
                                className="btn-secondary text-xs py-2.5 justify-center"
                                style={{ color: 'var(--accent-2, #a78bfa)' }}
                                title="Подарить другу">
                          <Gift className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>Тарифы загружаются...</p>
              )}
            </div>
          ) : (
            /* ── Nested: provider selection ── */
            <div className="space-y-5 animate-fade-in">
              <button onClick={() => setPayTariff(null)}
                      className="flex items-center gap-1 text-xs font-medium transition-colors"
                      style={{ color: 'var(--text-tertiary)' }}>
                <ChevronLeft className="w-4 h-4" /> Назад к тарифам
              </button>

              <h3 className="font-semibold text-lg">Оплата</h3>

              <div className="p-3 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <p className="text-sm font-medium">{payTariff.name}</p>
                {payTariff.mode === 'variants' && payTariff.variants?.[selectedVariantIdx] ? (
                  <>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{payTariff.variants[selectedVariantIdx].label} -- {payTariff.variants[selectedVariantIdx].days} дн.</p>
                    <p className="text-xl font-extrabold mt-0.5">
                      {payTariff.variants[selectedVariantIdx].priceRub.toLocaleString('ru')} <span className="text-sm font-normal" style={{ color: 'var(--text-tertiary)' }}>₽</span>
                    </p>
                  </>
                ) : payTariff.mode === 'configurator' && payTariff.configurator ? (() => {
                  const cfg = payTariff.configurator
                  let p = 0
                  if (cfg.traffic) p += cfgValues.trafficGb * (cfg.traffic.pricePerUnit || 0)
                  if (cfg.days) p += cfgValues.days * (cfg.days.pricePerUnit || 0)
                  if (cfg.devices) p += cfgValues.devices * (cfg.devices.pricePerUnit || 0)
                  return (
                    <>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        {cfgValues.days} дн. / {cfgValues.trafficGb} ГБ / {cfgValues.devices} устр.
                      </p>
                      <p className="text-xl font-extrabold mt-0.5">
                        {Math.round(p).toLocaleString('ru')} <span className="text-sm font-normal" style={{ color: 'var(--text-tertiary)' }}>₽</span>
                      </p>
                    </>
                  )
                })() : (
                  <p className="text-xl font-extrabold mt-0.5">
                    {payTariff.priceRub.toLocaleString('ru')} <span className="text-sm font-normal" style={{ color: 'var(--text-tertiary)' }}>₽</span>
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Способ оплаты</p>
                <div className="flex gap-2">
                  {([
                    { key: 'YUKASSA', label: 'ЮKassa', sub: 'Карта / СБП', icon: <CreditCard className="w-4 h-4" /> },
                    { key: 'CRYPTOPAY', label: 'CryptoPay', sub: 'USDT / BTC', icon: <Wallet className="w-4 h-4" /> },
                    { key: 'BALANCE', label: 'С баланса', sub: `${(balance?.balance ?? 0).toFixed(0)} ₽`, icon: <Wallet className="w-4 h-4" /> },
                  ] as const).map(p => (
                    <button key={p.key} onClick={() => setProvider(p.key)}
                            className="flex-1 p-3 rounded-xl text-left transition-all duration-200"
                            style={{
                              background: provider === p.key ? 'rgba(6,182,212,0.08)' : 'var(--glass-bg)',
                              border: `1.5px solid ${provider === p.key ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                            }}>
                      <div className="flex items-center gap-2 mb-0.5"
                           style={{ color: provider === p.key ? 'var(--accent-1)' : 'var(--text-primary)' }}>
                        {p.icon}
                        <span className="text-sm font-medium">{p.label}</span>
                      </div>
                      <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{p.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setPayTariff(null)} className="btn-secondary flex-1 justify-center text-sm">Отмена</button>
                <button onClick={handleBuy} disabled={paying} className="btn-primary flex-1 justify-center text-sm">
                  {paying ? 'Переход...' : 'Оплатить'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ── TOPUP MODAL ── */}
      {showTopup && (
        <Modal close={() => setShowTopup(false)}>
          <div className="space-y-5">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Wallet className="w-5 h-5" style={{ color: 'var(--accent-1)' }} /> Пополнить баланс
            </h3>

            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Сумма (мин. 50 ₽)</p>
              <input type="number" min={50} value={topupAmount}
                     onChange={e => setTopupAmount(Number(e.target.value))}
                     className="w-full px-4 py-3 rounded-xl text-base font-semibold outline-none transition-all"
                     style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                     placeholder="100" />
            </div>

            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Способ оплаты</p>
              <div className="flex gap-2">
                {([
                  { key: 'YUKASSA' as const, label: 'ЮKassa', sub: 'Карта / СБП', icon: <CreditCard className="w-4 h-4" /> },
                  { key: 'CRYPTOPAY' as const, label: 'CryptoPay', sub: 'USDT / BTC', icon: <Wallet className="w-4 h-4" /> },
                ]).map(p => (
                  <button key={p.key} onClick={() => setTopupProvider(p.key)}
                          className="flex-1 p-3 rounded-xl text-left transition-all duration-200"
                          style={{
                            background: topupProvider === p.key ? 'rgba(6,182,212,0.08)' : 'var(--glass-bg)',
                            border: `1.5px solid ${topupProvider === p.key ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                          }}>
                    <div className="flex items-center gap-2 mb-0.5"
                         style={{ color: topupProvider === p.key ? 'var(--accent-1)' : 'var(--text-primary)' }}>
                      {p.icon}
                      <span className="text-sm font-medium">{p.label}</span>
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{p.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowTopup(false)} className="btn-secondary flex-1 justify-center text-sm">Отмена</button>
              <button onClick={handleTopup} className="btn-primary flex-1 justify-center text-sm">
                Пополнить
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── GIFT MODAL ── */}
      {giftTariff && (
        <Modal close={() => { setGiftTariff(null); setGiftLink(null) }}>
          {!giftLink ? (
            <div className="space-y-5 animate-fade-in">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Gift className="w-5 h-5" style={{ color: 'var(--accent-1)' }} /> Подарить подписку
              </h3>

              <div className="p-3 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <p className="text-sm font-medium">{giftTariff.name}</p>
                <p className="text-xl font-extrabold mt-0.5">
                  {giftTariff.priceRub.toLocaleString('ru')} <span className="text-sm font-normal" style={{ color: 'var(--text-tertiary)' }}>₽</span>
                </p>
              </div>

              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Способ оплаты</p>
                <div className="flex gap-2">
                  {([
                    { key: 'YUKASSA', label: 'ЮKassa', sub: 'Карта / СБП', icon: <CreditCard className="w-4 h-4" /> },
                    { key: 'CRYPTOPAY', label: 'CryptoPay', sub: 'USDT / BTC', icon: <Wallet className="w-4 h-4" /> },
                    { key: 'BALANCE', label: 'С баланса', sub: `${(balance?.balance ?? 0).toFixed(0)} ₽`, icon: <Wallet className="w-4 h-4" /> },
                  ] as const).map(p => (
                    <button key={p.key} onClick={() => setGiftProvider(p.key)}
                            className="flex-1 p-3 rounded-xl text-left transition-all duration-200"
                            style={{
                              background: giftProvider === p.key ? 'rgba(6,182,212,0.08)' : 'var(--glass-bg)',
                              border: `1.5px solid ${giftProvider === p.key ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                            }}>
                      <div className="flex items-center gap-2 mb-0.5"
                           style={{ color: giftProvider === p.key ? 'var(--accent-1)' : 'var(--text-primary)' }}>
                        {p.icon}
                        <span className="text-sm font-medium">{p.label}</span>
                      </div>
                      <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{p.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setGiftTariff(null)} className="btn-secondary flex-1 justify-center text-sm">Отмена</button>
                <button onClick={handleGiftBuy} disabled={giftPaying} className="btn-primary flex-1 justify-center text-sm">
                  {giftPaying ? 'Обработка...' : 'Подарить'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5 animate-fade-in text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                   style={{ background: 'rgba(16,185,129,0.1)' }}>
                <Gift className="w-8 h-8" style={{ color: '#34d399' }} />
              </div>
              <h3 className="font-semibold text-lg">Подарок создан!</h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Отправьте эту ссылку другу — при переходе подписка активируется автоматически
              </p>
              <div className="flex items-center gap-2 p-3 rounded-xl"
                   style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <p className="flex-1 text-xs font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>{giftLink}</p>
                <button onClick={() => copyText(giftLink!, 'gift-link')} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
                  {copied === 'gift-link' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />}
                </button>
              </div>
              <button onClick={() => { setGiftTariff(null); setGiftLink(null) }}
                      className="btn-primary w-full justify-center text-sm">
                Готово
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   HELPER COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

function Modal({ close, children, wide }: { close: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop — hidden on mobile fullscreen */}
      <div className="hidden md:block absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={close} />

      {/* Mobile: fullscreen sheet from bottom */}
      {/* Desktop: centered card */}
      <div className={`
        md:absolute md:inset-x-3 md:top-1/2 md:-translate-y-1/2 ${wide ? 'md:max-w-lg' : 'md:max-w-md'} md:mx-auto md:rounded-2xl
        fixed inset-0 md:inset-auto
        overflow-y-auto
        p-5 pt-14 md:p-6
        animate-slide-up md:animate-scale-in
      `} style={{ background: 'var(--surface-2)', border: 'none', boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}>
        {/* Mobile: top bar with close */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3"
             style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--glass-border)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>&nbsp;</span>
          <button onClick={close} className="p-2 rounded-xl transition-all"
                  style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Desktop: close button top-right */}
        <button onClick={close} className="hidden md:block absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/5 transition-colors z-10">
          <X className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
        </button>
        {children}
      </div>
    </div>
  )
}

function MiniStat({ label, value, sub, color, icon }: {
  label: string; value: any; sub?: string; color?: string; icon?: React.ReactNode
}) {
  return (
    <div className="p-2.5 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
      <div className="flex items-center gap-1 mb-0.5" style={{ color: 'var(--text-tertiary)' }}>
        {icon}
        <p className="text-[9px] uppercase tracking-wider truncate">{label}</p>
      </div>
      <p className="text-base font-bold leading-tight" style={{ color: color || 'var(--text-primary)' }}>
        {value}{sub && <span className="text-[10px] font-normal ml-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</span>}
      </p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="h-8 skeleton w-64 rounded-xl" />
      <div className="h-72 skeleton rounded-2xl" />
      <div className="h-14 skeleton rounded-2xl" />
      <div className="space-y-4">
        <div className="h-40 skeleton rounded-2xl" />
        <div className="h-40 skeleton rounded-2xl" />
      </div>
      <div className="h-40 skeleton rounded-2xl" />
      <div className="h-24 skeleton rounded-2xl" />
    </div>
  )
}
