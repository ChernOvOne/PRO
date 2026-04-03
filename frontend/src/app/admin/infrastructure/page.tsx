'use client'

import { useEffect, useState } from 'react'
import {
  Plus, Edit2, Trash2, X, Server, Globe, ExternalLink,
  Calendar, AlertCircle, Shield,
} from 'lucide-react'
import { adminApi } from '@/lib/api'
import toast from 'react-hot-toast'

/* ── Types ─────────────────────────────────────────────────── */

interface VpnServer {
  id: string
  name: string
  provider: string
  ipAddress?: string
  purpose?: string
  panelUrl?: string
  monthlyCost: number
  currency: string
  paymentDay: number
  nextPaymentDate?: string
  notifyDaysBefore?: number
  notes?: string
  status?: 'ACTIVE' | 'WARNING' | 'EXPIRED' | 'INACTIVE'
  createdAt?: string
}

/* ── Constants ─────────────────────────────────────────────── */

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  ACTIVE:   { bg: 'rgba(52,211,153,0.12)', text: '#34d399', label: 'Активен' },
  WARNING:  { bg: 'rgba(251,191,36,0.12)', text: '#fbbf24', label: 'Внимание' },
  EXPIRED:  { bg: 'rgba(248,113,113,0.12)', text: '#f87171', label: 'Истёк' },
  INACTIVE: { bg: 'rgba(156,163,175,0.12)', text: '#9ca3af', label: 'Неактивен' },
}

const EMPTY_FORM: Omit<VpnServer, 'id'> = {
  name: '',
  provider: '',
  ipAddress: '',
  purpose: '',
  panelUrl: '',
  monthlyCost: 0,
  currency: 'RUB',
  paymentDay: 1,
  nextPaymentDate: '',
  notifyDaysBefore: 3,
  notes: '',
}

/* ── Helpers ───────────────────────────────────────────────── */

function fmtMoney(amount: number, currency: string) {
  if (currency === 'RUB') return new Intl.NumberFormat('ru-RU').format(amount) + ' ₽'
  if (currency === 'USD') return '$' + new Intl.NumberFormat('en-US').format(amount)
  if (currency === 'EUR') return new Intl.NumberFormat('de-DE').format(amount) + ' EUR'
  return `${amount} ${currency}`
}

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
  return diff
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/* ── Component ─────────────────────────────────────────────── */

