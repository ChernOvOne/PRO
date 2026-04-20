'use client'

import { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import {
  Coins, Server, CreditCard, Tags, Upload, TrendingUp,
  Plus, Trash2, Loader2,
} from 'lucide-react'
import { adminApi } from '@/lib/api'
import { Field, inputCls, inputStyle } from '../components/GroupCard'
import type { SetupState } from '../hooks/useSetupState'

const DEFAULT_CATEGORIES = [
  { name: 'Серверы VPN',            color: '#06b6d4', icon: '🖥', enabled: true },
  { name: 'Домены и TLS',           color: '#8b5cf6', icon: '🌐', enabled: true },
  { name: 'Реклама (Telegram)',     color: '#f59e0b', icon: '📢', enabled: true },
  { name: 'Реклама (VK/FB/IG)',     color: '#ec4899', icon: '🎯', enabled: true },
  { name: 'Реклама (блогеры)',      color: '#f472b6', icon: '👥', enabled: true },
  { name: 'Зарплаты/команда',       color: '#22c55e', icon: '💼', enabled: true },
  { name: 'ПО и лицензии',          color: '#3b82f6', icon: '🔑', enabled: true },
  { name: 'Возвраты клиентам',      color: '#ef4444', icon: '↩️', enabled: true },
  { name: 'Бонусы по реферальной',  color: '#a855f7', icon: '🎁', enabled: true },
  { name: 'Налоги',                 color: '#64748b', icon: '📋', enabled: false },
  { name: 'Банковские комиссии',    color: '#94a3b8', icon: '🏦', enabled: false },
  { name: 'Прочее',                 color: '#71717a', icon: '📦', enabled: true },
]

const PROVIDERS = ['Hetzner', 'Contabo', 'DigitalOcean', 'AWS', 'VDSina', 'TimeWeb', 'Другой']

export function AccountingGroup({
  state, patch, onDone,
}: {
  state: SetupState
  patch: (p: Partial<SetupState>) => void
  onDone: () => void
}) {
  const [screen, setScreen] = useState<'basic' | 'capital' | 'cats' | 'servers' | 'saas' | 'import' | 'preview'>('basic')

  // Seed categories on first visit
  useEffect(() => {
    if (state.buh.categories.length === 0) {
      patch({ buh: { ...state.buh, categories: DEFAULT_CATEGORIES.map(c => ({ ...c })) } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tabs: Array<{ id: any; label: string; icon: any }> = [
    { id: 'basic',    label: 'Основы',      icon: Coins },
    { id: 'capital',  label: 'Капитал',     icon: TrendingUp },
    { id: 'cats',     label: 'Категории',   icon: Tags },
    { id: 'servers',  label: 'Серверы',     icon: Server },
    { id: 'saas',     label: 'SaaS',        icon: CreditCard },
    { id: 'import',   label: 'Импорт',      icon: Upload },
    { id: 'preview',  label: 'Превью',      icon: TrendingUp },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto"
           style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
        {tabs.map(t => {
          const Icon = t.icon
          const active = screen === t.id
          return (
            <button key={t.id} onClick={() => setScreen(t.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition"
                    style={{
                      background: active ? 'var(--accent-1)' : 'transparent',
                      color: active ? 'white' : 'var(--text-secondary)',
                      fontWeight: active ? 600 : 400,
                    }}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          )
        })}
      </div>

      {screen === 'basic'   && <BasicScreen state={state} patch={patch} />}
      {screen === 'capital' && <CapitalScreen state={state} patch={patch} />}
      {screen === 'cats'    && <CategoriesScreen state={state} patch={patch} />}
      {screen === 'servers' && <ServersScreen state={state} patch={patch} />}
      {screen === 'saas'    && <SaasScreen state={state} patch={patch} />}
      {screen === 'import'  && <ImportScreen state={state} patch={patch} />}
      {screen === 'preview' && <PreviewScreen state={state} />}

      <div className="flex justify-end">
        <button onClick={onDone}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#22c55e', color: 'white' }}>
          Готово
        </button>
      </div>
    </div>
  )
}

/* ── Basic ─────────────────────────────────────────────────── */

function BasicScreen({ state, patch }: { state: SetupState; patch: any }) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Название компании">
        <input className={inputCls} style={inputStyle}
               value={state.buh.company_name}
               onChange={e => patch({ buh: { ...state.buh, company_name: e.target.value } })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Валюта">
          <select className={inputCls} style={inputStyle}
                  value={state.buh.currency}
                  onChange={e => patch({ buh: { ...state.buh, currency: e.target.value as any } })}>
            <option value="RUB">₽ RUB</option>
            <option value="USD">$ USD</option>
            <option value="EUR">€ EUR</option>
          </select>
        </Field>
        <Field label="Таймзона">
          <select className={inputCls} style={inputStyle}
                  value={state.buh.timezone}
                  onChange={e => patch({ buh: { ...state.buh, timezone: e.target.value } })}>
            <option value="Europe/Moscow">Москва (UTC+3)</option>
            <option value="Europe/Kaliningrad">Калининград (UTC+2)</option>
            <option value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</option>
            <option value="Asia/Novosibirsk">Новосибирск (UTC+7)</option>
            <option value="Asia/Vladivostok">Владивосток (UTC+10)</option>
            <option value="UTC">UTC</option>
          </select>
        </Field>
      </div>
    </div>
  )
}

/* ── Capital ───────────────────────────────────────────────── */

function CapitalScreen({ state, patch }: { state: SetupState; patch: any }) {
  const total = state.buh.sources.reduce((s, x) => s + (x.amount || 0), 0)
  const update = (sources: any) => patch({ buh: { ...state.buh, sources, starting_balance: sources.reduce((s: number, x: any) => s + (x.amount || 0), 0) } })

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        Укажи откуда у тебя деньги сейчас. Сумма всех строк = стартовый баланс в дашборде.
      </div>

      <div className="flex flex-col gap-2">
        {state.buh.sources.map((src, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input className={inputCls} style={inputStyle}
                   placeholder="Источник (Карта Сбер / USDT / Наличка)"
                   value={src.label}
                   onChange={e => {
                     const cp = [...state.buh.sources]; cp[i] = { ...cp[i], label: e.target.value }; update(cp)
                   }} />
            <input type="number" className={inputCls + ' w-40'} style={inputStyle}
                   placeholder="Сумма"
                   value={src.amount || ''}
                   onChange={e => {
                     const cp = [...state.buh.sources]; cp[i] = { ...cp[i], amount: +e.target.value || 0 }; update(cp)
                   }} />
            <button onClick={() => update(state.buh.sources.filter((_, j) => j !== i))}
                    className="p-2 rounded hover:bg-red-500/10 hover:text-red-400"
                    style={{ color: 'var(--text-tertiary)' }}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <button onClick={() => update([...state.buh.sources, { label: '', amount: 0 }])}
              className="px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 w-fit"
              style={{ background: 'var(--surface-1)', color: 'var(--accent-1)', border: '1px dashed var(--glass-border)' }}>
        <Plus className="w-4 h-4" /> Добавить источник
      </button>

      <div className="flex justify-between items-center px-3 py-2 rounded-lg"
           style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Итого стартовый капитал:</span>
        <span className="text-lg font-semibold" style={{ color: '#22c55e' }}>
          {total.toLocaleString('ru-RU')} {state.buh.currency}
        </span>
      </div>
    </div>
  )
}

/* ── Categories ───────────────────────────────────────────── */

function CategoriesScreen({ state, patch }: { state: SetupState; patch: any }) {
  const toggle = (idx: number) => {
    const cp = [...state.buh.categories]; cp[idx] = { ...cp[idx], enabled: !cp[idx].enabled }
    patch({ buh: { ...state.buh, categories: cp } })
  }
  const addCustom = () => {
    patch({ buh: { ...state.buh, categories: [...state.buh.categories, { name: 'Новая категория', color: '#64748b', icon: '📁', enabled: true }] } })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        Выбери какие категории расходов/доходов использовать. Можно добавить свои.
      </div>
      <div className="grid grid-cols-2 gap-2">
        {state.buh.categories.map((c, i) => (
          <label key={i}
                 className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition"
                 style={{
                   background: c.enabled ? `${c.color}1a` : 'var(--surface-1)',
                   border: `1px solid ${c.enabled ? c.color : 'var(--glass-border)'}`,
                 }}>
            <input type="checkbox" checked={c.enabled} onChange={() => toggle(i)} />
            <span style={{ fontSize: 18 }}>{c.icon}</span>
            <input className="flex-1 bg-transparent outline-none text-sm"
                   style={{ color: 'var(--text-primary)' }}
                   value={c.name}
                   onChange={e => {
                     const cp = [...state.buh.categories]; cp[i] = { ...cp[i], name: e.target.value }
                     patch({ buh: { ...state.buh, categories: cp } })
                   }} />
          </label>
        ))}
      </div>
      <button onClick={addCustom}
              className="px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 w-fit"
              style={{ background: 'var(--surface-1)', color: 'var(--accent-1)', border: '1px dashed var(--glass-border)' }}>
        <Plus className="w-4 h-4" /> Добавить свою категорию
      </button>
    </div>
  )
}

/* ── Servers ───────────────────────────────────────────────── */

function ServersScreen({ state, patch }: { state: SetupState; patch: any }) {
  const update = (servers: any) => patch({ buh: { ...state.buh, servers } })

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        Твои VPN-серверы. Сумма = ежемесячный расход на инфраструктуру.
      </div>
      <div className="flex flex-col gap-2">
        {state.buh.servers.map((s, i) => (
          <div key={i} className="rounded-lg p-3 flex flex-col gap-2"
               style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
            <div className="flex gap-2">
              <input className={inputCls + ' flex-1'} style={inputStyle} placeholder="Название (srv1)"
                     value={s.name}
                     onChange={e => { const cp = [...state.buh.servers]; cp[i] = { ...cp[i], name: e.target.value }; update(cp) }} />
              <select className={inputCls + ' w-44'} style={inputStyle}
                      value={s.provider}
                      onChange={e => { const cp = [...state.buh.servers]; cp[i] = { ...cp[i], provider: e.target.value }; update(cp) }}>
                {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button onClick={() => update(state.buh.servers.filter((_, j) => j !== i))}
                      className="p-2 rounded hover:bg-red-500/10 hover:text-red-400"
                      style={{ color: 'var(--text-tertiary)' }}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input type="number" className={inputCls} style={inputStyle} placeholder="Стоимость/мес ₽"
                     value={s.monthlyCost || ''}
                     onChange={e => { const cp = [...state.buh.servers]; cp[i] = { ...cp[i], monthlyCost: +e.target.value || 0 }; update(cp) }} />
              <input type="number" className={inputCls} style={inputStyle} placeholder="День платежа (1-31)"
                     value={s.paymentDay || ''}
                     onChange={e => { const cp = [...state.buh.servers]; cp[i] = { ...cp[i], paymentDay: +e.target.value || 1 }; update(cp) }} />
              <input className={inputCls} style={inputStyle} placeholder="IP (опц.)"
                     value={s.ip || ''}
                     onChange={e => { const cp = [...state.buh.servers]; cp[i] = { ...cp[i], ip: e.target.value }; update(cp) }} />
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => update([...state.buh.servers, { name: '', provider: 'Hetzner', monthlyCost: 0, paymentDay: 1 }])}
              className="px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 w-fit"
              style={{ background: 'var(--surface-1)', color: 'var(--accent-1)', border: '1px dashed var(--glass-border)' }}>
        <Plus className="w-4 h-4" /> Добавить сервер
      </button>
    </div>
  )
}

/* ── SaaS ──────────────────────────────────────────────────── */

function SaasScreen({ state, patch }: { state: SetupState; patch: any }) {
  const update = (saas: any) => patch({ buh: { ...state.buh, saas } })
  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        Постоянные подписки: домены, Cloudflare, Sentry, мониторинги.
      </div>
      <div className="flex flex-col gap-2">
        {state.buh.saas.map((s, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input className={inputCls} style={inputStyle} placeholder="Название"
                   value={s.name}
                   onChange={e => { const cp = [...state.buh.saas]; cp[i] = { ...cp[i], name: e.target.value }; update(cp) }} />
            <input type="number" className={inputCls + ' w-32'} style={inputStyle} placeholder="Цена"
                   value={s.cost || ''}
                   onChange={e => { const cp = [...state.buh.saas]; cp[i] = { ...cp[i], cost: +e.target.value || 0 }; update(cp) }} />
            <select className={inputCls + ' w-32'} style={inputStyle}
                    value={s.period}
                    onChange={e => { const cp = [...state.buh.saas]; cp[i] = { ...cp[i], period: e.target.value as any }; update(cp) }}>
              <option value="month">в месяц</option>
              <option value="year">в год</option>
            </select>
            <button onClick={() => update(state.buh.saas.filter((_, j) => j !== i))}
                    className="p-2 rounded hover:bg-red-500/10 hover:text-red-400"
                    style={{ color: 'var(--text-tertiary)' }}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <button onClick={() => update([...state.buh.saas, { name: '', cost: 0, period: 'month' as const }])}
              className="px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 w-fit"
              style={{ background: 'var(--surface-1)', color: 'var(--accent-1)', border: '1px dashed var(--glass-border)' }}>
        <Plus className="w-4 h-4" /> Добавить подписку
      </button>
    </div>
  )
}

/* ── Import ────────────────────────────────────────────────── */

function ImportScreen({ state, patch }: { state: SetupState; patch: any }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="p-3 rounded-lg text-xs"
           style={{ background: 'var(--surface-1)', color: 'var(--text-tertiary)' }}>
        Историческая бухгалтерия и пользователи импортируются из <a href="/admin/import" className="underline" style={{ color: 'var(--accent-1)' }}>/admin/import</a>.
        Там можно загрузить XLSX, предпросмотреть результат, и применить.
      </div>
      <a href="/admin/import" target="_blank"
         className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm w-fit"
         style={{ background: 'var(--accent-1)', color: 'white' }}>
        <Upload className="w-4 h-4" /> Открыть страницу импорта
      </a>
      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        После импорта вернись на эту вкладку и перейди в «Превью» — там увидишь итоги.
      </div>
    </div>
  )
}

/* ── Preview ───────────────────────────────────────────────── */

function PreviewScreen({ state }: { state: SetupState }) {
  const [preview, setPreview] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const monthlyServers = state.buh.servers.reduce((s, x) => s + (x.monthlyCost || 0), 0)
  const monthlySaas = state.buh.saas.reduce((s, x) => s + (x.period === 'year' ? x.cost / 12 : x.cost), 0)
  const monthlyTotal = monthlyServers + monthlySaas
  const runway = monthlyTotal > 0 ? state.buh.starting_balance / monthlyTotal : null

  useEffect(() => {
    setLoading(true)
    adminApi.setupPreview({
      startingBalance: state.buh.starting_balance,
      servers: state.buh.servers,
      saas: state.buh.saas,
    })
      .then(setPreview)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [state.buh.starting_balance, state.buh.servers.length, state.buh.saas.length])

  const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        Вот что появится в дашборде после завершения визарда:
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PreviewCard color="#22c55e" label="💰 Стартовый баланс"
                     value={`${fmt(state.buh.starting_balance)} ${state.buh.currency}`}
                     sub={`${state.buh.sources.length} источников`} />
        <PreviewCard color="#ef4444" label="🖥 Серверы VPN"
                     value={`-${fmt(monthlyServers)} ${state.buh.currency}/мес`}
                     sub={`${state.buh.servers.length} серверов`} />
        <PreviewCard color="#f59e0b" label="🔑 SaaS и подписки"
                     value={`-${fmt(monthlySaas)} ${state.buh.currency}/мес`}
                     sub={`${state.buh.saas.length} подписок`} />
        <PreviewCard color="#8b5cf6" label="📦 Итого расход/мес"
                     value={`-${fmt(monthlyTotal)} ${state.buh.currency}`}
                     sub={runway !== null ? `Хватит на ${Math.round(runway)} мес` : '—'} />
      </div>

      <div className="p-3 rounded-xl"
           style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
        <div className="text-xs font-semibold uppercase tracking-wider mb-2"
             style={{ color: 'var(--text-tertiary)' }}>
          Категории расходов
        </div>
        <div className="flex flex-wrap gap-1">
          {state.buh.categories.filter(c => c.enabled).map((c, i) => (
            <span key={i} className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: `${c.color}22`, color: c.color }}>
              {c.icon} {c.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function PreviewCard({ color, label, value, sub }: { color: string; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl p-3"
         style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
      <div className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
      <div className="text-lg font-semibold" style={{ color }}>{value}</div>
      <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</div>
    </div>
  )
}
