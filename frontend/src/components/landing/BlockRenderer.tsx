'use client'

import Link from 'next/link'
import {
  Shield, Zap, Globe2, Lock, CheckCircle2, Star,
  Wifi, Smartphone, Server, Users, Gift, MessageCircle,
  ChevronDown, ChevronRight, Send, Clock, Play,
  Mail, Building2, Check, Tv, Link2, Rocket,
  Award, Target, Heart, Sparkles,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import type { Tariff, TelegramProxy } from '@/types'

// ── Types ─────────────────────────────────────────────────────
export interface BlockStyle {
  paddingTop?: number           // px
  paddingBottom?: number        // px
  bgColor?: string              // css color
  bgGradient?: string           // e.g. "linear-gradient(135deg, #06b6d4, #8b5cf6)"
  bgImage?: string              // url
  textAlign?: 'left' | 'center' | 'right'
  hideOnMobile?: boolean
  hideOnDesktop?: boolean
  animation?: 'none' | 'fade-in' | 'fade-up' | 'fade-down' | 'slide-left' | 'slide-right' | 'zoom-in' | 'zoom-out'
  animationDelay?: number       // ms
}

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
  onCta?: () => void
  previewDevice?: 'desktop' | 'tablet' | 'mobile'  // force-hide classes in builder preview
}

const ICONS: Record<string, any> = {
  shield: Shield, zap: Zap, globe: Globe2, lock: Lock, check: CheckCircle2,
  star: Star, wifi: Wifi, phone: Smartphone, server: Server, users: Users,
  gift: Gift, chat: MessageCircle, rocket: Rocket, award: Award,
  target: Target, heart: Heart, sparkles: Sparkles,
}

function resolveIcon(name: string): any {
  return ICONS[name] || Shield
}

// ── Animation hook ────────────────────────────────────────────
function useInView(delay = 0) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setTimeout(() => setInView(true), delay)
        obs.disconnect()
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [delay])
  return { ref, inView }
}

// ── Style wrapper ─────────────────────────────────────────────
function StyledBlock({ block, ctx, children }: {
  block: LandingBlock; ctx: RendererContext; children: React.ReactNode
}) {
  const style: BlockStyle = (block.data?.style || {}) as BlockStyle
  const { ref, inView } = useInView(style.animationDelay || 0)
  const anim = style.animation || 'none'
  const animate = anim !== 'none'

  const hideClass = []
  if (style.hideOnMobile && ctx.previewDevice !== 'desktop') hideClass.push('hide-mobile')
  if (style.hideOnDesktop && ctx.previewDevice !== 'mobile') hideClass.push('hide-desktop')

  const bg = style.bgImage
    ? `linear-gradient(rgba(0,0,0,0.4),rgba(0,0,0,0.4)), url(${style.bgImage}) center/cover`
    : style.bgGradient || style.bgColor || undefined

  return (
    <div
      ref={ref}
      className={`lb-block ${hideClass.join(' ')} ${animate ? `lb-anim-${anim}` : ''} ${animate && inView ? 'lb-in' : ''}`}
      style={{
        paddingTop:    style.paddingTop !== undefined ? style.paddingTop + 'px' : undefined,
        paddingBottom: style.paddingBottom !== undefined ? style.paddingBottom + 'px' : undefined,
        background:    bg,
        textAlign:     style.textAlign,
      }}
    >
      {children}
    </div>
  )
}