export default function AdminInfrastructurePage() {
  const [servers, setServers] = useState<VpnServer[]>([])
  const [loading, setLoading] = useState(true)

  // Modal
  const [modal, setModal]   = useState<'create' | 'edit' | null>(null)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm]     = useState<Omit<VpnServer, 'id'>>(EMPTY_FORM)

  /* ── Load ─────────────────────────────────── */

  const load = () => {
    setLoading(true)
    adminApi.buhServers()
      .then(setServers)
      .catch(() => setServers([]))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  /* ── Actions ──────────────────────────────── */

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, nextPaymentDate: new Date().toISOString().slice(0, 10) })
    setEditId(null)
    setModal('create')
  }

  const openEdit = (srv: VpnServer) => {
    setForm({
      name: srv.name,
      provider: srv.provider,
      ipAddress: srv.ipAddress || '',
      purpose: srv.purpose || '',
      panelUrl: srv.panelUrl || '',
      monthlyCost: srv.monthlyCost,
      currency: srv.currency,
      paymentDay: srv.paymentDay,
      nextPaymentDate: srv.nextPaymentDate?.slice(0, 10) || '',
      notifyDaysBefore: srv.notifyDaysBefore ?? 3,
      notes: srv.notes || '',
    })
    setEditId(srv.id)
    setModal('edit')
  }

  const save = async () => {
    if (!form.name || !form.provider) {
      toast.error('Заполните название и провайдера')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        monthlyCost: Number(form.monthlyCost),
        paymentDay: Number(form.paymentDay),
        notifyDaysBefore: Number(form.notifyDaysBefore),
        nextPaymentDate: form.nextPaymentDate || undefined,
        ipAddress: form.ipAddress || undefined,
        purpose: form.purpose || undefined,
        panelUrl: form.panelUrl || undefined,
        notes: form.notes || undefined,
      }

      if (modal === 'edit' && editId) {
        await adminApi.updateBuhServer(editId, payload)
        toast.success('Сервер обновлён')
      } else {
        await adminApi.createBuhServer(payload)
        toast.success('Сервер добавлен')
      }
      setModal(null)
      load()
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Удалить сервер?')) return
    try {
      await adminApi.deleteBuhServer(id)
      toast.success('Удалено')
      load()
    } catch {
      toast.error('Ошибка удаления')
    }
  }

  /* ── Field updater ────────────────────────── */

  const upd = (key: string, value: any) => setForm(f => ({ ...f, [key]: value }))

  /* ── Render ───────────────────────────────── */

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Инфраструктура
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            VPN серверы и оплаты
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> Добавить сервер
        </button>
      </div>

      {/* Server Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 skeleton rounded-2xl" />
          ))}
        </div>
      ) : servers.length === 0 ? (
        <div
          className="rounded-2xl text-center py-16"
          style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
        >
          <Server className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <p style={{ color: 'var(--text-tertiary)' }}>Серверы не добавлены</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {servers.map(srv => {
            const statusCfg = STATUS_STYLES[srv.status || 'ACTIVE']
            const days = daysUntil(srv.nextPaymentDate)

            return (
              <div
                key={srv.id}
                className="rounded-2xl p-5 space-y-4 hover:translate-y-[-2px] transition-transform"
                style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
              >
                {/* Top row: name + status */}
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {srv.name}
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {srv.provider}
                    </p>
                  </div>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium shrink-0"
                    style={{ background: statusCfg.bg, color: statusCfg.text }}
                  >
                    <Shield className="w-3 h-3" />
                    {statusCfg.label}
                  </span>
                </div>

                {/* IP */}
                {srv.ipAddress && (
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                    <span className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>
                      {srv.ipAddress}
                    </span>
                  </div>
                )}

                {/* Cost + Payment info */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Стоимость/мес</span>
                    <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                      {fmtMoney(srv.monthlyCost, srv.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>День оплаты</span>
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {srv.paymentDay}-е число
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Следующая оплата</span>
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {fmtDate(srv.nextPaymentDate)}
                    </span>
                  </div>
                  {days !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Осталось дней</span>
                      <span
                        className="text-sm font-medium"
                        style={{ color: days <= 3 ? '#f87171' : days <= 7 ? '#fbbf24' : '#34d399' }}
                      >
                        {days <= 0 ? 'Просрочено!' : `${days} дн.`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Panel URL */}
                {srv.panelUrl && (
                  <a
                    href={srv.panelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs hover:underline"
                    style={{ color: 'var(--accent-1)' }}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Открыть панель
                  </a>
                )}

                {/* Actions */}
                <div
                  className="flex gap-2 pt-2"
                  style={{ borderTop: '1px solid var(--glass-border)' }}
                >
                  <button
                    onClick={() => openEdit(srv)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium hover:bg-white/[0.05] transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Редактировать
                  </button>
                  <button
                    onClick={() => remove(srv.id)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium hover:bg-red-500/10 transition-colors text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Удалить
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-lg mx-4 rounded-2xl p-6 space-y-4 animate-scale-in max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {modal === 'edit' ? 'Редактировать сервер' : 'Новый сервер'}
              </h2>
              <button
                onClick={() => setModal(null)}
                className="p-1.5 rounded-lg hover:bg-white/[0.05]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                className="glass-input"
                placeholder="Название"
                value={form.name}
                onChange={e => upd('name', e.target.value)}
              />
              <input
                className="glass-input"
                placeholder="Провайдер"
                value={form.provider}
                onChange={e => upd('provider', e.target.value)}
              />
            </div>

            <input
              className="glass-input font-mono"
              placeholder="IP-адрес"
              value={form.ipAddress}
              onChange={e => upd('ipAddress', e.target.value)}
            />

            <input
              className="glass-input"
              placeholder="Назначение"
              value={form.purpose}
              onChange={e => upd('purpose', e.target.value)}
            />

            <input
              className="glass-input"
              placeholder="URL панели"
              value={form.panelUrl}
              onChange={e => upd('panelUrl', e.target.value)}
            />

            <div className="grid grid-cols-3 gap-3">
              <input
                className="glass-input"
                type="number"
                placeholder="Стоимость"
                value={form.monthlyCost}
                onChange={e => upd('monthlyCost', e.target.value)}
              />
              <select
                className="glass-input"
                value={form.currency}
                onChange={e => upd('currency', e.target.value)}
              >
                <option value="RUB">RUB</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
              <input
                className="glass-input"
                type="number"
                placeholder="День оплаты"
                min={1}
                max={31}
                value={form.paymentDay}
                onChange={e => upd('paymentDay', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>
                  Следующая оплата
                </label>
                <input
                  className="glass-input"
                  type="date"
                  value={form.nextPaymentDate}
                  onChange={e => upd('nextPaymentDate', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>
                  Уведомлять за (дней)
                </label>
                <input
                  className="glass-input"
                  type="number"
                  min={0}
                  value={form.notifyDaysBefore}
                  onChange={e => upd('notifyDaysBefore', e.target.value)}
                />
              </div>
            </div>

            <textarea
              className="glass-input min-h-[70px] resize-y"
              placeholder="Заметки"
              value={form.notes}
              onChange={e => upd('notes', e.target.value)}
            />

            <div className="flex gap-2 pt-2">
              <button onClick={save} disabled={saving} className="btn-primary text-sm flex-1">
                {saving ? 'Сохраняю...' : modal === 'edit' ? 'Сохранить' : 'Создать'}
              </button>
              <button onClick={() => setModal(null)} className="btn-secondary text-sm">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
