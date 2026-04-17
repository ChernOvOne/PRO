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
  // Spacing
  paddingTop?: number
  paddingBottom?: number

  // Background
  bgColor?: string
  bgGradient?: string
  bgImage?: string
  bgAnimated?: boolean                        // moving gradient
  bgPattern?: 'none' | 'dots' | 'grid' | 'noise'
  bgOverlay?: string                           // color + "alpha" — applied on top

  // Container
  containerWidth?: 'narrow' | 'normal' | 'wide' | 'full'
  textAlign?: 'left' | 'center' | 'right'

  // Visibility
  hideOnMobile?: boolean
  hideOnDesktop?: boolean

  // Animation (entrance)
  animation?: 'none' | 'fade-in' | 'fade-up' | 'fade-down' | 'slide-left' | 'slide-right' | 'zoom-in' | 'zoom-out'
  animationDelay?: number
  staggerChildren?: boolean                    // items appear one-by-one

  // Section dividers
  dividerTop?: 'none' | 'wave' | 'triangle' | 'curve' | 'tilt' | 'stairs'
  dividerBottom?: 'none' | 'wave' | 'triangle' | 'curve' | 'tilt' | 'stairs'
  dividerColor?: string                        // color for divider SVG fill

  // Title styling
  titleSize?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  titleWeight?: 'normal' | 'medium' | 'semibold' | 'bold' | 'black'
  titleGradient?: boolean
  titleColor?: string

  // Cards (for items inside features/reviews/team/steps)
  cardHover?: 'none' | 'lift' | 'glow' | 'scale' | 'tilt' | 'border-glow'

  // Decorative
  sectionNumber?: string                       // "01", "02"…
  sectionNumberColor?: string

  // Image effects (for image/logo_wall/team blocks)
  imageEffect?: 'none' | 'grayscale-hover' | 'blur-hover' | 'zoom-hover' | 'rotate-hover'
  imageRounded?: number                        // px

  // Button overrides per block (inherits from global brand settings)
  buttonVariant?: 'solid' | 'gradient' | 'outline' | 'ghost' | 'glass' | 'soft'
  buttonShape?: 'rounded' | 'pill' | 'square'
  buttonSize?: 'sm' | 'md' | 'lg' | 'xl'
  buttonHover?: 'none' | 'lift' | 'glow' | 'scale' | 'shine' | 'shake' | 'gradient-shift'
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
  disableAnimations?: boolean  // in builder: show blocks instantly without scroll effects
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
// Starts with `inView = false` so the initial paint is the hidden state
// (prevents flash-of-content before observer fires).
function useInView(enabled: boolean, delay = 0) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    if (!enabled || !ref.current) return
    const el = ref.current
    // If already in viewport at mount time → trigger immediately (with requestAnimationFrame
    // so the browser commits the initial hidden state first).
    const rect = el.getBoundingClientRect()
    const vpH = window.innerHeight || document.documentElement.clientHeight
    const alreadyVisible = rect.top < vpH * 0.85 && rect.bottom > 0
    if (alreadyVisible) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (delay > 0) setTimeout(() => setInView(true), delay)
          else setInView(true)
        })
      })
      return
    }
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        if (delay > 0) setTimeout(() => setInView(true), delay)
        else setInView(true)
        obs.disconnect()
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [enabled, delay])
  return { ref, inView }
}

// Inline transform for each animation — applied directly so the hidden state
// is painted on the very first frame (no FOUC).
function hiddenTransform(anim: string): string | undefined {
  switch (anim) {
    case 'fade-up':     return 'translateY(30px)'
    case 'fade-down':   return 'translateY(-30px)'
    case 'slide-left':  return 'translateX(30px)'
    case 'slide-right': return 'translateX(-30px)'
    case 'zoom-in':     return 'scale(0.92)'
    case 'zoom-out':    return 'scale(1.08)'
    default:            return undefined
  }
}

// ── Section dividers (SVG) ────────────────────────────────────
function SectionDivider({ shape, color, position }: {
  shape: string; color: string; position: 'top' | 'bottom'
}) {
  if (!shape || shape === 'none') return null
  const rotate = position === 'top' ? 'rotate(180deg)' : 'none'
  const style: React.CSSProperties = {
    position: 'absolute', left: 0, right: 0, width: '100%',
    height: '60px', display: 'block', pointerEvents: 'none',
    transform: rotate, zIndex: 1,
    [position]: '-1px',
  } as any

  const paths: Record<string, React.ReactNode> = {
    wave:     <path d="M0,60 C240,120 480,0 720,40 C960,80 1200,20 1440,60 L1440,100 L0,100 Z" fill={color} />,
    triangle: <path d="M0,60 L720,0 L1440,60 L1440,100 L0,100 Z" fill={color} />,
    curve:    <path d="M0,60 Q720,0 1440,60 L1440,100 L0,100 Z" fill={color} />,
    tilt:     <path d="M0,100 L1440,40 L1440,100 Z" fill={color} />,
    stairs:   <path d="M0,100 L0,60 L360,60 L360,40 L720,40 L720,20 L1080,20 L1080,0 L1440,0 L1440,100 Z" fill={color} />,
  }

  return (
    <svg viewBox="0 0 1440 100" preserveAspectRatio="none" style={style}>
      {paths[shape]}
    </svg>
  )
}

