'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, Loader2, Monitor,
         Apple, Smartphone, Router, HelpCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const DEVICES = ['WINDOWS','MACOS','LINUX','IOS','ANDROID','ROUTER','OTHER']
const DEVICE_LABELS: Record<string,string> = {
  WINDOWS:'Windows',MACOS:'macOS',LINUX:'Linux',
  IOS:'iOS',ANDROID:'Android',ROUTER:'Роутер',OTHER:'Другое',
}
const DEVICE_ICONS: Record<string,any> = {
  WINDOWS:Monitor,MACOS:Apple,LINUX:Monitor,
  IOS:Smartphone,ANDROID:Smartphone,ROUTER:Router,OTHER:HelpCircle,
}

interface Instruction {
  id:string; title:string; deviceType:string; content:string
  sortOrder:number; isActive:boolean
}

const EMPTY = { title:'', deviceType:'IOS', content:'', sortOrder:0, isActive:true }

export default function AdminInstructions() {
  const [items, setItems]     = useState<Instruction[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<'create'|'edit'|null>(null)
  const [editing, setEditing] = useState<Partial<Instruction>>(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [filterDev, setFilterDev] = useState('')

  const load = () =>
    fetch('/api/admin/instructions', { credentials:'include' })
      .then(r=>r.json()).then(d=>{setItems(d);setLoading(false)})

  useEffect(()=>{load()},[])

  const openCreate = () => { setEditing(EMPTY); setModal('create') }
  const openEdit   = (i: Instruction) => { setEditing(i); setModal('edit') }
  const close      = () => { setModal(null); setEditing(EMPTY) }
  const F = (k: string, v: any) => setEditing(e=>({...e,[k]:v}))

  const save = async () => {
    setSaving(true)
    try {
      const url    = modal==='edit' ? `/api/admin/instructions/${editing.id}` : '/api/admin/instructions'
      const method = modal==='edit' ? 'PUT' : 'POST'
      const res    = await fetch(url,{
        method, credentials:'include',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(editing),
      })
      if(!res.ok) throw new Error()
      toast.success('Сохранено')
      close(); load()
    } catch { toast.error('Ошибка сохранения') }
    finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if(!confirm('Удалить инструкцию?')) return
    await fetch(`/api/admin/instructions/${id}`,{method:'DELETE',credentials:'include'})
    toast.success('Удалено'); load()
  }

  const filtered = filterDev ? items.filter(i=>i.deviceType===filterDev) : items

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Инструкции</h1>
          <p className="text-gray-400 text-sm mt-0.5">{items.length} инструкций</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      {/* Device filter */}
      <div className="flex flex-wrap gap-2">
        <button onClick={()=>setFilterDev('')}
                className={`px-3 py-1.5 rounded-xl text-sm border transition-all
                            ${!filterDev ? 'bg-brand-600/20 border-brand-500/40 text-brand-300' : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}>
          Все
        </button>
        {DEVICES.map(d => {
          const Icon = DEVICE_ICONS[d]
          return (
            <button key={d} onClick={()=>setFilterDev(d)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border transition-all
                                ${filterDev===d ? 'bg-brand-600/20 border-brand-500/40 text-brand-300' : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}>
              <Icon className="w-3.5 h-3.5" />{DEVICE_LABELS[d]}
            </button>
          )
        })}
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading ? [...Array(4)].map((_,i)=><div key={i} className="h-16 skeleton rounded-2xl" />) :
          filtered.map(ins => {
            const Icon = DEVICE_ICONS[ins.deviceType] || HelpCircle
            return (
              <div key={ins.id} className={`card flex items-center gap-4 ${!ins.isActive?'opacity-50':''}`}>
                <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{ins.title}</p>
                  <p className="text-xs text-gray-500">{DEVICE_LABELS[ins.deviceType]} · порядок #{ins.sortOrder}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>openEdit(ins)}
                          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-xl transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={()=>del(ins.id)}
                          className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })
        }
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 " onClick={close} />
          <div className="relative w-full max-w-2xl card space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">
                {modal==='edit' ? 'Редактировать' : 'Новая инструкция'}
              </h2>
              <button onClick={close} className="text-gray-500 hover:text-white"><X className="w-5 h-5"/></button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <label className="text-sm text-gray-400">Заголовок</label>
                <input className="input" value={editing.title||''} onChange={e=>F('title',e.target.value)}
                       placeholder="Подключение на iPhone" />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-400">Устройство</label>
                <select className="input" value={editing.deviceType||'IOS'}
                        onChange={e=>F('deviceType',e.target.value)}>
                  {DEVICES.map(d=><option key={d} value={d}>{DEVICE_LABELS[d]}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-400">Порядок отображения</label>
                <input type="number" className="input" value={editing.sortOrder||0}
                       onChange={e=>F('sortOrder',+e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-sm text-gray-400">
                  Содержимое <span className="text-gray-600">(Markdown)</span>
                </label>
                <textarea
                  className="input min-h-[260px] font-mono text-sm"
                  value={editing.content||''}
                  onChange={e=>F('content',e.target.value)}
                  placeholder="## Шаг 1&#10;Скачай приложение Streisand...&#10;&#10;## Шаг 2&#10;Вставь ссылку-подписку..."
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer col-span-2">
                <input type="checkbox" className="w-4 h-4 accent-brand-500"
                       checked={!!editing.isActive} onChange={e=>F('isActive',e.target.checked)} />
                <span className="text-sm text-gray-300">Активна (видна пользователям)</span>
              </label>
            </div>

            <div className="flex gap-3">
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
