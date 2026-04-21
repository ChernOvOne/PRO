'use client'

import { useEffect, useState } from 'react'
import {
  Plus, Trash2, Save, X, Star, Calendar,
  Package, Zap, ChevronDown, ChevronUp, Shield,
  Sliders, Layers, Settings2, Eye, GripVertical,
  Smartphone, Clock, Wifi, ToggleLeft, ToggleRight,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Squad  { uuid: string; name: string; info: { membersCount: number } }
interface TariffVariant { days: number; priceRub: number; priceUsdt?: number; label: string; trafficGb?: number; deviceLimit?: number }
interface ConfiguratorParam { pricePerUnit: number; min: number; max: number; step: number; default: number }
interface TariffConfigurator { traffic?: ConfiguratorParam; days?: ConfiguratorParam; devices?: ConfiguratorParam }
interface PaidSquad {
  squadUuid:     string
  title:         string
  pricePerMonth: number
  description?:  string | null
  country?:      string | null
  icon?:         string | null
}
interface Tariff {
  id: string; name: string; description?: string; type: 'SUBSCRIPTION' | 'TRAFFIC_ADDON'
  durationDays: number; priceRub: number; priceUsdt?: number
  deviceLimit: number; trafficGb?: number; trafficAddonGb?: number
  trafficStrategy: string; isActive: boolean; isVisible: boolean; isFeatured: boolean; isTrial: boolean; sortOrder: number
  remnawaveSquads: string[]; remnawaveTag?: string
  mode?: 'simple' | 'variants' | 'configurator'
  variants?: TariffVariant[]
  configurator?: TariffConfigurator
  countries?: string; protocol?: string; speed?: string
  paidSquads?: PaidSquad[]
  autoRenewAllowed?: boolean
}

const EMPTY_SUB: Partial<Tariff> = {
  type: 'SUBSCRIPTION', name: '', durationDays: 30, priceRub: 0,
  deviceLimit: 3, trafficStrategy: 'MONTH', isActive: true, isVisible: true,
  isFeatured: false, isTrial: false, sortOrder: 0, remnawaveSquads: [], mode: 'simple',
}
const EMPTY_ADDON: Partial<Tariff> = {
  type: 'TRAFFIC_ADDON', name: '', priceRub: 0, trafficAddonGb: 100,
  isActive: true, isVisible: true, isTrial: false, sortOrder: 0, remnawaveSquads: [],
}

async function req(method: string, path: string, body?: any) {
  const r = await fetch(path, {
    method, credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

const EMPTY_VARIANT: TariffVariant = { label: '', days: 30, priceRub: 0 }
const EMPTY_CFG_PARAM: ConfiguratorParam = { pricePerUnit: 0, min: 1, max: 100, step: 1, default: 10 }

const MODE_META = {
  simple:       { label: 'Простой',       icon: Package,  desc: 'Один тариф с фиксированной ценой',   color: 'var(--accent-1)' },
  variants:     { label: 'С вариантами',  icon: Layers,   desc: 'Несколько вариантов по длительности', color: 'var(--accent-2)' },
  configurator: { label: 'Конфигуратор',  icon: Sliders,  desc: 'Пользователь выбирает параметры',    color: 'var(--success)' },
} as const

/* ================================================================
   TARIFF FORM
   ================================================================ */
function TariffForm({ initial, squads, onSave, onCancel }: {
  initial: Partial<Tariff>
  squads: Squad[]
  onSave: (t: Tariff) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<Partial<Tariff>>(initial)
  const [saving, setSaving] = useState(false)
  const [countries, setCountries] = useState(initial.countries ?? '')
  const [protocol, setProtocol] = useState(initial.protocol ?? '')
  const [speed, setSpeed] = useState(initial.speed ?? '')
  const [variants, setVariants] = useState<TariffVariant[]>(initial.variants ?? [])
  const [cfgTraffic, setCfgTraffic] = useState<ConfiguratorParam>(initial.configurator?.traffic ?? { ...EMPTY_CFG_PARAM, max: 500, default: 50, pricePerUnit: 2 })
  const [cfgDays, setCfgDays] = useState<ConfiguratorParam>(initial.configurator?.days ?? { ...EMPTY_CFG_PARAM, min: 7, max: 365, step: 1, default: 30, pricePerUnit: 5 })
  const [cfgDevices, setCfgDevices] = useState<ConfiguratorParam>(initial.configurator?.devices ?? { ...EMPTY_CFG_PARAM, min: 1, max: 10, step: 1, default: 3, pricePerUnit: 30 })
  const [cfgEnabled, setCfgEnabled] = useState<{ traffic: boolean; days: boolean; devices: boolean }>({
    traffic: !!initial.configurator?.traffic,
    days: !!initial.configurator?.days,
    devices: !!initial.configurator?.devices,
  })
  const [showPreview, setShowPreview] = useState(false)

  const set = (k: keyof Tariff, v: any) => setForm(f => ({ ...f, [k]: v }))
  const mode = form.mode ?? 'simple'
  const isAddon = form.type === 'TRAFFIC_ADDON'

  const save = async () => {
    setSaving(true)
    try {
      const isEdit = !!initial.id
      const payload: any = { ...form, countries: countries || undefined, protocol: protocol || undefined, speed: speed || undefined }
      if (mode === 'variants') {
        payload.variants = variants
        payload.configurator = null
      } else if (mode === 'configurator') {
        const cfg: any = {}
        if (cfgEnabled.traffic) cfg.traffic = cfgTraffic
        if (cfgEnabled.days) cfg.days = cfgDays
        if (cfgEnabled.devices) cfg.devices = cfgDevices
        payload.configurator = cfg
        payload.variants = null
      } else {
        payload.variants = null
        payload.configurator = null
      }
      const result = isEdit
        ? await req('PATCH', `/api/admin/tariffs/${initial.id}`, payload)
        : await req('POST', '/api/admin/tariffs', payload)
      onSave(result)
      toast.success(isEdit ? 'Тариф обновлён' : 'Тариф создан')
    } catch { toast.error('Ошибка сохранения') }
    finally { setSaving(false) }
  }

  const toggleSquad = (uuid: string) => {
    const cur = form.remnawaveSquads ?? []
    set('remnawaveSquads', cur.includes(uuid) ? cur.filter(x => x !== uuid) : [...cur, uuid])
  }

  /* Configurator price preview */
  const calcCfgPrice = () => {
    let p = 0
    if (cfgEnabled.traffic) p += cfgTraffic.default * cfgTraffic.pricePerUnit
    if (cfgEnabled.days) p += cfgDays.default * cfgDays.pricePerUnit
    if (cfgEnabled.devices) p += cfgDevices.default * cfgDevices.pricePerUnit
    return Math.round(p)
  }

  return (
    <div className="glass-card animate-slide-up !p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
               style={{ background: 'rgba(6,182,212,0.1)' }}>
            {initial.id
              ? <Settings2 className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />
              : <Plus className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />}
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {initial.id ? 'Редактировать тариф' : 'Новый тариф'}
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {initial.id ? 'Измените параметры и сохраните' : 'Заполните параметры нового тарифа'}
            </p>
          </div>
        </div>
        <button onClick={onCancel} className="p-2 rounded-xl transition-all"
                style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--glass-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Type selector */}
        <div className="flex gap-3">
          {(['SUBSCRIPTION', 'TRAFFIC_ADDON'] as const).map(t => {
            const active = form.type === t
            const isSub = t === 'SUBSCRIPTION'
            return (
              <button key={t} onClick={() => set('type', t)}
                className="flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-medium
                           transition-all flex-1 justify-center"
                style={{
                  background: active
                    ? isSub ? 'rgba(6,182,212,0.1)' : 'rgba(245,158,11,0.1)'
                    : 'var(--glass-bg)',
                  border: `1.5px solid ${active
                    ? isSub ? 'rgba(6,182,212,0.3)' : 'rgba(245,158,11,0.3)'
                    : 'var(--glass-border)'}`,
                  color: active
                    ? isSub ? 'var(--accent-1)' : 'var(--warning)'
                    : 'var(--text-tertiary)',
                }}>
                {isSub ? <Shield className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                {isSub ? 'Подписка' : 'Доп. трафик'}
              </button>
            )
          })}
        </div>

        {/* Mode selector (subscriptions only) */}
        {!isAddon && (
          <div>
            <label className="text-xs font-medium mb-2.5 block" style={{ color: 'var(--text-secondary)' }}>
              Режим тарифа
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(Object.entries(MODE_META) as [keyof typeof MODE_META, typeof MODE_META[keyof typeof MODE_META]][]).map(([key, meta]) => {
                const active = mode === key
                const Icon = meta.icon
                return (
                  <button key={key} onClick={() => set('mode', key)}
                    className="relative p-4 rounded-xl text-left transition-all duration-200"
                    style={{
                      background: active ? `color-mix(in srgb, ${meta.color} 10%, transparent)` : 'var(--glass-bg)',
                      border: `1.5px solid ${active ? meta.color : 'var(--glass-border)'}`,
                    }}>
                    <Icon className="w-5 h-5 mb-2" style={{ color: active ? meta.color : 'var(--text-tertiary)' }} />
                    <p className="text-sm font-semibold mb-0.5"
                       style={{ color: active ? meta.color : 'var(--text-primary)' }}>
                      {meta.label}
                    </p>
                    <p className="text-[10px] leading-snug" style={{ color: 'var(--text-tertiary)' }}>
                      {meta.desc}
                    </p>
                    {active && (
                      <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full"
                           style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Common fields */}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Название *</label>
            <input value={form.name ?? ''} onChange={e => set('name', e.target.value)}
              placeholder={isAddon ? '+100 ГБ трафика' : 'Базовый · 1 месяц'}
              className="glass-input" />
          </div>

          {/* Description */}
          <div className="col-span-2 space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Описание</label>
            <textarea value={form.description ?? ''} onChange={e => set('description', e.target.value)}
              placeholder="Краткое описание тарифа"
              className="glass-input !min-h-[60px]" rows={2} />
          </div>

          {/* Countries picker */}
          <div className="col-span-2 space-y-2">
            <label className="text-xs" style={{color:'var(--text-tertiary)'}}>Локации (необязательно)</label>
            <CountryPicker value={countries} onChange={setCountries} />
          </div>

          {/* Protocol */}
          <div className="space-y-1">
            <label className="text-xs" style={{color:'var(--text-tertiary)'}}>Протокол (необязательно)</label>
            <input value={protocol} onChange={e => setProtocol(e.target.value)}
              placeholder="VLESS + XTLS Reality"
              className="glass-input text-sm w-full" />
          </div>

          {/* Speed */}
          <div className="space-y-1">
            <label className="text-xs" style={{color:'var(--text-tertiary)'}}>Скорость (необязательно)</label>
            <input value={speed} onChange={e => setSpeed(e.target.value)}
              placeholder="до 1 Гбит/с"
              className="glass-input text-sm w-full" />
          </div>

          {mode === 'simple' && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Цена ₽ *</label>
                <input type="number" value={form.priceRub ?? ''} onChange={e => set('priceRub', +e.target.value)}
                  className="glass-input" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Цена USDT</label>
                <input type="number" step="0.01" value={form.priceUsdt ?? ''} onChange={e => set('priceUsdt', +e.target.value || undefined)}
                  className="glass-input" />
              </div>
            </>
          )}
          {(mode === 'variants' || mode === 'configurator') && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Базовая цена ₽ (отображение)</label>
                <input type="number" value={form.priceRub ?? ''} onChange={e => set('priceRub', +e.target.value)}
                  className="glass-input" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Базовая цена USDT</label>
                <input type="number" step="0.01" value={form.priceUsdt ?? ''} onChange={e => set('priceUsdt', +e.target.value || undefined)}
                  className="glass-input" />
              </div>
            </>
          )}
        </div>

        {/* ── VARIANTS MODE ── */}
        {!isAddon && mode === 'variants' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Варианты</label>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Каждый вариант — отдельный период/цена</p>
              </div>
              <button onClick={() => setShowPreview(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'rgba(6,182,212,0.08)', color: 'var(--accent-1)', border: '1px solid rgba(6,182,212,0.15)' }}>
                <Eye className="w-3.5 h-3.5" /> {showPreview ? 'Скрыть' : 'Превью'}
              </button>
            </div>

            {/* Variants table */}
            {variants.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>
                {/* Table header */}
                <div className="grid grid-cols-[1fr_80px_90px_90px_70px_70px_40px] gap-2 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider"
                     style={{ background: 'var(--glass-bg)', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--glass-border)' }}>
                  <span>Метка</span>
                  <span>Дней</span>
                  <span>Цена ₽</span>
                  <span>USDT</span>
                  <span>ГБ</span>
                  <span>Устр.</span>
                  <span></span>
                </div>
                {variants.map((v, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_90px_90px_70px_70px_40px] gap-2 px-4 py-2 items-center transition-all"
                       style={{ borderBottom: i < variants.length - 1 ? '1px solid var(--glass-border)' : 'none' }}
                       onMouseEnter={e => { e.currentTarget.style.background = 'var(--glass-hover)' }}
                       onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <input value={v.label} onChange={e => { const nv = [...variants]; nv[i] = { ...nv[i], label: e.target.value }; setVariants(nv) }}
                      placeholder="1 мес" className="glass-input !py-2 !px-2.5 !text-xs" />
                    <input type="number" value={v.days} onChange={e => { const nv = [...variants]; nv[i] = { ...nv[i], days: +e.target.value }; setVariants(nv) }}
                      className="glass-input !py-2 !px-2.5 !text-xs" />
                    <input type="number" value={v.priceRub} onChange={e => { const nv = [...variants]; nv[i] = { ...nv[i], priceRub: +e.target.value }; setVariants(nv) }}
                      className="glass-input !py-2 !px-2.5 !text-xs" />
                    <input type="number" step="0.01" value={v.priceUsdt ?? ''} onChange={e => { const nv = [...variants]; nv[i] = { ...nv[i], priceUsdt: +e.target.value || undefined }; setVariants(nv) }}
                      className="glass-input !py-2 !px-2.5 !text-xs" placeholder="—" />
                    <input type="number" value={v.trafficGb ?? ''} onChange={e => { const nv = [...variants]; nv[i] = { ...nv[i], trafficGb: +e.target.value || undefined }; setVariants(nv) }}
                      className="glass-input !py-2 !px-2.5 !text-xs" placeholder="∞" />
                    <input type="number" value={v.deviceLimit ?? ''} onChange={e => { const nv = [...variants]; nv[i] = { ...nv[i], deviceLimit: +e.target.value || undefined }; setVariants(nv) }}
                      className="glass-input !py-2 !px-2.5 !text-xs" placeholder="—" />
                    <button onClick={() => setVariants(v => v.filter((_, j) => j !== i))}
                      className="p-1.5 rounded-lg transition-all"
                      style={{ color: 'var(--text-tertiary)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.background = 'transparent' }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add variant button */}
            <button onClick={() => setVariants(v => [...v, { ...EMPTY_VARIANT }])}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-medium transition-all"
              style={{
                border: '2px dashed var(--glass-border)',
                color: 'var(--text-tertiary)',
                background: 'transparent',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--accent-2)'
                e.currentTarget.style.color = 'var(--accent-2)'
                e.currentTarget.style.background = 'rgba(139,92,246,0.05)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--glass-border)'
                e.currentTarget.style.color = 'var(--text-tertiary)'
                e.currentTarget.style.background = 'transparent'
              }}>
              <Plus className="w-4 h-4" /> Вариант
            </button>

            {variants.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: 'var(--text-tertiary)' }}>Добавьте хотя бы один вариант</p>
            )}

            {/* Preview */}
            {showPreview && variants.length > 0 && (
              <div className="rounded-xl p-4 space-y-3 animate-slide-up"
                   style={{ background: 'var(--surface-3)', border: '1px solid var(--glass-border)' }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                  Превью для пользователя
                </p>
                <div className="flex gap-2 flex-wrap">
                  {variants.map((v, i) => (
                    <button key={i}
                      className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                      style={{
                        background: i === 0 ? 'rgba(6,182,212,0.12)' : 'var(--glass-bg)',
                        border: `1.5px solid ${i === 0 ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                        color: i === 0 ? 'var(--accent-1)' : 'var(--text-secondary)',
                      }}>
                      {v.label || `${v.days} дн.`}
                    </button>
                  ))}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>
                    {(variants[0]?.priceRub ?? 0).toLocaleString('ru')}
                  </span>
                  <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>₽</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CONFIGURATOR MODE ── */}
        {!isAddon && mode === 'configurator' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Параметры конфигуратора</label>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Включите параметры, которые может настроить пользователь</p>
              </div>
              <div className="px-3 py-1.5 rounded-lg text-xs font-bold"
                   style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.2)' }}>
                ~ {calcCfgPrice().toLocaleString('ru')} ₽
              </div>
            </div>

            {([
              { key: 'traffic' as const, label: 'Трафик (ГБ)', icon: Wifi, state: cfgTraffic, setState: setCfgTraffic, color: 'var(--accent-1)' },
              { key: 'days' as const, label: 'Период (дни)', icon: Calendar, state: cfgDays, setState: setCfgDays, color: 'var(--accent-2)' },
              { key: 'devices' as const, label: 'Устройства', icon: Smartphone, state: cfgDevices, setState: setCfgDevices, color: 'var(--warning)' },
            ]).map(p => {
              const enabled = cfgEnabled[p.key]
              const Icon = p.icon
              return (
                <div key={p.key} className="rounded-xl overflow-hidden transition-all duration-200"
                     style={{
                       background: enabled ? `color-mix(in srgb, ${p.color} 5%, transparent)` : 'var(--glass-bg)',
                       border: `1px solid ${enabled ? p.color : 'var(--glass-border)'}`,
                       borderColor: enabled ? `color-mix(in srgb, ${p.color} 30%, transparent)` : 'var(--glass-border)',
                     }}>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 transition-all"
                    onClick={() => setCfgEnabled(prev => ({ ...prev, [p.key]: !prev[p.key] }))}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                         style={{ background: `color-mix(in srgb, ${p.color} 12%, transparent)` }}>
                      <Icon className="w-4 h-4" style={{ color: p.color }} />
                    </div>
                    <span className="text-sm font-medium flex-1 text-left" style={{ color: enabled ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                      {p.label}
                    </span>
                    {enabled
                      ? <ToggleRight className="w-6 h-6" style={{ color: p.color }} />
                      : <ToggleLeft className="w-6 h-6" style={{ color: 'var(--text-tertiary)' }} />}
                  </button>
                  {enabled && (
                    <div className="px-4 pb-4 pt-1 animate-slide-up">
                      <div className="grid grid-cols-5 gap-3">
                        {(['pricePerUnit', 'min', 'max', 'step', 'default'] as const).map(f => (
                          <div key={f} className="space-y-1">
                            <label className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
                              {f === 'pricePerUnit' ? '₽ / ед.' : f === 'min' ? 'Мин' : f === 'max' ? 'Макс' : f === 'step' ? 'Шаг' : 'По умолч.'}
                            </label>
                            <input type="number" value={p.state[f]} onChange={e => p.setState(prev => ({ ...prev, [f]: +e.target.value }))}
                              className="glass-input !py-2 !px-2.5 !text-xs" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Configurator preview */}
            <div className="rounded-xl p-4 space-y-3"
                 style={{ background: 'var(--surface-3)', border: '1px solid var(--glass-border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                Превью для пользователя
              </p>
              <div className="space-y-3">
                {cfgEnabled.traffic && (
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span style={{ color: 'var(--text-tertiary)' }}>Трафик</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{cfgTraffic.default} ГБ</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg)' }}>
                      <div className="h-full rounded-full" style={{
                        width: `${((cfgTraffic.default - cfgTraffic.min) / (cfgTraffic.max - cfgTraffic.min)) * 100}%`,
                        background: 'var(--accent-1)',
                      }} />
                    </div>
                  </div>
                )}
                {cfgEnabled.days && (
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span style={{ color: 'var(--text-tertiary)' }}>Период</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{cfgDays.default} дн.</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg)' }}>
                      <div className="h-full rounded-full" style={{
                        width: `${((cfgDays.default - cfgDays.min) / (cfgDays.max - cfgDays.min)) * 100}%`,
                        background: 'var(--accent-2)',
                      }} />
                    </div>
                  </div>
                )}
                {cfgEnabled.devices && (
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span style={{ color: 'var(--text-tertiary)' }}>Устройства</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{cfgDevices.default}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg)' }}>
                      <div className="h-full rounded-full" style={{
                        width: `${((cfgDevices.default - cfgDevices.min) / (cfgDevices.max - cfgDevices.min)) * 100}%`,
                        background: 'var(--warning)',
                      }} />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>
                  {calcCfgPrice().toLocaleString('ru')}
                </span>
                <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>₽</span>
              </div>
            </div>
          </div>
        )}

        {/* Subscription fields */}
        {!isAddon && (
          <>
            {mode === 'simple' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Дней *</label>
                  <input type="number" value={form.durationDays ?? ''} onChange={e => set('durationDays', +e.target.value)}
                    className="glass-input" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Устройств</label>
                  <input type="number" value={form.deviceLimit ?? 3} onChange={e => set('deviceLimit', +e.target.value)}
                    className="glass-input" />
                </div>
              </div>
            )}

            {(mode === 'variants' || mode === 'configurator') && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Базовые дни (fallback)</label>
                  <input type="number" value={form.durationDays ?? ''} onChange={e => set('durationDays', +e.target.value)}
                    className="glass-input" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Базовые устройства</label>
                  <input type="number" value={form.deviceLimit ?? 3} onChange={e => set('deviceLimit', +e.target.value)}
                    className="glass-input" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Трафик ГБ (пусто = безлимит)</label>
                <input type="number" value={form.trafficGb ?? ''} onChange={e => set('trafficGb', +e.target.value || undefined)}
                  className="glass-input" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Стратегия трафика</label>
                <select value={form.trafficStrategy ?? 'MONTH'} onChange={e => set('trafficStrategy', e.target.value)}
                  className="glass-input">
                  <option value="MONTH">MONTH -- сброс раз в месяц</option>
                  <option value="NO_RESET">NO_RESET -- не сбрасывается</option>
                  <option value="WEEK">WEEK -- сброс раз в неделю</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Tag в Remnawave</label>
              <input value={form.remnawaveTag ?? ''} onChange={e => set('remnawaveTag', e.target.value || undefined)}
                placeholder="premium / basic / ..."
                className="glass-input font-mono" />
            </div>

            {/* Free base squads */}
            {squads.length > 0 && (
              <div className="space-y-2.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Базовые серверы (входят в тариф бесплатно)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {squads.map(sq => {
                    const checked = (form.remnawaveSquads ?? []).includes(sq.uuid)
                    return (
                      <label key={sq.uuid} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200"
                             style={{
                               background: checked ? 'rgba(6,182,212,0.06)' : 'var(--glass-bg)',
                               border: `1px solid ${checked ? 'rgba(6,182,212,0.2)' : 'var(--glass-border)'}`,
                             }}>
                        <input type="checkbox"
                          checked={checked}
                          onChange={() => toggleSquad(sq.uuid)}
                          className="w-4 h-4 rounded accent-[var(--accent-1)] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{sq.name}</div>
                          <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{sq.info?.membersCount ?? 0} участников</div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Paid squad addons */}
            {squads.length > 0 && (
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Платные серверы (клиент докупает сверх тарифа)
                  </label>
                  <button type="button"
                          onClick={() => {
                            const current = form.paidSquads ?? []
                            const used = new Set([...(form.remnawaveSquads ?? []), ...current.map(p => p.squadUuid)])
                            const first = squads.find(s => !used.has(s.uuid))
                            if (!first) { toast.error('Свободных сквадов нет'); return }
                            set('paidSquads', [...current, {
                              squadUuid: first.uuid, title: first.name, pricePerMonth: 0,
                            }])
                          }}
                          className="text-xs px-2.5 py-1 rounded-lg"
                          style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--accent-1)' }}>
                    + Добавить
                  </button>
                </div>
                <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  Цена в месяц. При покупке вместе с тарифом: цена × число месяцев. При добавлении к уже активной подписке: по дням пропорционально.
                </p>
                {(form.paidSquads ?? []).length === 0 && (
                  <div className="text-xs italic p-3 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px dashed var(--glass-border)', color: 'var(--text-tertiary)' }}>
                    Нет платных серверов. Клиент получает только базовые сквады выше.
                  </div>
                )}
                {(form.paidSquads ?? []).map((p, idx) => {
                  const usedElsewhere = new Set([
                    ...(form.remnawaveSquads ?? []),
                    ...(form.paidSquads ?? []).filter((_, i) => i !== idx).map(x => x.squadUuid),
                  ])
                  return (
                    <div key={idx} className="grid grid-cols-[1fr_1.2fr_120px_40px] gap-2 items-center p-2 rounded-xl"
                         style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                      <select className="glass-input text-xs"
                              value={p.squadUuid}
                              onChange={e => {
                                const s = squads.find(x => x.uuid === e.target.value)
                                const next = [...(form.paidSquads ?? [])]
                                next[idx] = { ...p, squadUuid: e.target.value, title: p.title || s?.name || '' }
                                set('paidSquads', next)
                              }}>
                        {squads.filter(s => !usedElsewhere.has(s.uuid) || s.uuid === p.squadUuid).map(s => (
                          <option key={s.uuid} value={s.uuid}>{s.name}</option>
                        ))}
                      </select>
                      <input className="glass-input text-xs" placeholder="Название для клиента (🇩🇪 Германия Premium)"
                             value={p.title}
                             onChange={e => {
                               const next = [...(form.paidSquads ?? [])]
                               next[idx] = { ...p, title: e.target.value }
                               set('paidSquads', next)
                             }} />
                      <div className="relative">
                        <input className="glass-input text-xs pr-10" type="number" min={0} step={1}
                               value={p.pricePerMonth}
                               onChange={e => {
                                 const next = [...(form.paidSquads ?? [])]
                                 next[idx] = { ...p, pricePerMonth: Number(e.target.value) || 0 }
                                 set('paidSquads', next)
                               }} />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>₽/мес</span>
                      </div>
                      <button type="button"
                              onClick={() => set('paidSquads', (form.paidSquads ?? []).filter((_, i) => i !== idx))}
                              className="p-2 rounded-lg hover:bg-red-500/10 text-red-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Auto-renew allowed */}
            <label className="flex items-center gap-2 text-xs cursor-pointer pt-1"
                   style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox"
                     checked={form.autoRenewAllowed ?? true}
                     onChange={e => set('autoRenewAllowed', e.target.checked)}
                     className="w-4 h-4 rounded accent-[var(--accent-1)]" />
              Разрешить автопродление этого тарифа с баланса (выключи для триала/акций)
            </label>
          </>
        )}

        {/* Addon fields */}
        {isAddon && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Объём трафика ГБ *</label>
            <input type="number" value={form.trafficAddonGb ?? ''} onChange={e => set('trafficAddonGb', +e.target.value)}
              placeholder="100" className="glass-input" />
          </div>
        )}

        {/* Options */}
        <div className="flex items-center gap-6 py-1">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={form.isActive ?? true} onChange={e => set('isActive', e.target.checked)}
              className="w-4 h-4 rounded accent-[var(--accent-1)]" />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Активен</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={form.isVisible ?? true} onChange={e => set('isVisible', e.target.checked)}
              className="w-4 h-4 rounded accent-[#60a5fa]" />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Видимый</span>
          </label>
          {!isAddon && (
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={form.isFeatured ?? false} onChange={e => set('isFeatured', e.target.checked)}
                className="w-4 h-4 rounded accent-[var(--warning)]" />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Рекомендованный</span>
            </label>
          )}
          {!isAddon && (
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={form.isTrial ?? false} onChange={e => set('isTrial', e.target.checked)}
                className="w-4 h-4 rounded accent-[#a78bfa]" />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Тестовый</span>
            </label>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Порядок:</span>
            <input type="number" value={form.sortOrder ?? 0} onChange={e => set('sortOrder', +e.target.value)}
                   className="w-16 text-sm text-center rounded-lg py-1"
                   style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem' }}>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center">
            <Save className="w-4 h-4" />
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button onClick={onCancel} className="btn-secondary flex-1 justify-center">
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   TARIFF CARD (expandable)
   ================================================================ */
function TariffCard({ tariff, squads, expanded, onToggle, onSave, onDelete, onDuplicate }: {
  tariff: Tariff
  squads: Squad[]
  expanded: boolean
  onToggle: () => void
  onSave: (t: Tariff) => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  const isAddon = tariff.type === 'TRAFFIC_ADDON'
  const mode = tariff.mode ?? 'simple'
  const modeMeta = MODE_META[mode as keyof typeof MODE_META] ?? MODE_META.simple

  const priceRange = () => {
    if (mode === 'variants' && tariff.variants?.length) {
      const prices = tariff.variants.map(v => v.priceRub)
      const min = Math.min(...prices)
      const max = Math.max(...prices)
      return min === max ? `${min.toLocaleString('ru')} ₽` : `${min.toLocaleString('ru')} — ${max.toLocaleString('ru')} ₽`
    }
    return `${tariff.priceRub.toLocaleString('ru')} ₽`
  }

  return (
    <div className={`rounded-2xl overflow-hidden transition-all duration-300 animate-slide-up
                     ${!tariff.isActive ? 'opacity-60' : ''}`}
         style={{
           background: expanded ? 'var(--glass-hover)' : 'var(--glass-bg)',
           border: `1px solid ${expanded ? 'var(--accent-1)' : tariff.isFeatured ? 'rgba(6,182,212,0.2)' : 'var(--glass-border)'}`,
           boxShadow: tariff.isFeatured && !expanded ? '0 0 30px rgba(6,182,212,0.06)' : 'none',
         }}>
      {/* Card header — clickable */}
      <div className="flex items-center gap-4 px-5 py-4 cursor-pointer transition-all"
           onClick={onToggle}>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0`}
             style={{
               background: isAddon ? 'rgba(245,158,11,0.1)' : `color-mix(in srgb, ${modeMeta.color} 12%, transparent)`,
             }}>
          {isAddon
            ? <Zap className="w-5 h-5" style={{ color: 'var(--warning)' }} />
            : <modeMeta.icon className="w-5 h-5" style={{ color: modeMeta.color }} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{tariff.name}</span>
            {tariff.isFeatured && (
              <Star className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--warning)' }} fill="currentColor" />
            )}
            {!isAddon && (
              <span className="badge text-[10px]" style={{
                background: `color-mix(in srgb, ${modeMeta.color} 12%, transparent)`,
                color: modeMeta.color,
              }}>
                {modeMeta.label}
              </span>
            )}
            {!tariff.isActive && <span className="badge-gray text-[10px]">Неактивен</span>}
            {!(tariff as any).isVisible && <span className="badge-gray text-[10px]">Скрыт</span>}
            {(tariff as any).isTrial && <span className="badge-violet text-[10px]">Тестовый</span>}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {isAddon
              ? `+${tariff.trafficAddonGb} ГБ`
              : `${tariff.durationDays} дн. · ${tariff.trafficGb ? tariff.trafficGb + ' ГБ' : '∞'} · ${tariff.deviceLimit} устр.`}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-lg font-bold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
            {priceRange()}
          </span>
          <button onClick={e => { e.stopPropagation(); onDuplicate() }}
            className="p-2 rounded-lg transition-all flex-shrink-0"
            style={{ color: 'var(--text-tertiary)' }}
            title="Дублировать"
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-1)'; e.currentTarget.style.background = 'rgba(6,182,212,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.background = 'transparent' }}>
            <Layers className="w-4 h-4" />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete() }}
            className="p-2 rounded-lg transition-all flex-shrink-0"
            style={{ color: 'var(--text-tertiary)' }}
            title="Удалить"
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.background = 'transparent' }}>
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="transition-transform duration-200" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>
            <ChevronDown className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
          </div>
        </div>
      </div>

      {/* Expanded form */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--glass-border)' }}>
          <TariffForm
            initial={{ ...tariff }}
            squads={squads}
            onSave={onSave}
            onCancel={onToggle}
          />
        </div>
      )}
    </div>
  )
}

/* ================================================================
   MAIN PAGE
   ================================================================ */
export default function AdminTariffsPage() {
  const [tariffs, setTariffs] = useState<Tariff[]>([])
  const [squads,  setSquads]  = useState<Squad[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'SUBSCRIPTION' | 'TRAFFIC_ADDON'>('SUBSCRIPTION')

  useEffect(() => {
    Promise.all([
      req('GET', '/api/admin/tariffs').then(setTariffs),
      req('GET', '/api/admin/squads').then(d => setSquads(d.squads ?? [])).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const duplicateTariff = async (id: string) => {
    try {
      const copy = await req('POST', `/api/admin/tariffs/${id}/duplicate`)
      setTariffs(list => [...list, copy])
      setExpandedId(copy.id)
      toast.success(`Скопирован как "${copy.name}"`)
    } catch { toast.error('Не удалось скопировать') }
  }

  const deleteTariff = async (id: string) => {
    if (!confirm('Удалить тариф?')) return
    try {
      await req('DELETE', `/api/admin/tariffs/${id}`)
      setTariffs(t => t.filter(x => x.id !== id))
      toast.success('Удалено')
    } catch { toast.error('Ошибка') }
  }

  const filtered = tariffs.filter(t => t.type === tab)
  const subs   = tariffs.filter(t => t.type === 'SUBSCRIPTION')
  const addons = tariffs.filter(t => t.type === 'TRAFFIC_ADDON')

  if (loading) return (
    <div className="max-w-5xl mx-auto space-y-4">
      {[1,2,3].map(i => (
        <div key={i} className="h-20 skeleton rounded-2xl" style={{ animationDelay: `${i * 100}ms` }} />
      ))}
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-slide-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Тарифы
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {subs.length} подписок · {addons.length} пакетов трафика
          </p>
        </div>
        <button onClick={() => { setCreating(true); setExpandedId(null) }}
          className="btn-primary">
          <Plus className="w-4 h-4" />
          Создать тариф
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 animate-slide-up" style={{ animationDelay: '50ms' }}>
        {(['SUBSCRIPTION', 'TRAFFIC_ADDON'] as const).map(t => {
          const active = tab === t
          const isSub = t === 'SUBSCRIPTION'
          const count = isSub ? subs.length : addons.length
          return (
            <button key={t} onClick={() => setTab(t)}
              className="flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium transition-all duration-200"
              style={{
                background: active ? 'var(--glass-hover)' : 'var(--glass-bg)',
                border: `1.5px solid ${active ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
              }}>
              {isSub ? <Shield className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
              {isSub ? 'Подписки' : 'Доп. трафик'}
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                    style={{
                      background: active ? 'rgba(6,182,212,0.15)' : 'var(--glass-bg)',
                      color: active ? 'var(--accent-1)' : 'var(--text-tertiary)',
                    }}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Create form (inline) */}
      {creating && (
        <TariffForm
          initial={tab === 'SUBSCRIPTION' ? { ...EMPTY_SUB } : { ...EMPTY_ADDON }}
          squads={squads}
          onSave={saved => {
            setTariffs(t => [...t, saved])
            setCreating(false)
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {/* Tariff list */}
      <div className="space-y-3 stagger">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-20 animate-slide-up">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                 style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              {tab === 'SUBSCRIPTION'
                ? <Shield className="w-8 h-8" style={{ color: 'var(--text-tertiary)' }} />
                : <Zap className="w-8 h-8" style={{ color: 'var(--text-tertiary)' }} />}
            </div>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              {tab === 'SUBSCRIPTION' ? 'Нет подписок' : 'Нет пакетов доп. трафика'}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Создайте первый тариф, чтобы начать
            </p>
          </div>
        ) : filtered.map(t => (
          <TariffCard
            key={t.id}
            tariff={t}
            squads={squads}
            expanded={expandedId === t.id}
            onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
            onSave={saved => {
              setTariffs(list => list.map(x => x.id === saved.id ? saved : x))
              setExpandedId(null)
            }}
            onDelete={() => deleteTariff(t.id)}
            onDuplicate={() => duplicateTariff(t.id)}
          />
        ))}
      </div>

      {/* Bottom create button when items exist */}
      {filtered.length > 0 && !creating && (
        <button onClick={() => { setCreating(true); setExpandedId(null) }}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-semibold transition-all duration-200 animate-slide-up"
          style={{
            border: '2px dashed var(--glass-border)',
            color: 'var(--text-tertiary)',
            background: 'transparent',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--accent-1)'
            e.currentTarget.style.color = 'var(--accent-1)'
            e.currentTarget.style.background = 'rgba(6,182,212,0.04)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--glass-border)'
            e.currentTarget.style.color = 'var(--text-tertiary)'
            e.currentTarget.style.background = 'transparent'
          }}>
          <Plus className="w-5 h-5" /> Создать тариф
        </button>
      )}
    </div>
  )
}

/* ── Country list with flag URLs from flagcdn.com ── */
const COUNTRIES = [
  { code: 'ru', name: 'Россия' }, { code: 'us', name: 'США' }, { code: 'gb', name: 'Великобритания' },
  { code: 'de', name: 'Германия' }, { code: 'nl', name: 'Нидерланды' }, { code: 'fi', name: 'Финляндия' },
  { code: 'pl', name: 'Польша' }, { code: 'fr', name: 'Франция' }, { code: 'jp', name: 'Япония' },
  { code: 'sg', name: 'Сингапур' }, { code: 'kr', name: 'Южная Корея' }, { code: 'ca', name: 'Канада' },
  { code: 'au', name: 'Австралия' }, { code: 'se', name: 'Швеция' }, { code: 'ch', name: 'Швейцария' },
  { code: 'at', name: 'Австрия' }, { code: 'it', name: 'Италия' }, { code: 'es', name: 'Испания' },
  { code: 'pt', name: 'Португалия' }, { code: 'br', name: 'Бразилия' }, { code: 'in', name: 'Индия' },
  { code: 'tr', name: 'Турция' }, { code: 'ae', name: 'ОАЭ' }, { code: 'il', name: 'Израиль' },
  { code: 'kz', name: 'Казахстан' }, { code: 'ua', name: 'Украина' }, { code: 'by', name: 'Беларусь' },
  { code: 'cz', name: 'Чехия' }, { code: 'ro', name: 'Румыния' }, { code: 'bg', name: 'Болгария' },
  { code: 'hu', name: 'Венгрия' }, { code: 'no', name: 'Норвегия' }, { code: 'dk', name: 'Дания' },
  { code: 'ie', name: 'Ирландия' }, { code: 'hk', name: 'Гонконг' }, { code: 'tw', name: 'Тайвань' },
  { code: 'th', name: 'Таиланд' }, { code: 'mx', name: 'Мексика' }, { code: 'ar', name: 'Аргентина' },
  { code: 'za', name: 'ЮАР' }, { code: 'ee', name: 'Эстония' }, { code: 'lv', name: 'Латвия' },
  { code: 'lt', name: 'Литва' }, { code: 'md', name: 'Молдова' }, { code: 'ge', name: 'Грузия' },
  { code: 'al', name: 'Албания' }, { code: 'rs', name: 'Сербия' }, { code: 'lu', name: 'Люксембург' },
]

function flagUrl(code: string) {
  return `https://flagcdn.com/24x18/${code}.png`
}

function parseCountries(str: string): Array<{ code: string; name: string }> {
  if (!str) return []
  return str.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const found = COUNTRIES.find(c => s.toLowerCase().includes(c.name.toLowerCase()) || s.toLowerCase().includes(c.code))
    return found || { code: 'xx', name: s }
  })
}

function serializeCountries(items: Array<{ code: string; name: string }>): string {
  return items.map(c => c.name).join(', ')
}

function CountryPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const selected = parseCountries(value)
  const selectedCodes = new Set(selected.map(c => c.code))

  const filtered = COUNTRIES.filter(c =>
    !selectedCodes.has(c.code) &&
    (c.name.toLowerCase().includes(search.toLowerCase()) || c.code.includes(search.toLowerCase()))
  )

  const add = (country: typeof COUNTRIES[0]) => {
    const newList = [...selected, country]
    onChange(serializeCountries(newList))
    setSearch('')
  }

  const remove = (code: string) => {
    const newList = selected.filter(c => c.code !== code)
    onChange(serializeCountries(newList))
  }

  return (
    <div className="space-y-2">
      {/* Selected countries */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(c => (
            <span key={c.code} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                  style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <img src={flagUrl(c.code)} alt={c.code} className="w-4 h-3 rounded-sm object-cover" />
              {c.name}
              <button onClick={() => remove(c.code)} className="ml-0.5 hover:opacity-60" style={{ color: 'var(--text-tertiary)' }}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <input value={search}
               onChange={e => { setSearch(e.target.value); setOpen(true) }}
               onFocus={() => setOpen(true)}
               placeholder="Поиск страны..."
               className="glass-input text-sm w-full" />

        {/* Dropdown */}
        {open && search.length > 0 && filtered.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-xl z-20"
               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
            {filtered.slice(0, 10).map(c => (
              <button key={c.code} onClick={() => { add(c); setOpen(false) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-all hover:bg-white/[0.03]"
                      style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <img src={flagUrl(c.code)} alt={c.code} className="w-5 h-4 rounded-sm object-cover flex-shrink-0" />
                <span style={{ color: 'var(--text-primary)' }}>{c.name}</span>
                <span className="text-[10px] ml-auto" style={{ color: 'var(--text-tertiary)' }}>{c.code.toUpperCase()}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