// ── Style wrapper ─────────────────────────────────────────────
function StyledBlock({ block, ctx, children }: {
  block: LandingBlock; ctx: RendererContext; children: React.ReactNode
}) {
  const style: BlockStyle = (block.data?.style || {}) as BlockStyle
  const anim = style.animation || 'none'
  const animate = anim !== 'none' && !ctx.disableAnimations
  const { ref, inView } = useInView(animate, style.animationDelay || 0)

  const hideClass = []
  if (style.hideOnMobile && ctx.previewDevice !== 'desktop') hideClass.push('hide-mobile')
  if (style.hideOnDesktop && ctx.previewDevice !== 'mobile') hideClass.push('hide-desktop')

  // Container width map
  const widthMap: Record<string, string> = {
    narrow: 'max-w-[640px]', normal: 'max-w-[1024px]', wide: 'max-w-[1280px]', full: '',
  }
  const widthClass = widthMap[style.containerWidth || ''] ?? ''

  // Background layers — inline bg is skipped when animated gradient is on,
  // so the CSS animation (.lb-bg-animated) can take effect.
  const bg = style.bgAnimated
    ? undefined
    : style.bgImage
      ? `linear-gradient(rgba(0,0,0,0.4),rgba(0,0,0,0.4)), url(${style.bgImage}) center/cover`
      : style.bgGradient || style.bgColor || undefined

  const animStyle: React.CSSProperties = {}
  if (animate) {
    animStyle.transition = 'opacity 0.7s ease-out, transform 0.7s cubic-bezier(.16,1,.3,1)'
    animStyle.willChange = 'opacity, transform'
    if (!inView) {
      animStyle.opacity = 0
      const t = hiddenTransform(anim)
      if (t) animStyle.transform = t
    }
  }

  // Data attributes propagate styling to child components via CSS.
  // Only set data-stagger when stagger is explicitly enabled — otherwise
  // the CSS selector would hide all children by default.
  const dataAttrs: Record<string, string> = {}
  if (style.cardHover && style.cardHover !== 'none')       dataAttrs['data-card-hover'] = style.cardHover
  if (style.imageEffect && style.imageEffect !== 'none')   dataAttrs['data-image-effect'] = style.imageEffect
  if (style.staggerChildren) dataAttrs['data-stagger'] = inView ? '1' : '0'

  // Patterns
  const patternClass = style.bgPattern && style.bgPattern !== 'none' ? `lb-bg-${style.bgPattern}` : ''
  const animatedBgClass = style.bgAnimated ? 'lb-bg-animated' : ''

  // When pattern is set, use background-color + let CSS class apply background-image.
  // (Using `background` shorthand would wipe out the pattern's background-image.)
  const usePattern = !!patternClass
  const bgInline: React.CSSProperties = {}
  if (!style.bgAnimated) {
    if (usePattern) {
      bgInline.backgroundColor = style.bgColor || undefined
      if (style.bgGradient) bgInline.backgroundImage = style.bgGradient
    } else if (bg) {
      bgInline.background = bg
    }
  }

  return (
    <div
      ref={ref}
      className={`lb-block relative ${hideClass.join(' ')} ${patternClass} ${animatedBgClass}`}
      style={{
        paddingTop:    style.paddingTop !== undefined ? style.paddingTop + 'px' : undefined,
        paddingBottom: style.paddingBottom !== undefined ? style.paddingBottom + 'px' : undefined,
        textAlign:     style.textAlign,
        ...bgInline,
        ...animStyle,
      }}
      {...dataAttrs}
    >
      <SectionDivider shape={style.dividerTop || 'none'} color={style.dividerColor || 'var(--surface-0)'} position="top" />
      {/* Background overlay */}
      {style.bgOverlay && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: style.bgOverlay }} />
      )}
      {/* Section number decoration */}
      {style.sectionNumber && (
        <div className="absolute top-8 left-8 text-7xl md:text-8xl font-black opacity-10 pointer-events-none select-none z-0"
             style={{ color: style.sectionNumberColor || 'var(--accent-1)' }}>
          {style.sectionNumber}
        </div>
      )}
      <div className={widthClass ? `${widthClass} mx-auto relative z-10` : 'relative z-10'}>
        {children}
      </div>
      <SectionDivider shape={style.dividerBottom || 'none'} color={style.dividerColor || 'var(--surface-0)'} position="bottom" />
    </div>
  )
}

