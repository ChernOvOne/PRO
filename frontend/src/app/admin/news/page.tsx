'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, Edit2, Trash2, Eye, EyeOff, Pin, Upload, X, Image as ImageIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '@/lib/api'
import { RichEditor } from '@/components/RichEditor'
import { ImageFocusPicker } from '@/components/ImageFocusPicker'
import type { News } from '@/types'

export default function AdminNewsPage() {
  const [news, setNews]         = useState<News[]>([])
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState<Partial<News> | null>(null)
  const [saving, setSaving]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    } catch {
      toast.error('Ошибка сохранения')
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
    if (item.isActive) await adminApi.updateNews(item.id, { isActive: false })
    else await adminApi.publishNews(item.id)
    load()
  }

  const uploadCoverImage = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await adminApi.uploadFile(fd)
      if (res.ok && res.url) {
        setEditing(prev => prev ? { ...prev, imageUrl: res.url } : prev)
        toast.success('Изображение загружено')
      } else throw new Error()
    } catch { toast.error('Ошибка загрузки') }
    finally { setUploading(false) }
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
        <div className="glass-card animate-scale-in">
          <h2 className="font-semibold mb-4">{editing.id ? 'Редактировать' : 'Новая запись'}</h2>

          <div className="space-y-4">
            {/* Type toggle */}
            <div className="flex gap-2">
              {(['NEWS', 'PROMOTION'] as const).map(t => (
                <button key={t} onClick={() => setEditing({ ...editing, type: t })}
                        className="px-4 py-2 rounded-xl text-sm transition-all"
                        style={{
                          background: editing.type === t ? 'rgba(6,182,212,0.1)' : 'var(--glass-bg)',
                          border: `1px solid ${editing.type === t ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                        }}>
                  {t === 'NEWS' ? '📰 Новость' : '🎁 Акция'}
                </button>
              ))}
            </div>

            {/* Title */}
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
                Заголовок
              </label>
              <input className="glass-input" placeholder="Заголовок новости..."
                     value={editing.title || ''}
                     onChange={e => setEditing({ ...editing, title: e.target.value })} />
            </div>

            {/* Cover image */}
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
                Обложка (необязательно)
              </label>
              {editing.imageUrl ? (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <button onClick={() => setEditing({ ...editing, imageUrl: '', imageFocus: undefined, imageAspect: undefined })}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
                            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <X className="w-3.5 h-3.5" /> Удалить картинку
                    </button>
                  </div>
                  <ImageFocusPicker
                    imageUrl={editing.imageUrl}
                    focus={(editing as any).imageFocus || '50% 50%'}
                    aspect={(editing as any).imageAspect || '16/9'}
                    onFocusChange={v => setEditing({ ...editing, imageFocus: v } as any)}
                    onAspectChange={v => setEditing({ ...editing, imageAspect: v } as any)}
                  />
                </div>
              ) : (
                <div className="flex gap-2">
                  <input className="glass-input flex-1" placeholder="URL изображения (https://...)"
                         value={editing.imageUrl || ''}
                         onChange={e => setEditing({ ...editing, imageUrl: e.target.value })} />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                          className="btn-secondary text-sm px-4 disabled:opacity-60">
                    <Upload className="w-4 h-4" /> {uploading ? 'Загрузка...' : 'Файл'}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                         onChange={e => {
                           const f = e.target.files?.[0]
                           if (f) uploadCoverImage(f)
                           e.target.value = ''
                         }} />
                </div>
              )}
            </div>

            {/* Content — rich editor */}
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
                Текст новости
              </label>
              <RichEditor
                value={editing.content || ''}
                onChange={(html) => setEditing({ ...editing, content: html })}
                placeholder="Напишите текст новости. Используйте панель инструментов для форматирования, вставки ссылок и картинок."
                minHeight={280}
              />
            </div>

            {/* Promo-specific */}
            {editing.type === 'PROMOTION' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Промокод</label>
                  <input className="glass-input" placeholder="SUMMER20"
                         value={editing.discountCode || ''}
                         onChange={e => setEditing({ ...editing, discountCode: e.target.value.toUpperCase() })} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Скидка %</label>
                  <input className="glass-input" placeholder="20" type="number"
                         value={editing.discountPct || ''}
                         onChange={e => setEditing({ ...editing, discountPct: Number(e.target.value) || undefined })} />
                </div>
              </div>
            )}

            {/* Link button */}
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
                Кнопка «Подробнее» (необязательно)
              </label>
              <input className="glass-input" placeholder="https://..."
                     value={(Array.isArray(editing.buttons) && editing.buttons[0]?.url) || ''}
                     onChange={e => {
                       const url = e.target.value
                       setEditing({
                         ...editing,
                         buttons: url ? [{ label: 'Подробнее', url, style: 'primary' }] : [],
                       })
                     }} />
            </div>

            {/* Pin */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editing.isPinned || false}
                     onChange={e => setEditing({ ...editing, isPinned: e.target.checked })}
                     className="w-4 h-4 rounded" />
              <span className="text-sm">📌 Закрепить вверху</span>
            </label>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button onClick={save} disabled={saving || !editing.title || !editing.content}
                      className="btn-primary text-sm flex-1 disabled:opacity-50">
                {saving ? 'Сохранение...' : 'Сохранить'}
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
          <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: 'var(--text-tertiary)' }} />
          <p style={{ color: 'var(--text-tertiary)' }}>Пока нет записей</p>
        </div>
      ) : (
        <div className="space-y-3">
          {news.map(item => (
            <div key={item.id} className="glass-card flex items-center gap-4">
              {item.imageUrl && (
                <img src={item.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                     style={{ background: 'var(--surface-2)' }} />
              )}
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
