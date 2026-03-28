'use client'

import { useEffect, useState } from 'react'
import {
  Plus, Trash2, ChevronDown, ChevronUp, GripVertical,
  Star, Save, X, Image, Link as LinkIcon, ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'

const BASE = '/api/admin/instructions'

// ── Types ─────────────────────────────────────────────────────
interface Step     { id: string; order: number; text: string; imageUrl?: string }
interface App      { id: string; name: string; icon: string; isFeatured: boolean; storeUrl?: string; deeplink?: string; sortOrder: number; steps: Step[] }
interface Platform { id: string; slug: string; name: string; icon: string; sortOrder: number; isActive: boolean; apps: App[] }

// ── Helpers ───────────────────────────────────────────────────
async function api(method: string, path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

// ── Step editor ───────────────────────────────────────────────
function StepEditor({ step, onUpdate, onDelete }: {
  step: Step;
  onUpdate: (s: Step) => void;
  onDelete: () => void;
}) {
  const [text,     setText]     = useState(step.text)
  const [imageUrl, setImageUrl] = useState(step.imageUrl ?? '')
  const [saving,   setSaving]   = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await api('PATCH', `/steps/${step.id}`, { text, imageUrl: imageUrl || null })
      onUpdate({ ...step, text, imageUrl: imageUrl || undefined })
      toast.success('Шаг сохранён')
    } catch { toast.error('Ошибка') }
    finally { setSaving(false) }
  }

  return (
    <div className="bg-black/20 rounded-2xl p-4 space-y-3 border border-white/8">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-violet-500/20 text-violet-400 text-xs
                        font-bold flex items-center justify-center shrink-0">
          {step.order}
        </div>
        <span className="text-xs text-zinc-500 font-medium">Шаг</span>
        <div className="ml-auto flex gap-1.5">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs
                       bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 transition-all">
            <Save className="w-3 h-3" />
            {saving ? '...' : 'Сохранить'}
          </button>
          <button onClick={onDelete}
            className="p-1 rounded-lg text-zinc-700 hover:text-red-400
                       hover:bg-red-500/10 transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={3}
        placeholder="Текст шага... (поддерживает markdown)"
        className="w-full bg-white/4 border border-white/10 rounded-xl px-3 py-2
                   text-sm text-zinc-300 placeholder-zinc-700 resize-none focus:outline-none
                   focus:border-violet-500/40 transition-all"
      />

      <div className="flex items-center gap-2">
        <Image className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
        <input value={imageUrl} onChange={e => setImageUrl(e.target.value)}
          placeholder="URL изображения (необязательно)"
          className="flex-1 bg-white/4 border border-white/10 rounded-xl px-3 py-1.5
                     text-xs text-zinc-400 placeholder-zinc-700 focus:outline-none
                     focus:border-violet-500/40 transition-all" />
        {imageUrl && (
          <a href={imageUrl} target="_blank" rel="noreferrer"
            className="text-zinc-600 hover:text-zinc-300 transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {imageUrl && (
        <img src={imageUrl} alt="preview"
          className="rounded-xl border border-white/10 max-h-40 w-auto" />
      )}
    </div>
  )
}

