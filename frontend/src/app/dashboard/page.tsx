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
import { promoApi } from '@/lib/api'

/* ── Country code lookup for flag images ── */
const COUNTRY_MAP: Record<string, string> = {
  'россия':'ru','сша':'us','usa':'us','германия':'de','нидерланды':'nl','финляндия':'fi',
  'польша':'pl','франция':'fr','япония':'jp','сингапур':'sg','корея':'kr','канада':'ca',
  'австралия':'au','швеция':'se','швейцария':'ch','австрия':'at','италия':'it','испания':'es',
  'португалия':'pt','бразилия':'br','индия':'in','турция':'tr','оаэ':'ae','израиль':'il',
  'казахстан':'kz','украина':'ua','беларусь':'by','чехия':'cz','румыния':'ro','болгария':'bg',
  'венгрия':'hu','норвегия':'no','дания':'dk','ирландия':'ie','гонконг':'hk','тайвань':'tw',
  'таиланд':'th','мексика':'mx','аргентина':'ar','юар':'za','эстония':'ee','латвия':'lv',
  'литва':'lt','молдова':'md','грузия':'ge','албания':'al','сербия':'rs','люксембург':'lu',
  'великобритания':'gb','англия':'gb',
}
function getCountryCode(name: string): string | null {
  const n = name.toLowerCase().replace(/[^a-zа-яё\s]/gi, '').trim()
  for (const [key, code] of Object.entries(COUNTRY_MAP)) {
    if (n.includes(key)) return code
  }
  return null
}

