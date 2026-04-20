'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  Plus, Trash2, Edit3, Eye, EyeOff, Workflow,
  CreditCard, Wrench, Undo2, Package, MessageCircle, Loader2,
} from 'lucide-react'
import { adminApi } from '@/lib/api'

type WizardCategory = 'BILLING' | 'TECH' | 'REFUND' | 'SUBSCRIPTION' | 'OTHER'

interface Wizard {
  id: string
  category: WizardCategory
  title: string
  icon: string | null
  description: string | null
  enabled: boolean
  entryNodeId: string | null
  sortOrder: number
  nodes: any[]
}

const CATEGORY_META: Record<WizardCategory, { label: string; icon: any; color: string }> = {
  BILLING:      { label: 'Платёж',    icon: CreditCard,  color: '#f59e0b' },
  TECH:         { label: 'Технический вопрос', icon: Wrench, color: '#06b6d4' },
  REFUND:       { label: 'Возврат',   icon: Undo2,       color: '#ef4444' },
  SUBSCRIPTION: { label: 'Подписка',  icon: Package,     color: '#8b5cf6' },
  OTHER:        { label: 'Другое',    icon: MessageCircle, color: '#64748b' },
}

export default function SupportWizardsPage() {
  const [wizards, setWizards] = useState<Wizard[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingCat, setCreatingCat] = useState<WizardCategory | null>(null)

  const load = async () => {
    try {
      const data = await adminApi.listSupportWizards()
      setWizards(data || [])
    } catch (e: any) {
      toast.error(e.message || 'Не удалось загрузить визарды')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggleEnabled = async (w: Wizard) => {
    try {
      await adminApi.updateSupportWizard(w.id, { enabled: !w.enabled })
      setWizards(prev => prev.map(x => x.id === w.id ? { ...x, enabled: !x.enabled } : x))
      toast.success(w.enabled ? 'Визард выключен' : 'Визард включён')
    } catch (e: any) {
      toast.error(e.message || 'Ошибка')
    }
  }

  const deleteWizard = async (w: Wizard) => {
    if (!confirm(`Удалить визард «${w.title}»?`)) return
    try {
      await adminApi.deleteSupportWizard(w.id)
      setWizards(prev => prev.filter(x => x.id !== w.id))
      toast.success('Удалено')
    } catch (e: any) {
      toast.error(e.message || 'Ошибка')
    }
  }

  const createFor = async (cat: WizardCategory) => {
    const meta = CATEGORY_META[cat]
    setCreatingCat(cat)
    try {
      const created = await adminApi.createSupportWizard({
        category: cat,
        title: meta.label,
        icon: null,
        enabled: false,
        sortOrder: wizards.length * 10 + 10,
      })
      setWizards(prev => [...prev, { ...created, nodes: [] }])
      toast.success('Визард создан')
    } catch (e: any) {
      toast.error(e.message || 'Ошибка')
    } finally {
      setCreatingCat(null)
    }
  }

  const missingCategories: WizardCategory[] = (Object.keys(CATEGORY_META) as WizardCategory[])
    .filter(c => !wizards.some(w => w.category === c))

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Workflow className="w-6 h-6" style={{ color: 'var(--accent-1)' }} />
            Визарды тикетов
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Настраивай пошаговое создание тикетов для пользователей. Поддерживаются ветвления между вопросами.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-1)' }} />
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {wizards.map(w => {
              const meta = CATEGORY_META[w.category]
              const Icon = meta.icon
              return (
                <div key={w.id} className="glass rounded-2xl p-4 flex items-center gap-4"
                     style={{ opacity: w.enabled ? 1 : 0.7 }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
                       style={{ background: `${meta.color}22`, color: meta.color }}>
                    {w.icon || <Icon className="w-6 h-6" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {w.title}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: `${meta.color}1a`, color: meta.color }}>
                        {meta.label}
                      </span>
                      {!w.entryNodeId && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                          Нет стартового узла
                        </span>
                      )}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      {w.nodes.length} узлов · {w.description || '—'}
                    </div>
                  </div>
                  <button onClick={() => toggleEnabled(w)}
                          className="p-2 rounded-lg transition hover:bg-white/5"
                          title={w.enabled ? 'Выключить' : 'Включить'}>
                    {w.enabled
                      ? <Eye className="w-5 h-5" style={{ color: '#22c55e' }} />
                      : <EyeOff className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />}
                  </button>
                  <Link href={`/admin/support-wizards/${w.id}/builder`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition"
                        style={{ background: 'var(--accent-1)', color: 'white' }}>
                    <Edit3 className="w-4 h-4" /> Редактор
                  </Link>
                  <button onClick={() => deleteWizard(w)}
                          className="p-2 rounded-lg transition hover:bg-red-500/10 hover:text-red-400"
                          style={{ color: 'var(--text-tertiary)' }}
                          title="Удалить">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              )
            })}
            {wizards.length === 0 && (
              <div className="text-center py-12 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Ни одного визарда пока не создано.
              </div>
            )}
          </div>

          {missingCategories.length > 0 && (
            <div className="mt-8">
              <div className="text-xs font-semibold uppercase tracking-wider mb-2"
                   style={{ color: 'var(--text-tertiary)' }}>
                Создать визард для категории
              </div>
              <div className="flex flex-wrap gap-2">
                {missingCategories.map(cat => {
                  const meta = CATEGORY_META[cat]
                  const Icon = meta.icon
                  return (
                    <button key={cat} onClick={() => createFor(cat)}
                            disabled={creatingCat === cat}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition glass hover:bg-white/5"
                            style={{ color: 'var(--text-primary)' }}>
                      {creatingCat === cat
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Plus className="w-4 h-4" style={{ color: meta.color }} />}
                      <Icon className="w-4 h-4" style={{ color: meta.color }} />
                      {meta.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
