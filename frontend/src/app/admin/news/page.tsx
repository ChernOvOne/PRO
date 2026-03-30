'use client'

import { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, Eye, EyeOff, Pin } from 'lucide-react'
import { adminApi } from '@/lib/api'
import type { News } from '@/types'

export default function AdminNewsPage() {
  const [news, setNews]         = useState<News[]>([])
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState<Partial<News> | null>(null)
  const [saving, setSaving]     = useState(false)

  const load = () => {
    adminApi.news().then(d => setNews(d.news)).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const save = async () => {
    if (!editing?.title || !editing?.content) return
    setSaving(true)
    try {
      if (editing.id) {
        await adminApi.updateNews(editing.id, editing)
      } else {
        await adminApi.createNews(editing)
      }
      setEditing(null)
      load()
    } catch (err) {
      alert('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Удалить?')) return
    await adminApi.deleteNews(id)
    load()
  }

  const togglePublish = async (item: News) => {
    if (item.isActive) {
      await adminApi.updateNews(item.id, { isActive: false })
    } else {
      await adminApi.publishNews(item.id)
    }
    load()
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Новости и акции</h1>
        <button onClick={() => setEditing({ type: 'NEWS', title: '', content: '', isActive: true, isPinned: false })}
                className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      {/* Editor modal */}
      {editing && (
        <div className="glass-card gradient-border animate-scale-in">
          <h2 className="font-semibold mb-4">{editing.id ? 'Редактировать' : 'Новая запись'}</h2>

          <div className="space-y-4">
            <div className="flex gap-2">
              {(['NEWS', 'PROMOTION'] as const).map(t => (
                <button key={t}
                        onClick={() => setEditing({ ...editing, type: t })}
                        className="px-4 py-2 rounded-xl text-sm transition-all"
                        style={{
                          background: editing.type === t ? 'rgba(6,182,212,0.1)' : 'var(--glass-bg)',
                          border: `1px solid ${editing.type === t ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                        }}>
                  {t === 'NEWS' ? 'Новость' : 'Акция'}
                </button>
              ))}
            </div>

            <input className="glass-input" placeholder="Заголовок"
                   value={editing.title || ''}
                   onChange={e => setEditing({ ...editing, title: e.target.value })} />

            <textarea className="glass-input min-h-[120px] resize-y" placeholder="Содержание (Markdown)"
                      value={editing.content || ''}
                      onChange={e => setEditing({ ...editing, content: e.target.value })} />

            <input className="glass-input" placeholder="URL изображения (необязательно)"
                   value={editing.imageUrl || ''}
                   onChange={e => setEditing({ ...editing, imageUrl: e.target.value })} />

            {editing.type === 'PROMOTION' && (
              <div className="grid grid-cols-2 gap-3">
                <input className="glass-input" placeholder="Промокод"
                       value={editing.discountCode || ''}
                       onChange={e => setEditing({ ...editing, discountCode: e.target.value })} />
                <input className="glass-input" placeholder="Скидка %" type="number"
                       value={editing.discountPct || ''}
                       onChange={e => setEditing({ ...editing, discountPct: Number(e.target.value) || undefined })} />
              </div>
            )}

            <input className="glass-input" placeholder="Ссылка на подробности (URL, необязательно)"
                   value={(editing.buttons && Array.isArray(editing.buttons) && editing.buttons[0]?.url) || ''}
                   onChange={e => {
                     const url = e.target.value
                     setEditing({
                       ...editing,
                       buttons: url ? [{ label: 'Подробнее', url, style: 'primary' }] : [],
                     })
                   }} />

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox"
                       checked={editing.isPinned || false}
                       onChange={e => setEditing({ ...editing, isPinned: e.target.checked })}
                       className="w-4 h-4 rounded" />
                <span className="text-sm">Закрепить</span>
              </label>
            </div>

            <div className="flex gap-2">
              <button onClick={save} disabled={saving} className="btn-primary text-sm flex-1">
                {saving ? 'Сохраняю...' : 'Сохранить'}
              </button>
              <button onClick={() => setEditing(null)} className="btn-secondary text-sm">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 skeleton rounded-2xl" />)}
        </div>
      ) : news.length === 0 ? (
        <div className="glass-card text-center py-12">
          <p style={{ color: 'var(--text-tertiary)' }}>Нет записей</p>
        </div>
      ) : (
        <div className="space-y-3">
          {news.map(item => (
            <div key={item.id} className="glass-card flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={item.type === 'PROMOTION' ? 'badge-violet' : 'badge-blue'}>
                    {item.type === 'PROMOTION' ? 'Акция' : 'Новость'}
                  </span>
                  {item.isPinned && <Pin className="w-3 h-3" style={{ color: 'var(--accent-1)' }} />}
                  {!item.isActive && <span className="badge-gray">Скрыто</span>}
                </div>
                <p className="font-medium truncate">{item.title}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {new Date(item.publishedAt).toLocaleDateString('ru')}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button onClick={() => togglePublish(item)}
                        className="p-2 rounded-lg hover:bg-white/5 transition-all"
                        title={item.isActive ? 'Скрыть' : 'Опубликовать'}>
                  {item.isActive
                    ? <EyeOff className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                    : <Eye className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />}
                </button>
                <button onClick={() => setEditing(item)}
                        className="p-2 rounded-lg hover:bg-white/5 transition-all">
                  <Edit2 className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                </button>
                <button onClick={() => remove(item.id)}
                        className="p-2 rounded-lg hover:bg-red-500/10 transition-all">
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
