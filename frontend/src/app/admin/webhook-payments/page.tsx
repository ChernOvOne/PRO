'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  Key, Webhook, BookOpen, Plus, Copy, Eye, EyeOff,
  Shield, Loader2, RefreshCw, ChevronDown, ChevronUp,
  PlayCircle, Zap, Power,
} from 'lucide-react'
import { adminApi } from '@/lib/api'

/* ── Helpers ───────────────────────────────────────────────── */

function fmtMoney(n: number, cur = '₽') { return new Intl.NumberFormat('ru-RU').format(n) + ' ' + cur }
function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}
function maskKey(k: string) {
  if (!k || k.length <= 12) return k || ''
  return k.slice(0, 8) + '…' + k.slice(-4)
}
async function copyToClipboard(text: string) {
  try { await navigator.clipboard.writeText(text); toast.success('Скопировано') }
  catch { toast.error('Не удалось скопировать') }
}

/* ── Types ─────────────────────────────────────────────────── */

interface ApiKey {
  id: string
  name: string
  key: string
  isActive: boolean
  createdAt: string
  lastUsed?: string | null
  requestCount: number
}

interface WebhookPayment {
  id: string
  date: string
  externalId: string
  amount: string
  currency: string
  customerEmail?: string | null
  customerId?: string | null
  customerName?: string | null
  plan?: string | null
  planTag?: string | null
  source?: string | null
  utmCode?: string | null
  description?: string | null
  rawData?: any
  createdAt: string
  apiKey?: { name: string } | null
}

type Tab = 'keys' | 'history' | 'docs'

/* ── Root page ─────────────────────────────────────────────── */

