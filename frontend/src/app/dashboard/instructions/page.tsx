'use client'

import { useEffect, useState } from 'react'
import { Copy, Check, ExternalLink, Download, Link2, Shield, Smartphone, Monitor,
         ChevronRight, ChevronLeft, Zap, Globe, Wifi, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { userApi } from '@/lib/api'

/* ── Platform SVG Icons ── */
function AppleIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
}
function AndroidIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.31-.16-.69-.04-.85.26l-1.87 3.24A11.38 11.38 0 0012 8c-1.62 0-3.15.35-4.46.95L5.67 5.71c-.16-.31-.54-.43-.85-.26-.31.16-.43.54-.26.85L6.4 9.48A10.78 10.78 0 003 16h18a10.78 10.78 0 00-3.4-6.52zM8.5 14c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm7 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>
}
function WindowsIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M3 12V6.75l6-1.32v6.48L3 12zm6.73-.07l8.27-.9V4l-8.27 1.82v6.11zM18 12.08l-8.27.9v6.01L18 20v-7.92zm-8.73.98l-6.27.69V18l6.27-1.38v-2.56z"/></svg>
}
function MacIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M4 2h16a2 2 0 012 2v12a2 2 0 01-2 2h-6l1 2h2v2H7v-2h2l1-2H4a2 2 0 01-2-2V4a2 2 0 012-2zm0 2v10h16V4H4z"/></svg>
}
function LinuxIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.244-.477-.029-.592-.301-.592-.525 0-.159.053-.325.18-.518.15-.235.326-.547.326-.968 0-.37-.152-.722-.434-.984-.268-.255-.637-.398-1.054-.398-.622 0-1.22.295-1.593.795a2.16 2.16 0 00-.388 1.262c0 .675.277 1.35.792 1.846.53.51 1.28.766 2.163.766.6 0 1.064-.153 1.487-.374.408-.213.753-.532 1.024-.869.135-.168.255-.326.37-.48.168.16.298.381.392.588.167.367.308.82.494 1.2.403.808.952 1.423 1.847 1.423.654 0 1.155-.282 1.525-.66.374-.381.625-.849.826-1.324l.068-.173c.258.103.555.172.893.172.457 0 .87-.14 1.195-.394.306-.238.526-.57.696-.935.2.068.39.155.59.155.432 0 .755-.26.943-.582.19-.325.29-.742.29-1.189 0-.384-.076-.768-.246-1.078l.023-.009c.267-.095.543-.24.77-.447.24-.216.424-.503.51-.845.07-.282.084-.59.032-.896a2.762 2.762 0 00-.268-.739c.102-.076.202-.16.293-.252.183-.186.328-.415.413-.67.101-.307.1-.618-.009-.907a1.506 1.506 0 00-.546-.7 2.17 2.17 0 00-.255-.166c.062-.104.12-.215.164-.343.089-.254.103-.531.029-.776a1.146 1.146 0 00-.459-.597 1.625 1.625 0 00-.742-.276l-.006-.003c.039-.54-.003-1.13-.102-1.736-.142-.872-.424-1.771-.88-2.522-.454-.746-1.092-1.351-1.97-1.668A3.558 3.558 0 0012.504 0z"/></svg>
}

const PLATFORM_ICON_MAP: Record<string, any> = { ios: AppleIcon, android: AndroidIcon, windows: WindowsIcon, macos: MacIcon, linux: LinuxIcon }
const ICON_MAP: Record<string, any> = { smartphone: Smartphone, shield: Shield, zap: Zap, globe: Globe, monitor: Monitor, download: Download, externalLink: ExternalLink, wifi: Wifi }

function AppIconRender({ icon, size = 'w-5 h-5', color }: { icon: string; size?: string; color?: string }) {
  if (icon?.startsWith('/')) return <img src={icon} alt="" className={`${size} rounded`} />
  const Comp = ICON_MAP[icon] || Smartphone
  return <Comp className={size} style={{ color: color || 'currentColor' }} />
}

