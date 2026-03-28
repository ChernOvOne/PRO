'use client'

import { useEffect, useState } from 'react'
import { Copy, CheckCircle2, ExternalLink, ChevronDown, ChevronUp, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { userApi } from '@/lib/api'

// Platform icon mapping (emoji fallback)
const PLATFORM_ICONS: Record<string, string> = {
  ios: '🍎', android: '🤖', windows: '🪟',
  macos: '💻', linux: '🐧', tv: '📺', router: '🌐',
}

function detectPlatformSlug(): string {
  if (typeof navigator === 'undefined') return 'windows'
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad/.test(ua))             return 'ios'
  if (/android/.test(ua) && /mobile/.test(ua)) return 'android'
  if (/android/.test(ua))                 return 'tv'
  if (/windows/.test(ua))                 return 'windows'
  if (/mac os/.test(ua))                  return 'macos'
  if (/linux/.test(ua))                   return 'linux'
  return 'windows'
}

interface Step   { id: string; order: number; text: string; imageUrl?: string }
interface App    { id: string; name: string; icon: string; isFeatured: boolean; storeUrl?: string; deeplink?: string; steps: Step[] }
interface Platform { id: string; slug: string; name: string; icon: string; sortOrder: number; apps: App[] }

export default function InstructionsPage() {
  const [platforms,   setPlatforms]   = useState<Platform[]>([])
  const [activeSlug,  setActiveSlug]  = useState<string>('')
  const [activeApp,   setActiveApp]   = useState<string>('')
  const [subUrl,      setSubUrl]      = useState<string>('')
  const [loading,     setLoading]     = useState(true)
  const [openStep,    setOpenStep]    = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/instructions/platforms').then(r => r.json()),
      userApi.subscription().catch(() => null),
    ]).then(([pls, sub]) => {
      setPlatforms(pls)
      if (sub?.subUrl) setSubUrl(sub.subUrl)
      const detected = detectPlatformSlug()
      const found = pls.find((p: Platform) => p.slug === detected)
      const first = pls[0]
      const platform = found || first
      if (platform) {
        setActiveSlug(platform.slug)
        const featured = platform.apps.find((a: App) => a.isFeatured) || platform.apps[0]
        if (featured) setActiveApp(featured.id)
      }
      setLoading(false)
    })
  }, [])

  const platform  = platforms.find(p => p.slug === activeSlug)
  const app       = platform?.apps.find(a => a.id === activeApp)

  // Deeplink with subscription URL substituted
  const getDeeplink = (template?: string) => {
    if (!template || !subUrl) return null
    return template.replace('{url}', encodeURIComponent(subUrl))
               .replace('{raw}', subUrl)
  }

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-12 rounded-2xl bg-white/4" />
      <div className="h-48 rounded-2xl bg-white/4" />
    </div>
  )

  if (!platforms.length) return (
    <div className="text-center py-20 text-zinc-600">
      Инструкции ещё не добавлены
    </div>
  )

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-8">
      <div>
        <h1 className="text-xl font-bold">Как подключиться</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Выбери своё устройство — мы подберём лучшее приложение
        </p>
      </div>

      {/* Platform tabs */}
      <div className="flex gap-2 flex-wrap">
        {platforms.map(p => (
          <button key={p.slug}
            onClick={() => {
              setActiveSlug(p.slug)
              const feat = p.apps.find(a => a.isFeatured) || p.apps[0]
              if (feat) setActiveApp(feat.id)
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium
                        border transition-all
                        ${activeSlug === p.slug
                          ? 'bg-white/10 border-white/20 text-white'
                          : 'bg-white/3 border-white/8 text-zinc-500 hover:bg-white/6'}`}>
            <span>{PLATFORM_ICONS[p.slug] || p.icon}</span>
            {p.name}
          </button>
        ))}
      </div>

      {platform && platform.apps.length > 0 && (
        <>
          {/* App selector */}
          <div className="rounded-3xl bg-white/4 border border-white/8 p-4">
            <p className="text-xs text-zinc-600 mb-3">Выбери приложение</p>
            <div className="flex gap-2 flex-wrap">
              {platform.apps.map(a => (
                <button key={a.id} onClick={() => setActiveApp(a.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm border transition-all
                              ${activeApp === a.id
                                ? 'bg-violet-500/15 border-violet-500/30 text-violet-300'
                                : 'bg-white/4 border-white/8 text-zinc-400 hover:bg-white/8'}`}>
                  <span className="text-base">{a.icon}</span>
                  {a.name}
                  {a.isFeatured && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full
                                     bg-violet-500/20 text-violet-400">
                      ★
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* App detail + steps */}
          {app && (
            <div className="rounded-3xl bg-white/4 border border-white/8 overflow-hidden">
              {/* App header */}
              <div className="p-5 border-b border-white/8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/8 flex items-center justify-center text-2xl">
                    {app.icon}
                  </div>
                  <div>
                    <h2 className="font-semibold">{app.name}</h2>
                    {app.isFeatured && (
                      <span className="text-xs text-violet-400">Рекомендуем</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {/* Open in app */}
                  {app.deeplink && subUrl && (
                    <a href={getDeeplink(app.deeplink) ?? '#'} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                                 bg-gradient-to-r from-violet-600 to-blue-600 hover:opacity-90 transition-all">
                      <ExternalLink className="w-4 h-4" />
                      Открыть в {app.name}
                    </a>
                  )}
                  {/* Copy link */}
                  {subUrl && (
                    <button onClick={() => { navigator.clipboard.writeText(subUrl); toast.success('Скопировано!') }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm
                                 bg-white/6 hover:bg-white/10 border border-white/10 transition-all">
                      <Copy className="w-4 h-4" />
                      Скопировать ссылку
                    </button>
                  )}
                  {/* Store link */}
                  {app.storeUrl && (
                    <a href={app.storeUrl} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm
                                 bg-white/6 hover:bg-white/10 border border-white/10 transition-all">
                      <Download className="w-4 h-4" />
                      Скачать
                    </a>
                  )}
                </div>
              </div>

              {/* Steps */}
              {app.steps.length > 0 && (
                <div className="divide-y divide-white/6">
                  {app.steps.map((step, idx) => (
                    <StepItem key={step.id} step={step} idx={idx}
                      isOpen={openStep === idx}
                      onToggle={() => setOpenStep(openStep === idx ? null : idx)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {platform && platform.apps.length === 0 && (
        <div className="text-center py-12 text-zinc-600 text-sm">
          Инструкции для этой платформы ещё не добавлены
        </div>
      )}
    </div>
  )
}

function StepItem({ step, idx, isOpen, onToggle }: {
  step: Step; idx: number; isOpen: boolean; onToggle: () => void;
}) {
  const preview = step.text.split('\n')[0].replace(/[*#`]/g, '').slice(0, 80)
  return (
    <div className="overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/3 transition-all text-left">
        <div className="w-7 h-7 rounded-xl bg-violet-500/15 border border-violet-500/20
                        flex items-center justify-center text-xs font-bold text-violet-400 shrink-0">
          {idx + 1}
        </div>
        <span className="flex-1 text-sm text-zinc-300 truncate">{preview}</span>
        {isOpen
          ? <ChevronUp className="w-4 h-4 text-zinc-600 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-zinc-600 shrink-0" />}
      </button>
      {isOpen && (
        <div className="px-5 pb-4 space-y-3">
          <div className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap pl-11">
            {step.text}
          </div>
          {step.imageUrl && (
            <div className="pl-11">
              <img src={step.imageUrl} alt={`Шаг ${idx + 1}`}
                className="rounded-2xl border border-white/10 max-w-full w-auto"
                style={{ maxHeight: 300 }} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
