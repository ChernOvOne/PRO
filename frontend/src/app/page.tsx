'use client'

import { useEffect, useState } from 'react'
import { Shield, Zap, Globe2, Lock, ChevronRight,
         CheckCircle2, Star, Menu, X } from 'lucide-react'
import Link from 'next/link'

interface Tariff {
  id: string; name: string; description?: string
  durationDays: number; priceRub: number; priceUsdt?: number
  deviceLimit: number; trafficGb?: number; isFeatured: boolean
}

export default function LandingPage() {
  const [tariffs, setTariffs]       = useState<Tariff[]>([])
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    fetch('/api/public/tariffs')
      .then(r => r.json())
      .then(setTariffs)
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white overflow-x-hidden">
      {/* ── GLOW BACKGROUND ── */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px]
                        bg-brand-600/20 rounded-full blur-[120px] opacity-50" />
        <div className="absolute top-1/3 right-0 w-[400px] h-[400px]
                        bg-teal-500/10 rounded-full blur-[100px]" />
      </div>

      {/* ── NAVBAR ── */}
      <nav className="relative z-50 flex items-center justify-between
                      px-6 md:px-12 py-5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight">HIDEYOU</span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
          <a href="#features"  className="hover:text-white transition-colors">Возможности</a>
          <a href="#pricing"   className="hover:text-white transition-colors">Тарифы</a>
          <a href="#faq"       className="hover:text-white transition-colors">FAQ</a>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/dashboard" className="btn-ghost text-sm">Войти</Link>
          <Link href="/dashboard" className="btn-primary text-sm py-2">Начать →</Link>
        </div>

        <button className="md:hidden p-2" onClick={() => setMobileOpen(v => !v)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="relative z-40 md:hidden bg-gray-900 border-b border-gray-800 px-6 py-4 space-y-4">
          {['#features','#pricing','#faq'].map((href, i) => (
            <a key={i} href={href} className="block text-gray-300 hover:text-white py-2"
               onClick={() => setMobileOpen(false)}>
              {['Возможности','Тарифы','FAQ'][i]}
            </a>
          ))}
          <Link href="/dashboard" className="btn-primary w-full text-center block">
            Войти / Зарегистрироваться
          </Link>
        </div>
      )}

      {/* ── HERO ── */}
      <section className="relative z-10 flex flex-col items-center text-center
                           px-6 pt-24 pb-20 md:pt-36 md:pb-28">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full
                        bg-brand-600/15 border border-brand-500/30 text-brand-300 text-sm mb-8">
          <Zap className="w-3.5 h-3.5" />
          <span>Быстрый, надёжный, анонимный VPN</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-tight max-w-4xl">
          Скройся от слежки.{' '}
          <span className="text-transparent bg-clip-text
                           bg-gradient-to-r from-brand-400 to-teal-400">
            Оставайся собой.
          </span>
        </h1>

        <p className="mt-6 text-xl text-gray-400 max-w-2xl leading-relaxed">
          VPN на базе Xray — VLESS, VMess, Trojan. Работает в России, поддерживает
          все устройства. Оплата картой или криптой.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4">
          <Link href="/dashboard" className="btn-primary text-base px-8 py-4">
            Подключиться сейчас <ChevronRight className="w-4 h-4" />
          </Link>
          <a href="#pricing" className="btn-secondary text-base px-8 py-4">
            Посмотреть тарифы
          </a>
        </div>

        <div className="mt-12 flex items-center gap-8 text-sm text-gray-500">
          {['Без логов','Xray/XTLS','Поддержка 24/7'].map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>{t}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="relative z-10 px-6 md:px-12 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold">Почему HIDEYOU?</h2>
            <p className="mt-4 text-gray-400 text-lg">Технологии, которые работают когда другие нет</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <div key={i} className="card hover:border-gray-700 transition-colors group">
                <div className="w-12 h-12 rounded-xl bg-brand-600/15 border border-brand-500/20
                                flex items-center justify-center mb-4 group-hover:bg-brand-600/25
                                transition-colors">
                  <f.icon className="w-5 h-5 text-brand-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="relative z-10 px-6 md:px-12 py-24 bg-gray-900/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold">Тарифы</h2>
            <p className="mt-4 text-gray-400 text-lg">Без скрытых платежей. Отменяй когда угодно.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {tariffs.length > 0 ? tariffs.map(t => (
              <PricingCard key={t.id} tariff={t} />
            )) : PLACEHOLDER_TARIFFS.map((t, i) => (
              <PricingCard key={i} tariff={t as Tariff} />
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="relative z-10 px-6 md:px-12 py-24">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16">Частые вопросы</h2>
          <div className="space-y-4">
            {FAQ.map((item, i) => <FaqItem key={i} {...item} />)}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative z-10 px-6 md:px-12 py-24">
        <div className="max-w-3xl mx-auto text-center">
          <div className="card border-brand-800/50 bg-gradient-to-br
                          from-brand-950/50 to-gray-900 p-12">
            <h2 className="text-4xl font-bold mb-4">Попробуй прямо сейчас</h2>
            <p className="text-gray-400 mb-8 text-lg">
              Настройка занимает 2 минуты. Работаем через Telegram или Email.
            </p>
            <Link href="/dashboard" className="btn-primary text-base px-10 py-4">
              Войти через Telegram <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 border-t border-gray-800 px-6 md:px-12 py-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center
                        justify-between gap-6 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-brand-500" />
            <span>HIDEYOU VPN — 2024</span>
          </div>
          <div className="flex gap-6">
            <a href="/privacy" className="hover:text-gray-300 transition-colors">Конфиденциальность</a>
            <a href="/terms"   className="hover:text-gray-300 transition-colors">Условия</a>
            <a href="https://t.me/hideyouvpn" target="_blank" rel="noopener"
               className="hover:text-gray-300 transition-colors">Telegram</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function PricingCard({ tariff }: { tariff: Tariff }) {
  return (
    <div className={`relative card flex flex-col transition-all duration-200
                     hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-500/10
                     ${tariff.isFeatured
                       ? 'border-brand-500/60 ring-1 ring-brand-500/30'
                       : 'hover:border-gray-700'}`}>
      {tariff.isFeatured && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full
                           bg-brand-600 text-white text-xs font-semibold">
            <Star className="w-3 h-3 fill-current" /> Лучший выбор
          </span>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-semibold">{tariff.name}</h3>
        {tariff.description && (
          <p className="text-gray-400 text-sm mt-1">{tariff.description}</p>
        )}
      </div>

      <div className="mb-6">
        <span className="text-4xl font-bold">{tariff.priceRub.toLocaleString('ru')} ₽</span>
        <span className="text-gray-500 text-sm ml-1">
          / {formatDays(tariff.durationDays)}
        </span>
        {tariff.priceUsdt && (
          <p className="text-gray-500 text-sm mt-1">≈ ${tariff.priceUsdt} USDT</p>
        )}
      </div>

      <ul className="space-y-2 mb-8 flex-1">
        {[
          `${tariff.deviceLimit} устройства одновременно`,
          tariff.trafficGb ? `${tariff.trafficGb} ГБ трафика` : 'Безлимитный трафик',
          'Все протоколы: VLESS, VMess',
          'Поддержка 24/7',
        ].map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            {f}
          </li>
        ))}
      </ul>

      <Link href={`/dashboard?plan=${tariff.id}`}
            className={tariff.isFeatured ? 'btn-primary w-full justify-center' : 'btn-secondary w-full justify-center'}>
        Выбрать план
      </Link>
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-6 py-4
                   text-left hover:bg-gray-900/50 transition-colors"
        onClick={() => setOpen(v => !v)}>
        <span className="font-medium">{q}</span>
        <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0
                                  ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="px-6 pb-4 text-gray-400 text-sm leading-relaxed border-t border-gray-800 pt-4">
          {a}
        </div>
      )}
    </div>
  )
}

// ── Static data ───────────────────────────────────────────────

const FEATURES = [
  { icon: Zap,    title: 'Скорость',      desc: 'Протоколы XTLS/VLESS без ограничений скорости. Смотри 4K без буферизации.' },
  { icon: Lock,   title: 'Приватность',   desc: 'Без логов. Серверы не хранят историю твоих запросов.' },
  { icon: Globe2, title: 'Обход блокировок', desc: 'Работает в России, Китае, Иране. Обходит DPI-фильтрацию.' },
  { icon: Shield, title: 'Защита',        desc: 'TLS 1.3, XTLS Reality. Трафик неотличим от обычного HTTPS.' },
  { icon: CheckCircle2, title: 'Все устройства', desc: 'iOS, Android, Windows, macOS, Linux, роутеры. Подробные инструкции.' },
  { icon: Star,   title: 'Реферальная программа', desc: 'Приводи друзей — получай бонусные дни. Без ограничений.' },
]

const PLACEHOLDER_TARIFFS = [
  { id:'1', name:'Месяц', durationDays:30, priceRub:299, priceUsdt:3.5, deviceLimit:3, isFeatured:false },
  { id:'2', name:'3 месяца', durationDays:90, priceRub:699, priceUsdt:8, deviceLimit:3, isFeatured:true },
  { id:'3', name:'Год', durationDays:365, priceRub:1990, priceUsdt:22, deviceLimit:5, isFeatured:false },
]

const FAQ = [
  { q: 'Как подключиться?', a: 'После оплаты в личном кабинете вы получите ссылку-подписку и QR-код. Сканируете в одном из рекомендуемых приложений — и всё готово. Есть пошаговые инструкции для каждого устройства.' },
  { q: 'Какие протоколы поддерживаются?', a: 'VLESS+XTLS, VMess, Trojan. Протоколы автоматически выбираются приложением. Работают даже при активной DPI-фильтрации.' },
  { q: 'Как оплатить из России?', a: 'Принимаем карты Visa/МИР через ЮKassa, СБП и ЮMoney. Также можно оплатить криптовалютой: USDT, TON, BTC через CryptoPay.' },
  { q: 'Есть ли ограничения на трафик?', a: 'На тарифах без явного указания трафик безлимитный. Ограничений на скорость нет.' },
  { q: 'Что если у меня уже есть подписка из Telegram-бота?', a: 'При входе на сайт через тот же Telegram-аккаунт ваша подписка автоматически найдётся и привяжется к аккаунту.' },
]

function formatDays(days: number): string {
  if (days === 30)  return '1 месяц'
  if (days === 90)  return '3 месяца'
  if (days === 180) return '6 месяцев'
  if (days === 365) return '1 год'
  return `${days} дней`
}