function renderMd(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/`(.+?)`/g, '<code style="background:var(--glass-bg);padding:1px 4px;border-radius:4px;font-size:12px">$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--accent-1);text-decoration:underline">$1</a>')
    .replace(/\n/g, '<br/>')
}

const BTN_STYLES: Record<string, { bg: string; border: string; color: string }> = {
  primary: { bg: 'var(--accent-gradient)', border: 'rgba(6,182,212,0.3)', color: '#fff' },
  secondary: { bg: 'var(--glass-bg)', border: 'var(--glass-border)', color: 'var(--text-primary)' },
  outline: { bg: 'transparent', border: 'var(--accent-1)', color: 'var(--accent-1)' },
  success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)', color: '#34d399' },
  danger: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)', color: '#f87171' },
  violet: { bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.25)', color: '#a78bfa' },
}

function parseStepMeta(imageUrl?: string): { image?: string; buttons: any[] } {
  if (!imageUrl) return { buttons: [] }
  try { const p = JSON.parse(imageUrl); return { image: p.image, buttons: Array.isArray(p.buttons) ? p.buttons : [] } }
  catch { return { image: imageUrl, buttons: [] } }
}

function detectPlatformSlug(): string {
  if (typeof navigator === 'undefined') return 'windows'
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  if (/windows/.test(ua)) return 'windows'
  if (/mac os/.test(ua)) return 'macos'
  if (/linux/.test(ua)) return 'linux'
  return 'windows'
}

interface Step { id: string; order: number; text: string; imageUrl?: string }
interface App { id: string; name: string; icon: string; isFeatured: boolean; storeUrl?: string; deeplink?: string; steps: Step[] }
interface Platform { id: string; slug: string; name: string; icon: string; sortOrder: number; apps: App[] }

// ── WIZARD STEPS ──
const WIZARD_STEPS = ['platform', 'app', 'setup'] as const
type WizardStep = typeof WIZARD_STEPS[number]

