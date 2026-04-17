'use client'

import { useEffect, useState } from 'react'
import { Save, Plus, Trash2, Globe } from 'lucide-react'
import { adminApi } from '@/lib/api'

const SECTIONS = [
  { key: 'hero', label: 'Hero секция', fields: ['title', 'subtitle', 'ctaText'] },
  { key: 'features', label: 'Преимущества', type: 'json' },
  { key: 'faq', label: 'Частые вопросы', type: 'json-array', itemFields: ['q', 'a'] },
  { key: 'reviews', label: 'Отзывы', type: 'json-array', itemFields: ['name', 'text', 'rating'] },
  { key: 'tariffIds', label: 'Тарифы на лендинге', type: 'text' },
  { key: 'privacy', label: 'Политика конфиденциальности', type: 'textarea' },
  { key: 'terms', label: 'Условия использования', type: 'textarea' },
]

export default function AdminLandingPage() {
  const [data, setData]       = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('hero')

  useEffect(() => {
    adminApi.landingSections()
      .then(sections => {
        const parsed: Record<string, any> = {}
        for (const s of sections) {
          const key = s.key.replace('landing.', '')
          try { parsed[key] = JSON.parse(s.value) } catch { parsed[key] = s.value }
        }
        setData(parsed)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const saveSection = async (key: string) => {
    setSaving(key)
    try {
      await adminApi.updateLandingSection(key, data[key])
    } catch { alert('Ошибка сохранения') }
    finally { setSaving(null) }
  }

  const updateField = (section: string, field: string, value: any) => {
    setData(prev => ({
      ...prev,
      [section]: { ...(prev[section] || {}), [field]: value },
    }))
  }

  const updateTextSection = (section: string, value: string) => {
    setData(prev => ({ ...prev, [section]: value }))
  }

  const updateArrayItem = (section: string, index: number, field: string, value: string) => {
    setData(prev => {
      const arr = [...(prev[section] || [])]
      arr[index] = { ...arr[index], [field]: value }
      return { ...prev, [section]: arr }
    })
  }

  const addArrayItem = (section: string, fields: string[]) => {
    setData(prev => {
      const arr = [...(prev[section] || [])]
      const item: any = {}
      fields.forEach(f => item[f] = '')
      arr.push(item)
      return { ...prev, [section]: arr }
    })
  }

  const removeArrayItem = (section: string, index: number) => {
    setData(prev => {
      const arr = [...(prev[section] || [])]
      arr.splice(index, 1)
      return { ...prev, [section]: arr }
    })
  }

  const currentSection = SECTIONS.find(s => s.key === activeTab)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Настройки лендинга (legacy)</h1>
        <a href="/admin/landing/builder"
           className="px-4 py-2 rounded-xl text-sm font-medium text-white"
           style={{ background: 'var(--accent-gradient)' }}>
          🎨 Открыть конструктор
        </a>
      </div>
      <div className="p-3 rounded-xl text-sm"
           style={{ background: 'rgba(6,182,212,0.08)', color: 'var(--text-secondary)' }}>
        <b style={{ color: 'var(--accent-1)' }}>Новый способ редактирования лендинга:</b>{' '}
        используйте конструктор блоков — там удобнее и больше возможностей.
        Эта страница оставлена для совместимости со старыми настройками.
      </div>

      {/* Tab navigation */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {SECTIONS.map(s => (
          <button key={s.key}
                  onClick={() => setActiveTab(s.key)}
                  className="px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all"
                  style={{
                    background: activeTab === s.key ? 'var(--accent-gradient)' : 'var(--glass-bg)',
                    border: `1px solid ${activeTab === s.key ? 'transparent' : 'var(--glass-border)'}`,
                    color: activeTab === s.key ? 'white' : 'var(--text-secondary)',
                  }}>
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-64 skeleton rounded-2xl" />
      ) : currentSection && (
        <div className="glass-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">{currentSection.label}</h2>
            <button onClick={() => saveSection(currentSection.key)}
                    disabled={saving === currentSection.key}
                    className="btn-primary text-sm">
              <Save className="w-4 h-4" />
              {saving === currentSection.key ? 'Сохраняю...' : 'Сохранить'}
            </button>
          </div>

          {/* Fields-based sections (hero) */}
          {currentSection.fields && (
            <div className="space-y-3">
              {currentSection.fields.map(field => (
                <div key={field}>
                  <label className="text-sm font-medium mb-1 block capitalize"
                         style={{ color: 'var(--text-secondary)' }}>
                    {field}
                  </label>
                  <input className="glass-input"
                         value={(data[currentSection.key] || {})[field] || ''}
                         onChange={e => updateField(currentSection.key, field, e.target.value)} />
                </div>
              ))}
            </div>
          )}

          {/* Textarea sections */}
          {currentSection.type === 'textarea' && (
            <textarea className="glass-input min-h-[300px] resize-y font-mono text-sm"
                      value={data[currentSection.key] || ''}
                      onChange={e => updateTextSection(currentSection.key, e.target.value)} />
          )}

          {/* Text sections */}
          {currentSection.type === 'text' && (
            <input className="glass-input"
                   placeholder="Значение"
                   value={typeof data[currentSection.key] === 'string' ? data[currentSection.key] : JSON.stringify(data[currentSection.key] || '')}
                   onChange={e => updateTextSection(currentSection.key, e.target.value)} />
          )}

          {/* JSON array sections (FAQ, Reviews) */}
          {currentSection.type === 'json-array' && (
            <div className="space-y-3">
              {(data[currentSection.key] || []).map((item: any, i: number) => (
                <div key={i} className="p-4 rounded-xl space-y-2"
                     style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>#{i + 1}</span>
                    <button onClick={() => removeArrayItem(currentSection.key, i)}
                            className="p-1 rounded hover:bg-red-500/10">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                  {currentSection.itemFields?.map(field => (
                    <input key={field} className="glass-input text-sm" placeholder={field}
                           value={item[field] || ''}
                           onChange={e => updateArrayItem(currentSection.key, i, field, e.target.value)} />
                  ))}
                </div>
              ))}
              <button onClick={() => addArrayItem(currentSection.key, currentSection.itemFields || [])}
                      className="btn-secondary text-sm w-full justify-center">
                <Plus className="w-4 h-4" /> Добавить
              </button>
            </div>
          )}

          {/* Raw JSON sections */}
          {currentSection.type === 'json' && (
            <textarea className="glass-input min-h-[200px] resize-y font-mono text-sm"
                      value={JSON.stringify(data[currentSection.key] || {}, null, 2)}
                      onChange={e => {
                        try {
                          updateTextSection(currentSection.key, JSON.parse(e.target.value))
                        } catch {}
                      }} />
          )}
        </div>
      )}
    </div>
  )
}
