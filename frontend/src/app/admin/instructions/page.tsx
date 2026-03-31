'use client'

import { useEffect, useState } from 'react'
import {
  Plus, Trash2, ChevronDown, ChevronUp, GripVertical,
  Star, Save, X, Image, Link as LinkIcon, ExternalLink, Copy,
  Smartphone, Shield, Zap, Globe, Monitor, Download, Wifi,
} from 'lucide-react'
import toast from 'react-hot-toast'

const BASE = '/api/admin/instructions'

// ── Types ─────────────────────────────────────────────────────
interface Step     { id: string; order: number; text: string; imageUrl?: string }
interface App      { id: string; name: string; icon: string; isFeatured: boolean; storeUrl?: string; deeplink?: string; sortOrder: number; steps: Step[] }
interface Platform { id: string; slug: string; name: string; icon: string; sortOrder: number; isActive: boolean; apps: App[] }

// ── Icon options for app selector ─────────────────────────────
const ICON_OPTIONS = [
  { value: 'smartphone', label: 'Smartphone', Icon: Smartphone },
  { value: 'shield',     label: 'Shield',     Icon: Shield },
  { value: 'zap',        label: 'Zap',        Icon: Zap },
  { value: 'globe',      label: 'Globe',      Icon: Globe },
  { value: 'monitor',    label: 'Monitor',    Icon: Monitor },
  { value: 'download',   label: 'Download',   Icon: Download },
  { value: 'externalLink', label: 'External Link', Icon: ExternalLink },
  { value: 'wifi',       label: 'Wifi',       Icon: Wifi },
]

const ICON_MAP: Record<string, any> = Object.fromEntries(ICON_OPTIONS.map(o => [o.value, o.Icon]))

// ── File upload helper ────────────────────────────────────────
async function uploadFile(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/admin/upload', {
    method: 'POST', credentials: 'include', body: form,
  })
  if (!res.ok) throw new Error('Upload failed')
  const data = await res.json()
  return data.url
}

function UploadButton({ onUpload, label = 'Загрузить' }: { onUpload: (url: string) => void; label?: string }) {
  const [uploading, setUploading] = useState(false)
  return (
    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium cursor-pointer transition-all"
           style={{ background: 'rgba(6,182,212,0.08)', color: 'var(--accent-1)', border: '1px solid rgba(6,182,212,0.15)' }}>
      <Image className="w-3 h-3" />
      {uploading ? 'Загрузка...' : label}
      <input type="file" accept="image/*" className="hidden" onChange={async e => {
        const file = e.target.files?.[0]
        if (!file) return
        setUploading(true)
        try {
          const url = await uploadFile(file)
          onUpload(url)
          toast.success('Файл загружен')
        } catch { toast.error('Ошибка загрузки') }
        finally { setUploading(false) }
      }} />
    </label>
  )
}

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

/* Parse step imageUrl: may be JSON {image, buttons} or plain URL */
function parseStepMeta(imageUrl?: string): { image: string; buttons: any[] } {
  if (!imageUrl) return { image: '', buttons: [] }
  try {
    const parsed = JSON.parse(imageUrl)
    return { image: parsed.image || '', buttons: Array.isArray(parsed.buttons) ? parsed.buttons : [] }
  } catch {
    return { image: imageUrl, buttons: [] }
  }
}

/* Serialize step meta back to imageUrl field */
function serializeStepMeta(image: string, buttonsJson: string): string | null {
  const trimmedImage = image.trim()
  const trimmedButtons = buttonsJson.trim()
  let buttons: any[] = []
  if (trimmedButtons) {
    try { buttons = JSON.parse(trimmedButtons) } catch { /* invalid json, ignore */ }
  }
  if (!trimmedImage && buttons.length === 0) return null
  if (buttons.length === 0) return trimmedImage || null
  return JSON.stringify({ image: trimmedImage || undefined, buttons })
}

