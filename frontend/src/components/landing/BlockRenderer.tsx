'use client'

import Link from 'next/link'
import {
  Shield, Zap, Globe2, Lock, CheckCircle2, Star,
  Wifi, Smartphone, Server, Users, Gift, MessageCircle,
  ChevronDown, ChevronRight, Send,
} from 'lucide-react'
import { useState } from 'react'
import type { Tariff, TelegramProxy } from '@/types'

// ── Types ─────────────────────────────────────────────────────
export interface LandingBlock {
  id: string
  type: string
  data: any
  visible: boolean
  sortOrder: number
}

interface RendererContext {
  tariffs?: Tariff[]
  proxies?: TelegramProxy[]
  onCta?: () => void  // default action for CTA buttons (open /login)
}

const ICONS: Record<string, any> = {
  shield: Shield, zap: Zap, globe: Globe2, lock: Lock, check: CheckCircle2,
  star: Star, wifi: Wifi, phone: Smartphone, server: Server, users: Users,
  gift: Gift, chat: MessageCircle,
}

function resolveIcon(name: string): any {
  return ICONS[name] || Shield
}

// ── Main dispatcher ───────────────────────────────────────────
export function BlockRenderer({ block, ctx }: { block: LandingBlock; ctx: RendererContext }) {
  const d = block.data || {}
  switch (block.type) {
    case 'hero':        return <HeroBlock data={d} onCta={ctx.onCta} />
    case 'features':    return <FeaturesBlock data={d} />
    case 'tariffs':     return <TariffsBlock data={d} tariffs={ctx.tariffs || []} onCta={ctx.onCta} />
    case 'faq':         return <FaqBlock data={d} />
    case 'reviews':     return <ReviewsBlock data={d} />
    case 'stats':       return <StatsBlock data={d} />
    case 'cta':         return <CtaBlock data={d} onCta={ctx.onCta} />
    case 'proxies':     return <ProxiesBlock data={d} proxies={ctx.proxies || []} />
    case 'steps':       return <StepsBlock data={d} />
    case 'custom_html': return <CustomHtmlBlock data={d} />
    case 'spacer':      return <div style={{ height: (d.height || 40) + 'px' }} />
    case 'image':       return <ImageBlock data={d} />
    default:            return null
  }
}

