'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Edit2, Trash2, X, ChevronLeft, ChevronRight,
  TrendingUp, DollarSign, ArrowDownRight, Percent,
  User, MessageCircle, AlertCircle, Wallet, ArrowLeft,
  Calendar,
} from 'lucide-react'
import { adminApi } from '@/lib/api'
import toast from 'react-hot-toast'

/* ── Types ─────────────────────────────────────────────────── */

interface Partner {
  id: string
  name: string
  roleLabel: string
  tgUsername?: string
  sharePercent: number
  avatarColor: string
  initials: string
  notes?: string
  initialInvestment: number
  initialReturned: number
  initialDividends: number
  totalInvested: number
  totalReturned: number
  totalDividends: number
  remainingDebt: number
  lastDividendAmount?: number
  lastDividendDate?: string
  createdAt: string
}

interface Inka {
  id: string
  partnerId: string
  amount: number
  type: 'RETURN' | 'DIVIDEND'
  date: string
  note?: string
  createdAt: string
}

interface PartnerForm {
  name: string
  roleLabel: string
  tgUsername: string
  sharePercent: string
  avatarColor: string
  initials: string
  notes: string
  initialInvestment: string
  initialReturned: string
  initialDividends: string
}

/* ── Constants ─────────────────────────────────────────────── */

const AVATAR_COLORS = [
  '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#6366f1', '#14b8a6',
  '#f97316', '#84cc16',
]

const emptyForm: PartnerForm = {
  name: '', roleLabel: '', tgUsername: '', sharePercent: '0',
  avatarColor: AVATAR_COLORS[0], initials: '', notes: '',
  initialInvestment: '0', initialReturned: '0', initialDividends: '0',
}

/* ── Helpers ───────────────────────────────────────────────── */