// ── App editor ────────────────────────────────────────────────
function AppEditor({ app, onUpdate, onDelete }: {
  app: App;
  onUpdate: (a: App) => void;
  onDelete: () => void;
}) {
  const [open,      setOpen]      = useState(false)
  const [name,      setName]      = useState(app.name)
  const [icon,      setIcon]      = useState(app.icon)
  const [featured,  setFeatured]  = useState(app.isFeatured)
  const [storeUrl,  setStoreUrl]  = useState(app.storeUrl ?? '')
  const [deeplink,  setDeeplink]  = useState(app.deeplink ?? '')
  const [steps,     setSteps]     = useState<Step[]>(app.steps)
  const [saving,    setSaving]    = useState(false)

  const saveApp = async () => {
    setSaving(true)
    try {
      const updated = await api('PATCH', `/apps/${app.id}`, {
        name, icon, isFeatured: featured,
        storeUrl: storeUrl || null,
        deeplink: deeplink || null,
      })
      onUpdate({ ...app, ...updated, steps })
      toast.success('Приложение сохранено')
    } catch { toast.error('Ошибка') }
    finally { setSaving(false) }
  }

  const addStep = async () => {
    try {
      const step = await api('POST', '/steps', {
        appId: app.id, order: steps.length + 1, text: 'Новый шаг',
      })
      setSteps(s => [...s, step])
    } catch { toast.error('Ошибка') }
  }

  const deleteStep = async (stepId: string) => {
    try {
      await api('DELETE', `/steps/${stepId}`)
      setSteps(s => s.filter(x => x.id !== stepId))
    } catch { toast.error('Ошибка') }
  }

  return (
    <div className="rounded-2xl bg-white/3 border border-white/8 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-all">
        <GripVertical className="w-4 h-4 text-zinc-700 shrink-0" />
        <span className="text-xl">{icon}</span>
        <span className="font-medium text-sm flex-1">{name}</span>
        {featured && <Star className="w-3.5 h-3.5 text-amber-400" fill="currentColor" />}
        <button onClick={() => setOpen(v => !v)}
          className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <button onClick={onDelete}
          className="p-1 text-zinc-700 hover:text-red-400 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/8 pt-4">
          {/* App settings */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-zinc-600">Название</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full bg-white/4 border border-white/10 rounded-xl px-3 py-2
                           text-sm focus:outline-none focus:border-violet-500/40 transition-all" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-600">Иконка (emoji)</label>
              <input value={icon} onChange={e => setIcon(e.target.value)}
                className="w-full bg-white/4 border border-white/10 rounded-xl px-3 py-2
                           text-sm focus:outline-none focus:border-violet-500/40 transition-all" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-600">Ссылка на магазин (App Store / Google Play)</label>
            <input value={storeUrl} onChange={e => setStoreUrl(e.target.value)}
              placeholder="https://apps.apple.com/..."
              className="w-full bg-white/4 border border-white/10 rounded-xl px-3 py-2
                         text-sm focus:outline-none focus:border-violet-500/40 transition-all" />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-600">Deeplink шаблон <span className="text-zinc-700">(используй {'{url}'} для ссылки подписки)</span></label>
            <input value={deeplink} onChange={e => setDeeplink(e.target.value)}
              placeholder="happ://add/{url}"
              className="w-full bg-white/4 border border-white/10 rounded-xl px-3 py-2
                         text-sm font-mono focus:outline-none focus:border-violet-500/40 transition-all" />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)}
                className="w-4 h-4 rounded accent-violet-500" />
              <span className="text-sm text-zinc-400">Рекомендованное</span>
            </label>
            <div className="ml-auto">
              <button onClick={saveApp} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm
                           bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 transition-all">
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Шаги инструкции</span>
              <button onClick={addStep}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg
                           bg-white/6 hover:bg-white/10 text-zinc-400 transition-all">
                <Plus className="w-3 h-3" />
                Добавить шаг
              </button>
            </div>
            {steps.map(s => (
              <StepEditor key={s.id} step={s}
                onUpdate={updated => setSteps(ss => ss.map(x => x.id === s.id ? updated : x))}
                onDelete={() => deleteStep(s.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Platform editor ───────────────────────────────────────────
function PlatformEditor({ platform, onUpdate, onDelete }: {
  platform: Platform;
  onUpdate: (p: Platform) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false)
  const [apps, setApps] = useState<App[]>(platform.apps)

  const addApp = async () => {
    try {
      const app = await api('POST', '/apps', {
        platformId: platform.id, name: 'Новое приложение', icon: '📱',
      })
      setApps(a => [...a, app])
    } catch { toast.error('Ошибка') }
  }

  const deleteApp = async (appId: string) => {
    try {
      await api('DELETE', `/apps/${appId}`)
      setApps(a => a.filter(x => x.id !== appId))
    } catch { toast.error('Ошибка') }
  }

  return (
    <div className="rounded-3xl bg-white/4 border border-white/8 overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/3 transition-all">
        <span className="text-2xl">{platform.icon}</span>
        <span className="font-semibold flex-1 text-left">{platform.name}</span>
        <span className="text-xs text-zinc-600">{apps.length} прил.</span>
        {open ? <ChevronUp className="w-4 h-4 text-zinc-600" /> : <ChevronDown className="w-4 h-4 text-zinc-600" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-white/8 pt-4">
          {apps.map(app => (
            <AppEditor key={app.id} app={app}
              onUpdate={updated => setApps(aa => aa.map(x => x.id === app.id ? updated : x))}
              onDelete={() => deleteApp(app.id)} />
          ))}
          <button onClick={addApp}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm
                       border border-dashed border-white/15 text-zinc-600
                       hover:border-white/25 hover:text-zinc-400 transition-all">
            <Plus className="w-4 h-4" />
            Добавить приложение
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function AdminInstructionsPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    api('GET', '/platforms').then(setPlatforms).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="space-y-3 animate-pulse">
      {[1,2,3].map(i => <div key={i} className="h-16 rounded-3xl bg-white/4" />)}
    </div>
  )

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Инструкции по подключению</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Настрой приложения и шаги для каждой платформы
          </p>
        </div>
      </div>

      <div className="rounded-3xl bg-blue-500/6 border border-blue-500/20 px-5 py-3">
        <p className="text-sm text-blue-300">
          💡 Deeplink пример: <code className="font-mono text-xs bg-white/8 px-1.5 py-0.5 rounded">happ://add/{'{url}'}</code> — {'{url}'} заменится ссылкой подписки пользователя
        </p>
      </div>

      <div className="space-y-3">
        {platforms.map(p => (
          <PlatformEditor key={p.id} platform={p}
            onUpdate={updated => setPlatforms(ps => ps.map(x => x.id === p.id ? updated : x))}
            onDelete={() => setPlatforms(ps => ps.filter(x => x.id !== p.id))} />
        ))}
      </div>
    </div>
  )
}