// ── Brand button component ─────────────────────────────────────
// Supports 6 variants, 4 sizes, 3 shapes, 7 hover effects. Used by all CTA-like blocks.
export function BrandButton({ onClick, children, icon, style, block }: {
  onClick?: () => void
  children: React.ReactNode
  icon?: React.ReactNode
  style?: BlockStyle
  block?: any
}) {
  const s = style || {}
  const variant = s.buttonVariant || 'gradient'
  const size    = s.buttonSize    || 'md'
  const shape   = s.buttonShape   || 'rounded'
  const hover   = s.buttonHover   || 'lift'

  const sizeMap = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-2.5 text-base',
    lg: 'px-8 py-3.5 text-base',
    xl: 'px-10 py-4 text-lg',
  }
  const shapeMap = { rounded: 'rounded-xl', pill: 'rounded-full', square: 'rounded-md' }

  const variantStyle: React.CSSProperties = {}
  let variantCls = 'text-white'
  switch (variant) {
    case 'gradient': variantStyle.background = 'var(--accent-gradient)'; break
    case 'solid':    variantStyle.background = 'var(--accent-1)'; break
    case 'outline':  variantCls = ''; variantStyle.color = 'var(--accent-1)'; variantStyle.background = 'transparent'; variantStyle.border = '2px solid var(--accent-1)'; break
    case 'ghost':    variantCls = ''; variantStyle.color = 'var(--accent-1)'; variantStyle.background = 'rgba(6,182,212,0.08)'; break
    case 'glass':    variantCls = ''; variantStyle.color = 'var(--text-primary)'; variantStyle.background = 'rgba(255,255,255,0.08)'; variantStyle.backdropFilter = 'blur(12px)'; variantStyle.border = '1px solid rgba(255,255,255,0.12)'; break
    case 'soft':     variantCls = ''; variantStyle.color = 'var(--accent-1)'; variantStyle.background = 'rgba(6,182,212,0.15)'; break
  }

  return (
    <button onClick={onClick}
            className={`inline-flex items-center gap-2 font-semibold transition-all lb-btn lb-btn-hover-${hover} ${sizeMap[size]} ${shapeMap[shape]} ${variantCls}`}
            style={variantStyle}>
      {children}
      {icon}
    </button>
  )
}

// ── Card wrapper (applies hover effect to item cards) ─────────
export function CardWrap({ children, className = '', style, cardHover }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties; cardHover?: string
}) {
  const hc = cardHover && cardHover !== 'none' ? `lb-card-${cardHover}` : ''
  return <div className={`${className} ${hc}`} style={style}>{children}</div>
}

