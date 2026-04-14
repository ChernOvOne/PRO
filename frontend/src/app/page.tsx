'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Shield, Zap, Globe2, Lock, ChevronRight, ChevronDown,
  CheckCircle2, Star, Menu, X, Wifi, Smartphone, Server,
  Users, Gift, MessageCircle, ExternalLink, Send,
} from 'lucide-react'
import Link from 'next/link'
import { ThemeToggle } from '@/components/ThemeToggle'
import type { Tariff, TelegramProxy, News } from '@/types'

export default function LandingPage() {
  const router = useRouter()
  const [tariffs, setTariffs]   = useState<Tariff[]>([])
  const [proxies, setProxies]   = useState<TelegramProxy[]>([])
  const [news, setNews]         = useState<News[]>([])
  const [landing, setLanding]   = useState<Record<string, any>>({})
  const [mobileOpen, setMobileOpen] = useState(false)
  const [tmaChecked, setTmaChecked] = useState(false)
  const tmaTriedRef = useRef(false)

  // ── Telegram MiniApp auto-login ──
  useEffect(() => {
    if (tmaTriedRef.current) return
    tmaTriedRef.current = true

    // Check if this is a Telegram context (URL params or user agent)
    const isTgContext =
      location.hash.includes('tgWebAppData') ||
      location.search.includes('tgWebAppData') ||
      navigator.userAgent.includes('Telegram')

    if (!isTgContext) {
      // Normal browser — show landing immediately
      setTmaChecked(true)
      return
    }

    // Wait for Telegram SDK to load (max 2s)
    const start = Date.now()
    const waitTg = async () => {
      while (Date.now() - start < 2000) {
        const tg = (window as any).Telegram?.WebApp
        if (tg?.initData) return tg
        await new Promise(r => setTimeout(r, 50))
      }
      return (window as any).Telegram?.WebApp || null
    }

    waitTg().then(tg => {
      if (!tg?.initData) {
        setTmaChecked(true)
        return
      }
      tg.expand?.()
      tg.ready?.()
      fetch('/api/auth/telegram-mini-app', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData }),
      })
        .then(r => { if (r.ok) return r.json(); throw new Error() })
        .then(data => {
          if (data?.token) {
            try { localStorage.setItem('auth_token', data.token) } catch {}
          }
          const startParam = tg.initDataUnsafe?.start_param
          let dest = '/dashboard'
          if (startParam) {
            if (startParam.startsWith('support')) dest = '/dashboard/support'
            else if (startParam === 'plans') dest = '/dashboard/plans'
            else if (startParam === 'profile') dest = '/dashboard/profile'
            else if (startParam.startsWith('ticket_')) dest = '/dashboard/support'
          }
          window.location.replace(dest)
        })
        .catch(() => setTmaChecked(true))
    })
  }, [router])

  useEffect(() => {
    Promise.all([
      fetch('/api/public/tariffs').then(r => r.json()).catch(() => []),
      fetch('/api/public/proxies').then(r => r.json()).catch(() => []),
      fetch('/api/public/news?limit=3').then(r => r.json()).catch(() => []),
      fetch('/api/public/landing').then(r => r.json()).catch(() => ({})),
    ]).then(([t, p, n, l]) => {
      setTariffs(t)
      setProxies(p)
      setNews(n)
      setLanding(l)
    })
  }, [])

  const heroTitle    = landing?.hero?.title    || 'Интернет без границ'
  const heroSubtitle = landing?.hero?.subtitle || 'VPN нового поколения на базе протокола VLESS. Обход блокировок, защита данных, максимальная скорость.'
  const heroCta      = landing?.hero?.ctaText  || 'Попробовать бесплатно'

  // Don't render landing until TMA check completes (prevents flash)
  if (!tmaChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface-0)' }}>
        <div className="w-10 h-10 rounded-full border-2 border-transparent"
             style={{ borderTopColor: '#8b5cf6', borderRightColor: '#06b6d4', animation: 'spin 0.8s linear infinite' }} />
        <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-0)', color: 'var(--text-primary)' }}>
      <div className="aurora-bg" aria-hidden />

      {/* ── NAVBAR ── */}
      <nav className="relative z-50 flex items-center justify-between px-6 lg:px-16 py-5 border-b"
           style={{ borderColor: 'var(--glass-border)', background: 'var(--surface-0)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
               style={{ background: 'var(--accent-gradient)' }}>
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">HIDEYOU</span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <a href="#features" className="hover:opacity-80 transition-opacity">Возможности</a>
          <a href="#pricing"  className="hover:opacity-80 transition-opacity">Тарифы</a>
          {proxies.length > 0 && <a href="#proxies" className="hover:opacity-80 transition-opacity">Прокси</a>}
          <a href="#faq"      className="hover:opacity-80 transition-opacity">FAQ</a>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle compact />
          <Link href="/login" className="btn-ghost text-sm">Войти</Link>
          <Link href="/login" className="btn-primary text-sm py-2.5 px-5">Начать</Link>
        </div>

        <button className="md:hidden p-2 rounded-lg" onClick={() => setMobileOpen(v => !v)}
                style={{ color: 'var(--text-primary)' }}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="relative z-40 md:hidden px-6 py-4 space-y-3 border-b"
             style={{ background: 'var(--surface-1)', borderColor: 'var(--glass-border)' }}>
          {[
            { href: '#features', label: 'Возможности' },
            { href: '#pricing', label: 'Тарифы' },
            { href: '#faq', label: 'FAQ' },
          ].map(({ href, label }) => (
            <a key={href} href={href} className="block py-2 transition-opacity hover:opacity-80"
               style={{ color: 'var(--text-secondary)' }}
               onClick={() => setMobileOpen(false)}>
              {label}
            </a>
          ))}
          <Link href="/login" className="btn-primary w-full text-center block py-3"
                onClick={() => setMobileOpen(false)}>
            Войти / Зарегистрироваться
          </Link>
        </div>
      )}

      {/* ── HERO ── */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-20 pb-16 md:pt-32 md:pb-24">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-8 animate-fade-in"
             style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', color: 'var(--accent-1)' }}>
          <Zap className="w-3.5 h-3.5" />
          <span>Протокол VLESS + XTLS Reality</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1] max-w-4xl animate-slide-up">
          {heroTitle.split('.').map((part: string, i: number) =>
            i === 0 ? <span key={i}>{part}.<br className="hidden sm:block" /></span>
                    : <span key={i} className="text-gradient">{part}</span>
          )}
        </h1>

        <p className="mt-6 text-lg md:text-xl max-w-2xl leading-relaxed animate-slide-up"
           style={{ color: 'var(--text-secondary)', animationDelay: '100ms' }}>
          {heroSubtitle}
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4 animate-slide-up" style={{ animationDelay: '200ms' }}>
          <Link href="/login" className="btn-primary text-base px-8 py-4 rounded-2xl">
            {heroCta} <ChevronRight className="w-4 h-4" />
          </Link>
          <a href="#pricing" className="btn-secondary text-base px-8 py-4 rounded-2xl">
            Посмотреть тарифы
          </a>
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-center gap-6 md:gap-10 text-sm animate-fade-in"
             style={{ color: 'var(--text-tertiary)', animationDelay: '400ms' }}>
          {[
            { icon: Lock,   text: 'Без логов' },
            { icon: Zap,    text: 'VLESS/XTLS' },
            { icon: Globe2, text: 'Обход DPI' },
            { icon: Server, text: 'Много серверов' },
            { icon: Smartphone, text: 'Все устройства' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2">
              <Icon className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />
              <span>{text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="relative z-10 px-6 lg:px-16 py-20 md:py-28">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">Почему HIDEYOU?</h2>
            <p className="mt-4 text-lg" style={{ color: 'var(--text-secondary)' }}>
              Технологии, которые работают когда другие нет
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger">
            {FEATURES.map((f, i) => (
              <div key={i} className="glass-card group cursor-default animate-slide-up">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors"
                     style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.15)' }}>
                  <f.icon className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />
                </div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="relative z-10 px-6 lg:px-16 py-20 md:py-28">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">Тарифы</h2>
            <p className="mt-4 text-lg" style={{ color: 'var(--text-secondary)' }}>
              Без скрытых платежей. Отменяй когда угодно.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 stagger">
            {(tariffs.length > 0 ? tariffs : PLACEHOLDER_TARIFFS).map((t, i) => (
              <PricingCard key={t.id || i} tariff={t as Tariff} />
            ))}
          </div>
        </div>
      </section>

      {/* ── FREE PROXIES ── */}
      {proxies.length > 0 && (
        <section id="proxies" className="relative z-10 px-6 lg:px-16 py-20 md:py-28">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold">Бесплатные прокси для Telegram</h2>
              <p className="mt-4 text-lg" style={{ color: 'var(--text-secondary)' }}>
                Используйте наши прокси для доступа к Telegram без VPN
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 stagger">
              {proxies.map((proxy) => (
                <div key={proxy.id} className="glass-card animate-slide-up">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{proxy.name}</h3>
                      {proxy.tag && (
                        <span className="badge-blue mt-1">{proxy.tag}</span>
                      )}
                    </div>
                    <Wifi className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />
                  </div>
                  {proxy.description && (
                    <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{proxy.description}</p>
                  )}
                  <div className="flex gap-2">
                    {proxy.tgLink && (
                      <a href={proxy.tgLink} target="_blank" rel="noopener"
                         className="btn-primary text-xs py-2 px-4 flex-1">
                        <Send className="w-3.5 h-3.5" /> Открыть в TG
                      </a>
                    )}
                    {proxy.httpsLink && (
                      <a href={proxy.httpsLink} target="_blank" rel="noopener"
                         className="btn-secondary text-xs py-2 px-4">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── NEWS ── */}
      {news.length > 0 && (
        <section className="relative z-10 px-6 lg:px-16 py-20">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-10">Новости</h2>
            <div className="space-y-4">
              {news.map((item) => (
                <div key={item.id} className="glass-card">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={item.type === 'PROMOTION' ? 'badge-violet' : 'badge-blue'}>
                      {item.type === 'PROMOTION' ? 'Акция' : 'Новость'}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(item.publishedAt).toLocaleDateString('ru')}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold mb-1">{item.title}</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {item.content.slice(0, 200)}
                    {item.content.length > 200 && '...'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ── */}
      <section id="faq" className="relative z-10 px-6 lg:px-16 py-20 md:py-28">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">Частые вопросы</h2>
          <div className="space-y-3">
            {(landing?.faq || FAQ).map((item: any, i: number) => (
              <FaqItem key={i} q={item.q || item.question} a={item.a || item.answer} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative z-10 px-6 lg:px-16 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <div className="glass-card gradient-border p-10 md:p-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Попробуй прямо сейчас</h2>
            <p className="mb-8 text-lg" style={{ color: 'var(--text-secondary)' }}>
              Настройка занимает 2 минуты. Войди через Telegram или Email.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/login" className="btn-primary text-base px-10 py-4 rounded-2xl">
                Начать бесплатно <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 border-t px-6 lg:px-16 py-10"
              style={{ borderColor: 'var(--glass-border)' }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-sm"
             style={{ color: 'var(--text-tertiary)' }}>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />
            <span>HIDEYOU VPN &copy; {new Date().getFullYear()}</span>
          </div>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:opacity-80 transition-opacity">Конфиденциальность</Link>
            <Link href="/terms" className="hover:opacity-80 transition-opacity">Условия</Link>
            <a href="https://t.me/hideyouvpn" target="_blank" rel="noopener"
               className="hover:opacity-80 transition-opacity flex items-center gap-1">
              <MessageCircle className="w-3.5 h-3.5" /> Telegram
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function PricingCard({ tariff }: { tariff: Tariff }) {
  return (
    <div className={`relative glass-card flex flex-col transition-all duration-300 animate-slide-up
                     hover:-translate-y-1
                     ${tariff.isFeatured ? 'gradient-border ring-1' : ''}`}
         style={tariff.isFeatured ? { borderColor: 'rgba(6,182,212,0.3)' } : {}}>
      {tariff.isFeatured && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 px-3.5 py-1 rounded-full text-white text-xs font-semibold"
                style={{ background: 'var(--accent-gradient)' }}>
            <Star className="w-3 h-3 fill-current" /> Лучший выбор
          </span>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-semibold">{tariff.name}</h3>
        {tariff.description && (
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{tariff.description}</p>
        )}
      </div>

      <div className="mb-6">
        <span className="text-4xl font-extrabold">{tariff.priceRub.toLocaleString('ru')} ₽</span>
        <span className="text-sm ml-1" style={{ color: 'var(--text-tertiary)' }}>
          / {formatDays(tariff.durationDays)}
        </span>
        {tariff.priceUsdt && (
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            ≈ ${tariff.priceUsdt} USDT
          </p>
        )}
      </div>

      <ul className="space-y-2.5 mb-8 flex-1">
        {[
          `${tariff.deviceLimit === 0 ? 'Безлимит' : tariff.deviceLimit} устройств`,
          tariff.trafficGb ? `${tariff.trafficGb} ГБ трафика` : 'Безлимитный трафик',
          'VLESS + XTLS Reality',
          'Поддержка 24/7',
        ].map((f, i) => (
          <li key={i} className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--success, #10b981)' }} />
            {f}
          </li>
        ))}
      </ul>

      <Link href={`/login?plan=${tariff.id}`}
            className={`w-full justify-center rounded-xl py-3 ${tariff.isFeatured ? 'btn-primary' : 'btn-secondary'}`}>
        Выбрать план
      </Link>
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="glass rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left transition-all"
        onClick={() => setOpen(v => !v)}>
        <span className="font-medium text-sm md:text-base">{q}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200
                                  ${open ? 'rotate-180' : ''}`}
                     style={{ color: 'var(--text-tertiary)' }} />
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm leading-relaxed border-t pt-3"
             style={{ color: 'var(--text-secondary)', borderColor: 'var(--glass-border)' }}>
          {a}
        </div>
      )}
    </div>
  )
}

// ── Static data ───────────────────────────────────────────────

const FEATURES = [
  { icon: Zap,     title: 'Максимальная скорость',  desc: 'Протоколы XTLS/VLESS без ограничений скорости. 4K, игры, стримы — всё летает.' },
  { icon: Lock,    title: 'Полная приватность',      desc: 'Политика No-Log. Серверы не хранят никакой информации о ваших действиях.' },
  { icon: Globe2,  title: 'Обход любых блокировок',  desc: 'Работает в России, обходит DPI и белые списки. В том числе на мобильном интернете.' },
  { icon: Shield,  title: 'Военная защита',          desc: 'TLS 1.3, XTLS Reality. Ваш трафик неотличим от обычного HTTPS.' },
  { icon: Server,  title: 'Много серверов',          desc: 'Серверы в разных странах с автоматическим выбором лучшего маршрута.' },
  { icon: Users,   title: 'Реферальная программа',   desc: 'Приглашайте друзей — получайте бонусы к подписке или на баланс.' },
  { icon: Smartphone, title: 'Все устройства',       desc: 'iOS, Android, Windows, macOS, Linux, роутеры. Подробные инструкции.' },
  { icon: Gift,    title: 'Подарите VPN',            desc: 'Купите подписку в подарок другу. Он получит ссылку и активирует сам.' },
  { icon: Wifi,    title: 'Бесплатные прокси TG',    desc: 'Используйте наши прокси для доступа к Telegram даже без VPN.' },
]

const PLACEHOLDER_TARIFFS = [
  { id:'1', name:'Месяц',    durationDays:30,  priceRub:299,  priceUsdt:3.5, deviceLimit:3, isFeatured:false, sortOrder:0, isActive:true },
  { id:'2', name:'3 месяца', durationDays:90,  priceRub:699,  priceUsdt:8,   deviceLimit:3, isFeatured:true,  sortOrder:1, isActive:true },
  { id:'3', name:'Год',      durationDays:365, priceRub:1990, priceUsdt:22,  deviceLimit:5, isFeatured:false, sortOrder:2, isActive:true },
]

const FAQ = [
  { q: 'Как подключиться?', a: 'После оплаты в личном кабинете вы получите ссылку-подписку и QR-код. Сканируете в одном из рекомендуемых приложений — и всё готово. Есть пошаговые инструкции для каждого устройства.' },
  { q: 'Какие протоколы поддерживаются?', a: 'VLESS+XTLS Reality — самый современный протокол. Также VMess и Trojan. Протоколы автоматически выбираются приложением.' },
  { q: 'Как оплатить из России?', a: 'Карты Visa/МИР через ЮKassa, СБП, ЮMoney. Криптовалюта: USDT, TON, BTC через CryptoPay. Также можно оплатить с баланса аккаунта.' },
  { q: 'Работает ли на мобильном интернете?', a: 'Да! Наш VPN обходит белые списки операторов и работает на любом мобильном интернете.' },
  { q: 'Есть ли ограничения на трафик?', a: 'Зависит от тарифа. На многих тарифах трафик безлимитный. Ограничений на скорость нет в любом случае.' },
  { q: 'Есть ли пробный период?', a: 'Да! При регистрации вы можете получить бесплатный пробный период для тестирования сервиса.' },
]

function formatDays(days: number): string {
  if (days === 30)  return 'месяц'
  if (days === 90)  return '3 месяца'
  if (days === 180) return '6 месяцев'
  if (days === 365) return 'год'
  return `${days} дней`
}
