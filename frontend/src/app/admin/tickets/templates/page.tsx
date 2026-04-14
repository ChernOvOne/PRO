'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Edit, Trash2, Zap, X, Loader2, Save } from 'lucide-react'
import toast from 'react-hot-toast'

type TicketCategory = 'BILLING' | 'TECH' | 'REFUND' | 'SUBSCRIPTION' | 'OTHER'

interface Template {
  id: string
  name: string
  shortcut?: string | null
  body: string
  category?: TicketCategory | null
  sortOrder: number
}

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  BILLING: '💰 Платежи',
  TECH: '🔧 Техника',
  REFUND: '↩️ Возврат',
  SUBSCRIPTION: '📱 Подписка',
  OTHER: '❓ Другое',
}

const VARIABLES = [
  { tag: '{{user.name}}', desc: 'Имя клиента (Telegram/email)' },
  { tag: '{{user.email}}', desc: 'Email клиента' },
  { tag: '{{tariff.name}}', desc: 'Текущий тариф' },
  { tag: '{{subscription.expireAt}}', desc: 'Дата окончания подписки' },
]

export default function TicketTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<Template> | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/tickets/templates', { credentials: 'include' })
      if (res.ok) setTemplates(await res.json())
    } catch {
      toast.error('Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!editing || !editing.name?.trim() || !editing.body?.trim()) {
      toast.error('Заполните название и текст')
      return
    }
    const isNew = !editing.id
    try {
      const res = await fetch(
        isNew ? '/api/admin/tickets/templates' : `/api/admin/tickets/templates/${editing.id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editing.name,
            body: editing.body,
            shortcut: editing.shortcut || null,
            category: editing.category || null,
            sortOrder: editing.sortOrder ?? 0,
          }),
        },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Ошибка')
        return
      }
      toast.success(isNew ? 'Шаблон создан' : 'Сохранено')
      setEditing(null)
      load()
    } catch {
      toast.error('Ошибка сети')
    }
  }

  const del = async (id: string) => {
    if (!confirm('Удалить шаблон?')) return
    try {
      const res = await fetch(`/api/admin/tickets/templates/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error()
      toast.success('Удалено')
      load()
    } catch {
      toast.error('Ошибка')
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/tickets"
            className="p-2 rounded-lg transition hover:bg-white/[0.05]"
            style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Zap className="w-6 h-6" />
              Шаблоны ответов
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Используются в быстром ответе клиентам
            </p>
          </div>
        </div>
        <button
          onClick={() => setEditing({ name: '', body: '', sortOrder: (templates.at(-1)?.sortOrder || 0) + 1 })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition"
          style={{ background: 'var(--accent-1)', color: '#fff' }}
        >
          <Plus className="w-4 h-4" />
          Новый шаблон
        </button>
      </div>

      {/* Variables hint */}
      <div className="glass-card rounded-2xl p-4">
        <h3 className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-tertiary)' }}>
          Переменные в шаблонах
        </h3>
        <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
          Подставляются автоматически при вставке шаблона в ответ
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {VARIABLES.map(v => (
            <div key={v.tag} className="text-xs flex items-center gap-2">
              <code className="px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--accent-1)' }}>
                {v.tag}
              </code>
              <span style={{ color: 'var(--text-tertiary)' }}>{v.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* List */}
      {loading && <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>Загрузка...</div>}
      {!loading && templates.length === 0 && (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Zap className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
          <p style={{ color: 'var(--text-primary)' }}>Нет шаблонов</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Создайте первый, чтобы быстрее отвечать клиентам
          </p>
        </div>
      )}
      <div className="space-y-2">
        {templates.map(t => (
          <div key={t.id} className="glass-card rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t.name}</span>
                  {t.shortcut && (
                    <code className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--accent-1)' }}>
                      /{t.shortcut}
                    </code>
                  )}
                  {t.category && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
                      {CATEGORY_LABELS[t.category]}
                    </span>
                  )}
                </div>
                <p
                  className="text-xs whitespace-pre-wrap"
                  style={{ color: 'var(--text-tertiary)', maxHeight: '60px', overflow: 'hidden' }}
                >
                  {t.body}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setEditing(t)}
                  className="p-2 rounded-lg transition hover:bg-white/[0.05]"
                  style={{ color: 'var(--text-secondary)' }}
                  title="Редактировать"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => del(t.id)}
                  className="p-2 rounded-lg transition hover:bg-white/[0.05]"
                  style={{ color: '#f87171' }}
                  title="Удалить"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setEditing(null)}
        >
          <div
            className="glass-card rounded-2xl p-5 space-y-4 w-full max-w-2xl my-8"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {editing.id ? 'Редактировать шаблон' : 'Новый шаблон'}
              </h3>
              <button onClick={() => setEditing(null)} className="p-1" style={{ color: 'var(--text-tertiary)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>
                  Название <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input
                  value={editing.name || ''}
                  onChange={e => setEditing(prev => prev ? { ...prev, name: e.target.value } : null)}
                  placeholder="Напр. Извинения за задержку"
                  className="glass-input w-full px-3 py-2 text-sm rounded-xl"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>
                  Шорткат (опц.)
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-sm px-2" style={{ color: 'var(--text-tertiary)' }}>/</span>
                  <input
                    value={editing.shortcut || ''}
                    onChange={e => setEditing(prev => prev ? { ...prev, shortcut: e.target.value.replace(/[^a-z0-9_]/g, '') } : null)}
                    placeholder="izvin"
                    className="glass-input flex-1 px-3 py-2 text-sm rounded-xl"
                    maxLength={30}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Категория</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setEditing(prev => prev ? { ...prev, category: null } : null)}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium transition"
                  style={{
                    background: !editing.category ? 'var(--accent-1)' : 'var(--surface-2)',
                    color: !editing.category ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  Любая
                </button>
                {(Object.keys(CATEGORY_LABELS) as TicketCategory[]).map(c => (
                  <button
                    key={c}
                    onClick={() => setEditing(prev => prev ? { ...prev, category: c } : null)}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium transition text-left truncate"
                    style={{
                      background: editing.category === c ? 'var(--accent-1)' : 'var(--surface-2)',
                      color: editing.category === c ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>
                Текст ответа <span style={{ color: '#f87171' }}>*</span>
              </label>
              <textarea
                value={editing.body || ''}
                onChange={e => setEditing(prev => prev ? { ...prev, body: e.target.value } : null)}
                placeholder={'Здравствуйте, {{user.name}}!\n\nПриносим извинения за задержку...'}
                rows={8}
                className="glass-input w-full px-3 py-2 text-sm rounded-xl resize-none font-mono"
                maxLength={5000}
              />
              <div className="mt-1 flex gap-1 flex-wrap">
                {VARIABLES.map(v => (
                  <button
                    key={v.tag}
                    onClick={() => {
                      setEditing(prev => prev ? { ...prev, body: (prev.body || '') + v.tag } : null)
                    }}
                    className="text-xs px-2 py-0.5 rounded-full transition hover:brightness-110"
                    style={{ background: 'var(--surface-2)', color: 'var(--accent-1)' }}
                  >
                    {v.tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium transition"
                style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}
              >
                Отмена
              </button>
              <button
                onClick={save}
                className="px-4 py-2 rounded-xl text-sm font-medium transition inline-flex items-center gap-2"
                style={{ background: 'var(--accent-1)', color: '#fff' }}
              >
                <Save className="w-4 h-4" />
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
