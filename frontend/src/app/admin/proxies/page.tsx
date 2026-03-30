'use client'

import { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, Wifi } from 'lucide-react'
import { adminApi } from '@/lib/api'
import type { TelegramProxy } from '@/types'

export default function AdminProxiesPage() {
  const [proxies, setProxies] = useState<TelegramProxy[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<TelegramProxy> | null>(null)
  const [saving, setSaving]   = useState(false)

  const load = () => {
    adminApi.proxies().then(setProxies).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const save = async () => {
    if (!editing?.name) return
    setSaving(true)
    try {
      if (editing.id) {
        await adminApi.updateProxy(editing.id, editing)
      } else {
        await adminApi.createProxy(editing)
      }
      setEditing(null)
      load()
    } catch { alert('Ошибка') } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Удалить прокси?')) return
    await adminApi.deleteProxy(id)
    load()
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Прокси для Telegram</h1>
        <button onClick={() => setEditing({ name: '', isActive: true, sortOrder: 0 })}
                className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      {editing && (
        <div className="glass-card gradient-border animate-scale-in space-y-4">
          <h2 className="font-semibold">{editing.id ? 'Редактировать' : 'Новый прокси'}</h2>

          <input className="glass-input" placeholder="Название"
                 value={editing.name || ''}
                 onChange={e => setEditing({ ...editing, name: e.target.value })} />
          <input className="glass-input" placeholder="Описание"
                 value={editing.description || ''}
                 onChange={e => setEditing({ ...editing, description: e.target.value })} />
          <input className="glass-input" placeholder="TG ссылка (tg://proxy?...)"
                 value={editing.tgLink || ''}
                 onChange={e => setEditing({ ...editing, tgLink: e.target.value })} />
          <input className="glass-input" placeholder="HTTPS ссылка"
                 value={editing.httpsLink || ''}
                 onChange={e => setEditing({ ...editing, httpsLink: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <input className="glass-input" placeholder="Тег"
                   value={editing.tag || ''}
                   onChange={e => setEditing({ ...editing, tag: e.target.value })} />
            <input className="glass-input" placeholder="Порядок" type="number"
                   value={editing.sortOrder ?? 0}
                   onChange={e => setEditing({ ...editing, sortOrder: Number(e.target.value) })} />
          </div>

          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="btn-primary text-sm flex-1">
              {saving ? 'Сохраняю...' : 'Сохранить'}
            </button>
            <button onClick={() => setEditing(null)} className="btn-secondary text-sm">Отмена</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 skeleton rounded-2xl" />)}</div>
      ) : proxies.length === 0 ? (
        <div className="glass-card text-center py-12">
          <Wifi className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <p>Прокси не добавлены</p>
        </div>
      ) : (
        <div className="space-y-3">
          {proxies.map(proxy => (
            <div key={proxy.id} className="glass-card flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                   style={{ background: proxy.isActive ? 'rgba(6,182,212,0.1)' : 'rgba(255,255,255,0.03)' }}>
                <Wifi className="w-5 h-5" style={{ color: proxy.isActive ? 'var(--accent-1)' : 'var(--text-tertiary)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{proxy.name}</p>
                  {proxy.tag && <span className="badge-blue">{proxy.tag}</span>}
                  {!proxy.isActive && <span className="badge-gray">Выключен</span>}
                </div>
                {proxy.description && (
                  <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-tertiary)' }}>{proxy.description}</p>
                )}
              </div>
              <div className="flex gap-1">
                <button onClick={() => setEditing(proxy)} className="p-2 rounded-lg hover:bg-white/5">
                  <Edit2 className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                </button>
                <button onClick={() => remove(proxy.id)} className="p-2 rounded-lg hover:bg-red-500/10">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
