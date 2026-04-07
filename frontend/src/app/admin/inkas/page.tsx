'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Plus, Trash2, X, TrendingUp, ArrowDownLeft, PiggyBank,
  DollarSign, Filter, AlertCircle,
} from 'lucide-react'
import { adminApi } from '@/lib/api'
import toast from 'react-hot-toast'

/* ── Types ─────────────────────────────────────────────────── */

interface Partner {
  id: string
  name: string
}

interface InkasRecord {
  id: string
  partnerId: string
  partnerName?: string
  type: 'DIVIDEND' | 'RETURN_INV' | 'INVESTMENT'
  amount: number
  date: string
  monthLabel?: string
  description?: string
  partner?: Partner
}

/* ── Constants ─────────────────────────────────────────────── */

const TYPE_OPTIONS = [
  { value: 'DIVIDEND',   label: 'Дивиденды',   badge: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
  { value: 'RETURN_INV', label: 'Возврат',      badge: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  { value: 'INVESTMENT', label: 'Инвестиция',   badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
] as const

const TYPE_MAP: Record<string, typeof TYPE_OPTIONS[number]> = Object.fromEntries(
  TYPE_OPTIONS.map(t => [t.value, t])
)

/* ── Helpers ───────────────────────────────────────────────── */

function fmtMoney(amount: number) {
  return new Intl.NumberFormat('ru-RU').format(amount) + ' ₽'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/* ── Component ─────────────────────────────────────────────── */

export default function AdminInkasPage() {
  const [records, setRecords]     = useState<InkasRecord[]>([])
  const [partners, setPartners]   = useState<Partner[]>([])
  const [loading, setLoading]     = useState(true)
  const [filterPartner, setFilterPartner] = useState('')

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [form, setForm] = useState({
    partnerId: '',
    type: 'DIVIDEND' as string,
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    monthLabel: '',
    description: '',
  })

  /* ── Load ─────────────────────────────────── */

  const loadPartners = () => {
    adminApi.buhPartners().then(setPartners).catch(() => {})
  }

  const loadRecords = () => {
    setLoading(true)
    adminApi
      .buhInkas(filterPartner || undefined)
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadPartners() }, [])
  useEffect(() => { loadRecords() }, [filterPartner])

  /* ── Actions ──────────────────────────────── */

  const create = async () => {
    if (!form.partnerId || !form.amount) {
      toast.error('Заполните партнёра и сумму')
      return
    }
    setSaving(true)
    try {
      await adminApi.createBuhInkas({
        partnerId: form.partnerId,
        type: form.type,
        amount: Number(form.amount),
        date: form.date,
        monthLabel: form.monthLabel || undefined,
        description: form.description || undefined,
      })
      toast.success('Запись создана')
      setShowModal(false)
      setForm({ partnerId: '', type: 'DIVIDEND', amount: '', date: new Date().toISOString().slice(0, 10), monthLabel: '', description: '' })
      loadRecords()
    } catch {
      toast.error('Ошибка создания')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Удалить запись?')) return
    try {
      await adminApi.deleteBuhInkas(id)
      toast.success('Удалено')
      loadRecords()
    } catch {
      toast.error('Ошибка удаления')
    }
  }

  /* ── Summary ──────────────────────────────── */

  const summary = useMemo(() => {
    const dividends   = records.filter(r => r.type === 'DIVIDEND').reduce((s, r) => s + r.amount, 0)
    const returns     = records.filter(r => r.type === 'RETURN_INV').reduce((s, r) => s + r.amount, 0)
    const investments = records.filter(r => r.type === 'INVESTMENT').reduce((s, r) => s + r.amount, 0)
    return { dividends, returns, investments }
  }, [records])

  /* ── Resolve partner name ─────────────────── */

  const getPartnerName = (r: InkasRecord) =>
    r.partner?.name || r.partnerName || partners.find(p => p.id === r.partnerId)?.name || '—'

  /* ── Render ───────────────────────────────── */

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Инкассация
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Дивиденды, возвраты и инвестиции
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Дивиденды"
          value={fmtMoney(summary.dividends)}
          color="#a78bfa"
        />
        <SummaryCard
          icon={<ArrowDownLeft className="w-4 h-4" />}
          label="Возвраты"
          value={fmtMoney(summary.returns)}
          color="#60a5fa"
        />
        <SummaryCard
          icon={<PiggyBank className="w-4 h-4" />}
          label="Инвестиции"
          value={fmtMoney(summary.investments)}
          color="#34d399"
        />
      </div>

      {/* Filter */}
      <div
        className="rounded-2xl p-4 flex items-center gap-3"
        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
      >
        <Filter className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        <select
          className="glass-input w-auto py-2 text-sm"
          value={filterPartner}
          onChange={e => setFilterPartner(e.target.value)}
        >
          <option value="">Все партнёры</option>
          {partners.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                {['Дата', 'Партнёр', 'Тип', 'Сумма', 'Месяц', 'Описание', ''].map(h => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 font-medium text-xs whitespace-nowrap"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 skeleton rounded w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center" style={{ color: 'var(--text-tertiary)' }}>
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>Записей не найдено</p>
                  </td>
                </tr>
              ) : (
                records.map(r => {
                  const typeCfg = TYPE_MAP[r.type]
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-white/[0.03] transition-colors"
                      style={{ borderBottom: '1px solid var(--glass-border)' }}
                    >
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                        {fmtDate(r.date)}
                      </td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                        {getPartnerName(r)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${typeCfg?.badge || ''}`}
                        >
                          {typeCfg?.label || r.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                        {fmtMoney(r.amount)}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {r.monthLabel || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs max-w-[200px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                        {r.description || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => remove(r.id)}
                          className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 ">
          <div
            className="w-full max-w-lg mx-4 rounded-2xl p-6 space-y-4 animate-scale-in"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Новая запись
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg hover:bg-white/[0.05]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <select
              className="glass-input w-full"
              value={form.partnerId}
              onChange={e => setForm({ ...form, partnerId: e.target.value })}
            >
              <option value="">Выберите партнёра</option>
              {partners.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <div className="flex gap-2">
              {TYPE_OPTIONS.map(t => (
                <button
                  key={t.value}
                  onClick={() => setForm({ ...form, type: t.value })}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.type === t.value ? t.badge : ''
                  }`}
                  style={
                    form.type !== t.value
                      ? { background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-tertiary)' }
                      : { border: '1px solid currentColor' }
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                className="glass-input"
                type="number"
                placeholder="Сумма"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
              />
              <input
                className="glass-input"
                type="date"
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
              />
            </div>

            <input
              className="glass-input"
              placeholder="Период (напр. Март 2026)"
              value={form.monthLabel}
              onChange={e => setForm({ ...form, monthLabel: e.target.value })}
            />

            <textarea
              className="glass-input min-h-[80px] resize-y"
              placeholder="Описание (необязательно)"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />

            <div className="flex gap-2 pt-2">
              <button
                onClick={create}
                disabled={saving}
                className="btn-primary text-sm flex-1"
              >
                {saving ? 'Сохраняю...' : 'Создать'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="btn-secondary text-sm"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Summary Card ──────────────────────────────────────────── */

function SummaryCard({
  icon, label, value, color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div
      className="rounded-2xl p-4 flex items-center gap-3"
      style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: `${color}15`, color }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
        <p className="text-lg font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
      </div>
    </div>
  )
}
