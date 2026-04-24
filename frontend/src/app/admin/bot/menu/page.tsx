'use client'

import { useEffect, useState, useCallback } from 'react'
import { adminApi } from '@/lib/api'
import toast from 'react-hot-toast'
import { Plus, Trash2, Save, RotateCcw, ArrowUp, ArrowDown, GripVertical, Eye, EyeOff, Shield } from 'lucide-react'

type LinkType = 'callback' | 'url' | 'webapp' | 'block'

interface MenuItem {
  id: string
  label: string
  linkType: LinkType
  payload: string
  row: number
  col: number
  sortOrder: number
  isActive: boolean
  staffOnly: boolean
}

interface BotBlockLite {
  id: string
  name: string
  type: string
}

const LINK_TYPE_LABELS: Record<LinkType, string> = {
  callback: 'Callback (меню)',
  url:      'Внешняя ссылка',
  webapp:   'Mini App (WebApp)',
  block:    'Блок конструктора',
}

const LINK_TYPE_HINTS: Record<LinkType, string> = {
  callback: 'Например menu:tariffs, menu:balance. Legacy-хендлер бота перенаправит пользователя в /start-flow через соответствующий блок конструктора.',
  url:      'Прямая ссылка, откроется в браузере (https://…)',
  webapp:   'URL, открывающийся внутри Mini App в Telegram. Например {appUrl}/dashboard',
  block:    'Выберите блок из конструктора бота — пользователь сразу попадёт в него.',
}

const CALLBACK_PRESETS: Array<{ label: string; payload: string }> = [
  { label: '🔑 Подписка',   payload: 'menu:subscription' },
  { label: '💳 Тарифы',     payload: 'menu:tariffs' },
  { label: '👥 Рефералы',   payload: 'menu:referral' },
  { label: '💰 Баланс',     payload: 'menu:balance' },
  { label: '🎟 Промокод',   payload: 'menu:promo' },
  { label: '📱 Устройства', payload: 'menu:devices' },
  { label: '📖 Инструкции', payload: 'menu:instructions' },
  { label: '🏠 Главное меню', payload: 'menu:main' },
  { label: '⚙️ Админ-панель', payload: 'menu:admin_panel' },
]