// ── Step editor ───────────────────────────────────────────────
function StepEditor({ step, onUpdate, onDelete }: {
  step: Step;
  onUpdate: (s: Step) => void;
  onDelete: () => void;
}) {
  const meta = parseStepMeta(step.imageUrl)
  const [text,        setText]        = useState(step.text)
  const [imageUrl,    setImageUrl]    = useState(meta.image)
  const [buttonsJson, setButtonsJson] = useState(meta.buttons.length > 0 ? JSON.stringify(meta.buttons) : '')
  const [saving,      setSaving]      = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const serialized = serializeStepMeta(imageUrl, buttonsJson)
      await api('PATCH', `/steps/${step.id}`, { text, imageUrl: serialized })
      onUpdate({ ...step, text, imageUrl: serialized || undefined })
      toast.success('Шаг сохранён')
    } catch { toast.error('Ошибка') }
    finally { setSaving(false) }
  }

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
             style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--accent-1)' }}>
          {step.order}
        </div>
        <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Шаг</span>
        <div className="ml-auto flex gap-1.5">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all"
            style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--accent-1)' }}>
            <Save className="w-3 h-3" />
            {saving ? '...' : 'Сохранить'}
          </button>
          <button onClick={onDelete}
            className="p-1 rounded-lg transition-all"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--error, #ef4444)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)' }}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Text editor with formatting toolbar */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>
        <div className="flex items-center gap-0.5 px-2 py-1.5" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--glass-border)' }}>
          {[
            { label: 'B', wrap: ['**', '**'], title: 'Жирный' },
            { label: 'I', wrap: ['*', '*'], title: 'Курсив' },
            { label: '~', wrap: ['~~', '~~'], title: 'Зачёркнутый' },
            { label: '`', wrap: ['`', '`'], title: 'Код' },
          ].map(f => (
            <button key={f.label} title={f.title}
                    onClick={() => {
                      const ta = document.getElementById(`step-text-${step.id}`) as HTMLTextAreaElement
                      if (!ta) return
                      const start = ta.selectionStart, end = ta.selectionEnd
                      const selected = text.slice(start, end)
                      const newText = text.slice(0, start) + f.wrap[0] + (selected || 'текст') + f.wrap[1] + text.slice(end)
                      setText(newText)
                    }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all hover:bg-white/[0.05]"
                    style={{ color: 'var(--text-secondary)', fontStyle: f.label === 'I' ? 'italic' : 'normal' }}>
              {f.label}
            </button>
          ))}
          <div className="w-px h-4 mx-1" style={{ background: 'var(--glass-border)' }} />
          <button title="Ссылка" onClick={() => setText(text + '\n[текст ссылки](https://)')}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/[0.05]"
                  style={{ color: 'var(--text-secondary)' }}>
            <LinkIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        <textarea
          id={`step-text-${step.id}`}
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          placeholder="Текст шага... (поддерживается **жирный**, *курсив*, ~~зачёркнутый~~)"
          className="w-full text-sm resize-none px-3 py-2.5 outline-none"
          style={{ background: 'var(--glass-hover)', color: 'var(--text-primary)' }}
        />
      </div>

      <div className="flex items-center gap-2">
        <Image className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        <input value={imageUrl} onChange={e => setImageUrl(e.target.value)}
          placeholder="URL или загрузите файл →"
          className="flex-1 text-xs"
          style={{ background: 'var(--glass-hover)', border: '1px solid var(--glass-border)', borderRadius: '0.75rem', padding: '0.375rem 0.75rem', color: 'var(--text-primary)' }} />
        <UploadButton onUpload={url => setImageUrl(url)} label="Загрузить" />
        {imageUrl && (
          <a href={imageUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--text-tertiary)' }}>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {imageUrl && (
        <img src={imageUrl} alt="preview"
          className="rounded-xl max-h-40 w-auto" style={{ border: '1px solid var(--glass-border)' }} />
      )}

      {/* Visual button editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Кнопки</label>
          <button onClick={() => {
            const btns = buttonsJson ? ((() => { try { return JSON.parse(buttonsJson) } catch { return [] } })()) : []
            btns.push({ label: 'Кнопка', url: '', style: 'secondary' })
            setButtonsJson(JSON.stringify(btns))
          }} className="text-[10px] px-2 py-0.5 rounded-lg transition-all" style={{ background: 'rgba(6,182,212,0.08)', color: 'var(--accent-1)' }}>
            + Кнопка
          </button>
        </div>
        {(() => {
          let btns: any[] = []
          try { btns = JSON.parse(buttonsJson || '[]') } catch {}
          if (!Array.isArray(btns) || btns.length === 0) return null
          return (
            <div className="space-y-2">
              {btns.map((btn: any, bi: number) => (
                <div key={bi} className="p-2.5 rounded-xl space-y-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                  <div className="flex items-center gap-2">
                    <input value={btn.label || ''} onChange={e => { btns[bi].label = e.target.value; setButtonsJson(JSON.stringify(btns)) }}
                           placeholder="Название кнопки" className="flex-1 text-xs px-2.5 py-1.5 rounded-lg"
                           style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                    <button onClick={() => { btns.splice(bi, 1); setButtonsJson(JSON.stringify(btns)) }}
                            className="p-1 rounded-lg hover:bg-red-500/10 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input value={btn.url || ''} onChange={e => { btns[bi].url = e.target.value; setButtonsJson(JSON.stringify(btns)) }}
                         placeholder="https://... или deeplink://" className="w-full text-xs px-2.5 py-1.5 rounded-lg font-mono"
                         style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { v: 'primary', label: 'Градиент', bg: 'var(--accent-gradient)', c: '#fff' },
                      { v: 'secondary', label: 'Обычная', bg: 'var(--glass-bg)', c: 'var(--text-primary)' },
                      { v: 'outline', label: 'Контур', bg: 'transparent', c: 'var(--accent-1)' },
                      { v: 'success', label: 'Зелёная', bg: 'rgba(16,185,129,0.15)', c: '#34d399' },
                      { v: 'danger', label: 'Красная', bg: 'rgba(239,68,68,0.15)', c: '#f87171' },
                      { v: 'violet', label: 'Фиолет', bg: 'rgba(139,92,246,0.15)', c: '#a78bfa' },
                    ].map(s => (
                      <button key={s.v} onClick={() => { btns[bi].style = s.v; setButtonsJson(JSON.stringify(btns)) }}
                              className="px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all"
                              style={{
                                background: btn.style === s.v ? s.bg : 'var(--glass-bg)',
                                border: `1.5px solid ${btn.style === s.v ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                                color: btn.style === s.v ? s.c : 'var(--text-tertiary)',
                              }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {/* Position & size */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Позиция:</span>
                    {[
                      { v: 'left', label: '← Лево' },
                      { v: 'center', label: 'Центр' },
                      { v: 'right', label: 'Право →' },
                    ].map(pos => (
                      <button key={pos.v} onClick={() => { btns[bi].align = pos.v; setButtonsJson(JSON.stringify(btns)) }}
                              className="px-2 py-0.5 rounded text-[10px] transition-all"
                              style={{
                                background: (btn.align || 'left') === pos.v ? 'rgba(6,182,212,0.1)' : 'var(--glass-bg)',
                                border: `1px solid ${(btn.align || 'left') === pos.v ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                                color: (btn.align || 'left') === pos.v ? 'var(--accent-1)' : 'var(--text-tertiary)',
                              }}>
                        {pos.label}
                      </button>
                    ))}
                    <div className="w-px h-4 mx-1" style={{ background: 'var(--glass-border)' }} />
                    <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Размер:</span>
                    {[
                      { v: 'sm', label: 'S' },
                      { v: 'md', label: 'M' },
                      { v: 'lg', label: 'L' },
                      { v: 'full', label: '100%' },
                    ].map(sz => (
                      <button key={sz.v} onClick={() => { btns[bi].size = sz.v; setButtonsJson(JSON.stringify(btns)) }}
                              className="px-2 py-0.5 rounded text-[10px] transition-all"
                              style={{
                                background: (btn.size || 'md') === sz.v ? 'rgba(6,182,212,0.1)' : 'var(--glass-bg)',
                                border: `1px solid ${(btn.size || 'md') === sz.v ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                                color: (btn.size || 'md') === sz.v ? 'var(--accent-1)' : 'var(--text-tertiary)',
                              }}>
                        {sz.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        })()}
      </div>
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
  const [icon,      setIcon]      = useState(app.icon || 'smartphone')
  const [featured,  setFeatured]  = useState(app.isFeatured)
  const [storeUrl,  setStoreUrl]  = useState(app.storeUrl ?? '')
  const [deeplink,  setDeeplink]  = useState(app.deeplink ?? '')
  const [steps,     setSteps]     = useState<Step[]>(app.steps)
  const [saving,    setSaving]    = useState(false)

  const IconComp = ICON_MAP[icon] || Smartphone

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
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-all"
           style={{ borderBottom: open ? '1px solid var(--glass-border)' : 'none' }}
           onClick={() => setOpen(v => !v)}>
        <GripVertical className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
             style={{ background: featured ? 'rgba(6,182,212,0.1)' : 'var(--glass-hover)' }}>
          <IconComp className="w-4 h-4" style={{ color: featured ? 'var(--accent-1)' : 'var(--text-tertiary)' }} />
        </div>
        <span className="font-medium text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{name}</span>
        {featured && <Star className="w-3.5 h-3.5" style={{ color: 'var(--accent-1)' }} fill="currentColor" />}
        <span style={{ color: 'var(--text-tertiary)' }}>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
        <button onClick={e => { e.stopPropagation(); onDelete() }}
          className="p-1 rounded-lg transition-all"
          style={{ color: 'var(--text-tertiary)' }}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-4 pt-4">
          {/* App settings */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Название</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full text-sm"
                style={{ background: 'var(--glass-hover)', border: '1px solid var(--glass-border)', borderRadius: '0.75rem', padding: '0.5rem 0.75rem', color: 'var(--text-primary)' }} />
            </div>
            <div className="space-y-1">
              <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Иконка</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select value={icon.startsWith('/') ? '_custom' : icon} onChange={e => { if (e.target.value !== '_custom') setIcon(e.target.value) }}
                    className="w-full text-sm appearance-none cursor-pointer"
                    style={{ background: 'var(--glass-hover)', border: '1px solid var(--glass-border)', borderRadius: '0.75rem', padding: '0.5rem 0.75rem', color: 'var(--text-primary)' }}>
                    {ICON_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                    {icon.startsWith('/') && <option value="_custom">Своя иконка</option>}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
                </div>
                <UploadButton onUpload={url => setIcon(url)} label="Своя" />
              </div>
              {icon.startsWith('/') && (
                <img src={icon} alt="icon" className="w-8 h-8 rounded-lg mt-1" style={{ border: '1px solid var(--glass-border)' }} />
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)}
                className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent-1)' }} />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Рекомендованное</span>
            </label>
            <div className="ml-auto">
              <button onClick={saveApp} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all"
                style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--accent-1)' }}>
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Шаги инструкции</span>
              <button onClick={addStep}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-all"
                style={{ background: 'var(--glass-hover)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
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
        platformId: platform.id, name: 'Новое приложение', icon: 'smartphone',
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
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
      <div className="flex items-center gap-3 px-5 py-4"
           style={{ borderBottom: open ? '1px solid var(--glass-border)' : 'none' }}>
        <button onClick={() => setOpen(v => !v)} className="flex items-center gap-3 flex-1 text-left">
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{platform.name}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--glass-hover)', color: 'var(--text-tertiary)' }}>
            {platform.slug} · {apps.length} прил.
          </span>
        </button>
        <button onClick={async () => {
          const name = prompt('Новое название', platform.name)
          if (!name || name === platform.name) return
          try {
            await api('PATCH', `/platforms/${platform.id}`, { name })
            onUpdate({ ...platform, name })
          } catch { toast.error('Ошибка') }
        }} className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: 'var(--text-tertiary)' }} title="Переименовать">
          <Save className="w-3.5 h-3.5" />
        </button>
        <button onClick={async () => {
          if (!confirm(`Удалить платформу "${platform.name}" и все её приложения?`)) return
          try {
            await api('DELETE', `/platforms/${platform.id}`)
            onDelete()
            toast.success('Удалено')
          } catch { toast.error('Ошибка') }
        }} className="p-1.5 rounded-lg hover:bg-red-500/10" style={{ color: 'var(--text-tertiary)' }} title="Удалить">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setOpen(v => !v)} style={{ color: 'var(--text-tertiary)' }}>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {open && (
        <div className="px-5 pb-5 space-y-3 pt-4">
          {apps.map(app => (
            <AppEditor key={app.id} app={app}
              onUpdate={updated => setApps(aa => aa.map(x => x.id === app.id ? updated : x))}
              onDelete={() => deleteApp(app.id)} />
          ))}
          <button onClick={addApp}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm transition-all"
            style={{ border: '1.5px dashed var(--glass-border)', color: 'var(--text-tertiary)' }}>
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
    <div className="space-y-3">
      {[1,2,3].map(i => <div key={i} className="h-16 rounded-2xl skeleton" />)}
    </div>
  )

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Инструкции по подключению</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Настрой приложения и шаги для каждой платформы
          </p>
        </div>
        <button onClick={async () => {
          const name = prompt('Название ОС (например: Android TV)')
          if (!name) return
          const slug = prompt('Slug (латиницей, например: android-tv)')
          if (!slug) return
          try {
            const p = await api('POST', '/platforms', { slug, name, icon: '📱', sortOrder: platforms.length, isActive: true })
            setPlatforms(ps => [...ps, { ...p, apps: [] }])
            toast.success('Платформа создана')
          } catch { toast.error('Ошибка') }
        }} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> ОС
        </button>
      </div>

      <div className="rounded-2xl px-5 py-4 space-y-3" style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.1)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Справочник Deeplink и переменных</p>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          В поле Deeplink используйте <code className="font-mono px-1 py-0.5 rounded" style={{ background: 'var(--glass-hover)', color: 'var(--accent-1)' }}>{'{url}'}</code> — заменится ссылкой подписки пользователя
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {[
            { app: 'Happ', scheme: 'happ://add/{url}', platforms: 'iOS, Android, Windows, macOS' },
            { app: 'Streisand', scheme: 'streisand://import/{url}', platforms: 'iOS' },
            { app: 'V2Box', scheme: 'v2box://install-sub?url={url}', platforms: 'iOS, macOS' },
            { app: 'V2rayNG', scheme: 'v2rayng://install-config?url={url}', platforms: 'Android' },
            { app: 'Shadowrocket', scheme: 'sub://url={url}', platforms: 'iOS' },
            { app: 'Sing-Box', scheme: 'sing-box://import-remote-profile?url={url}', platforms: 'iOS, Android' },
          ].map(d => (
            <div key={d.app} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{d.app}</p>
                <code className="text-[10px] font-mono block truncate" style={{ color: 'var(--accent-1)' }}>{d.scheme}</code>
                <p className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>{d.platforms}</p>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(d.scheme); toast.success('Скопировано') }}
                      className="p-1 rounded flex-shrink-0 hover:bg-white/5" style={{ color: 'var(--text-tertiary)' }}>
                <Copy className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
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