export default function AdminWebhookPaymentsPage() {
  const [tab, setTab] = useState<Tab>('keys')

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Webhook API
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Приём платежей и событий из внешних систем
        </p>
      </div>

      <div className="flex gap-1 p-1 rounded-xl w-fit"
           style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
        <TabBtn active={tab === 'keys'}    onClick={() => setTab('keys')}>
          <Key className="w-4 h-4" /> API-ключи
        </TabBtn>
        <TabBtn active={tab === 'history'} onClick={() => setTab('history')}>
          <Webhook className="w-4 h-4" /> История
        </TabBtn>
        <TabBtn active={tab === 'docs'}    onClick={() => setTab('docs')}>
          <BookOpen className="w-4 h-4" /> Документация
        </TabBtn>
      </div>

      {tab === 'keys'    && <KeysTab />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'docs'    && <DocsTab />}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition"
            style={{
              background: active ? 'var(--accent-1)' : 'transparent',
              color: active ? 'white' : 'var(--text-secondary)',
              fontWeight: active ? 600 : 400,
            }}>
      {children}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════
   Tab: API Keys
   ═══════════════════════════════════════════════════════════ */

function KeysTab() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [reveal, setReveal] = useState<Record<string, boolean>>({})
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdKey, setCreatedKey] = useState<ApiKey | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ keyId: string; ok: boolean; status: number; body: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminApi.listWebhookKeys()
      setKeys(data || [])
    } catch (e: any) {
      toast.error(e.message || 'Ошибка загрузки')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!newName.trim()) { toast.error('Укажи название'); return }
    setCreating(true)
    try {
      const key = await adminApi.createWebhookKey(newName.trim())
      setCreatedKey(key)
      setNewName('')
      setShowCreate(false)
      await load()
    } catch (e: any) { toast.error(e.message || 'Ошибка') }
    finally { setCreating(false) }
  }

  const toggleActive = async (k: ApiKey) => {
    try {
      if (k.isActive) {
        await adminApi.deleteWebhookKey(k.id)
        toast.success('Ключ деактивирован')
      } else {
        await adminApi.activateWebhookKey(k.id)
        toast.success('Ключ активирован')
      }
      await load()
    } catch (e: any) { toast.error(e.message || 'Ошибка') }
  }

  const runTest = async (k: ApiKey) => {
    setTestingId(k.id)
    setTestResult(null)
    try {
      const r = await adminApi.sendTestWebhook(k.id)
      setTestResult({
        keyId: k.id,
        ok: r.ok,
        status: r.status,
        body: JSON.stringify(r.response, null, 2),
      })
      if (r.ok) toast.success('Тестовый webhook принят')
      else toast.error(`Ошибка ${r.status}`)
      await load()
    } catch (e: any) { toast.error(e.message || 'Ошибка') }
    finally { setTestingId(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Ключи для внешних систем, отправляющих webhook. {keys.length > 0 && `Всего: ${keys.length}`}
        </p>
        <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{ background: 'var(--accent-1)', color: 'white' }}>
          <Plus className="w-4 h-4" /> Создать ключ
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-1)' }} />
        </div>
      ) : keys.length === 0 ? (
        <div className="p-8 rounded-xl text-center"
             style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
          <Key className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Пока нет ни одного API-ключа</p>
          <p className="text-xs mt-1">Создай первый — и отправь тестовый webhook</p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map(k => (
            <div key={k.id} className="rounded-xl p-3"
                 style={{
                   background: 'var(--surface-2)',
                   border: '1px solid var(--glass-border)',
                   opacity: k.isActive ? 1 : 0.6,
                 }}>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {k.name}
                    </span>
                    {k.isActive ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                        active
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                        disabled
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] font-mono"
                       style={{ color: 'var(--text-tertiary)' }}>
                    <code>{reveal[k.id] ? k.key : maskKey(k.key)}</code>
                    <button onClick={() => setReveal(r => ({ ...r, [k.id]: !r[k.id] }))}
                            className="hover:text-[var(--text-primary)]">
                      {reveal[k.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => copyToClipboard(k.key)}
                            className="hover:text-[var(--text-primary)]">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    Создан {fmtDateTime(k.createdAt)} · Запросов: {k.requestCount}
                    {k.lastUsed && ` · Последний: ${fmtDateTime(k.lastUsed)}`}
                  </div>
                </div>

                <button onClick={() => runTest(k)}
                        disabled={!k.isActive || testingId === k.id}
                        className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 disabled:opacity-40"
                        style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
                  {testingId === k.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                  Тест
                </button>
                <button onClick={() => toggleActive(k)}
                        className="p-1.5 rounded hover:bg-white/5"
                        style={{ color: k.isActive ? '#ef4444' : '#22c55e' }}
                        title={k.isActive ? 'Деактивировать' : 'Активировать'}>
                  {k.isActive ? <Power className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                </button>
              </div>

              {testResult?.keyId === k.id && (
                <pre className="mt-3 p-2 rounded text-[11px] overflow-x-auto"
                     style={{
                       background: 'var(--surface-1)',
                       color: testResult.ok ? '#22c55e' : '#ef4444',
                       border: '1px solid var(--glass-border)',
                     }}>
{`HTTP ${testResult.status}
${testResult.body}`}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md rounded-2xl p-5 space-y-4"
               style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}
               onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Новый API-ключ
            </h3>
            <div>
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Название (для чего используется)
              </label>
              <input className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                     style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                     autoFocus
                     placeholder="например: Реселлер портал"
                     value={newName}
                     onChange={e => setNewName(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && create()} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)}
                      className="px-3 py-1.5 rounded-lg text-sm"
                      style={{ color: 'var(--text-secondary)' }}>
                Отмена
              </button>
              <button onClick={create} disabled={creating}
                      className="px-4 py-1.5 rounded-lg text-sm font-medium"
                      style={{ background: 'var(--accent-1)', color: 'white' }}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Created key — show once */}
      {createdKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-lg rounded-2xl p-5 space-y-4"
               style={{ background: 'var(--surface-1)', border: '1px solid rgba(34,197,94,0.4)' }}>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5" style={{ color: '#22c55e' }} />
              <h3 className="text-lg font-semibold" style={{ color: '#22c55e' }}>
                Ключ создан — сохрани его!
              </h3>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Ключ показывается полностью только сейчас. После закрытия окна его можно подсмотреть в списке, но лучше скопировать сразу.
            </p>
            <div className="p-3 rounded-lg font-mono text-xs break-all flex items-center gap-2"
                 style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
              <span className="flex-1">{createdKey.key}</span>
              <button onClick={() => copyToClipboard(createdKey.key)}
                      className="p-1.5 rounded shrink-0"
                      style={{ background: 'var(--accent-1)', color: 'white' }}>
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setCreatedKey(null)}
                      className="px-4 py-1.5 rounded-lg text-sm font-medium"
                      style={{ background: 'var(--accent-1)', color: 'white' }}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Tab: History
   ═══════════════════════════════════════════════════════════ */

function HistoryTab() {
  const [items, setItems] = useState<WebhookPayment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminApi.listWebhookPayments({ page, limit: 50 })
      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch (e: any) {
      toast.error(e.message || 'Ошибка загрузки')
    } finally { setLoading(false) }
  }, [page])

  useEffect(() => { load() }, [load])

  const maxPage = Math.max(1, Math.ceil(total / 50))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Всего принято: <strong>{total}</strong>
        </div>
        <button onClick={load}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
          <RefreshCw className="w-3.5 h-3.5" /> Обновить
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-1)' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="p-8 rounded-xl text-center"
             style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
          <Webhook className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Ни одного webhook'а ещё не принято</p>
          <p className="text-xs mt-1">Создай ключ и нажми «Тест» на вкладке API-ключи</p>
        </div>
      ) : (
        <div className="space-y-1 rounded-xl overflow-hidden"
             style={{ border: '1px solid var(--glass-border)' }}>
          {items.map(p => {
            const isOpen = expanded === p.id
            return (
              <div key={p.id}>
                <button onClick={() => setExpanded(isOpen ? null : p.id)}
                        className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-white/5 transition"
                        style={{ background: 'var(--surface-2)' }}>
                  <div className="text-xs font-mono shrink-0 w-32 truncate"
                       style={{ color: 'var(--text-tertiary)' }}>
                    {p.externalId}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {p.plan || p.description || '(без описания)'}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      {p.customerName || p.customerEmail || p.customerId || '—'}
                      {p.source && ` · ${p.source}`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold text-sm" style={{ color: '#22c55e' }}>
                      {fmtMoney(parseFloat(p.amount), p.currency === 'RUB' ? '₽' : p.currency)}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      {fmtDateTime(p.createdAt)}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {isOpen && (
                  <div className="p-3 text-xs space-y-2"
                       style={{ background: 'var(--surface-1)', borderTop: '1px solid var(--glass-border)' }}>
                    <div className="grid grid-cols-2 gap-2">
                      <Kv k="API-ключ"    v={p.apiKey?.name || '—'} />
                      <Kv k="External ID" v={p.externalId} />
                      <Kv k="Customer ID" v={p.customerId || '—'} />
                      <Kv k="Email"       v={p.customerEmail || '—'} />
                      <Kv k="Plan tag"    v={p.planTag || '—'} />
                      <Kv k="UTM"         v={p.utmCode || '—'} />
                    </div>
                    {p.rawData && (
                      <div>
                        <div className="text-[11px] font-semibold mb-1" style={{ color: 'var(--text-tertiary)' }}>
                          raw_data:
                        </div>
                        <pre className="p-2 rounded overflow-x-auto"
                             style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
                          {JSON.stringify(p.rawData, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {maxPage > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="px-3 py-1 rounded-lg text-sm disabled:opacity-40"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
            ← Назад
          </button>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Стр. {page} / {maxPage}
          </span>
          <button onClick={() => setPage(p => Math.min(maxPage, p + 1))} disabled={page >= maxPage}
                  className="px-3 py-1 rounded-lg text-sm disabled:opacity-40"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
            Вперёд →
          </button>
        </div>
      )}
    </div>
  )
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase" style={{ color: 'var(--text-tertiary)' }}>{k}</div>
      <div style={{ color: 'var(--text-primary)' }}>{v}</div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Tab: Docs
   ═══════════════════════════════════════════════════════════ */

function DocsTab() {
  const [baseUrl, setBaseUrl] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(`${window.location.protocol}//${window.location.host}`)
    }
  }, [])

  const endpoint = `${baseUrl}/api/webhooks/payment-ingest/`

  const FIELDS: Array<{ name: string; type: string; required: boolean; desc: string }> = [
    { name: 'external_id',    type: 'string',  required: true,  desc: 'Уникальный ID события (order_id, transaction_id). Повторный webhook с тем же значением вернёт status:"duplicate".' },
    { name: 'amount',         type: 'number',  required: true,  desc: 'Сумма платежа (299 или 299.50). Отрицательная сумма = расход.' },
    { name: 'currency',       type: 'string',  required: false, desc: 'Валюта ISO-4217. По умолчанию RUB.' },
    { name: 'customer_id',    type: 'string',  required: false, desc: 'Telegram ID / UUID / leadteh_id существующего пользователя — статистика оплат обновится.' },
    { name: 'customer_email', type: 'string',  required: false, desc: 'Email клиента (если ID не задан — поиск по email).' },
    { name: 'customer_name',  type: 'string',  required: false, desc: 'Отображаемое имя.' },
    { name: 'plan',           type: 'string',  required: false, desc: 'Название тарифа (попадает в описание транзакции).' },
    { name: 'plan_tag',       type: 'string',  required: false, desc: 'Тег тарифа (trial, premium_30d, year…) — обновит currentPlanTag.' },
    { name: 'sub_start',      type: 'ISO date', required: false, desc: 'Дата начала подписки: "2026-04-20T00:00:00Z".' },
    { name: 'sub_end',        type: 'ISO date', required: false, desc: 'Дата окончания подписки.' },
    { name: 'description',    type: 'string',  required: false, desc: 'Произвольный комментарий для истории.' },
    { name: 'source',         type: 'string',  required: false, desc: 'Источник (reseller, partner_crm, ad_platform…).' },
    { name: 'utm_code',       type: 'string',  required: false, desc: 'UTM-код кампании — сматчится с BuhUtmLead и отметит лид как converted.' },
    { name: 'raw_data',       type: 'object',  required: false, desc: 'Любые доп. поля JSON — сохранятся для дебага.' },
  ]

  const exampleReseller = `curl -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "external_id": "reseller_order_20260420_001",
    "amount": 299,
    "currency": "RUB",
    "customer_email": "ivan@example.com",
    "customer_name": "Иван Петров",
    "plan": "Стандарт · 1 месяц",
    "plan_tag": "standard_30d",
    "sub_start": "2026-04-20T00:00:00Z",
    "sub_end": "2026-05-20T00:00:00Z",
    "source": "reseller_portal",
    "description": "Оплата через партнёра"
  }'`

  const examplePartnerCRM = `curl -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "external_id": "crm_lead_converted_42",
    "amount": 499,
    "customer_id": "123456789",
    "plan": "Премиум · 1 месяц",
    "plan_tag": "premium_30d",
    "source": "partner_crm",
    "utm_code": "yt_blogger_march"
  }'`

  const exampleExpense = `curl -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "external_id": "hetzner_invoice_2026_04",
    "amount": -1840,
    "currency": "RUB",
    "plan": "Hetzner servers · apr 2026",
    "source": "hetzner_webhook",
    "description": "Ежемесячный инвойс за серверы VPN"
  }'`

  const successResp = `{
  "ok": true,
  "status": "created",
  "paymentId": "550e8400-e29b-41d4-a716-446655440000",
  "transactionId": "550e8400-e29b-41d4-a716-446655440001"
}`

  const dupResp = `{
  "ok": true,
  "status": "duplicate",
  "paymentId": "...uuid ранее созданного..."
}`

  return (
    <div className="space-y-5">
      {/* Endpoint banner */}
      <div className="rounded-xl p-4 space-y-2"
           style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.25)' }}>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4" style={{ color: '#06b6d4' }} />
          <strong style={{ color: '#06b6d4' }}>Endpoint</strong>
        </div>
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 font-mono text-sm"
             style={{ background: 'var(--surface-1)', color: 'var(--text-primary)' }}>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0"
                style={{ background: '#f59e0b', color: 'white' }}>POST</span>
          <span className="flex-1 truncate">{endpoint}</span>
          <button onClick={() => copyToClipboard(endpoint)}
                  className="p-1.5 rounded shrink-0 hover:bg-white/5"
                  style={{ color: 'var(--text-tertiary)' }}>
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <Section title="🔑 Авторизация">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Ключ передаётся одним из трёх способов (приоритет по порядку):
        </p>
        <ol className="text-sm space-y-1 list-decimal ml-5" style={{ color: 'var(--text-secondary)' }}>
          <li>Header <Mono>Authorization: Bearer &lt;key&gt;</Mono> — рекомендуется</li>
          <li>Header <Mono>X-API-Key: &lt;key&gt;</Mono></li>
          <li>Поле <Mono>api_key</Mono> в JSON-теле (legacy)</li>
        </ol>
        <div className="text-xs p-2 rounded"
             style={{ background: 'rgba(245,158,11,0.08)', color: '#f59e0b' }}>
          Ключ создай на вкладке «API-ключи». При создании он показывается полностью один раз — копируй сразу.
        </div>
      </Section>

      <Section title="📋 Поля запроса">
        <div className="rounded-lg overflow-hidden"
             style={{ border: '1px solid var(--glass-border)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
                <th className="text-left px-3 py-2">Поле</th>
                <th className="text-left px-3 py-2">Тип</th>
                <th className="text-left px-3 py-2">Обязательное</th>
                <th className="text-left px-3 py-2">Описание</th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.map(f => (
                <tr key={f.name} style={{ borderTop: '1px solid var(--glass-border)' }}>
                  <td className="px-3 py-2 font-mono font-medium"
                      style={{ color: 'var(--text-primary)' }}>{f.name}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-tertiary)' }}>{f.type}</td>
                  <td className="px-3 py-2">
                    {f.required
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                          обязательное
                        </span>
                      : <span className="text-[10px]"
                              style={{ color: 'var(--text-tertiary)' }}>опционально</span>}
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{f.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="💡 Примеры использования для VPN-платформы">
        <CodeBlock title="1. Реселлер продал тариф (новый юзер по email)" code={exampleReseller} />
        <CodeBlock title="2. Партнёрская CRM: лид конвертнулся, UTM-атрибуция" code={examplePartnerCRM} />
        <CodeBlock title="3. Внешний сервис пишет расход (отрицательная сумма)" code={exampleExpense} />
      </Section>

      <Section title="📤 Ответы">
        <CodeBlock title="Успех — платёж создан" code={successResp} color="#22c55e" />
        <CodeBlock title="Дубликат — external_id уже был принят" code={dupResp} color="#f59e0b" />
        <div className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
          <div><strong style={{ color: '#ef4444' }}>401</strong> — неверный или неактивный API-ключ</div>
          <div><strong style={{ color: '#ef4444' }}>400</strong> — невалидное тело запроса</div>
          <div><strong style={{ color: '#ef4444' }}>429</strong> — превышен rate-limit (300/мин)</div>
        </div>
      </Section>

      <Section title="⚙️ Что делает платформа при получении webhook'а">
        <ol className="text-sm space-y-1.5 list-decimal ml-5" style={{ color: 'var(--text-secondary)' }}>
          <li>Проверяет API-ключ (активен + существует)</li>
          <li>Ищет дубликат по <Mono>external_id</Mono> — если есть, возвращает <Mono>duplicate</Mono></li>
          <li>Создаёт запись в <Mono>buh_transactions</Mono> (type=INCOME, source=webhook)</li>
          <li>Применяет auto-tag правила из <Mono>BuhAutoTagRule</Mono></li>
          <li>Сохраняет в <Mono>buh_webhook_payments</Mono> полный снимок + <Mono>raw_data</Mono></li>
          <li>Ищет юзера: по <Mono>customer_id</Mono> (Telegram/UUID/leadteh), затем по <Mono>customer_email</Mono></li>
          <li>Если найден — обновляет <Mono>totalPaid</Mono>, <Mono>paymentsCount</Mono>, <Mono>currentPlan</Mono>, <Mono>currentPlanTag</Mono></li>
          <li>При <Mono>utm_code</Mono> + найденном юзере — помечает UTM-лид как converted</li>
          <li>Инкрементирует <Mono>requestCount</Mono> у API-ключа</li>
        </ol>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1 py-0.5 rounded font-mono text-[11px]"
          style={{ background: 'var(--surface-1)', color: 'var(--text-primary)' }}>
      {children}
    </code>
  )
}

function CodeBlock({ title, code, color }: { title: string; code: string; color?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium" style={{ color: color || 'var(--text-secondary)' }}>
          {title}
        </span>
        <button onClick={() => copyToClipboard(code)}
                className="text-[11px] px-2 py-0.5 rounded flex items-center gap-1"
                style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
          <Copy className="w-3 h-3" /> Копировать
        </button>
      </div>
      <pre className="p-3 rounded-lg overflow-x-auto text-[11px] font-mono"
           style={{
             background: 'var(--surface-2)',
             border: '1px solid var(--glass-border)',
             color: 'var(--text-primary)',
           }}>
        {code}
      </pre>
    </div>
  )
}
