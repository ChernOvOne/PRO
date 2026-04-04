'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Edit2, Trash2, Search, ChevronLeft, ChevronRight,
  Calendar, ArrowUpRight, ArrowDownRight, TrendingUp,
  DollarSign, X, AlertCircle, Check, Clock,
} from 'lucide-react'
import { adminApi } from '@/lib/api'
import toast from 'react-hot-toast'

/* ── Types ─────────────────────────────────────────────────── */

interface Category {
  id: string
  name: string
  color: string
  type: 'INCOME' | 'EXPENSE'
}

interface Transaction {
  id: string
  type: 'INCOME' | 'EXPENSE'
  amount: number
  date: string
  description: string
  isHistorical: boolean
  category?: Category | null
  category_id?: string | null
  createdBy?: { id: string; email?: string | null; telegramName?: string | null } | null
  source?: string | null
  createdAt: string
}

interface TransactionForm {
  type: 'INCOME' | 'EXPENSE'
  amount: string
  date: string
  category_id: string
  description: string
  isHistorical: boolean
}

/* ── Constants ─────────────────────────────────────────────── */

const LIMIT = 30

const emptyForm: TransactionForm = {
  type: 'INCOME',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  category_id: '',
  description: '',
  isHistorical: false,
}

/* ── Helpers ───────────────────────────────────────────────── */

