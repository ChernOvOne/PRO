'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Search, Shield, ShieldOff, ChevronLeft, ChevronRight, ChevronDown,
         ExternalLink, SlidersHorizontal, X, List, MapPin,
         Calendar, DollarSign, Megaphone, UserPlus, Activity, Globe, Settings2,
         Save, CheckSquare, Send, Download, Trash2, FileText, Edit2, Plus } from 'lucide-react'
import toast from 'react-hot-toast'

const UsersMap = dynamic(() => import('./UsersMap'), { ssr: false })

interface User {
  id: string; email?: string; telegramId?: string; telegramName?: string
  subStatus: string; subExpireAt?: string; role: string; isActive: boolean
  createdAt: string; lastLoginAt?: string; remnawaveUuid?: string
  customerSource?: string
  totalPaid?: number | string
  _count: { referrals: number; payments: number }
}

const STATUS_COLORS: Record<string,string> = {
  ACTIVE:   'badge-green',
  INACTIVE: 'badge-gray',
  EXPIRED:  'badge-red',
  TRIAL:    'badge-blue',
}

const filterLabel = (key: string): string => ({
  status: 'Статус',
  is_active: 'Активен',
  expires_from: 'Истекает с',
  expires_to: 'Истекает по',
  expires_in_days: 'Истекает через',
  expired_days_ago: 'Истекло',
  has_payments: 'Оплачивал',
  payments_min: 'Мин. платежей',
  payments_max: 'Макс. платежей',
  paid_min: 'Сумма от',
  paid_max: 'Сумма до',
  avg_check_min: 'Средний чек от',
  avg_check_max: 'Средний чек до',
  balance_min: 'Баланс от',
  balance_max: 'Баланс до',
  bonus_days_min: 'Бонус-дней от',
  bonus_days_max: 'Бонус-дней до',
  paid_recent_days: 'Не платил',
  campaignId: 'Кампания',
  no_utm: 'Без UTM',
  utm_without_campaign: 'UTM без кампании',
  created_from: 'Регистрация с',
  created_to: 'Регистрация по',
  last_login_days: 'Не заходил',
  registered_within_days: 'Зарегистрирован за',
  active_within_days: 'Заходил за',
  registered_days_ago: 'Годовщина',
  has_referrals: 'Есть рефералы',
  has_referrer: 'Есть пригласивший',
  referrer_id: 'Пригласитель',
  referrals_min: 'Мин. рефералов',
  referrals_paid_min: 'Оплативших рефералов',
  role: 'Роль',
  has_leadteh: 'Импортирован',
  search_id: 'ID',
  country: 'Страна',
  city: 'Город',
}[key] || key)

const filterValueLabel = (key: string, value: string, campaigns: any[]): string => {
  if (key === 'campaignId') {
    const c = campaigns.find(c => c.id === value)
    return c?.channelName || value
  }
  if (key === 'last_login_days' || key === 'paid_recent_days') return `> ${value} дн`
  if (key === 'expires_in_days') return `${value} дн`
  if (key === 'expired_days_ago') return `${value} дн назад`
  if (key === 'has_payments' || key === 'has_referrals' || key === 'has_leadteh' || key === 'is_active' || key === 'has_referrer' || key === 'no_utm' || key === 'utm_without_campaign') {
    return value === 'yes' ? 'Да' : 'Нет'
  }
  if (key === 'status') return ({ ACTIVE: 'Активна', INACTIVE: 'Неактивна', EXPIRED: 'Истекла', TRIAL: 'Пробная' } as any)[value] || value
  if (key === 'role') return ({ USER: 'Пользователь', ADMIN: 'Админ', EDITOR: 'Редактор', INVESTOR: 'Инвестор', PARTNER: 'Партнёр' } as any)[value] || value
  return value
}

