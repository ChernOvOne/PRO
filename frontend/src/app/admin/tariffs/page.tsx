'use client'

import { useEffect, useState } from 'react'
import {
  Plus, Trash2, Edit2, Save, X, Star, Wifi, Calendar,
  Package, Zap, ChevronDown, ChevronUp, Shield,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Squad  { uuid: string; name: string; info: { membersCount: number } }
interface Tariff {
  id: string; name: string; description?: string; type: 'SUBSCRIPTION' | 'TRAFFIC_ADDON'
  durationDays: number; priceRub: number; priceUsdt?: number
  deviceLimit: number; trafficGb?: number; trafficAddonGb?: number
  trafficStrategy: string; isActive: boolean; isFeatured: boolean; sortOrder: number
  remnawaveSquads: string[]; remnawaveTag?: string
}

const EMPTY_SUB: Partial<Tariff> = {
  type: 'SUBSCRIPTION', name: '', durationDays: 30, priceRub: 0,
  deviceLimit: 3, trafficStrategy: 'MONTH', isActive: true,
  isFeatured: false, sortOrder: 0, remnawaveSquads: [],
}
const EMPTY_ADDON: Partial<Tariff> = {
  type: 'TRAFFIC_ADDON', name: '', priceRub: 0, trafficAddonGb: 100,
  isActive: true, sortOrder: 0, remnawaveSquads: [],
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

// ── Form ──────────────────────────────────────────────────────
function TariffForm({ initial, squads, onSave, onCancel }: {
  initial: Partial<Tariff>;
  squads: Squad[];
  onSave: (t: Tariff) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Partial<Tariff>>(initial)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof Tariff, v: any) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const isEdit = !!initial.id
      const payload = { ...form }
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

  const isAddon = form.type === 'TRAFFIC_ADDON'

  return (
    <div className="rounded-3xl bg-white/4 border border-white/8 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{initial.id ? 'Редактировать тариф' : 'Новый тариф'}</h3>
        <button onClick={onCancel} className="p-1.5 rounded-xl hover:bg-white/8 transition-all">
          <X className="w-4 h-4 text-zinc-500" />
        </button>
      </div>

      {/* Type */}
      <div className="flex gap-2">
        {(['SUBSCRIPTION', 'TRAFFIC_ADDON'] as const).map(t => (
          <button key={t} onClick={() => set('type', t)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium
                        border transition-all flex-1 justify-center
                        ${form.type === t
                          ? t === 'SUBSCRIPTION'
                            ? 'bg-violet-500/15 border-violet-500/30 text-violet-300'
                            : 'bg-orange-500/15 border-orange-500/30 text-orange-300'
                          : 'bg-white/4 border-white/8 text-zinc-500 hover:bg-white/8'}`}>
            {t === 'SUBSCRIPTION'
              ? <><Shield className="w-4 h-4" />Подписка</>
              : <><Zap className="w-4 h-4" />Доп. трафик</>}
          </button>
        ))}
      </div>

      {/* Common fields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-600">Название *</label>
          <input value={form.name ?? ''} onChange={e => set('name', e.target.value)}
            placeholder={isAddon ? '+100 ГБ трафика' : 'Базовый · 1 месяц'}
            className="w-full bg-white/4 border border-white/10 rounded-xl px-3 py-2.5
                       text-sm focus:outline-none focus:border-violet-500/40 transition-all" />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-zinc-600">Цена ₽ *</label>
          <input type="number" value={form.priceRub ?? ''} onChange={e => set('priceRub', +e.target.value)}
            className="w-full bg-white/4 border border-white/10 rounded-xl px-3 py-2.5
                       text-sm focus:outline-none focus:border-violet-500/40 transition-all" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-600">Цена USDT</label>
          <input type="number" step="0.01" value={form.priceUsdt ?? ''} onChange={e => set('priceUsdt', +e.target.value || undefined)}
            className="w-full bg-white/4 border border-white/10 rounded-xl px-3 py-2.5
                       text-sm focus:outline-none focus:border-violet-500/40 transition-all" />
        </div>
      </div>

      {/* Subscription fields */}
      {!isAddon && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-zinc-600">Дней *</label>
              <input type="number" value={form.durationDays ?? ''} onChange={e => set('durationDays', +e.target.value)}
                className="w-full bg-white/4 border border-white/10 rounded-xl px-3 py-2.5
                           text-sm focus:outline-none focus:border-violet-500/40 transition-all" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-600">Устройств</label>
              <input type="number" value={form.deviceLimit ?? 3} onChange={e => set('deviceLimit', +e.target.value)}
                className="w-full bg-white/4 border border-white/10 rounded-xl px-3 py-2.5
                           text-sm focus:outline-none focus:border-violet-500/40 transition-all" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-zinc-600">Трафик ГБ (пусто = ∞)</label>
              <input type="number" value={form.trafficGb ?? ''} onChange={e => set('trafficGb', +e.target.value || undefined)}
                className="w-full bg-white/4 border border-white/10 rounded-xl px-3 py-2.5
                           text-sm focus:outline-none focus:border-violet-500/40 transition-all" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-600">Стратегия трафика</label>
              <select value={form.trafficStrategy ?? 'MONTH'} onChange={e => set('trafficStrategy', e.target.value)}
                className="w-full bg-white/4 border border-white/10 rounded-xl px-3 py-2.5
                           text-sm focus:outline-none focus:border-violet-500/40 transition-all">
                <option value="MONTH">MONTH — сброс раз в месяц</option>
                <option value="NO_RESET">NO_RESET — не сбрасывается</option>
                <option value="WEEK">WEEK — сброс раз в неделю</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-600">Tag в Remnawave</label>
            <input value={form.remnawaveTag ?? ''} onChange={e => set('remnawaveTag', e.target.value || undefined)}
              placeholder="premium / basic / ..."
              className="w-full bg-white/4 border border-white/10 rounded-xl px-3 py-2.5
                         text-sm font-mono focus:outline-none focus:border-violet-500/40 transition-all" />
          </div>

          {/* Squads */}
          {squads.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs text-zinc-600">
                Серверные группы Remnawave <span className="text-zinc-700">(activeInternalSquads)</span>
              </label>
              <div className="grid grid-cols-1 gap-2">
                {squads.map(sq => (
                  <label key={sq.uuid} className="flex items-center gap-3 p-3 rounded-xl
                                                  bg-white/3 border border-white/8 cursor-pointer
                                                  hover:bg-white/6 transition-all">
                    <input type="checkbox"
                      checked={(form.remnawaveSquads ?? []).includes(sq.uuid)}
                      onChange={() => toggleSquad(sq.uuid)}
                      className="w-4 h-4 rounded accent-violet-500 shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{sq.name}</div>
                      <div className="text-xs text-zinc-600">{sq.info?.membersCount ?? 0} участников</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Addon fields */}
      {isAddon && (
        <div className="space-y-1">
          <label className="text-xs text-zinc-600">Объём трафика ГБ *</label>
          <input type="number" value={form.trafficAddonGb ?? ''} onChange={e => set('trafficAddonGb', +e.target.value)}
            placeholder="100"
            className="w-full bg-white/4 border border-white/10 rounded-xl px-3 py-2.5
                       text-sm focus:outline-none focus:border-violet-500/40 transition-all" />
        </div>
      )}

      {/* Options */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.isActive ?? true} onChange={e => set('isActive', e.target.checked)}
            className="w-4 h-4 rounded accent-violet-500" />
          <span className="text-sm text-zinc-400">Активен</span>
        </label>
        {!isAddon && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isFeatured ?? false} onChange={e => set('isFeatured', e.target.checked)}
              className="w-4 h-4 rounded accent-amber-400" />
            <span className="text-sm text-zinc-400">Рекомендованный ★</span>
          </label>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold
                     bg-gradient-to-r from-violet-600 to-blue-600 hover:opacity-90 transition-all">
          <Save className="w-4 h-4" />
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
        <button onClick={onCancel}
          className="px-5 py-2.5 rounded-2xl text-sm bg-white/5 hover:bg-white/10
                     border border-white/10 transition-all">
          Отмена
        </button>
      </div>
    </div>
  )
}

// ── Tariff card ───────────────────────────────────────────────
function TariffCard({ tariff, onEdit, onDelete }: {
  tariff: Tariff; onEdit: () => void; onDelete: () => void;
}) {
  const isAddon = tariff.type === 'TRAFFIC_ADDON'
  return (
    <div className={`rounded-3xl border p-5 space-y-3 transition-all
                     ${!tariff.isActive ? 'opacity-50' : ''}
                     ${isAddon
                       ? 'bg-orange-500/5 border-orange-500/15'
                       : 'bg-white/4 border-white/8'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center
                           ${isAddon ? 'bg-orange-500/15' : 'bg-violet-500/15'}`}>
            {isAddon
              ? <Zap className="w-5 h-5 text-orange-400" />
              : <Shield className="w-5 h-5 text-violet-400" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{tariff.name}</span>
              {tariff.isFeatured && <Star className="w-3.5 h-3.5 text-amber-400" fill="currentColor" />}
              {!tariff.isActive && <span className="text-xs text-zinc-600 bg-white/6 px-2 py-0.5 rounded-full">Неактивен</span>}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              {isAddon
                ? `+${tariff.trafficAddonGb} ГБ`
                : `${tariff.durationDays} дн · ${tariff.trafficGb ? tariff.trafficGb + ' ГБ' : '∞'} · ${tariff.deviceLimit} устр.`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={onEdit}
            className="p-2 rounded-xl text-zinc-600 hover:text-zinc-300 hover:bg-white/8 transition-all">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={onDelete}
            className="p-2 rounded-xl text-zinc-700 hover:text-red-400 hover:bg-red-500/10 transition-all">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold">{tariff.priceRub}₽</span>
        {tariff.priceUsdt && <span className="text-sm text-zinc-500">${tariff.priceUsdt}</span>}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────
export default function AdminTariffsPage() {
  const [tariffs, setTariffs] = useState<Tariff[]>([])
  const [squads,  setSquads]  = useState<Squad[]>([])
  const [loading, setLoading] = useState(true)
  const [form,    setForm]    = useState<{ open: boolean; data: Partial<Tariff> }>({ open: false, data: {} })
  const [tab,     setTab]     = useState<'SUBSCRIPTION' | 'TRAFFIC_ADDON'>('SUBSCRIPTION')

  useEffect(() => {
    Promise.all([
      req('GET', '/api/admin/tariffs').then(setTariffs),
      req('GET', '/api/admin/squads').then(d => setSquads(d.squads ?? [])).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const deleteTariff = async (id: string) => {
    if (!confirm('Удалить тариф?')) return
    try {
      await req('DELETE', `/api/admin/tariffs/${id}`)
      setTariffs(t => t.filter(x => x.id !== id))
      toast.success('Удалено')
    } catch { toast.error('Ошибка') }
  }

  const filtered = tariffs.filter(t => t.type === tab)
  const subs     = tariffs.filter(t => t.type === 'SUBSCRIPTION')
  const addons   = tariffs.filter(t => t.type === 'TRAFFIC_ADDON')

  if (loading) return <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 rounded-3xl bg-white/4" />)}</div>

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Тарифы</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {subs.length} подписок · {addons.length} пакетов трафика
          </p>
        </div>
        <button onClick={() => setForm({ open: true, data: tab === 'SUBSCRIPTION' ? { ...EMPTY_SUB } : { ...EMPTY_ADDON } })}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold
                     bg-gradient-to-r from-violet-600 to-blue-600 hover:opacity-90 transition-all">
          <Plus className="w-4 h-4" />
          Добавить
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['SUBSCRIPTION', 'TRAFFIC_ADDON'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium
                        border transition-all
                        ${tab === t
                          ? 'bg-white/10 border-white/20 text-white'
                          : 'bg-white/3 border-white/8 text-zinc-500 hover:bg-white/6'}`}>
            {t === 'SUBSCRIPTION' ? <><Shield className="w-4 h-4" />Подписки</> : <><Zap className="w-4 h-4" />Доп. трафик</>}
            <span className="text-xs opacity-60">
              {t === 'SUBSCRIPTION' ? subs.length : addons.length}
            </span>
          </button>
        ))}
      </div>

      {form.open && (
        <TariffForm
          initial={form.data}
          squads={squads}
          onSave={saved => {
            setTariffs(t => form.data.id
              ? t.map(x => x.id === saved.id ? saved : x)
              : [...t, saved])
            setForm({ open: false, data: {} })
          }}
          onCancel={() => setForm({ open: false, data: {} })}
        />
      )}

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-600 text-sm">
            {tab === 'SUBSCRIPTION' ? 'Нет подписок' : 'Нет пакетов доп. трафика'}
          </div>
        ) : filtered.map(t => (
          <TariffCard key={t.id} tariff={t}
            onEdit={() => setForm({ open: true, data: { ...t } })}
            onDelete={() => deleteTariff(t.id)} />
        ))}
      </div>
    </div>
  )
}