function fmtMoney(n: number) {
  return new Intl.NumberFormat('ru-RU').format(n) + ' \u20BD'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function getUserRole(): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match(/(?:^|;\s*)role=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : ''
}

/* ── Component ─────────────────────────────────────────────── */

export default function AdminPartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading]   = useState(true)
  const [userRole, setUserRole] = useState('ADMIN')

  // Modal
  const [modal, setModal]     = useState<'create' | 'edit' | null>(null)
  const [form, setForm]       = useState<PartnerForm>(emptyForm)
  const [editId, setEditId]   = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Detail view
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null)
  const [inkas, setInkas]       = useState<Inka[]>([])
  const [inkasLoading, setInkasLoading] = useState(false)

  /* ── Detect role ──────────────────────────────── */

  useEffect(() => {
    const role = getUserRole()
    if (role) setUserRole(role)
    // Also try fetching from /auth/me
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(u => { if (u.role) setUserRole(u.role) })
      .catch(() => {})
  }, [])

  const isAdmin = userRole === 'ADMIN'

  /* ── Load partners ───────────────────────────── */

  const load = useCallback(() => {
    setLoading(true)
    adminApi.buhPartners()
      .then(data => setPartners(Array.isArray(data) ? data : []))
      .catch(() => setPartners([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  /* ── Load partner detail + inkas ──────────────── */

  function openDetail(p: Partner) {
    setSelectedPartner(p)
    setInkasLoading(true)
    Promise.all([
      adminApi.buhPartnerById(p.id),
      adminApi.buhInkas(p.id),
    ]).then(([detail, inkasData]) => {
      setSelectedPartner(detail)
      setInkas(Array.isArray(inkasData) ? inkasData : [])
    }).catch(() => {
      toast.error('Ошибка загрузки данных партнёра')
    }).finally(() => setInkasLoading(false))
  }

  /* ── Open modals ──────────────────────────────── */

  function openCreate() {
    setForm(emptyForm)
    setEditId(null)
    setModal('create')
  }

  function openEdit(p: Partner) {
    setForm({
      name: p.name,
      roleLabel: p.roleLabel || '',
      tgUsername: p.tgUsername || '',
      sharePercent: String(p.sharePercent ?? 0),
      avatarColor: p.avatarColor || AVATAR_COLORS[0],
      initials: p.initials || '',
      notes: p.notes || '',
      initialInvestment: String(p.initialInvestment ?? 0),
      initialReturned: String(p.initialReturned ?? 0),
      initialDividends: String(p.initialDividends ?? 0),
    })
    setEditId(p.id)
    setModal('edit')
  }

  /* ── Save ──────────────────────────────────────── */

  async function save() {
    if (!form.name.trim()) {
      toast.error('Укажите имя')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        roleLabel: form.roleLabel || undefined,
        tgUsername: form.tgUsername || undefined,
        sharePercent: Number(form.sharePercent) || 0,
        avatarColor: form.avatarColor,
        initials: form.initials || form.name.slice(0, 2).toUpperCase(),
        notes: form.notes || undefined,
        initialInvestment: Number(form.initialInvestment) || 0,
        initialReturned: Number(form.initialReturned) || 0,
        initialDividends: Number(form.initialDividends) || 0,
      }
      if (modal === 'edit' && editId) {
        await adminApi.updateBuhPartner(editId, payload)
        toast.success('Партнёр обновлён')
      } else {
        await adminApi.createBuhPartner(payload)
        toast.success('Партнёр создан')
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
      await adminApi.deleteBuhPartner(deleteId)
      toast.success('Партнёр удалён')
      setDeleteId(null)
      if (selectedPartner?.id === deleteId) setSelectedPartner(null)
      load()
    } catch (e: any) {
      toast.error(e.message || 'Ошибка удаления')
    }
  }

  /* ── Detail view ──────────────────────────────── */

  if (selectedPartner) {
    const p = selectedPartner
    const debtPct = p.totalInvested > 0
      ? Math.min(Math.round((p.totalReturned / p.totalInvested) * 100), 100)
      : 0

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back */}
        <button onClick={() => setSelectedPartner(null)}
                className="inline-flex items-center gap-2 text-sm hover:underline"
                style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeft className="w-4 h-4" />
          Назад к списку
        </button>

        {/* Partner header */}
        <div className="rounded-2xl p-6"
             style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
                 style={{ background: p.avatarColor }}>
              {p.initials || p.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{p.name}</h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {p.roleLabel || 'Partner'}
              </p>
              {p.tgUsername && (
                <p className="text-xs mt-1 inline-flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                  <MessageCircle className="w-3 h-3" />
                  @{p.tgUsername}
                </p>
              )}
              {p.sharePercent > 0 && (
                <span className="ml-3 text-xs px-2 py-0.5 rounded-md inline-flex items-center gap-1"
                      style={{ background: 'rgba(6,182,212,0.12)', color: '#a78bfa' }}>
                  <Percent className="w-3 h-3" />
                  {p.sharePercent}%
                </span>
              )}
            </div>
          </div>

          {p.notes && (
            <p className="mt-4 text-sm rounded-xl p-3"
               style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
              {p.notes}
            </p>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<DollarSign className="w-4 h-4" />} label="Инвестировано"
                    value={fmtMoney(p.totalInvested)} color="#8b5cf6" />
          <StatCard icon={<ArrowDownRight className="w-4 h-4" />} label="Возвращено"
                    value={fmtMoney(p.totalReturned)} color="#34d399" />
          <StatCard icon={<Wallet className="w-4 h-4" />} label="Остаток долга"
                    value={fmtMoney(p.remainingDebt)} color={p.remainingDebt > 0 ? '#f87171' : '#34d399'} />
          <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Дивиденды"
                    value={fmtMoney(p.totalDividends)} color="#06b6d4" />
        </div>

        {/* Debt progress */}
        <div className="rounded-2xl p-5"
             style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Погашение долга
            </span>
            <span className="text-sm font-semibold" style={{ color: debtPct >= 100 ? '#34d399' : '#a78bfa' }}>
              {debtPct}%
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full transition-all duration-500"
                 style={{
                   width: `${debtPct}%`,
                   background: debtPct >= 100
                     ? 'linear-gradient(90deg, #34d399, #10b981)'
                     : 'linear-gradient(90deg, #8b5cf6, #06b6d4)',
                 }} />
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
            {fmtMoney(p.totalReturned)} из {fmtMoney(p.totalInvested)}
          </p>
        </div>

        {/* Inkas history */}
        <div className="rounded-2xl overflow-hidden"
             style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
          <div className="px-5 py-4 flex items-center justify-between"
               style={{ borderBottom: '1px solid var(--glass-border)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              История инкассаций
            </h2>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {inkas.length} записей
            </span>
          </div>

          {inkasLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 skeleton rounded-xl" />
              ))}
            </div>
          ) : inkas.length === 0 ? (
            <div className="p-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Записей инкассации пока нет</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--glass-border)' }}>
              {inkas.map(ink => (
                <div key={ink.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                       style={{
                         background: ink.type === 'DIVIDEND' ? 'rgba(6,182,212,0.1)' : 'rgba(52,211,153,0.1)',
                         color: ink.type === 'DIVIDEND' ? '#06b6d4' : '#34d399',
                       }}>
                    {ink.type === 'DIVIDEND'
                      ? <TrendingUp className="w-4 h-4" />
                      : <ArrowDownRight className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {ink.type === 'DIVIDEND' ? 'Дивиденд' : 'Возврат'}
                    </p>
                    {ink.note && (
                      <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{ink.note}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {fmtMoney(ink.amount)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {fmtDate(ink.date || ink.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ── Partner list (main view) ─────────────────── */

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Партнёры и инвесторы
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {partners.length} участников
          </p>
        </div>
        {isAdmin && (
          <button onClick={openCreate}
                  className="btn-primary inline-flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" />
            Добавить
          </button>
        )}
      </div>

      {/* Partner cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-64 skeleton rounded-2xl" />
          ))}
        </div>
      ) : partners.length === 0 ? (
        <div className="rounded-2xl p-12 text-center"
             style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
          <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: 'var(--text-tertiary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Партнёры не добавлены</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {partners.map(p => {
            const debtPct = p.totalInvested > 0
              ? Math.min(Math.round((p.totalReturned / p.totalInvested) * 100), 100)
              : 0

            return (
              <div key={p.id}
                   className="rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group"
                   style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
                   onClick={() => openDetail(p)}>
                {/* Top: avatar + name + actions */}
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                       style={{ background: p.avatarColor }}>
                    {p.initials || p.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</h3>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{p.roleLabel || 'Partner'}</p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={e => { e.stopPropagation(); openEdit(p) }}
                              className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                              style={{ color: 'var(--text-tertiary)' }}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); setDeleteId(p.id) }}
                              className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                              style={{ color: 'var(--text-tertiary)' }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <MiniStat label="Инвестировано" value={fmtMoney(p.totalInvested)} />
                  <MiniStat label="Возвращено" value={fmtMoney(p.totalReturned)} />
                  <MiniStat label="Остаток долга" value={fmtMoney(p.remainingDebt)}
                            color={p.remainingDebt > 0 ? '#f87171' : '#34d399'} />
                  <MiniStat label="Дивиденды" value={fmtMoney(p.totalDividends)} />
                </div>

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                      Погашение
                    </span>
                    <span className="text-xs font-medium" style={{ color: debtPct >= 100 ? '#34d399' : 'var(--text-secondary)' }}>
                      {debtPct}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full transition-all duration-500"
                         style={{
                           width: `${debtPct}%`,
                           background: debtPct >= 100
                             ? '#34d399'
                             : 'linear-gradient(90deg, #8b5cf6, #06b6d4)',
                         }} />
                  </div>
                </div>

                {/* Last dividend */}
                {p.lastDividendAmount != null && p.lastDividendAmount > 0 && (
                  <div className="flex items-center justify-between pt-3"
                       style={{ borderTop: '1px solid var(--glass-border)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Посл. дивиденд</span>
                    <div className="text-right">
                      <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                        {fmtMoney(p.lastDividendAmount)}
                      </span>
                      {p.lastDividendDate && (
                        <span className="text-[10px] ml-1.5" style={{ color: 'var(--text-tertiary)' }}>
                          {fmtDate(p.lastDividendDate)}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Create / Edit Modal ─────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 " onClick={() => setModal(null)} />
          <div className="relative w-full max-w-lg rounded-2xl p-6 space-y-4 animate-scale-in max-h-[90vh] overflow-y-auto"
               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
                {modal === 'create' ? 'Новый партнёр' : 'Редактирование'}
              </h3>
              <button onClick={() => setModal(null)}
                      className="p-1 hover:bg-white/[0.05] rounded-md transition-colors"
                      style={{ color: 'var(--text-tertiary)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Name */}
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Имя *</label>
              <input className="glass-input w-full" placeholder="Имя партнёра"
                     value={form.name}
                     onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            {/* Role label */}
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Роль</label>
              <input className="glass-input w-full" placeholder="Инвестор, Партнёр..."
                     value={form.roleLabel}
                     onChange={e => setForm(f => ({ ...f, roleLabel: e.target.value }))} />
            </div>

            {/* TG + share row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Telegram</label>
                <input className="glass-input w-full" placeholder="@username"
                       value={form.tgUsername}
                       onChange={e => setForm(f => ({ ...f, tgUsername: e.target.value.replace('@', '') }))} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Доля (%)</label>
                <input type="number" className="glass-input w-full" placeholder="0"
                       value={form.sharePercent}
                       onChange={e => setForm(f => ({ ...f, sharePercent: e.target.value }))}
                       min={0} max={100} />
              </div>
            </div>

            {/* Avatar: color + initials */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Цвет аватара</label>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_COLORS.map(c => (
                    <button key={c}
                            onClick={() => setForm(f => ({ ...f, avatarColor: c }))}
                            className="w-7 h-7 rounded-lg transition-all flex items-center justify-center"
                            style={{
                              background: c,
                              outline: form.avatarColor === c ? '2px solid white' : 'none',
                              outlineOffset: '2px',
                            }}>
                      {form.avatarColor === c && <span className="text-white text-xs">&#10003;</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Инициалы</label>
                <input className="glass-input w-full" placeholder="АБ" maxLength={3}
                       value={form.initials}
                       onChange={e => setForm(f => ({ ...f, initials: e.target.value.toUpperCase() }))} />
                {/* Preview */}
                <div className="mt-2 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                       style={{ background: form.avatarColor }}>
                    {form.initials || form.name.slice(0, 2).toUpperCase() || '??'}
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Предпросмотр</span>
                </div>
              </div>
            </div>

            {/* Financial inputs */}
            <div className="pt-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
              <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-tertiary)' }}>Начальные данные</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: 'var(--text-tertiary)' }}>Инвестиции</label>
                  <input type="number" className="glass-input w-full text-sm" placeholder="0"
                         value={form.initialInvestment}
                         onChange={e => setForm(f => ({ ...f, initialInvestment: e.target.value }))} min={0} />
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: 'var(--text-tertiary)' }}>Возвращено</label>
                  <input type="number" className="glass-input w-full text-sm" placeholder="0"
                         value={form.initialReturned}
                         onChange={e => setForm(f => ({ ...f, initialReturned: e.target.value }))} min={0} />
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: 'var(--text-tertiary)' }}>Дивиденды</label>
                  <input type="number" className="glass-input w-full text-sm" placeholder="0"
                         value={form.initialDividends}
                         onChange={e => setForm(f => ({ ...f, initialDividends: e.target.value }))} min={0} />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Заметки</label>
              <textarea className="glass-input w-full min-h-[80px] resize-y" placeholder="Заметки о партнёре..."
                        value={form.notes}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

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
          <div className="absolute inset-0 bg-black/60 " onClick={() => setDeleteId(null)} />
          <div className="relative w-full max-w-sm rounded-2xl p-6 space-y-4 animate-scale-in"
               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
            <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
              Удалить партнёра?
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Все связанные данные (инкассации, дивиденды) тоже будут удалены.
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

/* ── Stat Card ─────────────────────────────────────────────── */

function StatCard({ icon, label, value, color }: {
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

/* ── Mini Stat (for cards) ─────────────────────────────────── */

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      <p className="text-xs font-semibold mt-0.5" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}
