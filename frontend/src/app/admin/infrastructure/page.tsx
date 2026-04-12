'use client'

import { useEffect, useState } from 'react'
import {
  Plus, Edit2, Trash2, X, Server, Globe, ExternalLink,
  Shield, Check,
} from 'lucide-react'
import { adminApi } from '@/lib/api'
import toast from 'react-hot-toast'

/* ── Types ─────────────────────────────────────────────────── */

interface InfraItem {
  id: string
  name: string
  provider: string
  type: string
  metadata?: Record<string, any>
  ipAddress?: string
  purpose?: string
  panelUrl?: string
  monthlyCost: number
  currency: string
  paymentDay: number
  nextPaymentDate?: string
  notifyDaysBefore?: number
  periodicity?: string
  autoRenew?: boolean
  notes?: string
  status?: 'ACTIVE' | 'WARNING' | 'EXPIRED' | 'INACTIVE'
  createdAt?: string
}

interface InfraField {
  key: string
  label: string
  type: 'text' | 'number' | 'url' | 'select' | 'date' | 'textarea' | 'toggle'
  placeholder?: string
  options?: { value: string; label: string }[]
  required?: boolean
}

interface InfraType {
  id: string
  label: string
  icon: string
  color: string
  fields: InfraField[]
}

const INFRA_TYPES: InfraType[] = [
  {
    id: 'vpn_server', label: 'VPN сервер', icon: '🖥', color: '#06b6d4',
    fields: [
      { key: 'ipAddress', label: 'IP адрес', type: 'text', placeholder: '1.2.3.4' },
      { key: 'panelUrl', label: 'URL панели', type: 'url', placeholder: 'https://panel.example.com' },
      { key: 'purpose', label: 'Назначение', type: 'text', placeholder: 'Основной, резерв...' },
      { key: 'meta.cpu', label: 'CPU (ядер)', type: 'number' },
      { key: 'meta.ram', label: 'RAM (ГБ)', type: 'number' },
      { key: 'meta.storage', label: 'Диск (ГБ)', type: 'number' },
      { key: 'meta.bandwidth', label: 'Трафик (ТБ/мес)', type: 'number' },
    ],
  },
  {
    id: 'saas_subscription', label: 'SaaS подписка', icon: '📦', color: '#a78bfa',
    fields: [
      { key: 'meta.service', label: 'Сервис', type: 'text', placeholder: 'Cloudflare, SendGrid, AWS...', required: true },
      { key: 'meta.plan', label: 'Тариф', type: 'text', placeholder: 'Pro, Business...' },
      { key: 'meta.seats', label: 'Мест / пользователей', type: 'number' },
      { key: 'panelUrl', label: 'URL панели', type: 'url' },
      { key: 'meta.limits', label: 'Лимиты', type: 'textarea', placeholder: 'API запросы, трафик, etc...' },
    ],
  },
  {
    id: 'domain', label: 'Домен', icon: '🌐', color: '#34d399',
    fields: [
      { key: 'meta.domainName', label: 'Доменное имя', type: 'text', placeholder: 'example.com', required: true },
      { key: 'meta.registrar', label: 'Регистратор', type: 'text', placeholder: 'Reg.ru, GoDaddy, Namecheap...' },
      { key: 'meta.dnsProvider', label: 'DNS провайдер', type: 'text', placeholder: 'Cloudflare, Route53...' },
      { key: 'meta.whoisPrivacy', label: 'WHOIS защита', type: 'toggle' },
      { key: 'meta.registeredUntil', label: 'Зарегистрирован до', type: 'date' },
    ],
  },
  {
    id: 'ssl_cert', label: 'SSL сертификат', icon: '🔒', color: '#22d3ee',
    fields: [
      { key: 'meta.commonName', label: 'CN (основной домен)', type: 'text', placeholder: '*.example.com', required: true },
      { key: 'meta.issuer', label: 'Издатель', type: 'text', placeholder: "Let's Encrypt, Sectigo..." },
      { key: 'meta.sanDomains', label: 'SAN домены (через запятую)', type: 'textarea' },
      { key: 'meta.validUntil', label: 'Действителен до', type: 'date' },
    ],
  },
  {
    id: 'hosting', label: 'Хостинг / Облако', icon: '☁️', color: '#60a5fa',
    fields: [
      { key: 'ipAddress', label: 'IP / хост', type: 'text' },
      { key: 'panelUrl', label: 'URL панели', type: 'url' },
      { key: 'meta.plan', label: 'Тарифный план', type: 'text', placeholder: 'VPS-4, t3.medium...' },
      { key: 'meta.region', label: 'Регион', type: 'text', placeholder: 'eu-central-1, Moscow...' },
      { key: 'meta.cpu', label: 'CPU', type: 'text', placeholder: '4 vCPU' },
      { key: 'meta.ram', label: 'RAM', type: 'text', placeholder: '8 ГБ' },
      { key: 'meta.storage', label: 'Диск', type: 'text', placeholder: '100 ГБ SSD' },
      { key: 'meta.instanceId', label: 'Instance ID', type: 'text' },
    ],
  },
  {
    id: 'software_license', label: 'Лицензия ПО', icon: '🔑', color: '#f59e0b',
    fields: [
      { key: 'meta.product', label: 'Продукт', type: 'text', placeholder: 'JetBrains, Adobe...', required: true },
      { key: 'meta.vendor', label: 'Производитель', type: 'text' },
      { key: 'meta.seats', label: 'Количество мест', type: 'number' },
      { key: 'meta.licenseType', label: 'Тип лицензии', type: 'select', options: [
        { value: 'per_user', label: 'Per user' },
        { value: 'site', label: 'Site license' },
        { value: 'device', label: 'Per device' },
        { value: 'subscription', label: 'Subscription' },
      ]},
      { key: 'meta.licenseKey', label: 'Ключ лицензии', type: 'text' },
    ],
  },
  {
    id: 'internet', label: 'Интернет / Связь', icon: '📡', color: '#ec4899',
    fields: [
      { key: 'meta.location', label: 'Локация', type: 'select', options: [
        { value: 'office', label: 'Офис' },
        { value: 'datacenter', label: 'Датацентр' },
        { value: 'colocation', label: 'Colocation' },
        { value: 'other', label: 'Другое' },
      ]},
      { key: 'meta.speed', label: 'Скорость', type: 'text', placeholder: '1 Гбит/с' },
      { key: 'meta.ipType', label: 'Тип IP', type: 'select', options: [
        { value: 'dynamic', label: 'Динамический' },
        { value: 'static', label: 'Статический' },
      ]},
    ],
  },
  {
    id: 'api_key', label: 'API ключ / SaaS', icon: '🔌', color: '#14b8a6',
    fields: [
      { key: 'meta.service', label: 'Сервис', type: 'text', placeholder: 'OpenAI, Stripe, Google Maps...', required: true },
      { key: 'meta.keyType', label: 'Тип ключа', type: 'select', options: [
        { value: 'api', label: 'API ключ' },
        { value: 'oauth', label: 'OAuth client' },
        { value: 'jwt', label: 'JWT secret' },
        { value: 'webhook', label: 'Webhook secret' },
      ]},
      { key: 'meta.rateLimit', label: 'Лимит запросов', type: 'text', placeholder: '10,000 / мес' },
    ],
  },
  {
    id: 'other', label: 'Прочее', icon: '💰', color: '#94a3b8',
    fields: [
      { key: 'meta.category', label: 'Категория', type: 'text', placeholder: 'Реклама, маркетинг...' },
    ],
  },
]

