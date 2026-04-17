'use client'

/**
 * Landing Page Builder — no-code visual editor.
 *
 * Features:
 * - 22+ block types with inline preview
 * - Device switcher (mobile/tablet/desktop)
 * - Drag & drop reorder (HTML5 DnD)
 * - Per-block Content + Style tabs (padding, bg, align, animation, hide on device)
 * - Duplicate block
 * - Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Plus, Trash2, Eye, EyeOff, GripVertical, Copy,
  ArrowLeft, ExternalLink, Monitor, Tablet, Smartphone,
  Undo, Redo, Settings as SettingsIcon, FileText,
  Layers, Shield, CheckCircle2, Star, MessageCircle,
  Image as ImageIcon, Code, Hash, BarChart2,
  ChevronsUp, Wifi, Clock, Play, Building2, Columns,
  Users, Calendar, Mail, ListChecks, Send,
} from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { adminApi } from '@/lib/api'
import { BlockRenderer, type LandingBlock, type BlockStyle } from '@/components/landing/BlockRenderer'
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
  // ── Основные ──
  { type: 'hero', label: 'Hero', icon: Shield, description: 'Главный экран с заголовком и кнопкой', defaultData: {
    badge: '🚀 Новый VPN', title: 'Интернет без границ', subtitle: 'Быстрый и приватный VPN для любых задач', ctaText: 'Попробовать бесплатно', align: 'center',
  } },
  { type: 'features', label: 'Преимущества', icon: CheckCircle2, description: 'Сетка иконок (2/3/4 колонки)', defaultData: {
    title: 'Почему мы?', columns: 3, items: [
      { icon: 'shield', title: 'Защита', text: 'Шифрование и приватность' },
      { icon: 'zap', title: 'Скорость', text: 'Быстрые серверы' },
      { icon: 'globe', title: 'Глобально', text: 'Работает везде' },
    ],
  } },
  { type: 'tariffs', label: 'Тарифы', icon: Hash, description: 'Карточки тарифов из БД', defaultData: {
    title: 'Тарифы', subtitle: 'Выберите подходящий', tariffIds: [], highlightId: '',
  } },
  { type: 'pricing_table', label: 'Таблица сравнения', icon: ListChecks, description: 'Сравнение фич по тарифам', defaultData: {
    title: 'Сравнение тарифов',
    features: ['10 устройств', 'Неограниченный трафик', 'Приоритетная поддержка'],
    plans: [
      { name: 'Базовый', price: '299 ₽', values: ['yes', 'yes', 'no'] },
      { name: 'Про', price: '599 ₽', highlighted: true, values: ['yes', 'yes', 'yes'] },
    ],
  } },

  // ── Контент ──
  { type: 'faq', label: 'FAQ', icon: MessageCircle, description: 'Раскрывающиеся вопросы', defaultData: {
    title: 'Частые вопросы', items: [{ q: 'Как начать?', a: 'Нажмите кнопку и следуйте инструкциям.' }],
  } },
  { type: 'reviews', label: 'Отзывы', icon: Star, description: 'Карточки с отзывами', defaultData: {
    title: 'Отзывы клиентов', items: [{ name: 'Иван', text: 'Отличный сервис!', rating: 5 }],
  } },
  { type: 'stats', label: 'Статистика', icon: BarChart2, description: 'Большие цифры', defaultData: {
    items: [{ number: '10К+', label: 'Клиентов' }, { number: '30+', label: 'Стран' }, { number: '99.9%', label: 'Uptime' }, { number: '24/7', label: 'Поддержка' }],
  } },
  { type: 'steps', label: 'Как начать', icon: Layers, description: 'Пронумерованные шаги', defaultData: {
    title: 'Как начать', items: [
      { number: 1, title: 'Зарегистрируйтесь', text: 'Бесплатно' },
      { number: 2, title: 'Выберите тариф', text: 'От 50 ₽' },
      { number: 3, title: 'Подключайтесь', text: 'Один клик' },
    ],
  } },
  { type: 'timeline', label: 'Таймлайн', icon: Calendar, description: 'Дорожная карта / план', defaultData: {
    title: 'Дорожная карта',
    items: [
      { date: 'Q1 2026', title: 'Запуск', text: 'MVP', done: true },
      { date: 'Q2 2026', title: 'Мобильные приложения', text: 'iOS + Android', done: false },
    ],
  } },
  { type: 'team', label: 'Команда', icon: Users, description: 'Карточки с фото', defaultData: {
    title: 'Наша команда', items: [{ name: 'Алексей', role: 'Основатель', bio: '10 лет в IT' }],
  } },

  // ── Медиа ──
  { type: 'video', label: 'Видео', icon: Play, description: 'YouTube / Vimeo / mp4', defaultData: {
    title: '', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  } },
  { type: 'image', label: 'Картинка', icon: ImageIcon, description: 'Изображение с подписью', defaultData: { url: '', alt: '', caption: '' } },
  { type: 'logo_wall', label: 'Логотипы', icon: Building2, description: '«Нам доверяют» с логотипами', defaultData: {
    title: 'Нам доверяют', items: [{ name: 'Компания A' }, { name: 'Компания B' }, { name: 'Компания C' }],
  } },
  { type: 'two_column', label: '2 колонки', icon: Columns, description: 'Текст + картинка', defaultData: {
    badge: '', title: 'Что-то важное', text: 'Описание преимущества', bullets: ['Пункт 1', 'Пункт 2', 'Пункт 3'], ctaText: 'Узнать больше', image: '', imagePosition: 'right',
  } },

  // ── Интерактивные ──
  { type: 'countdown', label: 'Таймер', icon: Clock, description: 'Обратный отсчёт до даты', defaultData: {
    title: 'До конца акции:', subtitle: '', targetDate: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 16),
  } },
  { type: 'cta', label: 'Призыв (CTA)', icon: ChevronsUp, description: 'Яркий блок с кнопкой', defaultData: {
    title: 'Начните прямо сейчас', subtitle: 'Первые 3 дня бесплатно', buttonText: 'Попробовать',
  } },
  { type: 'contact_form', label: 'Форма обратной связи', icon: Mail, description: 'Отправка → тикет в админке', defaultData: {
    title: 'Связаться с нами', subtitle: 'Напишите, мы ответим', placeholder: 'Ваше сообщение *', buttonText: 'Отправить', successTitle: 'Спасибо!', successText: 'Мы скоро свяжемся.',
  } },
  { type: 'newsletter', label: 'Рассылка', icon: Mail, description: 'Email-подписка', defaultData: {
    title: 'Подпишитесь', subtitle: 'Акции и новости', buttonText: 'Подписаться',
  } },
  { type: 'telegram_widget', label: 'Telegram-канал', icon: Send, description: 'Виджет с каналом', defaultData: {
    title: 'Наш Telegram-канал', subtitle: 'Новости, инструкции, акции', channel: '@yourchannel',
  } },
  { type: 'proxies', label: 'Прокси', icon: Wifi, description: 'Список TG-прокси из БД', defaultData: { title: 'Бесплатные прокси для Telegram', subtitle: '' } },

  // ── Утилиты ──
  { type: 'spacer', label: 'Отступ', icon: ArrowLeft, description: 'Пустое пространство', defaultData: { height: 40 } },
  { type: 'custom_html', label: 'HTML', icon: Code, description: 'Произвольный HTML', defaultData: { html: '<p>Ваш HTML</p>' } },
]

// ─────────────────────────────────────────────────────────────
export default function LandingBuilderPage() {
  const [blocks, setBlocks]   = useState<LandingBlock[]>([])
  const [tariffs, setTariffs] = useState<Tariff[]>([])
  const [proxies, setProxies] = useState<TelegramProxy[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode]       = useState<'design' | 'preview'>('design')
  const [device, setDevice]   = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [settingsTab, setSettingsTab] = useState<'content' | 'style'>('content')

  // Undo/Redo history
  const historyRef   = useRef<LandingBlock[][]>([])
  const historyIdxRef = useRef(-1)
  const pushHistory = useCallback((snapshot: LandingBlock[]) => {
    const hist = historyRef.current
    // trim future if we've undone
    if (historyIdxRef.current < hist.length - 1) {
      hist.splice(historyIdxRef.current + 1)
    }
    hist.push(JSON.parse(JSON.stringify(snapshot)))
    if (hist.length > 50) hist.shift()
    historyIdxRef.current = hist.length - 1
  }, [])

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
      historyRef.current = [JSON.parse(JSON.stringify(b))]
      historyIdxRef.current = 0
    } catch { toast.error('Ошибка загрузки') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return
    historyIdxRef.current -= 1
    const snap = historyRef.current[historyIdxRef.current]
    setBlocks(JSON.parse(JSON.stringify(snap)))
    toast.success('↩ Отменено')
    // Persist snapshot server-side by re-saving all blocks that differ
    snap.forEach(b => adminApi.updateLandingBlock(b.id, { data: b.data, visible: b.visible }).catch(() => {}))
  }, [])

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return
    historyIdxRef.current += 1
    const snap = historyRef.current[historyIdxRef.current]
    setBlocks(JSON.parse(JSON.stringify(snap)))
    toast.success('↪ Повтор')
    snap.forEach(b => adminApi.updateLandingBlock(b.id, { data: b.data, visible: b.visible }).catch(() => {}))
  }, [])

  // Ctrl+Z / Ctrl+Shift+Z
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if (mod && (e.key.toLowerCase() === 'z' && e.shiftKey || e.key.toLowerCase() === 'y')) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const selected = blocks.find(b => b.id === selectedId) || null

  const addBlock = async (item: PaletteItem) => {
    try {
      const block = await adminApi.createLandingBlock({
        type: item.type, data: item.defaultData, visible: true,
      })
      const next = [...blocks, block]
      setBlocks(next)
      setSelectedId(block.id)
      pushHistory(next)
      toast.success(`${item.label} добавлен`)
    } catch { toast.error('Ошибка добавления') }
  }

  const duplicateBlock = async (id: string) => {
    const orig = blocks.find(b => b.id === id)
    if (!orig) return
    try {
      const block = await adminApi.createLandingBlock({
        type: orig.type, data: orig.data, visible: orig.visible,
      })
      const next = [...blocks, block]
      setBlocks(next)
      setSelectedId(block.id)
      pushHistory(next)
      toast.success('Дубликат создан')
    } catch { toast.error('Ошибка') }
  }

  const updateBlock = async (id: string, patch: Partial<LandingBlock>) => {
    try {
      const updated = await adminApi.updateLandingBlock(id, patch as any)
      const next = blocks.map(b => b.id === id ? updated : b)
      setBlocks(next)
      pushHistory(next)
    } catch { toast.error('Ошибка сохранения') }
  }

  // Debounced server-save per block. Color picker and rapid-fire inputs
  // would otherwise spam the API with one request per pixel movement.
  const saveTimersRef = useRef<Record<string, any>>({})
  const queueSave = useCallback((id: string, data: any) => {
    const timers = saveTimersRef.current
    if (timers[id]) clearTimeout(timers[id])
    timers[id] = setTimeout(() => {
      adminApi.updateLandingBlock(id, { data }).catch(() => toast.error('Ошибка'))
      delete timers[id]
    }, 400)
  }, [])

  const updateSelectedData = (newData: any) => {
    if (!selected) return
    const merged = { ...selected.data, ...newData }
    const next = blocks.map(b => b.id === selected.id ? { ...b, data: merged } : b)
    setBlocks(next)
    queueSave(selected.id, merged)
  }
  const updateSelectedStyle = (newStyle: Partial<BlockStyle>) => {
    if (!selected) return
    const curStyle = selected.data?.style || {}
    const merged = { ...selected.data, style: { ...curStyle, ...newStyle } }
    const next = blocks.map(b => b.id === selected.id ? { ...b, data: merged } : b)
    setBlocks(next)
    queueSave(selected.id, merged)
  }

  // On blur: flush any pending debounced save immediately and push history snapshot.
  const commitChange = () => {
    const timers = saveTimersRef.current
    for (const [id, t] of Object.entries(timers)) {
      clearTimeout(t)
      const block = blocks.find(b => b.id === id)
      if (block) adminApi.updateLandingBlock(id, { data: block.data }).catch(() => {})
      delete timers[id]
    }
    pushHistory(blocks)
  }

  const deleteBlock = async (id: string) => {
    if (!confirm('Удалить блок?')) return
    try {
      await adminApi.deleteLandingBlock(id)
      const next = blocks.filter(b => b.id !== id)
      setBlocks(next)
      if (selectedId === id) setSelectedId(null)
      pushHistory(next)
      toast.success('Удалено')
    } catch { toast.error('Ошибка') }
  }

  // ── Drag & drop reorder ──
  const dragIdRef = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const onDragStart = (id: string) => { dragIdRef.current = id }
  const onDragEnter = (id: string) => setDragOverId(id)
  const onDragEnd = () => { dragIdRef.current = null; setDragOverId(null) }
  const onDrop = async (targetId: string) => {
    const srcId = dragIdRef.current
    if (!srcId || srcId === targetId) { onDragEnd(); return }
    const srcIdx = blocks.findIndex(b => b.id === srcId)
    const tgtIdx = blocks.findIndex(b => b.id === targetId)
    if (srcIdx < 0 || tgtIdx < 0) { onDragEnd(); return }
    const newBlocks = [...blocks]
    const [moved] = newBlocks.splice(srcIdx, 1)
    newBlocks.splice(tgtIdx, 0, moved)
    const reindexed = newBlocks.map((b, i) => ({ ...b, sortOrder: i }))
    setBlocks(reindexed)
    pushHistory(reindexed)
    await adminApi.reorderLandingBlocks(reindexed.map(b => ({ id: b.id, sortOrder: b.sortOrder }))).catch(() => toast.error('Ошибка'))
    onDragEnd()
  }

  const toggleVisible = (b: LandingBlock) => updateBlock(b.id, { visible: !b.visible })

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Загрузка...</div>

  const previewWidth = device === 'mobile' ? 390 : device === 'tablet' ? 768 : '100%'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--surface-0)' }}>
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b sticky top-0 z-30"
              style={{ background: 'var(--surface-0)', borderColor: 'var(--glass-border)' }}>
        <div className="flex items-center gap-4">
          <Link href="/admin" className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            <ArrowLeft className="w-4 h-4" /> Админка
          </Link>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>🎨 Конструктор лендинга</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Undo / Redo */}
          <button onClick={undo} title="Отменить (Ctrl+Z)"
                  className="p-1.5 rounded-lg disabled:opacity-30"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
            <Undo className="w-4 h-4" />
          </button>
          <button onClick={redo} title="Повторить (Ctrl+Shift+Z)"
                  className="p-1.5 rounded-lg disabled:opacity-30"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
            <Redo className="w-4 h-4" />
          </button>

          {/* Device switcher */}
          <div className="flex rounded-lg p-1" style={{ background: 'var(--surface-2)' }}>
            {[
              { id: 'desktop', icon: Monitor, label: 'Desktop' },
              { id: 'tablet',  icon: Tablet,  label: 'Tablet' },
              { id: 'mobile',  icon: Smartphone, label: 'Mobile' },
            ].map(d => {
              const Icon = d.icon
              return (
                <button key={d.id} onClick={() => setDevice(d.id as any)} title={d.label}
                        className="px-2.5 py-1 rounded"
                        style={{ background: device === d.id ? 'var(--surface-1)' : 'transparent', color: 'var(--text-primary)' }}>
                  <Icon className="w-4 h-4" />
                </button>
              )
            })}
          </div>

          {/* Design/Preview toggle */}
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
            <ExternalLink className="w-3.5 h-3.5" /> Открыть
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
                  <button key={p.type} onClick={() => addBlock(p)} title={p.description}
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
              Блоки ({blocks.length})
            </div>
            {blocks.length === 0 && (
              <div className="text-xs text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
                Пусто.<br/>Добавьте блок.
              </div>
            )}
            <div className="space-y-1">
              {blocks.map(b => {
                const paletteItem = PALETTE.find(p => p.type === b.type)
                const Icon = paletteItem?.icon || Layers
                return (
                  <div key={b.id}
                       draggable
                       onDragStart={() => onDragStart(b.id)}
                       onDragOver={(e) => e.preventDefault()}
                       onDragEnter={() => onDragEnter(b.id)}
                       onDragEnd={onDragEnd}
                       onDrop={() => onDrop(b.id)}
                       onClick={() => setSelectedId(b.id)}
                       className="group flex items-center gap-2 px-2 py-2 rounded-lg cursor-grab active:cursor-grabbing transition-colors"
                       style={{
                         background: selectedId === b.id ? 'var(--surface-2)' : 'transparent',
                         border: '1px solid ' + (selectedId === b.id ? 'var(--accent-1)' : (dragOverId === b.id ? 'var(--accent-1)' : 'transparent')),
                         opacity: b.visible ? 1 : 0.5,
                       }}>
                    <GripVertical className="w-3.5 h-3.5 opacity-30" style={{ color: 'var(--text-tertiary)' }} />
                    <Icon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-1)' }} />
                    <span className="flex-1 text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {paletteItem?.label || b.type}
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); duplicateBlock(b.id) }} title="Дублировать"
                            className="p-1 rounded opacity-0 group-hover:opacity-100" style={{ color: 'var(--text-tertiary)' }}>
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); toggleVisible(b) }} title={b.visible ? 'Скрыть' : 'Показать'}
                            className="p-1 rounded opacity-0 group-hover:opacity-100" style={{ color: 'var(--text-tertiary)' }}>
                      {b.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteBlock(b.id) }} title="Удалить"
                            className="p-1 rounded opacity-0 group-hover:opacity-100" style={{ color: '#ef4444' }}>
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
          <div className="mx-auto transition-all duration-200"
               style={{
                 width: typeof previewWidth === 'number' ? previewWidth + 'px' : previewWidth,
                 boxShadow: device !== 'desktop' ? '0 10px 40px rgba(0,0,0,0.2)' : 'none',
                 border: device !== 'desktop' ? '1px solid var(--glass-border)' : 'none',
                 borderRadius: device !== 'desktop' ? '20px' : '0',
                 overflow: 'hidden',
                 margin: device !== 'desktop' ? '20px auto' : '0',
               }}>
            {blocks.length === 0 && (
              <div className="flex items-center justify-center h-[70vh]">
                <div className="text-center p-12">
                  <Layers className="w-12 h-12 mx-auto mb-4 opacity-20" style={{ color: 'var(--text-tertiary)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    Пусто. Добавьте блок из палитры слева.
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
                <BlockRenderer block={b} ctx={{ tariffs, proxies, previewDevice: device, disableAnimations: true, onCta: () => {} }} />
              </div>
            ))}
          </div>
        </main>

        {/* ── RIGHT: Block settings ────────────────────────── */}
        <aside className="w-80 border-l overflow-y-auto flex-shrink-0"
               style={{ background: 'var(--surface-1)', borderColor: 'var(--glass-border)' }}>
          {selected ? (
            <>
              <div className="flex border-b" style={{ borderColor: 'var(--glass-border)' }}>
                <button onClick={() => setSettingsTab('content')}
                        className="flex-1 px-4 py-3 text-xs font-semibold flex items-center justify-center gap-1.5"
                        style={{
                          background: settingsTab === 'content' ? 'var(--surface-2)' : 'transparent',
                          color: settingsTab === 'content' ? 'var(--accent-1)' : 'var(--text-tertiary)',
                          borderBottom: settingsTab === 'content' ? '2px solid var(--accent-1)' : 'none',
                        }}>
                  <FileText className="w-3.5 h-3.5" /> Контент
                </button>
                <button onClick={() => setSettingsTab('style')}
                        className="flex-1 px-4 py-3 text-xs font-semibold flex items-center justify-center gap-1.5"
                        style={{
                          background: settingsTab === 'style' ? 'var(--surface-2)' : 'transparent',
                          color: settingsTab === 'style' ? 'var(--accent-1)' : 'var(--text-tertiary)',
                          borderBottom: settingsTab === 'style' ? '2px solid var(--accent-1)' : 'none',
                        }}>
                  <SettingsIcon className="w-3.5 h-3.5" /> Стиль
                </button>
              </div>
              {settingsTab === 'content' ? (
                <BlockSettings block={selected} tariffs={tariffs} onChange={updateSelectedData} commit={commitChange} />
              ) : (
                <StyleSettings block={selected} onChange={updateSelectedStyle} commit={commitChange} />
              )}
            </>
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

// ═══ Block content settings ══════════════════════════════════
function BlockSettings({ block, tariffs, onChange, commit }: {
  block: LandingBlock; tariffs: Tariff[]; onChange: (patch: any) => void; commit: () => void
}) {
  const d = block.data || {}
  const set = (key: string, v: any) => onChange({ [key]: v })
  const paletteItem = PALETTE.find(p => p.type === block.type)

  return (
    <div className="p-4 space-y-4">
      <div className="pb-3 border-b" style={{ borderColor: 'var(--glass-border)' }}>
        <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Блок</div>
        <div className="text-lg font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>{paletteItem?.label || block.type}</div>
        {paletteItem?.description && <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{paletteItem.description}</div>}
      </div>

      {/* Hero / CTA */}
      {(block.type === 'hero' || block.type === 'cta') && (
        <>
          {block.type === 'hero' && (
            <>
              <Field label="Вариант раскладки">
                <Select v={d.variant || 'center'} onC={v => set('variant', v)}
                        opts={[{v:'center',l:'По центру'}, {v:'split',l:'Split (текст + картинка)'}]} />
              </Field>
              <Field label="Бейдж"><Input v={d.badge} onC={v => set('badge', v)} onBlur={commit} /></Field>
            </>
          )}
          <Field label="Заголовок"><Input v={d.title} onC={v => set('title', v)} onBlur={commit} /></Field>
          <Field label="Подзаголовок"><Textarea v={d.subtitle} onC={v => set('subtitle', v)} onBlur={commit} /></Field>
          <Field label="Текст кнопки">
            <Input v={d.ctaText || d.buttonText} onC={v => set(block.type === 'cta' ? 'buttonText' : 'ctaText', v)} onBlur={commit} />
          </Field>
          {block.type === 'hero' && d.variant === 'split' && (
            <Field label="URL картинки справа">
              <Input v={d.image} onC={v => set('image', v)} onBlur={commit} />
            </Field>
          )}
        </>
      )}

      {/* Items-based blocks */}
      {['features', 'faq', 'reviews', 'steps', 'stats', 'timeline', 'team', 'logo_wall'].includes(block.type) && (
        <>
          {block.type !== 'stats' && <Field label="Заголовок"><Input v={d.title} onC={v => set('title', v)} onBlur={commit} /></Field>}
          {block.type === 'features' && (
            <>
              <Field label="Колонок">
                <Select v={d.columns || 3} onC={v => set('columns', Number(v))} opts={[{v: 2, l: '2'}, {v: 3, l: '3'}, {v: 4, l: '4'}]} />
              </Field>
              <Field label="Раскладка">
                <Select v={d.variant || 'cards'} onC={v => set('variant', v)}
                        opts={[
                          {v:'cards',l:'Карточки'},
                          {v:'borderless',l:'Без рамок'},
                          {v:'bordered',l:'Только рамка'},
                          {v:'icons-left',l:'Иконки слева'},
                        ]} />
              </Field>
            </>
          )}
          {block.type === 'faq' && (
            <Field label="Раскладка">
              <Select v={d.variant || 'boxes'} onC={v => set('variant', v)}
                      opts={[{v:'boxes',l:'Карточки'}, {v:'lines',l:'Минимализм'}]} />
            </Field>
          )}
          {block.type === 'reviews' && (
            <Field label="Раскладка">
              <Select v={d.variant || 'cards'} onC={v => set('variant', v)}
                      opts={[{v:'cards',l:'3 колонки'}, {v:'masonry-like',l:'2 колонки (широкие)'}]} />
            </Field>
          )}
          {block.type === 'stats' && (
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={d.animated !== false} onChange={e => set('animated', e.target.checked)} />
              🔢 Анимировать числа от 0
            </label>
          )}
          <ItemsEditor type={block.type} items={Array.isArray(d.items) ? d.items : []}
                       onChange={items => set('items', items)} onBlur={commit} />
        </>
      )}

      {/* Tariffs */}
      {block.type === 'tariffs' && (
        <>
          <Field label="Заголовок"><Input v={d.title} onC={v => set('title', v)} onBlur={commit} /></Field>
          <Field label="Подзаголовок"><Input v={d.subtitle} onC={v => set('subtitle', v)} onBlur={commit} /></Field>
          <Field label="Какие тарифы показывать">
            <div className="space-y-1 max-h-40 overflow-y-auto">
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
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>Пусто = показать все</p>
          </Field>
          <Field label="Выделить как популярный">
            <Select v={d.highlightId || ''} onC={v => set('highlightId', v)}
                    opts={[{v: '', l: 'Нет'}, ...tariffs.map(t => ({v: t.id, l: t.name}))]} />
          </Field>
        </>
      )}

      {/* Pricing table */}
      {block.type === 'pricing_table' && (
        <>
          <Field label="Заголовок"><Input v={d.title} onC={v => set('title', v)} onBlur={commit} /></Field>
          <Field label="Функции (по одной в строке)">
            <Textarea rows={5} v={(d.features || []).join('\n')}
                      onC={v => set('features', v.split('\n').filter(Boolean))} onBlur={commit} />
          </Field>
          <Field label="Тарифы">
            <PlansEditor plans={d.plans || []} features={d.features || []} onChange={v => set('plans', v)} onBlur={commit} />
          </Field>
        </>
      )}

      {/* Video */}
      {block.type === 'video' && (
        <>
          <Field label="Заголовок (опц.)"><Input v={d.title} onC={v => set('title', v)} onBlur={commit} /></Field>
          <Field label="URL видео (YouTube / Vimeo / mp4)">
            <Input v={d.url} onC={v => set('url', v)} onBlur={commit} placeholder="https://youtube.com/..." />
          </Field>
        </>
      )}

      {/* Image */}
      {block.type === 'image' && (
        <>
          <Field label="URL"><Input v={d.url} onC={v => set('url', v)} onBlur={commit} /></Field>
          <Field label="Alt-текст"><Input v={d.alt} onC={v => set('alt', v)} onBlur={commit} /></Field>
          <Field label="Подпись"><Input v={d.caption} onC={v => set('caption', v)} onBlur={commit} /></Field>
          <Field label="Макс. высота (px)">
            <Input type="number" v={d.maxHeight || ''} onC={v => set('maxHeight', v ? Number(v) : null)} onBlur={commit} />
          </Field>
        </>
      )}

      {/* Two-column */}
      {block.type === 'two_column' && (
        <>
          <Field label="Бейдж"><Input v={d.badge} onC={v => set('badge', v)} onBlur={commit} /></Field>
          <Field label="Заголовок"><Input v={d.title} onC={v => set('title', v)} onBlur={commit} /></Field>
          <Field label="Текст"><Textarea v={d.text} onC={v => set('text', v)} onBlur={commit} /></Field>
          <Field label="Пункты (по одному в строке)">
            <Textarea rows={4} v={(d.bullets || []).join('\n')}
                      onC={v => set('bullets', v.split('\n').filter(Boolean))} onBlur={commit} />
          </Field>
          <Field label="URL картинки"><Input v={d.image} onC={v => set('image', v)} onBlur={commit} /></Field>
          <Field label="Позиция картинки">
            <Select v={d.imagePosition || 'right'} onC={v => set('imagePosition', v)}
                    opts={[{v:'left',l:'Слева'}, {v:'right',l:'Справа'}]} />
          </Field>
          <Field label="Текст кнопки (опц.)"><Input v={d.ctaText} onC={v => set('ctaText', v)} onBlur={commit} /></Field>
        </>
      )}

      {/* Countdown */}
      {block.type === 'countdown' && (
        <>
          <Field label="Заголовок"><Input v={d.title} onC={v => set('title', v)} onBlur={commit} /></Field>
          <Field label="Подзаголовок"><Input v={d.subtitle} onC={v => set('subtitle', v)} onBlur={commit} /></Field>
          <Field label="Дата и время окончания">
            <Input type="datetime-local" v={d.targetDate} onC={v => set('targetDate', v)} onBlur={commit} />
          </Field>
        </>
      )}

      {/* Contact form */}
      {block.type === 'contact_form' && (
        <>
          <Field label="Заголовок"><Input v={d.title} onC={v => set('title', v)} onBlur={commit} /></Field>
          <Field label="Подзаголовок"><Input v={d.subtitle} onC={v => set('subtitle', v)} onBlur={commit} /></Field>
          <Field label="Placeholder сообщения"><Input v={d.placeholder} onC={v => set('placeholder', v)} onBlur={commit} /></Field>
          <Field label="Текст кнопки"><Input v={d.buttonText} onC={v => set('buttonText', v)} onBlur={commit} /></Field>
          <Field label="Заголовок после отправки"><Input v={d.successTitle} onC={v => set('successTitle', v)} onBlur={commit} /></Field>
          <Field label="Текст после отправки"><Input v={d.successText} onC={v => set('successText', v)} onBlur={commit} /></Field>
        </>
      )}

      {/* Newsletter */}
      {block.type === 'newsletter' && (
        <>
          <Field label="Заголовок"><Input v={d.title} onC={v => set('title', v)} onBlur={commit} /></Field>
          <Field label="Подзаголовок"><Input v={d.subtitle} onC={v => set('subtitle', v)} onBlur={commit} /></Field>
          <Field label="Текст кнопки"><Input v={d.buttonText} onC={v => set('buttonText', v)} onBlur={commit} /></Field>
        </>
      )}

      {/* Telegram */}
      {block.type === 'telegram_widget' && (
        <>
          <Field label="Заголовок"><Input v={d.title} onC={v => set('title', v)} onBlur={commit} /></Field>
          <Field label="Подзаголовок"><Input v={d.subtitle} onC={v => set('subtitle', v)} onBlur={commit} /></Field>
          <Field label="Канал (@username)"><Input v={d.channel} onC={v => set('channel', v)} onBlur={commit} /></Field>
        </>
      )}

      {/* Proxies */}
      {block.type === 'proxies' && (
        <>
          <Field label="Заголовок"><Input v={d.title} onC={v => set('title', v)} onBlur={commit} /></Field>
          <Field label="Подзаголовок"><Input v={d.subtitle} onC={v => set('subtitle', v)} onBlur={commit} /></Field>
          <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Прокси редактируются в разделе «Прокси» админки.</p>
        </>
      )}

      {/* Spacer */}
      {block.type === 'spacer' && (
        <Field label="Высота (px)">
          <Input type="number" v={d.height || 40} onC={v => set('height', Number(v))} onBlur={commit} />
        </Field>
      )}

      {/* Custom HTML */}
      {block.type === 'custom_html' && (
        <Field label="HTML код">
          <Textarea rows={12} className="font-mono text-[11px]" v={d.html} onC={v => set('html', v)} onBlur={commit} />
        </Field>
      )}
    </div>
  )
}

// ═══ Section (collapsible group) — defined OUTSIDE StyleSettings so its
// state isn't reset on every prop change to the parent. ═════════════
function StyleSection({ id, title, children, defaultOpen = false }: {
  id: string; title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  // Persist open state across block selections via localStorage
  const key = `lb-style-section-${id}`
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return defaultOpen
    const v = localStorage.getItem(key)
    if (v === null) return defaultOpen
    return v === '1'
  })
  const toggle = () => {
    const next = !open
    setOpen(next)
    try { localStorage.setItem(key, next ? '1' : '0') } catch {}
  }
  return (
    <div className="pb-3 border-b" style={{ borderColor: 'var(--glass-border)' }}>
      <button onClick={toggle}
              className="w-full flex items-center justify-between py-2 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-tertiary)' }}>
        <span>{title}</span>
        <span>{open ? '−' : '+'}</span>
      </button>
      {open && <div className="space-y-3 mt-2">{children}</div>}
    </div>
  )
}

// ═══ Style settings (padding, bg, animation, hide) ═══════════
function StyleSettings({ block, onChange, commit }: {
  block: LandingBlock; onChange: (patch: Partial<BlockStyle>) => void; commit: () => void
}) {
  const s: BlockStyle = (block.data?.style || {}) as BlockStyle
  const Section = StyleSection

  return (
    <div className="p-4 space-y-3">
      {/* ── Контейнер ── */}
      <Section id="container" title="📐 Контейнер" defaultOpen>
        <Field label="Ширина">
          <Select v={s.containerWidth || 'normal'} onC={v => onChange({ containerWidth: v as any })}
                  opts={[
                    {v:'narrow',l:'Узкая (640px)'},
                    {v:'normal',l:'Обычная (1024px)'},
                    {v:'wide',l:'Широкая (1280px)'},
                    {v:'full',l:'На всю ширину'},
                  ]} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Отступ сверху (px)"><Input type="number" v={s.paddingTop ?? ''} onC={v => onChange({ paddingTop: v === '' ? undefined : Number(v) })} onBlur={commit} /></Field>
          <Field label="Отступ снизу (px)"><Input type="number" v={s.paddingBottom ?? ''} onC={v => onChange({ paddingBottom: v === '' ? undefined : Number(v) })} onBlur={commit} /></Field>
        </div>
        <Field label="Выравнивание текста">
          <Select v={s.textAlign || ''} onC={v => onChange({ textAlign: (v || undefined) as any })}
                  opts={[{v:'',l:'По умолчанию'}, {v:'left',l:'Влево'}, {v:'center',l:'По центру'}, {v:'right',l:'Вправо'}]} />
        </Field>
      </Section>

      {/* ── Заголовок ── */}
      <Section id="title" title="🔤 Заголовок блока">
        <Field label="Размер">
          <Select v={s.titleSize || 'md'} onC={v => onChange({ titleSize: v as any })}
                  opts={[
                    {v:'sm',l:'S'}, {v:'md',l:'M (обычный)'}, {v:'lg',l:'L'},
                    {v:'xl',l:'XL'}, {v:'2xl',l:'2XL'}, {v:'3xl',l:'3XL (огромный)'},
                  ]} />
        </Field>
        <Field label="Вес">
          <Select v={s.titleWeight || 'bold'} onC={v => onChange({ titleWeight: v as any })}
                  opts={[
                    {v:'normal',l:'Обычный'}, {v:'medium',l:'Средний'}, {v:'semibold',l:'Полужирный'},
                    {v:'bold',l:'Жирный'}, {v:'black',l:'Чёрный'},
                  ]} />
        </Field>
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={!!s.titleGradient} onChange={e => onChange({ titleGradient: e.target.checked })} />
          🌈 Градиентный текст
        </label>
        {!s.titleGradient && (
          <Field label="Цвет заголовка">
            <div className="flex gap-2">
              <input type="color" value={s.titleColor || '#ffffff'} onChange={e => onChange({ titleColor: e.target.value })}
                     onBlur={commit} className="h-9 w-14 rounded cursor-pointer" />
              <Input v={s.titleColor || ''} onC={v => onChange({ titleColor: v || undefined })} onBlur={commit} placeholder="auto" />
            </div>
          </Field>
        )}
      </Section>

      {/* ── Фон блока ── */}
      <Section id="bg" title="🎨 Фон блока">
        <Field label="Цвет фона">
          <div className="flex gap-2">
            <input type="color" value={s.bgColor || '#000000'} onChange={e => onChange({ bgColor: e.target.value })}
                   onBlur={commit} className="h-9 w-14 rounded cursor-pointer" />
            <Input v={s.bgColor || ''} onC={v => onChange({ bgColor: v || undefined })} onBlur={commit} placeholder="#0f172a" />
          </div>
        </Field>
        <Field label="Градиент (CSS)">
          <Input v={s.bgGradient || ''} onC={v => onChange({ bgGradient: v || undefined })} onBlur={commit}
                 placeholder="linear-gradient(135deg, #06b6d4, #8b5cf6)" />
        </Field>
        <Field label="URL картинки">
          <Input v={s.bgImage || ''} onC={v => onChange({ bgImage: v || undefined })} onBlur={commit} placeholder="https://..." />
        </Field>
        <Field label="Паттерн поверх фона">
          <Select v={s.bgPattern || 'none'} onC={v => onChange({ bgPattern: v as any })}
                  opts={[{v:'none',l:'Нет'}, {v:'dots',l:'Точки'}, {v:'grid',l:'Сетка'}, {v:'noise',l:'Шум'}]} />
        </Field>
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={!!s.bgAnimated} onChange={e => onChange({ bgAnimated: e.target.checked })} />
          🌊 Анимированный градиент
        </label>
        <Field label="Оверлей (поверх фона)">
          <Input v={s.bgOverlay || ''} onC={v => onChange({ bgOverlay: v || undefined })} onBlur={commit}
                 placeholder="rgba(0,0,0,0.4)" />
        </Field>
      </Section>

      {/* ── Кнопки (CTA) ── */}
      <Section id="button" title="🔘 Стиль кнопок">
        <Field label="Вариант">
          <Select v={s.buttonVariant || 'gradient'} onC={v => onChange({ buttonVariant: v as any })}
                  opts={[
                    {v:'gradient',l:'Градиент'}, {v:'solid',l:'Сплошной'}, {v:'outline',l:'Контурная'},
                    {v:'ghost',l:'Призрачная'}, {v:'glass',l:'Стекло'}, {v:'soft',l:'Мягкая'},
                  ]} />
        </Field>
        <Field label="Размер">
          <Select v={s.buttonSize || 'md'} onC={v => onChange({ buttonSize: v as any })}
                  opts={[{v:'sm',l:'S'}, {v:'md',l:'M'}, {v:'lg',l:'L'}, {v:'xl',l:'XL'}]} />
        </Field>
        <Field label="Форма">
          <Select v={s.buttonShape || 'rounded'} onC={v => onChange({ buttonShape: v as any })}
                  opts={[{v:'rounded',l:'Скруглённая'}, {v:'pill',l:'Пилюля'}, {v:'square',l:'Квадратная'}]} />
        </Field>
        <Field label="Hover-эффект">
          <Select v={s.buttonHover || 'lift'} onC={v => onChange({ buttonHover: v as any })}
                  opts={[
                    {v:'none',l:'Без эффекта'},
                    {v:'lift',l:'↑ Подъём'},
                    {v:'scale',l:'⤢ Увеличение'},
                    {v:'glow',l:'✨ Свечение'},
                    {v:'shine',l:'💫 Блик'},
                    {v:'shake',l:'〰 Встряска'},
                    {v:'gradient-shift',l:'🌈 Смена градиента'},
                  ]} />
        </Field>
      </Section>

      {/* ── Карточки внутри ── */}
      <Section id="card" title="🃏 Карточки (hover)">
        <Field label="Эффект при наведении">
          <Select v={s.cardHover || 'none'} onC={v => onChange({ cardHover: v as any })}
                  opts={[
                    {v:'none',l:'Без эффекта'},
                    {v:'lift',l:'↑ Поднимается'},
                    {v:'scale',l:'⤢ Увеличивается'},
                    {v:'glow',l:'✨ Подсвечивается'},
                    {v:'tilt',l:'🎴 3D-наклон'},
                    {v:'border-glow',l:'🌈 Градиентная рамка'},
                  ]} />
        </Field>
        <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
          Применяется к карточкам внутри features, reviews, team и т.д.
        </p>
      </Section>

      {/* ── Разделители ── */}
      <Section id="divider" title="〰 Разделители">
        <Field label="Сверху">
          <Select v={s.dividerTop || 'none'} onC={v => onChange({ dividerTop: v as any })}
                  opts={[
                    {v:'none',l:'Нет'},
                    {v:'wave',l:'🌊 Волна'},
                    {v:'triangle',l:'▲ Треугольник'},
                    {v:'curve',l:'⌒ Дуга'},
                    {v:'tilt',l:'/ Наклон'},
                    {v:'stairs',l:'▤ Ступеньки'},
                  ]} />
        </Field>
        <Field label="Снизу">
          <Select v={s.dividerBottom || 'none'} onC={v => onChange({ dividerBottom: v as any })}
                  opts={[
                    {v:'none',l:'Нет'},
                    {v:'wave',l:'🌊 Волна'},
                    {v:'triangle',l:'▲ Треугольник'},
                    {v:'curve',l:'⌒ Дуга'},
                    {v:'tilt',l:'/ Наклон'},
                    {v:'stairs',l:'▤ Ступеньки'},
                  ]} />
        </Field>
        {(s.dividerTop || s.dividerBottom) && (
          <Field label="Цвет разделителя">
            <div className="flex gap-2">
              <input type="color" value={s.dividerColor || '#0b1121'} onChange={e => onChange({ dividerColor: e.target.value })}
                     onBlur={commit} className="h-9 w-14 rounded cursor-pointer" />
              <Input v={s.dividerColor || ''} onC={v => onChange({ dividerColor: v || undefined })} onBlur={commit} placeholder="auto" />
            </div>
          </Field>
        )}
      </Section>

      {/* ── Анимация появления ── */}
      <Section id="anim" title="🎬 Анимация появления">
        <Field label="Эффект">
          <Select v={s.animation || 'none'} onC={v => onChange({ animation: v as any })}
                  opts={[
                    {v:'none',l:'Без анимации'},
                    {v:'fade-in',l:'Появление'},
                    {v:'fade-up',l:'Снизу вверх'},
                    {v:'fade-down',l:'Сверху вниз'},
                    {v:'slide-left',l:'Справа налево'},
                    {v:'slide-right',l:'Слева направо'},
                    {v:'zoom-in',l:'Увеличение'},
                    {v:'zoom-out',l:'Уменьшение'},
                  ]} />
        </Field>
        {s.animation && s.animation !== 'none' && (
          <Field label="Задержка (мс)">
            <Input type="number" v={s.animationDelay ?? 0} onC={v => onChange({ animationDelay: Number(v) || 0 })} onBlur={commit} />
          </Field>
        )}
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={!!s.staggerChildren} onChange={e => onChange({ staggerChildren: e.target.checked })} />
          🎭 Каскад (элементы по очереди)
        </label>
      </Section>

      {/* ── Декор ── */}
      <Section id="decor" title="✨ Декор">
        <Field label="Номер секции (01, 02...)">
          <Input v={s.sectionNumber || ''} onC={v => onChange({ sectionNumber: v || undefined })} onBlur={commit} placeholder="01" />
        </Field>
        {s.sectionNumber && (
          <Field label="Цвет номера">
            <div className="flex gap-2">
              <input type="color" value={s.sectionNumberColor || '#06b6d4'} onChange={e => onChange({ sectionNumberColor: e.target.value })}
                     onBlur={commit} className="h-9 w-14 rounded cursor-pointer" />
              <Input v={s.sectionNumberColor || ''} onC={v => onChange({ sectionNumberColor: v || undefined })} onBlur={commit} />
            </div>
          </Field>
        )}
        <Field label="Эффект на картинке">
          <Select v={s.imageEffect || 'none'} onC={v => onChange({ imageEffect: v as any })}
                  opts={[
                    {v:'none',l:'Нет'},
                    {v:'grayscale-hover',l:'ЧБ → цвет на hover'},
                    {v:'blur-hover',l:'Размытие → чёткость'},
                    {v:'zoom-hover',l:'Zoom на hover'},
                    {v:'rotate-hover',l:'Поворот на hover'},
                  ]} />
        </Field>
      </Section>

      {/* ── Видимость ── */}
      <Section id="visibility" title="👁 Видимость">
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={!!s.hideOnMobile} onChange={e => onChange({ hideOnMobile: e.target.checked })} />
          📱 Скрыть на мобильном
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={!!s.hideOnDesktop} onChange={e => onChange({ hideOnDesktop: e.target.checked })} />
          💻 Скрыть на десктопе
        </label>
      </Section>
    </div>
  )
}

// ── Shared inputs ────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--glass-border)',
  color: 'var(--text-primary)', outline: 'none',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
      {children}
    </div>
  )
}