// ── Counter (animates from 0 to value when in view) ───────────
function Counter({ value, className, style }: { value: string; className?: string; style?: React.CSSProperties }) {
  const { ref, inView } = useInView(true)
  // Parse value — extract number and suffix (e.g. "10К+" → 10, "К+")
  const match = value.match(/^([\d.]+)\s*(.*)$/)
  const target = match ? parseFloat(match[1]) : 0
  const suffix = match ? match[2] : ''
  const [cur, setCur] = useState(target === 0 ? 0 : 0)

  useEffect(() => {
    if (!inView) return
    const duration = 1400
    const start = performance.now()
    let raf = 0
    const tick = () => {
      const progress = Math.min(1, (performance.now() - start) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCur(target * eased)
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, target])

  const display = Number.isInteger(target) ? Math.round(cur) : cur.toFixed(1)
  return (
    <span ref={ref as any} className={className} style={style}>
      {target > 0 ? `${display}${suffix}` : value}
    </span>
  )
}

// ── Title helper (applies titleSize / weight / gradient) ──────
function StyledTitle({ style, text, className = '' }: { style?: BlockStyle; text?: string; className?: string }) {
  if (!text) return null
  const s = style || {}
  const sizeMap = {
    sm:   'text-2xl md:text-3xl',
    md:   'text-3xl md:text-4xl',
    lg:   'text-4xl md:text-5xl',
    xl:   'text-5xl md:text-6xl',
    '2xl':'text-6xl md:text-7xl',
    '3xl':'text-7xl md:text-8xl',
  }
  const weightMap = {
    normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold',
    bold: 'font-bold', black: 'font-black',
  }
  const sizeCls   = sizeMap[s.titleSize || 'md']
  const weightCls = weightMap[s.titleWeight || 'bold']
  const gradCls   = s.titleGradient ? 'lb-text-gradient' : ''
  const color     = s.titleColor && !s.titleGradient ? s.titleColor : undefined

  return (
    <h2 className={`${sizeCls} ${weightCls} ${gradCls} ${className}`}
        style={{ color: color || (s.titleGradient ? undefined : 'var(--text-primary)') }}>
      {text}
    </h2>
  )
}

// ── Main dispatcher ───────────────────────────────────────────
export function BlockRenderer({ block, ctx }: { block: LandingBlock; ctx: RendererContext }) {
  const d = block.data || {}
  const s: BlockStyle = (d.style || {}) as BlockStyle
  let content: React.ReactNode = null
  switch (block.type) {
    case 'hero':          content = <HeroBlock data={d} style={s} onCta={ctx.onCta} />; break
    case 'features':      content = <FeaturesBlock data={d} style={s} />; break
    case 'tariffs':       content = <TariffsBlock data={d} style={s} tariffs={ctx.tariffs || []} onCta={ctx.onCta} />; break
    case 'faq':           content = <FaqBlock data={d} style={s} />; break
    case 'reviews':       content = <ReviewsBlock data={d} style={s} />; break
    case 'stats':         content = <StatsBlock data={d} style={s} />; break
    case 'cta':           content = <CtaBlock data={d} style={s} onCta={ctx.onCta} />; break
    case 'proxies':       content = <ProxiesBlock data={d} style={s} proxies={ctx.proxies || []} />; break
    case 'steps':         content = <StepsBlock data={d} style={s} />; break
    case 'custom_html':   content = <CustomHtmlBlock data={d} />; break
    case 'spacer':        content = <div style={{ height: (d.height || 40) + 'px' }} />; break
    case 'image':         content = <ImageBlock data={d} style={s} />; break
    case 'countdown':     content = <CountdownBlock data={d} style={s} />; break
    case 'video':         content = <VideoBlock data={d} style={s} />; break
    case 'logo_wall':     content = <LogoWallBlock data={d} style={s} />; break
    case 'two_column':    content = <TwoColumnBlock data={d} style={s} onCta={ctx.onCta} />; break
    case 'team':          content = <TeamBlock data={d} style={s} />; break
    case 'timeline':      content = <TimelineBlock data={d} style={s} />; break
    case 'contact_form':  content = <ContactFormBlock data={d} style={s} />; break
    case 'newsletter':    content = <NewsletterBlock data={d} style={s} />; break
    case 'pricing_table': content = <PricingTableBlock data={d} style={s} onCta={ctx.onCta} />; break
    case 'telegram_widget': content = <TelegramWidgetBlock data={d} style={s} />; break
    case 'heading':       content = <HeadingBlock data={d} style={s} />; break
    case 'text':          content = <TextBlock data={d} style={s} />; break
    case 'quote':         content = <QuoteBlock data={d} style={s} />; break
    case 'news':          content = <NewsBlock data={d} style={s} />; break
    case 'divider':       content = <DividerBlock data={d} style={s} />; break
    default: return null
  }
  return <StyledBlock block={block} ctx={ctx}>{content}</StyledBlock>
}

// ═══ 1. Hero (premium) ═══════════════════════════════════════
function HeroBlock({ data, style, onCta }: { data: any; style: BlockStyle; onCta?: () => void }) {
  const align = data.align || 'center'
  const variant = data.variant || 'center'
  const titleSize = { ...style, titleSize: style.titleSize || '2xl' } as BlockStyle
  const showDeco = data.showDecoration !== false

  // Decorative blurred blobs for premium glow effect
  const Deco = () => showDeco ? (
    <>
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full pointer-events-none z-0 opacity-30"
           style={{ background: 'radial-gradient(circle, var(--accent-1), transparent 70%)', filter: 'blur(80px)' }} />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full pointer-events-none z-0 opacity-30"
           style={{ background: 'radial-gradient(circle, var(--accent-2), transparent 70%)', filter: 'blur(80px)' }} />
    </>
  ) : null

  if (variant === 'split' && data.image) {
    return (
      <section className="relative z-10 px-6 lg:px-16 py-24 md:py-32 overflow-hidden">
        <Deco />
        <div className="grid md:grid-cols-2 gap-12 items-center relative z-10">
          <div>
            {data.badge && (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-7 backdrop-blur-sm"
                   style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--accent-1)', border: '1px solid rgba(6,182,212,0.2)' }}>
                ✨ {data.badge}
              </div>
            )}
            <StyledTitle style={titleSize} text={data.title || 'Заголовок'} className="tracking-tight mb-5" />
            {data.subtitle && <p className="text-lg md:text-xl mb-8 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{data.subtitle}</p>}
            {data.ctaText && <BrandButton onClick={onCta} style={{ ...style, buttonSize: style.buttonSize || 'lg' }} icon={<ChevronRight className="w-5 h-5" />}>{data.ctaText}</BrandButton>}
          </div>
          <div className="relative">
            <div className="absolute -inset-2 rounded-3xl opacity-40" style={{ background: 'var(--accent-gradient)', filter: 'blur(40px)' }} />
            <img src={data.image} alt={data.title} className="relative w-full rounded-3xl" />
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="relative z-10 px-6 lg:px-16 py-24 md:py-36 overflow-hidden">
      <Deco />
      <div className={`relative z-10 ${align === 'center' ? 'text-center' : ''}`}>
        {data.badge && (
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-7 backdrop-blur-sm"
               style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--accent-1)', border: '1px solid rgba(6,182,212,0.2)' }}>
            {data.badge}
          </div>
        )}
        <StyledTitle style={titleSize} text={data.title || 'Заголовок'} className="tracking-tight mb-6 leading-[1.05]" />
        {data.subtitle && (
          <p className="text-lg md:text-xl mb-10 max-w-2xl mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {data.subtitle}
          </p>
        )}
        {data.ctaText && (
          <BrandButton onClick={onCta} style={{ ...style, buttonSize: style.buttonSize || 'lg' }}
                       icon={<ChevronRight className="w-5 h-5" />}>
            {data.ctaText}
          </BrandButton>
        )}
      </div>
    </section>
  )
}

// ═══ 2. Features ═════════════════════════════════════════════
function FeaturesBlock({ data, style }: { data: any; style: BlockStyle }) {
  const items: any[] = Array.isArray(data.items) ? data.items : []
  const cols = data.columns || 3
  const variant = data.variant || 'cards'      // cards / borderless / icons-top / icons-left / bordered
  const iconsLeft = variant === 'icons-left'
  const stagger = style.staggerChildren
  return (
    <section className="relative z-10 px-6 lg:px-16 py-16">
      <div>
        {data.title && (
          <div className="text-center mb-12">
            <StyledTitle style={style} text={data.title} />
          </div>
        )}
        <div className={`grid gap-6 ${cols === 2 ? 'md:grid-cols-2' : cols === 4 ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'}`}>
          {items.map((item, i) => {
            const Icon = resolveIcon(item.icon)
            const cardStyle: React.CSSProperties = {}
            let cardCls = 'p-6 rounded-2xl'
            if (variant === 'cards' || variant === 'bordered') {
              cardStyle.background = variant === 'bordered' ? 'transparent' : 'var(--surface-1)'
              cardStyle.border = '1px solid var(--glass-border)'
            } else if (variant === 'borderless') {
              cardStyle.background = 'transparent'
            }
            if (stagger) {
              cardStyle.transition = 'opacity 0.6s, transform 0.6s'
              cardStyle.transitionDelay = (i * 100) + 'ms'
            }
            return (
              <CardWrap key={i} className={`${cardCls} ${iconsLeft ? 'flex gap-4 items-start' : ''} backdrop-blur-sm`}
                        style={cardStyle} cardHover={style.cardHover || 'lift'}>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 relative ${iconsLeft ? '' : 'mb-5'}`}
                     style={{ background: 'var(--accent-gradient)', boxShadow: '0 6px 20px rgba(6,182,212,0.25)' }}>
                  <Icon className="w-5 h-5 text-white relative z-10" />
                </div>
                <div className={iconsLeft ? 'flex-1' : ''}>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{item.title}</h3>
                  {item.text && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item.text}</p>}
                </div>
              </CardWrap>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ═══ 3. Tariffs ══════════════════════════════════════════════
function TariffsBlock({ data, style, tariffs, onCta }: { data: any; style: BlockStyle; tariffs: Tariff[]; onCta?: () => void }) {
  const showIds: string[] = Array.isArray(data.tariffIds) ? data.tariffIds : []
  const visible = showIds.length > 0 ? tariffs.filter(t => showIds.includes(t.id)) : tariffs
  const highlightId = data.highlightId
  return (
    <section id="tariffs" className="relative z-10 px-6 lg:px-16 py-16">
      <div>
        {data.title && <div className="text-center mb-4"><StyledTitle style={style} text={data.title} /></div>}
        {data.subtitle && <p className="text-center mb-12" style={{ color: 'var(--text-secondary)' }}>{data.subtitle}</p>}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visible.map((t, i) => {
            const isHighlighted = t.id === highlightId || t.isFeatured
            const cardStyle: React.CSSProperties = {
              background: 'var(--surface-1)',
              border: isHighlighted ? '2px solid var(--accent-1)' : '1px solid var(--glass-border)',
              boxShadow: isHighlighted ? '0 10px 40px rgba(6,182,212,0.15)' : 'none',
            }
            if (style.staggerChildren) {
              cardStyle.transitionDelay = (i * 80) + 'ms'
            }
            return (
              <CardWrap key={t.id} className="p-6 rounded-2xl flex flex-col" style={cardStyle} cardHover={style.cardHover}>
                {isHighlighted && (
                  <div className="inline-block self-start px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider mb-3" style={{ background: 'rgba(6,182,212,0.15)', color: 'var(--accent-1)' }}>Популярный</div>
                )}
                <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t.name}</h3>
                {t.description && <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>{t.description}</p>}
                <div className="text-3xl font-bold mb-5" style={{ color: 'var(--text-primary)' }}>{Number(t.priceRub).toLocaleString('ru-RU')} ₽<span className="text-sm font-normal" style={{ color: 'var(--text-tertiary)' }}>/{t.durationDays} дн</span></div>
                <div className="mt-auto">
                  <BrandButton onClick={onCta} style={style}>Выбрать</BrandButton>
                </div>
              </CardWrap>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ═══ 4. FAQ ══════════════════════════════════════════════════
function FaqBlock({ data, style }: { data: any; style: BlockStyle }) {
  const items: any[] = Array.isArray(data.items) ? data.items : []
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const variant = data.variant || 'boxes'   // boxes / lines
  return (
    <section className="relative z-10 px-6 lg:px-16 py-16">
      <div className="max-w-3xl mx-auto">
        {data.title && <div className="text-center mb-10"><StyledTitle style={style} text={data.title} /></div>}
        <div className="space-y-3">
          {items.map((item, i) => {
            const cardStyle: React.CSSProperties = variant === 'boxes'
              ? { background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }
              : { borderBottom: '1px solid var(--glass-border)' }
            const cardCls = variant === 'boxes' ? 'rounded-2xl overflow-hidden' : ''
            return (
              <CardWrap key={i} className={cardCls} style={cardStyle} cardHover={variant === 'boxes' ? style.cardHover : 'none'}>
                <button onClick={() => setOpenIdx(openIdx === i ? null : i)} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left">
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{item.q}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${openIdx === i ? 'rotate-180' : ''}`} style={{ color: 'var(--text-tertiary)' }} />
                </button>
                {openIdx === i && <div className="px-5 pb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>{item.a}</div>}
              </CardWrap>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ═══ 5. Reviews ══════════════════════════════════════════════
function ReviewsBlock({ data, style }: { data: any; style: BlockStyle }) {
  const items: any[] = Array.isArray(data.items) ? data.items : []
  return (
    <section className="relative z-10 px-6 lg:px-16 py-16">
      <div>
        {data.title && <div className="text-center mb-10"><StyledTitle style={style} text={data.title} /></div>}
        <div className="grid md:grid-cols-3 gap-5">
          {items.map((item, i) => {
            const cs: React.CSSProperties = { background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }
            if (style.staggerChildren) cs.transitionDelay = (i * 80) + 'ms'
            return (
              <CardWrap key={i} className="p-6 rounded-2xl" style={cs} cardHover={style.cardHover}>
                <div className="flex gap-0.5 mb-3">
                  {[1,2,3,4,5].map(n => (
                    <Star key={n} className="w-4 h-4" style={{ color: n <= (item.rating || 5) ? '#fbbf24' : 'var(--text-tertiary)', fill: n <= (item.rating || 5) ? '#fbbf24' : 'transparent' }} />
                  ))}
                </div>
                <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>"{item.text}"</p>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{item.name}</div>
              </CardWrap>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ═══ 6. Stats ════════════════════════════════════════════════
function StatsBlock({ data, style }: { data: any; style: BlockStyle }) {
  const items: any[] = Array.isArray(data.items) ? data.items : []
  const animated = data.animated !== false  // default on — counters go from 0
  return (
    <section className="relative z-10 px-6 lg:px-16 py-14">
      <div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {items.map((item, i) => (
            <div key={i} className="text-center">
              <div className="text-3xl md:text-4xl font-bold" style={{ color: 'var(--accent-1)' }}>
                {animated ? <Counter value={item.number} /> : item.number}
              </div>
              <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══ 7. CTA (premium) ════════════════════════════════════════
function CtaBlock({ data, style, onCta }: { data: any; style: BlockStyle; onCta?: () => void }) {
  return (
    <section className="relative z-10 px-6 lg:px-16 py-20">
      <div className="max-w-4xl mx-auto relative">
        {/* Glow behind the CTA card */}
        <div className="absolute -inset-4 rounded-3xl opacity-40" style={{ background: 'var(--accent-gradient)', filter: 'blur(40px)' }} />
        <div className="relative p-10 md:p-16 rounded-3xl text-center overflow-hidden"
             style={{
               background: data.bgColor || 'var(--accent-gradient)',
               boxShadow: '0 20px 60px rgba(6,182,212,0.3)',
             }}>
          {/* Subtle pattern overlay */}
          <div className="absolute inset-0 opacity-10 pointer-events-none"
               style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="relative">
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white tracking-tight">{data.title || 'Начните прямо сейчас'}</h2>
            {data.subtitle && <p className="text-white opacity-90 mb-8 text-lg max-w-xl mx-auto">{data.subtitle}</p>}
            <BrandButton onClick={onCta}
                         style={{ ...style, buttonVariant: style.buttonVariant || 'solid', buttonSize: style.buttonSize || 'lg' }}
                         icon={<ChevronRight className="w-5 h-5" />}>
              {data.buttonText || 'Попробовать'}
            </BrandButton>
          </div>
        </div>
      </div>
    </section>
  )
}

// ═══ 8. Proxies ══════════════════════════════════════════════
function ProxiesBlock({ data, style, proxies }: { data: any; style: BlockStyle; proxies: TelegramProxy[] }) {
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
function StepsBlock({ data, style }: { data: any; style: BlockStyle }) {
  const items: any[] = Array.isArray(data.items) ? data.items : []
  return (
    <section className="relative z-10 px-6 lg:px-16 py-16">
      <div>
        {data.title && <div className="text-center mb-10"><StyledTitle style={style} text={data.title} /></div>}
        <div className="grid md:grid-cols-3 gap-6">
          {items.map((item, i) => {
            const cs: React.CSSProperties = {}
            if (style.staggerChildren) cs.transitionDelay = (i * 100) + 'ms'
            return (
              <CardWrap key={i} className="relative" style={cs} cardHover={style.cardHover}>
                <div className="text-5xl font-bold mb-3" style={{ color: 'var(--accent-1)', opacity: 0.2 }}>{item.number || (i + 1)}</div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{item.title}</h3>
                {item.text && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item.text}</p>}
              </CardWrap>
            )
          })}
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
function ImageBlock({ data, style }: { data: any; style: BlockStyle }) {
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
function CountdownBlock({ data, style }: { data: any; style: BlockStyle }) {
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
function VideoBlock({ data, style }: { data: any; style: BlockStyle }) {
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
function LogoWallBlock({ data, style }: { data: any; style: BlockStyle }) {
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
function TwoColumnBlock({ data, style, onCta }: { data: any; style: BlockStyle; onCta?: () => void }) {
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
function TeamBlock({ data, style }: { data: any; style: BlockStyle }) {
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
function TimelineBlock({ data, style }: { data: any; style: BlockStyle }) {
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
function ContactFormBlock({ data, style }: { data: any; style: BlockStyle }) {
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
function NewsletterBlock({ data, style }: { data: any; style: BlockStyle }) {
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
function PricingTableBlock({ data, style, onCta }: { data: any; style: BlockStyle; onCta?: () => void }) {
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
function TelegramWidgetBlock({ data, style }: { data: any; style: BlockStyle }) {
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

// ═══ 22. Heading ═════════════════════════════════════════════
// Standalone large heading — good as section separator.
function HeadingBlock({ data, style }: { data: any; style: BlockStyle }) {
  const level = data.level || 'h2'
  const align = data.align || 'center'
  const size = data.size || 'xl'
  const sizeMap: Record<string, string> = {
    sm: 'text-2xl md:text-3xl',
    md: 'text-3xl md:text-4xl',
    lg: 'text-4xl md:text-5xl',
    xl: 'text-5xl md:text-6xl',
    '2xl': 'text-6xl md:text-7xl',
  }
  const Tag = level as any
  const kicker = data.kicker   // small uppercase text above heading
  return (
    <section className="relative z-10 px-6 lg:px-16 py-10" style={{ textAlign: align }}>
      {kicker && (
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] mb-3"
             style={{ color: 'var(--accent-1)' }}>
          {kicker}
        </div>
      )}
      <Tag className={`${sizeMap[size]} font-bold tracking-tight ${data.gradient ? 'lb-text-gradient' : ''}`}
           style={{ color: data.gradient ? undefined : 'var(--text-primary)' }}>
        {data.text || 'Заголовок'}
      </Tag>
      {data.subtitle && (
        <p className="mt-4 text-lg md:text-xl max-w-2xl"
           style={{ color: 'var(--text-secondary)', margin: align === 'center' ? '16px auto 0' : '16px 0 0' }}>
          {data.subtitle}
        </p>
      )}
    </section>
  )
}

// ═══ 23. Text (paragraph) ════════════════════════════════════
function TextBlock({ data, style }: { data: any; style: BlockStyle }) {
  const align = data.align || 'left'
  const size = data.size || 'md'
  const sizeMap: Record<string, string> = {
    sm: 'text-sm', md: 'text-base md:text-lg', lg: 'text-lg md:text-xl',
  }
  const maxWidthMap: Record<string, string> = { sm: 'max-w-xl', md: 'max-w-2xl', lg: 'max-w-3xl', full: 'max-w-full' }
  const maxWidth = maxWidthMap[(data.maxWidth as string) || 'md'] || 'max-w-2xl'
  // Split content by double newline into paragraphs
  const paragraphs = (data.content || '').split(/\n\n+/).filter(Boolean)
  return (
    <section className="relative z-10 px-6 lg:px-16 py-8">
      <div className={`${maxWidth} mx-auto space-y-4`} style={{ textAlign: align }}>
        {paragraphs.map((p: string, i: number) => (
          <p key={i} className={sizeMap[size]} style={{ color: data.color || 'var(--text-secondary)', lineHeight: 1.75 }}>
            {p}
          </p>
        ))}
      </div>
    </section>
  )
}

// ═══ 24. Quote ═══════════════════════════════════════════════
function QuoteBlock({ data, style }: { data: any; style: BlockStyle }) {
  return (
    <section className="relative z-10 px-6 lg:px-16 py-14">
      <div className="max-w-3xl mx-auto text-center">
        <div className="text-6xl md:text-8xl font-black leading-none opacity-20 mb-2"
             style={{ color: 'var(--accent-1)' }}>"</div>
        <blockquote className="text-xl md:text-3xl font-medium leading-relaxed mb-6"
                    style={{ color: 'var(--text-primary)' }}>
          {data.text || 'Вдохновляющая цитата'}
        </blockquote>
        {(data.author || data.role) && (
          <div className="flex items-center justify-center gap-3">
            {data.avatar && (
              <img src={data.avatar} alt={data.author} className="w-12 h-12 rounded-full object-cover" />
            )}
            <div className="text-left">
              {data.author && <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{data.author}</div>}
              {data.role && <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{data.role}</div>}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// ═══ 25. News feed ═══════════════════════════════════════════
function NewsBlock({ data, style }: { data: any; style: BlockStyle }) {
  const [news, setNews] = useState<any[]>([])
  useEffect(() => {
    fetch(`/api/public/news?limit=${data.limit || 3}`)
      .then(r => r.json()).then(setNews).catch(() => {})
  }, [data.limit])
  if (!news.length) return null
  return (
    <section className="relative z-10 px-6 lg:px-16 py-16">
      <div>
        {data.title && <div className="text-center mb-10"><StyledTitle style={style} text={data.title} /></div>}
        <div className="grid md:grid-cols-3 gap-5">
          {news.map((n, i) => (
            <CardWrap key={n.id} className="p-6 rounded-2xl"
                      style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}
                      cardHover={style.cardHover || 'lift'}>
              {n.category && (
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider mb-3"
                      style={{ background: 'rgba(6,182,212,0.15)', color: 'var(--accent-1)' }}>
                  {n.category}
                </span>
              )}
              <h3 className="font-semibold mb-2 text-lg" style={{ color: 'var(--text-primary)' }}>{n.title}</h3>
              {n.summary && <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>{n.summary}</p>}
              {n.publishedAt && (
                <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {new Date(n.publishedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                </div>
              )}
            </CardWrap>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══ 26. Divider (decorative line) ═══════════════════════════
function DividerBlock({ data, style }: { data: any; style: BlockStyle }) {
  const variant = data.variant || 'gradient'
  const widthMap = { narrow: '120px', normal: '320px', wide: '600px', full: '100%' }
  const w = widthMap[data.width as keyof typeof widthMap] || '320px'
  return (
    <section className="relative z-10 px-6 lg:px-16 py-8 flex justify-center">
      {variant === 'gradient' && (
        <div style={{ width: w, height: '2px', background: 'linear-gradient(90deg, transparent, var(--accent-1), transparent)' }} />
      )}
      {variant === 'solid' && (
        <div style={{ width: w, height: '1px', background: 'var(--glass-border)' }} />
      )}
      {variant === 'dots' && (
        <div className="flex items-center gap-2">
          {[1,2,3].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-1)' }} />
          ))}
        </div>
      )}
      {variant === 'diamond' && (
        <div className="flex items-center gap-3" style={{ color: 'var(--accent-1)' }}>
          <div style={{ width: '60px', height: '1px', background: 'currentColor' }} />
          <div style={{ width: '8px', height: '8px', background: 'currentColor', transform: 'rotate(45deg)' }} />
          <div style={{ width: '60px', height: '1px', background: 'currentColor' }} />
        </div>
      )}
    </section>
  )
}