// ── Reusable filter UI ────────────────────────────────────────
function Select({ label, value, onChange, options }: any) {
  return (
    <div>
      <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="glass-input w-full text-xs py-1.5">
        {options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function NumberInput({ label, value, onChange, placeholder }: any) {
  return (
    <div>
      <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
      <input type="number" value={value || ''} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="glass-input w-full text-xs py-1.5" />
    </div>
  )
}

function TextInput({ label, value, onChange, placeholder }: any) {
  return (
    <div>
      <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
      <input type="text" value={value || ''} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="glass-input w-full text-xs py-1.5" />
    </div>
  )
}

function DateInput({ label, value, onChange }: any) {
  return (
    <div>
      <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
      <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
        className="glass-input w-full text-xs py-1.5" />
    </div>
  )
}

function QuickChips({ label, options, value, onChange }: any) {
  return (
    <div>
      <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
      <div className="flex flex-wrap gap-1">
        {options.map((o: any) => {
          const active = value === o.value
          return (
            <button key={o.value} onClick={() => onChange(active ? '' : o.value)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors"
              style={{
                background: active ? 'var(--accent-1)' : 'var(--surface-1)',
                color: active ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${active ? 'var(--accent-1)' : 'var(--glass-border)'}`,
              }}>
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Range({ label, minKey, maxKey, filters, setFilter }: any) {
  return (
    <div>
      <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
      <div className="flex gap-2">
        <input type="number" placeholder="от" value={filters[minKey] || ''}
          onChange={e => setFilter(minKey, e.target.value)}
          className="glass-input flex-1 text-xs py-1.5" />
        <input type="number" placeholder="до" value={filters[maxKey] || ''}
          onChange={e => setFilter(maxKey, e.target.value)}
          className="glass-input flex-1 text-xs py-1.5" />
      </div>
    </div>
  )
}

function FilterSection({ title, icon: Icon, color, count, defaultOpen = false, children }: any) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-left">
        <span className="flex items-center gap-2" style={{ color }}>
          {Icon && <Icon className="w-4 h-4" />}
          {title}
        </span>
        <div className="flex items-center gap-2">
          {count > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: color + '22', color }}>
              {count}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
            style={{ color: 'var(--text-tertiary)' }} />
        </div>
      </button>
      {open && <div className="px-3 pb-3 space-y-2.5">{children}</div>}
    </div>
  )
}

// ── Segment templates ────────────────────────────────────────
interface SegmentTemplate {
  icon: string
  name: string
  description: string
  color: string
  filters: Record<string, string>
}

const SEGMENT_TEMPLATES: SegmentTemplate[] = [
  { icon: '🔥', name: 'Горячие лиды', description: 'Зарегистрировались за 3 дня, не платили', color: '#ef4444',
    filters: { registered_within_days: '3', has_payments: 'no' } },
  { icon: '💎', name: 'VIP клиенты', description: 'Оплатили больше 5000 ₽', color: '#f59e0b',
    filters: { paid_min: '5000' } },
  { icon: '🔁', name: 'Для реактивации', description: 'Истекли 3-7 дней назад', color: '#06b6d4',
    filters: { expired_days_ago: '7' } },
  { icon: '⚠️', name: 'Скоро истекает', description: 'Истекает в ближайшие 3 дня', color: '#fbbf24',
    filters: { expires_in_days: '3', status: 'ACTIVE' } },
  { icon: '😴', name: 'Неактивные', description: 'Не заходили >30 дней', color: '#94a3b8',
    filters: { last_login_days: '30' } },
  { icon: '💰', name: 'Платящие', description: 'Количество платежей ≥ 2', color: '#34d399',
    filters: { payments_min: '2' } },
  { icon: '🎯', name: 'Годовщина', description: 'Ровно 365 дней с регистрации', color: '#a78bfa',
    filters: { registered_days_ago: '365' } },
  { icon: '📉', name: 'Без подписки', description: 'Нет активной подписки', color: '#64748b',
    filters: { status: 'INACTIVE' } },
  { icon: '🏆', name: 'Топ рефереры', description: 'С рефералами', color: '#ec4899',
    filters: { has_referrals: 'yes' } },
  { icon: '🆕', name: 'Новые сегодня', description: 'Зарегистрированы за сутки', color: '#60a5fa',
    filters: { registered_within_days: '1' } },
]

// ── Segment card (shown in the "Списки" tab) ─────────────────
function SegmentCard({ segment, onBroadcast, onEdit, onDelete }: {
  segment: any
  onBroadcast: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/admin/segments/${segment.id}/count`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : { count: 0 })
      .then(d => setCount(d.count ?? 0))
      .catch(() => setCount(null))
  }, [segment.id])

  const filtersList = Object.keys(segment.filters || {}).length

  return (
    <div className="rounded-2xl p-4 transition-all hover:scale-[1.01]"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: (segment.color || '#06b6d4') + '22' }}>
          <List className="w-5 h-5" style={{ color: segment.color || '#06b6d4' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {segment.name}
          </h3>
          {segment.description && (
            <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{segment.description}</p>
          )}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold" style={{ color: 'var(--accent-1)' }}>
            {count !== null ? count : '—'}
          </div>
          <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>пользователей</div>
        </div>
      </div>

      <div className="text-[11px] mb-3" style={{ color: 'var(--text-tertiary)' }}>
        {filtersList} {filtersList === 1 ? 'фильтр' : filtersList > 4 ? 'фильтров' : 'фильтра'}
      </div>

      <div className="flex gap-2">
        <button onClick={onBroadcast}
          className="flex-1 py-2 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5"
          style={{ background: 'var(--accent-1)', color: '#fff' }}>
          <Send className="w-3.5 h-3.5" /> Рассылка
        </button>
        <button onClick={onEdit}
          className="px-3 py-2 rounded-lg text-xs inline-flex items-center gap-1"
          style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete}
          className="px-3 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
export default function AdminUsers() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Initialize state from URL params
  const initialFilters: Record<string, string> = {}
  const RESERVED_PARAMS = new Set(['page', 'search', 'sort', 'view'])
  searchParams?.forEach((value, key) => {
    if (!RESERVED_PARAMS.has(key) && value) initialFilters[key] = value
  })

  const [users, setUsers]     = useState<User[]>([])
  const [total, setTotal]     = useState(0)
  const [search, setSearch]   = useState(searchParams?.get('search') || '')
  const [page, setPage]       = useState(Number(searchParams?.get('page') || '1') || 1)
  const [loading, setLoading] = useState(true)
  const [extendModal, setExtendModal] = useState<User|null>(null)
  const [extendDays, setExtendDays]   = useState(30)
  const [campaignsByUtm, setCampaignsByUtm] = useState<Record<string, { id: string; channelName: string }>>({})
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters)
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [countries, setCountries] = useState<string[]>([])
  const [sort, setSort] = useState(searchParams?.get('sort') || 'created_desc')
  const [view, setView] = useState<'table' | 'map' | 'segments'>((searchParams?.get('view') as any) || 'table')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)

  // Sync state → URL (debounced)
  const urlSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (urlSyncRef.current) clearTimeout(urlSyncRef.current)
    urlSyncRef.current = setTimeout(() => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (page > 1) params.set('page', String(page))
      if (sort !== 'created_desc') params.set('sort', sort)
      if (view !== 'table') params.set('view', view)
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
      const qs = params.toString()
      const newUrl = qs ? `/admin/users?${qs}` : '/admin/users'
      window.history.replaceState({}, '', newUrl)
    }, 200)
    return () => { if (urlSyncRef.current) clearTimeout(urlSyncRef.current) }
  }, [filters, search, page, sort, view])

  // Saved segments
  const [segments, setSegments] = useState<any[]>([])
  const [showSaveSegment, setShowSaveSegment] = useState(false)
  const [segmentName, setSegmentName] = useState('')
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null)
  const [showSegmentsDropdown, setShowSegmentsDropdown] = useState(false)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Load ad campaigns + countries
  useEffect(() => {
    fetch('/api/admin/ads', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((ads: any[]) => {
        const list = Array.isArray(ads) ? ads : []
        setCampaigns(list)
        const map: Record<string, any> = {}
        list.forEach(a => { if (a.utmCode) map[a.utmCode] = a })
        setCampaignsByUtm(map)
      })
      .catch(() => {})

    fetch('/api/admin/users/countries', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((c: string[]) => setCountries(Array.isArray(c) ? c : []))
      .catch(() => {})
  }, [])

  // Load saved segments
  const loadSegments = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/segments', { credentials: 'include' })
      if (res.ok) setSegments(await res.json())
    } catch {}
  }, [])

  useEffect(() => { loadSegments() }, [loadSegments])

  const saveSegment = async () => {
    if (!segmentName.trim()) { toast.error('Введите название'); return }
    try {
      const res = await fetch('/api/admin/segments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: segmentName, filters }),
      })
      if (res.ok) {
        toast.success('Список сохранён')
        setShowSaveSegment(false)
        setSegmentName('')
        loadSegments()
      } else {
        toast.error('Не удалось сохранить')
      }
    } catch { toast.error('Ошибка') }
  }

  const applySegment = (seg: any) => {
    setFilters(seg.filters || {})
    setActiveSegmentId(seg.id)
    setShowSegmentsDropdown(false)
    setPage(1)
  }

  const deleteSegment = async (id: string) => {
    if (!confirm('Удалить список?')) return
    await fetch(`/api/admin/segments/${id}`, { method: 'DELETE', credentials: 'include' })
    loadSegments()
    if (activeSegmentId === id) setActiveSegmentId(null)
  }

  const createFromTemplate = async (tpl: SegmentTemplate) => {
    try {
      const res = await fetch('/api/admin/segments', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tpl.name,
          description: tpl.description,
          filters: tpl.filters,
          color: tpl.color,
        }),
      })
      if (res.ok) {
        toast.success(`Список «${tpl.name}» создан`)
        setShowTemplates(false)
        loadSegments()
      } else {
        toast.error('Не удалось создать')
      }
    } catch { toast.error('Ошибка создания') }
  }

  // ── Bulk actions ───────────────────────────────────────
  const broadcastToSelected = () => {
    const ids = Array.from(selectedIds).join(',')
    router.push(`/admin/broadcast?users=${ids}`)
  }

  const exportSelected = () => {
    const selected = users.filter(u => selectedIds.has(u.id))
    const csv = [
      'ID;Telegram ID;Email;Username;Статус;Всего оплат',
      ...selected.map(u => [
        u.id, u.telegramId || '', u.email || '', u.telegramName || '',
        u.subStatus, Number(u.totalPaid || 0),
      ].join(';')),
    ].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `users-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const setFilter = (key: string, value: string) => {
    setFilters(prev => {
      const next = { ...prev }
      if (value) next[key] = value
      else delete next[key]
      return next
    })
    setPage(1)
  }

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      limit: '20',
      search,
      sort,
      ...filters,
    })
    fetch(`/api/admin/users?${params}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setUsers(d.users); setTotal(d.total); setLoading(false) })
  }, [page, search, sort, filters])

  useEffect(() => { load() }, [load])

  const toggle = async (user: User) => {
    await fetch(`/api/admin/users/${user.id}/toggle`, { method: 'POST', credentials: 'include' })
    toast.success(user.isActive ? 'Пользователь заблокирован' : 'Пользователь разблокирован')
    load()
  }

  const extend = async () => {
    if (!extendModal) return
    const res = await fetch(`/api/admin/users/${extendModal.id}/extend`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: extendDays }),
    })
    if (res.ok) {
      toast.success(`+${extendDays} дней добавлено`)
      setExtendModal(null); load()
    }
  }

  const totalPages = Math.ceil(total / 20)
  const activeFilterCount = Object.keys(filters).length

  // Helper: count active filters in a group
  const countActive = (keys: string[]) => keys.filter(k => filters[k]).length

  // ── Sidebar contents ────────────────────────────────────
  const Sidebar = (
    <aside className="w-full lg:w-[280px] lg:flex-shrink-0 space-y-2">
      <FilterSection icon={Search} title="Поиск" color="#06b6d4" defaultOpen
        count={countActive(['search_id'])}>
        <TextInput label="ID / Telegram ID" value={filters.search_id}
          onChange={(v: string) => setFilter('search_id', v)} />
      </FilterSection>

      <FilterSection icon={Calendar} title="Подписка" color="#34d399"
        count={countActive(['status', 'is_active', 'expires_in_days', 'expired_days_ago', 'expires_from', 'expires_to', 'trial_used'])}>
        <Select label="Статус" value={filters.status || ''} onChange={(v: string) => setFilter('status', v)}
          options={[
            { value: '', label: 'Все' },
            { value: 'ACTIVE', label: 'Активна' },
            { value: 'INACTIVE', label: 'Неактивна' },
            { value: 'EXPIRED', label: 'Истекла' },
            { value: 'TRIAL', label: 'Пробная' },
          ]} />
        <Select label="Блокировка" value={filters.is_active || ''} onChange={(v: string) => setFilter('is_active', v)}
          options={[
            { value: '', label: 'Все' },
            { value: 'yes', label: 'Активен' },
            { value: 'no', label: 'Заблокирован' },
          ]} />
        <QuickChips label="Истекает через" value={filters.expires_in_days}
          onChange={(v: string) => setFilter('expires_in_days', v)}
          options={[
            { value: '1', label: 'Сегодня' },
            { value: '3', label: '3 дня' },
            { value: '7', label: '7 дней' },
            { value: '30', label: 'Месяц' },
          ]} />
        <QuickChips label="Истекло" value={filters.expired_days_ago}
          onChange={(v: string) => setFilter('expired_days_ago', v)}
          options={[
            { value: '3', label: '3 дня' },
            { value: '7', label: 'Неделю' },
            { value: '30', label: 'Месяц' },
          ]} />
        <Select label="Триал" value={filters.trial_used || ''} onChange={(v: string) => setFilter('trial_used', v)}
          options={[
            { value: '', label: 'Не важно' },
            { value: 'yes', label: 'Использовал' },
            { value: 'no', label: 'Не использовал' },
          ]} />
      </FilterSection>

      <FilterSection icon={DollarSign} title="Финансы" color="#fbbf24"
        count={countActive(['has_payments', 'payments_min', 'payments_max', 'paid_min', 'paid_max', 'avg_check_min', 'avg_check_max', 'balance_min', 'balance_max', 'bonus_days_min', 'bonus_days_max', 'paid_recent_days'])}>
        <Select label="Оплачивал" value={filters.has_payments || ''} onChange={(v: string) => setFilter('has_payments', v)}
          options={[
            { value: '', label: 'Все' },
            { value: 'yes', label: 'Да' },
            { value: 'no', label: 'Нет' },
          ]} />
        <QuickChips label="Платежей" value={filters.payments_min}
          onChange={(v: string) => setFilter('payments_min', v)}
          options={[
            { value: '1', label: '1+' },
            { value: '2', label: '2+' },
            { value: '5', label: '5+' },
            { value: '10', label: '10+' },
          ]} />
        <Range label="Сумма оплат, ₽" minKey="paid_min" maxKey="paid_max" filters={filters} setFilter={setFilter} />
        <Range label="Средний чек, ₽" minKey="avg_check_min" maxKey="avg_check_max" filters={filters} setFilter={setFilter} />
        <Range label="Баланс, ₽" minKey="balance_min" maxKey="balance_max" filters={filters} setFilter={setFilter} />
        <Range label="Бонус-дни" minKey="bonus_days_min" maxKey="bonus_days_max" filters={filters} setFilter={setFilter} />
        <Select label="Давно не платил" value={filters.paid_recent_days || ''} onChange={(v: string) => setFilter('paid_recent_days', v)}
          options={[
            { value: '', label: 'Не важно' },
            { value: '30', label: '> 30 дней' },
            { value: '60', label: '> 60 дней' },
            { value: '90', label: '> 90 дней' },
          ]} />
      </FilterSection>

      <FilterSection icon={Megaphone} title="Маркетинг" color="#60a5fa"
        count={countActive(['campaignId', 'no_utm', 'utm_without_campaign'])}>
        <Select label="Кампания" value={filters.campaignId || ''} onChange={(v: string) => setFilter('campaignId', v)}
          options={[
            { value: '', label: 'Все' },
            ...campaigns.map(c => ({ value: c.id, label: c.channelName || c.utmCode })),
          ]} />
        <Select label="Источник"
          value={filters.no_utm === 'yes' ? 'no_utm' : (filters.utm_without_campaign === 'yes' ? 'utm_without_campaign' : '')}
          onChange={(v: string) => {
            if (v === 'no_utm') { setFilter('no_utm', 'yes'); setFilter('utm_without_campaign', '') }
            else if (v === 'utm_without_campaign') { setFilter('utm_without_campaign', 'yes'); setFilter('no_utm', '') }
            else { setFilter('no_utm', ''); setFilter('utm_without_campaign', '') }
          }}
          options={[
            { value: '', label: 'Все' },
            { value: 'no_utm', label: 'Органика (без UTM)' },
            { value: 'utm_without_campaign', label: 'UTM без кампании' },
          ]} />
      </FilterSection>

      <FilterSection icon={UserPlus} title="Рефералы" color="#a78bfa"
        count={countActive(['has_referrer', 'has_referrals', 'referrals_min', 'referrals_paid_min', 'referrer_id'])}>
        <Select label="Есть пригласивший" value={filters.has_referrer || ''} onChange={(v: string) => setFilter('has_referrer', v)}
          options={[
            { value: '', label: 'Не важно' },
            { value: 'yes', label: 'Да' },
            { value: 'no', label: 'Нет' },
          ]} />
        <Select label="Есть рефералы" value={filters.has_referrals || ''} onChange={(v: string) => setFilter('has_referrals', v)}
          options={[
            { value: '', label: 'Не важно' },
            { value: 'yes', label: 'Да' },
            { value: 'no', label: 'Нет' },
          ]} />
        <NumberInput label="Мин. рефералов" value={filters.referrals_min}
          onChange={(v: string) => setFilter('referrals_min', v)} />
        <NumberInput label="Оплативших рефералов от" value={filters.referrals_paid_min}
          onChange={(v: string) => setFilter('referrals_paid_min', v)} />
        <TextInput label="ID пригласителя" value={filters.referrer_id}
          placeholder="Показать его рефералов"
          onChange={(v: string) => setFilter('referrer_id', v)} />
      </FilterSection>

      <FilterSection icon={Activity} title="Активность" color="#f472b6"
        count={countActive(['created_from', 'created_to', 'registered_within_days', 'active_within_days', 'last_login_days', 'registered_days_ago'])}>
        <DateInput label="Регистрация с" value={filters.created_from}
          onChange={(v: string) => setFilter('created_from', v)} />
        <DateInput label="Регистрация до" value={filters.created_to}
          onChange={(v: string) => setFilter('created_to', v)} />
        <QuickChips label="Зарегистрирован за" value={filters.registered_within_days}
          onChange={(v: string) => setFilter('registered_within_days', v)}
          options={[
            { value: '1', label: 'Сегодня' },
            { value: '7', label: 'Неделя' },
            { value: '30', label: 'Месяц' },
          ]} />
        <QuickChips label="Заходил за" value={filters.active_within_days}
          onChange={(v: string) => setFilter('active_within_days', v)}
          options={[
            { value: '1', label: '24ч' },
            { value: '7', label: 'Неделя' },
            { value: '30', label: 'Месяц' },
          ]} />
        <Select label="Не заходил" value={filters.last_login_days || ''} onChange={(v: string) => setFilter('last_login_days', v)}
          options={[
            { value: '', label: 'Не важно' },
            { value: '7', label: '> 7 дней' },
            { value: '14', label: '> 14 дней' },
            { value: '30', label: '> 30 дней' },
            { value: '90', label: '> 90 дней' },
          ]} />
        <NumberInput label="Годовщина (дней назад)" value={filters.registered_days_ago}
          placeholder="Например, 365"
          onChange={(v: string) => setFilter('registered_days_ago', v)} />
      </FilterSection>

      <FilterSection icon={Globe} title="География" color="#22c55e"
        count={countActive(['country', 'city'])}>
        <Select label="Страна" value={filters.country || ''} onChange={(v: string) => setFilter('country', v)}
          options={[
            { value: '', label: 'Все' },
            ...countries.map(c => ({ value: c, label: c })),
          ]} />
        <TextInput label="Город" value={filters.city}
          onChange={(v: string) => setFilter('city', v)} />
      </FilterSection>

      <FilterSection icon={Settings2} title="Прочее" color="#94a3b8"
        count={countActive(['role', 'has_leadteh', 'has_email', 'has_telegram', 'bot_blocked'])}>
        <Select label="Роль" value={filters.role || ''} onChange={(v: string) => setFilter('role', v)}
          options={[
            { value: '', label: 'Все' },
            { value: 'USER', label: 'Пользователь' },
            { value: 'ADMIN', label: 'Админ' },
            { value: 'EDITOR', label: 'Редактор' },
            { value: 'INVESTOR', label: 'Инвестор' },
            { value: 'PARTNER', label: 'Партнёр' },
          ]} />
        <Select label="Импортирован из старой системы" value={filters.has_leadteh || ''} onChange={(v: string) => setFilter('has_leadteh', v)}
          options={[
            { value: '', label: 'Не важно' },
            { value: 'yes', label: 'Импортирован' },
            { value: 'no', label: 'Новый' },
          ]} />
        <Select label="Заблокировал бота" value={filters.bot_blocked || ''} onChange={(v: string) => setFilter('bot_blocked', v)}
          options={[
            { value: '', label: 'Не важно' },
            { value: 'yes', label: 'Заблокировали' },
            { value: 'no', label: 'Не блокировали' },
          ]} />
      </FilterSection>

      <button onClick={() => { setFilters({}); setPage(1) }}
        className="w-full py-2 rounded-xl text-sm text-red-400"
        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
        Очистить все фильтры
      </button>
    </aside>
  )

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Пользователи</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{total} пользователей</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDrawerOpen(true)}
            className="lg:hidden glass-input py-2 px-3 text-sm inline-flex items-center gap-2"
            style={{ color: activeFilterCount > 0 ? 'var(--accent-1)' : 'var(--text-secondary)' }}>
            <SlidersHorizontal className="w-4 h-4" />
            Фильтры{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>

          {/* Saved segments dropdown */}
          <div className="relative">
            <button onClick={() => setShowSegmentsDropdown(!showSegmentsDropdown)}
              className="glass-input py-2 px-3 text-sm inline-flex items-center gap-2">
              <List className="w-4 h-4" />
              {activeSegmentId
                ? segments.find(s => s.id === activeSegmentId)?.name || 'Списки'
                : 'Списки'}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showSegmentsDropdown && (
              <div className="absolute top-full right-0 mt-1 w-64 rounded-xl p-2 z-30"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                {segments.length === 0 ? (
                  <div className="text-xs text-center py-3" style={{ color: 'var(--text-tertiary)' }}>
                    Нет сохранённых списков
                  </div>
                ) : (
                  segments.map(s => (
                    <div key={s.id} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 group">
                      <button onClick={() => applySegment(s)} className="flex-1 text-left text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                        <span className="w-2 h-2 rounded-full inline-block mr-2" style={{ background: s.color || '#06b6d4' }} />
                        {s.name}
                      </button>
                      <button onClick={() => deleteSegment(s.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20">
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </button>
                    </div>
                  ))
                )}
                <div className="border-t pt-2 mt-1" style={{ borderColor: 'var(--glass-border)' }}>
                  <button onClick={() => { setShowSegmentsDropdown(false); setShowSaveSegment(true) }}
                    className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded-lg hover:bg-white/5"
                    style={{ color: 'var(--accent-1)' }}>
                    <Save className="w-4 h-4" /> Сохранить текущий фильтр
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Broadcast by filters */}
          <button onClick={() => router.push(`/admin/broadcast?filters=${encodeURIComponent(JSON.stringify(filters))}`)}
            className="glass-input py-2 px-3 text-sm inline-flex items-center gap-2"
            style={{ color: 'var(--accent-1)' }}>
            <Send className="w-4 h-4" />
            Разослать ({total})
          </button>
          <div className="flex rounded-xl overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--glass-border)' }}>
            <button onClick={() => setView('table')}
              className="px-3 py-1.5 text-sm inline-flex items-center gap-1.5 whitespace-nowrap flex-shrink-0"
              style={{ background: view === 'table' ? 'var(--accent-1)' : 'transparent',
                       color: view === 'table' ? '#fff' : 'var(--text-secondary)' }}>
              <List className="w-4 h-4 flex-shrink-0" /> Таблица
            </button>
            <button onClick={() => setView('map')}
              className="px-3 py-1.5 text-sm inline-flex items-center gap-1.5 whitespace-nowrap flex-shrink-0"
              style={{ background: view === 'map' ? 'var(--accent-1)' : 'transparent',
                       color: view === 'map' ? '#fff' : 'var(--text-secondary)' }}>
              <MapPin className="w-4 h-4 flex-shrink-0" /> Карта
            </button>
            <button onClick={() => setView('segments')}
              className="px-3 py-1.5 text-sm inline-flex items-center gap-1.5 whitespace-nowrap flex-shrink-0"
              style={{ background: view === 'segments' ? 'var(--accent-1)' : 'transparent',
                       color: view === 'segments' ? '#fff' : 'var(--text-secondary)' }}>
              <FileText className="w-4 h-4 flex-shrink-0" /> Списки
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Sidebar (desktop) */}
        <div className="hidden lg:block">{Sidebar}</div>

        {/* Mobile drawer */}
        {drawerOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
            <div className="relative ml-auto h-full w-[320px] max-w-[90vw] overflow-y-auto p-4 space-y-2"
              style={{ background: 'var(--surface-1)', borderLeft: '1px solid var(--glass-border)' }}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base font-semibold">Фильтры</h2>
                <button onClick={() => setDrawerOpen(false)} className="p-1 rounded hover:bg-white/5">
                  <X className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                </button>
              </div>
              {Sidebar}
            </div>
          </div>
        )}

        {/* Main */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Top toolbar: search + sort */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
              <input
                className="glass-input pl-10 py-2 text-sm w-full"
                placeholder="Email, Telegram..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
              />
            </div>
            <select
              value={sort}
              onChange={e => { setSort(e.target.value); setPage(1) }}
              className="glass-input py-2 text-sm w-auto">
              <option value="created_desc">Сначала новые</option>
              <option value="created_asc">Сначала старые</option>
              <option value="paid_desc">Принёс ↓</option>
              <option value="paid_asc">Принёс ↑</option>
              <option value="payments_desc">Платежей ↓</option>
              <option value="payments_asc">Платежей ↑</option>
              <option value="refs_desc">Рефералов ↓</option>
              <option value="refs_asc">Рефералов ↑</option>
              <option value="expires_desc">Истекает ↓</option>
              <option value="expires_asc">Истекает ↑</option>
              <option value="last_login_desc">По последнему входу</option>
            </select>
          </div>

          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Активные фильтры:</span>
              {Object.entries(filters).map(([key, value]) => (
                <span key={key} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs"
                  style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--accent-1)', border: '1px solid rgba(6,182,212,0.25)' }}>
                  {filterLabel(key)}: {filterValueLabel(key, value, campaigns)}
                  <button onClick={() => setFilter(key, '')} className="hover:bg-white/10 rounded px-1">×</button>
                </span>
              ))}
              <button onClick={() => { setFilters({}); setPage(1) }}
                className="text-xs px-2 py-1 rounded hover:bg-white/5" style={{ color: 'var(--text-tertiary)' }}>
                Очистить все
              </button>
            </div>
          )}

          {/* Table / Map / Segments */}
          {view === 'segments' ? (
            <div className="space-y-4">
              {/* Toolbar */}
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => { setView('table'); setShowSaveSegment(true) }}
                  className="px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-2"
                  style={{ background: 'var(--accent-1)', color: '#fff' }}>
                  <Plus className="w-4 h-4" /> Создать из фильтров
                </button>
                <button onClick={() => setShowTemplates(true)}
                  className="px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-2"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>
                  <FileText className="w-4 h-4" /> Из шаблона
                </button>
              </div>

              {/* Empty state */}
              {segments.length === 0 && (
                <div className="rounded-2xl p-8 text-center"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                  <List className="w-12 h-12 mx-auto mb-3 opacity-30" style={{ color: 'var(--text-tertiary)' }} />
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Нет сохранённых списков</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    Создайте список из текущих фильтров или выберите готовый шаблон
                  </p>
                </div>
              )}

              {/* Segments grid */}
              {segments.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {segments.map(seg => (
                    <SegmentCard
                      key={seg.id}
                      segment={seg}
                      onBroadcast={() => router.push(`/admin/broadcast?segmentId=${seg.id}`)}
                      onEdit={() => {
                        setFilters(seg.filters || {})
                        setView('table')
                        setActiveSegmentId(seg.id)
                        toast.success('Фильтры применены. Измените и пересохраните.')
                      }}
                      onDelete={() => deleteSegment(seg.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : view === 'map' ? (
            <UsersMap />
          ) : (
            <div className="glass-card overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                      <th className="px-4 py-3 w-10">
                        <input type="checkbox"
                          checked={users.length > 0 && users.every(u => selectedIds.has(u.id))}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedIds(new Set([...Array.from(selectedIds), ...users.map(u => u.id)]))
                            } else {
                              const next = new Set(selectedIds)
                              users.forEach(u => next.delete(u.id))
                              setSelectedIds(next)
                            }
                          }}
                          className="rounded" />
                      </th>
                      {(() => {
                        const columns: Array<{ label: string; key: string | null }> = [
                          { label: 'Пользователь', key: 'email' },
                          { label: 'Источник',     key: 'source' },
                          { label: 'Статус',       key: 'status' },
                          { label: 'Истекает',     key: 'expires' },
                          { label: 'Принёс',       key: 'paid' },
                          { label: 'Платежи',      key: 'payments' },
                          { label: 'Рефералы',     key: 'refs' },
                          { label: 'Действия',     key: null },
                        ]
                        const toggleSort = (key: string) => {
                          const desc = `${key}_desc`
                          const asc  = `${key}_asc`
                          setSort(sort === desc ? asc : desc)
                          setPage(1)
                        }
                        return columns.map(col => {
                          const isActive = col.key && (sort === `${col.key}_desc` || sort === `${col.key}_asc`)
                          const isDesc   = sort === `${col.key}_desc`
                          return (
                            <th key={col.label}
                                onClick={col.key ? () => toggleSort(col.key!) : undefined}
                                className={`text-left px-4 py-3 font-medium text-xs ${col.key ? 'cursor-pointer select-none hover:text-white' : ''}`}
                                style={{ color: isActive ? 'var(--accent-1)' : 'var(--text-tertiary)' }}>
                              {col.label}
                              {col.key && (
                                <span className="ml-1 inline-block" style={{ opacity: isActive ? 1 : 0.3 }}>
                                  {isActive ? (isDesc ? '↓' : '↑') : '↕'}
                                </span>
                              )}
                            </th>
                          )
                        })
                      })()}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      [...Array(8)].map((_,i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                          {[...Array(9)].map((_,j) => (
                            <td key={j} className="px-4 py-3">
                              <div className="h-4 skeleton rounded w-24" />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : users.map(u => (
                      <tr key={u.id}
                          className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                          style={{ borderBottom: '1px solid var(--glass-border)' }}
                          onClick={() => router.push(`/admin/users/${u.id}`)}>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <input type="checkbox"
                            checked={selectedIds.has(u.id)}
                            onChange={e => {
                              const next = new Set(selectedIds)
                              if (e.target.checked) next.add(u.id)
                              else next.delete(u.id)
                              setSelectedIds(next)
                            }}
                            className="rounded" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                                 style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--accent-1)' }}>
                              {(u.telegramName || u.email || 'U')[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <Link href={`/admin/users/${u.id}`}
                                    className="font-medium truncate max-w-[140px] block hover:underline"
                                    style={{ color: 'var(--accent-1)' }}
                                    onClick={e => e.stopPropagation()}>
                                {u.telegramName || u.email?.split('@')[0] || `ID:${u.id.slice(0,8)}`}
                              </Link>
                              <p className="text-xs truncate max-w-[140px]" style={{ color: 'var(--text-tertiary)' }}>
                                {u.email || (u.telegramId ? `@${u.telegramName}` : '')}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs" onClick={e => e.stopPropagation()}>
                          {(() => {
                            const src = u.customerSource
                            if (!src) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                            const camp = campaignsByUtm[src]
                            if (camp) {
                              return (
                                <Link href="/admin/marketing"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md hover:underline"
                                  style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--accent-1)' }}
                                  title={`UTM: ${src}`}>
                                  📣 {camp.channelName}
                                </Link>
                              )
                            }
                            return <span className="font-mono" style={{ color: 'var(--text-tertiary)' }}>{src}</span>
                          })()}
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <span className={STATUS_COLORS[u.subStatus] || 'badge-gray'}>
                            {u.subStatus}
                          </span>
                          {!u.isActive && <span className="badge-red ml-1">Блок</span>}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {u.subExpireAt
                            ? new Date(u.subExpireAt).toLocaleDateString('ru', {day:'2-digit',month:'2-digit',year:'2-digit'})
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: u.totalPaid && Number(u.totalPaid) > 0 ? '#34d399' : 'var(--text-tertiary)' }}>
                          {u.totalPaid && Number(u.totalPaid) > 0 ? `${Number(u.totalPaid).toLocaleString('ru-RU')} ₽` : '—'}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>{u._count.payments}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>{u._count.referrals}</td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setExtendModal(u); setExtendDays(30) }}
                              className="p-1.5 rounded-lg transition-colors text-xs font-medium px-2.5 py-1 hover:bg-white/[0.05]"
                              style={{ color: 'var(--text-secondary)' }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-1)')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}>
                              +дни
                            </button>
                            <button
                              onClick={() => toggle(u)}
                              className={`p-1.5 rounded-lg transition-colors
                                          ${u.isActive
                                            ? 'hover:text-red-400 hover:bg-red-500/10'
                                            : 'hover:text-emerald-400 hover:bg-emerald-500/10'}`}
                              style={{ color: 'var(--text-secondary)' }}>
                              {u.isActive
                                ? <ShieldOff className="w-4 h-4" />
                                : <Shield className="w-4 h-4" />}
                            </button>
                            {u.remnawaveUuid && (
                              <a href="#" className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.05]"
                                 style={{ color: 'var(--text-secondary)' }}>
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3"
                     style={{ borderTop: '1px solid var(--glass-border)' }}>
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    Показано {Math.min((page-1)*20+1, total)}–{Math.min(page*20, total)} из {total}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1}
                            className="p-1.5 disabled:opacity-30 hover:bg-white/[0.05] rounded-lg transition-colors"
                            style={{ color: 'var(--text-secondary)' }}>
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-3 py-1 text-sm" style={{ color: 'var(--text-primary)' }}>{page}/{totalPages}</span>
                    <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
                            className="p-1.5 disabled:opacity-30 hover:bg-white/[0.05] rounded-lg transition-colors"
                            style={{ color: 'var(--text-secondary)' }}>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-4 z-10 mx-auto max-w-4xl">
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--accent-1)', boxShadow: '0 8px 32px rgba(6,182,212,0.25)' }}>
            <CheckSquare className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Выбрано: <b>{selectedIds.size}</b>
            </span>
            <div className="ml-auto flex gap-2">
              <button onClick={broadcastToSelected}
                className="px-3 py-1.5 rounded-lg text-sm font-medium inline-flex items-center gap-1.5"
                style={{ background: 'var(--accent-1)', color: '#fff' }}>
                <Send className="w-4 h-4" /> Разослать
              </button>
              <button onClick={exportSelected}
                className="px-3 py-1.5 rounded-lg text-sm inline-flex items-center gap-1.5"
                style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
                <Download className="w-4 h-4" /> Экспорт
              </button>
              <button onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 rounded-lg text-sm"
                style={{ color: 'var(--text-tertiary)' }}>
                Отменить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Templates modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowTemplates(false)}>
          <div className="w-full max-w-2xl rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Готовые шаблоны списков</h3>
              <button onClick={() => setShowTemplates(false)} className="p-1 rounded hover:bg-white/5">
                <X className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Выберите шаблон — он создаст сегмент с готовыми фильтрами
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {SEGMENT_TEMPLATES.map(tpl => (
                <button key={tpl.name}
                  onClick={() => createFromTemplate(tpl)}
                  className="flex items-start gap-3 p-3 rounded-xl text-left transition-all hover:scale-[1.02]"
                  style={{ background: 'var(--surface-2)', border: `1px solid ${tpl.color}33` }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-2xl flex-shrink-0"
                    style={{ background: tpl.color + '22' }}>
                    {tpl.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{tpl.name}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{tpl.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Save segment modal */}
      {showSaveSegment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowSaveSegment(false)}>
          <div className="w-full max-w-md rounded-2xl p-5 space-y-4"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Сохранить список</h3>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Название</label>
              <input value={segmentName} onChange={e => setSegmentName(e.target.value)}
                placeholder="Горячие лиды, VIP клиенты..."
                className="glass-input w-full" autoFocus />
            </div>
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Сохранится {Object.keys(filters).length} активных фильтров
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowSaveSegment(false)}
                className="flex-1 py-2 rounded-xl text-sm"
                style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)' }}>
                Отмена
              </button>
              <button onClick={saveSegment}
                className="flex-1 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'var(--accent-1)', color: '#fff' }}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend modal */}
      {extendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setExtendModal(null)} />
          <div className="relative glass-card w-full max-w-sm space-y-5">
            <h2 className="font-semibold">Добавить дни подписки</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Пользователь: <span style={{ color: 'var(--text-primary)' }}>
                {extendModal.telegramName || extendModal.email || extendModal.id.slice(0,8)}
              </span>
            </p>
            <div className="space-y-1">
              <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Количество дней</label>
              <input type="number" className="glass-input w-full" value={extendDays}
                     onChange={e => setExtendDays(+e.target.value)} min={1} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setExtendModal(null)} className="btn-secondary flex-1 justify-center">
                Отмена
              </button>
              <button onClick={extend} className="btn-primary flex-1 justify-center">
                +{extendDays} дней
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