// ── Main dispatcher ───────────────────────────────────────────
export function BlockRenderer({ block, ctx }: { block: LandingBlock; ctx: RendererContext }) {
  const d = block.data || {}
  let content: React.ReactNode = null
  switch (block.type) {
    case 'hero':          content = <HeroBlock data={d} onCta={ctx.onCta} />; break
    case 'features':      content = <FeaturesBlock data={d} />; break
    case 'tariffs':       content = <TariffsBlock data={d} tariffs={ctx.tariffs || []} onCta={ctx.onCta} />; break
    case 'faq':           content = <FaqBlock data={d} />; break
    case 'reviews':       content = <ReviewsBlock data={d} />; break
    case 'stats':         content = <StatsBlock data={d} />; break
    case 'cta':           content = <CtaBlock data={d} onCta={ctx.onCta} />; break
    case 'proxies':       content = <ProxiesBlock data={d} proxies={ctx.proxies || []} />; break
    case 'steps':         content = <StepsBlock data={d} />; break
    case 'custom_html':   content = <CustomHtmlBlock data={d} />; break
    case 'spacer':        content = <div style={{ height: (d.height || 40) + 'px' }} />; break
    case 'image':         content = <ImageBlock data={d} />; break
    case 'countdown':     content = <CountdownBlock data={d} />; break
    case 'video':         content = <VideoBlock data={d} />; break
    case 'logo_wall':     content = <LogoWallBlock data={d} />; break
    case 'two_column':    content = <TwoColumnBlock data={d} onCta={ctx.onCta} />; break
    case 'team':          content = <TeamBlock data={d} />; break
    case 'timeline':      content = <TimelineBlock data={d} />; break
    case 'contact_form':  content = <ContactFormBlock data={d} />; break
    case 'newsletter':    content = <NewsletterBlock data={d} />; break
    case 'pricing_table': content = <PricingTableBlock data={d} onCta={ctx.onCta} />; break
    case 'telegram_widget': content = <TelegramWidgetBlock data={d} />; break
    default: return null
  }
  return <StyledBlock block={block} ctx={ctx}>{content}</StyledBlock>
}

