'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, Coins, Clock, Palette, Plus, X, Trash2,
  Users, Send, CheckCircle2, ChevronRight, ChevronLeft,
  Loader2, Bot, Hash, ShieldCheck,
} from 'lucide-react'
import toast from 'react-hot-toast'

/* ── Types ──────────────────────────────────────────────────── */

interface Category {
  name: string
  color: string
  icon?: string
}

interface Partner {
  name: string
  roleLabel: string
  initialInvestment?: number
}

/* ── Constants ──────────────────────────────────────────────── */

const DEFAULT_CATEGORIES: Category[] = [
  { name: 'Хостинг',  color: 'var(--accent-1)' },
  { name: 'Реклама',  color: '#BA7517' },
  { name: 'Зарплаты', color: '#E24B4A' },
  { name: 'Софт',     color: '#378ADD' },
  { name: 'Прочее',   color: '#639922' },
]

const PRESET_COLORS = [
  'var(--accent-1)', '#BA7517', '#E24B4A', '#378ADD', '#639922',
  '#E85D9B', '#17A2B8', '#FF6B35', '#6C757D', '#28A745',
]

const CURRENCIES = [
  { value: 'RUB', label: 'RUB - Российский рубль' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
]

const TIMEZONES = [
  { value: 'Europe/Moscow',    label: 'Москва (UTC+3)' },
  { value: 'Europe/Kaliningrad', label: 'Калининград (UTC+2)' },
  { value: 'Asia/Yekaterinburg', label: 'Екатеринбург (UTC+5)' },
  { value: 'Asia/Novosibirsk', label: 'Новосибирск (UTC+7)' },
  { value: 'Asia/Vladivostok', label: 'Владивосток (UTC+10)' },
  { value: 'UTC',              label: 'UTC' },
]

const STEP_LABELS = ['Компания', 'Категории', 'Партнёры', 'Telegram', 'Подтверждение']

/* ── Component ──────────────────────────────────────────────── */

export default function SetupWizardPage() {
  const router = useRouter()
  const [loading, setLoading]   = useState(true)
  const [sending, setSending]   = useState(false)
  const [step, setStep]         = useState(0)

  // Step 1: Company
  const [companyName, setCompanyName]         = useState('')
  const [currency, setCurrency]               = useState('RUB')
  const [timezone, setTimezone]               = useState('Europe/Moscow')
  const [startingBalance, setStartingBalance] = useState('')

  // Step 2: Categories
  const [categories, setCategories] = useState<Category[]>([...DEFAULT_CATEGORIES])
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0])

  // Step 3: Partners
  const [partners, setPartners]       = useState<Partner[]>([])
  const [pName, setPName]             = useState('')
  const [pRole, setPRole]             = useState('')
  const [pInvestment, setPInvestment] = useState('')

  // Step 4: Telegram
  const [tgBotToken, setTgBotToken]     = useState('')
  const [tgChannelId, setTgChannelId]   = useState('')
  const [tgAdminId, setTgAdminId]       = useState('')

  // Check if already completed
  useEffect(() => {
    fetch('/api/admin/setup-wizard/status', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.completed) {
          router.push('/admin')
        } else {
          setLoading(false)
        }
      })
      .catch(() => setLoading(false))
  }, [router])

  /* ── Helpers ──────────────────────────────────────────────── */

  const addCategory = () => {
    if (!newCatName.trim()) return
    setCategories(prev => [...prev, { name: newCatName.trim(), color: newCatColor }])
    setNewCatName('')
    setNewCatColor(PRESET_COLORS[0])
  }

  const removeCategory = (idx: number) => {
    setCategories(prev => prev.filter((_, i) => i !== idx))
  }

  const updateCategory = (idx: number, field: keyof Category, value: string) => {
    setCategories(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }

  const addPartner = () => {
    if (!pName.trim() || !pRole.trim()) return
    setPartners(prev => [...prev, {
      name: pName.trim(),
      roleLabel: pRole.trim(),
      initialInvestment: pInvestment ? Number(pInvestment) : undefined,
    }])
    setPName('')
    setPRole('')
    setPInvestment('')
  }

  const removePartner = (idx: number) => {
    setPartners(prev => prev.filter((_, i) => i !== idx))
  }

  const canAdvance = () => {
    if (step === 0) return companyName.trim().length > 0
    return true
  }

  const handleComplete = async () => {
    setSending(true)
    try {
      const payload: any = {
        companyName: companyName.trim(),
        currency,
        timezone,
        startingBalance: startingBalance ? Number(startingBalance) : 0,
      }

      if (categories.length > 0) payload.categories = categories
      if (partners.length > 0) payload.partners = partners
      if (tgBotToken.trim())   payload.tgBotToken   = tgBotToken.trim()
      if (tgChannelId.trim())  payload.tgChannelId  = tgChannelId.trim()
      if (tgAdminId.trim())    payload.tgAdminId    = tgAdminId.trim()

      const res = await fetch('/api/admin/setup-wizard/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error('Setup failed')

      toast.success('Настройка завершена!')
      router.push('/admin')
    } catch {
      toast.error('Ошибка при сохранении настроек')
    } finally {
      setSending(false)
    }
  }

  /* ── Render ───────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-1)' }} />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }}>
          <ShieldCheck className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Настройка бухгалтерии
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Заполните основные данные для начала работы
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-1 mb-8">
        {STEP_LABELS.map((label, i) => (
          <div key={i} className="flex items-center">
            <button
              onClick={() => i < step && setStep(i)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: i === step
                  ? 'rgba(6,182,212,0.15)'
                  : i < step
                    ? 'rgba(34,197,94,0.1)'
                    : 'rgba(255,255,255,0.03)',
                color: i === step
                  ? '#a78bfa'
                  : i < step
                    ? '#22c55e'
                    : 'var(--text-tertiary)',
                cursor: i < step ? 'pointer' : 'default',
              }}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{
                      background: i === step
                        ? 'rgba(139,92,246,0.3)'
                        : i < step
                          ? 'rgba(34,197,94,0.2)'
                          : 'rgba(255,255,255,0.06)',
                    }}>
                {i < step ? '\u2713' : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < STEP_LABELS.length - 1 && (
              <ChevronRight className="w-3 h-3 mx-0.5" style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
            )}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full mb-8" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${((step + 1) / STEP_LABELS.length) * 100}%`,
            background: 'linear-gradient(90deg, #8b5cf6, #06b6d4)',
          }}
        />
      </div>

      {/* Card */}
      <div className="rounded-2xl p-6 md:p-8" style={{
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(20px)',
      }}>

        {/* ── Step 0: Company ─────────────────────────────── */}
        {step === 0 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Информация о компании
              </h2>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Название компании *
              </label>
              <input
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Мой бизнес"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--glass-border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Валюта
                </label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {CURRENCIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Часовой пояс
                </label>
                <select
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {TIMEZONES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Начальный баланс
              </label>
              <div className="relative">
                <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  type="number"
                  value={startingBalance}
                  onChange={e => setStartingBalance(e.target.value)}
                  placeholder="0"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 1: Categories ──────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Palette className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Категории расходов
              </h2>
            </div>

            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Настройте категории для классификации транзакций. Вы можете изменить их позже.
            </p>

            {/* Existing categories */}
            <div className="space-y-2">
              {categories.map((cat, idx) => (
                <div key={idx} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--glass-border)',
                }}>
                  {/* Color picker */}
                  <div className="relative group">
                    <div
                      className="w-7 h-7 rounded-lg cursor-pointer flex-shrink-0 border border-white/10"
                      style={{ background: cat.color }}
                    />
                    <div className="absolute top-full left-0 mt-1 p-2 rounded-xl hidden group-hover:grid grid-cols-5 gap-1 z-20"
                         style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(20px)' }}>
                      {PRESET_COLORS.map(c => (
                        <button key={c}
                                className="w-6 h-6 rounded-md border border-white/10 hover:scale-110 transition-transform"
                                style={{ background: c }}
                                onClick={() => updateCategory(idx, 'color', c)}
                        />
                      ))}
                    </div>
                  </div>

                  <input
                    value={cat.name}
                    onChange={e => updateCategory(idx, 'name', e.target.value)}
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: 'var(--text-primary)' }}
                  />
                  <button onClick={() => removeCategory(idx)}
                          className="p-1 rounded-lg hover:bg-red-500/10 transition-colors"
                          style={{ color: 'var(--text-tertiary)' }}>
                    <Trash2 className="w-3.5 h-3.5 hover:text-red-400" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add category */}
            <div className="flex items-center gap-2">
              <div className="relative group">
                <div
                  className="w-9 h-9 rounded-lg cursor-pointer flex-shrink-0 border border-white/10 flex items-center justify-center"
                  style={{ background: newCatColor }}
                >
                  <Palette className="w-4 h-4 text-white/80" />
                </div>
                <div className="absolute top-full left-0 mt-1 p-2 rounded-xl hidden group-hover:grid grid-cols-5 gap-1 z-20"
                     style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(20px)' }}>
                  {PRESET_COLORS.map(c => (
                    <button key={c}
                            className="w-6 h-6 rounded-md border border-white/10 hover:scale-110 transition-transform"
                            style={{ background: c }}
                            onClick={() => setNewCatColor(c)}
                    />
                  ))}
                </div>
              </div>
              <input
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCategory()}
                placeholder="Новая категория..."
                className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--glass-border)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                onClick={addCategory}
                className="p-2 rounded-xl transition-colors"
                style={{ background: 'rgba(6,182,212,0.15)', color: '#a78bfa' }}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Partners ────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Партнёры и инвесторы
              </h2>
            </div>

            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Добавьте партнёров проекта. Этот шаг можно пропустить.
            </p>

            {/* Partner list */}
            {partners.length > 0 && (
              <div className="space-y-2">
                {partners.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--glass-border)',
                  }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                         style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {p.name}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {p.roleLabel}
                        {p.initialInvestment ? ` \u2022 ${p.initialInvestment.toLocaleString('ru-RU')} ${currency}` : ''}
                      </div>
                    </div>
                    <button onClick={() => removePartner(idx)}
                            className="p-1 rounded-lg hover:bg-red-500/10 transition-colors"
                            style={{ color: 'var(--text-tertiary)' }}>
                      <Trash2 className="w-3.5 h-3.5 hover:text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add partner form */}
            <div className="rounded-xl p-4 space-y-3" style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--glass-border)',
            }}>
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={pName}
                  onChange={e => setPName(e.target.value)}
                  placeholder="Имя партнёра"
                  className="px-3 py-2 rounded-xl text-sm outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-primary)',
                  }}
                />
                <input
                  value={pRole}
                  onChange={e => setPRole(e.target.value)}
                  placeholder="Роль (напр. Инвестор)"
                  className="px-3 py-2 rounded-xl text-sm outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <div className="flex gap-3">
                <input
                  type="number"
                  value={pInvestment}
                  onChange={e => setPInvestment(e.target.value)}
                  placeholder="Сумма инвестиций (необязательно)"
                  className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  onClick={addPartner}
                  disabled={!pName.trim() || !pRole.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
                  style={{ background: 'rgba(6,182,212,0.15)', color: '#a78bfa' }}
                >
                  <Plus className="w-4 h-4" />
                  Добавить
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Telegram ────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Telegram-интеграция
              </h2>
            </div>

            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Настройте Telegram-бот для уведомлений. Этот шаг можно пропустить.
            </p>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Bot Token
              </label>
              <div className="relative">
                <Bot className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  value={tgBotToken}
                  onChange={e => setTgBotToken(e.target.value)}
                  placeholder="123456:ABC-DEF..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none font-mono"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Channel ID
              </label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  value={tgChannelId}
                  onChange={e => setTgChannelId(e.target.value)}
                  placeholder="-1001234567890"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none font-mono"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Admin ID
              </label>
              <div className="relative">
                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  value={tgAdminId}
                  onChange={e => setTgAdminId(e.target.value)}
                  placeholder="123456789"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none font-mono"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Confirm ─────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5" style={{ color: '#22c55e' }} />
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Подтверждение
              </h2>
            </div>

            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Проверьте данные перед завершением настройки.
            </p>

            {/* Company summary */}
            <div className="rounded-xl p-4 space-y-2" style={{
              background: 'rgba(139,92,246,0.05)',
              border: '1px solid rgba(6,182,212,0.15)',
            }}>
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#a78bfa' }}>
                Компания
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span style={{ color: 'var(--text-tertiary)' }}>Название: </span>
                  <span style={{ color: 'var(--text-primary)' }}>{companyName}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)' }}>Валюта: </span>
                  <span style={{ color: 'var(--text-primary)' }}>{currency}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)' }}>Часовой пояс: </span>
                  <span style={{ color: 'var(--text-primary)' }}>{timezone}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)' }}>Баланс: </span>
                  <span style={{ color: 'var(--text-primary)' }}>
                    {(startingBalance ? Number(startingBalance) : 0).toLocaleString('ru-RU')} {currency}
                  </span>
                </div>
              </div>
            </div>

            {/* Categories summary */}
            <div className="rounded-xl p-4 space-y-2" style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--glass-border)',
            }}>
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                Категории ({categories.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                        style={{ background: c.color + '20', color: c.color, border: `1px solid ${c.color}30` }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                    {c.name}
                  </span>
                ))}
                {categories.length === 0 && (
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Не добавлено</span>
                )}
              </div>
            </div>

            {/* Partners summary */}
            <div className="rounded-xl p-4 space-y-2" style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--glass-border)',
            }}>
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                Партнёры ({partners.length})
              </div>
              {partners.length > 0 ? (
                <div className="space-y-1">
                  {partners.map((p, i) => (
                    <div key={i} className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {p.name} <span style={{ color: 'var(--text-tertiary)' }}>({p.roleLabel})</span>
                      {p.initialInvestment ? (
                        <span style={{ color: '#22c55e' }}> +{p.initialInvestment.toLocaleString('ru-RU')} {currency}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Не добавлено</span>
              )}
            </div>

            {/* Telegram summary */}
            <div className="rounded-xl p-4 space-y-2" style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--glass-border)',
            }}>
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                Telegram
              </div>
              {tgBotToken ? (
                <div className="text-sm space-y-1">
                  <div style={{ color: 'var(--text-primary)' }}>
                    Bot: <span className="font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {tgBotToken.slice(0, 10)}...
                    </span>
                  </div>
                  {tgChannelId && (
                    <div style={{ color: 'var(--text-primary)' }}>
                      Channel: <span className="font-mono text-xs">{tgChannelId}</span>
                    </div>
                  )}
                  {tgAdminId && (
                    <div style={{ color: 'var(--text-primary)' }}>
                      Admin: <span className="font-mono text-xs">{tgAdminId}</span>
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Не настроено</span>
              )}
            </div>
          </div>
        )}

        {/* ── Navigation buttons ──────────────────────────── */}
        <div className="flex items-center justify-between mt-8 pt-5" style={{ borderTop: '1px solid var(--glass-border)' }}>
          <div>
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all"
                style={{ color: 'var(--text-secondary)' }}
              >
                <ChevronLeft className="w-4 h-4" />
                Назад
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Skip button for optional steps */}
            {(step === 2 || step === 3) && (
              <button
                onClick={() => setStep(s => s + 1)}
                className="px-4 py-2.5 rounded-xl text-sm transition-all"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Пропустить
              </button>
            )}

            {step < 4 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canAdvance()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                  color: 'white',
                }}
              >
                Далее
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={sending}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-60"
                style={{
                  background: 'linear-gradient(135deg, #22c55e, #06b6d4)',
                  color: 'white',
                }}
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Завершить настройку
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