function fmtMoney(n: number) {
  return new Intl.NumberFormat('ru-RU').format(n) + ' \u20BD'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

/* ── Component ─────────────────────────────────────────────── */

export default function AdminTransactionsPage() {
  const [items, setItems]         = useState<Transaction[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [categories, setCategories] = useState<Category[]>([])

  // Filters
  const [typeFilter, setTypeFilter] = useState<'' | 'INCOME' | 'EXPENSE'>('')
  const [catFilter, setCatFilter]   = useState('')
  const [search, setSearch]         = useState('')
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')
  const [page, setPage]             = useState(1)

  // Modal
  const [modal, setModal]     = useState<'create' | 'edit' | null>(null)
  const [form, setForm]       = useState<TransactionForm>(emptyForm)
  const [editId, setEditId]   = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)

  /* ── Load categories ─────────────────────────── */

  useEffect(() => {
    adminApi.buhCategories().then(setCategories).catch(() => {})
  }, [])

  /* ── Load transactions ───────────────────────── */

  const load = useCallback(() => {
    setLoading(true)
    const params: Record<string, string | number> = {
      skip: (page - 1) * LIMIT,
      limit: LIMIT,
    }
    if (typeFilter) params.type = typeFilter
    if (catFilter) params.category_id = catFilter
    if (search) params.search = search
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo

    adminApi.buhTransactions(params as any)
      .then(d => {
        setItems(d.items ?? [])
        setTotal(d.total ?? 0)
      })
      .catch(() => { setItems([]); setTotal(0) })
      .finally(() => setLoading(false))
  }, [page, typeFilter, catFilter, search, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  /* ── Summary ──────────────────────────────────── */

  const summary = useMemo(() => {
    const income  = items.filter(t => t.type === 'INCOME').reduce((s, t) => s + Number(t.amount), 0)
    const expense = items.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + Number(t.amount), 0)
    return { income, expense, profit: income - expense }
  }, [items])

  /* ── Pagination ───────────────────────────────── */

  const totalPages = Math.ceil(total / LIMIT)

  function resetPage() { setPage(1) }

  /* ── Open modals ──────────────────────────────── */

  function openCreate() {
    setForm(emptyForm)
    setEditId(null)
    setModal('create')
  }

  function openEdit(t: Transaction) {
    setForm({
      type: t.type,
      amount: String(t.amount),
      date: t.date?.slice(0, 10) || '',
      category_id: t.category_id || t.category?.id || '',
      description: t.description || '',
      isHistorical: t.isHistorical ?? false,
    })
    setEditId(t.id)
    setModal('edit')
  }

  /* ── Save ──────────────────────────────────────── */

  async function save() {
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error('Укажите сумму')
      return
    }
    setSaving(true)
    try {
      const payload = {
        type: form.type,
        amount: Number(form.amount),
        date: form.date || undefined,
        category_id: form.category_id || undefined,
        description: form.description || undefined,
        isHistorical: form.isHistorical,
      }
      if (modal === 'edit' && editId) {
        await adminApi.updateBuhTransaction(editId, payload)
        toast.success('Транзакция обновлена')
      } else {
        await adminApi.createBuhTransaction(payload)
        toast.success('Транзакция создана')
      }
      setModal(null)
      load()
    } catch (e: any) {
      toast.error(e.message || 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  /* ── Delete ────────────────────────────────────── */

  async function confirmDelete() {
    if (!deleteId) return
    try {
      await adminApi.deleteBuhTransaction(deleteId)
      toast.success('Транзакция удалена')
      setDeleteId(null)
      load()
    } catch (e: any) {
      toast.error(e.message || 'Ошибка удаления')
    }
  }

  /* ── Filtered categories for the form ─────────── */

  const filteredCategories = categories.filter(
    c => !form.type || c.type === form.type
  )

  /* ── Render ────────────────────────────────────── */

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Транзакции</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {total} записей
          </p>
        </div>
        <button onClick={openCreate}
                className="btn-primary inline-flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" />
          Добавить
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          icon={<ArrowUpRight className="w-4 h-4" />}
          label="Доходы (стр.)"
          value={fmtMoney(summary.income)}
          color="#34d399"
        />
        <SummaryCard
          icon={<ArrowDownRight className="w-4 h-4" />}
          label="Расходы (стр.)"
          value={fmtMoney(summary.expense)}
          color="#f87171"
        />
        <SummaryCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Прибыль (стр.)"
          value={fmtMoney(summary.profit)}
          color={summary.profit >= 0 ? '#8b5cf6' : '#f87171'}
        />
      </div>

      {/* Filters */}
      <div className="rounded-2xl p-4 space-y-3"
           style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
        <div className="flex gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: 'var(--text-tertiary)' }} />
            <input className="glass-input pl-9 py-2 text-sm w-full"
                   placeholder="Поиск по описанию..."
                   value={search}
                   onChange={e => { setSearch(e.target.value); resetPage() }} />
          </div>

          {/* Type toggle */}
          <div className="flex rounded-xl overflow-hidden"
               style={{ border: '1px solid var(--glass-border)' }}>
            {(['', 'INCOME', 'EXPENSE'] as const).map(v => (
              <button key={v}
                      onClick={() => { setTypeFilter(v); resetPage() }}
                      className="px-3 py-2 text-xs font-medium transition-colors"
                      style={{
                        background: typeFilter === v ? 'rgba(139,92,246,0.12)' : 'transparent',
                        color: typeFilter === v ? '#a78bfa' : 'var(--text-secondary)',
                      }}>
                {v === '' ? 'Все' : v === 'INCOME' ? 'Доходы' : 'Расходы'}
              </button>
            ))}
          </div>

          {/* Category filter */}
          <select className="glass-input w-auto py-2 text-sm"
                  value={catFilter}
                  onChange={e => { setCatFilter(e.target.value); resetPage() }}>
            <option value="">Все категории</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div className="flex gap-3 flex-wrap items-center">
          <Calendar className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          <input type="date" className="glass-input py-1.5 px-3 text-sm w-auto"
                 value={dateFrom}
                 onChange={e => { setDateFrom(e.target.value); resetPage() }} />
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>&mdash;</span>
          <input type="date" className="glass-input py-1.5 px-3 text-sm w-auto"
                 value={dateTo}
                 onChange={e => { setDateTo(e.target.value); resetPage() }} />
          {(dateFrom || dateTo) && (
            <button className="text-xs hover:underline"
                    style={{ color: 'var(--text-secondary)' }}
                    onClick={() => { setDateFrom(''); setDateTo(''); resetPage() }}>
              Сбросить даты
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden"
           style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                {['Дата', 'Тип', 'Сумма', 'Категория', 'Описание', 'Автор', 'Источник', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-xs whitespace-nowrap"
                      style={{ color: 'var(--text-tertiary)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 skeleton rounded w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center" style={{ color: 'var(--text-tertiary)' }}>
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>Транзакции не найдены</p>
                  </td>
                </tr>
              ) : (
                items.map(t => (
                  <tr key={t.id}
                      className="hover:bg-white/[0.03] transition-colors"
                      style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    {/* Date */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        {fmtDate(t.date || t.createdAt)}
                      </span>
                      <br />
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {fmtTime(t.createdAt)}
                      </span>
                    </td>

                    {/* Type badge */}
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                            style={t.type === 'INCOME'
                              ? { background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }
                              : { background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}>
                        {t.type === 'INCOME'
                          ? <ArrowUpRight className="w-3 h-3" />
                          : <ArrowDownRight className="w-3 h-3" />}
                        {t.type === 'INCOME' ? 'INCOME' : 'EXPENSE'}
                      </span>
                      {t.isHistorical && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>
                          <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                          ист.
                        </span>
                      )}
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-semibold" style={{
                        color: t.type === 'INCOME' ? '#34d399' : '#f87171',
                      }}>
                        {t.type === 'INCOME' ? '+' : '-'}{fmtMoney(t.amount)}
                      </span>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3">
                      {t.category ? (
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ background: t.category.color || '#6b7280' }} />
                          <span style={{ color: 'var(--text-primary)' }}>{t.category.name}</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>&mdash;</span>
                      )}
                    </td>

                    {/* Description */}
                    <td className="px-4 py-3 max-w-[200px]">
                      <span className="text-sm truncate block" style={{ color: 'var(--text-secondary)' }}>
                        {t.description || '\u2014'}
                      </span>
                    </td>

                    {/* Author */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {t.createdBy?.telegramName || t.createdBy?.email || '\u2014'}
                      </span>
                    </td>

                    {/* Source */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {(() => {
                        const src = t.source || 'web'
                        const labels: Record<string, { text: string; color: string; bg: string }> = {
                          web: { text: 'Веб', color: '#3b82f6', bg: '#3b82f622' },
                          bot: { text: 'Бот', color: '#8b5cf6', bg: '#8b5cf622' },
                          webhook: { text: 'Webhook', color: '#f59e0b', bg: '#f59e0b22' },
                          system: { text: 'Система', color: '#6b7280', bg: '#6b728022' },
                        }
                        const l = labels[src] || labels.web
                        return (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                style={{ background: l.bg, color: l.color }}>
                            {l.text}
                          </span>
                        )
                      })()}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(t)}
                                className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                                style={{ color: 'var(--text-tertiary)' }}
                                title="Редактировать">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteId(t.id)}
                                className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                                style={{ color: 'var(--text-tertiary)' }}
                                title="Удалить">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3"
               style={{ borderTop: '1px solid var(--glass-border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {Math.min((page - 1) * LIMIT + 1, total)}&ndash;{Math.min(page * LIMIT, total)} из {total}
            </p>
            <div className="flex gap-2 items-center">
              <button onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-1.5 disabled:opacity-30 hover:bg-white/[0.05] rounded-lg transition-colors"
                      style={{ color: 'var(--text-secondary)' }}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm px-2" style={{ color: 'var(--text-primary)' }}>
                {page} / {totalPages}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-1.5 disabled:opacity-30 hover:bg-white/[0.05] rounded-lg transition-colors"
                      style={{ color: 'var(--text-secondary)' }}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ─────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="relative w-full max-w-lg rounded-2xl p-6 space-y-5 animate-scale-in"
               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
                {modal === 'create' ? 'Новая транзакция' : 'Редактирование'}
              </h3>
              <button onClick={() => setModal(null)}
                      className="p-1 hover:bg-white/[0.05] rounded-md transition-colors"
                      style={{ color: 'var(--text-tertiary)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Type selector */}
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Тип</label>
              <div className="flex rounded-xl overflow-hidden"
                   style={{ border: '1px solid var(--glass-border)' }}>
                {(['INCOME', 'EXPENSE'] as const).map(v => (
                  <button key={v}
                          onClick={() => setForm(f => ({ ...f, type: v, category_id: '' }))}
                          className="flex-1 px-4 py-2.5 text-sm font-medium transition-colors"
                          style={{
                            background: form.type === v
                              ? (v === 'INCOME' ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)')
                              : 'transparent',
                            color: form.type === v
                              ? (v === 'INCOME' ? '#34d399' : '#f87171')
                              : 'var(--text-secondary)',
                          }}>
                    {v === 'INCOME' ? 'Доход' : 'Расход'}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                Сумма (\u20BD)
              </label>
              <input type="number" className="glass-input w-full" placeholder="0"
                     value={form.amount}
                     onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                     min={0} step="0.01" />
            </div>

            {/* Date */}
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Дата</label>
              <input type="date" className="glass-input w-full"
                     value={form.date}
                     onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>

            {/* Category */}
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Категория</label>
              <select className="glass-input w-full"
                      value={form.category_id}
                      onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                <option value="">Без категории</option>
                {filteredCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Описание</label>
              <input className="glass-input w-full" placeholder="Описание транзакции"
                     value={form.description}
                     onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>

            {/* Historical */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox"
                     checked={form.isHistorical}
                     onChange={e => setForm(f => ({ ...f, isHistorical: e.target.checked }))}
                     className="rounded" />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Историческая запись (импорт старых данных)
              </span>
            </label>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button onClick={() => setModal(null)} className="btn-secondary flex-1">Отмена</button>
              <button onClick={save} disabled={saving}
                      className="btn-primary flex-1 justify-center">
                {saving ? 'Сохранение...' : modal === 'create' ? 'Создать' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ─────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
          <div className="relative w-full max-w-sm rounded-2xl p-6 space-y-4 animate-scale-in"
               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
            <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
              Удалить транзакцию?
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Это действие нельзя отменить.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteId(null)} className="btn-secondary flex-1">Отмена</button>
              <button onClick={confirmDelete}
                      className="flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-colors"
                      style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Summary Card ──────────────────────────────────────────── */

function SummaryCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string; color: string
}) {
  return (
    <div className="rounded-2xl p-4 flex items-center gap-3"
         style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center"
           style={{ background: `${color}15`, color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
        <p className="text-lg font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
      </div>
    </div>
  )
}