/* ── Constants ─────────────────────────────────────────────── */

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  ACTIVE:   { bg: 'rgba(52,211,153,0.12)', text: '#34d399', label: 'Активен' },
  WARNING:  { bg: 'rgba(251,191,36,0.12)', text: '#fbbf24', label: 'Внимание' },
  EXPIRED:  { bg: 'rgba(248,113,113,0.12)', text: '#f87171', label: 'Истёк' },
  INACTIVE: { bg: 'rgba(156,163,175,0.12)', text: '#9ca3af', label: 'Неактивен' },
}

type InfraForm = Omit<InfraItem, 'id'>

const EMPTY_FORM: InfraForm = {
  name: '',
  provider: '',
  type: 'vpn_server',
  metadata: {},
  ipAddress: '',
  purpose: '',
  panelUrl: '',
  monthlyCost: 0,
  currency: 'RUB',
  paymentDay: 1,
  nextPaymentDate: '',
  notifyDaysBefore: 3,
  periodicity: 'monthly',
  autoRenew: false,
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
  const [items, setItems] = useState<InfraItem[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('')

  // Modal: null | 'select_type' | 'create' | 'edit'
  const [modal, setModal]   = useState<'select_type' | 'create' | 'edit' | null>(null)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm]     = useState<InfraForm>(EMPTY_FORM)

  // Payment modal state
  const [paymentItem, setPaymentItem] = useState<InfraItem | null>(null)
  const [paymentDate, setPaymentDate] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentSaving, setPaymentSaving] = useState(false)

  /* ── Load ─────────────────────────────────── */

  const load = () => {
    setLoading(true)
    adminApi.buhServers()
      .then((rows: any[]) => {
        const mapped = (rows || []).map((r: any) => ({
          ...r,
          type: r.type || 'vpn_server',
          metadata: r.metadata || {},
          monthlyCost: Number(r.monthlyCost ?? 0),
        }))
        setItems(mapped)
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  /* ── Actions ──────────────────────────────── */

  const openSelectType = () => {
    setEditId(null)
    setModal('select_type')
  }

  const openEdit = (it: InfraItem) => {
    setForm({
      name: it.name,
      provider: it.provider || '',
      type: it.type || 'vpn_server',
      metadata: it.metadata || {},
      ipAddress: it.ipAddress || '',
      purpose: it.purpose || '',
      panelUrl: it.panelUrl || '',
      monthlyCost: it.monthlyCost,
      currency: it.currency,
      paymentDay: it.paymentDay,
      nextPaymentDate: it.nextPaymentDate?.slice(0, 10) || '',
      notifyDaysBefore: it.notifyDaysBefore ?? 3,
      periodicity: it.periodicity || 'monthly',
      autoRenew: !!it.autoRenew,
      notes: it.notes || '',
    })
    setEditId(it.id)
    setModal('edit')
  }

  const save = async () => {
    if (!form.name) {
      toast.error('Укажите название')
      return
    }
    setSaving(true)
    try {
      const payload: any = {
        name: form.name,
        provider: form.provider || undefined,
        type: form.type,
        metadata: form.metadata && Object.keys(form.metadata).length ? form.metadata : undefined,
        monthlyCost: Number(form.monthlyCost) || 0,
        currency: form.currency,
        paymentDay: Number(form.paymentDay) || 1,
        notifyDaysBefore: Number(form.notifyDaysBefore) || 0,
        nextPaymentDate: form.nextPaymentDate || undefined,
        ipAddress: form.ipAddress || undefined,
        purpose: form.purpose || undefined,
        panelUrl: form.panelUrl || undefined,
        notes: form.notes || undefined,
        periodicity: form.periodicity || 'monthly',
        autoRenew: !!form.autoRenew,
      }

      if (modal === 'edit' && editId) {
        await adminApi.updateBuhServer(editId, payload)
        toast.success('Запись обновлена')
      } else {
        await adminApi.createBuhServer(payload)
        toast.success('Запись добавлена')
      }
      setModal(null)
      load()
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const openPaymentModal = (item: InfraItem) => {
    setPaymentItem(item)
    // Default: suggest next period from current nextPaymentDate (or today)
    const base = item.nextPaymentDate ? new Date(item.nextPaymentDate) : new Date()
    const now = new Date()
    const startFrom = base > now ? base : now
    const next = new Date(startFrom)
    if (item.periodicity === 'yearly') next.setFullYear(next.getFullYear() + 1)
    else next.setMonth(next.getMonth() + 1)
    setPaymentDate(next.toISOString().slice(0, 10))
    setPaymentAmount(String(item.monthlyCost || 0))
  }

  const applyQuickDate = (days: number) => {
    const base = paymentItem?.nextPaymentDate ? new Date(paymentItem.nextPaymentDate) : new Date()
    const now = new Date()
    const startFrom = base > now ? base : now
    const next = new Date(startFrom)
    next.setDate(next.getDate() + days)
    setPaymentDate(next.toISOString().slice(0, 10))
  }

  const applyQuickMonth = (months: number) => {
    const base = paymentItem?.nextPaymentDate ? new Date(paymentItem.nextPaymentDate) : new Date()
    const now = new Date()
    const startFrom = base > now ? base : now
    const next = new Date(startFrom)
    next.setMonth(next.getMonth() + months)
    setPaymentDate(next.toISOString().slice(0, 10))
  }

  const confirmPayment = async () => {
    if (!paymentItem || !paymentDate) return
    setPaymentSaving(true)
    try {
      await adminApi.updateBuhServer(paymentItem.id, {
        nextPaymentDate: paymentDate,
      } as any)
      // Auto-create expense transaction
      try {
        await adminApi.createBuhTransaction({
          type: 'EXPENSE',
          amount: Number(paymentAmount) || 0,
          date: new Date().toISOString().slice(0, 10),
          description: `${paymentItem.name}${paymentItem.provider ? ' · ' + paymentItem.provider : ''}`,
        } as any)
      } catch {}
      toast.success('Оплата отмечена')
      setPaymentItem(null)
      load()
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setPaymentSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Удалить запись?')) return
    try {
      await adminApi.deleteBuhServer(id)
      toast.success('Удалено')
      load()
    } catch {
      toast.error('Ошибка удаления')
    }
  }

  /* ── Render ───────────────────────────────── */

  const filteredItems = typeFilter ? items.filter(i => i.type === typeFilter) : items

  const renderDynamicField = (field: InfraField) => {
    const key = field.key
    const isMetadata = key.startsWith('meta.')
    const metaKey = isMetadata ? key.slice(5) : null
    const value = isMetadata
      ? (form.metadata?.[metaKey!] ?? '')
      : ((form as any)[key] ?? '')

    const setValue = (v: any) => {
      if (isMetadata) {
        setForm(f => ({ ...f, metadata: { ...(f.metadata || {}), [metaKey!]: v } }))
      } else {
        setForm(f => ({ ...f, [key]: v }))
      }
    }

    return (
      <div key={key}>
        <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
          {field.label} {field.required && <span style={{ color: '#f87171' }}>*</span>}
        </label>
        {field.type === 'textarea' ? (
          <textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={field.placeholder}
            rows={2}
            className="glass-input w-full text-sm"
          />
        ) : field.type === 'select' ? (
          <select
            value={value}
            onChange={e => setValue(e.target.value)}
            className="glass-input w-full text-sm"
          >
            <option value="">—</option>
            {field.options?.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : field.type === 'toggle' ? (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!value}
              onChange={e => setValue(e.target.checked)}
            />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {value ? 'Да' : 'Нет'}
            </span>
          </label>
        ) : (
          <input
            type={field.type}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={field.placeholder}
            className="glass-input w-full text-sm"
          />
        )}
      </div>
    )
  }

  const currentTypeConfig = INFRA_TYPES.find(t => t.id === form.type) || INFRA_TYPES[0]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Инфраструктура
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Серверы, подписки, домены, лицензии и прочие расходы
          </p>
        </div>
        <button onClick={openSelectType} className="btn-primary text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      {/* Type filters */}
      {items.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setTypeFilter('')}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{
              background: typeFilter === '' ? 'var(--accent-1)' : 'var(--glass-bg)',
              color: typeFilter === '' ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--glass-border)',
            }}
          >
            Все ({items.length})
          </button>
          {INFRA_TYPES.map(t => {
            const count = items.filter(i => i.type === t.id).length
            if (count === 0) return null
            return (
              <button
                key={t.id}
                onClick={() => setTypeFilter(t.id)}
                className="px-3 py-1.5 rounded-lg text-xs inline-flex items-center gap-1"
                style={{
                  background: typeFilter === t.id ? t.color : 'var(--glass-bg)',
                  color: typeFilter === t.id ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--glass-border)',
                }}
              >
                <span>{t.icon}</span> {t.label} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 skeleton rounded-2xl" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div
          className="rounded-2xl text-center py-16"
          style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
        >
          <Server className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <p style={{ color: 'var(--text-tertiary)' }}>
            {items.length === 0 ? 'Записи не добавлены' : 'Нет записей в выбранной категории'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredItems.map(item => {
            const typeConfig = INFRA_TYPES.find(t => t.id === item.type) || INFRA_TYPES[0]
            const statusCfg = STATUS_STYLES[item.status || 'ACTIVE']
            const days = daysUntil(item.nextPaymentDate)

            return (
              <div
                key={item.id}
                className="rounded-2xl p-5 space-y-4 hover:translate-y-[-2px] transition-transform"
                style={{
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  borderLeft: `4px solid ${typeConfig.color}`,
                }}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{typeConfig.icon}</span>
                      <h3 className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {item.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="inline-block px-2 py-0.5 rounded-md text-[10px] font-medium"
                        style={{
                          background: typeConfig.color + '22',
                          color: typeConfig.color,
                        }}
                      >
                        {typeConfig.label}
                      </span>
                      {item.provider && (
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {item.provider}
                        </span>
                      )}
                    </div>
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
                {item.ipAddress && (
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                    <span className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>
                      {item.ipAddress}
                    </span>
                  </div>
                )}

                {/* Cost + Payment info */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      Стоимость{item.periodicity === 'yearly' ? '/год' : item.periodicity === 'one_time' ? '' : '/мес'}
                    </span>
                    <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                      {fmtMoney(item.monthlyCost, item.currency)}
                    </span>
                  </div>
                  {item.periodicity && item.periodicity !== 'monthly' && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Периодичность</span>
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {item.periodicity === 'yearly' ? 'Ежегодно' : item.periodicity === 'one_time' ? 'Разовый' : 'Ежемесячно'}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Следующая оплата</span>
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {fmtDate(item.nextPaymentDate)}
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
                  {item.autoRenew && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Автопродление</span>
                      <span className="text-xs" style={{ color: '#34d399' }}>Да</span>
                    </div>
                  )}
                </div>

                {/* Panel URL */}
                {item.panelUrl && (
                  <a
                    href={item.panelUrl}
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
                    onClick={() => openPaymentModal(item)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors"
                    style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}
                  >
                    <Check className="w-3.5 h-3.5" /> Оплачено
                  </button>
                  <button
                    onClick={() => openEdit(item)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium hover:bg-white/[0.05] transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => remove(item.id)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium hover:bg-red-500/10 transition-colors text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Select type modal */}
      {modal === 'select_type' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setModal(null)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Что добавляем?
              </h3>
              <button onClick={() => setModal(null)}>
                <X className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {INFRA_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    setForm({ ...EMPTY_FORM, type: t.id, nextPaymentDate: new Date().toISOString().slice(0, 10) })
                    setEditId(null)
                    setModal('create')
                  }}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl transition-all hover:scale-[1.02]"
                  style={{
                    background: 'var(--surface-2)',
                    border: `2px solid ${t.color}33`,
                  }}
                >
                  <div className="text-3xl">{t.icon}</div>
                  <div className="text-sm font-semibold text-center" style={{ color: 'var(--text-primary)' }}>
                    {t.label}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setModal(null)}>
          <div
            className="w-full max-w-2xl rounded-2xl p-6 space-y-4 animate-scale-in max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <span className="text-2xl">{currentTypeConfig.icon}</span>
                {modal === 'edit' ? 'Редактировать' : 'Новая запись'}:
                <span style={{ color: currentTypeConfig.color }}>{currentTypeConfig.label}</span>
              </h2>
              <button
                onClick={() => setModal(null)}
                className="p-1.5 rounded-lg hover:bg-white/[0.05]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Common fields */}
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
                Название <span style={{ color: '#f87171' }}>*</span>
              </label>
              <input
                className="glass-input w-full text-sm"
                placeholder="Название записи"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
                Провайдер
              </label>
              <input
                className="glass-input w-full text-sm"
                placeholder="Hetzner, AWS, ..."
                value={form.provider}
                onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
              />
            </div>

            {/* Dynamic fields by type */}
            {currentTypeConfig.fields.length > 0 && (
              <div
                className="pt-4 space-y-3"
                style={{ borderTop: '1px solid var(--glass-border)' }}
              >
                <div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)' }}>
                  Детали ({currentTypeConfig.label})
                </div>
                {currentTypeConfig.fields.map(renderDynamicField)}
              </div>
            )}

            {/* Money + periodicity */}
            <div
              className="pt-4 space-y-3"
              style={{ borderTop: '1px solid var(--glass-border)' }}
            >
              <div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)' }}>
                Оплата
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Стоимость</label>
                  <input
                    className="glass-input w-full text-sm"
                    type="number"
                    placeholder="0"
                    value={form.monthlyCost}
                    onChange={e => setForm(f => ({ ...f, monthlyCost: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Валюта</label>
                  <select
                    className="glass-input w-full text-sm"
                    value={form.currency}
                    onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                  >
                    <option value="RUB">RUB</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Периодичность</label>
                  <select
                    className="glass-input w-full text-sm"
                    value={form.periodicity}
                    onChange={e => setForm(f => ({ ...f, periodicity: e.target.value }))}
                  >
                    <option value="monthly">Ежемесячно</option>
                    <option value="yearly">Ежегодно</option>
                    <option value="one_time">Разовый</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>День оплаты</label>
                  <input
                    className="glass-input w-full text-sm"
                    type="number"
                    min={1}
                    max={31}
                    value={form.paymentDay}
                    onChange={e => setForm(f => ({ ...f, paymentDay: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Следующая оплата</label>
                  <input
                    className="glass-input w-full text-sm"
                    type="date"
                    value={form.nextPaymentDate}
                    onChange={e => setForm(f => ({ ...f, nextPaymentDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Уведомлять за (дней)</label>
                  <input
                    className="glass-input w-full text-sm"
                    type="number"
                    min={0}
                    value={form.notifyDaysBefore}
                    onChange={e => setForm(f => ({ ...f, notifyDaysBefore: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.autoRenew}
                  onChange={e => setForm(f => ({ ...f, autoRenew: e.target.checked }))}
                />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Автопродление
                </span>
              </label>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Заметки</label>
              <textarea
                className="glass-input w-full text-sm min-h-[70px] resize-y"
                placeholder="Заметки"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>

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

      {/* Payment modal */}
      {paymentItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setPaymentItem(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-5 animate-scale-in"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(52,211,153,0.15)' }}>
                  <Check className="w-5 h-5" style={{ color: '#34d399' }} />
                </div>
                <div>
                  <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Отметить оплату</h3>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {paymentItem.name}
                  </p>
                </div>
              </div>
              <button onClick={() => setPaymentItem(null)} className="p-1 rounded-lg hover:bg-white/5">
                <X className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>

            {/* Quick date chips */}
            <div>
              <label className="text-xs font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>
                Быстрый выбор следующей даты
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: '+7 дней', days: 7 },
                  { label: '+14 дней', days: 14 },
                  { label: '+30 дней', days: 30 },
                  { label: '+90 дней', days: 90 },
                ].map(q => (
                  <button
                    key={q.days}
                    onClick={() => applyQuickDate(q.days)}
                    className="px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                {[
                  { label: '+1 месяц', m: 1 },
                  { label: '+6 месяцев', m: 6 },
                  { label: '+1 год', m: 12 },
                ].map(q => (
                  <button
                    key={q.m}
                    onClick={() => applyQuickMonth(q.m)}
                    className="px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                    style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--accent-1)', border: '1px solid rgba(6,182,212,0.2)' }}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date picker */}
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                Следующая дата оплаты
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className="glass-input w-full text-sm"
                style={{ colorScheme: 'dark' }}
              />
            </div>

            {/* Amount */}
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                Сумма платежа ({paymentItem.currency})
              </label>
              <input
                type="number"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
                placeholder="0"
                className="glass-input w-full text-sm"
              />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Будет создана запись о расходе в транзакциях
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setPaymentItem(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}
              >
                Отмена
              </button>
              <button
                onClick={confirmPayment}
                disabled={paymentSaving || !paymentDate}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                style={{ background: '#34d399', color: '#0b1121', opacity: paymentSaving || !paymentDate ? 0.5 : 1 }}
              >
                <Check className="w-4 h-4" />
                Подтвердить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
