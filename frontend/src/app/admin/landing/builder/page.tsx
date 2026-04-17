'use client'

/**
 * Landing Page Builder — no-code block editor.
 *
 * Layout:
 *   [Palette]  [Blocks list + Preview]  [Block settings]
 *   Click palette item → add to end. Click block → open settings.
 *   Drag block (handle) → reorder.
 */

import { useEffect, useState } from 'react'
import {
  Plus, Trash2, Eye, EyeOff, GripVertical,
  ArrowLeft, Save, ExternalLink,
  Layers, Shield, Zap, Globe, Lock, CheckCircle2, Star,
  Users, Gift, MessageCircle, Image as ImageIcon, Code,
  Hash, BarChart2, ChevronsUp, Wifi,
} from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { adminApi } from '@/lib/api'
import { BlockRenderer, type LandingBlock } from '@/components/landing/BlockRenderer'
import type { Tariff, TelegramProxy } from '@/types'

// ── Block palette ────────────────────────────────────────────
interface PaletteItem {
  type: string
  label: string
  icon: any
  description: string
  defaultData: Record<string, any>
}

const PALETTE: PaletteItem[] = [
  {
    type: 'hero', label: 'Hero', icon: Shield,
    description: 'Главный экран с заголовком и кнопкой',
    defaultData: {
      badge: '🚀 Новый VPN',
      title: 'Интернет без границ',
      subtitle: 'Быстрый и приватный VPN для любых задач',
      ctaText: 'Попробовать бесплатно',
      align: 'center',
    },
  },
  {
    type: 'features', label: 'Преимущества', icon: CheckCircle2,
    description: 'Сетка иконок с описаниями (2/3/4 колонки)',
    defaultData: {
      title: 'Почему мы?',
      columns: 3,
      items: [
        { icon: 'shield', title: 'Защита', text: 'Шифрование и приватность' },
        { icon: 'zap',    title: 'Скорость', text: 'Быстрые серверы в 30+ странах' },
        { icon: 'globe',  title: 'Глобально', text: 'Работает везде' },
      ],
    },
  },
  {
    type: 'tariffs', label: 'Тарифы', icon: Hash,
    description: 'Карточки тарифов из БД',
    defaultData: { title: 'Тарифы', subtitle: 'Выберите подходящий', tariffIds: [], highlightId: '' },
  },
  {
    type: 'faq', label: 'FAQ', icon: MessageCircle,
    description: 'Раскрывающиеся вопросы и ответы',
    defaultData: {
      title: 'Частые вопросы',
      items: [
        { q: 'Как начать?', a: 'Нажмите кнопку и следуйте инструкциям.' },
      ],
    },
  },
  {
    type: 'reviews', label: 'Отзывы', icon: Star,
    description: 'Карточки с отзывами и рейтингом',
    defaultData: {
      title: 'Что говорят клиенты',
      items: [
        { name: 'Иван', text: 'Отличный сервис!', rating: 5 },
      ],
    },
  },
  {
    type: 'stats', label: 'Статистика', icon: BarChart2,
    description: 'Большие цифры (пользователи, страны...)',
    defaultData: {
      items: [
        { number: '10К+', label: 'Клиентов' },
        { number: '30+', label: 'Стран' },
        { number: '99.9%', label: 'Uptime' },
        { number: '24/7', label: 'Поддержка' },
      ],
    },
  },
  {
    type: 'cta', label: 'Призыв', icon: ChevronsUp,
    description: 'Яркий блок с кнопкой',
    defaultData: {
      title: 'Начните прямо сейчас',
      subtitle: 'Первые 3 дня бесплатно',
      buttonText: 'Попробовать',
    },
  },
  {
    type: 'proxies', label: 'Прокси', icon: Wifi,
    description: 'Список Telegram-прокси из БД',
    defaultData: { title: 'Бесплатные прокси для Telegram', subtitle: '' },
  },
  {
    type: 'steps', label: 'Как начать', icon: Layers,
    description: 'Пронумерованные шаги',
    defaultData: {
      title: 'Как начать',
      items: [
        { number: 1, title: 'Зарегистрируйтесь', text: 'Бесплатно' },
        { number: 2, title: 'Выберите тариф', text: 'От 50 ₽' },
        { number: 3, title: 'Подключайтесь', text: 'Один клик' },
      ],
    },
  },
  {
    type: 'image', label: 'Картинка', icon: ImageIcon,
    description: 'Изображение с подписью',
    defaultData: { url: '', alt: '', caption: '' },
  },
  {
    type: 'spacer', label: 'Отступ', icon: ArrowLeft,
    description: 'Пустое пространство между блоками',
    defaultData: { height: 40 },
  },
  {
    type: 'custom_html', label: 'HTML', icon: Code,
    description: 'Произвольный HTML (для продвинутых)',
    defaultData: { html: '<p>Ваш HTML</p>' },
  },
]