/* ── Declension helper ── */
function pluralDays(n: number): string {
  const abs = Math.abs(n)
  if (abs % 10 === 1 && abs % 100 !== 11) return `${n} день`
  if (abs % 10 >= 2 && abs % 10 <= 4 && (abs % 100 < 10 || abs % 100 >= 20)) return `${n} дня`
  return `${n} дней`
}

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
  const [activeDiscount, setActiveDiscount] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState<string | null>(null)

  /* ── modals ── */
  const [showShare, setShowShare]       = useState(false)
  const [showDevices, setShowDevices]   = useState(false)
  const [showRevoke, setShowRevoke]     = useState(false)
  const [showTariffs, setShowTariffs]   = useState(false)
  const [payTariff, setPayTariff]       = useState<any>(null)
  const [provider, setProvider]         = useState<'YUKASSA' | 'CRYPTOPAY' | 'PLATEGA' | 'BALANCE'>('YUKASSA')
  // Payment providers fetched once from backend (/api/public/payment-methods).
  // Empty array means we'll fall back to legacy YUKASSA+CRYPTOPAY hardcoded list.
  const [enabledProviders, setEnabledProviders] = useState<Array<{ id: string; label: string; icon: string; meta?: any }>>([])
  const [paying, setPaying]             = useState(false)
  const [revoking, setRevoking]         = useState(false)
  const [devices, setDevices]           = useState<any[]>([])

  /* ── variant / configurator state ── */
  const [selectedVariantIdx, setSelectedVariantIdx] = useState<number>(0)
  const [cfgValues, setCfgValues] = useState<{ trafficGb: number; days: number; devices: number }>({ trafficGb: 50, days: 30, devices: 3 })
  const [selectedAddonUuids, setSelectedAddonUuids] = useState<string[]>([])

  /* ── gift modal ── */
  const [giftTariff, setGiftTariff]           = useState<any>(null)
  const [giftProvider, setGiftProvider]       = useState<'YUKASSA' | 'CRYPTOPAY' | 'PLATEGA' | 'BALANCE'>('YUKASSA')
  const [giftPaying, setGiftPaying]           = useState(false)
  const [giftLink, setGiftLink]               = useState<string | null>(null)

  /* ── topup modal ── */
  const [showTopup, setShowTopup]       = useState(false)
  const [showRedeem, setShowRedeem]     = useState(false)
  const [redeemDays, setRedeemDays]     = useState(1)
  const [redeeming, setRedeeming]       = useState(false)
  const [topupAmount, setTopupAmount]   = useState(100)
  const [topupProvider, setTopupProvider] = useState<'YUKASSA' | 'CRYPTOPAY' | 'PLATEGA'>('YUKASSA')

  /* ── bonus days modal ── */
  const [showBonusRedeem, setShowBonusRedeem] = useState(false)
  const [bonusRedeemDays, setBonusRedeemDays] = useState(1)
  const [bonusRedeeming, setBonusRedeeming]   = useState(false)

  /* ── promo code ── */
  const [promoCode, setPromoCode]           = useState('')
  const [promoResult, setPromoResult]       = useState<any>(null)
  const [promoChecking, setPromoChecking]   = useState(false)
  const [promoActivating, setPromoActivating] = useState(false)

  /* ── activity history ── */
  const [activity, setActivity] = useState<any[]>([])
  const [activityFilter, setActivityFilter] = useState('all')
  const [historyOpen, setHistoryOpen] = useState(false)

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
      fetch('/api/user/promo/active-discount', { credentials: 'include' }).then(r => r.json()).catch(() => null),
      fetch('/api/public/payment-methods').then(r => r.json()).catch(() => ({ providers: [] })),
    ]).then(([d, s, t, r, b, n, p, dev, gifts, cfg, disc, pm]) => {
      setData(d); setSub(s); setTariffs(t); setRef(r); setBal(b); setNews(n); setProxies(p); setDevices(dev); setMyGifts(Array.isArray(gifts) ? gifts : []); setConfig(cfg || {}); if (disc?.active) setActiveDiscount(disc)
      setEnabledProviders(pm?.providers || [])
    }).finally(() => setLoading(false))

    // Load activity history separately
    fetch('/api/user/activity?limit=50', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setActivity(d.items || []))
      .catch(() => {})
  }, [])

  /* devices loaded in initial Promise.all */

  /* ── helpers ── */
  const copyText = useCallback(async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(id)
    toast.success('Скопировано!')
    setTimeout(() => setCopied(null), 2500)
  }, [])

  const checkPromo = async () => {
    if (!promoCode.trim()) return
    setPromoChecking(true)
    setPromoResult(null)
    try {
      const res = await promoApi.check(promoCode.trim())
      setPromoResult(res)
    } catch (e: any) {
      toast.error(e.message || 'Ошибка проверки')
    } finally { setPromoChecking(false) }
  }

  const activatePromo = async () => {
    if (!promoCode.trim()) return
    setPromoActivating(true)
    try {
      const res = await promoApi.activate(promoCode.trim())
      toast.success(res.message || 'Промокод активирован!')
      setPromoResult(null)
      setPromoCode('')
    } catch (e: any) {
      toast.error(e.message || 'Ошибка активации')
    } finally { setPromoActivating(false) }
  }

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
      if (selectedAddonUuids.length > 0) {
        extra.addonSquadUuids = selectedAddonUuids
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
        const pMeta = enabledProviders.find(p => p.id === provider)?.meta
        const res = await fetch('/api/payments/create', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tariffId: payTariff.id, provider,
            ...(provider === 'PLATEGA' && pMeta?.paymentMethod ? { paymentMethod: pMeta.paymentMethod } : {}),
            ...extra,
          }),
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
      const pMeta = enabledProviders.find(p => p.id === topupProvider)?.meta
      const res = await fetch('/api/user/balance/topup', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: topupAmount, provider: topupProvider,
          ...(topupProvider === 'PLATEGA' && pMeta?.paymentMethod ? { paymentMethod: pMeta.paymentMethod } : {}),
        }),
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
      const gMeta = enabledProviders.find(p => p.id === giftProvider)?.meta
      const res = await fetch('/api/gifts/create', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tariffId: giftTariff.id, provider: giftProvider,
          ...(giftProvider === 'PLATEGA' && gMeta?.paymentMethod ? { paymentMethod: gMeta.paymentMethod } : {}),
        }),
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
        ) : config.features?.trial ? (
          /* ── Trial offer — prominent, cannot be dismissed ── */
          <div className="space-y-5 py-6">
            <div className="text-center space-y-3">
              <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center animate-float"
                   style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.15))', border: '1px solid rgba(139,92,246,0.2)' }}>
                <Gift className="w-10 h-10" style={{ color: '#a78bfa' }} />
              </div>
              <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Попробуйте бесплатно!
              </p>
              <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: 'var(--text-secondary)' }}>
                Активируйте пробный период на <strong style={{ color: 'var(--accent-1)' }}>{pluralDays(config.features?.trialDays || 3)}</strong> — полный доступ к VPN без ограничений и обязательств.
              </p>
            </div>

            <button onClick={async () => {
              try {
                const res = await fetch('/api/user/trial/activate', { method: 'POST', credentials: 'include' })
                const d = await res.json()
                if (!res.ok) throw new Error(d.error || 'Ошибка')
                toast.success(`Пробный период активирован! ${pluralDays(d.days)}`)
                window.location.reload()
              } catch (e: any) { toast.error(e.message) }
            }}
              className="w-full py-4 rounded-2xl text-base font-semibold transition-all duration-300 flex items-center justify-center gap-3"
              style={{
                background: 'var(--accent-gradient)',
                boxShadow: '0 4px 20px rgba(139,92,246,0.3), 0 0 60px rgba(6,182,212,0.08)',
                color: '#fff',
              }}>
              <Gift className="w-5 h-5" /> Активировать пробный период
            </button>

            <div className="text-center">
              <button onClick={() => setShowTariffs(true)}
                      className="text-xs transition-opacity hover:opacity-80"
                      style={{ color: 'var(--text-tertiary)' }}>
                или выбрать тариф →
              </button>
            </div>
          </div>
        ) : (
          /* ── No trial — just show tariff button ── */
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

      {/* ═══════ 2. ACTION BENTO ═══════
          Desktop/tablet: 3-col grid where primary spans 2 cols × 2 rows,
          two secondaries stack on the right. Mobile: everything stacks. */}
      <div className="animate-slide-up grid grid-cols-1 sm:grid-cols-3 gap-3"
           style={{ animationDelay: '50ms' }}>
        {/* ── PRIMARY: Выбрать тариф (big hero card) ── */}
        <button onClick={() => setShowTariffs(true)}
                className="dash-bento dash-bento-primary group relative overflow-hidden rounded-2xl p-6 text-left sm:col-span-2 sm:row-span-2 min-h-[180px] flex flex-col justify-between"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-1) 0%, #8b5cf6 50%, #ec4899 100%)',
                  color: '#fff',
                  boxShadow: '0 12px 40px rgba(6,182,212,0.25), 0 0 80px rgba(139,92,246,0.12)',
                }}>
          {/* Decorative blobs */}
          <span aria-hidden className="pointer-events-none absolute -top-20 -right-16 w-56 h-56 rounded-full opacity-30"
                style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)', filter: 'blur(20px)' }} />
          <span aria-hidden className="pointer-events-none absolute -bottom-16 -left-10 w-48 h-48 rounded-full opacity-25"
                style={{ background: 'radial-gradient(circle, #ec4899 0%, transparent 70%)', filter: 'blur(30px)' }} />
          {/* Shine on hover */}
          <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[900ms] ease-out"
                style={{ background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)' }} />

          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                 style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.25)' }}>
              <CreditCard className="w-6 h-6" />
            </div>
            {isActive ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider"
                   style={{ background: 'rgba(52,211,153,0.2)', backdropFilter: 'blur(8px)', border: '1px solid rgba(52,211,153,0.4)' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#34d399' }} /> Активно
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider"
                   style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
                Неактивно
              </div>
            )}
          </div>

          <div className="relative z-10 mt-6">
            {(() => {
              const u = user as any
              const isTrial = u.subStatus === 'TRIAL'
              const tariff  = u.currentPlan
              const remaining = daysLeft ?? 0

              // Two separate accounts:
              //  1) user.bonusDays = unactivated balance on bonus account
              //     (days user can still "convert" into subscription time)
              //  2) subExpireAt → remaining = currently active subscription days,
              //     which is a mix of bonus-activated + paid days
              //
              // Within the active subscription, bonus days are consumed FIRST:
              //    paidRemaining    = min(paidEver, remaining)   // paid drains last
              //    bonusActivatedRem = max(0, remaining - paidEver)
              const bonusAccount   = u.bonusDays || 0
              const paidEver       = u.paidDaysEver || 0
              const paidRemaining  = Math.min(paidEver, remaining)
              const bonusInSub     = Math.max(0, remaining - paidEver)

              if (isTrial) {
                return (
                  <>
                    <div className="text-xs uppercase tracking-[0.2em] opacity-80 font-semibold">🎁 Пробный период</div>
                    <div className="text-[24px] sm:text-[28px] font-bold mt-1 leading-[1.1]">Trial-подписка</div>
                    <div className="text-sm mt-1.5 opacity-85">
                      {remaining > 0 && <>осталось <b>{remaining}</b> {remaining === 1 ? 'день' : remaining < 5 ? 'дня' : 'дней'}</>}
                    </div>
                  </>
                )
              }

              if (isActive && tariff) {
                return (
                  <>
                    <div className="text-xs uppercase tracking-[0.2em] opacity-80 font-semibold">Текущий тариф</div>
                    <div className="text-[24px] sm:text-[28px] font-bold mt-1 leading-[1.1]">{tariff}</div>
                    <div className="text-sm mt-1.5 opacity-85">
                      {remaining > 0
                        ? <>осталось <b>{remaining}</b> {remaining === 1 ? 'день' : remaining < 5 ? 'дня' : 'дней'}</>
                        : <>подписка закончилась</>}
                    </div>
                  </>
                )
              }

              if (isActive) {
                return (
                  <>
                    <div className="text-xs uppercase tracking-[0.2em] opacity-80 font-semibold">🎁 Бонусная подписка</div>
                    <div className="text-[24px] sm:text-[28px] font-bold mt-1 leading-[1.1]">Активная подписка</div>
                    <div className="text-sm mt-1.5 opacity-85">
                      {remaining > 0 && <>осталось <b>{remaining}</b> {remaining === 1 ? 'день' : remaining < 5 ? 'дня' : 'дней'}</>}
                    </div>
                  </>
                )
              }

              return (
                <>
                  <div className="text-xs uppercase tracking-[0.2em] opacity-80 font-semibold">Тарифы · Подписка</div>
                  <div className="text-[26px] sm:text-[28px] font-bold mt-1 leading-[1.1]">Выбрать тариф</div>
                  <div className="text-sm mt-1.5 opacity-85">Начните пользоваться сейчас</div>
                </>
              )
            })()}
          </div>

          {/* Explicit CTA button — clickable (nested inside the clickable card is ok:
              both trigger setShowTariffs). Makes the action obvious. */}
          <div className="relative z-10 mt-5">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold"
                  style={{ background: '#fff', color: 'var(--accent-1)', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}>
              {isActive ? 'Продлить подписку' : 'Выбрать тариф'}
              <ChevronRight className="w-4 h-4" />
            </span>
          </div>
        </button>

        {/* ── SECONDARY 1: Подключить VPN ── */}
        <Link href="/dashboard/instructions"
              className="dash-bento group relative overflow-hidden rounded-2xl p-4 min-h-[86px] flex items-center gap-3"
              style={{
                background: 'linear-gradient(135deg, rgba(139,92,246,0.14) 0%, rgba(236,72,153,0.08) 100%)',
                border: '1px solid rgba(139,92,246,0.25)',
                color: '#a78bfa',
              }}>
          <span aria-hidden className="pointer-events-none absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-20 transition-transform duration-500 group-hover:scale-125"
                style={{ background: 'radial-gradient(circle, #a78bfa 0%, transparent 70%)', filter: 'blur(14px)' }} />
          <span className="relative z-10 w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"
                style={{ background: 'rgba(139,92,246,0.25)', border: '1px solid rgba(139,92,246,0.3)' }}>
            <Smartphone className="w-5 h-5" />
          </span>
          <div className="relative z-10 flex-1 min-w-0">
            <div className="text-[15px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>Подключить VPN</div>
            <div className="text-[11px] mt-0.5 opacity-80">Инструкции для устройств</div>
          </div>
          <ChevronRight className="relative z-10 w-5 h-5 flex-shrink-0 opacity-50 transition-all group-hover:opacity-100 group-hover:translate-x-1" />
        </Link>

        {/* ── SECONDARY 2: Поделиться ── */}
        <button onClick={() => setShowShare(true)}
                className="dash-bento group relative overflow-hidden rounded-2xl p-4 text-left min-h-[86px] flex items-center gap-3"
                style={{
                  background: 'linear-gradient(135deg, rgba(6,182,212,0.14) 0%, rgba(14,165,233,0.08) 100%)',
                  border: '1px solid rgba(6,182,212,0.25)',
                  color: 'var(--accent-1)',
                }}>
          <span aria-hidden className="pointer-events-none absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-25 transition-transform duration-500 group-hover:scale-125"
                style={{ background: 'radial-gradient(circle, var(--accent-1) 0%, transparent 70%)', filter: 'blur(14px)' }} />
          <span className="relative z-10 w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110"
                style={{ background: 'rgba(6,182,212,0.25)', border: '1px solid rgba(6,182,212,0.3)' }}>
            <Share2 className="w-5 h-5" />
          </span>
          <div className="relative z-10 flex-1 min-w-0">
            <div className="text-[15px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>Поделиться</div>
            <div className="text-[11px] mt-0.5 opacity-80">QR-код и ссылка подписки</div>
          </div>
          <ChevronRight className="relative z-10 w-5 h-5 flex-shrink-0 opacity-50 transition-all group-hover:opacity-100 group-hover:translate-x-1" />
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
            Приглашайте друзей. За каждого оплатившего — +{config.referralBonusDays || 30} дней к подписке.
          </p>
          <div className="flex items-center gap-3 mb-3">
            <div className="text-center flex-1">
              <p className="text-xl font-bold">{referral?.referrals?.length ?? 0}</p>
              <p className="text-[9px] uppercase" style={{ color: 'var(--text-tertiary)' }}>приглашено</p>
            </div>
            <div className="w-px h-8" style={{ background: 'var(--glass-border)' }} />
            <div className="text-center flex-1">
              <p className="text-xl font-bold" style={{ color: 'var(--success)' }}>{referral?.referrals?.filter((r: any) => r.hasPaid).length ?? 0}</p>
              <p className="text-[9px] uppercase" style={{ color: 'var(--text-tertiary)' }}>оплатили</p>
            </div>
            <div className="w-px h-8" style={{ background: 'var(--glass-border)' }} />
            <div className="text-center flex-1">
              <p className="text-xl font-bold" style={{ color: 'var(--accent-1)' }}>+{referral?.bonusDaysEarned ?? 0}</p>
              <p className="text-[9px] uppercase" style={{ color: 'var(--text-tertiary)' }}>бонус дней</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 p-2.5 rounded-xl mb-3"
               style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
            <p className="flex-1 text-[10px] font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>{referralUrl}</p>
            <button onClick={() => {
              if (navigator.share) {
                navigator.share({ title: 'HIDEYOU VPN', text: 'Присоединяйся к HIDEYOU VPN!', url: referralUrl }).catch(() => {})
              } else { copyText(referralUrl, 'ref') }
            }} className="p-1.5 rounded-lg hover:bg-white/5 flex-shrink-0">
              {copied === 'ref' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" style={{ color: 'var(--accent-1)' }} />}
            </button>
            <button onClick={() => copyText(referralUrl, 'ref')} className="p-1.5 rounded-lg hover:bg-white/5 flex-shrink-0">
              {copied === 'ref' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />}
            </button>
          </div>

          {/* Referral list */}
          {referral?.referrals?.length > 0 && (
            <div className="mb-3 space-y-1.5 max-h-[150px] overflow-y-auto">
              {referral.referrals.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg"
                     style={{ background: 'var(--glass-bg)' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                         style={{ background: r.hasPaid ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.1)', color: r.hasPaid ? '#34d399' : 'var(--text-tertiary)' }}>
                      {r.displayName[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{r.displayName}</p>
                      <p className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>
                        {new Date(r.joinedAt).toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {r.hasPaid ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                            style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399' }}>Оплатил</span>
                    ) : r.subStatus === 'ACTIVE' ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                            style={{ background: 'rgba(6,182,212,0.1)', color: '#22d3ee' }}>Тест</span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                            style={{ background: 'rgba(148,163,184,0.1)', color: 'var(--text-tertiary)' }}>Ожидание</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Redeem days button */}
          {(referral?.bonusDaysEarned ?? 0) > 0 && (
            <button onClick={() => { setShowRedeem(true); setRedeemDays(Math.min(referral?.bonusDaysEarned ?? 1, 30)) }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all"
                    style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--success)' }}>
              <Zap className="w-3.5 h-3.5" /> Использовать {pluralDays(referral?.bonusDaysEarned ?? 0)}
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

        {/* Promo code block */}
        <div className="glass-card !p-4">
          <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <Tag className="w-4 h-4" style={{ color: '#8b5cf6' }} /> Промокод
          </h3>
          <div className="flex gap-2">
            <input className="glass-input flex-1 !py-2 text-sm" placeholder="Введите промокод"
                   value={promoCode}
                   onChange={e => setPromoCode(e.target.value.toUpperCase())}
                   onKeyDown={e => e.key === 'Enter' && checkPromo()} />
            <button onClick={checkPromo} disabled={promoChecking || !promoCode.trim()}
                    className="btn-primary text-xs px-4 py-2 flex-shrink-0"
                    style={{ opacity: promoChecking || !promoCode.trim() ? 0.5 : 1 }}>
              {promoChecking ? '...' : 'Применить'}
            </button>
          </div>
          {promoResult && (
            <div className="mt-3 p-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                {promoResult.type === 'gift' && (promoResult.description || '🎁 Подарок')}
                {promoResult.type === 'bonus_days' && `+${promoResult.bonusDays} бонусных дней`}
                {promoResult.type === 'discount' && `Скидка ${promoResult.discountPct}% на оплату`}
                {promoResult.type === 'balance' && `+${promoResult.balanceAmount} руб. на баланс`}
                {promoResult.type === 'trial' && 'Пробный период'}
                {promoResult.type !== 'gift' && promoResult.description && ` — ${promoResult.description}`}
              </p>
              <button onClick={activatePromo} disabled={promoActivating}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium transition-all"
                      style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa' }}>
                {promoActivating ? 'Активация...' : 'Активировать'}
              </button>
            </div>
          )}
        </div>

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

          {/* Auto-renew toggle — hidden if admin disabled it globally */}
          {config.features?.autoRenew !== false && <AutoRenewToggle />}

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
                          ? (g.expiresAt
                              ? `Ссылка действует до: ${new Date(g.expiresAt).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' })}${daysUntilExpiry !== null ? ` (${daysUntilExpiry} дн.)` : ''}`
                              : `Бессрочная ссылка${g.shortCode ? ` · код ${g.shortCode}` : ''}`)
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

      {/* ═══════ 3.6. ACTIVITY HISTORY ═══════ */}
      {activity.length > 0 && (
        <div className="glass-card animate-slide-up" style={{ animationDelay: '120ms' }}>
          <button onClick={() => setHistoryOpen(!historyOpen)} className="w-full flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />
              История ({activity.length})
            </h3>
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${historyOpen ? 'rotate-180' : ''}`}
                         style={{ color: 'var(--text-tertiary)' }} />
          </button>
          {historyOpen && (
            <div className="mt-3 space-y-0">
              {/* Filter pills */}
              <div className="flex flex-wrap gap-1 mb-3">
                {[
                  { key: 'all', label: 'Все' },
                  { key: 'payment', label: 'Оплата' },
                  { key: 'trial', label: 'Тест' },
                  { key: 'bonus_redeem', label: 'Бонусы' },
                  { key: 'referral_redeem', label: 'Рефералы' },
                  { key: 'promo', label: 'Промокоды' },
                  { key: 'balance', label: 'Баланс' },
                ].map(f => (
                  <button key={f.key} onClick={() => setActivityFilter(f.key)}
                          className="text-[10px] px-2.5 py-1 rounded-lg font-medium transition-all"
                          style={{
                            background: activityFilter === f.key ? 'var(--accent-1)' : 'var(--glass-bg)',
                            color: activityFilter === f.key ? '#fff' : 'var(--text-tertiary)',
                            border: `1px solid ${activityFilter === f.key ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                          }}>
                    {f.label}
                  </button>
                ))}
              </div>
              {/* Items */}
              <div className="space-y-0 max-h-[300px] overflow-y-auto">
                {activity
                  .filter(a => activityFilter === 'all' || a.type === activityFilter)
                  .map((a, idx, arr) => {
                    const colors: Record<string, string> = {
                      payment: '#34d399', trial: '#a78bfa', bonus_redeem: '#c084fc',
                      referral_redeem: '#22d3ee', balance_purchase: '#60a5fa',
                      promo: '#fbbf24', balance: '#60a5fa',
                    }
                    const labels: Record<string, string> = {
                      payment: 'Оплата', trial: 'Тест', bonus_redeem: 'Бонус дни',
                      referral_redeem: 'Реф. дни', balance_purchase: 'С баланса',
                      promo: 'Промокод', balance: 'Баланс',
                    }
                    const color = colors[a.type] || 'var(--text-tertiary)'
                    const isLast = idx === arr.length - 1
                    return (
                      <div key={a.id} className="flex gap-2.5">
                        <div className="flex flex-col items-center" style={{ width: 24 }}>
                          <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                               style={{ background: `${color}15`, color }}>
                            {a.type === 'payment' ? <CreditCard className="w-3 h-3" /> :
                             a.type === 'bonus_redeem' ? <Zap className="w-3 h-3" /> :
                             a.type === 'referral_redeem' ? <Users className="w-3 h-3" /> :
                             a.type === 'promo' ? <Tag className="w-3 h-3" /> :
                             <Wallet className="w-3 h-3" />}
                          </div>
                          {!isLast && <div className="flex-1 w-px my-0.5" style={{ background: 'var(--glass-border)' }} />}
                        </div>
                        <div className="flex-1 min-w-0 pb-3">
                          <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                {a.description}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                                      style={{ background: `${color}12`, color, border: `1px solid ${color}25` }}>
                                  {labels[a.type] || a.type}
                                </span>
                                {a.metadata?.promoCode && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                                        style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                                    {a.metadata.promoCode}{a.metadata.discountPct ? ` -${a.metadata.discountPct}%` : ''}
                                  </span>
                                )}
                                <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>
                                  {new Date(a.date).toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })}
                                </span>
                              </div>
                            </div>
                            {a.amount != null && a.amount !== 0 && (
                              <div className="text-right flex-shrink-0">
                                <p className="text-xs font-semibold" style={{ color }}>
                                  {a.type === 'balance' && a.amount > 0 ? '+' : ''}
                                  {a.amount.toLocaleString?.('ru') ?? a.amount}
                                  {a.metadata?.currency === 'RUB' || !a.metadata?.currency ? ' ₽' : ` ${a.metadata.currency}`}
                                </p>
                                {a.metadata?.originalAmount != null && a.metadata.originalAmount !== a.amount && (
                                  <p className="text-[9px] line-through" style={{ color: 'var(--text-tertiary)' }}>
                                    {a.metadata.originalAmount} ₽
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
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
                <div key={n.id} className="rounded-xl overflow-hidden transition-all duration-300 flex flex-col"
                     style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  {n.imageUrl && (() => {
                    const aspect = n.imageAspect || '16/9'
                    return (
                      <div className="w-full overflow-hidden flex-shrink-0"
                           style={{
                             background: 'var(--surface-2)',
                             aspectRatio: aspect === 'auto' ? undefined : aspect,
                             maxHeight: aspect === 'auto' ? '200px' : undefined,
                           }}>
                        <img src={n.imageUrl} alt={n.title} className="w-full h-full"
                             style={{
                               objectFit: aspect === 'auto' ? 'contain' : 'cover',
                               objectPosition: n.imageFocus || '50% 50%',
                             }} />
                      </div>
                    )
                  })()}
                  <div className="p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className={`${n.type === 'PROMOTION' ? 'badge-violet' : 'badge-blue'}`}
                            style={{ fontSize: '10px', padding: '2px 6px' }}>
                        {n.type === 'PROMOTION' ? <><Tag className="w-2.5 h-2.5 mr-0.5" />Акция</> : <><Newspaper className="w-2.5 h-2.5 mr-0.5" />Новость</>}
                      </span>
                      <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>
                        {new Date(n.publishedAt).toLocaleDateString('ru')}
                      </span>
                    </div>
                    <p className="text-[13px] font-semibold mb-1 leading-tight">{n.title}</p>
                    <p className="text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                      {(() => {
                        const stripped = (n.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
                        return stripped.length > 60 ? stripped.slice(0, 60) + '…' : stripped
                      })()}
                    </p>
                    {n.buttons?.[0]?.url && (
                      <a href={n.buttons[0].url} target="_blank" rel="noopener"
                         className="inline-flex items-center gap-1 text-[11px] mt-2 font-medium transition-opacity hover:opacity-80"
                         style={{ color: 'var(--accent-1)' }}>
                        Подробнее <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
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

      {/* ── TARIFFS MODAL (premium redesign) ── */}
      {showTariffs && (() => {
        const getBasePrice = () => {
          if (!payTariff) return 0
          if (payTariff.mode === 'variants' && payTariff.variants?.[selectedVariantIdx]) {
            return payTariff.variants[selectedVariantIdx].priceRub
          }
          if (payTariff.mode === 'configurator' && payTariff.configurator) {
            const cfg = payTariff.configurator as any
            let p = 0
            if (cfg.traffic) p += cfgValues.trafficGb * (cfg.traffic.pricePerUnit || 0)
            if (cfg.days) p += cfgValues.days * (cfg.days.pricePerUnit || 0)
            if (cfg.devices) p += cfgValues.devices * (cfg.devices.pricePerUnit || 0)
            return Math.round(p)
          }
          return payTariff.priceRub
        }
        const hasPayDiscount = activeDiscount && activeDiscount.discountPct &&
          payTariff && (activeDiscount.tariffIds.length === 0 || activeDiscount.tariffIds.includes(payTariff.id))
        const getCurrentPrice = () => {
          const base = getBasePrice()
          if (hasPayDiscount) return Math.round(base * (1 - activeDiscount.discountPct / 100))
          return base
        }
        const payDaysForAddons = (() => {
          if (!payTariff) return 0
          if (payTariff.mode === 'variants' && payTariff.variants?.[selectedVariantIdx]) return payTariff.variants[selectedVariantIdx].days
          if (payTariff.mode === 'configurator') return cfgValues.days
          return payTariff.durationDays || 0
        })()
        const payTariffMonths = Math.max(1, Math.round(payDaysForAddons / 30))
        const paidSquadsArr: any[] = Array.isArray(payTariff?.paidSquads) ? payTariff.paidSquads : []
        const bundledAddonsPicked = paidSquadsArr.filter(a => selectedAddonUuids.includes(a.squadUuid))
        const bundledAddonsTotal  = bundledAddonsPicked.reduce((s: number, a: any) => s + Math.ceil(a.pricePerMonth * payTariffMonths), 0)
        const grandTotalRub = getCurrentPrice() + bundledAddonsTotal
        const pricePerDay = payDaysForAddons > 0 ? Math.round(getCurrentPrice() / payDaysForAddons) : 0

        return (
        <Modal close={() => { setShowTariffs(false); setPayTariff(null) }} wide>

          {!payTariff ? (
            <>
              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                     style={{
                       background: 'linear-gradient(135deg, rgba(6,182,212,0.18), rgba(14,165,233,0.12))',
                       border: '1px solid rgba(6,182,212,0.25)',
                       boxShadow: '0 6px 20px rgba(6,182,212,0.15), inset 0 1px 0 rgba(255,255,255,0.05)',
                     }}>
                  <CreditCard className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight">Выберите тариф</h3>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Подключение — сразу после оплаты</p>
                </div>
              </div>

              {tariffs.length > 0 ? (
                <div className="space-y-3">
                  {tariffs.map((t: any) => {
                    const tMode = t.mode || 'simple'
                    const startPrice = tMode === 'variants' && t.variants?.length
                      ? Math.min(...t.variants.map((v: any) => v.priceRub))
                      : t.priceRub
                    const hasDiscount = activeDiscount && activeDiscount.discountPct &&
                      (activeDiscount.tariffIds.length === 0 || activeDiscount.tariffIds.includes(t.id))
                    const discountedPrice = hasDiscount ? Math.round(startPrice * (1 - activeDiscount.discountPct / 100)) : startPrice
                    const perDay = t.durationDays > 0 ? Math.round(discountedPrice / t.durationDays) : 0

                    return (
                      <div key={t.id}
                           className="group relative rounded-2xl overflow-hidden transition-all"
                           style={{
                             background: t.isFeatured
                               ? 'linear-gradient(145deg, rgba(6,182,212,0.06), rgba(14,165,233,0.02))'
                               : 'var(--glass-bg)',
                             border: t.isFeatured ? '1px solid rgba(6,182,212,0.35)' : '1px solid var(--glass-border)',
                             boxShadow: t.isFeatured ? '0 12px 40px rgba(6,182,212,0.08)' : 'none',
                           }}>

                        {/* Featured accent bar */}
                        {t.isFeatured && (
                          <div className="absolute top-0 left-0 right-0 h-0.5"
                               style={{ background: 'linear-gradient(90deg, transparent, var(--accent-1), transparent)' }} />
                        )}

                        <div className="p-5">
                          {/* Top row: badge + name + price */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                {t.isFeatured && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
                                        style={{
                                          background: 'var(--accent-gradient)',
                                          color: '#fff',
                                          boxShadow: '0 2px 8px rgba(6,182,212,0.35)',
                                        }}>
                                    <Zap className="w-2.5 h-2.5 fill-current" /> Популярный
                                  </span>
                                )}
                                {hasDiscount && (
                                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold"
                                        style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.3)' }}>
                                    −{activeDiscount.discountPct}%
                                  </span>
                                )}
                              </div>
                              <h4 className="font-bold text-[17px] leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{t.name}</h4>
                              {t.description && (
                                <p className="text-[11px] mt-1 line-clamp-2" style={{ color: 'var(--text-tertiary)' }}>{t.description}</p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              {hasDiscount && (
                                <p className="text-[11px] line-through leading-none mb-0.5" style={{ color: 'var(--text-tertiary)' }}>
                                  {startPrice.toLocaleString('ru')} ₽
                                </p>
                              )}
                              <div className="flex items-baseline justify-end gap-0.5">
                                {tMode === 'variants' && (
                                  <span className="text-[10px] font-medium mr-0.5" style={{ color: 'var(--text-tertiary)' }}>от</span>
                                )}
                                <span className="text-2xl font-extrabold leading-none"
                                      style={{ color: hasDiscount ? 'var(--success)' : 'var(--text-primary)' }}>
                                  {discountedPrice.toLocaleString('ru')}
                                </span>
                                <span className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>₽</span>
                              </div>
                              {perDay > 0 && t.type !== 'TRAFFIC_ADDON' && (
                                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                                  ~{perDay} ₽ / день
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Feature icons strip */}
                          <div className="flex items-center gap-3 mb-3 py-2.5 px-3 rounded-xl"
                               style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)' }}>
                            {t.type === 'TRAFFIC_ADDON' ? (
                              <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                <Zap className="w-3.5 h-3.5" style={{ color: 'var(--accent-1)' }} />
                                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>+{t.trafficAddonGb} ГБ</span>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                  <Clock className="w-3.5 h-3.5" style={{ color: 'var(--accent-1)' }} />
                                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t.durationDays}</span> дн.
                                </div>
                                <div className="w-px h-3" style={{ background: 'var(--glass-border)' }} />
                                <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                  <Wifi className="w-3.5 h-3.5" style={{ color: 'var(--accent-2)' }} />
                                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t.trafficGb || '∞'}</span> ГБ
                                </div>
                                <div className="w-px h-3" style={{ background: 'var(--glass-border)' }} />
                                <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                  <Smartphone className="w-3.5 h-3.5" style={{ color: 'var(--warning)' }} />
                                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t.deviceLimit === 0 ? '∞' : t.deviceLimit}</span> устр.
                                </div>
                              </>
                            )}
                          </div>

                          {/* Countries */}
                          {t.countries && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {t.countries.split(',').slice(0, 8).map((c: string, ci: number) => {
                                const name = c.trim()
                                const code = getCountryCode(name)
                                return (
                                  <span key={ci} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px]"
                                        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                                    {code && <img src={`https://flagcdn.com/20x15/${code}.png`} alt="" className="w-4 h-3 rounded-[2px] object-cover" />}
                                    {name}
                                  </span>
                                )
                              })}
                              {t.countries.split(',').length > 8 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px]"
                                      style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-tertiary)' }}>
                                  +{t.countries.split(',').length - 8}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Protocol / Speed accent row */}
                          {(t.protocol || t.speed) && (
                            <div className="flex flex-wrap gap-2 mb-4">
                              {t.protocol && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium"
                                      style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--accent-1)' }}>
                                  {t.protocol}
                                </span>
                              )}
                              {t.speed && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium"
                                      style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', color: 'var(--success)' }}>
                                  {t.speed}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Action buttons */}
                          <div className="flex gap-2">
                            <button
                              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-1.5 hover:brightness-110"
                              style={{
                                background: 'var(--accent-gradient)',
                                boxShadow: '0 6px 18px rgba(6,182,212,0.28)',
                              }}
                              onClick={() => {
                                setPayTariff(t); setProvider('YUKASSA')
                                setSelectedAddonUuids([])
                                if (tMode === 'variants') setSelectedVariantIdx(0)
                                if (tMode === 'configurator' && t.configurator) {
                                  setCfgValues({
                                    trafficGb: t.configurator.traffic?.default ?? 50,
                                    days: t.configurator.days?.default ?? 30,
                                    devices: t.configurator.devices?.default ?? 3,
                                  })
                                }
                              }}>
                              Выбрать <ChevronRight className="w-4 h-4" />
                            </button>
                            <button
                              className="py-3 px-4 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 hover:bg-white/5"
                              style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}
                              onClick={() => { setGiftTariff(t); setGiftProvider('YUKASSA'); setGiftLink(null) }}>
                              <Gift className="w-4 h-4" style={{ color: 'var(--accent-2)' }} /> Подарить
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center py-10">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                       style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                    <CreditCard className="w-7 h-7" style={{ color: 'var(--text-tertiary)' }} />
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Тарифы загружаются...</p>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-5">
              {/* Back */}
              <button onClick={() => setPayTariff(null)}
                      className="inline-flex items-center gap-1 text-xs font-medium transition-colors hover:text-white"
                      style={{ color: 'var(--text-tertiary)' }}>
                <ChevronLeft className="w-3.5 h-3.5" /> К списку тарифов
              </button>

              {/* ── HERO: name + price ── */}
              <div className="relative rounded-2xl p-5 overflow-hidden"
                   style={{
                     background: 'linear-gradient(135deg, rgba(6,182,212,0.12) 0%, rgba(14,165,233,0.04) 60%, transparent 100%)',
                     border: '1px solid rgba(6,182,212,0.25)',
                     boxShadow: '0 12px 40px rgba(6,182,212,0.08), inset 0 1px 0 rgba(255,255,255,0.04)',
                   }}>
                {/* Decorative glow */}
                <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-30 pointer-events-none"
                     style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.4) 0%, transparent 70%)' }} />

                <div className="relative flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
                            style={{ background: 'rgba(6,182,212,0.15)', color: 'var(--accent-1)', border: '1px solid rgba(6,182,212,0.25)' }}>
                        <Shield className="w-2.5 h-2.5" /> Премиум VPN
                      </span>
                      {hasPayDiscount && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold"
                              style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.3)' }}>
                          <Tag className="w-2.5 h-2.5" /> −{activeDiscount.discountPct}%
                        </span>
                      )}
                    </div>
                    <h3 className="font-extrabold text-xl leading-tight mb-0.5" style={{ color: 'var(--text-primary)' }}>{payTariff.name}</h3>
                    {payTariff.description && (
                      <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{payTariff.description}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {hasPayDiscount && (
                      <p className="text-xs line-through" style={{ color: 'var(--text-tertiary)' }}>
                        {getBasePrice().toLocaleString('ru')} ₽
                      </p>
                    )}
                    <div className="flex items-baseline justify-end gap-0.5">
                      <span className="text-[32px] font-extrabold leading-none tracking-tight"
                            style={{
                              background: hasPayDiscount
                                ? 'linear-gradient(135deg, #10b981, #059669)'
                                : 'linear-gradient(135deg, #06b6d4, #0ea5e9)',
                              WebkitBackgroundClip: 'text',
                              WebkitTextFillColor: 'transparent',
                              backgroundClip: 'text',
                            }}>
                        {getCurrentPrice().toLocaleString('ru')}
                      </span>
                      <span className="text-base font-bold" style={{ color: hasPayDiscount ? 'var(--success)' : 'var(--accent-1)' }}>₽</span>
                    </div>
                    {pricePerDay > 0 && (
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>≈ {pricePerDay} ₽ в день</p>
                    )}
                  </div>
                </div>

                {hasPayDiscount && (
                  <div className="relative mt-3 flex items-center gap-2 px-3 py-2 rounded-xl"
                       style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                    <Tag className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--success)' }} />
                    <span className="text-[11px]" style={{ color: 'var(--success)' }}>
                      Промокод <strong>{activeDiscount.code}</strong> — скидка {activeDiscount.discountPct}% применена
                    </span>
                  </div>
                )}
              </div>

              {/* ── Tariff details (locations + protocol + speed) ── */}
              {(payTariff.countries || payTariff.protocol || payTariff.speed) && (
                <div className="space-y-3">
                  {payTariff.countries && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider mb-1.5 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Локации</p>
                      <div className="flex flex-wrap gap-1.5">
                        {payTariff.countries.split(',').map((c: string, ci: number) => {
                          const name = c.trim()
                          const code = getCountryCode(name)
                          return (
                            <span key={ci} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px]"
                                  style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                              {code && <img src={`https://flagcdn.com/20x15/${code}.png`} alt="" className="w-4 h-3 rounded-[2px] object-cover" />}
                              {name}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {(payTariff.protocol || payTariff.speed) && (
                    <div className="flex flex-wrap gap-2">
                      {payTariff.protocol && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium"
                              style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--accent-1)' }}>
                          Протокол · {payTariff.protocol}
                        </span>
                      )}
                      {payTariff.speed && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium"
                              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', color: 'var(--success)' }}>
                          Скорость · {payTariff.speed}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Variants: premium pill tabs ── */}
              {payTariff.mode === 'variants' && payTariff.variants?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider mb-2 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Период</p>
                  <div className="flex flex-wrap rounded-xl p-1 gap-1"
                       style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                    {payTariff.variants.map((vr: any, idx: number) => {
                      const active = selectedVariantIdx === idx
                      return (
                        <button key={idx} onClick={() => setSelectedVariantIdx(idx)}
                          className="flex-1 min-w-[64px] px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                          style={active
                            ? { background: 'var(--accent-gradient)', color: '#fff', boxShadow: '0 4px 12px rgba(6,182,212,0.3)' }
                            : { background: 'transparent', color: 'var(--text-secondary)' }}>
                          {vr.label}
                        </button>
                      )
                    })}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {(() => { const v = payTariff.variants[selectedVariantIdx]; if (!v) return null; return (<>
                      <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                        <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-1)' }} />
                        <div className="min-w-0">
                          <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Период</p>
                          <p className="text-xs font-bold truncate">{v.days} дн.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                        <Wifi className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-2)' }} />
                        <div className="min-w-0">
                          <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Трафик</p>
                          <p className="text-xs font-bold truncate">{(v.trafficGb ?? payTariff.trafficGb) || '∞'} ГБ</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                        <Smartphone className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--warning)' }} />
                        <div className="min-w-0">
                          <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Устройства</p>
                          <p className="text-xs font-bold truncate">{(v.deviceLimit ?? payTariff.deviceLimit) === 0 ? '∞' : (v.deviceLimit ?? payTariff.deviceLimit)}</p>
                        </div>
                      </div>
                    </>) })()}
                  </div>
                </div>
              )}

              {/* ── Configurator: premium sliders with value cards ── */}
              {payTariff.mode === 'configurator' && payTariff.configurator && (() => {
                const cfg = payTariff.configurator as any
                return (
                  <div className="space-y-3">
                    <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-tertiary)' }}>Настройте под себя</p>
                    {cfg.traffic && (
                      <div className="p-3 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.12)' }}>
                              <Wifi className="w-3.5 h-3.5" style={{ color: 'var(--accent-1)' }} />
                            </div>
                            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Трафик</span>
                          </div>
                          <span className="text-sm font-bold" style={{ color: 'var(--accent-1)' }}>{cfgValues.trafficGb} ГБ</span>
                        </div>
                        <input type="range" min={cfg.traffic.min} max={cfg.traffic.max} step={cfg.traffic.step}
                          value={cfgValues.trafficGb}
                          onChange={e => setCfgValues(prev => ({ ...prev, trafficGb: +e.target.value }))}
                          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                          style={{ background: 'var(--glass-border)', accentColor: '#06b6d4' }} />
                      </div>
                    )}
                    {cfg.days && (
                      <div className="p-3 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(244,114,182,0.12)' }}>
                              <Clock className="w-3.5 h-3.5" style={{ color: 'var(--accent-2)' }} />
                            </div>
                            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Период</span>
                          </div>
                          <span className="text-sm font-bold" style={{ color: 'var(--accent-2)' }}>{cfgValues.days} дн.</span>
                        </div>
                        <input type="range" min={cfg.days.min} max={cfg.days.max} step={cfg.days.step}
                          value={cfgValues.days}
                          onChange={e => setCfgValues(prev => ({ ...prev, days: +e.target.value }))}
                          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                          style={{ background: 'var(--glass-border)', accentColor: '#f472b6' }} />
                      </div>
                    )}
                    {cfg.devices && (
                      <div className="p-3 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.12)' }}>
                              <Smartphone className="w-3.5 h-3.5" style={{ color: 'var(--warning)' }} />
                            </div>
                            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Устройства</span>
                          </div>
                          <span className="text-sm font-bold" style={{ color: 'var(--warning)' }}>{cfgValues.devices}</span>
                        </div>
                        <input type="range" min={cfg.devices.min} max={cfg.devices.max} step={cfg.devices.step}
                          value={cfgValues.devices}
                          onChange={e => setCfgValues(prev => ({ ...prev, devices: +e.target.value }))}
                          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                          style={{ background: 'var(--glass-border)', accentColor: '#f59e0b' }} />
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* ── Simple mode: 3 feature cards ── */}
              {(!payTariff.mode || payTariff.mode === 'simple') && payTariff.type !== 'TRAFFIC_ADDON' && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                    <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-1)' }} />
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Период</p>
                      <p className="text-xs font-bold truncate">{payTariff.durationDays} дн.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                    <Wifi className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-2)' }} />
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Трафик</p>
                      <p className="text-xs font-bold truncate">{payTariff.trafficGb ?? '∞'} ГБ</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                    <Smartphone className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--warning)' }} />
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Устройства</p>
                      <p className="text-xs font-bold truncate">{payTariff.deviceLimit === 0 ? '∞' : payTariff.deviceLimit}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Paid squad addons ── */}
              {paidSquadsArr.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-tertiary)' }}>Дополнительные серверы</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                        Цена за месяц × {payTariffMonths} мес.
                      </p>
                    </div>
                    {bundledAddonsPicked.length > 0 && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                            style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--accent-1)' }}>
                        +{bundledAddonsPicked.length}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {paidSquadsArr.map((a: any) => {
                      const active = selectedAddonUuids.includes(a.squadUuid)
                      const cost = Math.ceil(a.pricePerMonth * payTariffMonths)
                      return (
                        <button key={a.squadUuid} type="button"
                                onClick={() => setSelectedAddonUuids(ids => ids.includes(a.squadUuid) ? ids.filter(x => x !== a.squadUuid) : [...ids, a.squadUuid])}
                                className="text-left p-3 rounded-xl transition-all"
                                style={active
                                  ? { background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.4)', boxShadow: '0 4px 14px rgba(6,182,212,0.12)' }
                                  : { background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                {a.icon && <span className="text-sm">{a.icon}</span>}
                                <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{a.title}</span>
                              </div>
                              <div className="text-[11px] font-bold" style={{ color: active ? 'var(--accent-1)' : 'var(--text-secondary)' }}>
                                {cost.toLocaleString('ru')} ₽
                                <span className="font-normal ml-1 opacity-60">· {a.pricePerMonth} ₽/мес</span>
                              </div>
                            </div>
                            <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all"
                                 style={active
                                   ? { background: 'var(--accent-gradient)' }
                                   : { background: 'transparent', border: '1.5px solid var(--glass-border)' }}>
                              {active && <CheckCircle2 className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Payment methods ── */}
              <div>
                <p className="text-[10px] uppercase tracking-wider mb-2 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Способ оплаты</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(() => {
                    const list: Array<{ key: string; top: string; bottom: string; meta?: any; icon: React.ReactNode }> =
                      enabledProviders.length > 0
                        ? enabledProviders.map(p => ({
                            key: p.id,
                            top: p.id === 'PLATEGA' ? 'Platega' : p.id === 'CRYPTOPAY' ? 'CryptoPay' : p.id === 'YUKASSA' ? 'ЮKassa' : p.label,
                            bottom: p.id === 'PLATEGA' ? p.label.replace('Platega · ', '') : p.label.replace(/^Карта \/ /, '').replace(/^Крипта /, ''),
                            meta: p.meta,
                            icon: p.icon === 'bitcoin'
                              ? <Wallet className="w-4 h-4" />
                              : <CreditCard className="w-4 h-4" />,
                          }))
                        : [
                            { key: 'YUKASSA', top: 'ЮKassa', bottom: 'Карта · СБП', icon: <CreditCard className="w-4 h-4" /> },
                            { key: 'CRYPTOPAY', top: 'CryptoPay', bottom: 'TON · USDT', icon: <Wallet className="w-4 h-4" /> },
                          ]
                    // BALANCE — only if the admin has enabled it
                    if (config.features?.balance !== false) {
                      list.push({
                        key: 'BALANCE',
                        top: 'Баланс',
                        bottom: `${(balance?.balance ?? 0).toFixed(0)} ₽`,
                        icon: <Wallet className="w-4 h-4" />,
                      })
                    }
                    return list.map(p => {
                      const active = provider === p.key
                      return (
                        <button key={p.key} onClick={() => setProvider(p.key as any)}
                                className="p-3 rounded-xl text-left transition-all"
                                style={active
                                  ? { background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.4)', boxShadow: '0 4px 14px rgba(6,182,212,0.12)' }
                                  : { background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                                 style={{
                                   background: active ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.04)',
                                   color: active ? '#fff' : 'var(--text-secondary)',
                                 }}>
                              {p.icon}
                            </div>
                            {active && (
                              <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />
                            )}
                          </div>
                          <p className="text-[12px] font-semibold leading-tight"
                             style={{ color: active ? 'var(--text-primary)' : 'var(--text-primary)' }}>{p.top}</p>
                          <p className="text-[10px] mt-0.5" style={{ color: active ? 'var(--accent-1)' : 'var(--text-tertiary)' }}>{p.bottom}</p>
                        </button>
                      )
                    })
                  })()}
                </div>
              </div>

              {/* ── Order summary (receipt-style) ── */}
              <div className="rounded-2xl p-4 space-y-2"
                   style={{
                     background: 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
                     border: '1px solid var(--glass-border)',
                   }}>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-secondary)' }}>Тариф</span>
                  <span className="font-medium">{getCurrentPrice().toLocaleString('ru')} ₽</span>
                </div>
                {bundledAddonsPicked.map(a => (
                  <div key={a.squadUuid} className="flex justify-between text-xs">
                    <span style={{ color: 'var(--text-secondary)' }}>+ {a.title}</span>
                    <span className="font-medium">{Math.ceil(a.pricePerMonth * payTariffMonths).toLocaleString('ru')} ₽</span>
                  </div>
                ))}
                <div className="h-px my-1" style={{ background: 'var(--glass-border)' }} />
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Итого</span>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-xl font-extrabold"
                          style={{
                            background: 'linear-gradient(135deg, #06b6d4, #0ea5e9)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                          }}>
                      {grandTotalRub.toLocaleString('ru')}
                    </span>
                    <span className="text-sm font-bold" style={{ color: 'var(--accent-1)' }}>₽</span>
                  </div>
                </div>
              </div>

              {/* ── Pay button ── */}
              <button onClick={handleBuy} disabled={paying}
                      className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-60"
                      style={{
                        background: 'var(--accent-gradient)',
                        boxShadow: '0 10px 28px rgba(6,182,212,0.35)',
                      }}>
                {paying ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Создание платежа...</>
                ) : (
                  <>
                    Оплатить {grandTotalRub.toLocaleString('ru')} ₽
                    <ExternalLink className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-[10px] text-center" style={{ color: 'var(--text-tertiary)' }}>
                Подключение активируется автоматически после подтверждения платежа
              </p>
            </div>
          )}
        </Modal>
        )
      })()}

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
              <div className="flex flex-wrap gap-2">
                {(enabledProviders.length > 0 ? enabledProviders.map(p => ({
                    key: p.id,
                    label: p.id === 'PLATEGA' ? 'Platega' : p.id === 'CRYPTOPAY' ? 'CryptoPay' : p.id === 'YUKASSA' ? 'ЮKassa' : p.label,
                    sub:   p.id === 'PLATEGA' ? p.label.replace('Platega · ', '') : p.label.replace(/^Карта \/ /, '').replace(/^Крипта /, ''),
                    icon: p.icon === 'bitcoin' ? <Wallet className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />,
                  })) : [
                    { key: 'YUKASSA', label: 'ЮKassa', sub: 'Карта / СБП', icon: <CreditCard className="w-4 h-4" /> },
                    { key: 'CRYPTOPAY', label: 'CryptoPay', sub: 'USDT / BTC', icon: <Wallet className="w-4 h-4" /> },
                  ]).map(p => (
                  <button key={p.key} onClick={() => setTopupProvider(p.key as any)}
                          className="flex-1 min-w-[120px] p-3 rounded-xl text-left transition-all duration-200"
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

              {/* Description */}
              <div className="p-4 rounded-xl space-y-2" style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.1)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Как это работает?</p>
                <ul className="text-xs space-y-1.5 list-none" style={{ color: 'var(--text-secondary)' }}>
                  <li className="flex items-start gap-2">
                    <span style={{ color: 'var(--accent-1)' }}>1.</span>
                    Вы оплачиваете тариф как подарок
                  </li>
                  <li className="flex items-start gap-2">
                    <span style={{ color: 'var(--accent-1)' }}>2.</span>
                    Получаете уникальную ссылку для друга
                  </li>
                  <li className="flex items-start gap-2">
                    <span style={{ color: 'var(--accent-1)' }}>3.</span>
                    Друг переходит по ссылке и получает подписку
                  </li>
                </ul>
                <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  Если друг не зарегистрирован — он создаст аккаунт и подписка активируется автоматически. Ссылка одноразовая.
                </p>
              </div>

              {/* Tariff name + price */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{giftTariff.name}</p>
                <p className="text-xl font-extrabold" style={{ color: 'var(--accent-1)' }}>
                  {(() => {
                    if (giftTariff.mode === 'configurator' && giftTariff.configurator) {
                      const cfg = giftTariff.configurator as any
                      let p = 0
                      if (cfg.traffic) p += cfgValues.trafficGb * (cfg.traffic.pricePerUnit || 0)
                      if (cfg.days) p += cfgValues.days * (cfg.days.pricePerUnit || 0)
                      if (cfg.devices) p += cfgValues.devices * (cfg.devices.pricePerUnit || 0)
                      return Math.round(p).toLocaleString('ru')
                    }
                    return giftTariff.priceRub.toLocaleString('ru')
                  })()}
                  <span className="text-xs font-normal ml-0.5" style={{ color: 'var(--text-tertiary)' }}>₽</span>
                </p>
              </div>

              {/* Configurator sliders for gift */}
              {giftTariff.mode === 'configurator' && giftTariff.configurator && (() => {
                const cfg = giftTariff.configurator as any
                return (
                  <div className="space-y-3">
                    {cfg.traffic && (
                      <div className="flex items-center gap-3">
                        <Wifi className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-1)' }} />
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-1">
                            <span style={{ color: 'var(--text-secondary)' }}>Трафик</span>
                            <span className="font-bold" style={{ color: 'var(--accent-1)' }}>{cfgValues.trafficGb} ГБ</span>
                          </div>
                          <input type="range" min={cfg.traffic.min} max={cfg.traffic.max} step={cfg.traffic.step}
                            value={cfgValues.trafficGb}
                            onChange={e => setCfgValues(prev => ({ ...prev, trafficGb: +e.target.value }))}
                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                            style={{ background: 'var(--glass-border)', accentColor: '#06b6d4' }} />
                        </div>
                      </div>
                    )}
                    {cfg.days && (
                      <div className="flex items-center gap-3">
                        <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-2)' }} />
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-1">
                            <span style={{ color: 'var(--text-secondary)' }}>Период</span>
                            <span className="font-bold" style={{ color: 'var(--accent-2)' }}>{cfgValues.days} дн.</span>
                          </div>
                          <input type="range" min={cfg.days.min} max={cfg.days.max} step={cfg.days.step}
                            value={cfgValues.days}
                            onChange={e => setCfgValues(prev => ({ ...prev, days: +e.target.value }))}
                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                            style={{ background: 'var(--glass-border)', accentColor: '#8b5cf6' }} />
                        </div>
                      </div>
                    )}
                    {cfg.devices && (
                      <div className="flex items-center gap-3">
                        <Smartphone className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--warning)' }} />
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-1">
                            <span style={{ color: 'var(--text-secondary)' }}>Устройства</span>
                            <span className="font-bold" style={{ color: 'var(--warning)' }}>{cfgValues.devices}</span>
                          </div>
                          <input type="range" min={cfg.devices.min} max={cfg.devices.max} step={cfg.devices.step}
                            value={cfgValues.devices}
                            onChange={e => setCfgValues(prev => ({ ...prev, devices: +e.target.value }))}
                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                            style={{ background: 'var(--glass-border)', accentColor: '#f59e0b' }} />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Simple tariff info */}
              {(!giftTariff.mode || giftTariff.mode === 'simple') && (
                <div className="flex gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" style={{ color: 'var(--accent-1)' }} /> {giftTariff.durationDays} дней</span>
                  <span className="flex items-center gap-1"><Wifi className="w-3 h-3" style={{ color: 'var(--accent-2)' }} /> {giftTariff.trafficGb || '∞'} ГБ</span>
                  <span className="flex items-center gap-1"><Smartphone className="w-3 h-3" style={{ color: 'var(--warning)' }} /> {giftTariff.deviceLimit === 0 ? '∞' : giftTariff.deviceLimit} устр.</span>
                </div>
              )}

              {/* Payment — same style as tariffs */}
              <div className="pt-3" style={{ borderTop: '1px solid var(--glass-border)' }}>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {(() => {
                    const list: Array<{ key: string; label: string; sub: string }> =
                      enabledProviders.length > 0
                        ? enabledProviders.map(p => ({
                            key: p.id,
                            label: p.id === 'PLATEGA' ? 'Platega' : p.id === 'CRYPTOPAY' ? 'CryptoPay' : p.id === 'YUKASSA' ? 'ЮKassa' : p.label,
                            sub:   p.id === 'PLATEGA' ? p.label.replace('Platega · ', '') : p.label,
                          }))
                        : [
                            { key: 'YUKASSA', label: 'ЮKassa', sub: 'Карта · СБП' },
                            { key: 'CRYPTOPAY', label: 'CryptoPay', sub: 'TON · USDT' },
                          ]
                    if (config.features?.balance !== false) {
                      list.push({ key: 'BALANCE', label: 'Баланс', sub: `${(balance?.balance ?? 0).toFixed(0)}₽` })
                    }
                    return list.map(p => {
                    const active = giftProvider === p.key
                    return (
                      <button key={p.key} onClick={() => setGiftProvider(p.key as any)}
                              className="flex-1 min-w-[90px] py-2.5 rounded-xl text-center transition-all"
                              style={{
                                background: active ? 'rgba(6,182,212,0.1)' : 'var(--glass-bg)',
                                border: `1px solid ${active ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                              }}>
                        <p className="text-[11px] font-semibold" style={{ color: active ? 'var(--accent-1)' : 'var(--text-primary)' }}>{p.label}</p>
                        <p className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>{p.sub}</p>
                      </button>
                    )
                  })
                  })()}
                </div>
                <button onClick={handleGiftBuy} disabled={giftPaying}
                        className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all"
                        style={{ background: 'var(--accent-gradient)', boxShadow: '0 4px 12px rgba(6,182,212,0.2)' }}>
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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
      {/* Mobile: full screen scrollable. PC: centered card with max height */}
      <div className={`
        fixed inset-0 overflow-y-auto
        md:absolute md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2
        md:w-full ${wide ? 'md:max-w-xl' : 'md:max-w-md'} md:rounded-2xl md:max-h-[90vh]
        p-5 pb-24 md:p-6 md:pb-8
      `} style={{ background: 'var(--surface-2)', boxShadow: '0 25px 60px rgba(0,0,0,0.5)', WebkitOverflowScrolling: 'touch' }}>
        <button onClick={close} className="sticky top-0 float-right p-2 rounded-xl z-10 hover:bg-white/5 mb-2"
                style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)' }}>
          <X className="w-4 h-4" />
        </button>
        <div className="clear-both">{children}</div>
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

function AutoRenewToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/user/squad-addons', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => setEnabled(!!d?.autoRenew))
      .catch(() => setEnabled(false))
  }, [])

  const toggle = async () => {
    if (enabled === null || saving) return
    const next = !enabled
    setSaving(true)
    try {
      const res = await fetch('/api/user/squad-addons/auto-renew', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (!res.ok) throw new Error('fail')
      setEnabled(next)
      toast.success(next ? 'Автопродление включено' : 'Автопродление выключено')
    } catch { toast.error('Ошибка') } finally { setSaving(false) }
  }

  if (enabled === null) return null

  return (
    <div className="flex items-start gap-3 p-2.5 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
      <RefreshCw className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-1)' }} />
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold">Автопродление с баланса</p>
          <button onClick={toggle} disabled={saving} type="button"
                  className="relative w-11 h-6 rounded-full transition-all duration-300 flex-shrink-0"
                  style={{ background: enabled ? 'var(--accent-1)' : 'rgba(255,255,255,0.08)' }}>
            <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300"
                  style={{ transform: enabled ? 'translateX(20px)' : 'translateX(0)' }} />
          </button>
        </div>
        <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Подписка и доп. серверы продлеваются автоматически с <b>внутреннего баланса сервиса</b>, не с карты. Пополняйте заранее.
        </p>
      </div>
    </div>
  )
}