function Input({ v, onC, onBlur, type = 'text', placeholder, className = '' }: {
  v: any; onC: (v: string) => void; onBlur?: () => void; type?: string; placeholder?: string; className?: string
}) {
  return (
    <input type={type} value={v ?? ''} onChange={e => onC(e.target.value)} onBlur={onBlur} placeholder={placeholder}
           className={`w-full px-3 py-2 rounded-lg text-sm ${className}`} style={inputStyle} />
  )
}

function Textarea({ v, onC, onBlur, rows = 3, placeholder, className = '' }: {
  v: any; onC: (v: string) => void; onBlur?: () => void; rows?: number; placeholder?: string; className?: string
}) {
  return (
    <textarea rows={rows} value={v ?? ''} onChange={e => onC(e.target.value)} onBlur={onBlur} placeholder={placeholder}
              className={`w-full px-3 py-2 rounded-lg text-sm resize-none ${className}`} style={inputStyle} />
  )
}

function Select({ v, onC, opts }: { v: any; onC: (v: string) => void; opts: { v: any; l: string }[] }) {
  return (
    <select value={v ?? ''} onChange={e => onC(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
      {opts.map((o, i) => <option key={i} value={o.v}>{o.l}</option>)}
    </select>
  )
}

// ── Items editor (shared for features/faq/reviews/steps/stats/timeline/team/logo_wall) ──
function ItemsEditor({ type, items, onChange, onBlur }: {
  type: string; items: any[]; onChange: (items: any[]) => void; onBlur?: () => void
}) {
  const addItem = () => {
    const template: Record<string, any> = {
      features:  { icon: 'shield', title: 'Новый пункт', text: 'Описание' },
      faq:       { q: 'Вопрос?', a: 'Ответ' },
      reviews:   { name: 'Имя', text: 'Отзыв', rating: 5 },
      steps:     { number: items.length + 1, title: 'Шаг', text: 'Описание' },
      stats:     { number: '100', label: 'Метрика' },
      timeline:  { date: 'Q1 2026', title: 'Этап', text: 'Описание', done: false },
      team:      { name: 'Имя', role: 'Роль', bio: 'Био', photo: '' },
      logo_wall: { name: 'Компания', url: '', link: '' },
    }
    onChange([...items, template[type] || {}])
  }
  const update = (idx: number, key: string, value: any) => {
    const next = [...items]
    next[idx] = { ...next[idx], [key]: value }
    onChange(next)
  }
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx))

  const iconOpts = [
    { v: 'shield', l: '🛡 Shield' }, { v: 'zap', l: '⚡ Zap' }, { v: 'globe', l: '🌍 Globe' },
    { v: 'lock', l: '🔒 Lock' }, { v: 'check', l: '✅ Check' }, { v: 'star', l: '⭐ Star' },
    { v: 'wifi', l: '📶 Wifi' }, { v: 'phone', l: '📱 Phone' }, { v: 'server', l: '🖥 Server' },
    { v: 'users', l: '👥 Users' }, { v: 'gift', l: '🎁 Gift' }, { v: 'chat', l: '💬 Chat' },
    { v: 'rocket', l: '🚀 Rocket' }, { v: 'award', l: '🏆 Award' }, { v: 'target', l: '🎯 Target' },
    { v: 'heart', l: '❤️ Heart' }, { v: 'sparkles', l: '✨ Sparkles' },
  ]

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
        Элементы ({items.length})
      </div>
      {items.map((item, idx) => (
        <div key={idx} className="p-3 rounded-lg space-y-2 relative"
             style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
          <button onClick={() => remove(idx)} className="absolute top-2 right-2 p-1" style={{ color: '#ef4444' }}>
            <Trash2 className="w-3 h-3" />
          </button>
          {type === 'features' && (
            <>
              <Select v={item.icon} onC={v => update(idx, 'icon', v)} opts={iconOpts} />
              <Input v={item.title} onC={v => update(idx, 'title', v)} onBlur={onBlur} placeholder="Заголовок" />
              <Textarea rows={2} v={item.text} onC={v => update(idx, 'text', v)} onBlur={onBlur} placeholder="Описание" />
            </>
          )}
          {type === 'faq' && (
            <>
              <Input v={item.q} onC={v => update(idx, 'q', v)} onBlur={onBlur} placeholder="Вопрос" />
              <Textarea rows={2} v={item.a} onC={v => update(idx, 'a', v)} onBlur={onBlur} placeholder="Ответ" />
            </>
          )}
          {type === 'reviews' && (
            <>
              <Input v={item.name} onC={v => update(idx, 'name', v)} onBlur={onBlur} placeholder="Имя" />
              <Textarea rows={2} v={item.text} onC={v => update(idx, 'text', v)} onBlur={onBlur} placeholder="Отзыв" />
              <Input type="number" v={item.rating || 5} onC={v => update(idx, 'rating', Number(v))} onBlur={onBlur} placeholder="1-5" />
            </>
          )}
          {type === 'steps' && (
            <>
              <Input v={item.number} onC={v => update(idx, 'number', v)} onBlur={onBlur} placeholder="Номер" />
              <Input v={item.title} onC={v => update(idx, 'title', v)} onBlur={onBlur} placeholder="Заголовок" />
              <Textarea rows={2} v={item.text} onC={v => update(idx, 'text', v)} onBlur={onBlur} placeholder="Описание" />
            </>
          )}
          {type === 'stats' && (
            <>
              <Input v={item.number} onC={v => update(idx, 'number', v)} onBlur={onBlur} placeholder="Число" />
              <Input v={item.label} onC={v => update(idx, 'label', v)} onBlur={onBlur} placeholder="Подпись" />
            </>
          )}
          {type === 'timeline' && (
            <>
              <Input v={item.date} onC={v => update(idx, 'date', v)} onBlur={onBlur} placeholder="Q1 2026" />
              <Input v={item.title} onC={v => update(idx, 'title', v)} onBlur={onBlur} placeholder="Название этапа" />
              <Textarea rows={2} v={item.text} onC={v => update(idx, 'text', v)} onBlur={onBlur} placeholder="Описание" />
              <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={!!item.done} onChange={e => update(idx, 'done', e.target.checked)} />
                Завершён
              </label>
            </>
          )}
          {type === 'team' && (
            <>
              <Input v={item.name} onC={v => update(idx, 'name', v)} onBlur={onBlur} placeholder="Имя" />
              <Input v={item.role} onC={v => update(idx, 'role', v)} onBlur={onBlur} placeholder="Должность" />
              <Input v={item.photo} onC={v => update(idx, 'photo', v)} onBlur={onBlur} placeholder="URL фото" />
              <Textarea rows={2} v={item.bio} onC={v => update(idx, 'bio', v)} onBlur={onBlur} placeholder="О себе" />
            </>
          )}
          {type === 'logo_wall' && (
            <>
              <Input v={item.name} onC={v => update(idx, 'name', v)} onBlur={onBlur} placeholder="Имя (если без картинки)" />
              <Input v={item.url} onC={v => update(idx, 'url', v)} onBlur={onBlur} placeholder="URL логотипа" />
              <Input v={item.link} onC={v => update(idx, 'link', v)} onBlur={onBlur} placeholder="Ссылка (опц.)" />
            </>
          )}
        </div>
      ))}
      <button onClick={addItem}
              className="w-full flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium"
              style={{ background: 'var(--surface-2)', border: '1px dashed var(--glass-border)', color: 'var(--accent-1)' }}>
        <Plus className="w-3 h-3" /> Добавить
      </button>
    </div>
  )
}

