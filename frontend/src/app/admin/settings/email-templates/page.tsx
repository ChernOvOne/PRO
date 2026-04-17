'use client'

/**
 * Email Templates editor — admin customizes HTML body of each system email
 * (welcome, verification, payment, etc). Templates support variables like
 * {code}, {appName}, {tariffName} substituted at send time.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Save, RotateCcw, Send, Eye, Code,
  CheckCircle2, Circle, Mail,
} from 'lucide-react'
import { adminApi } from '@/lib/api'
import { useBrand } from '@/hooks/useBrand'

interface Template {
  key: string
  name: string
  description: string
  vars: string[]
  customized: boolean
  value: string
  defaultValue: string
}

export default function EmailTemplatesPage() {
  const brand = useBrand()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading]     = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [draft, setDraft]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [testing, setTesting]     = useState(false)
  const [view, setView]           = useState<'edit' | 'preview'>('edit')

  const load = async () => {
    try {
      const list = await adminApi.listEmailTemplates()
      setTemplates(list)
      if (!selectedKey && list.length > 0) {
        setSelectedKey(list[0].key)
        setDraft(list[0].value)
      }
    } catch { toast.error('Ошибка загрузки') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const selected = templates.find(t => t.key === selectedKey)

  const selectTemplate = (key: string) => {
    const t = templates.find(x => x.key === key)
    if (!t) return
    setSelectedKey(key)
    setDraft(t.value)
    setView('edit')
  }

  const save = async () => {
    if (!selectedKey) return
    setSaving(true)
    try {
      await adminApi.saveEmailTemplate(selectedKey, draft)
      toast.success('Шаблон сохранён')
      await load()
    } catch { toast.error('Ошибка сохранения') }
    finally { setSaving(false) }
  }

  const reset = async () => {
    if (!selectedKey) return
    if (!confirm('Сбросить шаблон к дефолтному?')) return
    try {
      await adminApi.resetEmailTemplate(selectedKey)
      toast.success('Сброшено')
      await load()
      const t = templates.find(x => x.key === selectedKey)
      if (t) setDraft(t.defaultValue)
    } catch { toast.error('Ошибка') }
  }

  const test = async () => {
    if (!selectedKey || !testEmail) return
    setTesting(true)
    try {
      const saved = draft !== selected?.value
      if (saved) await adminApi.saveEmailTemplate(selectedKey, draft)
      await adminApi.testEmailTemplate(selectedKey, testEmail)
      toast.success(`Тест отправлен на ${testEmail}`)
    } catch { toast.error('Ошибка отправки') }
    finally { setTesting(false) }
  }

  const insertVar = (v: string) => {
    const ta = document.getElementById('tpl-editor') as HTMLTextAreaElement | null
    if (!ta) return
    const pos = ta.selectionStart
    const before = draft.slice(0, pos)
    const after = draft.slice(ta.selectionEnd)
    setDraft(`${before}{${v}}${after}`)
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = pos + v.length + 2 }, 10)
  }

  // Preview: substitute sample data
  const renderPreview = (html: string) => {
    const sample: Record<string, string> = {
      appName: brand.app_name || 'HIDEYOU',
      appUrl: typeof window !== 'undefined' ? window.location.origin : '',
      code: '123456', tariffName: 'Pro-тариф',
      expireAt: new Date().toLocaleDateString('ru-RU'),
      daysLeft: '3', senderName: 'Иван', giftCode: 'GIFT-XYZ',
      trialDays: '3', email: 'user@example.com', password: 'test1234',
      oldEmail: 'old@example.com', newEmail: 'new@example.com',
    }
    let result = html
    for (const [k, v] of Object.entries(sample)) {
      result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), v)
    }
    return result
  }

  if (loading) return <div className="p-8">Загрузка...</div>

  return (
    <div className="admin-layout">
      <Link href="/admin/settings" className="inline-flex items-center gap-2 text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>
        <ArrowLeft className="w-4 h-4" /> Назад к настройкам
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Mail className="w-6 h-6" style={{ color: 'var(--accent-1)' }} />
          Шаблоны email-писем
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Настройте HTML-содержимое каждого системного письма.
          Переменные в фигурных скобках (например <code>{'{code}'}</code>) подставляются автоматически при отправке.
        </p>
      </div>

      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        {/* Left: list of templates */}
        <div className="space-y-1.5" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
          {templates.map(t => (
            <button key={t.key} onClick={() => selectTemplate(t.key)}
                    className="w-full text-left p-3 rounded-xl transition-all"
                    style={{
                      background: selectedKey === t.key ? 'var(--surface-2)' : 'var(--surface-1)',
                      border: `1px solid ${selectedKey === t.key ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                    }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{t.name}</span>
                {t.customized
                  ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent-1)' }} />
                  : <Circle className="w-3.5 h-3.5 flex-shrink-0 opacity-30" style={{ color: 'var(--text-tertiary)' }} />
                }
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t.description}</div>
            </button>
          ))}
          <div className="p-2 text-[10px] flex items-center gap-1.5 mt-2" style={{ color: 'var(--text-tertiary)' }}>
            <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--accent-1)' }} /> — изменён вами
          </div>
        </div>

        {/* Right: editor/preview */}
        {selected ? (
          <div className="space-y-4">
            <div className="glass-card">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{selected.name}</h2>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{selected.description}</p>
                </div>
                <div className="flex rounded-lg p-0.5" style={{ background: 'var(--surface-2)' }}>
                  <button onClick={() => setView('edit')}
                          className="px-3 py-1 rounded text-xs flex items-center gap-1"
                          style={{ background: view === 'edit' ? 'var(--surface-1)' : 'transparent', color: 'var(--text-primary)' }}>
                    <Code className="w-3.5 h-3.5" /> Код
                  </button>
                  <button onClick={() => setView('preview')}
                          className="px-3 py-1 rounded text-xs flex items-center gap-1"
                          style={{ background: view === 'preview' ? 'var(--surface-1)' : 'transparent', color: 'var(--text-primary)' }}>
                    <Eye className="w-3.5 h-3.5" /> Превью
                  </button>
                </div>
              </div>

              {/* Variables chip list */}
              {selected.vars.length > 0 && (
                <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--glass-border)' }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
                    Доступные переменные — клик, чтобы вставить
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.vars.map(v => (
                      <button key={v} onClick={() => insertVar(v)}
                              className="px-2 py-1 rounded-lg text-[11px] font-mono"
                              style={{ background: 'rgba(6,182,212,0.15)', color: 'var(--accent-1)', border: '1px solid rgba(6,182,212,0.25)' }}>
                        {'{' + v + '}'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Editor / Preview */}
            {view === 'edit' ? (
              <div className="glass-card">
                <textarea id="tpl-editor" value={draft} onChange={e => setDraft(e.target.value)}
                          className="w-full font-mono text-[12px] leading-relaxed"
                          style={{
                            minHeight: '420px', outline: 'none',
                            background: 'var(--surface-0)', border: '1px solid var(--glass-border)',
                            borderRadius: '10px', padding: '14px', color: 'var(--text-primary)', resize: 'vertical',
                          }} />
              </div>
            ) : (
              <div className="glass-card p-0 overflow-hidden">
                <iframe srcDoc={`<!DOCTYPE html><html><head><style>
                    body { font-family: -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; margin: 0; }
                    h2 { color: #f1f5f9; margin-top: 0; }
                    p { color: #94a3b8; line-height: 1.6; }
                    .btn { display: inline-block; background: #5569ff; color: #fff !important; padding: 12px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 16px; }
                  </style></head><body>${renderPreview(draft)}</body></html>`}
                  className="w-full" style={{ height: '500px', border: 'none', background: '#0f172a', borderRadius: '10px' }} />
              </div>
            )}

            {/* Actions */}
            <div className="glass-card flex items-center gap-3 flex-wrap">
              <button onClick={save} disabled={saving}
                      className="btn-primary text-sm disabled:opacity-50">
                <Save className="w-4 h-4" /> {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
              {selected.customized && (
                <button onClick={reset} className="btn-secondary text-sm">
                  <RotateCcw className="w-4 h-4" /> Сбросить к дефолту
                </button>
              )}

              <div className="flex-1 min-w-[260px] flex items-center gap-2">
                <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
                       placeholder="your@email.com"
                       className="flex-1 px-3 py-2 rounded-xl text-sm"
                       style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                <button onClick={test} disabled={testing || !testEmail}
                        className="btn-secondary text-sm disabled:opacity-50">
                  <Send className="w-4 h-4" /> {testing ? 'Отправка...' : 'Тест'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center p-12" style={{ color: 'var(--text-tertiary)' }}>Выберите шаблон слева</div>
        )}
      </div>
    </div>
  )
}