export default function BotMenuPage() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [blocks, setBlocks] = useState<BotBlockLite[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [menu, blk] = await Promise.all([
        adminApi.listBotMenu(),
        adminApi.botBlocksList().catch(() => []),
      ])
      setItems(menu as MenuItem[])
      setBlocks(blk as BotBlockLite[])
    } catch (e: any) {
      toast.error('Не удалось загрузить меню: ' + (e.message || ''))
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const addItem = async () => {
    try {
      const last = items[items.length - 1]
      const newItem = await adminApi.createBotMenuItem({
        label:     'Новая кнопка',
        linkType:  'callback',
        payload:   'menu:tariffs',
        row:       last ? last.row + 1 : 0,
        col:       0,
        sortOrder: items.length,
        isActive:  true,
        staffOnly: false,
      })
      setItems(prev => [...prev, newItem as MenuItem])
      toast.success('Кнопка добавлена')
    } catch (e: any) {
      toast.error('Ошибка: ' + (e.message || ''))
    }
  }

  const updateItem = async (id: string, patch: Partial<MenuItem>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  }

  const saveItem = async (item: MenuItem) => {
    setSaving(true)
    try {
      await adminApi.updateBotMenuItem(item.id, {
        label:     item.label,
        linkType:  item.linkType,
        payload:   item.payload,
        row:       item.row,
        col:       item.col,
        sortOrder: item.sortOrder,
        isActive:  item.isActive,
        staffOnly: item.staffOnly,
      })
      toast.success('Сохранено')
    } catch (e: any) {
      toast.error('Ошибка: ' + (e.message || ''))
    }
    setSaving(false)
  }

  const deleteItem = async (id: string) => {
    if (!confirm('Удалить кнопку?')) return
    try {
      await adminApi.deleteBotMenuItem(id)
      setItems(prev => prev.filter(i => i.id !== id))
      toast.success('Удалено')
    } catch (e: any) {
      toast.error('Ошибка: ' + (e.message || ''))
    }
  }

  const resetDefaults = async () => {
    if (!confirm('Удалить все кнопки и восстановить набор по умолчанию?')) return
    try {
      const fresh = await adminApi.resetBotMenuDefaults()
      setItems(fresh as MenuItem[])
      toast.success('Меню сброшено к умолчаниям')
    } catch (e: any) {
      toast.error('Ошибка: ' + (e.message || ''))
    }
  }

  const moveItem = async (id: string, delta: number) => {
    const idx = items.findIndex(i => i.id === id)
    if (idx < 0) return
    const target = idx + delta
    if (target < 0 || target >= items.length) return
    const a = items[idx], b = items[target]
    const newItems = [...items]
    newItems[idx] = b
    newItems[target] = a
    setItems(newItems)
    try {
      await adminApi.reorderBotMenu(newItems.map((i, n) => ({
        id: i.id, row: i.row, col: i.col, sortOrder: n,
      })))
    } catch (e: any) {
      toast.error('Не удалось изменить порядок: ' + (e.message || ''))
    }
  }

  // Group items by row for preview
  const preview = (() => {
    const byRow = new Map<number, MenuItem[]>()
    for (const it of items) {
      if (!it.isActive) continue
      if (!byRow.has(it.row)) byRow.set(it.row, [])
      byRow.get(it.row)!.push(it)
    }
    const rowNums = [...byRow.keys()].sort((a, b) => a - b)
    return rowNums.map(r => ({
      row: r,
      items: byRow.get(r)!.sort((a, b) => a.col - b.col),
    }))
  })()

  if (loading) {
    return (
      <div className="p-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
        Загрузка…
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Меню бота</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Inline-клавиатура, которую пользователи видят в сообщениях после оплаты, реферала и системных уведомлений.
            Если таблица пуста — бот показывает набор по умолчанию.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={resetDefaults}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
            <RotateCcw className="w-4 h-4" /> Сбросить
          </button>
          <button onClick={addItem}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: 'var(--accent-1)' }}>
            <Plus className="w-4 h-4" /> Добавить кнопку
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Левая часть — список ────────────────────── */}
        <div className="lg:col-span-2 space-y-3">
          {items.length === 0 && (
            <div className="p-8 rounded-lg text-center"
                 style={{ background: 'var(--surface-1)', border: '1px dashed var(--glass-border)', color: 'var(--text-tertiary)' }}>
              Меню пусто — бот использует набор по умолчанию.
              Нажмите «Добавить кнопку» или «Сбросить», чтобы начать редактирование.
            </div>
          )}

          {items.map((item, idx) => (
            <div key={item.id}
                 className="p-4 rounded-lg space-y-3"
                 style={{
                   background: 'var(--surface-1)',
                   border: `1px solid ${item.isActive ? 'var(--glass-border)' : 'rgba(239,68,68,0.3)'}`,
                   opacity: item.isActive ? 1 : 0.6,
                 }}>
              <div className="flex items-start gap-2">
                <div className="flex flex-col gap-1 pt-1">
                  <button onClick={() => moveItem(item.id, -1)} disabled={idx === 0}
                          className="p-0.5 rounded hover:bg-white/10 disabled:opacity-30">
                    <ArrowUp className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                  </button>
                  <GripVertical className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                  <button onClick={() => moveItem(item.id, 1)} disabled={idx === items.length - 1}
                          className="p-0.5 rounded hover:bg-white/10 disabled:opacity-30">
                    <ArrowDown className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                  </button>
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <input type="text" value={item.label} onChange={e => updateItem(item.id, { label: e.target.value })}
                           onBlur={() => saveItem(item)}
                           className="flex-1 px-3 py-2 rounded-lg text-sm font-medium"
                           style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                           placeholder="Текст кнопки (например 🔑 Подписка)" />
                    <button onClick={() => updateItem(item.id, { isActive: !item.isActive }).then(() => saveItem({ ...item, isActive: !item.isActive }))}
                            title={item.isActive ? 'Скрыть' : 'Показать'}
                            className="p-2 rounded-lg"
                            style={{
                              background: item.isActive ? 'rgba(34,197,94,0.13)' : 'rgba(239,68,68,0.13)',
                              color: item.isActive ? '#22c55e' : '#ef4444',
                            }}>
                      {item.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button onClick={() => updateItem(item.id, { staffOnly: !item.staffOnly }).then(() => saveItem({ ...item, staffOnly: !item.staffOnly }))}
                            title={item.staffOnly ? 'Только админам' : 'Всем пользователям'}
                            className="p-2 rounded-lg"
                            style={{
                              background: item.staffOnly ? 'rgba(245,158,11,0.13)' : 'var(--surface-2)',
                              color: item.staffOnly ? '#f59e0b' : 'var(--text-tertiary)',
                            }}>
                      <Shield className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteItem(item.id)}
                            className="p-2 rounded-lg hover:bg-red-500/20">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div className="col-span-2">
                      <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Тип ссылки</label>
                      <select value={item.linkType}
                              onChange={e => updateItem(item.id, { linkType: e.target.value as LinkType })}
                              onBlur={() => saveItem(item)}
                              className="w-full px-2 py-1.5 rounded-lg text-xs"
                              style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                        {(Object.keys(LINK_TYPE_LABELS) as LinkType[]).map(t => (
                          <option key={t} value={t}>{LINK_TYPE_LABELS[t]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Ряд</label>
                      <input type="number" value={item.row}
                             onChange={e => updateItem(item.id, { row: +e.target.value })}
                             onBlur={() => saveItem(item)}
                             className="w-full px-2 py-1.5 rounded-lg text-xs"
                             style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                    </div>
                    <div>
                      <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Колонка</label>
                      <input type="number" value={item.col}
                             onChange={e => updateItem(item.id, { col: +e.target.value })}
                             onBlur={() => saveItem(item)}
                             className="w-full px-2 py-1.5 rounded-lg text-xs"
                             style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                    </div>
                  </div>

                  {/* Payload editor — varies by link type */}
                  {item.linkType === 'block' ? (
                    <div>
                      <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Блок конструктора</label>
                      <select value={item.payload}
                              onChange={e => updateItem(item.id, { payload: e.target.value })}
                              onBlur={() => saveItem(item)}
                              className="w-full px-2 py-1.5 rounded-lg text-xs"
                              style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                        <option value="">— не выбран —</option>
                        {blocks.map(b => (
                          <option key={b.id} value={b.id}>{b.name} ({b.type})</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-tertiary)' }}>
                        {item.linkType === 'callback' ? 'Callback data'
                          : item.linkType === 'url' ? 'URL'
                          : 'WebApp URL'}
                      </label>
                      <input type="text" value={item.payload}
                             onChange={e => updateItem(item.id, { payload: e.target.value })}
                             onBlur={() => saveItem(item)}
                             className="w-full px-2 py-1.5 rounded-lg text-xs font-mono"
                             style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                             placeholder={item.linkType === 'callback' ? 'menu:tariffs' : 'https://...'} />
                    </div>
                  )}

                  {item.linkType === 'callback' && (
                    <div className="flex flex-wrap gap-1">
                      {CALLBACK_PRESETS.map(p => (
                        <button key={p.payload}
                                onClick={() => {
                                  const patched = { ...item, label: p.label, payload: p.payload }
                                  setItems(prev => prev.map(i => i.id === item.id ? patched : i))
                                  saveItem(patched)
                                }}
                                className="px-2 py-1 rounded text-[10px]"
                                style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-tertiary)' }}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="text-[10px]" style={{ color: 'var(--text-tertiary)', opacity: 0.7 }}>
                    {LINK_TYPE_HINTS[item.linkType]}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Правая часть — превью ────────────────────── */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 p-4 rounded-lg"
               style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
            <div className="text-xs font-semibold mb-3" style={{ color: 'var(--text-tertiary)' }}>
              Превью (Telegram-inline-клавиатура)
            </div>
            <div className="p-3 rounded-lg space-y-1.5"
                 style={{ background: 'var(--surface-2)' }}>
              {preview.length === 0 && (
                <div className="text-xs text-center py-4" style={{ color: 'var(--text-tertiary)' }}>
                  Нет активных кнопок — бот покажет дефолты
                </div>
              )}
              {preview.map(row => (
                <div key={row.row} className="flex gap-1">
                  {row.items.map(it => (
                    <div key={it.id}
                         className="flex-1 py-2 px-2 rounded text-center text-[11px] font-medium truncate"
                         title={`${it.linkType} → ${it.payload}`}
                         style={{
                           background: it.staffOnly ? 'rgba(245,158,11,0.13)' : 'rgba(6,182,212,0.13)',
                           color: it.staffOnly ? '#f59e0b' : '#a78bfa',
                           border: `1px solid ${it.staffOnly ? 'rgba(245,158,11,0.3)' : 'rgba(6,182,212,0.3)'}`,
                         }}>
                      {it.label}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="text-[10px] mt-3 space-y-1" style={{ color: 'var(--text-tertiary)' }}>
              <div>🛡 <strong>Оранжевые</strong> — только администраторам/редакторам</div>
              <div>🔵 <strong>Синие</strong> — всем пользователям</div>
              <div>👁 — <EyeOff className="w-3 h-3 inline" /> скрытые тут не показаны</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
