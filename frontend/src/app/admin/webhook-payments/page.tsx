'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Key, Webhook, Plus, Trash2, Copy, Check, Eye, EyeOff,
  X, AlertCircle, Shield, Clock, Activity, Hash,
} from 'lucide-react'
import { adminApi } from '@/lib/api'
import toast from 'react-hot-toast'

/* ── Helpers ───────────────────────────────────────────────── */

function fmtMoney(n: number) {
  return new Intl.NumberFormat('ru-RU').format(n) + ' \u20BD'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

function maskKey(key: string) {
  if (key.length <= 8) return key
  return key.slice(0, 6) + '\u2022'.repeat(Math.min(key.length - 10, 20)) + key.slice(-4)
}

/* ── Types ─────────────────────────────────────────────────── */

interface ApiKey {
  id: string
  name: string
  key: string
  active: boolean
  createdAt: string
  lastUsedAt?: string | null
  requestCount: number
}

interface WebhookPayment {
  id: string
  date: string
  externalId?: string
  amount: number
  currency: string
  customerName?: string
  plan?: string
  source?: string
  status: string
}

/* ── Tabs ──────────────────────────────────────────────────── */

type Tab = 'keys' | 'payments'

const TABS: { id: Tab; label: string; icon: typeof Key }[] = [
  { id: 'keys',     label: 'API-ключи',     icon: Key },
  { id: 'payments', label: 'Webhook-платежи', icon: Webhook },
]

/* ── Component ────────────────────────────────────────────── */

export default function AdminWebhookPaymentsPage() {
  const [tab, setTab] = useState<Tab>('keys')

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Webhook-платежи и API
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Управление API-ключами и входящими webhook-платежами
        </p>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl overflow-hidden w-fit"
           style={{ border: '1px solid var(--glass-border)' }}>
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors"
              style={{
                background: active ? 'rgba(6,182,212,0.12)' : 'transparent',
                color: active ? '#a78bfa' : 'var(--text-secondary)',
              }}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'keys' ? <ApiKeysTab /> : <PaymentsTab />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Tab 1: API Keys
   ═══════════════════════════════════════════════════════════ */

function ApiKeysTab() {
  const [keys, setKeys]       = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName]       = useState('')
  const [creating, setCreating]     = useState(false)

  // Success modal (show full key once)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied]         = useState(false)

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Reveal keys per row
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})

  /* ── Load keys ────────────────────────────────── */

  const load = useCallback(() => {
    setLoading(true)
    adminApi.buhDashboard()
      .then((d: any) => {
        // Try to get apiKeys from dashboard, fallback to empty
        setKeys(d.apiKeys ?? [])
      })
      .catch(() => setKeys([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  /* ── Create key ───────────────────────────────── */

  async function handleCreate() {
    if (!newName.trim()) {
      toast.error('Укажите название ключа')
      return
    }
    setCreating(true)
    try {
      // POST to create API key; for now this may not exist, handle gracefully
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setShowCreate(false)
      setNewName('')
      setCreatedKey(data.key || data.fullKey || 'key-will-be-here')
      toast.success('API-ключ создан')
      load()
    } catch {
      toast.error('Ошибка создания ключа. Функция будет доступна после Phase 5.')
    } finally {
      setCreating(false)
    }
  }

  /* ── Delete key ───────────────────────────────── */

  async function confirmDelete() {
    if (!deleteId) return
    try {
      await fetch(`/api/admin/api-keys/${deleteId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      toast.success('Ключ деактивирован')
      setDeleteId(null)
      load()
    } catch {
      toast.error('Ошибка удаления')
    }
  }

  /* ── Copy to clipboard ──────────────────────── */

  function copyKey(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      toast.success('Скопировано')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function toggleReveal(id: string) {
    setRevealed(prev => ({ ...prev, [id]: !prev[id] }))
  }

  /* ── Render ──────────────────────────────────── */

  return (
    <>
      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {keys.length} {keys.length === 1 ? 'ключ' : 'ключей'}
        </p>
        <button onClick={() => setShowCreate(true)}
                className="btn-primary inline-flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" />
          Создать ключ
        </button>
      </div>

      {/* Keys table */}
      <div className="rounded-2xl overflow-hidden"
           style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                {['Название', 'Ключ', 'Статус', 'Создан', 'Последнее использование', 'Запросы', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-xs whitespace-nowrap"
                      style={{ color: 'var(--text-tertiary)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 skeleton rounded w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center" style={{ color: 'var(--text-tertiary)' }}>
                    <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>API-ключи не созданы</p>
                    <p className="text-xs mt-1">Создайте ключ для приёма webhook-платежей</p>
                  </td>
                </tr>
              ) : (
                keys.map(k => (
                  <tr key={k.id}
                      className="hover:bg-white/[0.03] transition-colors"
                      style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    {/* Name */}
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {k.name}
                    </td>

                    {/* Key (masked / revealed) */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="text-xs px-2 py-1 rounded-md"
                              style={{ background: 'rgba(6,182,212,0.08)', color: 'var(--text-secondary)' }}>
                          {revealed[k.id] ? k.key : maskKey(k.key)}
                        </code>
                        <button onClick={() => toggleReveal(k.id)}
                                className="p-1 rounded hover:bg-white/[0.06]"
                                style={{ color: 'var(--text-tertiary)' }}
                                title={revealed[k.id] ? 'Скрыть' : 'Показать'}>
                          {revealed[k.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => copyKey(k.key)}
                                className="p-1 rounded hover:bg-white/[0.06]"
                                style={{ color: 'var(--text-tertiary)' }}
                                title="Копировать">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                            style={k.active
                              ? { background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }
                              : { background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}>
                        <span className="w-1.5 h-1.5 rounded-full"
                              style={{ background: k.active ? '#34d399' : '#f87171' }} />
                        {k.active ? 'Активен' : 'Неактивен'}
                      </span>
                    </td>

                    {/* Created */}
                    <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {fmtDate(k.createdAt)}
                    </td>

                    {/* Last used */}
                    <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : <span style={{ color: 'var(--text-tertiary)' }}>&mdash;</span>}
                    </td>

                    {/* Request count */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--text-primary)' }}>
                        <Activity className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                        {k.requestCount.toLocaleString('ru-RU')}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <button onClick={() => setDeleteId(k.id)}
                              className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                              style={{ color: 'var(--text-tertiary)' }}
                              title="Удалить">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create modal ───────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 " onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-md rounded-2xl p-6 space-y-5 animate-scale-in"
               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
                Новый API-ключ
              </h3>
              <button onClick={() => setShowCreate(false)}
                      className="p-1 hover:bg-white/[0.05] rounded-md transition-colors"
                      style={{ color: 'var(--text-tertiary)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                Название
              </label>
              <input className="glass-input w-full" placeholder="Например: Production webhook"
                     value={newName}
                     onChange={e => setNewName(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && handleCreate()} />
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Отмена</button>
              <button onClick={handleCreate} disabled={creating}
                      className="btn-primary flex-1 justify-center">
                {creating ? 'Создание...' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Key created success modal ──────────────── */}
      {createdKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 " onClick={() => setCreatedKey(null)} />
          <div className="relative w-full max-w-lg rounded-2xl p-6 space-y-5 animate-scale-in"
               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                   style={{ background: 'rgba(52,211,153,0.12)' }}>
                <Check className="w-5 h-5" style={{ color: '#34d399' }} />
              </div>
              <div>
                <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
                  Ключ создан
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Сохраните ключ — он больше не будет показан
                </p>
              </div>
            </div>

            <div className="rounded-xl p-4"
                 style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)' }}>
              <code className="text-sm break-all block" style={{ color: 'var(--text-primary)' }}>
                {createdKey}
              </code>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => copyKey(createdKey)}
                className="btn-primary inline-flex items-center gap-2 text-sm flex-1 justify-center"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Скопировано' : 'Скопировать'}
              </button>
              <button onClick={() => setCreatedKey(null)} className="btn-secondary flex-1">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 " onClick={() => setDeleteId(null)} />
          <div className="relative w-full max-w-sm rounded-2xl p-6 space-y-4 animate-scale-in"
               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
            <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
              Деактивировать ключ?
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Ключ будет деактивирован. Все запросы с этим ключом перестанут работать.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteId(null)} className="btn-secondary flex-1">Отмена</button>
              <button onClick={confirmDelete}
                      className="flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-colors"
                      style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                Деактивировать
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════
   Tab 2: Webhook Payments
   ═══════════════════════════════════════════════════════════ */

function PaymentsTab() {
  const [payments, setPayments] = useState<WebhookPayment[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    adminApi.buhDashboard()
      .then((d: any) => {
        // Use recentPayments from dashboard if available
        const raw = d.recentPayments ?? []
        setPayments(raw.map((p: any) => ({
          id: p.id ?? p._id ?? '',
          date: p.date ?? p.createdAt ?? '',
          externalId: p.externalId ?? p.external_id ?? '',
          amount: p.amount ?? 0,
          currency: p.currency ?? 'RUB',
          customerName: p.customerName ?? p.customer_name ?? p.userName ?? '',
          plan: p.plan ?? p.tariffName ?? '',
          source: p.source ?? p.provider ?? '',
          status: p.status ?? 'completed',
        })))
      })
      .catch(() => setPayments([]))
      .finally(() => setLoading(false))
  }, [])

  const statusStyles: Record<string, { bg: string; color: string; border: string }> = {
    completed: { bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' },
    pending:   { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' },
    failed:    { bg: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' },
  }

  const statusLabels: Record<string, string> = {
    completed: 'Выполнен',
    pending: 'Ожидание',
    failed: 'Ошибка',
    COMPLETED: 'Выполнен',
    PENDING: 'Ожидание',
    FAILED: 'Ошибка',
  }

  return (
    <>
      {/* Payments table */}
      <div className="rounded-2xl overflow-hidden"
           style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                {['Дата', 'External ID', 'Сумма', 'Валюта', 'Клиент', 'Тариф', 'Источник', 'Статус'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-xs whitespace-nowrap"
                      style={{ color: 'var(--text-tertiary)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 skeleton rounded w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center" style={{ color: 'var(--text-tertiary)' }}>
                    <Webhook className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>Платежи будут отображаться после настройки webhook</p>
                    <p className="text-xs mt-1">Создайте API-ключ и настройте webhook в платёжной системе</p>
                  </td>
                </tr>
              ) : (
                payments.map(p => {
                  const st = statusStyles[p.status.toLowerCase()] ?? statusStyles.pending
                  return (
                    <tr key={p.id}
                        className="hover:bg-white/[0.03] transition-colors"
                        style={{ borderBottom: '1px solid var(--glass-border)' }}>
                      {/* Date */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--text-primary)' }}>
                        {p.date ? fmtDateTime(p.date) : '\u2014'}
                      </td>

                      {/* External ID */}
                      <td className="px-4 py-3">
                        {p.externalId ? (
                          <code className="text-xs px-1.5 py-0.5 rounded"
                                style={{ background: 'rgba(6,182,212,0.08)', color: 'var(--text-secondary)' }}>
                            {p.externalId}
                          </code>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>&mdash;</span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 whitespace-nowrap font-semibold" style={{ color: '#34d399' }}>
                        {fmtMoney(p.amount)}
                      </td>

                      {/* Currency */}
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {p.currency}
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                        {p.customerName || '\u2014'}
                      </td>

                      {/* Plan */}
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {p.plan || '\u2014'}
                      </td>

                      {/* Source */}
                      <td className="px-4 py-3">
                        {p.source ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md"
                                style={{ background: 'rgba(6,182,212,0.08)', color: '#a78bfa' }}>
                            <Hash className="w-3 h-3" />
                            {p.source}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>&mdash;</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                              style={{ background: st.bg, color: st.color, border: st.border }}>
                          {statusLabels[p.status] ?? p.status}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
