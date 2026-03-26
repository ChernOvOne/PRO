'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Star, X, Loader2, Package } from 'lucide-react'
import toast from 'react-hot-toast'

interface Tariff {
  id: string; name: string; description?: string
  durationDays: number; priceRub: number; priceUsdt?: number
  deviceLimit: number; trafficGb?: number
  isFeatured: boolean; sortOrder: number; isActive: boolean
  remnawaveTagIds: string[]
}

const EMPTY: Omit<Tariff,'id'> = {
  name:'', description:'', durationDays:30, priceRub:299, priceUsdt:undefined,
  deviceLimit:3, trafficGb:undefined, isFeatured:false, sortOrder:0,
  isActive:true, remnawaveTagIds:[],
}

export default function AdminTariffs() {
  const [tariffs, setTariffs]   = useState<Tariff[]>([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState<'create'|'edit'|null>(null)
  const [editing, setEditing]   = useState<Partial<Tariff>>(EMPTY)
  const [saving, setSaving]     = useState(false)

  const load = () => {
    fetch('/api/admin/tariffs', { credentials: 'include' })
      .then(r => r.json()).then(d => { setTariffs(d); setLoading(false) })
  }
  useEffect(load, [])

  const openCreate = () => { setEditing(EMPTY); setModal('create') }
  const openEdit   = (t: Tariff) => { setEditing(t); setModal('edit') }
  const close      = () => { setModal(null); setEditing(EMPTY) }

  const save = async () => {
    setSaving(true)
    try {
      const url    = modal === 'edit' ? `/api/admin/tariffs/${editing.id}` : '/api/admin/tariffs'
      const method = modal === 'edit' ? 'PUT' : 'POST'
      const res    = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      })
      if (!res.ok) throw new Error('Ошибка сохранения')
      toast.success(modal === 'edit' ? 'Тариф обновлён' : 'Тариф создан')
      close(); load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('Архивировать тариф?')) return
    await fetch(`/api/admin/tariffs/${id}`, { method:'DELETE', credentials:'include' })
    toast.success('Тариф архивирован')
    load()
  }

  const F = (k: keyof typeof EMPTY, v: any) => setEditing(e => ({ ...e, [k]: v }))

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Тарифы</h1>
          <p className="text-gray-400 text-sm mt-0.5">{tariffs.length} тарифов</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> Добавить тариф
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_,i) => <div key={i} className="h-20 skeleton rounded-2xl" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {tariffs.map(t => (
            <div key={t.id}
                 className={`card flex items-center gap-4 transition-colors
                             ${!t.isActive ? 'opacity-50' : ''}`}>
              <div className="w-10 h-10 rounded-xl bg-brand-600/15 flex items-center
                              justify-center flex-shrink-0">
                <Package className="w-5 h-5 text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{t.name}</p>
                  {t.isFeatured && (
                    <span className="badge bg-amber-500/15 text-amber-400">
                      <Star className="w-3 h-3 mr-1" />Популярный
                    </span>
                  )}
                  {!t.isActive && <span className="badge-gray">Архив</span>}
                </div>
                <p className="text-sm text-gray-400">
                  {t.durationDays} дн. · {t.priceRub.toLocaleString('ru')} ₽
                  {t.priceUsdt ? ` / $${t.priceUsdt}` : ''}
                  {' · '}{t.deviceLimit} уст. · {t.trafficGb ? `${t.trafficGb} ГБ` : 'безлимит'}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(t)}
                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-xl transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => del(t.id)}
                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
          <div className="relative w-full max-w-lg card space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">
                {modal === 'edit' ? 'Редактировать тариф' : 'Новый тариф'}
              </h2>
              <button onClick={close} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <label className="text-sm text-gray-400">Название</label>
                <input className="input" value={editing.name||''} onChange={e=>F('name',e.target.value)} placeholder="Месяц" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-sm text-gray-400">Описание</label>
                <input className="input" value={editing.description||''} onChange={e=>F('description',e.target.value)} placeholder="Для новичков" />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-400">Дней</label>
                <input type="number" className="input" value={editing.durationDays||''} onChange={e=>F('durationDays',+e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-400">Цена (₽)</label>
                <input type="number" className="input" value={editing.priceRub||''} onChange={e=>F('priceRub',+e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-400">Цена (USDT)</label>
                <input type="number" step="0.1" className="input" value={editing.priceUsdt||''} onChange={e=>F('priceUsdt',e.target.value?+e.target.value:undefined)} placeholder="Опционально" />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-400">Устройств</label>
                <input type="number" className="input" value={editing.deviceLimit||3} onChange={e=>F('deviceLimit',+e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-400">Трафик (ГБ)</label>
                <input type="number" className="input" value={editing.trafficGb||''} onChange={e=>F('trafficGb',e.target.value?+e.target.value:undefined)} placeholder="Пусто = безлимит" />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-400">Порядок</label>
                <input type="number" className="input" value={editing.sortOrder||0} onChange={e=>F('sortOrder',+e.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-brand-500"
                       checked={!!editing.isFeatured}
                       onChange={e=>F('isFeatured',e.target.checked)} />
                <span className="text-sm text-gray-300">Популярный</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-brand-500"
                       checked={!!editing.isActive}
                       onChange={e=>F('isActive',e.target.checked)} />
                <span className="text-sm text-gray-300">Активен</span>
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={close} className="btn-secondary flex-1 justify-center">Отмена</button>
              <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