// ═══ 1. Hero ═════════════════════════════════════════════════
function HeroBlock({ data, onCta }: { data: any; onCta?: () => void }) {
  const align = data.align || 'center'
  return (
    <section
      className="relative z-10 px-6 lg:px-16 py-20 overflow-hidden"
      style={{
        background: data.bgImage
          ? `linear-gradient(rgba(0,0,0,0.5),rgba(0,0,0,0.5)), url(${data.bgImage}) center/cover`
          : (data.bgColor || 'transparent'),
      }}
    >
      <div className={`max-w-5xl mx-auto ${align === 'center' ? 'text-center' : ''}`}>
        {data.badge && (
          <div
            className="inline-block px-4 py-1.5 rounded-full text-sm font-medium mb-6"
            style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--accent-1)' }}
          >
            {data.badge}
          </div>
        )}
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
          {data.title || 'Заголовок'}
        </h1>
        {data.subtitle && (
          <p className="text-lg md:text-xl mb-8 max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
            {data.subtitle}
          </p>
        )}
        {data.ctaText && (
          <button
            onClick={onCta}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-base font-semibold text-white transition-transform hover:scale-105"
            style={{ background: 'var(--accent-gradient)' }}
          >
            {data.ctaText} <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </section>
  )
}

// ═══ 2. Features ═════════════════════════════════════════════
function FeaturesBlock({ data }: { data: any }) {
  const items: any[] = Array.isArray(data.items) ? data.items : []
  const cols = data.columns || 3
  return (
    <section className="relative z-10 px-6 lg:px-16 py-16">
      <div className="max-w-6xl mx-auto">
        {data.title && (
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12" style={{ color: 'var(--text-primary)' }}>
            {data.title}
          </h2>
        )}
        <div className={`grid gap-6 ${cols === 2 ? 'md:grid-cols-2' : cols === 4 ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'}`}>
          {items.map((item, i) => {
            const Icon = resolveIcon(item.icon)
            return (
              <div key={i} className="p-6 rounded-2xl" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: 'rgba(6,182,212,0.12)' }}>
                  <Icon className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{item.title}</h3>
                {item.text && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item.text}</p>}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ═══ 3. Tariffs ══════════════════════════════════════════════
function TariffsBlock({ data, tariffs, onCta }: { data: any; tariffs: Tariff[]; onCta?: () => void }) {
  // Filter by data.tariffIds if provided, else show all
  const showIds: string[] = Array.isArray(data.tariffIds) ? data.tariffIds : []
  const visible = showIds.length > 0 ? tariffs.filter(t => showIds.includes(t.id)) : tariffs
  const highlightId = data.highlightId
  return (
    <section id="tariffs" className="relative z-10 px-6 lg:px-16 py-16">
      <div className="max-w-6xl mx-auto">
        {data.title && (
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4" style={{ color: 'var(--text-primary)' }}>{data.title}</h2>
        )}
        {data.subtitle && <p className="text-center mb-12" style={{ color: 'var(--text-secondary)' }}>{data.subtitle}</p>}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visible.map(t => {
            const isHighlighted = t.id === highlightId || t.isFeatured
            return (
              <div key={t.id}
                   className="p-6 rounded-2xl flex flex-col"
                   style={{
                     background: 'var(--surface-1)',
                     border: isHighlighted ? '2px solid var(--accent-1)' : '1px solid var(--glass-border)',
                     boxShadow: isHighlighted ? '0 10px 40px rgba(6,182,212,0.15)' : 'none',
                   }}>
                {isHighlighted && (
                  <div className="inline-block self-start px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider mb-3" style={{ background: 'rgba(6,182,212,0.15)', color: 'var(--accent-1)' }}>Популярный</div>
                )}
                <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t.name}</h3>
                {t.description && <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>{t.description}</p>}
                <div className="text-3xl font-bold mb-5" style={{ color: 'var(--text-primary)' }}>{Number(t.priceRub).toLocaleString('ru-RU')} ₽<span className="text-sm font-normal" style={{ color: 'var(--text-tertiary)' }}>/{t.durationDays} дн</span></div>
                <button onClick={onCta} className="mt-auto px-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--accent-gradient)' }}>
                  Выбрать
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ═══ 4. FAQ ══════════════════════════════════════════════════
function FaqBlock({ data }: { data: any }) {
  const items: any[] = Array.isArray(data.items) ? data.items : []
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  return (
    <section className="relative z-10 px-6 lg:px-16 py-16">
      <div className="max-w-3xl mx-auto">
        {data.title && <h2 className="text-3xl md:text-4xl font-bold text-center mb-10" style={{ color: 'var(--text-primary)' }}>{data.title}</h2>}
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
              <button onClick={() => setOpenIdx(openIdx === i ? null : i)}
                      className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left">
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{item.q}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${openIdx === i ? 'rotate-180' : ''}`} style={{ color: 'var(--text-tertiary)' }} />
              </button>
              {openIdx === i && (
                <div className="px-5 pb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══ 5. Reviews ══════════════════════════════════════════════
function ReviewsBlock({ data }: { data: any }) {
  const items: any[] = Array.isArray(data.items) ? data.items : []
  return (
    <section className="relative z-10 px-6 lg:px-16 py-16">
      <div className="max-w-6xl mx-auto">
        {data.title && <h2 className="text-3xl md:text-4xl font-bold text-center mb-10" style={{ color: 'var(--text-primary)' }}>{data.title}</h2>}
        <div className="grid md:grid-cols-3 gap-5">
          {items.map((item, i) => (
            <div key={i} className="p-6 rounded-2xl" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
              <div className="flex gap-0.5 mb-3">
                {[1,2,3,4,5].map(n => (
                  <Star key={n} className="w-4 h-4" style={{ color: n <= (item.rating || 5) ? '#fbbf24' : 'var(--text-tertiary)', fill: n <= (item.rating || 5) ? '#fbbf24' : 'transparent' }} />
                ))}
              </div>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>"{item.text}"</p>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{item.name}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══ 6. Stats ════════════════════════════════════════════════
function StatsBlock({ data }: { data: any }) {
  const items: any[] = Array.isArray(data.items) ? data.items : []
  return (
    <section className="relative z-10 px-6 lg:px-16 py-14">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {items.map((item, i) => (
            <div key={i} className="text-center">
              <div className="text-3xl md:text-4xl font-bold" style={{ color: 'var(--accent-1)' }}>{item.number}</div>
              <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══ 7. CTA ══════════════════════════════════════════════════
function CtaBlock({ data, onCta }: { data: any; onCta?: () => void }) {
  return (
    <section className="relative z-10 px-6 lg:px-16 py-16">
      <div className="max-w-4xl mx-auto p-10 md:p-14 rounded-3xl text-center"
           style={{ background: data.bgColor || 'var(--accent-gradient)' }}>
        <h2 className="text-3xl md:text-4xl font-bold mb-3 text-white">{data.title || 'Начните прямо сейчас'}</h2>
        {data.subtitle && <p className="text-white opacity-90 mb-6">{data.subtitle}</p>}
        <button onClick={onCta}
                className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-base font-semibold bg-white"
                style={{ color: data.bgColor ? 'var(--text-primary)' : 'var(--accent-1)' }}>
          {data.buttonText || 'Попробовать'} <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  )
}

// ═══ 8. Proxies ══════════════════════════════════════════════
function ProxiesBlock({ data, proxies }: { data: any; proxies: TelegramProxy[] }) {
  if (!proxies.length) return null
  return (
    <section id="proxies" className="relative z-10 px-6 lg:px-16 py-16">
      <div className="max-w-5xl mx-auto">
        {data.title && <h2 className="text-3xl md:text-4xl font-bold text-center mb-3" style={{ color: 'var(--text-primary)' }}>{data.title}</h2>}
        {data.subtitle && <p className="text-center mb-10" style={{ color: 'var(--text-secondary)' }}>{data.subtitle}</p>}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {proxies.map(p => (
            <div key={p.id} className="p-5 rounded-2xl" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{p.name}</h3>
                {p.tag && <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,211,238,0.15)', color: '#22d3ee' }}>{p.tag}</span>}
              </div>
              {p.description && <p className="text-sm mb-3" style={{ color: 'var(--text-tertiary)' }}>{p.description}</p>}
              <div className="flex gap-2">
                <a href={p.tgLink} target="_blank" rel="noopener"
                   className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium"
                   style={{ background: 'rgba(56,148,255,0.15)', color: '#60a5fa' }}>
                  <Send className="w-3.5 h-3.5" /> Telegram
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══ 9. Steps ════════════════════════════════════════════════
function StepsBlock({ data }: { data: any }) {
  const items: any[] = Array.isArray(data.items) ? data.items : []
  return (
    <section className="relative z-10 px-6 lg:px-16 py-16">
      <div className="max-w-5xl mx-auto">
        {data.title && <h2 className="text-3xl md:text-4xl font-bold text-center mb-10" style={{ color: 'var(--text-primary)' }}>{data.title}</h2>}
        <div className="grid md:grid-cols-3 gap-6">
          {items.map((item, i) => (
            <div key={i} className="relative">
              <div className="text-5xl font-bold mb-3" style={{ color: 'var(--accent-1)', opacity: 0.2 }}>{item.number || (i + 1)}</div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{item.title}</h3>
              {item.text && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item.text}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══ 10. Custom HTML ═════════════════════════════════════════
function CustomHtmlBlock({ data }: { data: any }) {
  return (
    <section className="relative z-10 px-6 lg:px-16 py-8">
      <div className="max-w-5xl mx-auto" dangerouslySetInnerHTML={{ __html: data.html || '' }} />
    </section>
  )
}

// ═══ 11. Image ═══════════════════════════════════════════════
function ImageBlock({ data }: { data: any }) {
  if (!data.url) return null
  return (
    <section className="relative z-10 px-6 lg:px-16 py-8">
      <div className="max-w-5xl mx-auto">
        <img src={data.url} alt={data.alt || ''} className="w-full rounded-2xl"
             style={{ maxHeight: data.maxHeight || 'none' }} />
        {data.caption && <p className="text-center text-sm mt-3" style={{ color: 'var(--text-tertiary)' }}>{data.caption}</p>}
      </div>
    </section>
  )
}