// ── Pricing table plans editor ───────────────────────────────
function PlansEditor({ plans, features, onChange, onBlur }: {
  plans: any[]; features: string[]; onChange: (plans: any[]) => void; onBlur?: () => void
}) {
  const add = () => onChange([...plans, { name: 'Новый тариф', price: '', values: features.map(() => 'no'), buttonText: 'Выбрать' }])
  const upd = (i: number, key: string, v: any) => {
    const next = [...plans]; next[i] = { ...next[i], [key]: v }; onChange(next)
  }
  const updVal = (i: number, fi: number, v: any) => {
    const next = [...plans]
    const vals = [...(next[i].values || [])]; vals[fi] = v
    next[i] = { ...next[i], values: vals }; onChange(next)
  }
  const remove = (i: number) => onChange(plans.filter((_, j) => j !== i))
  return (
    <div className="space-y-2">
      {plans.map((p, i) => (
        <div key={i} className="p-3 rounded-lg space-y-2 relative"
             style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
          <button onClick={() => remove(i)} className="absolute top-2 right-2 p-1" style={{ color: '#ef4444' }}>
            <Trash2 className="w-3 h-3" />
          </button>
          <Input v={p.name} onC={v => upd(i, 'name', v)} onBlur={onBlur} placeholder="Название" />
          <Input v={p.price} onC={v => upd(i, 'price', v)} onBlur={onBlur} placeholder="Цена" />
          <label className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={!!p.highlighted} onChange={e => upd(i, 'highlighted', e.target.checked)} /> Выделить
          </label>
          <div className="space-y-1 mt-2">
            {features.map((f, fi) => (
              <div key={fi} className="flex items-center gap-2">
                <span className="flex-1 text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>{f}</span>
                <Select v={p.values?.[fi] || 'no'} onC={v => updVal(i, fi, v)}
                        opts={[{v:'yes',l:'✅'}, {v:'no',l:'—'}, {v:'custom',l:'Текст...'}]} />
                {p.values?.[fi] === 'custom' && (
                  <Input v={p.custom?.[fi] || ''} onC={v => updVal(i, fi, v)} onBlur={onBlur} />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <button onClick={add}
              className="w-full flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium"
              style={{ background: 'var(--surface-2)', border: '1px dashed var(--glass-border)', color: 'var(--accent-1)' }}>
        <Plus className="w-3 h-3" /> Добавить тариф
      </button>
    </div>
  )
}