// ─────────────────────────────────────────────────────────────
export default function LandingBuilderPage() {
  const [blocks, setBlocks]   = useState<LandingBlock[]>([])
  const [tariffs, setTariffs] = useState<Tariff[]>([])
  const [proxies, setProxies] = useState<TelegramProxy[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode]       = useState<'design' | 'preview'>('design')

  const load = async () => {
    try {
      const [b, t, p] = await Promise.all([
        adminApi.landingBlocks(),
        fetch('/api/public/tariffs').then(r => r.json()).catch(() => []),
        fetch('/api/public/proxies').then(r => r.json()).catch(() => []),
      ])
      setBlocks(b)
      setTariffs(t)
      setProxies(p)
    } catch { toast.error('Ошибка загрузки') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const selected = blocks.find(b => b.id === selectedId) || null

  const addBlock = async (item: PaletteItem) => {
    try {
      const block = await adminApi.createLandingBlock({
        type: item.type, data: item.defaultData, visible: true,
      })
      setBlocks(prev => [...prev, block])
      setSelectedId(block.id)
      toast.success(`${item.label} добавлен`)
    } catch { toast.error('Ошибка добавления') }
  }

  const updateBlock = async (id: string, patch: Partial<LandingBlock>) => {
    try {
      const updated = await adminApi.updateLandingBlock(id, patch as any)
      setBlocks(prev => prev.map(b => b.id === id ? updated : b))
    } catch { toast.error('Ошибка сохранения') }
  }

  const updateSelectedData = (newData: any) => {
    if (!selected) return
    const merged = { ...selected.data, ...newData }
    setBlocks(prev => prev.map(b => b.id === selected.id ? { ...b, data: merged } : b))
    updateBlock(selected.id, { data: merged })
  }

  const deleteBlock = async (id: string) => {
    if (!confirm('Удалить блок?')) return
    try {
      await adminApi.deleteLandingBlock(id)
      setBlocks(prev => prev.filter(b => b.id !== id))
      if (selectedId === id) setSelectedId(null)
      toast.success('Удалено')
    } catch { toast.error('Ошибка') }
  }

  const moveBlock = async (id: string, dir: -1 | 1) => {
    const idx = blocks.findIndex(b => b.id === id)
    if (idx < 0) return
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= blocks.length) return
    const newBlocks = [...blocks]
    const [moved] = newBlocks.splice(idx, 1)
    newBlocks.splice(newIdx, 0, moved)
    const reindexed = newBlocks.map((b, i) => ({ ...b, sortOrder: i }))
    setBlocks(reindexed)
    await adminApi.reorderLandingBlocks(reindexed.map(b => ({ id: b.id, sortOrder: b.sortOrder })))
      .catch(() => toast.error('Ошибка сохранения порядка'))
  }

  const toggleVisible = (b: LandingBlock) =>
    updateBlock(b.id, { visible: !b.visible })

  if (loading) {
    return <div className="p-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Загрузка...</div>
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--surface-0)' }}>
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b sticky top-0 z-30"
              style={{ background: 'var(--surface-0)', borderColor: 'var(--glass-border)' }}>
        <div className="flex items-center gap-4">
          <Link href="/admin" className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            <ArrowLeft className="w-4 h-4" /> Админка
          </Link>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            🎨 Конструктор лендинга
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg p-1" style={{ background: 'var(--surface-2)' }}>
            <button onClick={() => setMode('design')} className="px-3 py-1 rounded text-xs font-medium"
                    style={{ background: mode === 'design' ? 'var(--surface-1)' : 'transparent', color: 'var(--text-primary)' }}>
              Дизайн
            </button>
            <button onClick={() => setMode('preview')} className="px-3 py-1 rounded text-xs font-medium"
                    style={{ background: mode === 'preview' ? 'var(--surface-1)' : 'transparent', color: 'var(--text-primary)' }}>
              Превью
            </button>
          </div>
          <a href="/" target="_blank" rel="noopener"
             className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
             style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
            <ExternalLink className="w-3.5 h-3.5" /> Открыть лендинг
          </a>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT: Palette + blocks list ─────────────────── */}
        <aside className="w-72 border-r overflow-y-auto flex-shrink-0"
               style={{ background: 'var(--surface-1)', borderColor: 'var(--glass-border)' }}>
          <div className="p-3 border-b" style={{ borderColor: 'var(--glass-border)' }}>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
              + Добавить блок
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {PALETTE.map(p => {
                const Icon = p.icon
                return (
                  <button key={p.type}
                          onClick={() => addBlock(p)}
                          title={p.description}
                          className="flex flex-col items-center gap-1 p-2.5 rounded-lg text-[11px] font-medium transition-all hover:scale-105"
                          style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>
                    <Icon className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
              Блоки страницы ({blocks.length})
            </div>
            {blocks.length === 0 && (
              <div className="text-xs text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
                Пусто.<br/>Добавьте блок сверху.
              </div>
            )}
            <div className="space-y-1">
              {blocks.map((b, i) => {
                const paletteItem = PALETTE.find(p => p.type === b.type)
                const Icon = paletteItem?.icon || Layers
                return (
                  <div key={b.id}
                       className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${selectedId === b.id ? 'ring-1' : ''}`}
                       style={{
                         background: selectedId === b.id ? 'var(--surface-2)' : 'transparent',
                         border: '1px solid ' + (selectedId === b.id ? 'var(--accent-1)' : 'transparent'),
                         opacity: b.visible ? 1 : 0.5,
                       }}
                       onClick={() => setSelectedId(b.id)}>
                    <GripVertical className="w-3.5 h-3.5 opacity-30" style={{ color: 'var(--text-tertiary)' }} />
                    <Icon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-1)' }} />
                    <span className="flex-1 text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {paletteItem?.label || b.type}
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); moveBlock(b.id, -1) }}
                            disabled={i === 0}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-[10px] disabled:opacity-20"
                            style={{ color: 'var(--text-tertiary)' }}>▲</button>
                    <button onClick={(e) => { e.stopPropagation(); moveBlock(b.id, 1) }}
                            disabled={i === blocks.length - 1}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-[10px] disabled:opacity-20"
                            style={{ color: 'var(--text-tertiary)' }}>▼</button>
                    <button onClick={(e) => { e.stopPropagation(); toggleVisible(b) }}
                            title={b.visible ? 'Скрыть' : 'Показать'}
                            className="p-1 rounded opacity-0 group-hover:opacity-100"
                            style={{ color: 'var(--text-tertiary)' }}>
                      {b.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteBlock(b.id) }}
                            className="p-1 rounded opacity-0 group-hover:opacity-100"
                            style={{ color: '#ef4444' }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </aside>

        {/* ── CENTER: Preview ──────────────────────────────── */}
        <main className="flex-1 overflow-y-auto" style={{ background: 'var(--surface-0)' }}>
          {blocks.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center p-12">
                <Layers className="w-12 h-12 mx-auto mb-4 opacity-20" style={{ color: 'var(--text-tertiary)' }} />
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  Лендинг пока пустой.<br/>Добавьте первый блок из палитры слева.
                </p>
              </div>
            </div>
          )}
          {blocks.map(b => (
            <div key={b.id}
                 onClick={() => mode === 'design' && setSelectedId(b.id)}
                 className={mode === 'design' ? 'cursor-pointer relative' : 'pointer-events-none'}
                 style={{
                   outline: mode === 'design' && selectedId === b.id ? '2px solid var(--accent-1)' : 'none',
                   outlineOffset: '-2px',
                   opacity: b.visible ? 1 : 0.4,
                 }}>
              <BlockRenderer block={b} ctx={{ tariffs, proxies, onCta: () => {} }} />
            </div>
          ))}
        </main>

        {/* ── RIGHT: Block settings ────────────────────────── */}
        <aside className="w-80 border-l overflow-y-auto flex-shrink-0"
               style={{ background: 'var(--surface-1)', borderColor: 'var(--glass-border)' }}>
          {selected ? (
            <BlockSettings block={selected} tariffs={tariffs} onChange={updateSelectedData} />
          ) : (
            <div className="p-6 text-sm text-center" style={{ color: 'var(--text-tertiary)' }}>
              Выберите блок для настройки
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

// ═══ Block-specific settings panels ═══════════════════════════
function BlockSettings({ block, tariffs, onChange }: {
  block: LandingBlock; tariffs: Tariff[]; onChange: (patch: any) => void
}) {
  const d = block.data || {}
  const set = (key: string, v: any) => onChange({ [key]: v })
  const paletteItem = PALETTE.find(p => p.type === block.type)

  return (
    <div className="p-4 space-y-4">
      <div className="pb-3 border-b" style={{ borderColor: 'var(--glass-border)' }}>
        <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          Настройки блока
        </div>
        <div className="text-lg font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>
          {paletteItem?.label || block.type}
        </div>
        {paletteItem?.description && (
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {paletteItem.description}
          </div>
        )}
      </div>

      {/* Hero / CTA common fields */}
      {(block.type === 'hero' || block.type === 'cta') && (
        <>
          {block.type === 'hero' && (
            <Field label="Бейдж (над заголовком)">
              <input value={d.badge || ''} onChange={e => set('badge', e.target.value)} className={inputCls} />
            </Field>
          )}
          <Field label="Заголовок">
            <input value={d.title || ''} onChange={e => set('title', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Подзаголовок">
            <textarea rows={3} value={d.subtitle || ''} onChange={e => set('subtitle', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Текст кнопки">
            <input value={d.ctaText || d.buttonText || ''}
                   onChange={e => set(block.type === 'cta' ? 'buttonText' : 'ctaText', e.target.value)}
                   className={inputCls} />
          </Field>
          {block.type === 'hero' && (
            <Field label="URL фонового изображения (опц.)">
              <input value={d.bgImage || ''} onChange={e => set('bgImage', e.target.value)} className={inputCls} placeholder="https://..." />
            </Field>
          )}
          <Field label="Цвет фона (опц.)">
            <input type="color" value={d.bgColor || '#0f172a'} onChange={e => set('bgColor', e.target.value)} className="w-full h-9 rounded" />
          </Field>
        </>
      )}

      {/* Features / FAQ / Reviews / Steps / Stats — items editor */}
      {['features', 'faq', 'reviews', 'steps', 'stats'].includes(block.type) && (
        <>
          {block.type !== 'stats' && (
            <Field label="Заголовок секции">
              <input value={d.title || ''} onChange={e => set('title', e.target.value)} className={inputCls} />
            </Field>
          )}
          {block.type === 'features' && (
            <Field label="Количество колонок">
              <select value={d.columns || 3} onChange={e => set('columns', Number(e.target.value))} className={inputCls}>
                <option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
              </select>
            </Field>
          )}
          <ItemsEditor
            type={block.type}
            items={Array.isArray(d.items) ? d.items : []}
            onChange={items => set('items', items)}
          />
        </>
      )}

      {/* Tariffs — choose which to show */}
      {block.type === 'tariffs' && (
        <>
          <Field label="Заголовок секции">
            <input value={d.title || ''} onChange={e => set('title', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Подзаголовок">
            <input value={d.subtitle || ''} onChange={e => set('subtitle', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Показывать тарифы (выбор)">
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {tariffs.map(t => {
                const checked = (d.tariffIds || []).includes(t.id)
                return (
                  <label key={t.id} className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={checked}
                           onChange={e => {
                             const cur = d.tariffIds || []
                             set('tariffIds', e.target.checked ? [...cur, t.id] : cur.filter((x: string) => x !== t.id))
                           }} />
                    {t.name}
                  </label>
                )
              })}
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Если ничего не выбрано — покажутся все активные тарифы.
            </p>
          </Field>
          <Field label="Выделить тариф (популярный)">
            <select value={d.highlightId || ''} onChange={e => set('highlightId', e.target.value)} className={inputCls}>
              <option value="">Нет</option>
              {tariffs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </>
      )}

      {/* Proxies */}
      {block.type === 'proxies' && (
        <>
          <Field label="Заголовок"><input value={d.title || ''} onChange={e => set('title', e.target.value)} className={inputCls} /></Field>
          <Field label="Подзаголовок"><input value={d.subtitle || ''} onChange={e => set('subtitle', e.target.value)} className={inputCls} /></Field>
          <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
            Содержимое берётся из админки → Прокси.
          </p>
        </>
      )}

      {/* Image */}
      {block.type === 'image' && (
        <>
          <Field label="URL изображения"><input value={d.url || ''} onChange={e => set('url', e.target.value)} className={inputCls} /></Field>
          <Field label="Alt-текст"><input value={d.alt || ''} onChange={e => set('alt', e.target.value)} className={inputCls} /></Field>
          <Field label="Подпись (опц.)"><input value={d.caption || ''} onChange={e => set('caption', e.target.value)} className={inputCls} /></Field>
          <Field label="Макс. высота (px, опц.)">
            <input type="number" value={d.maxHeight || ''} onChange={e => set('maxHeight', e.target.value ? Number(e.target.value) : null)} className={inputCls} />
          </Field>
        </>
      )}

      {/* Spacer */}
      {block.type === 'spacer' && (
        <Field label="Высота (px)">
          <input type="number" value={d.height || 40} onChange={e => set('height', Number(e.target.value))} className={inputCls} />
        </Field>
      )}

      {/* Custom HTML */}
      {block.type === 'custom_html' && (
        <Field label="HTML код">
          <textarea rows={10} value={d.html || ''} onChange={e => set('html', e.target.value)}
                    className={inputCls + ' font-mono text-[11px]'} />
        </Field>
      )}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm builder-input'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
      <style jsx global>{`
        .builder-input {
          background: var(--surface-2);
          border: 1px solid var(--glass-border);
          color: var(--text-primary);
          outline: none;
        }
        .builder-input:focus {
          border-color: var(--accent-1);
        }
      `}</style>
      {children}
    </div>
  )
}

// ── Items editor (for features, faq, reviews, steps, stats) ──
function ItemsEditor({ type, items, onChange }: {
  type: string; items: any[]; onChange: (items: any[]) => void
}) {
  const addItem = () => {
    const template = {
      features: { icon: 'shield', title: 'Новое преимущество', text: 'Описание' },
      faq:      { q: 'Вопрос?', a: 'Ответ' },
      reviews:  { name: 'Имя', text: 'Отзыв', rating: 5 },
      steps:    { number: items.length + 1, title: 'Шаг', text: 'Описание' },
      stats:    { number: '100', label: 'Метрика' },
    }[type] || {}
    onChange([...items, template])
  }
  const update = (idx: number, key: string, value: any) => {
    const next = [...items]
    next[idx] = { ...next[idx], [key]: value }
    onChange(next)
  }
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx))

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
        Элементы ({items.length})
      </div>
      {items.map((item, idx) => (
        <div key={idx} className="p-3 rounded-lg space-y-2 relative"
             style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
          <button onClick={() => remove(idx)}
                  className="absolute top-2 right-2 p-1 rounded"
                  style={{ color: '#ef4444' }}>
            <Trash2 className="w-3 h-3" />
          </button>
          {type === 'features' && (
            <>
              <select value={item.icon || 'shield'} onChange={e => update(idx, 'icon', e.target.value)}
                      className={inputCls + ' text-xs'}>
                <option value="shield">🛡 Shield</option>
                <option value="zap">⚡ Zap</option>
                <option value="globe">🌍 Globe</option>
                <option value="lock">🔒 Lock</option>
                <option value="check">✅ Check</option>
                <option value="star">⭐ Star</option>
                <option value="wifi">📶 Wifi</option>
                <option value="phone">📱 Phone</option>
                <option value="server">🖥 Server</option>
                <option value="users">👥 Users</option>
                <option value="gift">🎁 Gift</option>
                <option value="chat">💬 Chat</option>
              </select>
              <input value={item.title || ''} onChange={e => update(idx, 'title', e.target.value)}
                     className={inputCls + ' text-xs'} placeholder="Заголовок" />
              <textarea rows={2} value={item.text || ''} onChange={e => update(idx, 'text', e.target.value)}
                        className={inputCls + ' text-xs'} placeholder="Описание" />
            </>
          )}
          {type === 'faq' && (
            <>
              <input value={item.q || ''} onChange={e => update(idx, 'q', e.target.value)}
                     className={inputCls + ' text-xs'} placeholder="Вопрос" />
              <textarea rows={2} value={item.a || ''} onChange={e => update(idx, 'a', e.target.value)}
                        className={inputCls + ' text-xs'} placeholder="Ответ" />
            </>
          )}
          {type === 'reviews' && (
            <>
              <input value={item.name || ''} onChange={e => update(idx, 'name', e.target.value)}
                     className={inputCls + ' text-xs'} placeholder="Имя" />
              <textarea rows={2} value={item.text || ''} onChange={e => update(idx, 'text', e.target.value)}
                        className={inputCls + ' text-xs'} placeholder="Отзыв" />
              <input type="number" min={1} max={5} value={item.rating || 5}
                     onChange={e => update(idx, 'rating', Number(e.target.value))}
                     className={inputCls + ' text-xs'} placeholder="Рейтинг 1-5" />
            </>
          )}
          {type === 'steps' && (
            <>
              <input value={item.number || ''} onChange={e => update(idx, 'number', e.target.value)}
                     className={inputCls + ' text-xs'} placeholder="Номер (или эмодзи)" />
              <input value={item.title || ''} onChange={e => update(idx, 'title', e.target.value)}
                     className={inputCls + ' text-xs'} placeholder="Заголовок" />
              <textarea rows={2} value={item.text || ''} onChange={e => update(idx, 'text', e.target.value)}
                        className={inputCls + ' text-xs'} placeholder="Описание" />
            </>
          )}
          {type === 'stats' && (
            <>
              <input value={item.number || ''} onChange={e => update(idx, 'number', e.target.value)}
                     className={inputCls + ' text-xs'} placeholder="Число (10К, 99.9%)" />
              <input value={item.label || ''} onChange={e => update(idx, 'label', e.target.value)}
                     className={inputCls + ' text-xs'} placeholder="Подпись" />
            </>
          )}
        </div>
      ))}
      <button onClick={addItem}
              className="w-full flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium"
              style={{ background: 'var(--surface-2)', border: '1px dashed var(--glass-border)', color: 'var(--accent-1)' }}>
        <Plus className="w-3 h-3" /> Добавить элемент
      </button>
    </div>
  )
}