export default function InstructionsPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [activeSlug, setActiveSlug] = useState('')
  const [activeApp, setActiveApp] = useState<string>('')
  const [subUrl, setSubUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [wizardStep, setWizardStep] = useState<WizardStep>('platform')

  useEffect(() => {
    Promise.all([
      fetch('/api/instructions/platforms').then(r => r.json()),
      userApi.subscription().catch(() => null),
    ]).then(([pls, sub]) => {
      setPlatforms(pls)
      if (sub?.subUrl) setSubUrl(sub.subUrl)
      const detected = detectPlatformSlug()
      const pl = pls.find((p: Platform) => p.slug === detected) || pls[0]
      if (pl) setActiveSlug(pl.slug)
      setLoading(false)
    })
  }, [])

  const platform = platforms.find(p => p.slug === activeSlug)
  const sortedApps = platform ? [...platform.apps].sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0)) : []
  const selectedApp = sortedApps.find(a => a.id === activeApp)
  const getDeeplink = (t?: string) => t && subUrl ? t.replace('{url}', encodeURIComponent(subUrl)) : null

  const copyLink = () => {
    if (!subUrl) return
    navigator.clipboard.writeText(subUrl)
    setCopied(true)
    toast.success('Ссылка скопирована!')
    setTimeout(() => setCopied(false), 2000)
  }

  const selectPlatform = (slug: string) => {
    setActiveSlug(slug)
    setActiveApp('')
    setWizardStep('app')
  }

  const selectApp = (appId: string) => {
    setActiveApp(appId)
    setWizardStep('setup')
  }

  const goBack = () => {
    if (wizardStep === 'setup') { setWizardStep('app'); setActiveApp('') }
    else if (wizardStep === 'app') { setWizardStep('platform'); setActiveSlug('') }
  }

  if (loading) return (
    <div className="max-w-3xl lg:max-w-4xl mx-auto space-y-4">
      {[1, 2, 3].map(i => <div key={i} className="h-24 skeleton rounded-2xl" />)}
    </div>
  )

  if (!platforms.length) return (
    <div className="text-center py-20 text-sm" style={{ color: 'var(--text-tertiary)' }}>Инструкции ещё не добавлены</div>
  )

  const steps = selectedApp ? [...selectedApp.steps].sort((a, b) => a.order - b.order) : []

  return (
    <div className="max-w-3xl lg:max-w-4xl mx-auto pb-8 space-y-6">

      {/* ── Header with breadcrumb ── */}
      <div className="animate-slide-up">
        <h1 className="text-2xl font-bold">Подключить VPN</h1>
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <button onClick={() => { setWizardStep('platform'); setActiveSlug(''); setActiveApp('') }}
                  className="hover:underline" style={{ color: wizardStep === 'platform' ? 'var(--accent-1)' : 'var(--text-tertiary)' }}>
            Платформа
          </button>
          <ChevronRight className="w-3 h-3" />
          <button onClick={() => { if (activeSlug) { setWizardStep('app'); setActiveApp('') } }}
                  className="hover:underline" style={{ color: wizardStep === 'app' ? 'var(--accent-1)' : 'var(--text-tertiary)' }}>
            Приложение
          </button>
          <ChevronRight className="w-3 h-3" />
          <span style={{ color: wizardStep === 'setup' ? 'var(--accent-1)' : 'var(--text-tertiary)' }}>Настройка</span>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="flex gap-1.5 animate-slide-up" style={{ animationDelay: '40ms' }}>
        {WIZARD_STEPS.map((s, i) => (
          <div key={s} className="flex-1 h-1 rounded-full transition-all duration-500"
               style={{ background: WIZARD_STEPS.indexOf(wizardStep) >= i ? 'var(--accent-gradient)' : 'var(--glass-border)' }} />
        ))}
      </div>

      {/* ═══════ STEP 1: Choose platform ═══════ */}
      {wizardStep === 'platform' && (
        <div className="space-y-4 animate-slide-up" style={{ animationDelay: '80ms' }}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Выберите вашу операционную систему</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {platforms.map(p => {
              const IconComp = PLATFORM_ICON_MAP[p.slug]
              return (
                <button key={p.slug} onClick={() => selectPlatform(p.slug)}
                        className="flex flex-col items-center gap-3 py-6 rounded-2xl transition-all duration-300 group"
                        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <div className="transition-colors duration-200 group-hover:text-[var(--accent-1)]"
                       style={{ color: 'var(--text-tertiary)' }}>
                    {IconComp ? <IconComp className="w-10 h-10" /> : <Monitor className="w-10 h-10" />}
                  </div>
                  <span className="text-sm font-medium transition-colors group-hover:text-[var(--text-primary)]"
                        style={{ color: 'var(--text-secondary)' }}>
                    {p.name}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══════ STEP 2: Choose app ═══════ */}
      {wizardStep === 'app' && platform && (
        <div className="space-y-4 animate-slide-up" style={{ animationDelay: '80ms' }}>
          <div className="flex items-center gap-3">
            <button onClick={goBack} className="p-2 rounded-xl transition-all" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div>
              <p className="text-sm font-medium">{platform.name}</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Выберите приложение для подключения</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sortedApps.map(app => (
              <button key={app.id} onClick={() => selectApp(app.id)}
                      className="flex items-center gap-4 p-4 rounded-2xl transition-all duration-300 text-left group"
                      style={{ background: 'var(--glass-bg)', border: app.isFeatured ? '1.5px solid rgba(6,182,212,0.2)' : '1px solid var(--glass-border)' }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                     style={{ background: app.isFeatured ? 'rgba(6,182,212,0.1)' : 'var(--glass-hover)' }}>
                  <AppIconRender icon={app.icon} size="w-6 h-6" color={app.isFeatured ? 'var(--accent-1)' : 'var(--text-tertiary)'} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{app.name}</p>
                    {app.isFeatured && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--accent-1)' }}>
                        <Zap className="w-3 h-3" /> Лучший
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {app.storeUrl ? 'Бесплатное' : 'Настройка вручную'}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-tertiary)' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══════ STEP 3: Setup instructions ═══════ */}
      {wizardStep === 'setup' && selectedApp && (
        <div className="space-y-5 animate-slide-up" style={{ animationDelay: '80ms' }}>
          {/* Header */}
          <div className="flex items-center gap-3">
            <button onClick={goBack} className="p-2 rounded-xl transition-all" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                 style={{ background: 'rgba(6,182,212,0.1)' }}>
              <AppIconRender icon={selectedApp.icon} size="w-5 h-5" color="var(--accent-1)" />
            </div>
            <div>
              <p className="font-semibold">{selectedApp.name}</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Следуйте шагам ниже</p>
            </div>
          </div>

          {/* Subscription link */}
          {subUrl ? (
            <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.1)' }}>
              <Link2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-1)' }} />
              <p className="flex-1 text-xs truncate font-mono" style={{ color: 'var(--text-tertiary)' }}>{subUrl}</p>
              <button onClick={copyLink} className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: copied ? 'rgba(16,185,129,0.1)' : 'rgba(6,182,212,0.08)', color: copied ? 'var(--success)' : 'var(--accent-1)' }}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Готово' : 'Копировать'}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.1)' }}>
              <Shield className="w-5 h-5" style={{ color: 'var(--warning)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Оформите подписку для подключения</p>
            </div>
          )}

          {/* Steps */}
          {steps.length > 0 && (
            <div className="space-y-3">
              {steps.map((step, idx) => {
                const meta = parseStepMeta(step.imageUrl)
                return (
                  <div key={step.id} className="rounded-2xl overflow-hidden" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                    <div className="flex gap-3 p-4 items-start">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                           style={{ background: 'rgba(6,182,212,0.08)', color: 'var(--accent-1)', border: '1px solid rgba(6,182,212,0.15)' }}>
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}
                             dangerouslySetInnerHTML={{ __html: renderMd(step.text.replace(/\{url\}/g, subUrl || '{url}')) }} />
                        {meta.image && (
                          <img src={meta.image} alt={`Шаг ${idx + 1}`}
                               className="mt-3 rounded-xl max-w-full" style={{ maxHeight: 280, border: '1px solid var(--glass-border)' }} />
                        )}
                        {meta.buttons.length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            {meta.buttons.map((btn: any, bi: number) => {
                              const s = BTN_STYLES[btn.style] || BTN_STYLES.secondary
                              const align = btn.align || 'left'
                              const sizeClass = btn.size === 'sm' ? 'px-3 py-1.5 text-[11px]' : btn.size === 'lg' ? 'px-6 py-3 text-sm' : btn.size === 'full' ? 'px-4 py-2.5 text-sm w-full justify-center' : 'px-4 py-2 text-xs'
                              // Replace {url} with actual subscription URL (no encoding — apps need raw URL)
                              const btnUrl = btn.url?.replace(/\{url\}/g, subUrl) || '#'
                              return (
                                <div key={bi} className={`flex ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'}`}>
                                  <a href={btnUrl} target="_blank" rel="noopener noreferrer"
                                     className={`inline-flex items-center gap-1.5 rounded-xl font-semibold transition-all duration-200 ${sizeClass}`}
                                     style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
                                    {btn.label} <ChevronRight className="w-3 h-3" />
                                  </a>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Done */}
          <div className="rounded-2xl p-5 text-center" style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.1)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--success)' }}>Готово!</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>VPN настроен. Выберите сервер и подключайтесь.</p>
          </div>
        </div>
      )}
    </div>
  )
}