// ═══ 1. Hero ═════════════════════════════════════════════════
function HeroBlock({ data, onCta }: { data: any; onCta?: () => void }) {
  const align = data.align || 'center'
  return (
    <section className="relative z-10 px-6 lg:px-16 py-20 overflow-hidden">
      <div className={`max-w-5xl mx-auto ${align === 'center' ? 'text-center' : ''}`}>
        {data.badge && (
          <div className="inline-block px-4 py-1.5 rounded-full text-sm font-medium mb-6"
               style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--accent-1)' }}>
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
          <button onClick={onCta}
                  className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-base font-semibold text-white transition-transform hover:scale-105"
                  style={{ background: 'var(--accent-gradient)' }}>
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
  const showIds: string[] = Array.isArray(data.tariffIds) ? data.tariffIds : []
  const visible = showIds.length > 0 ? tariffs.filter(t => showIds.includes(t.id)) : tariffs
  const highlightId = data.highlightId
  return (
    <section id="tariffs" className="relative z-10 px-6 lg:px-16 py-16">
      <div className="max-w-6xl mx-auto">
        {data.title && <h2 className="text-3xl md:text-4xl font-bold text-center mb-4" style={{ color: 'var(--text-primary)' }}>{data.title}</h2>}
        {data.subtitle && <p className="text-center mb-12" style={{ color: 'var(--text-secondary)' }}>{data.subtitle}</p>}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visible.map(t => {
            const isHighlighted = t.id === highlightId || t.isFeatured
            return (
              <div key={t.id} className="p-6 rounded-2xl flex flex-col"
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
                <button onClick={onCta} className="mt-auto px-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--accent-gradient)' }}>Выбрать</button>
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
              <button onClick={() => setOpenIdx(openIdx === i ? null : i)} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left">
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{item.q}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${openIdx === i ? 'rotate-180' : ''}`} style={{ color: 'var(--text-tertiary)' }} />
              </button>
              {openIdx === i && <div className="px-5 pb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>{item.a}</div>}
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
              <a href={p.tgLink} target="_blank" rel="noopener"
                 className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium"
                 style={{ background: 'rgba(56,148,255,0.15)', color: '#60a5fa' }}>
                <Send className="w-3.5 h-3.5" /> Telegram
              </a>
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
        <img src={data.url} alt={data.alt || ''} className="w-full rounded-2xl" style={{ maxHeight: data.maxHeight || 'none' }} />
        {data.caption && <p className="text-center text-sm mt-3" style={{ color: 'var(--text-tertiary)' }}>{data.caption}</p>}
      </div>
    </section>
  )
}

// ═══ 12. Countdown ═══════════════════════════════════════════
function CountdownBlock({ data }: { data: any }) {
  const target = data.targetDate ? new Date(data.targetDate).getTime() : Date.now() + 86400_000
  const [left, setLeft] = useState(Math.max(0, target - Date.now()))
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, target - Date.now())), 1000)
    return () => clearInterval(id)
  }, [target])
  const d = Math.floor(left / 86400_000)
  const h = Math.floor((left % 86400_000) / 3600_000)
  const m = Math.floor((left % 3600_000) / 60_000)
  const s = Math.floor((left % 60_000) / 1000)
  const units = [
    { value: d, label: 'дней' },
    { value: h, label: 'часов' },
    { value: m, label: 'минут' },
    { value: s, label: 'секунд' },
  ]
  return (
    <section className="relative z-10 px-6 lg:px-16 py-16">
      <div className="max-w-4xl mx-auto text-center">
        {data.title && <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>{data.title}</h2>}
        {data.subtitle && <p className="mb-8" style={{ color: 'var(--text-secondary)' }}>{data.subtitle}</p>}
        <div className="flex justify-center gap-3 md:gap-5">
          {units.map((u, i) => (
            <div key={i} className="p-4 md:p-6 rounded-2xl min-w-[75px] md:min-w-[110px]"
                 style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
              <div className="text-3xl md:text-5xl font-bold" style={{ color: 'var(--accent-1)' }}>
                {String(u.value).padStart(2, '0')}
              </div>
              <div className="text-xs md:text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>{u.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══ 13. Video ═══════════════════════════════════════════════
function VideoBlock({ data }: { data: any }) {
  const url = data.url || ''
  // Detect YouTube / Vimeo / direct mp4
  let embedUrl = ''
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/)
  const vm = url.match(/vimeo\.com\/(\d+)/)
  if (yt) embedUrl = `https://www.youtube.com/embed/${yt[1]}`
  else if (vm) embedUrl = `https://player.vimeo.com/video/${vm[1]}`

  return (
    <section className="relative z-10 px-6 lg:px-16 py-12">
      <div className="max-w-4xl mx-auto">
        {data.title && <h2 className="text-3xl md:text-4xl font-bold text-center mb-6" style={{ color: 'var(--text-primary)' }}>{data.title}</h2>}
        <div className="aspect-video rounded-2xl overflow-hidden" style={{ background: '#000' }}>
          {embedUrl ? (
            <iframe src={embedUrl} className="w-full h-full" allowFullScreen allow="autoplay; encrypted-media" />
          ) : url.match(/\.(mp4|webm|ogg)$/i) ? (
            <video src={url} controls className="w-full h-full" />
          ) : (
            <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-tertiary)' }}>
              <Play className="w-12 h-12" />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ═══ 14. Logo Wall ═══════════════════════════════════════════
function LogoWallBlock({ data }: { data: any }) {
  const items: any[] = Array.isArray(data.items) ? data.items : []
  return (
    <section className="relative z-10 px-6 lg:px-16 py-12">
      <div className="max-w-6xl mx-auto">
        {data.title && <p className="text-center text-sm uppercase tracking-wider mb-8" style={{ color: 'var(--text-tertiary)' }}>{data.title}</p>}
        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12 opacity-70">
          {items.map((item, i) => (
            item.url ? (
              <a key={i} href={item.link || '#'} target="_blank" rel="noopener" className="flex items-center">
                <img src={item.url} alt={item.alt || ''} className="h-8 md:h-10 grayscale hover:grayscale-0 transition-all" />
              </a>
            ) : (
              <div key={i} className="text-lg md:text-xl font-semibold" style={{ color: 'var(--text-tertiary)' }}>{item.name}</div>
            )
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══ 15. Two Column ══════════════════════════════════════════
function TwoColumnBlock({ data, onCta }: { data: any; onCta?: () => void }) {
  const imageRight = data.imagePosition !== 'left'
  return (
    <section className="relative z-10 px-6 lg:px-16 py-16">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10 items-center">
        <div className={imageRight ? 'order-1' : 'order-1 md:order-2'}>
          {data.badge && (
            <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-4"
                 style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--accent-1)' }}>
              {data.badge}
            </div>
          )}
          <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>{data.title}</h2>
          {data.text && <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>{data.text}</p>}
          {Array.isArray(data.bullets) && (
            <ul className="space-y-2 mb-6">
              {data.bullets.map((b: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-1)' }} />
                  {b}
                </li>
              ))}
            </ul>
          )}
          {data.ctaText && (
            <button onClick={onCta}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold text-white"
                    style={{ background: 'var(--accent-gradient)' }}>
              {data.ctaText} <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className={imageRight ? 'order-2' : 'order-2 md:order-1'}>
          {data.image && <img src={data.image} alt={data.title || ''} className="w-full rounded-2xl" />}
        </div>
      </div>
    </section>
  )
}

// ═══ 16. Team ════════════════════════════════════════════════
function TeamBlock({ data }: { data: any }) {
  const items: any[] = Array.isArray(data.items) ? data.items : []
  return (
    <section className="relative z-10 px-6 lg:px-16 py-16">
      <div className="max-w-6xl mx-auto">
        {data.title && <h2 className="text-3xl md:text-4xl font-bold text-center mb-10" style={{ color: 'var(--text-primary)' }}>{data.title}</h2>}
        <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-6">
          {items.map((item, i) => (
            <div key={i} className="text-center">
              {item.photo ? (
                <img src={item.photo} alt={item.name} className="w-28 h-28 rounded-full mx-auto mb-3 object-cover" />
              ) : (
                <div className="w-28 h-28 rounded-full mx-auto mb-3 flex items-center justify-center text-3xl font-bold text-white"
                     style={{ background: 'var(--accent-gradient)' }}>
                  {item.name?.[0] || '?'}
                </div>
              )}
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{item.name}</h3>
              {item.role && <p className="text-sm" style={{ color: 'var(--accent-1)' }}>{item.role}</p>}
              {item.bio && <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>{item.bio}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══ 17. Timeline ════════════════════════════════════════════
function TimelineBlock({ data }: { data: any }) {
  const items: any[] = Array.isArray(data.items) ? data.items : []
  return (
    <section className="relative z-10 px-6 lg:px-16 py-16">
      <div className="max-w-3xl mx-auto">
        {data.title && <h2 className="text-3xl md:text-4xl font-bold text-center mb-12" style={{ color: 'var(--text-primary)' }}>{data.title}</h2>}
        <div className="relative">
          <div className="absolute left-4 top-2 bottom-2 w-0.5" style={{ background: 'var(--glass-border)' }} />
          <div className="space-y-6">
            {items.map((item, i) => (
              <div key={i} className="flex gap-4">
                <div className="relative z-10 w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                     style={{ background: item.done ? 'var(--accent-gradient)' : 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
                  {item.done ? <Check className="w-4 h-4 text-white" /> : <Clock className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />}
                </div>
                <div className="flex-1 pb-4">
                  {item.date && <div className="text-xs font-semibold" style={{ color: 'var(--accent-1)' }}>{item.date}</div>}
                  <h3 className="font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>{item.title}</h3>
                  {item.text && <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{item.text}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ═══ 18. Contact Form ════════════════════════════════════════
function ContactFormBlock({ data }: { data: any }) {
  const [email, setEmail] = useState('')
  const [name, setName]   = useState('')
  const [msg, setMsg]     = useState('')
  const [sent, setSent]   = useState(false)
  const [sending, setSending] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !msg) return
    setSending(true)
    try {
      await fetch('/api/public/tickets/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: data.title || 'Заявка с лендинга',
          email, name, message: msg,
          category: data.category || 'GENERAL',
        }),
      })
      setSent(true)
    } catch {} finally { setSending(false) }
  }

  if (sent) {
    return (
      <section className="relative z-10 px-6 lg:px-16 py-16">
        <div className="max-w-xl mx-auto text-center p-8 rounded-2xl" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
          <Check className="w-12 h-12 mx-auto mb-4" style={{ color: '#22c55e' }} />
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{data.successTitle || 'Спасибо!'}</h2>
          <p style={{ color: 'var(--text-secondary)' }}>{data.successText || 'Мы свяжемся с вами в ближайшее время.'}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="relative z-10 px-6 lg:px-16 py-16">
      <div className="max-w-xl mx-auto">
        {data.title && <h2 className="text-3xl md:text-4xl font-bold text-center mb-4" style={{ color: 'var(--text-primary)' }}>{data.title}</h2>}
        {data.subtitle && <p className="text-center mb-8" style={{ color: 'var(--text-secondary)' }}>{data.subtitle}</p>}
        <form onSubmit={submit} className="space-y-3 p-6 rounded-2xl" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ваше имя"
                 className="w-full px-4 py-3 rounded-xl text-sm"
                 style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Email *"
                 className="w-full px-4 py-3 rounded-xl text-sm"
                 style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
          <textarea required rows={4} value={msg} onChange={e => setMsg(e.target.value)} placeholder={data.placeholder || 'Ваше сообщение *'}
                    className="w-full px-4 py-3 rounded-xl text-sm resize-none"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
          <button type="submit" disabled={sending}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--accent-gradient)' }}>
            {sending ? 'Отправка...' : (data.buttonText || 'Отправить')}
          </button>
        </form>
      </div>
    </section>
  )
}

// ═══ 19. Newsletter ══════════════════════════════════════════
function NewsletterBlock({ data }: { data: any }) {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    // Store to localStorage — backend endpoint can be added later
    try {
      const list = JSON.parse(localStorage.getItem('newsletter') || '[]')
      list.push({ email, ts: Date.now() })
      localStorage.setItem('newsletter', JSON.stringify(list))
    } catch {}
    setDone(true)
  }
  return (
    <section className="relative z-10 px-6 lg:px-16 py-14">
      <div className="max-w-2xl mx-auto text-center">
        <Mail className="w-10 h-10 mx-auto mb-4" style={{ color: 'var(--accent-1)' }} />
        <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{data.title || 'Подписка на новости'}</h2>
        <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>{data.subtitle || 'Узнавайте об акциях и новинках первыми'}</p>
        {done ? (
          <p className="font-semibold" style={{ color: '#22c55e' }}>Спасибо! Вы подписаны.</p>
        ) : (
          <form onSubmit={submit} className="flex gap-2 max-w-md mx-auto">
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com"
                   className="flex-1 px-4 py-3 rounded-xl text-sm"
                   style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
            <button type="submit"
                    className="px-6 py-3 rounded-xl text-sm font-semibold text-white"
                    style={{ background: 'var(--accent-gradient)' }}>
              {data.buttonText || 'Подписаться'}
            </button>
          </form>
        )}
      </div>
    </section>
  )
}

// ═══ 20. Pricing Table ═══════════════════════════════════════
function PricingTableBlock({ data, onCta }: { data: any; onCta?: () => void }) {
  const features: string[] = Array.isArray(data.features) ? data.features : []
  const plans: any[] = Array.isArray(data.plans) ? data.plans : []
  return (
    <section className="relative z-10 px-6 lg:px-16 py-16">
      <div className="max-w-5xl mx-auto">
        {data.title && <h2 className="text-3xl md:text-4xl font-bold text-center mb-10" style={{ color: 'var(--text-primary)' }}>{data.title}</h2>}
        <div className="rounded-2xl overflow-x-auto" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr>
                <th className="p-4 text-left" style={{ color: 'var(--text-tertiary)' }}>Функция</th>
                {plans.map((p, i) => (
                  <th key={i} className="p-4 text-center" style={{ color: p.highlighted ? 'var(--accent-1)' : 'var(--text-primary)' }}>
                    <div className="font-bold">{p.name}</div>
                    {p.price && <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{p.price}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((f, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--glass-border)' }}>
                  <td className="p-3" style={{ color: 'var(--text-secondary)' }}>{f}</td>
                  {plans.map((p, j) => (
                    <td key={j} className="p-3 text-center">
                      {p.values?.[i] === true || p.values?.[i] === 'yes' ? (
                        <Check className="w-4 h-4 mx-auto" style={{ color: '#22c55e' }} />
                      ) : p.values?.[i] === false || p.values?.[i] === 'no' ? (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>{p.values?.[i] || ''}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--glass-border)' }}>
                <td />
                {plans.map((p, i) => (
                  <td key={i} className="p-4 text-center">
                    <button onClick={onCta} className="px-4 py-2 rounded-lg text-xs font-semibold text-white"
                            style={{ background: p.highlighted ? 'var(--accent-gradient)' : 'var(--surface-2)', color: p.highlighted ? '#fff' : 'var(--text-primary)' }}>
                      {p.buttonText || 'Выбрать'}
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

// ═══ 21. Telegram widget ═════════════════════════════════════
function TelegramWidgetBlock({ data }: { data: any }) {
  const channel = (data.channel || '').replace('@', '').replace('https://t.me/', '')
  return (
    <section className="relative z-10 px-6 lg:px-16 py-14">
      <div className="max-w-2xl mx-auto text-center p-8 rounded-2xl"
           style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
        <Send className="w-10 h-10 mx-auto mb-4" style={{ color: '#60a5fa' }} />
        <h2 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{data.title || 'Telegram-канал'}</h2>
        <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>{data.subtitle || 'Новости, инструкции, акции'}</p>
        {channel && (
          <a href={`https://t.me/${channel}`} target="_blank" rel="noopener"
             className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white"
             style={{ background: '#2aabee' }}>
            <Send className="w-4 h-4" /> Открыть @{channel}
          </a>
        )}
      </div>
    </section>
  )
}
