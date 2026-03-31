'use client'

import { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, Tag, Copy, CheckCircle2, BarChart3, Users, X } from 'lucide-react'
import { adminApi } from '@/lib/api'
import toast from 'react-hot-toast'

const TYPES = [
  { value: 'bonus_days', label: 'Бонус дни' },
  { value: 'discount',   label: 'Скидка' },
  { value: 'balance',    label: 'Баланс' },
  { value: 'trial',      label: 'Пробный' },
]

const TYPE_COLORS: Record<string, string> = {
  bonus_days: '#8b5cf6',
  discount:   '#06b6d4',
  balance:    '#10b981',
  trial:      '#f59e0b',
}

interface PromoForm {
  id?: string
  code: string
  type: string
  bonusDays?: number | null
  discountPct?: number | null
  tariffIds: string[]
  balanceAmount?: number | null
  maxUses?: number | null
  maxUsesPerUser: number
  expiresAt?: string | null
  isActive: boolean
  description?: string
}

const emptyForm: PromoForm = {
  code: '', type: 'bonus_days', bonusDays: 7, discountPct: null,
  tariffIds: [], balanceAmount: null, maxUses: null, maxUsesPerUser: 1,
  expiresAt: null, isActive: true, description: '',
}

export default function AdminPromosPage() {
  const [promos, setPromos]     = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState<PromoForm | null>(null)
  const [saving, setSaving]     = useState(false)
  const [tariffs, setTariffs]   = useState<any[]>([])
  const [copied, setCopied]     = useState<string | null>(null)

  const load = () => {
    adminApi.promos().then(setPromos).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    adminApi.tariffs().then(setTariffs).catch(() => {})
  }, [])

  const save = async () => {
    if (!editing?.code) return
    setSaving(true)
    try {
      const payload: any = {
        ...editing,
        expiresAt: editing.expiresAt || null,
      }
      // Clean up type-irrelevant fields
      if (editing.type !== 'bonus_days') payload.bonusDays = null
      if (editing.type !== 'discount') { payload.discountPct = null; payload.tariffIds = [] }
      if (editing.type !== 'balance') payload.balanceAmount = null

      if (editing.id) {
        await adminApi.updatePromo(editing.id, payload)
      } else {
        await adminApi.createPromo(payload)
      }
      setEditing(null)
      load()
    } catch (e: any) {
      alert(e.message || 'Ошибка сохранения')
    } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Удалить промокод?')) return
    await adminApi.deletePromo(id)
    load()
  }

  const [stats, setStats] = useState<any>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  const showStats = async (id: string) => {
    setStatsLoading(true)
    try {
      const data = await adminApi.promoStats(id)
      setStats(data)
    } catch { toast.error('Ошибка загрузки статистики') }
    finally { setStatsLoading(false) }
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  const editPromo = (p: any) => {
    setEditing({
      id: p.id,
      code: p.code,
      type: p.type,
      bonusDays: p.bonusDays,
      discountPct: p.discountPct,
      tariffIds: p.tariffIds || [],
      balanceAmount: p.balanceAmount,
      maxUses: p.maxUses,
      maxUsesPerUser: p.maxUsesPerUser ?? 1,
      expiresAt: p.expiresAt ? new Date(p.expiresAt).toISOString().slice(0, 16) : null,
      isActive: p.isActive,
      description: p.description || '',
    })
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Tag className="w-6 h-6" style={{ color: 'var(--accent-1)' }} /> Промокоды
        </h1>
        <button onClick={() => setEditing({ ...emptyForm })} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Создать
        </button>
      </div>

      {/* Edit / Create Form */}
      {editing && (
        <div className="glass-card gradient-border animate-scale-in space-y-4">
          <h2 className="font-semibold text-lg">{editing.id ? 'Редактировать' : 'Новый промокод'}</h2>

          {/* Type tabs */}
          <div className="flex gap-2 flex-wrap">
            {TYPES.map(t => (
              <button key={t.value}
                      onClick={() => setEditing({ ...editing, type: t.value })}
                      className="px-4 py-2 rounded-xl text-xs font-medium transition-all"
                      style={{
                        background: editing.type === t.value ? `${TYPE_COLORS[t.value]}20` : 'var(--glass-bg)',
                        border: `1px solid ${editing.type === t.value ? TYPE_COLORS[t.value] : 'var(--glass-border)'}`,
                        color: editing.type === t.value ? TYPE_COLORS[t.value] : 'var(--text-secondary)',
                      }}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Код</label>
              <input className="glass-input uppercase" placeholder="PROMO2024"
                     value={editing.code}
                     onChange={e => setEditing({ ...editing, code: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Описание</label>
              <input className="glass-input" placeholder="Описание промокода"
                     value={editing.description || ''}
                     onChange={e => setEditing({ ...editing, description: e.target.value })} />
            </div>
          </div>

          {/* Type-specific fields */}
          {editing.type === 'bonus_days' && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Бонусных дней</label>
              <input className="glass-input" type="number" min={1} placeholder="7"
                     value={editing.bonusDays ?? ''}
                     onChange={e => setEditing({ ...editing, bonusDays: Number(e.target.value) || null })} />
            </div>
          )}

          {editing.type === 'discount' && (
            <>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Скидка (%)</label>
                <input className="glass-input" type="number" min={1} max={100} placeholder="10"
                       value={editing.discountPct ?? ''}
                       onChange={e => setEditing({ ...editing, discountPct: Number(e.target.value) || null })} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>
                  Тарифы (пусто = все)
                </label>
                <div className="flex flex-wrap gap-2">
                  {tariffs.map((t: any) => {
                    const selected = editing.tariffIds.includes(t.id)
                    return (
                      <button key={t.id}
                              onClick={() => {
                                const ids = selected
                                  ? editing.tariffIds.filter(x => x !== t.id)
                                  : [...editing.tariffIds, t.id]
                                setEditing({ ...editing, tariffIds: ids })
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs transition-all"
                              style={{
                                background: selected ? 'rgba(6,182,212,0.15)' : 'var(--glass-bg)',
                                border: `1px solid ${selected ? '#06b6d4' : 'var(--glass-border)'}`,
                                color: selected ? '#06b6d4' : 'var(--text-secondary)',
                              }}>
                        {t.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {editing.type === 'balance' && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Сумма (руб.)</label>
              <input className="glass-input" type="number" min={1} placeholder="100"
                     value={editing.balanceAmount ?? ''}
                     onChange={e => setEditing({ ...editing, balanceAmount: Number(e.target.value) || null })} />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Макс. использований</label>
              <input className="glass-input" type="number" min={1} placeholder="Без лимита"
                     value={editing.maxUses ?? ''}
                     onChange={e => setEditing({ ...editing, maxUses: Number(e.target.value) || null })} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>На пользователя</label>
              <input className="glass-input" type="number" min={1} placeholder="1"
                     value={editing.maxUsesPerUser}
                     onChange={e => setEditing({ ...editing, maxUsesPerUser: Number(e.target.value) || 1 })} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Истекает</label>
              <input className="glass-input" type="datetime-local"
                     value={editing.expiresAt || ''}
                     onChange={e => setEditing({ ...editing, expiresAt: e.target.value || null })} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={editing.isActive}
                     onChange={e => setEditing({ ...editing, isActive: e.target.checked })}
                     className="accent-purple-500" />
              <span style={{ color: 'var(--text-secondary)' }}>Активен</span>
            </label>
          </div>

          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="btn-primary text-sm flex-1">
              {saving ? 'Сохраняю...' : 'Сохранить'}
            </button>
            <button onClick={() => setEditing(null)} className="btn-secondary text-sm">Отмена</button>
          </div>
        </div>
      )}

      {/* Promos list */}
      {loading ? (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>Загрузка...</div>
      ) : promos.length === 0 ? (
        <div className="glass-card text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
          Промокоды не созданы
        </div>
      ) : (
        <div className="grid gap-3">
          {promos.map(p => (
            <div key={p.id} className="glass-card !p-4 flex flex-col md:flex-row md:items-center gap-3">
              {/* Code & badge */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                     style={{ background: `${TYPE_COLORS[p.type] || '#8b5cf6'}15` }}>
                  <Tag className="w-5 h-5" style={{ color: TYPE_COLORS[p.type] || '#8b5cf6' }} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <button onClick={() => copyCode(p.code)}
                            className="font-mono font-bold text-sm hover:opacity-70 transition-opacity flex items-center gap-1"
                            style={{ color: 'var(--text-primary)' }}>
                      {p.code}
                      {copied === p.code
                        ? <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--success)' }} />
                        : <Copy className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />}
                    </button>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{
                            background: `${TYPE_COLORS[p.type] || '#8b5cf6'}15`,
                            color: TYPE_COLORS[p.type] || '#8b5cf6',
                          }}>
                      {TYPES.find(t => t.value === p.type)?.label || p.type}
                    </span>
                    {!p.isActive && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                        Неактивен
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>{p.description}</p>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                {p.type === 'bonus_days' && p.bonusDays && (
                  <span>+{p.bonusDays} дн.</span>
                )}
                {p.type === 'discount' && p.discountPct && (
                  <span>-{p.discountPct}%</span>
                )}
                {p.type === 'balance' && p.balanceAmount && (
                  <span>+{p.balanceAmount} руб.</span>
                )}
                <span>{p.usedCount}{p.maxUses ? `/${p.maxUses}` : ''} исп.</span>
                {p.expiresAt && (
                  <span>
                    до {new Date(p.expiresAt).toLocaleDateString('ru-RU')}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => showStats(p.id)}
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                        style={{ color: 'var(--text-tertiary)' }}
                        title="Статистика">
                  <BarChart3 className="w-4 h-4" />
                </button>
                <button onClick={() => editPromo(p)}
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                        style={{ color: 'var(--text-tertiary)' }}>
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => remove(p.id)}
                        className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                        style={{ color: 'var(--text-tertiary)' }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats modal */}
      {stats && (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setStats(null)} />
          <div className="fixed inset-0 md:absolute md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg md:rounded-2xl md:max-h-[90vh] overflow-y-auto p-5 pb-24 md:p-6 md:pb-8"
               style={{ background: 'var(--surface-2)', boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}>
            <button onClick={() => setStats(null)} className="sticky top-0 float-right p-2 rounded-xl z-10 hover:bg-white/5"
                    style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)' }}>
              <X className="w-4 h-4" />
            </button>
            <div className="clear-both space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />
                Статистика: {stats.promo?.code}
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl text-center" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <p className="text-xl font-bold">{stats.totalActivated}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Активировали</p>
                </div>
                {stats.promo?.type === 'discount' && (
                  <div className="p-3 rounded-xl text-center" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                    <p className="text-xl font-bold" style={{ color: 'var(--success)' }}>{stats.totalUsedForPurchase}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Купили по скидке</p>
                  </div>
                )}
              </div>

              {stats.usages?.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Кто активировал</p>
                  {stats.usages.map((u: any) => (
                    <div key={u.userId} className="flex items-center justify-between p-2.5 rounded-xl"
                         style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                      <div>
                        <p className="text-sm font-medium">{u.name}</p>
                        <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                          {new Date(u.activatedAt).toLocaleString('ru')}
                        </p>
                      </div>
                      {stats.promo?.type === 'discount' && (
                        <span className={u.usedForPurchase ? 'badge-green' : 'badge-gray'}>
                          {u.usedForPurchase ? 'Купил' : 'Не купил'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-center py-6" style={{ color: 'var(--text-tertiary)' }}>Никто ещё не активировал</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
